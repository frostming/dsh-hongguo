# hghub（黄果短剧站的 API 客户端）

非官方客户端。数据获取方法参考 [Minireel/HGhub](https://github.com/Minireel/HGhub)（Rust + Tauri 的
第三方客户端）：它不逆向签名，只复用浏览器同源行为——站点把全部 `/api/**` 收敛成**一个**边缘信封
接口，客户端只需要往这个口子里填 `path`。

> 仅用于个人学习与研究。内容版权归权利人所有，请勿批量抓取、搬运或再分发。
> 本项目不提供下载功能；请不要把接口地址、播放直链或解密方式公开张贴。

## 请求模型

```
POST {base}/api/edge/request
content-type: application/json
authorization: Bearer <token>        # 只有登录后的互动接口需要

{
  "method": "GET",                    # 原接口的方法
  "path":   "/api/videos?page=1&size=20",   # 原接口的路径 + 查询串
  "body":   "eyJ1c2VybmFtZSI6..." ,   # base64(JSON)，没有请求体时是 ""
  "content_type": "application/json"  # 没有请求体时是 ""
}
```

响应同样是信封：

```json
{ "status": 1, "msg": "", "data": { ... } }
```

`status === 1` 时 `data` 是业务数据；否则 `msg` 是错误原因（`视频不存在`、`该集不存在或已下架`、
`unauthorized` …）。客户端把这两种情况分别抛成 `HghubError`，`code` 是 `API_ERROR` / `UNAUTHORIZED`。

**浏览不需要登录。** 首页、列表、频道、排行、搜索、详情、播放地址全部匿名可取，
所以 `createClient()` 不触发任何请求，也不建任何档案。

## 快速上手

```js
import { createClient, parseEpisodeId } from './index.js'

const client = await createClient()   // 匿名，直接可用

// 首页聚合：轮播 + 精选 + 最新 + 分类推荐 + 专题
const home = await client.home()
console.log(home.featured.map((item) => `${item.id} ${item.title}`))

// 全站列表（共 3000+ 部，按热度排）
const feed = await client.feed({ page: 1, size: 12 })
console.log(feed.total, feed.page, feed.pages)

// 频道：ai-duanju / ai-manju / ai-huanlian / ai-mogai
const channel = await client.category('ai-duanju', { page: 1, size: 20 })

// 排行：hot / recommend / potential
const rank = await client.rank('hot')

// 搜索
const found = await client.search('逆袭')

// 详情（分集就在里面，不需要再发一次请求）
const detail = await client.getVideo(117)
console.log(detail.title, detail.episodeList.length)

// 播放：m3u8 + AES-128 密钥 + 分片
const playback = await client.resolvePlayback(117, 3)
console.log(playback.videoUrl, playback.key, playback.segments.length)

// 复合集 id（Host 路由用）：`117_3`
const episode = await client.getEpisode('117_3')
```

命令行（接口验证用）：

```sh
node sdk/hghub/cli.js home
node sdk/hghub/cli.js feed 2 6
node sdk/hghub/cli.js search 逆袭
node sdk/hghub/cli.js rank hot
node sdk/hghub/cli.js show 117
node sdk/hghub/cli.js play 117 3
node sdk/hghub/cli.js cover /upload_01/upload/20260924/2026092411162272798.jpg cover.jpg
node sdk/hghub/cli.js lines        # 地址发布页上的镜像线路
node sdk/hghub/cli.js diag
```

## 方法

| 方法 | 封装的原接口 | 说明 |
|---|---|---|
| `home()` | `/api/home` | 轮播、精选、最新、分类推荐、专题 |
| `feed({page,size})` | `/api/videos` | 全站列表，`pagination` 归一成 `{page,pages,size,total}` |
| `category(cate,{page,size})` | `/api/videos/category/{cate}` | 四个频道，见 `CATEGORIES` |
| `rank(kind)` | `/api/ranks/{kind}` | `hot` / `recommend` / `potential` |
| `tags()` | `/api/tags` | 题材分组与标签（`slug` 可用于筛选） |
| `search(keyword,{page,size})` | `/api/search` | 空关键词直接返回空结果，不发请求 |
| `getVideo(id)` | `/api/videos/{id}` | 详情 + 分集（`episodeList`） |
| `listEpisodes(id,{pageNumber,pageSize})` | 同上 | 分页视图，集 id 是 `{videoId}_{ep}` |
| `getPlay(videoId, ep)` | `/api/videos/{id}/play?ep=&page_texts=0` | 播放地址（带签名，有效期以分钟计） |
| `getEpisode('117_3')` | 同上 | 复合集 id 版本 |
| `resolvePlayback(videoId, ep)` | 同上 + 拉 m3u8 | 播放列表文本、AES-128 key、IV、分片 |
| `playlistURL(videoUrl)` | — | 恒等（分片已是 CDN 绝对地址） |
| `posts({page,size})` / `post(id)` / `comments(id,ep)` | `/api/posts*` | 吃瓜帖子与评论 |
| `login/register/logout/me` | `/api/account/*` | 只有互动接口需要 |
| `setBase(url)` | — | 切线路，下一次请求生效 |
| `diagnose()` | — | DNS/HTTP/线路快照，判断“打不开”是网络还是上游 |

## 线路（数据源）

上游只是域名在变，请求链路与数据模型完全一致，所以“切线路”等价于换 `base`。

- `FIXED_LINES`：`https://huangguoai.com`、`https://huangguoai.ai`，写死在客户端里。
- `fetchMirrors()`：从地址发布页 <https://huangguoai.pages.dev/> 抓镜像。那个页面本身是空壳，
  真正的清单在 `publish.js` 里（`var urls` 域名数组 + `var subdomains` 子域数组，页面自己随机拼）。
- `probeLines(urls)`：并发探测可达性，只报结果，不自动切换。

```js
client.setBase('https://thu.gitiecgad.cc')
```

## 封面

站点封面是 **AES-128-CBC 密文**（key `f5d965df75336270`、iv `97b60394abc2fbe1`），
解密后是普通 JPEG。`decryptCover(bytes)` 先按魔数判断是不是明文（CDN 偶尔直接给明文），
不是才解密，所以对两种响应都安全。

封面相对路径的基址是 `https://pic.drleao.cn`，`coverURL()` 负责拼完整地址。
`client.fetchCover(url)` 一步拿到 `{kind, bytes}`。

## 播放

播放地址是标准 HLS：m3u8 里 `#EXT-X-KEY` 指向 `/api/app/vid/sec` 风格的 16 字节 AES-128 key，
分片是 CDN 上的绝对地址（`tp1..tp8.drleao.cn`）。`resolvePlayback()` 把这些都解析出来，
浏览器直接播，或者交给 Host 代理改写。

播放链路的主机白名单见 `MEDIA_HOST_SUFFIXES`，`isMediaHost()` 用于同源代理的校验。

## 限流

上游按窗口限流，批量拉列表时容易触发。`minIntervalMs` 会给请求加一条串行闸门
（两次请求之间至少隔这么久），批量扫描时建议 300–900ms：

```js
const client = await createClient({ minIntervalMs: 400 })
```

网络错误与 5xx 会按 `retries`（默认 2）退避重试。

## 档案

匿名浏览不需要档案。登录后 token 存在 `~/.config/hghub/profile.json`（0600），
`HGHUB_CONFIG_DIR` 可改目录。Host 想用别的位置就传 `profile` 或自己的 `store`
（`{load,save,reset}` 三个方法）。

## 目录结构

```
index.js   客户端（信封、线路、封面解密、HLS 解析、数据整形）
cli.js     命令行示例
test/      离线单元测试（node --test）
```

## 与旧片源的差异

旧片源（`sdk/hg2/`）是 APK 逆向：HMAC-SHA1 签名、AES 加密响应、设备注册换 token。
这个片源完全不需要这些——没有签名、没有登录、没有设备档案，只有信封、线路和封面解密。
代价是订单与会员体系不存在：能看的集就是能播的集，`status: 1` 即免费可播。
