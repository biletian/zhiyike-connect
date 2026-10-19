// v1.2.3：list_news / get_report 缩略图；有 image 省略 SC；体积/截断；详情不回归。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, cpSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler, VERSION } from '../server/mcp.ts';
import {
  loadCoverImage, loadCoverThumbnails,
  THUMB_MAX_IMAGE_BYTES, THUMB_MAX_EDGE, THUMB_MAX_TOTAL_BYTES, THUMB_MAX_ITEMS,
  DETAIL_MAX_IMAGE_BYTES,
} from '../server/mcp-format.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const sample = path.resolve(here, '../sample-data');
const outDir = process.env.ZHIYIKE_TEST_OUT || mkdtempSync(path.join(tmpdir(), 'zyk-v123-'));
mkdirSync(outDir, { recursive: true });
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const pkg = JSON.parse(readFileSync(path.join(repo, 'mcp/package.json'), 'utf8')).version;
const skillMd = readFileSync(path.join(repo, 'skill/zhiyike-reader/SKILL.md'), 'utf8');
const skillVer = skillMd.match(/version: "([^"]+)"/)[1];
const py = readFileSync(path.join(repo, 'skill/zhiyike-reader/scripts/zhiyike.py'), 'utf8').match(/VERSION = "([^"]+)"/)[1];
const manifest = JSON.parse(readFileSync(path.join(repo, 'skill/download/manifest.json'), 'utf8')).version;
ok([VERSION, skillVer, py, manifest].every(v => v === pkg) && pkg === '1.2.3', `版本号不一致 ${[pkg, VERSION, skillVer, py, manifest]}`);
ok(/list_news|get_report|缩略图/.test(skillMd) && /structuredContent/.test(skillMd), 'SKILL 应说明日报/列表缩略图与省略 structuredContent');
ok(THUMB_MAX_IMAGE_BYTES <= 120_000 && THUMB_MAX_IMAGE_BYTES >= 80_000, `单张缩略图上限应在 80–120KB（got ${THUMB_MAX_IMAGE_BYTES})`);
ok(THUMB_MAX_EDGE === 480, `边长上限 480（got ${THUMB_MAX_EDGE})`);
ok(THUMB_MAX_TOTAL_BYTES >= 500_000 && THUMB_MAX_TOTAL_BYTES <= 1_000_000, `合计上限 500KB–1MB（got ${THUMB_MAX_TOTAL_BYTES})`);
ok(DETAIL_MAX_IMAGE_BYTES === 350_000, '详情上限仍 350KB');

async function serve(dir) {
  const handler = createMcpHandler({ dataDir: dir, requestsPerMinute: 100000 });
  const http = createServer((req, res) => { void handler(req, res); });
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const client = new Client({ name: 'zhiyike-v123-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.address().port}/mcp`)));
  return { http, client };
}

function newsId(dayDate, title, url = '') {
  return 'news-' + createHash('sha256').update(JSON.stringify([dayDate, title, url])).digest('hex').slice(0, 24);
}

const refCandidates = [
  '/workspace/mcp-test-1015/v1.2.1fix/2026.09.09_35.jpg',
  '/workspace/mcp-test-1015/v1.2.1fix/dup.png',
  '/workspace/mcp-test-1015/v1.2.1fix/2026.08.12_24.jpg',
  '/workspace/mcp-test-1015/v1.2.1fix/2026.08.13_04.jpg',
  '/workspace/mcp-test-1015/v1.2.1fix/2026.09.13_27.jpg',
];
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z', 'base64');

function placeMedia(fixture, rel, srcIdx = 0) {
  mkdirSync(path.join(fixture, path.dirname(rel)), { recursive: true });
  const dest = path.join(fixture, rel);
  for (let i = srcIdx; i < refCandidates.length; i++) {
    try { copyFileSync(refCandidates[i], dest); return dest; } catch { /* */ }
  }
  writeFileSync(dest, tinyJpeg);
  return dest;
}

const fixture = mkdtempSync(path.join(tmpdir(), 'zyk-v123-fix-'));
cpSync(sample, fixture, { recursive: true });
const mediaRel = 'media/2026.10.15/16.jpg';
placeMedia(fixture, mediaRel, 0);

const data = JSON.parse(readFileSync(path.join(fixture, 'data.json'), 'utf8'));
const day = data.days.find(d => (d.signals || []).length);
const base0 = day.signals[0];
const mk = (title, ts, imgRel, extra = {}) => ({
  ...base0,
  title, originalTitle: title, ts,
  img: imgRel,
  imageMeta: { type: 'article', source: 'GitHub' },
  sum: title + '摘要',
  reader: { summary: title + '摘要', deep: [], watch: [] },
  links: [{ name: '示例源', url: `https://example.com/${encodeURIComponent(title)}` }],
  ...extra,
});

// 主测条：单条有图
day.signals = [
  mk('V123 列表缩略图', '2099-01-01T12:00:00Z', mediaRel),
];
writeFileSync(path.join(fixture, 'data.json'), JSON.stringify(data));

const report = JSON.parse(readFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), 'utf8'));
report.items = [
  { title: 'V123 日报缩略图', img: mediaRel, sum: '日报摘要', links: [{ name: '源', url: 'https://example.com/r1' }] },
];
writeFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), JSON.stringify(report));

