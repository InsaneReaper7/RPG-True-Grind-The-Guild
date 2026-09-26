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
  const child = spawn('cmd.exe', ['/c', 'npx', 'vite', '--port', String(PORT)], {
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Local:')) {
      console.log(`[Vite] ${line.trim()}`);
    }
  });

  // Wait for server to become responsive
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      console.log('[Server] Dev server is ready.');
      return child;
    }
  }

  throw new Error('Vite dev server failed to start within timeout.');
}

async function runLiveContinueChainBrowserE2E() {
  console.log('================================================================');
  console.log('❄️ REAL LIVE BROWSER E2E: THIRD NAMED REGION (GLACIAL CAVERNS) ❄️');
  console.log('================================================================\n');

  let viteChild = null;
  let browser = null;

  try {
    viteChild = await ensureViteServer();

    console.log(`[Browser] Launching: ${executablePath}`);
    browser = await puppeteer.launch({
      executablePath,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const capturedLogs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      capturedLogs.push(text);
      if (
        text.includes('[MainScene]') ||
        text.includes('[OutpostScene]') ||
        text.includes('Entering') ||
        text.includes('Biome') ||
        text.includes('Teleporter')
      ) {
        console.log('  [BROWSER CONSOLE]', text);
      }
    });

    console.log(`Connecting to game at ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game to initialize into OutpostScene
    await page.waitForFunction(() => {
      return window.game && window.game.scene && window.game.scene.getScene('OutpostScene');
    }, { timeout: 15000 });

    console.log('✓ Game booted into OutpostScene.');

    // -----------------------------------------------------------------
    // STEP 1: Outpost Initial State
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Initial Outpost State ---');
    const outpostState = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      return {
        floorCount: gs.getDungeonFloorCount(),
        isSafeZone: gs.getIsSafeZone()
      };
    });
    console.log(`  Floor count: ${outpostState.floorCount}, SafeZone: ${outpostState.isSafeZone}`);
    assert.strictEqual(outpostState.floorCount, 0, 'Floor count at Outpost must be 0');
    assert.strictEqual(outpostState.isSafeZone, true, 'Outpost must be Safe Zone');

    // -----------------------------------------------------------------
    // STEP 2: Transition Outpost -> Floor 1 (Ancient Crypts)
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Transition Outpost -> Dungeon Floor 1 ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.player && window.__lastActiveRegion;
    }, { timeout: 15000 });
    await sleep(1000);

    const f1Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      main.openCrystalModal();
      const modalTitle = main.hud.crystalModalTitleEl?.innerText || '';
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, locText, tilesets, modalTitle, continueLabel };
    });

    console.log(`  Floor: ${f1Data.currentFloor}, Region: ${f1Data.region.name}`);
    console.log(`  Tilesets: ${JSON.stringify(f1Data.tilesets)}`);
    console.log(`  Crystal Continue Label: "${f1Data.continueLabel}"`);
    assert.strictEqual(f1Data.currentFloor, 1);
    assert.strictEqual(f1Data.region.id, 'ancient_crypts');
    assert.ok(f1Data.locText.toUpperCase().includes('ANCIENT CRYPTS — FLOOR 1'));
    assert.ok(f1Data.tilesets.some((t) => t.imageKey === 'tile-walkable'));
    assert.ok(f1Data.tilesets.some((t) => t.imageKey === 'tile-obstacle'));
    console.log('✓ PASS: Floor 1 verified in Ancient Crypts.');

    // -----------------------------------------------------------------
    // STEP 3: Continue Descent to Floor 2 -> Preview Abyssal Depths
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Continue Descent -> Floor 2 ---');
    await page.evaluate(() => {
      window.game.scene.getScene('MainScene').executeContinueDescent();
    });
    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 15000 });

    const f2Preview = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.openCrystalModal();
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();
      return continueLabel;
    });
    console.log(`  Floor 2 Crystal Preview: "${f2Preview}"`);
    assert.ok(f2Preview.includes('Abyssal Depths'));
    console.log('✓ PASS: Floor 2 crystal modal predicts Abyssal Depths for Floor 3.');

    // -----------------------------------------------------------------
    // STEP 4: Continue Descent to Floor 3 (Abyssal Depths)
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Continue Descent -> Floor 3 (Abyssal Depths) ---');
    await page.evaluate(() => {
      window.game.scene.getScene('MainScene').executeContinueDescent();
    });
    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 15000 });

    const f3Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      return { region, tilesets };
    });
    assert.strictEqual(f3Data.region.id, 'abyssal_depths');
    assert.ok(f3Data.tilesets.some((t) => t.imageKey === 'tile-abyssal-walkable'));
    assert.ok(f3Data.tilesets.some((t) => t.imageKey === 'tile-abyssal-obstacle'));
    console.log('✓ PASS: Floor 3 active in Abyssal Depths with void basalt tilesets.');

    // -----------------------------------------------------------------
    // STEP 5: Fast Continue through Floors 4, 5 -> Preview Infernal Caldera
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Descending through Floors 4 & 5 ---');
    for (const targetFloor of [4, 5]) {
      await page.evaluate(() => {
        window.game.scene.getScene('MainScene').executeContinueDescent();
      });
      await sleep(1200);
      await page.waitForFunction(() => {
        const main = window.game.scene.getScene('MainScene');
        return main && main.scene.isActive() && !main.isTransitioning;
      }, { timeout: 15000 });
    }

    const f5Preview = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const floor = window.GameState.getInstance().getDungeonFloorCount();
      main.openCrystalModal();
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();
      return { floor, continueLabel };
    });
    console.log(`  Reached Floor ${f5Preview.floor}, Crystal Preview: "${f5Preview.continueLabel}"`);
    assert.strictEqual(f5Preview.floor, 5);
    assert.ok(f5Preview.continueLabel.includes('Infernal Caldera'));
    console.log('✓ PASS: Floor 5 (Boss chamber) crystal modal predicts Infernal Caldera for Floor 6.');

    // -----------------------------------------------------------------
    // STEP 6: Continue Descent to Floor 6 (Infernal Caldera)
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Continue Descent -> Floor 6 (Infernal Caldera) ---');
    await page.evaluate(() => {
      window.game.scene.getScene('MainScene').executeContinueDescent();
    });
    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 15000 });

    const f6Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      return { region, tilesets };
    });
    assert.strictEqual(f6Data.region.id, 'infernal_caldera');
    assert.ok(f6Data.tilesets.some((t) => t.imageKey === 'tile-caldera-walkable'));
    assert.ok(f6Data.tilesets.some((t) => t.imageKey === 'tile-caldera-obstacle'));
    console.log('✓ PASS: Floor 6 active in Infernal Caldera with molten lava crag tilesets.');

    // -----------------------------------------------------------------
    // STEP 7: Continue Descent through Floors 7, 8, 9, 10 (Boss Milestone 2)
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Descending through Infernal Caldera (Floors 7 -> 10) ---');
    for (const targetFloor of [7, 8, 9, 10]) {
      await page.evaluate(() => {
        window.game.scene.getScene('MainScene').executeContinueDescent();
      });
      await sleep(1200);
      await page.waitForFunction(() => {
        const main = window.game.scene.getScene('MainScene');
        return main && main.scene.isActive() && !main.isTransitioning;
      }, { timeout: 15000 });
      console.log(`  Descended to Floor ${targetFloor}...`);
    }

    const f10Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';

      main.openCrystalModal();
      const modalTitle = main.hud.crystalModalTitleEl?.innerText || '';
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, locText, modalTitle, continueLabel };
    });

    console.log(`  Floor: ${f10Data.currentFloor}`);
    console.log(`  Active Region: ${f10Data.region.name} (${f10Data.region.id})`);
    console.log(`  HUD Location Text: "${f10Data.locText}"`);
    console.log(`  Crystal Modal Title: "${f10Data.modalTitle}"`);
    console.log(`  Crystal Continue Label: "${f10Data.continueLabel}"`);

    assert.strictEqual(f10Data.currentFloor, 10);
    assert.strictEqual(f10Data.region.id, 'infernal_caldera');
    assert.ok(f10Data.locText.toUpperCase().includes('INFERNAL CALDERA — FLOOR 10'));
    assert.ok(f10Data.modalTitle.includes('Infernal Caldera'));
    assert.ok(
      f10Data.continueLabel.includes('Glacial Caverns'),
      `Floor 10 crystal modal MUST predict Glacial Caverns for Floor 11! Received: "${f10Data.continueLabel}"`
    );
    console.log('✓ PASS: Floor 10 confirmed in Infernal Caldera; Crystal modal accurately predicts Floor 11 (Glacial Caverns)!');

    // -----------------------------------------------------------------
    // STEP 8: Boundary Cross 3 -> Floor 11 (GLACIAL CAVERNS — Third Named Region)
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Boundary Cross 3 -> Floor 11 (GLACIAL CAVERNS) ---');
    await page.evaluate(() => {
      window.game.scene.getScene('MainScene').executeContinueDescent();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 15000 });

    const f11Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';
      const locColor = locBadge?.style.color || '';
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      main.openCrystalModal();
      const modalTitle = main.hud.crystalModalTitleEl?.innerText || '';
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, locText, locColor, tilesets, modalTitle, continueLabel };
    });

    console.log(`  Floor: ${f11Data.currentFloor}`);
    console.log(`  Active Region: ${f11Data.region.name} (${f11Data.region.id})`);
    console.log(`  Tagline: "${f11Data.region.tagline}"`);
    console.log(`  Accent Color: ${f11Data.region.accentColor}`);
    console.log(`  HUD Location Text: "${f11Data.locText}"`);
    console.log(`  HUD Location Style Color: "${f11Data.locColor}"`);
    console.log(`  Tilesets: ${JSON.stringify(f11Data.tilesets)}`);
    console.log(`  Crystal Modal Title: "${f11Data.modalTitle}"`);
    console.log(`  Crystal Continue Label: "${f11Data.continueLabel}"`);

    assert.strictEqual(f11Data.currentFloor, 11, 'Dungeon floor must be 11');
    assert.strictEqual(f11Data.region.id, 'glacial_caverns', 'Active region must be glacial_caverns');
    assert.strictEqual(f11Data.region.name, 'Glacial Caverns');
    assert.strictEqual(f11Data.region.accentColor, '#06b6d4');
    assert.strictEqual(f11Data.region.tagline, 'The Sub-Zero Crystalline Depths');
    assert.ok(f11Data.locText.toUpperCase().includes('GLACIAL CAVERNS — FLOOR 11'), 'HUD must display Glacial Caverns — Floor 11');
    assert.ok(f11Data.tilesets.some((t) => t.imageKey === 'tile-glacial-walkable'), 'Must use tile-glacial-walkable in Glacial Caverns');
    assert.ok(f11Data.tilesets.some((t) => t.imageKey === 'tile-glacial-obstacle'), 'Must use tile-glacial-obstacle in Glacial Caverns');
    assert.ok(f11Data.modalTitle.includes('Glacial Caverns'), 'Modal title must reflect Glacial Caverns');
    assert.strictEqual(f11Data.continueLabel, 'Continue Descent (Floor 12)', 'Floor 11->12 stays in Glacial Caverns');
    console.log('✓ PASS: Floor 11 active in Glacial Caverns with frosted crystalline ice textures, cyan accent, and authentic modal/HUD integration!');

    // -----------------------------------------------------------------
    // STEP 9: Return to Outpost & Verify Safe Zone & Floor Reset
    // -----------------------------------------------------------------
    console.log('\n--- Step 9: Return to Outpost ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeTransitionToOutpost();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      return outpost && outpost.scene.isActive();
    }, { timeout: 15000 });

    const postReturnState = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      return {
        floorCount: gs.getDungeonFloorCount(),
        isSafeZone: gs.getIsSafeZone()
      };
    });
    console.log(`  Outpost returned — Floor count: ${postReturnState.floorCount}, SafeZone: ${postReturnState.isSafeZone}`);
    assert.strictEqual(postReturnState.floorCount, 0, 'Floor count must reset to 0 upon returning to Outpost');
    assert.strictEqual(postReturnState.isSafeZone, true, 'Must return to Safe Zone');
    console.log('✓ PASS: Outpost return cleanly resets dungeon floor count to 0.');

    // -----------------------------------------------------------------
    // STEP 10: Fresh Dungeon Re-entry resets to Floor 1 Ancient Crypts
    // -----------------------------------------------------------------
    console.log('\n--- Step 10: Fresh Dungeon Re-entry ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 15000 });

    const reEntryData = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';
      return { currentFloor, region, locText };
    });

    console.log(`  Re-entry Floor: ${reEntryData.currentFloor}, Region: ${reEntryData.region.name}`);
    assert.strictEqual(reEntryData.currentFloor, 1);
    assert.strictEqual(reEntryData.region.id, 'ancient_crypts');
    assert.ok(reEntryData.locText.toUpperCase().includes('ANCIENT CRYPTS — FLOOR 1'));
    console.log('✓ PASS: Fresh re-entry begins cleanly on Floor 1 in Ancient Crypts.');

    console.log('\n================================================================');
    console.log('🌟 ALL REAL LIVE BROWSER CONTINUE-CHAIN TESTS PASSED PERFECTLY! 🌟');
    console.log('================================================================\n');
  } finally {
    if (browser) {
      await browser.close();
    }
    if (viteChild && viteChild.pid) {
      console.log('Stopping spawned Vite dev server...');
      try {
        spawn('taskkill', ['/pid', String(viteChild.pid), '/T', '/F']);
      } catch (e) {
        viteChild.kill();
      }
    }
  }
  process.exit(0);
}

runLiveContinueChainBrowserE2E().catch((err) => {
  console.error('Browser E2E Failed:', err);
  process.exit(1);
});
