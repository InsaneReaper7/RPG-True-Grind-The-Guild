import type { ClassDef, Requirement, ClassesData, SkillDef, TrainableStat } from '../types/game.ts';
import { BuildingSystem } from './BuildingSystem.ts';
import type { ConstructionTierDef } from './BuildingSystem.ts';
import { LevelingSystem } from './LevelingSystem.ts';
import { DataLoader } from '../utils/DataLoader.ts';

export interface UnlockEvent {
  classDef: ClassDef;
}

export interface SkillDiscoveredEvent {
  skillId: string;
  level: number;
}

export class ProgressionSystem {
  public static readonly HIDDEN_SKILL_IDS: readonly string[] = [
    'evasion',
    'parry',
    'block',
    'counterattack',
    'resilience',
    'health_regen',
    'mana_regen'
  ];

  private proficiencies: Map<string, TrainableStat> = new Map();
  private classLevels: Map<string, number> = new Map();
  private unlockedClasses: Set<string> = new Set();
  private dualWieldUnlocked: boolean = false;
  private classesData: ClassesData;
  private onUnlockCallbacks: ((event: UnlockEvent) => void)[] = [];
  private onSkillDiscoveredCallbacks: ((event: SkillDiscoveredEvent) => void)[] = [];
  private onDualWieldUnlockedCallbacks: (() => void)[] = [];

  constructor(classesData: ClassesData) {
    this.classesData = classesData;
    // Default trainable stats
    this.proficiencies.set('short_swords', { level: 0, currentExp: 0 });
    this.proficiencies.set('daggers', { level: 0, currentExp: 0 });
    this.proficiencies.set('dual_wielding', { level: 0, currentExp: 0 });
    this.proficiencies.set('construction', { level: 0, currentExp: 0 });
    this.proficiencies.set('alchemy', { level: 0, currentExp: 0 });
    for (const hiddenId of ProgressionSystem.HIDDEN_SKILL_IDS) {
      this.proficiencies.set(hiddenId, { level: 0, currentExp: 0 });
    }
  }

  public onClassUnlocked(callback: (event: UnlockEvent) => void): void {
    this.onUnlockCallbacks.push(callback);
  }

  public onSkillDiscovered(callback: (event: SkillDiscoveredEvent) => void): void {
    this.onSkillDiscoveredCallbacks.push(callback);
  }

  public onDualWieldUnlocked(callback: () => void): void {
    this.onDualWieldUnlockedCallbacks.push(callback);
  }

  public getProficiencyStat(id: string): TrainableStat {
    let stat = this.proficiencies.get(id);
    if (!stat) {
      stat = { level: 0, currentExp: 0 };
      this.proficiencies.set(id, stat);
    }
    return stat;
  }

  public getAllProficiencyStats(): Map<string, TrainableStat> {
    const copy = new Map<string, TrainableStat>();
    for (const [id, stat] of this.proficiencies.entries()) {
      copy.set(id, { ...stat });
    }
    return copy;
  }

  public getProficiencyLevel(id: string): number {
    return this.proficiencies.get(id)?.level ?? 0;
  }

  /**
   * Compatibility method: returns the current level of the proficiency.
   * Every tier-gate requirement now checks against level, not raw accumulated exp.
   */
  public getProficiency(id: string): number {
    return this.getProficiencyLevel(id);
  }

  public getConstructionTier(): ConstructionTierDef {
    return BuildingSystem.getConstructionTier(this.getProficiencyLevel('construction'));
  }

  public getClassLevel(classId: string): number {
    return this.classLevels.get(classId) || 0;
  }

  public isHiddenSkillRevealed(skillId: string): boolean {
    return this.getProficiencyLevel(skillId) >= 1;
  }

  public getClassHiddenBonus(skillId: string): number {
    let bonus = 0;
    for (const classDef of this.classesData.classes) {
      if (this.unlockedClasses.has(classDef.id)) {
        const classBonus = classDef.hiddenSkillBonuses?.[skillId];
        if (typeof classBonus === 'number') {
          bonus += classBonus;
        }
      }
    }
    return bonus;
  }

  public addProficiencyExp(id: string, amount: number): { levelsGained: number; leveledUp: boolean } {
    let stat = this.proficiencies.get(id);
    if (!stat) {
      stat = { level: 0, currentExp: 0 };
      this.proficiencies.set(id, stat);
    }

    const oldLevel = stat.level;
    const result = LevelingSystem.addExp(stat, amount);
    const nextExp = LevelingSystem.expForNextLevel(stat.level);
    console.log(`[Progression] +${amount} EXP for '${id}'. Current: Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)`);

    if (result.leveledUp) {
      console.log(`[Progression] LEVEL UP! '${id}' is now Level ${stat.level}! (Gained ${result.levelsGained} level(s))`);
      this.checkClassUnlocks();
      this.checkDualWieldUnlock();

      if (oldLevel === 0 && stat.level >= 1 && ProgressionSystem.HIDDEN_SKILL_IDS.includes(id)) {
        console.log(`[Progression] ✨ HIDDEN SKILL DISCOVERED: '${id}' reached Level ${stat.level}! ✨`);
        for (const cb of this.onSkillDiscoveredCallbacks) {
          cb({ skillId: id, level: stat.level });
        }
      }
    }

    return result;
  }

