import type { HiddenSkillDef, HiddenSkillTierEffect, WeaponDef } from '../types/game.ts';
import type { ProgressionSystem } from './ProgressionSystem.ts';

export interface CombatContext {
  equippedWeapon?: WeaponDef | null;
  equippedOffhand?: WeaponDef | null;
  hasShield?: boolean;
  shieldBlockBonus?: number;
  shieldMitigationBonus?: number;
  hasMagicProficiency?: boolean;
  inCombat?: boolean;
  attackerDistanceTiles?: number;
  isMeleeAttack?: boolean;
}

export interface AvoidanceResult {
  type: 'evaded' | 'parried' | 'blocked' | 'connected';
  proccedSkillId?: string;
  skillDef?: HiddenSkillDef;
  tierEffect?: HiddenSkillTierEffect;
}

export interface CounterattackResult {
  procced: boolean;
  skillDef?: HiddenSkillDef;
  tierEffect?: HiddenSkillTierEffect;
  damageMultiplier: number;
  canCrit: boolean;
  chainAttack: boolean;
}

export interface DamageMitigationResult {
  procced: boolean;
  skillDef?: HiddenSkillDef;
  tierEffect?: HiddenSkillTierEffect;
  originalDamage: number;
  finalDamage: number;
  mitigatedAmount: number;
}

export interface PassiveRegenResult {
  healthProcced: boolean;
  healthRestored: number;
  manaProcced: boolean;
  energyRestored: number;
}

export class HiddenSkillSystem {
  private static instance: HiddenSkillSystem;
  private skillDefs: Map<string, HiddenSkillDef> = new Map();

  private constructor() {}

  public static getInstance(): HiddenSkillSystem {
    if (!HiddenSkillSystem.instance) {
      HiddenSkillSystem.instance = new HiddenSkillSystem();
    }
    return HiddenSkillSystem.instance;
  }

  public registerSkillDef(def: HiddenSkillDef): void {
    this.skillDefs.set(def.id, def);
  }

  public registerSkillDefs(defs: HiddenSkillDef[]): void {
    for (const def of defs) {
      this.skillDefs.set(def.id, def);
    }
  }

  /**
   * Retrieves definition for any hidden skill by id.
   */
  public getSkillDef(skillId: string): HiddenSkillDef | undefined {
    return this.skillDefs.get(skillId);
  }

  /**
   * Evaluates gear and context eligibility for a given hidden skill definition.
   */
  public evaluateEligibility(skillDef: HiddenSkillDef, context: CombatContext): boolean {
    const elig = skillDef.eligibility;

    // 1. Specific weapon category restriction (e.g. Parry)
    if (elig.weaponCategories && elig.weaponCategories.length > 0) {
      if (!context.equippedWeapon) return false;
      const category = (context.equippedWeapon.category || '').toLowerCase();
      const id = (context.equippedWeapon.id || '').toLowerCase();
      const matches = elig.weaponCategories.some(
        (cat) => cat.toLowerCase() === category || cat.toLowerCase() === id
      );
      if (!matches) return false;
    }

    // 2. Shield requirement (e.g. Block)
    if (elig.shieldRequired) {
      if (!context.hasShield) return false;
    }

    // 3. Melee weapon requirement (e.g. Counterattack)
    if (elig.meleeWeaponRequired) {
      if (!context.equippedWeapon) return false;
      // Melee categories: katana, short_swords, daggers, mace, spears, longswords, greatswords
      const category = (context.equippedWeapon.category || '').toLowerCase();
      const id = (context.equippedWeapon.id || '').toLowerCase();
      const rangedCategories = ['bows', 'bow', 'crossbows', 'crossbow', 'throwing', 'staff', 'magic'];
      if (rangedCategories.includes(category) || rangedCategories.includes(id)) {
        return false;
      }
    }

    // 4. Magic school proficiency requirement (e.g. Mana Regen)
    if (elig.magicProficiencyRequired) {
      if (!context.hasMagicProficiency) return false;
    }

    // 5. Out of combat requirement (e.g. Health Regen below Lv 30)
    if (skillDef.triggerType === 'onOutOfCombatTick') {
      // Handled during passive regen roll based on level tier
    }

    return true;
  }

