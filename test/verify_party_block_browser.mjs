import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/c65aeccf-6b8d-48cf-b369-64d7192a9e8e';

async function transitionToDungeon(page) {
  await page.evaluate(() => {
    const outpost = window.game?.scene?.getScene('OutpostScene');
    if (outpost && outpost.scene?.isActive()) {
      outpost.executeTransitionToDungeon();
    }
  });
  await page.waitForFunction(() => {
    const main = window.game?.scene?.getScene('MainScene');
    return main && main.scene?.isActive() && main.player && main.enemies && main.enemies.length > 0;
  }, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));
}

async function run() {
  console.log('=== Starting Live Browser 2x2 Block Movement Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Input]') || text.includes('DBL-CLAIM') || text.includes('STACK')) {
        console.log(`  [BROWSER]`, text);
      }
    });

    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Transitioning to Procedural Dungeon (MainScene)...');
    await transitionToDungeon(page);

    // Clear ambient enemies so party can complete full corridor journey without combat interruption
    console.log('Clearing ambient enemies and stopping floor respawn timer for clean transit test...');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      if (main) {
        main.floorTimerRemainingMs = 999999999;
        if (main.enemies) {
          main.enemies.forEach(e => {
            if (e.destroy) e.destroy();
          });
          main.enemies = [];
        }
        if (main.combatSystem) {
          main.combatSystem.setEnemies([]);
        }
      }
    });

    // Spawn 3 companions to assemble full 4-member party in 2x2 formation
    console.log('Spawning 3 test companions to assemble 4-member party...');
    await page.evaluate(() => {
      window.__spawnTestCompanion();
      window.__spawnTestCompanion();
      window.__spawnTestCompanion();
    });
    await new Promise(r => setTimeout(r, 600));

    // Enable TileClaimDebugOverlay for visual verification
    console.log('Enabling TileClaimDebugOverlay...');
    await page.evaluate(() => {
      if (window.__tileClaimOverlay) {
        window.__tileClaimOverlay.setEnabled(true);
      }
    });
    await new Promise(r => setTimeout(r, 300));

    // Verify 4 living party members exist in 2x2 formation
    const partyInfo = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return main.party.map(m => ({ name: m.entityName, pos: { x: m.gridPos.x, y: m.gridPos.y } }));
    });
    console.log('Initial Party Roster & Positions:', partyInfo);
    assert.equal(partyInfo.length, 4, 'Must have 4 party members');

    // Find a destination on this genuinely generated procedural dungeon floor that navigates through a corridor bend
    console.log('Scanning procedural floor for a long-distance target with corridor bends...');
    const targetPlan = await page.evaluate(async () => {
      const main = window.game.scene.getScene('MainScene');
      const startAnchor = { x: main.player.gridPos.x, y: main.player.gridPos.y };
      const width = main.mapWidth;
      const height = main.mapHeight;

      let bestAnchor = null;
      let bestPath = [];
      let maxTurns = 0;

      // Sample candidate 2x2 anchors across the map
      for (let y = 3; y < height - 3; y += 2) {
        for (let x = 3; x < width - 3; x += 2) {
          if (main.pathfinder.is2x2Walkable(x, y)) {
            const path = await main.pathfinder.find2x2Path(startAnchor, { x, y });
            if (path.length > 15) {
              // Count turns / direction changes
              let turns = 0;
              for (let i = 2; i < path.length; i++) {
                const dx1 = path[i - 1].x - path[i - 2].x;
                const dy1 = path[i - 1].y - path[i - 2].y;
                const dx2 = path[i].x - path[i - 1].x;
                const dy2 = path[i].y - path[i - 1].y;
                if (dx1 !== dx2 || dy1 !== dy2) {
                  turns++;
                }
              }
              if (turns > maxTurns || (turns === maxTurns && path.length > bestPath.length)) {
                maxTurns = turns;
                bestPath = path;
                bestAnchor = { x, y };
              }
            }
          }
        }
      }

      return {
        startAnchor,
        destAnchor: bestAnchor,
        pathLength: bestPath.length,
        turnCount: maxTurns,
        pathSample: bestPath.slice(0, 10)
      };
    });

    console.log(`Selected Procedural Dungeon Path: length=${targetPlan.pathLength} steps, turns=${targetPlan.turnCount}, destAnchor=(${targetPlan.destAnchor.x}, ${targetPlan.destAnchor.y})`);
    assert.ok(targetPlan.destAnchor, 'Must find valid 2x2 destination on procedural dungeon floor');
    assert.ok(targetPlan.turnCount >= 1, 'Target path must navigate at least one corridor bend/corner');

    // Issue party block movement command
    console.log('\n--- Issuing 2x2 Block Movement Command ---');
    await page.evaluate((dest) => {
      const main = window.game.scene.getScene('MainScene');
      main.executePartyBlockMovement(main.party, dest.x, dest.y, new Set());
    }, targetPlan.destAnchor);

    // Retrieve destination highlights
    const highlightedTiles = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return main.activeMoveHighlights.map(h => ({ x: h.dest.x, y: h.dest.y }));
    });
    console.log('Destination Highlights Created:', highlightedTiles);
    assert.equal(highlightedTiles.length, 4, 'Must create 4 destination highlights');

    await page.waitForFunction(() => {
      const main = window.game?.scene?.getScene('MainScene');
      return main && main.player && main.player.isMoving();
    }, { timeout: 4000 });
    console.log('Party successfully started moving in lockstep.');

    // Telemetry tracker
    const telemetry = [];
    let maxStacksRecorded = 0;
    let maxDoubleBookingsRecorded = 0;
    let midTransitScreenshotTaken = false;
    let non2x2Count = 0;

    console.log('\nTracking 2x2 block telemetry in motion (sampling every 100ms)...');
    const startTime = Date.now();
    const timeoutMs = 35000;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));

      const tickData = await page.evaluate(() => {
        const main = window.game.scene.getScene('MainScene');
        const overlay = window.__tileClaimOverlay;
        const party = main.party.map(m => ({
          name: m.entityName,
          pos: { x: m.gridPos.x, y: m.gridPos.y },
          moving: m.isMoving(),
          claimed: m.claimedDestination ? { x: m.claimedDestination.x, y: m.claimedDestination.y } : null
        }));

        const report = overlay ? overlay.lastReport : { occupiedStacks: [], claimDoubleBookings: [] };
        return {
          party,
          isAnyMoving: party.some(m => m.moving),
          stacks: report.occupiedStacks.length,
          doubleBookings: report.claimDoubleBookings.length
        };
      });

      telemetry.push(tickData);
      if (tickData.stacks > maxStacksRecorded) maxStacksRecorded = tickData.stacks;
      if (tickData.doubleBookings > maxDoubleBookingsRecorded) maxDoubleBookingsRecorded = tickData.doubleBookings;

      // Check 2x2 shape during movement
      if (tickData.isAnyMoving) {
        const p = tickData.party;
        const u0 = p[0].pos;
        const u1 = p[1].pos;
        const u2 = p[2].pos;
        const u3 = p[3].pos;
        const is2x2 =
          u1.x === u0.x + 1 && u1.y === u0.y &&
          u2.x === u0.x && u2.y === u0.y + 1 &&
          u3.x === u0.x + 1 && u3.y === u0.y + 1;
        if (!is2x2) {
          non2x2Count++;
        }
      }

      // Capture mid-transit screenshot while party is navigating through corridor / corner
      if (!midTransitScreenshotTaken && telemetry.length >= 12 && tickData.isAnyMoving) {
        console.log('Capturing Mid-Transit 2x2 Block Corner Turn Screenshot...');
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'block_mid_transit_bend.png') });
        midTransitScreenshotTaken = true;
      }

      if (!tickData.isAnyMoving && telemetry.length >= 10) {
        console.log('All party members have arrived and are idle.');
        break;
      }
    }

    // Capture final arrival screenshot
    console.log('Capturing Final Arrival 2x2 Block Screenshot...');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'block_arrival_destination.png') });

    // Final occupied positions
    const finalPartyState = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return main.party.map(m => ({
        name: m.entityName,
        pos: { x: m.gridPos.x, y: m.gridPos.y }
      }));
    });

    console.log('\n=============================================================');
    console.log('LIVE PROCEDURAL DUNGEON 2X2 BLOCK VERIFICATION RESULTS');
    console.log('=============================================================');
    console.log(`Total Telemetry Samples: ${telemetry.length}`);
    console.log(`Non-2x2 Samples during transit: ${non2x2Count}`);
    console.log(`Max Occupied Stacks: ${maxStacksRecorded}`);
    console.log(`Max Double-Bookings: ${maxDoubleBookingsRecorded}`);
    console.log('Final Unit Positions:', finalPartyState);
    console.log('Initial Highlighted Tiles:', highlightedTiles);

    // Invariant assertions:
    assert.equal(non2x2Count, 0, 'Party must NEVER break 2x2 block formation during travel');
    assert.equal(maxStacksRecorded, 0, 'ZERO occupied stacks allowed');
    assert.equal(maxDoubleBookingsRecorded, 0, 'ZERO claim double-bookings allowed');

    // Assert 100% exact match between highlighted destination tiles and final occupied tiles
    for (let i = 0; i < 4; i++) {
      const h = highlightedTiles[i];
      const m = finalPartyState[i];
      assert.equal(m.pos.x, h.x, `${m.name} final x (${m.pos.x}) must match highlighted x (${h.x})`);
      assert.equal(m.pos.y, h.y, `${m.name} final y (${m.pos.y}) must match highlighted y (${h.y})`);
    }
    console.log('✔ 100% exact match between highlighted destination and final occupied tiles verified!');

    // Save telemetry log
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'block_telemetry_log.json'),
      JSON.stringify({ targetPlan, highlightedTiles, finalPartyState, maxStacksRecorded, maxDoubleBookingsRecorded, telemetry }, null, 2)
    );
    console.log(`Telemetry log saved to ${path.join(ARTIFACT_DIR, 'block_telemetry_log.json')}`);

    console.log('\n✔ ALL LIVE BROWSER 2X2 BLOCK VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
