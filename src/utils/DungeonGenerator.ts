import type {
  DungeonConfig,
  DungeonRoom,
  GeneratedDungeon,
  EnemySpawnDef,
  BushSpawnDef,
  GridPos
} from '../types/game.ts';

export class DungeonGenerator {
  /**
   * Generates a procedural dungeon with rooms, corridors, and populated entities
   * based on the provided configuration.
   * @param config DungeonConfig parameters
   * @param rng Optional custom RNG function returning [0, 1) for deterministic testing
   */
  public static generate(config: DungeonConfig, rng: () => number = Math.random): GeneratedDungeon {
    const width = config.mapWidth;
    const height = config.mapHeight;

    // 1. Initialize grid with all walls (1 = obstacle)
    const gridMatrix: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = new Array(width).fill(1);
      gridMatrix.push(row);
    }

    const randInt = (min: number, max: number): number => {
      return Math.floor(rng() * (max - min + 1)) + min;
    };

    const targetRoomCount = randInt(config.roomCount.min, config.roomCount.max);
    const rooms: DungeonRoom[] = [];
    const maxPlacementAttempts = 200;

    // 2. Place non-overlapping rooms with wall buffer
    for (let attempt = 0; attempt < maxPlacementAttempts && rooms.length < targetRoomCount; attempt++) {
      const rw = randInt(config.roomSize.minWidth, config.roomSize.maxWidth);
      const rh = randInt(config.roomSize.minHeight, config.roomSize.maxHeight);

      // Keep at least 2 tiles buffer from map borders
      const rx = randInt(2, width - rw - 3);
      const ry = randInt(2, height - rh - 3);

      // Buffer of 2 tiles between rooms so walls don't merge awkwardly
      const buffer = 2;
      let overlaps = false;
      for (const existing of rooms) {
        if (
          !(
            rx + rw + buffer <= existing.x ||
            existing.x + existing.width + buffer <= rx ||
            ry + rh + buffer <= existing.y ||
            existing.y + existing.height + buffer <= ry
          )
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        // Carve room floor (0 = walkable)
        for (let y = ry; y < ry + rh; y++) {
          for (let x = rx; x < rx + rw; x++) {
            gridMatrix[y][x] = 0;
          }
        }

        const newRoom: DungeonRoom = {
          id: rooms.length,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          centerX: Math.floor(rx + rw / 2),
          centerY: Math.floor(ry + rh / 2),
          type: 'light_combat' // placeholder, assigned later
        };
        rooms.push(newRoom);
      }
    }

    // Safety fallback: if fewer than 4 rooms were placed, force-place remaining rooms with 1-tile buffer
    if (rooms.length < 4) {
      for (let attempt = 0; attempt < 200 && rooms.length < 4; attempt++) {
        const rw = randInt(config.roomSize.minWidth, config.roomSize.maxWidth);
        const rh = randInt(config.roomSize.minHeight, config.roomSize.maxHeight);
        const rx = randInt(2, width - rw - 3);
        const ry = randInt(2, height - rh - 3);

        const buffer = 1;
        let overlaps = false;
        for (const existing of rooms) {
          if (
            !(
              rx + rw + buffer <= existing.x ||
              existing.x + existing.width + buffer <= rx ||
              ry + rh + buffer <= existing.y ||
              existing.y + existing.height + buffer <= ry
            )
          ) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) {
              gridMatrix[y][x] = 0;
            }
          }
          rooms.push({
            id: rooms.length,
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            centerX: Math.floor(rx + rw / 2),
            centerY: Math.floor(ry + rh / 2),
            type: 'light_combat'
          });
        }
      }
    }

    // 3. Carve Corridors connecting all rooms
    const carveCorridor = (x1: number, y1: number, x2: number, y2: number) => {
      const cWidth = config.corridorWidth || 1;
      const horizontalFirst = rng() < 0.5;

      const carveH = (startX: number, endX: number, fixedY: number) => {
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        for (let x = minX; x <= maxX; x++) {
          for (let w = 0; w < cWidth; w++) {
            const targetY = fixedY + w;
            if (targetY > 0 && targetY < height - 1 && x > 0 && x < width - 1) {
              gridMatrix[targetY][x] = 0;
            }
          }
        }
      };

      const carveV = (startY: number, endY: number, fixedX: number) => {
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        for (let y = minY; y <= maxY; y++) {
          for (let w = 0; w < cWidth; w++) {
            const targetX = fixedX + w;
            if (targetX > 0 && targetX < width - 1 && y > 0 && y < height - 1) {
              gridMatrix[y][targetX] = 0;
            }
          }
        }
      };

      if (horizontalFirst) {
        carveH(x1, x2, y1);
        carveV(y1, y2, x2);
      } else {
        carveV(y1, y2, x1);
        carveH(x1, x2, y2);
      }
    };

    // Chain connect rooms sequentially (room 0 -> 1 -> 2 -> ... -> N-1)
    for (let i = 0; i < rooms.length - 1; i++) {
      carveCorridor(rooms[i].centerX, rooms[i].centerY, rooms[i + 1].centerX, rooms[i + 1].centerY);
    }

    // Also connect the last room back to the first room for loop connectivity
    if (rooms.length > 2) {
      carveCorridor(
        rooms[rooms.length - 1].centerX,
        rooms[rooms.length - 1].centerY,
        rooms[0].centerX,
        rooms[0].centerY
      );
    }

    // Optional cross-connect: connect random pair of rooms for extra path variety
    if (rooms.length >= 5) {
      const idxA = randInt(1, Math.floor(rooms.length / 2));
      const idxB = randInt(Math.floor(rooms.length / 2) + 1, rooms.length - 1);
      carveCorridor(rooms[idxA].centerX, rooms[idxA].centerY, rooms[idxB].centerX, rooms[idxB].centerY);
    }

    // 4. Connectivity Verification via BFS
    const verifyConnectivityAndRepair = () => {
      const visited = new Set<string>();
      const queue: GridPos[] = [{ x: rooms[0].centerX, y: rooms[0].centerY }];
      visited.add(`${rooms[0].centerX},${rooms[0].centerY}`);

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
          if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && gridMatrix[ny][nx] === 0) {
            const key = `${nx},${ny}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ x: nx, y: ny });
            }
          }
        }
      }

      // Check if all room centers were visited
      for (let i = 1; i < rooms.length; i++) {
        const key = `${rooms[i].centerX},${rooms[i].centerY}`;
        if (!visited.has(key)) {
          // Unconnected room detected: carve direct corridor to room 0
          carveCorridor(rooms[i].centerX, rooms[i].centerY, rooms[0].centerX, rooms[0].centerY);
        }
      }
    };
    verifyConnectivityAndRepair();

    // 5. Room Type Assignment
    // Room 0 is always Entrance Room
    rooms[0].type = 'entrance';
    const portalPos: GridPos = { x: rooms[0].centerX, y: rooms[0].centerY };

    // From remaining rooms, guarantee at least 1 Gathering, 1 Light Combat, 1 Heavy Combat
    const nonEntranceIndices: number[] = [];
    for (let i = 1; i < rooms.length; i++) {
      nonEntranceIndices.push(i);
    }

    // Shuffle non-entrance room indices
    for (let i = nonEntranceIndices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = nonEntranceIndices[i];
      nonEntranceIndices[i] = nonEntranceIndices[j];
      nonEntranceIndices[j] = temp;
    }

    // Guaranteed assignments
    if (nonEntranceIndices.length >= 3) {
      rooms[nonEntranceIndices[0]].type = 'gathering';
      rooms[nonEntranceIndices[1]].type = 'light_combat';
      rooms[nonEntranceIndices[2]].type = 'heavy_combat';
    } else {
      if (nonEntranceIndices[0] !== undefined) rooms[nonEntranceIndices[0]].type = 'gathering';
      if (nonEntranceIndices[1] !== undefined) rooms[nonEntranceIndices[1]].type = 'light_combat';
      if (nonEntranceIndices[2] !== undefined) rooms[nonEntranceIndices[2]].type = 'heavy_combat';
    }

    // Remaining rooms assigned by weighted randomness
    const gatheringWeight = config.roomTypes?.gathering?.weight ?? 25;
    const lightWeight = config.roomTypes?.light_combat?.weight ?? 45;
    const heavyWeight = config.roomTypes?.heavy_combat?.weight ?? 30;
    const totalWeight = gatheringWeight + lightWeight + heavyWeight;

    for (let i = 3; i < nonEntranceIndices.length; i++) {
      const roll = rng() * totalWeight;
      const rIdx = nonEntranceIndices[i];
      if (roll < gatheringWeight) {
        rooms[rIdx].type = 'gathering';
      } else if (roll < gatheringWeight + lightWeight) {
        rooms[rIdx].type = 'light_combat';
      } else {
        rooms[rIdx].type = 'heavy_combat';
      }
    }

    // 6. Populate Rooms with Enemies and Bushes
    const enemySpawns: EnemySpawnDef[] = [];
    const bushSpawns: BushSpawnDef[] = [];
    const enemyPool = config.enemyPool && config.enemyPool.length > 0
      ? config.enemyPool
      : ['wolf', 'goblin', 'skeleton', 'undead'];

    for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
      const room = rooms[rIdx];

      // Collect interior walkable tiles (leaving 1 tile border from walls where possible)
      const interiorTiles: GridPos[] = [];
      const xStart = room.width > 3 ? room.x + 1 : room.x;
      const xEnd = room.width > 3 ? room.x + room.width - 2 : room.x + room.width - 1;
      const yStart = room.height > 3 ? room.y + 1 : room.y;
      const yEnd = room.height > 3 ? room.y + room.height - 2 : room.y + room.height - 1;

      for (let y = yStart; y <= yEnd; y++) {
        for (let x = xStart; x <= xEnd; x++) {
          if (gridMatrix[y]?.[x] === 0) {
            // Do not spawn on entrance portal
            if (rIdx === 0 && x === portalPos.x && y === portalPos.y) {
              continue;
            }
            interiorTiles.push({ x, y });
          }
        }
      }

      // Shuffle interior tiles
      for (let i = interiorTiles.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = interiorTiles[i];
        interiorTiles[i] = interiorTiles[j];
        interiorTiles[j] = temp;
      }

      if (room.type !== 'entrance') {
        const roomConfig = config.roomTypes?.[room.type as keyof typeof config.roomTypes];
        let tileIdx = 0;

        // Enemies
        const [minE, maxE] = roomConfig?.enemiesRange ?? (
          room.type === 'light_combat' ? [1, 2] : room.type === 'heavy_combat' ? [3, 5] : [0, 0]
        );
        const enemyCount = Math.min(Math.max(0, interiorTiles.length - tileIdx), randInt(minE, maxE));
        for (let i = 0; i < enemyCount; i++) {
          const enemyId = enemyPool[Math.floor(rng() * enemyPool.length)];
          enemySpawns.push({
            enemyId,
            x: interiorTiles[tileIdx].x,
            y: interiorTiles[tileIdx].y,
            roomIndex: rIdx
          });
          tileIdx++;
        }

        // Gathering Nodes (Foraging Bushes, Woodcutting Trees, Mining Rocks)
        const [minB, maxB] = roomConfig?.bushesRange ?? (
          room.type === 'gathering' ? [2, 4] : room.type === 'light_combat' ? [1, 3] : room.type === 'heavy_combat' ? [2, 5] : [0, 0]
        );
        const nodeTypes = ['foraging_bush', 'woodcutting_tree', 'mining_rock'];
        const bushCount = Math.min(Math.max(0, interiorTiles.length - tileIdx), randInt(minB, maxB));
        for (let i = 0; i < bushCount; i++) {
          const nodeTypeId = nodeTypes[(rIdx + i) % nodeTypes.length];
          bushSpawns.push({
            x: interiorTiles[tileIdx].x,
            y: interiorTiles[tileIdx].y,
            roomIndex: rIdx,
            nodeTypeId
          });
          tileIdx++;
        }
      }
      // 'entrance' room: 0 bushes, 0 enemies
    }

    return {
      width,
      height,
      gridMatrix,
      rooms,
      portalPos,
      enemySpawns,
      bushSpawns
    };
  }
}
