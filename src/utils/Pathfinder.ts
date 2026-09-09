import EasyStar from 'easystarjs';
import type { GridPos, DynamicObstaclesConfig } from '../types/game';

export class Pathfinder {
  private gridMatrix: number[][];
  private easystar: EasyStar.js;
  private gridWidth: number;
  private gridHeight: number;

  constructor(gridMatrix: number[][]) {
    this.gridMatrix = gridMatrix;
    this.easystar = new EasyStar.js();
    this.gridHeight = gridMatrix.length;
    this.gridWidth = gridMatrix[0].length;

    this.easystar.setGrid(gridMatrix);
    this.easystar.setAcceptableTiles([0]); // 0 = walkable, 1 = obstacle
    this.easystar.disableDiagonals();
    this.easystar.enableSync();
  }

  public updateGrid(newGridMatrix: number[][]): void {
    this.gridMatrix = newGridMatrix;
    this.gridHeight = newGridMatrix.length;
    this.gridWidth = newGridMatrix[0].length;
    this.easystar.setGrid(newGridMatrix);
  }

  public isObstacle(x: number, y: number): boolean {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) return true;
    return this.gridMatrix[y][x] === 1;
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

      // Check if current tile is an obstacle (excluding start and end tiles themselves)
      const isStartOrEnd = (currX === start.x && currY === start.y) || (currX === end.x && currY === end.y);
      if (!isStartOrEnd && this.isObstacle(currX, currY)) {
        return false;
      }

      // Check for diagonal corner-cutting:
      // If moving diagonally between (prevTileX, prevTileY) and (currX, currY)
      if (currX !== prevTileX && currY !== prevTileY) {
        const corner1Blocked = this.isObstacle(prevTileX, currY);
        const corner2Blocked = this.isObstacle(currX, prevTileY);
        // If either corner tile is an obstacle, LOS cannot squeeze past the corner
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
}
