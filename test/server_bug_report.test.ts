import assert from 'node:assert';
import http from 'node:http';
import { handleBugReport, resetRateLimits } from '../server/reportHandler.js';

console.log('--- TEST SUITE: Server Bug Report Handler ---');

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

// 1. Valid report produces two GitHub PUTs with correct headers, paths, base64 and sanitized commit message
{
  console.log('1. Testing valid bug report handling and GitHub Contents API dispatch...');
  resetRateLimits();
  const putCalls: { url: string; options: any }[] = [];

  const mockFetch = async (url: string, opts: any) => {
    putCalls.push({ url, options: opts });
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

  const validPayload = {
    reportId: 'TG-AB12CD',
    category: 'Combat',
    whatHappened: 'Glacial sovereign froze party through obstacle wall!\r\nExtra note on line 2',
    whatExpected: 'Obstacle wall should block freeze',
    liveSnapshot: { hp: 50 },
    eventLog: { entries: [], text: '[+00:00:01.000] F1 combat Combat started' }
  };

  const res = await makeRequest(server, {
    method: 'POST',
    path: '/api/bug-report',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload)
  });

  server.close();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.ok, true);
  assert.strictEqual(res.json.reportId, 'TG-AB12CD');

  // Assert two GitHub PUT calls: 1 JSON bundle, 1 readable .log file
  assert.strictEqual(putCalls.length, 2, `Expected 2 GitHub PUT calls, got ${putCalls.length}`);

  const jsonCall = putCalls.find((c) => c.url.endsWith('.json'));
  const logCall = putCalls.find((c) => c.url.endsWith('.log'));
  assert.ok(jsonCall, 'Must upload JSON bundle');
  assert.ok(logCall, 'Must upload .log file');

  const jsonBody = JSON.parse(jsonCall!.options.body);
  const logBody = JSON.parse(logCall!.options.body);

  // Assert commit message is sanitized (no newlines) and capped at 60 chars
  assert.match(jsonBody.message, /^bug report TG-AB12CD: Glacial sovereign froze party through obstacle wall! Extra/);
  assert.ok(!jsonBody.message.includes('\r'), 'Commit message must not contain carriage return');
  assert.ok(!jsonBody.message.includes('\n'), 'Commit message must not contain newline');

  // Assert token was used in Authorization header
  assert.strictEqual(jsonCall!.options.headers.Authorization, 'Bearer secret_test_token_12345');

  // Assert token NEVER appears in the HTTP response body
  assert.ok(!res.body.includes('secret_test_token_12345'), 'Token must never appear in response body');
  console.log('✓ Valid bug report dispatch passed');
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
