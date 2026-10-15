import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const text = (value: unknown): string => typeof value === 'string'
  ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
  : typeof value === 'number' ? String(value) : '';
const strings = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const publicItem = (item: Row) => !item.flash && !item._reviewBlocked && item.status !== '待复核';
const utcNow = () => new Date().toISOString();
export const todayInBeijing = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date).replaceAll('-', '.');

// 1003v2（小乐 10-13 定）：日报对外日期 = 发布日 = 内容日 + 1 天（纯日历日）。
// 数据里 date 仍是内容日（网址 / 文件名）；pub_date 由发布器写入，缺失时在这里推算。
export function publishDateOf(contentDate: string): string {
  const d = new Date(contentDate.replaceAll('.', '-') + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replaceAll('-', '.');
}

function issuePubDate(issue: Row): string {
  const pub = text(issue.pub_date);
  return /^\d{4}\.\d{2}\.\d{2}$/.test(pub) ? pub : publishDateOf(text(issue.date));
}

export function normalizeDate(value: string): string {
  const normalized = value.replaceAll('-', '.');
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(normalized)) throw new Error('日期须为 YYYY-MM-DD 或 YYYY.MM.DD。');
  const parsed = new Date(normalized.replaceAll('.', '-') + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10).replaceAll('-', '.') !== normalized)
    throw new Error('日期不存在，请检查年月日。');
  return normalized;
}

