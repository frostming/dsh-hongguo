#!/usr/bin/env node
/**
 * hghub 命令行：只做接口验证，不下载内容。
 *
 *   node sdk/hghub/cli.js home
 *   node sdk/hghub/cli.js feed 2 6
 *   node sdk/hghub/cli.js search 逆袭
 *   node sdk/hghub/cli.js rank hot
 *   node sdk/hghub/cli.js show 117
 *   node sdk/hghub/cli.js play 117 3
 *   node sdk/hghub/cli.js cover <封面地址> <输出.jpg>
 *   node sdk/hghub/cli.js lines
 *   node sdk/hghub/cli.js probe
 *   node sdk/hghub/cli.js diag
 */

import { writeFile } from 'node:fs/promises'
import { createClient, fetchMirrors, probeLines, coverURL, FIXED_LINES } from './index.js'

const [command, ...args] = process.argv.slice(2)

function usage() {
  console.log(`用法：
  home                     首页聚合（轮播 / 精选 / 最新 / 分类 / 专题）
  feed [page] [size]       全站列表
  category <cate> [page]   频道列表（ai-duanju / ai-manju / ai-huanlian / ai-mogai）
  search <关键词>          搜索
  rank [hot|recommend|potential]
  tags                     标签字典
  show <videoId>           详情 + 分集
  play <videoId> <ep>      播放地址 / 分片 / AES-128 密钥
  cover <url> <out.jpg>    下载并解密一张封面
  lines                    地址发布页上的镜像线路
  probe [url…]             可达性探测
  diag                     线路 / HTTP / 代理自检

环境变量：HGHUB_CONFIG_DIR 改档案目录；HGHUB_PROXY / HTTPS_PROXY 走代理。`)
}

const short = (text, n = 46) => (text.length > n ? `${text.slice(0, n)}…` : text)

async function main() {
  if (!command || command === 'help' || command === '-h' || command === '--help') return usage()

  // 线路 / 镜像 / 自检都不需要先拉列表，所以按需建客户端。
  if (command === 'lines') {
    const mirrors = await fetchMirrors({ limit: Number(args[0]) || 20 })
    console.log(`固定线路：`)
    for (const line of FIXED_LINES) console.log(`  ${line.name.padEnd(10)} ${line.url}`)
    console.log(`\n镜像线路（来源 ${mirrors.source}）：`)
    for (const item of mirrors.items) console.log(`  ${item.url}`)
    return
  }

  const client = await createClient()

  if (command === 'probe') {
    const urls = args.length ? args : FIXED_LINES.map((line) => line.url)
    const results = await probeLines(urls)
    for (const row of results) {
      console.log(`${row.ok ? 'ok  ' : 'fail'} ${String(row.status ?? '-').padEnd(4)} ${String(row.ms).padStart(5)}ms  ${row.url}${row.error ? `  ${row.error}` : ''}`)
    }
    return
  }

  if (command === 'diag') {
    console.log(JSON.stringify(await client.diagnose(), null, 2))
    return
  }

  if (command === 'home') {
    const home = await client.home()
    console.log(`轮播 ${home.banners.length} · 精选 ${home.featured.length} · 最新 ${home.latest.length} · 专题 ${home.topics.length}`)
    for (const banner of home.banners.slice(0, 3)) console.log(`  轮播 ${banner.video_id} ${short(banner.desc)}`)
    for (const item of home.featured) console.log(`  精选 ${String(item.id).padEnd(6)} ${item.title}  评分 ${item.score}  热度 ${item.hot}`)
    for (const section of home.categories) console.log(`  分类 ${section.name}：${section.items.map((item) => item.title).join(' / ')}`)
    return
  }

  if (command === 'feed') {
    const page = Number(args[0]) || 1
    const size = Number(args[1]) || 20
    const result = await client.feed({ page, size })
    console.log(`第 ${result.page}/${result.pages} 页，共 ${result.total} 部`)
    for (const item of result.items) console.log(`  ${String(item.id).padEnd(6)} ${short(item.title, 26).padEnd(28)} ${item.episodes} 集  热度 ${item.hot}`)
    return
  }

  if (command === 'category') {
    if (!args[0]) return usage()
    const result = await client.category(args[0], { page: Number(args[1]) || 1 })
    console.log(`${args[0]}：${result.total} 部`)
    for (const item of result.items) console.log(`  ${String(item.id).padEnd(6)} ${short(item.title, 26).padEnd(28)} ${item.episodes} 集`)
    return
  }

  if (command === 'search') {
    if (!args[0]) return usage()
    const result = await client.search(args.join(' '))
    console.log(`“${result.keyword}”：${result.total} 条`)
    for (const item of result.items) console.log(`  ${String(item.id).padEnd(6)} ${short(item.title, 26).padEnd(28)} ${item.episodes} 集`)
    return
  }

  if (command === 'rank') {
    const result = await client.rank(args[0] || 'hot')
    console.log(`${result.type}：`)
    for (const item of result.items.slice(0, 15)) {
      console.log(`  ${String(item.rank).padStart(2)}. ${short(item.title, 24).padEnd(26)} ${item.metricLabel} ${item.metricValue}`)
    }
    return
  }

  if (command === 'tags') {
    const result = await client.tags()
    for (const group of result.categories) {
      console.log(`${group.name}（${group.code}）：${group.tags.map((tag) => tag.name).join('、')}`)
    }
    return
  }

  if (command === 'show') {
    if (!args[0]) return usage()
    const detail = await client.getVideo(args[0])
    console.log(`${detail.title}（${detail.id}）`)
    console.log(`  评分 ${detail.score} · ${detail.episodes} 集 · ${detail.finished ? '完结' : '连载'} · 标签 ${detail.tags.join('/')}`)
    console.log(`  作者 ${detail.author?.name ?? '-'} · 播放 ${detail.counts.hot ?? 0} · 收藏 ${detail.counts.collect ?? 0}`)
    console.log(`  封面 ${detail.cover}`)
    console.log(`  简介 ${short(detail.description, 90)}`)
    for (const ep of detail.episodeList.slice(0, 12)) {
      console.log(`  ${String(ep.number).padStart(3)}  ${short(ep.title, 30).padEnd(32)} ${ep.playable ? '' : '不可播'}`)
    }
    if (detail.episodeList.length > 12) console.log(`  …共 ${detail.episodeList.length} 集`)
    return
  }

  if (command === 'play') {
    if (!args[0]) return usage()
    const episode = Number(args[1]) || 1
    const result = await client.resolvePlayback(args[0], episode)
    console.log(`第 ${result.ep} 集 · ${result.duration}s`)
    console.log(`  播放列表 ${result.videoUrl}`)
    console.log(`  加密 ${result.method ?? '-'} · key ${result.key ?? '-'} · iv ${result.iv ?? '-'}`)
    console.log(`  分片 ${result.segments.length} 个，首个 ${result.segments[0]}`)
    return
  }

  if (command === 'cover') {
    if (!args[0] || !args[1]) return usage()
    const url = args[0].startsWith('http') ? args[0] : coverURL(args[0])
    const { kind, bytes } = await client.fetchCover(url)
    await writeFile(args[1], bytes)
    console.log(`${kind} ${bytes.length} 字节 → ${args[1]}`)
    return
  }

  usage()
}

main().catch((error) => {
  console.error(`${error?.code ?? 'ERROR'}: ${error?.message ?? error}`)
  process.exitCode = 1
})
