# dsh-hongguo

摸鱼短剧：一个 DSH 插件，在右侧边栏里播一部短剧，Agent 干活的时候提示你把它调出来。

数据来自 [openhongguo](https://github.com/beilunyang/openhongguo)（第三方短剧平台的非官方 SDK，匿名设备、无需登录）。请仅用于个人学习与研究，内容版权归权利人所有。

## 截图

**剧集列表**：顶部推荐一部没看过的热门剧，下面每页 12 部，`换一批` 翻页；`观看历史` 点开才显示。

![剧集列表](docs/home.png)

**播放器**：画面按视频比例自适应，画面内控制条（进度拖动、下一集、倍速、静音、全屏），选集按 50 集分段。

![播放器](docs/player.png)

**等待提示**：Agent 运行时在输入框上方出现，点剧名直接开播，`更多…` 打开播放器。

![等待提示](docs/prompt.png)

## 功能

| 位置 | 内容 |
|---|---|
| 右侧边栏 | `摸鱼短剧` 标签页：推荐卡片 + 剧集列表（带封面、服务端搜索、可翻页）→ 分集 → 播放器 |
| 搜索 | 走红果接口而不是过滤已加载的列表；首屏自动补到 12 部，`换一批` 沿游标继续取，结果按 id 去重 |
| 剧集列表 | 按面板宽度自适应：每行 6 / 4 / 3 / 2 部，每页 12 部，`换一批` 翻到下一页 |
| 播放历史 | 记住每部剧看到第几集、第几秒；`观看历史` 按钮点开后一键续播，可单条移除 |
| 播放器 | 画面内控制条、倍速（1–2×）、全屏、自动连播下一集、续播提示 |
| 左侧栏底部 | `短剧` 按钮，一键打开播放器 |
| 输入框上方 | Agent 运行时出现浮框：3 部剧可直接点开，`更多…` 打开播放器；当前页面已显示播放器时不出现 |
| 任务完成 | Agent 从运行变为空闲时自动暂停正在播放的短剧，并在画面上提示 |
| 侧边栏引导页 | 一个 `摸鱼短剧` 入口卡片 |

## 结构

- **Host 半（`index.js`）**：加载 openhongguo SDK、维护匿名设备档案，提供同源路由 `/api/hongguo/{feed,series,play,search,media,stream,config,running}`、`/api/hongguo/cover` 与 `/api/hongguo/vendor`。启动时预先拉取剧集列表。CDN 只提供 HEIC 封面，Host 用 `sips`（macOS）或 `ffmpeg`（其他平台）转成 JPEG 并缓存。
- **Client 半（`client.js`）**：注册侧边栏标签页类型 `hongguo`、侧栏底部按钮，以及 `conversation.input.dock` 里的等待提示。

## 播放与解密

视频是 CENC（cenc-aes-ctr）加密的 HEVC，浏览器无法直接解码。Host 用 SDK 解析出的内容密钥调用本机 `ffmpeg` 解密并重封装为普通 MP4（`-c copy`，不重编码），缓存在插件数据目录 `media/`（保留最近 40 集）。页面只拿到同源 `/api/hongguo/media` 地址，密钥不出 Host。

需要安装 ffmpeg：macOS `brew install ffmpeg`，Windows `winget install Gyan.FFmpeg`，其他平台用系统包管理器安装。封面转换复用同一个 ffmpeg，所以在 Windows / Linux 上没有 ffmpeg 时海报会显示占位图。

## 配置

`cordis.patch.yml` 中 `hongguo` 行的 `config`：

| 字段 | 默认 | 说明 |
|---|---|---|
| `autoPrompt` | `true` | Agent 运行时是否显示提示 |
| `panelWidth` | `480` | 播放器标签页的默认宽度（px） |
| `profilePath` | 插件数据目录 | 匿名设备档案文件；删除即更换设备 |
| `searchTerms` | `总裁/重生/逆袭` | 推荐不足时补充列表用的搜索词 |
