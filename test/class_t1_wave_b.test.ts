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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Dummy Target', hp: number = 5000): any {
  const def: EnemyDef = {
    id: `dummy_${name.toLowerCase().replace(/\s+/g, '_')}`,
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

const t1WaveBClasses: {
  classId: string;
  name: string;
  magicProf: string;
  defaultWeaponId: string;
  skills: string[];
}[] = [
  {
    classId: 'flamecaller',
    name: 'Flamecaller',
    magicProf: 'fire_magic',
    defaultWeaponId: 'fire_magic',
    skills: ['fireball', 'combust', 'heat_wave', 'kindle', 'inferno']
  },
  {
    classId: 'frostcaller',
    name: 'Frostcaller',
    magicProf: 'water_magic',
    defaultWeaponId: 'water_magic',
    skills: ['frost_tide', 'undertow', 'tidal_surge', 'renewing_mist', 'deluge']
  },
  {
    classId: 'stormtouched',
    name: 'Stormtouched',
    magicProf: 'lightning_magic',
    defaultWeaponId: 'lightning_magic',
    skills: ['arc_bolt', 'static_charge', 'forked_lightning', 'thunder_strike', 'tempest']
  },
  {
    classId: 'windwalker',
    name: 'Windwalker',
    magicProf: 'wind_magic',
    defaultWeaponId: 'wind_magic',
    skills: ['cutting_gale', 'slipstream', 'vacuum_blade', 'squall', 'hurricane']
  },
  {
    classId: 'naturalist',
    name: 'Naturalist',
    magicProf: 'nature_magic',
    defaultWeaponId: 'nature_magic',
    skills: ['venom_thorn', 'rejuvenate', 'strangling_vines', 'toxic_bloom', 'natures_wrath']
  },
  {
    classId: 'priest',
    name: 'Priest',
    magicProf: 'holy_magic',
    defaultWeaponId: 'holy_magic',
    skills: ['holy_light', 'chastise', 'sanctuary', 'divine_grace', 'holy_fire']
  },
  {
    classId: 'warlock',
    name: 'Warlock',
    magicProf: 'dark_magic',
    defaultWeaponId: 'dark_magic',
    skills: ['eldritch_bolt', 'drain_life', 'agony', 'shadow_ward', 'soul_rend']
  }
];

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM TIER 1 WAVE B: MAGIC CLASSES VALIDATION SUITE');
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
  // TEST 1: Class Entries and Data Validation Test
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Tier 1 Wave B Classes & Skills Data Validation ---');

  for (const kit of t1WaveBClasses) {
    const classDef = dataLoader.getClass(kit.classId);
    assert.ok(classDef, `Class ${kit.classId} must exist in classes.json`);
    assert.strictEqual(classDef.tier, 'adept', `Class ${kit.classId} must be tier adept`);
    assert.ok(classDef.requirements && classDef.requirements.length >= 1, `Class ${kit.classId} must have at least 1 requirement`);
    assert.ok(classDef.fantasy && classDef.fantasy.length > 0, `Class ${kit.classId} must have fantasy text`);
    assert.ok(classDef.hiddenSkillBonuses && Object.keys(classDef.hiddenSkillBonuses).length > 0, `Class ${kit.classId} must have hiddenSkillBonuses`);
    assert.strictEqual(classDef.hiddenSkillBonuses.mana_regen, 0.05, `Class ${kit.classId} hiddenSkillBonuses must include mana_regen: 0.05`);
  }

  let checkedSkillCount = 0;

  for (const kit of t1WaveBClasses) {
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

      // Verify proficiency requirement is NOT present (classLevel only)
      const profReq = def.requirements.find((r: any) => r.type === 'proficiency');
      assert.strictEqual(profReq, undefined, `Skill ${skillId} must not have extra proficiency requirement (classLevel only)`);

      // Ranged check: rangeTiles: 4
      assert.strictEqual(def.rangeTiles, 4, `Skill ${skillId} must have rangeTiles: 4`);

      // Effects validation
      assert.ok(def.effects && def.effects.length > 0, `Skill ${skillId} must have effects array`);
      for (const eff of def.effects) {
        if (eff.type === 'applyStatus') {
          assert.ok(
            validStatusIds.has(eff.status),
            `Skill ${skillId} references unknown status "${eff.status}" in applyStatus`
          );
          // Timed poison check: every poison application gets durationMs: 6000
          if (eff.status === 'poison') {
            assert.strictEqual(
              eff.durationMs,
              6000,
              `Skill ${skillId} poison status must have durationMs: 6000 (got ${eff.durationMs})`
            );
          }
        }
        if (eff.type === 'damage') {
          assert.strictEqual(eff.scaling, 'spell', `Damage effect in skill ${skillId} must have scaling: "spell"`);
          if (eff.requiresTargetStatus) {
            assert.ok(
              validStatusIds.has(eff.requiresTargetStatus.status),
              `Skill ${skillId} references unknown status "${eff.requiresTargetStatus.status}" in requiresTargetStatus`
            );
          }
        }
        if (eff.type === 'buff' || eff.type === 'debuff') {
          assert.ok(
            validGenericBuffStats.has(eff.stat),
            `Skill ${skillId} uses non-generic buff stat "${eff.stat}"`
          );
        }
        if (eff.type === 'healOverTime') {
          assert.strictEqual(eff.tickIntervalMs, 1000, `HoT in skill ${skillId} must have tickIntervalMs: 1000`);
          assert.strictEqual(eff.target, 'lowestAlly', `HoT in skill ${skillId} must target lowestAlly`);
        }
      }

      checkedSkillCount++;
    }
  }

  assert.strictEqual(checkedSkillCount, 35, 'Must have validated all 35 Tier 1 Wave B skills');
  console.log(`✓ PASS: All 7 classes and 35 skills validated cleanly (requirements, effects, ai, cadence 1/10/20/30/40, generic buff stats, timed poison 6000ms, valid status IDs).\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Smoke Test (7 Classes × 60s Simulated 3-Enemy Fight, Ally at 60% HP)
  // Each companion at Lv 40 casts at least 4 of 5 skills within 60s without forced statuses or positions.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Tier 1 Wave B Smoke Test (7 Classes × 60s 3-Enemy Fight) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of t1WaveBClasses) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const mainWeaponDef = dataLoader.getWeapon(kit.defaultWeaponId) || {
      id: kit.defaultWeaponId,
      name: kit.defaultWeaponId,
      category: 'magic',
      proficiencyId: kit.magicProf,
      baseDamage: 10,
      attackIntervalMs: 1200,
      attackRangeTiles: 4,
      baseAccuracy: 0.90
    };

    const companion = new Player(scene, 10, 10, playerData, mainWeaponDef, 32);
    companion.entityName = `Companion ${kit.name}`;
    companion.progression.setClassLevel(kit.classId, 40);
    companion.progression.getProficiencyStat(kit.magicProf).level = 30;

    companion.equippedSkillIds = [...kit.skills];
    companion.energy = 100;
    companion.maxEnergy = 100;
    companion.hp = 100;
    companion.maxHp = 100;

    // Ally at 60% HP per specification
    const ally = new Player(scene, 9, 10, playerData, mainWeaponDef, 32);
    ally.entityName = 'Party Ally';
    ally.maxHp = 100;
    ally.hp = 60;

    combat.party = [companion, ally];

    // 3 enemies: 2 clustered near companion (range 1-2) to satisfy enemiesInRadius: 2, 1 at range 3-4 for ranged
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000); // 1 tile away
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000); // 1.4 tiles away (cleave / AoE radius)
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000); // 3 tiles away (ranged)
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

      // Keep companion energy available to cast rotation / defensive skills
      if (companion.energy < 40) {
        companion.energy = Math.min(100, companion.energy + 15);
      }

      // Maintain ally at 60% HP so support heals have an eligible target without dying
      if (ally.hp > 65) {
        ally.hp = 60;
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

  console.log('Per-Class Cast Counts (60s Simulated Fight, Ally at 60% HP):');
  for (const [classId, result] of Object.entries(perClassResults)) {
    const breakdown = Object.entries(result.skillCounts).map(([id, c]) => `${id}: ${c}`).join(', ');
    console.log(`  - **${classId.toUpperCase()}**: ${result.distinctSkills}/5 distinct skills cast (${result.totalCasts} total casts) -> [${breakdown}]`);
  }

  console.log('\n✓ PASS: All 7 Tier 1 Wave B classes cast at least 4 of 5 skills within 60s.');

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM TIER 1 WAVE B TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
