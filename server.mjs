// Zero-dependency static file server:  node server.mjs [port]
// The app is 100% static, so any static host works; this is for local use and Docker.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = +(process.argv[2] || process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const compressible = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
const publicDirs = ['index.html', 'css', 'js', 'data', 'vendor', 'favicon.svg'];

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  const rel = file.slice(root.length + 1);
  if (!file.startsWith(root) || !publicDirs.some((d) => rel === d || rel.startsWith(d + '/'))) { res.writeHead(404).end('Not found'); return; }
  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (!st.isFile()) { res.writeHead(404).end('Not found'); return; }
  const ext = extname(file);
  const headers = {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': ['.html', '.js', '.mjs', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
  };
  if (compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    createReadStream(file).pipe(createGzip()).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  }
}).listen(port, () => console.log(`Overhead → http://localhost:${port}`));
