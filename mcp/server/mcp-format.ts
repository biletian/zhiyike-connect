// v1.2.3：Markdown 排版 + MCP image（详情较大图；list_news / get_report 缩略图）。
// 含 image 时由 mcp.ts 省略 structuredContent（A1）。加载/压缩失败不挡主结果。
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { SITE_ORIGIN } from './mcp-data.ts';

type Row = Record<string, unknown>;
const asRow = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(asRow) : []);

export type Cover = { url: string; type: string; credit?: string; label?: string };

/** 封面 Markdown：有 cover 才插图；图源规则与 instructions / SKILL 一致。 */
export function coverMarkdown(title: string, cover: Cover | undefined): string[] {
  if (!cover?.url) return [];
  const lines = [`![${title || '封面'}](${cover.url})`];
  if (cover.type === 'source' && cover.credit) lines.push(`图源：${cover.credit}`);
  else if (cover.type === 'ai_generated') lines.push(cover.label || 'AI 生成');
  // poster / source 无 credit：不写图源说明
  return lines;
}

function sourcesLine(sources: unknown): string {
  const links = rows(sources)
    .map(s => {
      const name = str(s.name) || '来源';
      const url = str(s.url);
      return url ? `[${name}](${url})` : name;
    })
    .filter(Boolean);
  return links.length ? links.join(' · ') : '';
}

function beijingDateLabel(dotOrDash: string): string {
  const m = str(dotOrDash).replaceAll('-', '.').match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!m) return str(dotOrDash);
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