const samples = {};
const { http, client } = await serve(fixture);
try {
  ok(client.getServerVersion().version === '1.2.3', '握手 1.2.3');

  // --- list_news 有缩略图、无 SC ---
  const listRaw = await client.callTool({ name: 'list_news', arguments: { date: day.date, query: 'V123 列表', limit: 5 } });
  ok(!listRaw.isError, 'list_news 不应 error');
  const listText = listRaw.content.find(c => c.type === 'text')?.text || '';
  const listImgs = listRaw.content.filter(c => c.type === 'image');
  ok(listImgs.length >= 1, `list_news 应有 ≥1 缩略图（got ${listImgs.length}）`);
  ok(listRaw.structuredContent == null, '有图 list_news 无 structuredContent');
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(listText), 'list_news Markdown 图语法');
  for (const img of listImgs) {
    const bytes = Buffer.from(img.data, 'base64').length;
    ok(bytes > 20 && bytes <= THUMB_MAX_IMAGE_BYTES, `list 单张 ≤${THUMB_MAX_IMAGE_BYTES}（got ${bytes}）`);
  }
  samples.list_news = {
    contentTypes: listRaw.content.map(c => c.type),
    hasStructuredContent: false,
    imageCount: listImgs.length,
    imageBytes: listImgs.map(i => Buffer.from(i.data, 'base64').length),
    textSnippet: listText.slice(0, 500),
  };
  writeFileSync(path.join(outDir, 'list_news.with-thumbs.json'), JSON.stringify(samples.list_news, null, 2));

  // --- get_report 有缩略图、无 SC ---
  const reportRaw = await client.callTool({ name: 'get_report', arguments: { period: 'daily', date: '2026.09.03', limit: 5 } });
  ok(!reportRaw.isError, `get_report 不应 error: ${JSON.stringify(reportRaw.content)}`);
  const reportText = reportRaw.content.find(c => c.type === 'text')?.text || '';
  const reportImgs = reportRaw.content.filter(c => c.type === 'image');
  ok(reportImgs.length >= 1, `get_report 应有 ≥1 缩略图（got ${reportImgs.length}）`);
  ok(reportRaw.structuredContent == null, '有图 get_report 无 structuredContent');
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(reportText), 'get_report Markdown 图语法');
  samples.get_report = {
    contentTypes: reportRaw.content.map(c => c.type),
    hasStructuredContent: false,
    imageCount: reportImgs.length,
    imageBytes: reportImgs.map(i => Buffer.from(i.data, 'base64').length),
    textSnippet: reportText.slice(0, 500),
  };
  writeFileSync(path.join(outDir, 'get_report.with-thumbs.json'), JSON.stringify(samples.get_report, null, 2));

  // --- 详情不回归：较大图、无 SC ---
  const id = newsId(day.date, 'V123 列表缩略图', 'https://example.com/V123%20%E5%88%97%E8%A1%A8%E7%BC%A9%E7%95%A5%E5%9B%BE');
  const detailRaw = await client.callTool({ name: 'get_news_detail', arguments: { id } });
  ok(!detailRaw.isError, `get_news_detail 不应 error id=${id}`);
  const detailImg = detailRaw.content.find(c => c.type === 'image');
  ok(detailImg && detailImg.data?.length > 20, '详情应有 image');
  ok(detailRaw.structuredContent == null, '有图详情无 SC（A1）');
  const detailBytes = Buffer.from(detailImg.data, 'base64').length;
  ok(detailBytes <= DETAIL_MAX_IMAGE_BYTES, `详情图 ≤350KB（got ${detailBytes}）`);
  samples.get_news_detail = {
    contentTypes: detailRaw.content.map(c => c.type),
    hasStructuredContent: false,
    imageBytes: detailBytes,
    mimeType: detailImg.mimeType,
  };
  writeFileSync(path.join(outDir, 'get_news_detail.with-image.json'), JSON.stringify(samples.get_news_detail, null, 2));

  // --- 无 cover：双通道 ---
  {
    const dir2 = mkdtempSync(path.join(tmpdir(), 'zyk-v123-nocover-'));
    cpSync(sample, dir2, { recursive: true });
    const d2 = JSON.parse(readFileSync(path.join(dir2, 'data.json'), 'utf8'));
    const day2 = d2.days.find(d => (d.signals || []).length);
    const s2 = day2.signals[0];
    s2.title = 'V123 无封面';
    s2.originalTitle = s2.title;
    s2.ts = '2099-01-01T14:00:00Z';
    delete s2.img;
    delete s2.imageMeta;
    writeFileSync(path.join(dir2, 'data.json'), JSON.stringify(d2));
    const nc = await serve(dir2);
    try {
      const list2 = await nc.client.callTool({ name: 'list_news', arguments: { date: day2.date, query: '无封面', limit: 5 } });
      ok(!list2.content.some(c => c.type === 'image'), '无 cover list 无 image');
      ok(list2.structuredContent && Array.isArray(list2.structuredContent.items), '无 cover list 有 SC');
      const id2 = list2.structuredContent.items[0].id;
      const dRaw = await nc.client.callTool({ name: 'get_news_detail', arguments: { id: id2 } });
      ok(!dRaw.content.some(c => c.type === 'image'), '无 cover 详情无 image');
      ok(dRaw.structuredContent && dRaw.structuredContent.id === id2, '无 cover 详情有 SC');
      samples.no_cover = { listHasSC: true, detailHasSC: true };
      writeFileSync(path.join(outDir, 'no-cover.shape.json'), JSON.stringify(samples.no_cover, null, 2));
    } finally { await nc.client.close(); await new Promise(r => nc.http.close(r)); }
  }

  // --- 缺图降级：有 cover URL 但文件不可达 → 无 image、有 SC ---
  {
    const dir3 = mkdtempSync(path.join(tmpdir(), 'zyk-v123-miss-'));
    cpSync(sample, dir3, { recursive: true });
    const d3 = JSON.parse(readFileSync(path.join(dir3, 'data.json'), 'utf8'));
    const day3 = d3.days.find(d => (d.signals || []).length);
    const s3 = day3.signals[0];
    s3.title = 'V123 缺图降级';
    s3.originalTitle = s3.title;
    s3.ts = '2099-01-01T15:00:00Z';
    s3.img = 'media/2099.01.01/missing-v123.jpg';
    s3.imageMeta = { type: 'article', source: 'IT之家' };
    writeFileSync(path.join(dir3, 'data.json'), JSON.stringify(d3));
    const miss = await serve(dir3);
    try {
      const list3 = await miss.client.callTool({ name: 'list_news', arguments: { date: day3.date, query: '缺图降级', limit: 5 } });
      ok(!list3.isError, '缺图 list 不挡');
      ok(!list3.content.some(c => c.type === 'image'), '缺图 list 无 image');
      ok(list3.structuredContent?.items?.[0]?.cover?.url, '缺图 list 仍有 SC+cover');
      const t3 = list3.content.find(c => c.type === 'text')?.text || '';
      ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\/2099/.test(t3), '缺图仍有 Markdown 外链');
      samples.missing_image = { listHasSC: true, hasMarkdown: true };
    } finally { await miss.client.close(); await new Promise(r => miss.http.close(r)); }
  }
} finally {
  await client.close();
  await new Promise(r => http.close(r));
}

