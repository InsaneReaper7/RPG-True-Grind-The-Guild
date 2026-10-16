import type { ProgressionSystem } from './ProgressionSystem.ts';
import type { StatGainsResult, StatGainsData } from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';

export class StatGainsSystem {
  public static calculateStatGains(progression: ProgressionSystem): StatGainsResult {
    const data: StatGainsData = DataLoader.getInstance().getStatGainsData();
    let hpGain = 0;
    let energyGain = 0;
    let regenGain = 0;

    const categories = data?.categories ?? {};
    const assignments = data?.assignments ?? {};

    // 1. Proficiency stat gains
    for (const [profId, stat] of progression.getAllProficiencyStats().entries()) {
      const level = stat.level ?? 0;
      if (level <= 0) continue;

      const catKey = assignments[profId];
      if (!catKey || catKey === 'excluded') continue;

      const catDef = categories[catKey];
      if (catDef) {
        hpGain += level * (catDef.maxHpPerLevel ?? 0);
        energyGain += level * (catDef.maxEnergyPerLevel ?? 0);
        regenGain += level * (catDef.inCombatEnergyRegenPerLevel ?? 0);
      }
    }

    // 2. Class level stat gains (levels gained in class beyond starting level 1)
    const classCatDef = categories['classLevel'];
    if (classCatDef) {
      for (const stat of progression.getAllClassStats().values()) {
        const levelsGained = Math.max(0, (stat.level ?? 0) - 1);
        if (levelsGained <= 0) continue;
        hpGain += levelsGained * (classCatDef.maxHpPerLevel ?? 0);
        energyGain += levelsGained * (classCatDef.maxEnergyPerLevel ?? 0);
        regenGain += levelsGained * (classCatDef.inCombatEnergyRegenPerLevel ?? 0);
      }
    }

    const critMultiplier = data?.criticalHpMultiplier ?? 0.5;
    const critHpGain = hpGain * critMultiplier;

    // Linear scaling with no ceiling per owner directive
    return {
      hpGain,
      critHpGain,
      energyGain,
      regenGain
    };
  }
}