export function formatListNews(value: unknown): string {
  const v = asRow(value);
  const items = rows(v.items);
  const date = str(v.date);
  const total = Number(v.total) || items.length;
  const offset = Number(v.offset) || 0;
  const lines: string[] = [];
  lines.push(`# ${beijingDateLabel(date)} · AI 新闻`);
  if (v.dataUpdatedAt) lines.push(`内容更新至：${str(v.dataUpdatedAt)}`);
  if (v.retrievedAt) lines.push(`查询时间：${str(v.retrievedAt)}`);
  if (total) {
    const from = items.length ? offset + 1 : 0;
    const to = offset + items.length;
    lines.push(`共 ${total} 条，本页第 ${from}–${to} 条。`);
  }
  if (v.note) lines.push(str(v.note));
  lines.push('');
  if (!items.length) {
    lines.push('该日期暂无匹配的已公开新闻。');
    return lines.join('\n').trim() + '\n';
  }
  items.forEach((item, i) => {
    const title = str(item.title) || '（无标题）';
    lines.push(`### ${offset + i + 1}. ${title}`);
    lines.push(...coverMarkdown(title, item.cover as Cover | undefined));
    lines.push('');
    const summary = str(item.summary);
    lines.push(summary ? `简介：${summary}` : '简介暂未提供');
    const src = sourcesLine(item.sources);
    lines.push(src ? `信息源：${src}` : '信息源暂未提供');
    if (item.originalPublishedAt) lines.push(`原文发布：${str(item.originalPublishedAt)}`);
    lines.push('');
  });
  if (v.nextOffset != null) lines.push(`还有下一页（nextOffset=${v.nextOffset}）。`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function formatNewsDetail(value: unknown): string {
  const v = asRow(value);
  const title = str(v.title) || '（无标题）';
  const lines: string[] = [`# ${title}`];
  lines.push(...coverMarkdown(title, v.cover as Cover | undefined));
  lines.push('');
  if (v.date) lines.push(`收录日期：${beijingDateLabel(str(v.date))}`);
  if (v.publishedAt) lines.push(`发布时间：${str(v.publishedAt)}`);
  if (v.category || v.type) lines.push(`分类：${[str(v.category), str(v.type)].filter(Boolean).join(' · ')}`);
  if (v.dataUpdatedAt) lines.push(`内容更新至：${str(v.dataUpdatedAt)}`);
  lines.push('');
  const summary = str(v.summary);
  lines.push(summary ? `简介：${summary}` : '简介暂未提供');
  const points = Array.isArray(v.points) ? v.points.map(str).filter(Boolean) : [];
  if (points.length) {
    lines.push('');
    lines.push('要点：');
    for (const p of points) lines.push(`- ${p}`);
  }
  if (v.change) { lines.push(''); lines.push(`变化：${str(v.change)}`); }
  if (v.importance) { lines.push(''); lines.push(`为何重要：${str(v.importance)}`); }
  for (const [key, label] of [['deep', '深入'], ['watch', '后续观察']] as const) {
    const blocks = rows(v[key]);
    if (!blocks.length) continue;
    lines.push('');
    lines.push(`${label}：`);
    for (const b of blocks) {
      if (b.title) lines.push(`#### ${str(b.title)}`);
      if (b.body) lines.push(str(b.body));
    }
  }
  lines.push('');
  const src = sourcesLine(v.sources);
  lines.push(src ? `信息源：${src}` : '信息源暂未提供');
  if (v.sourceType) lines.push(`来源类型：${str(v.sourceType)}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function formatReport(value: unknown): string {
  const v = asRow(value);
  const period = str(v.period) === 'weekly' ? '周报' : '日报';
  const date = str(v.date);
  const lines: string[] = [];
  lines.push(`# ${period} · ${date}${v.no ? `（第 ${v.no} 期）` : ''}`);
  if (v.contentDate) lines.push(`内容所属日：${beijingDateLabel(str(v.contentDate))}`);
  if (v.summary) lines.push(`摘要：${str(v.summary)}`);
  if (v.startDate || v.endDate) lines.push(`覆盖：${str(v.startDate)} – ${str(v.endDate)}`);
  if (v.coverageTotal) lines.push(`收录 ${v.coverageTotal} 条`);
  lines.push('');
  const items = rows(v.items);
  const offset = Number(v.offset) || 0;
  if (!items.length) {
    lines.push('本期暂无条目。');
    return lines.join('\n').trim() + '\n';
  }
  items.forEach((item, i) => {
    const title = str(item.title) || '（无标题）';
    lines.push(`### ${offset + i + 1}. ${title}`);
    lines.push(...coverMarkdown(title, item.cover as Cover | undefined));
    lines.push('');
    if (item.summary) lines.push(`简介：${str(item.summary)}`);
    const src = sourcesLine(item.sources) || str(item.source);
    if (src) lines.push(`来源：${src}`);
    if (item.type || item.section) lines.push(`分类：${[str(item.type), str(item.section)].filter(Boolean).join(' · ')}`);
    lines.push('');
  });
  if (v.nextOffset != null) lines.push(`还有下一页（nextOffset=${v.nextOffset}）。`);
  const gh = rows(v.githubWeekly);
  if (gh.length) {
    lines.push('');
    lines.push('## 本期 GitHub 周榜快照');
    if (v.githubSnapshotAt) lines.push(`快照时间：${str(v.githubSnapshotAt)}`);
    gh.slice(0, 20).forEach((g, i) => {
      lines.push(`${i + 1}. ${str(g.repo) || str(g.name)}${g.description ? ` — ${str(g.description)}` : ''}`);
    });
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const MEDIA_RE = /^media\/[A-Za-z0-9._\/-]+\.(jpe?g|png|webp|gif|avif)$/i;
/** 详情单图上限约 350KB（v1.2.1 起）。 */
export const DETAIL_MAX_IMAGE_BYTES = 350_000;
/** 列表/日报缩略图：单张建议 ≤80–120KB，边长 ≤480。 */
export const THUMB_MAX_IMAGE_BYTES = 100_000;
export const THUMB_MAX_EDGE = 480;
/** 整次响应全部 image 合计上限（约 800KB，落在 500KB–1MB）。 */
export const THUMB_MAX_TOTAL_BYTES = 800_000;
/** 列表/日报最多尝试前 N 条有 cover 的条目。 */
export const THUMB_MAX_ITEMS = 8;
const FETCH_MS = 6000;

export type McpImageBlock = { type: 'image'; mimeType: string; data: string };
export type LoadCoverOpts = {
  maxBytes?: number;
  maxEdge?: number;
  qualities?: number[];
};

function mimeOf(rel: string): string {
  const ext = rel.split('.').pop()?.toLowerCase() || 'jpg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'avif') return 'image/avif';
  return 'image/jpeg';
}

function mediaRelFromUrl(coverUrl: string): string | null {
  let rel = coverUrl.trim();
  if (rel.startsWith(SITE_ORIGIN + '/')) rel = rel.slice(SITE_ORIGIN.length + 1);
  else if (rel.startsWith('/')) rel = rel.slice(1);
  if (!MEDIA_RE.test(rel) || rel.includes('..')) return null;
  return rel;
}

function compressJpeg(buf: Buffer, maxBytes: number, maxEdge: number, qualities: number[]): Promise<Buffer | null> {
  const qs = qualities.length ? qualities : [72, 60, 48];
  const qTuple = `(${qs.join(', ')})`;
  return new Promise(resolve => {
    let done = false;
    const finish = (value: Buffer | null) => { if (!done) { done = true; resolve(value); } };
    const py = spawn('python3', ['-c', `
import sys
from PIL import Image
import io
raw = sys.stdin.buffer.read()
im = Image.open(io.BytesIO(raw))
im = im.convert("RGB")
im.thumbnail((${maxEdge}, ${maxEdge}))
best = None
for q in ${qTuple}:
    out = io.BytesIO()
    im.save(out, "JPEG", quality=q, optimize=True)
    data = out.getvalue()
    best = data
    if len(data) <= ${maxBytes}:
        break
sys.stdout.buffer.write(best or b"")
`], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { try { py.kill('SIGKILL'); } catch { /* */ } finish(null); }, 8000);
    py.stdout.on('data', (c: Buffer) => chunks.push(c));
    py.on('error', () => { clearTimeout(timer); finish(null); });
    py.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return finish(null);
      const out = Buffer.concat(chunks);
      finish(out.length ? out : null);
    });
    py.stdin.end(buf);
  });
}

/**
 * 优先读 dataDir 下 media/；没有则短超时拉公网绝对 URL。
 * opts 可压成缩略图（更小边长/更低 quality）；失败返回 null（调用方只保留 Markdown）。
 */
export async function loadCoverImage(
  dataDir: string,
  coverUrl: string,
  opts?: LoadCoverOpts,
): Promise<McpImageBlock | null> {
  const maxBytes = opts?.maxBytes ?? DETAIL_MAX_IMAGE_BYTES;
  const maxEdge = opts?.maxEdge ?? 900;
  const qualities = opts?.qualities ?? [72, 60, 48];
  try {
    const rel = mediaRelFromUrl(coverUrl);
    if (!rel) return null;
    const root = path.resolve(dataDir);
    let buf: Buffer | null = null;
    const local = path.resolve(root, rel);
    if (local.startsWith(root + path.sep)) {
      try {
        const info = await stat(local);
        if (info.isFile() && info.size > 0 && info.size <= 4 * 1024 * 1024) buf = await readFile(local);
      } catch { /* 本地没有就尝试公网 */ }
    }
    if (!buf) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
      try {
        const res = await fetch(coverUrl, { signal: ctrl.signal, redirect: 'follow' });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (ab.byteLength > 0 && ab.byteLength <= 4 * 1024 * 1024) buf = Buffer.from(ab);
        }
      } catch { /* 降级 */ }
      finally { clearTimeout(timer); }
    }
    if (!buf) return null;
    let mime = mimeOf(rel);
    const needCompress = buf.length > maxBytes || maxEdge < 900;
    if (needCompress) {
      const compressed = await compressJpeg(buf, maxBytes, maxEdge, qualities);
      if (!compressed || compressed.length > maxBytes) return null;
      buf = compressed;
      mime = 'image/jpeg';
    }
    return { type: 'image', mimeType: mime, data: buf.toString('base64') };
  } catch {
    return null;
  }
}

const THUMB_OPTS: LoadCoverOpts = {
  maxBytes: THUMB_MAX_IMAGE_BYTES,
  maxEdge: THUMB_MAX_EDGE,
  qualities: [58, 48, 38],
};

/**
 * 为 list_news / get_report 的条目加载缩略图。
 * 按顺序处理有 cover 的条目，最多 THUMB_MAX_ITEMS 张；合计超 THUMB_MAX_TOTAL_BYTES 则截断。
 * textNote 供调用方追加到 Markdown（其余条目仅外链）。
 */
export async function loadCoverThumbnails(
  dataDir: string,
  items: Array<{ cover?: { url?: string } | null } | null | undefined>,
  opts?: { maxItems?: number; maxTotalBytes?: number },
): Promise<{ images: McpImageBlock[]; textNote?: string; attempted: number; loaded: number; truncated: boolean }> {
  const maxItems = opts?.maxItems ?? THUMB_MAX_ITEMS;
  const maxTotal = opts?.maxTotalBytes ?? THUMB_MAX_TOTAL_BYTES;
  const images: McpImageBlock[] = [];
  let totalBytes = 0;
  let attempted = 0;
  let truncated = false;
  const withCover = (items || []).filter(it => it && typeof it === 'object' && it.cover?.url);
  for (const item of withCover) {
    if (images.length >= maxItems) { truncated = true; break; }
    attempted++;
    const url = item!.cover!.url!;
    try {
      const img = await loadCoverImage(dataDir, url, THUMB_OPTS);
      if (!img) continue;
      const bytes = Buffer.from(img.data, 'base64').length;
      if (totalBytes + bytes > maxTotal) { truncated = true; break; }
      images.push(img);
      totalBytes += bytes;
    } catch {
      // 单张失败继续下一张
    }
  }
  // 因条数/体积上限未纳入的有封面条目 → 在 text 注明
  const remainingCovers = withCover.length - images.length;
  let textNote: string | undefined;
  if (truncated && remainingCovers > 0) {
    textNote = `（缩略图已附前 ${images.length} 条；其余有封面的条目仅 Markdown 外链，完整图请用 get_news_detail。）`;
  }
  return { images, textNote, attempted, loaded: images.length, truncated };
}
