import assert from 'node:assert/strict';
import { HiddenSkillSystem } from '../src/systems/HiddenSkillSystem.ts';
import type { CombatContext } from '../src/systems/HiddenSkillSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import type { ClassesData, HiddenSkillDef, WeaponDef } from '../src/types/game.ts';

console.log('--- RUNNING HIDDEN DEFENSIVE & REGEN SKILLS UNIT TESTS ---');

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist',
      hiddenSkillBonuses: {
        counterattack: 0.05
      }
    },
    {
      id: 'guardian',
      name: 'Guardian',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'shields', value: 10 }],
      fantasy: 'Learning to hold the line',
      hiddenSkillBonuses: {
        block: 0.05
      }
    }
  ]
};

const shortSwordsWeapon: WeaponDef = {
  id: 'short_swords',
  name: 'Short Swords',
  category: 'short_swords',
  twoHanded: false,
  attackIntervalMs: 1000,
  baseDamage: 5
};

const bowWeapon: WeaponDef = {
  id: 'hunting_bow',
  name: 'Hunting Bow',
  category: 'bows',
  twoHanded: true,
  attackIntervalMs: 1500,
  baseDamage: 6
};

const testHiddenSkillDefs: Record<string, HiddenSkillDef> = {
  evasion: {
    id: 'evasion',
    name: 'Evasion',
    triggerType: 'onIncomingAttack',
    eligibility: { gear: 'none' },
    baseProcChance: 0.05,
    procChancePerLevel: 0.005,
    expPerProc: 1,
    description: 'Dodge attacks',
    tierEffects: [
      { level: 1, description: '3% dodge', dodgeChance: 0.03 },
      { level: 30, description: '8% dodge', dodgeChance: 0.08 }
    ]
  },
  parry: {
    id: 'parry',
    name: 'Parry',
    triggerType: 'onMeleeAttacked',
    eligibility: { weaponCategories: ['katana', 'short_swords', 'daggers', 'mace', 'spears'] },
    baseProcChance: 0.05,
    procChancePerLevel: 0.005,
    expPerProc: 1,
    description: 'Parry melee attacks',
    tierEffects: [
      { level: 1, description: 'Deflect melee attacks', deflectDamage: true }
    ]
  },
  block: {
    id: 'block',
    name: 'Block',
    triggerType: 'onShieldAttacked',
    eligibility: { shieldRequired: true },
    baseProcChance: 0.05,
    procChancePerLevel: 0.005,
    expPerProc: 1,
    description: 'Block attacks',
    tierEffects: [
      { level: 1, description: 'Chip damage reduction', blockDamageReduction: 0.30 }
    ]
  },
  counterattack: {
    id: 'counterattack',
    name: 'Counterattack',
    triggerType: 'onDodgeParryBlock',
    eligibility: { meleeWeaponRequired: true },
    baseProcChance: 0.05,
    procChancePerLevel: 0.005,
    expPerProc: 1,
    description: 'Counterattack',
    tierEffects: [
      { level: 1, description: 'Auto-counter (75% damage)', counterDamageMultiplier: 0.75 },
      { level: 30, description: 'Auto-counter (100% damage)', counterDamageMultiplier: 1.0 }
    ]
  },
  resilience: {
    id: 'resilience',
    name: 'Resilience',
    triggerType: 'onDamageTaken',
    eligibility: { gear: 'none' },
    baseProcChance: 0.08,
    procChancePerLevel: 0.005,
    expPerProc: 1,
    description: 'Mitigate damage',
    tierEffects: [
      { level: 1, description: '2% damage reduction', damageReduction: 0.02 },
      { level: 30, description: '5% damage reduction', damageReduction: 0.05 }
    ]
  },
  health_regen: {
    id: 'health_regen',
    name: 'Health Regen',
    triggerType: 'onOutOfCombatTick',
    eligibility: { gear: 'none' },
    baseProcChance: 0.10,
    procChancePerLevel: 0.01,
    expPerProc: 1,
    description: 'Regenerate health',
    tierEffects: [
      { level: 1, description: 'Passive out-of-combat heal', healAmount: 1, inCombat: false }
    ]
  },
  mana_regen: {
    id: 'mana_regen',
    name: 'Mana Regen',
    triggerType: 'onManaTick',
    eligibility: { magicProficiencyRequired: true },
    baseProcChance: 0.10,
    procChancePerLevel: 0.01,
    expPerProc: 1,
    description: 'Regenerate mana',
    tierEffects: [
      { level: 1, description: 'Passive mana regen', energyAmount: 2, inCombat: false }
    ]
  }
};

