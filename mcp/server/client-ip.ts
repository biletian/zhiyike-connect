import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export function clientIp(req: IncomingMessage, trustLoopbackProxy = false): string {
  const socketIp = req.socket.remoteAddress || 'unknown';
  // Only the loopback-bound production server opts in. Nginx overwrites X-Real-IP;
  // X-Forwarded-For is never accepted, and dev/direct callers cannot opt themselves in.
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socketIp);
  const forwarded = req.headers['x-real-ip'];
  return trustLoopbackProxy && loopback && typeof forwarded === 'string' && isIP(forwarded)
    ? forwarded : socketIp;
}
