import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import type { DungeonConfig, GridPos } from '../src/types/game.ts';

console.log('--- RUNNING MILESTONE 13: PROCEDURAL DUNGEON GENERATION & SWARM-TRAP RESOLUTION TESTS ---');

const configRaw = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8')) as DungeonConfig;

// ============================================================================
// TEST 1: Dungeon Generator Output & Invariants
// ============================================================================
{
  const dungeon = DungeonGenerator.generate(configRaw);

  assert.equal(dungeon.width, configRaw.mapWidth, `Dungeon width must be ${configRaw.mapWidth}`);
  assert.equal(dungeon.height, configRaw.mapHeight, `Dungeon height must be ${configRaw.mapHeight}`);
  assert.equal(dungeon.gridMatrix.length, configRaw.mapHeight, 'Grid matrix row count must match mapHeight');
  assert.equal(dungeon.gridMatrix[0].length, configRaw.mapWidth, 'Grid matrix column count must match mapWidth');

  // Verify room count within config range
  assert.ok(
    dungeon.rooms.length >= configRaw.roomCount.min,
    `Room count (${dungeon.rooms.length}) must be >= min (${configRaw.roomCount.min})`
  );
  assert.ok(
    dungeon.rooms.length <= configRaw.roomCount.max,
    `Room count (${dungeon.rooms.length}) must be <= max (${configRaw.roomCount.max})`
  );

  // Verify room types: exactly 1 entrance, >=1 gathering, >=1 light_combat, >=1 heavy_combat
  const entranceRooms = dungeon.rooms.filter((r) => r.type === 'entrance');
  const gatheringRooms = dungeon.rooms.filter((r) => r.type === 'gathering');
  const lightCombatRooms = dungeon.rooms.filter((r) => r.type === 'light_combat');
  const heavyCombatRooms = dungeon.rooms.filter((r) => r.type === 'heavy_combat');

  assert.equal(entranceRooms.length, 1, 'Must have exactly 1 entrance room');
  assert.ok(gatheringRooms.length >= 1, 'Must have at least 1 gathering room');
  assert.ok(lightCombatRooms.length >= 1, 'Must have at least 1 light combat room');
  assert.ok(heavyCombatRooms.length >= 1, 'Must have at least 1 heavy combat room');

  // Verify entrance portal position is within the entrance room
  const ent = entranceRooms[0];
  assert.ok(
    dungeon.portalPos.x >= ent.x && dungeon.portalPos.x < ent.x + ent.width,
    'Portal X must be inside entrance room'
  );
  assert.ok(
    dungeon.portalPos.y >= ent.y && dungeon.portalPos.y < ent.y + ent.height,
    'Portal Y must be inside entrance room'
  );
  assert.equal(dungeon.gridMatrix[dungeon.portalPos.y][dungeon.portalPos.x], 0, 'Portal tile must be walkable floor (0)');

  // Verify Gathering rooms have bushes [2, 4] and ZERO enemies
  for (const gr of gatheringRooms) {
    const enemiesInGathering = dungeon.enemySpawns.filter((e) => e.roomIndex === gr.id);
    assert.equal(enemiesInGathering.length, 0, `Gathering room ${gr.id} must have ZERO enemies`);

    const bushesInGathering = dungeon.bushSpawns.filter((b) => b.roomIndex === gr.id);
    assert.ok(
      bushesInGathering.length >= 2 && bushesInGathering.length <= 4,
      `Gathering room ${gr.id} bush count (${bushesInGathering.length}) must be in range [2, 4]`
    );
  }

  // Verify Light Combat rooms have 1-2 enemies and bushes in [1, 3]
  for (const lr of lightCombatRooms) {
    const bushesInLight = dungeon.bushSpawns.filter((b) => b.roomIndex === lr.id);
    assert.ok(
      bushesInLight.length >= 1 && bushesInLight.length <= 3,
      `Light combat room ${lr.id} bush count (${bushesInLight.length}) must be in range [1, 3]`
    );

    const enemiesInLight = dungeon.enemySpawns.filter((e) => e.roomIndex === lr.id);
    assert.ok(
      enemiesInLight.length >= 1 && enemiesInLight.length <= 2,
      `Light combat room ${lr.id} enemy count (${enemiesInLight.length}) must be in range [1, 2]`
    );
  }

  // Verify Heavy Combat rooms have 3+ enemies and bushes in [2, 5]
  for (const hr of heavyCombatRooms) {
    const bushesInHeavy = dungeon.bushSpawns.filter((b) => b.roomIndex === hr.id);
    assert.ok(
      bushesInHeavy.length >= 2 && bushesInHeavy.length <= 5,
      `Heavy combat room ${hr.id} bush count (${bushesInHeavy.length}) must be in range [2, 5]`
    );

    const enemiesInHeavy = dungeon.enemySpawns.filter((e) => e.roomIndex === hr.id);
    assert.ok(
      enemiesInHeavy.length >= 3,
      `Heavy combat room ${hr.id} enemy count (${enemiesInHeavy.length}) must be >= 3 (cluster/swarm)`
    );
  }

  // Verify Entrance room has ZERO bushes and ZERO enemies
  const bushesInEntrance = dungeon.bushSpawns.filter((b) => b.roomIndex === ent.id);
  const enemiesInEntrance = dungeon.enemySpawns.filter((e) => e.roomIndex === ent.id);
  assert.equal(bushesInEntrance.length, 0, `Entrance room ${ent.id} must have ZERO bushes`);
  assert.equal(enemiesInEntrance.length, 0, `Entrance room ${ent.id} must have ZERO enemies`);

  // Verify no bush and enemy spawn on identical coordinates
  for (const bush of dungeon.bushSpawns) {
    const overlap = dungeon.enemySpawns.some((e) => e.x === bush.x && e.y === bush.y);
    assert.equal(overlap, false, `Bush and enemy must not share identical coordinate (${bush.x}, ${bush.y})`);
  }

  // Verify full BFS graph connectivity from entrance room to all rooms
  const visited = new Set<string>();
  const queue: GridPos[] = [{ x: ent.centerX, y: ent.centerY }];
  visited.add(`${ent.centerX},${ent.centerY}`);
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      if (
        nx >= 0 &&
        nx < dungeon.width &&
        ny >= 0 &&
        ny < dungeon.height &&
        dungeon.gridMatrix[ny][nx] === 0
      ) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  for (const r of dungeon.rooms) {
    const centerKey = `${r.centerX},${r.centerY}`;
    assert.ok(
      visited.has(centerKey),
      `Room ${r.id} (${r.type}) center (${r.centerX}, ${r.centerY}) must be reachable from Entrance Room via BFS`
    );
  }

  console.log(`✔ Test 1 passed: Procedural Dungeon generated ${dungeon.rooms.length} rooms with guaranteed room variety (1 entrance, ${gatheringRooms.length} gathering, ${lightCombatRooms.length} light, ${heavyCombatRooms.length} heavy) and 100% BFS connectivity`);
}

