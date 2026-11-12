/**
 * dsh-hongguo — standalone player window.
 *
 * The Sidebar tab belongs to one conversation: switching conversations unmounts
 * it and the drama stops. This document is opened by the host as its own window,
 * so a conversation switch, a Sidebar layout change, or a reload of the DSH shell
 * leaves it playing.
 *
 * It talks to the same same-origin `/api/hongguo` routes the Sidebar half uses —
 * the content key never leaves the Host — and keeps its place in the same
 * localStorage record, so progress is shared both ways.
 */

const API = '/api/hongguo'
/** Same record the Sidebar player writes, so both halves see one history. */
const HISTORY_KEY = 'dsh-hongguo.watch-history.v1'
const STORE_KEY = `${HISTORY_KEY}.hongguo`
/** Volume is a preference, not episode state: one key, shared with the Sidebar. */
const VOLUME_KEY = `${HISTORY_KEY}.volume`
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const END_MARGIN = 5
const PAGE = 12
const CHUNK = 50
const TICK = 5000

const app = document.getElementById('app')

const state = {
  view: 'list',
  items: [],
  page: 0,
  cursor: '',
  hasMore: false,
  loading: false,
  keyword: '',
  series: undefined,
  episodes: [],
  chunk: 0,
  current: undefined,
  sources: [],
  source: undefined,
  engine: undefined,
  error: undefined,
  running: false,
  resumeAt: 0,
}

// ---- tiny DOM helpers -------------------------------------------------

function h(tag, attrs, ...kids) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue
    node.append(typeof kid === 'string' ? document.createTextNode(kid) : kid)
  }
  return node
}

async function api(path, options) {
  const response = await fetch(API + path, { headers: { accept: 'application/json' }, ...options })
  const body = await response.json().catch(() => undefined)
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error?.message ?? `请求失败（${response.status}）`)
  }
  return body ?? {}
}

// ---- history ----------------------------------------------------------

function readHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : { series: {} }
  } catch {
    return { series: {} }
  }
}

function progressOf(seriesId, episodeId) {
  const record = readHistory().series?.[seriesId]
  if (!record || record.episodeId !== episodeId) return undefined
  return record.position
}

function saveProgress(series, episode, position) {
  if (!series?.id) return
  const at = Number.isFinite(position) && position > 0 ? position : 0
  if (at > 0 && !episode?.id) return
  const records = readHistory().series ?? {}
  records[series.id] = {
    seriesId: series.id,
    title: series.title,
    episodeId: episode?.id,
    number: episode?.number,
    position: at,
    at: Date.now(),
  }
  const trimmed = Object.fromEntries(
    Object.values(records)
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, 12)
      .map((record) => [record.seriesId, record]),
  )
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ series: trimmed }))
  } catch {
    // A disabled storage loses only history.
  }
}

/** The drama last watched, so a fresh window resumes instead of showing a list. */
function lastWatched() {
  return Object.values(readHistory().series ?? {}).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]
}

// ---- volume ------------------------------------------------------------

function readVolume() {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 1
  } catch {
    return 1
  }
}

function writeVolume(value) {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.round(value * 100) / 100))
  } catch {
    // A disabled storage loses only the setting.
  }
}

/** The volume readout, rewritten in place so a wheel turn needs no re-render. */
let volumeLabel
/** The level drawn over the picture for a moment after any volume change. */
let volumeOsd
let volumeOsdTimer

function volumeText() {
  return `音量 ${Math.round(video.volume * 100)}% · 滚轮调音量`
}

function refreshVolumeLabel() {
  if (volumeLabel) volumeLabel.textContent = volumeText()
}

/** A wheel turn must be visible on the picture, not only in the small label. */
function showVolumeOsd() {
  if (!volumeOsd) return
  const level = Math.round(video.volume * 100)
  volumeOsd.textContent = video.muted || level === 0 ? '静音' : `音量 ${level}%`
  volumeOsd.classList.add('show')
  clearTimeout(volumeOsdTimer)
  volumeOsdTimer = setTimeout(() => volumeOsd.classList.remove('show'), 1100)
}

// ---- the stage --------------------------------------------------------

