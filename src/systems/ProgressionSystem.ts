import type { ClassDef, Requirement, ClassesData, SkillDef, TrainableStat, ExpTransaction } from '../types/game.ts';
import { BuildingSystem } from './BuildingSystem.ts';
import type { ConstructionTierDef } from './BuildingSystem.ts';
import { LevelingSystem } from './LevelingSystem.ts';
import { DataLoader } from '../utils/DataLoader.ts';

export interface UnlockEvent {
  classDef: ClassDef;
  memberName?: string;
}

export interface SkillDiscoveredEvent {
  skillId: string;
  level: number;
  memberName?: string;
}

export class ProgressionSystem {
  public static readonly HIDDEN_SKILL_IDS: readonly string[] = [
    'evasion',
    'parry',
    'block',
    'counterattack',
    'resilience',
    'health_regen',
    'mana_regen',
    'energy_regen'
  ];

  public ownerName: string = 'Guild Hero';

  private static expLog: ExpTransaction[] = [];
  private static expListeners: ((tx: ExpTransaction) => void)[] = [];

  public static recordExpTransaction(tx: ExpTransaction): void {
    ProgressionSystem.expLog.push(tx);
    if (ProgressionSystem.expLog.length > 500) {
      ProgressionSystem.expLog.shift();
    }
    for (const listener of ProgressionSystem.expListeners) {
      try {
        listener(tx);
      } catch (err) {
        console.error('[ProgressionSystem] Error in expListener:', err);
      }
    }
  }

  public static getExpLog(): ExpTransaction[] {
    return [...ProgressionSystem.expLog];
  }

  public static clearExpLog(): void {
    ProgressionSystem.expLog = [];
  }

  public static resetExpListeners(): void {
    ProgressionSystem.expListeners = [];
  }

  public static onExpGranted(cb: (tx: ExpTransaction) => void): () => void {
    ProgressionSystem.expListeners.push(cb);
    return () => {
      const idx = ProgressionSystem.expListeners.indexOf(cb);
      if (idx !== -1) {
        ProgressionSystem.expListeners.splice(idx, 1);
      }
    };
  }

  private proficiencies: Map<string, TrainableStat> = new Map();
  private classLevels: Map<string, number> = new Map();
  private classStats: Map<string, TrainableStat> = new Map();
  private unlockedClasses: Set<string> = new Set();
  private activityCounts: Map<string, number> = new Map();
  private dualWieldUnlocked: boolean = false;
  private classesData: ClassesData;
  private onUnlockCallbacks: ((event: UnlockEvent) => void)[] = [];
  private onSkillDiscoveredCallbacks: ((event: SkillDiscoveredEvent) => void)[] = [];
  private onDualWieldUnlockedCallbacks: (() => void)[] = [];

  constructor(classesData: ClassesData, ownerName: string = 'Guild Hero') {
    this.classesData = classesData;
    this.ownerName = ownerName;
    this.initDefaultProficiencies();
  }

  private initDefaultProficiencies(): void {
    this.proficiencies.set('short_swords', { level: 0, currentExp: 0 });
    this.proficiencies.set('daggers', { level: 0, currentExp: 0 });
    this.proficiencies.set('shields', { level: 0, currentExp: 0 });
    this.proficiencies.set('staff', { level: 0, currentExp: 0 });
    this.proficiencies.set('healing_magic', { level: 0, currentExp: 0 });
    this.proficiencies.set('fire_magic', { level: 0, currentExp: 0 });
    this.proficiencies.set('dual_wielding', { level: 0, currentExp: 0 });
    this.proficiencies.set('construction', { level: 0, currentExp: 0 });
    this.proficiencies.set('alchemy', { level: 0, currentExp: 0 });
    this.proficiencies.set('foraging', { level: 0, currentExp: 0 });
    this.proficiencies.set('woodcutting', { level: 0, currentExp: 0 });
    this.proficiencies.set('mining', { level: 0, currentExp: 0 });
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
    const stat = this.classStats.get(classId);
    if (stat) return stat.level;
    const lvl = this.classLevels.get(classId);
    if (lvl !== undefined) return lvl;
    return this.unlockedClasses.has(classId) ? 1 : 0;
  }

