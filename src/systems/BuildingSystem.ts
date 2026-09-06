import type { BuildableDef, GridPos } from '../types/game';

export interface EnclosureResult {
  isIndoor: boolean;
  reason?: string;
  enclosedTiles?: GridPos[];
}

export type ConstructionTierName = 'untrained' | 'novice' | 'adept' | 'expert' | 'master';

export interface ConstructionTierDef {
  tier: ConstructionTierName;
  name: string;
  minLevel: number;
  nextLevel?: number;
  buildCostMultiplier: number;
  demolishRefundMultiplier: number;
}

export const CONSTRUCTION_TIERS: ConstructionTierDef[] = [
  { tier: 'untrained', name: 'Untrained', minLevel: 0, nextLevel: 10, buildCostMultiplier: 1.0, demolishRefundMultiplier: 0.5 },
  { tier: 'novice', name: 'Novice', minLevel: 10, nextLevel: 30, buildCostMultiplier: 0.9, demolishRefundMultiplier: 0.6 },
  { tier: 'adept', name: 'Adept', minLevel: 30, nextLevel: 60, buildCostMultiplier: 0.75, demolishRefundMultiplier: 0.75 },
  { tier: 'expert', name: 'Expert', minLevel: 60, nextLevel: 90, buildCostMultiplier: 0.6, demolishRefundMultiplier: 0.9 },
  { tier: 'master', name: 'Master', minLevel: 90, buildCostMultiplier: 0.5, demolishRefundMultiplier: 1.0 }
];

export class BuildingSystem {
  private mapWidth: number;
  private mapHeight: number;

  constructor(mapWidth: number = 20, mapHeight: number = 20) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  public static getConstructionTier(level: number): ConstructionTierDef {
    for (let i = CONSTRUCTION_TIERS.length - 1; i >= 0; i--) {
      if (level >= CONSTRUCTION_TIERS[i].minLevel) {
        return CONSTRUCTION_TIERS[i];
      }
    }
    return CONSTRUCTION_TIERS[0];
  }

  public static getEffectiveBuildCost(baseCost: number, level: number): number {
    const tier = BuildingSystem.getConstructionTier(level);
    return Math.max(1, Math.floor(baseCost * tier.buildCostMultiplier));
  }

  public static getEffectiveDemolishRefund(costPaid: number, level: number): number {
    const tier = BuildingSystem.getConstructionTier(level);
    return Math.floor(costPaid * tier.demolishRefundMultiplier);
  }

