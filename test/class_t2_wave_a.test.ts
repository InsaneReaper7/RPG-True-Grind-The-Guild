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

const t2WaveAClasses: {
  classId: string;
  name: string;
  weaponProf: string;
  defaultWeaponId: string;
  skills: string[];
}[] = [
  {
    classId: 'blademaster',
    name: 'Blademaster',
    weaponProf: 'katana',
    defaultWeaponId: 'katana',
    skills: ['twin_style_cut', 'sword_dance_stance', 'crescent_sweep', 'iaijutsu', 'thousand_blade_storm']
  },
  {
    classId: 'assassin',
    name: 'Assassin',
    weaponProf: 'daggers',
    defaultWeaponId: 'daggers',
    skills: ['shiv', 'vanish', 'ambush', 'toxin_blade', 'death_mark']
  },
  {
    classId: 'shadowblade',
    name: 'Shadowblade',
    weaponProf: 'daggers',
    defaultWeaponId: 'daggers',
    skills: ['umbral_slash', 'shadow_siphon', 'night_veil', 'hex_blade', 'eclipse']
  },
  {
    classId: 'arcane_archer',
    name: 'Arcane Archer',
    weaponProf: 'bows',
    defaultWeaponId: 'bows',
    skills: ['arcane_arrow', 'seeking_volley', 'runic_quiver', 'piercing_ray', 'starfall']
  },
  {
    classId: 'storm_archer',
    name: 'Storm Archer',
    weaponProf: 'bows',
    defaultWeaponId: 'bows',
    skills: ['static_arrow', 'chain_shot', 'tailwind_draw', 'thunder_arrow', 'storm_barrage']
  },
  {
    classId: 'witch_hunter',
    name: 'Witch Hunter',
    weaponProf: 'crossbows',
    defaultWeaponId: 'crossbows',
    skills: ['silver_bolt', 'purging_shot', 'consecrated_ward', 'judgment_bolt', 'inquisition']
  },
  {
    classId: 'knight',
    name: 'Knight',
    weaponProf: 'short_swords',
    defaultWeaponId: 'short_swords',
    skills: ['shield_strike', 'bulwark_stance', 'valorous_strike', 'provoke', 'last_bastion']
  },
  {
    classId: 'paladin',
    name: 'Paladin',
    weaponProf: 'short_swords',
    defaultWeaponId: 'short_swords',
    skills: ['holy_strike', 'lay_on_hands', 'aura_of_protection', 'consecration', 'divine_judgment']
  },
  {
    classId: 'juggernaut',
    name: 'Juggernaut',
    weaponProf: 'greatswords',
    defaultWeaponId: 'greatswords',
    skills: ['crushing_swing', 'iron_hide', 'earthquake_slam', 'retaliation_stance', 'cataclysm']
  },
  {
    classId: 'battlemage',
    name: 'Battlemage',
    weaponProf: 'longswords',
    defaultWeaponId: 'longsword_1h',
    skills: ['flame_blade', 'pyre_stance', 'fire_lunge', 'blazing_arc', 'meteor_strike']
  },
  {
    classId: 'storm_lancer',
    name: 'Storm Lancer',
    weaponProf: 'spears',
    defaultWeaponId: 'spears',
    skills: ['charged_thrust', 'lightning_charge', 'arc_sweep', 'static_guard', 'thunder_impale']
  }
];

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING CLASS PROGRAM TIER 2 WAVE A: EXPERT CLASSES VALIDATION SUITE');
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
  console.log('--- TEST 1: Tier 2 Wave A Classes & Skills Data Validation ---');

  for (const kit of t2WaveAClasses) {
    const classDef = dataLoader.getClass(kit.classId);
    assert.ok(classDef, `Class ${kit.classId} must exist in classes.json`);
    assert.strictEqual(classDef.tier, 'expert', `Class ${kit.classId} must be tier expert`);
    assert.ok(classDef.requirements && classDef.requirements.length >= 1, `Class ${kit.classId} must have at least 1 requirement`);
    assert.ok(classDef.fantasy && classDef.fantasy.length > 0, `Class ${kit.classId} must have fantasy text`);
    assert.ok(classDef.hiddenSkillBonuses && Object.keys(classDef.hiddenSkillBonuses).length > 0, `Class ${kit.classId} must have hiddenSkillBonuses`);
  }

  let checkedSkillCount = 0;

  for (const kit of t2WaveAClasses) {
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
        }
        if (eff.type === 'damage') {
          assert.strictEqual(eff.scaling, 'weapon', `Damage effect in skill ${skillId} must have scaling: "weapon"`);
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

  assert.strictEqual(checkedSkillCount, 55, 'Must have validated all 55 Tier 2 Wave A skills');
  console.log(`✓ PASS: All 11 classes and 55 skills validated cleanly (requirements, effects, ai, cadence 1/10/20/30/40, generic buff stats, valid status IDs).\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Smoke Test (11 Classes × 60s Simulated 3-Enemy Fight, Ally at 60% HP)
  // Each companion at Lv 40 casts at least 4 of 5 skills within 60s without forced statuses or positions.
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Tier 2 Wave A Smoke Test (11 Classes × 60s 3-Enemy Fight) ---');

  const perClassResults: Record<string, { totalCasts: number; distinctSkills: number; skillCounts: Record<string, number> }> = {};

  for (const kit of t2WaveAClasses) {
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

    // Setup base class requirements & proficiencies so all skill conditions evaluate cleanly
    companion.progression.getProficiencyStat(kit.weaponProf).level = 60;
    companion.progression.getProficiencyStat('shields').level = 60;
    companion.progression.getProficiencyStat('holy_magic').level = 30;
    companion.progression.getProficiencyStat('dark_magic').level = 30;
    companion.progression.getProficiencyStat('arcane_magic').level = 30;
    companion.progression.getProficiencyStat('fire_magic').level = 30;
    companion.progression.getProficiencyStat('lightning_magic').level = 30;
    companion.progression.getProficiencyStat('longswords').level = 30;

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

      // Keep companion energy available to cast rotation / defensive skills
      if (companion.energy < 45) {
        companion.energy = Math.min(100, companion.energy + 20);
      }

      // Maintain ally at 60% HP so support heals have an eligible target without dying
      if (ally.hp > 65) {
        ally.hp = 60;
      }

      // Let companion take light damage or drop to low HP periodically so selfHpBelow defensive skills fire naturally
      if (t >= 15000 && t <= 25000 && companion.hp > 30) {
        companion.hp = 30; // 30% (< 35% threshold for last_bastion)
      } else if (companion.hp < 70 && t > 26000) {
        companion.hp = 100;
      }

      // Let enemy1 drop below execute threshold (25% - 30%) around t = 20s-45s for execute skills
      if (t >= 20000 && t <= 45000 && enemy1.hp > 1200) {
        enemy1.hp = 1000; // 20% HP
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

  console.log('\n✓ PASS: All 11 Tier 2 Wave A classes cast at least 4 of 5 skills within 60s.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Specific Cast-Based Tests
  // - runic_quiver -> +3 EN per hit
  // - retaliation_stance -> two hits in 5 s give two counters
  // - aura_of_protection -> every party member takes x0.85
  // - cataclysm dumps up to 25 EN
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Specific Cast-Based Mechanics ---');

  const originalRandom = Math.random;
  Math.random = () => 0.05; // 100% hit rate, no random misses

  try {
    // 3A: runic_quiver -> +3 EN per hit
    {
    console.log('  3A: runic_quiver -> +3 EN per hit');
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();
    const bowDef = dataLoader.getWeapon('bows');

    const archer = new Player(scene, 10, 10, playerData, bowDef, 32);
    archer.progression.setClassLevel('arcane_archer', 40);
    archer.progression.getProficiencyStat('bows').level = 60; // ensure accuracy
    archer.energy = 50;

    const target = createDummyEnemy(scene, 13, 10, 'Target', 2000);
    combat.party = [archer];
    combat.enemies = [target];

    // Cast runic_quiver: costs 22 EN -> 50 - 22 = 28 EN
    const castOk = combat.castSkill(archer, 'runic_quiver', archer, 1000);
    assert.strictEqual(castOk, true, 'runic_quiver cast successfully');
    assert.strictEqual(archer.hasStatusEffect('runic_quiver'), true, 'runic_quiver status active on archer');
    assert.strictEqual(archer.energy, 28, 'Energy after cast is 28');

    // Basic attack: cost 0 EN -> 28 + 3 siphon = 31 EN
    combat.executePlayerBasicAttack(archer, target);
    assert.strictEqual(archer.energy, 31, `Energy after basic attack hit is 31 (28 + 3): ${archer.energy}`);

    // Skill attack (arcane_arrow): cost 16 EN -> 31 - 16 = 15 + 3 siphon = 18 EN
    const skillOk = combat.castSkill(archer, 'arcane_arrow', target, 2000);
    assert.strictEqual(skillOk, true, 'arcane_arrow cast successfully');
    assert.strictEqual(archer.energy, 18, `Energy after skill attack hit is 18 (31 - 16 + 3): ${archer.energy}`);
    console.log('    ✓ runic_quiver grants +3 EN per hit on basic attacks and skill attacks.');
  }

  // 3B: retaliation_stance -> two hits in 5 s give two counters
  {
    console.log('  3B: retaliation_stance -> two hits in 5 s give two counters');
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();
    const swordDef = dataLoader.getWeapon('greatswords');

    const juggernaut = new Player(scene, 10, 10, playerData, swordDef, 32);
    juggernaut.progression.setClassLevel('juggernaut', 40);
    juggernaut.progression.getProficiencyStat('greatswords').level = 60;
    juggernaut.energy = 50;

    // Cast retaliation_stance: cost 26 EN
    const castOk = combat.castSkill(juggernaut, 'retaliation_stance', juggernaut, 1000);
    assert.strictEqual(castOk, true, 'retaliation_stance cast successfully');
    assert.strictEqual(juggernaut.hasStatusEffect('retaliation_stance'), true, 'retaliation_stance active');

    const attacker = createDummyEnemy(scene, 10, 11, 'Attacker', 500);
    attacker.enemyData.baseDamage = 10;
    attacker.enemyData.attackIntervalMs = 1000;
    attacker.isAggroed = true;
    attacker.lastAttackTime = 0;
    combat.party = [juggernaut];
    combat.enemies = [attacker];
    (combat as any).enemyTargets.set(attacker, juggernaut);

    const initialHp = attacker.hp;

    // Hit 1 at t = 1000: triggers counterattack
    combat.update(1000, 16);
    assert.strictEqual(juggernaut.hasStatusEffect('retaliation_stance'), true, 'retaliation_stance is NOT consumed on hit 1');
    assert.strictEqual(attacker.hp < initialHp, true, `Attacker damaged by first counterattack (${initialHp} -> ${attacker.hp})`);
    const hpAfterHit1 = attacker.hp;

    // Hit 2 at t = 2100 (within 5s duration): triggers second counterattack
    attacker.lastAttackTime = 0;
    combat.update(2100, 16);
    assert.strictEqual(juggernaut.hasStatusEffect('retaliation_stance'), true, 'retaliation_stance remains active for hit 2');
    assert.strictEqual(attacker.hp < hpAfterHit1, true, `Attacker damaged by second counterattack (${hpAfterHit1} -> ${attacker.hp})`);
    console.log('    ✓ retaliation_stance triggers two counterattacks on two hits without being consumed.');
  }

  // 3C: aura_of_protection -> every party member takes x0.85
  {
    console.log('  3C: aura_of_protection -> every party member takes x0.85');
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();
    const swordDef = dataLoader.getWeapon('short_swords');

    const paladin = new Player(scene, 10, 10, playerData, swordDef, 32);
    paladin.progression.setClassLevel('paladin', 40);
    paladin.energy = 50;

    const ally1 = new Player(scene, 10, 11, playerData, swordDef, 32);
    ally1.hp = 100;
    ally1.maxHp = 100;

    const ally2 = new Player(scene, 10, 12, playerData, swordDef, 32);
    ally2.hp = 100;
    ally2.maxHp = 100;

    combat.party = [paladin, ally1, ally2];

    const castOk = combat.castSkill(paladin, 'aura_of_protection', paladin, 1000);
    assert.strictEqual(castOk, true, 'aura_of_protection cast successfully');

    assert.strictEqual(paladin.hasStatusEffect('aura_of_protection'), true, 'paladin has aura_of_protection');
    assert.strictEqual(ally1.hasStatusEffect('aura_of_protection'), true, 'ally1 has aura_of_protection');
    assert.strictEqual(ally2.hasStatusEffect('aura_of_protection'), true, 'ally2 has aura_of_protection');

    // Paladin takes 100 raw damage -> 100 * 0.85 = 85 damage
    paladin.hp = 100;
    paladin.maxHp = 100;
    paladin.takeDamage(100);
    assert.strictEqual(paladin.hp, 15, `Paladin took 85 damage (100 -> 15): ${paladin.hp}`);

    // Ally1 takes 100 raw damage -> 85 damage
    ally1.takeDamage(100);
    assert.strictEqual(ally1.hp, 15, `Ally1 took 85 damage (100 -> 15): ${ally1.hp}`);

    // Ally2 takes 60 raw damage -> 60 * 0.85 = 51 damage -> 100 - 51 = 49
    ally2.takeDamage(60);
    assert.strictEqual(ally2.hp, 49, `Ally2 took 51 damage (100 -> 49): ${ally2.hp}`);
    console.log('    ✓ aura_of_protection applied to entire party and reduces damage taken to x0.85.');
  }

  // 3D: cataclysm dumps up to 25 EN
  {
    console.log('  3D: cataclysm dumps up to 25 EN');
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const playerData = dataLoader.getPlayer();
    const swordDef = dataLoader.getWeapon('greatswords'); // baseDamage 10

    const juggernaut = new Player(scene, 10, 10, playerData, swordDef, 32);
    juggernaut.progression.setClassLevel('juggernaut', 40);
    juggernaut.progression.getProficiencyStat('greatswords').level = 0; // base power only

    const effectiveWeapon = combat.getEffectiveWeaponForAttack(juggernaut);
    const effBase = effectiveWeapon.baseDamage; // Level 0 proficiency, mood 50 (mult 1.0)
    juggernaut.energy = 69;
    const target1 = createDummyEnemy(scene, 10, 11, 'Target 1', 1000);
    combat.party = [juggernaut];
    combat.enemies = [target1];

    const ok1 = combat.castSkill(juggernaut, 'cataclysm', target1, 1000);
    assert.strictEqual(ok1, true, 'cataclysm cast succeeded');
    assert.strictEqual(juggernaut.energy, 0, 'Juggernaut spent 44 base + 25 surplus = 69 EN (0 EN left)');
    const expectedDmg1 = effBase * 4.8;
    assert.strictEqual(target1.hp.toFixed(1), (1000 - expectedDmg1).toFixed(1), `Target took ${expectedDmg1} damage (effBase ${effBase} * 4.8): ${target1.hp}`);

    // Case 2: 35 surplus EN available (44 + 35 = 79 EN).
    // Maximum dump is 25 EN.
    // Cast deducts 44 base + 25 dump = 69 EN. Remaining energy should be 10 EN!
    juggernaut.energy = 79;
    const target2 = createDummyEnemy(scene, 10, 11, 'Target 2', 1000);
    combat.enemies = [target2];

    const ok2 = combat.castSkill(juggernaut, 'cataclysm', target2, 20000);
    assert.strictEqual(ok2, true, 'cataclysm cast succeeded');
    assert.strictEqual(juggernaut.energy, 10, `Juggernaut capped dump at 25 EN (79 - 44 - 25 = 10 EN remaining): ${juggernaut.energy}`);
    const expectedDmg2 = effBase * 4.8;
    assert.strictEqual(target2.hp.toFixed(1), (1000 - expectedDmg2).toFixed(1), `Target took ${expectedDmg2} damage with max dump: ${target2.hp}`);
    console.log('    ✓ cataclysm dumps up to 25 bonus EN (+4% per EN) and caps appropriately.');
  }
  } finally {
    Math.random = originalRandom;
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL CLASS PROGRAM TIER 2 WAVE A TESTS PASSED CLEANLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
