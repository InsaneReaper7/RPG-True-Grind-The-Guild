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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 100): Enemy {
  const def: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 10,
    aggroRadius: 6,
    attackIntervalMs: 1500,
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  return enemy;
}

async function runGoldenMasterTests() {
  console.log('========================================================================');
  console.log('RUNNING SKILL MIGRATION GOLDEN MASTER & EQUIVALENCE TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();

  // Define a fixed test weapon with baseDamage: 10, baseAccuracy: 0.60, bleedChance: 0.50
  const fixedTestWeapon: WeaponDef = {
    id: 'test_fixed_sword',
    name: 'Test Fixed Sword',
    type: 'melee',
    tier: 'common',
    baseDamage: 10,
    baseAccuracy: 0.60,
    attackSpeed: 1.0,
    attackRangeTiles: 1,
    energyCostPerAttack: 10,
    bleedChance: 0.50,
    scaling: { stat: 'strength', factor: 1.0 }
  };

  // -------------------------------------------------------------------------
  // TEST 1: Exact Numeric Golden Master for Migrated Weapon Skills
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Golden Master Exact Numeric Comparisons (Literal Assertions) ---');
  const originalRandom = Math.random;

  try {
    // 1a. Power Strike deals exactly 2.0 × base (2.0 × 10 = 20 damage)
    {
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('fencer', 40);
      tester.mood = 50; // 1.0 combat multiplier
      tester.energy = 100;
      tester.equippedSkillIds = ['power_strike'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      // Force hit roll to 0.1 (well under 0.60 hit chance) and proc roll to 0.9 (no proc)
      let callCount = 0;
      Math.random = () => {
        callCount++;
        return 0.1;
      };

      const ok = combat.castSkill(tester, 'power_strike', enemy, 1000);
      assert.strictEqual(ok, true, 'Power Strike cast must succeed');
      // Exact literal assertions: baseDamage 10 * 2.0 = 20 damage dealt. 100 - 20 = 80 HP
      assert.strictEqual(enemy.hp, 80, 'Power Strike must deal exactly 20 damage (literal 2.0 × base 10)');
      assert.strictEqual(tester.energy, 75, 'Power Strike must deduct exactly 25 energy');
      assert.strictEqual((enemy as any).isAggroed, true, 'Power Strike hit must set isAggroed');
    }

    // 1b. Thrust deals exactly 1.5 × base (1.5 × 10 = 15 damage)
    {
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('fencer', 40);
      tester.mood = 50;
      tester.energy = 100;
      tester.equippedSkillIds = ['thrust'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      Math.random = () => 0.1;

      const ok = combat.castSkill(tester, 'thrust', enemy, 1000);
      assert.strictEqual(ok, true, 'Thrust cast must succeed');
      // Exact literal assertions: baseDamage 10 * 1.5 = 15 damage dealt. 100 - 15 = 85 HP
      assert.strictEqual(enemy.hp, 85, 'Thrust must deal exactly 15 damage (literal 1.5 × base 10)');
      assert.strictEqual(tester.energy, 80, 'Thrust must deduct exactly 20 energy');
      assert.strictEqual((enemy as any).isAggroed, true, 'Thrust hit must set isAggroed');
    }

    // 1c. Thrust hits at a roll where basic attack misses (+30% accuracy bonus)
    // Weapon baseAccuracy = 0.60. Thrust has accuracyBonus = 0.30 -> effective accuracy = 0.90.
    // Roll = 0.75: basic attack (0.60) misses, but Thrust (0.90) hits!
    {
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('fencer', 40);
      tester.mood = 50;
      tester.energy = 100;
      tester.equippedSkillIds = ['thrust'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      Math.random = () => 0.75; // 0.75 > 0.60 (basic misses) but < 0.90 (thrust hits)

      const ok = combat.castSkill(tester, 'thrust', enemy, 1000);
      assert.strictEqual(ok, true, 'Thrust must hit at roll 0.75 due to +30% accuracy bonus');
      assert.strictEqual(enemy.hp, 85, 'Thrust must deal exactly 15 damage on edge-case hit');
    }

    // 1d. Roll above hit chance gives 0 damage and a MISS
    // Thrust effective accuracy = 0.90. Roll = 0.95 -> MISS.
    {
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('fencer', 40);
      tester.mood = 50;
      tester.energy = 100;
      tester.equippedSkillIds = ['thrust'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      Math.random = () => 0.95; // 0.95 > 0.90 (miss)

      const ok = combat.castSkill(tester, 'thrust', enemy, 1000);
      assert.strictEqual(ok, true, 'Thrust skill cast executes and consumes resources');
      assert.strictEqual(enemy.hp, 100, 'Enemy must take exactly 0 damage on MISS (HP remains 100)');
    }

    // 1e. Weapon with bleed proc applies bleed on forced proc roll
    {
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('fencer', 40);
      tester.mood = 50;
      tester.energy = 100;
      tester.equippedSkillIds = ['power_strike'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];

      // Hit roll = 0.1 (< 0.60), Bleed roll = 0.2 (< 0.50 bleedChance)
      Math.random = () => 0.1;

      combat.castSkill(tester, 'power_strike', enemy, 1000);
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, 'Weapon bleed proc must be applied to target on hit');
    }

    // 1f. Verify Ember Adept data-driven skills
    const emberSkills = ['scorch', 'firebolt', 'flame_wave', 'ignite', 'firestorm'];
    for (const skillId of emberSkills) {
      const def = dataLoader.getSkill(skillId);
      assert.ok(def, `${skillId} definition must exist`);
      assert.ok(def.effects && def.effects.length > 0, `${def.name} must have effects array`);
      const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
      tester.progression.setClassLevel('ember_adept', 40);
      tester.energy = 100;
      tester.hp = 100;
      const enemy = createDummyEnemy(scene, 10, 11, 'Dummy', 500);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialEnemyHp = enemy.hp;
      const ok = combat.castSkill(tester, skillId, enemy, 1000);
      assert.strictEqual(ok, true, `${skillId} must cast successfully`);
      assert.strictEqual(tester.energy, 100 - def.energyCost, `${skillId} must deduct exact energy`);
      assert.ok(enemy.hp < initialEnemyHp, `${skillId} must deal damage`);
    }

    console.log('  ✓ Exact numeric golden-master assertions passed (literal 20, 15, 0 dmg, +30% accuracy edge-case hit, bleed proc).\n');
  } finally {
    Math.random = originalRandom;
  }

  // -------------------------------------------------------------------------
  // TEST 2: AI Companion Exact Skill ID Selection Across 14 Kits & Scenarios
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Exact Skill ID Companion Equivalence Across 14 Kits ---');

  const fullKits = [
    { classId: 'swordsman', skills: ['blade_strike', 'quick_cut', 'severing_slice', 'cross_cut'], weapon: 'katana' },
    { classId: 'fencer', skills: ['fleche', 'thrust', 'riposte', 'power_strike', 'blade_dance'], weapon: 'short_swords' },
    { classId: 'loader', skills: ['primed_shot', 'rapid_crank', 'arbalest_brace', 'pinning_bolt', 'kinetic_overdraw'], weapon: 'crossbow' },
    { classId: 'arcane_initiate', skills: ['arcane_bolt', 'mana_shield', 'overcharge', 'blink', 'arcane_nova'], weapon: 'arcane_staff' },
    { classId: 'ronin', skills: ['iaido_quickdraw', 'crimson_slash', 'flowing_step', 'bloodseeker_riposte', 'dragons_flurry'], weapon: 'katana' },
    { classId: 'samurai', skills: ['overhead_cleave', 'sweeping_hilt', 'heavenly_decapitation', 'kenjutsu_deflection'], weapon: 'katana' },
    { classId: 'vanguard', skills: ['shield_bash', 'defensive_posture', 'iron_posture', 'unbreakable'], weapon: 'shields' },
    { classId: 'spellsword', skills: ['arcane_strike', 'dimensional_lunge', 'blade_beam', 'vaulting_leap'], weapon: 'katana' },
    { classId: 'thrower', skills: ['quick_toss', 'fan_of_knives', 'crippling_volley', 'blade_barrage'], weapon: 'throwing_knives' },
    { classId: 'scout', skills: ['kill_shot', 'mark_target', 'quickshot', 'trap_snare'], weapon: 'hunting_bow' },
    { classId: 'dark_knight', skills: ['rending_cut', 'dark_pact', 'soul_drain', 'oblivion_strike', 'umbral_step'], weapon: 'katana' },
    { classId: 'combat_medic', skills: ['first_aid', 'cleanse', 'guardian_ward', 'regenerate', 'smite', 'holy_nova'], weapon: 'mace' },
    { classId: 'restoration_mage', skills: ['heal', 'mass_revive', 'barrier', 'holy_nova'], weapon: 'staff' },
    { classId: 'javelin', skills: ['piercing_throw', 'impaling_thrust', 'pinning_spear', 'heartseeker_hurl'], weapon: 'spears' }
  ];

  // Expected exact IDs based on legacy 0ea77ea behavior
  const expectedSelections: Record<string, {
    approach: string | null;
    inRange: string | null;
    lowHpAlly: string | null;
    harmfulStatusAlly: string | null;
    downedAlly: string | null;
  }> = {
    swordsman: {
      approach: null,
      inRange: 'cross_cut',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    fencer: {
      approach: 'fleche',
      inRange: 'blade_dance',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    loader: {
      approach: 'primed_shot',
      inRange: 'kinetic_overdraw',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    arcane_initiate: {
      approach: null, // blink has range 3 (dist 4 is out of range)
      inRange: 'arcane_bolt',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    ronin: {
      approach: null,
      inRange: 'dragons_flurry',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    samurai: {
      approach: null,
      inRange: 'heavenly_decapitation',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    vanguard: {
      approach: null,
      inRange: 'shield_bash',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    spellsword: {
      approach: 'dimensional_lunge',
      inRange: 'blade_beam',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    thrower: {
      approach: null, // thrower has no opener/gapCloser skills in kit
      inRange: 'blade_barrage',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    scout: {
      approach: 'mark_target',
      inRange: 'mark_target',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    dark_knight: {
      approach: 'umbral_step',
      inRange: 'oblivion_strike',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    },
    combat_medic: {
      approach: 'smite',
      inRange: 'smite',
      lowHpAlly: 'guardian_ward', // Legacy 0ea77ea L3630: shield prioritized when ally is unshielded
      harmfulStatusAlly: 'cleanse',
      downedAlly: null
    },
    restoration_mage: {
      approach: null,
      inRange: null,
      lowHpAlly: 'heal', // Deliberate 70% rule change: heal prioritized when ally <= 70%
      harmfulStatusAlly: 'barrier', // Legacy 0ea77ea L3630: shields unshielded ally when cleanse is not present
      downedAlly: 'mass_revive'
    },
    javelin: {
      approach: 'piercing_throw',
      inRange: 'heartseeker_hurl',
      lowHpAlly: null,
      harmfulStatusAlly: null,
      downedAlly: null
    }
  };

  for (const kit of fullKits) {
    const wpn = dataLoader.getWeapon(kit.weapon) ?? fixedTestWeapon;
    const companion = new Player(scene, 10, 10, playerData, wpn, 32);
    companion.progression.setClassLevel(kit.classId, 40);
    companion.energy = 100;
    companion.equippedSkillIds = [...kit.skills];

    const expected = expectedSelections[kit.classId];
    assert.ok(expected, `Expected mappings must exist for ${kit.classId}`);

    // Scenario 1: Out of range approach (distance = 4)
    const distantTarget = createDummyEnemy(scene, 10, 14, 'Distant Target', 100);
    combat.party = [companion];
    combat.enemies = [distantTarget];
    const approachSkill = combat.skillSystem.selectSkillForCompanion(companion, 'gapCloser', 1000, distantTarget, 4);
    assert.strictEqual(
      approachSkill?.skillDef.id ?? null,
      expected.approach,
      `${kit.classId} approach skill must be exactly '${expected.approach}'`
    );

    // Scenario 2: In-range offensive rotation (distance = 1, target at 100% HP)
    const adjacentTarget = createDummyEnemy(scene, 10, 11, 'Adjacent Target', 100);
    const rotationSkill = combat.skillSystem.selectSkillForCompanion(companion, 'rotation', 1000, adjacentTarget, 1);
    assert.strictEqual(
      rotationSkill?.skillDef.id ?? null,
      expected.inRange,
      `${kit.classId} in-range rotation skill must be exactly '${expected.inRange}'`
    );

    // Scenario 3: Low-HP Ally (Ally at 30% HP <= 70% threshold)
    const injuredAlly = new Player(scene, 10, 12, playerData, wpn, 32);
    injuredAlly.hp = 30;
    injuredAlly.maxHp = 100;
    combat.party = [companion, injuredAlly];
    const lowHpSupport = combat.skillSystem.selectSkillForCompanion(companion, 'support', 1000);
    assert.strictEqual(
      lowHpSupport?.skillDef.id ?? null,
      expected.lowHpAlly,
      `${kit.classId} low-HP ally support skill must be exactly '${expected.lowHpAlly}'`
    );

    // Scenario 4: Harmful Status on Ally (Ally has poison debuff at full HP)
    const poisonedAlly = new Player(scene, 10, 12, playerData, wpn, 32);
    poisonedAlly.hp = 100;
    poisonedAlly.maxHp = 100;
    const poisonDef = dataLoader.getStatusEffect('poison')!;
    poisonedAlly.applyStatusEffect(poisonDef);
    combat.party = [companion, poisonedAlly];
    const cleanseSupport = combat.skillSystem.selectSkillForCompanion(companion, 'support', 1000);
    assert.strictEqual(
      cleanseSupport?.skillDef.id ?? null,
      expected.harmfulStatusAlly,
      `${kit.classId} harmful-status support skill must be exactly '${expected.harmfulStatusAlly}'`
    );

    // Scenario 5: Downed Ally (Ally is downed)
    const downedAlly = new Player(scene, 10, 12, playerData, wpn, 32);
    downedAlly.hp = 0;
    downedAlly.state = 'downed';
    // Ensure companion already has active shield so self-shielding does not trigger
    const shieldEff = dataLoader.getStatusEffect('guardian_ward') || { id: 'guardian_ward', name: 'Ward', durationMs: 5000, color: '#fff' };
    companion.applyStatusEffect(shieldEff as any);
    combat.party = [companion, downedAlly];
    const reviveSupport = combat.skillSystem.selectSkillForCompanion(companion, 'support', 1000);
    assert.strictEqual(
      reviveSupport?.skillDef.id ?? null,
      expected.downedAlly,
      `${kit.classId} downed ally support skill must be exactly '${expected.downedAlly}'`
    );
  }

  // -------------------------------------------------------------------------
  // Defensive Specific Verifications: Guard Up / Unbreakable / Arcane Nova
  // -------------------------------------------------------------------------
  console.log('--- TEST 2b: Defensive Buff & Stance Trigger Equivalence ---');
  {
    // Vanguard: Unbreakable & Guard Up cast on active threat at full HP, not without threat
    const vanguard = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
    vanguard.progression.setClassLevel('vanguard', 40);
    vanguard.equippedSkillIds = ['guard_up', 'unbreakable', 'shield_bash'];
    vanguard.hp = 100;
    vanguard.maxHp = 100;

    const threatEnemy = createDummyEnemy(scene, 10, 11, 'Threat', 100);
    threatEnemy.isAggroed = true;
    combat.party = [vanguard];
    combat.enemies = [threatEnemy];

    // With active threat and full HP: must select unbreakable (highest priority defensive 90)
    const withThreat = combat.skillSystem.selectSkillForCompanion(vanguard, 'defensive', 1000);
    assert.strictEqual(withThreat?.skillDef.id, 'unbreakable', 'Vanguard at 100% HP with active threat must cast unbreakable');

    // Without active threat: CombatSystem.checkAndAutocastSelfBuffs checks threat and refuses
    combat.enemies = [];
    vanguard.targetEntity = null;
    const noThreatCast = combat.checkAndAutocastSelfBuffs(vanguard, 1000);
    assert.strictEqual(noThreatCast, false, 'Self buffs must not cast when there is no active threat');

    // Arcane Nova: casts when enemies are in radius 4, not when enemies are outside
    const mage = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
    mage.progression.setClassLevel('arcane_initiate', 40);
    mage.equippedSkillIds = ['arcane_nova'];
    combat.party = [mage];

    // Enemy in radius (distance = 2 tiles)
    const nearEnemy = createDummyEnemy(scene, 10, 12, 'Near Enemy', 100);
    combat.enemies = [nearEnemy];
    const nearNova = combat.skillSystem.selectSkillForCompanion(mage, 'defensive', 1000);
    assert.strictEqual(nearNova?.skillDef.id, 'arcane_nova', 'Arcane Nova must cast when enemies are within radius');

    // Enemy outside radius (distance = 6 tiles)
    const farEnemy = createDummyEnemy(scene, 10, 16, 'Far Enemy', 100);
    combat.enemies = [farEnemy];
    const farNova = combat.skillSystem.selectSkillForCompanion(mage, 'defensive', 1000);
    assert.strictEqual(farNova, null, 'Arcane Nova must NOT cast when enemies are outside radius');
  }
  console.log('  ✓ Exact companion skill IDs verified across all 14 kits and scenarios.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Additive Damage Amplification Stacking (Expose + Arcane Vulnerability)
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: Additive Damage Amplification Stacking (+25% + 15% = +40%) ---');
  {
    const target = createDummyEnemy(scene, 10, 10, 'Amp Target', 500);

    const exposeDef = dataLoader.getStatusEffect('expose') ?? {
      id: 'expose',
      name: 'Expose',
      durationMs: 5000,
      damageAmplificationPercent: 0.25,
      isHarmful: true
    };
    const arcaneVulnDef = dataLoader.getStatusEffect('arcane_vulnerability') ?? {
      id: 'arcane_vulnerability',
      name: 'Arcane Vulnerability',
      durationMs: 5000,
      damageAmplificationPercent: 0.15,
      isHarmful: true
    };

    target.applyStatusEffect(exposeDef);
    target.applyStatusEffect(arcaneVulnDef);

    // Direct takeDamage call with base amount 100
    // Expected: 100 * (1 + 0.25 + 0.15) = 100 * 1.40 = 140 damage dealt
    const initialHp = target.hp;
    target.takeDamage(100);
    const damageDealt = initialHp - target.hp;

    assert.strictEqual(
      damageDealt,
      140,
      `Damage amplification must sum additively: 100 * (1 + 0.25 + 0.15) = exactly 140 (got ${damageDealt})`
    );
    console.log(`  ✓ Expose (+25%) and Arcane Vulnerability (+15%) stacked additively to exactly ×1.40 (100 base -> ${damageDealt} damage).\n`);
  }

  console.log('========================================================================');
  console.log('🎉 ALL SKILL MIGRATION GOLDEN MASTER TESTS PASSED SUCCESSFULLY');
  console.log('========================================================================');
}

runGoldenMasterTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
