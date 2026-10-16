import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser and localStorage under Node
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  const mockStorage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    localStorage: (global as any).localStorage
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
    getElementById: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { HUD } = await import('../src/ui/HUD.ts');
import type { EnemyDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 40, gridHeight: number = 40): any {
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

  const scene: any = {
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (_ms: number, cb: () => void) => cb()
    },
    events: { emit: () => {}, on: () => {}, off: () => {}, once: () => {} },
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
        if (config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {}, remove: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    }
  };
  return scene;
}

function createEnemyFromDef(scene: any, def: EnemyDef, x: number, y: number, band?: number): any {
  let finalDef: EnemyDef = { ...def };
  if (def.bandStats && band !== undefined) {
    const bStats = def.bandStats[String(band)] || def.bandStats['1'];
    if (bStats) {
      finalDef = {
        ...def,
        hp: bStats.hp,
        criticalHpMax: bStats.criticalHpMax,
        meleeDamage: bStats.meleeDamage,
        attackIntervalMs: bStats.attackIntervalMs
      };
    }
  }
  const enemy = new Enemy(scene, x, y, finalDef, 'wolf-avatar', 32);
  enemy.hp = finalDef.hp;
  enemy.maxHp = finalDef.hp;
  enemy.isAggroed = true;
  return enemy;
}

