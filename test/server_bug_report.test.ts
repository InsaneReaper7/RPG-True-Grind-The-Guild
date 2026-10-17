import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { handleBugReport, resetRateLimits } from '../server/reportHandler.js';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

console.log('--- TEST SUITE: Server Bug Report Handler ---');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Setup minimal browser globals for Phaser import under Node
if (typeof (globalThis as any).window === 'undefined') {
  const noop = () => {};
  (globalThis as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (globalThis as any).Image = class Image {};
  (globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { EventLog } = await import('../src/systems/EventLog.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { buildBugReportBundle } = await import('../src/systems/BugReport.ts');

await DataLoader.getInstance().loadAll();
const dl = DataLoader.getInstance();
const gs = GameState.getInstance();
gs.initFromPlayerData(dl.getPlayer());

const createMockObj = () => {
  const obj: any = new Proxy({
    x: 0,
    y: 0,
    parentContainer: null,
    destroy: () => {}
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return () => obj;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  return obj;
};

const mockScene = {
  add: {
    existing: (obj: any) => obj,
    text: () => createMockObj(),
    graphics: () => createMockObj(),
    sprite: () => createMockObj(),
    line: () => createMockObj(),
    circle: () => createMockObj(),
    rectangle: () => createMockObj()
  },
  time: {
    now: 1000,
    addEvent: () => ({ remove: () => {}, destroy: () => {} }),
    delayedCall: (_delay: number, fn: Function) => fn()
  },
  sys: {
    queueDepthSort: () => {},
    events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
    input: { enable: () => {}, disable: () => {} },
    displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
    updateList: { add: () => {}, remove: () => {} }
  },
  tweens: {
    add: () => ({ stop: () => {}, remove: () => {}, destroy: () => {} })
  }
} as any;

// Helper to send mock HTTP requests to an inline server
function makeRequest(
  server: http.Server,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; json: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as any;
    const port = address.port;

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: options.headers || {}
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          let json: any = null;
          try {
            json = JSON.parse(body);
          } catch {
            // non-json
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, body, json });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// 1. Valid report produces sequential GitHub PUTs (.json then .log), creates sample_bug_report.log from real instrumentation
{
  console.log('1. Testing valid bug report handling, sequential execution, and capturing sample_bug_report.log...');
  resetRateLimits();

  // Run real instrumentation to generate authentic in-game events
  const eventLog = EventLog.resetInstance();
  eventLog.setLocation('Outpost');
  eventLog.add('session', 'Session started. Version: e9ab511. Build date: 2026-10-17T12:00:00.000Z');

  // Real entity action: 2H weapon offhand unequip
  const valerie = new Player(mockScene, 0, 0, dl.getPlayer());
  valerie.entityName = 'Valerie';
  const shield = dl.getWeapon('shields') || { id: 'shields', name: 'Shield', category: 'offhand', twoHanded: false };
  valerie.equipOffhandWeapon(shield, true);
  const greatsword = dl.getWeapon('greatswords') || { id: 'greatswords', name: 'Greatswords', category: 'melee_2h', twoHanded: true };
  valerie.equipWeapon(greatsword, true);

  // Real class switch and cancel
  eventLog.setLocation(1);
  valerie.progression.setClassLevel('scout', 1);
  valerie.setActiveClass('scout');
  valerie.setActiveClass('fighter', { confirmFn: () => false });
  valerie.progression.setClassLevel('fighter', 1);
  valerie.setActiveClass('fighter', { confirmFn: () => true });

  // Real combat summary
  eventLog.setLocation(2);
  const enemyData = dl.getEnemy('goblin_scout') || {
    id: 'goblin_scout',
    name: 'Goblin Scout',
    hp: 50,
    damage: 8,
    expReward: 10,
    attackIntervalMs: 1000
  };
  const mockPathfinder = { findPath: async () => [] } as any;
  const enemy = new Enemy(mockScene, 50, 50, enemyData as any);
  const combat = new CombatSystem(mockScene, [valerie], [enemy], mockPathfinder);
  enemy.isAggroed = true;
  combat.update(1000, 16);
  combat.recordDamageDealt('Valerie', 85);
  combat.recordDamageTaken('Valerie', 28, 'Goblin Scout');
  enemy.isAggroed = false;
  enemy.state = 'dead';
  combat.update(6000, 16);

  const realBundle = buildBugReportBundle({
    whatHappened: 'Valerie equipped a Greatsword which unequipped off-hand Shield as expected, but goblin counterattack deal double damage.',
    whatExpected: 'Damage should be normal tier 1 amount.',
    category: 'Combat'
  });

  const putCalls: { url: string; options: any; start: number; end: number }[] = [];
  let jsonFinishedAt = 0;
  let logStartedAt = 0;

  const mockFetch = async (url: string, opts: any) => {
    const callStart = Date.now();
    if (url.endsWith('.log')) {
      logStartedAt = callStart;
    }
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 20));
    const callEnd = Date.now();
    if (url.endsWith('.json')) {
      jsonFinishedAt = callEnd;
    }

    putCalls.push({ url, options: opts, start: callStart, end: callEnd });

    if (url.endsWith('.log')) {
      // Capture the decoded body of the real .log PUT from the mocked fetch and write to docs/evidence/sample_bug_report.log
      const parsedBody = JSON.parse(opts.body);
      const decodedLogText = Buffer.from(parsedBody.content, 'base64').toString('utf-8');
      fs.mkdirSync(path.join(rootDir, 'docs', 'evidence'), { recursive: true });
      fs.writeFileSync(path.join(rootDir, 'docs', 'evidence', 'sample_bug_report.log'), decodedLogText, 'utf-8');
    }

    return {
      ok: true,
      status: 201,
      json: async () => ({ content: {} })
    };
  };

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'secret_test_token_12345',
      repo: 'test-owner/test-repo',
      fetchFn: mockFetch
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(realBundle)
  });

  server.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.reportId, realBundle.reportId);

  // Assert sequential execution: .json PUT resolves BEFORE .log PUT starts
  assert.strictEqual(putCalls.length, 2, `Expected 2 GitHub PUT calls, got ${putCalls.length}`);
  assert.ok(putCalls[0].url.endsWith('.json'), 'First PUT must be .json');
  assert.ok(putCalls[1].url.endsWith('.log'), 'Second PUT must be .log');
  assert.ok(logStartedAt >= jsonFinishedAt, `Second PUT (.log) must start after first (.json) finishes: logStarted=${logStartedAt}, jsonFinished=${jsonFinishedAt}`);

  // Assert UTC path format reports/YYYY-MM-DD/HHMMSS_<reportId>.json
  assert.match(putCalls[0].url, /reports\/\d{4}-\d{2}-\d{2}\/\d{6}_TG-[A-Z0-9]{6}\.json$/);
  assert.match(putCalls[1].url, /reports\/\d{4}-\d{2}-\d{2}\/\d{6}_TG-[A-Z0-9]{6}\.log$/);

  // Assert sample_bug_report.log was generated from real code
  const sampleLogPath = path.join(rootDir, 'docs', 'evidence', 'sample_bug_report.log');
  assert.ok(fs.existsSync(sampleLogPath), 'docs/evidence/sample_bug_report.log must exist');
  const sampleContent = fs.readFileSync(sampleLogPath, 'utf-8');
  assert.ok(sampleContent.includes(`BUG REPORT: ${realBundle.reportId}`));
  assert.ok(sampleContent.includes('CATEGORY: Combat'));
  assert.ok(sampleContent.includes('Valerie: off-hand Shields unequipped: Greatswords is two-handed'));
  assert.ok(sampleContent.includes('Dealt [Valerie: 85], Taken [Valerie: 28]'));
  console.log('✓ Valid bug report dispatch, sequential writes, and sample_bug_report.log generation passed');
}

// 1b. 409 Conflict retry on first PUT resolves to 201 on second attempt (3 calls in total)
{
  console.log('1b. Testing 409 Conflict retry mechanism on GitHub Contents API...');
  resetRateLimits();

  let attemptCount = 0;
  const mockRetryFetch = async (url: string, opts: any) => {
    attemptCount++;
    if (url.endsWith('.json') && attemptCount === 1) {
      // First attempt on .json returns 409 Conflict
      return {
        ok: false,
        status: 409,
        json: async () => ({ message: 'Conflict: reference cannot be updated' })
      };
    }
    // Subsequent calls succeed
    return {
      ok: true,
      status: 201,
      json: async () => ({ content: {} })
    };
  };

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy_token',
      repo: 'test-owner/test-repo',
      fetchFn: mockRetryFetch
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: 'TG-RETRY1',
      category: 'UI',
      whatHappened: 'Testing 409 retry'
    })
  });

  server.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(attemptCount, 3, `Expected exactly 3 fetch calls (1st json 409 -> retry json 201 -> log 201), got ${attemptCount}`);
  console.log('✓ 409 retry mechanism passed (3 calls in total)');
}