// --- 截断：多条有图，maxItems=2 时只附 2 张并带 textNote ---
{
  const dir4 = mkdtempSync(path.join(tmpdir(), 'zyk-v123-trunc-'));
  cpSync(sample, dir4, { recursive: true });
  for (let i = 0; i < 5; i++) placeMedia(dir4, `media/2026.10.15/t${i}.jpg`, i % refCandidates.length);
  const items = Array.from({ length: 5 }, (_, i) => ({
    cover: { url: `https://zhiyike.cn/media/2026.10.15/t${i}.jpg` },
  }));
  const r = await loadCoverThumbnails(dir4, items, { maxItems: 2, maxTotalBytes: THUMB_MAX_TOTAL_BYTES });
  ok(r.loaded === 2, `截断 maxItems=2 → loaded=2（got ${r.loaded}）`);
  ok(r.truncated, '应标记 truncated');
  ok(r.textNote && /Markdown 外链/.test(r.textNote), `应有截断说明（got ${r.textNote}）`);
  ok(r.images.every(img => Buffer.from(img.data, 'base64').length <= THUMB_MAX_IMAGE_BYTES), '截断批每张仍 ≤ 单张上限');
  samples.truncate = { loaded: r.loaded, truncated: r.truncated, textNote: r.textNote, bytes: r.images.map(i => Buffer.from(i.data, 'base64').length) };
  writeFileSync(path.join(outDir, 'truncate.meta.json'), JSON.stringify(samples.truncate, null, 2));
}