  /**
   * Generic Requirement Evaluator Engine
   * Evaluates any class definition's requirements array (ANDed) dynamically against level.
   */
  public evaluateRequirements(classDef: ClassDef): boolean {
    if (this.unlockedClasses.has(classDef.id)) {
      return false; // Already unlocked
    }

    return classDef.requirements.every((req: Requirement) => {
      if (req.type === 'proficiency') {
        const currentLevel = this.getProficiencyLevel(req.target);
        return currentLevel >= req.value;
      } else if (req.type === 'classLevel') {
        const currentLevel = this.getClassLevel(req.target);
        return currentLevel >= req.value;
      }
      return false;
    });
  }

  public checkClassUnlocks(): void {
    for (const classDef of this.classesData.classes) {
      if (this.evaluateRequirements(classDef)) {
        this.unlockedClasses.add(classDef.id);
        this.classLevels.set(classDef.id, 1);
        console.log(`[Progression] Class Unlocked: ${classDef.name} (${classDef.id})!`);

        for (const cb of this.onUnlockCallbacks) {
          cb({ classDef });
        }
      }
    }
  }

  public isClassUnlocked(classId: string): boolean {
    return this.unlockedClasses.has(classId);
  }

  public isSkillUnlocked(skill: SkillDef, player?: { isSkillLearnedFromBook?: (id: string) => boolean }): boolean {
    if (player?.isSkillLearnedFromBook?.(skill.id)) {
      return true;
    }
    return skill.requirements.every((req: Requirement) => {
      if (req.type === 'classLevel') {
        return this.getClassLevel(req.target) >= req.value;
      } else if (req.type === 'proficiency') {
        return this.getProficiencyLevel(req.target) >= req.value;
      }
      return false;
    });
  }

  /**
   * Generic Dual Wielding Unlock:
   * Counts how many eligible one-handed melee weapon proficiencies have reached Level 30+.
   * Dynamically queries DataLoader.getOneHandedMeleeWeaponIds() so any future 1H melee weapon
   * (e.g. Katana, Mace, Spears) seamlessly qualifies with zero rewrites.
   */
  public isDualWieldUnlocked(): boolean {
    if (this.dualWieldUnlocked) return true;

    let eligibleIds: string[];
    try {
      eligibleIds = DataLoader.getInstance().getOneHandedMeleeWeaponIds();
    } catch {
      eligibleIds = ['short_swords', 'daggers', 'katana', 'mace', 'spears'];
    }
    if (!eligibleIds || eligibleIds.length === 0) {
      eligibleIds = ['short_swords', 'daggers', 'katana', 'mace', 'spears'];
    }

    let qualifiedCount = 0;
    for (const weaponId of eligibleIds) {
      if (this.getProficiencyLevel(weaponId) >= 30) {
        qualifiedCount++;
      }
    }

    if (qualifiedCount >= 2) {
      this.dualWieldUnlocked = true;
      console.log(`%c[Progression] ✨ DUAL WIELDING UNLOCKED! Two 1H melee weapon proficiencies reached Level 30! ✨`, 'color: #f59e0b; font-weight: bold;');
      for (const cb of this.onDualWieldUnlockedCallbacks) {
        cb();
      }
      return true;
    }
    return false;
  }

  public checkDualWieldUnlock(): boolean {
    if (this.dualWieldUnlocked) return false;
    return this.isDualWieldUnlocked();
  }

  /**
   * Accuracy penalty for dual wielding:
   * Starts at -20% (-0.20) at Level 0, and shrinks through 10/30/60/90:
   * - Level 0-9: -0.20 (-20%)
   * - Level 10-29 (Novice): -0.15 (-15%)
   * - Level 30-59 (Adept): -0.10 (-10%)
   * - Level 60-89 (Expert): -0.05 (-5%)
   * - Level 90+ (Master): 0.00 (0% penalty)
   */
  public getDualWieldPenalty(): number {
    const level = this.getProficiencyLevel('dual_wielding');
    if (level >= 90) return 0.0;
    if (level >= 60) return 0.05;
    if (level >= 30) return 0.10;
    if (level >= 10) return 0.15;
    return 0.20;
  }

  public getSnapshotData(): {
    proficiencies: Record<string, TrainableStat>;
    classLevels: Record<string, number>;
    unlockedClasses: string[];
  } {
    const profObj: Record<string, TrainableStat> = {};
    for (const [k, v] of this.proficiencies.entries()) {
      profObj[k] = { level: v.level, currentExp: v.currentExp };
    }
    const classObj: Record<string, number> = {};
    for (const [k, v] of this.classLevels.entries()) {
      classObj[k] = v;
    }
    return {
      proficiencies: profObj,
      classLevels: classObj,
      unlockedClasses: Array.from(this.unlockedClasses)
    };
  }

  public loadSnapshotData(data: {
    proficiencies: Record<string, number | TrainableStat>;
    classLevels: Record<string, number>;
    unlockedClasses: string[];
  }): void {
    this.proficiencies.clear();
    for (const [k, v] of Object.entries(data.proficiencies)) {
      if (typeof v === 'number') {
        this.proficiencies.set(k, { level: v, currentExp: 0 });
      } else if (v && typeof v === 'object') {
        this.proficiencies.set(k, { level: v.level ?? 0, currentExp: v.currentExp ?? 0 });
      } else {
        this.proficiencies.set(k, { level: 0, currentExp: 0 });
      }
    }
    this.classLevels.clear();
    for (const [k, v] of Object.entries(data.classLevels)) {
      this.classLevels.set(k, v);
    }
    this.unlockedClasses.clear();
    for (const c of data.unlockedClasses) {
      this.unlockedClasses.add(c);
    }
    this.checkDualWieldUnlock();
  }
}
