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
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
import type { EnemyDef, WeaponDef } from '../src/types/game.ts';

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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 2000): Enemy {
  const def: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 5,
    aggroRadius: 10,
    attackIntervalMs: 1500,
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.isAggroed = true;
  return enemy;
}

const wave1Classes: { classId: string; weaponProf: string; defaultWeaponId: string; skills: string[] }[] = [
  {
    classId: 'guardian',
    weaponProf: 'shields',
    defaultWeaponId: 'longsword_1h',
    skills: ['shield_slam', 'brace', 'challenge', 'bulwark', 'last_stand']
  },
  {
    classId: 'squire',
    weaponProf: 'longswords',
    defaultWeaponId: 'longsword_1h',
    skills: ['measured_cut', 'sunder', 'wide_swing', 'second_wind', 'valiant_strike']
  },
  {
    classId: 'brute',
    weaponProf: 'greatswords',
    defaultWeaponId: 'greatswords',
    skills: ['heavy_swing', 'cleaving_arc', 'skull_crack', 'reckless_fury', 'earthshaker']
  },
  {
    classId: 'cutthroat',
    weaponProf: 'daggers',
    defaultWeaponId: 'daggers',
    skills: ['quick_stab', 'lacerate', 'shadowstep', 'dirty_trick', 'eviscerate']
  },
  {
    classId: 'marksman',
    weaponProf: 'bows',
    defaultWeaponId: 'bows',
    skills: ['aimed_shot', 'hobbling_shot', 'volley', 'steady_aim', 'deadeye']
  },
  {
    classId: 'bludgeoner',
    weaponProf: 'mace',
    defaultWeaponId: 'mace',
    skills: ['crushing_blow', 'concuss', 'armor_crack', 'bonebreaker', 'judgment_hammer']
  },
  {
    classId: 'lancer',
    weaponProf: 'spears',
    defaultWeaponId: 'spears',
    skills: ['jab', 'charge', 'sweep', 'hold_the_line', 'skewer']
  },
  {
    classId: 'skirmisher',
    weaponProf: 'throwing_weapons',
    defaultWeaponId: 'throwing_weapons',
    skills: ['hurl', 'barbed_throw', 'hit_and_run', 'scatter_throw', 'opening_volley']
  },
  {
    classId: 'staff_adept',
    weaponProf: 'staff',
    defaultWeaponId: 'staff',
    skills: ['staff_strike', 'rap_the_knuckles', 'whirling_staff', 'focused_breath', 'pressure_point']
  },
  {
    classId: 'brawler',
    weaponProf: 'fist',
    defaultWeaponId: 'fist',
    skills: ['normal_punch', 'jab_cross', 'haymaker', 'bob_and_weave', 'consecutive_normal_punches']
  }
];

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM WAVE 1: TIER 0 WEAPON CLASSES VALIDATION SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const statusEffectsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statusEffects.json'), 'utf8')).statusEffects;
  const validStatusIds = new Set(statusEffectsData.map((s: any) => s.id));
  const validGenericBuffStats = new Set([
    'damageReductionPercent',
    'damageTakenMultiplier',
    'damageAmplificationPercent',
    'bonusDamagePercent',
    'evasionBonus',
    'moveSpeedMultiplier'
  ]);
  const validLevels = new Set([1, 10, 20, 30, 40]);

  // ---------------------------------------------------------------------------
  // TEST 1: Data Validation Test
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Wave 1 Skills Data Validation ---');
  let checkedCount = 0;

  for (const kit of wave1Classes) {
    for (const skillId of kit.skills) {
      const def = dataLoader.getSkill(skillId);
      assert.ok(def, `Skill ${skillId} must exist in skills.json`);

      // Description check
      assert.ok(def.description && def.description.length > 0, `Skill ${skillId} must have non-empty description`);

      // AI definition check
      assert.ok(def.ai && def.ai.role, `Skill ${skillId} must have an AI block with role`);

      // classLevel requirement check
      const classLevelReq = def.requirements.find((r: any) => r.type === 'classLevel' && r.target === kit.classId);
      assert.ok(classLevelReq, `Skill ${skillId} must have classLevel requirement for ${kit.classId}`);
      assert.ok(
        validLevels.has(classLevelReq.value),
        `Skill ${skillId} classLevel requirement must be 1, 10, 20, 30, or 40 (got ${classLevelReq.value})`
      );

      // Effects validation
      if (skillId === 'normal_punch') {
        // Legacy fallback branch
        assert.ok(def.damageMultiplier !== undefined, 'normal_punch must specify damageMultiplier');
      } else {
        assert.ok(def.effects && def.effects.length > 0, `Skill ${skillId} must have effects array`);
        for (const eff of def.effects) {
          // Status ID check for applyStatus
          if (eff.type === 'applyStatus') {
            assert.ok(
              validStatusIds.has(eff.status),
              `Skill ${skillId} references unknown status "${eff.status}" in applyStatus`
            );
          }
          // Status ID check for requiresTargetStatus
          if (eff.type === 'damage' && eff.requiresTargetStatus) {
            assert.ok(
              validStatusIds.has(eff.requiresTargetStatus.status),
              `Skill ${skillId} references unknown status "${eff.requiresTargetStatus.status}" in requiresTargetStatus`
            );
          }
          // Buff / debuff generic stat check
          if (eff.type === 'buff' || eff.type === 'debuff') {
            assert.ok(
              validGenericBuffStats.has(eff.stat),
              `Skill ${skillId} uses non-generic buff stat "${eff.stat}"`
            );
          }
        }
      }
      checkedCount++;
    }
  }

  assert.strictEqual(checkedCount, 50, 'Must have validated all 50 Wave 1 skills');
  console.log(`✓ PASS: All 50 Wave 1 skills validated (effects, ai, description, cadence 1/10/20/30/40, generic buff stats, valid status IDs).\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Crushing Blow Golden Row (Damage, Miss, and Hit-Gated EXP)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Crushing Blow Golden Row ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();
    const maceWeapon: WeaponDef = {
      id: 'golden_test_mace',
      name: 'Test Heavy Mace',
      category: 'melee',
      proficiencyId: 'mace',
      baseDamage: 10,
      attackIntervalMs: 1500,
      attackRangeTiles: 1,
      baseAccuracy: 0.60
    };

    // Subtest 2.1: Exact hit damage (10 base * 1.8 = 18 dmg, deducts 22 energy, aggro, +2 EXP)
    {
      const tester = new Player(scene, 10, 10, playerData, maceWeapon, 32);
      tester.progression.setClassLevel('bludgeoner', 40);
      tester.mood = 50; // 1.0 combat multiplier
      tester.energy = 100;
      tester.equippedSkillIds = ['crushing_blow'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      const initialExp = tester.progression.getProficiencyStat('mace').currentExp;

      const originalRandom = Math.random;
      Math.random = () => 0.1; // forced hit (0.1 < 0.60)
      try {
        const ok = combat.castSkill(tester, 'crushing_blow', enemy, 1000);
        assert.strictEqual(ok, true, 'Crushing Blow cast must succeed');
        assert.strictEqual(enemy.hp, 82, 'Crushing Blow must deal exactly 18 damage (literal 1.8 × base 10)');
        assert.strictEqual(tester.energy, 78, 'Crushing Blow must deduct exactly 22 energy (100 - 22 = 78)');
        assert.strictEqual((enemy as any).isAggroed, true, 'Crushing Blow hit must set isAggroed');
        const postExp = tester.progression.getProficiencyStat('mace').currentExp;
        assert.strictEqual(postExp - initialExp, 2, 'Crushing Blow on hit must award exactly +2 mace EXP');
      } finally {
        Math.random = originalRandom;
      }
    }

    // Subtest 2.2: Miss behaviour (0 damage, consumes 22 energy, 0 EXP awarded)
    {
      const tester = new Player(scene, 10, 10, playerData, maceWeapon, 32);
      tester.progression.setClassLevel('bludgeoner', 40);
      tester.mood = 50;
      tester.energy = 100;
      tester.equippedSkillIds = ['crushing_blow'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      const initialExp = tester.progression.getProficiencyStat('mace').currentExp;

      const originalRandom = Math.random;
      Math.random = () => 0.99; // forced miss (0.99 > 0.60)
      try {
        const ok = combat.castSkill(tester, 'crushing_blow', enemy, 2000);
        assert.strictEqual(ok, true, 'Crushing Blow cast executes on miss');
        assert.strictEqual(enemy.hp, 100, 'Enemy must take 0 damage on miss (HP remains 100)');
        assert.strictEqual(tester.energy, 78, 'Crushing Blow consumes 22 energy on miss');
        const postExp = tester.progression.getProficiencyStat('mace').currentExp;
        assert.strictEqual(postExp - initialExp, 0, 'Crushing Blow must award 0 EXP on a miss');
      } finally {
        Math.random = originalRandom;
      }
    }

    console.log('✓ PASS: Crushing Blow golden row matches Power Strike parity (literal 18 dmg, miss 0 dmg, hit-gated +2 EXP).\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Kit Smoke Test (10 Classes × Scripted 3-Enemy Fight)
  // Companion casts at least 4 of its 5 skills within 60 s simulated time.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Wave 1 Kit Smoke Test (10 Classes × 60s Simulated Fight) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of wave1Classes) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const mainWeaponDef = dataLoader.getWeapon(kit.defaultWeaponId) || {
      id: kit.defaultWeaponId,
      name: kit.defaultWeaponId,
      category: 'melee',
      proficiencyId: kit.weaponProf,
      baseDamage: 12,
      attackIntervalMs: 1200,
      attackRangeTiles: kit.weaponProf === 'bows' ? 4 : kit.weaponProf === 'throwing_weapons' ? 3 : 1,
      baseAccuracy: 0.90
    };

    const companion = new Player(scene, 10, 10, playerData, mainWeaponDef, 32);
    companion.entityName = `Companion ${kit.classId}`;
    companion.progression.setClassLevel(kit.classId, 40);
    companion.progression.getProficiencyStat(kit.weaponProf).level = 30;
    if (kit.classId === 'guardian') {
      companion.progression.getProficiencyStat('shields').level = 30;
      companion.progression.getProficiencyStat('longswords').level = 30;
      companion.offhandWeapon = dataLoader.getWeapon('shields') || {
        id: 'shields',
        name: 'Wooden Shield',
        category: 'offhand',
        proficiencyId: 'shields',
        baseDamage: 2,
        attackIntervalMs: 1500,
        attackRangeTiles: 1,
        baseAccuracy: 0.70
      };
    }

    companion.equippedSkillIds = [...kit.skills];
    companion.energy = 100;
    companion.maxEnergy = 100;
    companion.hp = 100;
    companion.maxHp = 100;

    // Ally for support targeting (e.g. bulwark)
    const ally = new Player(scene, 9, 10, playerData, mainWeaponDef, 32);
    ally.entityName = 'Party Ally';
    ally.hp = 60; // slightly damaged to trigger support / shields
    ally.maxHp = 100;

    combat.party = [companion, ally];

    // 3 enemies: 2 clustered near companion (range 1-2) to satisfy enemiesInRadius: 2, 1 at range 3-4 for gap-closer
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000); // 1 tile away
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000); // 1.4 tiles away (cleave / AoE radius)
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000); // 3 tiles away (approach / gapCloser)
    combat.enemies = [enemy1, enemy2, enemy3];

    companion.targetEntity = enemy1;

    // Track casts
    const skillCounts: Record<string, number> = {};
    for (const sid of kit.skills) skillCounts[sid] = 0;

    const originalCastSkill = combat.castSkill.bind(combat);
    combat.castSkill = (caster: any, skillId: string, target?: any, currentTime?: number) => {
      const res = originalCastSkill(caster, skillId, target, currentTime);
      if (res && caster === companion && skillCounts[skillId] !== undefined) {
        skillCounts[skillId]++;
      }
      return res;
    };

    // Run 60 seconds simulation (dt = 250ms = 240 steps)
    const simTotalMs = 60000;
    const dt = 250;
    let now = 1000;

    for (let t = 0; t < simTotalMs; t += dt) {
      now += dt;
      scene.time.now = now;

      // Ensure companion has energy available to cast rotation / defensive skills
      if (companion.energy < 40) {
        companion.energy = Math.min(100, companion.energy + 15);
      }

      // Periodically lower companion HP around t = 15s to trigger low-HP defenses (last_stand, second_wind)
      if (t >= 15000 && t <= 25000 && companion.hp > 30) {
        companion.hp = 25; // triggers < 0.35 and < 0.50 conditions
      }

      // Switch targets if current dead or to allow gap-closer / target rotation
      if (t === 5000 && kit.skills.includes('shadowstep')) {
        companion.setGridPosition(10, 6); // step 4 tiles away from enemy1 to trigger shadowstep
        companion.targetEntity = enemy1;
      }
      if (t === 5000 && kit.skills.includes('charge')) {
        companion.setGridPosition(10, 6); // step 4 tiles away from enemy1 to trigger charge
        companion.targetEntity = enemy1;
      }

      combat.update(now, dt);
    }

    const castSkillCount = Object.values(skillCounts).filter(c => c > 0).length;
    const totalCasts = Object.values(skillCounts).reduce((a, b) => a + b, 0);

    perClassResults[kit.classId] = {
      totalCasts,
      distinctSkills: castSkillCount,
      skillCounts
    };

    assert.ok(
      castSkillCount >= 4,
      `Class ${kit.classId} must cast at least 4 of its 5 skills within 60s (cast ${castSkillCount}/5: ${JSON.stringify(skillCounts)})`
    );
  }

  console.log('Per-Class Cast Counts (60s Simulated Fight):');
  for (const [classId, result] of Object.entries(perClassResults)) {
    const breakdown = Object.entries(result.skillCounts).map(([id, c]) => `${id}: ${c}`).join(', ');
    console.log(`  - **${classId.toUpperCase()}**: ${result.distinctSkills}/5 distinct skills cast (${result.totalCasts} total casts) -> [${breakdown}]`);
  }

  console.log('\n✓ PASS: All 10 Wave 1 classes cast at least 4 of 5 skills within 60s.');

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM WAVE 1 TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
