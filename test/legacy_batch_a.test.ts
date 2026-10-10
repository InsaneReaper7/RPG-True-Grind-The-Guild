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
    gridWidth,
    gridHeight,
    tileSize: 32,
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

async function runBatchATests() {
  console.log('========================================================================');
  console.log('RUNNING LEGACY KIT MIGRATION BATCH A TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();

  // Test weapon with baseDamage: 10, baseAccuracy: 0.60
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

  const createTester = (skillId: string) => {
    const tester = new Player(scene, 10, 10, playerData, fixedTestWeapon, 32);
    // Unlock all classes so requirements are met
    for (const c of ['fencer', 'combat_medic', 'vanguard', 'restoration_mage', 'brawler', 'scout', 'swordsman', 'ronin', 'samurai', 'loader', 'thrower', 'reaver']) {
      tester.progression.setClassLevel(c as any, 50);
    }
    tester.mood = 50; // 1.0 combat multiplier
    tester.energy = 100;
    tester.equippedSkillIds = [skillId];
    return tester;
  };

  const originalRandom = Math.random;

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Hit resolution, literal damage calculations & status effects
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Batch A Hits with Exact Literal Numbers & Statuses ---');
    Math.random = () => 0.05; // Guarantees hit and status proc

    // Normal Punch: 2.5x base 10 = 25 damage
    {
      const tester = createTester('normal_punch');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'normal_punch', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 75, 'Normal Punch deals exactly 25 damage (2.5x 10)');
      assert.strictEqual(tester.energy, 80, 'Normal punch deducts 20 energy');
    }

    // Blade Strike: 1.4x base 10 = 14 damage
    {
      const tester = createTester('blade_strike');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'blade_strike', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 86, 'Blade Strike deals exactly 14 damage (1.4x 10)');
    }

    // Quick Cut: 1.5x base 10 = 15 damage with +20% accuracy
    {
      const tester = createTester('quick_cut');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      Math.random = () => 0.70; // 0.70 > 0.60 base accuracy, but < 0.80 effective accuracy -> HIT
      const ok = combat.castSkill(tester, 'quick_cut', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 85, 'Quick Cut deals exactly 15 damage on +20% acc bonus hit');
    }

    // Severing Slice: 1.7x base 10 = 17 damage + Bleed
    {
      Math.random = () => 0.05;
      const tester = createTester('severing_slice');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'severing_slice', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Severing Slice deals exactly 17 damage');
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, 'Severing Slice applies bleed');
    }

    // Cross Cut: 2.6x base 10 = 26 damage
    {
      const tester = createTester('cross_cut');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'cross_cut', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 74, 'Cross Cut deals exactly 26 damage');
    }

    // Crimson Slash: 1.7x base 10 = 17 damage + Bleed
    {
      const tester = createTester('crimson_slash');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'crimson_slash', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Crimson Slash deals exactly 17 damage');
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, 'Crimson Slash applies bleed');
    }

    // Flowing Step: 1.4x base 10 = 14 damage + dash + evasion buff
    {
      const tester = createTester('flowing_step');
      const enemy = createDummyEnemy(scene, 10, 13, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'flowing_step', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 86, 'Flowing Step deals exactly 14 damage');
      assert.strictEqual(tester.hasStatusEffect('flowing_step'), true, 'Flowing Step applies self buff');
    }

    // Bloodseeker Riposte: 2.0x base 10 = 20 damage normally, 30 damage on bleeding target (1.5x bonus)
    {
      const tester = createTester('bloodseeker_riposte');
      const enemy1 = createDummyEnemy(scene, 10, 11, 'Target1', 100);
      combat.party = [tester];
      combat.enemies = [enemy1];
      combat.castSkill(tester, 'bloodseeker_riposte', enemy1, 1000);
      assert.strictEqual(enemy1.hp, 80, 'Bloodseeker deals 20 damage without bleed');

      tester.energy = 100;
      tester.lastSkillUseTimes.clear();
      const enemy2 = createDummyEnemy(scene, 10, 11, 'Target2', 100);
      enemy2.applyStatusEffect({ id: 'bleed', name: 'Bleed', durationMs: 5000, tickIntervalMs: 1000, damagePerTick: 3 });
      combat.enemies = [enemy2];
      combat.castSkill(tester, 'bloodseeker_riposte', enemy2, 2000);
      assert.strictEqual(enemy2.hp, 70, 'Bloodseeker deals 30 damage (1.5x) on bleeding target');
    }

    // Dragon's Flurry: 4 hits, 3.2x base 10 = 32 damage total + Bleed
    {
      const tester = createTester('dragons_flurry');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'dragons_flurry', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 68, "Dragon's Flurry deals exactly 32 damage across 4 hits");
      assert.strictEqual(enemy.hasStatusEffect('bleed'), true, "Dragon's Flurry applies bleed");
    }

    // Overhead Cleave: 1.7x base 10 = 17 damage
    {
      const tester = createTester('overhead_cleave');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'overhead_cleave', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 83, 'Overhead Cleave deals exactly 17 damage');
    }

    // Sweeping Hilt: 1.8x base 10 = 18 damage + stun
    {
      const tester = createTester('sweeping_hilt');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'sweeping_hilt', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Sweeping Hilt deals exactly 18 damage');
      assert.strictEqual(enemy.hasStatusEffect('stun'), true, 'Sweeping Hilt applies stun on proc');
    }

    // Fleche: 1.6x base 10 = 16 damage + dash
    {
      const tester = createTester('fleche');
      const enemy = createDummyEnemy(scene, 10, 13, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'fleche', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 84, 'Fleche deals exactly 16 damage');
    }

    // Blade Dance: 4 hits, 3.2x base 10 = 32 damage
    {
      const tester = createTester('blade_dance');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'blade_dance', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 68, 'Blade Dance deals exactly 32 damage across 4 hits');
    }

    // Shield Bash: 1.2x base 10 = 12 damage + 2s Stun
    {
      const tester = createTester('shield_bash');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'shield_bash', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 88, 'Shield Bash deals exactly 12 damage');
      assert.strictEqual(enemy.hasStatusEffect('stun'), true, 'Shield Bash applies stun');
    }

    // Primed Shot: 1.4x base 10 = 14 damage
    {
      const tester = createTester('primed_shot');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'primed_shot', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 86, 'Primed Shot deals exactly 14 damage');
    }

    // Rapid Crank: 1.5x base 10 = 15 damage
    {
      const tester = createTester('rapid_crank');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'rapid_crank', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 85, 'Rapid Crank deals exactly 15 damage');
    }

    // Pinning Bolt: 1.8x base 10 = 18 damage + Slow
    {
      const tester = createTester('pinning_bolt');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'pinning_bolt', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Pinning Bolt deals exactly 18 damage');
      assert.strictEqual(enemy.hasStatusEffect('slow'), true, 'Pinning Bolt applies slow');
    }

    // Kinetic Overdraw: 2.6x base 10 = 26 damage (unchanged flat multiplier per D4)
    {
      const tester = createTester('kinetic_overdraw');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'kinetic_overdraw', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 74, 'Kinetic Overdraw deals exactly 26 damage');
    }

    // Trap Snare: 1.2x base 10 = 12 damage + Slow
    {
      const tester = createTester('trap_snare');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'trap_snare', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 88, 'Trap Snare deals exactly 12 damage');
      assert.strictEqual(enemy.hasStatusEffect('slow'), true, 'Trap Snare applies slow');
    }

    // Mark Target: Expose status
    {
      const tester = createTester('mark_target');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'mark_target', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 100, 'Mark Target deals 0 damage');
      assert.strictEqual(enemy.hasStatusEffect('expose'), true, 'Mark Target applies expose');
    }

    // Skirmish Step: Evasion buff
    {
      const tester = createTester('skirmish_step');
      combat.party = [tester];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'skirmish_step', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.hasStatusEffect('skirmish_step'), true, 'Skirmish Step applies self evasion buff');
    }

    // Taunt: Taunted status
    {
      const tester = createTester('taunt');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'taunt', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hasStatusEffect('taunted'), true, 'Taunt applies taunted to enemies');
    }

    // Smite: 1.8x base 10 = 18 spell damage (guaranteed hit)
    {
      const tester = createTester('smite');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'smite', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 82, 'Smite deals exactly 18 spell damage');
    }

    // First Aid: heals ally 20 HP
    {
      const tester = createTester('first_aid');
      const ally = createTester('first_aid');
      ally.hp = 50;
      ally.maxHp = 100;
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'first_aid', ally, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(ally.hp, 70, 'First Aid restores 20 HP');
    }

    // Heal: heals ally 35 HP
    {
      const tester = createTester('heal');
      const ally = createTester('heal');
      ally.hp = 50;
      ally.maxHp = 100;
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'heal', ally, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(ally.hp, 85, 'Heal restores 35 HP');
    }

    // Regenerate: applies HoT
    {
      const tester = createTester('regenerate');
      const ally = createTester('regenerate');
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'regenerate', ally, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(ally.hasStatusEffect('regenerate'), true, 'Regenerate applies HoT status');
    }

    // Guardian Ward: applies 35 shield
    {
      const tester = createTester('guardian_ward');
      const ally = createTester('guardian_ward');
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'guardian_ward', ally, 1000);
      assert.strictEqual(ok, true);
      const eff = ally.activeStatusEffects.get('guardian_ward');
      assert.ok(eff, 'Guardian Ward status active');
      assert.strictEqual(eff.shieldHp ?? eff.def.shieldAmount, 35, 'Guardian Ward provides 35 shield');
    }

    // Barrier: applies 50 shield
    {
      const tester = createTester('barrier');
      const ally = createTester('barrier');
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'barrier', ally, 1000);
      assert.strictEqual(ok, true);
      const eff = ally.activeStatusEffects.get('barrier');
      assert.ok(eff, 'Barrier status active');
      assert.strictEqual(eff.shieldHp ?? eff.def.shieldAmount, 50, 'Barrier provides 50 shield');
    }

    // Cleanse: removes harmful statuses
    {
      const tester = createTester('cleanse');
      const ally = createTester('cleanse');
      ally.applyStatusEffect({ id: 'bleed', name: 'Bleed', durationMs: 5000, tickIntervalMs: 1000, damagePerTick: 3, isHarmful: true });
      assert.strictEqual(ally.hasStatusEffect('bleed'), true);
      combat.party = [tester, ally];
      combat.enemies = [];
      const ok = combat.castSkill(tester, 'cleanse', ally, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(ally.hasStatusEffect('bleed'), false, 'Cleanse removes harmful status');
    }

    // Holy Nova: party heal 30 HP and 2.0x 10 = 20 spell damage to enemies within 4 tiles
    {
      const tester = createTester('holy_nova');
      const ally = createTester('holy_nova');
      ally.hp = 50;
      ally.maxHp = 100;
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100); // 2 tiles away
      combat.party = [tester, ally];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'holy_nova', tester, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(ally.hp, 80, 'Holy Nova heals ally for 30 HP');
      assert.strictEqual(enemy.hp, 80, 'Holy Nova deals 20 spell damage to enemy in 4-tile radius');
    }

    console.log('✓ TEST 1 PASSED: All Batch A skill effects match literal expectations.\n');

    // -----------------------------------------------------------------------
    // TEST 2: Accuracy Misses (D2 rule: weapon skills roll accuracy)
    // -----------------------------------------------------------------------
    console.log('--- TEST 2: Forced Misses Deal 0 Damage and Skip On-Hit Statuses ---');
    Math.random = () => 0.95; // Forced miss (0.95 > 0.60 accuracy)

    // Shield Bash miss
    {
      const tester = createTester('shield_bash');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'shield_bash', enemy, 1000);
      assert.strictEqual(ok, true, 'Cast action succeeds');
      assert.strictEqual(enemy.hp, 100, 'Missed Shield Bash deals 0 damage');
      assert.strictEqual(enemy.hasStatusEffect('stun'), false, 'Missed Shield Bash does not stun');
    }

    // Blade Strike miss
    {
      const tester = createTester('blade_strike');
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'blade_strike', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 100, 'Missed Blade Strike deals 0 damage');
    }

    // Pinning Bolt miss
    {
      const tester = createTester('pinning_bolt');
      const enemy = createDummyEnemy(scene, 10, 12, 'Target', 100);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'pinning_bolt', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 100, 'Missed Pinning Bolt deals 0 damage');
      assert.strictEqual(enemy.hasStatusEffect('slow'), false, 'Missed Pinning Bolt does not slow');
    }

    console.log('✓ TEST 2 PASSED: Misses deal 0 damage and prevent on-hit status effects.\n');

    // -----------------------------------------------------------------------
    // TEST 3: Description verification for AoE status wording fixes
    // -----------------------------------------------------------------------
    console.log('--- TEST 3: AoE Status Description Wording Verification ---');
    const skillsData = dataLoader.getSkills();
    const firestorm = skillsData.find((s: any) => s.id === 'firestorm');
    const earthshaker = skillsData.find((s: any) => s.id === 'earthshaker');
    const whirlwind = skillsData.find((s: any) => s.id === 'whirlwind');

    assert.ok(firestorm?.description?.includes('igniting the main target'), 'firestorm description mentions main target');
    assert.ok(earthshaker?.description?.includes('stun the main target for 2s'), 'earthshaker description mentions main target');
    assert.ok(whirlwind?.description?.includes('bleed the main target for 6s'), 'whirlwind description mentions main target');

    console.log('✓ TEST 3 PASSED: AoE descriptions correctly specify main target for status effects.\n');

    console.log('========================================================================');
    console.log('🎉 ALL BATCH A MIGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    Math.random = originalRandom;
  }
}

await runBatchATests();