const engine = HiddenSkillSystem.getInstance();
engine.registerSkillDefs(Object.values(testHiddenSkillDefs));

// ---------------------------------------------------------------------------
// TEST 1: Generic Engine & Class Head-Start (Exact Concrete Numbers)
// ---------------------------------------------------------------------------
{
  const progression = new ProgressionSystem(mockClassesData);
  const counterDef = testHiddenSkillDefs.counterattack;

  // Base case without Fencer: Level 0 Counterattack
  const baseChance = engine.calculateProcChance(counterDef, 0, progression.getClassHiddenBonus('counterattack'));
  assert.equal(baseChance, 0.05, 'Base proc chance for Counterattack at Level 0 must be exactly 0.05 (5%)');

  // Scaling with Level 10: 0.05 + 10 * 0.005 = 0.10 (10%)
  const lv10Chance = engine.calculateProcChance(counterDef, 10, 0);
  assert.equal(lv10Chance, 0.10, 'Level 10 Counterattack proc chance must be exactly 0.10 (10%)');

  // Unlock Fencer (Level 10 Short Swords unlocks Fencer)
  progression.addProficiencyExp('short_swords', 680); // Level 10 Short Swords
  assert.ok(progression.isClassUnlocked('fencer'), 'Fencer must be unlocked');

  const fencerBonus = progression.getClassHiddenBonus('counterattack');
  assert.equal(fencerBonus, 0.05, 'Fencer must grant exactly +0.05 (+5%) flat proc bonus to Counterattack');

  const boostedChance = engine.calculateProcChance(counterDef, 0, fencerBonus);
  assert.equal(boostedChance, 0.10, 'Level 0 Counterattack with Fencer must be exactly 0.10 (10% vs 5% base)');

  console.log('✔ Test 1 passed: Proc chance calculations and Fencer class head-start verified (5% -> 10%)');
}

// ---------------------------------------------------------------------------
// TEST 2: Curve Integration (+1 EXP per proc on LevelingSystem Curve)
// ---------------------------------------------------------------------------
{
  const progression = new ProgressionSystem(mockClassesData);
  const expNeededLv1 = LevelingSystem.expForNextLevel(0);
  assert.equal(expNeededLv1, 50, 'Level 0 -> 1 requires exactly 50 EXP');

  // Award 49 procs of 1 EXP each
  for (let i = 0; i < 49; i++) {
    progression.addProficiencyExp('parry', 1);
  }

  const stat49 = progression.getProficiencyStat('parry');
  assert.equal(stat49.level, 0, 'Parry must strictly remain Level 0 after 49 EXP');
  assert.equal(stat49.currentExp, 49, 'Parry currentExp must be 49');

  // 50th proc: triggers Level 1
  const result50 = progression.addProficiencyExp('parry', 1);
  const stat50 = progression.getProficiencyStat('parry');
  assert.equal(result50.leveledUp, true, '50th proc must level up');
  assert.equal(stat50.level, 1, 'Parry must reach Level 1 on 50th EXP');
  assert.equal(stat50.currentExp, 0, 'Parry currentExp must reset to 0 upon reaching Level 1');
  assert.equal(LevelingSystem.expForNextLevel(1), 54, 'Level 1 -> 2 requires 54 EXP');

  console.log('✔ Test 2 passed: Procs award +1 EXP and strictly follow the LevelingSystem curve');
}

// ---------------------------------------------------------------------------
// TEST 3: Reveal-at-Level-1 Invariant (Invisible at 49, Revealed strictly at 50)
// ---------------------------------------------------------------------------
{
  const progression = new ProgressionSystem(mockClassesData);
  let discoveryFiredCount = 0;
  let discoveredSkillName = '';

  progression.onSkillDiscovered((event) => {
    discoveryFiredCount++;
    discoveredSkillName = event.skillId;
  });

  // At 0 EXP: hidden
  assert.equal(progression.isHiddenSkillRevealed('resilience'), false);

  // At 49 EXP: STILL HIDDEN (zero presence in UI)
  for (let i = 0; i < 49; i++) {
    progression.addProficiencyExp('resilience', 1);
  }
  assert.equal(progression.isHiddenSkillRevealed('resilience'), false, 'Skill must NOT be revealed at 49/50 EXP');
  assert.equal(discoveryFiredCount, 0, 'Discovery event must NOT fire prior to Level 1');

  // At 50 EXP: REVEAL FIRES
  progression.addProficiencyExp('resilience', 1);
  assert.equal(progression.isHiddenSkillRevealed('resilience'), true, 'Skill must be revealed at Level 1 (50 EXP)');
  assert.equal(discoveryFiredCount, 1, 'Discovery event must fire exactly once at Level 1');
  assert.equal(discoveredSkillName, 'resilience', 'Discovered skill must be resilience');

  // Level 1 -> 2 advancement: Discovery event should NOT fire again
  progression.addProficiencyExp('resilience', 54);
  assert.equal(progression.getProficiencyLevel('resilience'), 2);
  assert.equal(discoveryFiredCount, 1, 'Discovery event must NOT fire on subsequent level-ups past Level 1');

  console.log('✔ Test 3 passed: Reveal-at-Level-1 invariant verified (hidden at 49, revealed strictly at 50)');
}

