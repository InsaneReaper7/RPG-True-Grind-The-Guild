import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Input]') || text.includes('[Combat') || text.includes('Engaged') || text.includes('defeat') || text.includes('Stack')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await transitionToDungeon(page);

  // Spawn 3 companions so party has 4 members
  await page.evaluate(() => {
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  console.log('=== TEST A: Scenario 1 — Long Distance Engagement ===');
  // Position party at (5, 5) in 2x2 box, Wolf at (22, 22)
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf') && e.state !== 'dead');
    wolf.gridPos = { x: 22, y: 22 };
    wolf.x = 22 * scene.tileSize + scene.tileSize / 2;
    wolf.y = 22 * scene.tileSize + scene.tileSize / 2;
    wolf.stopMovement();
    wolf.isAggroed = false;

    // Party at (5, 5)
    scene.party[0].setGridPosition(5, 5);
    scene.party[1].setGridPosition(6, 5);
    scene.party[2].setGridPosition(5, 6);
    scene.party[3].setGridPosition(6, 6);
  });

  console.log('Clicking to engage far-away wolf at (22, 22)...');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf') && e.state !== 'dead');
    scene.engageEnemy(wolf);
  });

  // Track positions every 200ms for 5 seconds
  let scenario1StackDetected = false;
  for (let t = 0; t < 25; t++) {
    await new Promise(r => setTimeout(r, 200));
    const state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf = scene.enemies.find(e => e.entityName.includes('Wolf') && e.state !== 'dead');
      return {
        wolfPos: wolf ? { ...wolf.gridPos } : null,
        members: scene.party.map(m => ({
          name: m.entityName,
          pos: { ...m.gridPos },
          dest: m.claimedDestination ? { ...m.claimedDestination } : null,
          isMoving: m.isMoving(),
          state: m.state
        }))
      };
    });

    // Check for duplicate claimedDestinations
    const claimedDests = state.members.filter(m => m.dest !== null).map(m => `${m.dest.x},${m.dest.y}`);
    const uniqueDests = new Set(claimedDests);
    if (uniqueDests.size !== claimedDests.length) {
      console.log(`❌ STACK DETECTED IN CLAIMED DESTINATIONS at t=${t*200}ms!`, state.members);
      scenario1StackDetected = true;
    }

    // Check for duplicate resting positions among non-moving members
    const stoppedPositions = state.members.filter(m => !m.isMoving).map(m => `${m.pos.x},${m.pos.y}`);
    const uniqueStopped = new Set(stoppedPositions);
    if (uniqueStopped.size !== stoppedPositions.length) {
      console.log(`❌ STACK DETECTED IN STOPPED POSITIONS at t=${t*200}ms!`, state.members);
      scenario1StackDetected = true;
    }
  }

  console.log('Scenario 1 result:', scenario1StackDetected ? 'FAILED (Stacking)' : 'PASSED (Clean)');

  console.log('\n=== TEST B: Scenario 2 — Re-Engaging After Holding Position ===');
  // Defeat Wolf 1
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName === 'Wolf');
    if (wolf) wolf.takeDamage(999);
  });
  await new Promise(r => setTimeout(r, 800));

  // Verify party is holding scattered positions
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
  console.log('Holding positions after Wolf 1 defeat:');
  for (const m of holdState) {
    console.log(`  - ${m.name}: pos=(${m.pos.x}, ${m.pos.y}), dest=${m.dest}, isMoving=${m.isMoving}`);
  }

  // Now engage Wolf 2 at (14, 6) or position it somewhere specific
  console.log('Engaging Wolf 2 from scattered hold positions...');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf2 = scene.enemies.find(e => e.entityName.includes('Wolf 2'));
    if (wolf2) {
      scene.engageEnemy(wolf2);
    }
  });

  let scenario2StackDetected = false;
  for (let t = 0; t < 25; t++) {
    await new Promise(r => setTimeout(r, 200));
    const state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const wolf2 = scene.enemies.find(e => e.entityName.includes('Wolf 2'));
      return {
        wolf2Pos: wolf2 ? { ...wolf2.gridPos } : null,
        members: scene.party.map(m => ({
          name: m.entityName,
          pos: { ...m.gridPos },
          dest: m.claimedDestination ? { ...m.claimedDestination } : null,
          isMoving: m.isMoving(),
          state: m.state
        }))
      };
    });

    // Check for duplicate claimedDestinations
    const claimedDests = state.members.filter(m => m.dest !== null).map(m => `${m.dest.x},${m.dest.y}`);
    const uniqueDests = new Set(claimedDests);
    if (uniqueDests.size !== claimedDests.length) {
      console.log(`❌ STACK DETECTED IN CLAIMED DESTINATIONS at t=${t*200}ms!`, state.members);
      scenario2StackDetected = true;
    }

    // Check for duplicate positions among non-moving members
    const stoppedPositions = state.members.filter(m => !m.isMoving).map(m => `${m.pos.x},${m.pos.y}`);
    const uniqueStopped = new Set(stoppedPositions);
    if (uniqueStopped.size !== stoppedPositions.length) {
      console.log(`❌ STACK DETECTED IN STOPPED POSITIONS at t=${t*200}ms!`, state.members);
      scenario2StackDetected = true;
    }
  }

  console.log('Scenario 2 result:', scenario2StackDetected ? 'FAILED (Stacking)' : 'PASSED (Clean)');

  await browser.close();
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
