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
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { formatRequirement } = await import('../src/utils/formatRequirement.ts');
import type { EnemyDef, Requirement } from '../src/types/game.ts';

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

const t4PrestigeClasses: {
  classId: string;
  name: string;
  fantasy: string;
  hiddenSkillBonuses: Record<string, number>;
  scaling: 'weapon' | 'spell';
  defaultWeaponId: string;
  skills: string[];
}[] = [
  {
    classId: 'swordmaster',
    name: 'Swordmaster',
    fantasy: 'Peerless blade master',
    hiddenSkillBonuses: { parry: 0.08 },
    scaling: 'weapon',
    defaultWeaponId: 'katana',
    skills: ['peerless_cut', 'sword_aura', 'crescent_storm', 'flash_step', 'ten_thousand_blades']
  },
  {
    classId: 'weaponmaster',
    name: 'Weaponmaster',
    fantasy: "Refuses to specialize, and doesn't need to",
    hiddenSkillBonuses: { parry: 0.08 },
    scaling: 'weapon',
    defaultWeaponId: 'longsword_1h',
    skills: ['adaptive_strike', 'battle_hardened', 'arsenal_sweep', 'titan_breaker', 'masters_onslaught']
  },
  {
    classId: 'archmage',
    name: 'Archmage',
    fantasy: 'Master of pure magical theory',
    hiddenSkillBonuses: { mana_regen: 0.08 },
    scaling: 'spell',
    defaultWeaponId: 'arcane_staff',
    skills: ['arcane_torrent', 'arcane_aegis', 'prismatic_storm', 'time_warp', 'arcane_cataclysm']
  },
  {
    classId: 'grand_paladin',
    name: 'Grand Paladin',
    fantasy: 'Pinnacle holy warrior',
    hiddenSkillBonuses: { parry: 0.08 },
    scaling: 'weapon',
    defaultWeaponId: 'short_swords',
    skills: ['sacred_strike', 'aegis_of_faith', 'hammer_of_justice', 'divine_intervention', 'judgment_day']
  },
  {
    classId: 'dark_lord',
    name: 'Dark Lord',
    fantasy: 'Apex of destructive darkness',
    hiddenSkillBonuses: { resilience: 0.08 },
    scaling: 'weapon',
    defaultWeaponId: 'greatswords',
    skills: ['ruinous_cleave', 'shroud_of_dread', 'abyssal_rend', 'soul_harvest', 'apocalypse']
  },
  {
    classId: 'archdruid',
    name: 'Archdruid',
    fantasy: 'Mythical guardian of nature',
    hiddenSkillBonuses: { mana_regen: 0.08 },
    scaling: 'spell',
    defaultWeaponId: 'druid_staff',
    skills: ['elder_thorn', 'heartwood_ward', 'overgrowth', 'world_tree', 'primal_cataclysm']
  },
  {
    classId: 'elemental_sovereign',
    name: 'Elemental Sovereign',
    fantasy: 'Commands all elements at once',
    hiddenSkillBonuses: { mana_regen: 0.08 },
    scaling: 'spell',
    defaultWeaponId: 'fire_staff',
    skills: ['sovereign_bolt', 'elemental_ward', 'tempest_chain', 'sovereign_maelstrom', 'elemental_apotheosis']
  },
  {
    classId: 'deathbringer',
    name: 'Deathbringer',
    fantasy: 'Harbinger of death itself',
    hiddenSkillBonuses: { resilience: 0.08 },
    scaling: 'weapon',
    defaultWeaponId: 'greatswords',
    skills: ['reaping_strike', 'deaths_embrace', 'harvest_of_souls', 'shadow_execution', 'final_reckoning']
  }
];