// ---------------------------------------------------------------------------
// TEST 4: Gear & Context Gating Logic (Parry, Block, Counter, Mana Regen)
// ---------------------------------------------------------------------------
{
  // 4a. Parry: eligible with Short Swords, ineligible with Bow
  const parryDef = testHiddenSkillDefs.parry;
  assert.equal(engine.evaluateEligibility(parryDef, { equippedWeapon: shortSwordsWeapon }), true, 'Parry must be eligible with Short Swords');
  assert.equal(engine.evaluateEligibility(parryDef, { equippedWeapon: bowWeapon }), false, 'Parry must be ineligible with Bow');
  assert.equal(engine.evaluateEligibility(parryDef, { equippedWeapon: null }), false, 'Parry must be ineligible without weapon');

  // 4b. Block: strictly blocked without Shield (pending Shield item)
  const blockDef = testHiddenSkillDefs.block;
  assert.equal(engine.evaluateEligibility(blockDef, { hasShield: false }), false, 'Block must NEVER be eligible without a Shield');
  assert.equal(engine.evaluateEligibility(blockDef, { hasShield: undefined }), false, 'Block must NEVER be eligible when hasShield is undefined');
  assert.equal(engine.evaluateEligibility(blockDef, { hasShield: true }), true, 'Block becomes eligible when a Shield is equipped');

  // 4c. Counterattack: requires melee weapon
  const counterDef = testHiddenSkillDefs.counterattack;
  assert.equal(engine.evaluateEligibility(counterDef, { equippedWeapon: shortSwordsWeapon }), true, 'Counterattack eligible with melee');
  assert.equal(engine.evaluateEligibility(counterDef, { equippedWeapon: bowWeapon }), false, 'Counterattack ineligible with Bow');

  // 4d. Mana Regen: strictly blocked without magic school proficiency
  const manaDef = testHiddenSkillDefs.mana_regen;
  assert.equal(engine.evaluateEligibility(manaDef, { hasMagicProficiency: false }), false, 'Mana Regen must NEVER roll without magic proficiency');
  assert.equal(engine.evaluateEligibility(manaDef, { hasMagicProficiency: true }), true, 'Mana Regen eligible when magic proficiency exists');

  console.log('✔ Test 4 passed: Strict gating logic verified for Parry, Block, Counterattack, and Mana Regen');
}

// ---------------------------------------------------------------------------
// TEST 5: Evasion Defender Roll against Deterministic Attack
// ---------------------------------------------------------------------------
{
  const evasionDef = testHiddenSkillDefs.evasion;
  assert.equal(engine.evaluateEligibility(evasionDef, {}), true, 'Evasion is gear-agnostic');

  // Verify that an incoming attack context rolls Evasion on defender's side
  const context: CombatContext = {
    equippedWeapon: shortSwordsWeapon,
    isMeleeAttack: true,
    inCombat: true
  };

  // Set high proc chance for test verification
  const highProcEvasion: HiddenSkillDef = {
    ...evasionDef,
    baseProcChance: 1.0 // 100% proc for test
  };

  const progression = new ProgressionSystem(mockClassesData);
  const result = engine.rollProc(highProcEvasion, context, progression);
  assert.equal(result.procced, true, 'Evasion procs on defender side');
  assert.equal(result.expAwarded, 1, 'Evasion gains +1 EXP on proc');
  assert.equal(progression.getProficiencyStat('evasion').currentExp, 1, 'Evasion recorded in progression');

  console.log('✔ Test 5 passed: Evasion defender-side roll verified against deterministic incoming attacks');
}