// 第 3 条：来源名整理。和网页 engine.js originKey、publish_site 来源名修正同一套规则：
// 名字是「原文」、是域名或为空时，用「域名→媒体名」对照表，表里没有就用去掉 www 的域名。
const SOURCE_NAMES: Record<string, string> = {
  'reddit.com': 'Reddit', 'x.com': 'X', 'twitter.com': 'X', 'github.com': 'GitHub', 'huggingface.co': 'Hugging Face',
  'ithome.com': 'IT之家', 'qbitai.com': '量子位', 'jiqizhixin.com': '机器之心', 'aibase.com': 'AIBase', 'ifanr.com': '爱范儿',
  'news.ycombinator.com': 'Hacker News', 'ycombinator.com': 'Hacker News', 'techcrunch.com': 'TechCrunch',
  'theverge.com': 'The Verge', 'openai.com': 'OpenAI', 'anthropic.com': 'Anthropic', 'blog.google': 'Google',
  'deepmind.google': 'Google DeepMind', 'arxiv.org': 'arXiv', 'mp.weixin.qq.com': '微信公众号', 'substack.com': 'Substack',
  'digg.com': 'Digg', 'youtube.com': 'YouTube', 'bloomberg.com': 'Bloomberg', 'reuters.com': 'Reuters',
  'theinformation.com': 'The Information', 'venturebeat.com': 'VentureBeat', '36kr.com': '36氪', 'sspai.com': '少数派',
  'zhihu.com': '知乎', 'bilibili.com': '哔哩哔哩', 'weibo.com': '微博', 'medium.com': 'Medium', 'producthunt.com': 'Product Hunt',
  'ai-bot.cn': 'AI 工具集', 'civitai.com': 'Civitai', 'civitai.red': 'Civitai', 'claude.com': 'Anthropic', 'claude.ai': 'Anthropic',
  'marktechpost.com': 'MarkTechPost', 'the-decoder.com': 'The Decoder', 'businessinsider.com': 'Business Insider',
  'youtu.be': 'YouTube', '404media.co': '404 Media', 'simonwillison.net': 'Simon Willison', 'cnbc.com': 'CNBC',
  'tomshardware.com': "Tom's Hardware", 'cursor.com': 'Cursor', 'x.ai': 'xAI', 'googleblog.com': 'Google', 'mistral.ai': 'Mistral AI',
  'openrouter.ai': 'OpenRouter', 'artificialanalysis.ai': 'Artificial Analysis', 'independent.co.uk': 'The Independent',
  'futurism.com': 'Futurism', 'github.blog': 'GitHub', 'lmsys.org': 'LMSYS', 'bbc.com': 'BBC', 'bbc.co.uk': 'BBC',
  'langchain.com': 'LangChain', 'dwarkesh.com': 'Dwarkesh Podcast', 'dev.to': 'DEV', 'google.com': 'Google', 'nvidia.com': 'NVIDIA',
  'nypost.com': 'New York Post', 'qwen.ai': 'Qwen', '9to5google.com': '9to5Google', '9to5mac.com': '9to5Mac', 'runwayml.com': 'Runway',
  'nytimes.com': 'The New York Times', 'wsj.com': 'WSJ', 'ft.com': 'Financial Times', 'cnn.com': 'CNN', 'engadget.com': 'Engadget',
  'meta.com': 'Meta', 'ai.meta.com': 'Meta AI', 'microsoft.com': 'Microsoft', 'apple.com': 'Apple', 'amazon.com': 'Amazon',
  'aws.amazon.com': 'AWS', 'deepseek.com': 'DeepSeek', 'moonshot.cn': '月之暗面', 'kimi.com': 'Kimi', 'baidu.com': '百度',
  'qq.com': '腾讯', 'sina.com.cn': '新浪', 'sohu.com': '搜狐', '163.com': '网易', 'thepaper.cn': '澎湃新闻', 'jiemian.com': '界面新闻',
  'geekpark.net': '极客公园', 'infoq.cn': 'InfoQ', 'csdn.net': 'CSDN', 'juejin.cn': '稀土掘金', 'v2ex.com': 'V2EX', 'threads.net': 'Threads',
  'linkedin.com': 'LinkedIn', 'tiktok.com': 'TikTok', 'douyin.com': '抖音', 'xiaohongshu.com': '小红书', 'cnbeta.com.tw': 'cnBeta', 'wired.com': 'WIRED', 'arstechnica.com': 'Ars Technica',
};
const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
export function sourceNameFor(name: string, url = ''): string {
  let host = '';
  try { host = bareHost(new URL(url).hostname); } catch { /* 无网址 */ }
  const cleaned = name.trim();
  const generic = !cleaned || cleaned === '原文' || /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(cleaned);
  if (!generic) return cleaned;
  const key = generic && cleaned && cleaned !== '原文' ? bareHost(cleaned.replace(/^https?:\/\//, '').replace(/\/$/, '')) : host;
  for (const candidate of [key, host]) {
    if (!candidate) continue;
    if (SOURCE_NAMES[candidate]) return SOURCE_NAMES[candidate];
    const parent = Object.keys(SOURCE_NAMES).find(domain => candidate.endsWith('.' + domain));
    if (parent) return SOURCE_NAMES[parent];
  }
  return key || host;
}

// 第 7 条：MCP 自带的排除来源兜底过滤（不只靠发布清洗）。
const EXCLUDED = /\u6a58\u9e26|\u006a\u0075\u0079\u0061/i;
let excludedHits = 0;
export const excludedCount = () => excludedHits;
export const isExcluded = (value: unknown) => EXCLUDED.test(typeof value === 'string' ? value : JSON.stringify(value ?? ''));
function noteExcluded(where: string) {
  excludedHits++;
  console.warn(`[zhiyike-mcp] 已过滤排除来源 1 项（${where}）`);
}
// 递归清理：含排除来源的对象（来源、图片等）整项去掉；普通文本里出现则删掉该词；空串字段不输出。
export function scrubOutput<T>(value: T, where = 'output'): T {
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      if (!EXCLUDED.test(input)) return input;
      noteExcluded(where);
      return input.replace(/\u6a58\u9e26[\u4e00-\u9fa5]{0,2}|[\w.-]*\u006a\u0075\u0079\u0061[\w.\/-]*/gi, '').replace(/\s{2,}/g, ' ').trim();
    }
    if (Array.isArray(input)) return input.flatMap(entry => {
      if (entry && typeof entry === 'object' && isExcluded(entry) && ('url' in entry || 'name' in entry || 'credit' in entry)) { noteExcluded(where); return []; }
      return [walk(entry)];
    });
    if (input && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(input)) {
        if ((key === 'cover' || key === 'credit') && isExcluded(entry)) { noteExcluded(where); continue; }
        const next = walk(entry);
        if (next === '' || next === undefined) continue;
        out[key] = next;
      }
      return out;
    }
    return input;
  };
  return walk(value) as T;
}