const video = document.createElement('video')
video.playsInline = true
video.preload = 'metadata'
video.controls = true
// Restore the remembered volume before the first episode loads.
video.volume = readVolume()
video.addEventListener('volumechange', () => {
  writeVolume(video.volume)
  refreshVolumeLabel()
  showVolumeOsd()
})

const stage = h('div', { class: 'hg-stage' }, video)
/** The on-picture level indicator; hidden until a volume change shows it. */
volumeOsd = h('div', { class: 'hg-vol', text: '' })
stage.append(volumeOsd)
/** The wheel over the picture is the volume slider; the value is remembered. */
stage.addEventListener('wheel', (event) => {
  event.preventDefault()
  const delta = event.deltaY < 0 ? 0.05 : -0.05
  const next = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 100) / 100))
  video.volume = next
  video.muted = next === 0
}, { passive: false })

async function togglePip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await video.requestPictureInPicture()
  } catch (error) {
    console.warn('[hongguo] picture-in-picture failed:', error?.message ?? String(error))
  }
}

/** Release whatever MSE engine the previous source used. */
function detachEngine() {
  const engine = state.engine
  state.engine = undefined
  try {
    engine?.destroy?.()
  } catch {
    // A half-built engine has nothing to release.
  }
  try {
    video.removeAttribute('src')
    video.load()
  } catch {
    // An element without a source is harmless.
  }
}

const vendorLoads = new Map()

/** Load one vendored player library; `mpegts.js` is UMD, dash.js is a module. */
function loadVendor(file, globalName = 'mpegts') {
  if (vendorLoads.has(file)) return vendorLoads.get(file)
  const loading = new Promise((resolve, reject) => {
    if (file.endsWith('.mjs')) {
      import(/* @vite-ignore */ `${API}/vendor/${file}`).then((module) => resolve(module.modern ?? module), reject)
      return
    }
    const script = document.createElement('script')
    script.src = `${API}/vendor/${file}`
    script.onload = () => resolve(window[globalName])
    script.onerror = () => {
      vendorLoads.delete(file)
      reject(new Error(`无法加载 ${file}`))
    }
    document.head.append(script)
  })
  vendorLoads.set(file, loading)
  return loading
}

/** A file source is a plain MP4; HLS/DASH are demuxed in JavaScript. */
async function attachSource(source) {
  detachEngine()
  state.source = source
  if (source.kind === 'file') {
    video.src = source.url
    return
  }
  if (source.kind === 'hls') {
    const engine = await loadVendor('mpegts.js')
    if (!engine?.isSupported?.()) throw new Error('当前浏览器不支持 MediaSource 播放')
    const player = engine.createPlayer({ type: 'mse', isLive: false, url: source.url, hasAudioTrack: true }, { autoCleanupSourceBuffer: true, lazyLoad: true })
    player.attachMediaElement(video)
    player.load()
    state.engine = player
    return
  }
  const dash = await loadVendor('dash.all.min.mjs')
  const engine = dash.MediaPlayer ?? dash.default
  if (!engine?.isSupported?.()) throw new Error('当前浏览器不支持 MediaSource 播放')
  const player = engine().create()
  player.initialize(video, source.url, false)
  state.engine = player
}

/** Prefer the decrypted MP4 the Host remuxes; otherwise the first source. */
function pickSource(sources, definition) {
  if (definition) {
    const wanted = sources.find((item) => item.definition === definition)
    if (wanted) return wanted
  }
  return sources.find((item) => item.kind === 'file') ?? sources[0]
}

// ---- playback ---------------------------------------------------------

// Requesting an episode's play model starts its download and decryption on
// the Host, so the next episode is asked for while this one plays.
const prefetched = new Map()
let prefetching
function maybePrefetchNext() {
  const next = nextEpisode()
  if (!next || prefetched.has(next.id) || prefetching === next.id) return
  if (!(video.currentTime >= Math.min(10, (video.duration || 0) * 0.3))) return
  prefetching = next.id
  const params = new URLSearchParams({ episode: next.id })
  if (state.series?.id) params.set('series', state.series.id)
  api(`/play?${params}`)
    .then((data) => {
      prefetched.set(next.id, { data, at: Date.now() })
      while (prefetched.size > 2) prefetched.delete(prefetched.keys().next().value)
    })
    .catch(() => {})
    .finally(() => {
      if (prefetching === next.id) prefetching = undefined
    })
}
function takePrefetched(episodeId) {
  const entry = prefetched.get(episodeId)
  if (!entry) return undefined
  prefetched.delete(episodeId)
  const expires = Number(entry.data?.expiresAt) * 1000
  const fresh = Number.isFinite(expires) && expires > 0 ? expires - Date.now() > 60_000 : Date.now() - entry.at < 5 * 60_000
  return fresh ? entry.data : undefined
}

