import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../server/index.js';

describe('Server Static Handler & Health Check', () => {
  const fixtureDir = path.resolve(process.cwd(), 'temp_test_dist');
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    if (!fs.existsSync(fixtureDir)) {
      fs.mkdirSync(fixtureDir, { recursive: true });
    }
    fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<!DOCTYPE html><html><head><title>RPG True Grind</title></head><body>Root</body></html>');
    fs.writeFileSync(path.join(fixtureDir, 'main.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(fixtureDir, 'style.css'), 'body { margin: 0; }');
    fs.writeFileSync(path.join(fixtureDir, 'logo.svg'), '<svg></svg>');
    fs.writeFileSync(path.join(fixtureDir, 'data.json'), '{"game":true}');
    fs.writeFileSync(path.join(fixtureDir, 'game.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));

    server = createServer({ distDir: fixtureDir });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('GET /api/health returns 200 with { ok: true, version } and no secrets', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json');
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(typeof data.version === 'string');
    assert.equal(data.GITHUB_REPORTS_TOKEN, undefined);
    assert.equal(data.token, undefined);
  });

  it('serves static files with correct MIME types', async () => {
    const cases = [
      { path: '/index.html', mime: 'text/html; charset=utf-8' },
      { path: '/main.js', mime: 'text/javascript; charset=utf-8' },
      { path: '/style.css', mime: 'text/css; charset=utf-8' },
      { path: '/logo.svg', mime: 'image/svg+xml' },
      { path: '/data.json', mime: 'application/json; charset=utf-8' },
      { path: '/game.wasm', mime: 'application/wasm' }
    ];

    for (const c of cases) {
      const res = await fetch(`${baseUrl}${c.path}`);
      assert.equal(res.status, 200, `Expected 200 for ${c.path}`);
      assert.equal(res.headers.get('content-type'), c.mime, `Expected MIME ${c.mime} for ${c.path}`);
      const buf = await res.arrayBuffer();
      assert.ok(buf.byteLength > 0, `Expected body for ${c.path}`);
    }
  });

  it('falls back to index.html for SPA routes (e.g. /dungeon or /outpost)', async () => {
    const res = await fetch(`${baseUrl}/dungeon/floor-3`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    const text = await res.text();
    assert.ok(text.includes('<title>RPG True Grind</title>'));
  });

  it('rejects path traversal attempts with 403 Forbidden (/../ and encoded %2e%2e)', async () => {
    const maliciousPaths = [
      '/../package.json',
      '/..\\package.json',
      '/%2e%2e/package.json',
      '/%2e%2e%2fpackage.json',
      '/nested/../../package.json'
    ];

    const addr = server.address() as any;
    for (const badPath of maliciousPaths) {
      const statusCode = await new Promise<number>((resolve, reject) => {
        const clientReq = http.request({
          hostname: '127.0.0.1',
          port: addr.port,
          path: badPath,
          method: 'GET'
        }, (clientRes) => {
          let data = '';
          clientRes.on('data', chunk => data += chunk);
          clientRes.on('end', () => {
            resolve(clientRes.statusCode || 0);
          });
        });
        clientReq.on('error', reject);
        clientReq.end();
      });

      assert.equal(statusCode, 403, `Expected 403 Forbidden for traversal ${badPath}, got ${statusCode}`);
    }
  });
});

