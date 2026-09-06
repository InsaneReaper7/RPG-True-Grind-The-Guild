import type { TrainableStat } from '../types/game.ts';

export class LevelingSystem {
  public static readonly BASE_EXP: number = 50;
  public static readonly EXP_INCREMENT_PER_LEVEL: number = 4; // Locked-in constant: exactly 4

  /**
   * Calculates EXP required to go from currentLevel to currentLevel + 1.
   * Formula: 50 + currentLevel * 4
   * Level 0 -> 1: 50 EXP (25 hits @ +2/hit)
   * Level 1 -> 2: 54 EXP (27 hits @ +2/hit, +2 hits)
   * Level 2 -> 3: 58 EXP (29 hits @ +2/hit, +2 hits)
   * ...
   * Level 9 -> 10: 86 EXP (43 hits @ +2/hit)
   * Cumulative 0 -> 10: 680 EXP (exactly 340 hits to reach Fencer)
   */
  public static expForNextLevel(currentLevel: number): number {
    return LevelingSystem.BASE_EXP + currentLevel * LevelingSystem.EXP_INCREMENT_PER_LEVEL;
  }

  /**
   * Adds EXP to a TrainableStat, handling overflow and multi-level advancements.
   * Re-evaluates expForNextLevel against current level on each loop iteration
   * so overflow is accurately consumed against the escalating requirement curve.
   */
  public static addExp(stat: TrainableStat, amount: number): { levelsGained: number; leveledUp: boolean } {
    stat.currentExp += amount;
    let levelsGained = 0;

    while (stat.currentExp >= LevelingSystem.expForNextLevel(stat.level)) {
      stat.currentExp -= LevelingSystem.expForNextLevel(stat.level);
      stat.level += 1;
      levelsGained += 1;
    }

    return {
      levelsGained,
      leveledUp: levelsGained > 0
    };
  }
}