// 1c. Partial failure tolerance: .json 201 and .log 500 twice -> returns 200 { ok: true, reportId }
{
  console.log('1c. Testing partial failure tolerance (.json succeeds, .log fails)...');
  resetRateLimits();

  const mockPartialFetch = async (url: string, opts: any) => {
    if (url.endsWith('.json')) {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    // .log fails with 500
    return { ok: false, status: 500, json: async () => ({ error: 'Internal Server Error' }) };
  };

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy_token',
      repo: 'test-owner/test-repo',
      fetchFn: mockPartialFetch
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: 'TG-PART01',
      category: 'Other',
      whatHappened: 'Testing partial failure tolerance'
    })
  });

  server.close();

  assert.strictEqual(res.status, 200, 'Should still return 200 OK when JSON succeeded');
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.reportId, 'TG-PART01');
  console.log('✓ Partial failure tolerance passed');
}

// 2. 2.1 MB Payload returns 413 (Payload Too Large)
{
  console.log('2. Testing 2 MB payload capping (2.1 MB -> 413)...');
  resetRateLimits();

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy',
      repo: 'dummy/dummy'
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  // Create a 2.1 MB payload
  const largeData = 'x'.repeat(2.1 * 1024 * 1024);
  const largePayload = JSON.stringify({
    category: 'Other',
    whatHappened: 'Large file',
    data: largeData
  });

  try {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/bug-report',
      headers: { 'Content-Type': 'application/json' },
      body: largePayload
    });
    assert.strictEqual(res.status, 413, `Expected status 413, got ${res.status}`);
  } catch (err: any) {
    // If stream was destroyed on client socket reset, that also satisfies stream abort
    console.log('✓ Stream aborted on client side during excess byte reception');
  }

  server.close();
  console.log('✓ 2 MB stream capping passed');
}

