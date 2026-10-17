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

    // 3. Attributes (STR, DEX, INT)
    const baseAttrs = data?.baseAttributes ?? { str: 1.0, dex: 1.0, int: 1.0 };
    let strength = baseAttrs.str ?? 1.0;
    let dexterity = baseAttrs.dex ?? 1.0;
    let intelligence = baseAttrs.int ?? 1.0;

    const attrGains = data?.attributeGains ?? {};
    for (const [profId, stat] of progression.getAllProficiencyStats().entries()) {
      const level = stat.level ?? 0;
      if (level <= 0) continue;
      const g = attrGains[profId];
      if (g) {
        if (g.str) strength += level * g.str;
        if (g.dex) dexterity += level * g.dex;
        if (g.int) intelligence += level * g.int;
      }
    }

    const classAttrGain = data?.classLevelAttributeGain ?? 0.02;
    const dl = DataLoader.getInstance();
    for (const [classId, stat] of progression.getAllClassStats().entries()) {
      const levelsGained = Math.max(0, (stat.level ?? 0) - 1);
      if (levelsGained <= 0) continue;
      const cDef = dl.getClass(classId);
      const primary = cDef?.primaryAttribute;
      if (primary === 'str') strength += levelsGained * classAttrGain;
      else if (primary === 'dex') dexterity += levelsGained * classAttrGain;
      else if (primary === 'int') intelligence += levelsGained * classAttrGain;
    }

    // Floating-point precision cleanup to 4 decimals
    strength = Math.round(strength * 10000) / 10000;
    dexterity = Math.round(dexterity * 10000) / 10000;
    intelligence = Math.round(intelligence * 10000) / 10000;

    const multPerPoint = data?.damageMultiplierPerAttributePoint ?? 0.02;
    const strMultiplier = 1 + multPerPoint * (strength - 1);
    const dexMultiplier = 1 + multPerPoint * (dexterity - 1);
    const intMultiplier = 1 + multPerPoint * (intelligence - 1);

    // Linear scaling with no ceiling per owner directive
    return {
      hpGain,
      critHpGain,
      energyGain,
      regenGain,
      strength,
      dexterity,
      intelligence,
      strMultiplier,
      dexMultiplier,
      intMultiplier
    };
  }
}
