import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpHandler } from './mcp.ts';

const port = Number(process.env.MCP_PORT || 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT 端口设置无效。');
const handler = createMcpHandler({
  dataDir: process.env.MCP_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site'),
  publicUrl: process.env.MCP_PUBLIC_URL,
  trustLoopbackProxy: process.env.MCP_TRUST_LOOPBACK_PROXY === '1',
});
const server = createServer((req, res) => { void handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`知一刻只读 MCP 服务：http://127.0.0.1:${port}/mcp`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
