// v1.2.0 交测：7 项改动的断言。数据目录用 ZHIYIKE_TEST_DATA（发布清洗后的只读副本），缺省用 sample-data。
// 全部输出落盘到 ZHIYIKE_TEST_OUT，供排除来源 grep 复核。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler, VERSION } from '../server/mcp.ts';
import { cutSentence, sourceNameFor, isPlaceholder, PLACEHOLDER_PATHS } from '../server/mcp-data.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dataDir = process.env.ZHIYIKE_TEST_DATA || path.resolve(here, '../sample-data');
const outDir = process.env.ZHIYIKE_TEST_OUT || mkdtempSync(path.join(tmpdir(), 'zyk-out-'));
const full = process.env.ZHIYIKE_TEST_FULL === '1';
const real = Boolean(process.env.ZHIYIKE_TEST_DATA);
mkdirSync(outDir, { recursive: true });
const BAD = new RegExp('\u6a58\u9e26|\u006a\u0075\u0079\u0061', 'i');
let pass = 0; const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// 1. 版本号一致
const pkg = JSON.parse(readFileSync(path.join(repo, 'mcp/package.json'), 'utf8')).version;
const skillMd = readFileSync(path.join(repo, 'skill/zhiyike-reader/SKILL.md'), 'utf8').match(/version: "([^"]+)"/)[1];
const py = readFileSync(path.join(repo, 'skill/zhiyike-reader/scripts/zhiyike.py'), 'utf8').match(/VERSION = "([^"]+)"/)[1];
const manifest = JSON.parse(readFileSync(path.join(repo, 'skill/download/manifest.json'), 'utf8')).version;
ok([VERSION, skillMd, py, manifest].every(v => v === pkg) && pkg === '1.2.1', `版本号不一致 ${[pkg, VERSION, skillMd, py, manifest]}`);
ok(!/releases\/tag\/v1\.0\.0/.test(readFileSync(path.join(repo, 'README.md'), 'utf8')), 'README 仍指向 v1.0.0');

// 单元：来源名、截句
ok(sourceNameFor('原文', 'https://www.ithome.com/0/1.htm') === 'IT之家', '原文→IT之家');
ok(sourceNameFor('reddit.com', 'https://www.reddit.com/r/x') === 'Reddit', 'reddit.com→Reddit');
ok(sourceNameFor('', 'https://news.example.org/a') === 'news.example.org', '未知域名去 www');
ok(sourceNameFor('HN 热议', 'https://news.ycombinator.com/') === 'HN 热议', '已有人名不改');
// 1.2.0 验收修复：标签式来源名 → 网站名
ok(sourceNameFor('核实来源', 'https://www.theguardian.com/a') === 'The Guardian', '核实来源→The Guardian');
ok(sourceNameFor('本人发布（X）', 'https://x.com/a/status/1') === 'X', '本人发布（X）→X');
ok(sourceNameFor('官方发布（X）') === 'X', '官方发布（X）无网址→X');
ok(sourceNameFor('本人发布（X）') === 'X', '图源本人发布（X）→X');
ok(sourceNameFor('AI 工具集原文', 'https://ai-bot.cn/x') === 'AI 工具集', 'AI 工具集原文→AI 工具集');
ok(sourceNameFor('Gary Marcus 本人发布', 'https://garymarcus.substack.com/p/x') === 'Substack', '个人发布→网站名');
ok(sourceNameFor('Anthropic 官方发布') === 'Anthropic', '无网址取前缀');
ok(sourceNameFor('核实来源') === '', '无网址无前缀→空');
ok(sourceNameFor('', 'https://fortune.com/x') === 'Fortune', 'fortune.com 进对照表');
ok(isPlaceholder('media/2026.10.15/48.jpg') && isPlaceholder('media/2026.08.13/04.jpg') && PLACEHOLDER_PATHS.size === 25 && !isPlaceholder('media/2026.10.15/49.jpg'), '占位图识别 25 个');
ok(cutSentence('一二三四五六七八九十，一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十多出来') === '一二三四五六七八九十', '按逗号截断');

