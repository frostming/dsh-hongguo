/**
 * dsh-hongguo — Host half.
 *
 * Owns everything that needs Node: the openhongguo SDK (a pure-JS WebAssembly
 * build of the Go client), an anonymous device profile, a short drama-list
 * cache, and a same-origin proxy for playback manifests and media segments.
 * The Web page only ever sees same-origin URLs, so the CDN's signed query
 * strings never enter browser history or a reload's address.
 *
 * The Client half draws the player in the right Sidebar.
 */
import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from 'openhongguo'
import { Client as HuangguoClient } from './sdk/huangguo/index.js'

export const name = 'dsh-hongguo'

/**
 * Settings schema in Schemastery's standard-schema form. It is built lazily by
 * `reflectConfig` so the Host's static schema projector never touches the
 * plain field map (it only reads plugins that exported a schema).
 */
function configSchema(z, DEFAULTS) {
  return z.object({
    autoPrompt: z.boolean().default(DEFAULTS.autoPrompt),
    panelWidth: z.number().step(1).min(320).max(960).default(DEFAULTS.panelWidth),
    profilePath: z.string(),
    searchTerms: z.array(z.string()).default(DEFAULTS.searchTerms),
    searchMode: z.union([z.const('remote'), z.const('local')]).default(DEFAULTS.searchMode),
  })
}

/**
 * Read this plugin's raw config and resolve it against the declared fields:
 * unknown keys are dropped, absent ones take their default, and a value of
 * the wrong type falls back to the default instead of failing activation.
 */
export async function reflectConfig(raw = {}) {
  const DEFAULTS = { autoPrompt: true, panelWidth: 480, searchTerms: ['总裁', '重生', '逆袭'], searchMode: 'remote' }
  const input = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([key]) => ['autoPrompt', 'panelWidth', 'profilePath', 'searchTerms', 'searchMode'].includes(key)),
  )
  let value
  try {
    const { default: z } = await import('@deepseek-ai/schemastery')
    const result = configSchema(z, DEFAULTS)('~standard').validate(input)
    value = 'then' in result ? await result : result.value
    if (result?.issues) throw new Error(result.issues.map((issue) => issue.message).join('; '))
  } catch (error) {
    value = { ...DEFAULTS }
    if (typeof input.autoPrompt === 'boolean') value.autoPrompt = input.autoPrompt
    if (Number.isFinite(input.panelWidth)) value.panelWidth = Math.min(960, Math.max(320, Math.round(input.panelWidth)))
    if (typeof input.profilePath === 'string') value.profilePath = input.profilePath
    if (Array.isArray(input.searchTerms)) value.searchTerms = input.searchTerms.map(String)
    if (!value.searchTerms.length) value.searchTerms = DEFAULTS.searchTerms
    if (input.searchMode === 'remote' || input.searchMode === 'local') value.searchMode = input.searchMode
  }
  return { ...DEFAULTS, ...value }
}

/** Proxy route prefix served by the Web server. */
const ROUTE_PREFIX = '/api/hongguo'
/** Cover proxy: HEIC posters converted to JPEG for the browser. */
const COVER_PREFIX = '/api/hongguo/cover'
/** Static route prefix for the vendored player libraries. */
const VENDOR_PREFIX = '/api/hongguo/vendor'
/** Stream kinds in preference order, by the SDK's own `hls`/`dash` flags. */
const STREAM_PREFERENCE = ['hls', 'dash', 'file']

/** Convert one image with macOS `sips` (HEIC is what the CDN publishes). */
const sips = promisify(execFile).bind(null, 'sips')

