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

const t2WaveBClasses: {
  classId: string;
  name: string;
  magicProf: string;
  defaultWeaponId: string;
  skills: string[];
}[] = [
  {
    classId: 'elementalist',
    name: 'Elementalist',
    magicProf: 'fire_magic',
    defaultWeaponId: 'fire_staff',
    skills: ['prismatic_bolt', 'elemental_attunement', 'steam_burst', 'cyclone_flame', 'elemental_convergence']
  },
  {
    classId: 'aquamancer',
    name: 'Aquamancer',
    magicProf: 'water_magic',
    defaultWeaponId: 'water_staff',
    skills: ['tidal_lash', 'cleansing_wave', 'riptide_current', 'tidal_barrier', 'tsunami']
  },
  {
    classId: 'cryomancer',
    name: 'Cryomancer',
    magicProf: 'ice_magic',
    defaultWeaponId: 'ice_staff',
    skills: ['ice_shard_volley', 'deep_freeze', 'blizzard', 'frozen_armor', 'absolute_zero']
  },
  {
    classId: 'geomancer',
    name: 'Geomancer',
    magicProf: 'earth_magic',
    defaultWeaponId: 'earth_staff',
    skills: ['stone_spike', 'earthen_bulwark', 'rockslide', 'seismic_shock', 'tectonic_rupture']
  },
  {
    classId: 'cleric',
    name: 'Cleric',
    magicProf: 'holy_magic',
    defaultWeaponId: 'holy_staff',
    skills: ['greater_heal', 'renew', 'holy_word_shield', 'sanctified_ground', 'resurrection']
  }
];

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM TIER 2 WAVE B: MAGIC EXPERT CLASSES VALIDATION SUITE');
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
  console.log('--- TEST 1: Tier 2 Wave B Classes & Skills Data Validation ---');

  for (const kit of t2WaveBClasses) {
    const classDef = dataLoader.getClass(kit.classId);
    assert.ok(classDef, `Class ${kit.classId} must exist in classes.json`);
    assert.strictEqual(classDef.tier, 'expert', `Class ${kit.classId} must be tier expert`);
    assert.ok(classDef.requirements && classDef.requirements.length >= 1, `Class ${kit.classId} must have at least 1 requirement`);
    assert.ok(classDef.fantasy && classDef.fantasy.length > 0, `Class ${kit.classId} must have fantasy text`);
    assert.ok(classDef.hiddenSkillBonuses && Object.keys(classDef.hiddenSkillBonuses).length > 0, `Class ${kit.classId} must have hiddenSkillBonuses`);
    assert.strictEqual((classDef.hiddenSkillBonuses as any).mana_regen, 0.05, `Class ${kit.classId} must have mana_regen: 0.05 hiddenSkillBonus`);
  }

  let checkedSkillCount = 0;

  for (const kit of t2WaveBClasses) {
    for (const skillId of kit.skills) {
      const def = dataLoader.getSkill(skillId);
      assert.ok(def, `Skill ${skillId} must exist in skills.json`);

      // Description check: status effects land on main target only
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

      // Effects validation
      assert.ok(def.effects && def.effects.length > 0, `Skill ${skillId} must have effects array`);
      for (const eff of def.effects) {
        if (eff.type === 'applyStatus') {
          assert.ok(
            validStatusIds.has(eff.status),
            `Skill ${skillId} references unknown status "${eff.status}" in applyStatus`
          );
          if (eff.durationMs !== undefined) {
            assert.ok(
              eff.status === 'poison' || (def as any).durationOverrideReason !== undefined,
              `Skill ${skillId} has applyStatus.durationMs (${eff.durationMs}ms) for "${eff.status}", but durationMs is only allowed for poison or with durationOverrideReason`
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
          if (eff.stat) {
            assert.ok(
              validGenericBuffStats.has(eff.stat),
              `Skill ${skillId} uses non-generic buff stat "${eff.stat}"`
            );
          }
        }
      }

      checkedSkillCount++;
    }
  }

  assert.strictEqual(checkedSkillCount, 25, 'Must have validated all 25 Tier 2 Wave B skills');
  console.log(`✓ PASS: All 5 classes and 25 skills validated cleanly (requirements, effects, ai, cadence 1/10/20/30/40, generic buff stats, valid status IDs, no invalid durationMs).\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Smoke Test (5 Classes × 60s Simulated 3-Enemy Fight, Ally at 60% HP with timed poison)
  // Each companion at Lv 40 casts at least 4 of 5 skills within 60s without forced statuses or positions.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Tier 2 Wave B Smoke Test (5 Classes × 60s 3-Enemy Fight, Ally at 60% HP + timed poison) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of t2WaveBClasses) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const mainWeaponDef = dataLoader.getWeapon(kit.defaultWeaponId) || {
      id: kit.defaultWeaponId,
      name: kit.defaultWeaponId,
      category: 'magic',
      proficiencyId: kit.magicProf,
      baseDamage: 12,
      attackIntervalMs: 1200,
      attackRangeTiles: 4,
      baseAccuracy: 0.90
    };

    const companion = new Player(scene, 10, 10, playerData, mainWeaponDef, 32);
    companion.entityName = `Companion ${kit.name}`;
    companion.progression.setClassLevel(kit.classId, 40);

    // Setup magic proficiencies so skill prerequisites evaluate cleanly
    companion.progression.getProficiencyStat(kit.magicProf).level = 60;
    companion.progression.getProficiencyStat('fire_magic').level = 60;
    companion.progression.getProficiencyStat('water_magic').level = 60;
    companion.progression.getProficiencyStat('wind_magic').level = 60;
    companion.progression.getProficiencyStat('ice_magic').level = 60;
    companion.progression.getProficiencyStat('earth_magic').level = 60;
    companion.progression.getProficiencyStat('holy_magic').level = 60;
    companion.progression.getProficiencyStat('healing_magic').level = 60;

    companion.equippedSkillIds = [...kit.skills];
    companion.energy = 100;
    companion.maxEnergy = 100;
    companion.hp = 100;
    companion.maxHp = 100;

    // Ally at 60% HP with timed poison per brief
    const ally = new Player(scene, 9, 10, playerData, mainWeaponDef, 32);
    ally.entityName = 'Party Ally';
    ally.maxHp = 100;
    ally.hp = 60;

    combat.party = [companion, ally];

    // 3 enemies: 2 clustered near companion (range 1-2) to satisfy enemiesInRadius: 2, 1 at range 3-4 for line / ranged
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000); // 1 tile away
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000); // 1.4 tiles away (cleave / AoE radius)
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000); // 3 tiles away (ranged / line)
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
      if (companion.energy < 45) {
        companion.energy = Math.min(100, companion.energy + 20);
      }

      // Maintain ally at 60% HP and refresh timed poison if expired so support heals / cleanses have eligible targets
      if (ally.hp > 65) {
        ally.hp = 60;
      }
      if (!ally.hasStatusEffect('poison') && ally.state !== 'downed') {
        const poisonDef = dataLoader.getStatusEffect('poison');
        ally.applyStatusEffect(poisonDef, 6000);
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

  console.log('Per-Class Cast Counts (60s Simulated Fight, Ally at 60% HP + Poison):');
  for (const [classId, result] of Object.entries(perClassResults)) {
    const breakdown = Object.entries(result.skillCounts).map(([id, c]) => `${id}: ${c}`).join(', ');
    console.log(`  - **${classId.toUpperCase()}**: ${result.distinctSkills}/5 distinct skills cast (${result.totalCasts} total casts) -> [${breakdown}]`);
  }

  console.log('\n✓ PASS: All 5 Tier 2 Wave B classes cast at least 4 of 5 skills within 60s.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Specific Cast-Based Tests
  // - earthen_bulwark -> every party member takes x0.85
  // - resurrection -> downed ally within 8 tiles revives and caster's 'Ally Revived' stat increments
  // - cleansing_wave -> poisoned ally is cleansed AND healed 15
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Specific Cast-Based Mechanics ---');

  const originalRandom = Math.random;
  Math.random = () => 0.05; // 100% hit rate, no random misses

  try {
    // 3A: earthen_bulwark -> every party member takes x0.85
    {
      console.log('  3A: earthen_bulwark -> every party member takes x0.85');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const staffDef = dataLoader.getWeapon('earth_staff');

      const geomancer = new Player(scene, 10, 10, playerData, staffDef, 32);
      geomancer.progression.setClassLevel('geomancer', 40);
      geomancer.energy = 50;

      const ally1 = new Player(scene, 10, 11, playerData, staffDef, 32);
      ally1.hp = 100;
      ally1.maxHp = 100;

      const ally2 = new Player(scene, 10, 12, playerData, staffDef, 32);
      ally2.hp = 100;
      ally2.maxHp = 100;

      combat.party = [geomancer, ally1, ally2];

      const castOk = combat.castSkill(geomancer, 'earthen_bulwark', geomancer, 1000);
      assert.strictEqual(castOk, true, 'earthen_bulwark cast successfully');

      assert.strictEqual(geomancer.hasStatusEffect('earthen_bulwark'), true, 'geomancer has earthen_bulwark');
      assert.strictEqual(ally1.hasStatusEffect('earthen_bulwark'), true, 'ally1 has earthen_bulwark');
      assert.strictEqual(ally2.hasStatusEffect('earthen_bulwark'), true, 'ally2 has earthen_bulwark');

      // Geomancer takes 100 raw damage -> 100 * 0.85 = 85 damage -> 100 - 85 = 15 HP
      geomancer.hp = 100;
      geomancer.maxHp = 100;
      geomancer.takeDamage(100);
      assert.strictEqual(geomancer.hp, 15, `Geomancer took 85 damage (100 -> 15): ${geomancer.hp}`);

      // Ally1 takes 100 raw damage -> 85 damage -> 100 - 85 = 15 HP
      ally1.takeDamage(100);
      assert.strictEqual(ally1.hp, 15, `Ally1 took 85 damage (100 -> 15): ${ally1.hp}`);

      // Ally2 takes 60 raw damage -> 60 * 0.85 = 51 damage -> 100 - 51 = 49 HP
      ally2.takeDamage(60);
      assert.strictEqual(ally2.hp, 49, `Ally2 took 51 damage (100 -> 49): ${ally2.hp}`);
      console.log('    ✓ earthen_bulwark applied to entire party and reduces damage taken to x0.85.');
    }

    // 3B: resurrection -> downed ally within 8 tiles revives and caster's 'Ally Revived' stat increments
    {
      console.log('  3B: resurrection -> downed ally within 8 tiles revives and caster stat increments');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const staffDef = dataLoader.getWeapon('holy_staff');

      const cleric = new Player(scene, 10, 10, playerData, staffDef, 32);
      cleric.progression.setClassLevel('cleric', 40);
      cleric.energy = 50;

      // Downed ally at distance 7 tiles (within 8 tiles)
      const allyIn = new Player(scene, 10, 17, playerData, staffDef, 32);
      allyIn.entityName = 'Downed Ally (Dist 7)';
      allyIn.hp = 0;
      allyIn.state = 'downed';

      // Downed ally at distance 9 tiles (outside 8 tiles)
      const allyOut = new Player(scene, 10, 19, playerData, staffDef, 32);
      allyOut.entityName = 'Downed Ally (Dist 9)';
      allyOut.hp = 0;
      allyOut.state = 'downed';

      combat.party = [cleric, allyIn, allyOut];

      const initialRevives = cleric.progression.getActivityCount('Ally Revived');

      const castOk = combat.castSkill(cleric, 'resurrection', cleric, 1000);
      assert.strictEqual(castOk, true, 'resurrection cast successfully');

      assert.notStrictEqual(allyIn.state, 'downed', 'Ally within 8 tiles is revived (state != downed)');
      assert.strictEqual(allyIn.hp > 0, true, 'Ally within 8 tiles has positive HP');

      assert.strictEqual(allyOut.state, 'downed', 'Ally beyond 8 tiles was NOT revived');

      const finalRevives = cleric.progression.getActivityCount('Ally Revived');
      assert.strictEqual(finalRevives - initialRevives, 1, 'Cleric Ally Revived activity count incremented by 1');
      console.log('    ✓ resurrection revives downed ally within 8 tiles and increments Ally Revived stat.');
    }

    // 3C: cleansing_wave -> poisoned ally is cleansed AND healed 15
    {
      console.log('  3C: cleansing_wave -> poisoned ally is cleansed AND healed 15');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const staffDef = dataLoader.getWeapon('water_staff');

      const aquamancer = new Player(scene, 10, 10, playerData, staffDef, 32);
      aquamancer.progression.setClassLevel('aquamancer', 40);
      aquamancer.energy = 50;

      const poisonedAlly = new Player(scene, 10, 12, playerData, staffDef, 32);
      poisonedAlly.entityName = 'Poisoned Ally';
      poisonedAlly.hp = 50;
      poisonedAlly.maxHp = 100;

      const poisonDef = dataLoader.getStatusEffect('poison');
      poisonedAlly.applyStatusEffect(poisonDef, 6000);
      assert.strictEqual(poisonedAlly.hasStatusEffect('poison'), true, 'Ally has poison status before cleansing_wave');

      combat.party = [aquamancer, poisonedAlly];

      const castOk = combat.castSkill(aquamancer, 'cleansing_wave', poisonedAlly, 1000);
      assert.strictEqual(castOk, true, 'cleansing_wave cast successfully');

      // Assert poison removed
      assert.strictEqual(poisonedAlly.hasStatusEffect('poison'), false, 'Poison status removed after cleansing_wave');

      // Assert healed 15 HP (50 -> 65)
      assert.strictEqual(poisonedAlly.hp, 65, `Poisoned ally was healed 15 HP (50 -> 65): ${poisonedAlly.hp}`);
      console.log('    ✓ cleansing_wave cleanses harmful status and heals ally for 15 HP.');
    }
  } finally {
    Math.random = originalRandom;
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM TIER 2 WAVE B TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
