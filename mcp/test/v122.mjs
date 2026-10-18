// v1.2.2：方案 A1 — 有 MCP image 时省略 structuredContent；无 image / list / report 仍双通道。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, cpSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler, VERSION } from '../server/mcp.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const sample = path.resolve(here, '../sample-data');
const outDir = process.env.ZHIYIKE_TEST_OUT || mkdtempSync(path.join(tmpdir(), 'zyk-v122-'));
mkdirSync(outDir, { recursive: true });
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const pkg = JSON.parse(readFileSync(path.join(repo, 'mcp/package.json'), 'utf8')).version;
const skillMd = readFileSync(path.join(repo, 'skill/zhiyike-reader/SKILL.md'), 'utf8');
const skillVer = skillMd.match(/version: "([^"]+)"/)[1];
const py = readFileSync(path.join(repo, 'skill/zhiyike-reader/scripts/zhiyike.py'), 'utf8').match(/VERSION = "([^"]+)"/)[1];
const manifest = JSON.parse(readFileSync(path.join(repo, 'skill/download/manifest.json'), 'utf8')).version;
ok([VERSION, skillVer, py, manifest].every(v => v === pkg) && pkg === '1.2.2', `版本号不一致 ${[pkg, VERSION, skillVer, py, manifest]}`);
ok(/省略.*structuredContent|Codex/.test(skillMd), 'SKILL 应说明有图时省略 structuredContent / Codex');

async function serve(dir) {
  const handler = createMcpHandler({ dataDir: dir, requestsPerMinute: 100000 });
  const http = createServer((req, res) => { void handler(req, res); });
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const client = new Client({ name: 'zhiyike-v122-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.address().port}/mcp`)));
  return { http, client };
}

const fixture = mkdtempSync(path.join(tmpdir(), 'zyk-v122-fix-'));
cpSync(sample, fixture, { recursive: true });
const mediaRel = 'media/2026.10.15/16.jpg';
mkdirSync(path.join(fixture, 'media/2026.10.15'), { recursive: true });
const refCandidates = [
  '/workspace/mcp-test-1015/v1.2.1fix/2026.09.09_35.jpg',
  '/workspace/mcp-test-1015/v1.2.1fix/dup.png',
];
let placed = false;
for (const src of refCandidates) {
  try { copyFileSync(src, path.join(fixture, mediaRel)); placed = true; break; } catch { /* */ }
}
if (!placed) {
  const tiny = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z', 'base64');
  writeFileSync(path.join(fixture, mediaRel), tiny);
}

const data = JSON.parse(readFileSync(path.join(fixture, 'data.json'), 'utf8'));
const day = data.days.find(d => (d.signals || []).length);
const sig = day.signals[0];
sig.title = 'V122 A1 有图详情';
sig.originalTitle = sig.title;
sig.ts = '2099-01-01T12:00:00Z';
sig.img = mediaRel;
sig.imageMeta = { type: 'article', source: 'GitHub' };
sig.sum = '验证 A1：有 image 无 structuredContent。';
if (sig.reader) sig.reader.summary = sig.sum;
else sig.reader = { summary: sig.sum };

const report = JSON.parse(readFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), 'utf8'));
if (Array.isArray(report.items) && report.items[0]) {
  report.items[0].title = 'V122 日报配图条';
  report.items[0].img = mediaRel;
  report.items[0].sum = '日报配图摘要';
  writeFileSync(path.join(fixture, 'report/issues/2026.09.02.json'), JSON.stringify(report));
}
writeFileSync(path.join(fixture, 'data.json'), JSON.stringify(data));

