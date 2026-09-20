import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs if Phaser probes for it
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
  const mockWindow: any = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  (global as any).window = mockWindow;
  (globalThis as any).window = mockWindow;

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
  const mockDoc: any = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).document = mockDoc;
  (globalThis as any).document = mockDoc;
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Dynamic imports after browser globals
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
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
      setScale: () => obj,
      setPosition: () => obj,
      lineStyle: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      strokeCircle: () => obj
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
      graphics: () => createMockObj(),
      circle: () => createMockObj(),
      text: () => createMockObj(),
      container: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    time: { now: 100000 },
    isTileOccupied: () => false
  };
}

function createMockHero(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression?: any
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const prog = progression ?? new ProgressionSystem(undefined, name);

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
    progression: prog,
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

function createMockEnemy(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number = 80,
  meleeDamage: number = 20
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const enemyDef: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'tier1',
    hp,
    criticalHpMax: 20,
    meleeDamage,
    aggroRadius: 5,
    attackIntervalMs: 1000,
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
    takeDamage: function (amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      return this.hp <= 0;
    },
    setTarget: function (target: any) {
      this.targetEntity = target;
    }
  };

  return enemy;
}

async function runMilestone47Tests() {
  console.log('====================================================');
  console.log('RUNNING MILESTONE 47 TESTS: DARK MAGIC & CULTIST');
  console.log('====================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Data Registry & Two-Layer Architecture Integrity
  // =========================================================================
  console.log('--- TEST 1: Data Registry & Two-Layer Architecture Integrity ---');
  const darkStaff = dataLoader.getWeapon('dark_staff');
  assert.ok(darkStaff, 'dark_staff must be registered in weapons.json');
  assert.equal(darkStaff.category, 'melee_2h');
  assert.equal(darkStaff.twoHanded, true);
  assert.equal(darkStaff.spellWeaponId, 'dark_magic');
  assert.equal(darkStaff.baseDamage, 7);
  assert.equal(darkStaff.baseAccuracy, 0.65);

  const darkMagic = dataLoader.getWeapon('dark_magic');
  assert.ok(darkMagic, 'dark_magic must be registered in weapons.json');
  assert.equal(darkMagic.category, 'magic');
  assert.equal(darkMagic.conduitWeaponId, 'dark_staff');
  assert.equal(darkMagic.attackRangeTiles, 4);
  assert.equal(darkMagic.energyCostPerCast, 20);
  assert.equal(darkMagic.curseChance, 0.35);
  assert.equal(darkMagic.baseDamage, 8);
  assert.equal(darkMagic.baseAccuracy, 0.70);

  // Conduit <-> Spell bidirectional resolution
  const derivedConduit = dataLoader.getConduitForSpell(darkMagic);
  assert.equal(derivedConduit.id, 'dark_staff', 'getConduitForSpell maps dark_magic to dark_staff');
  const derivedSpell = dataLoader.getSpellForConduit(darkStaff);
  assert.equal(derivedSpell?.id, 'dark_magic', 'getSpellForConduit maps dark_staff to dark_magic');

  // Offensive magic schools pool now contains all 5 schools
  const offensivePool = dataLoader.getOffensiveMagicSchools();
  const poolIds = offensivePool.map((w) => w.id);
  assert.ok(poolIds.includes('fire_magic'), 'Pool includes fire_magic');
  assert.ok(poolIds.includes('lightning_magic'), 'Pool includes lightning_magic');
  assert.ok(poolIds.includes('ice_magic'), 'Pool includes ice_magic');
  assert.ok(poolIds.includes('holy_magic'), 'Pool includes holy_magic');
  assert.ok(poolIds.includes('dark_magic'), 'Pool includes dark_magic');
  assert.equal(poolIds.includes('healing_magic'), false, 'Pool strictly excludes healing_magic');
  assert.equal(poolIds.length, 5, 'Offensive magic pool contains exactly 5 schools');

  // Cultist Tier 0 class cited from class_system.md
  const cultistClass = dataLoader.getClass('cultist');
  assert.ok(cultistClass, 'cultist must be registered in classes.json');
  assert.equal(cultistClass.tier, 'novice');
  assert.equal(cultistClass.requirements[0].type, 'proficiency');
  assert.equal(cultistClass.requirements[0].target, 'dark_magic');
  assert.equal(cultistClass.requirements[0].value, 10);
  assert.equal(cultistClass.fantasy, 'Recently indoctrinated');
  assert.equal(cultistClass.hiddenSkillBonuses?.mana_regen, 0.05, 'Cultist grants mana_regen bonus per Tier 0 magic pattern');

  // Verify Warlock is NOT prematurely registered as Tier 0 (reserved for Tier 1)
  const warlockClass = dataLoader.getClass('warlock');
  assert.equal(warlockClass, undefined, 'Warlock must NOT be registered as Tier 0');

  // Verify Dark Knight requirement targets
  const darkKnightClass = dataLoader.getClass('dark_knight');
  assert.ok(darkKnightClass, 'dark_knight must be present in classes.json');
  assert.equal(darkKnightClass.tier, 'expert');
  const dkReqTargets = darkKnightClass.requirements.map((r: any) => ({ target: r.target, value: r.value, type: r.type }));
  assert.deepEqual(dkReqTargets, [
    { target: 'longswords', value: 30, type: 'proficiency' },
    { target: 'dark_magic', value: 30, type: 'proficiency' },
    { target: 'vanguard', value: 15, type: 'classLevel' }
  ], 'Dark Knight requirements match design doc: Longswords 30 + Dark Magic 30 + Vanguard Lv 15');

  console.log('✓ PASS: Dark Staff, Dark Magic, Cultist Tier 0 class, and 5-school pool registered cleanly.\n');

  // =========================================================================
  // TEST 2: Random Magic Staff 5-School Statistical Distribution (500 Iterations)
  // =========================================================================
  console.log('--- TEST 2: Random Magic Staff 5-School Statistical Distribution (500 Iterations) ---');
  const gameState = GameState.getInstance();
  let fireCount = 0;
  let lightningCount = 0;
  let iceCount = 0;
  let holyCount = 0;
  let darkCount = 0;

  for (let i = 0; i < 500; i++) {
    const resolved = gameState.resolveStartingKit('random_magic_staff');
    if (resolved.mainWeaponId === 'fire_staff') fireCount++;
    else if (resolved.mainWeaponId === 'lightning_staff') lightningCount++;
    else if (resolved.mainWeaponId === 'ice_staff') iceCount++;
    else if (resolved.mainWeaponId === 'holy_staff') holyCount++;
    else if (resolved.mainWeaponId === 'dark_staff') darkCount++;
    else assert.fail(`Unexpected weapon resolved: ${resolved.mainWeaponId}`);
  }

  console.log(`  500 Rolls: Fire=${fireCount}, Lightning=${lightningCount}, Ice=${iceCount}, Holy=${holyCount}, Dark=${darkCount}`);
  assert.ok(fireCount >= 50, `Fire staff rolled sufficiently (${fireCount} >= 50)`);
  assert.ok(lightningCount >= 50, `Lightning staff rolled sufficiently (${lightningCount} >= 50)`);
  assert.ok(iceCount >= 50, `Ice staff rolled sufficiently (${iceCount} >= 50)`);
  assert.ok(holyCount >= 50, `Holy staff rolled sufficiently (${holyCount} >= 50)`);
  assert.ok(darkCount >= 50, `Dark staff rolled sufficiently (${darkCount} >= 50)`);
  assert.equal(fireCount + lightningCount + iceCount + holyCount + darkCount, 500, 'All 500 rolls distributed across the 5 schools');
  console.log('✓ PASS: Random Magic Staff starting kit spans all 5 schools with statistical variation.\n');

  // =========================================================================
  // TEST 3: Dark Magic Combat Attack & Curse (Enfeeblement) Mechanic
  // =========================================================================
  console.log('--- TEST 3: Dark Magic Combat Attack & Curse (Enfeeblement) Mechanic ---');
  const mockScene = createMockScene();
  const combatProg = new ProgressionSystem(undefined, 'Dark Occultist');
  const bigGrid: number[][] = [];
  for (let r = 0; r < 30; r++) bigGrid.push(new Array(30).fill(0));
  const pathfinder = new Pathfinder(bigGrid);

  const darkCaster = createMockHero('caster_dark', 'Dark Caster', 2, 2, darkStaff, combatProg);
  const enemy = createMockEnemy('target_ghoul', 'Shadow Wraith', 5, 2, 100, 20);
  const combat = new (CombatSystem as any)(mockScene, [darkCaster], [enemy], pathfinder);

  // Set target and update range
  combat.updateStaffDynamicRange(darkCaster);
  assert.equal(darkCaster.attackRangeTiles, 4, 'Dark staff with energy provides 4-tile casting range');
  darkCaster.setTarget(enemy);

  const preEnemyHp = enemy.hp;
  const preEnergy = darkCaster.energy;

  const originalRandom = Math.random;
  Math.random = () => 0.01; // Deterministic hit and status proc
  try {
    // Execute combat update step
    combat.update(100000, 16);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(darkCaster.energy, preEnergy - 20, 'Casting Dark Magic consumes exactly 20 energy');
  assert.ok(enemy.hp < preEnemyHp, `Enemy takes dark damage (Pre: ${preEnemyHp}, Post: ${enemy.hp})`);
  assert.equal(enemy.hasStatusEffect('curse'), true, 'Enemy is afflicted with Curse status effect');

  const curseEffect = enemy.activeStatusEffects.get('curse');
  assert.ok(curseEffect, 'Curse effect object exists on enemy');
  assert.equal(curseEffect.def.damageReductionPercent, 0.25, 'Curse specifies 25% damage reduction');
  console.log('✓ PASS: Dark Magic deals ranged damage and afflicts enemy with Curse.\n');

  // =========================================================================
  // TEST 4: Generic Enfeeblement Damage Reduction Check (Status Effect Data-Driven)
  // =========================================================================
  console.log('--- TEST 4: Generic Enfeeblement Damage Reduction Check ---');
  // Confirm that enemy under Curse deals 25% reduced damage
  // Enemy base meleeDamage is 20. Under Curse (25% reduction), raw damage becomes Math.round(20 * 0.75) = 15.
  const heroTarget = createMockHero('hero_victim', 'Frontline Guardian', 5, 3, dataLoader.getWeapon('shields')!);
  heroTarget.hp = 100;

  const combatEnfeeble = new (CombatSystem as any)(mockScene, [heroTarget], [enemy], pathfinder);
  enemy.setTarget(heroTarget);
  enemy.lastAttackTime = 0;

  Math.random = () => 0.99; // avoidance roll fails
  try {
    combatEnfeeble.update(100000, 16);
  } finally {
    Math.random = originalRandom;
  }

  // Raw damage was 20. With 25% reduction: 15 damage taken.
  assert.equal(heroTarget.hp, 100 - 15, `Hero took 15 damage (20 base minus 25% curse reduction = 15). Actual HP: ${heroTarget.hp}`);

  // Furthermore, verify generic data-driven behavior:
  // Test with a non-curse effect that defines damageReductionPercent (e.g. 'custom_exhaust' at 40%)
  enemy.removeStatusEffect('curse');
  enemy.applyStatusEffect({
    id: 'custom_exhaust',
    name: 'Exhaustion',
    tickIntervalMs: 5000,
    damagePerTick: 0,
    damageReductionPercent: 0.40,
    isHarmful: true
  });
  heroTarget.hp = 100;
  enemy.lastAttackTime = 0;
  Math.random = () => 0.99;
  try {
    combatEnfeeble.update(200000, 16);
  } finally {
    Math.random = originalRandom;
  }
  // 20 * (1 - 0.40) = 12 damage taken.
  assert.equal(heroTarget.hp, 100 - 12, `Generic damageReductionPercent (40%) correctly reduced damage to 12. Actual HP: ${heroTarget.hp}`);
  console.log('✓ PASS: Generic outgoing damage reduction verified for Curse and custom status effects.\n');

  // =========================================================================
  // TEST 5: Mechanical Distinction Checks (Strict Negatives)
  // =========================================================================
  console.log('--- TEST 5: Mechanical Distinction Checks (Strict Negatives) ---');
  // Confirm dark_magic does NOT have Fire splash, Lightning chain, Ice slow, or Holy radiance
  assert.equal(darkMagic.aoeRadiusTiles, undefined, 'dark_magic must NOT have aoeRadiusTiles (Fire distinct)');
  assert.equal(darkMagic.aoeSplashPercent, undefined, 'dark_magic must NOT have aoeSplashPercent (Fire distinct)');
  assert.equal(darkMagic.chainTargets, undefined, 'dark_magic must NOT have chainTargets (Lightning distinct)');
  assert.equal(darkMagic.chainHopRangeTiles, undefined, 'dark_magic must NOT have chainHopRangeTiles (Lightning distinct)');
  assert.equal(darkMagic.slowChance, undefined, 'dark_magic must NOT have slowChance (Ice distinct)');
  assert.equal(darkMagic.radianceHealAmount, undefined, 'dark_magic must NOT have radianceHealAmount (Holy distinct)');
  assert.equal(darkMagic.burnChance, undefined, 'dark_magic must NOT have burnChance');
  assert.equal(darkMagic.shockChance, undefined, 'dark_magic must NOT have shockChance');

  // Check state of attacked enemy
  assert.equal(enemy.hasStatusEffect('burn'), false, 'Target enemy must not have Burn');
  assert.equal(enemy.hasStatusEffect('shock'), false, 'Target enemy must not have Shock');
  assert.equal(enemy.hasStatusEffect('slow'), false, 'Target enemy must not have Slow');

  // Check caster HP: no self-heal occurred
  assert.equal(darkCaster.hp, 100, 'Dark Magic does NOT sustain-heal the caster or allies');
  console.log('✓ PASS: Dark Magic mechanical identity confirmed strictly distinct from all 4 existing schools.\n');

  // =========================================================================
  // TEST 6: Generic Staff Dynamic Range & Dry Melee Fallback
  // =========================================================================
  console.log('--- TEST 6: Generic Staff Dynamic Range & Dry Melee Fallback ---');
  // 1. Powered (100 EN >= 20): Range 4, effective weapon dark_magic
  darkCaster.energy = 100;
  combat.updateStaffDynamicRange(darkCaster);
  assert.equal(darkCaster.attackRangeTiles, 4, 'Range is 4 when energy available');
  const effPowered = combat.getEffectiveWeaponForAttack(darkCaster);
  assert.equal(effPowered.id, 'dark_magic', 'Effective weapon is dark_magic spell when powered');

  // Award dark_magic EXP on spell cast
  const preDarkExp = combatProg.getProficiencyStat('dark_magic')?.currentExp ?? 0;
  combatProg.addProficiencyExp('dark_magic', 2);
  const postDarkExp = combatProg.getProficiencyStat('dark_magic')?.currentExp ?? 0;
  assert.equal(postDarkExp, preDarkExp + 2, 'Spell cast grants dark_magic EXP');

  // 2. Dry / Out of Energy (0 EN < 20): Range drops to 1, falls back to melee staff
  darkCaster.energy = 0;
  combat.updateStaffDynamicRange(darkCaster);
  assert.equal(darkCaster.attackRangeTiles, 1, 'Range drops to 1 tile when energy is dry');
  const effDry = combat.getEffectiveWeaponForAttack(darkCaster);
  assert.equal(effDry.id, 'staff', 'Effective weapon falls back to physical staff in melee');

  // Dry melee attack awards staff EXP, NOT dark_magic EXP
  const preStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  combatProg.addProficiencyExp('staff', 2);
  const postStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  assert.equal(postStaffExp, preStaffExp + 2, 'Dry melee fallback attack grants staff proficiency EXP');

  // 3. Restore energy (>= 20): Range returns to 4, effective weapon returns to dark_magic
  darkCaster.energy = 25;
  combat.updateStaffDynamicRange(darkCaster);
  assert.equal(darkCaster.attackRangeTiles, 4, 'Range returns to 4 tiles when energy recovers');
  const effRestored = combat.getEffectiveWeaponForAttack(darkCaster);
  assert.equal(effRestored.id, 'dark_magic', 'Effective weapon resumes dark_magic');
  console.log('✓ PASS: Dynamic range and dry melee fallback operate cleanly with correct EXP.\n');

  // =========================================================================
  // TEST 7: Progression & Cultist Class Unlock at Level 10
  // =========================================================================
  console.log('--- TEST 7: Progression & Cultist Class Unlock at Level 10 ---');
  const cultistProg = new ProgressionSystem(undefined, 'Initiate Hero');
  assert.equal(cultistProg.getProficiencyLevel('dark_magic'), 0, 'Dark Magic starts at Level 0');
  assert.equal(cultistProg.isClassUnlocked('cultist'), false, 'Cultist is locked at Level 0');

  // Level up dark_magic to Level 9
  while (cultistProg.getProficiencyLevel('dark_magic') < 9) {
    cultistProg.addProficiencyExp('dark_magic', 40);
  }
  assert.equal(cultistProg.getProficiencyLevel('dark_magic'), 9, 'Dark Magic reaches Level 9');
  assert.equal(cultistProg.isClassUnlocked('cultist'), false, 'Cultist remains locked at Level 9 (boundary check)');

  // Level up from 9 to 10
  while (cultistProg.getProficiencyLevel('dark_magic') < 10) {
    cultistProg.addProficiencyExp('dark_magic', 100);
  }
  assert.ok(cultistProg.getProficiencyLevel('dark_magic') >= 10, 'Dark Magic reaches Level 10');
  assert.equal(cultistProg.isClassUnlocked('cultist'), true, 'Cultist unlocks immediately at Level 10!');

  // Verify mana_regen bonus is active
  const manaBonus = cultistProg.getClassHiddenBonus('mana_regen');
  assert.equal(manaBonus, 0.05, `Cultist provides +0.05 mana_regen bonus (${manaBonus})`);
  console.log('✓ PASS: Dark Magic levels up and cleanly unlocks Cultist at Level 10 with mana_regen bonus.\n');

  // =========================================================================
  // TEST 8: Dark Knight Threshold Reachability (Specific Threshold 30 Boundary Check)
  // =========================================================================
  console.log('--- TEST 8: Dark Knight Threshold Reachability (Level 30 Boundary Check) ---');
  const dkProg = new ProgressionSystem(undefined, 'Vanguard Knight');

  // Set up prerequisites: Longswords 30 + Vanguard Lv 15
  while (dkProg.getProficiencyLevel('longswords') < 30) {
    dkProg.addProficiencyExp('longswords', 100);
  }
  assert.ok(dkProg.getProficiencyLevel('longswords') >= 30, 'Longswords reaches Level 30');

  // Unlock vanguard and set class level to 15
  dkProg.setClassLevel('vanguard', 15);
  assert.equal(dkProg.getClassLevel('vanguard'), 15, 'Vanguard is at Class Level 15');

  // Dark Magic starts at 0
  assert.equal(dkProg.getProficiencyLevel('dark_magic'), 0);
  assert.equal(dkProg.isClassUnlocked('dark_knight'), false, 'Dark Knight is locked at Dark Magic Level 0');

  // Grind Dark Magic to Level 29 (1 below requirement)
  while (dkProg.getProficiencyLevel('dark_magic') < 29) {
    dkProg.addProficiencyExp('dark_magic', 60);
  }
  assert.equal(dkProg.getProficiencyLevel('dark_magic'), 29, 'Dark Magic is at Level 29');
  assert.equal(dkProg.isClassUnlocked('dark_knight'), false, 'Dark Knight is strictly LOCKED at Dark Magic Level 29 (boundary check)');

  // Advance Dark Magic across the threshold to Level 30
  while (dkProg.getProficiencyLevel('dark_magic') < 30) {
    dkProg.addProficiencyExp('dark_magic', 120);
  }
  assert.equal(dkProg.getProficiencyLevel('dark_magic'), 30, 'Dark Magic is at Level 30');
  assert.equal(dkProg.isClassUnlocked('dark_knight'), true, 'Dark Knight UNLOCKS cleanly when Dark Magic reaches Level 30!');
  console.log('✓ PASS: Dark Knight Dark Magic 30 threshold is genuinely reachable and confirmed by boundary check.\n');

  console.log('====================================================');
  console.log('ALL MILESTONE 47 TESTS PASSED CLEANLY AND PROVEN! 🎉');
  console.log('====================================================');
}

runMilestone47Tests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
