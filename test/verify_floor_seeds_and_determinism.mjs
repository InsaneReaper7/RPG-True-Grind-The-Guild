import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('================================================================');
  console.log('🧪 VERIFYING FLOOR SEEDS, LAYOUT DIVERSITY & DETERMINISM');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DungeonGenerator]') || text.includes('[MainScene]') || text.includes('Floor Seed')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const floorVisits = [];

  for (let visitNum = 1; visitNum <= 3; visitNum++) {
    console.log(`\n--- Portal Entry ${visitNum} ---`);

    // Enter Dungeon
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.dungeon && main.dungeon.seed !== undefined;
    }, { timeout: 10000 });
    await sleep(600);

    const floorData = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return {
        seed: main.dungeon.seed,
        currentFloorSeed: main.currentFloorSeed,
        roomCount: main.dungeon.rooms.length,
        rooms: main.dungeon.rooms.map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
        portal: main.dungeon.portalPos,
        crystal: main.dungeon.crystalPos
      };
    });

    console.log(`Visit ${visitNum} Floor Data:`, {
      seed: floorData.seed,
      currentFloorSeed: floorData.currentFloorSeed,
      roomCount: floorData.roomCount,
      portal: floorData.portal,
      crystal: floorData.crystal,
      firstRoom: floorData.rooms[0]
    });

    floorVisits.push(floorData);

    if (visitNum < 3) {
      // Transition back to Outpost
      await page.evaluate(() => {
        const main = window.game.scene.getScene('MainScene');
        main.executeTransitionToOutpost();
      });

      await page.waitForFunction(() => {
        const outpost = window.game.scene.getScene('OutpostScene');
        return outpost && outpost.scene.isActive();
      }, { timeout: 10000 });
      await sleep(600);
    }
  }

  // Check that all 3 visits generated distinct seeds and different room layouts
  console.log('\n--- Checking 3 Consecutive Portal Entries ---');
  const seeds = floorVisits.map(v => v.seed);
  console.log('Seeds generated across 3 visits:', seeds);
  if (seeds[0] === seeds[1] || seeds[1] === seeds[2] || seeds[0] === seeds[2]) {
    throw new Error(`Expected distinct seeds across 3 visits, got: ${seeds.join(', ')}`);
  }
  console.log('✔ All 3 portal entries have distinct seeds!');

  const layout0 = JSON.stringify(floorVisits[0].rooms);
  const layout1 = JSON.stringify(floorVisits[1].rooms);
  const layout2 = JSON.stringify(floorVisits[2].rooms);
  if (layout0 === layout1 || layout1 === layout2 || layout0 === layout2) {
    throw new Error('Expected different room layouts across visits, but found duplicate layouts!');
  }
  console.log('✔ All 3 portal entries have distinct room layouts!');

  // Now trigger Crystal Continue on visit 3
  console.log('\n--- Testing Crystal Continue Descent ---');
  const preContinueSeed = floorVisits[2].seed;

  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.executeContinueDescent();
  });

  // Wait for new floor to be generated
  await page.waitForFunction((prevSeed) => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.dungeon && main.dungeon.seed !== prevSeed;
  }, { timeout: 10000 }, preContinueSeed);
  await sleep(600);

  const continueFloorData = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    return {
      seed: main.dungeon.seed,
      currentFloorSeed: main.currentFloorSeed,
      roomCount: main.dungeon.rooms.length,
      rooms: main.dungeon.rooms.map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
      portal: main.dungeon.portalPos,
      crystal: main.dungeon.crystalPos
    };
  });

  console.log('Continue Floor Data:', {
    seed: continueFloorData.seed,
    currentFloorSeed: continueFloorData.currentFloorSeed,
    roomCount: continueFloorData.roomCount,
    portal: continueFloorData.portal,
    crystal: continueFloorData.crystal,
    firstRoom: continueFloorData.rooms[0]
  });

  if (continueFloorData.seed === preContinueSeed) {
    throw new Error(`Crystal continue did not change seed! Previous: ${preContinueSeed}, Current: ${continueFloorData.seed}`);
  }
  console.log('✔ Crystal Continue successfully generated a new floor with a distinct seed!');

  // Determinism test: calling DungeonGenerator.generate with the same seed must produce identical results
  console.log('\n--- Testing Seed Determinism ---');
  const determinismResult = await page.evaluate(async () => {
    const fixedSeed = 123456789;
    const { DungeonGenerator } = await import('/src/utils/DungeonGenerator.ts');
    const config = {
      mapWidth: 40,
      mapHeight: 40,
      roomCount: { min: 5, max: 8 },
      roomSize: { minWidth: 6, maxWidth: 12, minHeight: 6, maxHeight: 12 },
      corridorWidth: 2,
      maxDoorsPerRoom: 2
    };

    const rngA = DungeonGenerator.createRng(fixedSeed);
    const dungeonA = DungeonGenerator.generate(config, rngA);
    dungeonA.seed = fixedSeed;

    const rngB = DungeonGenerator.createRng(fixedSeed);
    const dungeonB = DungeonGenerator.generate(config, rngB);
    dungeonB.seed = fixedSeed;

    const rngC = DungeonGenerator.createRng(987654321);
    const dungeonC = DungeonGenerator.generate(config, rngC);
    dungeonC.seed = 987654321;

    const matchAB_grid = JSON.stringify(dungeonA.gridMatrix) === JSON.stringify(dungeonB.gridMatrix);
    const matchAB_rooms = JSON.stringify(dungeonA.rooms) === JSON.stringify(dungeonB.rooms);
    const matchAB_portal = JSON.stringify(dungeonA.portalPos) === JSON.stringify(dungeonB.portalPos);
    const matchAB_crystal = JSON.stringify(dungeonA.crystalPos) === JSON.stringify(dungeonB.crystalPos);

    const diffAC_grid = JSON.stringify(dungeonA.gridMatrix) !== JSON.stringify(dungeonC.gridMatrix);

    return {
      matchAB_grid,
      matchAB_rooms,
      matchAB_portal,
      matchAB_crystal,
      diffAC_grid,
      roomCountA: dungeonA.rooms.length,
      roomCountC: dungeonC.rooms.length,
      portalA: dungeonA.portalPos,
      crystalA: dungeonA.crystalPos,
      portalB: dungeonB.portalPos,
      crystalB: dungeonB.crystalPos
    };
  });

  console.log('Determinism Test Result:', determinismResult);

  if (!determinismResult.matchAB_grid || !determinismResult.matchAB_rooms || !determinismResult.matchAB_portal || !determinismResult.matchAB_crystal) {
    throw new Error('Determinism failed! Same seed did not produce identical dungeon output.');
  }
  if (!determinismResult.diffAC_grid) {
    throw new Error('Different seeds produced identical dungeon grid!');
  }
  console.log('✔ Seed determinism verified! Same seed produces byte-identical grid, rooms, and spawns.');

  await browser.close();
  console.log('\n================================================================');
  console.log('🎉 ALL FLOOR SEED AND DETERMINISM CHECKS PASSED');
  console.log('================================================================');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
