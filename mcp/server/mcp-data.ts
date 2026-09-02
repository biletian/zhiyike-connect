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

export function normalizeDate(value: string): string {
  const normalized = value.replaceAll('-', '.');
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(normalized)) throw new Error('日期须为 YYYY-MM-DD 或 YYYY.MM.DD。');
  const parsed = new Date(normalized.replaceAll('.', '-') + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10).replaceAll('-', '.') !== normalized)
    throw new Error('日期不存在，请检查年月日。');
  return normalized;
}

function links(value: unknown) {
  return rows(value).flatMap(link => {
    try {
      const url = new URL(text(link.url));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
      return [{ name: text(link.name) || url.hostname, url: url.href }];
    } catch { return []; }
  });
}
const blocks = (value: unknown) => rows(value).map(block => ({ title: text(block.title), body: text(block.body) })).filter(block => block.body);
const idFor = (kind: string, item: Row, date = '') => `${kind}-${createHash('sha256')
  .update(JSON.stringify([date, text(item.originalTitle) || text(item.title), text(rows(item.links)[0]?.url)]))
  .digest('hex').slice(0, 24)}`;

function newsCard(item: Row, date: string) {
  const reader = row(item.reader);
  return {
    id: idFor('news', item, date), date, publishedAt: text(item.ts), title: text(item.title),
    category: text(item.cat), type: text(item.type), summary: text(reader.summary) || text(item.sum) || text(item.brief),
    heat: text(item.heat), heatDescription: text(item.trend), sources: links(item.links),
    publicationStatus: '网站已公开',
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
    ...(kind === 'concepts' ? {
      status: text(item.status), aliases: strings(item.aliases), plainExplanation: text(item.plainExplanation),
      mechanism: strings(item.mechanism), useCases: strings(item.useCases), notThis: text(item.notThis),
      misconceptions: text(item.misconceptions), comparison: text(item.comparison),
      relatedConcepts: rows(item.relatedConcepts).map(value => ({ id: text(value.id), name: text(value.name) })),
    } : { vendor: text(item.vendor), change: text(row(item.reader).change), deep: blocks(row(item.reader).deep) }),
  };
}

function githubEntry(item: Row) {
  return {
    rank: Number(item.rank) || 0, repo: text(item.repo), name: text(item.name), owner: text(item.owner),
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
      .sort((a, b) => (Number(b.heat) || 0) - (Number(a.heat) || 0) || b.publishedAt.localeCompare(a.publishedAt));
    const availableDates = [...new Set(this.news(data).map(entry => entry.date))].sort().reverse();
    return { date, timezone: 'Asia/Shanghai', dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(),
      availableDates, ...page(items, args.limit, args.offset),
      note: items.length ? '仅返回网站已公开内容；热度为站内记录分值，不代表事实真伪。' : '该日期暂无匹配的已公开新闻，未用其他日期内容冒充。' };
  }

  async getNews(id: string) {
    const data = await this.main();
    const found = this.news(data).find(entry => idFor('news', entry.item, entry.date) === id);
    if (!found) throw new Error('这条新闻不存在或尚未公开，请先查询新闻列表。');
    return { dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(), ...newsDetail(found.item, found.date) };
  }

  async searchLibrary(args: { kind: 'products' | 'concepts'; query?: string; limit?: number; offset?: number }) {
    const data = await this.main();
    const items = rows(data[args.kind]).filter(publicItem)
      .filter(item => args.kind !== 'concepts' || item.status === '已沉淀')
      .map(item => libraryEntry(item, args.kind)).filter(item => matches([
        item.title, item.summary, item.category, item.categories, item.points,
        'plainExplanation' in item ? [item.plainExplanation, item.aliases, item.mechanism, item.useCases] : item.vendor,
      ], args.query));
    return { kind: args.kind, dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(), ...page(items, args.limit, args.offset) };
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
    return { period: args.period, retrievedAt: utcNow(), ...page(issues.map(issue => ({
      date: text(issue.date), no: Number(issue.no) || 0, excerpt: text(issue.excerpt), total: Number(issue.total) || 0,
      startDate: text(issue.start_date), endDate: text(issue.end_date),
    })), args.limit, args.offset) };
  }

  async getReport(args: { period: 'daily' | 'weekly'; date?: string; limit?: number; offset?: number }) {
    const issues = await this.reportIndex(args.period);
    const date = args.date ? args.period === 'daily' ? normalizeDate(args.date) : args.date : text(issues[0]?.date);
    if (!date || !issues.some(issue => issue.date === date)) throw new Error('这期日报或周报尚未发布，请先查询目录。');
    // Do not follow paths or URLs supplied by callers or embedded in the index.
    const file = args.period === 'daily' ? `${date}.json` : `week-${date}.json`;
    const report = await this.read(`report/issues/${file}`);
    if (report.date !== date || !Array.isArray(report.items) || !publicItem(report)) throw new Error('这期内容尚未准备完整。');
    const items = rows(report.items).filter(publicItem).map(item => ({
      title: text(item.title), summary: text(item.sum), type: text(item.type), source: text(item.src),
      sources: links(item.links), heat: text(item.heat), section: text(item.section),
    }));
    return { period: args.period, date, no: Number(report.no) || 0, summary: text(report.one_line),
      startDate: text(report.start_date), endDate: text(report.end_date), retrievedAt: utcNow(),
      coverageTotal: Number(report.total) || items.length, ...page(items, args.limit, args.offset),
      // Weekly issues may contain a historical GitHub snapshot; never substitute today's list.
      githubSnapshotAt: text(report.github_snapshot_at), githubWeekly: rows(report.github_weekly).slice(0, 20).map(githubEntry) };
  }

  async github(args: { period: 'daily' | 'weekly'; limit?: number; offset?: number }) {
    const data = await this.read('github-trending.json');
    if (!Array.isArray(data[args.period])) throw new Error('GitHub 榜单暂时无法读取。');
    return { period: args.period, dataUpdatedAt: text(data.generatedAt), retrievedAt: utcNow(),
      source: links([{ url: data.source }])[0]?.url || '', ...page(rows(data[args.period]).map(githubEntry), args.limit, args.offset),
      note: '这是注明更新时间的榜单快照，不代表实时 GitHub 排名。' };
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