// --- 合计体积截断（人为小预算）---
{
  const dir5 = mkdtempSync(path.join(tmpdir(), 'zyk-v123-budget-'));
  cpSync(sample, dir5, { recursive: true });
  placeMedia(dir5, 'media/2026.10.15/b0.jpg', 0);
  placeMedia(dir5, 'media/2026.10.15/b1.jpg', 1);
  const items = [
    { cover: { url: 'https://zhiyike.cn/media/2026.10.15/b0.jpg' } },
    { cover: { url: 'https://zhiyike.cn/media/2026.10.15/b1.jpg' } },
  ];
  const first = await loadCoverImage(dir5, items[0].cover.url, { maxBytes: THUMB_MAX_IMAGE_BYTES, maxEdge: THUMB_MAX_EDGE, qualities: [58, 48, 38] });
  ok(first, '预算测：至少能加载第一张');
  const firstBytes = Buffer.from(first.data, 'base64').length;
  const r = await loadCoverThumbnails(dir5, items, { maxItems: 8, maxTotalBytes: Math.max(1, firstBytes - 1) });
  ok(r.loaded === 0 && r.truncated, `合计预算小于首张 → loaded=0 truncated（got loaded=${r.loaded} trunc=${r.truncated}）`);
  samples.budget = { firstBytes, loaded: r.loaded, truncated: r.truncated };
  writeFileSync(path.join(outDir, 'budget.meta.json'), JSON.stringify(samples.budget, null, 2));
}

// --- 缩略图边长：压缩后应明显小于详情默认（用同一张大图对比）---
{
  const dir6 = mkdtempSync(path.join(tmpdir(), 'zyk-v123-edge-'));
  const bigRel = 'media/2026.10.15/big.jpg';
  placeMedia(dir6, bigRel, 0);
  const url = `https://zhiyike.cn/${bigRel}`;
  const detail = await loadCoverImage(dir6, url); // 详情默认
  const thumb = await loadCoverImage(dir6, url, { maxBytes: THUMB_MAX_IMAGE_BYTES, maxEdge: THUMB_MAX_EDGE, qualities: [58, 48, 38] });
  ok(detail && thumb, '详情与缩略图都能加载');
  const db = Buffer.from(detail.data, 'base64').length;
  const tb = Buffer.from(thumb.data, 'base64').length;
  ok(tb <= THUMB_MAX_IMAGE_BYTES, `缩略图字节 ≤${THUMB_MAX_IMAGE_BYTES}（got ${tb}）`);
  ok(tb <= db, `缩略图不大于详情图（thumb=${tb} detail=${db}）`);
  samples.edge = { detailBytes: db, thumbBytes: tb };
  writeFileSync(path.join(outDir, 'edge-compare.json'), JSON.stringify(samples.edge, null, 2));
}

writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 2));
writeFileSync(path.join(outDir, 'pass.json'), JSON.stringify({ pass, outDir, caps: { THUMB_MAX_IMAGE_BYTES, THUMB_MAX_EDGE, THUMB_MAX_TOTAL_BYTES, THUMB_MAX_ITEMS, DETAIL_MAX_IMAGE_BYTES } }, null, 2));
console.log(`v1.2.3 缩略图断言全部通过：${pass} 条。输出目录 ${outDir}`);