function links(value: unknown) {
  return rows(value).flatMap(link => {
    try {
      const url = new URL(text(link.url));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
      if (isExcluded([link.name, link.url])) { noteExcluded('sources'); return []; }
      return [{ name: sourceNameFor(text(link.name), url.href), url: url.href }];
    } catch { return []; }
  });
}

// 第 4 条：按完整句子截断，最多 max 个字。
export function cutSentence(value: string, max = 40): string {
  const s = value.trim();
  if ([...s].length <= max) return s;
  const head = [...s].slice(0, max).join('');
  const stop = Math.max(...['。', '！', '？', '；', '，', '、', ',', ';', '!', '?', '：'].map(mark => head.lastIndexOf(mark)));
  return stop >= 8 ? head.slice(0, stop + 1).replace(/[，、,：;；]$/, '') : head + '…';
}

// 第 6 条：封面图。只认 media/ 开头的站内相对路径，拼成 https://zhiyike.cn/...；外站地址一律丢弃。
export const SITE_ORIGIN = 'https://zhiyike.cn';
type ImageInfo = { img: string; meta: Row; fallback?: string };
function coverOf(info: ImageInfo | undefined) {
  if (!info) return undefined;
  const img = info.img.trim();
  if (!/^media\/[A-Za-z0-9._\/-]+\.(jpe?g|png|webp|gif|avif)$/i.test(img) || img.includes('..')) return undefined;
  if (/logo|brand|placeholder|favicon/i.test(img)) return undefined;
  const url = `${SITE_ORIGIN}/${img}`;
  const type = text(info.meta.type).toLowerCase();
  if (info.fallback === 'editorial' || /poster|editorial|template/.test(type)) return { url, type: 'poster' };
  if (/ai-generated|ai_generated|ai-illustration/.test(type) || /AI 生成|AI生成/.test(text(info.meta.source) + text(info.meta.label)))
    return { url, type: 'ai_generated', label: 'AI 生成' };
  const raw = text(info.meta.source);
  if (raw && isExcluded([raw, info.meta.url])) { noteExcluded('cover.credit'); return { url, type: 'source' }; }
  // credit 只留网站名：多段说明取第一段（如「Reddit / r/xxx」→ Reddit），不带网址、作者、授权说明。
  const head = raw.split(/\s+\/\s+|[；;（(，,|]/)[0].trim();
  const credit = head && !/https?:|\//i.test(head) && [...head].length <= 30 ? sourceNameFor(head, text(info.meta.url)) : '';
  return { url, type: 'source', ...(credit ? { credit } : {}) };
}
const imageOf = (item: Row): ImageInfo | undefined => typeof item.img === 'string' && item.img
  ? { img: item.img, meta: row(item.imageMeta), fallback: text(item._imageFallback) } : undefined;

const blocks = (value: unknown) => rows(value).map(block => ({ title: text(block.title), body: text(block.body) })).filter(block => block.body);
const idFor = (kind: string, item: Row, date = '') => `${kind}-${createHash('sha256')
  .update(JSON.stringify([date, text(item.originalTitle) || text(item.title), text(rows(item.links)[0]?.url)]))
  .digest('hex').slice(0, 24)}`;

function newsCard(item: Row, date: string) {
  const reader = row(item.reader);
  return {
    id: idFor('news', item, date), date, publishedAt: text(item.ts), title: text(item.title),
    category: text(item.cat), type: text(item.type), summary: text(reader.summary) || text(item.sum) || text(item.brief),
    sources: links(item.links), publicationStatus: '网站已公开',
    ...(() => { const cover = coverOf(imageOf(item)); return cover ? { cover } : {}; })(),
    ...(text(item.pubDate) ? { originalPublishedAt: text(item.pubDate) } : {}),
  };
}

function newsDetail(item: Row, date: string) {
  const reader = row(item.reader);
  return {
    ...newsCard(item, date), points: strings(item.points),
    change: text(reader.change), importance: text(reader.importance) || text(item.why),
    deep: blocks(reader.deep), watch: blocks(reader.watch),
    sourceType: text(reader.sourceType) || text(item.ver),
  };
}

function libraryEntry(item: Row, kind: 'products' | 'concepts') {
  return {
    id: text(item.id) || idFor(kind, item), kind, title: text(item.title),
    updatedAt: text(item.ts), category: text(item.cat), categories: strings(item.cats),
    summary: text(row(item.reader).summary) || text(item.sum) || text(item.brief),
    points: strings(item.points), sources: links(item.links),
    ...(kind === 'products' && item.oldNews === true ? { oldNews: true, label: '旧闻收录' } : {}),
    ...(kind === 'concepts' ? {
      status: text(item.status), aliases: strings(item.aliases), plainExplanation: text(item.plainExplanation),
      mechanism: strings(item.mechanism), useCases: strings(item.useCases), notThis: text(item.notThis),
      misconceptions: text(item.misconceptions), comparison: text(item.comparison),
      relatedConcepts: rows(item.relatedConcepts).map(value => ({ id: text(value.id), name: text(value.name) })),
    } : { vendor: text(item.vendor), change: text(row(item.reader).change), deep: blocks(row(item.reader).deep),
      ...(() => { const cover = coverOf(imageOf(item)); return cover ? { cover } : {}; })() }),
  };
}

function githubEntry(item: Row) {
  return {
    rank: Number(item.rank) || 0, repo: text(item.repo),
    name: text(item.name) || text(item.repo).split('/')[1] || '', owner: text(item.owner) || (text(item.repo).includes('/') ? text(item.repo).split('/')[0] : ''),
    url: links([{ url: item.url }])[0]?.url || '',
    description: text(item.bodyZh) || text(item.descriptionZh) || text(item.description),
    category: text(item.category), language: text(item.language),
    totalStars: Number(item.totalStars) || 0, starsPeriod: Number(item.starsPeriod) || 0,
  };
}

function page<T>(items: T[], limit = 10, offset = 0) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw new Error('每页数量须为 1–20，起始位置须为非负整数。');
  return { total: items.length, offset, limit, nextOffset: offset + limit < items.length ? offset + limit : null, items: items.slice(offset, offset + limit) };
}

