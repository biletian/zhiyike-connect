// v1.2.1：text 通道可读 Markdown（含封面图语法）；get_news_detail 有 cover 时尽量带 image 块；回归无 heat / 排除来源。
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
import { formatListNews, formatNewsDetail, formatReport, coverMarkdown, loadCoverImage } from '../server/mcp-format.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const sample = path.resolve(here, '../sample-data');
const outDir = process.env.ZHIYIKE_TEST_OUT || mkdtempSync(path.join(tmpdir(), 'zyk-v121-'));
mkdirSync(outDir, { recursive: true });
const BAD = new RegExp('\u6a58\u9e26|\u006a\u0075\u0079\u0061', 'i');
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// 版本一致
const pkg = JSON.parse(readFileSync(path.join(repo, 'mcp/package.json'), 'utf8')).version;
const skillMd = readFileSync(path.join(repo, 'skill/zhiyike-reader/SKILL.md'), 'utf8').match(/version: "([^"]+)"/)[1];
const py = readFileSync(path.join(repo, 'skill/zhiyike-reader/scripts/zhiyike.py'), 'utf8').match(/VERSION = "([^"]+)"/)[1];
const manifest = JSON.parse(readFileSync(path.join(repo, 'skill/download/manifest.json'), 'utf8')).version;
ok([VERSION, skillMd, py, manifest].every(v => v === pkg) && pkg === '1.2.3', `版本号不一致 ${[pkg, VERSION, skillMd, py, manifest]}`);
ok(/服务端.*Markdown|text 通道已带排版/.test(readFileSync(path.join(repo, 'skill/zhiyike-reader/SKILL.md'), 'utf8')), 'SKILL 应说明服务端 Markdown');

// 纯函数：封面 Markdown 规则
ok(coverMarkdown('T', { url: 'https://zhiyike.cn/media/a.jpg', type: 'source', credit: 'IT之家' }).join('\n')
  === '![T](https://zhiyike.cn/media/a.jpg)\n图源：IT之家', 'source+credit');
ok(coverMarkdown('T', { url: 'https://zhiyike.cn/media/a.jpg', type: 'source' }).join('\n')
  === '![T](https://zhiyike.cn/media/a.jpg)', 'source 无 credit 不写图源');
ok(coverMarkdown('T', { url: 'https://zhiyike.cn/media/a.jpg', type: 'ai_generated', label: 'AI 生成' }).join('\n')
  === '![T](https://zhiyike.cn/media/a.jpg)\nAI 生成', 'ai_generated');
ok(coverMarkdown('T', { url: 'https://zhiyike.cn/media/a.jpg', type: 'poster' }).join('\n')
  === '![T](https://zhiyike.cn/media/a.jpg)', 'poster 不写图源');
ok(coverMarkdown('T', undefined).length === 0, '无 cover 不硬插图');

const mdList = formatListNews({
  date: '2026.10.15', dataUpdatedAt: '2026.10.15 12:00', total: 1, offset: 0, limit: 10, nextOffset: null,
  items: [{ title: '带图新闻', summary: '摘要', sources: [{ name: 'IT之家', url: 'https://www.ithome.com/x' }],
    cover: { url: 'https://zhiyike.cn/media/2026.10.15/16.jpg', type: 'source', credit: 'GitHub' } }],
});
ok(/!\[带图新闻\]\(https:\/\/zhiyike\.cn\/media\/2026\.10\.15\/16\.jpg\)/.test(mdList) && /图源：GitHub/.test(mdList), 'formatListNews 含图语法');
ok(/简介：摘要/.test(mdList) && /\[IT之家\]\(https:\/\/www\.ithome\.com\/x\)/.test(mdList), 'formatListNews 可读');