async function serve(dir) {
  const handler = createMcpHandler({ dataDir: dir, requestsPerMinute: 100000 });
  const http = createServer((req, res) => { void handler(req, res); });
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${http.address().port}/mcp`;
  const client = new Client({ name: 'zhiyike-v120-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(base)));
  return { http, base, client };
}
const { http, base, client } = await serve(dataDir);
const all = [];
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  assert.equal(r.isError, undefined, `${name} ${JSON.stringify(args)} 出错：${JSON.stringify(r.content)}`);
  all.push({ name, args, out: r.structuredContent });
  return r.structuredContent;
};
try {
  ok(client.getServerVersion().version === '1.2.1', '握手版本应为 1.2.1');
  const tools = (await client.listTools()).tools;
  ok(tools.length === 6 && !JSON.stringify(tools).includes('热度'), '工具说明不再提热度');

  // 5. GET 行为
  const html = await fetch(base, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  ok(html.status === 200 && (await html.text()).includes('知一刻 MCP 接口'), '浏览器 GET 应 200 说明页');
  ok((await fetch(base, { headers: { Accept: 'text/event-stream' } })).status === 405, 'SSE 探测 GET 仍 405');
  ok((await fetch(base)).status === 405, '无 Accept 的 GET 仍 405');

  // 采集输出
  const first = await call('list_news', { limit: 20 });
  const dates = first.availableDates || [];
  for (const date of (full ? dates : dates.slice(0, 3))) {
    for (let offset = 0; offset !== null && offset !== undefined;) {
      const page = await call('list_news', { date, limit: 20, offset });
      offset = page.nextOffset ?? null;
    }
  }
  const newsItems = all.filter(x => x.name === 'list_news').flatMap(x => x.out.items || []);
  for (const item of newsItems.slice(0, full ? 60 : 10)) await call('get_news_detail', { id: item.id });
  for (const kind of ['products', 'concepts']) for (let offset = 0; offset !== null;) offset = (await call('search_library', { kind, limit: 20, offset })).nextOffset ?? null;
  for (const period of ['daily', 'weekly']) {
    const issues = [];
    for (let offset = 0; offset !== null;) { const p = await call('list_reports', { period, limit: 20, offset }); issues.push(...p.items); offset = p.nextOffset ?? null; }
    for (const issue of (full ? issues : issues.slice(0, 2))) for (let offset = 0; offset !== null;) offset = (await call('get_report', { period, date: issue.date, limit: 20, offset })).nextOffset ?? null;
    for (let offset = 0; offset !== null;) offset = (await call('github_trending', { period, limit: 20, offset })).nextOffset ?? null;
  }
  for (const [i, x] of all.entries()) writeFileSync(path.join(outDir, `${String(i).padStart(5, '0')}-${x.name}.json`), JSON.stringify(x, null, 1));
  const dump = JSON.stringify(all.map(x => x.out));

  // 2. 无热度、按时间排序
  ok(!/"heat"|heatDescription/.test(dump), '仍有 heat 字段');
  for (const x of all.filter(x => x.name === 'list_news')) {
    const ts = (x.out.items || []).map(i => i.publishedAt);
    ok(ts.every((t, i) => !i || ts[i - 1] >= t), `list_news 未按时间倒序 ${x.args.date}`);
  }
  // 3. 来源名
  const sourceObjs = [];
  JSON.parse(dump, (k, v) => { if (k === 'sources' && Array.isArray(v)) sourceObjs.push(...v); return v; });
  // 规则：不是「原文」、不为空；名字是域名时，只允许是对照表里没有的、去掉 www 的原文域名（兜底）。
  const bare = u => new URL(u).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const badNames = sourceObjs.filter(s => !s.name || s.name === '原文' || (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.name) && (sourceNameFor(s.name, s.url) !== s.name || !bare(s.url).endsWith(s.name))) || /^www\./i.test(s.name));
  ok(sourceObjs.length > 0 && badNames.length === 0, `来源名不合规：${JSON.stringify(badNames.slice(0, 5))}`);
  const domainNamed = sourceObjs.filter(s => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.name));
  writeFileSync(path.join(outDir, 'source-names-fallback.json'), JSON.stringify({ total: sourceObjs.length, domainFallback: domainNamed.length,
    orig: sourceObjs.filter(s => s.name === '原文').length }));
  // 4. 无空串
  ok(!/:""/.test(dump), '仍有空串字段');
  const emptyArr = [...dump.matchAll(/"(\w+)":\[\]/g)].map(m => m[1]).filter(k => k !== 'items' && k !== 'availableDates');
  ok(emptyArr.length === 0, `仍有空数组：${[...new Set(emptyArr)]}`);
  const LABELISH = /本人发布|官方发布|原文$|核实来源/;
  const labelNames = [];
  JSON.parse(dump, (k, v) => { if ((k === 'name' || k === 'credit' || k === 'source') && typeof v === 'string' && LABELISH.test(v)) labelNames.push(v); return v; });
  ok(labelNames.length === 0, `仍有标签式来源名：${[...new Set(labelNames)].slice(0, 5)}`);
  // 6. 封面
  const covers = [];
  JSON.parse(dump, (k, v) => { if (k === 'cover' && v && typeof v === 'object') covers.push(v); return v; });
  if (real) ok(covers.length > 0, '没有任何 cover');
  ok(!covers.some(c => PLACEHOLDER_PATHS.has(c.url.replace('https://zhiyike.cn/', ''))), '占位 logo 不作为封面');
  ok(covers.every(c => c.url.startsWith('https://zhiyike.cn/media/')), 'cover.url 必须是 https://zhiyike.cn/media/');
  ok(covers.every(c => ['source', 'ai_generated', 'poster'].includes(c.type)), 'cover.type 取值');
  ok(covers.filter(c => c.type !== 'source').every(c => !('credit' in c)), 'poster / AI 生成不带 credit');
  ok(covers.filter(c => c.type === 'ai_generated').every(c => c.label === 'AI 生成'), 'AI 图标「AI 生成」');
  ok(covers.filter(c => c.credit).every(c => !/[\/:：；;]|https?/.test(c.credit) && [...c.credit].length <= 30), 'credit 只放网站名');
  const products = all.filter(x => x.name === 'search_library' && x.args.kind === 'products').flatMap(x => x.out.items);
  if (real) ok(products.some(p => p.cover) && products.some(p => !p.cover), '产品有图带 cover，没图不带');
  ok(!all.filter(x => x.args.kind === 'concepts').some(x => JSON.stringify(x.out).includes('"cover"')), '概念库这次不加图');
  writeFileSync(path.join(outDir, 'covers.json'), JSON.stringify(covers.map(c => c.url)));
  // 7. 排除来源
  ok(!BAD.test(dump), '输出中出现排除来源');
  const stats = { calls: all.length, news: newsItems.length, sources: sourceObjs.length, domainFallbackNames: domainNamed.length, covers: covers.length,
    coverTypes: covers.reduce((m, c) => (m[c.type] = (m[c.type] || 0) + 1, m), {}) };
  writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(stats, null, 1));
  console.log('采集', JSON.stringify(stats));
} finally { await client.close(); await new Promise(r => http.close(r)); }

// 7. 假数据注入：带排除来源的来源、图源、文字都要被兜底过滤
{
  const dir = mkdtempSync(path.join(tmpdir(), 'zyk-fake-'));
  cpSync(path.resolve(here, '../sample-data'), dir, { recursive: true });
  const data = JSON.parse(readFileSync(path.join(dir, 'data.json'), 'utf8'));
  const name = '\u6a58\u9e26\u65e5\u62a5';
  const host = 'daily.\u006a\u0075\u0079\u0061.uk';
  const day = data.days.find(d => (d.signals || []).length);
  const sig = day.signals[0];
  sig.links = [...(sig.links || []), { name, url: `https://${host}/issue/1` }, { name: '原文', url: 'https://www.ithome.com/0/1.htm' }];
  sig.img = 'media/2026.09.02/01.jpg'; sig.imageMeta = { type: 'article', source: name, url: `https://${host}/x.jpg` };
  sig.sum = `据${name}整理，这是测试摘要。`; if (sig.reader) sig.reader.summary = sig.sum;
  writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data));
  const fake = await serve(dir);
  try {
    const out = (await fake.client.callTool({ name: 'list_news', arguments: { date: day.date, limit: 20 } })).structuredContent;
    const id = out.items[0].id;
    const detail = (await fake.client.callTool({ name: 'get_news_detail', arguments: { id } })).structuredContent;
    const text = JSON.stringify([out, detail]);
    ok(!BAD.test(text), '假数据：排除来源未被过滤');
    ok(text.includes('IT之家'), '假数据：正常来源保留并整理成 IT之家');
    ok(detail.cover && !('credit' in detail.cover), '假数据：排除来源的图源被去掉');
  } finally { await fake.client.close(); await new Promise(r => fake.http.close(r)); }
}

