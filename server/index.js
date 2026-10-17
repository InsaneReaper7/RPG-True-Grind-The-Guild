import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleStatic } from './staticHandler.js';
import { handleBugReport } from './reportHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

export function handleHealthCheck(req, res) {
  const version = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || '0.1.0';
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, version }));
}

export function createServer(options = {}) {
  const currentDistDir = options.distDir || distDir;

  return http.createServer(async (req, res) => {
    // Basic URL parsing
    let reqUrl;
    try {
      reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    const pathname = reqUrl.pathname;

    // Health check endpoint
    if (pathname === '/api/health' && req.method === 'GET') {
      handleHealthCheck(req, res);
      return;
    }

    // Bug report endpoint
    if (pathname === '/api/bug-report' && req.method === 'POST') {
      await handleBugReport(req, res, options);
      return;
    }

    // Static assets & SPA fallback
    handleStatic(req, res, currentDistDir);
  });
}

// When run directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Server] RPG True Grind server listening on http://0.0.0.0:${port}`);
  });
}
