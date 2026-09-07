declare module 'easystarjs' {
  export class js {
    setGrid(grid: number[][]): void;
    setAcceptableTiles(tiles: number[]): void;
    disableDiagonals(): void;
    enableDiagonals(): void;
    enableSync(): void;
    disableSync(): void;
    avoidAdditionalPoint(x: number, y: number): void;
    stopAvoidingAdditionalPoint(x: number, y: number): void;
    stopAvoidingAllAdditionalPoints(): void;
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