function withQuietLogs<T>(fn: () => T): T {
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING MILESTONE: DRUID STAFF + OVERGROWN GROVE EVENT TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const playerData = dataLoader.getPlayer();
  withQuietLogs(() => gameState.resetToDefault(playerData));

  // ---------------------------------------------------------------------------
  // TEST 1: Druid Staff Data Spec, Proficiency Registration & Description (Change 4)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Druid Staff Weapon Spec, Proficiency Registration & Description ---');
  const druidStaff = dataLoader.getWeapon('druid_staff');
  assert.ok(druidStaff, 'druid_staff must exist in weapons.json');
  assert.strictEqual(druidStaff.category, 'melee_2h', 'druid_staff category must be melee_2h');
  assert.strictEqual(druidStaff.twoHanded, true, 'druid_staff must be twoHanded: true');
  assert.strictEqual(druidStaff.weight, 3.0, 'druid_staff weight must be 3.0');
  assert.strictEqual(druidStaff.attackIntervalMs, 1300, 'druid_staff attackIntervalMs must be 1300');
  assert.strictEqual(druidStaff.baseDamage, 9, 'druid_staff baseDamage must be 9');
  assert.strictEqual(druidStaff.baseAccuracy, 0.70, 'druid_staff baseAccuracy must be 0.70');
  assert.strictEqual(druidStaff.proficiencyId, 'druid_staff', 'druid_staff proficiencyId must be druid_staff');
  assert.strictEqual(druidStaff.spellWeaponId, 'nature_magic', 'druid_staff spellWeaponId must be nature_magic');
  assert.deepStrictEqual(
    druidStaff.levelBonus,
    { damagePerLevel: 0.45, accuracyPerLevel: 0.003 },
    'druid_staff levelBonus must match spec'
  );
  assert.deepStrictEqual(
    druidStaff.castCrossTraining,
    { proficiencyId: 'druid_staff', amount: 1 },
    'druid_staff castCrossTraining must be { proficiencyId: "druid_staff", amount: 1 }'
  );
  assert.strictEqual(
    druidStaff.proficiencyDescription,
    'Proficiency with the Druid Staff: a living heartwood conduit that channels Nature Magic at range and strikes with heavy two-handed force in melee.',
    'druid_staff proficiencyDescription must be defined in data/weapons.json'
  );

  // Ensure no other weapon has castCrossTraining
  const otherWithCross = dataLoader.getAllWeapons().filter(w => w.id !== 'druid_staff' && w.castCrossTraining);
  assert.strictEqual(otherWithCross.length, 0, 'No other weapon may define castCrossTraining');

  // Verify trainable stat def uses weapon.proficiencyDescription
  const trainableDef = dataLoader.getTrainableStatDef('druid_staff');
  assert.ok(trainableDef, 'getTrainableStatDef("druid_staff") must return a definition');
  assert.strictEqual(trainableDef.name, 'Druid Staff');
  assert.strictEqual(trainableDef.description, druidStaff.proficiencyDescription);

  // Verify ProgressionSystem and player.json default proficiencies
  assert.ok(playerData.proficiencies.druid_staff, 'player.json must register druid_staff proficiency');
  assert.strictEqual(playerData.proficiencies.druid_staff.level, 0);
  const prog = new ProgressionSystem(dataLoader.getClasses());
  assert.strictEqual(prog.getProficiencyStat('druid_staff').level, 0);
  assert.strictEqual(prog.getProficiencyStat('druid_staff').currentExp, 0);

  // Verify HUD color registration for druid_staff
  const hudProto = HUD.prototype as any;
  assert.strictEqual(hudProto.getStatColor('druid_staff'), '#16a34a', 'HUD getStatColor("druid_staff") must be #16a34a');
  console.log('✓ PASS: Druid Staff spec, proficiency registration, data-driven description, and HUD color verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Melee Swing with Druid Staff + Change 3 (Void Staff Swing Fix)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Melee Swing with Druid Staff & Change 3 (Void Staff Swing Uses Own baseDamage) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], []);
    const hero = new Player(scene, 10, 10, playerData, druidStaff, 32);
    hero.energy = 0; // dry-cast fallback -> melee swing with druid_staff
    hero.progression.getProficiencyStat('druid_staff').level = 100; // guarantee hit
    combat.setParty([hero]);

    const dummyDef: EnemyDef = {
      id: 'dummy_melee',
      name: 'Dummy',
      tier: 'common',
      hp: 500,
      criticalHpMax: 0,
      meleeDamage: 1,
      aggroRadius: 5,
      attackIntervalMs: 2000,
      moveSpeed: 60,
      harvest: []
    };
    // Place enemy 1 tile away (melee range)
    const enemy = createEnemyFromDef(scene, dummyDef, 11, 10);
    combat.setEnemies([enemy]);
    hero.targetEntity = enemy;

    const effWeapon = combat.getEffectiveWeaponForAttack(hero, enemy);
    assert.strictEqual(effWeapon.id, 'druid_staff', 'At 1-tile range, Druid Staff must swing with druid_staff');
    assert.strictEqual(effWeapon.baseDamage, 9, 'Melee swing must use druid_staff baseDamage 9');

    const expDruidBefore = hero.progression.getProficiencyStat('druid_staff').currentExp;
    const expStaffBefore = hero.progression.getProficiencyStat('staff').currentExp;
    const expNatureBefore = hero.progression.getProficiencyStat('nature_magic').currentExp;
    const hpBefore = enemy.hp;

    (combat as any).executePlayerBasicAttack(hero, enemy, 2000);

    assert.ok(enemy.hp < hpBefore, 'Druid Staff melee swing must deal damage to the adjacent target');
    assert.strictEqual(
      hero.progression.getProficiencyStat('druid_staff').currentExp - expDruidBefore,
      2,
      'Druid Staff melee swing must award +2 EXP to druid_staff'
    );
    assert.strictEqual(
      hero.progression.getProficiencyStat('staff').currentExp - expStaffBefore,
      0,
      'Druid Staff melee swing must NOT train generic staff'
    );
    assert.strictEqual(
      hero.progression.getProficiencyStat('nature_magic').currentExp - expNatureBefore,
      0,
      'Druid Staff melee swing must NOT train nature_magic'
    );

    // Change 3: Void Staff swing uses void_staff's own baseDamage (11) and trains 'staff'
    const voidStaff = dataLoader.getWeapon('void_staff')!;
    const genericStaff = dataLoader.getWeapon('staff')!;
    assert.strictEqual(voidStaff.baseDamage, 11, 'void_staff baseDamage must be 11');
    assert.strictEqual(genericStaff.baseDamage, 7, 'generic staff baseDamage is 7');

    const voidHero = new Player(scene, 10, 12, playerData, voidStaff, 32);
    voidHero.progression.getProficiencyStat('staff').level = 50; // guarantee hit, lv50 bonus = 50*0.35 = 17.5 -> 11+17.5 = 28.5
    const voidTarget = createEnemyFromDef(scene, dummyDef, 11, 12);
    combat.setParty([voidHero]);
    combat.setEnemies([voidTarget]);

    const effVoid = combat.getEffectiveWeaponForAttack(voidHero, voidTarget);
    assert.strictEqual(effVoid.id, 'void_staff', 'Void Staff melee swing must return void_staff (not generic staff)');
    assert.strictEqual(effVoid.baseDamage, 11, 'Effective weapon baseDamage must be void_staff baseDamage (11)');
    assert.strictEqual(effVoid.proficiencyId, 'staff', 'void_staff proficiencyId must still be "staff"');

    // Run with Math.random mocked to 0.5 (no miss, no crit, mid variance = 1.0)
    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const staffExpBefore = voidHero.progression.getProficiencyStat('staff').currentExp;
      const targetHpBefore = voidTarget.hp;
      (combat as any).executePlayerBasicAttack(voidHero, voidTarget, 4000);
      const damageDealt = targetHpBefore - voidTarget.hp;
      assert.strictEqual(damageDealt, 31, 'Void Staff swing must deal 31 damage from void_staff baseDamage 11 + lv 50 scaling (not 7 from generic staff)');
      assert.strictEqual(
        voidHero.progression.getProficiencyStat('staff').currentExp - staffExpBefore,
        2,
        'Void Staff melee swing must still train "staff" (+2 EXP)'
      );
    } finally {
      Math.random = origRandom;
    }
  }
  console.log('✓ PASS: Druid Staff melee swing trains druid_staff (+2) and Void Staff swing uses baseDamage 11 & trains staff (+2).\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Basic-Attack Cast & Skill Cast Cross-Training (Including Change 2)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Basic-Attack Cast & Skill Cast Cross-Training (Change 2 Verification) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], []);
    const hero = new Player(scene, 10, 10, playerData, druidStaff, 32);
    hero.energy = 100;
    hero.maxEnergy = 100;
    hero.progression.getProficiencyStat('nature_magic').level = 80; // guarantee spell hit
    hero.progression.getProficiencyStat('arcane_magic').level = 80;
    hero.progression.getProficiencyStat('healing_magic').level = 80;
    hero.progression.setClassLevel('sprout_keeper', 40);
    hero.progression.setClassLevel('arcane_initiate', 40);
    hero.progression.setClassLevel('medic', 40);

    const dummyDef: EnemyDef = {
      id: 'dummy_ranged',
      name: 'Ranged Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 1,
      aggroRadius: 8,
      attackIntervalMs: 2000,
      moveSpeed: 60,
      harvest: []
    };
    // Place enemy 3 tiles away (ranged spell cast distance)
    const enemy = createEnemyFromDef(scene, dummyDef, 13, 10);
    combat.setParty([hero]);
    combat.setEnemies([enemy]);
    hero.targetEntity = enemy;

    const effSpell = combat.getEffectiveWeaponForAttack(hero, enemy);
    assert.strictEqual(effSpell.id, 'nature_magic', 'At 3-tile range with energy, Druid Staff must channel nature_magic');

    const origRandom = Math.random;
    Math.random = () => 0.1; // ensure hit
    try {
      // 3a. Basic-attack cast through Druid Staff trains both nature_magic (+2) and druid_staff (+1)
      const natExp0 = hero.progression.getProficiencyStat('nature_magic').currentExp;
      const druidExp0 = hero.progression.getProficiencyStat('druid_staff').currentExp;

      (combat as any).executePlayerBasicAttack(hero, enemy, 2000);

      assert.strictEqual(
        hero.progression.getProficiencyStat('nature_magic').currentExp - natExp0,
        2,
        'Basic-attack cast must award +2 EXP to nature_magic'
      );
      assert.strictEqual(
        hero.progression.getProficiencyStat('druid_staff').currentExp - druidExp0,
        1,
        'Basic-attack cast through Druid Staff must cross-train +1 EXP to druid_staff'
      );

      // 3b. Skill cast of Nature Magic skill (thorn_dart) through Druid Staff trains both nature_magic (+2) and druid_staff (+1)
      const natExp1 = hero.progression.getProficiencyStat('nature_magic').currentExp;
      const druidExp1 = hero.progression.getProficiencyStat('druid_staff').currentExp;
      hero.energy = 100;

      const castNatureOk = combat.castSkill(hero, 'thorn_dart', enemy, 5000);
      assert.strictEqual(castNatureOk, true, 'thorn_dart cast must succeed');
      assert.strictEqual(
        hero.progression.getProficiencyStat('nature_magic').currentExp - natExp1,
        2,
        'Nature skill cast must award +2 EXP to nature_magic'
      );
      assert.strictEqual(
        hero.progression.getProficiencyStat('druid_staff').currentExp - druidExp1,
        1,
        'Nature skill cast through Druid Staff must cross-train +1 EXP to druid_staff'
      );

      // 3c. Change 2: Druid Staff wielder casting a non-Nature skill (Arcane skill arcane_bolt) gains 0 druid_staff EXP
      const arcaneExpBefore = hero.progression.getProficiencyStat('arcane_magic').currentExp;
      const druidExpBeforeArcane = hero.progression.getProficiencyStat('druid_staff').currentExp;
      hero.energy = 100;

      const castArcaneOk = combat.castSkill(hero, 'arcane_bolt', enemy, 15000);
      assert.strictEqual(castArcaneOk, true, 'arcane_bolt cast must succeed');
      assert.strictEqual(
        hero.progression.getProficiencyStat('arcane_magic').currentExp - arcaneExpBefore,
        2,
        'Arcane skill cast must award +2 EXP to arcane_magic'
      );
      assert.strictEqual(
        hero.progression.getProficiencyStat('druid_staff').currentExp - druidExpBeforeArcane,
        0,
        'Change 2: Druid Staff wielder casting a non-Nature (Arcane) skill must gain 0 druid_staff EXP'
      );

      // 3d. Change 2: Druid Staff wielder casting a Healing skill (mend) gains 0 druid_staff EXP
      hero.hp = 30;
      hero.maxHp = 100;
      hero.energy = 100;
      const healExpBefore = hero.progression.getProficiencyStat('healing_magic').currentExp;
      const druidExpBeforeHeal = hero.progression.getProficiencyStat('druid_staff').currentExp;

      const castHealOk = combat.castSkill(hero, 'mend', hero, 25000);
      assert.strictEqual(castHealOk, true, 'mend cast must succeed');
      assert.strictEqual(
        hero.progression.getProficiencyStat('healing_magic').currentExp - healExpBefore,
        2,
        'Healing skill cast must award +2 EXP to healing_magic'
      );
      assert.strictEqual(
        hero.progression.getProficiencyStat('druid_staff').currentExp - druidExpBeforeHeal,
        0,
        'Change 2: Druid Staff wielder casting a Healing skill must gain 0 druid_staff EXP'
      );
    } finally {
      Math.random = origRandom;
    }
  }
  console.log('✓ PASS: Basic-attack cast & Nature skill cast cross-train +1 druid_staff; non-Nature skills award 0 druid_staff.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Random Magic Staff Excludes Druid Staff
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Random Magic Staff Exclusion ---');
  {
    const schoolIds = dataLoader.getMagicSchoolIds();
    assert.ok(!schoolIds.includes('druid_staff'), 'getMagicSchoolIds() data path must not include druid_staff');
    assert.strictEqual(schoolIds.length, 11, 'getMagicSchoolIds() must contain the 11 magic schools');

    const offensiveSchools = dataLoader.getOffensiveMagicSchools().map(w => w.id);
    assert.ok(!offensiveSchools.includes('druid_staff'), 'getOffensiveMagicSchools() must not include druid_staff');

    const kitRng = DungeonGenerator.createRng(99);
    for (let i = 0; i < 100; i++) {
      const resolved = gameState.resolveStartingKit('random_magic_staff', kitRng);
      assert.notStrictEqual(resolved.mainWeaponId, 'druid_staff', 'resolveStartingKit("random_magic_staff") must never yield druid_staff');
    }
  }
  console.log('✓ PASS: Druid Staff is excluded from getMagicSchoolIds(), getOffensiveMagicSchools(), and random_magic_staff starting kit.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Overgrown Grove Generation Rules, Pity & Change 1 (Pure Generator + Caller Update)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Overgrown Grove Generation, 6% Rate, Eligibility Gates, Pity & Change 1 ---');
  {
    const dungeonConfig = dataLoader.getDungeonConfig();
    withQuietLogs(() => gameState.resetToDefault(playerData));

    // 5a. Floors 1 and 2 must spawn 0 Groves even with tutorial complete and 20 pity misses
    for (const ineligibleFloor of [1, 2]) {
      for (let seed = 1; seed <= 30; seed++) {
        const d = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(seed), {
          floorNumber: ineligibleFloor,
          seed,
          isTutorialComplete: true,
          grove: { staffObtained: false, misses: 20 }
        });
        assert.strictEqual(d.groveEligible, false, `Floor ${ineligibleFloor} must have groveEligible === false`);
        assert.strictEqual(d.overgrownGrove, null, `Floor ${ineligibleFloor} must never spawn an Overgrown Grove`);
      }
    }

    // 5b. Pre-tutorial floors must spawn 0 Groves even on floor 5 with 20 pity misses
    for (let seed = 1; seed <= 30; seed++) {
      const d = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(seed), {
        floorNumber: 5,
        seed,
        isTutorialComplete: false,
        grove: { staffObtained: false, misses: 20 }
      });
      assert.strictEqual(d.groveEligible, false, 'Pre-tutorial floor must have groveEligible === false');
      assert.strictEqual(d.overgrownGrove, null, 'Pre-tutorial floor must never spawn an Overgrown Grove');
    }

    // 5c. 200-floor seeded batch on eligible floor (floor 3, tutorial complete, no pity) -> ~6% spawn rate
    let groveCount = 0;
    const totalRuns = 200;
    for (let seed = 1; seed <= totalRuns; seed++) {
      const d = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(seed), {
        floorNumber: 3,
        seed,
        isTutorialComplete: true,
        grove: { staffObtained: true, misses: 0 }
      });
      assert.strictEqual(d.groveEligible, true);
      if (d.overgrownGrove) {
        groveCount++;
      }
    }
    const observedRate = groveCount / totalRuns;
    assert.ok(
      groveCount >= 6 && groveCount <= 20,
      `Expected ~6% Overgrown Grove rate across 200 seeds (got ${groveCount}/${totalRuns} = ${(observedRate * 100).toFixed(1)}%)`
    );
    console.log(`  200-floor batch: ${groveCount}/${totalRuns} (${(observedRate * 100).toFixed(1)}%) Overgrown Groves spawned.`);

    // 5d. Change 1: DungeonGenerator.generate is pure (does not mutate GameState pity counter)
    assert.strictEqual(gameState.getGrovePityCounter(), 0, 'GameState grovePityCounter must remain 0 after 260 pure generate() calls');

    // 5e. Change 1: Caller (MainScene / applyGroveGenerationResult) updates counter from real generations
    // Seed 1 on floor 3 does not naturally roll < 0.06
    const dIneligible = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(1), {
      floorNumber: 2,
      seed: 1,
      isTutorialComplete: true,
      grove: { staffObtained: gameState.hasObtainedDruidStaff(), misses: gameState.getGrovePityCounter() }
    });
    gameState.applyGroveGenerationResult(dIneligible);
    assert.strictEqual(gameState.getGrovePityCounter(), 0, 'Ineligible floor must leave grovePityCounter unchanged at 0');

    // Generate 15 eligible floors in a row using non-grove seeds and apply result each time
    let nonGroveSeedsUsed = 0;
    for (let seed = 1; nonGroveSeedsUsed < 15; seed++) {
      const testRng = DungeonGenerator.createRng(seed * 37 + 2029);
      if (testRng() < 0.06) continue; // pick seeds that don't naturally roll < 0.06

      const dMiss = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(seed), {
        floorNumber: 3,
        seed,
        isTutorialComplete: true,
        grove: { staffObtained: gameState.hasObtainedDruidStaff(), misses: gameState.getGrovePityCounter() }
      });
      assert.strictEqual(dMiss.overgrownGrove, null, `Miss #${nonGroveSeedsUsed + 1} should not spawn a Grove before 15 misses`);
      gameState.applyGroveGenerationResult(dMiss);
      nonGroveSeedsUsed++;
      assert.strictEqual(gameState.getGrovePityCounter(), nonGroveSeedsUsed, `Pity counter must increment to ${nonGroveSeedsUsed}`);
    }

    assert.strictEqual(gameState.getGrovePityCounter(), 15, 'After 15 eligible misses, grovePityCounter must be 15');

    // 16th eligible floor on seed 1 (which normally misses) MUST spawn an Overgrown Grove via pity
    const dPityHit = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(1), {
      floorNumber: 3,
      seed: 1,
      isTutorialComplete: true,
      grove: { staffObtained: gameState.hasObtainedDruidStaff(), misses: gameState.getGrovePityCounter() }
    });
    assert.ok(dPityHit.overgrownGrove, '16th eligible floor after 15 misses (with staffObtained=false) must guarantee an Overgrown Grove');
    gameState.applyGroveGenerationResult(dPityHit);
    assert.strictEqual(gameState.getGrovePityCounter(), 0, 'Spawning an Overgrown Grove must reset grovePityCounter to 0');

    // Verify pity does NOT trigger when staffObtained is true even at misses >= 15
    const dNoPityAfterStaff = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(1), {
      floorNumber: 3,
      seed: 1,
      isTutorialComplete: true,
      grove: { staffObtained: true, misses: 15 }
    });
    assert.strictEqual(dNoPityAfterStaff.overgrownGrove, null, 'Pity must not trigger if guild has already obtained a Druid Staff');

    // 5f. Verify converted room contents on seed 1 (compare baseline without grove vs pity grove on same seed)
    const dBaseline = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(1), {
      floorNumber: 3,
      seed: 1,
      isTutorialComplete: true,
      grove: { staffObtained: true, misses: 0 }
    });
    const groveInfo = dPityHit.overgrownGrove!;
    const groveRoom = dPityHit.rooms.find(r => r.id === groveInfo.roomIndex)!;
    assert.ok(groveRoom, 'Converted room must exist');
    assert.notStrictEqual(groveRoom.id, 0, 'Grove must never convert room 0 (entrance)');
    assert.notStrictEqual(groveRoom.type, 'entrance', 'Grove must never convert entrance room');
    assert.notStrictEqual(groveRoom.type, 'boss', 'Grove must never convert boss room');
    assert.ok(
      !(groveRoom.x <= dPityHit.crystalPos.x && dPityHit.crystalPos.x < groveRoom.x + groveRoom.width &&
        groveRoom.y <= dPityHit.crystalPos.y && dPityHit.crystalPos.y < groveRoom.y + groveRoom.height),
      'Grove must never convert the crystal room'
    );
    assert.ok(
      groveRoom.type === 'gathering' || groveRoom.type === 'light_combat',
      `Converted room must be gathering or light_combat (got ${groveRoom.type})`
    );
    assert.deepStrictEqual(
      groveInfo.treantPos,
      { x: groveRoom.centerX, y: groveRoom.centerY },
      'Ancient Treant must spawn at room centre'
    );

    const roomEnemies = dPityHit.enemySpawns.filter(e => e.roomIndex === groveRoom.id);
    const treants = roomEnemies.filter(e => e.enemyId === 'ancient_treant');
    const natureElems = roomEnemies.filter(e => e.enemyId === 'nature_elemental');
    assert.strictEqual(roomEnemies.length, 3, 'Converted room must have 3 enemies total (1 Ancient Treant + 2 Nature Elementals, all others removed)');
    assert.strictEqual(treants.length, 1, 'Converted room must contain 1 ancient_treant');
    assert.strictEqual(treants[0].x, groveRoom.centerX);
    assert.strictEqual(treants[0].y, groveRoom.centerY);
    assert.strictEqual(natureElems.length, 2, 'Converted room must contain 2 nature_elemental spawns');

    const baseRoomBushes = dBaseline.bushSpawns.filter(b => b.roomIndex === groveRoom.id && (!b.nodeTypeId || b.nodeTypeId === 'foraging_bush'));
    const groveRoomBushes = dPityHit.bushSpawns.filter(b => b.roomIndex === groveRoom.id && (!b.nodeTypeId || b.nodeTypeId === 'foraging_bush'));
    assert.strictEqual(
      groveRoomBushes.length,
      baseRoomBushes.length + 3,
      `Converted room must have +3 foraging bushes on top of normal count (${baseRoomBushes.length} -> ${groveRoomBushes.length})`
    );
  }
  console.log('✓ PASS: Overgrown Grove generation rate, eligibility gates, pure options.grove, pity counter & room contents verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Ancient Treant Band Stats, Nature Poison Proc, and Kill-Driven Drops
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Ancient Treant Band Stats, Nature Poison Proc & Kill-Driven Druid Staff Drop ---');
  {
    withQuietLogs(() => gameState.resetToDefault(playerData));
    const treantDef = dataLoader.getEnemy('ancient_treant')!;
    assert.ok(treantDef, 'ancient_treant must exist in enemies.json');
    assert.strictEqual(treantDef.tier, 'elite', 'ancient_treant tier must be elite (not boss)');
    assert.strictEqual(treantDef.school, 'nature', 'ancient_treant school must be nature');
    assert.deepStrictEqual(treantDef.researchPoints, { min: 8, max: 12 }, 'ancient_treant researchPoints must be 8-12');

    // 6a. Band stats verification across bands 1-4
    const expectedBands: Record<number, { hp: number; criticalHpMax: number; meleeDamage: number; attackIntervalMs: number }> = {
      1: { hp: 130, criticalHpMax: 65, meleeDamage: 13, attackIntervalMs: 1600 },
      2: { hp: 180, criticalHpMax: 90, meleeDamage: 16, attackIntervalMs: 1550 },
      3: { hp: 240, criticalHpMax: 120, meleeDamage: 20, attackIntervalMs: 1500 },
      4: { hp: 300, criticalHpMax: 150, meleeDamage: 24, attackIntervalMs: 1450 }
    };
    const scene = createMockScene();
    for (const [bandStr, exp] of Object.entries(expectedBands)) {
      const bandNum = Number(bandStr);
      const spawned = createEnemyFromDef(scene, treantDef, 10, 10, bandNum);
      assert.strictEqual(spawned.maxHp, exp.hp, `Band ${bandNum} Treant maxHp must be ${exp.hp}`);
      assert.strictEqual(spawned.enemyData.criticalHpMax, exp.criticalHpMax, `Band ${bandNum} Treant criticalHpMax must be ${exp.criticalHpMax}`);
      assert.strictEqual(spawned.enemyData.meleeDamage, exp.meleeDamage, `Band ${bandNum} Treant meleeDamage must be ${exp.meleeDamage}`);
      assert.strictEqual(spawned.enemyData.attackIntervalMs, exp.attackIntervalMs, `Band ${bandNum} Treant attackIntervalMs must be ${exp.attackIntervalMs}`);
    }

    // 6b. Ancient Treant melee attack procs Nature 25% poison status on player
    const combat = new CombatSystem(scene, [], []);
    const targetHero = new Player(scene, 10, 10, playerData, druidStaff, 32);
    targetHero.hp = 500;
    targetHero.maxHp = 500;
    const treantAttacker = createEnemyFromDef(scene, treantDef, 11, 10, 1);
    combat.setParty([targetHero]);
    combat.setEnemies([treantAttacker]);

    const origRandom = Math.random;
    Math.random = () => 0.10; // poison proc roll 0.10 < 0.25
    try {
      withQuietLogs(() => combat.update(3000, 16));
      assert.strictEqual(targetHero.hasStatusEffect('poison'), true, 'Ancient Treant melee hit must proc Nature poison when roll < 0.25');
    } finally {
      Math.random = origRandom;
    }

    // 6c. First Ancient Treant kill ever -> guaranteed Druid Staff in stockpile + flag set + harvest + RP
    withQuietLogs(() => gameState.resetToDefault(playerData));
    assert.strictEqual(gameState.hasObtainedDruidStaff(), false, 'druidStaffObtained flag must start false');
    assert.strictEqual(gameState.getItemCount('druid_staff'), 0, 'Stockpile must start with 0 druid_staff');

    const killer = new Player(scene, 10, 10, playerData, druidStaff, 32);
    killer.energy = 0;
    killer.progression.getProficiencyStat('druid_staff').level = 100;
    const treant1 = createEnemyFromDef(scene, treantDef, 11, 10, 1);
    treant1.hp = 1; // 1 HP and 0 criticalHp so the next melee swing kills it
    treant1.criticalHp = 0;
    combat.setParty([killer]);
    combat.setEnemies([treant1]);
    killer.targetEntity = treant1;

    // Force high roll (0.50) to prove first kill is guaranteed even when random roll > 0.15
    Math.random = () => 0.50;
    try {
      const rpBefore = gameState.getResearchPoints();
      (combat as any).executePlayerBasicAttack(killer, treant1, 5000);
      assert.strictEqual(treant1.state, 'dead', 'Ancient Treant must be killed by the attack');
      assert.strictEqual(gameState.hasObtainedDruidStaff(), true, 'First Ancient Treant kill must set druidStaffObtained flag');
      assert.strictEqual(gameState.getItemCount('druid_staff'), 1, 'First Ancient Treant kill must guarantee 1 druid_staff in stockpile');

      const rpGained = gameState.getResearchPoints() - rpBefore;
      assert.ok(rpGained >= 8 && rpGained <= 12, `Ancient Treant kill must award 8-12 RP (gained ${rpGained})`);
      assert.ok(
        killer.getItemCount('nature_gemstone') + gameState.getItemCount('nature_gemstone') >= 2,
        'Ancient Treant kill must drop 2-3 nature_gemstone'
      );
      assert.ok(
        killer.getItemCount('wood') + gameState.getItemCount('wood') >= 3,
        'Ancient Treant kill must drop 3 wood'
      );
    } finally {
      Math.random = origRandom;
    }

    // 6d. Subsequent Ancient Treant kills drop Druid Staff at 15% rate
    let subsequentDrops = 0;
    let wildHerbDrops = 0;
    const subsequentKills = 100;
    const dropRng = DungeonGenerator.createRng(42);
    Math.random = () => dropRng();
    try {
      withQuietLogs(() => {
        for (let i = 0; i < subsequentKills; i++) {
          const beforeStaff = gameState.getItemCount('druid_staff');
          const beforeHerbs = killer.getItemCount('wild_herbs') + gameState.getItemCount('wild_herbs');
          const treantN = createEnemyFromDef(scene, treantDef, 11, 10, 1);
          treantN.hp = 1;
          treantN.criticalHp = 0;
          combat.setEnemies([treantN]);
          killer.targetEntity = treantN;
          (combat as any).executePlayerBasicAttack(killer, treantN, 10000 + i * 2000);
          assert.strictEqual(treantN.state, 'dead');
          if (gameState.getItemCount('druid_staff') > beforeStaff) {
            subsequentDrops++;
          }
          if (killer.getItemCount('wild_herbs') + gameState.getItemCount('wild_herbs') > beforeHerbs) {
            wildHerbDrops++;
          }
        }
      });
    } finally {
      Math.random = origRandom;
    }
    assert.ok(
      subsequentDrops >= 8 && subsequentDrops <= 24,
      `Subsequent Treant kills should drop druid_staff at ~15% rate (got ${subsequentDrops}/${subsequentKills})`
    );
    assert.ok(
      wildHerbDrops >= 35 && wildHerbDrops <= 65,
      `Treant wild_herbs rare_drop (chance 0.5) should drop ~50% of kills (got ${wildHerbDrops}/${subsequentKills})`
    );
    console.log(`  Subsequent 100 Treant kills: ${subsequentDrops}/100 Druid Staff drops (~15%), ${wildHerbDrops}/100 wild_herbs drops (~50%).`);
  }
  console.log('✓ PASS: Ancient Treant bandStats, Nature poison proc, first-kill guarantee, and 15% repeat drop verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 7: Save Round-Trip & Old Save Compatibility
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Save Round-Trip & Old Save Compatibility ---');
  {
    withQuietLogs(() => gameState.resetToDefault(playerData));
    gameState.setDruidStaffObtained(true);
    gameState.setGrovePityCounter(11);

    const savedOk = gameState.saveToDisk();
    assert.strictEqual(savedOk, true, 'saveToDisk() must succeed');

    // Reset in-memory state to verify loadFromDisk restores flags and counter
    withQuietLogs(() => gameState.resetToDefault(playerData));
    assert.strictEqual(gameState.hasObtainedDruidStaff(), false);
    assert.strictEqual(gameState.getGrovePityCounter(), 0);

    const loadedOk = gameState.loadFromDisk();
    assert.strictEqual(loadedOk, true, 'loadFromDisk() must return true');
    assert.strictEqual(gameState.hasObtainedDruidStaff(), true, 'druidStaffObtained flag must persist across save/load');
    assert.strictEqual(gameState.getGrovePityCounter(), 11, 'grovePityCounter must persist across save/load');

    // Simulate an old save lacking druid_staff proficiency, worldFlags, and grovePityCounter
    const rawSave = JSON.parse((global as any).localStorage.getItem((GameState as any).SAVE_STORAGE_KEY)!);
    const legacySnap: any = JSON.parse(JSON.stringify(rawSave.snapshot));
    delete legacySnap.proficiencies.druid_staff;
    delete legacySnap.worldFlags;
    delete legacySnap.grovePityCounter;
    if (legacySnap.party && legacySnap.party.length > 0) {
      for (const m of legacySnap.party) {
        if (m.proficiencies) {
          delete m.proficiencies.druid_staff;
        }
      }
    }

    gameState.restoreFromLoadedSnapshot(legacySnap);
    assert.strictEqual(gameState.hasObtainedDruidStaff(), false, 'Old save without worldFlags must default druidStaffObtained to false');
    assert.strictEqual(gameState.getGrovePityCounter(), 0, 'Old save without grovePityCounter must default to 0');

    const partySnaps = gameState.getPartySnapshots();
    assert.deepStrictEqual(
      partySnaps[0].proficiencies.druid_staff,
      { level: 0, currentExp: 0 },
      'Old save hero must load with druid_staff proficiency at { level: 0, currentExp: 0 }'
    );
    assert.deepStrictEqual(
      partySnaps[1].proficiencies.druid_staff,
      { level: 0, currentExp: 0 },
      'Old save companion must load with druid_staff proficiency at { level: 0, currentExp: 0 }'
    );
  }
  console.log('✓ PASS: Save round-trip and legacy save compatibility verified.\n');

  console.log('========================================================================');
  console.log('🎉 ALL 7 DRUID STAFF + OVERGROWN GROVE MILESTONE TESTS PASSED!');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