  public getClassStat(classId: string): TrainableStat {
    let stat = this.classStats.get(classId);
    if (!stat) {
      const lvl = this.classLevels.get(classId);
      if (lvl !== undefined && lvl > 0) {
        stat = { level: lvl, currentExp: 0 };
        this.classStats.set(classId, stat);
      } else if (this.unlockedClasses.has(classId)) {
        stat = { level: 1, currentExp: 0 };
        this.classStats.set(classId, stat);
      } else {
        return { level: 0, currentExp: 0 };
      }
    }
    return stat;
  }

  public getAllClassStats(): Map<string, TrainableStat> {
    const copy = new Map<string, TrainableStat>();
    for (const classId of this.unlockedClasses) {
      copy.set(classId, { ...this.getClassStat(classId) });
    }
    return copy;
  }

  public addClassExp(classId: string, amount: number): { levelsGained: number; leveledUp: boolean } {
    if (!this.unlockedClasses.has(classId)) {
      return { levelsGained: 0, leveledUp: false };
    }
    const stat = this.getClassStat(classId);
    const result = LevelingSystem.addExp(stat, amount);
    this.classLevels.set(classId, stat.level);
    const nextExp = LevelingSystem.expForNextLevel(stat.level);
    console.log(`[Progression] +${amount} Class EXP for '${classId}' (${this.ownerName}). Current: Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)`);

    const tx: ExpTransaction = {
      id: `class_${classId}`,
      amount,
      memberName: this.ownerName || 'Guild Hero',
      timestamp: Date.now(),
      currentLevel: stat.level,
      currentExp: stat.currentExp,
      nextExp
    };
    ProgressionSystem.recordExpTransaction(tx);

    if (result.leveledUp) {
      console.log(`[Progression] CLASS LEVEL UP! '${classId}' is now Level ${stat.level}!`);
      this.checkClassUnlocks();
    }
    return result;
  }

  public setClassLevel(classId: string, level: number): void {
    this.unlockedClasses.add(classId);
    const stat = this.getClassStat(classId);
    stat.level = level;
    stat.currentExp = 0;
    this.classLevels.set(classId, level);
    console.log(`[Progression] Set class '${classId}' to Level ${level} (0 EXP) on ${this.ownerName}`);
    this.checkClassUnlocks();
  }

  public getActivityCount(target: string): number {
    return this.activityCounts.get(target) ?? 0;
  }

  public recordActivity(target: string, amount: number = 1): number {
    const current = this.getActivityCount(target);
    const updated = current + amount;
    this.activityCounts.set(target, updated);
    console.log(`[Progression] Activity '${target}' count: ${current} -> ${updated} (+${amount})`);
    this.checkClassUnlocks();
    return updated;
  }

  public isStatRevealed(statId: string): boolean {
    return this.getProficiencyLevel(statId) >= 1;
  }

