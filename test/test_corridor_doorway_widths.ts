import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { DungeonConfig, GridPos } from '../src/types/game.ts';

console.log('=== RUNNING DUNGEON CORRIDOR & DOORWAY WIDTH INVARIANT VERIFICATION (500 SEEDS) ===');

const configRaw = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8')) as DungeonConfig;
assert.ok(configRaw.corridorWidth >= 2, `Config corridorWidth must be >= 2 (got ${configRaw.corridorWidth})`);

const TOTAL_SEEDS = 500;
let totalDungeonsTested = 0;
let dungeonsWithNarrowCorridors = 0;
let dungeonsWithNarrowDoorways = 0;
let totalNarrowCorridorTiles = 0;
let totalNarrowDoorways = 0;
let totalRoomsChecked = 0;

for (let seed = 0; seed < TOTAL_SEEDS; seed++) {
  // Deterministic LCG RNG per seed
  let s = seed + 1;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const dungeon = DungeonGenerator.generate(configRaw, rng);
  const { gridMatrix, rooms, width, height, portalPos } = dungeon;
  totalDungeonsTested++;
  totalRoomsChecked += rooms.length;

  // 1. Mark room floor tiles
  const isRoomTile = Array.from({ length: height }, () => Array(width).fill(false));
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        isRoomTile[y][x] = true;
      }
    }
  }

  // 2. Corridors width check (every walkable tile outside rooms)
  // A tile is a 1-tile bottleneck if it has walls on both opposite sides
  // (topWall && bottomWall) or (leftWall && rightWall)
  let narrowCorridorsInDungeon = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (gridMatrix[y][x] === 0 && !isRoomTile[y][x]) {
        const topWall = gridMatrix[y - 1][x] === 1;
        const bottomWall = gridMatrix[y + 1][x] === 1;
        const leftWall = gridMatrix[y][x - 1] === 1;
        const rightWall = gridMatrix[y][x + 1] === 1;

        if ((topWall && bottomWall) || (leftWall && rightWall)) {
          narrowCorridorsInDungeon++;
        }
      }
    }
  }
  if (narrowCorridorsInDungeon > 0) {
    dungeonsWithNarrowCorridors++;
    totalNarrowCorridorTiles += narrowCorridorsInDungeon;
  }

  // 3. Room Doorways / Entrances width check (every opening along room perimeters)
  let narrowDoorwaysInDungeon = 0;
  for (const r of rooms) {
    const checkWall = (tiles: GridPos[]) => {
      let run = 0;
      for (let i = 0; i < tiles.length; i++) {
        const { x, y } = tiles[i];
        if (gridMatrix[y]?.[x] === 0) {
          run++;
        } else {
          if (run > 0 && run < 2) {
            narrowDoorwaysInDungeon++;
          }
          run = 0;
        }
      }
      if (run > 0 && run < 2) {
        narrowDoorwaysInDungeon++;
      }
    };

    // Top wall
    if (r.y - 1 >= 0) {
      checkWall(Array.from({ length: r.width }, (_, i) => ({ x: r.x + i, y: r.y - 1 })));
    }
    // Bottom wall
    if (r.y + r.height < height) {
      checkWall(Array.from({ length: r.width }, (_, i) => ({ x: r.x + i, y: r.y + r.height })));
    }
    // Left wall
    if (r.x - 1 >= 0) {
      checkWall(Array.from({ length: r.height }, (_, i) => ({ x: r.x - 1, y: r.y + i })));
    }
    // Right wall
    if (r.x + r.width < width) {
      checkWall(Array.from({ length: r.height }, (_, i) => ({ x: r.x + r.width, y: r.y + i })));
    }
  }

  if (narrowDoorwaysInDungeon > 0) {
    dungeonsWithNarrowDoorways++;
    totalNarrowDoorways += narrowDoorwaysInDungeon;
  }

  // 4. BFS Full Connectivity from entrance portal
  const visited = new Set<string>();
  const queue: GridPos[] = [{ x: portalPos.x, y: portalPos.y }];
  visited.add(`${portalPos.x},${portalPos.y}`);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && gridMatrix[ny][nx] === 0) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  for (const r of rooms) {
    const centerKey = `${r.centerX},${r.centerY}`;
    assert.ok(
      visited.has(centerKey),
      `Seed ${seed}: Room ${r.id} center (${r.centerX}, ${r.centerY}) must be reachable from entrance portal via BFS`
    );
  }
}

