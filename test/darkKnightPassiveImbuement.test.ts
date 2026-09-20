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

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef, ClassDef } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };

function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);

  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {}
    }, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => obj;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      }
    });
    return obj;
  };

  return {
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      text: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    }
  };
}

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem,
  activeClass: string | null = 'dark_knight'
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const lastSkillUseTimes = new Map<string, number>();
  const autocastMap = new Map<string, boolean>();

  const player: any = {
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
    state: 'idle',
    activeClass,
    equippedWeapon: weapon,
    offhandWeapon: null as WeaponDef | null,
    targetEntity: null as any,
    lastAttackTime: 0,
    attackRangeTiles: weapon.attackRangeTiles ?? (weapon.category === 'ranged' ? 4 : 1),
    progression,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    autocastMap,
    lastSkillUseTimes,
    activeStatusEffects: statusEffects,
    bookLearnedSkills: new Set<string>(),

    isDualWielding: () => player.offhandWeapon !== null,
    hasShield: () => false,
    isSkillLearnedFromBook: (skillId: string) => player.bookLearnedSkills.has(skillId),
    isAutocastEnabled: (skillId: string) => {
      if (!player.autocastMap.has(skillId)) return true;
      return player.autocastMap.get(skillId) === true;
    },
    hasStatusEffect: (effId: string) => player.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      player.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000,
        shieldHp: effDef.shieldAmount
      });
    },
    removeStatusEffect: (effId: string) => player.activeStatusEffects.delete(effId),
    setGridPosition: (gx: number, gy: number) => {
      player.gridPos = { x: gx, y: gy };
      player.x = gx * tileSize + tileSize / 2;
      player.y = gy * tileSize + tileSize / 2;
    },
    setTarget: (target: any) => {
      player.targetEntity = target;
    },
    clearTarget: () => {
      player.targetEntity = null;
    },
    isMoving: () => false,
    stopMovement: () => {},
    heal: (amt: number) => {
      player.hp = Math.min(player.maxHp, player.hp + amt);
      return amt;
    }
  };

  return player;
}

function createMockEnemy(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number = 200,
  enemyData: Partial<EnemyDef> = {}
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const fullEnemyData: EnemyDef = {
    id,
    name,
    tier: 'basic',
    hp,
    meleeDamage: 10,
    aggroRadius: 5,
    attackIntervalMs: 1000,
    moveSpeed: 50,
    harvest: [],
    ...enemyData
  } as EnemyDef;

  const enemy: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    spawnPos: { x, y },
    maxLeashDistance: 10,
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 0,
    maxCriticalHp: 0,
    state: 'idle',
    enemyData: fullEnemyData,
    activeStatusEffects: statusEffects,
    lastAttackTime: 0,
    isAggroed: true,

    hasStatusEffect: (effId: string) => enemy.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      enemy.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000
      });
    },
    removeStatusEffect: (effId: string) => enemy.activeStatusEffects.delete(effId),
    isStunned: () => enemy.activeStatusEffects.has('stun'),
    isMoving: () => false,
    stopMovement: () => {},
    setGridPosition: (gx: number, gy: number) => {
      enemy.gridPos = { x: gx, y: gy };
      enemy.x = gx * tileSize + tileSize / 2;
      enemy.y = gy * tileSize + tileSize / 2;
    },
    takeDamage: (amount: number) => {
      let damageRemaining = amount;
      const exposeEffect = enemy.activeStatusEffects.get('expose');
      if (exposeEffect) {
        const amp = exposeEffect.def?.damageAmplificationPercent ?? 0.25;
        damageRemaining *= (1 + amp);
      }
      enemy.hp = Math.max(0, enemy.hp - damageRemaining);
      if (enemy.hp <= 0) {
        enemy.state = 'dead';
        return true;
      }
      return false;
    }
  };

  return enemy;
}