  public isHiddenSkillRevealed(skillId: string): boolean {
    return this.isStatRevealed(skillId);
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
    console.log(`[Progression] +${amount} EXP for '${id}' (${this.ownerName}). Current: Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)`);

    // Record EXP transaction for debug panel and live tooling
    const tx: ExpTransaction = {
      id,
      amount,
      memberName: this.ownerName || 'Guild Hero',
      timestamp: Date.now(),
      currentLevel: stat.level,
      currentExp: stat.currentExp,
      nextExp
    };
    ProgressionSystem.recordExpTransaction(tx);
    console.log(`[Progression] Recorded tx '${tx.id}': +${tx.amount} EXP for ${tx.memberName}, resulting total: Level ${tx.currentLevel} (${tx.currentExp}/${tx.nextExp} EXP)`);

    if (result.leveledUp) {
      console.log(`[Progression] LEVEL UP! '${id}' is now Level ${stat.level}! (Gained ${result.levelsGained} level(s))`);
      this.checkClassUnlocks();
      this.checkDualWieldUnlock();

      if (oldLevel === 0 && stat.level >= 1) {
        console.log(`[Progression] ✨ SKILL DISCOVERED: '${id}' reached Level ${stat.level} by ${this.ownerName}! ✨`);
        for (const cb of this.onSkillDiscoveredCallbacks) {
          cb({ skillId: id, level: stat.level, memberName: this.ownerName });
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
      } else if (req.type === 'activityCount') {
        const currentCount = this.getActivityCount(req.target);
        return currentCount >= req.value;
      }
      return false;
    });
  }

  public checkClassUnlocks(): void {
    for (const classDef of this.classesData.classes) {
      if (this.evaluateRequirements(classDef)) {
        this.unlockedClasses.add(classDef.id);
        if (!this.classStats.has(classDef.id)) {
          this.classStats.set(classDef.id, { level: 1, currentExp: 0 });
        }
        this.classLevels.set(classDef.id, this.classStats.get(classDef.id)!.level);
        console.log(`[Progression] Class Unlocked: ${classDef.name} (${classDef.id}) for ${this.ownerName}!`);

        for (const cb of this.onUnlockCallbacks) {
          cb({ classDef, memberName: this.ownerName });
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
      } else if (req.type === 'activityCount') {
        return this.getActivityCount(req.target) >= req.value;
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
    classStats?: Record<string, TrainableStat>;
    unlockedClasses: string[];
    activityCounts?: Record<string, number>;
  } {
    const profObj: Record<string, TrainableStat> = {};
    for (const [k, v] of this.proficiencies.entries()) {
      profObj[k] = { level: v.level, currentExp: v.currentExp };
    }
    const classObj: Record<string, number> = {};
    for (const [k, v] of this.classLevels.entries()) {
      classObj[k] = v;
    }
    const classStatsObj: Record<string, TrainableStat> = {};
    for (const [k, v] of this.classStats.entries()) {
      classStatsObj[k] = { level: v.level, currentExp: v.currentExp };
    }
    const actObj: Record<string, number> = {};
    for (const [k, v] of this.activityCounts.entries()) {
      actObj[k] = v;
    }
    return {
      proficiencies: profObj,
      classLevels: classObj,
      classStats: classStatsObj,
      unlockedClasses: Array.from(this.unlockedClasses),
      activityCounts: actObj
    };
  }

  public loadSnapshotData(data: {
    proficiencies: Record<string, number | TrainableStat>;
    classLevels: Record<string, number>;
    classStats?: Record<string, TrainableStat>;
    unlockedClasses: string[];
    activityCounts?: Record<string, number>;
  }): void {
    this.initDefaultProficiencies();
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
    this.classStats.clear();
    if (data.classStats) {
      for (const [k, v] of Object.entries(data.classStats)) {
        this.classStats.set(k, { level: v.level ?? 0, currentExp: v.currentExp ?? 0 });
      }
    } else {
      for (const [k, v] of Object.entries(data.classLevels)) {
        this.classStats.set(k, { level: v, currentExp: 0 });
      }
    }
    this.unlockedClasses.clear();
    for (const c of data.unlockedClasses) {
      this.unlockedClasses.add(c);
      if (!this.classStats.has(c)) {
        const lvl = this.classLevels.get(c) ?? 1;
        this.classStats.set(c, { level: lvl, currentExp: 0 });
      }
    }
    this.activityCounts.clear();
    if (data.activityCounts) {
      for (const [k, v] of Object.entries(data.activityCounts)) {
        this.activityCounts.set(k, v);
      }
    }
    this.checkDualWieldUnlock();
  }
}