console.log(`\nResults across ${totalDungeonsTested} dungeons (${totalRoomsChecked} total rooms):`);
console.log(`- Dungeons with corridors < 2 tiles: ${dungeonsWithNarrowCorridors} (total narrow tiles: ${totalNarrowCorridorTiles})`);
console.log(`- Dungeons with doorways < 2 tiles: ${dungeonsWithNarrowDoorways} (total narrow doorways: ${totalNarrowDoorways})`);
console.log(`- BFS full graph connectivity: 100% passed (${totalDungeonsTested}/${totalDungeonsTested})`);

assert.equal(dungeonsWithNarrowCorridors, 0, 'Must have zero dungeons with corridors narrower than 2 tiles');
assert.equal(totalNarrowCorridorTiles, 0, 'Must have zero corridor tiles narrower than 2 tiles');
assert.equal(dungeonsWithNarrowDoorways, 0, 'Must have zero dungeons with doorways narrower than 2 tiles');
assert.equal(totalNarrowDoorways, 0, 'Must have zero doorways narrower than 2 tiles');

// ============================================================================
// TEST: Side-by-Side Movement Through 2-Tile Corridor
// ============================================================================
console.log('\n--- Testing Side-by-Side Party Navigation Through 2-Tile Wide Corridor ---');
{
  // Build a 2-tile wide corridor of length 8 with walls on top and bottom
  // Row 0: Walls [1, 1, 1, 1, 1, 1, 1, 1]
  // Row 1: Floor [0, 0, 0, 0, 0, 0, 0, 0] <- Lane A
  // Row 2: Floor [0, 0, 0, 0, 0, 0, 0, 0] <- Lane B
  // Row 3: Walls [1, 1, 1, 1, 1, 1, 1, 1]
  const corridorGrid: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1]
  ];

  const pathfinder = new Pathfinder(corridorGrid);

  // Hero starts at Lane A (x=0, y=1), Companion starts at Lane B (x=0, y=2)
  // Both want to reach the end of their respective lanes (x=7, y=1) and (x=7, y=2)
  const heroStart: GridPos = { x: 0, y: 1 };
  const heroTarget: GridPos = { x: 7, y: 1 };

  const compStart: GridPos = { x: 0, y: 2 };
  const compTarget: GridPos = { x: 7, y: 2 };

  // Companion treats Hero's start position as a soft obstacle
  const compObstacles = { soft: [heroStart], hard: [] };
  const compPath = await pathfinder.findPath(compStart, compTarget, compObstacles);

  // Hero treats Companion's start position as a soft obstacle
  const heroObstacles = { soft: [compStart], hard: [] };
  const heroPath = await pathfinder.findPath(heroStart, heroTarget, heroObstacles);

  assert.ok(compPath.length > 0, 'Companion must find a direct path along Lane B');
  assert.ok(heroPath.length > 0, 'Hero must find a direct path along Lane A');

  // Verify paths stay in their respective lanes without collision
  for (const step of heroPath) {
    assert.equal(step.y, 1, 'Hero path must stay in Lane 1');
  }
  for (const step of compPath) {
    assert.equal(step.y, 2, 'Companion path must stay in Lane 2');
  }

  console.log(`✔ Side-by-side party navigation verified: Hero (Lane 1, ${heroPath.length} steps) and Companion (Lane 2, ${compPath.length} steps) navigate simultaneously without collision or queueing`);
}

// ============================================================================
// TEST: Hard-Mode Swarm-Trap Rule Remains Strictly Non-Negotiable
// ============================================================================
console.log('\n--- Testing Hard-Mode Swarm-Trap Invariant in 2-Tile Wide Corridor ---');
{
  // Even in a 2-tile wide corridor, if enemies block both lanes, NO escape is possible
  const corridorGrid: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1]
  ];

  const pathfinder = new Pathfinder(corridorGrid);
  const heroStart: GridPos = { x: 0, y: 1 };
  const heroTarget: GridPos = { x: 7, y: 1 };

  // Enemies block Lane 1 at x=4 and Lane 2 at x=4
  const livingEnemies: GridPos[] = [
    { x: 4, y: 1 },
    { x: 4, y: 2 }
  ];

  const blockedPath = await pathfinder.findPath(
    heroStart,
    heroTarget,
    { soft: [], hard: livingEnemies }
  );

  assert.equal(blockedPath.length, 0, 'Enemies blocking corridor must strictly prevent passage — swarm-trap rule unbroken');
  console.log('✔ Swarm-trap invariant strictly preserved: Hostile living enemies cannot be bypassed regardless of corridor width');
}

console.log('\n=== ALL CORRIDOR & DOORWAY WIDTH INVARIANT TESTS PASSED SUCCESSFULLY! ===\n');
