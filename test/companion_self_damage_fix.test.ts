import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Setup minimal browser globals for Phaser import under Node
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') return {};
  return originalRequire.apply(this, arguments);
};

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
    createElement: () => ({ getContext: () => dummyCtx, style: {} }),
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

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return { json: async () => JSON.parse(content) };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

function createMockScene(gridWidth: number = 40, gridHeight: number = 40): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = new Array(gridWidth).fill(0);
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
    time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: { add: (config: any) => { if (config.onComplete) config.onComplete(); return { stop: () => {}, remove: () => {} }; } },
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

async function runTests() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const playerData = dataLoader.getPlayer();
  const katanaDef = dataLoader.getWeapon('katana')!;
  const arcaneStaffDef = dataLoader.getWeapon('arcane_staff')!;
  const healingStaffDef = dataLoader.getWeapon('healing_staff')!;

  console.log('=== TEST: COMPANION SELF-DAMAGE GUARD (AI CASTING) ===\n');

  let test1Passed = false;
  let test2Passed = false;
  let test3Passed = false;
  let test4Passed = false;

  // TEST 1: Ronin flowing_step cast through AI
  console.log('--- TEST 1: Ronin Flowing Step AI Cast ---');
  try {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);

    const ronin = new Player(scene, 10, 10, playerData, katanaDef, 32);
    ronin.entityName = 'Ronin Companion';
    ronin.progression.setClassLevel('ronin', 40);
    ronin.progression.setClassLevel('swordsman', 40);
    ronin.progression.activeClassId = 'ronin';
    const katStat = ronin.progression.getProficiencyStat('katana');
    if (katStat) katStat.level = 50;

    ronin.equippedSkillIds = ['flowing_step'];
    ronin.knownSkillIds = ['flowing_step'];
    ronin.autocastMap.set('flowing_step', true);
    ronin.hp = 100;
    ronin.maxHp = 100;
    ronin.energy = 100;

    const enemyDef: any = {
      id: 'dummy_target',
      name: 'Target Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 0,
      aggroRadius: 10,
      attackIntervalMs: 1500,
      moveSpeed: 90,
      harvest: []
    };
    const enemy = new Enemy(scene, 11, 10, enemyDef, scene.pathfinder);
    enemy.hp = 1000;
    enemy.maxHp = 1000;
    enemy.isAggroed = true;

    combat.party = [ronin];
    combat.enemies = [enemy];
    ronin.targetEntity = enemy;

    const initialRoninHp = ronin.hp;
    const initialEnemyHp = enemy.hp;

    const origRandom = Math.random;
    Math.random = () => 0.1; // guarantee hit
    const cast = combat.checkAndAutocastSelfBuffs(ronin, 1000);
    Math.random = origRandom;
    assert.strictEqual(cast, true, 'AI must choose and cast flowing_step');

    console.log(`  Ronin HP: ${initialRoninHp} -> ${ronin.hp}`);
    console.log(`  Enemy HP: ${initialEnemyHp} -> ${enemy.hp}`);

    assert.strictEqual(ronin.hp, initialRoninHp, 'Ronin HP must be unchanged (no self-damage)');
    assert.ok(enemy.hp < initialEnemyHp, 'Enemy must take damage from Flowing Step');
    console.log('✓ PASS: Ronin flowing_step did not damage self and damaged enemy.\n');
    test1Passed = true;
  } catch (err: any) {
    console.log(`❌ TEST 1 FAILED: ${err.message}\n`);
  }

  // TEST 2: Arcane Nova cast through AI
  console.log('--- TEST 2: Arcane Nova AI Cast ---');
  try {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);

    const mage = new Player(scene, 10, 10, playerData, arcaneStaffDef, 32);
    mage.entityName = 'Arcane Companion';
    mage.progression.setClassLevel('arcane_initiate', 40);
    mage.progression.activeClassId = 'arcane_initiate';

    mage.equippedSkillIds = ['arcane_nova'];
    mage.knownSkillIds = ['arcane_nova'];
    mage.autocastMap.set('arcane_nova', true);
    mage.hp = 100;
    mage.maxHp = 100;
    mage.energy = 100;

    const enemyDef: any = {
      id: 'dummy_target',
      name: 'Target Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 0,
      aggroRadius: 10,
      attackIntervalMs: 1500,
      moveSpeed: 90,
      harvest: []
    };
    const enemy1 = new Enemy(scene, 11, 10, enemyDef, scene.pathfinder);
    enemy1.hp = 1000;
    enemy1.maxHp = 1000;
    enemy1.isAggroed = true;

    const enemy2 = new Enemy(scene, 12, 10, enemyDef, scene.pathfinder);
    enemy2.hp = 1000;
    enemy2.maxHp = 1000;
    enemy2.isAggroed = true;

    combat.party = [mage];
    combat.enemies = [enemy1, enemy2];
    mage.targetEntity = enemy1;

    const initialMageHp = mage.hp;
    const initialEnemy1Hp = enemy1.hp;
    const initialEnemy2Hp = enemy2.hp;

    const cast = combat.checkAndAutocastSelfBuffs(mage, 1000);
    assert.strictEqual(cast, true, 'AI must choose and cast arcane_nova');

    console.log(`  Mage HP: ${initialMageHp} -> ${mage.hp}`);
    console.log(`  Enemy1 HP: ${initialEnemy1Hp} -> ${enemy1.hp}`);
    console.log(`  Enemy2 HP: ${initialEnemy2Hp} -> ${enemy2.hp}`);

    assert.strictEqual(mage.hp, initialMageHp, 'Mage HP must be unchanged (no self-damage)');
    assert.ok(enemy1.hp < initialEnemy1Hp, 'Enemy1 must take damage from Arcane Nova');
    assert.ok(enemy2.hp < initialEnemy2Hp, 'Enemy2 must take damage from Arcane Nova');
    console.log('✓ PASS: Arcane Nova did not damage caster and damaged enemies in radius.\n');
    test2Passed = true;
  } catch (err: any) {
    console.log(`❌ TEST 2 FAILED: ${err.message}\n`);
  }

  // TEST 3: Holy Nova cast through AI
  console.log('--- TEST 3: Holy Nova AI Cast ---');
  try {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);

    const cleric = new Player(scene, 10, 10, playerData, healingStaffDef, 32);
    cleric.entityName = 'Combat Medic Companion';
    cleric.progression.setClassLevel('combat_medic', 40);
    cleric.progression.activeClassId = 'combat_medic';

    cleric.equippedSkillIds = ['holy_nova'];
    cleric.knownSkillIds = ['holy_nova'];
    cleric.autocastMap.set('holy_nova', true);
    cleric.hp = 100;
    cleric.maxHp = 100;
    cleric.energy = 100;

    const ally = new Player(scene, 9, 10, playerData, katanaDef, 32);
    ally.entityName = 'Damaged Ally';
    ally.maxHp = 100;
    ally.hp = 50; // < 70% to trigger holy_nova condition allyHpBelow: 0.7

    const enemyDef: any = {
      id: 'dummy_target',
      name: 'Target Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 0,
      aggroRadius: 10,
      attackIntervalMs: 1500,
      moveSpeed: 90,
      harvest: []
    };
    const enemy1 = new Enemy(scene, 11, 10, enemyDef, scene.pathfinder);
    enemy1.hp = 1000;
    enemy1.maxHp = 1000;
    enemy1.isAggroed = true;

    combat.party = [cleric, ally];
    combat.enemies = [enemy1];
    cleric.targetEntity = enemy1;

    const initialClericHp = cleric.hp;
    const initialAllyHp = ally.hp;
    const initialEnemy1Hp = enemy1.hp;

    let allyDamageTaken = 0;
    const origTakeDamage = ally.takeDamage.bind(ally);
    ally.takeDamage = (amt: number) => {
      allyDamageTaken += amt;
      return origTakeDamage(amt);
    };

    const cast = combat.checkAndAutocastAllyHeal(cleric, 1000);
    assert.strictEqual(cast, true, 'AI must choose and cast holy_nova');

    console.log(`  Cleric HP: ${initialClericHp} -> ${cleric.hp}`);
    console.log(`  Ally HP: ${initialAllyHp} -> ${ally.hp} (damage taken: ${allyDamageTaken})`);
    console.log(`  Enemy1 HP: ${initialEnemy1Hp} -> ${enemy1.hp}`);

    assert.strictEqual(cleric.hp, initialClericHp, 'Cleric HP must not be damaged');
    assert.strictEqual(allyDamageTaken, 0, 'Ally must not take damage from Holy Nova');
    assert.strictEqual(ally.hp, 80, 'Ally HP must be 50 + 30 = 80 without Holy Nova self-damage');
    assert.ok(enemy1.hp < initialEnemy1Hp, 'Enemy1 must take damage from Holy Nova');
    console.log('✓ PASS: Holy Nova healed party, did not damage party, and hit enemies in radius.\n');
    test3Passed = true;
  } catch (err: any) {
    console.log(`❌ TEST 3 FAILED: ${err.message}\n`);
  }

  // TEST 4: Targeting fallback resolves caster.targetEntity before nearest enemy
  console.log('--- TEST 4: Targeting fallback respects farther targetEntity over nearest enemy ---');
  try {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);

    const mage = new Player(scene, 10, 10, playerData, arcaneStaffDef, 32);
    mage.entityName = 'Arcane Caster';
    mage.progression.setClassLevel('arcane_initiate', 40);
    mage.progression.activeClassId = 'arcane_initiate';

    mage.equippedSkillIds = ['arcane_bolt'];
    mage.knownSkillIds = ['arcane_bolt'];
    mage.hp = 100;
    mage.maxHp = 100;
    mage.energy = 100;

    const enemyDefNear: any = {
      id: 'dummy_near',
      name: 'Near Target Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 0,
      aggroRadius: 10,
      attackIntervalMs: 1500,
      moveSpeed: 90,
      harvest: []
    };
    const enemyDefFar: any = {
      id: 'dummy_far',
      name: 'Far Target Dummy',
      tier: 'common',
      hp: 1000,
      criticalHpMax: 0,
      meleeDamage: 0,
      aggroRadius: 10,
      attackIntervalMs: 1500,
      moveSpeed: 90,
      harvest: []
    };

    // Caster at (10, 10)
    // Enemy Near at (11, 10) -> distance 1 tile
    // Enemy Far at (13, 10) -> distance 3 tiles (within arcane_bolt rangeTiles: 5)
    const enemyNear = new Enemy(scene, 11, 10, enemyDefNear, scene.pathfinder);
    enemyNear.hp = 1000;
    enemyNear.maxHp = 1000;
    enemyNear.isAggroed = true;

    const enemyFar = new Enemy(scene, 13, 10, enemyDefFar, scene.pathfinder);
    enemyFar.hp = 1000;
    enemyFar.maxHp = 1000;
    enemyFar.isAggroed = true;

    combat.party = [mage];
    combat.enemies = [enemyNear, enemyFar];

    // Caster's targetEntity is explicitly the farther enemy
    mage.targetEntity = enemyFar;

    const initialNearHp = enemyNear.hp;
    const initialFarHp = enemyFar.hp;

    // Cast arcane_bolt with NO explicit target (undefined)
    const castOk = combat.castSkill(mage, 'arcane_bolt', undefined, 1000);
    assert.strictEqual(castOk, true, 'arcane_bolt must cast successfully with no explicit target');

    console.log(`  Near Enemy HP: ${initialNearHp} -> ${enemyNear.hp}`);
    console.log(`  Far Enemy HP: ${initialFarHp} -> ${enemyFar.hp}`);

    assert.strictEqual(enemyNear.hp, initialNearHp, 'Near enemy must NOT take damage');
    assert.ok(enemyFar.hp < initialFarHp, 'Farther enemy (caster.targetEntity) MUST take damage');
    console.log('✓ PASS: Caster whose targetEntity is the farther enemy hit the farther one when cast with no explicit target.\n');
    test4Passed = true;
  } catch (err: any) {
    console.log(`❌ TEST 4 FAILED: ${err.message}\n`);
  }

  assert.strictEqual(test1Passed && test2Passed && test3Passed && test4Passed, true, 'All 4 tests must pass');

  console.log('🎉 ALL 4 COMPANION SELF-DAMAGE AND TARGETING TESTS PASSED!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:');
  console.error(err);
  process.exit(1);
});
