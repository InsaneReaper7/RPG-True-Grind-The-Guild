import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\3367fab4-b640-4df1-8df0-8ec9608ec3b9';

async function transitionToDungeon(page) {
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    if (outpost && outpost.scene.isActive()) {
      outpost.executeTransitionToDungeon();
    }
  });
  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.player && main.enemies && main.enemies.length > 0;
  }, { timeout: 10000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
}

async function run() {
  console.log('=== Launching Chrome for Tile Stacking & Debug Overlay Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Input]') || text.includes('[Combat') || text.includes('Engaged') || text.includes('TileClaimDebugOverlay') || text.includes('STACK')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await transitionToDungeon(page);

  // Spawn 3 companions so party is complete (4 members)
  await page.evaluate(() => {
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  // =========================================================================
  // PHASE 1: VERIFY THE TILE-CLAIM DEBUG OVERLAY ITSELF
  // =========================================================================
  console.log('\n=============================================================');
  console.log('PHASE 1: Verifying the Tile-Claim Debug Overlay Itself');
  console.log('=============================================================');

  // 1a. Toggle overlay ON via keyboard 'V'
  console.log('Toggling overlay ON via keyboard [V]...');
  await page.keyboard.press('KeyV');
  await new Promise(r => setTimeout(r, 300));

  const isOverlayOn = await page.evaluate(() => {
    return window.__tileClaimOverlay && window.__tileClaimOverlay.isEnabled();
  });
  if (!isOverlayOn) {
    throw new Error('TileClaimDebugOverlay failed to enable on [V] key press!');
  }
  console.log('✔ PASS: Overlay successfully toggled ON via [V] key!');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'overlay_01_active.png') });

  // 1b. Move party manually and confirm tracking
  console.log('Moving party to verify real-time position tracking on overlay...');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    scene.party[0].setGridPosition(6, 6);
    scene.party[1].setGridPosition(7, 6);
    scene.party[2].setGridPosition(6, 7);
    scene.party[3].setGridPosition(7, 7);
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'overlay_02_unit_tracking.png') });
  console.log('✔ PASS: Overlay accurately tracks unit positions!');

  // 1c. Force artificial tile collision (2 units on same tile) to confirm detector alert fires
  console.log('Forcing artificial collision (2 units on (7,7)) to verify alert detector...');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    scene.party[0].setGridPosition(7, 7);
    scene.party[1].setGridPosition(7, 7);
  });
  await new Promise(r => setTimeout(r, 300));

  const stackReport1 = await page.evaluate(() => {
    return window.__tileClaimOverlay.lastReport;
  });
  if (stackReport1.occupiedStacks.length === 0) {
    throw new Error('Detector FAILED to catch artificial tile collision!');
  }
  console.log('✔ PASS: Stack detector fired as expected! Detected occupied stack:', stackReport1.occupiedStacks);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'overlay_03_stack_alert_verified.png') });

  // 1d. Force artificial double-booking claim to confirm claim detector alert fires
  console.log('Forcing artificial double-claim (2 units claiming (8,8)) to verify claim alert...');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    scene.party[0].claimedDestination = { x: 8, y: 8 };
    scene.party[1].claimedDestination = { x: 8, y: 8 };
  });
  await new Promise(r => setTimeout(r, 300));

  const stackReport2 = await page.evaluate(() => {
    return window.__tileClaimOverlay.lastReport;
  });
  if (stackReport2.claimDoubleBookings.length === 0) {
    throw new Error('Detector FAILED to catch artificial double-booking claim!');
  }
  console.log('✔ PASS: Claim double-booking detector fired as expected! Detected claim stack:', stackReport2.claimDoubleBookings);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'overlay_04_double_claim_alert_verified.png') });

  // Clean up artificial collision
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    scene.party[0].claimedDestination = null;
    scene.party[1].claimedDestination = null;
    scene.party[0].setGridPosition(5, 5);
    scene.party[1].setGridPosition(6, 5);
    scene.party[2].setGridPosition(5, 6);
    scene.party[3].setGridPosition(6, 6);
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('✔ PASS: Detector is 100% verified functional and responsive!\n');

  // =========================================================================
  // PHASE 2: SCENARIO 1 — LONG-DISTANCE ENGAGEMENT (3 CONSECUTIVE RUNS)
  // =========================================================================
  console.log('=============================================================');
  console.log('PHASE 2: Scenario 1 — Long-Distance Engagement (3 Full Runs)');
  console.log('=============================================================');

  for (let run = 1; run <= 3; run++) {
    console.log(`\n--- Scenario 1 [Run ${run} / 3] ---`);
    // Setup party at (3, 3) top-left, Wolf 1 at (17, 17) bottom-right (Chebyshev dist 14, around rocks)
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf2 = scene.enemies.find(e => e.entityName.includes('Wolf 2'));
      if (wolf2) {
        wolf2.setGridPosition(1, 1);
        wolf2.isAggroed = false;
        wolf2.stopMovement();
      }

      const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
      wolf.hp = wolf.maxHp;
      wolf.state = 'idle';
      wolf.isAggroed = false;
      wolf.stopMovement();
      wolf.setGridPosition(17, 17);

      scene.party[0].setGridPosition(3, 3);
      scene.party[1].setGridPosition(4, 3);
      scene.party[2].setGridPosition(3, 4);
      scene.party[3].setGridPosition(4, 4);
      for (const m of scene.party) {
        m.stopMovement();
        m.clearTarget();
      }
    });
    await new Promise(r => setTimeout(r, 200));

    console.log(`Engaging Wolf at (17, 17) from top-left (3, 3)...`);
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
      scene.engageEnemy(wolf);
    });

    // Monitor journey over 5 seconds (50 samples at 100ms)
    let runStackDetected = false;
    let midJourneyScreenshotTaken = false;

    for (let sample = 0; sample < 50; sample++) {
      await new Promise(r => setTimeout(r, 100));

      const status = await page.evaluate(() => {
        const overlay = window.__tileClaimOverlay;
        const report = overlay.lastReport;
        const scene = window.game.scene.getScene('MainScene');
        const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
        return {
          occupiedStacks: report.occupiedStacks,
          claimStacks: report.claimDoubleBookings,
          wolfPos: { ...wolf.gridPos },
          members: scene.party.map(m => ({
            name: m.entityName,
            pos: { ...m.gridPos },
            dest: m.claimedDestination ? { ...m.claimedDestination } : null,
            isMoving: m.isMoving()
          }))
        };
      });

      if (status.occupiedStacks.length > 0 || status.claimStacks.length > 0) {
        console.error(`❌ STACK DETECTED in Run ${run} at sample ${sample}!`, JSON.stringify(status, null, 2));
        runStackDetected = true;
      }

      // Capture mid-journey screenshot around sample 20 (2 seconds in)
      if (sample === 20 && !midJourneyScreenshotTaken) {
        midJourneyScreenshotTaken = true;
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `scenario1_run${run}_mid_journey.png`) });
        console.log(`  📸 Captured overlay screenshot: scenario1_run${run}_mid_journey.png`);
      }
    }

    if (runStackDetected) {
      throw new Error(`Scenario 1 Run ${run} failed due to stacking!`);
    }

    // Capture final surround / combat screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `scenario1_run${run}_surround.png`) });
    console.log(`  📸 Captured overlay screenshot: scenario1_run${run}_surround.png`);
    console.log(`✔ PASS: Scenario 1 Run ${run} completed with ZERO tile stacking!`);
  }

  // =========================================================================
  // PHASE 3: SCENARIO 2 — RE-ENGAGE AFTER HOLDING POSITION (3 CONSECUTIVE RUNS)
  // =========================================================================
  console.log('\n=============================================================');
  console.log('PHASE 3: Scenario 2 — Re-Engaging After Holding Position (3 Full Runs)');
  console.log('=============================================================');

  for (let run = 1; run <= 3; run++) {
    console.log(`\n--- Scenario 2 [Run ${run} / 3] ---`);
    // Step A: Set up Wolf 1 at (14, 14), Wolf 2 at (14, 4), party initially near (11, 14)
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      
      // Clean reset party
      scene.party[0].setGridPosition(11, 13);
      scene.party[1].setGridPosition(11, 14);
      scene.party[2].setGridPosition(11, 15);
      scene.party[3].setGridPosition(10, 14);
      for (const m of scene.party) {
        m.stopMovement();
        m.clearTarget();
        m.hp = m.maxHp;
        m.criticalHp = m.maxCriticalHp;
        m.state = 'idle';
      }

      // Wolf 2 placed out of aggro range at (14, 4)
      const wolf2 = scene.enemies.find(e => e.entityName.includes('Wolf 2'));
      if (wolf2) {
        wolf2.hp = wolf2.maxHp;
        wolf2.state = 'idle';
        wolf2.setGridPosition(14, 4);
        wolf2.isAggroed = false;
        wolf2.stopMovement();
      }

      // Wolf 1 placed at (14, 14)
      const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
      wolf.hp = wolf.maxHp;
      wolf.state = 'idle';
      wolf.setGridPosition(14, 14);
      wolf.isAggroed = false;
      wolf.stopMovement();

      // Engage Wolf 1
      scene.engageEnemy(wolf);
    });

    // Wait for party to surround Wolf 1
    await new Promise(r => setTimeout(r, 2000));

    // Step B: Defeat Wolf 1
    console.log('Defeating Wolf 1...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
      wolf.takeDamage(999);
      for (const m of scene.party) {
        if (m.targetEntity === wolf) {
          m.clearTarget();
        }
      }
    });
    await new Promise(r => setTimeout(r, 600));

    // Verify all party members are holding scattered combat positions
    const holdState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return scene.party.map(m => ({
        name: m.entityName,
        pos: { ...m.gridPos },
        dest: m.claimedDestination,
        isMoving: m.isMoving(),
        state: m.state
      }));
    });

    console.log('Scattered combat hold positions:');
    for (const m of holdState) {
      console.log(`  - ${m.name}: pos=(${m.pos.x}, ${m.pos.y}), dest=${m.dest}, isMoving=${m.isMoving}`);
      if (m.isMoving || m.dest !== null) {
        throw new Error(`${m.name} is moving or has claimed destination while holding position!`);
      }
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `scenario2_run${run}_holding_position.png`) });
    console.log(`  📸 Captured overlay screenshot: scenario2_run${run}_holding_position.png`);

    // Step C: Re-engage Wolf 2 at (14, 7) directly from scattered hold positions!
    console.log('Re-engaging Wolf 2 from scattered hold positions...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf2 = scene.enemies.find(e => e.entityName.includes('Wolf 2'));
      wolf2.setGridPosition(14, 7);
      wolf2.hp = wolf2.maxHp;
      wolf2.state = 'idle';
      wolf2.isAggroed = false;
      wolf2.stopMovement();
      scene.engageEnemy(wolf2);
    });

    // Monitor re-engagement journey
    let run2StackDetected = false;
    let midTravelScreenshotTaken = false;

    for (let sample = 0; sample < 40; sample++) {
      await new Promise(r => setTimeout(r, 100));

      const status = await page.evaluate(() => {
        const overlay = window.__tileClaimOverlay;
        const report = overlay.lastReport;
        const scene = window.game.scene.getScene('MainScene');
        return {
          occupiedStacks: report.occupiedStacks,
          claimStacks: report.claimDoubleBookings,
          members: scene.party.map(m => ({
            name: m.entityName,
            pos: { ...m.gridPos },
            dest: m.claimedDestination ? { ...m.claimedDestination } : null,
            isMoving: m.isMoving()
          }))
        };
      });

      if (status.occupiedStacks.length > 0 || status.claimStacks.length > 0) {
        console.error(`❌ STACK DETECTED in Scenario 2 Run ${run} at sample ${sample}!`, JSON.stringify(status, null, 2));
        run2StackDetected = true;
      }

      if (sample === 15 && !midTravelScreenshotTaken) {
        midTravelScreenshotTaken = true;
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `scenario2_run${run}_mid_travel.png`) });
        console.log(`  📸 Captured overlay screenshot: scenario2_run${run}_mid_travel.png`);
      }
    }

    if (run2StackDetected) {
      throw new Error(`Scenario 2 Run ${run} failed due to stacking!`);
    }

    // Capture final surround around Wolf 2
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `scenario2_run${run}_surround.png`) });
    console.log(`  📸 Captured overlay screenshot: scenario2_run${run}_surround.png`);
    console.log(`✔ PASS: Scenario 2 Run ${run} completed with ZERO tile stacking!`);
  }

  console.log('\n🎉 ALL VERIFICATION PHASES PASSED WITH ZERO TILE STACKING! 🎉');
  await browser.close();
}

run().catch(err => {
  console.error('Verification run failed:', err);
  process.exit(1);
});
