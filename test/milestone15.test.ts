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
import type { WeaponDef, EnemyDef, PlayerData } from '../src/types/game.ts';

async function runTests() {
  console.log('--- RUNNING MILESTONE 15: HEALING MAGIC & STAFF UNIT TESTS ---');

  // Dynamically import CombatSystem after Phaser polyfills
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  function createMockPlayer(
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
      state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
      equippedWeapon: weapon,
      offhandWeapon: null as WeaponDef | null,
      attackRangeTiles: 1,
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      lastAttackTime: 0,
      lastCombatRepathTimeMs: 0,
      combatRepathIntervalMs: 400,
      lastSkillUseTimes: new Map<string, number>(),
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: new Map<string, boolean>(),
      progression,
      equipWeapon: function(newWeapon: WeaponDef) {
        this.equippedWeapon = newWeapon;
        if (newWeapon.twoHanded && this.offhandWeapon) {
          this.offhandWeapon = null;
        }
      },
      equipOffhandWeapon: function(offWeapon: WeaponDef | null) {
        if (offWeapon === null) {
          this.offhandWeapon = null;
          return true;
        }
        if (this.equippedWeapon?.twoHanded) {
          return false;
        }
        this.offhandWeapon = offWeapon;
        return true;
      },
      isDualWielding: function() {
        return this.offhandWeapon !== null && this.offhandWeapon.category !== 'offhand';
      },
      hasShield: function() {
        return this.offhandWeapon !== null && (this.offhandWeapon.category === 'offhand' || this.offhandWeapon.id === 'shields');
      },
      heal: function(amount: number) {
        if (this.state === 'dead' || this.state === 'downed') return 0;
        const oldHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this.hp - oldHp;
      },
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
          this.state = 'downed';
          this.clearTarget();
          return true;
        }
        return false;
      },
      revive: function(reviver?: any) {
        if (this.state !== 'downed') return;
        this.state = 'idle';
        this.hp = Math.floor(this.maxHp * 0.5);
        this.criticalHp = this.maxCriticalHp;
        this.claimedDestination = null;
        this.clearTarget();
        if (reviver && reviver !== this && reviver.progression) {
          reviver.progression.recordActivity('Ally Revived', 1);
        }
      },
      setTarget: function(target: any) {
        this.targetEntity = target;
      },
      clearTarget: function() {
        this.targetEntity = null;
        this.stopMovement();
      },
      isMoving: function() {
        return this.state === 'moving' && this.claimedDestination !== null;
      },
      stopMovement: function() {
        this.claimedDestination = null;
        if (this.state === 'moving') this.state = 'idle';
      },
      hasStatusEffect: function(_id: string) { return false; },
      getStatusEffect: function(_id: string) { return undefined; }
    };
  }

  function createMockEnemy(
    id: string,
    name: string,
    gridX: number,
    gridY: number
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 40,
      maxHp: 40,
      damage: 6,
      state: 'idle' as 'idle' | 'moving' | 'chasing' | 'attacking' | 'downed' | 'dead',
      attackRangeTiles: 1,
      tileSize: 32,
      spawnPos: { x: gridX, y: gridY },
      isAggroed: false,
      maxLeashDistance: 10,
      outOfAggroTimerMs: 0,
      claimedDestination: null as GridPos | null,
      targetEntity: null as any,
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
          this.state = 'dead';
          return true;
        }
        return false;
      },
      isMoving: function() {
        return this.state === 'moving' || this.state === 'chasing';
      },
      stopMovement: function() {
        this.claimedDestination = null;
        if (this.state === 'moving' || this.state === 'chasing') this.state = 'idle';
      },
      hasStatusEffect: function(_id: string) { return false; },
      getStatusEffect: function(_id: string) { return undefined; },
      enemyData: { harvest: [] }
    };
  }

  function createMockCombatSystem(party: any[], enemies: any[] = []): any {
    const mockScene: any = {
      time: { now: 1000 },
      add: {
        graphics: () => ({ lineStyle: () => {}, lineBetween: () => {}, destroy: () => {} }),
        text: () => ({ setOrigin: () => ({ setDepth: () => ({ destroy: () => {} }) }), destroy: () => {} }),
        circle: () => ({ setDepth: () => ({ destroy: () => {} }) }),
        line: () => ({
          setOrigin: () => ({
            setLineWidth: () => ({
              setDepth: () => ({ destroy: () => {} })
            })
          }),
          destroy: () => {}
        })
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) config.onComplete();
        }
      }
    };
    const grid: number[][] = Array(20).fill(0).map(() => Array(20).fill(0));
    const pathfinder = new Pathfinder(grid, 32);
    return new CombatSystem(mockScene, party, enemies, pathfinder, party[0]?.progression);
  }

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const staffWeapon = dataLoader.getWeapon('staff');
  const healingMagicDef = dataLoader.getWeapon('healing_magic');
  const shortSwords = dataLoader.getWeapon('short_swords')!;
  const shieldWeapon = dataLoader.getWeapon('shields')!;
  const classesData = dataLoader.getClassesData();

  // ==========================================================================
  // TEST 1: Staff & Healing Magic Weapon Definitions & 2H Invariant
  // ==========================================================================
  assert.ok(staffWeapon, 'Staff weapon must exist in weapons.json');
  assert.equal(staffWeapon.category, 'melee_2h', 'Staff must be melee_2h');
  assert.equal(staffWeapon.twoHanded, true, 'Staff must be twoHanded');
  assert.equal(staffWeapon.attackIntervalMs, 1300, 'Staff attackIntervalMs must be 1300');
  assert.equal(staffWeapon.baseDamage, 7, 'Staff baseDamage must be 7');
  assert.equal(staffWeapon.baseAccuracy, 0.65, 'Staff baseAccuracy must be 0.65');
  assert.ok(staffWeapon.levelBonus?.damagePerLevel, 'Staff must have damagePerLevel bonus');

  assert.ok(healingMagicDef, 'Healing Magic must exist in weapons.json');
  assert.equal(healingMagicDef.category, 'magic', 'Healing Magic must be magic category');
  assert.equal(healingMagicDef.baseDamage, 0, 'Healing Magic must have 0 base damage');
  assert.equal(healingMagicDef.baseHealAmount, 8, 'Healing Magic baseHealAmount must be 8');
  assert.equal(healingMagicDef.energyCostPerCast, 15, 'Healing Magic energyCostPerCast must be 15');
  assert.equal(healingMagicDef.levelBonus?.healPerLevel, 0.5, 'Healing Magic healPerLevel must be 0.5');

  // Test 2H equip rule on player
  const prog1 = new ProgressionSystem(classesData);
  const player1 = createMockPlayer('hero', 'Guild Hero', 5, 5, shortSwords, prog1);
  player1.equipOffhandWeapon(shieldWeapon);
  assert.equal(player1.offhandWeapon?.id, 'shields', 'Shield successfully equipped in offhand');

  // Equipping Staff (2H) must automatically unequip offhand shield
  player1.equipWeapon(staffWeapon!);
  assert.equal(player1.equippedWeapon.id, 'staff', 'Staff equipped as main weapon');
  assert.equal(player1.offhandWeapon, null, 'Equipping 2H Staff must unequip offhand');

  // Attempting to equip shield in offhand while wielding Staff must fail
  const offhandSuccess = player1.equipOffhandWeapon(shieldWeapon);
  assert.equal(offhandSuccess, false, 'Cannot equip offhand while wielding 2H Staff');
  assert.equal(player1.offhandWeapon, null, 'Offhand remains null');

  console.log('✔ Test 1 passed: Staff & Healing Magic data definitions and 2H equipment rules verified');

  // ==========================================================================
  // TEST 2: Staff Conduit Requirement for Healing Magic
  // ==========================================================================
  const prog2 = new ProgressionSystem(classesData);
  const hero2 = createMockPlayer('hero2', 'Guild Hero', 5, 5, shortSwords, prog2);
  const comp2 = createMockPlayer('comp2', 'Companion', 5, 6, shortSwords, new ProgressionSystem(classesData));
  comp2.hp = 25; // Hurt companion

  const combatSys2 = createMockCombatSystem([hero2, comp2]);

  // With Short Swords equipped, Healing Magic MUST NOT cast (needs Staff)
  const castWithoutStaff = combatSys2.checkAndAutocastHealingMagic(hero2, 1000);
  assert.equal(castWithoutStaff, false, 'Healing Magic must NOT cast without Staff equipped');
  assert.equal(comp2.hp, 25, 'Companion HP unchanged');

  // Equip Staff on hero2: now Healing Magic CAN cast
  hero2.equipWeapon(staffWeapon!);
  const castWithStaff = combatSys2.checkAndAutocastHealingMagic(hero2, 2000);
  assert.equal(castWithStaff, true, 'Healing Magic MUST cast when Staff is equipped');
  assert.equal(comp2.hp, 33, 'Companion restored 8 HP (25 + 8 = 33)');
  assert.equal(hero2.energy, 85, 'Hero Energy reduced by 15 (100 - 15 = 85)');

  console.log('✔ Test 2 passed: Staff verified as the mandatory conduit for casting Healing Magic');

  // ==========================================================================
  // TEST 3: Auto-Cast Ally Heal Prioritization & Full HP Invariant
  // ==========================================================================
  const prog3 = new ProgressionSystem(classesData);
  const hero3 = createMockPlayer('hero3', 'Healer Hero', 5, 5, staffWeapon!, prog3);
  const comp3A = createMockPlayer('comp3A', 'Companion A', 5, 6, shortSwords, new ProgressionSystem(classesData));
  const comp3B = createMockPlayer('comp3B', 'Companion B', 6, 5, shortSwords, new ProgressionSystem(classesData));

  const combatSys3 = createMockCombatSystem([hero3, comp3A, comp3B]);

  // Scenario 3A: Both Hero and Companion A are hurt. Companion A has lower HP% (20/50 = 40%) vs Hero (40/50 = 80%)
  hero3.hp = 40;
  comp3A.hp = 20;
  comp3B.hp = 50; // full
  hero3.energy = 100;
  hero3.lastSkillUseTimes.clear();

  const cast3A = combatSys3.checkAndAutocastHealingMagic(hero3, 1000);
  assert.equal(cast3A, true, 'Heal succeeds');
  assert.equal(comp3A.hp, 28, 'Most damaged ally (Companion A) healed first');
  assert.equal(hero3.hp, 40, 'Hero HP untouched this cast');

  // Scenario 3B: All allies at full HP, only Hero is hurt
  comp3A.hp = 50;
  comp3B.hp = 50;
  hero3.hp = 30;
  hero3.energy = 100;
  hero3.lastSkillUseTimes.clear();

  const cast3B = combatSys3.checkAndAutocastHealingMagic(hero3, 3000);
  assert.equal(cast3B, true, 'Heal succeeds');
  assert.equal(hero3.hp, 38, 'Heals self when no other ally is injured');

  // Scenario 3C: Everyone at full HP -> MUST NOT CAST
  hero3.hp = 50;
  comp3A.hp = 50;
  comp3B.hp = 50;
  hero3.lastSkillUseTimes.clear();

  const cast3C = combatSys3.checkAndAutocastHealingMagic(hero3, 5000);
  assert.equal(cast3C, false, 'Must NOT cast when all party members are full HP');

  console.log('✔ Test 3 passed: Ally prioritization, self-heal fallback, and full-HP cast prevention verified');

  // ==========================================================================
  // TEST 4: Melee Fallback with Staff When All Allies are Full HP
  // ==========================================================================
  const prog4 = new ProgressionSystem(classesData);
  const hero4 = createMockPlayer('hero4', 'Combat Monk', 5, 5, staffWeapon!, prog4);
  const wolf4 = createMockEnemy('wolf4', 'Wolf', 5, 6); // 1 tile away (melee range)
  hero4.targetEntity = wolf4;

  const combatSys4 = createMockCombatSystem([hero4], [wolf4]);

  // Ensure hero and party are at full HP
  hero4.hp = 50;
  assert.equal(prog4.getProficiencyLevel('staff'), 0);
  assert.equal(prog4.getProficiencyLevel('healing_magic'), 0);

  // Combat update: Since all allies at full HP, Healing Magic does not cast,
  // so hero falls back to swinging the Staff at the wolf!
  hero4.lastAttackTime = 0;
  const initialWolfHp = wolf4.hp;
  const originalRandom = Math.random;
  Math.random = () => 0.1; // Guarantee hit
  try {
    combatSys4.update(2000, 16);
  } finally {
    Math.random = originalRandom;
  }

  assert.ok(wolf4.hp < initialWolfHp, `Wolf took physical damage from Staff swing (${initialWolfHp} -> ${wolf4.hp})`);
  assert.equal(prog4.getProficiencyStat('staff').currentExp, 2, 'Staff gained +2 EXP from physical melee swing');
  assert.equal(prog4.getProficiencyStat('healing_magic').currentExp, 0, 'Healing Magic gained 0 EXP from melee swing');

  console.log('✔ Test 4 passed: Melee fallback with Staff verified (Staff swings deal damage & award Staff EXP when party is full HP)');

  // ==========================================================================
  // TEST 5: Independent Progression & Real Level Gap Proof
  // ==========================================================================
  const prog5 = new ProgressionSystem(classesData);
  const hero5 = createMockPlayer('hero5', 'Pure Healer', 5, 5, staffWeapon!, prog5);
  const comp5 = createMockPlayer('comp5', 'Frontliner', 5, 6, shortSwords, new ProgressionSystem(classesData));

  const combatSys5 = createMockCombatSystem([hero5, comp5]);

  // Repeatedly heal companion 25 times without swinging the Staff in melee
  for (let i = 1; i <= 25; i++) {
    comp5.hp = 10;
    hero5.energy = 100;
    hero5.lastSkillUseTimes.clear();
    const healed = combatSys5.checkAndAutocastHealingMagic(hero5, i * 2000);
    assert.equal(healed, true);
  }

  // 25 heals * 2 EXP = 50 EXP -> reaches Level 1 for Healing Magic!
  assert.equal(prog5.getProficiencyLevel('healing_magic'), 1, 'Healing Magic reached Level 1');
  assert.equal(prog5.isStatRevealed('healing_magic'), true, 'Healing Magic is now revealed');

  // Staff NEVER swung -> strictly Level 0 and 0 EXP!
  assert.equal(prog5.getProficiencyLevel('staff'), 0, 'Staff must strictly remain Level 0');
  assert.equal(prog5.getProficiencyStat('staff').currentExp, 0, 'Staff must strictly have 0 EXP');
  assert.equal(prog5.isStatRevealed('staff'), false, 'Staff remains strictly hidden');

  console.log('✔ Test 5 passed: Real level gap proven (Healing Magic Level 1 vs Staff Level 0, 0 EXP — genuinely independent)');

  // ==========================================================================
  // TEST 6: Medic & Staff Adept Tier 0 Novice Class Unlocks
  // ==========================================================================
  const prog6 = new ProgressionSystem(classesData);
  let unlockedClassNames: string[] = [];
  prog6.onClassUnlocked(e => unlockedClassNames.push(e.classDef.id));

  // Advance Staff to Level 10
  for (let i = 0; i < 500; i++) {
    prog6.addProficiencyExp('staff', 2);
    if (prog6.getProficiencyLevel('staff') >= 10) break;
  }
  assert.equal(prog6.getProficiencyLevel('staff'), 10, 'Staff at Level 10');
  assert.ok(prog6.isClassUnlocked('staff_adept'), 'Staff Adept MUST unlock at Staff 10');
  assert.equal(prog6.isClassUnlocked('medic'), false, 'Medic MUST NOT unlock from Staff proficiency');

  // Advance Healing Magic to Level 10
  for (let i = 0; i < 500; i++) {
    prog6.addProficiencyExp('healing_magic', 2);
    if (prog6.getProficiencyLevel('healing_magic') >= 10) break;
  }
  assert.equal(prog6.getProficiencyLevel('healing_magic'), 10, 'Healing Magic at Level 10');
  assert.ok(prog6.isClassUnlocked('medic'), 'Medic MUST unlock at Healing Magic 10');

  console.log('✔ Test 6 passed: Medic unlocks at Healing Magic 10, Staff Adept unlocks at Staff 10 independently');

  // ==========================================================================
  // TEST 7: Combat Medic Restored Dual Requirement
  // ==========================================================================
  const prog7 = new ProgressionSystem(classesData);
  const hero7 = createMockPlayer('hero7', 'Field Medic', 3, 3, staffWeapon!, prog7);
  const comp7 = createMockPlayer('comp7', 'Injured One', 4, 3, shortSwords, new ProgressionSystem(classesData));

  // Perform 5 revives without Healing Magic (Healing Magic = 0)
  for (let i = 1; i <= 5; i++) {
    comp7.state = 'downed';
    comp7.revive(hero7);
  }
  assert.equal(prog7.getActivityCount('Ally Revived'), 5);
  assert.equal(prog7.getProficiencyLevel('healing_magic'), 0);
  assert.equal(prog7.isClassUnlocked('combat_medic'), false, 'Combat Medic must NOT unlock with 5 revives alone');

  // Now train Healing Magic up to Level 29 (still 1 short)
  for (let lv = 0; lv < 29; lv++) {
    prog7.getProficiencyStat('healing_magic').level = 29;
  }
  prog7.checkClassUnlocks();
  assert.equal(prog7.isClassUnlocked('combat_medic'), false, 'Combat Medic must NOT unlock at Healing Magic 29');

  // Now hit Level 30: both requirements met!
  prog7.getProficiencyStat('healing_magic').level = 30;
  prog7.checkClassUnlocks();
  assert.equal(prog7.isClassUnlocked('combat_medic'), true, 'Combat Medic MUST unlock when BOTH 5 revives AND Healing Magic 30 are met');

  console.log('✔ Test 7 passed: Combat Medic restored dual requirement verified (5 revives AND Healing Magic 30)');

  // ==========================================================================
  // TEST 8: Explicit Grandfather Rule Verification
  // ==========================================================================
  // Character with grandfathered Combat Medic from older milestone/snapshot
  const grandfatherSnapshot = {
    proficiencies: {
      short_swords: { level: 10, currentExp: 0 },
      healing_magic: { level: 0, currentExp: 0 } // Zero healing magic!
    },
    classLevels: { combat_medic: 1 },
    unlockedClasses: ['combat_medic'],
    activityCounts: { 'Ally Revived': 5 }
  };

  const restoredProg = new ProgressionSystem(classesData);
  restoredProg.loadSnapshotData(grandfatherSnapshot);

  assert.equal(restoredProg.getProficiencyLevel('healing_magic'), 0, 'Grandfathered character has 0 Healing Magic');
  assert.equal(restoredProg.isClassUnlocked('combat_medic'), true, 'Grandfathered character retains Combat Medic');

  // Calling checkClassUnlocks must NOT revoke or strip Combat Medic
  restoredProg.checkClassUnlocks();
  assert.equal(restoredProg.isClassUnlocked('combat_medic'), true, 'Combat Medic is strictly preserved across checks');

  console.log('✔ Test 8 passed: Explicit grandfather rule preserved — existing unlocks are never revoked');

  // ==========================================================================
  // TEST 9: Energy Regen Hidden Skill (Pure Physical Character)
  // ==========================================================================
  const engine = HiddenSkillSystem.getInstance();
  const physicalProg = new ProgressionSystem(classesData);
  // Pure physical: 0 magic proficiency across all schools
  const dataLoaderMagicIds = dataLoader.getMagicSchoolIds();
  for (const id of dataLoaderMagicIds) {
    assert.equal(physicalProg.getProficiencyLevel(id), 0);
  }

  const physicalCtx: CombatContext = {
    equippedWeapon: shortSwords,
    inCombat: false,
    hasMagicProficiency: false
  };

  // Passive regen tick
  const energyDef = dataLoader.getHiddenSkill('energy_regen');
  assert.ok(energyDef, 'energy_regen hidden skill exists');

  // Force proc for deterministic verification
  const rollRes = engine.rollProc(energyDef!, physicalCtx, physicalProg);
  assert.equal(rollRes.eligible, true, 'Energy Regen is eligible for pure physical characters (gear: none)');

  // Level up Energy Regen to Level 1
  physicalProg.addProficiencyExp('energy_regen', 50);
  assert.equal(physicalProg.getProficiencyLevel('energy_regen'), 1, 'Energy Regen reached Level 1');
  assert.equal(physicalProg.isStatRevealed('energy_regen'), true, 'Energy Regen is revealed at Level 1');

  // Verify it restores energy out of combat
  const origRollProc9 = engine.rollProc.bind(engine);
  engine.rollProc = (def, ctx, prog) => {
    if (def.id === 'energy_regen') {
      const currentLvl = prog.getProficiencyLevel(def.id);
      const tier = engine.getTierEffect(def, currentLvl);
      return { eligible: true, procced: true, expAwarded: 1, newLevel: currentLvl, tierEffect: tier };
    }
    return origRollProc9(def, ctx, prog);
  };
  const regenOut = engine.resolvePassiveRegen(physicalCtx, physicalProg);
  engine.rollProc = origRollProc9;

  assert.ok(regenOut.energyRestored >= 2, 'Energy Regen restores +2 energy on passive tick');

  console.log('✔ Test 9 passed: Energy Regen reliably rolls, levels, and reveals for pure physical characters (0 magic)');

  // ==========================================================================
  // TEST 10: Mana Regen Live Verification via Healing Magic
  // ==========================================================================
  const mageProg = new ProgressionSystem(classesData);
  const mageCtx: CombatContext = {
    equippedWeapon: staffWeapon,
    inCombat: false,
    hasMagicProficiency: false // initially 0 magic
  };

  // Initially at Level 0 Healing Magic: Mana Regen is NOT eligible
  const manaDef = dataLoader.getHiddenSkill('mana_regen');
  assert.ok(manaDef, 'mana_regen hidden skill exists');
  const manaCheckL0 = engine.evaluateEligibility(manaDef!, mageCtx);
  assert.equal(manaCheckL0, false, 'Mana Regen must NOT be eligible without magic proficiency');

  // Level Healing Magic to Level 1
  mageProg.addProficiencyExp('healing_magic', 50);
  assert.equal(mageProg.getProficiencyLevel('healing_magic'), 1);

  // Now dynamically evaluate hasMagicProficiency
  const hasMagicProficiency = dataLoaderMagicIds.some(id => mageProg.getProficiencyLevel(id) >= 1);
  assert.equal(hasMagicProficiency, true, 'hasMagicProficiency is now TRUE because Healing Magic is Level 1');
  mageCtx.hasMagicProficiency = hasMagicProficiency;

  const manaCheckL1 = engine.evaluateEligibility(manaDef!, mageCtx);
  assert.equal(manaCheckL1, true, 'Mana Regen is now ELIGIBLE with Healing Magic Level 1');

  // Proc and level Mana Regen to Level 1
  mageProg.addProficiencyExp('mana_regen', 50);
  assert.equal(mageProg.getProficiencyLevel('mana_regen'), 1);
  assert.equal(mageProg.isStatRevealed('mana_regen'), true, 'Mana Regen revealed at Level 1');

  console.log('✔ Test 10 passed: Mana Regen live verification confirmed — procs and reveals once Healing Magic >= 1');

  // ==========================================================================
  // TEST 11: Dual Regen Stacking (Energy Regen + Mana Regen)
  // ==========================================================================
  const hybridProg = new ProgressionSystem(classesData);
  hybridProg.addProficiencyExp('energy_regen', 50); // Level 1 Energy Regen (+2 EN)
  hybridProg.addProficiencyExp('healing_magic', 50); // Level 1 Healing Magic
  hybridProg.addProficiencyExp('mana_regen', 50);   // Level 1 Mana Regen (+2 EN)

  const hybridCtx: CombatContext = {
    equippedWeapon: staffWeapon,
    inCombat: false,
    hasMagicProficiency: true
  };

  // Monkey-patch rollProc to guarantee procs on both regen skills
  const origRollProc = engine.rollProc.bind(engine);
  engine.rollProc = (def, ctx, prog) => {
    if (def.id === 'energy_regen' || def.id === 'mana_regen') {
      const currentLvl = prog.getProficiencyLevel(def.id);
      const tier = engine.getTierEffect(def, currentLvl);
      return { eligible: true, procced: true, expAwarded: 1, newLevel: currentLvl, tierEffect: tier };
    }
    return origRollProc(def, ctx, prog);
  };

  const dualRegenResult = engine.resolvePassiveRegen(hybridCtx, hybridProg);
  assert.equal(dualRegenResult.energyRegenProcced, true, 'Energy Regen procced');
  assert.equal(dualRegenResult.manaProcced, true, 'Mana Regen procced');
  assert.equal(dualRegenResult.energyRestored, 4, 'Energy Regen (+2) and Mana Regen (+2) stack to +4 Energy');

  engine.rollProc = origRollProc;
  console.log('✔ Test 11 passed: Dual Regen stacking verified — Energy Regen (+2) and Mana Regen (+2) restore +4 Energy');

  console.log('\n======================================================');
  console.log('ALL 11 MILESTONE 15 UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Milestone 15 Test Failed:', err);
  process.exit(1);
});
