import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const PORT = 3000;
const URL = `http://localhost:${PORT}`;

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
  const child = spawn('cmd.exe', ['/c', 'npx.cmd', 'vite', '--port', String(PORT)], {
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
      console.log(`[Server] Vite dev server ready at ${URL}`);
      return child;
    }
  }

  throw new Error('Timed out waiting for Vite server to start');
}

async function runTest() {
  console.log('================================================================');
  console.log('🧪 BROWSER VERIFICATION: NAME FIELDS HOTKEY GUARD & INPUT TEST');
  console.log('================================================================\n');

  let serverProcess = null;
  let browser = null;

  try {
    serverProcess = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      console.log(`[Browser Console] ${msg.text()}`);
    });

    console.log(`[E2E] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Wait for game & HUD instance
    await page.waitForFunction(() => {
      return (
        typeof (window).game !== 'undefined' &&
        (window).game?.isBooted &&
        typeof (window).HUD !== 'undefined' &&
        (window).HUD?.activeInstance !== null
      );
    }, { timeout: 20000 });

    console.log('✔ Game booted and HUD initialized.\n');

    // Helper to get game state snapshot to verify no unintended actions fired
    const getGameActionSnapshot = async () => {
      return await page.evaluate(() => {
        const game = (window).game;
        const outpost = game?.scene?.getScene('OutpostScene');
        const hud = (window).HUD?.activeInstance;
        const buildOverlay = document.getElementById('build-mode-overlay');
        const partyModal = document.getElementById('party-overview-modal');
        const loadoutModal = document.getElementById('loadout-modal');
        const stockpileModal = document.getElementById('stockpile-modal');
        const hudCard = document.getElementById('hud-card');

        return {
          isBuildMode: outpost?.isBuildMode ?? false,
          isBuildOverlayVisible: hud?.isBuildOverlayVisible() ?? false,
          isGatheringMode: outpost?.hud?.isGatheringMode ?? false,
          isPartyModalOpen: partyModal ? partyModal.classList.contains('active') : false,
          isLoadoutModalOpen: loadoutModal ? loadoutModal.classList.contains('active') : false,
          isStockpileModalOpen: stockpileModal ? stockpileModal.classList.contains('active') : false,
          isHudCardVisible: hudCard ? hudCard.style.display !== 'none' : true,
          selectedMemberIndex: outpost?.partySelectionIndex ?? 0
        };
      });
    };

    const TEST_STRING = 'BFHJKNOPRTWASD12';

    // -------------------------------------------------------------------------
    // TEST 1: Hero Name Field (New Game Setup Modal)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Hero Name Field (#new-game-hero-name) ---');

    await page.evaluate(() => {
      const hud = (window).HUD?.activeInstance;
      hud?.openNewGameModal();
    });
    await sleep(200);

    const snapshotBefore1 = await getGameActionSnapshot();

    // Select and clear the input
    await page.click('#new-game-hero-name');
    await page.evaluate(() => {
      const input = document.getElementById('new-game-hero-name');
      input.value = '';
    });

    // Type the test string with all bound hotkeys
    console.log(`[Test 1] Typing test string "${TEST_STRING}" into Hero name field...`);
    await page.type('#new-game-hero-name', TEST_STRING, { delay: 10 });

    const heroVal = await page.$eval('#new-game-hero-name', (el) => el.value);
    console.log(`[Test 1] Input value: "${heroVal}"`);
    assert.equal(heroVal, TEST_STRING, `Hero field value must be exactly "${TEST_STRING}"`);

    const snapshotAfter1 = await getGameActionSnapshot();
    assert.equal(snapshotAfter1.isBuildMode, false, 'No build mode should trigger');
    assert.equal(snapshotAfter1.isBuildOverlayVisible, false, 'Build overlay must remain hidden');
    assert.equal(snapshotAfter1.isPartyModalOpen, false, 'Party modal must remain closed');
    assert.equal(snapshotAfter1.isLoadoutModalOpen, false, 'Loadout modal must remain closed');
    assert.equal(snapshotAfter1.isStockpileModalOpen, false, 'Stockpile modal must remain closed');
    console.log('✔ Test 1 passed: All letters typed cleanly into Hero name field. 0 game actions triggered.');

    // Test Escape cancels/closes the modal without reaching the game
    console.log('[Test 1] Testing Escape cancels Hero modal without reaching game...');
    await page.keyboard.press('Escape');
    await sleep(200);
    const heroModalActive = await page.$eval('#new-game-modal', (el) => el.classList.contains('active'));
    assert.equal(heroModalActive, false, 'Escape must close new-game-modal');

    // Post-Escape check: Focus is not on an input, and B opens Build Mode
    const isInputFocused1 = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
    });
    assert.equal(isInputFocused1, false, 'Focus must not remain on input after Escape');

    await page.evaluate(() => {
      (window).HUD?.activeInstance?.closeTitleScreen();
    });
    await sleep(100);

    await page.keyboard.press('KeyB');
    await sleep(200);
    const buildAfterEscape1 = await page.evaluate(() => {
      const outpost = (window).game?.scene?.getScene('OutpostScene');
      return outpost?.isBuildMode ?? false;
    });
    assert.equal(buildAfterEscape1, true, 'Pressing B after Escape must open Build Mode');
    // Close build mode
    await page.keyboard.press('KeyB');
    await sleep(150);
    console.log('✔ Test 1 Escape & post-Escape hotkey check passed: Modal closed, input blurred, B opened Build Mode.\n');

    // -------------------------------------------------------------------------
    // TEST 2: Kaelen Recruit Name Field (#recruit-name-input)
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: Kaelen Recruit Name Field (#recruit-name-input) ---');

    await page.evaluate(() => {
      const hud = (window).HUD?.activeInstance;
      hud?.openRecruitModal();
    });
    await sleep(200);

    await page.click('#recruit-name-input');
    await page.evaluate(() => {
      const input = document.getElementById('recruit-name-input');
      input.value = '';
    });

    console.log(`[Test 2] Typing test string "${TEST_STRING}" into Kaelen name field...`);
    await page.type('#recruit-name-input', TEST_STRING, { delay: 10 });

    const recruitVal = await page.$eval('#recruit-name-input', (el) => el.value);
    console.log(`[Test 2] Input value: "${recruitVal}"`);
    assert.equal(recruitVal, TEST_STRING, `Recruit field value must be exactly "${TEST_STRING}"`);

    const snapshotAfter2 = await getGameActionSnapshot();
    assert.equal(snapshotAfter2.isBuildMode, false, 'No build mode should trigger');
    assert.equal(snapshotAfter2.isPartyModalOpen, false, 'Party modal must remain closed');
    assert.equal(snapshotAfter2.isLoadoutModalOpen, false, 'Loadout modal must remain closed');
    console.log('✔ Test 2 passed: All letters typed cleanly into Kaelen name field. 0 game actions triggered.');

    // Test Escape cancels recruit modal
    console.log('[Test 2] Testing Escape cancels recruit modal without reaching game...');
    await page.keyboard.press('Escape');
    await sleep(200);
    const recruitModalActive = await page.$eval('#summon-recruit-modal', (el) => el.classList.contains('active'));
    assert.equal(recruitModalActive, false, 'Escape must close summon-recruit-modal');
    console.log('✔ Test 2 Escape check passed: Modal closed cleanly.');

    // Test Enter confirms recruit modal
    console.log('[Test 2] Testing Enter confirms recruit modal without reaching game...');
    await page.evaluate(() => {
      const hud = (window).HUD?.activeInstance;
      hud?.openRecruitModal();
    });
    await sleep(200);
    await page.focus('#recruit-name-input');
    await sleep(100);
    await page.keyboard.press('Enter');
    await sleep(200);
    const recruitModalAfterEnter = await page.$eval('#summon-recruit-modal', (el) => el.classList.contains('active'));
    assert.equal(recruitModalAfterEnter, false, 'Enter must confirm and close summon-recruit-modal');
    console.log('✔ Test 2 Enter check passed: Enter confirmed and closed modal without reaching game.\n');

    // -------------------------------------------------------------------------
    // TEST 3: Fourth Member Recruit Name Field (#fourth-name-input)
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: Fourth Member Name Field (#fourth-name-input) ---');

    await page.evaluate(() => {
      const hud = (window).HUD?.activeInstance;
      hud?.openSummonFourthModal();
    });
    await sleep(200);

    await page.click('#fourth-name-input');
    await page.evaluate(() => {
      const input = document.getElementById('fourth-name-input');
      input.value = '';
    });

    console.log(`[Test 3] Typing test string "${TEST_STRING}" into Fourth Member name field...`);
    await page.type('#fourth-name-input', TEST_STRING, { delay: 10 });

    const fourthVal = await page.$eval('#fourth-name-input', (el) => el.value);
    console.log(`[Test 3] Input value: "${fourthVal}"`);
    assert.equal(fourthVal, TEST_STRING, `Fourth member field value must be exactly "${TEST_STRING}"`);

    const snapshotAfter3 = await getGameActionSnapshot();
    assert.equal(snapshotAfter3.isBuildMode, false, 'No build mode should trigger');
    assert.equal(snapshotAfter3.isPartyModalOpen, false, 'Party modal must remain closed');
    assert.equal(snapshotAfter3.isLoadoutModalOpen, false, 'Loadout modal must remain closed');
    console.log('✔ Test 3 passed: All letters typed cleanly into Fourth Member field. 0 game actions triggered.');

    // Test Escape cancels fourth member modal
    console.log('[Test 3] Testing Escape cancels Fourth Member modal without reaching game...');
    await page.keyboard.press('Escape');
    await sleep(200);
    const fourthModalActive = await page.$eval('#summon-fourth-modal', (el) => el.classList.contains('active'));
    assert.equal(fourthModalActive, false, 'Escape must close summon-fourth-modal');

    // Post-Escape check: Focus is not on an input, and B opens Build Mode
    const isInputFocused3 = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
    });
    assert.equal(isInputFocused3, false, 'Focus must not remain on input after Escape');

    await page.keyboard.press('KeyB');
    await sleep(200);
    const buildAfterEscape3 = await page.evaluate(() => {
      const outpost = (window).game?.scene?.getScene('OutpostScene');
      return outpost?.isBuildMode ?? false;
    });
    assert.equal(buildAfterEscape3, true, 'Pressing B after Escape must open Build Mode');
    await page.keyboard.press('KeyB');
    await sleep(150);

    console.log('✔ Test 3 Escape check passed: Modal closed cleanly, input blurred, B opened Build Mode.\n');

    // -------------------------------------------------------------------------
    // TEST 4: After Blur — Hotkeys Function Normally (e.g. B Opens Build Mode)
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: After Blur — Hotkeys Restored ---');

    // Ensure focus is on document body / game container
    await page.evaluate(() => {
      if (document.activeElement && typeof (document.activeElement).blur === 'function') {
        (document.activeElement).blur();
      }
      // Ensure title screen is closed so Outpost is interactive
      (window).HUD?.activeInstance?.closeTitleScreen();
    });
    await sleep(200);

    // Verify build mode is currently false
    const buildBefore = await page.evaluate(() => {
      const outpost = (window).game?.scene?.getScene('OutpostScene');
      return outpost?.isBuildMode ?? false;
    });
    assert.equal(buildBefore, false, 'Build mode should be inactive before pressing B');

    // Press 'b' to toggle Build Mode
    console.log('[Test 4] Pressing B hotkey after blur...');
    await page.keyboard.press('KeyB');
    await sleep(250);

    const buildAfter = await page.evaluate(() => {
      const outpost = (window).game?.scene?.getScene('OutpostScene');
      return outpost?.isBuildMode ?? false;
    });
    console.log(`[Test 4] Build mode active after pressing B: ${buildAfter}`);
    assert.equal(buildAfter, true, 'CRITICAL: Pressing B after blur must open Build Mode!');

    // Toggle B again to exit build mode
    await page.keyboard.press('KeyB');
    await sleep(200);
    const buildClosed = await page.evaluate(() => {
      const outpost = (window).game?.scene?.getScene('OutpostScene');
      return outpost?.isBuildMode ?? false;
    });
    assert.equal(buildClosed, false, 'Pressing B again closes Build Mode');

    console.log('✔ Test 4 passed: Hotkeys fully restored after blur.\n');

    console.log('================================================================');
    console.log('🎉 ALL NAME FIELDS HOTKEY GUARD VERIFICATIONS PASSED!');
    console.log('================================================================\n');

  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
