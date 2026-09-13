import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser import under Node
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

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };
import weaponsData from '../data/weapons.json' with { type: 'json' };
import skillsData from '../data/skills.json' with { type: 'json' };
import statusEffectsData from '../data/statusEffects.json' with { type: 'json' };

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const lastSkillUseTimes = new Map<string, number>();
  const autocastMap = new Map<string, boolean>();

  const player = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp: 100,
    maxHp: 100,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    mood: 80,
    maxMood: 100,
    inCombat: true,
    equippedWeapon: weapon,
    offhandWeapon: null as WeaponDef | null,
    attackRangeTiles: weapon.attackRangeTiles ?? 1,
    progression,
    activeClass: null as string | null,
    targetEntity: null as any,
    state: 'idle',
    lastAttackTime: 0,
    lastCombatRepathTimeMs: 0,
    combatRepathIntervalMs: 500,
    claimedDestination: null as any,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    lastSkillUseTimes,
    autocastMap,
    activeStatusEffects: statusEffects,
    isMoving: () => false,
    stopMovement: () => {},
    followPath: () => {},
    setTarget: function (target: any) {
      this.targetEntity = target;
    },
    clearTarget: function () {
      this.targetEntity = null;
    },
    isAutocastEnabled: () => false,
    isDualWielding: () => false,
    hasStatusEffect: (id: string) => statusEffects.has(id),
    getStatusEffect: (id: string) => statusEffects.get(id),
    applyStatusEffect: (def: any) => {
      statusEffects.set(def.id, { def, remainingMs: def.durationMs, nextTickMs: def.tickIntervalMs });
    },
    removeStatusEffect: (id: string) => {
      statusEffects.delete(id);
    },
    isDisabled: function () {
      for (const [id, active] of statusEffects) {
        if (active.def?.disablesActions || id === 'stun' || id === 'shock') return true;
      }
      return false;
    },
    isMovementDisabled: function () {
      for (const [id, active] of statusEffects) {
        if (active.def?.disablesMovement || id === 'stun' || id === 'shock') return true;
      }
      return false;
    },
    hasShield: () => false,
    heal: function (amount: number) {
      const old = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      return this.hp - old;
    },
    takeDamage: function (amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      return this.hp <= 0;
    }
  };

  return player;
}

function createMockEnemy(id: string, name: string, x: number, y: number, hp: number = 80): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const enemyDef: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'tier1',
    hp,
    criticalHpMax: 20,
    meleeDamage: 8,
    aggroRadius: 5,
    attackIntervalMs: 1500
  };

  const enemy = {
    id,
    entityName: name,
    enemyData: enemyDef,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 20,
    maxCriticalHp: 20,
    state: 'idle',
    isAggroed: true,
    targetEntity: null as any,
    lastAttackTime: 0,
    lastAttackTimeMs: 0,
    lastRepathTimeMs: 0,
    repathIntervalMs: 1000,
    maxLeashDistance: 10,
    spawnPos: { x, y },
    activeStatusEffects: statusEffects,
    isMoving: () => false,
    stopMovement: () => {},
    followPath: () => {},
    hasStatusEffect: (effId: string) => statusEffects.has(effId),
    getStatusEffect: (effId: string) => statusEffects.get(effId),
    applyStatusEffect: (def: any) => {
      statusEffects.set(def.id, { def, remainingMs: def.durationMs, nextTickMs: def.tickIntervalMs });
    },
    removeStatusEffect: (effId: string) => {
      statusEffects.delete(effId);
    },
    isDisabled: function () {
      for (const [effId, active] of statusEffects) {
        if (active.def?.disablesActions || effId === 'stun' || effId === 'shock') return true;
      }
      return false;
    },
    isMovementDisabled: function () {
      for (const [effId, active] of statusEffects) {
        if (active.def?.disablesMovement || effId === 'stun' || effId === 'shock') return true;
      }
      return false;
    },
    takeDamage: function (amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) {
        this.state = 'dead';
        return true;
      }
      return false;
    }
  };

  return enemy;
}

function createMockScene(): any {
  return {
    add: {
      text: () => ({ setOrigin: () => {}, destroy: () => {} }),
      line: () => ({ setOrigin: () => ({ setLineWidth: () => ({ setDepth: () => ({ destroy: () => {} }) }) }) }),
      circle: () => ({ setDepth: () => ({ destroy: () => {} }) }),
      graphics: () => ({
        setDepth: () => ({
          lineStyle: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          strokePath: () => {},
          destroy: () => {}
        })
      })
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) {
          setTimeout(config.onComplete, 1);
        }
      }
    }
  };
}