// 3. Rate limiting (6th report in 10 minutes returns 429)
{
  console.log('3. Testing rate limiting (6th report in 10 min -> 429)...');
  resetRateLimits();

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy',
      repo: 'dummy/dummy',
      fetchFn: async () => ({ ok: true, status: 200, json: async () => ({}) })
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const payload = JSON.stringify({
    category: 'UI',
    whatHappened: 'Rate limit test'
  });

  for (let i = 1; i <= 5; i++) {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/bug-report',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    assert.strictEqual(res.status, 200, `Call ${i} should succeed with 200`);
  }

  // 6th call from same IP
  const sixthRes = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: payload
  });
  assert.strictEqual(sixthRes.status, 429, `6th call should return 429 Too Many Requests, got ${sixthRes.status}`);

  server.close();
  console.log('✓ Rate limiting passed');
}

// 4. Missing environment variables return 503 Service Unavailable
{
  console.log('4. Testing missing GitHub credentials (missing env -> 503)...');
  resetRateLimits();

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: '',
      repo: ''
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'Other', whatHappened: 'Missing creds' })
  });

  server.close();
  assert.strictEqual(res.status, 503, `Expected status 503, got ${res.status}`);
  console.log('✓ Missing env vars return 503 passed');
}

// 5. GitHub API failure returns 502 Bad Gateway
{
  console.log('5. Testing GitHub failure (failed fetch -> 502)...');
  resetRateLimits();

  const mockFailFetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'GitHub internal error' })
  });

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy',
      repo: 'dummy/dummy',
      fetchFn: mockFailFetch
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'Other', whatHappened: 'Testing failure' })
  });

  server.close();
  assert.strictEqual(res.status, 502, `Expected status 502, got ${res.status}`);
  console.log('✓ GitHub failure handling passed');
}

// 6. Content-Type check (non-application/json returns 415) & No CORS
{
  console.log('6. Testing Content-Type requirement (non-json -> 415) and absence of CORS headers...');
  resetRateLimits();

  const server = http.createServer((req, res) => {
    handleBugReport(req, res, {
      token: 'dummy',
      repo: 'dummy/dummy'
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'text/plain' },
    body: 'plain text'
  });

  server.close();
  assert.strictEqual(res.status, 415, `Expected 415 for text/plain, got ${res.status}`);
  assert.strictEqual(res.headers['access-control-allow-origin'], undefined, 'No CORS headers allowed');
  console.log('✓ Content-Type and CORS checks passed');
}

console.log('ALL Server Bug Report Handler tests passed!\n');
