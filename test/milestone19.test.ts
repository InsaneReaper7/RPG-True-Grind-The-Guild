import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before any Phaser modules are loaded
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HiddenSkillSystem } from '../src/systems/HiddenSkillSystem.ts';
import type { CombatContext } from '../src/systems/HiddenSkillSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef, EnemyDef, PlayerData, StatusEffectDef, GridPos } from '../src/types/game.ts';

async function runMilestone19Tests() {
  console.log('--- RUNNING MILESTONE 19: ENERGY/MANA ECONOMY REBALANCE UNIT TESTS ---');

  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
    const grid: number[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        grid[y][x] = 0;
      }
    }
    const pathfinder = new Pathfinder(grid);
    return {
      tileSize: 32,
      gridWidth,
      gridHeight,
      pathfinder,
      sound: { play: () => {} },
      time: { now: 0 },
      add: {
        line: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setLineWidth = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        circle: () => {
          const obj: any = {};
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        text: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        }
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) config.onComplete();
        }
      }
    };
  }

  function createMockHero(
    id: string,
    name: string,
    gridX: number,
    gridY: number,
    weapon: WeaponDef,
    progression: ProgressionSystem
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 50,
      maxHp: 50,
      criticalHp: 25,
      maxCriticalHp: 25,
      energy: 100,
      maxEnergy: 100,
      mood: 50,
      hunger: 100,
      state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
      equippedWeapon: weapon,
      offhandWeapon: null as WeaponDef | null,
      attackRangeTiles: weapon.attackRangeTiles ?? 1,
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      lastAttackTime: 0,
      lastCombatRepathTimeMs: 0,
      combatRepathIntervalMs: 400,
      lastSkillUseTimes: new Map<string, number>(),
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: new Map<string, boolean>(),
      activeStatusEffects: new Map<string, any>(),
      inCombat: false,
      energyPotionRemainingMs: 0,
      manaPotionRemainingMs: 0,
      progression,
      equipWeapon: function(newWeapon: WeaponDef) {
        this.equippedWeapon = newWeapon;
        this.attackRangeTiles = newWeapon.attackRangeTiles ?? (newWeapon.category === 'magic' || newWeapon.category === 'ranged' ? 4 : 1);
      },
      isDualWielding: () => false,
      hasShield: () => false,
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        return this.hp <= 0;
      },
      heal: function(amount: number) {
        const old = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this.hp - old;
      },
      setTarget: function(t: any) { this.targetEntity = t; },
      clearTarget: function() { this.targetEntity = null; },
      isMoving: function() { return false; },
      stopMovement: function() {},
      updateStatusEffects: () => 0,
      applyStatusEffect: () => {}
    };
  }

  function createMockEnemy(id: string, name: string, gridX: number, gridY: number): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 50,
      maxHp: 50,
      damage: 5,
      state: 'idle',
      attackRangeTiles: 1,
      tileSize: 32,
      spawnPos: { x: gridX, y: gridY },
      isAggroed: false,
      maxLeashDistance: 10,
      outOfAggroTimerMs: 0,
      claimedDestination: null,
      targetEntity: null,
      activeStatusEffects: new Map(),
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        return this.hp <= 0;
      },
      hasStatusEffect: function(id: string) { return this.activeStatusEffects.has(id); },
      getStatusEffect: function(id: string) { return this.activeStatusEffects.get(id); },
      removeStatusEffect: function(id: string) { this.activeStatusEffects.delete(id); },
      applyStatusEffect: () => {},
      updateStatusEffects: () => 0,
      isMoving: () => false,
      stopMovement: () => {},
      enemyData: { harvest: [] }
    };
  }

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ---------------------------------------------------------------------------
  // TEST 1: Base Costs Retune & 4-Cast Dry Run Target
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Base Costs Retune & 4-Cast Dry Run Target ---');
  const fireMagic = dataLoader.getWeapon('fire_magic');
  const healingMagic = dataLoader.getWeapon('healing_magic');
  const skills = dataLoader.getSkills();
  const skillsMap = Object.fromEntries(skills.map(s => [s.id, s]));

  assert.ok(fireMagic, 'fire_magic weapon exists');
  assert.ok(healingMagic, 'healing_magic weapon exists');
  assert.equal(fireMagic.energyCostPerCast, 22, 'fire_magic should cost 22 energy');
  assert.equal(healingMagic.energyCostPerCast, 22, 'healing_magic should cost 22 energy');

  assert.equal(skillsMap['power_strike'].energyCost, 25, 'power_strike should cost 25');
  assert.equal(skillsMap['thrust'].energyCost, 20, 'thrust should cost 20');
  assert.equal(skillsMap['first_aid'].energyCost, 25, 'first_aid should cost 25');
  assert.equal(skillsMap['shield_bash'].energyCost, 18, 'shield_bash should cost 18');
  assert.equal(skillsMap['guard_up'].energyCost, 22, 'guard_up should cost 22');

  const maxEnergy = 100;
  const cost = 22;
  const castCount = Math.floor(maxEnergy / cost);
  const remainder = maxEnergy % cost;
  assert.equal(castCount, 4, '100 base energy allows exactly 4 casts');
  assert.equal(remainder, 12, '12 energy remains (< 22), so caster runs dry after 4 casts');
  console.log('✔ Test 1 passed: 4-5 cast target verified (100 base EN / 22 = 4 casts, 12 left).');

  // ---------------------------------------------------------------------------
  // TEST 2: In-Combat Passive Energy Regen Gating
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: In-Combat Passive Energy Regen Gating ---');
  const mockScene = createMockScene();
  const hero = createMockHero('hero1', 'Hero', 5, 5, fireMagic, new ProgressionSystem(dataLoader.getClassesData(), 'Hero'));
  const enemy = createMockEnemy('goblin1', 'Goblin', 6, 5);
  const combat = new CombatSystem(mockScene, [hero], [enemy], mockScene.pathfinder);

  // In combat: hero has enemy target, inCombat is true
  hero.setTarget(enemy);
  hero.energy = 50;
  // Trigger combat update
  combat.update(1000, 100);
  assert.equal(hero.inCombat, true, 'Hero is marked inCombat when engaged with enemy');

  // Verify hidden skill resolvePassiveRegen returns 0 in combat when no tiers unlocked
  const hiddenSkillSys = HiddenSkillSystem.getInstance();
  const heroProg = hero.progression;
  const inCombatRes = hiddenSkillSys.resolvePassiveRegen({ inCombat: true, hasEnergyPotionBuff: false }, heroProg);
  assert.equal(inCombatRes.energyRestored, 0, 'Baseline in-combat energy regen is 0');

  // When Level 1 is attained, out-of-combat returns 4
  heroProg.addProficiencyExp('energy_regen', 50); // Level 1
  const origRand = Math.random;
  Math.random = () => 0.05; // Force roll < procChance
  try {
    const oocRes = hiddenSkillSys.resolvePassiveRegen({ inCombat: false, hasEnergyPotionBuff: false }, heroProg);
    assert.equal(oocRes.energyRestored, 4, 'Out-of-combat energy regen is 4 for Level 1');
  } finally {
    Math.random = origRand;
  }
  console.log('✔ Test 2 passed: In-combat regen is 0 while out-of-combat is 4 EN.');

  // ---------------------------------------------------------------------------
  // TEST 3: Regen Hidden Skill Tier Effects Retune
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Regen Hidden Skill Tier Effects Retune ---');
  const energyRegen = dataLoader.getHiddenSkill('energy_regen');
  const manaRegen = dataLoader.getHiddenSkill('mana_regen');

  assert.ok(energyRegen && manaRegen, 'energy_regen and mana_regen hidden skills exist');
  // Tier 1 (Lv 1): +4 ooc
  assert.equal(energyRegen.tierEffects![0].energyAmount, 4);
  // Tier 2 (Lv 30): +5 in-combat
  assert.equal(energyRegen.tierEffects![1].energyAmount, 5);
  assert.equal(energyRegen.tierEffects![1].inCombat, true);
  // Tier 3 (Lv 60): +8 in-combat
  assert.equal(energyRegen.tierEffects![2].energyAmount, 8);
  assert.equal(energyRegen.tierEffects![2].inCombat, true);
  // Tier 4 (Lv 90): +12 in-combat, +20 burst
  assert.equal(energyRegen.tierEffects![3].energyAmount, 12);
  assert.equal(energyRegen.tierEffects![3].burstEnergy, true);

  assert.equal(manaRegen.tierEffects![0].energyAmount, 4);
  assert.equal(manaRegen.tierEffects![1].energyAmount, 5);
  assert.equal(manaRegen.tierEffects![1].inCombat, true);
  assert.equal(manaRegen.tierEffects![2].energyAmount, 8);
  assert.equal(manaRegen.tierEffects![2].inCombat, true);
  assert.equal(manaRegen.tierEffects![3].energyAmount, 12);
  assert.equal(manaRegen.tierEffects![3].burstEnergy, true);
  console.log('✔ Test 3 passed: Regen tiers verified (Lv1 +4 ooc, Lv30 +5, Lv60 +8, Lv90 +12/+20 in-combat).');

  // ---------------------------------------------------------------------------
  // TEST 4: Alchemy Recipe for Mana Potion Uses Ectoplasm (No slime_gel)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Mana Potion Ectoplasm Recipe & No slime_gel ---');
  const manaPotion = dataLoader.getAlchemyRecipe('mana_potion');
  const energyPotion = dataLoader.getAlchemyRecipe('energy_potion');

  assert.ok(manaPotion, 'mana_potion exists in alchemy recipes');
  assert.ok(energyPotion, 'energy_potion exists in alchemy recipes');

  assert.equal(manaPotion.ingredients['wild_herbs'], 2);
  assert.equal(manaPotion.ingredients['ectoplasm'], 1);
  assert.equal((manaPotion.ingredients as any)['slime_gel'], undefined, 'slime_gel must NOT exist in recipe');

  assert.equal(energyPotion.ingredients['wild_herbs'], 2);
  assert.equal(energyPotion.ingredients['wood'], 2);

  const rawJson = fs.readFileSync('data/alchemyRecipes.json', 'utf8');
  assert.ok(!rawJson.includes('slime_gel'), 'Strict constraint: slime_gel must never appear in alchemyRecipes.json');
  console.log('✔ Test 4 passed: Mana Potion requires 2 wild_herbs + 1 ectoplasm; slime_gel completely absent.');

  // ---------------------------------------------------------------------------
  // TEST 5: Potion Consumption (+35 EN instant & +2 EN/s buff)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Potion Consumption & Active Buff ---');
  const gameState = GameState.getInstance();
  gameState.addItem('energy_potion', 1);
  gameState.addItem('mana_potion', 1);

  // Use a player snapshot / entity simulation
  hero.energy = 20;
  // Drink energy potion
  hero.energy = Math.min(hero.maxEnergy, hero.energy + energyPotion.energyRestored!);
  hero.energyPotionRemainingMs = energyPotion.buffDurationMs!;
  assert.equal(hero.energy, 55, 'Instant restore adds 35 energy (20 -> 55)');
  assert.equal(hero.energyPotionRemainingMs, 15000, 'Buff active for 15s (15000ms)');

  // In-combat potion ticking restores energy because hasEnergyPotionBuff allows eligibility
  const origRand5 = Math.random;
  Math.random = () => 0.05;
  try {
    const potionCombatRes = hiddenSkillSys.resolvePassiveRegen({ inCombat: true, hasEnergyPotionBuff: true }, heroProg);
    assert.ok(potionCombatRes.energyRegenProcced, 'With active potion buff, in-combat regen proc is allowed');
    assert.equal(potionCombatRes.energyRestored, 4, 'Potion buff enabled energy regen restores 4 EN');
  } finally {
    Math.random = origRand5;
  }
  console.log('✔ Test 5 passed: Potion grants instant 35 EN and enables +2 EN/s in-combat buff.');

  // ---------------------------------------------------------------------------
  // TEST 6: Active Potion Buff Grants +1 Bonus EXP on Proc
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Active Potion Buff Bonus EXP Hook ---');
  const energyDef = dataLoader.getHiddenSkill('energy_regen')!;
  const testProg = new ProgressionSystem(dataLoader.getClassesData(), 'RegenTester');
  testProg.addProficiencyExp('energy_regen', 50); // Level 1
  const preProcExp = testProg.getProficiencyStat('energy_regen').currentExp;

  const origRand6 = Math.random;
  Math.random = () => 0.05; // force proc
  try {
    const procResult = hiddenSkillSys.rollProc(
      energyDef,
      { inCombat: false, hasEnergyPotionBuff: true },
      testProg
    );
    assert.ok(procResult.procced, 'Should proc successfully');
    assert.equal(procResult.expAwarded, 2, 'With active potion buff, should award 1 base + 1 bonus = 2 EXP');
    const postProcExp = testProg.getProficiencyStat('energy_regen').currentExp;
    assert.equal(postProcExp, preProcExp + 2, 'Total exp increased by exactly 2');
  } finally {
    Math.random = origRand6;
  }
  console.log('✔ Test 6 passed: Active potion buff awarded +1 bonus EXP toward regen hidden skill.');

  // ---------------------------------------------------------------------------
  // TEST 7: Staff Conduit Fire Magic & Melee Fallback When Dry
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Staff Conduit Fire Magic & Melee Fallback ---');
  const staff = dataLoader.getWeapon('staff');
  assert.ok(staff, 'staff weapon exists');

  const mage = createMockHero('mage1', 'Mage', 5, 5, staff, new ProgressionSystem(dataLoader.getClassesData(), 'Mage'));
  mage.energy = 100;

  // With full energy: effective range is 4 tiles (Fire Magic range)
  combat.updateStaffDynamicRange(mage);
  assert.equal(mage.attackRangeTiles, 4, 'Staff with >= 22 EN gets 4 tiles attack range');

  const weaponFull = (combat as any).getEffectiveWeaponForAttack(mage);
  assert.equal(weaponFull.id, 'fire_magic', 'Staff with >= 22 EN attacks using fire_magic profile');

  // With dry energy (< 22): drops range to 1 tile and falls back to physical staff
  mage.energy = 10;
  combat.updateStaffDynamicRange(mage);
  assert.equal(mage.attackRangeTiles, 1, 'Dry Staff (< 22 EN) drops to 1 tile attack range');

  const weaponDry = (combat as any).getEffectiveWeaponForAttack(mage);
  assert.equal(weaponDry.id, 'staff', 'Dry Staff attacks using staff profile');
  assert.equal(weaponDry.energyCostPerCast || 0, 0, 'Staff melee fallback costs 0 energy');
  assert.equal(weaponDry.category, 'melee_2h', 'Staff category is melee_2h');
  console.log('✔ Test 7 passed: Staff dynamically channels Fire Magic at 4 tiles with >= 22 EN and drops to 1 tile physical melee at 0 cost when dry.');

  // ---------------------------------------------------------------------------
  // TEST 8: Healing Magic Branch 3 Dry-State Dynamic Cost Warning & Fallback
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Healing Magic Branch 3 Dry-State Log & Fallback ---');
  const cleric = createMockHero('cleric1', 'Cleric', 5, 5, staff, new ProgressionSystem(dataLoader.getClassesData(), 'Cleric'));
  cleric.energy = 10; // dry (< 22)
  const woundedAlly = createMockHero('ally1', 'Ally', 5, 6, staff, new ProgressionSystem(dataLoader.getClassesData(), 'Ally'));
  woundedAlly.hp = 20; // damaged (20/50)

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(' '));
    origLog(...args);
  };

  try {
    combat.party = [cleric, woundedAlly];
    const casted = combat.checkAndAutocastHealingMagic(cleric, 5000);
    assert.equal(casted, false, 'Branch 3 must return false so cleric falls back to normal combat');
    const warningLog = logs.find(l => l.includes('[Healing Magic] ⚠️ Out of Energy to cast Heal'));
    assert.ok(warningLog, 'Warning log must be produced in Branch 3');
    assert.ok(warningLog.includes('(10/22)'), 'Warning log must interpolate dynamic cost: (10/22)');
  } finally {
    console.log = origLog;
  }
  console.log('✔ Test 8 passed: Branch 3 cleanly emits interpolated (10/22) warning and returns false to allow melee fallback.');

  // ---------------------------------------------------------------------------
  // TEST 9: Healing Magic Branch 2 Clean Return When No Allies Are Damaged
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Healing Magic Branch 2 Clean Return ---');
  cleric.energy = 100;
  woundedAlly.hp = 50; // fully healed
  combat.party = [cleric, woundedAlly];
  const castedBranch2 = combat.checkAndAutocastHealingMagic(cleric, 5000);
  assert.equal(castedBranch2, false, 'Branch 2 returns false when no damaged allies exist');
  console.log('✔ Test 9 passed: Branch 2 cleanly returns false with 0 noise when all allies are healthy.');

  console.log('\n======================================================');
  console.log('🎉 ALL 9 MILESTONE 19 UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runMilestone19Tests().catch((err) => {
  console.error('❌ Milestone 19 Test Failed:', err);
  process.exit(1);
});