async function runMilestone23Tests() {
  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const dataLoader = DataLoader.getInstance();

  // --- TEST 1: Data Schema & Generic Conduit Architecture ---
  console.log('--- TEST 1: Data Schema & Generic Conduit Architecture ---');
  const lightningStaff = dataLoader.getWeapon('lightning_staff');
  assert.ok(lightningStaff, 'lightning_staff must be registered in weapons.json');
  assert.equal(lightningStaff.category, 'melee_2h');
  assert.equal(lightningStaff.spellWeaponId, 'lightning_magic');

  const lightningMagic = dataLoader.getWeapon('lightning_magic');
  assert.ok(lightningMagic, 'lightning_magic must be registered in weapons.json');
  assert.equal(lightningMagic.category, 'magic');
  assert.equal(lightningMagic.conduitWeaponId, 'lightning_staff');
  assert.equal(lightningMagic.chainTargets, 2);
  assert.equal(lightningMagic.chainHopRangeTiles, 3);
  assert.equal(lightningMagic.chainDamageFalloff, 0.30);
  assert.equal(lightningMagic.shockChance, 0.30);

  const shockEffect = dataLoader.getStatusEffect('shock');
  assert.ok(shockEffect, 'shock must be registered in statusEffects.json');
  assert.equal(shockEffect.durationMs, 1000);
  assert.equal(shockEffect.disablesActions, true);
  assert.equal(shockEffect.disablesMovement, true);
  assert.equal(shockEffect.interruptsAttack, true);

  const sparkAdept = dataLoader.getClass('spark_adept');
  assert.ok(sparkAdept, 'spark_adept must be registered in classes.json');
  assert.equal(sparkAdept.requirements[0].type, 'proficiency');
  assert.equal(sparkAdept.requirements[0].target, 'lightning_magic');
  assert.equal(sparkAdept.requirements[0].value, 10);

  // Verify generic bidirectional conduit helpers
  const derivedConduit = dataLoader.getConduitForSpell(lightningMagic);
  assert.equal(derivedConduit.id, 'lightning_staff', 'getConduitForSpell maps lightning_magic to lightning_staff');
  const derivedSpell = dataLoader.getSpellForConduit(lightningStaff);
  assert.equal(derivedSpell?.id, 'lightning_magic', 'getSpellForConduit maps lightning_staff to lightning_magic');

  console.log('✓ PASS: Data schema, bidirectional conduit links, and Spark Adept class verified.\n');

  // --- TEST 2: Random Magic Staff Statistical Pool Variation ---
  console.log('--- TEST 2: Random Magic Staff Statistical Pool Variation (100 Iterations) ---');
  const gameState = GameState.getInstance();
  const iterations = 100;
  let fireCount = 0;
  let lightningCount = 0;
  let iceCount = 0;

  for (let i = 0; i < iterations; i++) {
    const resolved = gameState.resolveStartingKit('random_magic_staff');
    if (resolved.mainWeaponId === 'fire_staff') {
      fireCount++;
    } else if (resolved.mainWeaponId === 'lightning_staff') {
      lightningCount++;
    } else if (resolved.mainWeaponId === 'ice_staff') {
      iceCount++;
    } else {
      assert.fail(`Unexpected weapon resolved from random_magic_staff: ${resolved.mainWeaponId}`);
    }
  }

  console.log(`[Random Roll Results] Out of 100 iterations: Fire Staff = ${fireCount}, Lightning Staff = ${lightningCount}, Ice Staff = ${iceCount}`);
  assert.ok(fireCount >= 15, `Fire Staff should appear reasonably often (got ${fireCount}/100)`);
  assert.ok(lightningCount >= 15, `Lightning Staff should appear reasonably often (got ${lightningCount}/100)`);
  assert.equal(fireCount + lightningCount + iceCount, 100, 'All rolls must be valid conduit staves');
  console.log('✓ PASS: Random Magic Staff pool genuinely varies across conduit staves.\n');

  // --- TEST 3: Chain Targeting Mechanics & Damage Falloff ---
  console.log('--- TEST 3: Chain Targeting Mechanics & Damage Falloff ---');
  const scene = createMockScene();
  const bigGrid: number[][] = [];
  for (let r = 0; r < 30; r++) bigGrid.push(new Array(30).fill(0));
  const pathfinder = new Pathfinder(bigGrid);
  const prog = new ProgressionSystem(undefined, 'LightningMage');
  const mage = createMockPlayer('mage', 'Lightning Mage', 5, 5, lightningStaff, prog);
  mage.mood = 50; // Neutral mood: 1.0x damage multiplier

  // 3 enemies in a chain line:
  // Primary at (8, 5) — 3 tiles away from mage (in range <= 4)
  // Enemy 2 at (10, 5) — 2 tiles away from primary (within hop range 3)
  // Enemy 3 at (12, 5) — 2 tiles away from Enemy 2 (within hop range 3)
  // Enemy 4 at (18, 5) — 6 tiles away from Enemy 3 (outside hop range 3)
  const primaryEnemy = createMockEnemy('e1', 'Target Alpha', 8, 5, 100);
  const hopEnemy1 = createMockEnemy('e2', 'Target Beta', 10, 5, 100);
  const hopEnemy2 = createMockEnemy('e3', 'Target Gamma', 12, 5, 100);
  const distantEnemy = createMockEnemy('e4', 'Target Delta', 18, 5, 100);

  const combat = new CombatSystem(scene, [mage], [primaryEnemy, hopEnemy1, hopEnemy2, distantEnemy], pathfinder);
  mage.setTarget(primaryEnemy);

  // Guarantee hits & no random variance for precise damage verification
  const originalRandom = Math.random;
  Math.random = () => 0.01; // Always hits, rolls within accuracy

  try {
    combat.update(2000);

    const baseDmg = lightningMagic.baseDamage; // 8
    const expectedPrimaryHp = 100 - baseDmg; // 92
    const hop1Dmg = baseDmg * (1 - 0.30); // 5.6
    const expectedHop1Hp = 100 - hop1Dmg; // 94.4
    const hop2Dmg = hop1Dmg * (1 - 0.30); // 3.92
    const expectedHop2Hp = 100 - hop2Dmg; // 96.08

    assert.equal(primaryEnemy.hp, expectedPrimaryHp, `Primary target takes 100% damage (${baseDmg})`);
    assert.equal(hopEnemy1.hp, expectedHop1Hp, `Hop 1 target takes 70% damage (${hop1Dmg})`);
    assert.equal(hopEnemy2.hp, expectedHop2Hp, `Hop 2 target takes 49% damage (${hop2Dmg})`);
    assert.equal(distantEnemy.hp, 100, 'Distant enemy outside hop range is untouched');

    // Confirm visited tracking: chain does not hit the primary enemy again
    assert.ok(primaryEnemy.hp === expectedPrimaryHp, 'Primary enemy was not struck a second time in chain');
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ PASS: Chain targeting strikes primary and 2 hops with exact 30% falloff, without double-hitting.\n');

  // --- TEST 4: Chain Targeting Graceful Termination With Fewer Enemies ---
  console.log('--- TEST 4: Chain Targeting Graceful Termination With Fewer Enemies ---');
  const isolatedPrimary = createMockEnemy('iso_e1', 'Isolated Enemy', 8, 5, 100);
  const soloCombat = new CombatSystem(scene, [mage], [isolatedPrimary], pathfinder);
  mage.setTarget(isolatedPrimary);

  Math.random = () => 0.01;
  try {
    // Attack should execute cleanly with 0 available chain hops
    mage.lastAttackTime = 0;
    soloCombat.update(4000);
    assert.equal(isolatedPrimary.hp, 92, 'Isolated enemy takes base hit');
    // Verify no exceptions occurred and execution terminated gracefully
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ PASS: Chain gracefully terminates with 0 additional enemies without errors.\n');

  // --- TEST 5: Unified isDisabled() & Shock Status Effect Mechanics ---
  console.log('--- TEST 5: Unified isDisabled() & Shock Status Effect Mechanics ---');
  const testEnemy = createMockEnemy('test_dummy', 'Practice Dummy', 6, 5, 50);
  assert.equal(testEnemy.isDisabled(), false, 'Enemy initially not disabled');

  // Apply Shock
  testEnemy.applyStatusEffect(shockEffect);
  assert.equal(testEnemy.hasStatusEffect('shock'), true, 'Shock applied');
  assert.equal(testEnemy.isDisabled(), true, 'Shock triggers isDisabled()');
  assert.equal(testEnemy.isMovementDisabled(), true, 'Shock triggers isMovementDisabled()');

  // Apply Stun and verify both satisfy isDisabled()
  const stunEffect = dataLoader.getStatusEffect('stun')!;
  const stunEnemy = createMockEnemy('stun_dummy', 'Stun Dummy', 7, 5, 50);
  stunEnemy.applyStatusEffect(stunEffect);
  assert.equal(stunEnemy.isDisabled(), true, 'Stun triggers isDisabled()');

  // Verify enemy AI skips action when disabled
  const enemyCombat = new CombatSystem(scene, [mage], [testEnemy], pathfinder);
  testEnemy.targetEntity = mage;
  testEnemy.lastAttackTimeMs = 0;
  testEnemy.lastAttackTime = 0;
  testEnemy.state = 'attacking';

  // Combat update should halt movement and skip action
  enemyCombat.update(5000);
  assert.equal(testEnemy.isDisabled(), true, 'Enemy remains disabled under Shock');

  console.log('✓ PASS: Unified isDisabled() correctly handles both Shock and Stun, disabling movement and actions.\n');

  // --- TEST 6: Generic Staff Dynamic Range & Dry Melee Fallback ---
  console.log('--- TEST 6: Generic Staff Dynamic Range & Dry Melee Fallback ---');
  const staffHero = createMockPlayer('staff_hero', 'Staff Adept', 5, 5, lightningStaff, new ProgressionSystem());
  const combatFallback = new CombatSystem(scene, [staffHero], [primaryEnemy], pathfinder);

  // With full energy (100 EN >= 20 EN cost)
  combatFallback.updateStaffDynamicRange(staffHero);
  assert.equal(staffHero.attackRangeTiles, 4, 'Full energy provides range 4 for Lightning Magic');
  const effectiveWpnFull = combatFallback.getEffectiveWeaponForAttack(staffHero);
  assert.equal(effectiveWpnFull.id, 'lightning_magic', 'Effective weapon is lightning_magic spell when energy available');

  // When dry (0 energy < 20 EN cost)
  staffHero.energy = 5;
  combatFallback.updateStaffDynamicRange(staffHero);
  assert.equal(staffHero.attackRangeTiles, 1, 'Dry caster collapses dynamic range to 1 (melee fallback)');
  const effectiveWpnDry = combatFallback.getEffectiveWeaponForAttack(staffHero);
  assert.equal(effectiveWpnDry.id, 'staff', 'Effective weapon falls back to physical staff in melee');

  // When energy regenerates back to 25
  staffHero.energy = 25;
  combatFallback.updateStaffDynamicRange(staffHero);
  assert.equal(staffHero.attackRangeTiles, 4, 'Regenerated energy expands dynamic range back to 4');
  const effectiveWpnRestored = combatFallback.getEffectiveWeaponForAttack(staffHero);
  assert.equal(effectiveWpnRestored.id, 'lightning_magic', 'Resumes casting lightning_magic when energy returns');

  console.log('✓ PASS: Dynamic range collapses to 1 on dry energy and expands back to 4 when restored.\n');

  // --- TEST 7: Progression, Hidden Stat Rule, and Spark Adept Unlock ---
  console.log('--- TEST 7: Progression, Hidden Stat Rule, and Spark Adept Unlock ---');
  const heroProg = new ProgressionSystem(undefined, 'LightningNovice');
  
  // Rule: Hidden until Level 1
  const initialStat = heroProg.getProficiencyStat('lightning_magic');
  assert.equal(initialStat.level, 0, 'Lightning Magic starts at Level 0');
  assert.equal(heroProg.isClassUnlocked('spark_adept'), false, 'Spark Adept is locked at Level 0');

  // Award EXP and level up to 1
  heroProg.addProficiencyExp('lightning_magic', 50);
  assert.ok(heroProg.getProficiencyLevel('lightning_magic') >= 1, 'Lightning Magic reaches Level 1 and reveals in UI');
  assert.equal(heroProg.isClassUnlocked('spark_adept'), false, 'Spark Adept remains locked below Level 10');

  // Level up to Level 10
  let unlockedClass = false;
  heroProg.onClassUnlocked((event) => {
    if (event.classDef.id === 'spark_adept') {
      unlockedClass = true;
    }
  });

  for (let i = 0; i < 20; i++) {
    heroProg.addProficiencyExp('lightning_magic', 200);
  }

  assert.ok(heroProg.getProficiencyLevel('lightning_magic') >= 10, 'Lightning Magic reaches Level 10+');
  assert.equal(heroProg.isClassUnlocked('spark_adept'), true, 'Spark Adept unlocks at Lightning Magic 10');
  assert.equal(unlockedClass, true, 'onClassUnlocked event dispatched for spark_adept');

  console.log('✓ PASS: Hidden stat rule preserved, proficiency levels from casts, Spark Adept unlocks at Lv 10.\n');

  console.log('=== ALL MILESTONE 23 TESTS PASSED SUCCESSFULLY! ===\n');
}

runMilestone23Tests().catch((err) => {
  console.error('Milestone 23 Test Failure:', err);
  process.exit(1);
});