const expectedT4Table: Record<string, {
  en: number;
  cd: number;
  role: string;
  priority: number;
  condition?: Record<string, any>;
}> = {
  // Swordmaster
  peerless_cut: { en: 16, cd: 3000, role: 'rotation', priority: 30 },
  sword_aura: { en: 28, cd: 20000, role: 'defensive', priority: 60 },
  crescent_storm: { en: 32, cd: 8000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  flash_step: { en: 30, cd: 10000, role: 'gapCloser', priority: 65 },
  ten_thousand_blades: { en: 50, cd: 18000, role: 'finisher', priority: 90 },
  // Weaponmaster
  adaptive_strike: { en: 22, cd: 4000, role: 'rotation', priority: 30 },
  battle_hardened: { en: 26, cd: 18000, role: 'defensive', priority: 60 },
  arsenal_sweep: { en: 32, cd: 9000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  titan_breaker: { en: 30, cd: 10000, role: 'rotation', priority: 65 },
  masters_onslaught: { en: 50, cd: 18000, role: 'finisher', priority: 90 },
  // Archmage
  arcane_torrent: { en: 20, cd: 3000, role: 'rotation', priority: 30 },
  arcane_aegis: { en: 28, cd: 18000, role: 'defensive', priority: 60 },
  prismatic_storm: { en: 34, cd: 10000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  time_warp: { en: 32, cd: 22000, role: 'defensive', priority: 65 },
  arcane_cataclysm: { en: 56, cd: 22000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } },
  // Grand Paladin
  sacred_strike: { en: 18, cd: 3000, role: 'rotation', priority: 30 },
  aegis_of_faith: { en: 32, cd: 22000, role: 'defensive', priority: 70 },
  hammer_of_justice: { en: 30, cd: 10000, role: 'rotation', priority: 60 },
  divine_intervention: { en: 48, cd: 24000, role: 'support', priority: 90, condition: { allyHpBelow: 0.5 } },
  judgment_day: { en: 56, cd: 22000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } },
  // Dark Lord
  ruinous_cleave: { en: 22, cd: 4000, role: 'rotation', priority: 30 },
  shroud_of_dread: { en: 30, cd: 14000, role: 'defensive', priority: 70, condition: { enemiesInRadius: 1 } },
  abyssal_rend: { en: 32, cd: 9000, role: 'rotation', priority: 60 },
  soul_harvest: { en: 36, cd: 12000, role: 'rotation', priority: 65, condition: { enemiesInRadius: 2 } },
  apocalypse: { en: 56, cd: 22000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } },
  // Archdruid
  elder_thorn: { en: 20, cd: 3000, role: 'rotation', priority: 30 },
  heartwood_ward: { en: 32, cd: 22000, role: 'defensive', priority: 65 },
  overgrowth: { en: 32, cd: 8000, role: 'support', priority: 75 },
  world_tree: { en: 52, cd: 24000, role: 'support', priority: 90, condition: { allyHpBelow: 0.5 } },
  primal_cataclysm: { en: 58, cd: 22000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } },
  // Elemental Sovereign
  sovereign_bolt: { en: 20, cd: 3000, role: 'rotation', priority: 30 },
  elemental_ward: { en: 28, cd: 18000, role: 'defensive', priority: 60 },
  tempest_chain: { en: 34, cd: 10000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  sovereign_maelstrom: { en: 36, cd: 12000, role: 'rotation', priority: 65, condition: { enemiesInRadius: 2 } },
  elemental_apotheosis: { en: 58, cd: 22000, role: 'rotation', priority: 90, condition: { enemiesInRadius: 2 } },
  // Deathbringer
  reaping_strike: { en: 22, cd: 4000, role: 'rotation', priority: 30 },
  deaths_embrace: { en: 26, cd: 18000, role: 'defensive', priority: 60 },
  harvest_of_souls: { en: 32, cd: 9000, role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
  shadow_execution: { en: 32, cd: 10000, role: 'gapCloser', priority: 70 },
  final_reckoning: { en: 56, cd: 22000, role: 'finisher', priority: 95 }
};

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM TIER 4: PRESTIGE CLASSES (8 KITS, 40 SKILLS) SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ---------------------------------------------------------------------------
  // TEST 0: Item 0 UI Fix — formatRequirement(req) Unit Tests
  // ---------------------------------------------------------------------------
  console.log('--- TEST 0: Item 0 UI Helper formatRequirement(req) Unit Tests ---');
  {
    const reqProf: Requirement = { type: 'proficiency', target: 'katana', value: 100 };
    const outProf = formatRequirement(reqProf);
    assert.strictEqual(outProf, 'Katana 100', 'proficiency format must be "Katana 100"');
    console.log(`  1. proficiency -> "${outProf}"`);

    const reqMultiUnderscore: Requirement = { type: 'proficiency', target: 'two_handed_short_swords', value: 60 };
    assert.strictEqual(
      formatRequirement(reqMultiUnderscore),
      'Two Handed Short Swords 60',
      'Must replace ALL underscores in title case'
    );

    const reqClassLvl: Requirement = { type: 'classLevel', target: 'sword_saint', value: 30 };
    const outClassLvl = formatRequirement(reqClassLvl);
    assert.strictEqual(outClassLvl, 'Sword Saint Lv 30', 'classLevel format must use class name "Sword Saint Lv 30"');
    console.log(`  2. classLevel -> "${outClassLvl}"`);

    const reqClassFallback: Requirement = { type: 'classLevel', target: 'non_existent_hero_class', value: 15 };
    assert.strictEqual(
      formatRequirement(reqClassFallback),
      'Non Existent Hero Class Lv 15',
      'classLevel fallback must use title-cased ID when class does not exist'
    );

    const reqAnyOfCount: Requirement = {
      type: 'anyOf',
      count: 3,
      of: [
        { type: 'proficiency', target: 'fire_magic', value: 30 },
        { type: 'proficiency', target: 'water_magic', value: 30 },
        { type: 'proficiency', target: 'ice_magic', value: 30 }
      ]
    };
    const outAnyOfCount = formatRequirement(reqAnyOfCount);
    assert.strictEqual(
      outAnyOfCount,
      'Any 3 of: (Fire Magic 30, Water Magic 30, Ice Magic 30)',
      'anyOf with count: N must format as "Any N of: (A, B, C)"'
    );
    console.log(`  3. anyOf with count: N -> "${outAnyOfCount}"`);

    const reqOneOf: Requirement = {
      type: 'oneOf',
      of: [
        { type: 'classLevel', target: 'arcane_knight', value: 25 },
        { type: 'classLevel', target: 'elementalist', value: 25 }
      ]
    };
    const outOneOf = formatRequirement(reqOneOf);
    assert.strictEqual(
      outOneOf,
      'One of: (Arcane Knight Lv 25, Elementalist Lv 25)',
      'oneOf must format as "One of: (A, B)"'
    );
    console.log(`  4a. oneOf -> "${outOneOf}"`);

    const reqAnyOfNoCount: Requirement = {
      type: 'anyOf',
      of: [
        { type: 'classLevel', target: 'necromancer', value: 30 },
        { type: 'classLevel', target: 'death_knight', value: 30 }
      ]
    };
    const outAnyOfNoCount = formatRequirement(reqAnyOfNoCount);
    assert.strictEqual(
      outAnyOfNoCount,
      'One of: (Necromancer Lv 30, Death Knight Lv 30)',
      'anyOf without count must format as "One of: (A, B)"'
    );
    console.log(`  4b. anyOf without count -> "${outAnyOfNoCount}"`);

    // Real Weaponmaster entry
    const wmDef = dataLoader.getClass('weaponmaster');
    assert.ok(wmDef, 'weaponmaster must exist in classes.json');
    const wmFormatted = wmDef.requirements.map((r) => formatRequirement(r)).join(', ');
    const expectedWm =
      'Any 5 of: (Katana 60, Short Swords 60, Longswords 60, Greatswords 60, Daggers 60, Mace 60, Spears 60, Bows 60, Crossbows 60, Throwing Weapons 60, Staff 60, Fist 60), ' +
      'Any 2 of: (Blademaster Lv 20, Assassin Lv 20, Shadowblade Lv 20, Knight Lv 20, Paladin Lv 20, Dark Knight Lv 20, Juggernaut Lv 20, Battlemage Lv 20, Storm Lancer Lv 20, Sword Saint Lv 20, Death Knight Lv 20, Celestial Knight Lv 20, Shadow Monk Lv 20, Demon Hunter Lv 20, Arcane Knight Lv 20, Elemental Knight Lv 20)';
    assert.strictEqual(wmFormatted, expectedWm, 'Real Weaponmaster entry must format cleanly');
    console.log(`  5. Real Weaponmaster entry -> "${wmFormatted}"`);
  }
  console.log('✓ PASS: formatRequirement(req) verified across all 4 shapes and the real Weaponmaster entry.\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Data Validation (8 Prestige Classes, durationMs Rule, Expected-Table Guard)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: 8 Prestige Classes & 40 Skills Data Validation (Expected-Table Guard & durationMs Rule) ---');

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

  for (const kit of t4PrestigeClasses) {
    const classDef = dataLoader.getClass(kit.classId);
    assert.ok(classDef, `Class ${kit.classId} must exist in classes.json`);
    assert.strictEqual(classDef.name, kit.name, `Class ${kit.classId} name must be "${kit.name}"`);
    assert.strictEqual(classDef.tier, 'prestige', `Class ${kit.classId} tier must be "prestige"`);
    assert.strictEqual(classDef.fantasy, kit.fantasy, `Class ${kit.classId} fantasy must be "${kit.fantasy}"`);
    assert.deepStrictEqual(
      classDef.hiddenSkillBonuses,
      kit.hiddenSkillBonuses,
      `Class ${kit.classId} hiddenSkillBonuses must be ${JSON.stringify(kit.hiddenSkillBonuses)}`
    );
    assert.strictEqual(
      Object.keys(classDef.hiddenSkillBonuses || {}).length,
      1,
      `Class ${kit.classId} must have exactly one hiddenSkillBonuses entry`
    );
    assert.strictEqual(
      Object.values(classDef.hiddenSkillBonuses || {})[0],
      0.08,
      `Class ${kit.classId} hiddenSkillBonuses value must be 0.08`
    );
  }

  let checkedSkillCount = 0;

  for (const kit of t4PrestigeClasses) {
    for (let i = 0; i < kit.skills.length; i++) {
      const skillId = kit.skills[i];
      const expectedUnlockLevel = i === 0 ? 1 : i * 10;
      const def = dataLoader.getSkill(skillId);
      assert.ok(def, `Skill ${skillId} must exist in skills.json`);

      const exp = expectedT4Table[skillId];
      assert.ok(exp, `Skill ${skillId} must exist in expectedT4Table`);
      assert.strictEqual(def.energyCost, exp.en, `Skill ${skillId} energyCost must be ${exp.en} (got ${def.energyCost})`);
      assert.strictEqual(def.cooldownMs, exp.cd, `Skill ${skillId} cooldownMs must be ${exp.cd} (got ${def.cooldownMs})`);
      assert.ok(def.ai, `Skill ${skillId} must have ai object`);
      assert.strictEqual(def.ai.role, exp.role, `Skill ${skillId} ai.role must be ${exp.role} (got ${def.ai.role})`);
      assert.strictEqual(def.ai.priority, exp.priority, `Skill ${skillId} ai.priority must be ${exp.priority} (got ${def.ai.priority})`);
      assert.deepStrictEqual(def.ai.condition, exp.condition, `Skill ${skillId} ai.condition must match spec`);

      assert.ok(def.description && def.description.length > 0, `Skill ${skillId} must have non-empty description`);

      const classLevelReq = def.requirements.find((r: any) => r.type === 'classLevel' && r.target === kit.classId);
      assert.ok(classLevelReq, `Skill ${skillId} must have classLevel requirement for ${kit.classId}`);
      assert.strictEqual(
        classLevelReq.value,
        expectedUnlockLevel,
        `Skill ${skillId} classLevel requirement must be ${expectedUnlockLevel} (got ${classLevelReq.value})`
      );
      assert.ok(validLevels.has(classLevelReq.value!), `Skill ${skillId} unlock level must be in {1,10,20,30,40}`);

      const profReq = def.requirements.find((r: any) => r.type === 'proficiency');
      assert.strictEqual(profReq, undefined, `Skill ${skillId} must not have extra proficiency requirement`);

      assert.ok(def.effects && def.effects.length > 0, `Skill ${skillId} must have effects array`);
      for (const eff of def.effects) {
        if (eff.type === 'applyStatus') {
          assert.ok(
            validStatusIds.has(eff.status),
            `Skill ${skillId} references unknown status "${eff.status}" in applyStatus`
          );
          if (eff.status === 'poison') {
            assert.strictEqual(
              eff.durationMs,
              6000,
              `Skill ${skillId} poison applyStatus must have durationMs: 6000 (got ${eff.durationMs})`
            );
          } else {
            assert.strictEqual(
              eff.durationMs,
              undefined,
              `Skill ${skillId} applyStatus for "${eff.status}" must NOT have durationMs (got ${eff.durationMs})`
            );
          }
        }
        if (eff.type === 'damage') {
          assert.strictEqual(
            eff.scaling,
            kit.scaling,
            `Damage effect in skill ${skillId} must have scaling: "${kit.scaling}" (got "${eff.scaling}")`
          );
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

  assert.strictEqual(checkedSkillCount, 40, 'Must have validated all 40 Tier 4 Prestige skills');
  console.log('✓ PASS: All 8 Prestige classes and 40 skills validated cleanly against expectedT4Table and durationMs rule.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Unlock Tests using evaluateRequirements on real ProgressionSystem
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Unlock Tests (Archmage, Weaponmaster, Deathbringer) ---');

  // 2A: Archmage
  {
    const archmageDef = dataLoader.getClass('archmage')!;
    assert.ok(archmageDef, 'archmage classDef must exist');

    // Case 1: Arcane 100 + 3 schools at 30 + Elementalist 25 -> unlocks
    const prog1 = new ProgressionSystem(dataLoader.getClassesData(), 'Archmage_Pass');
    prog1.getProficiencyStat('arcane_magic').level = 100;
    prog1.getProficiencyStat('fire_magic').level = 30;
    prog1.getProficiencyStat('water_magic').level = 30;
    prog1.getProficiencyStat('lightning_magic').level = 30;
    prog1.setClassLevel('elementalist', 25);
    assert.strictEqual(prog1.isClassUnlocked('archmage'), true, 'Archmage must unlock with Arcane 100 + 3 schools at 30 + Elementalist 25');

    // Also verify evaluateRequirements directly on a fresh progression before checkClassUnlocks marks it unlocked
    const prog1Eval = new ProgressionSystem(dataLoader.getClassesData(), 'Archmage_Eval');
    prog1Eval.getProficiencyStat('arcane_magic').level = 100;
    prog1Eval.getProficiencyStat('fire_magic').level = 30;
    prog1Eval.getProficiencyStat('ice_magic').level = 30;
    prog1Eval.getProficiencyStat('wind_magic').level = 30;
    (prog1Eval as any).unlockedClasses.add('elementalist');
    (prog1Eval as any).classLevels.set('elementalist', 25);
    (prog1Eval as any).classStats.set('elementalist', { level: 25, currentExp: 0 });
    assert.strictEqual(prog1Eval.evaluateRequirements(archmageDef), true, 'evaluateRequirements(archmage) must return true with 3 schools + Elementalist 25');

    // Case 2: 2 schools at 30 -> doesn't unlock
    const prog2 = new ProgressionSystem(dataLoader.getClassesData(), 'Archmage_2Schools');
    prog2.getProficiencyStat('arcane_magic').level = 100;
    prog2.getProficiencyStat('fire_magic').level = 30;
    prog2.getProficiencyStat('water_magic').level = 30;
    (prog2 as any).unlockedClasses.add('elementalist');
    (prog2 as any).classLevels.set('elementalist', 25);
    (prog2 as any).classStats.set('elementalist', { level: 25, currentExp: 0 });
    assert.strictEqual(prog2.evaluateRequirements(archmageDef), false, 'Archmage must NOT unlock with only 2 schools at 30');

    // Case 3: 3 schools at 30, Arcane 100, but neither Arcane Knight 25 nor Elementalist 25 -> doesn't unlock
    const prog3 = new ProgressionSystem(dataLoader.getClassesData(), 'Archmage_NoClass');
    prog3.getProficiencyStat('arcane_magic').level = 100;
    prog3.getProficiencyStat('fire_magic').level = 30;
    prog3.getProficiencyStat('water_magic').level = 30;
    prog3.getProficiencyStat('earth_magic').level = 30;
    prog3.setClassLevel('arcane_knight', 24);
    prog3.setClassLevel('elementalist', 24);
    assert.strictEqual(prog3.evaluateRequirements(archmageDef), false, 'Archmage must NOT unlock without Arcane Knight 25 or Elementalist 25');
    console.log('  ✓ Archmage unlock tests passed (3 schools + Elementalist 25 -> true; 2 schools -> false; neither class at 25 -> false).');
  }

  // 2B: Weaponmaster
  {
    const wmDef = dataLoader.getClass('weaponmaster')!;
    assert.ok(wmDef, 'weaponmaster classDef must exist');

    // Case 1: 5 physical weapons at 60 + 2 listed classes at Lv 20 -> unlocks
    const prog1 = new ProgressionSystem(dataLoader.getClassesData(), 'WM_Pass');
    for (const w of ['katana', 'short_swords', 'longswords', 'greatswords', 'daggers']) {
      prog1.getProficiencyStat(w).level = 60;
    }
    (prog1 as any).unlockedClasses.add('blademaster');
    (prog1 as any).classLevels.set('blademaster', 20);
    (prog1 as any).classStats.set('blademaster', { level: 20, currentExp: 0 });
    (prog1 as any).unlockedClasses.add('knight');
    (prog1 as any).classLevels.set('knight', 20);
    (prog1 as any).classStats.set('knight', { level: 20, currentExp: 0 });
    assert.strictEqual(prog1.evaluateRequirements(wmDef), true, 'Weaponmaster must unlock with 5 physical weapons at 60 + 2 listed classes at Lv 20');

    // Case 2: Only 4 weapons at 60 (+ 2 listed classes at Lv 20) -> doesn't unlock
    const prog4W = new ProgressionSystem(dataLoader.getClassesData(), 'WM_4Weapons');
    for (const w of ['katana', 'short_swords', 'longswords', 'greatswords']) {
      prog4W.getProficiencyStat(w).level = 60;
    }
    prog4W.setClassLevel('blademaster', 20);
    prog4W.setClassLevel('knight', 20);
    assert.strictEqual(prog4W.evaluateRequirements(wmDef), false, 'Weaponmaster must NOT unlock with only 4 physical weapons at 60');

    // Case 3: 5 weapons at 60 + only 1 listed class at Lv 20 -> doesn't unlock
    const prog1C = new ProgressionSystem(dataLoader.getClassesData(), 'WM_1Class');
    for (const w of ['katana', 'short_swords', 'longswords', 'greatswords', 'daggers']) {
      prog1C.getProficiencyStat(w).level = 60;
    }
    prog1C.setClassLevel('blademaster', 20);
    assert.strictEqual(prog1C.evaluateRequirements(wmDef), false, 'Weaponmaster must NOT unlock with only 1 listed class at Lv 20');

    // Case 4: Shields 60 counted as one of the 5 (4 physical weapons + shields 60 + 2 listed classes at Lv 20) -> doesn't unlock
    const progShields = new ProgressionSystem(dataLoader.getClassesData(), 'WM_Shields');
    for (const w of ['katana', 'short_swords', 'longswords', 'greatswords', 'shields']) {
      progShields.getProficiencyStat(w).level = 60;
    }
    progShields.setClassLevel('blademaster', 20);
    progShields.setClassLevel('knight', 20);
    assert.strictEqual(progShields.evaluateRequirements(wmDef), false, 'Weaponmaster must NOT unlock when Shields 60 is counted as one of the 5 weapons');
    console.log('  ✓ Weaponmaster unlock tests passed (5 weapons + 2 classes -> true; 4 weapons -> false; 1 class -> false; Shields 60 as 5th -> false).');
  }

  // 2C: Deathbringer
  {
    const dbDef = dataLoader.getClass('deathbringer')!;
    assert.ok(dbDef, 'deathbringer classDef must exist');

    // Path 1: Necromancer Lv 30 alone unlocks it
    const progNecro = new ProgressionSystem(dataLoader.getClassesData(), 'DB_Necro');
    progNecro.getProficiencyStat('dark_magic').level = 100;
    progNecro.getProficiencyStat('greatswords').level = 100;
    progNecro.getProficiencyStat('daggers').level = 60;
    (progNecro as any).unlockedClasses.add('necromancer');
    (progNecro as any).classLevels.set('necromancer', 30);
    (progNecro as any).classStats.set('necromancer', { level: 30, currentExp: 0 });
    assert.strictEqual(progNecro.evaluateRequirements(dbDef), true, 'Deathbringer must unlock via Necromancer Lv 30 alone');

    // Path 2: Death Knight Lv 30 alone unlocks it
    const progDK = new ProgressionSystem(dataLoader.getClassesData(), 'DB_DK');
    progDK.getProficiencyStat('dark_magic').level = 100;
    progDK.getProficiencyStat('greatswords').level = 100;
    progDK.getProficiencyStat('daggers').level = 60;
    (progDK as any).unlockedClasses.add('death_knight');
    (progDK as any).classLevels.set('death_knight', 30);
    (progDK as any).classStats.set('death_knight', { level: 30, currentExp: 0 });
    assert.strictEqual(progDK.evaluateRequirements(dbDef), true, 'Deathbringer must unlock via Death Knight Lv 30 alone');
    console.log('  ✓ Deathbringer unlock tests passed (Necromancer Lv 30 path -> true; Death Knight Lv 30 path -> true).\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Smoke Test (8 Classes × 60s Simulated 3-Enemy Fight, Ally at 60% HP + Timed Poison)
  // Each class at Lv 40 casts at least 4 of 5 skills in 60s. Gap-closers at 0 are acceptable.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Smoke Test (8 Prestige Classes × 60s 3-Enemy Fight, Ally at 60% HP + Timed Poison) ---');

  const perClassResults: Record<string, { weaponUsed: string; totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of t4PrestigeClasses) {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();

    const mainWeaponDef = dataLoader.getWeapon(kit.defaultWeaponId) || {
      id: kit.defaultWeaponId,
      name: kit.defaultWeaponId,
      category: 'melee',
      proficiencyId: kit.defaultWeaponId,
      baseDamage: 12,
      attackIntervalMs: 1200,
      attackRangeTiles: 1,
      baseAccuracy: 0.90,
      twoHanded: false
    };

    const companion = new Player(scene, 10, 10, playerData, mainWeaponDef, 32);
    companion.entityName = `Companion ${kit.name}`;
    companion.progression.setClassLevel(kit.classId, 40);

    // Setup proficiencies at 100 so accuracy and proficiency scaling evaluate cleanly
    for (const p of [
      'katana', 'short_swords', 'longswords', 'greatswords', 'daggers', 'mace', 'spears',
      'bows', 'crossbows', 'throwing_weapons', 'staff', 'fist', 'shields', 'druid_staff',
      'arcane_magic', 'fire_magic', 'water_magic', 'ice_magic', 'earth_magic',
      'nature_magic', 'lightning_magic', 'wind_magic', 'holy_magic', 'dark_magic', 'healing_magic'
    ]) {
      companion.progression.getProficiencyStat(p).level = 100;
    }

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
    ally.maxCriticalHp = 0;
    ally.criticalHp = 0;

    combat.party = [companion, ally];

    // 3 enemies: 2 clustered near companion (range 1-1.4) to satisfy enemiesInRadius: 2, 1 at range 3
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 5000);
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 5000);
    const enemy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 5000);
    combat.enemies = [enemy1, enemy2, enemy3];

    companion.targetEntity = enemy1;

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

    const simTotalMs = 60000;
    const dt = 250;
    let now = 1000;

    for (let t = 0; t < simTotalMs; t += dt) {
      now += dt;
      scene.time.now = now;

      if (companion.energy < 60) {
        companion.energy = Math.min(100, companion.energy + 30);
      }

      if (ally.hp > 60) {
        ally.hp = 60;
      }
      if (ally.hp < 40) {
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
      weaponUsed: kit.defaultWeaponId,
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
    console.log(`  - **${classId.toUpperCase()}** (weapon: \`${result.weaponUsed}\`): ${result.distinctSkills}/5 distinct skills cast (${result.totalCasts} total casts) -> [${breakdown}]`);
  }

  console.log('\n✓ PASS: All 8 Tier 4 Prestige classes cast at least 4 of 5 skills within 60s.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Specific Cast-Based Tests
  // - time_warp -> every party member deals x1.20
  // - divine_intervention -> a poisoned ally (poisoned by casting toxin_blade) is cleansed and the party is healed 40
  // - final_reckoning on a cursed target below 30% -> exactly x1.4 * x1.3 versus the base cast (RNG fixed)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Specific Cast-Based Mechanics ---');

  const originalRandom = Math.random;
  Math.random = () => 0.05; // Fixed RNG (100% hit rate)

  try {
    // 4A: time_warp -> every party member deals x1.20
    {
      console.log('  4A: time_warp -> every party member deals x1.20');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const arcaneStaffDef = dataLoader.getWeapon('arcane_staff');
      const katanaDef = dataLoader.getWeapon('katana');
      const longswordDef = dataLoader.getWeapon('longsword_1h');

      const archmage = new Player(scene, 10, 10, playerData, arcaneStaffDef, 32);
      archmage.entityName = 'Archmage';
      archmage.progression.setClassLevel('archmage', 40);
      archmage.progression.getProficiencyStat('arcane_magic').level = 100;
      archmage.energy = 100;

      const ally1 = new Player(scene, 10, 11, playerData, katanaDef, 32);
      ally1.entityName = 'Swordmaster Ally';
      ally1.progression.setClassLevel('swordmaster', 40);
      ally1.progression.getProficiencyStat('katana').level = 100;
      ally1.energy = 100;

      const ally2 = new Player(scene, 10, 12, playerData, longswordDef, 32);
      ally2.entityName = 'Weaponmaster Ally';
      ally2.progression.setClassLevel('weaponmaster', 40);
      ally2.progression.getProficiencyStat('longswords').level = 100;
      ally2.energy = 100;

      const target = createDummyEnemy(scene, 11, 11, 'Target Dummy', 10000);
      combat.party = [archmage, ally1, ally2];
      combat.enemies = [target];

      // Measure base damage for each party member before time_warp
      const hp0 = target.hp;
      combat.castSkill(archmage, 'arcane_torrent', target, 1000);
      const baseArchmageDmg = hp0 - target.hp;

      const hp1 = target.hp;
      combat.castSkill(ally1, 'peerless_cut', target, 1000);
      const baseAlly1Dmg = hp1 - target.hp;

      const hp2 = target.hp;
      combat.castSkill(ally2, 'adaptive_strike', target, 1000);
      const baseAlly2Dmg = hp2 - target.hp;

      assert.ok(baseArchmageDmg > 0 && baseAlly1Dmg > 0 && baseAlly2Dmg > 0, 'All 3 party members must deal positive base damage');

      // Reset cooldowns and energy, then cast time_warp
      archmage.lastSkillUseTimes.clear();
      ally1.lastSkillUseTimes.clear();
      ally2.lastSkillUseTimes.clear();
      archmage.energy = 100;
      ally1.energy = 100;
      ally2.energy = 100;

      const warpOk = combat.castSkill(archmage, 'time_warp', archmage, 2000);
      assert.strictEqual(warpOk, true, 'time_warp cast must succeed');

      for (const m of combat.party) {
        assert.strictEqual(m.hasStatusEffect('time_warp'), true, `Party member ${m.entityName} must have time_warp buff`);
      }

      // Measure boosted damage for each party member with time_warp active
      const hpB0 = target.hp;
      combat.castSkill(archmage, 'arcane_torrent', target, 2500);
      const boostedArchmageDmg = hpB0 - target.hp;

      const hpB1 = target.hp;
      combat.castSkill(ally1, 'peerless_cut', target, 2500);
      const boostedAlly1Dmg = hpB1 - target.hp;

      const hpB2 = target.hp;
      combat.castSkill(ally2, 'adaptive_strike', target, 2500);
      const boostedAlly2Dmg = hpB2 - target.hp;

      assert.strictEqual(
        Number((boostedArchmageDmg / baseArchmageDmg).toFixed(4)),
        1.2,
        `Archmage must deal x1.20 damage under time_warp (${baseArchmageDmg} -> ${boostedArchmageDmg})`
      );
      assert.strictEqual(
        Number((boostedAlly1Dmg / baseAlly1Dmg).toFixed(4)),
        1.2,
        `Ally 1 must deal x1.20 damage under time_warp (${baseAlly1Dmg} -> ${boostedAlly1Dmg})`
      );
      assert.strictEqual(
        Number((boostedAlly2Dmg / baseAlly2Dmg).toFixed(4)),
        1.2,
        `Ally 2 must deal x1.20 damage under time_warp (${baseAlly2Dmg} -> ${boostedAlly2Dmg})`
      );
      console.log(
        `    ✓ time_warp verified: all 3 party members dealt exactly ×1.20 damage (Archmage: ${baseArchmageDmg.toFixed(1)}->${boostedArchmageDmg.toFixed(1)}, Ally1: ${baseAlly1Dmg.toFixed(1)}->${boostedAlly1Dmg.toFixed(1)}, Ally2: ${baseAlly2Dmg.toFixed(1)}->${boostedAlly2Dmg.toFixed(1)}).`
      );
    }

    // 4B: divine_intervention -> a poisoned ally (poisoned by casting toxin_blade) is cleansed and the party is healed 40
    {
      console.log('  4B: divine_intervention -> poisoned ally (via casting toxin_blade) is cleansed and party is healed 40');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const shortSwordDef = dataLoader.getWeapon('short_swords');
      const daggerDef = dataLoader.getWeapon('daggers');

      const grandPaladin = new Player(scene, 10, 10, playerData, shortSwordDef, 32);
      grandPaladin.progression.setClassLevel('grand_paladin', 40);
      grandPaladin.progression.getProficiencyStat('short_swords').level = 100;
      grandPaladin.maxHp = 100;
      grandPaladin.hp = 50;
      grandPaladin.energy = 100;

      const ally = new Player(scene, 10, 12, playerData, shortSwordDef, 32);
      ally.maxHp = 100;
      ally.hp = 80;

      // Poison the ally by casting toxin_blade from an Assassin
      const assassin = new Player(scene, 11, 12, playerData, daggerDef, 32);
      assassin.progression.setClassLevel('assassin', 40);
      assassin.progression.getProficiencyStat('daggers').level = 60;
      assassin.energy = 50;
      combat.party = [assassin];
      combat.enemies = [ally as any];
      const toxinOk = combat.castSkill(assassin, 'toxin_blade', ally as any, 500);
      assert.strictEqual(toxinOk, true, 'toxin_blade cast must succeed');
      assert.strictEqual(ally.hasStatusEffect('poison'), true, 'Ally must be poisoned by toxin_blade before divine_intervention');

      // Set ally HP to 45 to verify exact +40 party heal
      ally.hp = 45;
      combat.party = [grandPaladin, ally];
      combat.enemies = [];

      const castOk = combat.castSkill(grandPaladin, 'divine_intervention', ally, 1000);
      assert.strictEqual(castOk, true, 'divine_intervention cast must succeed');
      assert.strictEqual(ally.hasStatusEffect('poison'), false, 'Poison must be cleansed from ally by divine_intervention');
      assert.strictEqual(grandPaladin.hp, 90, `Grand Paladin must be healed +40 HP (50 -> 90), got ${grandPaladin.hp}`);
      assert.strictEqual(ally.hp, 85, `Ally must be healed +40 HP (45 -> 85), got ${ally.hp}`);
      console.log('    ✓ divine_intervention verified: cleansed poison (from toxin_blade) and healed all party members +40 HP.');
    }

    // 4C: final_reckoning on a cursed target below 30% -> exactly x1.4 * x1.3 versus the base cast (RNG fixed)
    {
      console.log('  4C: final_reckoning on a cursed target below 30% -> exactly x1.4 * x1.3 versus the base cast');
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const playerData = dataLoader.getPlayer();
      const greatswordDef = dataLoader.getWeapon('greatswords') || {
        id: 'greatswords',
        name: 'Greatsword',
        category: 'melee',
        proficiencyId: 'greatswords',
        baseDamage: 14,
        attackIntervalMs: 1400,
        attackRangeTiles: 1,
        baseAccuracy: 0.90,
        twoHanded: true
      };

      const deathbringer = new Player(scene, 10, 10, playerData, greatswordDef, 32);
      deathbringer.progression.setClassLevel('deathbringer', 40);
      deathbringer.progression.getProficiencyStat('greatswords').level = 100;
      deathbringer.energy = 100;

      const target = createDummyEnemy(scene, 11, 10, 'Reckoning Target', 10000);
      combat.party = [deathbringer];
      combat.enemies = [target];

      // Base cast: full HP (10000 / 10000 = 100%), not cursed
      const hpBeforeBase = target.hp;
      const baseOk = combat.castSkill(deathbringer, 'final_reckoning', target, 1000);
      assert.strictEqual(baseOk, true, 'Base final_reckoning cast must succeed');
      const baseDmg = hpBeforeBase - target.hp;
      assert.ok(baseDmg > 0, 'Base final_reckoning damage must be positive');

      // Curse the target by casting reaping_strike (with Math.random = 0.05 <= 0.30, curse procs)
      deathbringer.lastSkillUseTimes.clear();
      deathbringer.energy = 100;
      const reapOk = combat.castSkill(deathbringer, 'reaping_strike', target, 2000);
      assert.strictEqual(reapOk, true, 'reaping_strike cast must succeed to apply curse');
      assert.strictEqual(target.hasStatusEffect('curse'), true, 'Target must have curse status');

      // Set target below 30% HP (2500 / 10000 = 25% <= 30%)
      target.hp = 2500;
      deathbringer.lastSkillUseTimes.clear();
      deathbringer.energy = 100;

      const hpBeforeBoost = target.hp;
      const boostOk = combat.castSkill(deathbringer, 'final_reckoning', target, 3000);
      assert.strictEqual(boostOk, true, 'Boosted final_reckoning cast must succeed');
      const boostedDmg = hpBeforeBoost - target.hp;

      const expectedMultiplier = 1.4 * 1.3; // 1.82
      const actualMultiplier = boostedDmg / baseDmg;
      assert.strictEqual(
        Number(actualMultiplier.toFixed(6)),
        Number(expectedMultiplier.toFixed(6)),
        `final_reckoning on cursed target below 30% HP must deal exactly 1.4 * 1.3 = ${expectedMultiplier}x base damage (got ${actualMultiplier}: ${baseDmg} -> ${boostedDmg})`
      );
      console.log(
        `    ✓ final_reckoning verified: base dealt ${baseDmg.toFixed(2)}, cursed + <30% HP dealt ${boostedDmg.toFixed(2)} (ratio = ${actualMultiplier.toFixed(4)} = 1.4 × 1.3).`
      );
    }
  } finally {
    Math.random = originalRandom;
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM TIER 4 PRESTIGE CLASSES TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
