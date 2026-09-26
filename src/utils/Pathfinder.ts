import EasyStar from 'easystarjs';
import type { GridPos, DynamicObstaclesConfig } from '../types/game';

export class Pathfinder {
  private gridMatrix: number[][];
  private gridMatrix2x2: number[][];
  private easystar: EasyStar.js;
  private easystar2x2: EasyStar.js;
  private gridWidth: number;
  private gridHeight: number;

  constructor(gridMatrix: number[][]) {
    this.gridMatrix = gridMatrix;
    this.easystar = new EasyStar.js();
    this.easystar2x2 = new EasyStar.js();
    this.gridHeight = gridMatrix.length;
    this.gridWidth = gridMatrix[0].length;

    this.easystar.setGrid(gridMatrix);
    this.easystar.setAcceptableTiles([0]); // 0 = walkable, 1 = obstacle
    this.easystar.disableDiagonals();
    this.easystar.enableSync();

    this.gridMatrix2x2 = this.build2x2Grid(gridMatrix);
    this.easystar2x2.setGrid(this.gridMatrix2x2);
    this.easystar2x2.setAcceptableTiles([0]);
    this.easystar2x2.disableDiagonals();
    this.easystar2x2.enableSync();
  }

  private build2x2Grid(grid: number[][]): number[][] {
    const h = grid.length;
    const w = grid[0].length;
    const g2: number[][] = [];
    for (let y = 0; y < h; y++) {
      const row: number[] = new Array(w).fill(1);
      for (let x = 0; x < w; x++) {
        if (x + 1 < w && y + 1 < h) {
          if (
            grid[y][x] === 0 &&
            grid[y][x + 1] === 0 &&
            grid[y + 1][x] === 0 &&
            grid[y + 1][x + 1] === 0
          ) {
            row[x] = 0;
          }
        }
      }
      g2.push(row);
    }
    return g2;
  }

  public updateGrid(newGridMatrix: number[][]): void {
    this.gridMatrix = newGridMatrix;
    this.gridHeight = newGridMatrix.length;
    this.gridWidth = newGridMatrix[0].length;
    this.easystar.setGrid(newGridMatrix);

    this.gridMatrix2x2 = this.build2x2Grid(newGridMatrix);
    this.easystar2x2.setGrid(this.gridMatrix2x2);
  }

  public is2x2Walkable(x: number, y: number): boolean {
    if (x < 0 || x + 1 >= this.gridWidth || y < 0 || y + 1 >= this.gridHeight) return false;
    return (
      this.gridMatrix[y][x] === 0 &&
      this.gridMatrix[y][x + 1] === 0 &&
      this.gridMatrix[y + 1][x] === 0 &&
      this.gridMatrix[y + 1][x + 1] === 0
    );
  }

  public isObstacle(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return true;
    return this.gridMatrix[y][x] !== 0; // Both Wall (1) and Water (2) are movement obstacles
  }

  public isWall(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return true;
    return this.gridMatrix[y][x] === 1;
  }

  public isWater(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
    return this.gridMatrix[y][x] === 2;
  }