async function runDarkKnightPassiveImbuementTests() {
  console.log('================================================================');
  console.log('🌑 DARK KNIGHT PASSIVE ATTACK IMBUEMENT, CURSE & DUAL EXP TESTS ⚔️');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const dataLoader = DataLoader.getInstance();

  const longswords = dataLoader.getWeapon('longswords')!;
  const darkStaff = dataLoader.getWeapon('dark_staff')!;
  const daggers = dataLoader.getWeapon('daggers')!;
  assert.ok(longswords, 'longswords weapon exists in weapons.json');
  assert.ok(darkStaff, 'dark_staff weapon exists in weapons.json');

  // ============================================================================
  // TEST 0: Prerequisite Audit Verification (Class Level 100 Progression)
  // ============================================================================
  console.log('--- TEST 0: Prerequisite Audit Verification (Class Level 100 Progression) ---');
  {
    const prog = new ProgressionSystem(classesData, 'AuditHero');
    prog.setClassLevel('dark_knight', 1);
    assert.equal(prog.getClassLevel('dark_knight'), 1, 'Dark Knight starts at Lv 1');

    // Confirm LevelingSystem formula matches continuous 100 curve
    assert.equal(LevelingSystem.expForNextLevel(1), 54);
    assert.equal(LevelingSystem.expForNextLevel(40), 210);
    assert.equal(LevelingSystem.expForNextLevel(99), 446);

    prog.setClassLevel('dark_knight', 100);
    assert.equal(prog.getClassLevel('dark_knight'), 100, 'Dark Knight reaches Level 100 accurately');

    console.log('✓ PASS: Class Level 100 progression verified clean.\n');
  }

  // ============================================================================
  // TEST 1: Generic Passive Imbuement Data Definition in classes.json
  // ============================================================================
  console.log('--- TEST 1: Generic Passive Imbuement Data Definition in classes.json ---');
  {
    const dkClassDef = dataLoader.getClass('dark_knight');
    assert.ok(dkClassDef, 'dark_knight definition loaded');
    assert.ok(dkClassDef.passiveImbuement, 'dark_knight has passiveImbuement block');
    assert.equal(dkClassDef.passiveImbuement.bonusDamagePercent, 0.10, 'bonusDamagePercent is +10%');
    assert.equal(dkClassDef.passiveImbuement.proc?.statusEffectId, 'curse', 'proc statusEffectId is curse');
    assert.equal(dkClassDef.passiveImbuement.proc?.baseChance, 0.05, 'baseChance is 5% at Lv 1');
    assert.equal(dkClassDef.passiveImbuement.proc?.maxChance, 0.50, 'maxChance is 50% at Lv 100');
    assert.equal(dkClassDef.passiveImbuement.proc?.scalingStat, 'classLevel', 'scalingStat is classLevel');
    assert.equal(dkClassDef.passiveImbuement.secondaryExp?.proficiency, 'dark_magic', 'secondary proficiency is dark_magic');
    assert.equal(dkClassDef.passiveImbuement.secondaryExp?.exp, 1, 'secondaryExp is 1 EXP');

    console.log('✓ PASS: Dark Knight passiveImbuement correctly configured in classes.json.\n');
  }

  // ============================================================================
  // TEST 2: Basic Attack +10% Flat Bonus Damage (Distinct from M48 Hybrid Scaling)
  // ============================================================================
  console.log('--- TEST 2: Basic Attack +10% Bonus Damage (Distinct from M48 Hybrid Scaling) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);

    // Player with NO active class (has learned dark knight skills, but class is inactive)
    const progNoClass = new ProgressionSystem(classesData, 'No Class Hero');
    progNoClass.setClassLevel('dark_knight', 1);
    progNoClass.getProficiencyStat('longswords').level = 30;
    progNoClass.getProficiencyStat('dark_magic').level = 30;
    const playerNoClass = createMockPlayer('p-noclass', 'No Class', 5, 5, longswords, progNoClass, null);

    // Player with Dark Knight active class (Level 1)
    const progDK = new ProgressionSystem(classesData, 'Dark Knight Hero');
    progDK.setClassLevel('dark_knight', 1);
    progDK.getProficiencyStat('longswords').level = 30;
    progDK.getProficiencyStat('dark_magic').level = 30;
    const playerDK = createMockPlayer('p-dk', 'Dark Knight', 5, 5, longswords, progDK, 'dark_knight');

    const enemyA = createMockEnemy('enemy-a', 'Target A', 6, 5, 200);
    const enemyB = createMockEnemy('enemy-b', 'Target B', 6, 5, 200);

    // Deterministic hit roll
    const originalRandom = Math.random;
    Math.random = () => 0.001; // Always hits, never misses

    try {
      combat.executePlayerBasicAttack(playerNoClass, enemyA, 1000);
      combat.executePlayerBasicAttack(playerDK, enemyB, 1000);
    } finally {
      Math.random = originalRandom;
    }

    const dmgNoClass = 200 - enemyA.hp;
    const dmgDK = 200 - enemyB.hp;

    console.log(` - Baseline basic attack damage (no active class): ${dmgNoClass.toFixed(2)}`);
    console.log(` - Dark Knight basic attack damage (+10% imbuement): ${dmgDK.toFixed(2)}`);

    // Verify exactly +10% bonus damage
    const expectedDmgDK = dmgNoClass * 1.10;
    assert.equal(dmgDK.toFixed(2), expectedDmgDK.toFixed(2), 'Dark Knight basic attack deals exactly +10% damage');

    // TEST DISTINCTNESS: Basic attack does NOT get M48's +0.15 * partner level bonus!
    // If M48 hybrid scaling were applied to basic attacks, it would add 30 * 0.15 = +4.5 damage.
    // Confirm dmgDK does NOT have +4.5:
    assert.notEqual(dmgDK.toFixed(2), (expectedDmgDK + 4.5).toFixed(2), 'Basic attack does not erroneously gain M48 hybrid skill bonus');

    // TEST DISTINCTNESS IN REVERSE: M48 Skill attacks do NOT get +10% basic attack bonus!
    const enemyC = createMockEnemy('enemy-c', 'Target C', 6, 5, 200);
    const enemyD = createMockEnemy('enemy-d', 'Target D', 6, 5, 200);

    combat.castSkill(playerNoClass, 'rending_cut', enemyC);
    combat.castSkill(playerDK, 'rending_cut', enemyD);

    const skillDmgNoClass = 200 - enemyC.hp;
    const skillDmgDK = 200 - enemyD.hp;

    // Both cast rending_cut. Both have 30 longsword & 30 dark magic.
    // In M48, skill damage is base * mult + partnerLevel * 0.15.
    // They deal the EXACT same skill damage because +10% imbuement only applies to basic attacks!
    assert.equal(skillDmgDK.toFixed(2), skillDmgNoClass.toFixed(2), 'M48 skill attack does not receive basic attack +10% imbuement');

    console.log('✓ PASS: +10% bonus damage confirmed on basic attacks, strictly distinct from M48 skill scaling.\n');
  }

  // ============================================================================
  // TEST 3: Continuous Class-Level-Scaling Curse Proc Chance Curve
  // ============================================================================
  console.log('--- TEST 3: Continuous Class-Level-Scaling Curse Proc Chance Curve ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const dkClassDef = dataLoader.getClass('dark_knight')!;
    const procDef = dkClassDef.passiveImbuement!.proc!;

    // Test the 7 distinct points across the continuous curve
    const testPoints = [
      { level: 1, expected: 0.05, label: 'Level 1 (Low endpoint)' },
      { level: 12, expected: 0.10, label: 'Level 12 (Low curve)' },
      { level: 34, expected: 0.20, label: 'Level 34 (Low-mid curve)' },
      { level: 50, expected: 0.05 + (49 / 99) * 0.45, label: 'Level 50 (Mid curve exact ~27.27%)' },
      { level: 56, expected: 0.30, label: 'Level 56 (Mid curve)' },
      { level: 78, expected: 0.40, label: 'Level 78 (Mid-high curve)' },
      { level: 100, expected: 0.50, label: 'Level 100 (High endpoint)' }
    ];

    for (const pt of testPoints) {
      const chance = combat.calculatePassiveProcChance(procDef, pt.level);
      assert.equal(
        Number(chance.toFixed(4)),
        Number(pt.expected.toFixed(4)),
        `Proc chance at ${pt.label} must be ${(pt.expected * 100).toFixed(2)}% (got ${(chance * 100).toFixed(2)}%)`
      );
      console.log(` - ${pt.label}: ${(chance * 100).toFixed(2)}% proc chance`);
    }

    // SPECIFICITY AXIS TEST: Confirm proc chance scales ONLY with Dark Knight's Class Level,
    // NOT weapon level, and NOT Dark Magic proficiency level.
    const progAxis = new ProgressionSystem(classesData, 'Axis Hero');

    // Case 3A: Class Level 1, Weapon Level 99, Dark Magic Level 99
    progAxis.setClassLevel('dark_knight', 1);
    progAxis.getProficiencyStat('longswords').level = 99;
    progAxis.getProficiencyStat('dark_magic').level = 99;
    const playerLv1HighProf = createMockPlayer('p-lv1-high', 'DK Lv1 High Prof', 5, 5, longswords, progAxis);

    const chanceLv1 = combat.calculatePassiveProcChance(procDef, progAxis.getClassLevel(playerLv1HighProf.activeClass));
    assert.equal(Number(chanceLv1.toFixed(4)), 0.05, 'Proc chance at DK Class Lv 1 is 5% regardless of Lv 99 weapon and Lv 99 Dark Magic');

    // Case 3B: Class Level 100, Weapon Level 0, Dark Magic Level 0
    progAxis.setClassLevel('dark_knight', 100);
    progAxis.getProficiencyStat('longswords').level = 0;
    progAxis.getProficiencyStat('dark_magic').level = 0;
    const playerLv100LowProf = createMockPlayer('p-lv100-low', 'DK Lv100 Low Prof', 5, 5, longswords, progAxis);

    const chanceLv100 = combat.calculatePassiveProcChance(procDef, progAxis.getClassLevel(playerLv100LowProf.activeClass));
    assert.equal(Number(chanceLv100.toFixed(4)), 0.50, 'Proc chance at DK Class Lv 100 is 50% regardless of Lv 0 weapon and Lv 0 Dark Magic');

    // Case 3C: Verify in-combat Curse application on target
    const enemyTarget = createMockEnemy('curse-dummy', 'Curse Dummy', 6, 5, 200);
    const originalRandom = Math.random;
    Math.random = () => 0.02; // Under 0.05 threshold
    try {
      combat.executePlayerBasicAttack(playerLv1HighProf, enemyTarget, 2000);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(enemyTarget.hasStatusEffect('curse'), true, 'Enemy received Curse status effect from basic attack');
    const curseEff = enemyTarget.activeStatusEffects.get('curse');
    assert.equal(curseEff.def.damageReductionPercent, 0.25, 'Curse has 25% damage reduction effect');

    console.log('✓ PASS: Continuous scaling curve verified across all 7 points; independent of weapon/magic level.\n');
  }

  // ============================================================================
  // TEST 4: Dual Proficiency EXP Split (+2 Weapon, +1 Dark Magic = +3 Total)
  // ============================================================================
  console.log('--- TEST 4: Dual Proficiency EXP Split (+2 Weapon, +1 Dark Magic = +3 Total) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Exp Split Hero');
    prog.setClassLevel('dark_knight', 1);

    // Initial EXP: 0 on both
    assert.equal(prog.getProficiencyStat('longswords').currentExp, 0);
    assert.equal(prog.getProficiencyStat('dark_magic').currentExp, 0);

    const player = createMockPlayer('p-split', 'Split DK', 5, 5, longswords, prog, 'dark_knight');
    const enemy = createMockEnemy('dummy-exp', 'Exp Dummy', 6, 5, 500);

    const originalRandom = Math.random;
    Math.random = () => 0.01; // Deterministic hit
    try {
      combat.executePlayerBasicAttack(player, enemy, 1000);
    } finally {
      Math.random = originalRandom;
    }

    const wpnExp = prog.getProficiencyStat('longswords').currentExp;
    const darkExp = prog.getProficiencyStat('dark_magic').currentExp;
    const totalExpGranted = wpnExp + darkExp;

    console.log(` - Equipped weapon (Longsword) EXP gained: +${wpnExp}`);
    console.log(` - Secondary (Dark Magic) EXP gained: +${darkExp}`);
    console.log(` - Total EXP gained on the hit: +${totalExpGranted}`);

    assert.equal(wpnExp, 2, 'Equipped weapon received full +2 EXP');
    assert.equal(darkExp, 1, 'Dark Magic received reduced split +1 EXP');
    assert.equal(totalExpGranted, 3, 'CONFIRMED SPLIT: Total EXP is +3 (+2 + 1), NOT doubled (+4)');

    // Ensure skills do NOT grant secondary Dark Magic EXP
    const preDarkSkillExp = prog.getProficiencyStat('dark_magic').currentExp;
    combat.castSkill(player, 'rending_cut', enemy);
    const postDarkSkillExp = prog.getProficiencyStat('dark_magic').currentExp;
    assert.equal(postDarkSkillExp, preDarkSkillExp, 'Skill does NOT award secondary Dark Magic EXP');

    console.log('✓ PASS: Dual proficiency EXP awarded simultaneously as genuine split (+2/+1 = +3 total).\n');
  }

  // ============================================================================
  // TEST 5: Generic Data-Driven Proof (Synthetic Dummy Class: Flame Warden)
  // ============================================================================
  console.log('--- TEST 5: Generic Data-Driven Proof (Synthetic Dummy Class: Flame Warden) ---');
  {
    // Define synthetic dummy class with completely different values:
    // +25% bonus damage, 'burn' proc (15% to 75%), secondary exp to 'fire_magic' (+1)
    const flameWardenDef: ClassDef = {
      id: 'flame_warden',
      name: 'Flame Warden',
      tier: 'specialist',
      requirements: [],
      fantasy: 'Warrior imbued with primordial fire',
      passiveImbuement: {
        bonusDamagePercent: 0.25,
        proc: {
          statusEffectId: 'burn',
          baseChance: 0.15,
          maxChance: 0.75,
          scalingStat: 'classLevel',
          minLevel: 1,
          maxLevel: 100
        },
        secondaryExp: {
          proficiency: 'fire_magic',
          exp: 1,
          share: 0.5
        }
      }
    };

    // Inject synthetic class into ClassesData without modifying classes.json or engine code
    const customClassesData = {
      classes: [...classesData.classes, flameWardenDef]
    };

    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const progFW = new ProgressionSystem(customClassesData as any, 'Flame Hero');
    progFW.setClassLevel('flame_warden', 1);

    // Retrieve imbuement generically via ProgressionSystem and CombatSystem
    const imbuement = progFW.getActivePassiveImbuement('flame_warden');
    assert.ok(imbuement, 'ProgressionSystem retrieves passiveImbuement generically for flame_warden');
    assert.equal(imbuement?.bonusDamagePercent, 0.25);
    assert.equal(imbuement?.proc?.statusEffectId, 'burn');

    // 5A: Test Flame Warden proc chance curve (15% at Lv 1, 75% at Lv 100)
    const fwProcDef = imbuement!.proc!;
    const fwChanceLv1 = combat.calculatePassiveProcChance(fwProcDef, 1);
    const fwChanceLv100 = combat.calculatePassiveProcChance(fwProcDef, 100);
    const fwChanceLv50 = combat.calculatePassiveProcChance(fwProcDef, 50);

    assert.equal(Number(fwChanceLv1.toFixed(2)), 0.15, 'Flame Warden Lv 1 proc chance is 15%');
    assert.equal(Number(fwChanceLv100.toFixed(2)), 0.75, 'Flame Warden Lv 100 proc chance is 75%');
    const expectedMid = 0.15 + (49 / 99) * (0.75 - 0.15);
    assert.equal(Number(fwChanceLv50.toFixed(4)), Number(expectedMid.toFixed(4)), 'Flame Warden Lv 50 proc chance matches linear interpolation');

    // 5B: Test in-combat basic attack under Flame Warden:
    // Verify +25% bonus damage, Burn proc application, and +1 fire_magic EXP
    const playerFW = createMockPlayer('p-fw', 'Flame Warden', 5, 5, longswords, progFW, 'flame_warden');
    const enemyFW = createMockEnemy('enemy-fw', 'Flame Dummy', 6, 5, 200);

    const originalRandom = Math.random;
    Math.random = () => 0.05; // Hits (0.05 < acc) and procs burn (0.05 < 0.15)
    try {
      combat.executePlayerBasicAttack(playerFW, enemyFW, 1000);
    } finally {
      Math.random = originalRandom;
    }

    // Check damage (+25% bonus)
    const dmgFW = 200 - enemyFW.hp;
    const moodTierFW = dataLoader.getMoodTier(playerFW.mood);
    const expectedDmgFW = (longswords.baseDamage * moodTierFW.combatDamageMultiplier) * 1.25;
    assert.equal(dmgFW.toFixed(2), expectedDmgFW.toFixed(2), 'Flame Warden dealt exactly +25% bonus damage');

    // Check Burn status effect procced
    assert.equal(enemyFW.hasStatusEffect('burn'), true, 'Flame Warden procced Burn status effect');

    // Check dual EXP awarded to fire_magic (+1) and longswords (+2)
    assert.equal(progFW.getProficiencyStat('longswords').currentExp, 2, 'Equipped weapon received +2 EXP');
    assert.equal(progFW.getProficiencyStat('fire_magic').currentExp, 1, 'Secondary fire_magic received +1 EXP');

    console.log('✓ PASS: Synthetic dummy class (Flame Warden) works completely generically with zero dark_knight checks.\n');
  }

  // ============================================================================
  // TEST 6: Single Authoritative Pipeline in combat.update()
  // ============================================================================
  console.log('--- TEST 6: Single Authoritative Pipeline in combat.update() ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Pipeline Hero');
    prog.setClassLevel('dark_knight', 50);

    const player = createMockPlayer('p-pipe', 'Pipeline DK', 5, 5, longswords, prog, 'dark_knight');
    const enemy = createMockEnemy('enemy-pipe', 'Pipeline Dummy', 6, 5, 200);
    enemy.lastAttackTime = 10000; // on cooldown so dummy does not trigger player counterattacks
    combat.party = [player];
    combat.enemies = [enemy];
    player.setTarget(enemy);

    const originalRandom = Math.random;
    Math.random = () => 0.01; // Guaranteed hit & proc
    try {
      // Execute standard game loop update
      combat.update(10000, 16);
    } finally {
      Math.random = originalRandom;
    }

    // Confirm that combat.update() executed through the exact same imbuement logic
    const dmg = 200 - enemy.hp;
    const moodTierPipe = dataLoader.getMoodTier(player.mood);
    const expectedDmgPipe = (longswords.baseDamage * moodTierPipe.combatDamageMultiplier) * 1.10;
    assert.equal(dmg.toFixed(2), expectedDmgPipe.toFixed(2), 'combat.update() applied +10% bonus damage');
    assert.equal(enemy.hasStatusEffect('curse'), true, 'combat.update() procced Curse');
    assert.equal(prog.getProficiencyStat('longswords').currentExp, 2, 'combat.update() awarded weapon EXP');
    assert.equal(prog.getProficiencyStat('dark_magic').currentExp, 1, 'combat.update() awarded secondary Dark Magic EXP');

    console.log('✓ PASS: combat.update() delegates to single authoritative pipeline cleanly without drift.\n');
  }

  // ============================================================================
  // TEST 7: Dual Wielding Offhand Passive Imbuement Integration
  // ============================================================================
  console.log('--- TEST 7: Dual Wielding Offhand Passive Imbuement Integration ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DW DK Hero');
    prog.setClassLevel('dark_knight', 50);

    const player = createMockPlayer('p-dw', 'DW DK', 5, 5, longswords, prog, 'dark_knight');
    player.offhandWeapon = daggers; // Dual wielding Longsword + Dagger
    const enemy = createMockEnemy('enemy-dw', 'DW Dummy', 6, 5, 300);
    enemy.lastAttackTime = 10000;
    combat.party = [player];
    combat.enemies = [enemy];
    player.setTarget(enemy);

    const originalRandom = Math.random;
    Math.random = () => 0.01; // Guaranteed hit
    try {
      combat.update(10000, 16);
    } finally {
      Math.random = originalRandom;
    }

    // Both main hand and offhand hit
    assert.equal(enemy.hasStatusEffect('curse'), true, 'Enemy cursed');
    assert.equal(prog.getProficiencyStat('longswords').currentExp, 2, 'Main hand longsword got +2 EXP');
    assert.equal(prog.getProficiencyStat('dark_magic').currentExp, 1, 'Secondary Dark Magic got +1 EXP');
    assert.equal(prog.getProficiencyStat('daggers').currentExp, 2, 'Offhand dagger got +2 EXP');
    assert.equal(prog.getProficiencyStat('dual_wielding').currentExp, 2, 'Dual wielding got +2 EXP');

    console.log('✓ PASS: Dual wielding offhand basic attack integrates with passive imbuement seamlessly.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 DARK KNIGHT PASSIVE IMBUEMENT TESTS PASSED CLEANLY! 🎉');
  console.log('================================================================');
}

runDarkKnightPassiveImbuementTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