/** A profile store on one JSON file, 0600 like the SDK's own file store. */
function fileProfileStore(path) {
  return {
    async load() {
      try {
        return await readFile(path, 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    },
    async save(json) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const tmp = `${path}.${process.pid}.tmp`
      await writeFile(tmp, json, { mode: 0o600 })
      await rename(tmp, path)
    },
    async reset() {
      await rm(path, { force: true })
    },
  }
}

/** Recall a recovered session's last error while the UI is still connected. */
const ERROR_TEXT = {
  ANONYMOUS_LIMITED: '匿名设备暂时拿不到播放地址，换个设备再试',
  RATE_LIMITED: '请求太频繁，稍后再试',
  TRANSPORT: '网络请求失败',
  CONTENT_UNAVAILABLE: '内容已下架',
  DEVICE_REJECTED: '匿名设备被拒绝，已准备重置',
}

function shortError(error) {
  const code = error?.code ? String(error.code) : 'UNKNOWN'
  return { code, message: ERROR_TEXT[code] ?? (error?.message ? String(error.message) : code) }
}

export function apply(ctx, config = {}) {
  // `apply` stays synchronous for the Loader; the resolved config arrives by
  // the time any route is asked for it.
  const settings = reflectConfig(config)
  let resolved
  const ready = settings.then((value) => (resolved = value))
  const readConfig = () => ({ autoPrompt: true, panelWidth: 480, searchTerms: ['总裁', '重生', '逆袭'], ...(resolved ?? config) })
  const dataDir = process.env.DSH_PLUGIN_DATA_DIR
    ? join(process.env.DSH_PLUGIN_DATA_DIR, 'dsh-hongguo')
    : join(homedir(), '.dsh', 'plugin-data', 'dsh-hongguo')
  let profilePath = typeof config.profilePath === 'string' && config.profilePath ? config.profilePath : join(dataDir, 'anonymous.json')

  let clientPromise
  let games = []
  let gamesAt = 0

  /** Recent searches, so retyping a word does not spend device quota. */
  const searchCache = new Map()
  const SEARCH_CACHE_TTL = 60_000
  const SEARCH_CACHE_MAX = 50

  /**
   * Rotate the anonymous device at most once per cooldown: concurrent searches
   * hitting the rate limit must share one reset instead of replacing the
   * profile several times.
   */
  let deviceReset
  let deviceResetAt = 0
  function rotateDevice(sdk) {
    if (deviceReset) return deviceReset
    if (Date.now() - deviceResetAt < 15_000) return Promise.resolve()
    deviceReset = sdk.resetDevice().catch((error) => {
      logger.warn?.(`[hongguo] device reset failed: ${error?.message ?? error}`)
    }).finally(() => {
      deviceReset = undefined
      deviceResetAt = Date.now()
    })
    return deviceReset
  }

  const logger = ctx.logger ?? { info() {}, warn() {}, error() {} }
  const VENDOR_DIR = join(dirname(fileURLToPath(import.meta.url)), 'vendor')
  const coverDir = join(dataDir, 'covers')
  const mediaDir = join(dataDir, 'media')

  /** One shared SDK client; the wasm instance is process-global anyway. */
  function client() {
    clientPromise ??= ready
      .then(() => {
        if (resolved?.profilePath) profilePath = resolved.profilePath
      })
      .then(() =>
        createClient({
          profile: fileProfileStore(profilePath),
          retryAttempts: 2,
          log: (line) => logger.info?.(`[hongguo] ${line}`),
        }),
      )
      .catch((error) => {
        clientPromise = undefined
        throw error
      })
    return clientPromise
  }

  async function requestStream(sdk, episodeId) {
    try {
      return { ...(await sdk.resolvePlayback(episodeId)), device: 'current' }
    } catch (error) {
      if (error?.code !== 'ANONYMOUS_LIMITED') throw error
      // The service hands out roughly one play model per anonymous device.
      await sdk.resetDevice()
      return { ...(await sdk.resolvePlayback(episodeId)), device: 'reset' }
    }
  }

  async function loadStream(episodeId) {
    const sdk = await client()
    let result = await requestStream(sdk, episodeId)
    const missing = !result?.playback?.streams?.length
    if (missing) {
      await sdk.resetDevice()
      result = await requestStream(sdk, episodeId)
    }
    if (!result?.playback?.streams?.length) throw Object.assign(new Error('没有可播放的地址'), { code: 'ANONYMOUS_LIMITED' })
    return result
  }

  /**
   * Protected episodes are CENC (cenc-aes-ctr) encrypted MP4s. Chromium has no
   * key system for them, so the Host decrypts each one with the content key
   * the SDK resolves, rewrites it as a plain faststart MP4 (no re-encoding),
   * and caches the result. The key stays in this process.
   */
  const mediaKeys = new Map()
  const mediaJobs = new Map()
  const MEDIA_KEEP = 40
  const ffmpegBin = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((path) => existsSync(path)) ?? 'ffmpeg'
  const runFfmpeg = promisify(execFile).bind(null, ffmpegBin)

  function safeId(id) {
    return /^[0-9A-Za-z_-]{1,64}$/.test(String(id ?? '')) ? String(id) : undefined
  }

  /** Keep the newest files only: episodes are watched once, mostly. */
  async function pruneMedia() {
    try {
      const names = (await readdir(mediaDir)).filter((name) => name.endsWith('.mp4') && !name.includes('.part'))
      const rows = await Promise.all(names.map(async (name) => ({ name, at: (await stat(join(mediaDir, name))).mtimeMs })))
      rows.sort((a, b) => b.at - a.at)
      await Promise.all(rows.slice(MEDIA_KEEP).map((row) => rm(join(mediaDir, row.name), { force: true })))
    } catch {
      // Pruning is housekeeping only.
    }
  }

  /** Remember how to decrypt one episode from a resolved play model. */
  function rememberKey(episodeId, result, stream) {
    const key = result?.contentKey?.key
    if (!key || !stream?.url) return false
    mediaKeys.set(episodeId, { key, url: stream.url })
    return true
  }

  async function decryptEpisode(episodeId) {
    const out = join(mediaDir, `${episodeId}.mp4`)
    if (existsSync(out)) return out
    let job = mediaJobs.get(episodeId)
    if (job) return job
    job = (async () => {
      let entry = mediaKeys.get(episodeId)
      if (!entry) {
        const result = await loadStream(episodeId)
        const stream = (result.playback?.streams ?? []).find((row) => row.url && !row.hls && !row.dash)
        if (!rememberKey(episodeId, result, stream)) throw new Error('没有内容密钥')
        entry = mediaKeys.get(episodeId)
      }
      await mkdir(mediaDir, { recursive: true, mode: 0o700 })
      const encrypted = join(mediaDir, `${episodeId}.part.enc`)
      const partial = join(mediaDir, `${episodeId}.part.mp4`)
      try {
        const upstream = await fetch(entry.url, { signal: AbortSignal.timeout(60_000) })
        if (!upstream.ok) throw new Error(`CDN HTTP ${upstream.status}`)
        await writeFile(encrypted, Buffer.from(await upstream.arrayBuffer()))
        await runFfmpeg(
          ['-v', 'error', '-y', '-decryption_key', entry.key, '-i', encrypted, '-map', '0', '-c', 'copy', '-tag:v', 'hvc1', '-movflags', '+faststart', partial],
          { timeout: 120_000 },
        )
        await rename(partial, out)
      } finally {
        rm(encrypted, { force: true }).catch(() => {})
        rm(partial, { force: true }).catch(() => {})
      }
      pruneMedia()
      return out
    })().finally(() => mediaJobs.delete(episodeId))
    mediaJobs.set(episodeId, job)
    return job
  }

  /** Serve a decrypted episode with Range support so the element can seek. */
  async function serveMedia(request, response, episodeId) {
    let file
    try {
      file = await decryptEpisode(episodeId)
    } catch (error) {
      logger.warn?.(`[hongguo] decrypt failed: ${error?.message ?? error}`)
      response.statusCode = 502
      response.setHeader('content-type', 'application/json')
      return response.end(JSON.stringify({ ok: false, error: { message: String(error?.message ?? error) } }))
    }
    const size = (await stat(file)).size
    response.setHeader('content-type', 'video/mp4')
    response.setHeader('accept-ranges', 'bytes')
    response.setHeader('cache-control', 'private, max-age=3600')
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '')
    let start = 0
    let end = size - 1
    if (match) {
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Math.min(Number(match[2]), size - 1)
      if (!match[1] && match[2]) {
        start = Math.max(0, size - Number(match[2]))
        end = size - 1
      }
      if (start > end || start >= size) {
        response.statusCode = 416
        response.setHeader('content-range', `bytes */${size}`)
        return response.end()
      }
      response.statusCode = 206
      response.setHeader('content-range', `bytes ${start}-${end}/${size}`)
    } else {
      response.statusCode = 200
    }
    response.setHeader('content-length', String(end - start + 1))
    if (request.method === 'HEAD') return response.end()
    const reader = createReadStream(file, { start, end })
    reader.on('error', () => response.end())
    request.on('close', () => reader.destroy())
    reader.pipe(response)
  }

  /** Domains the proxy is allowed to fetch. */
  function allowedHost(hostname) {
    return /(^|\.)(qznovelvod\.com|byteimg\.com|fqnovelpic\.com|douyinvod\.com|bytecdn\.cn|ibytedtos\.com|snssdk\.com|lkkwip\.cn|6cc2n\.com|uszim\.com|cloudfront\.net)$/.test(hostname)
  }

  async function proxyStream(mediaUrl) {
    const target = new URL(mediaUrl)
    if (!/^https?:$/.test(target.protocol) || !allowedHost(target.hostname)) {
      throw Object.assign(new Error(`unsupported stream host: ${target.hostname}`), { status: 403 })
    }
    return { absolute: target.href }
  }

  /**
   * Rewrite an HLS or DASH manifest so every URL it names points at our proxy
   * route. Relative segment paths are resolved against the upstream manifest;
   * the rewritten manifest travels with the absolute upstream base so the
   * player needs no knowledge of the CDN.
   */
  function rewriteManifest(text, upstream) {
    const base = new URL(upstream)
    const proxied = (raw) => `${ROUTE_PREFIX}/stream?u=${encodeURIComponent(raw)}`
    const absolute = (raw) => new URL(raw, base).href
    if (/<MPD[\s>]/.test(text)) {
      // DASH names coordinates (SegmentTemplate) or explicit URLs; rewrite only
      // when the representation is made of separate segments.
      const direct = text.replace(/(<(?:BaseURL|SegmentURL|Initialization|Media|SourceURL)[^>]*\b(?:media|sourceURL|initialization)=["'])([^"']+)(["'])/g, (_, a, raw, b) => a + proxied(absolute(raw)) + b)
      return direct.replace(/(<(?:BaseURL|SegmentURL|Initialization|Media)>)([^<]+)(<\/)/g, (_, a, raw, b) => a + proxied(absolute(raw.trim())) + b)
    }
    // HLS: resolve relative playlists and segments against the manifest's URL.
    // Tag attributes (KEY, MAP, MEDIA, ...) carry a URI; other lines do not.
    return text
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed) return line
        if (trimmed.startsWith('#EXT')) {
          if (!trimmed.includes('URI="')) return line
          return trimmed.replace(/URI="([^"]+)"/g, (_, raw) => `URI="${proxied(absolute(raw))}"`)
        }
        return proxied(absolute(trimmed))
      })
      .join('\n')
  }

  /** Bytes of the last rewritten manifest, keyed by the upstream manifest URL. */
  const manifestCache = new Map()

  /**
   * Follow a master playlist to one media playlist and rewrite it, so the
   * player receives a single playlist whose segments all point at this route.
   */
  async function serveManifest(access) {
    const fetchText = async (target) => {
      const fetched = await fetch(target, { signal: AbortSignal.timeout(30_000) })
      if (!fetched.ok) throw new Error(`manifest ${fetched.status}`)
      return { text: await fetched.text(), type: fetched.headers.get('content-type') ?? '' }
    }
    let { text, type } = await fetchText(access.absolute)
    let base = access.absolute
    if (/^#EXTM3U/.test(text.trimStart()) && /#EXT-X-STREAM-INF/.test(text)) {
      const child = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'))
      if (child) {
        const childUrl = new URL(child, base).href
        ;({ text, type } = await fetchText(childUrl))
        base = childUrl
      }
    }
    const rewritten = rewriteManifest(text, base)
    const contentType = /<MPD[\s>]/.test(text) ? 'application/dash+xml' : 'application/vnd.apple.mpegurl'
    manifestCache.set(access.absolute, { body: rewritten, type: contentType, at: Date.now() })
    while (manifestCache.size > 64) manifestCache.delete(manifestCache.keys().next().value)
    return { body: rewritten, type: contentType }
  }

  /** Rewrite one HLS/DASH manifest delivered under an older signature. */
  async function playbackManifest() {
    for (const entry of [...manifestCache.values()].reverse()) {
      const served = await fetch(entry.url, { signal: AbortSignal.timeout(30_000) })
      if (!served.ok) continue
      return { ...(await serveManifest({ absolute: entry.url })) }
    }
    throw Object.assign(new Error('没有可用的播放列表'), { status: 404 })
  }

  /**
   * Serve the vendored player libraries. The package's own `/plugins` route
   * serves only the composed client module, so these assets get their own
   * prefix route on the same Web server.
   */
  /** 黄果图片 CDN 会把图片前 100 字节与固定串异或（image_crypto.dart）。 */
  const IMAGE_XOR_KEY = Buffer.from('2019ysapp7527', 'latin1')
  function xorImageHead(bytes) {
    const out = Buffer.from(bytes)
    for (let i = 0; i < Math.min(100, out.length); i += 1) out[i] ^= IMAGE_XOR_KEY[i % IMAGE_XOR_KEY.length]
    return out
  }
  function sniffImage(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
    if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
    return ''
  }

  /**
   * Serve one cover as JPEG. The CDN only publishes HEIC, which Chromium
   * cannot decode; macOS ships `sips` for the conversion, and the result is
   * cached on disk so each poster is converted once.
   */
  async function serveCover(request, response, url) {
    const source = url.searchParams.get('u') ?? ''
    let target
    try {
      target = new URL(source)
    } catch {
      target = undefined
    }
    if (!target || !/^https?:$/.test(target.protocol) || !/(^|\.)(fqnovelpic\.com|byteimg\.com|pstatp\.com|snssdk\.com|bytecdn\.cn|lkkwip\.cn|6cc2n\.com|uszim\.com)$/.test(target.hostname)) {
      response.statusCode = 400
      return response.end()
    }
    const key = createHash('sha1').update(target.href).digest('hex')
    const cached = join(coverDir, `${key}.jpg`)
    const sendImage = (bytes, mime = 'image/jpeg') => {
      response.statusCode = 200
      response.setHeader('content-type', mime)
      response.setHeader('cache-control', 'public, max-age=86400')
      response.end(request.method === 'HEAD' ? undefined : bytes)
    }
    try {
      return sendImage(await readFile(cached))
    } catch {
      // Not converted yet.
    }
    let upstream
    try {
      upstream = await fetch(target.href, { signal: AbortSignal.timeout(20_000) })
    } catch {
      response.statusCode = 502
      return response.end()
    }
    if (!upstream.ok) {
      response.statusCode = upstream.status
      return response.end()
    }
    const type = upstream.headers.get('content-type') ?? ''
    let bytes = Buffer.from(await upstream.arrayBuffer())
    // 黄果的图片 CDN 常把 JPEG 标成 application/octet-stream；先按魔数判断，
    // 不像图片时再按前 100 字节异或还原一次。
    let sniffed = sniffImage(bytes)
    if (!sniffed) {
      const decoded = xorImageHead(bytes)
      const decodedType = sniffImage(decoded)
      if (decodedType) {
        bytes = decoded
        sniffed = decodedType
      }
    }
    if (/^image\/(jpeg|png|webp|gif|avif)/.test(type) || sniffed) return sendImage(bytes, sniffed || type)
    // HEIC and everything else local ImageIO understands goes through sips.
    const rawPath = join(coverDir, `${key}.heic`)
    const outPath = `${key}.jpg`
    try {
      await mkdir(coverDir, { recursive: true, mode: 0o700 })
      await writeFile(rawPath, bytes)
      await sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '--resampleWidth', '240', rawPath, '--out', join(coverDir, outPath)])
      const converted = await readFile(cached)
      return sendImage(converted)
    } catch (error) {
      logger.warn?.(`[hongguo] cover conversion failed: ${error?.message ?? error}`)
      response.statusCode = 415
      return response.end()
    } finally {
      rm(rawPath, { force: true }).catch(() => {})
    }
  }

  async function serveVendor(request, response) {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
    const name = url.pathname.slice(VENDOR_PREFIX.length + 1)
    const notFound = () => {
      response.statusCode = 404
      response.setHeader('content-type', 'text/plain; charset=utf-8')
      response.end('not found')
    }
    // Only the fixed vendor files, never a path outside the directory.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) return notFound()
    try {
      const bytes = await readFile(join(VENDOR_DIR, name))
      response.statusCode = 200
      response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream')
      response.setHeader('cache-control', 'public, max-age=86400')
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch {
      notFound()
    }
  }

  /**
   * Map one result row to one list entry. Search rows carry no cover or impact
   * figure, so the feed's own rows are used whole and the first search page is
   * used only to append dramas the feed did not list.
   */
  function toRow(item) {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      cover: item.cover_url,
      episodes: item.episode_count,
      heat: item.digg_count ?? item.comment_count,
    }
  }

  /** Merge rows, keeping the richer first sighting and preferring a cover. */
  function mergeRows(seen, item) {
    if (!item?.id) return
    const existing = seen.get(item.id)
    if (!existing) {
      seen.set(item.id, toRow(item))
      return
    }
    if (!existing.cover && item.cover_url) existing.cover = item.cover_url
    if (!existing.description && item.description) existing.description = item.description
    if (existing.episodes === undefined && item.episode_count !== undefined) existing.episodes = item.episode_count
  }

  /**
   * The drama list: the recommended feed first (it is ranked by heat and
   * carries covers), then one page per configured search for anything else.
   */
  async function gather(sdk) {
    const seen = new Map()
    // Several pages of the recommended feed: enough for a few batches of
    // twelve, every row with a cover.
    try {
      for await (const item of sdk.discoverAll({}, { maxPages: 6 })) {
        mergeRows(seen, item)
        if (seen.size >= 48) break
      }
    } catch (error) {
      if (error?.code !== 'ANONYMOUS_LIMITED' && seen.size === 0) throw error
    }
    for (const term of readConfig().searchTerms) {
      if (seen.size >= 24) break
      let page
      try {
        page = await sdk.search(term, {})
      } catch (error) {
        if (error?.code !== 'ANONYMOUS_LIMITED') throw error
        continue
      }
      for (const item of page?.items ?? []) mergeRows(seen, item)
    }
    // Pros at the top, then the feed's own order without the search extras.
    const rows = [...seen.values()]
    const featured = rows.filter((row) => row.cover).slice(0, 48)
    return featured.length >= 12 ? featured : rows.slice(0, 48)
  }

  /** Rebuild the cached list in the background. */
  let refreshing
  function refreshFeed() {
    refreshing ??= (async () => {
      try {
        const sdk = await client()
        const items = await gather(sdk)
        if (items.length > 0) {
          games = items
          gamesAt = Date.now()
        }
      } catch (error) {
        logger.warn?.(`[hongguo] feed refresh failed: ${error?.message ?? error}`)
      } finally {
        refreshing = undefined
      }
    })()
    return refreshing
  }

  // ---- 黄果短剧（huangguo）--------------------------------------------------
  // 第二个片源：APK 逆向出的 JSON 接口 + HLS（AES-128）。设备档案单独一份，
  // 与红果的 openhongguo 档案互不影响。
  const hgProfilePath = join(dataDir, 'huangguo-profile.json')
  let hgClientPromise
  function hgClient() {
    hgClientPromise ??= (async () => {
      const sdk = new HuangguoClient({ profile: hgProfilePath, timeoutMs: 25_000 })
      await sdk.ensureLogin()
      return sdk
    })().catch((error) => {
      hgClientPromise = undefined
      throw error
    })
    return hgClientPromise
  }

  let hgGames = []
  let hgGamesAt = 0
  let hgRefreshing
  const hgManifests = new Map()

  /** 首页模块的前几页拼成一份列表；封面走 SDK 的图片 CDN。 */
  async function gatherHuangguo() {
    const sdk = await hgClient()
    const seen = new Map()
    const modules = await sdk.modules()
    for (const module of modules.slice(0, 6)) {
      let page
      try {
        page = await sdk.discover({ moduleId: module.id, pageSize: 12 })
      } catch {
        continue
      }
      for (const item of page.items) {
        if (!item?.id || seen.has(item.id)) continue
        seen.set(item.id, {
          id: item.id,
          title: item.title,
          description: '',
          cover: sdk.coverURL(item.verticalCover || item.horizontalCover || ''),
          episodes: item.totalEpisode,
        })
      }
      if (seen.size >= 48) break
    }
    return [...seen.values()].slice(0, 48)
  }

  function refreshHuangguo() {
    hgRefreshing ??= (async () => {
      try {
        const items = await gatherHuangguo()
        if (items.length > 0) {
          hgGames = items
          hgGamesAt = Date.now()
        }
      } catch (error) {
        logger.warn?.(`[huangguo] feed refresh failed: ${error?.message ?? error}`)
      } finally {
        hgRefreshing = undefined
      }
    })()
    return hgRefreshing
  }

  async function handleHttp(request, response, url) {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.statusCode = status
      response.setHeader('content-type', type)
      response.setHeader('cache-control', 'no-store')
      response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
    }
    const json = async (fn) => {
      try {
        // Bound every data route so a slow upstream never pins the request.
        const work = Promise.resolve().then(fn)
        const timer = ctx.get('timer')
        const limit = timer
          ? Promise.race([work, timer.timeout(45_000).then(() => Promise.reject(Object.assign(new Error('上游响应超时'), { code: 'TIMEOUT' })))])
          : work
        send(200, await limit)
      } catch (error) {
        const detail = error?.status ? { code: 'HTTP', message: error.message } : shortError(error)
        send(error?.status ?? 502, { ok: false, error: detail })
      }
    }

    const path = url.pathname.slice(ROUTE_PREFIX.length) || '/'


    if (path === '/media') {
      const episodeId = safeId(url.searchParams.get('episode'))
      if (!episodeId) return send(400, { ok: false, error: { message: 'bad episode' } })
      return serveMedia(request, response, episodeId)
    }

    // ---- media: manifests are rewritten, segments stream through unchanged
    if (path === '/stream' || path === '/playlist') {
      if (path === '/playlist') {
        try {
          const served = await playbackManifest()
          response.statusCode = 200
          response.setHeader('content-type', served.type)
          response.setHeader('cache-control', 'no-store')
          return response.end(served.body)
        } catch (error) {
          return send(error?.status ?? 502, { ok: false, error: { message: String(error?.message ?? error) } })
        }
      }
      const upstream = url.searchParams.get('u')
      let access
      try {
        access = await proxyStream(upstream ?? '')
      } catch (error) {
        return send(error.status ?? 400, { ok: false, error: { message: error.message } })
      }
      // A cached manifest answers a stale signature: its own segment URLs
      // still carry the signature that was current when it was fetched.
      const cached = manifestCache.get(access.absolute)
      if (cached && /mpegurl|dash|m3u8|mpd/.test(access.absolute) && !request.headers.range) {
        response.statusCode = 200
        response.setHeader('content-type', cached.type)
        response.setHeader('cache-control', 'no-store')
        return response.end(cached.body)
      }
      const range = request.headers.range
      let upstreamResponse
      try {
        upstreamResponse = await fetch(access.absolute, {
          headers: range ? { range } : {},
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        })
      } catch (error) {
        return send(502, { ok: false, error: { message: String(error?.message ?? error) } })
      }
      const type = upstreamResponse.headers.get('content-type') ?? ''
      const isManifest =
        /mpegurl|dash\+xml/.test(type) ||
        /\.(m3u8|mpd)(\?|$)/.test(access.absolute)
      if (isManifest && upstreamResponse.ok) {
        upstreamResponse.body?.cancel().catch(() => {})
        const served = await serveManifest(access)
        response.statusCode = 200
        response.setHeader('content-type', served.type)
        response.setHeader('cache-control', 'no-store')
        response.end(served.body)
        return
      }
      response.statusCode = upstreamResponse.status
      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
        const value = upstreamResponse.headers.get(header)
        if (value) response.setHeader(header, value)
      }
      response.setHeader('cache-control', 'public, max-age=3600')
      response.setHeader('access-control-allow-origin', '*')
      if (!upstreamResponse.body || request.method === 'HEAD') {
        response.end()
        return
      }
      const reader = upstreamResponse.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          response.write(Buffer.from(value))
        }
      } catch {
        // The player aborted a seek; nothing to report.
      } finally {
        reader.cancel().catch(() => {})
        response.end()
      }
      return
    }

    if (path === '/hg-manifest') {
      const episodeId = safeId(url.searchParams.get('episode'))
      if (!episodeId) return send(400, { ok: false, error: { message: 'bad episode' } })
      const cached = hgManifests.get(episodeId)
      if (cached && Date.now() - cached.at < 45_000) {
        response.statusCode = 200
        response.setHeader('content-type', 'application/vnd.apple.mpegurl')
        response.setHeader('cache-control', 'no-store')
        return response.end(cached.body)
      }
      try {
        const sdk = await hgClient()
        const info = await sdk.getEpisode(episodeId)
        const videoUrl = info?.videoUrl || info?.previewVideoUrl
        if (!videoUrl) throw Object.assign(new Error('这一集需要购买或会员才能播放'), { code: 'PAY_REQUIRED' })
        const playlistURL = sdk.playbackURL(videoUrl)
        const upstream = await fetch(playlistURL, {
          headers: { 'user-agent': sdk.userAgent },
          signal: AbortSignal.timeout(30_000),
        })
        if (!upstream.ok) throw new Error(`播放列表 HTTP ${upstream.status}`)
        const body = rewriteManifest(await upstream.text(), playlistURL)
        hgManifests.set(episodeId, { body, at: Date.now() })
        while (hgManifests.size > 32) hgManifests.delete(hgManifests.keys().next().value)
        response.statusCode = 200
        response.setHeader('content-type', 'application/vnd.apple.mpegurl')
        response.setHeader('cache-control', 'no-store')
        return response.end(body)
      } catch (error) {
        return send(error?.status ?? 502, { ok: false, error: { code: error?.code, message: String(error?.message ?? error) } })
      }
    }

    if (path === '/config') {
      return json(async () => {
        const current = readConfig()
        return { autoPrompt: current.autoPrompt, panelWidth: current.panelWidth, searchTerms: current.searchTerms, searchMode: current.searchMode, profilePath }
      })
    }

    if (path === '/running') {
      const agents = ctx.get('agents')
      const list = agents?.list?.() ?? []
      return json(async () => ({
        running: list.some((agent) => agent?.status === 'running'),
        sessions: list.length,
      }))
    }

    if (path === '/search') {
      return json(async () => {
        const q = Array.from((url.searchParams.get('q') ?? '').trim()).slice(0, 40).join('')
        if (!q) return { items: [] }
        if (readConfig().searchMode === 'local') return { items: [], mode: 'local' }
        const source = url.searchParams.get('source') === 'huangguo' ? 'huangguo' : 'hongguo'
        const key = `${source}:${q}`
        const hit = searchCache.get(key)
        if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL) return { items: hit.items }
        let rows
        if (source === 'huangguo') {
          const sdk = await hgClient()
          const page = await sdk.search(q, { pageSize: 24 })
          rows = (page.items ?? [])
            .filter((item) => item?.id)
            .map((item) => ({
              id: item.id,
              title: item.title,
              description: '',
              cover: sdk.coverURL(item.verticalCover || item.horizontalCover || ''),
              episodes: item.totalEpisode,
            }))
        } else {
          const sdk = await client()
          const page = async () => (await sdk.search(q, {})).items ?? []
          let items
          try {
            items = await page()
          } catch (error) {
            if (error?.code !== 'ANONYMOUS_LIMITED') throw error
            // The anonymous device is rate limited; rotate once and retry.
            await rotateDevice(sdk)
            items = await page()
          }
          rows = items.map(toRow)
        }
        searchCache.set(key, { at: Date.now(), items: rows })
        if (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value)
        return { items: rows }
      })
    }

    if (path === '/feed') {
      const source = url.searchParams.get('source') === 'huangguo' ? 'huangguo' : 'hongguo'
      if (source === 'huangguo') {
        return json(async () => {
          if (hgGames.length > 0 && Date.now() - hgGamesAt < 15 * 60_000) return { items: hgGames }
          if (hgGames.length > 0) {
            refreshHuangguo()
            return { items: hgGames }
          }
          await refreshHuangguo()
          if (hgGames.length === 0) throw Object.assign(new Error('暂时拿不到黄果剧集列表'), { code: 'UNAVAILABLE' })
          return { items: hgGames }
        })
      }
      return json(async () => {
        if (games.length > 0 && Date.now() - gamesAt < 15 * 60_000) return { items: games }
        // A list built a moment ago is good enough while a refresh runs: the
        // SDK is slow on a cold device, and the page must not wait for it twice.
        if (games.length > 0) {
          refreshFeed()
          return { items: games }
        }
        // A warm-up already running answers this request too.
        await refreshFeed()
        if (games.length === 0) throw Object.assign(new Error('暂时拿不到剧集列表'), { code: 'UNAVAILABLE' })
        return { items: games }
      })
    }

    if (path === '/series') {
      const source = url.searchParams.get('source') === 'huangguo' ? 'huangguo' : 'hongguo'
      return json(async () => {
        const id = url.searchParams.get('id')
        if (!id) throw Object.assign(new Error('missing id'), { status: 400 })
        if (source === 'huangguo') {
          const sdk = await hgClient()
          const media = await sdk.getMedia(id).catch(() => undefined)
          const rows = []
          let pageNumber = 1
          let hasMore = true
          while (hasMore && pageNumber <= 5) {
            const page = await sdk.listEpisodes(id, { pageNumber, pageSize: 200 })
            rows.push(...(page.items ?? []))
            hasMore = Boolean(page.hasMore) && page.items.length > 0
            pageNumber += 1
          }
          const episodes = rows.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
          return {
            series: {
              id,
              title: media?.title,
              description: media?.summary,
              cover: sdk.coverURL(media?.verticalCover || media?.horizontalCover || ''),
              episodes: media?.totalEpisode ?? episodes.length,
            },
            episodes: episodes.map((episode) => ({
              id: episode.id,
              number: episode.episodeNumber,
              title: episode.name,
              cover: episode.cover ? sdk.coverURL(episode.cover) : undefined,
              // 免费集有 videoUrl；付费集有时带一段试看（previewVideoUrl），也可以播
              playable: Boolean(episode.videoUrl || episode.previewVideoUrl),
              preview: !episode.videoUrl && Boolean(episode.previewVideoUrl),
            })),
          }
        }
        const sdk = await client()
        const series = await sdk.getSeries(id).catch(() => undefined)
        const episodes = await sdk.listEpisodes(id)
        return {
          series: series ?? games.find((item) => item.id === id) ?? { id },
          episodes: (episodes.items ?? []).map((episode) => ({
            id: episode.id,
            number: episode.number,
            title: episode.title,
            cover: episode.cover_url,
            playable: episode.playable !== false,
          })),
        }
      })
    }

    if (path === '/play') {
      const source = url.searchParams.get('source') === 'huangguo' ? 'huangguo' : 'hongguo'
      return json(async () => {
        const episodeId = url.searchParams.get('episode')
        if (!episodeId) throw Object.assign(new Error('missing episode'), { status: 400 })
        const seriesId = url.searchParams.get('series') ?? undefined
        if (source === 'huangguo') {
          const sdk = await hgClient()
          const info = await sdk.getEpisode(episodeId)
          if (!info?.videoUrl && !info?.previewVideoUrl) {
            throw Object.assign(new Error('这一集需要购买或会员才能播放'), { code: 'PAY_REQUIRED', status: 402 })
          }
          return {
            episodeId,
            seriesId,
            duration: info.videoUrl ? info.playTime : info.previewSeconds || info.playTime,
            preview: !info.videoUrl,
            protected: false,
            sources: [
              {
                definition: 'HLS',
                kind: 'hlsjs',
                url: `${ROUTE_PREFIX}/hg-manifest?episode=${encodeURIComponent(episodeId)}`,
              },
            ],
          }
        }
        const result = await loadStream(episodeId)
        const playback = result.playback
        const streams = (playback.streams ?? []).filter((stream) => stream.url)
        const kindOf = (stream) => (stream.hls ? 'hls' : stream.dash ? 'dash' : 'file')
        const pick = (kind) => streams.find((stream) => kindOf(stream) === kind)
        const ordered = STREAM_PREFERENCE.map(pick).filter(Boolean)
        const chosen = ordered[0]
        if (!chosen) throw Object.assign(new Error('没有可用的清晰度'), { code: 'CONTENT_UNAVAILABLE' })
        const access = await proxyStream(chosen.url)
        const fileStream = pick('file')
        const decryptable =
          playback.protected === true && fileStream && safeId(playback.episode_id ?? episodeId) && rememberKey(playback.episode_id ?? episodeId, result, fileStream)
        if (decryptable) {
          const id = playback.episode_id ?? episodeId
          // Start now: by the time the element asks, most of the work is done.
          decryptEpisode(id).catch(() => {})
          return {
            episodeId: id,
            seriesId,
            duration: playback.duration_seconds,
            expiresAt: playback.expires_at,
            protected: true,
            decrypted: true,
            device: result.device,
            sources: [{ definition: fileStream.definition, kind: 'file', url: `${ROUTE_PREFIX}/media?episode=${encodeURIComponent(id)}` }],
          }
        }
        return {
          episodeId: playback.episode_id,
          seriesId,
          duration: playback.duration_seconds,
          expiresAt: playback.expires_at,
          protected: playback.protected === true,
          device: result.device,
          // Protected (DRM) streams are handed to the MediaSource players in the
          // page, which demux and supply the coded frames to the browser
          // decoder; the content key itself never reaches the page.
          sources: ordered.map((stream) => ({
            definition: stream.definition,
            kind: kindOf(stream),
            url: `${ROUTE_PREFIX}/stream?u=${encodeURIComponent(stream.url)}`,
          })),
        }
      })
    }

    response.statusCode = 404
    response.end('{"ok":false,"error":{"message":"not found"}}')
  }

  // Build the list once at startup so the first page view does not wait for a
  // cold anonymous device.
  refreshFeed()

  // The Web server is optional in non-web profiles; everything else still works.
  ctx.inject(['webServer'], (web) => {
    const guard = (fn) => (request, response) =>
      Promise.resolve(fn(request, response)).catch((error) => {
        logger.warn?.(`[hongguo] route error: ${error?.stack ?? error}`)
        if (!response.headersSent) response.statusCode = 500
        response.end()
      })
    const data = guard((request, response) =>
      handleHttp(request, response, new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)),
    )
    const vendor = guard(serveVendor)
    const cover = guard((request, response) =>
      serveCover(request, response, new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)),
    )
    // One effect owns every route, so unloading the plugin frees them together.
    const dispose = ctx.effect(
      () => {
        const stops = [
          web.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: data }),
          web.webServer.register({ kind: 'prefix', path: VENDOR_PREFIX, handler: vendor }),
          web.webServer.register({ kind: 'prefix', path: COVER_PREFIX, handler: cover }),
        ]
        return () => stops.forEach((stop) => stop())
      },
      'hongguo: routes',
    )
    return dispose
  })

}
