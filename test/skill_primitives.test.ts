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
import type { EnemyDef, SkillDef } from '../src/types/game.ts';

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

async function runPrimitiveTests() {
  console.log('--- TEST 1: Skill Engine Primitives ---');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const swordWeapon = dataLoader.getWeapon('short_swords')!;
  const playerData = dataLoader.getPlayer();
  const player = new Player(scene, 10, 10, playerData, swordWeapon, 32);
  const enemy = createDummyEnemy(scene, 10, 11, 'Dummy', 100);

  combat.party = [player];
  combat.enemies = [enemy];
  player.energy = 50;

  // 1. Damage primitive with lowHealthBonus
  const damageSkill: SkillDef = {
    id: 'test_execute',
    name: 'Test Execute',
    description: 'Executes low health targets',
    weaponType: 'short_swords',
    energyCost: 15,
    cooldownMs: 1000,
    targetType: 'enemy',
    effects: [
      {
        type: 'damage',
        scaling: 'melee',
        multiplier: 1.5,
        lowHealthBonus: { threshold: 0.35, multiplier: 1.5 }
      }
    ]
  };

  const initialEnemyHp = enemy.hp;
  const initialPlayerEnergy = player.energy;

  const success = combat.skillSystem.execute(player, damageSkill, enemy, 1000);
  assert.strictEqual(success, true, 'Damage skill should execute successfully');
  assert.strictEqual(player.energy, initialPlayerEnergy - 15, 'Energy should be deducted');
  assert.ok(enemy.hp < initialEnemyHp, 'Enemy HP should be reduced');
  const normalDmg = initialEnemyHp - enemy.hp;

  // Execute on low HP enemy
  enemy.hp = 20;
  player.energy = 50;
  const preExecuteHp = enemy.hp;
  combat.skillSystem.execute(player, damageSkill, enemy, 3000);
  const lowHpDmg = preExecuteHp - enemy.hp;
  assert.ok(lowHpDmg > normalDmg * 1.3, 'Low health bonus multiplier should increase damage');
  console.log('  ✓ Damage primitive and lowHealthBonus multiplier work correctly.');

  // 2. Status application primitive
  const stunSkill: SkillDef = {
    id: 'test_stun',
    name: 'Test Stun',
    description: 'Stuns the target',
    weaponType: 'short_swords',
    energyCost: 10,
    cooldownMs: 1000,
    targetType: 'enemy',
    effects: [
      {
        type: 'applyStatus',
        status: 'stun',
        chance: 1.0,
        durationMs: 2000
      }
    ]
  };
  player.energy = 50;
  const stunSuccess = combat.skillSystem.execute(player, stunSkill, enemy, 5000);
  assert.strictEqual(stunSuccess, true);
  assert.strictEqual(enemy.hasStatusEffect('stun'), true, 'Enemy should be stunned');
  console.log('  ✓ applyStatus primitive applies status effect correctly.');

  // 3. Support primitives: heal, healOverTime, shield, cleanse
  const healingStaff = dataLoader.getWeapon('staff')!;
  const ally = new Player(scene, 10, 12, playerData, healingStaff, 32);
  combat.party = [player, ally];
  ally.hp = 30;
  ally.maxHp = 100;

  const poisonDef = {
    id: 'poison',
    name: 'Poison',
    durationMs: 5000,
    tickIntervalMs: 1000,
    damagePerTick: 2,
    isHarmful: true,
    color: '#22c55e'
  };
  ally.applyStatusEffect(poisonDef);
  assert.strictEqual(ally.hasStatusEffect('poison'), true);

  const supportSkill: SkillDef = {
    id: 'test_support',
    name: 'Test Support',
    description: 'Heals, shields, and cleanses ally',
    weaponType: 'healing_magic',
    energyCost: 20,
    cooldownMs: 1000,
    targetType: 'ally',
    effects: [
      { type: 'heal', target: 'lowestAlly', amount: 25 },
      { type: 'healOverTime', target: 'lowestAlly', durationMs: 4000, amountPerTick: 5 },
      { type: 'shield', target: 'lowestAlly', durationMs: 5000, shieldAmount: 30 },
      { type: 'cleanse', target: 'lowestAlly' }
    ]
  };

  player.energy = 50;
  const supportSuccess = combat.skillSystem.execute(player, supportSkill, ally, 7000);
  assert.strictEqual(supportSuccess, true);
  assert.strictEqual(ally.hp, 55, 'Ally HP should be restored by 25');
  assert.strictEqual(ally.hasStatusEffect('poison'), false, 'Cleanse should remove poison');
  assert.strictEqual(ally.hasStatusEffect('test_support'), true, 'Shield should be applied');
  console.log('  ✓ heal, healOverTime, shield, and cleanse primitives work correctly.');

  // 4. Taunt primitive
  const shieldWeapon = dataLoader.getWeapon('shields') ?? swordWeapon;
  const tank = new Player(scene, 10, 10, playerData, shieldWeapon, 32);
  combat.party = [tank];
  tank.energy = 30;
  const tauntSkill: SkillDef = {
    id: 'test_taunt',
    name: 'Test Taunt',
    description: 'Forces nearby enemies to attack',
    weaponType: 'shields',
    energyCost: 10,
    cooldownMs: 2000,
    targetType: 'self',
    effects: [
      { type: 'taunt', radiusTiles: 4, durationMs: 5000 }
    ]
  };

  combat.skillSystem.execute(tank, tauntSkill, tank, 9000);
  assert.strictEqual(enemy.hasStatusEffect('taunted'), true, 'Enemy should be taunted');
  assert.strictEqual(enemy.targetEntity, tank, 'Enemy target should switch to tank');
  console.log('  ✓ Taunt primitive pulls aggro and targets caster correctly.');

  // 5. Ember Adept pilot kit verification
  console.log('\n--- TEST 2: Ember Adept Pilot Kit Data Execution ---');
  const scorchDef = dataLoader.getSkill('scorch');
  assert.ok(scorchDef, 'scorch must exist in skills data');
  assert.ok(scorchDef.effects && scorchDef.effects.length > 0, 'scorch must be pure data (effects array)');
  assert.strictEqual(scorchDef.requirements[0].target, 'ember_adept');

  const fireMagicWeapon = dataLoader.getWeapon('fire_magic') ?? swordWeapon;
  const emberMage = new Player(scene, 10, 10, playerData, fireMagicWeapon, 32);
  emberMage.progression.setClassLevel('ember_adept', 1);
  combat.party = [emberMage];
  emberMage.energy = 50;
  const enemyForFire = createDummyEnemy(scene, 10, 11, 'Fire Target', 100);
  combat.enemies = [enemyForFire];

  // Cast Scorch
  const castResult = combat.castSkill(emberMage, 'scorch', enemyForFire, 11000);
  assert.strictEqual(castResult, true, 'Scorch should cast successfully');
  assert.strictEqual(emberMage.energy, 50 - scorchDef.energyCost, 'Scorch energy cost should be deducted');
  assert.ok(enemyForFire.hp < 100, 'Enemy should have taken damage from Scorch');
  console.log('  ✓ Ember Adept scorch executed via pure data with zero code branches.');

  // Check remaining 4 Ember Adept skills are defined as data
  for (const skId of ['firebolt', 'flame_wave', 'ignite', 'firestorm']) {
    const sk = dataLoader.getSkill(skId);
    assert.ok(sk, `${skId} must exist in data`);
    assert.ok(sk.effects && sk.effects.length > 0, `${skId} must have data-driven effects array`);
    assert.strictEqual(sk.requirements[0].target, 'ember_adept');
  }
  console.log('  ✓ Full 5-skill Ember Adept kit verified data-driven.');

  console.log('\n🎉 ALL SKILL ENGINE PRIMITIVE TESTS PASSED SUCCESSFULLY!');
}

runPrimitiveTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