// ============================================================================
// TEST 2: Regeneration on Every Generation (Distinct Layouts)
// ============================================================================
{
  const dungeon1 = DungeonGenerator.generate(configRaw);
  const dungeon2 = DungeonGenerator.generate(configRaw);

  const hashDungeon = (d: typeof dungeon1) => {
    return d.rooms.map((r) => `${r.x},${r.y},${r.width},${r.height},${r.type}`).join('|');
  };

  const hash1 = hashDungeon(dungeon1);
  const hash2 = hashDungeon(dungeon2);

  assert.notEqual(
    hash1,
    hash2,
    'Two consecutive procedural generations must produce genuinely distinct layouts'
  );

  console.log('✔ Test 2 passed: Distinct layout confirmed across separate generations (no static map reuse)');
}

// ============================================================================
// TEST 3: Swarm-Trap Resolution — Hard Obstacles & Permanent Risk (No Fallback Rescue)
// ============================================================================
{
  // Build a 9x9 test arena with open floor in the middle
  const grid: number[][] = [];
  for (let y = 0; y < 9; y++) {
    const row: number[] = [];
    for (let x = 0; x < 9; x++) {
      row.push(x === 0 || x === 8 || y === 0 || y === 8 ? 1 : 0);
    }
    grid.push(row);
  }

  const pathfinder = new Pathfinder(grid);
  const heroPos: GridPos = { x: 4, y: 4 };
  const destination: GridPos = { x: 1, y: 1 };

  // Surround the hero completely with 8 living enemies (all 4 orthogonal + 4 diagonal tiles)
  const surroundingEnemies: GridPos[] = [
    { x: 3, y: 4 }, // West
    { x: 5, y: 4 }, // East
    { x: 4, y: 3 }, // North
    { x: 4, y: 5 }, // South
    { x: 3, y: 3 }, // North-West
    { x: 5, y: 3 }, // North-East
    { x: 3, y: 5 }, // South-West
    { x: 5, y: 5 }  // South-East
  ];

  // Living enemies are HARD obstacles
  const trappedPath = await pathfinder.findPath(heroPos, destination, {
    soft: [],
    hard: surroundingEnemies
  });

  assert.equal(
    trappedPath.length,
    0,
    'Surrounded unit must have 0 path steps: no escape exists, bottleneck fallback must never bypass living enemies'
  );

  // Even with 4 orthogonal enemies blocking in non-diagonal movement, path must be blocked
  const orthoEnemies: GridPos[] = [
    { x: 3, y: 4 },
    { x: 5, y: 4 },
    { x: 4, y: 3 },
    { x: 4, y: 5 }
  ];

  const orthoTrappedPath = await pathfinder.findPath(heroPos, destination, {
    soft: [],
    hard: orthoEnemies
  });

  assert.equal(
    orthoTrappedPath.length,
    0,
    'Unit orthogonally surrounded by living enemies must be completely trapped (path length = 0)'
  );

  console.log('✔ Test 3 passed: Swarm-trap strictly enforced as intentional permanent difficulty — no escape path and no fallback rescue');
}