/** Play one episode, resuming where the record or the caller says. */
async function play(episode, at, definition) {
  if (!episode?.id) return
  state.current = episode
  state.error = undefined
  const startAt = Number.isFinite(at) && at > 0 ? at : progressOf(state.series?.id, episode.id) ?? 0
  state.resumeAt = startAt
  render()
  try {
    const params = new URLSearchParams({ episode: episode.id })
    if (state.series?.id) params.set('series', state.series.id)
    const data = takePrefetched(episode.id) ?? (await api(`/play?${params}`))
    state.sources = data.sources ?? []
    const source = pickSource(state.sources, definition)
    if (!source) throw new Error('这一集没有可用的清晰度')
    await attachSource(source)
    document.title = `${state.series?.title ?? '摸鱼短剧'} · 第 ${episode.number ?? '?'} 集`
    // Setting a new source does not carry the old element's play state: an
    // episode that follows another has to start on its own.
    video.play().catch(() => {})
    render()
  } catch (error) {
    state.error = error?.message ?? String(error)
    render()
  }
}

function nextEpisode() {
  const list = state.episodes
  const index = list.findIndex((episode) => episode.id === state.current?.id)
  return index >= 0 ? list[index + 1] : undefined
}

video.addEventListener('loadedmetadata', () => {
  if (video.videoWidth && video.videoHeight) {
    stage.style.aspectRatio = String(video.videoWidth / video.videoHeight)
  }
  const position = state.resumeAt
  if (position > 0 && (!video.duration || position < video.duration - END_MARGIN)) {
    try {
      video.currentTime = position
    } catch {
      // Not seekable yet; playback starts at the beginning.
    }
  }
  state.resumeAt = 0
})

let lastSaved = 0
video.addEventListener('timeupdate', () => {
  if (!state.series || !state.current) return
  if (!video.paused) maybePrefetchNext()
  if (Math.abs(video.currentTime - lastSaved) < 1) return
  lastSaved = video.currentTime
  saveProgress(state.series, state.current, video.currentTime)
})

video.addEventListener('ended', () => {
  if (state.series && state.current) saveProgress(state.series, state.current, video.duration ?? 0)
  const next = nextEpisode()
  if (next) play(next)
})

video.addEventListener('error', () => {
  // An element with no source raises this on detach; only a real load fails.
  if (!state.source) return
  state.error = '视频加载失败，换一集或重试'
  render()
})

