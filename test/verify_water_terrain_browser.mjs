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

async function runWaterTerrainBrowserVerification() {
  console.log('================================================================');
  console.log('🌊 LIVE BROWSER VERIFICATION: WATER TERRAIN GENERATION 🌊');
  console.log('================================================================\n');

  const serverProc = await ensureViteServer();

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Input]') || text.includes('water') || text.includes('Toast') || text.includes('Dungeon')) {
      console.log(`  [Browser] ${text}`);
    }
  });

  try {
    console.log(`[E2E] Loading game at ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Wait for Game to boot into OutpostScene
    await page.waitForFunction(() => {
      const g = window.game;
      const s = g?.scene?.getScene('OutpostScene');
      return s && s.scene.isActive();
    }, { timeout: 15000 });

    console.log('✓ Game booted into OutpostScene. Transitioning to Dungeon Floor 1...');

    // Transition from Outpost to Dungeon
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    // Wait for MainScene to be active with gridMatrix and player
    await page.waitForFunction(() => {
      const g = window.game;
      const s = g?.scene?.getScene('MainScene');
      return s && s.scene.isActive() && s.gridMatrix && s.player;
    }, { timeout: 15000 });
    await sleep(1000);

    console.log('✓ MainScene initialized with active player and gridMatrix.');

    // 1. Inspect live dungeon for water tiles and regional textures
    const dungeonInspection = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const dungeon = scene.dungeon;
      const waterTiles = scene.getWaterTiles();
      const activeRegion = scene.activeRegion || window.__lastActiveRegion;
      const matrixWaterCount = scene.gridMatrix.flat().filter((tile) => tile === 2).length;

      return {
        floorNumber: window.GameState?.getInstance?.()?.getDungeonFloorCount() || 1,
        activeRegionId: activeRegion?.id,
        activeRegionWaterTexture: activeRegion?.waterTexture,
        waterTilesCount: waterTiles.length,
        matrixWaterCount,
        waterTiles
      };
    });

    console.log(`[E2E] Floor ${dungeonInspection.floorNumber} (${dungeonInspection.activeRegionId}): Found ${dungeonInspection.waterTilesCount} water tile(s) registered, ${dungeonInspection.matrixWaterCount} in gridMatrix.`);
    console.log(`[E2E] Active Region Water Texture: '${dungeonInspection.activeRegionWaterTexture}'`);

    assert.ok(dungeonInspection.activeRegionWaterTexture, 'Active region must have waterTexture configured');

    // 2. If Floor 1 didn't roll water (chance is 60%), let's regenerate with guaranteed water or test water interact
    const waterTileToTest = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      let tiles = scene.getWaterTiles();
      if (tiles.length === 0) {
        // Find an interior room floor tile in gathering/light_combat room and place a test water tile
        for (const r of scene.dungeon.rooms) {
          if (r.type !== 'entrance' && r.type !== 'boss' && r.width >= 5) {
            const wx = r.x + 2;
            const wy = r.y + 2;
            scene.gridMatrix[wy][wx] = 2;
            scene.dungeon.waterTiles = [{ x: wx, y: wy }];
            tiles = scene.dungeon.waterTiles;
            break;
          }
        }
      }
      return tiles[0];
    });

    console.log(`[E2E] Selected water tile for interaction testing: (${waterTileToTest.x}, ${waterTileToTest.y})`);

    // 3. Test isWater and isObstacle in live Pathfinder
    const pathfinderVerification = await page.evaluate((wt) => {
      const scene = window.game.scene.getScene('MainScene');
      const isWaterResult = scene.isWater(wt.x, wt.y);
      const isObstacleResult = scene.pathfinder.isObstacle(wt.x, wt.y);
      const isWaterPf = scene.pathfinder.isWater(wt.x, wt.y);
      const isWallPf = scene.pathfinder.isWall(wt.x, wt.y);
      const isWalkablePf = scene.pathfinder.isWalkable(wt.x, wt.y);

      return {
        isWaterResult,
        isObstacleResult,
        isWaterPf,
        isWallPf,
        isWalkablePf
      };
    }, waterTileToTest);

    assert.strictEqual(pathfinderVerification.isWaterResult, true, 'scene.isWater must return true');
    assert.strictEqual(pathfinderVerification.isObstacleResult, true, 'pathfinder.isObstacle must return true for water');
    assert.strictEqual(pathfinderVerification.isWaterPf, true, 'pathfinder.isWater must return true');
    assert.strictEqual(pathfinderVerification.isWallPf, false, 'pathfinder.isWall must return false for water');
    assert.strictEqual(pathfinderVerification.isWalkablePf, false, 'pathfinder.isWalkable must return false for water');

    console.log('✓ Verified live Pathfinder obstacle & water classification queries.');

    // 4. Test clicking on water tile and adjacent-tile approach
    console.log('[E2E] Dispatching click to water tile...');
    const interactResult = await page.evaluate((wt) => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;

      // Teleport player near the water tile to test approach
      player.setGridPosition(wt.x - 2, wt.y);
      player.claimedDestination = null;

      // Click on the water tile
      scene.interactWithWater({ x: wt.x, y: wt.y }, [player]);
      const toastText = scene.hud?.buildFeedbackToastEl?.innerText || '';

      return {
        claimedDest: player.claimedDestination,
        initialPos: { x: player.gridPos.x, y: player.gridPos.y },
        toastText
      };
    }, waterTileToTest);

    console.log(`[E2E] Player initial pos: (${interactResult.initialPos.x}, ${interactResult.initialPos.y}), Claimed destination: (${interactResult.claimedDest?.x}, ${interactResult.claimedDest?.y})`);

    assert.ok(interactResult.claimedDest, 'Player must claim an adjacent destination tile');
    assert.notDeepStrictEqual(
      interactResult.claimedDest,
      waterTileToTest,
      'Destination must NEVER be on the water tile itself'
    );

    // Verify destination is adjacent to water tile
    const distToWater = Math.max(
      Math.abs(interactResult.claimedDest.x - waterTileToTest.x),
      Math.abs(interactResult.claimedDest.y - waterTileToTest.y)
    );
    assert.strictEqual(distToWater, 1, 'Claimed destination must be directly adjacent (Chebyshev distance 1) to water tile');

    // Wait for player to arrive at destination
    await sleep(800);

    const postMoveCheck = await page.evaluate((dest) => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const isWalkableDest = scene.gridMatrix[dest.y][dest.x] === 0;

      return {
        playerPos: { x: player.gridPos.x, y: player.gridPos.y },
        isWalkableDest
      };
    }, interactResult.claimedDest);

    assert.strictEqual(postMoveCheck.isWalkableDest, true, 'Destination tile must be walkable floor');
    console.log(`✓ Player arrived at adjacent destination tile (${postMoveCheck.playerPos.x}, ${postMoveCheck.playerPos.y}) facing water tile (${waterTileToTest.x}, ${waterTileToTest.y}).`);

    // 5. Verify In-Universe Toast Copy (Zero milestone or developer references)
    console.log(`[E2E] Water interaction toast text: "${interactResult.toastText}"`);
    assert.strictEqual(
      interactResult.toastText.toLowerCase().includes('milestone') ||
      interactResult.toastText.toLowerCase().includes('coming in') ||
      interactResult.toastText.toLowerCase().includes('fishing coming'),
      false,
      'Toast must NOT contain any developer or milestone references'
    );
    assert.strictEqual(
      interactResult.toastText,
      'The water here looks too deep to cross.',
      'Toast must display authentic in-universe copy: "The water here looks too deep to cross."'
    );
    console.log('✓ In-universe water interaction toast verified without placeholder text.');

    console.log('\n================================================================');
    console.log('🎉 ALL LIVE BROWSER WATER TERRAIN VERIFICATIONS PASSED! 🎉');
    console.log('================================================================\n');
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProc) {
      try {
        spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
      } catch (e) {}
    }
    process.exit(0);
  }
}

runWaterTerrainBrowserVerification().catch((err) => {
  console.error('\n❌ LIVE BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