const matches = (value: unknown, query = '') => query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  .every(word => JSON.stringify(value).toLocaleLowerCase().includes(word));

// Every response is projected through an allowlist above. Never expose raw data,
// local paths, review evidence, service logs, credentials, or browser bookmarks.
export class PublishedContent {
  private cache = new Map<string, { signature: string; data: Row }>();
  readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  private async read(relative: string): Promise<Row> {
    try {
      const root = await realpath(this.root);
      const file = await realpath(path.resolve(root, relative));
      if (!file.startsWith(root + path.sep)) throw new Error('outside content root');
      const info = await stat(file);
      if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error('invalid data size');
      const signature = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
      const previous = this.cache.get(relative);
      if (previous?.signature === signature) return previous.data;
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid data');
      const data = row(parsed);
      // Only fixed data files and validated published report paths are cached.
      if (this.cache.size >= 128) this.cache.clear();
      this.cache.set(relative, { signature, data });
      return data;
    } catch {
      this.cache.delete(relative);
      throw new Error('公开内容暂时无法读取，请稍后重试。');
    }
  }

  private async main() {
    const data = await this.read('data.json');
    if (!Array.isArray(data.days) || !Array.isArray(data.products) || !Array.isArray(data.concepts))
      throw new Error('公开内容结构不完整，请稍后重试。');
    return data;
  }

  private imageIndex(data: Row) {
    const map = new Map<string, ImageInfo>();
    for (const day of rows(data.days)) for (const item of rows(day.signals)) { const info = imageOf(item); if (info && !map.has(info.img)) map.set(info.img, info); }
    for (const item of rows(data.products)) { const info = imageOf(item); if (info && !map.has(info.img)) map.set(info.img, info); }
    return map;
  }

  private news(data: Row) {
    return rows(data.days).flatMap(day => rows(day.signals).filter(publicItem)
      .filter(item => text(item.title)).map(item => ({ item, date: text(day.date) })));
  }

