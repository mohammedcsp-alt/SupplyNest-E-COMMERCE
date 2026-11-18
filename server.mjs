// Application server entry point.
//
// Wraps Next.js with a plain Node HTTP server so that diagnostic and tunnelling methods (TRACE, TRACK, CONNECT) are
// refused with 405 before the framework builds a Request object (the framework answers them with a 500 page).
//
//   node server.mjs            production (requires `npm run build` first)
//   node server.mjs --dev      development with hot reload
//
// Host and port: 127.0.0.1 and PORT (default 3200). Never bind to 0.0.0.0 in this local build.
// Environment read after Next.js loads .env:
//   TRUSTED_PROXY_ADDRESSES  peers allowed to supply forwarding headers (default loopback)
//   TAILNET_ALLOWED_USERS    tailnet logins allowed through Tailscale Serve (empty = no extra restriction)

import http from 'node:http';
import next from 'next';
import {
  applyTrustHeaders,
  parseAllowedTailnetUsers,
  parseTrustedProxies,
  resolveClientTrust,
  tailnetUserDecision,
} from './lib-server/client-trust.mjs';

const dev = process.argv.includes('--dev');
const hostname = '127.0.0.1';
const port = Number(process.env.PORT || 3200);
const REFUSED = new Set(['TRACE', 'TRACK', 'CONNECT']);

const app = next({ dev, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

// Read after prepare(): Next.js has loaded .env by now.
const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXY_ADDRESSES);
const allowedTailnetUsers = parseAllowedTailnetUsers(process.env.TAILNET_ALLOWED_USERS);

const server = http.createServer((req, res) => {
  if (REFUSED.has(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS', 'Content-Length': '0' });
    res.end();
    return;
  }
  // Decide trust from the TCP peer only, then overwrite the internal headers the app reads (see lib-server/client-trust.mjs).
  const trust = resolveClientTrust({ socketAddress: req.socket.remoteAddress, headers: req.headers, trustedProxies });
  if (tailnetUserDecision({ trustedPeer: trust.trustedPeer, headers: req.headers, allowedUsers: allowedTailnetUsers }) === 'deny') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Access denied for this tailnet account.');
    return;
  }
  req.headers = applyTrustHeaders(req.headers, trust);
  handle(req, res);
});

server.listen(port, hostname, () => {
  console.log(JSON.stringify({ msg: 'listening', mode: dev ? 'development' : 'production', url: `http://${hostname}:${port}`, tailnetAllowList: allowedTailnetUsers.size }));
});
