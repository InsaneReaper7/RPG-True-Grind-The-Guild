import EasyStar from 'easystarjs';
import { GridPos } from '../types/game';

export class Pathfinder {
  private easystar: EasyStar.js;
  private gridWidth: number;
  private gridHeight: number;

  constructor(gridMatrix: number[][]) {
    this.easystar = new EasyStar.js();
    this.gridHeight = gridMatrix.length;
    this.gridWidth = gridMatrix[0].length;

    this.easystar.setGrid(gridMatrix);
    this.easystar.setAcceptableTiles([0]); // 0 = walkable, 1 = obstacle
    this.easystar.disableDiagonals();
  }

  public findPath(start: GridPos, end: GridPos): Promise<GridPos[]> {
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

      this.easystar.findPath(start.x, start.y, end.x, end.y, (path) => {
        if (path === null) {
          resolve([]);
        } else {
          // Convert {x, y} array to GridPos[]
          const result: GridPos[] = path.map((p) => ({ x: p.x, y: p.y }));
          resolve(result);
        }
      });
      this.easystar.calculate();
    });
  }
}