  async listNews(args: { date?: string; query?: string; limit?: number; offset?: number } = {}) {
    const data = await this.main();
    const date = args.date ? normalizeDate(args.date) : todayInBeijing();
    const items = this.news(data).filter(entry => entry.date === date)
      .map(entry => ({ card: newsCard(entry.item, entry.date), sourceNames: strings(entry.item.srcs) }))
      .filter(({ card, sourceNames }) => matches([card.title, card.summary, card.category, card.type,
        sourceNames, card.sources.map(source => source.name)], args.query))
      .map(({ card }) => card)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const availableDates = [...new Set(this.news(data).map(entry => entry.date))].sort().reverse();
    return scrubOutput({ date, timezone: 'Asia/Shanghai', dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(),
      availableDates, ...page(items, args.limit, args.offset),
      note: items.length ? '仅返回网站已公开内容，按发布时间从新到旧排列。' : '该日期暂无匹配的已公开新闻，未用其他日期内容冒充。' }, 'list_news');
  }

  async getNews(id: string) {
    const data = await this.main();
    const found = this.news(data).find(entry => idFor('news', entry.item, entry.date) === id);
    if (!found) throw new Error('这条新闻不存在或尚未公开，请先查询新闻列表。');
    return scrubOutput({ dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(), ...newsDetail(found.item, found.date) }, 'get_news_detail');
  }

  async searchLibrary(args: { kind: 'products' | 'concepts'; query?: string; limit?: number; offset?: number }) {
    const data = await this.main();
    const items = rows(data[args.kind]).filter(publicItem)
      .filter(item => args.kind !== 'concepts' || item.status === '已沉淀')
      .map(item => libraryEntry(item, args.kind)).filter(item => matches([
        item.title, item.summary, item.category, item.categories, item.points,
        'plainExplanation' in item ? [item.plainExplanation, item.aliases, item.mechanism, item.useCases] : item.vendor,
      ], args.query));
    return scrubOutput({ kind: args.kind, dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(), ...page(items, args.limit, args.offset) }, 'search_library');
  }

  private async reportIndex(period: 'daily' | 'weekly') {
    const index = await this.read(period === 'daily' ? 'report/index.json' : 'report/weekly/index.json');
    if (!Array.isArray(index.issues)) throw new Error('日报或周报目录暂时无法读取。');
    return rows(index.issues).filter(publicItem).filter(issue => {
      const date = text(issue.date);
      return period === 'daily' ? /^\d{4}\.\d{2}\.\d{2}$/.test(date) : /^\d{4}-W\d{2}$/.test(date);
    }).sort((a, b) => text(b.date).localeCompare(text(a.date)));
  }

  async listReports(args: { period: 'daily' | 'weekly'; limit?: number; offset?: number }) {
    const issues = await this.reportIndex(args.period);
    const paged = page(issues, args.limit, args.offset);
    const items = await Promise.all(paged.items.map(async issue => {
      // 目录里的 excerpt 是定格脚本按字数硬截的，这里改用该期第一条标题按完整句子截断（最多 40 字）。
      let first = '';
      try {
        const file = args.period === 'daily' ? `${text(issue.date)}.json` : `week-${text(issue.date)}.json`;
        first = text(rows((await this.read(`report/issues/${file}`)).items)[0]?.title);
      } catch { /* 读不到就退回目录里的 excerpt */ }
      return {
        // 日报：date = 发布日（期号日期，和网站一致），contentDate = 新闻所属日；周报不变
        date: args.period === 'daily' ? issuePubDate(issue) : text(issue.date),
        ...(args.period === 'daily' ? { contentDate: text(issue.date) } : {}),
        no: Number(issue.no) || 0, excerpt: cutSentence(first || text(issue.excerpt)), total: Number(issue.total) || 0,
        startDate: text(issue.start_date), endDate: text(issue.end_date),
      };
    }));
    return scrubOutput({ period: args.period, retrievedAt: utcNow(), ...paged, items }, 'list_reports');
  }

