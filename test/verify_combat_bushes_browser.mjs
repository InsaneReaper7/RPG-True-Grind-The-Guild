import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/2913525e-02c4-4966-a243-2510d2fe4e75';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Gathering Nodes in Combat Rooms Browser Verification ===');
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
      if (
        text.includes('[Dungeon') ||
        text.includes('[Foraging]') ||
        text.includes('[Combat') ||
        text.includes('[MainScene]') ||
        text.includes('[OutpostScene]')
      ) {
        console.log('  [BROWSER LOG]', text);
      }
    });

    console.log('Navigating to http://localhost:5173 ...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    // Enter Dungeon from Outpost
    console.log('Transitioning to Dungeon from Outpost...');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });
    await sleep(1500);

    // Verify MainScene state and room entities
    const sceneState = await page.evaluate(() => {
      const main = window.game?.scene?.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      if (!main || !dungeon) return null;

      const roomsInfo = dungeon.rooms.map(r => {
        const bushes = dungeon.bushSpawns.filter(b => b.roomIndex === r.id);
        const enemies = dungeon.enemySpawns.filter(e => e.roomIndex === r.id);
        return {
          id: r.id,
          type: r.type,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          bushCount: bushes.length,
          enemyCount: enemies.length
        };
      });

      return {
        isActive: main.scene.isActive(),
        rooms: roomsInfo,
        totalBushes: dungeon.bushSpawns.length,
        totalEnemies: dungeon.enemySpawns.length,
        foragingBushesCount: main.foragingBushes.length
      };
    });

    assert.ok(sceneState, 'MainScene and __lastGeneratedDungeon must be loaded');
    assert.ok(sceneState.isActive, 'MainScene must be active');
    console.log(`\nDungeon generated with ${sceneState.rooms.length} rooms:`);
    for (const r of sceneState.rooms) {
      console.log(`  Room ${r.id} [${r.type}]: ${r.bushCount} bushes, ${r.enemyCount} enemies`);
    }

    const lightRooms = sceneState.rooms.filter(r => r.type === 'light_combat');
    const heavyRooms = sceneState.rooms.filter(r => r.type === 'heavy_combat');
    const gatheringRooms = sceneState.rooms.filter(r => r.type === 'gathering');
    const entranceRooms = sceneState.rooms.filter(r => r.type === 'entrance');

    // Confirm Entrance room
    for (const er of entranceRooms) {
      assert.equal(er.bushCount, 0, 'Entrance room must have 0 bushes');
      assert.equal(er.enemyCount, 0, 'Entrance room must have 0 enemies');
    }

    // Confirm Gathering room
    for (const gr of gatheringRooms) {
      assert.ok(gr.bushCount >= 2 && gr.bushCount <= 4, 'Gathering room must have 2-4 bushes');
      assert.equal(gr.enemyCount, 0, 'Gathering room must have 0 enemies');
    }

    // Confirm Light Combat room
    for (const lr of lightRooms) {
      assert.ok(lr.bushCount >= 1 && lr.bushCount <= 3, 'Light combat room must have 1-3 bushes');
      assert.ok(lr.enemyCount >= 1 && lr.enemyCount <= 2, 'Light combat room must have 1-2 enemies');
    }

    // Confirm Heavy Combat room
    for (const hr of heavyRooms) {
      assert.ok(hr.bushCount >= 2 && hr.bushCount <= 5, 'Heavy combat room must have 2-5 bushes');
      assert.ok(hr.enemyCount >= 3 && hr.enemyCount <= 5, 'Heavy combat room must have 3-5 enemies');
    }

    console.log('✔ Confirmed: Light & Heavy Combat rooms contain bushes alongside their enemies!');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'combat_room_bushes_overview.png') });

    // -------------------------------------------------------------------------
    // Test bush harvesting inside a Combat Room
    // -------------------------------------------------------------------------
    console.log('\n--- Testing Bush Harvesting in Combat Room ---');
    const harvestResult = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      
      // Find a combat room (light or heavy) with a bush
      const combatRoom = dungeon.rooms.find(r => (r.type === 'light_combat' || r.type === 'heavy_combat') && 
        dungeon.bushSpawns.some(b => b.roomIndex === r.id));

      if (!combatRoom) return { error: 'No combat room with bush found' };

      const bushSpawn = dungeon.bushSpawns.find(b => b.roomIndex === combatRoom.id);
      const bush = main.foragingBushes.find(b => b.x === bushSpawn.x && b.y === bushSpawn.y);

      if (!bush) return { error: 'Bush sprite not found in main.foragingBushes' };

      const initialHerbs = window.GameState.getInstance().getItemCount('wild_herbs');
      const initialForagingExp = main.player.progression.getProficiencyStat('foraging').currentExp;

      // Harvest bush directly
      main.harvestBush(bush);

      const postHerbs = window.GameState.getInstance().getItemCount('wild_herbs');
      const postForagingExp = main.player.progression.getProficiencyStat('foraging').currentExp;

      return {
        roomType: combatRoom.type,
        roomId: combatRoom.id,
        bushPos: { x: bush.x, y: bush.y },
        isHarvested: bush.isHarvested,
        herbYield: postHerbs - initialHerbs,
        expGained: postForagingExp - initialForagingExp
      };
    });

    console.log('Harvest Result in Combat Room:', harvestResult);
    assert.equal(harvestResult.isHarvested, true, 'Bush in combat room must be harvested');
    assert.equal(harvestResult.herbYield, 1, 'Bush harvest must yield 1 Wild Herbs');
    assert.equal(harvestResult.expGained, 15, 'Bush harvest must award 15 Foraging EXP');

    await sleep(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'combat_room_bush_harvested.png') });

    console.log('✔ Harvesting in combat room functions identically to gathering room!');
    console.log('\n=== ALL BROWSER VERIFICATIONS PASSED SUCCESSFULLY! ===');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
