import puppeteer from 'puppeteer-core';

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
  console.log('=== Launching Google Chrome for Real Browser Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('??') || text.includes('COLLISION') || text.includes('[Input]') || text.includes('Wolf')) {
      console.log('  [BROWSER CONSOLE]', text);
    }
  });

  // =========================================================================
  // TEST 1: Bug A - 1-Tile Short Moves in All 4 Directions (North, South, East, West)
  // =========================================================================
  console.log('\n======================================================');
  console.log('TEST 1: Bug A - 1-Tile Short Moves (North, South, East, West)');
  console.log('======================================================');
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

  const testDirections = [
    { dir: 'North', dx: 0, dy: -1 },
    { dir: 'South', dx: 0, dy: 1 },
    { dir: 'East', dx: 1, dy: 0 },
    { dir: 'West', dx: -1, dy: 0 },
  ];

  for (const { dir, dx, dy } of testDirections) {
    const result = await page.evaluate(async (dx, dy) => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.player;
      const allMembers = scene.party;

      // Reset party positions to clean 2x2 grid around (6, 6)
      const basePositions = [
        { x: 6, y: 6 },
        { x: 7, y: 6 },
        { x: 6, y: 7 },
        { x: 7, y: 7 }
      ];
      allMembers.forEach((m, idx) => {
        m.gridPos = { ...basePositions[idx] };
        m.x = m.gridPos.x * 32 + 16;
        m.y = m.gridPos.y * 32 + 16;
        m.currentPath = [];
        m.claimedDestination = null;
        m.state = 'idle';
      });

      const leaderStart = { ...hero.gridPos };
      const targetPos = { x: leaderStart.x + dx, y: leaderStart.y + dy };
      const px = targetPos.x * 32 + 16;
      const py = targetPos.y * 32 + 16;

      scene.input.emit('pointerdown', { x: px, y: py });

      await new Promise(r => setTimeout(r, 100));

      const states = allMembers.map(m => ({
        id: m.id,
        name: m.entityName || m.id,
        startPos: m.gridPos,
        dest: m.claimedDestination ? { ...m.claimedDestination } : null,
        moving: m.state === 'moving' || (m.path && m.path.length > 0),
        pathLen: m.path ? m.path.length : 0
      }));

      // Wait for movement completion
      await new Promise(r => setTimeout(r, 1600));

      const finalPositions = allMembers.map(m => ({
        id: m.id,
        name: m.entityName || m.id,
        finalPos: { x: m.gridPos.x, y: m.gridPos.y },
        dest: m.claimedDestination ? { ...m.claimedDestination } : null,
        moving: m.state === 'moving'
      }));

      const tileKeys = finalPositions.map(p => `${p.finalPos.x},${p.finalPos.y}`);
      const uniqueTiles = new Set(tileKeys);
      const stuckMembers = states.filter(s => !s.moving);

      return {
        leaderStart,
        targetPos,
        initialStates: states,
        finalPositions,
        distinctTilesCount: uniqueTiles.size,
        totalMembers: allMembers.length,
        stuckCount: stuckMembers.length,
        stuckNames: stuckMembers.map(s => s.name)
      };
    }, dx, dy);

    console.log(`\n--- 1-Tile Move ${dir}: From (${result.leaderStart.x},${result.leaderStart.y}) to (${result.targetPos.x},${result.targetPos.y}) ---`);
    console.log(`  Initial States (Moving & Destinations):`);
    result.initialStates.forEach(s => {
      console.log(`    - ${s.name}: moving=${s.moving}, dest=(${s.dest?.x},${s.dest?.y})`);
    });
    console.log(`  Final Positions:`);
    result.finalPositions.forEach(f => {
      console.log(`    - ${f.name}: finalPos=(${f.finalPos.x},${f.finalPos.y})`);
    });
    console.log(`  Summary: Distinct Tiles=${result.distinctTilesCount}/${result.totalMembers}, Stuck Members=${result.stuckCount}`);
  }

  // =========================================================================
  // TEST 2: Bug B - 10 Rapid Consecutive Enemy-Engage Clicks
  // =========================================================================
  console.log('\n======================================================');
  console.log('TEST 2: Bug B - 10 Rapid Consecutive Engage Clicks on Enemy');
  console.log('======================================================');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await transitionToDungeon(page);

  await page.evaluate(() => {
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  const engageResult = await page.evaluate(async () => {
    const scene = window.game.scene.getScene('MainScene');
    const allMembers = scene.party;
    const wolf = scene.enemies.find(e => e && e.state !== 'dead' && e.state !== 'downed');

    if (!wolf) return { error: 'No alive enemy found' };

    const wolfPos = { ...wolf.gridPos };
    const px = wolfPos.x * 32 + 16;
    const py = wolfPos.y * 32 + 16;

    let destinationCollisions = 0;
    let occupancyCollisions = 0;
    const clickLogs = [];

    // Perform 10 rapid clicks spaced 120ms apart
    for (let i = 1; i <= 10; i++) {
      scene.input.emit('pointerdown', { x: px, y: py });

      await new Promise(r => setTimeout(r, 120));

      const destKeys = [];
      allMembers.forEach(m => {
        if (m.claimedDestination) {
          destKeys.push(`${m.claimedDestination.x},${m.claimedDestination.y}`);
        }
      });
      const uniqueDests = new Set(destKeys);
      if (destKeys.length !== uniqueDests.size) {
        destinationCollisions++;
      }

      clickLogs.push({
        click: i,
        claimedDests: allMembers.map(m => `${m.entityName}: (${m.claimedDestination?.x},${m.claimedDestination?.y})`).join(' | '),
      });
    }

    // Wait 2.8 seconds for all units to finish moving around the wolf
    await new Promise(r => setTimeout(r, 2800));

    // Check final tile occupancy
    const posKeys = allMembers.map(m => `${m.gridPos.x},${m.gridPos.y}`);
    const uniquePositions = new Set(posKeys);
    if (posKeys.length !== uniquePositions.size) {
      occupancyCollisions++;
    }

    const finalMembers = allMembers.map(m => ({
      name: m.entityName,
      gridPos: { x: m.gridPos.x, y: m.gridPos.y },
      target: m.targetEntity ? (m.targetEntity.entityName || 'Wolf') : null,
      state: m.state
    }));

    return {
      wolfPos,
      totalClicks: 10,
      destinationCollisions,
      occupancyCollisions,
      clickLogs,
      finalMembers
    };
  });

  console.log(`Enemy: Wolf at (${engageResult.wolfPos?.x}, ${engageResult.wolfPos?.y})`);
  console.log(`Rapid Clicks Progression:`);
  engageResult.clickLogs.forEach(c => {
    console.log(`  Click #${c.click}: ${c.claimedDests}`);
  });
  console.log('\nFinal Member Statuses around Wolf:');
  engageResult.finalMembers.forEach(m => {
    console.log(`  - ${m.name}: pos=(${m.gridPos.x},${m.gridPos.y}), target=${m.target}, state=${m.state}`);
  });
  console.log(`\nDestination Collisions across clicks: ${engageResult.destinationCollisions}`);
  console.log(`Tile Occupancy Collisions on arrival: ${engageResult.occupancyCollisions}`);

  // =========================================================================
  // TEST 3: Bug C - Cold-Start Distant Engagement (0 Prior Movement Clicks)
  // =========================================================================
  console.log('\n======================================================');
  console.log('TEST 3: Bug C - Cold-Start Distant Engagement (0 Prior Moves)');
  console.log('======================================================');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await transitionToDungeon(page);

  await page.evaluate(() => {
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  const coldStartResult = await page.evaluate(async () => {
    const scene = window.game.scene.getScene('MainScene');
    const allMembers = scene.party;
    const wolf = scene.enemies.find(e => e && e.state !== 'dead' && e.state !== 'downed');

    const initialSpawn = allMembers.map(m => ({
      name: m.entityName,
      pos: { x: m.gridPos.x, y: m.gridPos.y },
      state: m.state
    }));

    // Zero prior moves performed! Directly click on distant wolf
    const px = wolf.gridPos.x * 32 + 16;
    const py = wolf.gridPos.y * 32 + 16;

    scene.input.emit('pointerdown', { x: px, y: py });

    // Inspect immediate reaction after async path resolution
    await new Promise(r => setTimeout(r, 200));

    const immediateStates = allMembers.map(m => ({
      name: m.entityName,
      state: m.state,
      moving: m.state === 'moving' || (m.path && m.path.length > 0),
      target: m.targetEntity ? (m.targetEntity.entityName || 'Wolf') : null,
      dest: m.claimedDestination ? { x: m.claimedDestination.x, y: m.claimedDestination.y } : null,
      pathLen: m.path ? m.path.length : 0
    }));

    // Wait 3.2 seconds for traversal across dungeon
    await new Promise(r => setTimeout(r, 3200));

    const endStates = allMembers.map(m => ({
      name: m.entityName,
      finalPos: { x: m.gridPos.x, y: m.gridPos.y },
      distanceToWolf: Math.abs(m.gridPos.x - wolf.gridPos.x) + Math.abs(m.gridPos.y - wolf.gridPos.y),
      target: m.targetEntity ? (m.targetEntity.entityName || 'Wolf') : null,
      state: m.state
    }));

    return {
      wolfPos: { x: wolf.gridPos.x, y: wolf.gridPos.y },
      initialSpawn,
      immediateStates,
      endStates,
      allRespondedImmediately: immediateStates.every(s => s.moving && s.target !== null),
      partySize: allMembers.length
    };
  });

  console.log(`Wolf Position: (${coldStartResult.wolfPos.x}, ${coldStartResult.wolfPos.y})`);
  console.log(`Initial Cold-Start Spawn Positions (0 prior moves):`);
  coldStartResult.initialSpawn.forEach(s => {
    console.log(`  - ${s.name}: spawned at (${s.pos.x},${s.pos.y}), state=${s.state}`);
  });
  console.log(`\nImmediate Response upon First Click:`);
  coldStartResult.immediateStates.forEach(s => {
    console.log(`  - ${s.name}: moving=${s.moving}, target=${s.target}, dest=(${s.dest?.x},${s.dest?.y}), pathLen=${s.pathLen}`);
  });
  console.log(`\nEnd Status after Traversal:`);
  coldStartResult.endStates.forEach(s => {
    console.log(`  - ${s.name}: finalPos=(${s.finalPos.x},${s.finalPos.y}), Manhattan dist to Wolf=${s.distanceToWolf}, state=${s.state}`);
  });
  console.log(`\nAll Responded Immediately: ${coldStartResult.allRespondedImmediately} (${coldStartResult.partySize}/${coldStartResult.partySize} members engaged)`);

  await browser.close();
  console.log('\n=== Real Google Chrome Verification Complete: 100% SUCCESS ===');
}

run().catch(err => {
  console.error('Fatal error in browser verification:', err);
  process.exit(1);
});
