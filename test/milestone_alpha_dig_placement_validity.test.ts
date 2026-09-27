import assert from 'node:assert/strict';
import fs from 'node:fs';

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { TileType } from '../src/types/game.ts';

async function runPlacementValidity500Seeds() {
  console.log('================================================================');
  console.log('⛏️ DIG SPOT PLACEMENT VALIDITY AUDIT (500 SEEDS)               ');
  console.log('================================================================\n');

  const dl = DataLoader.getInstance();
  await dl.loadAll();
  const dungeonConfig = dl.getDungeonConfig();

  const TOTAL_SEEDS = 500;
  let totalDigSpots = 0;
  let twoSpotFloors = 0;
  let threeSpotFloors = 0;

  for (let seed = 1; seed <= TOTAL_SEEDS; seed++) {
    let s = seed;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const dungeon = DungeonGenerator.generate(dungeonConfig, rng, {
      floorNumber: (seed % 15) + 1,
      currentFloorSeed: seed,
      isDiggingUnlocked: true
    });

    const { gridMatrix, rooms, width, height, portalPos, crystalPos, enemySpawns, bushSpawns, waterTiles } = dungeon;

    // Filter dig spots vs non-dig nodes
    const digSpots = bushSpawns.filter((b: any) => b.nodeTypeId === 'dig_spot');
    const baseNodes = bushSpawns.filter((b: any) => b.nodeTypeId !== 'dig_spot');

    // 1. Count checks: strictly 2 or 3 per floor
    assert.ok(
      digSpots.length >= 2 && digSpots.length <= 3,
      `Seed ${seed}: Expected 2-3 dig spots, got ${digSpots.length}`
    );
    totalDigSpots += digSpots.length;
    if (digSpots.length === 2) twoSpotFloors++;
    if (digSpots.length === 3) threeSpotFloors++;

    // 2. Identify all room boundaries
    const roomByTile = Array.from({ length: height }, () => Array(width).fill(-1));
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          roomByTile[y][x] = r.id;
        }
      }
    }

    // 3. Identify all doorway tiles
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

    const enemyPosSet = new Set(enemySpawns.map(e => `${e.x},${e.y}`));
    const baseNodePosSet = new Set(baseNodes.map(b => `${b.x},${b.y}`));
    const waterPosSet = new Set((waterTiles || []).map(w => `${w.x},${w.y}`));
    const seenDigPosSet = new Set<string>();

    for (const spot of digSpots) {
      const posKey = `${spot.x},${spot.y}`;

      // A. TileType must be walkable floor (0), not obstacle/wall (1), not water (2)
      assert.strictEqual(
        gridMatrix[spot.y]?.[spot.x],
        TileType.FLOOR,
        `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) must be on walkable floor (0)`
      );

      // B. Must be strictly inside an eligible room (never corridor)
      const roomId = roomByTile[spot.y]?.[spot.x];
      assert.ok(
        roomId !== undefined && roomId !== -1,
        `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) must be strictly inside a room, never corridor`
      );

      const room = rooms[roomId];
      assert.notStrictEqual(room.type, 'entrance', `Seed ${seed}: Dig spot cannot be in entrance room`);
      assert.notStrictEqual(room.type, 'boss', `Seed ${seed}: Dig spot cannot be in boss room`);

      // C. Interior tiles only (not outer perimeter wall)
      assert.ok(
        spot.x >= room.x + 1 && spot.x <= room.x + room.width - 2,
        `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) must be inside room interior x`
      );
      assert.ok(
        spot.y >= room.y + 1 && spot.y <= room.y + room.height - 2,
        `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) must be inside room interior y`
      );

      // D. Not on portal or crystal
      assert.notDeepStrictEqual({ x: spot.x, y: spot.y }, portalPos, `Seed ${seed}: Dig spot overlaps portal`);
      assert.notDeepStrictEqual({ x: spot.x, y: spot.y }, crystalPos, `Seed ${seed}: Dig spot overlaps crystal`);

      // E. Not on room center
      assert.notDeepStrictEqual({ x: spot.x, y: spot.y }, { x: room.centerX, y: room.centerY }, `Seed ${seed}: Dig spot on room center`);

      // F. No doorway violation (doorway tile or within 1 tile of doorway)
      assert.strictEqual(doorwayTiles.has(posKey), false, `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) sits on doorway`);
      for (const dKey of doorwayTiles) {
        const [dx, dy] = dKey.split(',').map(Number);
        const isDoorwayAdj = Math.abs(spot.x - dx) <= 1 && Math.abs(spot.y - dy) <= 1;
        assert.strictEqual(isDoorwayAdj, false, `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) violates doorway clearance from (${dx}, ${dy})`);
      }

      // G. No overlap with enemies, base gathering nodes, water, or other dig spots
      assert.strictEqual(enemyPosSet.has(posKey), false, `Seed ${seed}: Dig spot overlaps enemy`);
      assert.strictEqual(baseNodePosSet.has(posKey), false, `Seed ${seed}: Dig spot overlaps base gathering node`);
      assert.strictEqual(waterPosSet.has(posKey), false, `Seed ${seed}: Dig spot overlaps water`);
      assert.strictEqual(seenDigPosSet.has(posKey), false, `Seed ${seed}: Duplicate dig spot position`);
      seenDigPosSet.add(posKey);
    }
  }

  console.log(`Results across ${TOTAL_SEEDS} seeds:`);
  console.log(`- Total dig spots placed: ${totalDigSpots} (Average: ${(totalDigSpots / TOTAL_SEEDS).toFixed(2)} per floor)`);
  console.log(`- Floors with 2 dig spots: ${twoSpotFloors} (${((twoSpotFloors / TOTAL_SEEDS) * 100).toFixed(1)}%)`);
  console.log(`- Floors with 3 dig spots: ${threeSpotFloors} (${((threeSpotFloors / TOTAL_SEEDS) * 100).toFixed(1)}%)`);
  console.log(`- Invalid tiles (corridors, doorways, entrance/boss rooms, walls, water, overlaps): 0`);
  console.log('\n✓ PASS: 100% of dig spots placed across 500 seeds strictly satisfy all placement validity rules!');
}

runPlacementValidity500Seeds().catch((err) => {
  console.error('Dig spot placement validity audit failed:', err);
  process.exit(1);
});