// ============================================================================
// TEST 4: Friendly Unit Corridor Queueing — Bottleneck Fallback Preserved
// ============================================================================
{
  // Build a single-tile-wide corridor (width = 1) between two rooms
  // Row 0: Walls [1, 1, 1, 1, 1, 1, 1]
  // Row 1: Floor [0, 0, 0, 0, 0, 0, 0] <- 1-tile wide corridor
  // Row 2: Walls [1, 1, 1, 1, 1, 1, 1]
  const corridorGrid: number[][] = [
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1]
  ];

  const pathfinder = new Pathfinder(corridorGrid);
  const companionPos: GridPos = { x: 1, y: 1 };
  const destination: GridPos = { x: 5, y: 1 };
  const allyBlockingInDoorway: GridPos = { x: 3, y: 1 };

  // Friendly unit is a SOFT obstacle
  const queuePath = await pathfinder.findPath(companionPos, destination, {
    soft: [allyBlockingInDoorway],
    hard: []
  });

  assert.ok(
    queuePath.length > 0,
    'Corridor bottleneck fallback must activate when blocked by a friendly ally, returning a valid queueing path'
  );
  assert.equal(queuePath[queuePath.length - 1].x, destination.x, 'Path destination must reach target');
  assert.equal(queuePath[queuePath.length - 1].y, destination.y, 'Path destination must reach target');

  console.log('✔ Test 4 passed: Friendly unit doorway queueing preserved — bottleneck fallback smoothly allows ally streaming');
}

// ============================================================================
// TEST 5: Mixed Corridor Precision (Ally + Enemy Both Blocking 1-Tile Passage)
// ============================================================================
{
  // Strictly single-tile-wide corridor (width = 1)
  const corridorGrid: number[][] = [
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1]
  ];

  const pathfinder = new Pathfinder(corridorGrid);
  const unitPos: GridPos = { x: 1, y: 1 };
  const destination: GridPos = { x: 5, y: 1 };

  // Ally is at (2, 1) [soft], Enemy is at (3, 1) [hard] in the only 1-tile-wide passage
  const allyPos: GridPos = { x: 2, y: 1 };
  const enemyPos: GridPos = { x: 3, y: 1 };

  const mixedPath = await pathfinder.findPath(unitPos, destination, {
    soft: [allyPos],
    hard: [enemyPos]
  });

  assert.equal(
    mixedPath.length,
    0,
    'In a 1-tile corridor blocked by an ally and an enemy, relaxing the ally must NOT relax the enemy — path must remain 0'
  );

  // Conversely, if the enemy is removed and only the ally blocks, path must succeed
  const allyOnlyPath = await pathfinder.findPath(unitPos, destination, {
    soft: [allyPos],
    hard: []
  });
  assert.ok(allyOnlyPath.length > 0, 'Once enemy is gone, ally fallback allows pathfinding through corridor');

  // And if the ally is removed and only the enemy blocks, path must fail
  const enemyOnlyPath = await pathfinder.findPath(unitPos, destination, {
    soft: [],
    hard: [enemyPos]
  });
  assert.equal(enemyOnlyPath.length, 0, 'Enemy alone in 1-tile corridor must strictly block passage');

  console.log('✔ Test 5 passed: Mixed corridor precision confirmed — ally relaxation strictly isolates soft obstacles and leaves hard enemy obstacles non-negotiable');
}