  /**
   * Calculates exact proc probability:
   * formula: baseProcChance + (currentLevel * procChancePerLevel) + classBonus
   */
  public calculateProcChance(skillDef: HiddenSkillDef, currentLevel: number, classBonus: number = 0): number {
    const chance = skillDef.baseProcChance + (currentLevel * skillDef.procChancePerLevel) + classBonus;
    return Math.max(0, Math.min(1.0, chance));
  }

  /**
   * Retrieves the active tier effect definition for a skill at a given level.
   */
  public getTierEffect(skillDef: HiddenSkillDef, currentLevel: number): HiddenSkillTierEffect | undefined {
    if (currentLevel < 1 || !skillDef.tierEffects) return undefined;
    let activeTier: HiddenSkillTierEffect | undefined;
    for (const tier of skillDef.tierEffects) {
      if (currentLevel >= tier.level) {
        activeTier = tier;
      }
    }
    return activeTier;
  }

  /**
   * Shared generic proc engine:
   * 1. Evaluates eligibility.
   * 2. Calculates proc chance including class head-start bonuses.
   * 3. Rolls random check.
   * 4. On success, awards flat EXP (default +1) to the LevelingSystem curve.
   */
  public rollProc(
    skillDef: HiddenSkillDef,
    context: CombatContext,
    progression: ProgressionSystem
  ): { eligible: boolean; procced: boolean; expAwarded: number; newLevel: number; tierEffect?: HiddenSkillTierEffect } {
    if (!this.evaluateEligibility(skillDef, context)) {
      return { eligible: false, procced: false, expAwarded: 0, newLevel: progression.getProficiencyLevel(skillDef.id) };
    }

    const currentLevel = progression.getProficiencyLevel(skillDef.id);
    let classBonus = progression.getClassHiddenBonus(skillDef.id);
    if (skillDef.id === 'block' && context.shieldBlockBonus) {
      classBonus += context.shieldBlockBonus;
    }
    const procChance = this.calculateProcChance(skillDef, currentLevel, classBonus);

    const roll = Math.random();
    const procced = roll < procChance;

    if (procced) {
      progression.addProficiencyExp(skillDef.id, skillDef.expPerProc);
    }

    const updatedLevel = progression.getProficiencyLevel(skillDef.id);
    const tierEffect = this.getTierEffect(skillDef, updatedLevel);

    return {
      eligible: true,
      procced,
      expAwarded: procced ? skillDef.expPerProc : 0,
      newLevel: updatedLevel,
      tierEffect
    };
  }

  /**
   * STRICT SHORT-CIRCUITING AVOIDANCE CHAIN:
   * Order: Evasion -> Parry -> Block.
   * Short-circuits immediately on first success; subsequent checks do NOT execute.
   */
  public resolveIncomingAttack(context: CombatContext, progression: ProgressionSystem): AvoidanceResult {
    // 1. Evasion (rolls against any incoming attack, armor/weapon agnostic)
    const evasionDef = this.getSkillDef('evasion');
    if (evasionDef) {
      const evasionResult = this.rollProc(evasionDef, context, progression);
      if (evasionResult.procced) {
        return {
          type: 'evaded',
          proccedSkillId: 'evasion',
          skillDef: evasionDef,
          tierEffect: evasionResult.tierEffect
        };
      }
    }

    // 2. Parry (rolls when attacked in melee, requires parry-capable weapon)
    if (context.isMeleeAttack !== false) {
      const parryDef = this.getSkillDef('parry');
      if (parryDef) {
        const parryResult = this.rollProc(parryDef, context, progression);
        if (parryResult.procced) {
          return {
            type: 'parried',
            proccedSkillId: 'parry',
            skillDef: parryDef,
            tierEffect: parryResult.tierEffect
          };
        }
      }
    }

    // 3. Block (rolls when attacked, requires shield equipped)
    const blockDef = this.getSkillDef('block');
    if (blockDef) {
      const blockResult = this.rollProc(blockDef, context, progression);
      if (blockResult.procced) {
        return {
          type: 'blocked',
          proccedSkillId: 'block',
          skillDef: blockDef,
          tierEffect: blockResult.tierEffect
        };
      }
    }

    // 4. None avoided: attack connects
    return { type: 'connected' };
  }

