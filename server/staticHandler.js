import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

export function handleStatic(req, res, distDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Parse raw URL pathname
  let reqUrl;
  try {
    reqUrl = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let pathname = reqUrl.pathname;

  // Path traversal protection: check for raw and percent-encoded dot-dot
  const rawPath = req.url.split('?')[0];
  if (
    rawPath.includes('..') ||
    /%2e/i.test(rawPath) ||
    /%2f/i.test(rawPath) ||
    /%5c/i.test(rawPath)
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  if (decodedPath.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const normalized = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(distDir, normalized);

  // Extra guard: path must stay within distDir
  const resolvedDist = path.resolve(distDir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDist)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let stat;
  try {
    if (fs.existsSync(filePath)) {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        if (fs.existsSync(indexPath)) {
          filePath = indexPath;
          stat = fs.statSync(filePath);
        }
      }
    }
  } catch {
    // stat error
  }

  // SPA fallback to dist/index.html if file doesn't exist
  if (!stat || stat.isDirectory()) {
    const spaIndex = path.join(distDir, 'index.html');
    if (fs.existsSync(spaIndex)) {
      filePath = spaIndex;
      stat = fs.statSync(filePath);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal Server Error');
  });
  stream.pipe(res);
}
