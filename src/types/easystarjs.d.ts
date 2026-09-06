declare module 'easystarjs' {
  export class js {
    setGrid(grid: number[][]): void;
    setAcceptableTiles(tiles: number[]): void;
    disableDiagonals(): void;
    enableDiagonals(): void;
    findPath(
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      callback: (path: { x: number; y: number }[] | null) => void
    ): number;
    calculate(): void;
  }
}
