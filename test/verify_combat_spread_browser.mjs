import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\a6827a3b-4552-469b-b6e0-e2c0e4976f50';

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
  console.log('=== Launching Google Chrome for Live Gameplay Spread Engage Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Input]') || text.includes('[Combat') || text.includes('Engaged') || text.includes('defeat')) {
      console.log('  [BROWSER CONSOLE]', text);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await transitionToDungeon(page);

  // Spawn 3 companions so party is full (4 members)
  await page.evaluate(() => {
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  console.log('\n--- 1. Setting up Exact Spread Configuration (Distances 1, 2, 3, 2) ---');
  const setupResult = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf') && e.state !== 'dead');
    wolf.gridPos = { x: 10, y: 10 };
    wolf.x = 10 * scene.tileSize + scene.tileSize / 2;
    wolf.y = 10 * scene.tileSize + scene.tileSize / 2;
    wolf.stopMovement();

    // Party spread:
    // Leader at (11, 10) -> distance = 1
    // Valerie at (12, 10) -> distance = 2
    // Kaelen at (13, 10) -> distance = 3
    // Barris at (11, 12) -> distance = 2
    const positions = [
      { x: 11, y: 10 },
      { x: 12, y: 10 },
      { x: 13, y: 10 },
      { x: 11, y: 12 }
    ];

    scene.party.forEach((m, idx) => {
      m.setGridPosition(positions[idx].x, positions[idx].y);
      m.claimedDestination = null;
      m.stopMovement();
      m.clearTarget();
    });

    return {
      wolfPos: wolf.gridPos,
      partyPositions: scene.party.map(m => ({
        name: m.entityName,
        pos: { ...m.gridPos },
        dist: Math.max(Math.abs(m.gridPos.x - wolf.gridPos.x), Math.abs(m.gridPos.y - wolf.gridPos.y))
      }))
    };
  });

  console.log('Wolf position:', setupResult.wolfPos);
  console.log('Party positions & initial distances to wolf:');
  for (const m of setupResult.partyPositions) {
    console.log(`  - ${m.name}: (${m.pos.x}, ${m.pos.y}) -> Distance: ${m.dist} tiles`);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spread_engage_1_setup.png') });

  console.log('\n--- 2. Engaging Wolf via engageEnemy() ---');
  const engageReaction = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf') && e.state !== 'dead');
    scene.engageEnemy(wolf);

    return scene.party.map(m => ({
      name: m.entityName,
      startPos: { ...m.gridPos },
      dest: m.claimedDestination ? { ...m.claimedDestination } : null,
      state: m.state
    }));
  });

  console.log('Immediate Party Reactions upon Engage:');
  for (const m of engageReaction) {
    console.log(`  - ${m.name}: start=(${m.startPos.x}, ${m.startPos.y}), dest=${m.dest ? `(${m.dest.x}, ${m.dest.y})` : 'none (holding position)'}, state=${m.state}`);
  }

  // Verify Leader holds position
  const leaderReaction = engageReaction[0];
  if (leaderReaction.dest === null || (leaderReaction.dest.x === 11 && leaderReaction.dest.y === 10)) {
    console.log('✔ PASS: Leader at distance 1 held position!');
  } else {
    throw new Error('Leader at distance 1 failed to hold position');
  }

  // Verify Companions are assigned to distinct tiles within range 1
  const compReactions = engageReaction.slice(1);
  const compDests = compReactions.map(r => r.dest);
  for (const r of compReactions) {
    if (!r.dest) {
      throw new Error(`Companion ${r.name} was not assigned an attack destination!`);
    }
  }
  const allDests = [leaderReaction.startPos, ...compDests];
  const uniqueKeys = new Set(allDests.map(d => `${d.x},${d.y}`));
  if (uniqueKeys.size === 4) {
    console.log('✔ PASS: All 4 members assigned distinct, non-overlapping tiles (zero stacking)!');
  } else {
    throw new Error(`Stacking detected! Distinct destinations: ${uniqueKeys.size} / 4`);
  }

  // Wait for companions to travel to their attack tiles
  console.log('\n--- 3. Waiting for party members to reach attack range and strike wolf ---');
  await new Promise(r => setTimeout(r, 2000));

  const combatPositions = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf'));
    return {
      wolfPos: wolf.gridPos,
      wolfHp: wolf.hp,
      members: scene.party.map(m => ({
        name: m.entityName,
        pos: { ...m.gridPos },
        dist: Math.max(Math.abs(m.gridPos.x - wolf.gridPos.x), Math.abs(m.gridPos.y - wolf.gridPos.y)),
        state: m.state
      }))
    };
  });

  console.log('Party positions during combat:');
  for (const m of combatPositions.members) {
    console.log(`  - ${m.name}: (${m.pos.x}, ${m.pos.y}), Distance to wolf: ${m.dist} tiles, State: ${m.state}`);
    if (m.dist > 1) {
      throw new Error(`${m.name} failed to reach Chebyshev distance 1 from wolf! Distance is ${m.dist}`);
    }
  }

  // Verify all 4 members occupy distinct tiles around the wolf (zero stacking!)
  const combatKeys = new Set(combatPositions.members.map(m => `${m.pos.x},${m.pos.y}`));
  if (combatKeys.size !== 4) {
    throw new Error(`Stacking detected during combat! Distinct positions: ${combatKeys.size} / 4`);
  }
  console.log('✔ PASS: Every party member successfully reached distance 1 on distinct tiles (zero stacking)!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spread_engage_2_surround.png') });

  // Defeat the wolf
  console.log('\n--- 4. Defeating wolf and verifying Hold Position (No Auto-Reform) ---');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const wolf = scene.enemies.find(e => e.entityName.includes('Wolf'));
    wolf.takeDamage(999); // Instantly defeat
  });
  await new Promise(r => setTimeout(r, 800));

  const postDefeatState = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    return scene.party.map(m => ({
      name: m.entityName,
      pos: { ...m.gridPos },
      dest: m.claimedDestination,
      isMoving: m.isMoving(),
      state: m.state,
      target: m.targetEntity ? m.targetEntity.entityName : null
    }));
  });

  console.log('Post-Defeat Party State:');
  for (const m of postDefeatState) {
    console.log(`  - ${m.name}: (${m.pos.x}, ${m.pos.y}), isMoving=${m.isMoving}, state=${m.state}, target=${m.target}`);
    if (m.isMoving || m.state === 'moving' || m.dest !== null) {
      throw new Error(`${m.name} is moving or has claimed destination after combat! Auto-reform detected!`);
    }
  }
  console.log('✔ PASS: All party members held their exact combat positions upon victory (zero auto-reform)!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spread_engage_3_hold_position.png') });

  // Issue click-to-move
  console.log('\n--- 5. Issuing click-to-move and verifying 2x2 box formation resumes normally ---');
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const cam = scene.cameras.main;
    const targetWorldX = 5 * scene.tileSize + scene.tileSize / 2;
    const targetWorldY = 5 * scene.tileSize + scene.tileSize / 2;

    const ptrX = (targetWorldX - cam.worldView.x) * cam.zoom;
    const ptrY = (targetWorldY - cam.worldView.y) * cam.zoom;

    scene.input.emit('pointerdown', { x: ptrX, y: ptrY });
  });
  await new Promise(r => setTimeout(r, 300));

  const moveOrderState = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    return scene.party.map(m => ({
      name: m.entityName,
      start: { ...m.gridPos },
      dest: m.claimedDestination ? { ...m.claimedDestination } : null,
      isMoving: m.isMoving()
    }));
  });

  console.log('Click-to-Move Destinations:');
  for (const m of moveOrderState) {
    console.log(`  - ${m.name}: start=(${m.start.x}, ${m.start.y}) -> dest=(${m.dest?.x}, ${m.dest?.y})`);
  }

  // Slot 0: (5, 5), Slot 1: (6, 5), Slot 2: (5, 6), Slot 3: (6, 6)
  const expectedFormation = [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 5, y: 6 },
    { x: 6, y: 6 }
  ];

  moveOrderState.forEach((m, idx) => {
    const exp = expectedFormation[idx];
    if (!m.dest || m.dest.x !== exp.x || m.dest.y !== exp.y) {
      throw new Error(`Formation slot mismatch for ${m.name}: expected (${exp.x}, ${exp.y}) but got (${m.dest?.x}, ${m.dest?.y})`);
    }
  });
  console.log('✔ PASS: 2x2 Box formation resumed with exact slots (5,5), (6,5), (5,6), (6,6)!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'spread_engage_4_formation_resumed.png') });

  console.log('\n🎉 ALL REAL BROWSER GAMEPLAY VERIFICATIONS PASSED FLAWLESSLY! 🎉');
  await browser.close();
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
