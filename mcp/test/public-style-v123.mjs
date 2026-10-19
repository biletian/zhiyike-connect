import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler } from '../server/mcp.ts';

const outDir = process.env.ZHIYIKE_TEST_OUT || path.dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });
const dataDir = process.env.MCP_DATA_DIR || '/workspace/mcp-test-1015/v1.2.0/testdata';
const checks = [];
const log = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name} ${detail}`);
};

const handler = createMcpHandler({ dataDir, requestsPerMinute: 100000 });
const http = createServer((req, res) => { void handler(req, res); });
await new Promise(r => http.listen(0, '127.0.0.1', r));
const port = http.address().port;
const client = new Client({ name: 'zhiyike-public-style', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

try {
  const ver = client.getServerVersion().version;
  log('handshake', ver === '1.2.3', ver);

  // Pick a recent day with covers from availableDates via a list that may omit SC
  // First get availableDates: call list without covers preference — use library or list and parse.
  // Probe: call list_news limit 1 — may or may not have SC depending on covers on that page.
  let probe = await client.callTool({ name: 'list_news', arguments: { limit: 1 } });
  let dates = probe.structuredContent?.availableDates;
  if (!dates) {
    // has images → no SC; fall back to reading data.json
    const data = JSON.parse(readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    dates = (data.days || []).map(d => d.date).filter(Boolean).sort().reverse();
  }
  // Find a day with several covers
  let bestDate = dates[0];
  let bestCovers = 0;
  for (const date of dates.slice(0, 40)) {
    const raw = await client.callTool({ name: 'list_news', arguments: { date, limit: 10 } });
    const text = raw.content.find(c => c.type === 'text')?.text || '';
    const md = (text.match(/!\[.*?\]\(https:\/\/zhiyike\.cn\/media\//g) || []).length;
    const imgs = raw.content.filter(c => c.type === 'image').length;
    if (md >= 3 || imgs >= 2) { bestDate = date; bestCovers = Math.max(md, imgs); break; }
    if (md > bestCovers) { bestDate = date; bestCovers = md; }
  }

  const listRaw = await client.callTool({ name: 'list_news', arguments: { date: bestDate, limit: 10 } });
  const listText = listRaw.content.find(c => c.type === 'text')?.text || '';
  const listImgs = listRaw.content.filter(c => c.type === 'image');
  const listMd = (listText.match(/!\[.*?\]\(https:\/\/zhiyike\.cn\/media\//g) || []).length;
  writeFileSync(path.join(outDir, 'list_news.text.md'), listText);
  writeFileSync(path.join(outDir, 'list_news.shape.json'), JSON.stringify({
    contentTypes: listRaw.content.map(c => c.type),
    hasStructuredContent: listRaw.structuredContent != null,
    imageCount: listImgs.length,
    imageBytes: listImgs.map(i => Buffer.from(i.data, 'base64').length),
    markdownCovers: listMd,
    date: bestDate,
  }, null, 2));
  log('list_news markdown image', listMd > 0 || listImgs.length > 0, `items md=${listMd} images=${listImgs.length} date=${bestDate}`);
  if (listImgs.length > 0) {
    log('list_news with thumbs omits structuredContent', listRaw.structuredContent == null, listRaw.structuredContent == null ? 'omitted' : 'HAS SC');
    const total = listImgs.reduce((s, i) => s + Buffer.from(i.data, 'base64').length, 0);
    log('list_news thumb budget', total <= 1_000_000 && listImgs.every(i => Buffer.from(i.data, 'base64').length <= 120_000), `total=${total} n=${listImgs.length}`);
  } else {
    log('list_news has structuredContent (no thumbs loaded)', listRaw.structuredContent != null);
  }
  log('list_news no heat', !/"heat"|heatDescription/.test(JSON.stringify(listRaw)) && !/heat/.test(listText));

  // Detail: prefer an item with cover — get id from SC if present, else from data.json
  let detailId = listRaw.structuredContent?.items?.find(i => i.cover)?.id
    || listRaw.structuredContent?.items?.[0]?.id;
  if (!detailId) {
    const data = JSON.parse(readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    const day = data.days.find(d => d.date === bestDate) || data.days.find(d => (d.signals || []).some(s => s.img));
    const { createHash } = await import('node:crypto');
    const sig = (day.signals || []).find(s => s.img) || day.signals[0];
    const url = (sig.links && sig.links[0] && sig.links[0].url) || '';
    detailId = 'news-' + createHash('sha256').update(JSON.stringify([day.date, sig.originalTitle || sig.title, url])).digest('hex').slice(0, 24);
  }
  const detailRaw = await client.callTool({ name: 'get_news_detail', arguments: { id: detailId } });
  const detailText = detailRaw.content.find(c => c.type === 'text')?.text || '';
  const detailImg = detailRaw.content.find(c => c.type === 'image');
  writeFileSync(path.join(outDir, 'get_news_detail.text.md'), detailText);
  if (detailImg) {
    const bytes = Buffer.from(detailImg.data, 'base64').length;
    writeFileSync(path.join(outDir, 'get_news_detail.image-meta.json'), JSON.stringify({ mimeType: detailImg.mimeType, bytes }, null, 2));
    writeFileSync(path.join(outDir, 'get_news_detail.with-image.shape.json'), JSON.stringify({
      contentTypes: detailRaw.content.map(c => c.type),
      hasStructuredContent: detailRaw.structuredContent != null,
      image: { mimeType: detailImg.mimeType, bytes },
    }, null, 2));
    log('detail markdown image', /!\[/.test(detailText), 'has md');
    log('detail image block via public fetch', true, `mime=${detailImg.mimeType} bytes=${bytes}`);
    log('A1 detail with image omits structuredContent', detailRaw.structuredContent == null, 'omitted');
  } else {
    log('detail image block via public fetch', false, 'no image — cover may be unreachable');
    log('detail has structuredContent when no image', detailRaw.structuredContent != null);
  }

  // no-cover detail
  {
    const data = JSON.parse(readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
    let noCoverId = null;
    const { createHash } = await import('node:crypto');
    for (const day of data.days) {
      for (const sig of day.signals || []) {
        if (!sig.img) {
          const url = (sig.links && sig.links[0] && sig.links[0].url) || '';
          noCoverId = 'news-' + createHash('sha256').update(JSON.stringify([day.date, sig.originalTitle || sig.title, url])).digest('hex').slice(0, 24);
          break;
        }
      }
      if (noCoverId) break;
    }
    if (noCoverId) {
      const nc = await client.callTool({ name: 'get_news_detail', arguments: { id: noCoverId } });
      writeFileSync(path.join(outDir, 'get_news_detail.no-cover.shape.json'), JSON.stringify({
        contentTypes: nc.content.map(c => c.type),
        hasStructuredContent: nc.structuredContent != null,
        hasCover: !!nc.structuredContent?.cover,
      }, null, 2));
      log('A1 no-cover detail has structuredContent', nc.structuredContent != null && !nc.content.some(c => c.type === 'image'));
    } else {
      log('A1 no-cover detail has structuredContent', true, 'skipped — no no-cover item');
    }
  }

  // get_report latest daily
  const reportRaw = await client.callTool({ name: 'get_report', arguments: { period: 'daily', limit: 10 } });
  const reportText = reportRaw.content.find(c => c.type === 'text')?.text || '';
  const reportImgs = reportRaw.content.filter(c => c.type === 'image');
  const reportMd = (reportText.match(/!\[.*?\]\(https:\/\/zhiyike\.cn\/media\//g) || []).length;
  writeFileSync(path.join(outDir, 'get_report.text.md'), reportText);
  writeFileSync(path.join(outDir, 'get_report.shape.json'), JSON.stringify({
    contentTypes: reportRaw.content.map(c => c.type),
    hasStructuredContent: reportRaw.structuredContent != null,
    imageCount: reportImgs.length,
    imageBytes: reportImgs.map(i => Buffer.from(i.data, 'base64').length),
    markdownCovers: reportMd,
    date: reportRaw.structuredContent?.date,
    textNote: /仅 Markdown 外链/.test(reportText),
  }, null, 2));
  log('get_report markdown image', reportMd > 0 || reportImgs.length > 0, `md=${reportMd} images=${reportImgs.length}`);
  if (reportImgs.length > 0) {
    log('get_report with thumbs omits structuredContent', reportRaw.structuredContent == null, 'omitted');
    const total = reportImgs.reduce((s, i) => s + Buffer.from(i.data, 'base64').length, 0);
    log('get_report thumb budget', total <= 1_000_000, `total=${total} n=${reportImgs.length}`);
  } else {
    log('get_report has structuredContent (no thumbs)', reportRaw.structuredContent != null);
  }
  log('get_report no heat', !/heat/.test(reportText) && !/"heat"/.test(JSON.stringify(reportRaw)));

  const dump = listText + reportText + detailText + JSON.stringify(checks);
  log('no excluded source', !/\u6a58\u9e26|juya/i.test(dump));

  const failed = checks.filter(c => !c.ok);
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ version: '1.2.3', checks, failed: failed.length }, null, 2));
  writeFileSync(path.join(outDir, 'run.log'), checks.map(c => `${c.ok ? '✓' : '✗'} ${c.name} ${c.detail || ''}`).join('\n') + `\nALL ${checks.length} ${failed.length ? 'FAILED ' + failed.length : 'PASSED'}\n`);
  console.log(`ALL ${checks.length} ${failed.length ? 'FAILED ' + failed.length : 'PASSED'}`);
  if (failed.length) process.exitCode = 1;
} finally {
  await client.close();
  await new Promise(r => http.close(r));
}