  /**
   * Rolls Counterattack upon a successful dodge, parry, or block.
   * Invoked strictly once per incoming attack avoidance.
   */
  public resolveCounterattack(context: CombatContext, progression: ProgressionSystem): CounterattackResult {
    const counterDef = this.getSkillDef('counterattack');
    if (!counterDef) {
      return { procced: false, damageMultiplier: 0, canCrit: false, chainAttack: false };
    }

    const result = this.rollProc(counterDef, context, progression);
    if (!result.procced) {
      return { procced: false, damageMultiplier: 0, canCrit: false, chainAttack: false };
    }

    const tier = result.tierEffect;
    return {
      procced: true,
      skillDef: counterDef,
      tierEffect: tier,
      damageMultiplier: tier?.counterDamageMultiplier ?? 0.75,
      canCrit: tier?.canCrit ?? false,
      chainAttack: tier?.chainAttack ?? false
    };
  }

  /**
   * Evaluates Resilience proc and applies damage reduction on connected attacks.
   */
  public resolveDamageTaken(
    context: CombatContext,
    progression: ProgressionSystem,
    incomingDamage: number
  ): DamageMitigationResult {
    const resilienceDef = this.getSkillDef('resilience');
    let procced = false;
    let tierEffect: HiddenSkillTierEffect | undefined;

    if (resilienceDef) {
      const rollRes = this.rollProc(resilienceDef, context, progression);
      procced = rollRes.procced;
      tierEffect = rollRes.tierEffect;
    }

    // Calculate damage mitigation from Resilience level
    const resLevel = progression.getProficiencyLevel('resilience');
    const activeTier = resilienceDef ? this.getTierEffect(resilienceDef, resLevel) : undefined;
    const reductionPercent = activeTier?.damageReduction ?? 0;

    let finalDamage = incomingDamage;
    if (context.hasShield && context.shieldMitigationBonus && context.shieldMitigationBonus > 0) {
      finalDamage = Math.max(1, finalDamage - context.shieldMitigationBonus);
    }
    if (reductionPercent > 0) {
      finalDamage = Math.max(1, Math.round(finalDamage * (1 - reductionPercent)));
    }

    const mitigatedAmount = Math.max(0, incomingDamage - finalDamage);

    return {
      procced,
      skillDef: resilienceDef,
      tierEffect: activeTier || tierEffect,
      originalDamage: incomingDamage,
      finalDamage,
      mitigatedAmount
    };
  }

  /**
   * Passive tick evaluator for Health Regen & Mana Regen.
   */
  public resolvePassiveRegen(context: CombatContext, progression: ProgressionSystem): PassiveRegenResult {
    let healthProcced = false;
    let healthRestored = 0;
    let manaProcced = false;
    let energyRestored = 0;

    const hpLevel = progression.getProficiencyLevel('health_regen');
    const hpDef = this.getSkillDef('health_regen');
    if (hpDef) {
      const hpTier = this.getTierEffect(hpDef, hpLevel);
      const isEligibleByCombat = !context.inCombat || (hpTier && hpTier.inCombat);
      if (isEligibleByCombat) {
        const hpRes = this.rollProc(hpDef, context, progression);
        if (hpRes.procced) {
          healthProcced = true;
          healthRestored = hpRes.tierEffect?.healAmount ?? (hpLevel >= 1 ? 1 : 0);
        }
      }
    }

    const manaLevel = progression.getProficiencyLevel('mana_regen');
    const manaDef = this.getSkillDef('mana_regen');
    if (manaDef) {
      const manaRes = this.rollProc(manaDef, context, progression);
      if (manaRes.procced) {
        manaProcced = true;
        energyRestored = manaRes.tierEffect?.energyAmount ?? (manaLevel >= 1 ? 2 : 0);
      }
    }

    return {
      healthProcced,
      healthRestored,
      manaProcced,
      energyRestored
    };
  }
}