// 1.2.0 验收修复：假数据补 poster / X 署名 / 占位 logo / 标签来源 / 空数组
{
  const dir = mkdtempSync(path.join(tmpdir(), 'zyk-fake2-'));
  cpSync(path.resolve(here, '../sample-data'), dir, { recursive: true });
  const data = JSON.parse(readFileSync(path.join(dir, 'data.json'), 'utf8'));
  const day = data.days.find(d => (d.signals || []).length);
  const base0 = day.signals[0];
  const mk = (title, ts, extra) => ({ ...base0, title, originalTitle: title, ts, points: [], reader: { summary: title + '摘要', deep: [], watch: [] }, ...extra });
  day.signals.push(
    mk('假数据海报A', '2099-01-01T00:00:05Z', { img: 'media/2026.10.15/poster-a.png', _imageFallback: 'editorial', imageMeta: { source: 'IT之家' }, links: [{ name: '核实来源', url: 'https://www.theguardian.com/x' }] }),
    mk('假数据海报B', '2099-01-01T00:00:04Z', { img: 'media/2026.10.15/poster-b.png', imageMeta: { type: 'poster' }, links: [{ name: '本人发布（X）', url: 'https://x.com/a/status/1' }] }),
    mk('假数据X图', '2099-01-01T00:00:03Z', { img: 'media/2026.08.19/28.jpg', imageMeta: { type: 'screenshot', source: '本人发布（X）' }, links: [{ name: 'AI 工具集原文', url: 'https://ai-bot.cn/x' }] }),
    mk('假数据占位logo', '2099-01-01T00:00:02Z', { img: 'media/2026.10.15/48.jpg', imageMeta: { type: 'article', source: '机器之心' }, links: [] }),
  );
  writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data));
  const fake = await serve(dir);
  try {
    const out = (await fake.client.callTool({ name: 'list_news', arguments: { date: day.date, query: '假数据', limit: 20 } })).structuredContent;
    const by = Object.fromEntries(out.items.map(i => [i.title, i]));
    ok(by['假数据海报A']?.cover?.type === 'poster' && !('credit' in by['假数据海报A'].cover) && by['假数据海报A'].cover.url === 'https://zhiyike.cn/media/2026.10.15/poster-a.png', 'poster（editorial）不带 credit');
    ok(by['假数据海报B']?.cover?.type === 'poster' && !('credit' in by['假数据海报B'].cover), 'poster（imageMeta.type）不带 credit');
    ok(by['假数据X图']?.cover?.credit === 'X', 'X 的图署名 X');
    ok(by['假数据占位logo'] && !('cover' in by['假数据占位logo']), '占位 logo 不出 cover');
    ok(!('sources' in by['假数据占位logo']), '空 sources 不输出');
    ok(by['假数据海报A'].sources[0].name === 'The Guardian' && by['假数据海报B'].sources[0].name === 'X' && by['假数据X图'].sources[0].name === 'AI 工具集', '标签式来源名改网站名');
    const detail = (await fake.client.callTool({ name: 'get_news_detail', arguments: { id: by['假数据X图'].id } })).structuredContent;
    ok(!('points' in detail) && !('deep' in detail) && !('watch' in detail), '详情空数组不输出');
    writeFileSync(path.join(outDir, 'fake-poster.json'), JSON.stringify({ out, detail }, null, 1));
  } finally { await fake.client.close(); await new Promise(r => fake.http.close(r)); }
}
console.log(`v1.2.0 断言全部通过：${pass} 条。输出目录 ${outDir}`);
