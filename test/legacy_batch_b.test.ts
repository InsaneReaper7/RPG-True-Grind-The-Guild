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

  let lastFloatingText = '';
  let lastFloatingColor = '';

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
    gridWidth,
    gridHeight,
    tileSize: 32,
    grid,
    pathfinder,
    lastFloatingText: '',
    lastFloatingColor: '',
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
      text: (x: number, y: number, text: string, style?: any) => {
        scene.lastFloatingText = text;
        if (style && style.color) scene.lastFloatingColor = style.color;
        return createMockObj();
      },
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    }
  };
  return scene;
}

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 200): Enemy {
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

async function runBatchBTests() {
  console.log('========================================================================');
  console.log('RUNNING LEGACY KIT MIGRATION BATCH B TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();

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
    scaling: { stat: 'strength', factor: 1.0 }
  };

  const zeroBaseWeapon: WeaponDef = {
    id: 'test_zero_conduit',
    name: 'Healing Conduit',
    type: 'magic',
    category: 'focus',
    tier: 'common',
    baseDamage: 0,
    baseAccuracy: 1.0,
    attackSpeed: 1.0,
    attackRangeTiles: 3,
    energyCostPerAttack: 10,
    scaling: { stat: 'intelligence', factor: 0.0 }
  };

  const createTester = (skillId: string, weapon: WeaponDef = fixedTestWeapon) => {
    const tester = new Player(scene, 10, 10, playerData, weapon, 32);
    for (const c of [
      'fencer', 'combat_medic', 'vanguard', 'restoration_mage', 'brawler',
      'scout', 'dark_knight', 'swordsman', 'ronin', 'samurai', 'javelin',
      'loader', 'arcane_initiate', 'spellsword', 'thrower'
    ]) {
      tester.progression.setClassLevel(c as any, 50);
    }
    tester.mood = 50; // 1.0 multiplier
    tester.energy = 100;
    tester.equippedSkillIds = [skillId];
    return tester;
  };

  const originalRandom = Math.random;

  try {
    // -----------------------------------------------------------------------
    // ITEM 0 CARRY-OVERS: minDamage and Player.useSkill fallback
    // -----------------------------------------------------------------------
    console.log('--- TEST 0: Batch A Carry-Overs (minDamage floors & useSkill fallback) ---');
    Math.random = () => 0.05; // Hit guaranteed

    // Smite with 0 base damage weapon -> exactly 8 damage
    {
      const tester = createTester('smite', zeroBaseWeapon);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'smite', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 92, 'Smite deals exactly 8 damage with 0-base weapon (minDamage: 8)');
    }

    // Holy Nova with 0 base damage weapon -> exactly 12 damage
    {
      const tester = createTester('holy_nova', zeroBaseWeapon);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'holy_nova', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 88, 'Holy Nova deals exactly 12 damage with 0-base weapon (minDamage: 12)');
    }

    // Player.useSkill fallback when no combat system
    {
      const tester = createTester('blade_strike');
      const fallbackResult = tester.useSkill('blade_strike', 1000);
      assert.strictEqual(fallbackResult, false, 'useSkill fallback returns false for non-support skill without combat system');

      const healResult = tester.useSkill('heal', 1000);
      assert.strictEqual(healResult, true, 'useSkill fallback returns true for heal skill');
    }

    // -----------------------------------------------------------------------
    // TEST 1: Stances via damageTakenMultiplier & "IMMUNE!" text
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Stances and IMMUNE! floating text ---');

    // guard_up: 0.50
    {
      const tester = createTester('guard_up');
      const ok = combat.castSkill(tester, 'guard_up', tester, 1000);
      assert.strictEqual(ok, true, 'guard_up casts successfully');
      const statusDef = DataLoader.getInstance().getStatusEffect('guard_up');
      assert.strictEqual(statusDef.damageTakenMultiplier, 0.50, 'guard_up statusDef has damageTakenMultiplier: 0.50');
      tester.hp = 100;
      tester.takeDamage(20);
      assert.strictEqual(tester.hp, 90, 'guard_up reduces 20 incoming damage to 10 (0.50)');
    }

    // iron_posture: 0.65
    {
      const tester = createTester('iron_posture');
      const ok = combat.castSkill(tester, 'iron_posture', tester, 1000);
      assert.strictEqual(ok, true, 'iron_posture casts successfully');
      const statusDef = DataLoader.getInstance().getStatusEffect('iron_posture');
      assert.strictEqual(statusDef.damageTakenMultiplier, 0.65, 'iron_posture statusDef has damageTakenMultiplier: 0.65');
      tester.hp = 100;
      tester.takeDamage(20);
      assert.strictEqual(tester.hp, 87, 'iron_posture reduces 20 incoming damage to 13 (20 * 0.65 = 13)');
    }

    // defensive_posture: 0.80
    {
      const tester = createTester('defensive_posture');
      const ok = combat.castSkill(tester, 'defensive_posture', tester, 1000);
      assert.strictEqual(ok, true, 'defensive_posture casts successfully');
      const statusDef = DataLoader.getInstance().getStatusEffect('defensive_posture');
      assert.strictEqual(statusDef.damageTakenMultiplier, 0.80, 'defensive_posture statusDef has damageTakenMultiplier: 0.80');
      tester.hp = 100;
      tester.takeDamage(20);
      assert.strictEqual(tester.hp, 84, 'defensive_posture reduces 20 incoming damage to 16 (20 * 0.80 = 16)');
    }

    // arbalest_brace: 0.80
    {
      const tester = createTester('arbalest_brace');
      const ok = combat.castSkill(tester, 'arbalest_brace', tester, 1000);
      assert.strictEqual(ok, true, 'arbalest_brace casts successfully');
      const statusDef = DataLoader.getInstance().getStatusEffect('arbalest_brace');
      assert.strictEqual(statusDef.damageTakenMultiplier, 0.80, 'arbalest_brace statusDef has damageTakenMultiplier: 0.80');
      tester.hp = 100;
      tester.takeDamage(20);
      assert.strictEqual(tester.hp, 84, 'arbalest_brace reduces 20 incoming damage to 16 (20 * 0.80 = 16)');
    }

    // unbreakable: 0.00 & "IMMUNE!"
    {
      const tester = createTester('unbreakable');
      const ok = combat.castSkill(tester, 'unbreakable', tester, 1000);
      assert.strictEqual(ok, true, 'unbreakable casts successfully');
      const statusDef = DataLoader.getInstance().getStatusEffect('unbreakable');
      assert.strictEqual(statusDef.damageTakenMultiplier, 0.0, 'unbreakable statusDef has damageTakenMultiplier: 0.0');
      tester.hp = 100;
      scene.lastFloatingText = '';
      tester.takeDamage(50);
      assert.strictEqual(tester.hp, 100, 'unbreakable grants total immunity (0 damage taken)');
      assert.strictEqual(scene.lastFloatingText, 'IMMUNE!', 'unbreakable triggers IMMUNE! floating text');
      assert.strictEqual(scene.lastFloatingColor, '#f59e0b', 'IMMUNE! text uses #f59e0b color');
    }

    // Multiplicative stance stacking: guard_up (0.50) + defensive_posture (0.80) => 0.40
    {
      const tester = createTester('guard_up');
      tester.applyStatusEffect(dataLoader.getStatusEffect('guard_up'));
      tester.applyStatusEffect(dataLoader.getStatusEffect('defensive_posture'));
      tester.hp = 100;
      tester.takeDamage(100);
      assert.strictEqual(tester.hp, 60, 'guard_up (0.5) and defensive_posture (0.8) stack multiplicatively: 100 * 0.5 * 0.8 = 40 damage');
    }

    // Curse / Weaken test: entity with damageReductionPercent: 20 takes normal damage
    {
      const tester = createTester('guard_up');
      tester.applyStatusEffect(dataLoader.getStatusEffect('curse')); // curse has damageReductionPercent: 0.25
      tester.hp = 100;
      tester.takeDamage(20);
      assert.strictEqual(tester.hp, 80, 'damageReductionPercent does NOT reduce incoming damage');
    }

    // -----------------------------------------------------------------------
    // TEST 2: Support skills (blessed_weapons & spell_ward)
    // -----------------------------------------------------------------------
    console.log('--- TEST 2: Support skills (blessed_weapons & spell_ward) ---');

    // blessed_weapons: flatBonusDamage: 5 and target: "party"
    {
      const tester1 = createTester('blessed_weapons');
      const tester2 = createTester('blade_strike');
      combat.party = [tester1, tester2];
      const ok = combat.castSkill(tester1, 'blessed_weapons', tester1, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester1.hasStatusEffect('blessed_weapons'), true, 'Caster gets blessed_weapons');
      assert.strictEqual(tester2.hasStatusEffect('blessed_weapons'), true, 'Party ally gets blessed_weapons via target: party');

      // Now attack enemy with blessed_weapons active: base 10 + 5 flat bonus = 15 damage
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.enemies = [enemy];
      // Weapon skill: blade_strike 1.4x 10 = 14 + 5 = 19
      const okSkill = combat.castSkill(tester2, 'blade_strike', enemy, 1000);
      assert.strictEqual(okSkill, true);
      assert.strictEqual(enemy.hp, 81, 'Blade strike deals 14 + 5 flat bonus damage = 19 damage');
    }

    // spell_ward: 40 shield + spell_ward_buff (+0.20 parryBonus)
    {
      const tester = createTester('spell_ward');
      combat.party = [tester];
      const ok = combat.castSkill(tester, 'spell_ward', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.activeStatusEffects.get('spell_ward')?.shieldHp, 40, 'spell_ward grants 40 shield HP');
      assert.strictEqual(tester.hasStatusEffect('spell_ward_buff'), true, 'spell_ward applies spell_ward_buff');
    }

    // -----------------------------------------------------------------------
    // TEST 3: Hybrid & Partner Scaling Skills
    // -----------------------------------------------------------------------
    console.log('--- TEST 3: Hybrid & Partner Scaling Skills ---');

    // Helper: set proficiency level
    const setProf = (p: any, prof: string, lvl: number) => {
      p.progression.proficiencies.set(prof, { level: lvl, currentExp: 0 });
    };

    // quickshot: bows/daggers partner. Equipped weapon is melee (not bows/daggers).
    // partnerOf: ['bows', 'daggers'] -> weapon type is 'melee', so partner defaults to bows.
    // Let's set bows to 20: 20 * 0.15 = 3.0 bonus damage.
    // Multiplier: 1.4x base 10 = 14 + 3 = 17 damage.
    {
      const tester = createTester('quickshot');
      setProf(tester, 'bows', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'quickshot', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Quickshot deals 14 + 3 (bows lvl 20) = 17 damage');
    }

    // kill_shot: partner bonus + low health bonus (threshold 0.40, mult 2.0)
    // Target HP = 30 / 100 (< 40%). Base: 1.5x 10 = 15. Partner bows lvl 20: +3 -> 18 * 2.0 = 36 damage.
    {
      const tester = createTester('kill_shot');
      setProf(tester, 'bows', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      enemy.hp = 30;
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'kill_shot', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 0, 'Kill shot executes enemy below 40% HP (deals 36 damage)');
    }

    // rending_cut: 1.5x base 10 = 15 + dark_magic lvl 20 (+3) = 18 damage + bleed status
    {
      const tester = createTester('rending_cut');
      setProf(tester, 'dark_magic', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'rending_cut', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Rending cut deals 15 + 3 = 18 damage');
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, 'Rending cut applies bleed');
    }

    // dark_pact: 2.4x base 10 = 24 + dark_magic lvl 20 (+3) = 27 damage. HP cost: 10.
    {
      const tester = createTester('dark_pact');
      setProf(tester, 'dark_magic', 20);
      tester.hp = 100;
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'dark_pact', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 73, 'Dark pact deals 24 + 3 = 27 damage');
      assert.strictEqual(tester.hp, 90, 'Dark pact costs 10 HP');
    }

    // umbral_step: 1.4x base 10 = 14 + dark_magic lvl 20 (+3) = 17 damage + teleport behind target
    {
      const tester = createTester('umbral_step');
      setProf(tester, 'dark_magic', 20);
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'umbral_step', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Umbral step deals 14 + 3 = 17 damage');
    }

    // piercing_throw: 1.5x base 10 = 15 + throwing_weapons lvl 20 (+3) = 18 damage + partnerExp: 1
    {
      const tester = createTester('piercing_throw');
      setProf(tester, 'throwing_weapons', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('throwing_weapons').currentExp;
      const ok = combat.castSkill(tester, 'piercing_throw', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Piercing throw deals 15 + 3 = 18 damage');
      assert.strictEqual(tester.progression.getProficiencyStat('throwing_weapons').currentExp, initialExp + 1, 'Awards 1 partnerExp to throwing_weapons');
    }

    // impaling_thrust: 1.7x base 10 = 17 + throwing_weapons lvl 20 (+3) = 20 damage + bleed + partnerExp
    {
      const tester = createTester('impaling_thrust');
      setProf(tester, 'throwing_weapons', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('throwing_weapons').currentExp;
      const ok = combat.castSkill(tester, 'impaling_thrust', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 80, 'Impaling thrust deals 17 + 3 = 20 damage');
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, 'Impaling thrust applies bleed');
      assert.strictEqual(tester.progression.getProficiencyStat('throwing_weapons').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // pinning_spear: 1.8x base 10 = 18 + throwing_weapons lvl 20 (+3) = 21 damage + slow + partnerExp
    {
      const tester = createTester('pinning_spear');
      setProf(tester, 'throwing_weapons', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('throwing_weapons').currentExp;
      const ok = combat.castSkill(tester, 'pinning_spear', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 79, 'Pinning spear deals 18 + 3 = 21 damage');
      assert.strictEqual(enemy.hasStatusEffect('slow'), true, 'Pinning spear applies slow');
      assert.strictEqual(tester.progression.getProficiencyStat('throwing_weapons').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // quick_toss: 1.4x base 10 = 14 + daggers lvl 20 (+3) = 17 damage + partnerExp
    {
      const tester = createTester('quick_toss');
      setProf(tester, 'daggers', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('daggers').currentExp;
      const ok = combat.castSkill(tester, 'quick_toss', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Quick toss deals 14 + 3 = 17 damage');
      assert.strictEqual(tester.progression.getProficiencyStat('daggers').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // fan_of_knives: 1.6x base 10 = 16 + daggers lvl 20 (+3) = 19 damage. Cleaves adjacent enemy!
    {
      const tester = createTester('fan_of_knives');
      setProf(tester, 'daggers', 20);
      const enemy1 = createDummyEnemy(scene, 10, 11, 'Target 1', 100);
      const enemy2 = createDummyEnemy(scene, 10, 12, 'Target 2', 100);
      combat.party = [tester];
      combat.enemies = [enemy1, enemy2];
      const ok = combat.castSkill(tester, 'fan_of_knives', enemy1, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy1.hp, 81, 'Fan of knives deals 16 + 3 = 19 damage to main target');
      assert.strictEqual(enemy2.hp <= 91, true, 'Fan of knives cleaves adjacent enemy with 50% falloff');
    }

    // crippling_volley: 1.85x base 10 = 18.5 + daggers lvl 20 (+3) = 21.5 damage + slow + partnerExp
    {
      const tester = createTester('crippling_volley');
      setProf(tester, 'daggers', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('daggers').currentExp;
      const ok = combat.castSkill(tester, 'crippling_volley', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 78.5, 'Crippling volley deals 18.5 + 3 = 21.5 damage');
      assert.strictEqual(enemy.hasStatusEffect('slow'), true, 'Crippling volley applies slow');
      assert.strictEqual(tester.progression.getProficiencyStat('daggers').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // arcane_strike: 1.5x base 10 = 15 + arcane_magic lvl 20 (+3) = 18 damage + partnerExp
    {
      const tester = createTester('arcane_strike');
      setProf(tester, 'arcane_magic', 20);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('arcane_magic').currentExp;
      const ok = combat.castSkill(tester, 'arcane_strike', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Arcane strike deals 15 + 3 = 18 damage');
      assert.strictEqual(tester.progression.getProficiencyStat('arcane_magic').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // dimensional_lunge: 1.9x base 10 = 19 + arcane_magic lvl 20 (+3) = 22 damage + partnerExp + teleport
    {
      const tester = createTester('dimensional_lunge');
      setProf(tester, 'arcane_magic', 20);
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const initialExp = tester.progression.getProficiencyStat('arcane_magic').currentExp;
      const ok = combat.castSkill(tester, 'dimensional_lunge', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 78, 'Dimensional lunge deals 19 + 3 = 22 damage');
      assert.strictEqual(tester.progression.getProficiencyStat('arcane_magic').currentExp, initialExp + 1, 'Awards 1 partnerExp');
    }

    // -----------------------------------------------------------------------
    // TEST 4: Retreat Movement
    // -----------------------------------------------------------------------
    console.log('--- TEST 4: Retreat Skills (evasive_roll, vaulting_leap, blink) ---');

    // evasive_roll: distance 2 retreat
    {
      const tester = createTester('evasive_roll');
      tester.setGridPosition(10, 10);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100); // enemy south of player
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'evasive_roll', tester, 1000);
      assert.strictEqual(ok, true);
      // Player was at (10, 10), enemy at (10, 11). Retreat should move away from enemy (e.g. north towards y = 8)
      assert.strictEqual(tester.gridPos.y < 10, true, 'evasive_roll moved player away from enemy (gridPos.y decreased)');
      assert.strictEqual(Math.hypot(tester.gridPos.x - 10, tester.gridPos.y - 11) > 1, true, 'Distance from enemy increased');
    }

    // vaulting_leap: distance 3 retreat
    {
      const tester = createTester('vaulting_leap');
      tester.setGridPosition(10, 10);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'vaulting_leap', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.gridPos.y < 10, true, 'vaulting_leap moved player away from enemy');
    }

    // blink: distance 3 retreat
    {
      const tester = createTester('blink');
      tester.setGridPosition(10, 10);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'blink', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.gridPos.y < 10, true, 'blink moved player away from enemy');
    }

    // -----------------------------------------------------------------------
    // TEST 5: Weapon Skill Accuracy Roll (D2 rule: Miss deals 0 damage)
    // -----------------------------------------------------------------------
    console.log('--- TEST 5: Weapon Skill Accuracy Roll (Forced Miss = 0 damage) ---');
    {
      Math.random = () => 0.999; // Guarantees a miss against baseAccuracy 0.60
      const tester = createTester('quickshot');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'quickshot', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 100, 'Weapon skill that misses deals 0 damage');
    }

    console.log('\n✓ PASS: All Legacy Kit Migration Batch B tests passed cleanly!');
  } finally {
    Math.random = originalRandom;
  }
}

await runBatchBTests();