  public isWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return false;
    return this.gridMatrix[y][x] === 0;
  }

  public hasLineOfSight(start: GridPos, end: GridPos): boolean {
    if (start.x === end.x && start.y === end.y) return true;

    // Bounds check
    if (
      start.x < 0 ||
      start.x >= this.gridWidth ||
      start.y < 0 ||
      start.y >= this.gridHeight ||
      end.x < 0 ||
      end.x >= this.gridWidth ||
      end.y < 0 ||
      end.y >= this.gridHeight
    ) {
      return false;
    }

    const x0 = start.x + 0.5;
    const y0 = start.y + 0.5;
    const x1 = end.x + 0.5;
    const y1 = end.y + 0.5;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance * 4)); // 4 sub-tile samples per tile distance

    let prevTileX = start.x;
    let prevTileY = start.y;

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const currX = Math.floor(x0 + dx * t);
      const currY = Math.floor(y0 + dy * t);

      // If tile unchanged from previous step, continue
      if (currX === prevTileX && currY === prevTileY) {
        continue;
      }

      // Check if current tile is an obstacle that blocks sight (walls block sight, water does not)
      const isStartOrEnd = (currX === start.x && currY === start.y) || (currX === end.x && currY === end.y);
      if (!isStartOrEnd && this.isWall(currX, currY)) {
        return false;
      }

      // Check for diagonal corner-cutting:
      // If moving diagonally between (prevTileX, prevTileY) and (currX, currY)
      if (currX !== prevTileX && currY !== prevTileY) {
        const corner1Blocked = this.isWall(prevTileX, currY);
        const corner2Blocked = this.isWall(currX, prevTileY);
        // If either corner tile is a wall, LOS cannot squeeze past the corner
        if (corner1Blocked || corner2Blocked) {
          return false;
        }
      }

      prevTileX = currX;
      prevTileY = currY;
    }

    return true;
  }

  public findPath(
    start: GridPos,
    end: GridPos,
    dynamicObstacles?: GridPos[] | DynamicObstaclesConfig,
    hardObstacles?: GridPos[]
  ): Promise<GridPos[]> {
    return new Promise((resolve) => {
      // Validate boundaries
      if (
        start.x < 0 ||
        start.x >= this.gridWidth ||
        start.y < 0 ||
        start.y >= this.gridHeight ||
        end.x < 0 ||
        end.x >= this.gridWidth ||
        end.y < 0 ||
        end.y >= this.gridHeight
      ) {
        resolve([]);
        return;
      }

      let softList: GridPos[] = [];
      let hardList: GridPos[] = [];

      if (Array.isArray(dynamicObstacles)) {
        softList = dynamicObstacles;
        if (hardObstacles) {
          hardList = hardObstacles;
        }
      } else if (dynamicObstacles && typeof dynamicObstacles === 'object') {
        softList = dynamicObstacles.soft || [];
        hardList = dynamicObstacles.hard || [];
      } else if (hardObstacles) {
        hardList = hardObstacles;
      }

      const applyObstacleList = (obstacles: GridPos[]) => {
        for (const obs of obstacles) {
          // Do not mark start or destination tile as dynamic obstacle
          if ((obs.x !== start.x || obs.y !== start.y) && (obs.x !== end.x || obs.y !== end.y)) {
            this.easystar.avoidAdditionalPoint(obs.x, obs.y);
          }
        }
      };

      // 1. Primary Pass: avoid both hard (enemies) and soft (friendly units) obstacles
      if (hardList.length > 0) applyObstacleList(hardList);
      if (softList.length > 0) applyObstacleList(softList);

      let returnedPath: GridPos[] = [];
      this.easystar.findPath(start.x, start.y, end.x, end.y, (path) => {
        if (path !== null) {
          returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
        }
      });
      this.easystar.calculate();

      // Clear all avoided points before deciding if bottleneck fallback is eligible
      this.easystar.stopAvoidingAllAdditionalPoints();

      // 2. Corridor Bottleneck Fallback:
      // If path was blocked by intermediate obstacles in a corridor/doorway,
      // and there were soft (friendly) obstacles, recalculate toward the exact same destination
      // with soft obstacles relaxed, BUT with hard obstacles (living enemies) STILL STRICTLY AVOIDED!
      // This preserves party members queueing/streaming through doorways when blocked by allies,
      // while strictly enforcing the Swarm-Trap: hostile living enemies are NEVER bypassed.
      if (returnedPath.length === 0 && softList.length > 0) {
        if (hardList.length > 0) {
          applyObstacleList(hardList);
        }

        this.easystar.findPath(start.x, start.y, end.x, end.y, (path) => {
          if (path !== null) {
            returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
          }
        });
        this.easystar.calculate();

        if (hardList.length > 0) {
          this.easystar.stopAvoidingAllAdditionalPoints();
        }
      }

      resolve(returnedPath);
    });
  }

  public find2x2Path(
    start: GridPos,
    end: GridPos,
    dynamicObstacles?: GridPos[] | DynamicObstaclesConfig,
    hardObstacles?: GridPos[]
  ): Promise<GridPos[]> {
    return new Promise((resolve) => {
      // Validate boundaries (start and end anchors must be valid 2x2 anchors within bounds)
      if (
        start.x < 0 ||
        start.x + 1 >= this.gridWidth ||
        start.y < 0 ||
        start.y + 1 >= this.gridHeight ||
        end.x < 0 ||
        end.x + 1 >= this.gridWidth ||
        end.y < 0 ||
        end.y + 1 >= this.gridHeight
      ) {
        resolve([]);
        return;
      }

      let softList: GridPos[] = [];
      let hardList: GridPos[] = [];

      if (Array.isArray(dynamicObstacles)) {
        softList = dynamicObstacles;
        if (hardObstacles) {
          hardList = hardObstacles;
        }
      } else if (dynamicObstacles && typeof dynamicObstacles === 'object') {
        softList = dynamicObstacles.soft || [];
        hardList = dynamicObstacles.hard || [];
      } else if (hardObstacles) {
        hardList = hardObstacles;
      }

      // In 2x2 space, an obstacle at (ox, oy) blocks 4 anchor positions:
      // (ox, oy), (ox - 1, oy), (ox, oy - 1), (ox - 1, oy - 1)
      const get2x2AvoidAnchors = (obstacles: GridPos[]): GridPos[] => {
        const anchors: GridPos[] = [];
        const seen = new Set<string>();
        for (const obs of obstacles) {
          const candidateAnchors = [
            { x: obs.x, y: obs.y },
            { x: obs.x - 1, y: obs.y },
            { x: obs.x, y: obs.y - 1 },
            { x: obs.x - 1, y: obs.y - 1 }
          ];
          for (const ca of candidateAnchors) {
            if (ca.x >= 0 && ca.x + 1 < this.gridWidth && ca.y >= 0 && ca.y + 1 < this.gridHeight) {
              const key = `${ca.x},${ca.y}`;
              if (!seen.has(key)) {
                seen.add(key);
                anchors.push(ca);
              }
            }
          }
        }
        return anchors;
      };

      const hardAnchors = get2x2AvoidAnchors(hardList);
      const softAnchors = get2x2AvoidAnchors(softList);

      const apply2x2ObstacleList = (anchors: GridPos[]) => {
        for (const a of anchors) {
          // Do not mark start or destination anchor as avoided point
          if ((a.x !== start.x || a.y !== start.y) && (a.x !== end.x || a.y !== end.y)) {
            this.easystar2x2.avoidAdditionalPoint(a.x, a.y);
          }
        }
      };

      // 1. Primary Pass: avoid both hard (enemies) and soft (friendly units) obstacles
      if (hardAnchors.length > 0) apply2x2ObstacleList(hardAnchors);
      if (softAnchors.length > 0) apply2x2ObstacleList(softAnchors);

      let returnedPath: GridPos[] = [];
      this.easystar2x2.findPath(start.x, start.y, end.x, end.y, (path) => {
        if (path !== null) {
          returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
        }
      });
      this.easystar2x2.calculate();

      this.easystar2x2.stopAvoidingAllAdditionalPoints();

      // 2. Corridor Bottleneck Fallback:
      // If path was blocked and there were soft obstacles, recalculate with soft obstacles relaxed,
      // BUT with hard obstacles (living enemies) STILL STRICTLY AVOIDED!
      if (returnedPath.length === 0 && softAnchors.length > 0) {
        if (hardAnchors.length > 0) {
          apply2x2ObstacleList(hardAnchors);
        }

        this.easystar2x2.findPath(start.x, start.y, end.x, end.y, (path) => {
          if (path !== null) {
            returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
          }
        });
        this.easystar2x2.calculate();

        if (hardAnchors.length > 0) {
          this.easystar2x2.stopAvoidingAllAdditionalPoints();
        }
      }

      resolve(returnedPath);
    });
  }
}
