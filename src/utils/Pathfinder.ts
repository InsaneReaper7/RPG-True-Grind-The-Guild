import EasyStar from 'easystarjs';
import type { GridPos } from '../types/game';

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

  public findPath(start: GridPos, end: GridPos, dynamicObstacles?: GridPos[]): Promise<GridPos[]> {
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

      const applyDynamicObstacles = (obstacles: GridPos[]) => {
        for (const obs of obstacles) {
          // Do not mark start or destination tile as dynamic obstacle
          if ((obs.x !== start.x || obs.y !== start.y) && (obs.x !== end.x || obs.y !== end.y)) {
            this.easystar.avoidAdditionalPoint(obs.x, obs.y);
          }
        }
      };

      if (dynamicObstacles && dynamicObstacles.length > 0) {
        applyDynamicObstacles(dynamicObstacles);
      }

      let returnedPath: GridPos[] = [];
      this.easystar.findPath(start.x, start.y, end.x, end.y, (path) => {
        if (path !== null) {
          returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
        }
      });
      this.easystar.calculate();

      if (dynamicObstacles && dynamicObstacles.length > 0) {
        this.easystar.stopAvoidingAllAdditionalPoints();
      }

      // Corridor bottleneck fallback:
      // If path was blocked by intermediate dynamic obstacles in a narrow corridor/doorway,
      // recalculate toward the exact same destination without intermediate dynamic obstacles
      // so the unit can stream through the corridor rather than deadlocking.
      if (returnedPath.length === 0 && dynamicObstacles && dynamicObstacles.length > 0) {
        this.easystar.findPath(start.x, start.y, end.x, end.y, (path) => {
          if (path !== null) {
            returnedPath = path.map((p) => ({ x: p.x, y: p.y }));
          }
        });
        this.easystar.calculate();
      }

      resolve(returnedPath);
    });
  }
}
