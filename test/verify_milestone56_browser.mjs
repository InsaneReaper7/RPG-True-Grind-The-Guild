import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No supported browser found for E2E testing.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMilestone56BrowserE2E() {
  console.log('================================================================');
  console.log('🌋 REAL LIVE BROWSER E2E: MILESTONE 56 SECOND NAMED REGION 🌋');
  console.log('================================================================\n');

  console.log(`[Browser] Launching: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const capturedToasts = [];
    const capturedLogs = [];

    page.on('console', (msg) => {
      const text = msg.text();
      capturedLogs.push(text);
      if (
        text.includes('[MainScene]') ||
        text.includes('[OutpostScene]') ||
        text.includes('Entering') ||
        text.includes('Biome') ||
        text.includes('Teleporter') ||
        text.includes('Toast')
      ) {
        console.log('  [BROWSER CONSOLE]', text);
      }
    });

    console.log('Connecting to game at http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game to initialize into OutpostScene
    await page.waitForFunction(() => {
      return window.game && window.game.scene && window.game.scene.getScene('OutpostScene');
    }, { timeout: 10000 });

    console.log('✓ Game booted into OutpostScene.');

    // -----------------------------------------------------------------
    // STEP 1: Initial Outpost State
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Checking Initial Outpost State ---');
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
    // STEP 2: Transition Outpost -> Dungeon Floor 1 (Ancient Crypts)
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Transition Outpost -> Dungeon Floor 1 ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.player && window.__lastActiveRegion;
    }, { timeout: 10000 });
    await sleep(1000);

    const f1Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';
      const locColor = locBadge?.style.color || '';
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      // Check crystal modal prediction
      main.openCrystalModal();
      const modalTitle = main.hud.crystalModalTitleEl?.innerText || '';
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, locText, locColor, tilesets, modalTitle, continueLabel };
    });

    console.log(`  Floor: ${f1Data.currentFloor}`);
    console.log(`  Active Region: ${f1Data.region.name} (${f1Data.region.id})`);
    console.log(`  HUD Location Text: "${f1Data.locText}"`);
    console.log(`  Tilesets: ${JSON.stringify(f1Data.tilesets)}`);
    console.log(`  Crystal Modal Title: "${f1Data.modalTitle}"`);
    console.log(`  Crystal Continue Label: "${f1Data.continueLabel}"`);

    assert.strictEqual(f1Data.currentFloor, 1);
    assert.strictEqual(f1Data.region.id, 'ancient_crypts');
    assert.ok(f1Data.locText.toUpperCase().includes('ANCIENT CRYPTS — FLOOR 1'), 'HUD text must display Ancient Crypts — Floor 1');
    assert.ok(f1Data.tilesets.some((t) => t.imageKey === 'tile-walkable'), 'Must use tile-walkable in Ancient Crypts');
    assert.ok(f1Data.tilesets.some((t) => t.imageKey === 'tile-obstacle'), 'Must use tile-obstacle in Ancient Crypts');
    assert.ok(f1Data.modalTitle.includes('Ancient Crypts'), 'Modal title must reflect Ancient Crypts');
    assert.strictEqual(f1Data.continueLabel, 'Continue Descent (Floor 2)', 'Same region next floor, no preview label');
    console.log('✓ PASS: Floor 1 active in Ancient Crypts with correct textures and modal text.');

    // -----------------------------------------------------------------
    // STEP 3: Continue Descent -> Floor 2 (Ancient Crypts)
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Continue Descent -> Floor 2 ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeContinueDescent();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

    const f2Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const locText = main.hud.locationTextEl?.innerText || '';
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      main.openCrystalModal();
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, locText, continueLabel };
    });

    console.log(`  Floor: ${f2Data.currentFloor}`);
    console.log(`  Active Region: ${f2Data.region.name} (${f2Data.region.id})`);
    console.log(`  Crystal Continue Label: "${f2Data.continueLabel}"`);

    assert.strictEqual(f2Data.currentFloor, 2);
    assert.strictEqual(f2Data.region.id, 'ancient_crypts');
    assert.ok(f2Data.continueLabel.includes('Abyssal Depths'), 'Floor 2 crystal modal must predict Abyssal Depths for Floor 3');
    console.log('✓ PASS: Floor 2 active in Ancient Crypts; Crystal modal correctly predicts Floor 3 (Abyssal Depths).');

    // -----------------------------------------------------------------
    // STEP 4: Boundary Cross 1 -> Floor 3 (Abyssal Depths)
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Continue Descent -> Floor 3 (Boundary Cross: Abyssal Depths) ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeContinueDescent();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

    const f3Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const locBadge = document.getElementById('location-badge');
      const locText = locBadge?.textContent || main.hud.locationBadgeEl?.innerText || '';
      const tilesets = main.tilemap.tilesets.map((t) => ({ name: t.name, imageKey: t.image?.key }));
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      return { currentFloor, region, locText, tilesets };
    });

    console.log(`  Floor: ${f3Data.currentFloor}`);
    console.log(`  Active Region: ${f3Data.region.name} (${f3Data.region.id})`);
    console.log(`  HUD Location Text: "${f3Data.locText}"`);
    console.log(`  Tilesets: ${JSON.stringify(f3Data.tilesets)}`);

    assert.strictEqual(f3Data.currentFloor, 3);
    assert.strictEqual(f3Data.region.id, 'abyssal_depths');
    assert.ok(f3Data.locText.toUpperCase().includes('ABYSSAL DEPTHS — FLOOR 3'), 'HUD text must display Abyssal Depths — Floor 3');
    assert.ok(f3Data.tilesets.some((t) => t.imageKey === 'tile-abyssal-walkable'), 'Must use tile-abyssal-walkable in Abyssal Depths');
    assert.ok(f3Data.tilesets.some((t) => t.imageKey === 'tile-abyssal-obstacle'), 'Must use tile-abyssal-obstacle in Abyssal Depths');
    console.log('✓ PASS: Floor 3 boundary cross successfully triggered Abyssal Depths with void basalt tilesets.');

    // -----------------------------------------------------------------
    // STEP 5: Continue Descent -> Floor 4 & Floor 5 (Abyssal Depths)
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Continue Descent -> Floor 4 & 5 ---');
    // Floor 4
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeContinueDescent();
    });
    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

    const f4Floor = await page.evaluate(() => window.GameState.getInstance().getDungeonFloorCount());
    console.log(`  Descended to Floor: ${f4Floor}`);
    assert.strictEqual(f4Floor, 4);

    // Floor 5
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeContinueDescent();
    });
    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

    const f5Data = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const region = window.__lastActiveRegion;
      const currentFloor = window.GameState.getInstance().getDungeonFloorCount();

      main.openCrystalModal();
      const continueLabel = main.hud.crystalContinueLabelEl?.innerText || '';
      main.hud.closeTeleporterCrystalModal();

      return { currentFloor, region, continueLabel };
    });

    console.log(`  Floor: ${f5Data.currentFloor}`);
    console.log(`  Active Region: ${f5Data.region.name} (${f5Data.region.id})`);
    console.log(`  Crystal Continue Label: "${f5Data.continueLabel}"`);

    assert.strictEqual(f5Data.currentFloor, 5);
    assert.strictEqual(f5Data.region.id, 'abyssal_depths');
    assert.ok(f5Data.continueLabel.includes('Infernal Caldera'), 'Floor 5 crystal modal must predict Infernal Caldera for Floor 6!');
    console.log('✓ PASS: Floor 5 (Boss Milestone floor) confirmed in Abyssal Depths; Crystal modal announces next region: Infernal Caldera.');

    // -----------------------------------------------------------------
    // STEP 6: Boundary Cross 2 -> Floor 6 (Infernal Caldera - Milestone 56)
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Boundary Cross 2 -> Floor 6 (INFERNAL CALDERA) ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeContinueDescent();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

    const f6Data = await page.evaluate(() => {
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

    console.log(`  Floor: ${f6Data.currentFloor}`);
    console.log(`  Active Region: ${f6Data.region.name} (${f6Data.region.id})`);
    console.log(`  Tagline: "${f6Data.region.tagline}"`);
    console.log(`  Accent Color: ${f6Data.region.accentColor}`);
    console.log(`  HUD Location Text: "${f6Data.locText}"`);
    console.log(`  HUD Location Style Color: "${f6Data.locColor}"`);
    console.log(`  Tilesets: ${JSON.stringify(f6Data.tilesets)}`);
    console.log(`  Crystal Modal Title: "${f6Data.modalTitle}"`);
    console.log(`  Crystal Continue Label: "${f6Data.continueLabel}"`);

    assert.strictEqual(f6Data.currentFloor, 6, 'Dungeon floor must be 6');
    assert.strictEqual(f6Data.region.id, 'infernal_caldera', 'Active region must be infernal_caldera');
    assert.strictEqual(f6Data.region.name, 'Infernal Caldera');
    assert.strictEqual(f6Data.region.accentColor, '#f97316');
    assert.ok(f6Data.locText.toUpperCase().includes('INFERNAL CALDERA — FLOOR 6'), 'HUD must display Infernal Caldera — Floor 6');
    assert.ok(f6Data.tilesets.some((t) => t.imageKey === 'tile-caldera-walkable'), 'Must use tile-caldera-walkable in Infernal Caldera');
    assert.ok(f6Data.tilesets.some((t) => t.imageKey === 'tile-caldera-obstacle'), 'Must use tile-caldera-obstacle in Infernal Caldera');
    assert.ok(f6Data.modalTitle.includes('Infernal Caldera'), 'Modal title must reflect Infernal Caldera');
    assert.strictEqual(f6Data.continueLabel, 'Continue Descent (Floor 7)', 'Floor 6->7 stays in Infernal Caldera');
    console.log('✓ PASS: Floor 6 active in Infernal Caldera with molten lava textures, fiery orange accent, and authentic modal/HUD integration!');

    // -----------------------------------------------------------------
    // STEP 7: Return to Outpost & Verify Safe Zone & Floor Reset
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Return to Outpost ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeTransitionToOutpost();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      return outpost && outpost.scene.isActive();
    }, { timeout: 10000 });

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
    // STEP 8: Fresh Dungeon Re-entry resets to Floor 1 Ancient Crypts
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Fresh Dungeon Re-entry ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await sleep(1500);
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && !main.isTransitioning;
    }, { timeout: 10000 });

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
    await browser.close();
  }
}

runMilestone56BrowserE2E().catch((err) => {
  console.error('Milestone 56 Browser E2E Failure:', err);
  process.exit(1);
});
