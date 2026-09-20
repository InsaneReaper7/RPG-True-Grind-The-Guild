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
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

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
  activeClass: string = 'dark_knight'
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

    isDualWielding: () => false,
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
    heal: (amt: number) => {
      // First restore Critical HP if damaged
      const missingCrit = Math.max(0, player.maxCriticalHp - player.criticalHp);
      let critRestored = 0;
      if (missingCrit > 0) {
        critRestored = Math.min(amt, missingCrit);
        player.criticalHp += critRestored;
      }
      const remainingHeal = amt - critRestored;
      const missingHp = Math.max(0, player.maxHp - player.hp);
      const hpRestored = Math.min(remainingHeal, missingHp);
      player.hp += hpRestored;
      return critRestored + hpRestored;
    },
    drawHpBar: () => {},
    clearTarget: () => {
      player.targetEntity = null;
    }
  };

  return player;
}

function createMockEnemy(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number = 100,
  enemyData: Partial<EnemyDef> = {}
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const fullEnemyData: EnemyDef = {
    id,
    name,
    texture: 'enemy-goblin',
    frame: 0,
    maxHp: hp,
    criticalHp: 0,
    speed: 50,
    meleeDamage: 10,
    attackIntervalMs: 1000,
    expReward: 10,
    isAggroed: true,
    ...enemyData
  } as EnemyDef;

  const enemy: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 0,
    maxCriticalHp: 0,
    state: 'idle',
    enemyData: fullEnemyData,
    activeStatusEffects: statusEffects,
    lastAttackTime: 0,

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
    followPath: () => {},
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

async function runMilestone48Tests() {
  console.log('================================================================');
  console.log('⚔️ RUNNING MILESTONE 48: DARK KNIGHT REACHABLE & COMPLETE TESTS 🌑');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const dataLoader = DataLoader.getInstance();

  const longswords = dataLoader.getWeapon('longswords')!;
  const darkStaff = dataLoader.getWeapon('dark_staff')!;
  assert.ok(longswords, 'longswords weapon must exist in weapons.json');
  assert.ok(darkStaff, 'dark_staff weapon must exist in weapons.json');

  // ============================================================================
  // TEST 1: Design Documentation Citation & 5-Skill Kit Verification
  // ============================================================================
  console.log('--- TEST 1: Design Documentation Citation & 5-Skill Kit Verification ---');
  {
    // Citing docs/true_grind_gdd (2).md Section 12.2, Lines 415-421
    const gddContent = fs.readFileSync('docs/true_grind_gdd (2).md', 'utf8');
    assert.ok(gddContent.includes('### Dark Knight (Longsword, 2H, no-shield path)'), 'GDD Section 12.2 Dark Knight header exists');
    assert.ok(gddContent.includes('1. **Rending Cut** (Lv 1) — bleed-applying strike.'), 'Rending Cut documented in GDD Section 12.2');
    assert.ok(gddContent.includes('2. **Dark Pact** (Lv 10) — trade a small HP cost for a burst of damage.'), 'Dark Pact documented in GDD Section 12.2');
    assert.ok(gddContent.includes('3. **Umbral Step** (Lv 20) — short gap-closer dash that also applies Blind.'), 'Umbral Step documented in GDD Section 12.2');
    assert.ok(gddContent.includes('4. **Soul Drain** (Lv 30) — attack heals for a % of damage dealt (temporary Life Steal boost).'), 'Soul Drain documented in GDD Section 12.2');
    assert.ok(gddContent.includes('5. **Oblivion Strike** (Lv 40, capstone) — massive single-target hit, longer cooldown, consumes bonus energy for bonus damage.'), 'Oblivion Strike documented in GDD Section 12.2');

    // Companion doc class_system (1).md line 155
    const classSystemContent = fs.readFileSync('docs/class_system (1).md', 'utf8');
    assert.ok(classSystemContent.includes('| Dark Knight | Longswords 30 + Dark Magic 30 + Vanguard Lv 15 |'), 'Dark Knight unlock requirement cited from class_system.md line 155');

    // Blind status effect cited from GDD Section 7.1 line 165
    assert.ok(gddContent.includes('| Blind | Reduced accuracy | Wind Magic, Dark Magic, thrown sand/dust items | Eyewash (Alchemy) |'), 'Blind status effect cited from GDD Section 7.1 line 165');

    // Check all 5 skills exist in DataLoader
    const rendingCut = dataLoader.getSkill('rending_cut');
    const darkPact = dataLoader.getSkill('dark_pact');
    const umbralStep = dataLoader.getSkill('umbral_step');
    const soulDrain = dataLoader.getSkill('soul_drain');
    const oblivionStrike = dataLoader.getSkill('oblivion_strike');

    assert.ok(rendingCut, 'rending_cut skill must exist in skills.json');
    assert.ok(darkPact, 'dark_pact skill must exist in skills.json');
    assert.ok(umbralStep, 'umbral_step skill must exist in skills.json');
    assert.ok(soulDrain, 'soul_drain skill must exist in skills.json');
    assert.ok(oblivionStrike, 'oblivion_strike skill must exist in skills.json');

    // Verify Blind status effect exists in DataLoader
    const blindStatus = dataLoader.getStatusEffect('blind');
    assert.ok(blindStatus, 'blind status effect must exist in statusEffects.json');
    assert.equal(blindStatus.accuracyReduction, 0.35, 'Blind has 35% accuracy reduction per operationalized spec');

    console.log('✓ PASS: All 5 Dark Knight skills & Blind debuff confirmed directly from design documentation citations.\n');
  }

  // ============================================================================
  // TEST 2: Three-Dimensional Requirement Boundary Check
  // (Longswords 30 + Dark Magic 30 + Vanguard Lv 15)
  // ============================================================================
  console.log('--- TEST 2: Three-Dimensional Requirement Boundary Check ---');
  {
    const darkKnightDef = dataLoader.getClass('dark_knight')!;
    assert.ok(darkKnightDef, 'dark_knight definition exists');
    assert.deepEqual(darkKnightDef.hiddenSkillBonuses, { parry: 0.05, resilience: 0.05 }, 'Dark Knight has parry and resilience hidden skill bonuses');

    // Boundary 2a: Longswords 29, Dark Magic 30, Vanguard 15 -> LOCKED
    const prog2a = new ProgressionSystem(classesData, 'Boundary 2a');
    prog2a.getProficiencyStat('longswords').level = 29;
    prog2a.getProficiencyStat('dark_magic').level = 30;
    prog2a.setClassLevel('vanguard', 15);
    assert.equal(prog2a.evaluateRequirements(darkKnightDef), false, 'Locked when Longswords is 29');
    assert.equal(prog2a.isClassUnlocked('dark_knight'), false, 'Dark Knight is locked at Longswords 29');

    // Boundary 2b: Longswords 30, Dark Magic 29, Vanguard 15 -> LOCKED
    const prog2b = new ProgressionSystem(classesData, 'Boundary 2b');
    prog2b.getProficiencyStat('longswords').level = 30;
    prog2b.getProficiencyStat('dark_magic').level = 29;
    prog2b.setClassLevel('vanguard', 15);
    assert.equal(prog2b.evaluateRequirements(darkKnightDef), false, 'Locked when Dark Magic is 29');
    assert.equal(prog2b.isClassUnlocked('dark_knight'), false, 'Dark Knight is locked at Dark Magic 29');

    // Boundary 2c: Longswords 30, Dark Magic 30, Vanguard 14 -> LOCKED
    const prog2c = new ProgressionSystem(classesData, 'Boundary 2c');
    prog2c.getProficiencyStat('longswords').level = 30;
    prog2c.getProficiencyStat('dark_magic').level = 30;
    prog2c.setClassLevel('vanguard', 14);
    assert.equal(prog2c.evaluateRequirements(darkKnightDef), false, 'Locked when Vanguard class level is 14');
    assert.equal(prog2c.isClassUnlocked('dark_knight'), false, 'Dark Knight is locked at Vanguard Lv 14');

    // Clean Unlock: Longswords 30, Dark Magic 30, Vanguard 15 -> UNLOCKED!
    const progClean = new ProgressionSystem(classesData, 'Dark Knight Candidate');
    progClean.getProficiencyStat('longswords').level = 30;
    progClean.getProficiencyStat('dark_magic').level = 30;
    progClean.setClassLevel('vanguard', 15);
    progClean.checkClassUnlocks();
    assert.equal(progClean.isClassUnlocked('dark_knight'), true, 'Dark Knight UNLOCKS cleanly when all 3 prerequisites are met');

    console.log('✓ PASS: Three-dimensional boundary checks verified across all 3 prerequisite axes.\n');
  }

  // ============================================================================
  // TEST 3: 5-Tier Skill Progression Spread (Lv 1, 10, 20, 30, 40)
  // ============================================================================
  console.log('--- TEST 3: 5-Tier Skill Progression Spread (Lv 1, 10, 20, 30, 40) ---');
  {
    const prog = new ProgressionSystem(classesData, 'Dark Knight Hero');
    const rendingCut = dataLoader.getSkill('rending_cut')!;
    const darkPact = dataLoader.getSkill('dark_pact')!;
    const umbralStep = dataLoader.getSkill('umbral_step')!;
    const soulDrain = dataLoader.getSkill('soul_drain')!;
    const oblivionStrike = dataLoader.getSkill('oblivion_strike')!;

    // Level 0: All locked
    assert.equal(prog.isSkillUnlocked(rendingCut), false, 'Rending Cut locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(darkPact), false, 'Dark Pact locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(umbralStep), false, 'Umbral Step locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(soulDrain), false, 'Soul Drain locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(oblivionStrike), false, 'Oblivion Strike locked at Lv 0');

    // Level 1: Rending Cut unlocks
    prog.setClassLevel('dark_knight', 1);
    assert.equal(prog.isSkillUnlocked(rendingCut), true, 'Rending Cut unlocks at Dark Knight Lv 1');
    assert.equal(prog.isSkillUnlocked(darkPact), false, 'Dark Pact locked at Lv 1');

    // Level 10: Dark Pact unlocks
    prog.setClassLevel('dark_knight', 10);
    assert.equal(prog.isSkillUnlocked(darkPact), true, 'Dark Pact unlocks at Dark Knight Lv 10');
    assert.equal(prog.isSkillUnlocked(umbralStep), false, 'Umbral Step locked at Lv 10');

    // Level 20: Umbral Step unlocks
    prog.setClassLevel('dark_knight', 20);
    assert.equal(prog.isSkillUnlocked(umbralStep), true, 'Umbral Step unlocks at Dark Knight Lv 20');
    assert.equal(prog.isSkillUnlocked(soulDrain), false, 'Soul Drain locked at Lv 20');

    // Level 30: Soul Drain unlocks
    prog.setClassLevel('dark_knight', 30);
    assert.equal(prog.isSkillUnlocked(soulDrain), true, 'Soul Drain unlocks at Dark Knight Lv 30');
    assert.equal(prog.isSkillUnlocked(oblivionStrike), false, 'Oblivion Strike locked at Lv 30');

    // Level 40: Oblivion Strike capstone unlocks
    prog.setClassLevel('dark_knight', 40);
    assert.equal(prog.isSkillUnlocked(oblivionStrike), true, 'Oblivion Strike capstone unlocks at Dark Knight Lv 40');

    console.log('✓ PASS: Dark Knight skills follow standard 5-tier unlock pattern (1, 10, 20, 30, 40).\n');
  }

  // ============================================================================
  // TEST 4: Rending Cut Strike & Bleed Application
  // ============================================================================
  console.log('--- TEST 4: Rending Cut Strike & Bleed Application ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DK Rending');
    prog.setClassLevel('dark_knight', 1);
    prog.getProficiencyStat('longswords').level = 30;
    prog.getProficiencyStat('dark_magic').level = 30;

    const dkPlayer = createMockPlayer('dk-1', 'Dark Knight Rending', 5, 5, longswords, prog);
    dkPlayer.knownSkillIds = ['rending_cut'];
    dkPlayer.equippedSkillIds = ['rending_cut'];
    const enemy = createMockEnemy('dummy-1', 'Target Dummy', 6, 5, 80);

    combat.party = [dkPlayer];
    combat.enemies = [enemy];

    const castSuccess = combat.castSkill(dkPlayer, 'rending_cut', enemy);
    assert.equal(castSuccess, true, 'Rending Cut cast successfully');
    assert.equal(dkPlayer.energy, 80, 'Energy deducted (100 - 20 = 80)');
    assert.ok(enemy.hp < 80, 'Enemy took weapon damage from Rending Cut');
    assert.equal(enemy.hasStatusEffect('bleed'), true, 'Enemy received Bleed status effect from Rending Cut');

    console.log('✓ PASS: Rending Cut deals strike damage and applies guaranteed Bleed.\n');
  }

  // ============================================================================
  // TEST 5: Dark Pact Self-Sacrifice Burst & Two-Bar HP Boundary Behavior
  // ============================================================================
  console.log('--- TEST 5: Dark Pact Self-Sacrifice Burst & Two-Bar HP Boundary Behavior ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DK Pact');
    prog.setClassLevel('dark_knight', 10);
    prog.getProficiencyStat('longswords').level = 30;
    prog.getProficiencyStat('dark_magic').level = 30;

    // Case 5A: Healthy Caster (Main HP 100, Crit HP 25) -> Main HP reduced by 10
    const dkPlayerA = createMockPlayer('dk-5a', 'Dark Knight 5A', 5, 5, longswords, prog);
    dkPlayerA.hp = 100;
    dkPlayerA.criticalHp = 25;
    const enemyA = createMockEnemy('dummy-5a', 'Target Dummy 5A', 6, 5, 100);
    combat.party = [dkPlayerA];
    combat.enemies = [enemyA];

    const cast5A = combat.castSkill(dkPlayerA, 'dark_pact', enemyA);
    assert.equal(cast5A, true, 'Dark Pact successfully cast');
    assert.equal(dkPlayerA.hp, 90, 'Main HP reduced from 100 to 90 (10 HP sacrifice)');
    assert.equal(dkPlayerA.criticalHp, 25, 'Critical HP untouched when Main HP absorbs full cost');
    assert.equal(dkPlayerA.energy, 85, 'Energy deducted (100 - 15 = 85)');
    assert.ok(enemyA.hp <= 75, 'Enemy took heavy burst damage from Dark Pact (2.4x mult)');

    // Case 5B: Low Main HP Caster (Main HP 6, Crit HP 25) -> Overflow cascades into Critical HP
    const dkPlayerB = createMockPlayer('dk-5b', 'Dark Knight 5B', 5, 5, longswords, prog);
    dkPlayerB.hp = 6;
    dkPlayerB.criticalHp = 25;
    const enemyB = createMockEnemy('dummy-5b', 'Target Dummy 5B', 6, 5, 100);
    combat.party = [dkPlayerB];
    combat.enemies = [enemyB];

    const cast5B = combat.castSkill(dkPlayerB, 'dark_pact', enemyB);
    assert.equal(cast5B, true, 'Dark Pact successfully cast when crossing Main HP into Critical HP');
    assert.equal(dkPlayerB.hp, 0, 'Main HP reduced to 0');
    assert.equal(dkPlayerB.criticalHp, 21, 'Critical HP reduced by 4 overflow points (25 - 4 = 21)');
    assert.notEqual(dkPlayerB.state, 'downed', 'Caster remains conscious in Critical State, not downed');

    // Case 5C: Critical State Caster (Main HP 0, Crit HP 20) -> Deducts directly from Critical HP
    const dkPlayerC = createMockPlayer('dk-5c', 'Dark Knight 5C', 5, 5, longswords, prog);
    dkPlayerC.hp = 0;
    dkPlayerC.criticalHp = 20;
    const enemyC = createMockEnemy('dummy-5c', 'Target Dummy 5C', 6, 5, 100);
    combat.party = [dkPlayerC];
    combat.enemies = [enemyC];

    const cast5C = combat.castSkill(dkPlayerC, 'dark_pact', enemyC);
    assert.equal(cast5C, true, 'Dark Pact successfully cast while in conscious Critical state');
    assert.equal(dkPlayerC.hp, 0, 'Main HP remains 0');
    assert.equal(dkPlayerC.criticalHp, 10, 'Critical HP reduced from 20 to 10');

    // Case 5D: Insufficient Total HP Safety Check (Main HP 0, Crit HP 8 <= 10 cost) -> REJECTED
    const dkPlayerD = createMockPlayer('dk-5d', 'Dark Knight 5D', 5, 5, longswords, prog);
    dkPlayerD.hp = 0;
    dkPlayerD.criticalHp = 8;
    const enemyD = createMockEnemy('dummy-5d', 'Target Dummy 5D', 6, 5, 100);
    combat.party = [dkPlayerD];
    combat.enemies = [enemyD];

    const cast5D = combat.castSkill(dkPlayerD, 'dark_pact', enemyD);
    assert.equal(cast5D, false, 'Dark Pact cast rejected when total HP is <= 10 HP cost (prevents suicide downing)');
    assert.equal(dkPlayerD.criticalHp, 8, 'Critical HP preserved when cast is rejected');
    assert.equal(dkPlayerD.energy, 100, 'Energy preserved when cast is rejected');

    console.log('✓ PASS: Dark Pact respects two-bar HP model (Main HP -> Crit HP) and prevents self-suicide.\n');
  }

  // ============================================================================
  // TEST 6: Umbral Step Gap Closer & Blind Status Effect Accuracy Penalty
  // ============================================================================
  console.log('--- TEST 6: Umbral Step Gap Closer & Blind Status Effect Accuracy Penalty ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DK Umbral');
    prog.setClassLevel('dark_knight', 20);
    prog.getProficiencyStat('longswords').level = 30;
    prog.getProficiencyStat('dark_magic').level = 30;

    // Caster at (5, 5), enemy at (9, 5) -> distance = 4 tiles (outside melee range)
    const dkPlayer = createMockPlayer('dk-6', 'Dark Knight Umbral', 5, 5, longswords, prog);
    const enemy = createMockEnemy('dummy-6', 'Target Dummy 6', 9, 5, 100);
    combat.party = [dkPlayer];
    combat.enemies = [enemy];

    const castSuccess = combat.castSkill(dkPlayer, 'umbral_step', enemy);
    assert.equal(castSuccess, true, 'Umbral Step cast successfully across 4 tiles');
    assert.equal(dkPlayer.energy, 75, 'Energy deducted (100 - 25 = 75)');

    // Verify gap close repositioning: caster should now be adjacent to enemy (distance = 1 tile)
    const newDist = Math.max(
      Math.abs(dkPlayer.gridPos.x - enemy.gridPos.x),
      Math.abs(dkPlayer.gridPos.y - enemy.gridPos.y)
    );
    assert.equal(newDist, 1, 'Umbral Step closed gap to adjacent tile (distance = 1)');
    assert.ok(enemy.hp < 100, 'Enemy took damage from Umbral Step');
    assert.equal(enemy.hasStatusEffect('blind'), true, 'Enemy received Blind status effect');

    // Verify Blind status effect accuracy reduction in combat:
    // With blind active on enemy, its attack has miss chance (accuracyReduction = 0.35)
    const blindDef = enemy.activeStatusEffects.get('blind');
    assert.equal(blindDef.def.accuracyReduction, 0.35, 'Blind has 35% accuracy reduction / miss chance');

    console.log('✓ PASS: Umbral Step closes gap across distance and inflicts Blind with accuracy penalty.\n');
  }

  // ============================================================================
  // TEST 7: Soul Drain Attack & Life Siphon Healing
  // ============================================================================
  console.log('--- TEST 7: Soul Drain Attack & Life Siphon Healing ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DK Drain');
    prog.setClassLevel('dark_knight', 30);
    prog.getProficiencyStat('longswords').level = 30;
    prog.getProficiencyStat('dark_magic').level = 30;

    // Caster at 50/100 HP
    const dkPlayer = createMockPlayer('dk-7', 'Dark Knight Drain', 5, 5, longswords, prog);
    dkPlayer.hp = 50;
    const enemy = createMockEnemy('dummy-7', 'Target Dummy 7', 6, 5, 100);
    combat.party = [dkPlayer];
    combat.enemies = [enemy];

    const preHp = dkPlayer.hp;
    const preEnemyHp = enemy.hp;
    const castSuccess = combat.castSkill(dkPlayer, 'soul_drain', enemy);
    assert.equal(castSuccess, true, 'Soul Drain cast successfully');
    assert.equal(dkPlayer.energy, 75, 'Energy deducted (100 - 25 = 75)');

    const damageDealt = preEnemyHp - enemy.hp;
    assert.ok(damageDealt > 0, 'Enemy took damage from Soul Drain');
    const expectedHeal = Math.max(1, Math.round(damageDealt * 0.5));
    assert.equal(dkPlayer.hp, preHp + expectedHeal, 'Caster healed for exactly 50% of damage dealt (Life Steal)');

    console.log('✓ PASS: Soul Drain siphons life force, restoring 50% of damage dealt as HP.\n');
  }

  // ============================================================================
  // TEST 8: Oblivion Strike Capstone & Strictly Capped Bonus Energy Scaling
  // ============================================================================
  console.log('--- TEST 8: Oblivion Strike Capstone & Strictly Capped Bonus Energy Scaling ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'DK Oblivion');
    prog.setClassLevel('dark_knight', 40);
    prog.getProficiencyStat('longswords').level = 30;
    prog.getProficiencyStat('dark_magic').level = 30;

    // Case 8A: Baseline energy only (exact base cost = 35) -> 0 bonus energy consumed
    const dkA = createMockPlayer('dk-8a', 'Dark Knight 8A', 5, 5, longswords, prog);
    dkA.energy = 35;
    const enemyA = createMockEnemy('dummy-8a', 'Target Dummy 8A', 6, 5, 200);
    combat.party = [dkA];
    combat.enemies = [enemyA];

    const cast8A = combat.castSkill(dkA, 'oblivion_strike', enemyA);
    assert.equal(cast8A, true, 'Oblivion Strike cast with baseline energy');
    assert.equal(dkA.energy, 0, 'Base energy fully consumed (35 - 35 = 0)');
    const damageBaseline = 200 - enemyA.hp;
    assert.ok(damageBaseline > 0, 'Baseline damage dealt');

    // Case 8B: Partial surplus energy (50 energy: 35 base + 15 bonus)
    const dkB = createMockPlayer('dk-8b', 'Dark Knight 8B', 5, 5, longswords, prog);
    dkB.energy = 50;
    const enemyB = createMockEnemy('dummy-8b', 'Target Dummy 8B', 6, 5, 200);
    combat.party = [dkB];
    combat.enemies = [enemyB];

    const cast8B = combat.castSkill(dkB, 'oblivion_strike', enemyB);
    assert.equal(cast8B, true, 'Oblivion Strike cast with partial surplus energy');
    assert.equal(dkB.energy, 0, 'Base 35 + 15 bonus energy consumed (50 - 50 = 0)');
    const damagePartial = 200 - enemyB.hp;
    assert.ok(damagePartial > damageBaseline, 'Partial bonus energy boosted damage over baseline');

    // Case 8C: Full surplus cap (60 energy: 35 base + 25 bonus = cap)
    const dkC = createMockPlayer('dk-8c', 'Dark Knight 8C', 5, 5, longswords, prog);
    dkC.energy = 60;
    const enemyC = createMockEnemy('dummy-8c', 'Target Dummy 8C', 6, 5, 200);
    combat.party = [dkC];
    combat.enemies = [enemyC];

    const cast8C = combat.castSkill(dkC, 'oblivion_strike', enemyC);
    assert.equal(cast8C, true, 'Oblivion Strike cast at full bonus cap');
    assert.equal(dkC.energy, 0, 'Base 35 + exactly 25 bonus energy consumed (60 - 60 = 0)');
    const damageFullCap = 200 - enemyC.hp;
    assert.ok(damageFullCap > damagePartial, 'Full bonus cap dealt highest damage');

    // Case 8D: Extreme surplus energy (100 energy: 35 base + 65 available)
    // CRITICAL BOUNDARY CHECK: Must consume ONLY 25 bonus energy (total 60) and preserve 40 energy!
    const dkD = createMockPlayer('dk-8d', 'Dark Knight 8D', 5, 5, longswords, prog);
    dkD.energy = 100;
    const enemyD = createMockEnemy('dummy-8d', 'Target Dummy 8D', 6, 5, 200);
    combat.party = [dkD];
    combat.enemies = [enemyD];

    const cast8D = combat.castSkill(dkD, 'oblivion_strike', enemyD);
    assert.equal(cast8D, true, 'Oblivion Strike cast with 100 energy');
    assert.equal(dkD.energy, 40, 'STRICT CAP VERIFIED: Consumed exactly 35 + 25 = 60 energy, leaving 40 energy intact!');
    const damageExtreme = 200 - enemyD.hp;
    assert.equal(damageExtreme.toFixed(1), damageFullCap.toFixed(1), 'Damage is strictly capped at +100% bonus and does NOT grow unbounded!');

    console.log('✓ PASS: Oblivion Strike consumes bonus energy with a strict cap of 25 energy (+100% max extra damage).\n');
  }

  // ============================================================================
  // TEST 9: Bidirectional Hybrid Cross-Proficiency Scaling & Weapon Flexibility
  // ============================================================================
  console.log('--- TEST 9: Bidirectional Hybrid Cross-Proficiency Scaling & Weapon Flexibility ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);

    // Progression with High Longsword, Low Dark Magic
    const progMelee = new ProgressionSystem(classesData, 'Melee DK');
    progMelee.setClassLevel('dark_knight', 1);
    progMelee.getProficiencyStat('longswords').level = 30;
    progMelee.getProficiencyStat('dark_magic').level = 0;

    // Progression with High Longsword, High Dark Magic (+30 partner levels)
    const progMeleeHybrid = new ProgressionSystem(classesData, 'Hybrid Melee DK');
    progMeleeHybrid.setClassLevel('dark_knight', 1);
    progMeleeHybrid.getProficiencyStat('longswords').level = 30;
    progMeleeHybrid.getProficiencyStat('dark_magic').level = 30; // +30 * 0.15 = +4.5 bonus damage

    const playerPureMelee = createMockPlayer('p-melee', 'Pure Melee', 5, 5, longswords, progMelee);
    const playerHybridMelee = createMockPlayer('p-hybrid-melee', 'Hybrid Melee', 5, 5, longswords, progMeleeHybrid);

    const enemyM1 = createMockEnemy('e-m1', 'Enemy M1', 6, 5, 100);
    const enemyM2 = createMockEnemy('e-m2', 'Enemy M2', 6, 5, 100);

    combat.castSkill(playerPureMelee, 'rending_cut', enemyM1);
    combat.castSkill(playerHybridMelee, 'rending_cut', enemyM2);

    const pureMeleeDmg = 100 - enemyM1.hp;
    const hybridMeleeDmg = 100 - enemyM2.hp;
    assert.ok(hybridMeleeDmg > pureMeleeDmg, 'Longsword strike gains cross-proficiency bonus from Dark Magic');
    assert.equal(Number((hybridMeleeDmg - pureMeleeDmg).toFixed(1)), Number((30 * 0.15).toFixed(1)), 'Hybrid bonus matches partnerLevel * 0.15 (4.5)');

    // Test reverse: Wielding Dark Staff (magic conduit), scaled by Longsword level
    const progStaff = new ProgressionSystem(classesData, 'Staff DK');
    progStaff.setClassLevel('dark_knight', 1);
    progStaff.getProficiencyStat('dark_magic').level = 30;
    progStaff.getProficiencyStat('longswords').level = 0;

    const progStaffHybrid = new ProgressionSystem(classesData, 'Hybrid Staff DK');
    progStaffHybrid.setClassLevel('dark_knight', 1);
    progStaffHybrid.getProficiencyStat('dark_magic').level = 30;
    progStaffHybrid.getProficiencyStat('longswords').level = 30; // +30 * 0.15 = +4.5 bonus damage

    const playerPureStaff = createMockPlayer('p-staff', 'Pure Staff', 5, 5, darkStaff, progStaff);
    const playerHybridStaff = createMockPlayer('p-hybrid-staff', 'Hybrid Staff', 5, 5, darkStaff, progStaffHybrid);

    const enemyS1 = createMockEnemy('e-s1', 'Enemy S1', 6, 5, 100);
    const enemyS2 = createMockEnemy('e-s2', 'Enemy S2', 6, 5, 100);

    const castStaffPure = combat.castSkill(playerPureStaff, 'rending_cut', enemyS1);
    const castStaffHybrid = combat.castSkill(playerHybridStaff, 'rending_cut', enemyS2);

    assert.equal(castStaffPure, true, 'Dark Staff successfully casts Dark Knight skill');
    assert.equal(castStaffHybrid, true, 'Dark Staff hybrid successfully casts Dark Knight skill');

    const pureStaffDmg = 100 - enemyS1.hp;
    const hybridStaffDmg = 100 - enemyS2.hp;
    assert.ok(hybridStaffDmg > pureStaffDmg, 'Dark Staff cast gains cross-proficiency bonus from Longswords');
    assert.equal(Number((hybridStaffDmg - pureStaffDmg).toFixed(1)), Number((30 * 0.15).toFixed(1)), 'Reverse hybrid bonus matches partnerLevel * 0.15 (4.5)');

    console.log('✓ PASS: Bidirectional cross-proficiency scaling verified for both Longswords and Dark Staff.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 9 MILESTONE 48 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runMilestone48Tests().catch((err) => {
  console.error('❌ MILESTONE 48 TEST FAILURE:', err);
  process.exit(1);
});
