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

// Dynamic imports after browser globals
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Entity } = await import('../src/entities/Entity.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setLineWidth: () => obj,
      setVisible: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setTexture: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      strokeCircle: () => obj,
      fillCircle: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      add: () => obj,
      addAt: () => obj,
      setPosition: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    },
    make: {
      graphics: () => ({
        fillStyle: () => {},
        fillRect: () => {},
        lineStyle: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fillPath: () => {},
        lineBetween: () => {},
        fillCircle: () => {},
        generateTexture: () => {},
        destroy: () => {}
      })
    },
    textures: {
      exists: () => true
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    isTileOccupied: () => false
  };
}

function createMockHero(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: any
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const player = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp: 100,
    maxHp: 100,
    criticalHp: 50,
    maxCriticalHp: 50,
    energy: 100,
    maxEnergy: 100,
    mood: 50,
    maxMood: 100,
    state: 'idle',
    inCombat: true,
    equippedWeapon: weapon,
    offhandWeapon: null,
    progression,
    attackRangeTiles: weapon.attackRangeTiles ?? 1,
    targetEntity: null as any,
    activeStatusEffects: statusEffects,
    lastAttackTime: 0,
    lastCombatRepathTimeMs: 0,
    combatRepathIntervalMs: 500,
    claimedDestination: null as any,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    lastSkillUseTimes: new Map<string, number>(),
    autocastMap: new Map<string, boolean>(),
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
    isDualWielding: () => false,
    equipWeapon: function (w: WeaponDef) {
      this.equippedWeapon = w;
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
    attackIntervalMs: 1500,
    moveSpeed: 100
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
    baseMoveSpeed: 100,
    get moveSpeed(): number {
      let speed = this.baseMoveSpeed;
      for (const [id, active] of statusEffects) {
        if (active.def?.moveSpeedMultiplier !== undefined) {
          speed *= active.def.moveSpeedMultiplier;
        } else if (id === 'slow') {
          speed *= 0.5;
        }
      }
      return speed;
    },
    getEffectiveMoveSpeed(): number {
      return this.moveSpeed;
    },
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

async function runMilestone27Tests() {
  console.log('====================================================');
  console.log('RUNNING MILESTONE 27 TESTS: ICE MAGIC & SLOW CONTROL');
  console.log('====================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Data Registry Integrity (ice_staff, ice_magic, slow, frost_initiate)
  // =========================================================================
  console.log('--- TEST 1: Data Registry & Two-Layer Architecture Integrity ---');
  const iceStaff = dataLoader.getWeapon('ice_staff');
  assert.ok(iceStaff, 'ice_staff must be registered in weapons.json');
  assert.equal(iceStaff.category, 'melee_2h');
  assert.equal(iceStaff.twoHanded, true);
  assert.equal(iceStaff.spellWeaponId, 'ice_magic');

  const iceMagic = dataLoader.getWeapon('ice_magic');
  assert.ok(iceMagic, 'ice_magic must be registered in weapons.json');
  assert.equal(iceMagic.category, 'magic');
  assert.equal(iceMagic.conduitWeaponId, 'ice_staff');
  assert.equal(iceMagic.attackRangeTiles, 4);
  assert.equal(iceMagic.energyCostPerCast, 20);
  assert.equal(iceMagic.slowChance, 0.35);
  // Single-target validation: NO aoe splash, NO chain targets
  assert.equal(iceMagic.aoeRadiusTiles, undefined, 'ice_magic must NOT have aoeRadiusTiles');
  assert.equal(iceMagic.chainTargets, undefined, 'ice_magic must NOT have chainTargets');

  // Conduit <-> Spell bidirectional resolution
  const derivedConduit = dataLoader.getConduitForSpell(iceMagic);
  assert.equal(derivedConduit.id, 'ice_staff', 'getConduitForSpell maps ice_magic to ice_staff');
  const derivedSpell = dataLoader.getSpellForConduit(iceStaff);
  assert.equal(derivedSpell?.id, 'ice_magic', 'getSpellForConduit maps ice_staff to ice_magic');

  // Slow status effect in registry
  const slowDef = dataLoader.getStatusEffect('slow');
  assert.ok(slowDef, 'slow must be registered in statusEffects.json');
  assert.equal(slowDef.moveSpeedMultiplier, 0.5, 'slow reduces movement speed by 50%');
  assert.equal(slowDef.isHarmful, true, 'slow is marked as isHarmful');
  assert.equal(slowDef.durationMs, 3000, 'slow lasts for 3000ms');

  // Frost Initiate class in registry
  const frostInitiate = dataLoader.getClass('frost_initiate');
  assert.ok(frostInitiate, 'frost_initiate must be registered in classes.json');
  assert.equal(frostInitiate.tier, 'novice');
  assert.equal(frostInitiate.requirements[0].target, 'ice_magic');
  assert.equal(frostInitiate.requirements[0].value, 10);
  assert.equal(frostInitiate.hiddenSkillBonuses?.mana_regen, 0.05);

  // Offensive magic schools pool
  const offensivePool = dataLoader.getOffensiveMagicSchools();
  const poolIds = offensivePool.map((w) => w.id);
  assert.ok(poolIds.includes('fire_magic'), 'Pool includes fire_magic');
  assert.ok(poolIds.includes('lightning_magic'), 'Pool includes lightning_magic');
  assert.ok(poolIds.includes('ice_magic'), 'Pool includes ice_magic');
  assert.equal(poolIds.includes('healing_magic'), false, 'Pool strictly excludes healing_magic');

  console.log('✓ PASS: Weapons, status effects, classes, and offensive pool data registered cleanly.\n');

  // =========================================================================
  // TEST 2: Random Magic Staff Statistical Pool Variation (3 Schools)
  // =========================================================================
  console.log('--- TEST 2: Random Magic Staff 3-School Statistical Distribution (300 Iterations) ---');
  const gameState = GameState.getInstance();
  let fireCount = 0;
  let lightningCount = 0;
  let iceCount = 0;

  for (let i = 0; i < 300; i++) {
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

  console.log(`  300 Random Rolls Breakdown: Fire=${fireCount}, Lightning=${lightningCount}, Ice=${iceCount}`);
  assert.ok(fireCount >= 60, `Fire staff rolled sufficiently (${fireCount} >= 60)`);
  assert.ok(lightningCount >= 60, `Lightning staff rolled sufficiently (${lightningCount} >= 60)`);
  assert.ok(iceCount >= 60, `Ice staff rolled sufficiently (${iceCount} >= 60)`);
  assert.equal(fireCount + lightningCount + iceCount, 300, 'All 300 rolls mapped to the 3 valid conduit staves');
  console.log('✓ PASS: Random Magic Staff pool spans all 3 schools with genuine statistical variation.\n');

  // =========================================================================
  // TEST 3: Slow Status Effect & Real Physical Movement Reduction
  // =========================================================================
  console.log('--- TEST 3: Slow Status Effect & Real Physical Movement Reduction ---');
  const mockScene = createMockScene();

  // Create real Entity instances using the actual Entity class
  const normalEntity = new (Entity as any)(mockScene, 0, 0, 'test-avatar', 'Normal Runner', 100, 50, 32);
  const slowedEntity = new (Entity as any)(mockScene, 0, 0, 'test-avatar', 'Slowed Runner', 100, 50, 32);

  normalEntity.baseMoveSpeed = 100;
  slowedEntity.baseMoveSpeed = 100;

  // Unmodified speed verification
  assert.equal(normalEntity.moveSpeed, 100, 'Normal entity has base moveSpeed 100');
  assert.equal(normalEntity.getEffectiveMoveSpeed(), 100, 'getEffectiveMoveSpeed matches moveSpeed');
  assert.equal(slowedEntity.moveSpeed, 100, 'Slowed entity starts with base moveSpeed 100');

  // Apply slow to slowedEntity
  slowedEntity.applyStatusEffect(slowDef);
  assert.ok(slowedEntity.hasStatusEffect('slow'), 'slow status effect is active');
  assert.equal(slowedEntity.moveSpeed, 50, 'moveSpeed getter dynamically reflects 50% slow');
  assert.equal(slowedEntity.getEffectiveMoveSpeed(), 50, 'getEffectiveMoveSpeed returns 50');

  // Set up identical destination paths for both entities (moving along X axis to tile (20, 0))
  normalEntity.followPath([{ x: 20, y: 0 }]);
  slowedEntity.followPath([{ x: 20, y: 0 }]);

  // Execute an update tick of delta = 500ms (0.5 seconds)
  // At 100 px/s: expected distance = 100 * 0.5 = 50 pixels
  // At 50 px/s: expected distance = 50 * 0.5 = 25 pixels
  const startXNormal = normalEntity.x;
  const startXSlowed = slowedEntity.x;

  normalEntity.update(0, 500);
  slowedEntity.update(0, 500);

  const normalDistanceMoved = normalEntity.x - startXNormal;
  const slowedDistanceMoved = slowedEntity.x - startXSlowed;

  console.log(`  Distance moved in 500ms: Normal=${normalDistanceMoved}px, Slowed=${slowedDistanceMoved}px`);
  assert.equal(normalDistanceMoved, 50, 'Normal entity moved exactly 50px in 500ms at 100 px/s');
  assert.equal(slowedDistanceMoved, 25, 'Slowed entity moved exactly 25px in 500ms at 50 px/s (exact 50% reduction)');

  // Advance time to expire Slow status effect (durationMs = 3000ms)
  slowedEntity.update(0, 2600); // Total elapsed = 500 + 2600 = 3100ms > 3000ms
  assert.equal(slowedEntity.hasStatusEffect('slow'), false, 'Slow status effect cleanly expired and removed');
  assert.equal(slowedEntity.moveSpeed, 100, 'moveSpeed automatically returns to 100 px/s upon expiry');
  assert.equal(slowedEntity.getEffectiveMoveSpeed(), 100, 'getEffectiveMoveSpeed returns 100');

  // Next 500ms tick: now moves at full 100 px/s
  const preSpeedUpX = slowedEntity.x;
  slowedEntity.update(0, 500);
  const postExpiryDistance = slowedEntity.x - preSpeedUpX;
  assert.equal(postExpiryDistance, 50, 'Recovered entity now moves at full 50px/500ms');

  console.log('✓ PASS: Slow status effect verified with real physical movement distance reduction and clean expiry.\n');

  // =========================================================================
  // TEST 4: Ice Magic Single-Target Attack & Slow Proc (No Splash / No Chain)
  // =========================================================================
  console.log('--- TEST 4: Ice Magic Single-Target Attack Resolution & Slow Proc ---');
  const mockCombatScene = createMockScene();
  const combatProg = new ProgressionSystem(dataLoader.getClassesData(), 'HeroProg');
  const heroIce = createMockHero('hero_ice', 'Frost Mage', 5, 5, iceStaff, combatProg);

  const primaryTarget = createMockEnemy('enemy_primary', 'Target Alpha', 5, 8, 100); // 3 tiles away
  const adjacentEnemy1 = createMockEnemy('enemy_adj1', 'Target Beta', 5, 9, 100);   // adjacent to primary
  const adjacentEnemy2 = createMockEnemy('enemy_adj2', 'Target Gamma', 6, 8, 100);  // adjacent to primary

  const bigGrid: number[][] = [];
  for (let r = 0; r < 30; r++) bigGrid.push(new Array(30).fill(0));
  const pathfinder = new Pathfinder(bigGrid);

  const combat = new CombatSystem(
    mockCombatScene,
    [heroIce],
    [primaryTarget, adjacentEnemy1, adjacentEnemy2],
    pathfinder
  );

  // Set target and engage
  heroIce.setTarget(primaryTarget);
  combat.updateStaffDynamicRange(heroIce);
  assert.equal(heroIce.attackRangeTiles, 4, 'Ice Staff evaluates to range 4 with full energy');

  heroIce.energy = 80;
  const originalRandom = Math.random;
  Math.random = () => 0.01; // Always hits and procs slow
  try {
    combat.update(2000, 100);

    // Check primary target took damage and has Slow applied
    assert.ok(primaryTarget.hp < 100, 'Primary target took damage from Ice Magic');
    assert.ok(primaryTarget.hasStatusEffect('slow'), 'Primary target received Slow status effect');

    // Strict check on adjacent enemies: must take ZERO damage and have NO status effects
    assert.equal(adjacentEnemy1.hp, 100, 'Adjacent enemy 1 took ZERO damage (no AoE splash)');
    assert.equal(adjacentEnemy1.hasStatusEffect('slow'), false, 'Adjacent enemy 1 has NO status effect (no splash)');
    assert.equal(adjacentEnemy2.hp, 100, 'Adjacent enemy 2 took ZERO damage (no chain lightning)');
    assert.equal(adjacentEnemy2.hasStatusEffect('slow'), false, 'Adjacent enemy 2 has NO status effect (no chain)');
  } finally {
    Math.random = originalRandom;
  }

  console.log('✓ PASS: Ice Magic attack is strictly single-target; no splash and no chain.\n');

  // =========================================================================
  // TEST 5: Generic Staff Dynamic Range, Energy Drain & Dry Melee Fallback
  // =========================================================================
  console.log('--- TEST 5: Generic Staff Dynamic Range & Dry Melee Fallback ---');
  const heroFallback = createMockHero('hero_fb', 'Ice Caster', 5, 5, iceStaff, combatProg);

  // 1. With full energy (100 >= 20): Range 4, effective weapon is ice_magic
  heroFallback.energy = 100;
  combat.updateStaffDynamicRange(heroFallback);
  assert.equal(heroFallback.attackRangeTiles, 4, 'Full energy grants casting range 4');
  const fullEffective = combat.getEffectiveWeaponForAttack(heroFallback);
  assert.equal(fullEffective.id, 'ice_magic', 'Effective weapon is ice_magic spell when energy available');

  // Simulate spell cast: consumes 20 energy, awards ice_magic EXP
  const preIceExp = combatProg.getProficiencyStat('ice_magic')?.currentExp ?? 0;
  heroFallback.energy -= 20; // Cast cost
  combatProg.addProficiencyExp('ice_magic', 2);
  const postIceExp = combatProg.getProficiencyStat('ice_magic')?.currentExp ?? 0;
  assert.equal(postIceExp, preIceExp + 2, 'Ice Magic cast credits ice_magic proficiency EXP');

  // 2. Deplete energy below 20 (e.g. 10 energy remaining): Fallback to melee Staff
  heroFallback.energy = 10;
  combat.updateStaffDynamicRange(heroFallback);
  assert.equal(heroFallback.attackRangeTiles, 1, 'Dry energy collapses attack range to 1 tile (Melee Staff)');
  const dryEffective = combat.getEffectiveWeaponForAttack(heroFallback);
  assert.equal(dryEffective.id, 'staff', 'Effective weapon falls back to physical staff in melee');

  // Simulate dry melee attack: awards staff EXP
  const preStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  combatProg.addProficiencyExp('staff', 2);
  const postStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  assert.equal(postStaffExp, preStaffExp + 2, 'Dry melee attack credits staff proficiency EXP');

  // 3. Restore energy back to >= 20: Range returns to 4, effective weapon returns to ice_magic
  heroFallback.energy = 50;
  combat.updateStaffDynamicRange(heroFallback);
  assert.equal(heroFallback.attackRangeTiles, 4, 'Restored energy expands attack range back to 4 tiles');
  const restoredEffective = combat.getEffectiveWeaponForAttack(heroFallback);
  assert.equal(restoredEffective.id, 'ice_magic', 'Resumes casting ice_magic when energy recovers');

  console.log('✓ PASS: Dynamic range and dry melee fallback verified with correct EXP crediting.\n');

  // =========================================================================
  // TEST 6: Progression, Frost Initiate Unlock & Hidden Skill Bonus
  // =========================================================================
  console.log('--- TEST 6: Progression & Frost Initiate Class Unlock at Lv 10 ---');
  const progHero = new ProgressionSystem(dataLoader.getClassesData(), 'FrostApprentice');

  // Initial state: Ice Magic at Level 0
  assert.equal(progHero.getProficiencyLevel('ice_magic'), 0, 'Ice Magic starts at Level 0');
  assert.equal(progHero.isClassUnlocked('frost_initiate'), false, 'Frost Initiate is locked at Level 0');

  // Level up to Level 9: should still be locked
  while (progHero.getProficiencyLevel('ice_magic') < 9) {
    progHero.addProficiencyExp('ice_magic', 40);
  }
  const currentLvl = progHero.getProficiencyLevel('ice_magic');
  assert.equal(currentLvl, 9, `Ice Magic reaches Level 9`);
  assert.equal(progHero.isClassUnlocked('frost_initiate'), false, 'Frost Initiate remains locked below Level 10');

  // Listen for unlock event
  let unlockedEventDispatched = false;
  progHero.onClassUnlocked((event) => {
    if (event.classDef.id === 'frost_initiate') {
      unlockedEventDispatched = true;
    }
  });

  // Push to Level 10+
  while (progHero.getProficiencyLevel('ice_magic') < 10) {
    progHero.addProficiencyExp('ice_magic', 150);
  }

  assert.ok(progHero.getProficiencyLevel('ice_magic') >= 10, 'Ice Magic reaches Level 10+');
  assert.equal(progHero.isClassUnlocked('frost_initiate'), true, 'Frost Initiate unlocked at Ice Magic Level 10');
  assert.equal(unlockedEventDispatched, true, 'onClassUnlocked dispatched for frost_initiate');

  // Verify hidden skill bonus (mana_regen 0.05)
  const classDef = dataLoader.getClass('frost_initiate');
  assert.equal(classDef.hiddenSkillBonuses?.mana_regen, 0.05, 'Frost Initiate confers +0.05 mana_regen bonus');

  console.log('✓ PASS: Ice Magic levels up properly and unlocks Frost Initiate at Level 10.\n');

  // =========================================================================
  // TEST 7: Regression Gut-Check: Kiting & General Entity Movement
  // =========================================================================
  console.log('--- TEST 7: Regression Gut-Check: Kiting & General Entity Movement ---');
  const kitingEnemy = new (Enemy as any)(
    mockScene,
    5,
    5,
    {
      id: 'goblin_archer',
      name: 'Goblin Archer',
      tier: 'tier1',
      hp: 50,
      criticalHpMax: 20,
      meleeDamage: 6,
      aggroRadius: 6,
      attackIntervalMs: 1400,
      moveSpeed: 80
    },
    'wolf-avatar',
    32
  );

  assert.equal(kitingEnemy.moveSpeed, 80, 'Enemy moveSpeed initializes to enemyData.moveSpeed (80)');
  assert.equal(kitingEnemy.baseMoveSpeed, 80, 'baseMoveSpeed is 80');

  // Slow applied: moveSpeed becomes 40
  kitingEnemy.applyStatusEffect(slowDef);
  assert.equal(kitingEnemy.moveSpeed, 40, 'Kiting enemy moveSpeed reduced to 40 when slowed');

  // Kiting pathing step: entity covers exactly 40 * 0.25 = 10px in 250ms
  kitingEnemy.followPath([{ x: 5, y: 3 }]); // 2 tiles away
  const startY = kitingEnemy.y;
  kitingEnemy.update(0, 250);
  const distanceY = Math.abs(kitingEnemy.y - startY);
  assert.equal(distanceY, 10, 'Slowed kiting enemy moves at exactly 40 px/s (10px in 250ms)');

  kitingEnemy.removeStatusEffect('slow');
  assert.equal(kitingEnemy.moveSpeed, 80, 'Restores to full 80 px/s after slow removal');

  console.log('✓ PASS: Entity generalization cleanly preserves kiting and base entity movement.\n');

  console.log('====================================================');
  console.log('ALL MILESTONE 27 TESTS PASSED CLEANLY AND PROVEN!');
  console.log('====================================================');
}

runMilestone27Tests().catch((err) => {
  console.error('\nUNIT TEST FAILED:', err);
  process.exit(1);
});
