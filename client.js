/**
 * dsh-hongguo — Client half.
 *
 * Registers one right-Sidebar tab type (`kind: 'hongguo'`) that plays a
 * short drama, a small button in the sidebar foot that opens it, and an
 * ambient prompt under the composer that invites the user to open the player
 * while the agent is running. All network work — search, episodes, play models
 * — stays in the Host half; this module only calls the same-origin routes it
 * serves.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hongguo',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/api/hongguo'
    const TAB_ID = 'dsh-hongguo'
    const KIND = 'hongguo'
    const NS = 'hongguo'
    /** Playback rates offered in the player's speed picker. */
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

    const zh = {
      'tab.title': '摸鱼短剧',
      'button.label': '短剧',
      'button.tooltip': '打开摸鱼短剧',
      'window.browser': '默认浏览器打开',
      'window.browserTip': '交给系统默认浏览器打开；通常是在已有窗口里开成标签页',
      'player.pip': '画中画',
      'guide.title': '摸鱼短剧',
      'guide.description': '在边栏里看一部短剧，陪 Agent 一起干活',
      'prompt.title': 'Agent 干活中，刷一集？',
      'prompt.body': '等待的时间里，挑一部短剧放进右侧边栏，边看边等。',
      'prompt.chip': '边等边看 · 任务结束自动暂停',
      'prompt.hint': 'Agent 正在干活，挑一部短剧放到右侧边栏，边看边等。',
      'prompt.collapse': '收起',
      'prompt.expand': '展开',
      'prompt.action': '调出短剧',
      'prompt.dismiss': '不用了',
      'player.refresh': '换一批',
      'player.more': '更多…',
      'player.back': '返回列表',
      'player.loading': '加载中…',
      'player.episodes': '共 {count} 集',
      'player.next': '下一集',
      'player.prev': '上一集',
      'player.mute': '静音',
      'player.unmute': '取消静音',
      'player.retry': '重试',
      'player.device': '匿名设备已更换',
      'player.noSource': '这集暂时没有可播放的地址',
      'player.noMse': '当前浏览器不支持 MediaSource 播放',
      'player.codecHint': '这一集暂时无法解密或解码，可以点重试或换一集。',
      'player.remuxing': '正在把这一集转换成可直接播放的格式…',
      'player.finished': '任务完成了，先停一下。看完结果再看剧。',
      'player.resume': '继续播放',
      'player.history': '继续观看',
      'player.historyLine': '第 {n} 集 · {t}',
      'player.historyNew': '还没开始看',
      'player.forget': '从历史中移除',
      'player.resumed': '已从上次的 {time} 继续',
      'player.restart': '从头播放',
      'player.close': '关闭',
      'player.notPlaying': '现在没有正在播放的短剧',
      'player.pickRandom': '随便挑一集',
      'player.startFirst': '从第 1 集开始',
      'player.recommend': '为你推荐',
      'player.historyOpen': '观看历史',
      'player.search': '搜索短剧',
      'player.searching': '搜索中…',
      'player.noResults': '没有找到“{q}”相关的短剧',
      'player.historyEmpty': '还没有观看记录',
      'player.episodeOf': '第 {n} 集 · 共 {total} 集',
      'player.chooseEpisode': '选集',
      'player.speed': '倍速',
      'player.fullscreen': '全屏',
      'player.play': '播放',
      'player.pause': '暂停',
      'player.watchNow': '现在就看',
      'player.drm': '这一集是加密流，且未能在本机解密（需要安装 ffmpeg）',
      'player.error': '出错了：{message}',
      'source.switch': '切换片源',
      'source.hongguo': '红果',
      'source.hghub': '备用片源',
      'source.payRequired': '这一集需要购买或会员才能播放',
      'player.noFree': '这部剧没有可免费播放的集',
    }
    const en = {
      'tab.title': 'Drama Break',
      'button.label': 'Drama',
      'button.tooltip': 'Open Drama Break',
      'window.browser': 'Open in browser',
      'window.browserTip': 'Hand it to the default browser, which usually opens a tab',
      'player.pip': 'Picture in picture',
      'guide.title': 'Drama Break',
      'guide.description': 'Watch a short drama beside the Agent while it works',
      'prompt.title': 'Agent working — squeeze in an episode?',
      'prompt.body': 'Pick a short drama for the right Sidebar and watch while you wait.',
      'prompt.chip': 'Watch while you wait · pauses on finish',
      'prompt.hint': 'The agent is working — park a short drama in the right Sidebar and watch while you wait.',
      'prompt.collapse': 'Hide',
      'prompt.expand': 'Show',
      'prompt.action': 'Open the player',
      'prompt.dismiss': 'Not now',
      'player.refresh': 'Refresh',
      'player.more': 'More…',
      'player.back': 'Back to list',
      'player.loading': 'Loading…',
      'player.episodes': '{count} episodes',
      'player.next': 'Next episode',
      'player.prev': 'Previous episode',
      'player.mute': 'Mute',
      'player.unmute': 'Unmute',
      'player.retry': 'Retry',
      'player.device': 'Anonymous device rotated',
      'player.noSource': 'No playable source for this episode',
      'player.noMse': 'This browser cannot play through MediaSource',
      'player.codecHint': 'This browser may not decode this episode\'s HEVC video; try another episode.',
      'player.remuxing': 'Preparing this episode for playback…',
      'player.finished': 'Task finished — paused for you. Resume when ready.',
      'player.resume': 'Resume',
      'player.history': 'Continue watching',
      'player.historyLine': 'Episode {n} · {t}',
      'player.historyNew': 'Not started',
      'player.forget': 'Remove from history',
      'player.resumed': 'Resumed from {time}',
      'player.restart': 'Restart',
      'player.close': 'Close',
      'player.notPlaying': 'Nothing is playing right now',
      'player.pickRandom': 'Surprise me with an episode',
      'player.startFirst': 'Start from episode 1',
      'player.recommend': 'Recommended for you',
      'player.historyOpen': 'History',
      'player.search': 'Search dramas',
      'player.searching': 'Searching…',
      'player.noResults': 'No dramas found for “{q}”',
      'player.historyEmpty': 'Nothing watched yet',
      'player.episodeOf': 'Episode {n} of {total}',
      'player.chooseEpisode': 'Episodes',
      'player.speed': 'Speed',
      'player.fullscreen': 'Fullscreen',
      'player.play': 'Play',
      'player.pause': 'Pause',
      'source.switch': 'Switch source',
      'source.hongguo': 'Hongguo',
      'source.hghub': 'Alternate source',
      'source.payRequired': 'This episode needs a purchase or membership',
      'player.noFree': 'No free episodes in this drama',
      'player.watchNow': 'Watch now',
      'player.drm': 'This episode is encrypted and could not be decrypted locally (ffmpeg is required)',
      'player.error': 'Something went wrong: {message}',
    }

    const CSS = `
.hg-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;}
.hg-head{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;flex:none;}
.hg-source{appearance:none;border:0;background:none;padding:0;cursor:default;display:flex;align-items:center;border-radius:8px;}
.hg-source:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.hg-title{font-weight:600;font-size:14px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hg-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px;line-height:1;padding:7px 10px;cursor:pointer;white-space:nowrap;}
.hg-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.hg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.hg-btn[disabled]{opacity:.5;cursor:default;}
.hg-btn.primary{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:600;}
.hg-btn.primary:hover{background:var(--dsw-alias-label-primary);opacity:.9;}
.hg-body{flex:1;min-height:0;overflow:auto;padding:0 12px 16px;}
.hg-search{display:flex;gap:6px;margin-bottom:10px;position:sticky;top:0;background:var(--dsw-alias-bg-base);padding:2px 0 8px;z-index:1;}
.hg-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font:inherit;font-size:12px;}
.hg-body{container-type:inline-size;}
.hg-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px 8px;}
@container (max-width:640px){.hg-grid{grid-template-columns:repeat(4,minmax(0,1fr));}}
@container (max-width:460px){.hg-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}
@container (max-width:300px){.hg-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
.hg-card{appearance:none;border:0;background:none;padding:0;text-align:left;cursor:pointer;color:inherit;font:inherit;display:flex;flex-direction:column;gap:5px;min-width:0;}
.hg-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:8px;}
.hg-cover{aspect-ratio:3/4;width:100%;border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);position:relative;}
.hg-cover img,.hg-feature-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.hg-cover-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.45;}
.hg-card:hover .hg-cover{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);}
.hg-name{font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.hg-sub{font-size:11px;color:var(--dsw-alias-label-secondary);}
.hg-muted{color:var(--dsw-alias-label-secondary);font-size:12px;padding:14px 2px;}
.hg-empty{padding:28px 8px;text-align:center;color:var(--dsw-alias-label-secondary);}
.hg-player{display:flex;flex-direction:column;gap:10px;}
.hg-stage{position:relative;border-radius:10px;overflow:hidden;background:#0b0b0d;aspect-ratio:9/16;max-height:62vh;max-width:100%;margin:0 auto;display:flex;align-items:center;justify-content:center;}
.hg-stage video{height:100%;width:auto;max-width:100%;display:block;background:#000;}
.hg-veil{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;text-align:center;padding:16px;font-size:12px;background:rgba(0,0,0,.45);}
.hg-veil .hg-btn{color:#fff;background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);}
.hg-resume{position:absolute;left:8px;right:8px;bottom:8px;display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;}
.hg-resume span{flex:1;min-width:0;}
.hg-resume .hg-pick{color:#fff;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3);}
.hg-resume .hg-dismiss{color:#fff;}
.hg-idle{display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;text-align:center;margin-bottom:10px;}
.hg-idle-text{color:var(--dsw-alias-label-secondary);font-size:12px;}
.hg-idle-pick{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:999px;padding:7px 14px;font:inherit;font-size:12px;cursor:pointer;}
.hg-idle-pick:hover{border-color:var(--dsw-alias-brand-primary);}
.hg-feature{margin-bottom:14px;}
.hg-feature-head{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 6px;}
.hg-feature-card{display:flex;gap:12px;width:100%;text-align:left;appearance:none;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:10px;color:inherit;font:inherit;cursor:pointer;}
.hg-feature-card:hover{border-color:var(--dsw-alias-brand-primary);}
.hg-feature-cover{position:relative;flex:none;width:84px;aspect-ratio:3/4;border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;}
.hg-feature-cover img{width:100%;height:100%;object-fit:cover;}
.hg-feature-copy{display:flex;flex-direction:column;gap:6px;min-width:0;}
.hg-feature-copy b{font-size:14px;line-height:1.35;}
.hg-feature-desc{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.hg-feature-play{align-self:flex-start;font-size:11px;padding:5px 10px;border-radius:999px;line-height:1.2;}
.hg-history{margin-bottom:12px;}
.hg-history-head{font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 0 6px;}
.hg-history-row{display:flex;align-items:center;gap:4px;}
.hg-history-main{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;appearance:none;border:0;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;padding:4px 6px;border-radius:6px;cursor:pointer;}
.hg-history-main:hover{background:var(--dsw-alias-bg-layer-2);}
.hg-history-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hg-history-sub{color:var(--dsw-alias-label-secondary);font-size:11px;flex:none;font-variant-numeric:tabular-nums;}
.hg-history-row .hg-dismiss{color:var(--dsw-alias-label-secondary);}
.hg-veil .hg-note{color:rgba(255,255,255,.75);max-width:240px;}
.hg-veil.notice{background:rgba(0,0,0,.6);font-size:13px;line-height:1.5;}
.hg-big{font-size:30px;font-weight:600;color:#fff;}
.hg-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.hg-progress{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.hg-bar{flex:1;height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;}
.hg-bar i{display:block;height:100%;background:var(--dsw-alias-brand-primary);}
.hg-pills{display:flex;gap:6px;flex-wrap:wrap;}
.hg-pill{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:4px 9px;font:inherit;font-size:11px;cursor:pointer;}
.hg-pill[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.hg-episodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px;max-height:200px;overflow:auto;padding-right:2px;}
.hg-ep{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:7px 0;font:inherit;font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums;}
.hg-ep[aria-current="true"]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;}
.hg-note{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);}
.hg-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;}

.hg-head .hg-btn{display:inline-flex;align-items:center;gap:5px;}
.hg-btn.active{border-color:var(--dsw-alias-label-secondary);}
.hg-count{min-width:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10px;line-height:16px;text-align:center;color:var(--dsw-alias-label-secondary);}
.hg-icon-btn{appearance:none;border:0;background:none;color:var(--dsw-alias-label-primary);width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;}
.hg-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.hg-title-wrap{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.hg-title-sub{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.hg-history{margin-bottom:12px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);max-height:260px;overflow:auto;}
.hg-history-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-secondary);margin:0 2px 4px 6px;}
.hg-dismiss{appearance:none;border:0;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:3px 6px;border-radius:6px;}
.hg-dismiss:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);}
.hg-feature-play{display:inline-flex;align-items:center;gap:4px;}
.hg-player{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;}
.hg-stage{position:relative;border-radius:12px;overflow:hidden;background:#000;width:100%;max-width:min(100%,calc(66vh * var(--hg-aspect,0.5625)));margin:0 auto;display:flex;align-items:center;justify-content:center;}
.hg-stage:fullscreen{max-width:none;border-radius:0;aspect-ratio:auto;}
.hg-stage video{width:100%;height:100%;object-fit:contain;display:block;background:#000;cursor:pointer;}
.hg-overlay{position:absolute;inset:0;pointer-events:none;}
.hg-overlay>*{pointer-events:auto;}
.hg-center-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:60px;height:60px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(4px);transition:opacity .2s;}
.hg-overlay.playing .hg-center-play{opacity:0;pointer-events:none;}
.hg-bottom{position:absolute;left:0;right:0;bottom:0;padding:22px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.7));transition:opacity .2s;display:flex;flex-direction:column;gap:4px;}
.hg-overlay.playing .hg-bottom{opacity:0;}
.hg-stage:hover .hg-overlay.playing .hg-bottom,.hg-overlay.playing .hg-bottom:focus-within{opacity:1;}
.hg-bottom-row{display:flex;align-items:center;gap:2px;color:#fff;}
.hg-ctl{appearance:none;border:0;background:none;color:#fff;height:28px;min-width:28px;padding:0 6px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font:inherit;font-size:11px;}
.hg-ctl:hover{background:rgba(255,255,255,.16);}
.hg-ctl[disabled]{opacity:.4;cursor:default;}
.hg-ctl.hg-rate{min-width:auto;padding:0 4px;font-variant-numeric:tabular-nums;background:rgba(0,0,0,.3);}
.hg-ctl.hg-rate option{color:#111;background:#fff;}
/* The volume level, shown on the picture for a moment after a wheel turn. */
.hg-vol{position:absolute;left:50%;top:14%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font-size:12px;pointer-events:none;z-index:3;}
.hg-vol-bar{width:76px;height:4px;border-radius:999px;background:rgba(255,255,255,.3);overflow:hidden;}
.hg-vol-bar span{display:block;height:100%;background:#fff;}
.hg-vol-num{font-variant-numeric:tabular-nums;min-width:34px;text-align:right;}
.hg-time{font-size:11px;font-variant-numeric:tabular-nums;opacity:.9;margin-left:4px;white-space:nowrap;}
.hg-spacer{flex:1;}
.hg-seek{-webkit-appearance:none;appearance:none;width:100%;height:14px;background:transparent;cursor:pointer;margin:0;}
.hg-seek::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:linear-gradient(to right,#fff var(--hg-fill,0%),rgba(255,255,255,.3) var(--hg-fill,0%));}
.hg-seek::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;margin-top:-4.5px;opacity:0;transition:opacity .15s;}
.hg-seek:hover::-webkit-slider-thumb,.hg-seek:focus::-webkit-slider-thumb{opacity:1;}
.hg-spinner{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:hg-spin .8s linear infinite;}
@keyframes hg-spin{to{transform:rotate(360deg)}}
.hg-section{display:flex;flex-direction:column;gap:8px;}
.hg-section-head{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;}
.hg-section-head .hg-sub{font-weight:400;}
.hg-mini{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:none;color:var(--dsw-alias-label-primary);border-radius:999px;padding:3px 9px;font:inherit;font-size:11px;font-weight:400;cursor:pointer;}
.hg-mini:hover{background:var(--dsw-alias-bg-layer-2);}
.hg-mini[disabled]{opacity:.4;cursor:default;}
.hg-chunks{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;}
.hg-chunks::-webkit-scrollbar{display:none;}
.hg-chunk{appearance:none;border:0;background:none;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:4px 8px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;}
.hg-chunk[aria-selected="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;}
.hg-episodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;max-height:none;overflow:visible;}
.hg-ep{height:34px;padding:0;border-color:transparent;background:var(--dsw-alias-bg-layer-1);}
.hg-ep:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);}
.hg-ep[aria-current="true"]{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:600;}
.hg-desc{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin-bottom:12px;}

.hg-foot-action{appearance:none;border:0;background:none;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;width:100%;}
.hg-foot-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.hg-foot-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.hg-foot-action .hg-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

.hg-chip{appearance:none;display:flex;align-items:center;gap:6px;margin:0 auto 6px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;}
.hg-chip:hover{color:var(--dsw-alias-label-primary);}
.hg-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.hg-prompt{display:flex;align-items:center;gap:6px;margin:0 auto 6px;padding:4px 6px 4px 10px;width:fit-content;max-width:100%;justify-content:center;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-primary);line-height:1.35;}
.hg-prompt-body{min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;}
.hg-prompt-title{font-weight:500;white-space:nowrap;font-size:12px;}
.hg-prompt-hint{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;}
.hg-prompt .hg-picks{margin:0;}
.hg-prompt .hg-pick{padding:2px 8px;font-size:11px;max-width:104px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;}
.hg-prompt .hg-btn.primary{padding:4px 10px;font-size:11px;border-radius:6px;}
.hg-prompt-actions{display:flex;align-items:center;gap:2px;flex:none;}
.hg-prompt .hg-dismiss{appearance:none;border:0;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px;flex:none;}
.hg-prompt .hg-dismiss:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);}

.hg-picks{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}
.hg-prompt .hg-pick{appearance:none;display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;cursor:pointer;}
.hg-prompt .hg-pick:hover{border-color:var(--dsw-alias-brand-primary);}
.hg-prompt .hg-pick.more{color:var(--dsw-alias-label-secondary);}
@keyframes hg-pulse{0%,100%{opacity:1}50%{opacity:.25}}
`

    /** Decorative mark shared by the tab, the button and the guide. */
    /** Small line icons for the player chrome. */
    function Icon({ name, size = 16 }) {
      const paths = {
        play: 'M8 5.5v13l11-6.5z',
        pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
        next: 'M6 5.5v13l9-6.5zM16 5h2.5v14H16z',
        back: 'M15 5l-7 7 7 7',
        volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M17.8 6.5a7.5 7.5 0 010 11',
        muted: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
        fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
        history: 'M4 12a8 8 0 102.3-5.6M4 4v4h4M12 8v4.5l3 2',
        // Two frames: the one inside is the floating picture.
        pip: 'M3 5h18v14H3zM12 11h6v5h-6z',
        external: 'M14 4h6v6M20 4l-8 8M18 14v5H5V6h5',
      }
      const filled = name === 'play' || name === 'pause' || name === 'next'
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, fill: filled ? 'currentColor' : 'none', stroke: filled ? 'none' : 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', style: { flex: 'none' } },
        h('path', { d: paths[name] ?? '' }),
      )
    }

    function Mark({ size = 16, tone = 'red' }) {
      const yellow = tone === 'yellow'
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true, style: { flex: 'none', display: 'block' } },
        h('rect', { x: 4, y: 6, width: 36, height: 52, rx: 10, fill: yellow ? '#f0b90b' : '#e0323f' }),
        h('circle', { cx: 44, cy: 42, r: 16, fill: '#fff' }),
        h('path', { d: 'M40 34.5v15a1.6 1.6 0 0 0 2.45 1.36l11.6-7.5a1.6 1.6 0 0 0 0-2.72l-11.6-7.5A1.6 1.6 0 0 0 40 34.5Z', fill: yellow ? '#d99a06' : '#c61d4b' }),
        h('path', { d: 'M12 33h12', stroke: '#fff', strokeOpacity: 0.5, strokeWidth: 3, strokeLinecap: 'round' }),
      )
    }

    /**
     * Load one vendored player library. HLS is MPEG-TS demuxed in JavaScript
     * and fed to a MediaSource (the WebCodecs path survives HEVC); DASH uses
     * dash.js, which is a module bundle. The `<script>` form has no MIME-type
     * gate, so the DSH shell's CSP does not need a blob: source.
     */
    const vendorLoads = new Map()
    function loadVendor(file, globalName = 'mpegts') {
      if (vendorLoads.has(file)) return vendorLoads.get(file)
      const loading = new Promise((resolve, reject) => {
        if (file.endsWith('.mjs')) {
          const url = new URL(`${API}/vendor/${file}`, document.baseURI ?? window.location.href).href
          import(/* @vite-ignore */ url).then((module) => resolve(module.modern ?? module), reject)
          return
        }
        const script = document.createElement('script')
        script.src = `${API}/vendor/${file}`
        // UMD bundles register with an AMD loader instead of a global when the
        // page has one; hide it for this script so the global is always set.
        const amd = typeof window.define === 'function' && window.define.amd ? window.define : undefined
        if (amd) window.define = undefined
        const restore = () => {
          if (amd) window.define = amd
        }
        // Classic scripts are executed whatever MIME type the shell serves.
        script.onload = () => {
          restore()
          const value = window[globalName]
          if (value) resolve(value)
          else reject(new Error(`${file} did not define ${globalName}`))
        }
        script.onerror = () => {
          restore()
          vendorLoads.delete(file)
          reject(new Error(`failed to load ${file}`))
        }
        document.head.append(script)
      })
      vendorLoads.set(file, loading)
      return loading
    }

    /** Decode one JSON route response, turning a Host failure into an Error. */
    async function callApi(path, init) {
      const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!response.ok || body?.ok === false) {
        const error = new Error(body?.error?.message ?? `HTTP ${response.status}`)
        error.code = body?.error?.code
        throw error
      }
      return body
    }

    /**
     * 片源：hongguo = 主用（openhongguo SDK），hghub = 备用（HGhub 信封接口）。
     * 选择记在 localStorage，刷新后保持；两个片源的列表和观看历史互不影响。
     */
    let preferredSource = 'hongguo'
    try {
      if (localStorage.getItem('hg.source') === 'hghub') preferredSource = 'hghub'
    } catch {
      // 隐私模式下读不到 localStorage，用默认片源即可。
    }
    function setPreferredSource(source) {
      preferredSource = source === 'hghub' ? 'hghub' : 'hongguo'
      try {
        localStorage.setItem('hg.source', preferredSource)
      } catch {
        // 存不下来只影响下次启动的默认值。
      }
    }
    function sourceQuery(source = preferredSource) {
      return `source=${encodeURIComponent(source)}`
    }

    /** Last drama list, so the door prompt can name one without a round trip. */
    let feedCache = { at: 0, items: [], source: '' }

    /** The Host's drama list, cached for a minute per source. */
    async function fetchFeed(force) {
      const source = preferredSource
      if (!force && feedCache.items.length > 0 && feedCache.source === source && Date.now() - feedCache.at < 60_000) return feedCache.items
      const body = await callApi(`/feed?${sourceQuery(source)}`)
      feedCache = { at: Date.now(), items: body.items ?? [], source }
      return feedCache.items
    }

    /** Episode list for one drama; failures on a rotated device are retried once. */
    async function fetchSeries(seriesId, source = preferredSource) {
      const query = `/series?${sourceQuery(source)}&id=${encodeURIComponent(seriesId)}`
      try {
        const body = await callApi(query)
        return (body.episodes ?? []).filter((episode) => episode.playable !== false)
      } catch (error) {
        if (error.code !== 'ANONYMOUS_LIMITED') throw error
        const body = await callApi(query)
        return (body.episodes ?? []).filter((episode) => episode.playable !== false)
      }
    }

    /** A play model; a limited anonymous device is rotated by the Host and retried here. */
    async function fetchPlayback(episodeId, seriesId, source = preferredSource) {
      const query = `/play?${sourceQuery(source)}&episode=${encodeURIComponent(episodeId)}${seriesId ? '&series=' + encodeURIComponent(seriesId) : ''}`
      try {
        return await callApi(query)
      } catch (error) {
        if (error.code !== 'ANONYMOUS_LIMITED') throw error
        return await callApi(query)
      }
    }

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
      const total = Math.floor(seconds)
      const mm = String(Math.floor(total / 60)).padStart(2, '0')
      const ss = String(total % 60).padStart(2, '0')
      return `${mm}:${ss}`
    }

    // ---- playback history -------------------------------------------------
    // Two records live in this browser's localStorage: one "continue watching"
    // slot, and a short list of recently watched dramas. They are the only
    // persisted player state; everything else is derived from the Host.
    const HISTORY_KEY = 'dsh-hongguo.watch-history.v1'
    /** 每个片源一份历史：两个片源的“看到第几集”完全隔离。 */
    function historyKey(source = preferredSource) {
      return `${HISTORY_KEY}.${source === 'hghub' ? 'hghub' : 'hongguo'}`
    }
    // 老版本只有一把不带片源后缀的 key；第一次运行时搬到默认片源名下。
    try {
      const legacy = localStorage.getItem(HISTORY_KEY)
      if (legacy && !localStorage.getItem(historyKey('hongguo'))) localStorage.setItem(historyKey('hongguo'), legacy)
    } catch {
      // 读不到存储就不迁移。
    }
    /** A finished episode restarts from zero instead of resuming near its end. */
    const END_MARGIN = 5

    function readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key)
        return raw ? JSON.parse(raw) : fallback
      } catch {
        return fallback
      }
    }

    function writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (e2) {
        // A full or disabled storage loses only history.
      }
    }

    /** Read one session's progress for one drama, or undefined. */
    function progressOf(seriesId, episodeId, source = preferredSource) {
      const history = readJson(historyKey(source), { series: {} })
      const record = history.series?.[seriesId]
      if (!record || record.episodeId !== episodeId) return undefined
      return record.position
    }

    /**
     * Persist the position in one episode and move the drama to the top. A
     * drama just opened may have no episode yet; it still belongs in the list,
     * with no episode so the player starts it from the first one.
     */
    function saveProgress(series, episode, position, source = preferredSource) {
      if (!series?.id) return
      const at = Number.isFinite(position) && position > 0 ? position : 0
      if (at > 0 && !episode?.id) return
      const history = readJson(historyKey(source), { series: {} })
      const records = history.series ?? {}
      records[series.id] = { seriesId: series.id, title: series.title, episodeId: episode?.id, number: episode?.number, position: at, at: Date.now() }
      // Keep the list short: the most recent twelve dramas.
      const trimmed = Object.fromEntries(
        Object.values(records)
          .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
          .slice(0, 12)
          .map((record) => [record.seriesId, record]),
      )
      writeJson(historyKey(source), { series: trimmed })
    }

    /** Recently watched dramas, newest first, straight from storage. */
    function listHistory(source = preferredSource) {
      const stored = readJson(historyKey(source), { series: {} })
      return Object.values(stored.series ?? {}).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    }

    // ---- player settings ---------------------------------------------------
    // Volume is the one setting worth carrying between pages, and the standalone
    // window writes the same key, so both halves agree on how loud it is.
    const VOLUME_KEY = `${HISTORY_KEY}.volume`

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

    /**
     * The Sidebar tab: the player. The tab hook is read in this small wrapper
     * so a bad parameter can only reach the player it opens, and the wrapper
     * itself stays a plain, dependable cell.
     */
    function PlayerBody({ useTabInfo }) {
      let requested
      try {
        const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined
        requested = info?.tab?.navigation?.params?.series
      } catch {
        requested = undefined
      }
      return h(Area, { name: 'pane', children: h(DramaPlayer, { requested }) })
    }

    /**
     * One poster. The feed's covers are HEIC, which Chromium cannot decode, so
     * a quiet mark stands in until (and unless) an image actually loads.
     */
    function Cover({ src, alt, big }) {
      const [broken, setBroken] = React.useState(false)
      const glyph = h(Mark, { size: big ? 34 : 22 })
      if (!src || broken) return h('span', { className: 'hg-cover-fallback' }, glyph)
      // The CDN publishes HEIC; the Host converts each poster to JPEG once.
      const proxied = `${API}/cover?u=${encodeURIComponent(src)}`
      return h('img', { src: proxied, alt, loading: 'lazy', onError: () => setBroken(true) })
    }

    /**
     * The player: a drama list, then the player for the picked drama. Every
     * instance owns its own state; `compact` hides the header for the dock.
     */
    function DramaPlayer({ requested, compact }) {
      const t = useTranslate()
      /** 当前片源：'hongguo' 主用 / 'hghub' 备用。切换时列表和历史一起换。 */
      const [source, setSource] = React.useState(preferredSource)
      /** Results of the server-side search for the current query and source. */
      const [found, setFound] = React.useState({ status: 'idle', keyword: '', items: [], cursor: '', hasMore: false, loadingMore: false, error: undefined })
      const [searchTick, setSearchTick] = React.useState(0)
      const [feed, setFeed] = React.useState({ status: 'loading', items: [], error: undefined })
      const [query, setQuery] = React.useState('')
      const [series, setSeries] = React.useState(undefined)
      const [seriesInfo, setSeriesInfo] = React.useState({ status: 'idle', episodes: [], error: undefined })
      const [current, setCurrent] = React.useState(undefined)
      const [playback, setPlayback] = React.useState({ status: 'idle', data: undefined, error: undefined })
      const [quality, setQuality] = React.useState(undefined)
      const [muted, setMuted] = React.useState(true)
      /** Volume survives a reload and is shared with the standalone window. */
      const [volume, setVolume] = React.useState(readVolume)
      /** The level drawn on the picture for a moment after a wheel turn. */
      const [volumeNotice, setVolumeNotice] = React.useState(undefined)
      const volumeRef = React.useRef(volume)
      const volumeTimer = React.useRef(undefined)
      const [progress, setProgress] = React.useState({ time: 0, duration: 0 })
      const [playing, setPlaying] = React.useState(false)
      const [rate, setRate] = React.useState(1)
      const rateRef = React.useRef(1)
      const [showHistory, setShowHistory] = React.useState(false)
      /** Which page of twelve the list shows; "换一批" steps through them. */
      const [page, setPage] = React.useState(0)
      const [chunk, setChunk] = React.useState(0)
      const stageRef = React.useRef(null)
      /** Width / height of the current video; portrait until metadata says otherwise. */
      const [aspect, setAspect] = React.useState(9 / 16)
      const [retryKey, setRetryKey] = React.useState(0)
      /** Paused because the task finished; the element itself is untouched. */
      const [pausedByFinish, setPausedByFinish] = React.useState(false)
      const [watched, setWatched] = React.useState(() => listHistory(preferredSource))
      const [resumeNotice, setResumeNotice] = React.useState(undefined)
      const videoRef = React.useRef(null)
      // The position this episode should start from, and whether it is a
      // continuation (shown as a notice until the first seek settles).
      const resumeRef = React.useRef({ position: 0, resumed: false })
      const lastSavedRef = React.useRef(0)

      const loadFeed = React.useCallback(() => {
        setFeed((previous) => ({ ...previous, status: 'loading', error: undefined }))
        callApi(`/feed?${sourceQuery(source)}`)
          .then((body) => setFeed({ status: 'ready', items: body.items ?? [], error: undefined }))
          .catch((error) => setFeed({ status: 'error', items: [], error }))
      }, [source])

      React.useEffect(loadFeed, [loadFeed])

      // Enter one drama: load its episodes, then continue the episode the
      // history left unfinished (or start the first one).
      const openSeries = React.useCallback((item) => {
        const known = listHistory(source).find((row) => row.seriesId === item.id)
        saveProgress(item, { id: known?.episodeId, number: known?.number }, known ? known.position : 0, source)
        setWatched(listHistory(source))
        setSeries(item)
        setCurrent(undefined)
        setPlayback({ status: 'idle', data: undefined, error: undefined })
        setSeriesInfo({ status: 'loading', episodes: [], error: undefined })
        fetchSeries(item.id, source)
          .then((episodes) => {
            setSeriesInfo({ status: 'ready', episodes, error: undefined })
            const record = listHistory(source).find((row) => row.seriesId === item.id)
            const saved = record ? episodes.find((episode) => episode.id === record.episodeId) : undefined
            const target = saved ?? episodes[0]
            if (!target) return
            const position = record ? Math.max(0, Number(record.position) || 0) : 0
            reportActivity(item, target)
            playEpisodeRef.current(target, position)
          })
          .catch((error) => setSeriesInfo({ status: 'error', episodes: [], error }))
      }, [source])

      const requestedId = typeof requested?.id === 'string' ? requested.id : undefined
      const openSeriesRef = React.useRef(openSeries)
      openSeriesRef.current = openSeries
      React.useEffect(() => {
        if (!requestedId) return
        openSeriesRef.current({ id: requestedId, title: typeof requested?.title === 'string' ? requested.title : undefined })
      }, [requestedId])

      // A drama named by the navigation params (the running prompt's quick pick)
      // opens directly once its list request has settled; a later navigation
      // with the same revision is ignored.
      // Load one episode's play model and start it, optionally at a position
      // remembered from an earlier viewing.
      const playEpisode = React.useCallback(
        (episode, resumeAt = 0) => {
          const record = listHistory(source).find((row) => row.seriesId === series?.id)
          const position = episode.id === record?.episodeId ? Math.max(resumeAt, Number(record.position) || 0) : resumeAt
          resumeRef.current = { position: Math.max(0, Number(position) || 0), resumed: position > 0 }
          lastSavedRef.current = 0
          setCurrent({ id: episode.id, number: episode.number })
          setPlayback({ status: 'loading', data: undefined, error: undefined })
          setProgress({ time: 0, duration: 0 })
          fetchPlayback(episode.id, series?.id, source)
            .then((data) => {
              setPlayback({ status: 'ready', data, error: undefined })
              setQuality(undefined)
            })
            .catch((error) => setPlayback({ status: 'error', data: undefined, error }))
        },
        [series, source],
      )
      // Open routes through the current callback without re-creating it.
      /** Forget one drama's history (list row's remove control). */
      const forget = React.useCallback((seriesId) => {
        const next = Object.fromEntries(listHistory(source).filter((row) => row.seriesId !== seriesId).map((row) => [row.seriesId, row]))
        writeJson(historyKey(source), { series: next })
        setWatched(listHistory(source))
      }, [source])

      /** Continue exactly where the history left off. */
      const continueWatching = React.useCallback(
        (row) => {
          fetchSeries(row.seriesId, source)
            .then((episodes) => {
              const episode = episodes.find((item) => item.id === row.episodeId) ?? episodes[0]
              if (episode) playEpisode(episode, row.episodeId === episode.id ? row.position : 0)
            })
            .catch(() => {})
        },
        [playEpisode, source],
      )

      /** 图标切换片源：主用 ↔ 备用；列表、分集、历史都跟着换。 */
      const toggleSource = React.useCallback(() => {
        const next = source === 'hghub' ? 'hongguo' : 'hghub'
        setPreferredSource(next)
        setSource(next)
        setSeries(undefined)
        setCurrent(undefined)
        setPlayback({ status: 'idle', data: undefined, error: undefined })
        setSeriesInfo({ status: 'idle', episodes: [], error: undefined })
        setShowHistory(false)
        setQuery('')
        setPage(0)
        setChunk(0)
        setFeed({ status: 'loading', items: [], error: undefined })
        setWatched(listHistory(next))
      }, [source])

      const playEpisodeRef = React.useRef(playEpisode)
      React.useEffect(() => {
        playEpisodeRef.current = playEpisode
      }, [playEpisode])

      // Step within the loaded season by number.
      const index = current ? seriesInfo.episodes.findIndex((episode) => episode.id === current.id) : -1
      const previousEpisode = index > 0 ? seriesInfo.episodes[index - 1] : undefined
      const nextEpisode = index >= 0 ? seriesInfo.episodes[index + 1] : undefined

      React.useEffect(() => {
        if (index >= 0) setChunk(Math.floor(index / 50))
      }, [index])

      const activeSource = React.useMemo(() => {
        const data = playback.data
        if (!data?.sources?.length) return undefined
        return data.sources.find((source) => source.definition === quality) ?? data.sources[0]
      }, [playback.data, quality])

      // Media failures are reported by whichever player is attached.
      const failOnMedia = React.useCallback(() => {
        setPlayback((previous) =>
          previous.status === 'ready'
            ? { status: 'error', data: previous.data, error: { message: '播放失败' } }
            : previous,
        )
      }, [])

      // The element reports a decoding failure through its own `error`; an
      // attached MediaSource has signalled the same through mpegts/dash.
      React.useEffect(() => {
        const video = videoRef.current
        if (!video || !activeSource) return undefined
        const onError = () => failOnMedia()
        video.addEventListener('error', onError)
        return () => video.removeEventListener('error', onError)
      }, [activeSource, failOnMedia])

      // A new source replaces the element: re-apply mute, volume and rate, and
      // hand HLS/DASH to an MSE pipeline instead of the src= path.
      React.useEffect(() => {
        const video = videoRef.current
        if (!video) return
        video.muted = muted
        video.volume = volume
        video.playbackRate = rateRef.current
        const attempt = video.play()
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {})
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [activeSource, retryKey])

      React.useEffect(() => {
        const video = videoRef.current
        if (!video) return
        video.muted = muted
        video.volume = volume
        volumeRef.current = volume
      }, [muted, volume])

      React.useEffect(() => () => clearTimeout(volumeTimer.current), [])

      // The wheel over the picture sets the volume, and the value is remembered
      // across pages: how loud the drama is, is a preference, not episode state.
      // The level also shows on the picture while it settles, so a wheel turn is
      // never silent feedback.
      React.useEffect(() => {
        const node = stageRef.current
        if (!node) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          adjustVolume(event.deltaY < 0 ? 0.05 : -0.05)
        }
        node.addEventListener('wheel', onWheel, { passive: false })
        return () => node.removeEventListener('wheel', onWheel)
        // The stage only exists once a source is ready, so re-run when it appears.
      }, [activeSource])

      React.useEffect(() => {
        const video = videoRef.current
        if (!video || !activeSource || activeSource.kind === 'file') return undefined
        let player
        let disposed = false
        const attach = activeSource.kind === 'hlsjs'
          ? loadVendor('hls.light.min.js', 'Hls').then((hlsModule) => {
              if (disposed) return
              const Hls = hlsModule?.default ?? hlsModule
              if (!Hls?.isSupported?.()) throw new Error(t('player.noMse'))
              player = new Hls({ enableWorker: false, lowLatencyMode: false })
              player.on(Hls.Events?.ERROR ?? 'hlsError', (event, data) => {
                if (data?.fatal) failOnMedia()
              })
              player.loadSource(activeSource.url)
              player.attachMedia(video)
            })
          : activeSource.kind === 'hls'
          ? loadVendor('mpegts.js').then((mpegts) => {
              if (disposed) return
              const engine = mpegts.default ?? mpegts
              if (!engine?.isSupported?.()) throw new Error(t('player.noMse'))
              player = engine.createPlayer({
                type: 'mse',
                isLive: false,
                url: activeSource.url,
                hasAudioTrack: true,
              }, { autoCleanupSourceBuffer: true, lazyLoad: true })
              player.attachMediaElement(video)
              player.on(engine.Events?.ERROR ?? 'error', failOnMedia)
              player.load()
            })
          : loadVendor('dash.all.min.mjs').then((dash) => {
              if (disposed) return
              const engine = dash.MediaPlayer ?? dash.default
              if (!engine?.isSupported?.()) throw new Error(t('player.noMse'))
              player = engine().create()
              player.initialize(video, activeSource.url, false)
              player.on(player.constructor.events?.ERROR ?? 'error', failOnMedia)
            })
        attach.catch((error) => {
          if (disposed) return
          console.error('[hongguo] player failed', error)
          failOnMedia()
        })
        return () => {
          disposed = true
          try {
            if (activeSource.kind === 'hls' || activeSource.kind === 'hlsjs') player?.destroy()
            else player?.reset()
          } catch {
            // A half-built player has nothing to release.
          }
        }
      }, [activeSource, retryKey, t])


      // Publish this player's pause control while it holds a source: the task
      // finishing pauses every place a drama can be playing.
      React.useEffect(() => {
        if (playback.status !== 'ready' || !activeSource) return undefined
        const control = {
          mine: {},
          pause: () => {
            const video = videoRef.current
            try {
              video?.pause()
            } catch {
              // Pausing an element without a source is harmless.
            }
            setPausedByFinish(true)
          },
        }
        players.add(control)
        audioOwner.current = control.mine
        return () => {
          players.delete(control)
          if (audioOwner.current === control.mine) audioOwner.current = null
        }
      }, [playback.status, activeSource])

      // Switching to a locally rewritten copy keeps the element playing, so it
      // clears only the media-error state, not the "task finished" notice.
      React.useEffect(() => {
        setResumeNotice(undefined)
      }, [activeSource])

      // The list's "recent" section follows the stored history on every episode.
      React.useEffect(() => {
        if (current) setWatched(listHistory(source))
      }, [current])

      /**
       * One episode to play now, biased toward the part of the season not
       * watched: a drama never opened starts at episode one, a drama in
       * progress picks somewhere after the last episode's place.
       */
      const pickRandom = React.useCallback(
        (episodes) => {
          const list = (episodes ?? []).filter((episode) => episode && !episode.untitled)
          if (list.length === 0) return
          const record = watched.find((row) => row.seriesId === series?.id)
          const watchedAt = record ? list.findIndex((episode) => episode.id === record.episodeId) : -1
          if (watchedAt < 0) return playEpisode(list[0])
          const from = Math.min(watchedAt + 1, list.length - 1)
          const range = list.length - from
          playEpisode(list[from + (range > 1 ? Math.floor(Math.random() * range) : 0)])
        },
        [watched, series, playEpisode],
      )

      // What to watch next: hot dramas the user has not opened, most recently
      // listed first so a seen one drops out. Falls back to anything unwatched.
      const recommendation = React.useMemo(() => {
        if (feed.items.length === 0) return undefined
        const seen = new Set(watched.map((row) => row.seriesId))
        const fresh = feed.items.filter((item) => item && !seen.has(item.id))
        return fresh[0] ?? feed.items[0]
      }, [feed.items, watched])

      // Search asks the source itself; the cached list only holds a few dozen
      // dramas. Typing waits for a pause, Enter searches at once, and a
      // reply for an older query is dropped.
      const keyword = query.trim()
      /** One page of server-side search; an empty cursor asks for the first. */
      const searchPage = (text, cursor) =>
        callApi(`/search?${sourceQuery(source)}&q=${encodeURIComponent(text)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      React.useEffect(() => {
        if (!keyword) {
          setFound({ status: 'idle', keyword: '', items: [], cursor: '', hasMore: false, loadingMore: false, error: undefined })
          return undefined
        }
        let stale = false
        setFound((previous) => ({ ...previous, status: 'loading', keyword }))
        const timer = setTimeout(async () => {
          // A first page carries only a handful of rows, so walk the cursor
          // until a screenful is on hand; the rest loads on "换一批".
          const items = []
          let cursor = ''
          let hasMore = true
          try {
            for (let attempt = 0; attempt < 3 && hasMore; attempt += 1) {
              const body = await searchPage(keyword, cursor)
              const seen = new Set(items.map((item) => item.id))
              for (const item of body.items ?? []) {
                if (!item?.id || seen.has(item.id)) continue
                seen.add(item.id)
                items.push(item)
              }
              cursor = body.cursor ?? ''
              hasMore = body.hasMore === true && cursor !== ''
              if (items.length >= 12) break
            }
          } catch (error) {
            if (!stale) setFound({ status: 'error', keyword, items: [], cursor: '', hasMore: false, loadingMore: false, error })
            return
          }
          if (!stale) setFound({ status: 'ready', keyword, items, cursor, hasMore, loadingMore: false, error: undefined })
        }, searchTick > 0 ? 0 : 400)
        return () => {
          stale = true
          clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [keyword, source, searchTick])

      const PAGE = 12
      // The featured drama is already on screen; the grid shows the others.
      const pool = keyword
        ? found.items
        : feed.items.filter((item) => item && item.id !== recommendation?.id)
      const pageCount = Math.max(1, Math.ceil(pool.length / PAGE))
      const shownPage = page % pageCount
      const visible = pool.slice(shownPage * PAGE, shownPage * PAGE + PAGE)
      /**
       * Append one more page of search results. A page holds only a handful of
       * rows and the service repeats rows across pages, so keep walking the
       * cursor until something new arrives.
       */
      const moreSearch = async () => {
        const base = found
        if (!base.hasMore || base.loadingMore || !base.cursor) return false
        setFound((previous) => ({ ...previous, loadingMore: true }))
        const seen = new Set(base.items.map((item) => item.id))
        const added = []
        let cursor = base.cursor
        let hasMore = true
        try {
          for (let attempt = 0; attempt < 2 && hasMore; attempt += 1) {
            const body = await searchPage(base.keyword, cursor)
            for (const item of body.items ?? []) {
              if (!item?.id || seen.has(item.id)) continue
              seen.add(item.id)
              added.push(item)
            }
            cursor = body.cursor ?? ''
            hasMore = body.hasMore === true && cursor !== ''
            if (added.length > 0) break
          }
        } catch {
          setFound((previous) => ({ ...previous, loadingMore: false }))
          return false
        }
        // The service repeats rows on later pages; a page with nothing new
        // means this query is exhausted, whatever has_more claims.
        if (added.length === 0) hasMore = false
        setFound((previous) =>
          previous.keyword !== base.keyword
            ? previous
            : { ...previous, items: [...previous.items, ...added], cursor, hasMore, loadingMore: false },
        )
        return added.length > 0
      }

      /** Next twelve; after the last page, fetch a fresh list and start over. */
      const nextBatch = () => {
        if (shownPage + 1 < pageCount) setPage(shownPage + 1)
        else if (keyword) {
          // Results for an older query are on their way out; ignore the click.
          if (found.keyword !== keyword) return
          // Ask the service for the next page first; only wrap when it is out.
          if (!found.hasMore) {
            setPage(0)
            return
          }
          if (found.loadingMore) return
          moreSearch().then((grew) => setPage(grew ? shownPage + 1 : 0))
        } else {
          setPage(0)
          fetchFeed(true)
            .then((items) => setFeed({ status: 'ready', items, error: undefined }))
            .catch(() => {})
        }
      }
      const CHUNK = 50
      const chunkCount = Math.ceil(seriesInfo.episodes.length / CHUNK)
      const total = seriesInfo.episodes.length || series?.episodes || 0
      const setSpeed = (value) => {
        rateRef.current = value
        setRate(value)
        if (videoRef.current) videoRef.current.playbackRate = value
      }
      const togglePlay = () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) {
          setPausedByFinish(false)
          video.play().catch(() => {})
        } else video.pause()
      }
      const seekTo = (value) => {
        const video = videoRef.current
        if (video && Number.isFinite(value)) video.currentTime = value
      }
      const goFullscreen = () => {
        const stageEl = stageRef.current
        if (!stageEl) return
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
        else stageEl.requestFullscreen?.().catch(() => {})
      }
      /** Unmuting a silent player must give it something to play, not silence. */
      const toggleMute = () => {
        if (muted && volume === 0) {
          setVolume(0.5)
          writeVolume(0.5)
        }
        setMuted((value) => !value)
        // Muting is a volume change too, so it says so on the picture.
        setVolumeNotice(muted ? Math.round((volume || 0.5) * 100) : 0)
        clearTimeout(volumeTimer.current)
        volumeTimer.current = setTimeout(() => setVolumeNotice(undefined), 1100)
      }
      /** Step the volume and show it on the picture for a moment. */
      const adjustVolume = (delta) => {
        const next = Math.min(1, Math.max(0, Math.round((volumeRef.current + delta) * 100) / 100))
        volumeRef.current = next
        setVolume(next)
        writeVolume(next)
        if (next > 0) setMuted(false)
        // The notice is a percentage: the state is 0–1, the label is 0–100.
        setVolumeNotice(Math.round(next * 100))
        clearTimeout(volumeTimer.current)
        volumeTimer.current = setTimeout(() => setVolumeNotice(undefined), 1100)
      }
      const togglePip = async () => {
        const video = videoRef.current
        if (!video) return
        try {
          if (document.pictureInPictureElement) await document.exitPictureInPicture()
          else await video.requestPictureInPicture()
        } catch (error) {
          console.warn('[hongguo] picture-in-picture failed:', error?.message ?? String(error))
        }
      }
      const pipAvailable = typeof document !== 'undefined' && document.pictureInPictureEnabled === true

      const header = h(
        'div',
        { className: 'hg-head' },
        series
          ? h('button', { className: 'hg-icon-btn', type: 'button', title: t('player.back'), 'aria-label': t('player.back'), onClick: () => { setSeries(undefined); setCurrent(undefined); setPlayback({ status: 'idle' }) } }, h(Icon, { name: 'back' }))
          : h(
              'button',
              {
                className: 'hg-source',
                type: 'button',
                'aria-label': t('source.switch'),
                onClick: toggleSource,
              },
              h(Mark, { size: 18, tone: source === 'hghub' ? 'yellow' : 'red' }),
            ),
        h(
          'div',
          { className: 'hg-title-wrap' },
          h('div', { className: 'hg-title', title: series?.title ?? t('tab.title') }, series?.title ?? t('tab.title')),
          series && current && total
            ? h('div', { className: 'hg-title-sub' }, t('player.episodeOf').replace('{n}', String(current.number ?? index + 1)).replace('{total}', String(total)))
            : null,
        ),
        series
          ? null
          : h('button', {
              className: 'hg-btn',
              type: 'button',
              title: t('window.browserTip'),
              onClick: () => openStandaloneWindow(undefined, undefined, 0),
            }, t('window.browser')),
        // The same page, handed straight to the default browser instead of a
        // window this one spawns — the two are different on a desktop shell.
        series
          ? h('button', {
              className: 'hg-icon-btn',
              type: 'button',
              title: t('window.browserTip'),
              'aria-label': t('window.browserTip'),
              onClick: () => openStandaloneWindow(series, current, progress.time),
            }, h(Icon, { name: 'external' }))
          : null,
        series
          ? null
          : h(
              'button',
              {
                className: 'hg-btn' + (showHistory ? ' active' : ''),
                type: 'button',
                'aria-pressed': String(showHistory),
                onClick: () => setShowHistory((value) => !value),
              },
              h(Icon, { name: 'history' }),
              t('player.historyOpen'),
              watched.length > 0 ? h('span', { className: 'hg-count' }, String(watched.length)) : null,
            ),
        series ? null : h('button', { className: 'hg-btn', type: 'button', onClick: nextBatch, disabled: feed.status === 'loading' || Boolean(keyword && found.loadingMore) }, t('player.refresh')),
      )

      let content
      if (!series) {
        let grid
        if (keyword && found.status === 'error') grid = h(ErrorBox, { error: found.error, onRetry: () => setSearchTick((value) => value + 1) })
        else if (keyword && (found.status === 'loading' || found.keyword !== keyword)) grid = h('div', { className: 'hg-muted' }, t('player.searching'))
        else if (keyword && visible.length === 0) grid = h('div', { className: 'hg-empty' }, t('player.noResults').replace('{q}', keyword))
        else if (feed.status === 'error') grid = h(ErrorBox, { error: feed.error, onRetry: loadFeed })
        else if (feed.status === 'loading' && visible.length === 0) grid = h('div', { className: 'hg-muted' }, t('player.loading'))
        else if (visible.length === 0) grid = h('div', { className: 'hg-empty' }, t('player.noSource'))
        else
          grid = h(
            'div',
            { className: 'hg-grid' },
            visible.map((item) =>
              h(
                'button',
                { key: item.id, type: 'button', className: 'hg-card', onClick: () => openSeries(item) },
                h('span', { className: 'hg-cover' }, h(Cover, { src: item.cover, alt: item.title ?? '' })),
                h('span', { className: 'hg-name' }, item.title ?? item.id),
                item.episodes ? h('span', { className: 'hg-sub' }, t('player.episodes').replace('{count}', String(item.episodes))) : null,
              ),
            ),
          )
        const historyPanel = showHistory
          ? h(
              'div',
              { className: 'hg-history' },
              h(
                'div',
                { className: 'hg-history-head' },
                h('span', null, t('player.history')),
                h('button', { type: 'button', className: 'hg-dismiss', 'aria-label': t('player.close'), onClick: () => setShowHistory(false) }, '\u00d7'),
              ),
              watched.length === 0
                ? h('div', { className: 'hg-muted' }, t('player.historyEmpty'))
                : watched.map((row) =>
                    h(
                      'div',
                      { key: row.seriesId, className: 'hg-history-row' },
                      h(
                        'button',
                        { type: 'button', className: 'hg-history-main', onClick: () => { setShowHistory(false); continueWatching(row) } },
                        h('span', { className: 'hg-history-title' }, row.title ?? row.seriesId),
                        h(
                          'span',
                          { className: 'hg-history-sub' },
                          row.number === undefined || row.episodeId === undefined
                            ? t('player.historyNew')
                            : t('player.historyLine').replace('{n}', String(row.number)).replace('{t}', formatTime(row.position)),
                        ),
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'hg-dismiss', title: t('player.forget'), 'aria-label': t('player.forget'), onClick: () => forget(row.seriesId) },
                        '\u00d7',
                      ),
                    ),
                  ),
            )
          : null
        content = h(
          React.Fragment,
          null,
          historyPanel,
          recommendation && !query.trim()
            ? h(
                'div',
                { className: 'hg-feature' },
                h('div', { className: 'hg-feature-head' }, t('player.recommend')),
                h(
                  'button',
                  { type: 'button', className: 'hg-feature-card', onClick: () => openSeries(recommendation) },
                  h('span', { className: 'hg-feature-cover' }, h(Cover, { src: recommendation.cover, alt: recommendation.title ?? '', big: true })),
                  h(
                    'span',
                    { className: 'hg-feature-copy' },
                    h('b', null, recommendation.title ?? recommendation.id),
                    recommendation.episodes ? h('span', { className: 'hg-sub' }, t('player.episodes').replace('{count}', String(recommendation.episodes))) : null,
                    recommendation.description ? h('span', { className: 'hg-feature-desc' }, recommendation.description) : null,
                    h('span', { className: 'hg-btn primary hg-feature-play' }, h(Icon, { name: 'play', size: 12 }), t('player.watchNow')),
                  ),
                ),
              )
            : null,
          h(
            'div',
            { className: 'hg-search' },
            h('input', {
              className: 'hg-input',
              type: 'search',
              placeholder: t('player.search'),
              value: query,
              onChange: (event) => {
                setQuery(event.target.value)
                setPage(0)
                setSearchTick(0)
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) setSearchTick((value) => value + 1)
              },
              'aria-label': t('player.search'),
            }),
          ),
          grid,
        )
      } else {
        const ratio = progress.duration ? Math.min(100, (progress.time / progress.duration) * 100) : 0
        const overlay = activeSource && playback.status === 'ready'
          ? h(
              'div',
              { className: 'hg-overlay' + (playing ? ' playing' : '') },
              h(
                'button',
                { type: 'button', className: 'hg-center-play', 'aria-label': t(playing ? 'player.pause' : 'player.play'), onClick: togglePlay },
                h(Icon, { name: playing ? 'pause' : 'play', size: 26 }),
              ),
              h(
                'div',
                { className: 'hg-bottom' },
                h('input', {
                  className: 'hg-seek',
                  type: 'range',
                  min: 0,
                  max: progress.duration || 0,
                  step: 0.1,
                  value: progress.time || 0,
                  style: { '--hg-fill': ratio + '%' },
                  'aria-label': 'seek',
                  onChange: (event) => seekTo(Number(event.target.value)),
                }),
                h(
                  'div',
                  { className: 'hg-bottom-row' },
                  h('button', { type: 'button', className: 'hg-ctl', 'aria-label': t(playing ? 'player.pause' : 'player.play'), onClick: togglePlay }, h(Icon, { name: playing ? 'pause' : 'play' })),
                  h('button', { type: 'button', className: 'hg-ctl', 'aria-label': t('player.next'), disabled: !nextEpisode, onClick: () => nextEpisode && playEpisode(nextEpisode) }, h(Icon, { name: 'next' })),
                  h('span', { className: 'hg-time' }, formatTime(progress.time) + ' / ' + formatTime(progress.duration)),
                  h('span', { className: 'hg-spacer' }),
                  h(
                    'select',
                    {
                      className: 'hg-ctl hg-rate',
                      title: t('player.speed'),
                      'aria-label': t('player.speed'),
                      value: String(rate),
                      onChange: (event) => setSpeed(Number(event.target.value)),
                    },
                    SPEEDS.map((value) => h('option', { key: value, value: String(value) }, value === 1 ? '1x' : value + 'x')),
                  ),
                  h('button', { type: 'button', className: 'hg-ctl', 'aria-label': t(muted ? 'player.unmute' : 'player.mute'), title: t(muted ? 'player.unmute' : 'player.mute'), onClick: toggleMute }, h(Icon, { name: muted ? 'muted' : 'volume' })),
                  pipAvailable
                    ? h('button', { type: 'button', className: 'hg-ctl', title: t('player.pip'), 'aria-label': t('player.pip'), onClick: togglePip }, h(Icon, { name: 'pip' }))
                    : null,
                  h('button', { type: 'button', className: 'hg-ctl', 'aria-label': t('player.fullscreen'), title: t('player.fullscreen'), onClick: goFullscreen }, h(Icon, { name: 'fullscreen' })),
                ),
              ),
            )
          : null
        const stage = h(
          'div',
          {
            className: 'hg-stage' + (aspect > 1 ? ' landscape' : ''),
            ref: stageRef,
            style: { aspectRatio: String(aspect), '--hg-aspect': String(aspect) },
          },
          activeSource
            ? h('video', {
                key: activeSource.url + ':' + retryKey,
                ref: videoRef,
                src: activeSource.kind === 'file' ? activeSource.url : undefined,
                playsInline: true,
                preload: 'metadata',
                onClick: togglePlay,
                onPlay: () => setPlaying(true),
                onPause: () => setPlaying(false),
                onTimeUpdate: (event) => {
                  const video = event.currentTarget
                  setProgress({ time: video.currentTime, duration: video.duration })
                  // Persist about once per second, not on every tick.
                  if (current && Math.abs(video.currentTime - lastSavedRef.current) >= 1) {
                    lastSavedRef.current = video.currentTime
                    saveProgress(series, current, video.currentTime, source)
                  }
                },
                onLoadedMetadata: (event) => {
                  const video = event.currentTarget
                  video.playbackRate = rateRef.current
                  if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
                  const { position, resumed } = resumeRef.current
                  // Resume only within the episode; near the end, start over.
                  if (position > 0 && (!video.duration || position < video.duration - END_MARGIN)) {
                    try {
                      video.currentTime = position
                    } catch {
                      // Not seekable yet; the element starts from the beginning.
                    }
                    if (resumed) setResumeNotice({ from: position, duration: video.duration })
                  }
                  resumeRef.current = { position: 0, resumed: false }
                  setProgress({ time: position, duration: video.duration })
                },
                onEnded: (event) => {
                  const video = event.currentTarget
                  // Only a real end of playback advances.
                  if (video.duration && video.currentTime < video.duration - 1) return
                  if (current) saveProgress(series, current, video.duration ?? 0, source)
                  if (nextEpisode) playEpisode(nextEpisode)
                },
                onError: failOnMedia,
              })
            : null,
          overlay,
          volumeNotice === undefined
            ? null
            : h(
                'div',
                { className: 'hg-vol', role: 'status' },
                h(Icon, { name: volumeNotice > 0 ? 'volume' : 'muted' }),
                h('div', { className: 'hg-vol-bar' }, h('span', { style: { width: volumeNotice + '%' } })),
                h('span', { className: 'hg-vol-num' }, volumeNotice + '%'),
              ),
          playback.status === 'loading' ? h('div', { className: 'hg-veil' }, h('span', { className: 'hg-spinner' }), t('player.loading')) : null,
          resumeNotice
            ? h(
                'div',
                { className: 'hg-resume' },
                h('span', null, t('player.resumed').replace('{time}', formatTime(resumeNotice.from))),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'hg-pick',
                    onClick: () => {
                      seekTo(0)
                      setResumeNotice(undefined)
                    },
                  },
                  t('player.restart'),
                ),
                h('button', { type: 'button', className: 'hg-dismiss', 'aria-label': t('player.close'), onClick: () => setResumeNotice(undefined) }, '\u00d7'),
              )
            : null,
          pausedByFinish
            ? h(
                'div',
                { className: 'hg-veil notice' },
                h(Mark, { size: 26 }),
                h('div', null, t('player.finished')),
                h('button', { type: 'button', className: 'hg-btn', onClick: togglePlay }, t('player.resume')),
              )
            : null,
          playback.status === 'error'
            ? h(
                'div',
                { className: 'hg-veil' },
                h('div', null, playback.error?.message ?? t('player.noSource')),
                h('div', { className: 'hg-note' }, t('player.codecHint')),
                h('button', { className: 'hg-btn', type: 'button', onClick: () => { setPlayback({ status: 'loading' }); setRetryKey((value) => value + 1); current && playEpisode(current) } }, t('player.retry')),
              )
            : null,
        )
        const visibleChunk = Math.min(chunk, Math.max(0, chunkCount - 1))
        const episodePanel = seriesInfo.episodes.length > 0
          ? h(
              'div',
              { className: 'hg-section' },
              h(
                'div',
                { className: 'hg-section-head' },
                h('span', null, t('player.chooseEpisode')),
                h('span', { className: 'hg-sub' }, t('player.episodes').replace('{count}', String(seriesInfo.episodes.length))),
                h('span', { className: 'hg-spacer' }),
                current
                  ? h('button', { className: 'hg-mini', type: 'button', disabled: !previousEpisode, onClick: () => previousEpisode && playEpisode(previousEpisode) }, '\u2039 ' + t('player.prev'))
                  : null,
                current
                  ? h('button', { className: 'hg-mini', type: 'button', disabled: !nextEpisode, onClick: () => nextEpisode && playEpisode(nextEpisode) }, t('player.next') + ' \u203a')
                  : null,
              ),
              chunkCount > 1
                ? h(
                    'div',
                    { className: 'hg-chunks', role: 'tablist' },
                    Array.from({ length: chunkCount }, (_, at) =>
                      h(
                        'button',
                        {
                          key: at,
                          type: 'button',
                          role: 'tab',
                          className: 'hg-chunk',
                          'aria-selected': String(at === visibleChunk),
                          onClick: () => setChunk(at),
                        },
                        `${at * CHUNK + 1}-${Math.min((at + 1) * CHUNK, seriesInfo.episodes.length)}`,
                      ),
                    ),
                  )
                : null,
              h(
                'div',
                { className: 'hg-episodes', role: 'list' },
                seriesInfo.episodes.slice(visibleChunk * CHUNK, (visibleChunk + 1) * CHUNK).map((episode) =>
                  h(
                    'button',
                    {
                      key: episode.id,
                      type: 'button',
                      role: 'listitem',
                      className: 'hg-ep',
                      'aria-current': String(current?.id === episode.id),
                      onClick: () => playEpisode(episode),
                    },
                    String(episode.number ?? '\u00b7'),
                  ),
                ),
              ),
            )
          : null
        content = h(
          React.Fragment,
          null,
          current
            ? h(
                'div',
                { className: 'hg-player' },
                stage,
                playback.data?.sources?.length > 1
                  ? h(
                      'div',
                      { className: 'hg-pills' },
                      playback.data.sources.map((source) =>
                        h(
                          'button',
                          {
                            key: source.definition,
                            type: 'button',
                            className: 'hg-pill',
                            'aria-pressed': String(source.definition === activeSource?.definition),
                            onClick: () => setQuality(source.definition),
                          },
                          source.definition,
                        ),
                      ),
                    )
                  : null,
                playback.data?.protected && !playback.data?.decrypted ? h('div', { className: 'hg-note' }, t('player.drm')) : null,
              )
            : seriesInfo.status === 'loading'
              ? h('div', { className: 'hg-muted' }, t('player.loading'))
              : seriesInfo.status === 'ready' && seriesInfo.episodes.length > 0
                ? h(
                    'div',
                    { className: 'hg-idle' },
                    h(Mark, { size: 40 }),
                    h('div', { className: 'hg-idle-text' }, t('player.notPlaying')),
                    h('button', { type: 'button', className: 'hg-idle-pick', onClick: () => pickRandom(seriesInfo.episodes) }, t('player.pickRandom')),
                    h('button', { type: 'button', className: 'hg-btn primary', onClick: () => playEpisode(seriesInfo.episodes[0]) }, t('player.startFirst')),
                  )
                : seriesInfo.status === 'ready'
                  ? h('div', { className: 'hg-empty' }, t('player.noFree'))
                  : null,
          seriesInfo.status === 'error' ? h(ErrorBox, { error: seriesInfo.error, onRetry: () => series && openSeries(series) }) : null,
          series?.description && !current ? h('div', { className: 'hg-desc' }, series.description) : null,
          episodePanel,
        )
      }

      return h('div', { className: compact ? 'hg-root compact' : 'hg-root' }, compact ? null : header, h('div', { className: 'hg-body' }, content))
    }

    /**
     * Render an area defensively: a failure inside it keeps the surrounding
     * page usable and says what broke, instead of letting the slot's boundary
     * blank the whole tab.
     */
    class Area extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: undefined }
      }

      static getDerivedStateFromError(error) {
        return { failed: error }
      }

      componentDidCatch(error) {
        console.error(`[hongguo] ${this.props.name} failed:`, error?.message ?? error)
      }

      render() {
        if (this.state.failed) {
          return h(
            'div',
            { className: 'hg-error' },
            h('div', null, `播放器出错：${this.state.failed?.message ?? this.state.failed}`),
            h('button', { className: 'hg-btn', type: 'button', style: { marginTop: 8 }, onClick: () => this.setState({ failed: undefined }) }, '重试'),
          )
        }
        return this.props.children
      }
    }

    function ErrorBox({ error, onRetry }) {
      const t = useTranslate()
      return h(
        'div',
        { className: 'hg-error' },
        h('div', null, t('player.error').replace('{message}', error?.message ?? '')),
        onRetry ? h('button', { className: 'hg-btn', type: 'button', style: { marginTop: 8 }, onClick: onRetry }, t('player.retry')) : null,
      )
    }

    /** The Client locale service, captured at apply time. */
    const localeRef = { current: undefined }
    /**
     * Re-read one text key from the locale service. The returned function has a
     * stable identity, so a component that also uses other hooks keeps its hook
     * order; `useLocaleRevision` supplies the re-render.
     */
    const translate = (key) => {
      const locale = localeRef.current
      if (locale && typeof locale.bind === 'function' && !translate.bound) translate.bound = locale.bind(NS)
      const text = translate.bound ? translate.bound(key) : undefined
      return text ?? zh[key] ?? key
    }

    /** Subscribe the calling component to locale changes; returns a revision counter. */
    function useLocaleRevision() {
      const [revision, bump] = React.useState(0)
      React.useEffect(() => {
        const locale = localeRef.current
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bump((value) => value + 1))
      }, [])
      return revision
    }

    /** Text accessor that re-renders on locale changes. */
    function useTranslate() {
      useLocaleRevision()
      return translate
    }

    /** The plugin context, so component handlers reach the sidebar controller. */
    let pluginCtx

    /** Live players, one control per mounted player holding a source. */
    const players = new Set()
    /** The player that most recently started, which owns the activity beacon. */
    const audioOwner = { current: null }

    /**
     * Tell the Host which drama this page is showing. Nothing waits on it: the
     * Host keeps the last state for its own surfaces.
     */
    function reportActivity(series, episode) {
      fetch(`${API}/activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'local', playing: true, title: series?.title, episode: episode?.number }),
        keepalive: true,
      }).catch(() => {})
    }

    /** Ask the right Sidebar to show the drama tab, optionally already on one drama. */
    function openDrama(ctx, params) {
      const sidebar = ctx?.get('sidebarRight')
      try {
        sidebar?.openTab(KIND, params ? { params } : {})
      } catch (error) {
        console.error('[hongguo] failed to open the drama tab', error?.message ?? String(error))
      }
    }

    /**
     * Hand the playing drama to the page the Host serves, in the user's browser.
     *
     * The shell denies `window.open`, so the Host starts the browser itself; the
     * page receives the episode and the exact second to resume from, then plays on
     * its own and advances to the next episode by itself.
     */
    async function openStandaloneWindow(series, episode, position) {
      const payload = {
        series: series?.id,
        episode: episode?.id,
        at: Number.isFinite(position) && position > 0 ? Math.floor(position) : undefined,
      }
      try {
        const response = await fetch(`${API}/open`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        // The Host builds the URL and launches the browser; nothing else to do.
        if (response.ok) return
        console.warn('[hongguo] the Host could not open a browser:', response.status)
      } catch (error) {
        console.warn('[hongguo] failed to ask the Host for a window:', error?.message ?? String(error))
      }
      // A session whose Host cannot start a browser keeps the page local.
      const params = new URLSearchParams()
      if (series?.id) params.set('series', series.id)
      if (episode?.id) params.set('episode', episode.id)
      if (payload.at) params.set('at', String(payload.at))
      const search = params.toString()
      window.open(`${API}/window${search ? `?${search}` : ''}`, 'dsh-hongguo-window', 'popup=yes,width=560,height=900')
    }

    /**
     * Pause every playing drama. Called when a task finishes, so the drama
     * stops on its own instead of talking over the result the user has to
     * read; every player also shows a short notice explaining why.
     */
    function pauseAllDramas() {
      for (const control of [...players]) {
        try {
          control.pause('finished')
        } catch {
          // A player mid-teardown has nothing to pause.
        }
      }
    }

    /** Foot button beside Settings: one click from anywhere into the player. */
    function FooterButton(props) {
      const t = useTranslate()
      const sidebar = pluginCtx?.get('sidebarRight')
      const wide = props?.wide !== false
      return h(
        'button',
        {
          type: 'button',
          className: 'hg-foot-action',
          title: t('button.tooltip'),
          'aria-label': t('button.tooltip'),
          onClick: () => openDrama(pluginCtx),
        },
        h(Mark, { size: 16 }),
        wide ? h('span', { className: 'hg-label' }, t('button.label')) : null,
      )
    }

    /**
     * Ambient prompt for the drama player, rendered in the composer's dock.
     *
     * While the agent runs it offers the wait as viewing time; when the player
     * is already docked on screen it turns into the player surface itself, so
     * the drama stays visible underneath the conversation. `shouldHide` (a
     * standard prop) is honoured because the dock also renders during read-only
     * states, where this card would repeat what is already on screen.
     */
    /** Dock entry: the prompt, isolated so a failure there never affects the tab. */
    function DockPrompt(props) {
      return h(Area, { name: 'dock', children: h(RunningPrompt, props) })
    }

    function RunningPrompt({ sessionId, useSessionStatus, shouldHide }) {
      const t = useTranslate()
      const status = useSessionStatus ? useSessionStatus((snapshot) => (sessionId ? snapshot.get(sessionId) : undefined)) : undefined
      // No panel read here: outside its own panel the hook already collapses to
      // an inert reader, and a throwing read must not take the card down.
      const sidebar = pluginCtx?.get('sidebarRight')
      const [dismissed, setDismissed] = React.useState(false)
      const [docked, setDocked] = React.useState(false)
      const [picks, setPicks] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(undefined)

      // Follow the column's own controllers: is the drama docked, and pumped.
      React.useEffect(() => {
        if (!sidebar) return undefined
        // The controller's tab list spans every session, so it cannot tell
        // whether *this* view shows the player. What is on screen can: a
        // mounted, visible player in this page.
        const read = () => {
          const root = document.querySelector('.hg-root:not(.compact)')
          const visible = Boolean(root && root.offsetParent !== null && root.getClientRects().length > 0)
          setDocked(visible)
        }
        read()
        const unsubscribe = sidebar.openTabs?.subscribe?.(read)
        const timer = setInterval(read, 800)
        return () => {
          unsubscribe?.()
          clearInterval(timer)
        }
      }, [sidebar])

      const running = status?.running === true

      // A finished task pauses whatever was playing, and says so inside the
      // player rather than as a message: the drama is the thing to resume.
      const wasRunning = React.useRef(false)
      React.useEffect(() => {
        if (running) {
          wasRunning.current = true
        } else if (wasRunning.current) {
          wasRunning.current = false
          pauseAllDramas()
        }
      }, [running])

      // A quick pick list, only while an invitation could actually be shown.
      React.useEffect(() => {
        if (!running || docked || dismissed) return undefined
        fetchFeed(false)
          .then((items) => {
            if (items.length > 0) setPicks(items.slice(0, 3))
          })
          .catch(() => {})
      }, [running, docked, dismissed])

      // The dock also renders during read-only states; the card must not.
      if (typeof shouldHide === 'function' && shouldHide()) return null
      if (dismissed) return null
      // Only while the agent works: the wait is what the drama fills.
      if (!running) return null
      // The player is already on screen: nothing to invite.
      if (docked) return null
      // The invitation: one line of copy, up to three dramas to start now, and
      // the way into the full player.
      return h(
        'div',
        { className: 'hg-prompt', role: 'status' },
        h(
          'div',
          { className: 'hg-prompt-body' },
          h('div', { className: 'hg-prompt-title' }, t('prompt.title')),
          error ? h('div', { className: 'hg-prompt-hint' }, t('player.error').replace('{message}', error)) : null,
          h(
            'div',
            { className: 'hg-picks' },
            picks.map((item) => h('button', { key: item.id, type: 'button', className: 'hg-pick', onClick: () => pick(item) }, item.title ?? item.id)),
            h('button', { type: 'button', className: 'hg-pick more', onClick: openAll }, t('player.more')),
          ),
        ),
        h(
          'div',
          { className: 'hg-prompt-actions' },
          h('button', { type: 'button', className: 'hg-dismiss', 'aria-label': t('prompt.dismiss'), onClick: () => setDismissed(true) }, '\u00d7'),
        ),
      )

      /** Open the player on its list. */
      function openAll() {
        openDrama(pluginCtx)
        setDismissed(true)
      }

      async function pick(item) {
        if (busy) return
        setBusy(true)
        setError(undefined)
        try {
          openDrama(pluginCtx, { series: { id: item.id, title: item.title } })
          setDismissed(true)
        } catch (caught) {
          setError(caught?.message ?? String(caught))
        } finally {
          setBusy(false)
        }
      }
    }

    return {
      // Only injected services are readable through this Client's `ctx.get`;
      // the Sidebar controller and its tab-type registry are declared here so
      // this plugin parks instead of guessing when they are absent.
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        pluginCtx = ctx
        const locale = ctx.get('locale')
        localeRef.current = locale
        if (locale) {
          ctx.effect(() => locale.register(NS, 'zh', zh), 'hongguo: zh dictionary')
          ctx.effect(() => locale.register(NS, 'en', en), 'hongguo: en dictionary')
        }
        // The plugin stylesheet is one owned <style> element: inserting it and
        // removing it from the page is the whole lifecycle.
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.hongguo = 'player'
          tag.textContent = CSS
          document.head.append(tag)
          return () => tag.remove()
        }, 'hongguo: styles')

        // The tab type: a page type (no address patterns), opened by kind.
        // Tabs opened under the plugin's earlier name keep that title in each
        // session's saved sidebar layout; rename them once to the current one.
        try {
          const legacy = new Set(['\u7ea2\u679c\u77ed\u5267', 'Hongguo drama', 'Hongguo dramas'])
          for (const key of Object.keys(localStorage)) {
            if (!key.startsWith('dsh.sidebar-right.')) continue
            const raw = localStorage.getItem(key)
            if (!raw || !raw.includes('"kind":"' + KIND + '"')) continue
            const layout = JSON.parse(raw)
            let changed = false
            const visit = (node) => {
              if (!node || typeof node !== 'object') return
              if (node.kind === KIND && legacy.has(node.title)) {
                node.title = translate('tab.title')
                changed = true
              }
              for (const value of Object.values(node)) visit(value)
            }
            visit(layout)
            if (changed) localStorage.setItem(key, JSON.stringify(layout))
          }
        } catch {
          // A layout this code does not understand is left as it is.
        }
        const sidebarRightTabs = ctx.get('sidebarRightTabs')
        if (sidebarRightTabs?.register) {
          ctx.effect(
            () =>
              sidebarRightTabs.register({
                id: TAB_ID,
                kind: KIND,
                multiple: false,
                title: () => translate('tab.title'),
                guide: [
                  {
                    id: 'hongguo',
                    order: 30,
                    title: () => translate('guide.title'),
                    description: () => translate('guide.description'),
                    icon: Mark,
                  },
                ],
              }),
            'hongguo: tab type',
          )
        }

        ctx.slots.inject('sidebar.right.pane.tab', () => {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, PlayerBody)
        })
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register({ name: 'sidebar.footer.action', id: 'hongguo', order: 10, label: () => translate('button.label') }, FooterButton),
        )
        // Above the composer card, not below it: the invitation belongs with
        // the input, where the user is already looking while the agent works.
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register({ name: 'conversation.input.dock', id: 'hongguo-prompt', order: 30 }, DockPrompt),
        )
      },
    }
  },
})
