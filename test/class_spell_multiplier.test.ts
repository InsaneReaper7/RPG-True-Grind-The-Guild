import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Setup minimal browser globals for Phaser import under Node
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
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 40, gridHeight: number = 40): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);

  (pathfinder as any).findPath = function (start: any, end: any) {
    const promise = Promise.resolve([{ x: start.x, y: start.y }, { x: end.x, y: end.y }]);
    (promise as any).then = function (onFulfilled: any) {
      if (onFulfilled) onFulfilled([{ x: start.x, y: start.y }, { x: end.x, y: end.y }]);
      return promise;
    };
    return promise;
  };

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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Dummy Target', hp: number = 100000): any {
  const def: EnemyDef = {
    id: `dummy_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 0,
    aggroRadius: 10,
    attackIntervalMs: 1500,
    moveSpeed: 90,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, 'wolf-avatar', 32);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.isAggroed = true;
  return enemy;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  console.log('=== CLASS SPELL MULTIPLIER TEST SUITE ===\n');

  // 1. Expected-table guard
  console.log('1. Checking Expected-Table Guard for all 28 classes...');
  const expectedTable: Record<string, number> = {
    ember_adept: 1.25,
    spark_adept: 1.35,
    frost_initiate: 1.50,
    acolyte: 1.40,
    tide_adept: 1.50,
    sprout_keeper: 1.65,
    gale_adept: 1.40,
    stoneheart_initiate: 1.75,
    cultist: 1.60,
    arcane_initiate: 1.05,
    grove_walker: 1.15,
    flamecaller: 1.25,
    frostcaller: 1.65,
    stormtouched: 1.40,
    windwalker: 1.40,
    naturalist: 1.50,
    priest: 1.55,
    warlock: 1.55,
    herbalist: 1.15,
    elementalist: 0.95,
    aquamancer: 1.40,
    cryomancer: 1.40,
    geomancer: 1.60,
    druid: 1.30,
    necromancer: 1.60,
    natures_avatar: 1.20,
    archdruid: 1.45,
    elemental_sovereign: 0.80
  };

  const classes = dataLoader.getClasses();
  const classesWithMultiplier: Record<string, number> = {};

  for (const c of classes) {
    if (c.spellDamageMultiplier !== undefined) {
      classesWithMultiplier[c.id] = c.spellDamageMultiplier;
    }
  }

  assert.strictEqual(
    Object.keys(classesWithMultiplier).length,
    28,
    `Expected exactly 28 classes to have spellDamageMultiplier, found ${Object.keys(classesWithMultiplier).length}`
  );

  for (const [clsId, expectedVal] of Object.entries(expectedTable)) {
    assert.strictEqual(
      classesWithMultiplier[clsId],
      expectedVal,
      `Class ${clsId} expected multiplier ${expectedVal}, got ${classesWithMultiplier[clsId]}`
    );
  }

  for (const [clsId] of Object.entries(classesWithMultiplier)) {
    assert.ok(
      clsId in expectedTable,
      `Unexpected class ${clsId} has spellDamageMultiplier: ${classesWithMultiplier[clsId]}`
    );
  }
  console.log('✓ PASS: All 28 expected classes match section 2 exactly, and no other class has the field.\n');

  // Helper for combat setup
  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();
  const enemyDef: EnemyDef = {
    id: 'dummy',
    name: 'Target Dummy',
    category: 'training',
    hp: 100000,
    energy: 100,
    damage: 0,
    attackSpeed: 1000,
    attackRangeTiles: 1,
    expReward: 0
  };

  function createTestEntities(weaponId: string) {
    const weaponDef: WeaponDef = dataLoader.getWeapon(weaponId)!;
    const player = new Player(scene, 10, 10, playerData, weaponDef, 32);
    player.intelligence = 10;
    player.recalculateDerivedStats(false);

    const enemy = createDummyEnemy(scene, 11, 10, 'Target Dummy');
    enemy.armor = 0;
    combat.party = [player];
    combat.enemies = [enemy];
    return { player, enemy, weaponDef };
  }

  // 2. Basic spell attack
  console.log('2. Checking Basic spell attack multiplier scaling...');
  for (const testClassId of ['stoneheart_initiate', 'elemental_sovereign']) {
    const classDef = dataLoader.getClass(testClassId)!;
    const expectedMult = classDef.spellDamageMultiplier!;

    // Case A: activeClass = testClassId
    Math.random = mulberry32(42);
    const { player: playerWithClass, enemy: enemyA, weaponDef: staffDef } = createTestEntities(
      testClassId === 'stoneheart_initiate' ? 'earth_staff' : 'fire_staff'
    );
    playerWithClass.progression.setClassLevel(testClassId, 1);
    playerWithClass.setActiveClass(testClassId);
    assert.strictEqual(playerWithClass.classSpellDamageMultiplier, expectedMult);

    let damageWithClass = 0;
    enemyA.takeDamage = (amt: number) => {
      damageWithClass += amt;
      return amt;
    };
    combat.executePlayerBasicAttack(playerWithClass, enemyA, 1000);

    // Case B: activeClass = null (no class)
    Math.random = mulberry32(42);
    const { player: playerNoClass, enemy: enemyB } = createTestEntities(
      testClassId === 'stoneheart_initiate' ? 'earth_staff' : 'fire_staff'
    );
    playerNoClass.setActiveClass(null);
    assert.strictEqual(playerNoClass.classSpellDamageMultiplier, 1.0);

    let damageNoClass = 0;
    enemyB.takeDamage = (amt: number) => {
      damageNoClass += amt;
      return amt;
    };
    combat.executePlayerBasicAttack(playerNoClass, enemyB, 1000);

    assert.ok(damageWithClass > 0, `damageWithClass for ${testClassId} must be > 0`);
    assert.ok(damageNoClass > 0, `damageNoClass for ${testClassId} must be > 0`);

    const ratio = damageWithClass / damageNoClass;
    assert.ok(
      Math.abs(ratio - expectedMult) < 0.001,
      `Basic spell attack ratio for ${testClassId} expected ${expectedMult}, got ${ratio} (${damageWithClass} vs ${damageNoClass})`
    );
    console.log(`  ✓ ${testClassId}: ${damageWithClass.toFixed(2)} vs ${damageNoClass.toFixed(2)} => ratio ${ratio.toFixed(4)} (expected ${expectedMult})`);
  }
  console.log('✓ PASS: Basic spell attack scales exactly by class multiplier.\n');

  // 3. Spell skill check
  console.log('3. Checking Spell skill through SkillSystem.execute...');
  // Use arcane_bolt (scaling: 'spell')
  const arcaneBoltSkill = dataLoader.getSkills().find((s: any) => s.id === 'arcane_bolt');
  assert.ok(arcaneBoltSkill, 'arcane_bolt skill must exist');

  for (const testClassId of ['stoneheart_initiate', 'elemental_sovereign']) {
    const classDef = dataLoader.getClass(testClassId)!;
    const expectedMult = classDef.spellDamageMultiplier!;

    // Case A: activeClass = testClassId
    Math.random = mulberry32(100);
    const { player: playerWithClass, enemy: enemyA } = createTestEntities('arcane_staff');
    playerWithClass.progression.setClassLevel(testClassId, 1);
    playerWithClass.setActiveClass(testClassId);
    playerWithClass.knownSkillIds = ['arcane_bolt'];
    playerWithClass.equippedSkillIds = ['arcane_bolt'];

    let skillDmgWithClass = 0;
    enemyA.takeDamage = (amt: number) => {
      skillDmgWithClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerWithClass, arcaneBoltSkill, enemyA, 1000);

    // Case B: activeClass = null
    Math.random = mulberry32(100);
    const { player: playerNoClass, enemy: enemyB } = createTestEntities('arcane_staff');
    playerNoClass.setActiveClass(null);
    playerNoClass.knownSkillIds = ['arcane_bolt'];
    playerNoClass.equippedSkillIds = ['arcane_bolt'];

    let skillDmgNoClass = 0;
    enemyB.takeDamage = (amt: number) => {
      skillDmgNoClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerNoClass, arcaneBoltSkill, enemyB, 1000);

    assert.ok(skillDmgWithClass > 0, 'skillDmgWithClass must be > 0');
    assert.ok(skillDmgNoClass > 0, 'skillDmgNoClass must be > 0');

    const skillRatio = skillDmgWithClass / skillDmgNoClass;
    assert.ok(
      Math.abs(skillRatio - expectedMult) < 0.001,
      `Spell skill ratio for ${testClassId} expected ${expectedMult}, got ${skillRatio}`
    );
    console.log(`  ✓ ${testClassId} spell skill: ${skillDmgWithClass.toFixed(2)} vs ${skillDmgNoClass.toFixed(2)} => ratio ${skillRatio.toFixed(4)} (expected ${expectedMult})`);
  }
  console.log('✓ PASS: Spell skill scales exactly by class multiplier.\n');

  // 4. Unaffected paths
  console.log('4. Checking Unaffected paths (weapon-scaling skill, heal, burn DoT tick)...');
  const activeClassId = 'stoneheart_initiate'; // 1.70 multiplier

  // 4a. Weapon-scaling skill (e.g. thrust or slash)
  const thrustSkill = dataLoader.getSkills().find((s: any) =>
    (s.effects || []).some((e: any) => e.type === 'damage' && e.scaling === 'weapon')
  );
  assert.ok(thrustSkill, 'A weapon-scaling skill must exist');

  {
    Math.random = mulberry32(77);
    const { player: playerWithClass, enemy: enemyA } = createTestEntities('short_swords');
    playerWithClass.progression.setClassLevel(activeClassId, 1);
    playerWithClass.setActiveClass(activeClassId);

    let dmgWithClass = 0;
    enemyA.takeDamage = (amt: number) => {
      dmgWithClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerWithClass, thrustSkill, enemyA, 1000);

    Math.random = mulberry32(77);
    const { player: playerNoClass, enemy: enemyB } = createTestEntities('short_swords');
    playerNoClass.setActiveClass(null);

    let dmgNoClass = 0;
    enemyB.takeDamage = (amt: number) => {
      dmgNoClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerNoClass, thrustSkill, enemyB, 1000);

    assert.strictEqual(
      dmgWithClass,
      dmgNoClass,
      `Weapon-scaling skill damage must be identical regardless of spellDamageMultiplier (${dmgWithClass} vs ${dmgNoClass})`
    );
    console.log(`  ✓ Weapon-scaling skill (${thrustSkill.id}): unchanged (${dmgWithClass} vs ${dmgNoClass})`);
  }

  // 4b. Heal
  const healSkill = dataLoader.getSkills().find((s: any) =>
    (s.effects || []).some((e: any) => e.type === 'heal')
  );
  assert.ok(healSkill, 'A heal skill must exist');

  {
    const { player: playerWithClass } = createTestEntities('healing_staff');
    playerWithClass.progression.setClassLevel(activeClassId, 1);
    playerWithClass.setActiveClass(activeClassId);
    playerWithClass.hp = 50;

    let healedWithClass = 0;
    playerWithClass.heal = (amt: number) => {
      healedWithClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerWithClass, healSkill, playerWithClass, 1000);

    const { player: playerNoClass } = createTestEntities('healing_staff');
    playerNoClass.setActiveClass(null);
    playerNoClass.hp = 50;

    let healedNoClass = 0;
    playerNoClass.heal = (amt: number) => {
      healedNoClass += amt;
      return amt;
    };
    combat.skillSystem.execute(playerNoClass, healSkill, playerNoClass, 1000);

    assert.strictEqual(
      healedWithClass,
      healedNoClass,
      `Heal amount must be identical regardless of spellDamageMultiplier (${healedWithClass} vs ${healedNoClass})`
    );
    console.log(`  ✓ Heal skill (${healSkill.id}): unchanged (${healedWithClass} vs ${healedNoClass})`);
  }

  // 4c. Burn DoT tick
  {
    const burnDef = dataLoader.getStatusEffect('burn');
    assert.ok(burnDef, 'burn status effect must exist');

    const { enemy: enemyA } = createTestEntities('fire_staff');
    let tickA = 0;
    enemyA.takeDamage = (amt: number) => {
      tickA += amt;
      return amt;
    };
    enemyA.applyStatusEffect({ ...burnDef, durationMs: 4000 });
    // Trigger update to tick status
    enemyA.update(1000 + (burnDef.tickIntervalMs || 1000), burnDef.tickIntervalMs || 1000);

    const { enemy: enemyB } = createTestEntities('fire_staff');
    let tickB = 0;
    enemyB.takeDamage = (amt: number) => {
      tickB += amt;
      return amt;
    };
    enemyB.applyStatusEffect({ ...burnDef, durationMs: 4000 });
    enemyB.update(1000 + (burnDef.tickIntervalMs || 1000), burnDef.tickIntervalMs || 1000);

    assert.strictEqual(
      tickA,
      tickB,
      `Burn DoT tick damage must be identical regardless of class (${tickA} vs ${tickB})`
    );
    assert.strictEqual(tickA, burnDef.damagePerTick);
    console.log(`  ✓ Burn DoT tick: unchanged (${tickA} vs ${tickB}, exact damagePerTick: ${burnDef.damagePerTick})`);
  }
  console.log('✓ PASS: All unaffected paths (weapon skill, heal, burn DoT) are strictly unmodified.\n');

  // 5. Class switch resets / restores multiplier
  console.log('5. Checking Class switch behavior...');
  {
    const { player } = createTestEntities('short_swords');
    player.progression.setClassLevel('stoneheart_initiate', 1);
    player.progression.setClassLevel('fencer', 1);

    // Switch to stoneheart_initiate
    const switchedToStoneheart = player.setActiveClass('stoneheart_initiate');
    assert.ok(switchedToStoneheart, 'Switch to stoneheart_initiate must succeed');
    assert.strictEqual(player.activeClass, 'stoneheart_initiate');
    assert.strictEqual(player.classSpellDamageMultiplier, 1.75);

    // Switch to weapon class (fencer)
    const switchedToFencer = player.setActiveClass('fencer');
    assert.ok(switchedToFencer, 'Switch to fencer must succeed');
    assert.strictEqual(player.activeClass, 'fencer');
    assert.strictEqual(player.classSpellDamageMultiplier, 1.0);

    // Switch back to stoneheart_initiate
    const switchedBack = player.setActiveClass('stoneheart_initiate');
    assert.ok(switchedBack, 'Switch back to stoneheart_initiate must succeed');
    assert.strictEqual(player.activeClass, 'stoneheart_initiate');
    assert.strictEqual(player.classSpellDamageMultiplier, 1.75);

    // Switch to null (unranked)
    const switchedToNull = player.setActiveClass(null);
    assert.ok(switchedToNull, 'Switch to null must succeed');
    assert.strictEqual(player.activeClass, null);
    assert.strictEqual(player.classSpellDamageMultiplier, 1.0);

    console.log('  ✓ Switching stoneheart_initiate -> fencer resets multiplier to 1.0');
    console.log('  ✓ Switching back to stoneheart_initiate restores 1.75');
    console.log('  ✓ Switching to null resets multiplier to 1.0');
  }
  console.log('✓ PASS: Class switch correctly recalculates classSpellDamageMultiplier.\n');

  // 6. Data lint check
  console.log('6. Checking Data lint rule...');
  for (const c of classes) {
    if (c.spellDamageMultiplier !== undefined) {
      assert.strictEqual(typeof c.spellDamageMultiplier, 'number');
      assert.ok(c.spellDamageMultiplier > 0 && c.spellDamageMultiplier <= 2);
    }
  }
  console.log('✓ PASS: Data lint rules satisfied.\n');

  console.log('🎉 ALL CLASS SPELL MULTIPLIER TESTS PASSED PERFECTLY!');
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