const reportPlaying = () => {
  fetch(`${API}/activity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'window', playing: true, title: state.series?.title, episode: state.current?.number }),
    keepalive: true,
  }).catch(() => {})
}
video.addEventListener('play', reportPlaying)

// ---- views ------------------------------------------------------------

function coverNode(item) {
  const box = h('div', { class: 'hg-cover' }, h('span', { text: '短剧' }))
  if (!item.cover) return box
  const img = h('img', { src: `${API}/cover?u=${encodeURIComponent(item.cover)}`, alt: item.title ?? '', loading: 'lazy' })
  img.addEventListener('error', () => img.remove())
  box.append(img)
  return box
}

function renderHeader() {
  const title = state.series?.title ?? '摸鱼短剧'
  const sub = state.series && state.current
    ? `第 ${state.current.number ?? '?'} 集${state.episodes.length ? ` · 共 ${state.episodes.length} 集` : ''}`
    : '独立窗口 · 切换对话不会关闭'
  const parts = []
  if (state.series) {
    parts.push(h('button', { class: 'hg-btn', type: 'button', onclick: backToList }, '‹ 列表'))
  }
  parts.push(h('div', { class: 'hg-title', title }, title), h('div', { class: 'hg-sub', text: sub }))
  return h('div', { class: 'hg-head' }, ...parts)
}

/** The feed arrives as one list paged locally; search results grow as walked. */
function visibleItems() {
  if (state.keyword) return state.items
  const pages = Math.max(1, Math.ceil(state.items.length / PAGE))
  state.page = Math.min(state.page, pages - 1)
  const from = state.page * PAGE
  return state.items.slice(from, from + PAGE)
}

function renderList() {
  const head = renderHeader()
  head.append(
    h('input', {
      class: 'hg-search',
      type: 'search',
      placeholder: '搜索剧名',
      value: state.keyword,
      onkeydown: (event) => {
        if (event.key !== 'Enter') return
        state.keyword = event.target.value.trim()
        state.page = 0
        refreshList()
      },
    }),
    h('button', { class: 'hg-btn', type: 'button', disabled: state.loading, onclick: turnPage }, state.keyword ? '下一批' : '换一批'),
  )
  const body = h('div', { class: 'hg-body' })
  if (state.error) body.append(errorNode())
  const items = visibleItems()
  if (state.loading && state.items.length === 0) body.append(h('div', { class: 'hg-muted', text: '加载中…' }))
  else if (items.length === 0) body.append(h('div', { class: 'hg-muted', text: state.keyword ? `没有找到「${state.keyword}」` : '暂时拿不到剧集列表' }))
  else {
    body.append(h('div', { class: 'hg-grid' }, ...items.map((item) => h('button', {
      class: 'hg-card',
      type: 'button',
      onclick: () => openSeries({ id: item.id, title: item.title }),
    }, coverNode(item), h('div', { class: 'hg-card-title', text: item.title ?? item.id })))))
  }
  body.append(h('div', { class: 'hg-foot', text: 'Agent 停下时自动暂停播放' }))
  app.replaceChildren(head, body)
}

function renderSeries() {
  const body = h('div', { class: 'hg-body' })
  body.append(stage)
  body.append(h('div', { class: 'hg-controls' },
    h('select', {
      class: 'hg-select',
      'aria-label': '倍速',
      title: '倍速',
      onchange: (event) => {
        video.playbackRate = Number(event.target.value)
      },
    }, ...SPEEDS.map((value) => h('option', { value: String(value), selected: String(value) === String(video.playbackRate) }, value === 1 ? '1x' : value + 'x'))),
    document.pictureInPictureEnabled === true
      ? h('button', { class: 'hg-btn', type: 'button', onclick: togglePip }, '画中画')
      : null,
    (volumeLabel = h('span', { class: 'hg-sub', text: volumeText() })),
  ))
  if (state.error) body.append(errorNode())
  if (state.sources.length > 1) {
    body.append(h('div', { class: 'hg-pills' }, ...state.sources.map((source) => h('button', {
      class: 'hg-pill',
      type: 'button',
      'aria-pressed': String(source === state.source),
      onclick: () => play(state.current, video.currentTime, source.definition),
    }, source.definition))))
  }
  if (state.episodes.length > 0) {
    const chunks = Math.ceil(state.episodes.length / CHUNK)
    if (chunks > 1) {
      body.append(h('div', { class: 'hg-chunks' }, ...Array.from({ length: chunks }, (_, at) => h('button', {
        class: 'hg-pill hg-chunk',
        type: 'button',
        'aria-selected': String(at === state.chunk),
        onclick: () => {
          state.chunk = at
          render()
        },
      }, `${at * CHUNK + 1}-${Math.min((at + 1) * CHUNK, state.episodes.length)}`))))
    }
    body.append(h('div', { class: 'hg-episodes' }, ...state.episodes
      .slice(state.chunk * CHUNK, (state.chunk + 1) * CHUNK)
      .map((episode) => h('button', {
        class: 'hg-ep',
        type: 'button',
        'aria-current': String(episode.id === state.current?.id),
        onclick: () => play(episode),
      }, String(episode.number ?? '·')))))
  } else if (!state.error) {
    body.append(h('div', { class: 'hg-muted', text: '加载中…' }))
  }
  body.append(h('div', { class: 'hg-foot', text: '独立窗口：切换对话、切换侧栏布局都不会中断这一集' }))
  app.replaceChildren(renderHeader(), body)
}

function errorNode() {
  return h('div', { class: 'hg-error' },
    h('span', { text: state.error }),
    h('button', {
      class: 'hg-btn',
      type: 'button',
      onclick: () => {
        const episode = state.current
        state.error = undefined
        if (episode) play(episode)
        else render()
      },
    }, '重试'),
  )
}

function render() {
  if (state.view === 'series') renderSeries()
  else renderList()
}

// ---- navigation -------------------------------------------------------

/** Load one drama, and resume its last episode unless the caller plays one. */
async function openSeries(item, options) {
  const autoPlay = options?.autoPlay !== false
  state.series = { id: item.id, title: item.title }
  state.current = undefined
  state.sources = []
  state.source = undefined
  state.episodes = []
  state.chunk = 0
  state.error = undefined
  state.view = 'series'
  detachEngine()
  render()
  try {
    const data = await api(`/series?id=${encodeURIComponent(item.id)}`)
    state.series = data.series ?? state.series
    state.episodes = data.episodes ?? []
    document.title = `${state.series?.title ?? '摸鱼短剧'} · 摸鱼短剧`
    if (state.episodes.length === 0) {
      state.error = '这部短剧暂时没有可播的集'
      render()
      return
    }
    render()
    if (!autoPlay) return
    const record = readHistory().series?.[item.id]
    const resume = record?.episodeId ? state.episodes.find((episode) => episode.id === record.episodeId) : undefined
    if (resume) play(resume, record.position)
  } catch (error) {
    state.error = error?.message ?? String(error)
    render()
  }
}

function backToList() {
  detachEngine()
  state.view = 'list'
  state.series = undefined
  state.current = undefined
  state.episodes = []
  document.title = '摸鱼短剧'
  render()
}

async function refreshList() {
  state.loading = true
  state.error = undefined
  state.items = []
  render()
  try {
    if (state.keyword) {
      const data = await api(`/search?q=${encodeURIComponent(state.keyword)}`)
      state.items = data.items ?? []
      state.cursor = data.cursor ?? ''
      state.hasMore = data.hasMore === true
    } else {
      const data = await api('/feed')
      state.items = data.items ?? []
      state.page = 0
      state.cursor = ''
      state.hasMore = false
    }
  } catch (error) {
    state.error = error?.message ?? String(error)
  } finally {
    state.loading = false
    render()
  }
}

/** "换一批": step the cached feed by one page, or walk the search cursor. */
async function turnPage() {
  if (!state.keyword) {
    const pages = Math.max(1, Math.ceil(state.items.length / PAGE))
    state.page = (state.page + 1) % pages
    render()
    return
  }
  if (!state.hasMore || state.loading) return
  state.loading = true
  render()
  try {
    const data = await api(`/search?q=${encodeURIComponent(state.keyword)}&cursor=${encodeURIComponent(state.cursor)}`)
    const seen = new Set(state.items.map((item) => item.id))
    state.items = [...state.items, ...(data.items ?? []).filter((item) => !seen.has(item.id))]
    state.cursor = data.cursor ?? ''
    state.hasMore = data.hasMore === true
  } catch (error) {
    state.error = error?.message ?? String(error)
  } finally {
    state.loading = false
    render()
  }
}

// ---- agent state: pause when the task finishes -------------------------

async function pollRunning() {
  try {
    const data = await api('/running')
    const running = data.running === true
    if (state.running && !running) {
      // The task the drama was waiting on finished: pause on its frame.
      try {
        video.pause()
      } catch {
        // An element without a source is harmless.
      }
    }
    state.running = running
  } catch {
    // A Host that cannot answer this leaves the player alone.
  }
}

// ---- boot -------------------------------------------------------------

function boot() {
  const params = new URLSearchParams(location.search)
  const seriesId = params.get('series')
  const episodeId = params.get('episode')
  const at = Number(params.get('at') ?? 0)
  if (seriesId) {
    // An explicit episode from the Sidebar must win over the saved record.
    openSeries({ id: seriesId, title: params.get('title') ?? undefined }, { autoPlay: !episodeId }).then(() => {
      if (!episodeId) return
      const episode = state.episodes.find((item) => item.id === episodeId)
      if (episode) play(episode, at)
    })
  } else {
    const last = lastWatched()
    if (last?.seriesId) openSeries({ id: last.seriesId, title: last.title })
    else refreshList()
  }
  pollRunning()
  setInterval(pollRunning, TICK)
}

boot()