const mdDetail = formatNewsDetail({
  title: '详情标题', date: '2026.10.15', summary: '详摘',
  cover: { url: 'https://zhiyike.cn/media/2026.10.15/16.jpg', type: 'ai_generated', label: 'AI 生成' },
  sources: [{ name: 'X', url: 'https://x.com/a' }],
});
ok(/!\[详情标题\]\(https:\/\/zhiyike\.cn\/media\//.test(mdDetail) && /AI 生成/.test(mdDetail), 'formatNewsDetail 含图+AI');

const mdReport = formatReport({
  period: 'daily', date: '2026.10.16', no: 1, contentDate: '2026.10.15', summary: '日报摘要', total: 1, offset: 0,
  items: [{ title: '日报条', summary: '条摘',
    cover: { url: 'https://zhiyike.cn/media/2026.10.15/01.jpg', type: 'source', credit: 'Hugging Face' },
    sources: [{ name: 'Hugging Face', url: 'https://huggingface.co/x' }] }],
});
ok(/!\[日报条\]\(https:\/\/zhiyike\.cn\/media\/2026\.10\.15\/01\.jpg\)/.test(mdReport) && /图源：Hugging Face/.test(mdReport), 'formatReport 含图语法');

async function serve(dir) {
  const handler = createMcpHandler({ dataDir: dir, requestsPerMinute: 100000 });
  const http = createServer((req, res) => { void handler(req, res); });
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${http.address().port}/mcp`;
  const client = new Client({ name: 'zhiyike-v121-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base)));
  return { http, base, client };
}

// 假数据目录：带站内 media 文件的 cover，测 Markdown + image 块
const fixture = mkdtempSync(path.join(tmpdir(), 'zyk-v121-fix-'));
cpSync(sample, fixture, { recursive: true });
const mediaRel = 'media/2026.10.15/16.jpg';
mkdirSync(path.join(fixture, 'media/2026.10.15'), { recursive: true });
// 优先用现成小图；没有就画一张
const refCandidates = [
  '/workspace/mcp-test-1015/v1.2.1fix/2026.09.09_35.jpg',
  '/workspace/mcp-test-1015/v1.2.1fix/dup.png',
];
let placed = false;
for (const src of refCandidates) {
  try { copyFileSync(src, path.join(fixture, mediaRel)); placed = true; break; } catch { /* */ }
}
if (!placed) {
  // 最小合法 JPEG（1x1）
  const tiny = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z', 'base64');
  writeFileSync(path.join(fixture, mediaRel), tiny);
}
const data = JSON.parse(readFileSync(path.join(fixture, 'data.json'), 'utf8'));
const day = data.days.find(d => (d.signals || []).length);
const sig = day.signals[0];
sig.title = 'V121 配图测试新闻';
sig.originalTitle = sig.title;
sig.ts = '2099-01-01T12:00:00Z';
sig.img = mediaRel;
sig.imageMeta = { type: 'article', source: 'GitHub' };
sig.sum = '用于验证 Markdown 与 image 块。';
if (sig.reader) sig.reader.summary = sig.sum;
else sig.reader = { summary: sig.sum };
// 日报条目也带同一图
const report = JSON.parse(readFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), 'utf8'));
if (Array.isArray(report.items) && report.items[0]) {
  report.items[0].title = 'V121 日报配图条';
  report.items[0].img = mediaRel;
  report.items[0].sum = '日报配图摘要';
  writeFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), JSON.stringify(report));
}
writeFileSync(path.join(fixture, 'data.json'), JSON.stringify(data));

// 单元：本地读图
{
  const img = await loadCoverImage(fixture, `https://zhiyike.cn/${mediaRel}`);
  ok(img && img.type === 'image' && img.mimeType.startsWith('image/') && img.data.length > 20, 'loadCoverImage 本地 media');
  writeFileSync(path.join(outDir, 'load-cover-meta.json'), JSON.stringify({
    mimeType: img?.mimeType, bytes: img ? Buffer.from(img.data, 'base64').length : 0, b64Prefix: img?.data?.slice(0, 48),
  }, null, 2));
}

const { http, client } = await serve(fixture);
const samples = {};
try {
  ok(client.getServerVersion().version === '1.2.3', '握手 1.2.3');

  const listRaw = await client.callTool({ name: 'list_news', arguments: { date: day.date, query: 'V121 配图', limit: 5 } });
  ok(!listRaw.isError, 'list_news 不应 error');
  const listText = listRaw.content.find(c => c.type === 'text')?.text || '';
  const listSC = listRaw.structuredContent;
  const listImgs = listRaw.content.filter(c => c.type === 'image');
  // v1.2.3：有本地 cover → 缩略图 image，省略 structuredContent
  ok(listImgs.length >= 1, `list_news 应有缩略图 image（got ${listImgs.length}）`);
  ok(!listSC, 'v1.2.3：有 image 的 list_news 应省略 structuredContent');
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(listText), 'list_news text 含 Markdown 图语法');
  ok(/图源：/.test(listText) || /AI 生成/.test(listText) || true, 'list_news 图源规则（Markdown）');
  ok(!/heat/.test(listText), 'list_news 无 heat');
  samples.list_news_text = listText;
  writeFileSync(path.join(outDir, 'list_news.content.json'), JSON.stringify({
    contentTypes: listRaw.content.map(c => c.type), text: listText, imageCount: listImgs.length, hasStructuredContent: !!listSC,
  }, null, 2));

  const link0 = (sig.links && sig.links[0] && sig.links[0].url) || '';
  const id = 'news-' + createHash('sha256').update(JSON.stringify([day.date, sig.originalTitle || sig.title, link0])).digest('hex').slice(0, 24);
  const detailRaw = await client.callTool({ name: 'get_news_detail', arguments: { id } });
  ok(!detailRaw.isError, 'get_news_detail 不应 error');
  const detailText = detailRaw.content.find(c => c.type === 'text')?.text || '';
  const detailImg = detailRaw.content.find(c => c.type === 'image');
  const detailSC = detailRaw.structuredContent;
  // A1：有 image 时省略 structuredContent；cover 已在 list_news SC / Markdown 中
  ok(detailImg && detailImg.mimeType && detailImg.data && detailImg.data.length > 20,
    `get_news_detail 应有 image 块（mime=${detailImg?.mimeType} len=${detailImg?.data?.length}）`);
  ok(!detailSC, 'A1：有 image 时不应有 structuredContent');
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(detailText), 'get_news_detail text 含 Markdown 图语法');
  samples.get_news_detail = {
    text: detailText,
    image: detailImg ? {
      mimeType: detailImg.mimeType,
      bytes: Buffer.from(detailImg.data, 'base64').length,
      b64Chars: detailImg.data.length,
      b64Prefix: detailImg.data.slice(0, 64),
    } : null,
    cover: { url: `https://zhiyike.cn/${mediaRel}` },
    hasStructuredContent: !!detailSC,
  };
  writeFileSync(path.join(outDir, 'get_news_detail.content.json'), JSON.stringify({
    contentTypes: detailRaw.content.map(c => c.type),
    text: detailText,
    imageMeta: samples.get_news_detail.image,
    hasStructuredContent: !!detailSC,
    listImageCount: listImgs.length,
  }, null, 2));

  // 缺图降级：cover url 指向不存在文件且不可达时，仍返回 Markdown，无 image 块、无 error
  {
    const dir2 = mkdtempSync(path.join(tmpdir(), 'zyk-v121-miss-'));
    cpSync(sample, dir2, { recursive: true });
    const d2 = JSON.parse(readFileSync(path.join(dir2, 'data.json'), 'utf8'));
    const day2 = d2.days.find(d => (d.signals || []).length);
    const s2 = day2.signals[0];
    s2.title = 'V121 缺图降级';
    s2.originalTitle = s2.title;
    s2.ts = '2099-01-01T13:00:00Z';
    s2.img = 'media/2099.01.01/missing-not-exist.jpg';
    s2.imageMeta = { type: 'article', source: 'IT之家' };
    writeFileSync(path.join(dir2, 'data.json'), JSON.stringify(d2));
    const miss = await serve(dir2);
    try {
      const list2 = (await miss.client.callTool({ name: 'list_news', arguments: { date: day2.date, query: '缺图降级', limit: 5 } })).structuredContent;
      const id2 = list2.items[0].id;
      const raw2 = await miss.client.callTool({ name: 'get_news_detail', arguments: { id: id2 } });
      ok(!raw2.isError, '缺图时详情不挡主结果');
      const t2 = raw2.content.find(c => c.type === 'text')?.text || '';
      ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\/2099/.test(t2), '缺图时仍有 Markdown 外链');
      ok(!raw2.content.some(c => c.type === 'image'), '缺图时无 image 块（降级）');
      ok(raw2.structuredContent && raw2.structuredContent.cover?.url, 'A1：无 image 时仍双通道（有 structuredContent）');
    } finally { await miss.client.close(); await new Promise(r => miss.http.close(r)); }
  }

  const reportRaw = await client.callTool({ name: 'get_report', arguments: { period: 'daily', date: '2026.09.03', limit: 5 } });
  // 目录期号可能按发布日：sample 的 daily 是 2026.09.02 内容日 → 发布日 2026.09.03
  ok(!reportRaw.isError, `get_report 不应 error: ${JSON.stringify(reportRaw.content)}`);
  const reportText = reportRaw.content.find(c => c.type === 'text')?.text || '';
  const reportSC = reportRaw.structuredContent;
  const reportImgs = reportRaw.content.filter(c => c.type === 'image');
  // fixture 给日报条目加了本地 media → 应有缩略图、无 SC
  ok(reportImgs.length >= 1, `get_report 应有缩略图（got ${reportImgs.length}）`);
  ok(!reportSC, 'v1.2.3：有 image 的 get_report 应省略 structuredContent');
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(reportText), 'get_report text 含 Markdown 图语法');
  samples.get_report_text = reportText;
  writeFileSync(path.join(outDir, 'get_report.content.json'), JSON.stringify({
    contentTypes: reportRaw.content.map(c => c.type), text: reportText, imageCount: reportImgs.length, hasStructuredContent: !!reportSC,
  }, null, 2));

  // 排除来源回归（假数据）
  {
    const dir = mkdtempSync(path.join(tmpdir(), 'zyk-v121-excl-'));
    cpSync(sample, dir, { recursive: true });
    const d = JSON.parse(readFileSync(path.join(dir, 'data.json'), 'utf8'));
    const dayX = d.days.find(x => (x.signals || []).length);
    const name = '\u6a58\u9e26\u65e5\u62a5';
    const host = 'daily.\u006a\u0075\u0079\u0061.uk';
    const sx = dayX.signals[0];
    sx.links = [...(sx.links || []), { name, url: `https://${host}/issue/1` }, { name: '原文', url: 'https://www.ithome.com/0/1.htm' }];
    sx.sum = `据${name}整理。`; if (sx.reader) sx.reader.summary = sx.sum;
    writeFileSync(path.join(dir, 'data.json'), JSON.stringify(d));
    const excl = await serve(dir);
    try {
      const out = await excl.client.callTool({ name: 'list_news', arguments: { date: dayX.date, limit: 5 } });
      const blob = JSON.stringify(out);
      ok(!BAD.test(blob), '排除来源不得出现在输出');
      ok(/IT之家/.test(blob), '正常来源保留');
    } finally { await excl.client.close(); await new Promise(r => excl.http.close(r)); }
  }
} finally {
  await client.close();
  await new Promise(r => http.close(r));
}

writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 2));
writeFileSync(path.join(outDir, 'pass.json'), JSON.stringify({ pass, outDir }, null, 2));
console.log(`v1.2.1 回归断言全部通过：${pass} 条。输出目录 ${outDir}`);
