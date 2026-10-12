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

const t3MasterClasses: {
  classId: string;
  name: string;
  weaponProf: string;
  defaultWeaponId: string;
  skills: string[];
}[] = [
  {
    classId: 'sword_saint',
    name: 'Sword Saint',
    weaponProf: 'katana',
    defaultWeaponId: 'katana',
    skills: ['heavenly_cut', 'mirror_stance', 'thousand_petal_slash', 'void_step', 'final_form_flash']
  },
  {
    classId: 'death_knight',
    name: 'Death Knight',
    weaponProf: 'greatswords',
    defaultWeaponId: 'greatswords',
    skills: ['grave_cleave', 'unholy_armor', 'death_grip', 'plague_strike', 'army_of_ruin']
  },
  {
    classId: 'celestial_knight',
    name: 'Celestial Knight',
    weaponProf: 'longswords',
    defaultWeaponId: 'longsword_1h',
    skills: ['radiant_blade', 'celestial_ward', 'judgment_of_light', 'seraphic_restoration', 'heavens_verdict']
  },
  {
    classId: 'shadow_monk',
    name: 'Shadow Monk',
    weaponProf: 'short_swords',
    defaultWeaponId: 'short_swords',
    skills: ['shadow_palm', 'phantom_step', 'nerve_strike', 'umbral_flurry', 'thousand_shadows']
  },
  {
    classId: 'demon_hunter',
    name: 'Demon Hunter',
    weaponProf: 'crossbows',
    defaultWeaponId: 'crossbows',
    skills: ['blessed_bolt', 'hunters_brand', 'consecrated_volley', 'holy_ward', 'banishment']
  },
  {
    classId: 'arcane_knight',
    name: 'Arcane Knight',
    weaponProf: 'longswords',
    defaultWeaponId: 'longsword_1h',
    skills: ['arcane_edge', 'mana_blade', 'spell_breaker', 'arcane_overload', 'astral_annihilation']
  },
  {
    classId: 'elemental_knight',
    name: 'Elemental Knight',
    weaponProf: 'longswords',
    defaultWeaponId: 'longsword_1h',
    skills: ['elemental_strike', 'frost_brand', 'storm_edge', 'elemental_aegis', 'trinity_slash']
  },
  {
    classId: 'tempest',
    name: 'Tempest',
    weaponProf: 'bows',
    defaultWeaponId: 'bows',
    skills: ['gale_arrow', 'storm_shroud', 'thunderstorm', 'cyclone_shot', 'eye_of_the_storm']
  }
];

