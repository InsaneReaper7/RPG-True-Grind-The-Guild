import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/f0f692ae-8585-414c-a1cf-732cc5aada4d';

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
  console.log('=== Starting Live Browser Convoy Movement Verification ===');
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
      if (text.includes('[Input]') || text.includes('[Convoy]') || text.includes('DBL-CLAIM') || text.includes('STACK')) {
        console.log(`  [BROWSER]`, text);
      }
    });

    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Transitioning to Dungeon (MainScene)...');
    await transitionToDungeon(page);

    // Clear ambient enemies so party can complete full 40+ tile corridor convoy journey without combat interruption
    console.log('Clearing ambient enemies for long-distance convoy transit test...');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      if (main && main.enemies) {
        main.enemies.forEach(e => {
          if (e.destroy) e.destroy();
        });
        main.enemies = [];
      }
    });

    // Spawn 3 companions to assemble full 4-member party
    console.log('Spawning 3 test companions to assemble 4-member party...');
    await page.evaluate(() => {
      window.__spawnTestCompanion();
      window.__spawnTestCompanion();
      window.__spawnTestCompanion();
    });
    await new Promise(r => setTimeout(r, 600));

    // Enable TileClaimDebugOverlay for visual verification and real-time stack/claim auditing
    console.log('Enabling TileClaimDebugOverlay...');
    await page.evaluate(() => {
      if (window.__tileClaimOverlay) {
        window.__tileClaimOverlay.setEnabled(true);
      }
    });
    await new Promise(r => setTimeout(r, 300));

    // Verify 4 living party members exist
    const partyInfo = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return main.party.map(m => ({ name: m.entityName, pos: { x: m.gridPos.x, y: m.gridPos.y } }));
    });
    console.log('Initial Party Roster & Positions:', partyInfo);
    assert.equal(partyInfo.length, 4, 'Must have 4 party members');

    // Find guaranteed reachable floor tile farthest away using BFS
    const movePlan = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const start = main.player.gridPos;
      const width = main.mapWidth;
      const height = main.mapHeight;

      const q = [{ x: start.x, y: start.y, dist: 0 }];
      const visited = new Set([`${start.x},${start.y}`]);
      let bestTile = null;
      let maxDist = 0;

      while (q.length > 0) {
        const curr = q.shift();
        if (curr.dist > maxDist) {
          maxDist = curr.dist;
          bestTile = { x: curr.x, y: curr.y };
        }
        for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
          const nx = curr.x + dx;
          const ny = curr.y + dy;
          const key = `${nx},${ny}`;
          if (!visited.has(key) && ny >= 0 && ny < height && nx >= 0 && nx < width && main.gridMatrix[ny][nx] === 0) {
            visited.add(key);
            q.push({ x: nx, y: ny, dist: curr.dist + 1 });
          }
        }
      }
      return { start, destination: bestTile, distance: maxDist };
    });

    console.log(`Found Long-Distance Navigation Target: Start=(${movePlan.start.x}, ${movePlan.start.y}) -> Dest=(${movePlan.destination.x}, ${movePlan.destination.y}) [BFS Path Distance: ${movePlan.distance} tiles]`);

    // Issue party convoy move command to target
    console.log('\n--- Issuing Single Shared Path Move Command ---');
    await page.evaluate((dest) => {
      const main = window.game.scene.getScene('MainScene');
      const claimed = new Set();
      main.executePartyConvoyMovement(main.party, dest.x, dest.y, claimed);
    }, movePlan.destination);

    await page.waitForFunction(() => {
      const main = window.game?.scene?.getScene('MainScene');
      return main && main.player && main.player.isMoving();
    }, { timeout: 4000 });
    console.log('Party leader and convoy successfully started moving.');

    // Step-by-step telemetry tracker during transit
    const telemetry = [];
    let maxStacksRecorded = 0;
    let maxDoubleBookingsRecorded = 0;
    let midTransitScreenshotTaken = false;

    console.log('\nTracking convoy telemetry in motion (sampling every 150ms)...');
    const startTime = Date.now();
    const timeoutMs = 35000; // 35s maximum travel time

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 150));

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

      // Capture mid-transit screenshot when party is moving through corridors
      if (!midTransitScreenshotTaken && telemetry.length >= 8 && tickData.isAnyMoving) {
        console.log('Capturing Mid-Transit Convoy Screenshot...');
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'convoy_mid_transit.png') });
        midTransitScreenshotTaken = true;
      }

      if (!tickData.isAnyMoving && telemetry.length >= 10) {
        console.log('All party members have arrived and are idle.');
        break;
      }
    }

    // Capture final arrival screenshot
    console.log('Capturing Final Arrival Formation Spread Screenshot...');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'convoy_arrival_formation.png') });

    // Telemetry and Invariant Assertions
    console.log('\n=============================================================');
    console.log('LIVE BROWSER TELEMETRY & INVARIANT ANALYSIS');
    console.log('=============================================================');
    console.log(`Total Samples Captured: ${telemetry.length}`);
    console.log(`Max Occupied Stacks Encountered: ${maxStacksRecorded}`);
    console.log(`Max Claim Double-Bookings Encountered: ${maxDoubleBookingsRecorded}`);

    assert.equal(maxStacksRecorded, 0, 'ZERO tile stacking collisions allowed during live browser run');
    assert.equal(maxDoubleBookingsRecorded, 0, 'ZERO claim double-bookings allowed during live browser run');

    // Print sample trajectory
    console.log('\nSample telemetry points showing unified convoy movement:');
    const sampleIndices = [0, Math.floor(telemetry.length * 0.25), Math.floor(telemetry.length * 0.5), Math.floor(telemetry.length * 0.75), telemetry.length - 1];
    for (const idx of sampleIndices) {
      const t = telemetry[idx];
      if (t) {
        const positions = t.party.map(p => `${p.name}:(${p.pos.x},${p.pos.y})`).join(' | ');
        console.log(`  [Sample ${idx}] ${positions}`);
      }
    }

    // Verify final formation spread
    const finalState = telemetry[telemetry.length - 1];
    const finalUniqueTiles = new Set(finalState.party.map(p => `${p.pos.x},${p.pos.y}`));
    console.log(`\nFinal Distinct Tiles Occupied: ${finalUniqueTiles.size} / 4`);
    assert.equal(finalUniqueTiles.size, 4, 'All 4 units must occupy distinct formation tiles at destination');

    // Save detailed telemetry log to artifact directory for walkthrough evidence
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'convoy_telemetry_log.json'),
      JSON.stringify({ movePlan, maxStacksRecorded, maxDoubleBookingsRecorded, telemetry }, null, 2)
    );
    console.log(`Saved detailed telemetry log to ${path.join(ARTIFACT_DIR, 'convoy_telemetry_log.json')}`);

    console.log('\n✔ ALL LIVE BROWSER CONVOY VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