  /**
   * Section 9.1 Boundary-Reach Enclosure Detection
   * Determines whether tile (targetX, targetY) is inside an enclosed room
   * bounded by a continuous perimeter of Wall tiles with at least one Door.
   */
  public checkEnclosure(
    targetX: number,
    targetY: number,
    isWallFn: (x: number, y: number) => boolean,
    isDoorFn: (x: number, y: number) => boolean
  ): EnclosureResult {
    // 1. Initial bounds check
    if (targetX < 0 || targetX >= this.mapWidth || targetY < 0 || targetY >= this.mapHeight) {
      return { isIndoor: false, reason: 'Tile out of map bounds' };
    }

    // 2. Cannot be an indoor floor if the tile itself is a wall or door
    if (isWallFn(targetX, targetY)) {
      return { isIndoor: false, reason: 'Tile is occupied by a wall' };
    }
    if (isDoorFn(targetX, targetY)) {
      return { isIndoor: false, reason: 'Tile is a doorway' };
    }

    // 3. Flood fill BFS through non-wall, non-door tiles
    const queue: GridPos[] = [{ x: targetX, y: targetY }];
    const visited = new Set<string>([`${targetX},${targetY}`]);
    const enclosedTiles: GridPos[] = [{ x: targetX, y: targetY }];
    const perimeterDoors = new Set<string>();
    const perimeterWalls = new Set<string>();

    let leakedToOutside = false;

    // Check if the starting tile itself is on the outer map boundary
    if (
      targetX === 0 ||
      targetX === this.mapWidth - 1 ||
      targetY === 0 ||
      targetY === this.mapHeight - 1
    ) {
      return { isIndoor: false, reason: 'Tile is on outer map boundary edge' };
    }

    const cardinalDirs = [
      { x: 0, y: -1 }, // North
      { x: 0, y: 1 },  // South
      { x: -1, y: 0 }, // West
      { x: 1, y: 0 }   // East
    ];

    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const dir of cardinalDirs) {
        const nx = curr.x + dir.x;
        const ny = curr.y + dir.y;

        // Stepped completely out of map
        if (nx < 0 || nx >= this.mapWidth || ny < 0 || ny >= this.mapHeight) {
          leakedToOutside = true;
          break;
        }

        // Check if neighbor is a door
        if (isDoorFn(nx, ny)) {
          perimeterDoors.add(`${nx},${ny}`);
          continue; // Door forms room boundary, do not step through
        }

        // Check if neighbor is a wall
        if (isWallFn(nx, ny)) {
          perimeterWalls.add(`${nx},${ny}`);
          continue; // Wall forms room boundary, do not step through
        }

        // If open neighbor is on outer boundary edge, it leaks to outside
        if (
          nx === 0 ||
          nx === this.mapWidth - 1 ||
          ny === 0 ||
          ny === this.mapHeight - 1
        ) {
          leakedToOutside = true;
          break;
        }

        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nextTile = { x: nx, y: ny };
          enclosedTiles.push(nextTile);
          queue.push(nextTile);
        }
      }

      if (leakedToOutside) {
        break;
      }
    }

    if (leakedToOutside) {
      return {
        isIndoor: false,
        reason: 'Space leaks to the outside (unclosed wall perimeter)'
      };
    }

    if (perimeterDoors.size === 0) {
      return {
        isIndoor: false,
        reason: 'Enclosure requires at least one Door in the perimeter'
      };
    }

    return {
      isIndoor: true,
      enclosedTiles
    };
  }

  /**
   * Validate if a blueprint can be placed at (x, y)
   */
  public canPlace(
    blueprint: BuildableDef,
    x: number,
    y: number,
    playerPos: GridPos,
    reservedTiles: GridPos[],
    isWallFn: (x: number, y: number) => boolean,
    isDoorFn: (x: number, y: number) => boolean,
    isOccupiedStationFn: (x: number, y: number) => boolean,
    currentWood: number,
    constructionLevel: number = 0
  ): { valid: boolean; reason?: string } {
    // 1. Wood resource check using Construction tier discounted cost
    const effectiveCost = BuildingSystem.getEffectiveBuildCost(blueprint.woodCost, constructionLevel);
    if (currentWood < effectiveCost) {
      return {
        valid: false,
        reason: `Not enough Wood! Requires ${effectiveCost} Wood (You have ${currentWood}).`
      };
    }

    // 2. Map bounds check
    if (x <= 0 || x >= this.mapWidth - 1 || y <= 0 || y >= this.mapHeight - 1) {
      return { valid: false, reason: 'Cannot place on outer map boundary.' };
    }

    // 3. Reserved tiles (e.g. Portal)
    if (reservedTiles.some((r) => r.x === x && r.y === y)) {
      return { valid: false, reason: 'Cannot place: Tile is reserved (Portal).' };
    }

    // 4. Player position check for solid objects
    if (!blueprint.walkable && playerPos.x === x && playerPos.y === y) {
      return { valid: false, reason: 'Cannot place solid object on player position.' };
    }

    // 5. Existing solid structure checks
    if (blueprint.id === 'wall') {
      if (isWallFn(x, y)) {
        return { valid: false, reason: 'A wall already exists here.' };
      }
      if (isOccupiedStationFn(x, y)) {
        return { valid: false, reason: 'Cannot place wall on existing furniture or station.' };
      }
    } else if (blueprint.id === 'door') {
      if (isDoorFn(x, y)) {
        return { valid: false, reason: 'A door already exists here.' };
      }
      if (isWallFn(x, y)) {
        return { valid: false, reason: 'Demolish the existing wall first to place a door.' };
      }
      if (isOccupiedStationFn(x, y)) {
        return { valid: false, reason: 'Cannot place door on existing furniture or station.' };
      }
    } else if (!blueprint.walkable) {
      if (isWallFn(x, y)) {
        return { valid: false, reason: `Cannot place ${blueprint.name} on a wall.` };
      }
      if (isDoorFn(x, y)) {
        return { valid: false, reason: `Cannot place ${blueprint.name} on a doorway.` };
      }
      if (isOccupiedStationFn(x, y)) {
        return { valid: false, reason: 'An object already exists here.' };
      }
    }

    // 6. Indoor enclosure requirement check
    if (blueprint.indoorRequired) {
      const enclosure = this.checkEnclosure(x, y, isWallFn, isDoorFn);
      if (!enclosure.isIndoor) {
        return {
          valid: false,
          reason: `Cannot place ${blueprint.name}: Requires a fully enclosed indoor room with walls and a door!`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Wall auto-orientation inference based on cardinal connections
   */
  public getWallTextureKey(
    x: number,
    y: number,
    isWallOrDoor: (x: number, y: number) => boolean
  ): string {
    const north = isWallOrDoor(x, y - 1);
    const south = isWallOrDoor(x, y + 1);
    const west = isWallOrDoor(x - 1, y);
    const east = isWallOrDoor(x + 1, y);

    if ((north || south) && (east || west)) {
      if (south && east && !north && !west) return 'buildable-wood-wall-corner-nw';
      if (south && west && !north && !east) return 'buildable-wood-wall-corner-ne';
      if (north && east && !south && !west) return 'buildable-wood-wall-corner-sw';
      if (north && west && !south && !east) return 'buildable-wood-wall-corner-se';
      return 'buildable-wood-wall-junction';
    }

    if (north || south) {
      return 'buildable-wood-wall-v';
    }

    if (east || west) {
      return 'buildable-wood-wall-h';
    }

    return 'buildable-wood-wall-single';
  }
}
