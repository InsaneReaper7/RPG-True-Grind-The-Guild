import crypto from 'node:crypto';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_CALLS = 5;

// In-memory rate limiting map: IP -> array of timestamps
const rateLimitMap = new Map();

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function isRateLimited(ip, now = Date.now()) {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  // Clean up any stale IPs in the map so it cannot grow forever
  for (const [key, times] of rateLimitMap.entries()) {
    const valid = times.filter((t) => t > windowStart);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else if (valid.length !== times.length) {
      rateLimitMap.set(key, valid);
    }
  }

  let timestamps = rateLimitMap.get(ip) || [];
  timestamps = timestamps.filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX_CALLS) {
    rateLimitMap.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

export function resetRateLimits() {
  rateLimitMap.clear();
}

export function generateReportId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let rand = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    rand += chars[bytes[i] % chars.length];
  }
  return `TG-${rand}`;
}

export function sanitizeCommitMessage(reportId, whatHappened) {
  const cleaned = String(whatHappened || '')
    .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `bug report ${reportId}: ${cleaned}`;
}

export async function handleBugReport(req, res, options = {}) {
  // 1. Content-Type check (must be application/json)
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    res.writeHead(415, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unsupported Media Type: expected application/json' }));
    return;
  }

  // 2. Environment config check
  const token = options.token ?? process.env.GITHUB_REPORTS_TOKEN;
  const repo = options.repo ?? process.env.GITHUB_REPORTS_REPO;
  if (!token || !repo) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bug reporting service is not configured (missing GitHub reports credentials).' }));
    return;
  }

  // 3. Rate limiting check
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Maximum 5 reports per 10 minutes.' }));
    return;
  }

  // 4. Stream body with strict 2 MB cap enforced chunk-by-chunk
  let bodyBuffer;
  try {
    bodyBuffer = await new Promise((resolve, reject) => {
      let totalBytes = 0;
      const chunks = [];

      function onData(chunk) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          req.removeListener('data', onData);
          req.removeListener('end', onEnd);
          req.removeListener('error', onError);
          // Destroy request stream to avoid buffering further bytes
          req.destroy();
          const err = new Error('Payload Too Large');
          err.statusCode = 413;
          reject(err);
          return;
        }
        chunks.push(chunk);
      }

      function onEnd() {
        resolve(Buffer.concat(chunks));
      }

      function onError(err) {
        reject(err);
      }

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    });
  } catch (err) {
    if (err.statusCode === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload Too Large: maximum allowed report size is 2 MB.' }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Error reading request body.' }));
    return;
  }

  // 5. Parse and validate JSON
  let payload;
  try {
    payload = JSON.parse(bodyBuffer.toString('utf-8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
    return;
  }

  if (!payload || typeof payload !== 'object') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Payload must be a JSON object.' }));
    return;
  }

  const whatHappened = payload.whatHappened ?? payload.playerText?.whatHappened;
  const category = payload.category ?? payload.playerText?.category;
  if (!whatHappened || typeof whatHappened !== 'string' || !category) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing required report fields (whatHappened, category).' }));
    return;
  }

  // 6. Validate or generate reportId (ensure no path traversal from client)
  let reportId = payload.reportId;
  if (typeof reportId !== 'string' || !/^TG-[A-Z0-9]{6}$/.test(reportId)) {
    reportId = generateReportId();
    payload.reportId = reportId;
  }

  // 7. Format paths and commit message using UTC for both date and time
  const now = new Date();
  const iso = now.toISOString();
  const dateStr = iso.slice(0, 10); // YYYY-MM-DD
  const timeStr = iso.slice(11, 19).replace(/:/g, ''); // HHMMSS in UTC
  const jsonPath = `reports/${dateStr}/${timeStr}_${reportId}.json`;
  const logPath = `reports/${dateStr}/${timeStr}_${reportId}.log`;

  const commitMsg = sanitizeCommitMessage(reportId, whatHappened);

  // Build the readable .log file text
  const whatExpected = payload.whatExpected ?? payload.playerText?.whatExpected ?? '';
  const version = payload.version || 'unknown';
  const eventLogText = typeof payload.eventLog === 'string'
    ? payload.eventLog
    : (payload.eventLog?.text || '');

  const logFileText = [
    '================================================================================',
    `BUG REPORT: ${reportId}`,
    `DATE: ${iso}`,
    `CATEGORY: ${category}`,
    `VERSION: ${version}`,
    'WHAT HAPPENED:',
    whatHappened,
    'WHAT DID YOU EXPECT:',
    whatExpected || '(Not provided)',
    '================================================================================\n',
    eventLogText
  ].join('\n');

  const jsonBase64 = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8').toString('base64');
  const logBase64 = Buffer.from(logFileText, 'utf-8').toString('base64');

  // 8. Write to GitHub Contents API
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Global fetch is unavailable in runtime.' }));
    return;
  }

  const putFileOnce = async (filePath, base64Content) => {
    const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    return await fetchFn(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RPG-True-Grind-Bug-Reporter',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMsg,
        content: base64Content
      })
    });
  };

  const putFileWithRetry = async (filePath, base64Content) => {
    let res = await putFileOnce(filePath, base64Content);
    if (res.status === 409) {
      // Conflict on branch ref update: wait 500 ms and retry once
      await new Promise((resolve) => setTimeout(resolve, 500));
      res = await putFileOnce(filePath, base64Content);
    }
    return res;
  };

  try {
    // Sequential execution: PUT the .json first, then the .log
    const jsonRes = await putFileWithRetry(jsonPath, jsonBase64);
    if (!jsonRes.ok) {
      console.error('[BugReport] GitHub API failed writing JSON bundle:', {
        jsonStatus: jsonRes.status
      });
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to write bug report to GitHub repository.' }));
      return;
    }

    // Now PUT the .log
    let logRes;
    try {
      logRes = await putFileWithRetry(logPath, logBase64);
    } catch (err) {
      console.error('[BugReport] Error writing readable .log to GitHub:', err?.message || err);
    }

    if (!logRes || !logRes.ok) {
      // Partial failure: JSON succeeded, but .log failed. Still accept report and return ok: true!
      console.warn('[BugReport] Report JSON succeeded but readable log failed on GitHub:', {
        reportId,
        logStatus: logRes ? logRes.status : 'error'
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, reportId }));
  } catch (err) {
    console.error('[BugReport] Failed to contact GitHub API:', err?.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GitHub Contents API request failed.' }));
  }
}