const expectedT3Table: Record<string, {
  en: number;
  cd: number;
  role: string;
  priority: number;
  condition?: Record<string, any>;
}> = {
  // Sword Saint
  heavenly_cut: { en: 16, cd: 3000, role: 'rotation', priority: 30 },
  mirror_stance: { en: 26, cd: 18000, role: 'defensive', priority: 65, condition: { enemiesInRadius: 1 } },
  thousand_petal_slash: { en: 30, cd: 8000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  void_step: { en: 28, cd: 10000, role: 'gapCloser', priority: 65 },
  final_form_flash: { en: 48, cd: 18000, role: 'finisher', priority: 85 },
  // Death Knight
  grave_cleave: { en: 22, cd: 4000, role: 'rotation', priority: 30 },
  unholy_armor: { en: 26, cd: 18000, role: 'defensive', priority: 60 },
  death_grip: { en: 28, cd: 14000, role: 'defensive', priority: 70, condition: { enemiesInRadius: 1 } },
  plague_strike: { en: 30, cd: 9000, role: 'rotation', priority: 55 },
  army_of_ruin: { en: 50, cd: 20000, role: 'rotation', priority: 85, condition: { enemiesInRadius: 2 } },
  // Celestial Knight
  radiant_blade: { en: 18, cd: 3000, role: 'rotation', priority: 30 },
  celestial_ward: { en: 30, cd: 20000, role: 'defensive', priority: 65 },
  judgment_of_light: { en: 32, cd: 10000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  seraphic_restoration: { en: 44, cd: 20000, role: 'support', priority: 85, condition: { allyHpBelow: 0.5 } },
  heavens_verdict: { en: 50, cd: 20000, role: 'finisher', priority: 85 },
  // Shadow Monk
  shadow_palm: { en: 16, cd: 3000, role: 'rotation', priority: 30 },
  phantom_step: { en: 22, cd: 16000, role: 'defensive', priority: 60 },
  nerve_strike: { en: 26, cd: 9000, role: 'rotation', priority: 55 },
  umbral_flurry: { en: 30, cd: 10000, role: 'gapCloser', priority: 65 },
  thousand_shadows: { en: 48, cd: 18000, role: 'finisher', priority: 85 },
  // Demon Hunter
  blessed_bolt: { en: 18, cd: 3000, role: 'rotation', priority: 30 },
  hunters_brand: { en: 20, cd: 10000, role: 'rotation', priority: 50 },
  consecrated_volley: { en: 30, cd: 9000, role: 'rotation', priority: 55, condition: { enemiesInRadius: 2 } },
  holy_ward: { en: 28, cd: 18000, role: 'defensive', priority: 60 },
  banishment: { en: 50, cd: 18000, role: 'finisher', priority: 85 },
  // Arcane Knight
  arcane_edge: { en: 18, cd: 3000, role: 'rotation', priority: 30 },
  mana_blade: { en: 26, cd: 20000, role: 'defensive', priority: 60 },
  spell_breaker: { en: 28, cd: 9000, role: 'rotation', priority: 55 },
  arcane_overload: { en: 34, cd: 12000, role: 'rotation', priority: 65 },
  astral_annihilation: { en: 52, cd: 20000, role: 'finisher', priority: 85 },
  // Elemental Knight
  elemental_strike: { en: 18, cd: 3000, role: 'rotation', priority: 30 },
  frost_brand: { en: 24, cd: 8000, role: 'rotation', priority: 50 },
  storm_edge: { en: 30, cd: 9000, role: 'rotation', priority: 55, condition: { enemiesInRadius: 2 } },
  elemental_aegis: { en: 24, cd: 18000, role: 'defensive', priority: 55 },
  trinity_slash: { en: 50, cd: 18000, role: 'finisher', priority: 85 },
  // Tempest
  gale_arrow: { en: 16, cd: 3000, role: 'rotation', priority: 30 },
  storm_shroud: { en: 22, cd: 16000, role: 'defensive', priority: 55 },
  thunderstorm: { en: 34, cd: 10000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  cyclone_shot: { en: 30, cd: 10000, role: 'rotation', priority: 55 },
  eye_of_the_storm: { en: 52, cd: 20000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } }
};

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM TIER 3: MASTER CLASSES VALIDATION SUITE');
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
  // TEST 1: Class Entries, Statuses, and Expected-Table Guard Data Validation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Tier 3 Master Classes, Statuses & 40 Skills Data Validation ---');

  // Verify the 2 new statuses in statusEffects.json
  const mirrorStanceStatus = dataLoader.getStatusEffect('mirror_stance');
  assert.ok(mirrorStanceStatus, 'Status mirror_stance must exist in statusEffects.json');
  assert.deepStrictEqual(mirrorStanceStatus.counterOnHit, { consume: false }, 'mirror_stance must have counterOnHit: { consume: false }');
  assert.strictEqual(mirrorStanceStatus.evasionBonus, 0.2, 'mirror_stance must have evasionBonus: 0.2');
  assert.strictEqual(mirrorStanceStatus.durationMs, 4000, 'mirror_stance must have durationMs: 4000');

  const manaBladeStatus = dataLoader.getStatusEffect('mana_blade');
  assert.ok(manaBladeStatus, 'Status mana_blade must exist in statusEffects.json');
  assert.strictEqual(manaBladeStatus.bonusDamagePercent, 0.3, 'mana_blade must have bonusDamagePercent: 0.3');
  assert.strictEqual(manaBladeStatus.energySiphonOnHit, 4, 'mana_blade must have energySiphonOnHit: 4');
  assert.strictEqual(manaBladeStatus.durationMs, 10000, 'mana_blade must have durationMs: 10000');

  for (const kit of t3MasterClasses) {
    const classDef = dataLoader.getClass(kit.classId);
    assert.ok(classDef, `Class ${kit.classId} must exist in classes.json`);
    assert.strictEqual(classDef.tier, 'master', `Class ${kit.classId} must be tier master`);
    assert.ok(classDef.requirements && classDef.requirements.length >= 1, `Class ${kit.classId} must have at least 1 requirement`);
    assert.ok(classDef.fantasy && classDef.fantasy.length > 0, `Class ${kit.classId} must have fantasy text`);
    assert.ok(classDef.hiddenSkillBonuses && Object.keys(classDef.hiddenSkillBonuses).length > 0, `Class ${kit.classId} must have hiddenSkillBonuses`);
  }

  let checkedSkillCount = 0;

  for (const kit of t3MasterClasses) {
    for (const skillId of kit.skills) {
      const def = dataLoader.getSkill(skillId);
      assert.ok(def, `Skill ${skillId} must exist in skills.json`);

      const exp = expectedT3Table[skillId];
      assert.ok(exp, `Skill ${skillId} must exist in expectedT3Table`);
      assert.strictEqual(def.energyCost, exp.en, `Skill ${skillId} energyCost must be ${exp.en} (got ${def.energyCost})`);
      assert.strictEqual(def.cooldownMs, exp.cd, `Skill ${skillId} cooldownMs must be ${exp.cd} (got ${def.cooldownMs})`);
      assert.ok(def.ai, `Skill ${skillId} must have ai object`);
      assert.strictEqual(def.ai.role, exp.role, `Skill ${skillId} ai.role must be ${exp.role} (got ${def.ai.role})`);
      assert.strictEqual(def.ai.priority, exp.priority, `Skill ${skillId} ai.priority must be ${exp.priority} (got ${def.ai.priority})`);
      assert.deepStrictEqual(def.ai.condition, exp.condition, `Skill ${skillId} ai.condition must match spec`);

      // Description check
      assert.ok(def.description && def.description.length > 0, `Skill ${skillId} must have non-empty description`);

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
          assert.strictEqual(eff.scaling, 'weapon', `Damage effect in skill ${skillId} must have scaling: "weapon"`);
          if (eff.requiresTargetStatus) {
            assert.ok(
              validStatusIds.has(eff.requiresTargetStatus.status),
              `Skill ${skillId} references unknown status "${eff.requiresTargetStatus.status}" in requiresTargetStatus`
            );
          }
          if (eff.requiresSelfStatus) {
            assert.ok(
              validStatusIds.has(eff.requiresSelfStatus.status),
              `Skill ${skillId} references unknown status "${eff.requiresSelfStatus.status}" in requiresSelfStatus`
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

  assert.strictEqual(checkedSkillCount, 40, 'Must have validated all 40 Tier 3 Master skills');
  console.log(`✓ PASS: All 8 Master classes, 2 status effects, and 40 skills validated cleanly against expectedT3Table.\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Smoke Test (8 Classes × 60s Simulated 3-Enemy Fight, Ally at 60% HP + Timed Poison)
  // Each companion at Lv 40 casts at least 4 of 5 skills within 60s.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Tier 3 Master Classes Smoke Test (8 Classes × 60s 3-Enemy Fight, Ally at 60% HP + Timed Poison) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of t3MasterClasses) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const isRanged = kit.weaponProf === 'bows' || kit.weaponProf === 'crossbows';
    const mainWeaponDef = dataLoader.getWeapon(kit.defaultWeaponId) || {
      id: kit.defaultWeaponId,
      name: kit.defaultWeaponId,
      category: isRanged ? 'ranged' : 'melee',
      proficiencyId: kit.weaponProf,
      baseDamage: 12,
      attackIntervalMs: 1200,
      attackRangeTiles: isRanged ? 4 : 1,
      baseAccuracy: 0.90
    };

    const companion = new Player(scene, 10, 10, playerData, mainWeaponDef, 32);
    companion.entityName = `Companion ${kit.name}`;
    companion.progression.setClassLevel(kit.classId, 40);

    // Setup proficiencies so all skill conditions and accuracy evaluate cleanly
    companion.progression.getProficiencyStat(kit.weaponProf).level = 90;
    companion.progression.getProficiencyStat('katana').level = 90;
    companion.progression.getProficiencyStat('longswords').level = 90;
    companion.progression.getProficiencyStat('greatswords').level = 90;
    companion.progression.getProficiencyStat('short_swords').level = 60;
    companion.progression.getProficiencyStat('daggers').level = 60;
    companion.progression.getProficiencyStat('crossbows').level = 60;
    companion.progression.getProficiencyStat('bows').level = 60;
    companion.progression.getProficiencyStat('dark_magic').level = 60;
    companion.progression.getProficiencyStat('holy_magic').level = 60;
    companion.progression.getProficiencyStat('healing_magic').level = 30;
    companion.progression.getProficiencyStat('arcane_magic').level = 90;
    companion.progression.getProficiencyStat('fire_magic').level = 30;
    companion.progression.getProficiencyStat('water_magic').level = 30;
    companion.progression.getProficiencyStat('lightning_magic').level = 30;
    companion.progression.getProficiencyStat('wind_magic').level = 60;

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

    // 3 enemies: 2 clustered near companion (range 1-2) to satisfy enemiesInRadius: 2, 1 at range 3-4 for gap-closer / ranged
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000); // 1 tile away
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000); // 1.4 tiles away (cleave / AoE radius)
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000); // 3 tiles away (ranged / gap closer)
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

      // Keep companion energy available to cast rotation / defensive / finisher skills
      if (companion.energy < 55) {
        companion.energy = Math.min(100, companion.energy + 25);
      }

      // Maintain ally at 60% HP and refresh timed poison (6000ms) if expired
      if (ally.hp > 65) {
        ally.hp = 60;
      }
      if (!ally.hasStatusEffect('poison') && ally.state !== 'downed') {
        const poisonDef = dataLoader.getStatusEffect('poison');
        ally.applyStatusEffect({ ...poisonDef, durationMs: 6000 });
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

  console.log('Per-Class Cast Counts (60s Simulated Fight, Ally at 60% HP + Timed Poison):');
  for (const [classId, result] of Object.entries(perClassResults)) {
    const breakdown = Object.entries(result.skillCounts).map(([id, c]) => `${id}: ${c}`).join(', ');
    console.log(`  - **${classId.toUpperCase()}**: ${result.distinctSkills}/5 distinct skills cast (${result.totalCasts} total casts) -> [${breakdown}]`);
  }

  console.log('\n✓ PASS: All 8 Tier 3 Master classes cast at least 4 of 5 skills within 60s.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Specific Cast-Based Tests
  // - mirror_stance -> two hits give two counters
  // - mana_blade + arcane_overload -> the EN refund, x1.3 and the cleave
  // - seraphic_restoration -> the poison is cleansed AND the party is healed 30
  // - astral_annihilation -> it dumps up to 30 EN
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Specific Cast-Based Mechanics ---');

  const originalRandom = Math.random;
  Math.random = () => 0.05; // 100% hit rate, no random misses

  try {
    // 3A: mirror_stance -> two hits give two counters
    {
      console.log('  3A: mirror_stance -> two hits give two counters');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const katanaDef = dataLoader.getWeapon('katana');

      const swordSaint = new Player(scene, 10, 10, playerData, katanaDef, 32);
      swordSaint.progression.setClassLevel('sword_saint', 40);
      swordSaint.progression.getProficiencyStat('katana').level = 90;
      swordSaint.energy = 60;

      // Cast mirror_stance: cost 26 EN
      const castOk = combat.castSkill(swordSaint, 'mirror_stance', swordSaint, 1000);
      assert.strictEqual(castOk, true, 'mirror_stance cast successfully');
      assert.strictEqual(swordSaint.hasStatusEffect('mirror_stance'), true, 'mirror_stance active');
      assert.strictEqual(swordSaint.energy, 34, 'Energy after mirror_stance cast is 34 (60 - 26)');

      const activeEff = swordSaint.activeStatusEffects.get('mirror_stance');
      assert.strictEqual(activeEff?.def.evasionBonus, 0.2, 'mirror_stance grants +0.20 evasionBonus');

      const attacker = createDummyEnemy(scene, 10, 11, 'Attacker', 1000);
      attacker.enemyData.baseDamage = 10;
      attacker.enemyData.attackIntervalMs = 1000;
      attacker.isAggroed = true;
      attacker.lastAttackTime = 0;
      combat.party = [swordSaint];
      combat.enemies = [attacker];
      (combat as any).enemyTargets.set(attacker, swordSaint);

      const initialHp = attacker.hp;

      // Hit 1 at t = 1000: triggers first counterattack
      combat.update(1000, 16);
      assert.strictEqual(swordSaint.hasStatusEffect('mirror_stance'), true, 'mirror_stance is NOT consumed on hit 1');
      assert.strictEqual(attacker.hp < initialHp, true, `Attacker damaged by first counterattack (${initialHp} -> ${attacker.hp})`);
      const hpAfterHit1 = attacker.hp;

      // Hit 2 at t = 2100 (within 4s duration): triggers second counterattack
      attacker.lastAttackTime = 0;
      combat.update(2100, 16);
      assert.strictEqual(swordSaint.hasStatusEffect('mirror_stance'), true, 'mirror_stance remains active for hit 2');
      assert.strictEqual(attacker.hp < hpAfterHit1, true, `Attacker damaged by second counterattack (${hpAfterHit1} -> ${attacker.hp})`);
      console.log('    ✓ mirror_stance triggers two counterattacks on two hits without being consumed.');
    }

    // 3B: mana_blade + arcane_overload -> the EN refund, x1.3 and the cleave
    {
      console.log('  3B: mana_blade + arcane_overload -> the EN refund, x1.3 and the cleave');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const longswordDef = dataLoader.getWeapon('longsword_1h');

      const arcaneKnight = new Player(scene, 10, 10, playerData, longswordDef, 32);
      arcaneKnight.progression.setClassLevel('arcane_knight', 40);
      arcaneKnight.progression.getProficiencyStat('longswords').level = 90;
      arcaneKnight.energy = 100;

      const primary = createDummyEnemy(scene, 11, 10, 'Primary', 5000);
      const secondary1 = createDummyEnemy(scene, 11, 11, 'Secondary 1', 5000); // 1 tile from primary (within 1.5 cleave)
      const secondary2 = createDummyEnemy(scene, 12, 10, 'Secondary 2', 5000); // 1 tile from primary (within 1.5 cleave)
      combat.party = [arcaneKnight];
      combat.enemies = [primary, secondary1, secondary2];

      // Step 1: Cast arcane_overload WITHOUT mana_blade first to measure baseline damage & no cleave
      const castBaseOk = combat.castSkill(arcaneKnight, 'arcane_overload', primary, 1000);
      assert.strictEqual(castBaseOk, true, 'arcane_overload cast without mana_blade');
      assert.strictEqual(arcaneKnight.energy, 66, 'Without mana_blade: costs 34 EN (100 -> 66), no refund or siphon');
      const baseDamageDealt = 5000 - primary.hp;
      assert.ok(baseDamageDealt > 0, 'Primary took baseline damage');
      assert.strictEqual(secondary1.hp, 5000, 'Without mana_blade: secondary1 took 0 cleave damage');
      assert.strictEqual(secondary2.hp, 5000, 'Without mana_blade: secondary2 took 0 cleave damage');

      // Reset HP, cooldowns, and energy
      primary.hp = 5000;
      arcaneKnight.lastSkillUseTimes.clear();
      arcaneKnight.energy = 80;

      // Step 2: Cast mana_blade (cost 26 EN -> 80 - 26 = 54 EN)
      const castBuffOk = combat.castSkill(arcaneKnight, 'mana_blade', arcaneKnight, 2000);
      assert.strictEqual(castBuffOk, true, 'mana_blade cast successfully');
      assert.strictEqual(arcaneKnight.hasStatusEffect('mana_blade'), true, 'mana_blade status is active');
      assert.strictEqual(arcaneKnight.energy, 54, 'Energy after mana_blade is 54 (80 - 26)');

      // Step 3: Cast arcane_overload WITH mana_blade active
      // Cost: 34 EN (54 -> 20) + 15 EN refund (requiresSelfStatus) + 4 EN siphon (mana_blade energySiphonOnHit) = 39 EN
      const castSynergyOk = combat.castSkill(arcaneKnight, 'arcane_overload', primary, 3000);
      assert.strictEqual(castSynergyOk, true, 'arcane_overload cast with mana_blade active');
      assert.strictEqual(
        arcaneKnight.energy,
        39,
        `Energy after arcane_overload with mana_blade is 39 (54 - 34 cost + 15 refund + 4 siphon): got ${arcaneKnight.energy}`
      );

      // Damage check: x1.3 from requiresSelfStatus AND x1.3 from mana_blade bonusDamagePercent: 0.30 = 1.69x baseDamageDealt
      const boostedDamageDealt = 5000 - primary.hp;
      const expectedBoosted = baseDamageDealt * 1.3 * 1.3;
      assert.ok(
        Math.abs(boostedDamageDealt - expectedBoosted) < 0.01,
        `Damage with mana_blade is x1.3 (requiresSelfStatus) * x1.3 (bonusDamagePercent) = ${expectedBoosted.toFixed(2)} (got ${boostedDamageDealt.toFixed(2)})`
      );

      // Cleave check: secondary1 and secondary2 within 1.5 tiles take cleave damage
      const cleave1 = 5000 - secondary1.hp;
      const cleave2 = 5000 - secondary2.hp;
      assert.ok(Math.abs(cleave1 - boostedDamageDealt) < 0.01, `Secondary 1 took full cleave damage (${cleave1.toFixed(2)})`);
      assert.ok(Math.abs(cleave2 - boostedDamageDealt) < 0.01, `Secondary 2 took full cleave damage (${cleave2.toFixed(2)})`);
      console.log('    ✓ mana_blade + arcane_overload verified: +15 EN refund (+4 siphon), x1.3 synergy multiplier (+30% status bonus), and 1.5-tile cleave.');
    }

    // 3C: seraphic_restoration -> the poison is cleansed AND the party is healed 30
    {
      console.log('  3C: seraphic_restoration -> the poison is cleansed AND the party is healed 30');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const swordDef = dataLoader.getWeapon('longsword_1h');
      const bowDef = dataLoader.getWeapon('bows');

      const celestialKnight = new Player(scene, 10, 10, playerData, swordDef, 32);
      celestialKnight.progression.setClassLevel('celestial_knight', 40);
      celestialKnight.hp = 60;
      celestialKnight.maxHp = 100;
      celestialKnight.energy = 60;

      const ally = new Player(scene, 10, 12, playerData, bowDef, 32);
      ally.progression.setClassLevel('tempest', 40);
      ally.hp = 50;
      ally.maxHp = 100;

      // Apply poison to ally via casting toxin_blade from an enemy/assassin Player so we cast a skill to set up poison
      const assassin = new Player(scene, 11, 12, playerData, dataLoader.getWeapon('daggers'), 32);
      assassin.progression.setClassLevel('assassin', 40);
      assassin.progression.getProficiencyStat('daggers').level = 60;
      assassin.energy = 50;
      combat.party = [assassin];
      combat.enemies = [ally as any];
      combat.castSkill(assassin, 'toxin_blade', ally as any, 500);
      assert.strictEqual(ally.hasStatusEffect('poison'), true, 'Ally is poisoned before seraphic_restoration');

      // Reset ally HP to 50 after toxin_blade hit so we measure exact +30 heal
      ally.hp = 50;
      combat.party = [celestialKnight, ally];
      combat.enemies = [];

      const castOk = combat.castSkill(celestialKnight, 'seraphic_restoration', ally, 1000);
      assert.strictEqual(castOk, true, 'seraphic_restoration cast successfully');

      assert.strictEqual(ally.hasStatusEffect('poison'), false, 'Poison is cleansed from ally');
      assert.strictEqual(celestialKnight.hp, 90, `Celestial Knight healed +30 HP (60 -> 90): got ${celestialKnight.hp}`);
      assert.strictEqual(ally.hp, 80, `Ally healed +30 HP (50 -> 80): got ${ally.hp}`);
      console.log('    ✓ seraphic_restoration cleanses poison AND heals all party members by 30 HP.');
    }

    // 3D: astral_annihilation -> it dumps up to 30 EN
    {
      console.log('  3D: astral_annihilation -> it dumps up to 30 EN');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const swordDef = dataLoader.getWeapon('longsword_1h');

      const arcaneKnight = new Player(scene, 10, 10, playerData, swordDef, 32);
      arcaneKnight.progression.setClassLevel('arcane_knight', 40);
      arcaneKnight.progression.getProficiencyStat('longswords').level = 90;

      const target = createDummyEnemy(scene, 11, 10, 'Boss Dummy', 10000);
      combat.party = [arcaneKnight];
      combat.enemies = [target];

      // Case 1: Exact 52 EN (0 surplus EN dumped) -> 4.4x multiplier
      arcaneKnight.energy = 52;
      const cast0 = combat.castSkill(arcaneKnight, 'astral_annihilation', target, 1000);
      assert.strictEqual(cast0, true, 'astral_annihilation cast with 52 EN');
      assert.strictEqual(arcaneKnight.energy, 0, '0 EN remaining after 52 EN cast');
      const dmg0Dump = 10000 - target.hp;

      // Case 2: 100 EN (52 cost + 30 max bonus EN dumped = 82 EN spent, 18 EN left)
      // Multiplier: 4.4 + 30 * 0.04 = 4.4 + 1.2 = 5.6x
      target.hp = 10000;
      arcaneKnight.lastSkillUseTimes.clear();
      arcaneKnight.energy = 100;
      const cast30 = combat.castSkill(arcaneKnight, 'astral_annihilation', target, 2000);
      assert.strictEqual(cast30, true, 'astral_annihilation cast with 100 EN');
      assert.strictEqual(arcaneKnight.energy, 18, `Dumped capped 30 bonus EN (100 - 52 - 30 = 18): got ${arcaneKnight.energy}`);
      const dmg30Dump = 10000 - target.hp;

      const expectedRatio = 5.6 / 4.4;
      const actualRatio = dmg30Dump / dmg0Dump;
      assert.ok(
        Math.abs(actualRatio - expectedRatio) < 0.001,
        `Damage with 30 EN dump scales by 5.6 / 4.4 = ${expectedRatio.toFixed(4)} (got ${actualRatio.toFixed(4)})`
      );
      console.log('    ✓ astral_annihilation dumps up to 30 surplus EN (+0.04x per EN, 4.4x -> 5.6x).');
    }
  } finally {
    Math.random = originalRandom;
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM TIER 3 MASTER CLASSES TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
