import {
  type DungeonConfig,
  type DungeonRoom,
  type GeneratedDungeon,
  type EnemySpawnDef,
  type BushSpawnDef,
  type GridPos,
  TileType
} from '../types/game.ts';
import { GameState } from '../systems/GameState.ts';

export class DungeonGenerator {
  /**
   * Generates a procedural dungeon with rooms, corridors, and populated entities
   * based on the provided configuration.
   * @param config DungeonConfig parameters
   * @param rng Optional custom RNG function returning [0, 1) for deterministic testing
   * @param options Optional generation options (e.g. isDiggingUnlocked, floorNumber, forceBoss)
   */
  public static generate(
    config: DungeonConfig,
    rng: () => number = Math.random,
    options?: { isDiggingUnlocked?: boolean; floorNumber?: number; forceBoss?: boolean; forceBossEnemyId?: string }
  ): GeneratedDungeon {
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
    const cWidth = Math.max(2, config.corridorWidth || 2);

    const carveCorridor = (x1: number, y1: number, x2: number, y2: number) => {
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

      // Carve full cWidth x cWidth corner block to eliminate diagonal notches at turns
      const carveCorner = (cornerX: number, cornerY: number) => {
        for (let wx = 0; wx < cWidth; wx++) {
          for (let wy = 0; wy < cWidth; wy++) {
            const tx = cornerX + wx;
            const ty = cornerY + wy;
            if (tx > 0 && tx < width - 1 && ty > 0 && ty < height - 1) {
              gridMatrix[ty][tx] = 0;
            }
          }
        }
      };

      if (horizontalFirst) {
        carveH(x1, x2, y1);
        carveV(y1, y2, x2);
        carveCorner(x2, y1);
      } else {
        carveV(y1, y2, x1);
        carveH(x1, x2, y2);
        carveCorner(x1, y2);
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

    // 4. Widen Room Doorways/Entrances along perimeters to minimum cWidth
    const widenRoomDoorways = () => {
      for (const r of rooms) {
        const widenWall = (isHoriz: boolean, fixedCoord: number, minVar: number, maxVar: number) => {
          let run = 0;
          let runStart = -1;
          for (let v = minVar; v <= maxVar; v++) {
            const x = isHoriz ? v : fixedCoord;
            const y = isHoriz ? fixedCoord : v;
            if (gridMatrix[y]?.[x] === 0) {
              if (run === 0) runStart = v;
              run++;
            } else {
              if (run > 0 && run < cWidth) {
                applyWiden(isHoriz, fixedCoord, runStart, run, minVar, maxVar);
              }
              run = 0;
            }
          }
          if (run > 0 && run < cWidth) {
            applyWiden(isHoriz, fixedCoord, runStart, run, minVar, maxVar);
          }
        };

        const applyWiden = (
          isHoriz: boolean,
          fixedCoord: number,
          runStart: number,
          runLen: number,
          minVar: number,
          maxVar: number
        ) => {
          const needed = cWidth - runLen;
          for (let step = 0; step < needed; step++) {
            let widenIdx = runStart + runLen + step;
            if (widenIdx > maxVar) {
              widenIdx = runStart - 1 - step;
            }
            if (widenIdx >= minVar && widenIdx <= maxVar) {
              const x = isHoriz ? widenIdx : fixedCoord;
              const y = isHoriz ? fixedCoord : widenIdx;
              if (y > 0 && y < height - 1 && x > 0 && x < width - 1) {
                gridMatrix[y][x] = 0;
              }
            }
          }
        };

        if (r.y - 1 >= 0) widenWall(true, r.y - 1, r.x, r.x + r.width - 1);
        if (r.y + r.height < height) widenWall(true, r.y + r.height, r.x, r.x + r.width - 1);
        if (r.x - 1 >= 0) widenWall(false, r.x - 1, r.y, r.y + r.height - 1);
        if (r.x + r.width < width) widenWall(false, r.x + r.width, r.y, r.y + r.height - 1);
      }
    };
    widenRoomDoorways();

    // 5. Connectivity Verification via BFS
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
      let repaired = false;
      for (let i = 1; i < rooms.length; i++) {
        const key = `${rooms[i].centerX},${rooms[i].centerY}`;
        if (!visited.has(key)) {
          // Unconnected room detected: carve direct corridor to room 0
          carveCorridor(rooms[i].centerX, rooms[i].centerY, rooms[0].centerX, rooms[0].centerY);
          repaired = true;
        }
      }
      if (repaired) {
        widenRoomDoorways();
      }
    };
    verifyConnectivityAndRepair();

    // 5. Room Type Assignment
    // Room 0 is always Entrance Room
    rooms[0].type = 'entrance';
    const portalPos: GridPos = { x: rooms[0].centerX, y: rooms[0].centerY };

    // Milestone 34 / Rarity Correction & Milestone 40 Depth Scaling:
    // Determines if Boss room should spawn based on:
    // 1. Explicit override in options (e.g. forceBoss: true / false for tests)
    // 2. Guaranteed milestone interval (every 5th floor of the current run: floors 5, 10, 15...)
    // 3. Low-probability independent roll on non-milestone floors (scales with depth)
    const floorNumber = options?.floorNumber ?? (
      typeof GameState !== 'undefined' ? GameState.getInstance().getDungeonFloorCount() : 1
    );
    const depth = Math.max(1, floorNumber);
    const depthOffset = depth - 1;

    let shouldSpawnBossRoom = false;
    if (rooms.length >= 2) {
      if (options?.forceBoss !== undefined) {
        shouldSpawnBossRoom = options.forceBoss;
      } else {
        const milestoneInterval = config.bossMilestoneInterval ?? 5;
        const isMilestone = floorNumber > 0 && floorNumber % milestoneInterval === 0;

        const baseBossRandom = config.bossRandomChance ?? 0.02;
        const bossRandomPerFloor = config.depthScaling?.bossRandomChancePerFloor ?? 0;
        const maxBossRandom = config.depthScaling?.maxBossRandomChance ?? 0.05;
        const effectiveBossRandom = Math.min(maxBossRandom, baseBossRandom + depthOffset * bossRandomPerFloor);

        const isRandomBoss = rng() < effectiveBossRandom;
        shouldSpawnBossRoom = (isMilestone || isRandomBoss) && (config.bossRoom ?? true);
      }
    }

    let bossRoomIdx = -1;
    if (shouldSpawnBossRoom) {
      let maxDist = -1;
      for (let i = 1; i < rooms.length; i++) {
        const dist = Math.hypot(rooms[i].centerX - rooms[0].centerX, rooms[i].centerY - rooms[0].centerY);
        if (dist > maxDist) {
          maxDist = dist;
          bossRoomIdx = i;
        }
      }
      if (bossRoomIdx !== -1) {
        rooms[bossRoomIdx].type = 'boss';
      }
    }

    // From remaining non-entrance, non-boss rooms, guarantee at least 1 Gathering, 1 Light Combat, 1 Heavy Combat
    const nonEntranceIndices: number[] = [];
    for (let i = 1; i < rooms.length; i++) {
      if (i !== bossRoomIdx) {
        nonEntranceIndices.push(i);
      }
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

    // 5b. Teleporter Crystal Placement (Milestone 40)
    // Deliberate design mandate:
    // - On Boss floors: crystal is placed inside the Boss chamber (Boss gates the exit / continuation).
    // - On non-Boss floors: crystal is placed in the room furthest from the entrance.
    let crystalRoomIdx = -1;
    if (bossRoomIdx !== -1) {
      crystalRoomIdx = bossRoomIdx;
    } else {
      let maxDist = -1;
      for (let i = 1; i < rooms.length; i++) {
        const dist = Math.hypot(rooms[i].centerX - rooms[0].centerX, rooms[i].centerY - rooms[0].centerY);
        if (dist > maxDist) {
          maxDist = dist;
          crystalRoomIdx = i;
        }
      }
    }
    if (crystalRoomIdx === -1 && rooms.length > 1) {
      crystalRoomIdx = rooms.length - 1;
    } else if (crystalRoomIdx === -1) {
      crystalRoomIdx = 0;
    }

    const cRoom = rooms[crystalRoomIdx];
    let crystalPos: GridPos = { x: cRoom.centerX, y: cRoom.centerY };
    if (cRoom.type === 'boss') {
      // Offset from Boss center so boss doesn't stand directly on top of crystal
      const candidateOffsets = [
        { x: 0, y: -2 },
        { x: 0, y: 2 },
        { x: 2, y: 0 },
        { x: -2, y: 0 },
        { x: 1, y: 1 },
        { x: -1, y: -1 }
      ];
      let placed = false;
      for (const off of candidateOffsets) {
        const cx = cRoom.centerX + off.x;
        const cy = cRoom.centerY + off.y;
        if (gridMatrix[cy]?.[cx] === 0) {
          crystalPos = { x: cx, y: cy };
          placed = true;
          break;
        }
      }
      if (!placed) {
        crystalPos = { x: cRoom.centerX, y: cRoom.centerY };
      }
    } else {
      if (gridMatrix[cRoom.centerY]?.[cRoom.centerX] === 0) {
        crystalPos = { x: cRoom.centerX, y: cRoom.centerY };
      } else {
        for (let y = cRoom.y; y < cRoom.y + cRoom.height; y++) {
          for (let x = cRoom.x; x < cRoom.x + cRoom.width; x++) {
            if (gridMatrix[y]?.[x] === 0) {
              crystalPos = { x, y };
              break;
            }
          }
          if (crystalPos.x !== cRoom.centerX || crystalPos.y !== cRoom.centerY) break;
        }
      }
    }

    // 5c. Milestone — Water Terrain Generation
    // Placed in eligible rooms (gathering, light_combat) before enemies and bushes
    // Subject to strict path, doorway clearance, and connectivity invariants
    const waterTiles: GridPos[] = [];
    const waterConfig = config.water;
    const isWaterEnabled = waterConfig?.enabled ?? true;

    if (isWaterEnabled && rooms.length >= 2) {
      const eligibleTypes = new Set(waterConfig?.eligibleRoomTypes ?? ['gathering', 'light_combat']);
      const chancePerRoom = waterConfig?.chancePerEligibleRoom ?? 0.6;
      const minPoolSize = waterConfig?.minPoolSize ?? 2;
      const maxPoolSize = waterConfig?.maxPoolSize ?? 5;

      for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
        const room = rooms[rIdx];
        if (room.type === 'entrance' || room.type === 'boss') continue;
        if (!eligibleTypes.has(room.type)) continue;
        if (room.width < 5 || room.height < 5) continue;

        // Derive deterministic local PRNG for water terrain generation in this room
        // based on room geometry and topology so:
        // 1. Water generation is 100% deterministic given room layout
        // 2. Identical seeds across non-boss floors produce byte-identical grid matrices
        // 3. Sequential multi-floor simulations do not have their main RNG stream perturbed
        let roomWaterSeed = (
          (room.x * 1009) ^
          (room.y * 2017) ^
          (room.width * 3001) ^
          (room.height * 4003) ^
          (rIdx * 5009)
        ) >>> 0;
        const waterRng = () => {
          roomWaterSeed = (roomWaterSeed * 9301 + 49297) % 233280;
          return roomWaterSeed / 233280;
        };

        // Roll probability for this eligible room
        if (waterRng() >= chancePerRoom) continue;

        // 1. Identify all doorway perimeter threshold tiles for this room
        // A doorway tile is a walkable tile (0) inside the room that is orthogonally adjacent to an outside tile with value 0
        const doorwayTiles: GridPos[] = [];
        for (let y = room.y; y < room.y + room.height; y++) {
          for (let x = room.x; x < room.x + room.width; x++) {
            if (gridMatrix[y]?.[x] === 0) {
              const hasExternalWalkableNeighbor =
                (x === room.x && gridMatrix[y]?.[x - 1] === 0) ||
                (x === room.x + room.width - 1 && gridMatrix[y]?.[x + 1] === 0) ||
                (y === room.y && gridMatrix[y - 1]?.[x] === 0) ||
                (y === room.y + room.height - 1 && gridMatrix[y + 1]?.[x] === 0);
              if (hasExternalWalkableNeighbor) {
                doorwayTiles.push({ x, y });
              }
            }
          }
        }

        // 2. Identify candidate interior tiles
        // Must maintain at least 1-tile clearance from any doorway tile (Chebyshev distance >= 2)
        // Must not be room center (room.centerX, room.centerY)
        // Must not be crystalPos or adjacent to crystalPos
        // Must not be portalPos
        const isDoorwayBuffer = (tx: number, ty: number): boolean => {
          for (const d of doorwayTiles) {
            if (Math.abs(tx - d.x) <= 1 && Math.abs(ty - d.y) <= 1) {
              return true;
            }
          }
          return false;
        };

        const isProtectedTile = (tx: number, ty: number): boolean => {
          if (tx === portalPos.x && ty === portalPos.y) return true;
          if (tx === crystalPos.x && ty === crystalPos.y) return true;
          if (Math.abs(tx - crystalPos.x) <= 1 && Math.abs(ty - crystalPos.y) <= 1) return true;
          if (tx === room.centerX && ty === room.centerY) return true;
          return isDoorwayBuffer(tx, ty);
        };

        const candidateInterior: GridPos[] = [];
        for (let y = room.y + 1; y <= room.y + room.height - 2; y++) {
          for (let x = room.x + 1; x <= room.x + room.width - 2; x++) {
            if (gridMatrix[y]?.[x] === 0 && !isProtectedTile(x, y)) {
              candidateInterior.push({ x, y });
            }
          }
        }

        if (candidateInterior.length === 0) continue;

        // Shuffle candidate interior tiles
        for (let i = candidateInterior.length - 1; i > 0; i--) {
          const j = Math.floor(waterRng() * (i + 1));
          const tmp = candidateInterior[i];
          candidateInterior[i] = candidateInterior[j];
          candidateInterior[j] = tmp;
        }

        // Desired pool size
        const targetPoolSize = Math.min(
          candidateInterior.length,
          Math.floor(waterRng() * (maxPoolSize - minPoolSize + 1)) + minPoolSize
        );

        // Grow contiguous pool starting from seed tile
        let bestPool: GridPos[] | null = null;
        for (const seedTile of candidateInterior) {
          const pool: GridPos[] = [seedTile];
          const poolSet = new Set<string>([`${seedTile.x},${seedTile.y}`]);
          const frontier: GridPos[] = [seedTile];

          while (frontier.length > 0 && pool.length < targetPoolSize) {
            const curr = frontier.shift()!;
            const neighbors = [
              { x: curr.x + 1, y: curr.y },
              { x: curr.x - 1, y: curr.y },
              { x: curr.x, y: curr.y + 1 },
              { x: curr.x, y: curr.y - 1 }
            ];
            // Shuffle neighbor exploration
            for (let i = neighbors.length - 1; i > 0; i--) {
              const j = Math.floor(waterRng() * (i + 1));
              const t = neighbors[i];
              neighbors[i] = neighbors[j];
              neighbors[j] = t;
            }

            for (const n of neighbors) {
              const k = `${n.x},${n.y}`;
              if (
                !poolSet.has(k) &&
                n.x >= room.x + 1 && n.x <= room.x + room.width - 2 &&
                n.y >= room.y + 1 && n.y <= room.y + room.height - 2 &&
                gridMatrix[n.y]?.[n.x] === 0 &&
                !isProtectedTile(n.x, n.y)
              ) {
                poolSet.add(k);
                pool.push(n);
                frontier.push(n);
                if (pool.length >= targetPoolSize) break;
              }
            }
          }

          if (pool.length < minPoolSize) continue;

          // 3. Validation Check: Intra-Room Door-to-Door and Center Traversal
          // Temporarily mark candidate pool as water (TileType.WATER = 2)
          for (const p of pool) {
            gridMatrix[p.y][p.x] = TileType.WATER;
          }

          let isValid = true;

          // A. Check that all water tiles have at least one adjacent walkable floor tile in the room
          for (const p of pool) {
            const adjDirs = [
              { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
              { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
            ];
            const hasWalkableBank = adjDirs.some((d) => {
              const ax = p.x + d.x;
              const ay = p.y + d.y;
              return ax >= room.x && ax < room.x + room.width &&
                     ay >= room.y && ay < room.y + room.height &&
                     gridMatrix[ay]?.[ax] === 0;
            });
            if (!hasWalkableBank) {
              isValid = false;
              break;
            }
          }

          // B. Check intra-room door-to-door connectivity and center reachability
          if (isValid) {
            const startPos = doorwayTiles.length > 0 ? doorwayTiles[0] : { x: room.centerX, y: room.centerY };
            const localVisited = new Set<string>();
            const q: GridPos[] = [startPos];
            localVisited.add(`${startPos.x},${startPos.y}`);

            const cardinalDirs = [
              { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
            ];

            while (q.length > 0) {
              const curr = q.shift()!;
              for (const d of cardinalDirs) {
                const nx = curr.x + d.x;
                const ny = curr.y + d.y;
                if (
                  nx >= room.x && nx < room.x + room.width &&
                  ny >= room.y && ny < room.y + room.height &&
                  gridMatrix[ny]?.[nx] === 0
                ) {
                  const key = `${nx},${ny}`;
                  if (!localVisited.has(key)) {
                    localVisited.add(key);
                    q.push({ x: nx, y: ny });
                  }
                }
              }
            }

            // Every doorway must be visited
            for (const d of doorwayTiles) {
              if (!localVisited.has(`${d.x},${d.y}`)) {
                isValid = false;
                break;
              }
            }

            // Room center must be visited
            if (!localVisited.has(`${room.centerX},${room.centerY}`)) {
              isValid = false;
            }

            // Crystal must be visited if in this room
            if (crystalPos.x >= room.x && crystalPos.x < room.x + room.width &&
                crystalPos.y >= room.y && crystalPos.y < room.y + room.height) {
              if (!localVisited.has(`${crystalPos.x},${crystalPos.y}`)) {
                isValid = false;
              }
            }
          }

          // C. Global Connectivity Verification: Ensure full dungeon connectivity from portalPos
          if (isValid) {
            const gVisited = new Set<string>();
            const gQueue: GridPos[] = [{ x: portalPos.x, y: portalPos.y }];
            gVisited.add(`${portalPos.x},${portalPos.y}`);
            const cardinalDirs = [
              { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
            ];

            while (gQueue.length > 0) {
              const curr = gQueue.shift()!;
              for (const d of cardinalDirs) {
                const nx = curr.x + d.x;
                const ny = curr.y + d.y;
                if (
                  nx >= 0 && nx < width &&
                  ny >= 0 && ny < height &&
                  gridMatrix[ny]?.[nx] === 0
                ) {
                  const key = `${nx},${ny}`;
                  if (!gVisited.has(key)) {
                    gVisited.add(key);
                    gQueue.push({ x: nx, y: ny });
                  }
                }
              }
            }

            for (const r of rooms) {
              if (!gVisited.has(`${r.centerX},${r.centerY}`)) {
                isValid = false;
                break;
              }
            }
            if (!gVisited.has(`${crystalPos.x},${crystalPos.y}`)) {
              isValid = false;
            }
          }

          if (isValid) {
            bestPool = pool;
            break;
          } else {
            // Revert temporary water assignment
            for (const p of pool) {
              gridMatrix[p.y][p.x] = 0;
            }
          }
        }

        if (bestPool) {
          for (const p of bestPool) {
            waterTiles.push(p);
          }
        }
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
            // Do not spawn on entrance portal or teleporter crystal
            if (rIdx === 0 && x === portalPos.x && y === portalPos.y) {
              continue;
            }
            if (x === crystalPos.x && y === crystalPos.y) {
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

      if (room.type === 'boss') {
        // Milestone 34 & Second Boss Enemy: Dedicated Boss Encounter Room - Spawn exactly 1 Boss at room center
        const currentRegion = config.regions?.find((r) => {
          const min = r.minFloor ?? 1;
          const max = r.maxFloor ?? Infinity;
          return floorNumber >= min && floorNumber <= max;
        });

        let bossId = options?.forceBossEnemyId;
        if (!bossId) {
          if (currentRegion?.bossEnemyId) {
            bossId = currentRegion.bossEnemyId;
          } else if (config.bossPool && config.bossPool.length > 0) {
            bossId = config.bossPool[Math.floor(rng() * config.bossPool.length)];
          } else {
            bossId = config.bossEnemyId || 'abyssal_colossus';
          }
        }

        enemySpawns.push({
          enemyId: bossId,
          x: room.centerX,
          y: room.centerY,
          roomIndex: rIdx
        });
        // 0 bushes spawned in Boss chamber
      } else if (room.type !== 'entrance') {
        const roomConfig = config.roomTypes?.[room.type as keyof typeof config.roomTypes];
        let tileIdx = 0;

        // Enemies
        const [minE, maxE] = roomConfig?.enemiesRange ?? (
          room.type === 'light_combat' ? [1, 2] : room.type === 'heavy_combat' ? [3, 5] : [0, 0]
        );
        const enemyCount = Math.min(Math.max(0, interiorTiles.length - tileIdx), randInt(minE, maxE));

        // Rarity Correction & Milestone 40 Depth Scaling: In Heavy Combat rooms, roll for rare Epic or Elite champions
        let specialEnemyId: string | null = null;
        if (room.type === 'heavy_combat') {
          const baseEpicChance = config.epicChance ?? 0.05;
          const epicPerFloor = config.depthScaling?.epicChancePerFloor ?? 0;
          const maxEpic = config.depthScaling?.maxEpicChance ?? 0.20;
          const effectiveEpicChance = Math.min(maxEpic, baseEpicChance + depthOffset * epicPerFloor);

          const baseEliteChance = config.eliteChance ?? 0.12;
          const elitePerFloor = config.depthScaling?.eliteChancePerFloor ?? 0;
          const maxElite = config.depthScaling?.maxEliteChance ?? 0.35;
          const effectiveEliteChance = Math.min(maxElite, baseEliteChance + depthOffset * elitePerFloor);

          if (rng() < effectiveEpicChance) {
            specialEnemyId = config.epicEnemyId || 'void_knight';
          } else if (rng() < effectiveEliteChance) {
            specialEnemyId = config.eliteEnemyId || 'orc_warrior';
          }
        }

        for (let i = 0; i < enemyCount; i++) {
          const enemyId = (i === 0 && specialEnemyId)
            ? specialEnemyId
            : enemyPool[Math.floor(rng() * enemyPool.length)];
          enemySpawns.push({
            enemyId,
            x: interiorTiles[tileIdx].x,
            y: interiorTiles[tileIdx].y,
            roomIndex: rIdx
          });
          tileIdx++;
        }

        // Gathering Nodes (Foraging Bushes, Woodcutting Trees, Mining Rocks, and Research-Gated Dig Spots)
        const [minB, maxB] = roomConfig?.bushesRange ?? (
          room.type === 'gathering' ? [2, 4] : room.type === 'light_combat' ? [1, 3] : room.type === 'heavy_combat' ? [2, 5] : [0, 0]
        );
        const isDiggingUnlocked = options?.isDiggingUnlocked ?? (
          typeof GameState !== 'undefined' ? GameState.getInstance().isDiggingUnlocked() : false
        );
        const nodeTypes = ['foraging_bush', 'woodcutting_tree', 'mining_rock'];
        if (isDiggingUnlocked) {
          nodeTypes.push('dig_spot');
        }
        const vegetableNodeChance = (config as any).vegetableNodeChance ?? 0.10;
        const bushCount = Math.min(Math.max(0, interiorTiles.length - tileIdx), randInt(minB, maxB));
        for (let i = 0; i < bushCount; i++) {
          const isRareVegetable = rng() < vegetableNodeChance;
          const nodeTypeId = isRareVegetable ? 'vegetable_node' : nodeTypes[(rIdx + i) % nodeTypes.length];
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
      crystalPos,
      enemySpawns,
      bushSpawns,
      waterTiles
    };
  }
}
