import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No supported browser found for E2E testing.');
  process.exit(1);
}

const PORT = 3001;
const URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\3b4b46d9-41fb-4d0f-9e25-b98ec9e0d852';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureViteServer() {
  const isUp = await checkServerReady(PORT);
  if (isUp) {
    console.log(`[Server] Server already running at ${URL}`);
    return null;
  }

  console.log(`[Server] Spawning Vite dev server on port ${PORT}...`);
  const child = spawn('cmd.exe', ['/c', 'npx', 'vite', '--port', String(PORT)], {
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Local:')) {
      console.log(`[Vite] ${line.trim()}`);
    }
  });

  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      console.log(`[Server] Vite server ready on ${URL}`);
      return child;
    }
  }
  throw new Error('Vite server failed to start within 15 seconds.');
}

async function run() {
  console.log('================================================================');
  console.log('LIVE BROWSER VERIFICATION: STASH OWNED-ONLY FILTER & CRAFTING');
  console.log('================================================================\n');

  let serverProcess = null;
  let browser = null;

  try {
    serverProcess = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1400,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    page.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('Stash') || txt.includes('Equipped') || txt.includes('Audit')) {
        console.log(`  [Browser] ${txt}`);
      }
    });

    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game and OutpostScene to be ready
    await page.waitForFunction(() => {
      const g = window.game;
      const s = g?.scene?.getScene('OutpostScene');
      return s && s.scene.isActive() && s.hud;
    }, { timeout: 15000 });
    console.log('✓ Game engine and OutpostScene HUD initialized.');

    // Dismiss title screen modal by starting New Game
    await page.evaluate(() => {
      const newGameBtn = document.getElementById('title-new-game-btn');
      if (newGameBtn) newGameBtn.click();
      const scene = window.game.scene.getScene('OutpostScene');
      if (scene && scene.hud) scene.hud.closeTitleScreen();
    });
    await sleep(600);

    // Dismiss recruit modal if open by confirming recruit
    await page.evaluate(() => {
      const summonBtn = document.getElementById('confirm-summon-recruit-btn');
      if (summonBtn) summonBtn.click();
      const recruitModal = document.getElementById('recruit-companion-modal');
      if (recruitModal) recruitModal.style.display = 'none';
    });
    await sleep(600);

    // 1. Open the Party Overview Modal
    console.log('\n--- Step 1: Open Equipment Stash Modal ---');
    await page.evaluate(() => {
      const guide = document.getElementById('guild-guide-widget');
      if (guide) guide.style.display = 'none';
      const notifs = document.getElementById('notification-container');
      if (notifs) notifs.style.display = 'none';
      document.querySelectorAll('.toast, .notification, [id*="toast"]').forEach(el => el.remove());

      const scene = window.game.scene.getScene('OutpostScene');
      scene.hud.openPartyOverviewModal();
    });
    await sleep(600);

    // Verify toggle button exists and default is ON (Owned Only = true)
    const initialState = await page.evaluate(() => {
      const btn = document.getElementById('stash-toggle-filter-btn');
      const label = document.getElementById('stash-toggle-filter-label');
      const indicator = document.getElementById('stash-toggle-filter-indicator');
      const list = document.getElementById('party-inventory-item-list');
      const emptyNotice = list ? list.querySelector('.empty-stash-notice') : null;
      const craftRequiredBadges = list ? Array.from(list.querySelectorAll('*')).filter(el => el.textContent && el.textContent.includes('Craft Required')).length : 0;

      const hud = window.game.scene.getScene('OutpostScene').hud;
      return {
        btnExists: !!btn,
        labelText: label ? label.innerText : '',
        indicatorText: indicator ? indicator.innerText : '',
        isActive: hud.isStashFilterActive(),
        emptyNoticeVisible: !!emptyNotice,
        emptyNoticeText: emptyNotice ? emptyNotice.innerText.trim() : '',
        craftRequiredCount: craftRequiredBadges
      };
    });

    console.log('Initial Stash State:', initialState);
    assert.strictEqual(initialState.btnExists, true, 'Stash toggle filter button rendered in DOM');
    assert.strictEqual(initialState.isActive, true, 'Stash filter defaults to active (Owned Only = true)');
    assert.strictEqual(initialState.labelText, 'Showing: Owned Only', 'Toggle label shows Owned Only');
    assert.strictEqual(initialState.indicatorText, '✅', 'Toggle indicator shows checkmark');
    assert.strictEqual(initialState.craftRequiredCount, 0, 'Zero "Craft Required" badges in Owned Only mode');

    // Capture Screenshot of Stash Toggle ON
    const stashOnPath = path.join(ARTIFACT_DIR, 'stash_toggle_on.png');
    await page.screenshot({ path: stashOnPath });
    console.log(`📸 Captured screenshot: ${stashOnPath}`);

    // 2. Toggle Stash Filter to OFF (Catalog mode)
    console.log('\n--- Step 2: Toggle Stash Filter OFF (Full Catalog) ---');
    await page.evaluate(() => {
      const btn = document.getElementById('stash-toggle-filter-btn');
      if (btn) btn.click();
    });
    await sleep(600);

    const catalogState = await page.evaluate(() => {
      const hud = window.game.scene.getScene('OutpostScene').hud;
      const label = document.getElementById('stash-toggle-filter-label');
      const indicator = document.getElementById('stash-toggle-filter-indicator');
      const list = document.getElementById('party-inventory-item-list');
      const craftRequiredBadges = list ? Array.from(list.querySelectorAll('*')).filter(el => el.textContent && el.textContent.includes('Craft Required')).length : 0;
      const katanaCard = list ? list.querySelector('[data-item-id="katana"]') : null;

      return {
        isActive: hud.isStashFilterActive(),
        labelText: label ? label.innerText : '',
        indicatorText: indicator ? indicator.innerText : '',
        craftRequiredCount: craftRequiredBadges,
        katanaCardFound: !!katanaCard,
        katanaDraggable: katanaCard ? katanaCard.getAttribute('draggable') : null
      };
    });

    console.log('Catalog Mode Stash State:', catalogState);
    assert.strictEqual(catalogState.isActive, false, 'Stash filter is now inactive (All Gear)');
    assert.strictEqual(catalogState.labelText, 'Showing: All Gear', 'Toggle label shows All Gear');
    assert.strictEqual(catalogState.indicatorText, '👁️', 'Toggle indicator shows eye');
    assert.ok(catalogState.craftRequiredCount > 5, 'Multiple "Craft Required" badges visible in catalog mode');
    assert.strictEqual(catalogState.katanaCardFound, true, 'Katana card visible in catalog');
    assert.strictEqual(catalogState.katanaDraggable, 'false', 'Unowned Katana card is not draggable');

    // Capture Screenshot of Stash Toggle OFF
    const stashOffPath = path.join(ARTIFACT_DIR, 'stash_toggle_off.png');
    await page.screenshot({ path: stashOffPath });
    console.log(`📸 Captured screenshot: ${stashOffPath}`);

    // 3. Test non-destructive save audit in live browser
    console.log('\n--- Step 3: Run __auditSavedDuplicateGear() in Browser ---');
    const auditRes = await page.evaluate(() => {
      return typeof window.__auditSavedDuplicateGear === 'function'
        ? window.__auditSavedDuplicateGear()
        : null;
    });
    console.log('Live save audit result:', auditRes ? { hasSave: auditRes.hasSave, duplicateGearCount: auditRes.duplicateGear.length } : 'None');
    assert.ok(auditRes !== null, '__auditSavedDuplicateGear is exposed on window');

    console.log('\n================================================================');
    console.log('LIVE BROWSER VERIFICATION SUCCEEDED! 🎉');
    console.log('================================================================');
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      console.log('Terminating Vite server process...');
      spawn('cmd.exe', ['/c', 'taskkill', '/F', '/T', '/PID', String(serverProcess.pid)]);
    }
  }
}

run().catch((err) => {
  console.error('Live browser verification failed:', err);
  process.exit(1);
});