// ============================================================================
// TEST 6: Grid Refresh & Line of Sight Raycasting on Newly Generated Grid
// ============================================================================
{
  // Initial 5x5 open grid
  const initialGrid = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ];
  const pathfinder = new Pathfinder(initialGrid);

  assert.equal(
    pathfinder.hasLineOfSight({ x: 0, y: 2 }, { x: 4, y: 2 }),
    true,
    'LOS should be clear across initial open grid'
  );

  // New generated grid with a wall column at x = 2
  const refreshedGrid = [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0]
  ];

  pathfinder.updateGrid(refreshedGrid);

  assert.equal(
    pathfinder.hasLineOfSight({ x: 0, y: 2 }, { x: 4, y: 2 }),
    false,
    'LOS must be blocked across the newly placed wall column after updateGrid'
  );

  // Check diagonal corner raycasting
  const cornerGrid = [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0]
  ];
  pathfinder.updateGrid(cornerGrid);

  // Direct line through corner obstacle (0,1) to (2,1) hits (1,1)
  assert.equal(
    pathfinder.hasLineOfSight({ x: 0, y: 1 }, { x: 2, y: 1 }),
    false,
    'LOS must be blocked through center obstacle'
  );

  console.log('✔ Test 6 passed: Pathfinder.updateGrid and line-of-sight raycasting cleanly re-initialize for newly generated layouts');
}

// ============================================================================
// TEST 7: Multi-generation Combat Room Bush Distribution & Risk-Reward Scaling
// ============================================================================
{
  let totalLightBushes = 0;
  let totalLightRooms = 0;
  let totalHeavyBushes = 0;
  let totalHeavyRooms = 0;
  const numIterations = 100;

  for (let iter = 0; iter < numIterations; iter++) {
    const dungeon = DungeonGenerator.generate(configRaw);

    for (const room of dungeon.rooms) {
      const bushes = dungeon.bushSpawns.filter((b) => b.roomIndex === room.id);
      const enemies = dungeon.enemySpawns.filter((e) => e.roomIndex === room.id);

      if (room.type === 'entrance') {
        assert.equal(bushes.length, 0, `Entrance room must have 0 bushes`);
        assert.equal(enemies.length, 0, `Entrance room must have 0 enemies`);
      } else if (room.type === 'gathering') {
        assert.equal(enemies.length, 0, `Gathering room must have 0 enemies`);
        assert.ok(bushes.length >= 2 && bushes.length <= 4, `Gathering bushes in [2, 4]`);
      } else if (room.type === 'light_combat') {
        assert.ok(bushes.length >= 1 && bushes.length <= 3, `Light combat bushes in [1, 3]`);
        assert.ok(enemies.length >= 1 && enemies.length <= 2, `Light combat enemies in [1, 2]`);
        totalLightBushes += bushes.length;
        totalLightRooms++;
      } else if (room.type === 'heavy_combat') {
        assert.ok(bushes.length >= 2 && bushes.length <= 5, `Heavy combat bushes in [2, 5]`);
        assert.ok(enemies.length >= 3 && enemies.length <= 5, `Heavy combat enemies in [3, 5]`);
        totalHeavyBushes += bushes.length;
        totalHeavyRooms++;
      }
    }

    // Ensure no overlapping coordinates between bushes and enemies
    for (const bush of dungeon.bushSpawns) {
      const overlap = dungeon.enemySpawns.some((e) => e.x === bush.x && e.y === bush.y);
      assert.equal(overlap, false, `Overlap detected between bush and enemy at (${bush.x}, ${bush.y})`);
    }
  }

  const avgLightBushes = totalLightBushes / totalLightRooms;
  const avgHeavyBushes = totalHeavyBushes / totalHeavyRooms;

  console.log(`  Over ${numIterations} generations (${totalLightRooms} light rooms, ${totalHeavyRooms} heavy rooms):`);
  console.log(`  - Average bushes in Light Combat rooms: ${avgLightBushes.toFixed(2)} (expected range [1, 3], theoretical mean 2.0)`);
  console.log(`  - Average bushes in Heavy Combat rooms: ${avgHeavyBushes.toFixed(2)} (expected range [2, 5], theoretical mean 3.5)`);

  assert.ok(
    avgHeavyBushes > avgLightBushes,
    `Heavy combat rooms (${avgHeavyBushes.toFixed(2)}) must have higher average bush density than Light combat rooms (${avgLightBushes.toFixed(2)})`
  );

  console.log('✔ Test 7 passed: 100-run distribution confirms bushes consistently spawn in combat rooms with Heavy Combat visibly yielding more resources than Light Combat');
}

console.log('\nALL MILESTONE 13 UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
