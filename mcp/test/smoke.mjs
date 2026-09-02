import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler } from '../server/mcp.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const handler = createMcpHandler({ dataDir: path.resolve(here, '../sample-data'), requestsPerMinute: 100 });
const httpServer = createServer((req, res) => { void handler(req, res); });
await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
const address = httpServer.address();
assert.ok(address && typeof address !== 'string');
const client = new Client({ name: 'zhiyike-public-smoke', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'get_news_detail', 'get_report', 'github_trending', 'list_news', 'list_reports', 'search_library',
  ]);
  assert.ok(tools.every(tool => tool.annotations?.readOnlyHint && tool.annotations?.destructiveHint === false));
  const response = await client.callTool({ name: 'list_news', arguments: { date: '2026-09-02', limit: 1 } });
  assert.equal(response.isError, undefined);
  assert.equal(response.structuredContent.total, 1);
  console.log('MCP 公开源码检查通过：六个只读工具，示例新闻可读取。');
} finally {
  await client.close();
  await new Promise(resolve => httpServer.close(resolve));
}
