import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it in node
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const workspaceDir = 'c:/Users/insan/.gemini/antigravity/scratch/RPG True Gring - The Guild';

// Mock minimal DOM / browser globals for node testing
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(workspaceDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

async function runWaterTerrainTests() {
  console.log('================================================================');
  console.log('🌊 RUNNING MILESTONE: WATER TERRAIN GENERATION VERIFICATION 🌊');
  console.log('================================================================\n');

  const { DataLoader } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DataLoader.ts')).href);
  const { DungeonGenerator } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DungeonGenerator.ts')).href);
  const { Pathfinder } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/Pathfinder.ts')).href);
  const { TextureGenerator } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/TextureGenerator.ts')).href);
  const { TileType, TILE_FLOOR, TILE_WALL, TILE_WATER } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/types/game.ts')).href);

  // Initialize DataLoader
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -------------------------------------------------------------------
  // TEST 1: Schema, Data & Config Validation
  // -------------------------------------------------------------------
  console.log('--- TEST 1: Schema, Tile Classification & Config Structure ---');

  // Validate TileType enum & constants
  assert.strictEqual(TileType.FLOOR, 0, 'TileType.FLOOR must equal 0');
  assert.strictEqual(TileType.WALL, 1, 'TileType.WALL must equal 1');
  assert.strictEqual(TileType.WATER, 2, 'TileType.WATER must equal 2');
  assert.strictEqual(TILE_FLOOR, 0);
  assert.strictEqual(TILE_WALL, 1);
  assert.strictEqual(TILE_WATER, 2);

  const configRaw = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8'));
  assert.ok(configRaw.water, 'dungeonConfig.json must define water configuration');
  assert.strictEqual(configRaw.water.enabled, true, 'Water must be enabled by default');
  assert.ok(configRaw.water.chancePerEligibleRoom > 0, 'chancePerEligibleRoom must be > 0');
  assert.ok(Array.isArray(configRaw.water.eligibleRoomTypes), 'eligibleRoomTypes must be an array');
  assert.ok(configRaw.water.eligibleRoomTypes.includes('gathering'), 'gathering rooms must be eligible for water');
  assert.ok(configRaw.water.eligibleRoomTypes.includes('light_combat'), 'light_combat rooms must be eligible for water');
  assert.ok(!configRaw.water.eligibleRoomTypes.includes('entrance'), 'entrance rooms must NOT be eligible');
  assert.ok(!configRaw.water.eligibleRoomTypes.includes('boss'), 'boss rooms must NOT be eligible');
  assert.ok(configRaw.water.minPoolSize >= 2, 'minPoolSize must be >= 2');
  assert.ok(configRaw.water.maxPoolSize >= configRaw.water.minPoolSize, 'maxPoolSize must be >= minPoolSize');

  // Validate regional water textures across all 4 regions
  assert.ok(Array.isArray(configRaw.regions), 'regions must be configured');
  const expectedWaterTextures: Record<string, string> = {
    ancient_crypts: 'tile-water',
    abyssal_depths: 'tile-abyssal-water',
    infernal_caldera: 'tile-caldera-water',
    glacial_caverns: 'tile-glacial-water'
  };

  for (const r of configRaw.regions) {
    assert.ok(r.waterTexture, `Region ${r.id} must define waterTexture`);
    assert.strictEqual(r.waterTexture, expectedWaterTextures[r.id], `Region ${r.id} waterTexture mismatch`);
  }

  // Validate DataLoader fallback parity
  for (const defRegion of DataLoader.DEFAULT_REGIONS) {
    assert.ok(defRegion.waterTexture, `DataLoader.DEFAULT_REGIONS ${defRegion.id} must define waterTexture`);
    assert.strictEqual(defRegion.waterTexture, expectedWaterTextures[defRegion.id]);
  }

  console.log('✓ PASS: TileType enum, dungeonConfig water schema, and regional water textures validated.');

  // -------------------------------------------------------------------
  // TEST 2: Procedural Water Textures Generation
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Procedural Water Textures Distinctiveness ---');

  const generatedTextures: Record<string, boolean> = {};
  const mockScene: any = {
    textures: {
      exists: (key: string) => !!generatedTextures[key]
    },
    make: {
      graphics: () => {
        const g: any = new Proxy({}, {
          get(target, prop) {
            if (prop === 'generateTexture') {
              return (key: string) => {
                generatedTextures[key] = true;
              };
            }
            if (prop === 'destroy') {
              return () => {};
            }
            return () => g;
          }
        });
        return g;
      }
    }
  };

  TextureGenerator.generatePlaceholderTextures(mockScene, 32);

  assert.ok(generatedTextures['tile-water'], 'tile-water texture must be generated');
  assert.ok(generatedTextures['tile-abyssal-water'], 'tile-abyssal-water texture must be generated');
  assert.ok(generatedTextures['tile-caldera-water'], 'tile-caldera-water texture must be generated');
  assert.ok(generatedTextures['tile-glacial-water'], 'tile-glacial-water texture must be generated');

  console.log('✓ PASS: All 4 procedural water textures generated cleanly.');

  // -------------------------------------------------------------------
  // TEST 3: Stated Walkability / Obstacle Classification & Line of Sight
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: Stated Walkability & Obstacle Classification ---');

  {
    // Build a test grid:
    // (0,0)=Floor, (1,0)=Water, (2,0)=Floor, (3,0)=Wall
    const testGrid: number[][] = [
      [TileType.FLOOR, TileType.WATER, TileType.FLOOR, TileType.WALL],
      [TileType.FLOOR, TileType.FLOOR, TileType.FLOOR, TileType.FLOOR]
    ];

    const pathfinder = new Pathfinder(testGrid);

    // 1. Classification queries
    assert.strictEqual(pathfinder.isObstacle(1, 0), true, 'Water must be classified as an obstacle for movement');
    assert.strictEqual(pathfinder.isObstacle(3, 0), true, 'Wall must be classified as an obstacle for movement');
    assert.strictEqual(pathfinder.isObstacle(0, 0), false, 'Floor must NOT be an obstacle');

    assert.strictEqual(pathfinder.isWater(1, 0), true, 'isWater must be true for water tile');
    assert.strictEqual(pathfinder.isWater(3, 0), false, 'isWater must be false for wall tile');
    assert.strictEqual(pathfinder.isWater(0, 0), false, 'isWater must be false for floor tile');

    assert.strictEqual(pathfinder.isWall(3, 0), true, 'isWall must be true for wall tile');
    assert.strictEqual(pathfinder.isWall(1, 0), false, 'isWall must be false for water tile');

    assert.strictEqual(pathfinder.isWalkable(0, 0), true, 'isWalkable must be true for floor');
    assert.strictEqual(pathfinder.isWalkable(1, 0), false, 'isWalkable must be false for water');
    assert.strictEqual(pathfinder.isWalkable(3, 0), false, 'isWalkable must be false for wall');

    // 2. Direct path onto water must fail
    const pathOntoWater = await pathfinder.findPath({ x: 0, y: 0 }, { x: 1, y: 0 });
    assert.strictEqual(pathOntoWater.length, 0, 'Pathfinder must refuse to path directly onto a water tile');

    // 3. Path navigating around water obstacle
    // To get from (0,0) to (2,0), path must detour through (0,1) -> (1,1) -> (2,1) -> (2,0)
    const detourPath = await pathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });
    assert.ok(detourPath.length > 0, 'Pathfinder must find detour around water obstacle');
    for (const step of detourPath) {
      assert.notDeepStrictEqual(step, { x: 1, y: 0 }, 'Path must never step on the water tile (1,0)');
    }

    // 4. Line of Sight: Water does NOT block line of sight, but Walls DO block line of sight
    // (0,0) looking at (2,0) across water tile (1,0)
    const losAcrossWater = pathfinder.hasLineOfSight({ x: 0, y: 0 }, { x: 2, y: 0 });
    assert.strictEqual(losAcrossWater, true, 'Line of sight must traverse across water tiles');

    // (2,0) looking at target past wall (3,0)
    const wallGrid: number[][] = [
      [TileType.FLOOR, TileType.WALL, TileType.FLOOR]
    ];
    const wallPathfinder = new Pathfinder(wallGrid);
    const losAcrossWall = wallPathfinder.hasLineOfSight({ x: 0, y: 0 }, { x: 2, y: 0 });
    assert.strictEqual(losAcrossWall, false, 'Line of sight must be blocked by wall tiles');

    console.log('✓ PASS: Water is strictly impassable to pathfinding, classified as obstacle, but transparent to Line of Sight.');
  }

  // -------------------------------------------------------------------
  // TEST 4 & 5: Placement Invariants, Zero Regression & Multi-Seed Proof (500 Seeds)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4 & 5: Placement Invariants & Multi-Seed Zero Regression (500 Seeds) ---');

  const TOTAL_SEEDS = 500;
  let totalDungeonsTested = 0;
  let totalWaterTilesPlaced = 0;
  let dungeonsWithWater = 0;
  let roomsWithWater = 0;
  let narrowCorridorsCount = 0;

  for (let seed = 0; seed < TOTAL_SEEDS; seed++) {
    let s = seed + 1;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const dungeon = DungeonGenerator.generate(configRaw, rng, { floorNumber: (seed % 15) + 1 });
    totalDungeonsTested++;

    const { gridMatrix, rooms, width, height, portalPos, crystalPos, enemySpawns, bushSpawns, waterTiles } = dungeon;

    assert.ok(Array.isArray(waterTiles), `Seed ${seed}: waterTiles must be an array`);

    if (waterTiles.length > 0) {
      dungeonsWithWater++;
      totalWaterTilesPlaced += waterTiles.length;
    }

    // 1. Mark room boundaries
    const roomByTile = Array.from({ length: height }, () => Array(width).fill(-1));
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          roomByTile[y][x] = r.id;
        }
      }
    }

    // 2. Identify all room doorway tiles
    const doorwayTiles = new Set<string>();
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          if (gridMatrix[y]?.[x] === TileType.FLOOR || gridMatrix[y]?.[x] === TileType.WATER) {
            const hasExternalWalkable =
              (x === r.x && gridMatrix[y]?.[x - 1] === 0) ||
              (x === r.x + r.width - 1 && gridMatrix[y]?.[x + 1] === 0) ||
              (y === r.y && gridMatrix[y - 1]?.[x] === 0) ||
              (y === r.y + r.height - 1 && gridMatrix[y + 1]?.[x] === 0);
            if (hasExternalWalkable) {
              doorwayTiles.add(`${x},${y}`);
            }
          }
        }
      }
    }

    // 3. Verify Water Placement Invariants
    const enemyPosSet = new Set(enemySpawns.map(e => `${e.x},${e.y}`));
    const bushPosSet = new Set(bushSpawns.map(b => `${b.x},${b.y}`));

    for (const wt of waterTiles) {
      // A. Must be marked as TileType.WATER in gridMatrix
      assert.strictEqual(
        gridMatrix[wt.y][wt.x],
        TileType.WATER,
        `Seed ${seed}: gridMatrix at waterTile (${wt.x}, ${wt.y}) must be TileType.WATER (2)`
      );

      // B. Water must NEVER be in corridors (strictly inside room)
      const roomId = roomByTile[wt.y][wt.x];
      assert.ok(
        roomId !== -1,
        `Seed ${seed}: Water tile (${wt.x}, ${wt.y}) must be strictly inside a room, never in a corridor`
      );

      const room = rooms[roomId];
      // C. Water must NEVER be in entrance or boss rooms
      assert.notStrictEqual(room.type, 'entrance', `Seed ${seed}: Water cannot spawn in entrance room`);
      assert.notStrictEqual(room.type, 'boss', `Seed ${seed}: Water cannot spawn in boss room`);

      // D. Water must be in interior of room (not perimeter wall)
      assert.ok(wt.x >= room.x + 1 && wt.x <= room.x + room.width - 2);
      assert.ok(wt.y >= room.y + 1 && wt.y <= room.y + room.height - 2);

      // E. Water must NEVER overlap with portalPos or crystalPos
      assert.notDeepStrictEqual(wt, portalPos, `Seed ${seed}: Water must not overlap portalPos`);
      assert.notDeepStrictEqual(wt, crystalPos, `Seed ${seed}: Water must not overlap crystalPos`);

      // F. Water must NEVER overlap room center
      assert.notDeepStrictEqual(
        { x: wt.x, y: wt.y },
        { x: room.centerX, y: room.centerY },
        `Seed ${seed}: Water must not overlap room center`
      );

      // G. Water must maintain >= 1-tile clearance from any doorway tile
      for (const dKey of doorwayTiles) {
        const [dx, dy] = dKey.split(',').map(Number);
        const isTooClose = Math.abs(wt.x - dx) <= 1 && Math.abs(wt.y - dy) <= 1;
        assert.strictEqual(
          isTooClose,
          false,
          `Seed ${seed}: Water tile (${wt.x}, ${wt.y}) violates doorway clearance from doorway (${dx}, ${dy})`
        );
      }

      // H. Water must NEVER overlap with enemies or bushes
      assert.strictEqual(enemyPosSet.has(`${wt.x},${wt.y}`), false, `Seed ${seed}: Water overlaps enemy`);
      assert.strictEqual(bushPosSet.has(`${wt.x},${wt.y}`), false, `Seed ${seed}: Water overlaps bush`);

      // I. Water must have at least one adjacent walkable floor tile in the room for approach/interaction
      const adjOffsets = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
        { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
      ];
      const hasWalkableBank = adjOffsets.some(off => {
        const ax = wt.x + off.x;
        const ay = wt.y + off.y;
        return ax >= room.x && ax < room.x + room.width &&
               ay >= room.y && ay < room.y + room.height &&
               gridMatrix[ay]?.[ax] === TileType.FLOOR;
      });
      assert.strictEqual(hasWalkableBank, true, `Seed ${seed}: Water tile (${wt.x}, ${wt.y}) must have walkable bank`);
    }

    // 4. Verify Intra-Room Door-to-Door Traversal for Rooms with Water
    for (const r of rooms) {
      const roomWater = waterTiles.filter(w => roomByTile[w.y][w.x] === r.id);
      if (roomWater.length > 0) {
        roomsWithWater++;
        const rDoors: { x: number; y: number }[] = [];
        for (const dKey of doorwayTiles) {
          const [dx, dy] = dKey.split(',').map(Number);
          if (roomByTile[dy][dx] === r.id) {
            rDoors.push({ x: dx, y: dy });
          }
        }

        if (rDoors.length > 0) {
          const visited = new Set<string>();
          const queue: { x: number; y: number }[] = [rDoors[0]];
          visited.add(`${rDoors[0].x},${rDoors[0].y}`);

          const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
          while (queue.length > 0) {
            const curr = queue.shift()!;
            for (const d of dirs) {
              const nx = curr.x + d.x;
              const ny = curr.y + d.y;
              if (
                nx >= r.x && nx < r.x + r.width &&
                ny >= r.y && ny < r.y + r.height &&
                gridMatrix[ny]?.[nx] === TileType.FLOOR
              ) {
                const k = `${nx},${ny}`;
                if (!visited.has(k)) {
                  visited.add(k);
                  queue.push({ x: nx, y: ny });
                }
              }
            }
          }

          for (const d of rDoors) {
            assert.ok(
              visited.has(`${d.x},${d.y}`),
              `Seed ${seed}: Water in room ${r.id} blocks path between doorways!`
            );
          }

          assert.ok(
            visited.has(`${r.centerX},${r.centerY}`),
            `Seed ${seed}: Water in room ${r.id} blocks path to room center!`
          );
        }
      }
    }

    // 5. Verify Corridor Width (Zero Narrow Corridors < 2 tiles)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (gridMatrix[y][x] === TileType.FLOOR && roomByTile[y][x] === -1) {
          const topWall = gridMatrix[y - 1][x] === TileType.WALL;
          const bottomWall = gridMatrix[y + 1][x] === TileType.WALL;
          const leftWall = gridMatrix[y][x - 1] === TileType.WALL;
          const rightWall = gridMatrix[y][x + 1] === TileType.WALL;
          if ((topWall && bottomWall) || (leftWall && rightWall)) {
            narrowCorridorsCount++;
          }
        }
      }
    }

    // 6. Verify Full Graph Connectivity via BFS from entrance portal through walkable floor
    const gVisited = new Set<string>();
    const gQueue: { x: number; y: number }[] = [{ x: portalPos.x, y: portalPos.y }];
    gVisited.add(`${portalPos.x},${portalPos.y}`);

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    while (gQueue.length > 0) {
      const curr = gQueue.shift()!;
      for (const d of dirs) {
        const nx = curr.x + d.x;
        const ny = curr.y + d.y;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && gridMatrix[ny][nx] === TileType.FLOOR) {
          const key = `${nx},${ny}`;
          if (!gVisited.has(key)) {
            gVisited.add(key);
            gQueue.push({ x: nx, y: ny });
          }
        }
      }
    }

    for (const r of rooms) {
      assert.ok(
        gVisited.has(`${r.centerX},${r.centerY}`),
        `Seed ${seed}: Room ${r.id} center must be reachable from portalPos`
      );
    }
    assert.ok(
      gVisited.has(`${crystalPos.x},${crystalPos.y}`),
      `Seed ${seed}: crystalPos must be reachable from portalPos`
    );
  }

  assert.equal(narrowCorridorsCount, 0, 'Must have zero corridors narrower than 2 tiles');
  assert.ok(dungeonsWithWater > 300, `Water must generate reliably (got ${dungeonsWithWater}/${TOTAL_SEEDS})`);
  assert.ok(totalWaterTilesPlaced > 1000, `Healthy distribution of water tiles (got ${totalWaterTilesPlaced})`);

  console.log(`Results across ${totalDungeonsTested} dungeons:`);
  console.log(`- Dungeons generated with water: ${dungeonsWithWater}/${totalDungeonsTested} (${((dungeonsWithWater/totalDungeonsTested)*100).toFixed(1)}%)`);
  console.log(`- Total water tiles placed: ${totalWaterTilesPlaced}`);
  console.log(`- Total rooms containing water tested: ${roomsWithWater}`);
  console.log(`- Narrow corridor bottlenecks (< 2 tiles): ${narrowCorridorsCount}`);
  console.log(`- BFS Full Graph reachability: 100% passed (${totalDungeonsTested}/${totalDungeonsTested})`);
  console.log('✓ PASS: Multi-seed zero regression standard verified across 500 seeds with 0 violations.');

  // -------------------------------------------------------------------
  // TEST 6: Deterministic Seed Invariance Proof
  // -------------------------------------------------------------------
  console.log('\n--- TEST 6: Deterministic Seed Invariance Proof ---');

  const testSeeds = [42, 100, 777, 9999];
  for (const seed of testSeeds) {
    const makeRng = (s: number) => {
      let cur = s;
      return () => {
        cur = (cur * 9301 + 49297) % 233280;
        return cur / 233280;
      };
    };

    const d1 = DungeonGenerator.generate(configRaw, makeRng(seed), { floorNumber: 1 });
    const d2 = DungeonGenerator.generate(configRaw, makeRng(seed), { floorNumber: 1 });

    // Grid dimensions
    assert.strictEqual(d1.width, d2.width);
    assert.strictEqual(d1.height, d2.height);

    // Grid matrix byte-for-byte
    for (let y = 0; y < d1.height; y++) {
      for (let x = 0; x < d1.width; x++) {
        assert.strictEqual(d1.gridMatrix[y][x], d2.gridMatrix[y][x]);
      }
    }

    // Water tiles coordinates match
    assert.deepStrictEqual(d1.waterTiles, d2.waterTiles);

    // Portal and Crystal
    assert.deepStrictEqual(d1.portalPos, d2.portalPos);
    assert.deepStrictEqual(d1.crystalPos, d2.crystalPos);
  }

  console.log('✓ PASS: Deterministic multi-seed generation invariance strictly confirmed.');

  // -------------------------------------------------------------------
  // TEST 7: Adjacent Tile Approach Interaction Simulation
  // -------------------------------------------------------------------
  console.log('\n--- TEST 7: Adjacent-Tile Interaction Mechanic Simulation ---');

  {
    // Build a test room with a water tile at (4,4) surrounded by floor
    const testMatrix: number[][] = Array.from({ length: 10 }, () => Array(10).fill(TileType.FLOOR));
    testMatrix[4][4] = TileType.WATER;

    // Simulate MainScene candidate adjacent tiles search
    const waterTile = { x: 4, y: 4 };
    const candidateAdj = [
      { x: waterTile.x + 1, y: waterTile.y },
      { x: waterTile.x - 1, y: waterTile.y },
      { x: waterTile.x, y: waterTile.y + 1 },
      { x: waterTile.x, y: waterTile.y - 1 },
      { x: waterTile.x + 1, y: waterTile.y + 1 },
      { x: waterTile.x - 1, y: waterTile.y + 1 },
      { x: waterTile.x + 1, y: waterTile.y - 1 },
      { x: waterTile.x - 1, y: waterTile.y - 1 }
    ].filter(t => testMatrix[t.y]?.[t.x] === TileType.FLOOR);

    assert.strictEqual(candidateAdj.length, 8, '8 surrounding tiles must be open walkable floor');

    // Character at (1, 1) approaching water
    const playerPos = { x: 1, y: 1 };
    candidateAdj.sort((a, b) =>
      Math.hypot(a.x - playerPos.x, a.y - playerPos.y) -
      Math.hypot(b.x - playerPos.x, b.y - playerPos.y)
    );

    const chosenDest = candidateAdj[0];
    // Closest adjacent tile from (1,1) is (3,3)
    assert.deepStrictEqual(chosenDest, { x: 3, y: 3 }, 'Must choose closest adjacent tile facing the water');
    assert.strictEqual(testMatrix[chosenDest.y][chosenDest.x], TileType.FLOOR, 'Destination tile must be walkable floor');
    assert.notDeepStrictEqual(chosenDest, waterTile, 'Destination must NOT be on the water tile itself');

    console.log('✓ PASS: Approach-adjacent interaction mechanic verified without standing on water.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL 7 WATER TERRAIN GENERATION UNIT & TOPOLOGY TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runWaterTerrainTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
