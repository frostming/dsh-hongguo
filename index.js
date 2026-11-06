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
  })
}

/**
 * Read this plugin's raw config and resolve it against the declared fields:
 * unknown keys are dropped, absent ones take their default, and a value of
 * the wrong type falls back to the default instead of failing activation.
 */
export async function reflectConfig(raw = {}) {
  const DEFAULTS = { autoPrompt: true, panelWidth: 480, searchTerms: ['总裁', '重生', '逆袭'] }
  const input = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([key]) => ['autoPrompt', 'panelWidth', 'profilePath', 'searchTerms'].includes(key)),
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

/**
 * The CDN publishes HEIC posters, which Chromium cannot decode. macOS ships
 * `sips`; everywhere else the ffmpeg the player already requires can decode
 * HEIC, because libavcodec reads the HEIF still as a one-frame HEVC stream.
 */
function coverConverter(runFfmpeg) {
  if (process.platform === 'darwin') {
    return async (rawPath, outPath) => {
      await sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '--resampleWidth', '240', rawPath, '--out', outPath])
    }
  }
  return async (rawPath, outPath) => {
    await runFfmpeg(['-v', 'error', '-y', '-i', rawPath, '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '6', '-update', '1', outPath], { timeout: 30_000 })
  }
}

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
  const ffmpegBin =
    [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      // Windows: WinGet's shim directory, then a plain Program Files install;
      // anything else (scoop, choco) is expected on PATH, which is the fallback.
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe') : '',
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'ffmpeg', 'bin', 'ffmpeg.exe') : '',
    ].find((path) => path && existsSync(path)) ?? 'ffmpeg'
  const runFfmpeg = promisify(execFile).bind(null, ffmpegBin)
  const convertCover = coverConverter(runFfmpeg)

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
    return /(^|\.)(qznovelvod\.com|byteimg\.com|fqnovelpic\.com|douyinvod\.com|bytecdn\.cn|ibytedtos\.com|snssdk\.com)$/.test(hostname)
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
  /**
   * Serve one cover as JPEG. The CDN publishes HEIC, which Chromium cannot
   * decode, so anything that is not already a browser format is converted once
   * and cached on disk.
   */
  async function serveCover(request, response, url) {
    const source = url.searchParams.get('u') ?? ''
    let target
    try {
      target = new URL(source)
    } catch {
      target = undefined
    }
    if (!target || !/^https?:$/.test(target.protocol) || !/(^|\.)(fqnovelpic\.com|byteimg\.com|pstatp\.com|snssdk\.com|bytecdn\.cn)$/.test(target.hostname)) {
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
    const bytes = Buffer.from(await upstream.arrayBuffer())
    if (/^image\/(jpeg|png|webp|gif|avif)/.test(type)) return sendImage(bytes, type)
    // HEIC goes through the platform converter (sips on macOS, ffmpeg elsewhere).
    const rawPath = join(coverDir, `${key}.heic`)
    const outPath = `${key}.jpg`
    try {
      await mkdir(coverDir, { recursive: true, mode: 0o700 })
      await writeFile(rawPath, bytes)
      await convertCover(rawPath, join(coverDir, outPath))
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

  /** Posters looked up for search results, by series id. */
  const searchCovers = new Map()

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

    if (path === '/config') {
      return json(async () => {
        const current = readConfig()
        return { autoPrompt: current.autoPrompt, panelWidth: current.panelWidth, searchTerms: current.searchTerms, profilePath }
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

    if (path === '/feed') {
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

    // Real search on the service, not a filter over the cached list.
    // One page is a handful of rows, so the cursor is passed both ways: the
    // first call shows results at once, the client walks the rest.
    if (path === '/search') {
      const keyword = (url.searchParams.get('q') ?? '').trim().slice(0, 40)
      const cursor = (url.searchParams.get('cursor') ?? '').trim().slice(0, 32)
      if (!keyword) return send(400, { ok: false, error: { message: 'empty query' } })
      return json(async () => {
        const sdk = await client()
        const search = () => sdk.search(keyword, cursor ? { cursor } : {})
        let page
        try {
          page = await search()
        } catch (error) {
          if (error?.code !== 'ANONYMOUS_LIMITED') throw error
          // The anonymous device ran out; a fresh one answers the same query.
          await sdk.resetDevice()
          page = await search()
        }
        const seen = new Map()
        for (const item of page?.items ?? []) mergeRows(seen, item)
        const rows = [...seen.values()]
        // Search rows carry no poster; the cached list or the series detail does.
        const known = new Map(games.map((row) => [row.id, row.cover]))
        await Promise.all(
          rows.map(async (row) => {
            if (row.cover) return
            row.cover = known.get(row.id) ?? searchCovers.get(row.id)
            if (row.cover) return
            try {
              const detail = await sdk.getSeries(row.id)
              if (detail?.cover_url) {
                row.cover = detail.cover_url
                searchCovers.set(row.id, detail.cover_url)
              }
            } catch {
              // A drama without a poster still shows, with the placeholder.
            }
          }),
        )
        return { items: rows, cursor: page?.cursor ?? '', hasMore: page?.has_more === true }
      })
    }

    if (path === '/series') {
      return json(async () => {
        const id = url.searchParams.get('id')
        if (!id) throw Object.assign(new Error('missing id'), { status: 400 })
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
      return json(async () => {
        const episodeId = url.searchParams.get('episode')
        if (!episodeId) throw Object.assign(new Error('missing episode'), { status: 400 })
        const seriesId = url.searchParams.get('series') ?? undefined
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
