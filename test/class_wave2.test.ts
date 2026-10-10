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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 5000): Enemy {
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

const wave2Classes: { classId: string; magicSchool: string; conduitWeaponId: string; skills: string[] }[] = [
  {
    classId: 'medic',
    magicSchool: 'healing_magic',
    conduitWeaponId: 'healing_staff',
    skills: ['mend', 'soothing_touch', 'purify', 'protective_ward', 'healing_circle']
  },
  {
    classId: 'acolyte',
    magicSchool: 'holy_magic',
    conduitWeaponId: 'holy_staff',
    skills: ['sacred_spark', 'consecrate', 'prayer_of_mending', 'judgment', 'radiant_burst']
  },
  {
    classId: 'cultist',
    magicSchool: 'dark_magic',
    conduitWeaponId: 'dark_staff',
    skills: ['shadow_bolt', 'hex', 'siphon_life', 'shroud', 'doom']
  },
  {
    classId: 'spark_adept',
    magicSchool: 'lightning_magic',
    conduitWeaponId: 'lightning_staff',
    skills: ['zap', 'chain_lightning', 'overload', 'thunderclap', 'storm_call']
  },
  {
    classId: 'frost_initiate',
    magicSchool: 'ice_magic',
    conduitWeaponId: 'ice_staff',
    skills: ['frost_shard', 'ice_lance', 'frost_nova', 'ice_armor', 'glacial_spike']
  },
  {
    classId: 'tide_adept',
    magicSchool: 'water_magic',
    conduitWeaponId: 'water_staff',
    skills: ['water_jet', 'riptide', 'tidal_wave', 'healing_rain', 'maelstrom']
  },
  {
    classId: 'sprout_keeper',
    magicSchool: 'nature_magic',
    conduitWeaponId: 'nature_staff',
    skills: ['thorn_dart', 'entangle', 'bloom', 'bramble_patch', 'wild_growth']
  },
  {
    classId: 'gale_adept',
    magicSchool: 'wind_magic',
    conduitWeaponId: 'wind_staff',
    skills: ['gust', 'updraft', 'razor_wind', 'crosswind', 'tempest_lance']
  },
  {
    classId: 'stoneheart_initiate',
    magicSchool: 'earth_magic',
    conduitWeaponId: 'earth_staff',
    skills: ['pebble_shot', 'granite_skin', 'tremor', 'earthen_ward', 'landslide']
  }
];

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM WAVE 2: TIER 0 MAGIC CLASSES VALIDATION SUITE');
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
  // TEST 1: Area Shapes Engine Tests (line and chain)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Area Shapes Engine Tests (line and chain) ---');
  {
    // 1.1 Line shape test:
    // 3 enemies in a row behind target -> all 3 hit; an enemy off the line -> not hit.
    {
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const windStaff = dataLoader.getWeapon('wind_staff')!;
      const caster = new Player(scene, 0, 0, playerData, windStaff, 32);
      caster.entityName = 'Gale Runner';

      // Primary target at (2, 0)
      const primary = createDummyEnemy(scene, 2, 0, 'Primary', 100);
      // 3 enemies in a row behind target: (3, 0), (4, 0), (5, 0)
      const behind1 = createDummyEnemy(scene, 3, 0, 'Behind 1', 100);
      const behind2 = createDummyEnemy(scene, 4, 0, 'Behind 2', 100);
      const behind3 = createDummyEnemy(scene, 5, 0, 'Behind 3', 100);
      // Enemy off the line at (3, 3)
      const offLine = createDummyEnemy(scene, 3, 3, 'Off Line', 100);

      combat.party = [caster];
      combat.enemies = [primary, behind1, behind2, behind3, offLine];

      // Skill with line area: maxTargets: 4 (primary + 3 secondary), falloff 0.2
      const lineSkill = {
        id: 'test_line_skill',
        name: 'Test Line Skill',
        energyCost: 20,
        cooldownMs: 1000,
        rangeTiles: 4,
        targetType: 'enemy' as const,
        description: 'Test line skill',
        effects: [
          {
            type: 'damage' as const,
            scaling: 'spell' as const,
            multiplier: 1.0,
            area: {
              shape: 'line' as const,
              maxTargets: 4,
              falloff: 0.2
            }
          }
        ]
      };

      // Primary hit dealt via skillSystem
      (combat as any).skillSystem.execute(caster, lineSkill as any, primary, 1000);

      // Primary hit: base 7 (wind_staff spell weapon is wind_magic base 5, wait check weapon)
      // Regardless of exact base damage, check hp reduced:
      assert.ok(primary.hp < 100, 'Primary target was hit');
      assert.ok(behind1.hp < 100, 'Behind 1 target was hit');
      assert.ok(behind2.hp < 100, 'Behind 2 target was hit');
      assert.ok(behind3.hp < 100, 'Behind 3 target was hit');
      assert.strictEqual(offLine.hp, 100, 'Off-line enemy was NOT hit');

      // Check falloff damage on secondary targets: baseDamage * (1 - 0.2) = baseDamage * 0.8
      const primaryLoss = 100 - primary.hp;
      const secondaryLoss = 100 - behind1.hp;
      assert.strictEqual(Math.round(secondaryLoss), Math.round(primaryLoss * 0.8), 'Secondary line targets take falloff damage');
      console.log('✓ PASS: Line shape hits all 3 enemies in corridor behind target, spares off-line enemy, and applies falloff.');
    }

    // 1.2 Chain shape test:
    // Enemies at 2 and 5 tiles from target with radius: 3 -> only the near one is hit, and it takes falloff damage.
    {
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const lightningStaff = dataLoader.getWeapon('lightning_staff')!;
      const caster = new Player(scene, 0, 0, playerData, lightningStaff, 32);
      caster.entityName = 'Spark Caster';

      // Primary target at (2, 0)
      const primary = createDummyEnemy(scene, 2, 0, 'Target', 100);
      // Enemy at 2 tiles from target: (4, 0)
      const nearEnemy = createDummyEnemy(scene, 4, 0, 'Near Enemy', 100);
      // Enemy at 5 tiles from target: (2, 5) - dist from primary is 5, dist from nearEnemy is max(2, 5)=5
      const farEnemy = createDummyEnemy(scene, 2, 5, 'Far Enemy', 100);

      combat.party = [caster];
      combat.enemies = [primary, nearEnemy, farEnemy];

      const chainSkill = {
        id: 'test_chain_skill',
        name: 'Test Chain Skill',
        energyCost: 20,
        cooldownMs: 1000,
        rangeTiles: 4,
        targetType: 'enemy' as const,
        description: 'Test chain skill',
        effects: [
          {
            type: 'damage' as const,
            scaling: 'spell' as const,
            multiplier: 1.0,
            area: {
              shape: 'chain' as const,
              maxTargets: 3,
              radius: 3,
              falloff: 0.3
            }
          }
        ]
      };

      (combat as any).skillSystem.execute(caster, chainSkill as any, primary, 1000);

      assert.ok(primary.hp < 100, 'Primary target was hit');
      assert.ok(nearEnemy.hp < 100, 'Near enemy (within radius 3) was hit by chain hop');
      assert.strictEqual(farEnemy.hp, 100, 'Far enemy (5 tiles away, beyond radius 3) was spared');

      const primaryLoss = 100 - primary.hp;
      const hopLoss = 100 - nearEnemy.hp;
      assert.strictEqual(Math.round(hopLoss), Math.round(primaryLoss * 0.7), 'Chain hop takes falloff damage (1 - 0.3 = 0.7)');
      console.log('✓ PASS: Chain shape hops to enemy within radius 3, spares enemy at distance 5, and applies falloff damage.\n');
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Wave 2 Skills Data Validation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Wave 2 Skills Data Validation ---');
  let checkedCount = 0;

  for (const kit of wave2Classes) {
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
      assert.ok(def.effects && def.effects.length > 0, `Skill ${skillId} must have effects array`);
      for (const eff of def.effects) {
        // Damage scaling check
        if (eff.type === 'damage') {
          assert.strictEqual(eff.scaling, 'spell', `Skill ${skillId} damage effect must use scaling: 'spell'`);
        }

        // Status ID check for applyStatus
        if (eff.type === 'applyStatus') {
          assert.ok(
            validStatusIds.has(eff.status),
            `Skill ${skillId} references unknown status "${eff.status}" in applyStatus`
          );
          // Special rule: Every poison application has durationMs
          if (eff.status === 'poison') {
            assert.ok(
              eff.durationMs !== undefined && eff.durationMs > 0,
              `Skill ${skillId} applies poison without durationMs (must have durationMs, e.g. 6000)`
            );
          }
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
      checkedCount++;
    }
  }

  assert.strictEqual(checkedCount, 45, 'Must have validated all 45 Wave 2 skills');
  console.log(`✓ PASS: All 45 Wave 2 skills validated (effects, ai, description, cadence 1/10/20/30/40, generic buff stats, valid status IDs, spell scaling, timed poison).\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Smoke Test (9 Classes × Scripted 3-Enemy Fight)
  // Companion at Lv 40 with 1 ally at 60% HP who starts with timed poison.
  // Casts at least 4 of 5 skills within 60 s.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Wave 2 Kit Smoke Test (9 Classes × 60s Simulated Fight) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of wave2Classes) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const conduitDef = dataLoader.getWeapon(kit.conduitWeaponId);
    assert.ok(conduitDef, `Conduit weapon ${kit.conduitWeaponId} must exist`);

    const companion = new Player(scene, 10, 10, playerData, conduitDef, 32);
    companion.entityName = `Companion ${kit.classId}`;
    companion.progression.setClassLevel(kit.classId, 40);
    companion.progression.getProficiencyStat(kit.magicSchool).level = 30;

    companion.equippedSkillIds = [...kit.skills];
    companion.energy = 100;
    companion.maxEnergy = 100;
    companion.hp = 100;
    companion.maxHp = 100;

    // Ally at 60% HP who starts with timed poison (to trigger heal, HoT, shield, and cleanse)
    const ally = new Player(scene, 9, 10, playerData, conduitDef, 32);
    ally.entityName = 'Party Ally';
    ally.hp = 60;
    ally.maxHp = 100;
    const poisonStatusDef = {
      ...(dataLoader.getStatusEffect('poison')!),
      persistent: false,
      durationMs: 6000
    };
    ally.applyStatusEffect(poisonStatusDef);

    combat.party = [companion, ally];

    // 3 enemies: 2 clustered near companion (range 1-2) to satisfy enemiesInRadius: 2, 1 at range 3
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000);
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000);
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000);
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

      // Maintain energy
      if (companion.energy < 40) {
        companion.energy = Math.min(100, companion.energy + 20);
      }

      // Maintain ally wounded at ~55% HP so support skills (especially ally<0.6 like healing_circle, wild_growth) trigger
      if (ally.hp > 55) {
        ally.hp = 55;
      }
      // Reapply harmful status periodically if cured, so purify / cleanse continues to have target if needed
      if (!ally.hasStatusEffect('poison') && t < 30000) {
        ally.applyStatusEffect(poisonStatusDef);
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

  console.log('\n========================================================================');
  console.log('ALL CLASS PROGRAM WAVE 2 TESTS PASSED PERFECTLY!');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
