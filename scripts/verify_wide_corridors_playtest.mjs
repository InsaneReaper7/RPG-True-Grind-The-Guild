import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/fea4cb27-54ad-449f-bebd-3e42010bebf9';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== STARTING WIDE CORRIDORS & DOORWAYS BROWSER PLAYTEST VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[PartySelection]') ||
        text.includes('[Move]') ||
        text.includes('[Input]') ||
        text.includes('[Combat') ||
        text.includes('[Dungeon')
      ) {
        console.log('  [BROWSER LOG]', text);
      }
    });

    console.log('Navigating to http://localhost:4173 ...');
    await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // -------------------------------------------------------------------------
    // STEP 1: Transition into Procedural Dungeon
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Transitioning into Dungeon Floor 1 ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.executeTransitionToDungeon();
      }
    });
    await sleep(2500);

    // -------------------------------------------------------------------------
    // STEP 2: Inspect Generated Dungeon for 2-Tile Width Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Verifying Dungeon Width Invariants in Active Scene ---');
    const dungeonInspection = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      const { gridMatrix, rooms, width, height } = dungeon;

      // 1. Room tile mask
      const isRoomTile = Array.from({ length: height }, () => Array(width).fill(false));
      for (const r of rooms) {
        for (let y = r.y; y < r.y + r.height; y++) {
          for (let x = r.x; x < r.x + r.width; x++) {
            isRoomTile[y][x] = true;
          }
        }
      }

      // 2. Corridors width check
      let narrowCorridorTiles = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (gridMatrix[y][x] === 0 && !isRoomTile[y][x]) {
            const topWall = gridMatrix[y - 1][x] === 1;
            const bottomWall = gridMatrix[y + 1][x] === 1;
            const leftWall = gridMatrix[y][x - 1] === 1;
            const rightWall = gridMatrix[y][x + 1] === 1;

            if ((topWall && bottomWall) || (leftWall && rightWall)) {
              narrowCorridorTiles++;
            }
          }
        }
      }

      // 3. Room Doorways / Entrances width check
      let narrowDoorways = 0;
      for (const r of rooms) {
        const checkWall = (tiles) => {
          let run = 0;
          for (let i = 0; i < tiles.length; i++) {
            const { x, y } = tiles[i];
            if (gridMatrix[y]?.[x] === 0) {
              run++;
            } else {
              if (run > 0 && run < 2) narrowDoorways++;
              run = 0;
            }
          }
          if (run > 0 && run < 2) narrowDoorways++;
        };

        if (r.y - 1 >= 0) checkWall(Array.from({ length: r.width }, (_, i) => ({ x: r.x + i, y: r.y - 1 })));
        if (r.y + r.height < height) checkWall(Array.from({ length: r.width }, (_, i) => ({ x: r.x + i, y: r.y + r.height })));
        if (r.x - 1 >= 0) checkWall(Array.from({ length: r.height }, (_, i) => ({ x: r.x - 1, y: r.y + i })));
        if (r.x + r.width < width) checkWall(Array.from({ length: r.height }, (_, i) => ({ x: r.x + r.width, y: r.y + i })));
      }

      return {
        isActive: main && main.scene.isActive(),
        mapWidth: main.mapWidth,
        mapHeight: main.mapHeight,
        roomCount: rooms.length,
        narrowCorridorTiles,
        narrowDoorways,
        portalPos: dungeon.portalPos,
        heroPos: main.player.gridPos
      };
    });

    console.log('  Scene Active:', dungeonInspection.isActive);
    console.log('  Dungeon Map Size:', `${dungeonInspection.mapWidth}x${dungeonInspection.mapHeight}`);
    console.log('  Total Rooms:', dungeonInspection.roomCount);
    console.log('  Narrow Corridor Tiles (<2 tiles):', dungeonInspection.narrowCorridorTiles);
    console.log('  Narrow Room Doorways (<2 tiles):', dungeonInspection.narrowDoorways);

    assert.ok(dungeonInspection.isActive, 'MainScene must be active');
    assert.equal(dungeonInspection.narrowCorridorTiles, 0, 'Must have zero 1-wide corridor tiles in generated dungeon');
    assert.equal(dungeonInspection.narrowDoorways, 0, 'Must have zero 1-wide doorways in generated dungeon');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'wide_corridor_dungeon_overview.png') });
    console.log('✔ Step 2 passed: Overview confirmed zero narrow corridors or doorways');

    // -------------------------------------------------------------------------
    // STEP 3: Spawn Full 4-Member Party & Select All Members
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Spawning Full 4-Hero Party ---');
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.spawnTestCompanion();
      main.spawnTestCompanion();
      main.spawnTestCompanion();
      main.selectAllMembers();
    });
    await sleep(500);

    const partyInfo = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return {
        partyCount: main.party.length,
        selectedCount: main.selectedMembers.size,
        memberNames: main.party.map(m => m.entityName),
        positions: main.party.map(m => m.gridPos)
      };
    });
    console.log('  Party Members Spawned:', partyInfo.memberNames);
    console.log('  Selected Count:', partyInfo.selectedCount);
    console.log('  Initial Positions:', partyInfo.positions);
    assert.equal(partyInfo.partyCount, 4, 'Must have 4 party members');
    assert.equal(partyInfo.selectedCount, 4, 'All 4 party members must be selected');

    // -------------------------------------------------------------------------
    // STEP 4: Navigate Party Through 2-Tile Corridor and Room Doorway
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Real Playtest: Side-by-Side Movement Through Corridor & Doorway ---');
    const moveResult = await page.evaluate(async () => {
      const main = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;

      // Find Room 0 (Entrance) and Room 1 (Connected room)
      const room0 = dungeon.rooms[0];
      const room1 = dungeon.rooms[1];

      // Move all party members to Room 0 center first
      const p0 = { x: room0.centerX, y: room0.centerY };
      main.player.setGridPosition(p0.x, p0.y);
      main.party[1].setGridPosition(p0.x + 1, p0.y);
      main.party[2].setGridPosition(p0.x, p0.y + 1);
      main.party[3].setGridPosition(p0.x + 1, p0.y + 1);

      // Now issue move command toward Room 1 center
      const targetPos = { x: room1.centerX, y: room1.centerY };

      // Leader and companions calculate paths
      const activeSelected = main.getSelectedMembers();
      const claimed = new Set();
      const paths = [];

      const leader = activeSelected[0];
      const leaderDest = targetPos;
      claimed.add(`${leaderDest.x},${leaderDest.y}`);
      leader.claimedDestination = { ...leaderDest };

      const leaderObs = main.getPartyUnitObstacles(leader);
      const leaderPath = await main.pathfinder.findPath(leader.gridPos, leaderDest, leaderObs);
      if (leaderPath.length > 0) {
        leader.followPath(leaderPath);
        paths.push({ name: leader.entityName, pathLength: leaderPath.length, path: leaderPath });
      }

      const formationOffsets = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ];

      for (let i = 1; i < activeSelected.length; i++) {
        const companion = activeSelected[i];
        const offset = formationOffsets[i];
        const idealPos = { x: leaderDest.x + offset.x, y: leaderDest.y + offset.y };
        const compDest = main.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
        claimed.add(`${compDest.x},${compDest.y}`);
        companion.claimedDestination = { ...compDest };

        const compObs = main.getPartyUnitObstacles(companion);
        const compPath = await main.pathfinder.findPath(companion.gridPos, compDest, compObs);
        if (compPath.length > 0) {
          companion.followPath(compPath);
          paths.push({ name: companion.entityName, pathLength: compPath.length, path: compPath });
        }
      }

      // Compute direct Manhattan distance between Room 0 and Room 1
      const manhattanDist = Math.abs(room0.centerX - room1.centerX) + Math.abs(room0.centerY - room1.centerY);

      return {
        room0Center: p0,
        room1Center: targetPos,
        manhattanDist,
        paths: paths.map(p => ({
          name: p.name,
          pathLength: p.pathLength,
          maxDeviationRatio: p.pathLength / Math.max(1, manhattanDist)
        }))
      };
    });

    console.log('  Room 0 Center:', moveResult.room0Center);
    console.log('  Room 1 Center:', moveResult.room1Center);
    console.log('  Direct Manhattan Distance:', moveResult.manhattanDist);
    for (const p of moveResult.paths) {
      console.log(`    - ${p.name}: path length ${p.pathLength} tiles (deviation ratio: ${p.maxDeviationRatio.toFixed(2)})`);
    }

    // Confirm all 4 members found direct paths without erratic rerouting
    assert.equal(moveResult.paths.length, 4, 'All 4 members must have valid direct movement paths');
    for (const p of moveResult.paths) {
      // In normal 2-tile corridors, path length should be very close to direct Manhattan distance (ratio <= 1.5),
      // NOT an erratic reroute around the dungeon (which would be 2.5x to 5x+ Manhattan distance)
      assert.ok(
        p.maxDeviationRatio < 2.0,
        `${p.name} path length (${p.pathLength}) is too long (ratio ${p.maxDeviationRatio.toFixed(2)}) — indicates erratic reroute!`
      );
    }

    // Allow party to traverse the corridor in real time
    await sleep(2500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'party_side_by_side_corridor_navigation.png') });
    console.log('✔ Step 4 passed: Companions move side-by-side through corridor without wild reroutes');

    // -------------------------------------------------------------------------
    // STEP 5: Hard-Mode Swarm-Trap Invariant Verification in Live Scene
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Verifying Swarm-Trap Rule Remains Strictly Impassable ---');
    const swarmTrapCheck = await page.evaluate(async () => {
      const main = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      const heavyRoom = dungeon.rooms.find(r => r.type === 'heavy_combat') || dungeon.rooms[dungeon.rooms.length - 1];

      // Place hero at center of room
      const hx = heavyRoom.centerX;
      const hy = heavyRoom.centerY;
      main.player.setGridPosition(hx, hy);

      // Surround hero with living hostile enemies
      const offsets = [
        { ox: -1, oy: 0 },
        { ox: 1, oy: 0 },
        { ox: 0, oy: -1 },
        { ox: 0, oy: 1 },
        { ox: -1, oy: -1 },
        { ox: 1, oy: -1 },
        { ox: -1, oy: 1 },
        { ox: 1, oy: 1 }
      ];

      const dataLoader = window.DataLoader.getInstance();
      const enemyDef = dataLoader.getEnemy('wolf') || { id: 'wolf', name: 'Wolf', maxHp: 50, speed: 80 };

      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        const tx = hx + off.ox;
        const ty = hy + off.oy;
        const existing = main.enemies[i];
        if (existing) {
          existing.setGridPosition(tx, ty);
          existing.state = 'attacking';
          existing.isAggroed = true;
        } else {
          const newE = main.spawnEnemyUnit(enemyDef, tx, ty, 'wolf-avatar', `Wolf (Swarm ${i})`);
          newE.state = 'attacking';
          newE.isAggroed = true;
        }
      }

      // Hero attempts to escape to entrance portal
      const targetEscape = dungeon.portalPos;
      const obstacles = main.getPartyUnitObstacles(main.player);
      const escapePath = await main.pathfinder.findPath(main.player.gridPos, targetEscape, obstacles);

      return {
        surroundingLivingEnemies: obstacles.hard.length,
        escapePathLength: escapePath.length,
        canEscape: escapePath.length > 0
      };
    });

    console.log('  Surrounding Living Enemies (Hard Obstacles):', swarmTrapCheck.surroundingLivingEnemies);
    console.log('  Hero Escape Path Length:', swarmTrapCheck.escapePathLength);
    console.log('  Can Escape:', swarmTrapCheck.canEscape);

    assert.equal(swarmTrapCheck.escapePathLength, 0, 'Living enemies must completely block escape: path must be 0');
    assert.equal(swarmTrapCheck.canEscape, false, 'Hero cannot bypass hostile enemies');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'swarm_trap_hard_mode_verified.png') });
    console.log('✔ Step 5 passed: Swarm-trap invariant strictly enforced in live scene');

    console.log('\n=== ALL BROWSER PLAYTEST VERIFICATION CHECKS PASSED SUCCESSFULLY! ===\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Playtest verification failed:', err);
  process.exit(1);
});