const samples = {};
const { http, client } = await serve(fixture);
try {
  ok(client.getServerVersion().version === '1.2.2', '握手 1.2.2');

  // list_news：无 image 块 → 必须有 structuredContent
  const listRaw = await client.callTool({ name: 'list_news', arguments: { date: day.date, query: 'V122 A1', limit: 5 } });
  ok(!listRaw.isError, 'list_news 不应 error');
  ok(listRaw.structuredContent && Array.isArray(listRaw.structuredContent.items), 'list_news 有 structuredContent');
  ok(!listRaw.content.some(c => c.type === 'image'), 'list_news 不加缩略图 image 块');
  const listText = listRaw.content.find(c => c.type === 'text')?.text || '';
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(listText), 'list_news text 含 Markdown 图语法');
  samples.list_news = {
    contentTypes: listRaw.content.map(c => c.type),
    hasStructuredContent: true,
    textSnippet: listText.slice(0, 400),
  };

  const id = listRaw.structuredContent.items[0].id;

  // get_news_detail 有 cover + 本地 media → 有 image、无 structuredContent
  const detailRaw = await client.callTool({ name: 'get_news_detail', arguments: { id } });
  ok(!detailRaw.isError, 'get_news_detail 不应 error');
  const detailText = detailRaw.content.find(c => c.type === 'text')?.text || '';
  const detailImg = detailRaw.content.find(c => c.type === 'image');
  ok(detailImg && detailImg.data?.length > 20, '有图详情应有 image 块');
  ok(detailRaw.structuredContent === undefined || detailRaw.structuredContent === null,
    `A1：有 image 时 structuredContent 应省略（got ${JSON.stringify(detailRaw.structuredContent)?.slice(0, 80)}）`);
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(detailText), '有图详情 text 仍含 Markdown');
  // MCP SDK 可能把缺省字段弄成 undefined；确认 JSON 形状无 structuredContent 键更稳
  const detailShape = JSON.parse(JSON.stringify({ content: detailRaw.content.map(c => c.type === 'image' ? { type: 'image', mimeType: c.mimeType, dataLen: c.data?.length } : { type: c.type, textLen: c.text?.length }), structuredContent: detailRaw.structuredContent }));
  ok(!('structuredContent' in detailShape) || detailShape.structuredContent == null, '序列化后无有效 structuredContent');
  samples.get_news_detail_with_image = {
    contentTypes: detailRaw.content.map(c => c.type),
    hasStructuredContent: detailRaw.structuredContent != null,
    image: { mimeType: detailImg.mimeType, bytes: Buffer.from(detailImg.data, 'base64').length, b64Prefix: detailImg.data.slice(0, 48) },
    textSnippet: detailText.slice(0, 400),
  };
  writeFileSync(path.join(outDir, 'get_news_detail.with-image.json'), JSON.stringify(samples.get_news_detail_with_image, null, 2));

  // 缺图降级：无 image → 仍双通道
  {
    const dir2 = mkdtempSync(path.join(tmpdir(), 'zyk-v122-miss-'));
    cpSync(sample, dir2, { recursive: true });
    const d2 = JSON.parse(readFileSync(path.join(dir2, 'data.json'), 'utf8'));
    const day2 = d2.days.find(d => (d.signals || []).length);
    const s2 = day2.signals[0];
    s2.title = 'V122 缺图降级';
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
      ok(!raw2.isError, '缺图不挡主结果');
      ok(!raw2.content.some(c => c.type === 'image'), '缺图无 image');
      ok(raw2.structuredContent && raw2.structuredContent.id === id2, 'A1：无 image 时仍有 structuredContent');
      samples.get_news_detail_no_image = {
        contentTypes: raw2.content.map(c => c.type),
        hasStructuredContent: true,
        cover: raw2.structuredContent.cover,
      };
      writeFileSync(path.join(outDir, 'get_news_detail.no-image.json'), JSON.stringify(samples.get_news_detail_no_image, null, 2));
    } finally { await miss.client.close(); await new Promise(r => miss.http.close(r)); }
  }

  // get_report：无 image 块 → 有 structuredContent + Markdown
  const reportRaw = await client.callTool({ name: 'get_report', arguments: { period: 'daily', date: '2026.09.03', limit: 5 } });
  ok(!reportRaw.isError, `get_report 不应 error: ${JSON.stringify(reportRaw.content)}`);
  ok(reportRaw.structuredContent && Array.isArray(reportRaw.structuredContent.items), 'get_report 有 structuredContent');
  ok(!reportRaw.content.some(c => c.type === 'image'), 'get_report 不加 image 块');
  const reportText = reportRaw.content.find(c => c.type === 'text')?.text || '';
  ok(/!\[.+\]\(https:\/\/zhiyike\.cn\/media\//.test(reportText), 'get_report text 含 Markdown 图语法');
  samples.get_report = {
    contentTypes: reportRaw.content.map(c => c.type),
    hasStructuredContent: true,
    textSnippet: reportText.slice(0, 400),
  };
  writeFileSync(path.join(outDir, 'list_news.json'), JSON.stringify(samples.list_news, null, 2));
  writeFileSync(path.join(outDir, 'get_report.json'), JSON.stringify(samples.get_report, null, 2));

  // 无 cover 的详情：双通道（从 sample 里找无图条，或注入）
  {
    const dir3 = mkdtempSync(path.join(tmpdir(), 'zyk-v122-nocover-'));
    cpSync(sample, dir3, { recursive: true });
    const d3 = JSON.parse(readFileSync(path.join(dir3, 'data.json'), 'utf8'));
    const day3 = d3.days.find(d => (d.signals || []).length);
    const s3 = day3.signals[0];
    s3.title = 'V122 无封面详情';
    s3.originalTitle = s3.title;
    s3.ts = '2099-01-01T14:00:00Z';
    delete s3.img;
    delete s3.imageMeta;
    s3.sum = '无封面';
    if (s3.reader) s3.reader.summary = s3.sum;
    writeFileSync(path.join(dir3, 'data.json'), JSON.stringify(d3));
    const nc = await serve(dir3);
    try {
      const list3 = (await nc.client.callTool({ name: 'list_news', arguments: { date: day3.date, query: '无封面', limit: 5 } })).structuredContent;
      const raw3 = await nc.client.callTool({ name: 'get_news_detail', arguments: { id: list3.items[0].id } });
      ok(!raw3.content.some(c => c.type === 'image'), '无 cover 无 image');
      ok(raw3.structuredContent && !raw3.structuredContent.cover, '无 cover 仍有 structuredContent 且无 cover 字段');
      samples.get_news_detail_no_cover = {
        contentTypes: raw3.content.map(c => c.type),
        hasStructuredContent: true,
        hasCover: !!raw3.structuredContent.cover,
      };
      writeFileSync(path.join(outDir, 'get_news_detail.no-cover.json'), JSON.stringify(samples.get_news_detail_no_cover, null, 2));
    } finally { await nc.client.close(); await new Promise(r => nc.http.close(r)); }
  }
} finally {
  await client.close();
  await new Promise(r => http.close(r));
}

writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 2));
writeFileSync(path.join(outDir, 'pass.json'), JSON.stringify({ pass, outDir }, null, 2));
console.log(`v1.2.2 A1 断言全部通过：${pass} 条。输出目录 ${outDir}`);
