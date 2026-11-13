// Application server entry point.
//
// Wraps Next.js with a plain Node HTTP server so that diagnostic and tunnelling methods (TRACE, TRACK, CONNECT) are
// refused with 405 before the framework builds a Request object (the framework answers them with a 500 page).
//
//   node server.mjs            production (requires `npm run build` first)
//   node server.mjs --dev      development with hot reload
//
// Host and port: 127.0.0.1 and PORT (default 3200). Never bind to 0.0.0.0 in this local build.

import http from 'node:http';
import next from 'next';

const dev = process.argv.includes('--dev');
const hostname = '127.0.0.1';
const port = Number(process.env.PORT || 3200);
const REFUSED = new Set(['TRACE', 'TRACK', 'CONNECT']);

const app = next({ dev, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

const server = http.createServer((req, res) => {
  if (REFUSED.has(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS', 'Content-Length': '0' });
    res.end();
    return;
  }
  handle(req, res);
});

server.listen(port, hostname, () => {
  console.log(JSON.stringify({ msg: 'listening', mode: dev ? 'development' : 'production', url: `http://${hostname}:${port}` }));
});