  async getReport(args: { period: 'daily' | 'weekly'; date?: string; limit?: number; offset?: number }) {
    const issues = await this.reportIndex(args.period);
    let date = args.date ? args.period === 'daily' ? normalizeDate(args.date) : args.date : text(issues[0]?.date);
    if (args.date && args.period === 'daily') {
      // 先按发布日（用户看到的期号日期）找；找不到再按内容日，兼容旧调用
      const byPub = issues.find(issue => issuePubDate(issue) === date);
      if (byPub) date = text(byPub.date);
    }
    if (!date || !issues.some(issue => issue.date === date)) throw new Error('这期日报或周报尚未发布，请先查询目录。');
    // Do not follow paths or URLs supplied by callers or embedded in the index.
    const file = args.period === 'daily' ? `${date}.json` : `week-${date}.json`;
    const report = await this.read(`report/issues/${file}`);
    if (report.date !== date || !Array.isArray(report.items) || !publicItem(report)) throw new Error('这期内容尚未准备完整。');
    const images = this.imageIndex(await this.main());
    const items = rows(report.items).filter(publicItem).map(item => {
      const sources = links(item.links);
      const info = imageOf(item);
      const cover = coverOf(info ? (images.get(info.img) ? { ...images.get(info.img)!, ...(Object.keys(info.meta).length ? { meta: info.meta } : {}) } : info) : undefined);
      // 日报条目的 src 有时是分类（如「并购」），来源名以 sources 整理后的名字为准。
      const srcRaw = text(item.src);
      const source = sources.length ? [...new Set(sources.map(entry => entry.name))].join(' · ') : (srcRaw && srcRaw !== text(item.type) ? sourceNameFor(srcRaw) : '');
      return { title: text(item.title), summary: text(item.sum), type: text(item.type), source,
        sources, section: text(item.section), ...(cover ? { cover } : {}) };
    });
    const firstTitle = text(items[0]?.title);
    return scrubOutput({ period: args.period, date: args.period === 'daily' ? issuePubDate(report) : date,
      ...(args.period === 'daily' ? { contentDate: date } : {}),
      no: Number(report.no) || 0, summary: text(report.one_line) || cutSentence(firstTitle),
      startDate: text(report.start_date), endDate: text(report.end_date), retrievedAt: utcNow(),
      coverageTotal: Number(report.total) || items.length, ...page(items, args.limit, args.offset),
      // Weekly issues may contain a historical GitHub snapshot; never substitute today's list.
      githubSnapshotAt: text(report.github_snapshot_at), githubWeekly: rows(report.github_weekly).slice(0, 20).map(githubEntry) }, 'get_report');
  }

  async github(args: { period: 'daily' | 'weekly'; limit?: number; offset?: number }) {
    const data = await this.read('github-trending.json');
    if (!Array.isArray(data[args.period])) throw new Error('GitHub 榜单暂时无法读取。');
    return scrubOutput({ period: args.period, dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(),
      source: links([{ url: data.source }])[0]?.url || '', ...page(rows(data[args.period]).map(githubEntry), args.limit, args.offset),
      note: '这是注明更新时间的榜单快照，不代表实时 GitHub 排名。' }, 'github_trending');
  }

  async health() {
    const reportReady = async (period: 'daily' | 'weekly') => {
      const issues = await this.reportIndex(period);
      if (issues.length) await this.getReport({ period, limit: 1 });
      return { total: issues.length };
    };
    const checks = await Promise.allSettled([
      this.main(), reportReady('daily'), reportReady('weekly'), this.github({ period: 'daily', limit: 1 }),
      this.github({ period: 'weekly', limit: 1 }),
    ]);
    const names = ['content', 'dailyReports', 'weeklyReports', 'githubDaily', 'githubWeekly'];
    const main = checks[0].status === 'fulfilled' ? row(checks[0].value) : {};
    return { service: 'zhiyike-mcp', status: checks.every(check => check.status === 'fulfilled') ? 'ready' : 'degraded',
      readOnly: true, dataUpdatedAt: text(main.generatedAt), checkedAt: utcNow(),
      sources: Object.fromEntries(checks.map((check, i) => [names[i], check.status === 'fulfilled' ? 'ready' : 'unavailable'])) };
  }
}