// ---------------------------------------------------------------------------
// TEST 6: Tier Effects (Resilience Mitigation, Counterattack Damage)
// ---------------------------------------------------------------------------
{
  const progression = new ProgressionSystem(mockClassesData);
  const resDef = testHiddenSkillDefs.resilience;

  // Level 0 Resilience: no mitigation
  const ctx: CombatContext = {};
  const mit0 = engine.resolveDamageTaken(ctx, progression, 20);
  assert.equal(mit0.finalDamage, 20, 'Level 0 Resilience offers 0% damage reduction');
  assert.equal(mit0.mitigatedAmount, 0);

  // Level 1 Resilience: 2% damage reduction
  progression.addProficiencyExp('resilience', 50); // Level 1
  assert.equal(progression.getProficiencyLevel('resilience'), 1);

  // 50 incoming damage with 2% reduction: 50 * 0.98 = 49
  const mit1 = engine.resolveDamageTaken(ctx, progression, 50);
  assert.equal(mit1.finalDamage, 49, 'Level 1 Resilience reduces 50 damage to 49 (2% reduction)');
  assert.equal(mit1.mitigatedAmount, 1);

  // Level 30 Resilience: 5% damage reduction
  // Advance to Level 30:
  for (let lv = 1; lv < 30; lv++) {
    const req = LevelingSystem.expForNextLevel(lv);
    progression.addProficiencyExp('resilience', req);
  }
  assert.equal(progression.getProficiencyLevel('resilience'), 30);

  // 100 incoming damage with 5% reduction: 100 * 0.95 = 95
  const mit30 = engine.resolveDamageTaken(ctx, progression, 100);
  assert.equal(mit30.finalDamage, 95, 'Level 30 Resilience reduces 100 damage to 95 (5% reduction)');
  assert.equal(mit30.mitigatedAmount, 5);

  console.log('✔ Test 6 passed: Resilience damage mitigation tier effects correctly scale with level');
}

// ---------------------------------------------------------------------------
// TEST 7: Short-Circuiting Avoidance Chain & Single Counterattack Invariant
// ---------------------------------------------------------------------------
{
  const progression = new ProgressionSystem(mockClassesData);
  progression.addProficiencyExp('evasion', 50); // Lv 1 Evasion
  progression.addProficiencyExp('parry', 50);   // Lv 1 Parry

  // Setup context: Short Swords equipped, Melee attack
  const context: CombatContext = {
    equippedWeapon: shortSwordsWeapon,
    isMeleeAttack: true,
    hasShield: false,
    inCombat: true
  };

  // Monkey-patch rollProc to track calls and simulate Evasion succeeding
  let evasionRollCount = 0;
  let parryRollCount = 0;
  let blockRollCount = 0;

  const originalRollProc = engine.rollProc.bind(engine);
  engine.rollProc = (skillDef, ctx, prog) => {
    if (skillDef.id === 'evasion') {
      evasionRollCount++;
      return { eligible: true, procced: true, expAwarded: 1, newLevel: 1, tierEffect: skillDef.tierEffects[0] };
    }
    if (skillDef.id === 'parry') {
      parryRollCount++;
      return { eligible: true, procced: true, expAwarded: 1, newLevel: 1, tierEffect: skillDef.tierEffects[0] };
    }
    if (skillDef.id === 'block') {
      blockRollCount++;
      return { eligible: true, procced: true, expAwarded: 1, newLevel: 1, tierEffect: skillDef.tierEffects[0] };
    }
    return originalRollProc(skillDef, ctx, prog);
  };

  // Run the avoidance chain with Evasion succeeding
  const avoidanceResult = engine.resolveIncomingAttack(context, progression);

  // Invariant 1: First success wins
  assert.equal(avoidanceResult.type, 'evaded', 'Evasion must win when it procs');
  assert.equal(evasionRollCount, 1, 'Evasion rolled once');

  // Invariant 2: Subsequent avoidance checks in the chain are strictly NOT executed
  assert.equal(parryRollCount, 0, 'Parry must be skipped when Evasion succeeds');
  assert.equal(blockRollCount, 0, 'Block must be skipped when Evasion succeeds');

  // Invariant 3: Counterattack triggered strictly once per avoided incoming attack
  let counterRollCount = 0;
  engine.rollProc = (skillDef, ctx, prog) => {
    if (skillDef.id === 'counterattack') {
      counterRollCount++;
      return { eligible: true, procced: true, expAwarded: 1, newLevel: 1, tierEffect: skillDef.tierEffects[0] };
    }
    return originalRollProc(skillDef, ctx, prog);
  };

  if (avoidanceResult.type === 'evaded') {
    const counterRes = engine.resolveCounterattack(context, progression);
    assert.equal(counterRes.procced, true);
  }

  assert.equal(counterRollCount, 1, 'Counterattack must roll exactly once per avoided attack');

  // Restore original rollProc
  engine.rollProc = originalRollProc;

  console.log('✔ Test 7 passed: Short-circuiting avoidance chain and single Counterattack invariant verified');
}

console.log('\nALL 7 HIDDEN DEFENSIVE & REGEN SKILLS TESTS PASSED SUCCESSFULLY! 🎉');
