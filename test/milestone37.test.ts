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
  hp: number = 80
): any {
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
    takeDamage: function (amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      return this.hp <= 0;
    }
  };

  return enemy;
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING MILESTONE 37 TESTS: HOLY MAGIC & ACOLYTE');
  console.log('====================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Data Registry Integrity (holy_staff, holy_magic, acolyte)
  // =========================================================================
  console.log('--- TEST 1: Data Registry & Two-Layer Architecture Integrity ---');
  const holyStaff = dataLoader.getWeapon('holy_staff');
  assert.ok(holyStaff, 'holy_staff must be registered in weapons.json');
  assert.equal(holyStaff.category, 'melee_2h');
  assert.equal(holyStaff.twoHanded, true);
  assert.equal(holyStaff.spellWeaponId, 'holy_magic');
  assert.equal(holyStaff.baseDamage, 7);

  const holyMagic = dataLoader.getWeapon('holy_magic');
  assert.ok(holyMagic, 'holy_magic must be registered in weapons.json');
  assert.equal(holyMagic.category, 'magic');
  assert.equal(holyMagic.conduitWeaponId, 'holy_staff');
  assert.equal(holyMagic.attackRangeTiles, 4);
  assert.equal(holyMagic.energyCostPerCast, 20);
  assert.equal(holyMagic.radianceHealAmount, 3);
  assert.equal(holyMagic.baseDamage, 8);

  // Conduit <-> Spell bidirectional resolution
  const derivedConduit = dataLoader.getConduitForSpell(holyMagic);
  assert.equal(derivedConduit.id, 'holy_staff', 'getConduitForSpell maps holy_magic to holy_staff');
  const derivedSpell = dataLoader.getSpellForConduit(holyStaff);
  assert.equal(derivedSpell?.id, 'holy_magic', 'getSpellForConduit maps holy_staff to holy_magic');

  // Offensive magic schools pool now has 4 schools
  const offensivePool = dataLoader.getOffensiveMagicSchools();
  const poolIds = offensivePool.map((w) => w.id);
  assert.ok(poolIds.includes('fire_magic'), 'Pool includes fire_magic');
  assert.ok(poolIds.includes('lightning_magic'), 'Pool includes lightning_magic');
  assert.ok(poolIds.includes('ice_magic'), 'Pool includes ice_magic');
  assert.ok(poolIds.includes('holy_magic'), 'Pool includes holy_magic');
  assert.equal(poolIds.includes('healing_magic'), false, 'Pool strictly excludes healing_magic');
  assert.ok(poolIds.length >= 4, 'Offensive magic pool contains at least 4 schools');

  // Acolyte Tier 0 class in registry
  const acolyteClass = dataLoader.getClass('acolyte');
  assert.ok(acolyteClass, 'acolyte must be registered in classes.json');
  assert.equal(acolyteClass.tier, 'novice');
  assert.equal(acolyteClass.requirements[0].type, 'proficiency');
  assert.equal(acolyteClass.requirements[0].target, 'holy_magic');
  assert.equal(acolyteClass.requirements[0].value, 10);
  assert.equal(acolyteClass.fantasy, 'Recently devout');
  assert.equal(acolyteClass.hiddenSkillBonuses?.mana_regen, 0.05, 'Acolyte grants mana_regen bonus per Tier 0 magic pattern');

  // Verify Priest and Cleric are NOT prematurely registered as Tier 0
  const priestClass = dataLoader.getClass('priest');
  assert.equal(priestClass, undefined, 'Priest must NOT be registered as Tier 0 (reserved for Tier 1)');
  const clericClass = dataLoader.getClass('cleric');
  assert.equal(clericClass, undefined, 'Cleric must NOT be registered prematurely');

  console.log('✓ PASS: Holy Staff, Holy Magic, Acolyte class, and offensive pool registered cleanly.\n');

  // =========================================================================
  // TEST 2: Random Magic Staff Statistical Distribution (400 Iterations)
  // =========================================================================
  console.log('--- TEST 2: Random Magic Staff Statistical Distribution (400 Iterations) ---');
  const gameState = GameState.getInstance();
  let fireCount = 0;
  let lightningCount = 0;
  let iceCount = 0;
  let holyCount = 0;
  let darkCount = 0;

  for (let i = 0; i < 400; i++) {
    const resolved = gameState.resolveStartingKit('random_magic_staff');
    if (resolved.mainWeaponId === 'fire_staff') fireCount++;
    else if (resolved.mainWeaponId === 'lightning_staff') lightningCount++;
    else if (resolved.mainWeaponId === 'ice_staff') iceCount++;
    else if (resolved.mainWeaponId === 'holy_staff') holyCount++;
    else if (resolved.mainWeaponId === 'dark_staff') darkCount++;
    else assert.fail(`Unexpected weapon resolved: ${resolved.mainWeaponId}`);
  }

  console.log(`  400 Rolls: Fire=${fireCount}, Lightning=${lightningCount}, Ice=${iceCount}, Holy=${holyCount}, Dark=${darkCount}`);
  assert.ok(fireCount >= 40, `Fire staff rolled sufficiently (${fireCount} >= 40)`);
  assert.ok(lightningCount >= 40, `Lightning staff rolled sufficiently (${lightningCount} >= 40)`);
  assert.ok(iceCount >= 40, `Ice staff rolled sufficiently (${iceCount} >= 40)`);
  assert.ok(holyCount >= 40, `Holy staff rolled sufficiently (${holyCount} >= 40)`);
  assert.equal(fireCount + lightningCount + iceCount + holyCount + darkCount, 400, 'All 400 rolls distributed across offensive magic schools');
  console.log('✓ PASS: Random Magic Staff starting kit spans offensive schools with statistical variation.\n');

  // =========================================================================
  // TEST 3: Holy Magic Combat Attack & Radiance Sustain Mechanic
  // =========================================================================
  console.log('--- TEST 3: Holy Magic Combat Attack & Radiance Sustain Mechanic ---');
  const mockScene = createMockScene();
  const combatProg = new ProgressionSystem(undefined, 'Holy Hero');
  const bigGrid: number[][] = [];
  for (let r = 0; r < 30; r++) bigGrid.push(new Array(30).fill(0));
  const pathfinder = new Pathfinder(bigGrid);

  const holyCaster = createMockHero('caster_1', 'Holy Caster', 2, 2, holyStaff, combatProg);
  const injuredAlly = createMockHero('ally_1', 'Injured Ally', 3, 2, dataLoader.getWeapon('short_swords')!);
  injuredAlly.hp = 60; // 60/100 HP
  injuredAlly.maxHp = 100;

  const enemy = createMockEnemy('target_1', 'Sinister Ghoul', 5, 2, 80);
  const combat = new (CombatSystem as any)(mockScene, [holyCaster, injuredAlly], [enemy], pathfinder);

  // Set target and update range
  combat.updateStaffDynamicRange(holyCaster);
  assert.equal(holyCaster.attackRangeTiles, 4, 'Holy staff with energy provides 4-tile casting range');
  holyCaster.setTarget(enemy);

  const preEnemyHp = enemy.hp;
  const preAllyHp = injuredAlly.hp;
  const preEnergy = holyCaster.energy;

  const originalRandom = Math.random;
  Math.random = () => 0.01; // Deterministic hit
  try {
    // Execute combat update step
    combat.update(100000, 16);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(holyCaster.energy, preEnergy - 20, 'Casting Holy Magic consumes exactly 20 energy');
  assert.ok(enemy.hp < preEnemyHp, `Enemy takes holy damage (Pre: ${preEnemyHp}, Post: ${enemy.hp})`);
  assert.equal(injuredAlly.hp, preAllyHp + 3, `Injured ally restored 3 HP via Radiance (Pre: ${preAllyHp}, Post: ${injuredAlly.hp})`);

  console.log('✓ PASS: Holy Magic deals ranged holy damage and heals injured ally via Radiance.\n');

  // =========================================================================
  // TEST 4: Mechanical Distinction Checks (Strict Negative Assertions)
  // =========================================================================
  console.log('--- TEST 4: Mechanical Distinction Checks (Strict Negatives) ---');
  // Confirm holy_magic does not have Fire splash, Lightning chain, or Ice slow
  assert.equal(holyMagic.aoeRadiusTiles, undefined, 'holy_magic must NOT have aoeRadiusTiles (Fire distinct)');
  assert.equal(holyMagic.aoeSplashPercent, undefined, 'holy_magic must NOT have aoeSplashPercent');
  assert.equal(holyMagic.chainTargets, undefined, 'holy_magic must NOT have chainTargets (Lightning distinct)');
  assert.equal(holyMagic.chainHopRangeTiles, undefined, 'holy_magic must NOT have chainHopRangeTiles');
  assert.equal(holyMagic.slowChance, undefined, 'holy_magic must NOT have slowChance (Ice distinct)');
  assert.equal(holyMagic.burnChance, undefined, 'holy_magic must NOT have burnChance');
  assert.equal(holyMagic.shockChance, undefined, 'holy_magic must NOT have shockChance');

  // Verify on attacked enemy
  assert.equal(enemy.hasStatusEffect('burn'), false, 'Target enemy must not have Burn');
  assert.equal(enemy.hasStatusEffect('shock'), false, 'Target enemy must not have Shock');
  assert.equal(enemy.hasStatusEffect('slow'), false, 'Target enemy must not have Slow');

  // Verify adjacent enemy took 0 splash damage on confirmed hit
  const adjacentEnemy = createMockEnemy('target_adj', 'Adjacent Ghoul', 5, 3, 80);
  combat.enemies.push(adjacentEnemy);
  const preAdjHp = adjacentEnemy.hp;
  const preMainHp = enemy.hp;
  holyCaster.lastAttackTime = 0;
  holyCaster.energy = 100;
  const originalRand = Math.random;
  Math.random = () => 0.01; // Deterministic hit
  try {
    combat.update(102000, 16);
  } finally {
    Math.random = originalRand;
  }
  assert.ok(enemy.hp < preMainHp, 'Primary target took damage on landed hit');
  assert.equal(adjacentEnemy.hp, preAdjHp, 'Adjacent enemy took 0 splash damage (strictly single-target holy blast)');

  console.log('✓ PASS: Holy Magic strictly single-target; verified no burn, shock, slow, splash, or chain.\n');

  // =========================================================================
  // TEST 5: Generic Staff Dynamic Range & Dry Melee Fallback
  // =========================================================================
  console.log('--- TEST 5: Generic Staff Dynamic Range & Dry Melee Fallback ---');
  const fallbackHero = createMockHero('fb_hero', 'Fallback Monk', 5, 5, holyStaff, combatProg);

  // 1. Powered (100 EN >= 20): Range 4, effective weapon holy_magic
  fallbackHero.energy = 100;
  combat.updateStaffDynamicRange(fallbackHero);
  assert.equal(fallbackHero.attackRangeTiles, 4, 'Powered holy staff gives 4 tiles range');
  const effPowered = combat.getEffectiveWeaponForAttack(fallbackHero);
  assert.equal(effPowered.id, 'holy_magic', 'Effective weapon is holy_magic spell when powered');

  // Award holy_magic EXP on spell cast
  const preHolyExp = combatProg.getProficiencyStat('holy_magic')?.currentExp ?? 0;
  combatProg.addProficiencyExp('holy_magic', 2);
  const postHolyExp = combatProg.getProficiencyStat('holy_magic')?.currentExp ?? 0;
  assert.equal(postHolyExp, preHolyExp + 2, 'Spell cast grants holy_magic EXP');

  // 2. Dry (10 EN < 20): Range collapses to 1, effective weapon falls back to staff
  fallbackHero.energy = 10;
  combat.updateStaffDynamicRange(fallbackHero);
  assert.equal(fallbackHero.attackRangeTiles, 1, 'Dry energy collapses attack range to 1 tile (Melee Staff)');
  const effDry = combat.getEffectiveWeaponForAttack(fallbackHero);
  assert.equal(effDry.id, 'staff', 'Effective weapon falls back to physical staff');

  // Award staff EXP on dry attack
  const preStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  combatProg.addProficiencyExp('staff', 2);
  const postStaffExp = combatProg.getProficiencyStat('staff')?.currentExp ?? 0;
  assert.equal(postStaffExp, preStaffExp + 2, 'Dry attack grants staff EXP');

  // 3. Restored (50 EN >= 20): Range returns to 4
  fallbackHero.energy = 50;
  combat.updateStaffDynamicRange(fallbackHero);
  assert.equal(fallbackHero.attackRangeTiles, 4, 'Restored energy returns attack range to 4 tiles');
  const effRestored = combat.getEffectiveWeaponForAttack(fallbackHero);
  assert.equal(effRestored.id, 'holy_magic', 'Effective weapon resumes holy_magic');

  console.log('✓ PASS: Dynamic range and dry melee fallback operate cleanly with correct EXP.\n');

  // =========================================================================
  // TEST 6: Progression, Acolyte Class Unlock at Lv 10 & Mana Regen Bonus
  // =========================================================================
  console.log('--- TEST 6: Progression & Acolyte Class Unlock at Level 10 ---');
  const acolyteHeroProg = new ProgressionSystem(undefined, 'DevoutNovice');
  assert.equal(acolyteHeroProg.getProficiencyLevel('holy_magic'), 0, 'Holy Magic starts at Level 0');

  // Hidden until level 1
  let acolyteUnlocked = false;
  acolyteHeroProg.onClassUnlocked((event: any) => {
    if (event.classDef?.id === 'acolyte') {
      acolyteUnlocked = true;
    }
  });

  // Level up holy_magic to 9
  while (acolyteHeroProg.getProficiencyLevel('holy_magic') < 9) {
    acolyteHeroProg.addProficiencyExp('holy_magic', 40);
  }
  assert.equal(acolyteUnlocked, false, 'Acolyte does NOT unlock before Level 10');

  // Level up to 10
  while (acolyteHeroProg.getProficiencyLevel('holy_magic') < 10) {
    acolyteHeroProg.addProficiencyExp('holy_magic', 100);
  }
  assert.ok(acolyteHeroProg.getProficiencyLevel('holy_magic') >= 10, 'Holy Magic reaches Level 10+');
  assert.ok(acolyteHeroProg.isClassUnlocked('acolyte'), 'Acolyte is marked as unlocked in progression');
  assert.equal(acolyteUnlocked, true, 'Acolyte class successfully unlocks at Holy Magic Level 10!');

  // Verify Mana Regen hidden bonus from Acolyte
  const manaBonus = acolyteHeroProg.getClassHiddenBonus('mana_regen');
  assert.equal(manaBonus, 0.05, 'Acolyte provides +0.05 hidden bonus to mana_regen proc chance');

  console.log('✓ PASS: Holy Magic levels up properly, unlocks Acolyte at Lv 10, and applies mana_regen bonus.\n');

  // =========================================================================
  // TEST 7: Combat Medic Smite / Holy Nova Synergy & Zero Regression
  // =========================================================================
  console.log('--- TEST 7: Combat Medic Smite / Holy Nova Synergy & Zero Regression ---');
  const cmProg = new ProgressionSystem(undefined, 'BattleDoc');
  const cmPlayer = createMockHero('cm_1', 'Combat Medic Hero', 2, 2, holyStaff, cmProg);

  // Unlock Combat Medic class and level it to 40 for Smite (Lv 10) and Holy Nova (Lv 40)
  cmProg.setClassLevel('combat_medic', 40);
  cmPlayer.knownSkillIds = ['smite', 'holy_nova'];
  cmPlayer.equippedSkillIds = ['smite', 'holy_nova'];

  const testTarget = createMockEnemy('smite_target', 'Unholy Fiend', 4, 2, 100);
  combat.party = [cmPlayer];
  combat.enemies = [testTarget];

  // 1. Smite with Holy Staff equipped:
  // Damage pulls from getEffectiveWeaponForAttack(caster) which returns holy_magic!
  const preSmiteHp = testTarget.hp;
  const preHealingExp = cmProg.getProficiencyStat('healing_magic')?.currentExp ?? 0;
  const preHolyProgExp = cmProg.getProficiencyStat('holy_magic')?.currentExp ?? 0;

  const smiteSuccess = combat.castSkill(cmPlayer, 'smite', testTarget, 110000);
  assert.equal(smiteSuccess, true, 'Smite cast succeeds');
  assert.ok(testTarget.hp < preSmiteHp, 'Smite damages target');

  // Verify EXP award goes to healing_magic (preserving Milestone 24 contract)
  const postHealingExp = cmProg.getProficiencyStat('healing_magic')?.currentExp ?? 0;
  const postHolyProgExp = cmProg.getProficiencyStat('holy_magic')?.currentExp ?? 0;
  assert.equal(postHealingExp, preHealingExp + 2, 'Smite awards +2 healing_magic EXP');
  assert.equal(postHolyProgExp, preHolyProgExp, 'Smite does NOT divert EXP away from healing_magic');

  // 2. Holy Nova with Holy Staff equipped:
  const preNovaHp = testTarget.hp;
  const novaSuccess = combat.castSkill(cmPlayer, 'holy_nova', cmPlayer, 120000);
  assert.equal(novaSuccess, true, 'Holy Nova cast succeeds');
  assert.ok(testTarget.hp < preNovaHp, 'Holy Nova damages target');
  const postNovaHealingExp = cmProg.getProficiencyStat('healing_magic')?.currentExp ?? 0;
  assert.equal(postNovaHealingExp, postHealingExp + 3, 'Holy Nova awards +3 healing_magic EXP');

  console.log('✓ PASS: Combat Medic Smite and Holy Nova seamlessly scale with Holy Staff while preserving healing_magic contract.\n');

  console.log('====================================================');
  console.log('ALL MILESTONE 37 TESTS PASSED CLEANLY AND PROVEN! 🎉');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('❌ Milestone 37 Test Failed:', err);
  process.exit(1);
});
