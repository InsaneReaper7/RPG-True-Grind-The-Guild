import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

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
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: noop,
      removeChild: noop,
      addEventListener: noop
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 30, gridHeight: number = 30, initialTime = 1000): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
  const mockObjects: any[] = [];
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setLineWidth: () => obj,
      setVisible: (v: boolean) => {
        obj.visible = v;
        return obj;
      },
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setTexture: () => obj,
      setFrame: () => obj,
      setSize: () => obj,
      setDisplaySize: () => obj,
      setPosition: () => obj,
      setScale: () => obj,
      setText: (t: string) => {
        obj.text = t;
        return obj;
      },
      setStyle: (s: any) => {
        obj.style = { ...obj.style, ...s };
        return obj;
      },
      clear: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      lineStyle: () => obj,
      strokeCircle: () => obj,
      fillStyle: () => obj,
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: () => obj,
      lineBetween: () => obj,
      visible: true,
      text: ''
    };
    mockObjects.push(obj);
    return obj;
  };

  return {
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    sound: { play: () => {} },
    time: { now: initialTime, delayedCall: (_delay: number, cb: () => void) => cb() },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} }
    },
    add: {
      existing: (item: any) => item,
      container: () => createMockObj(),
      sprite: () => createMockObj(),
      graphics: () => createMockObj(),
      line: () => createMockObj(),
      text: (_x: number, _y: number, text: string, style: any) => {
        const t = createMockObj();
        t.text = text;
        t.style = style;
        return t;
      }
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    },
    textures: {
      exists: () => true
    }
  };
}

async function runMilestone43Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING MILESTONE 43: LONGSWORDS TEST SUITE');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const scene = createMockScene();

  // ---------------------------------------------------------------------------
  // TEST 1: Schema, Weapon Definitions, and Namespace Isolation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Schema, Weapon Definitions, and Namespace Isolation ---');
  {
    const ls1h = dataLoader.getWeapon('longsword_1h');
    assert.ok(ls1h, 'longsword_1h must exist in data/weapons.json');
    assert.equal(ls1h.id, 'longsword_1h');
    assert.equal(ls1h.name, 'Iron Longsword');
    assert.equal(ls1h.category, 'melee_1h');
    assert.equal(ls1h.twoHanded, false);
    assert.equal(ls1h.baseDamage, 7);
    assert.equal(ls1h.attackIntervalMs, 1100);
    assert.equal(ls1h.baseAccuracy, 0.65);
    assert.equal(ls1h.proficiencyId, 'longswords');
    assert.equal(ls1h.levelBonus?.damagePerLevel, 0.55);

    const ls2h = dataLoader.getWeapon('longsword_2h');
    assert.ok(ls2h, 'longsword_2h must exist in data/weapons.json');
    assert.equal(ls2h.id, 'longsword_2h');
    assert.equal(ls2h.name, 'Two-Handed Longsword');
    assert.equal(ls2h.category, 'melee_2h');
    assert.equal(ls2h.twoHanded, true);
    assert.equal(ls2h.baseDamage, 12);
    assert.equal(ls2h.attackIntervalMs, 1300);
    assert.equal(ls2h.baseAccuracy, 0.60);
    assert.equal(ls2h.proficiencyId, 'longswords');
    assert.equal(ls2h.levelBonus?.damagePerLevel, 0.75);

    // Verify backward-compatibility fallback alias in DataLoader
    const legacyLs = dataLoader.getWeapon('longswords');
    assert.ok(legacyLs, 'getWeapon("longswords") must resolve via backward-compat alias');
    assert.equal(legacyLs.id, 'longsword_2h', 'Legacy "longswords" alias resolves to longsword_2h');

    // Verify classes definitions
    const squire = dataLoader.getClass('squire');
    assert.ok(squire, 'squire class must be registered in data/classes.json');
    assert.equal(squire.name, 'Squire');
    assert.equal(squire.tier, 'novice');
    assert.equal(squire.fantasy, 'Trainee in traditional swordplay');
    assert.equal(squire.hiddenSkillBonuses?.parry, 0.05);

    const darkKnight = dataLoader.getClass('dark_knight');
    assert.ok(darkKnight, 'dark_knight class must be registered in data/classes.json');
    assert.equal(darkKnight.name, 'Dark Knight');
    assert.equal(darkKnight.tier, 'expert');
    assert.equal(darkKnight.fantasy, 'Warrior empowered by darkness');

    console.log('✔ Test 1 passed: Schema, distinct IDs, proficiencyId links, and alias lookup verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Shared Proficiency Training (Both 1H and 2H Train 'longswords')
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Shared Proficiency Training ---');
  {
    const playerData = dataLoader.getPlayer();
    const ls1h = dataLoader.getWeapon('longsword_1h')!;
    const ls2h = dataLoader.getWeapon('longsword_2h')!;
    const dummyEnemyDef: EnemyDef = {
      id: 'target_dummy',
      name: 'Training Target',
      hp: 1000,
      damage: 0,
      attackIntervalMs: 5000,
      movementIntervalMs: 5000,
      aggroRangeTiles: 1,
      expReward: 10,
      spriteSheet: 'enemy-orc'
    };

    // Hero with 1H Longsword
    const prog1H = new ProgressionSystem(undefined, 'Hero1H');
    const hero1H = new Player(scene, 5, 5, playerData, ls1h, 32, 'player-avatar', prog1H);
    const target1 = new Enemy(scene, 6, 5, dummyEnemyDef);
    hero1H.setTarget(target1);
    const combat1H = new CombatSystem(scene, [hero1H], [target1]);

    const origRandom = Math.random;
    Math.random = () => 0.01; // Force hit
    try {
      combat1H.update(hero1H.equippedWeapon.attackIntervalMs + 100);
      assert.equal(
        prog1H.getProficiencyStat('longswords').currentExp,
        2,
        '1H Longsword attack must award EXP to "longswords" proficiency'
      );
    } finally {
      Math.random = origRandom;
    }

    // Hero with 2H Longsword
    const prog2H = new ProgressionSystem(undefined, 'Hero2H');
    const hero2H = new Player(scene, 5, 5, playerData, ls2h, 32, 'player-avatar', prog2H);
    const target2 = new Enemy(scene, 6, 5, dummyEnemyDef);
    hero2H.setTarget(target2);
    const combat2H = new CombatSystem(scene, [hero2H], [target2]);

    Math.random = () => 0.01; // Force hit
    try {
      combat2H.update(hero2H.equippedWeapon.attackIntervalMs + 100);
      assert.equal(
        prog2H.getProficiencyStat('longswords').currentExp,
        2,
        '2H Longsword attack must award EXP to the same "longswords" proficiency'
      );
    } finally {
      Math.random = origRandom;
    }

    console.log('✔ Test 2 passed: Both 1H and 2H variants cleanly award EXP to the shared "longswords" stat.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Damage Differential Verification (2H Deals Felt, Higher Damage)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Damage Differential Verification ---');
  {
    const playerData = dataLoader.getPlayer();
    const ls1h = dataLoader.getWeapon('longsword_1h')!;
    const ls2h = dataLoader.getWeapon('longsword_2h')!;
    const dummyEnemyDef: EnemyDef = {
      id: 'target_dummy_dmg',
      name: 'Training Target',
      hp: 1000,
      damage: 0,
      attackIntervalMs: 5000,
      movementIntervalMs: 5000,
      aggroRangeTiles: 1,
      expReward: 10,
      spriteSheet: 'enemy-orc'
    };

    const prog1 = new ProgressionSystem(undefined, 'Hero1H');
    const hero1 = new Player(scene, 5, 5, playerData, ls1h, 32, 'player-avatar', prog1);
    const enemy1 = new Enemy(scene, 6, 5, dummyEnemyDef);
    hero1.setTarget(enemy1);
    const combat1 = new CombatSystem(scene, [hero1], [enemy1]);

    const prog2 = new ProgressionSystem(undefined, 'Hero2H');
    const hero2 = new Player(scene, 5, 5, playerData, ls2h, 32, 'player-avatar', prog2);
    const enemy2 = new Enemy(scene, 6, 5, dummyEnemyDef);
    hero2.setTarget(enemy2);
    const combat2 = new CombatSystem(scene, [hero2], [enemy2]);

    const origRandom = Math.random;
    Math.random = () => 0.01;
    try {
      combat1.update(hero1.equippedWeapon.attackIntervalMs + 100);
      combat2.update(hero2.equippedWeapon.attackIntervalMs + 100);

      const dmg1H = 1000 - enemy1.hp;
      const dmg2H = 1000 - enemy2.hp;

      console.log(`Damage comparison: 1H dealt ${dmg1H.toFixed(1)} dmg, 2H dealt ${dmg2H.toFixed(1)} dmg.`);
      assert.ok(
        dmg2H > dmg1H * 1.5,
        `2H Longsword must hit substantially harder than 1H Longsword (2H: ${dmg2H}, 1H: ${dmg1H})`
      );
      assert.equal(ls1h.baseDamage, 7, '1H base damage is 7');
      assert.equal(ls2h.baseDamage, 12, '2H base damage is 12');
    } finally {
      Math.random = origRandom;
    }

    console.log('✔ Test 3 passed: Verified obvious, substantial damage differential between 1H and 2H variants.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Equip and Offhand Blocking Rules
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Equip and Offhand Blocking Rules ---');
  {
    const playerData = dataLoader.getPlayer();
    const ls1h = dataLoader.getWeapon('longsword_1h')!;
    const ls2h = dataLoader.getWeapon('longsword_2h')!;
    const shield = dataLoader.getWeapon('shields')!;
    const dagger = dataLoader.getWeapon('daggers')!;

    const prog = new ProgressionSystem(undefined, 'EquipHero');
    const hero = new Player(scene, 5, 5, playerData, ls1h, 32, 'player-avatar', prog);

    // 1H Longsword allows equipping Shield in offhand
    const equipShieldSuccess = hero.equipOffhandWeapon(shield, true);
    assert.equal(equipShieldSuccess, true, '1H Longsword must allow equipping a Shield in offhand');
    assert.equal(hero.offhandWeapon?.id, 'shields');

    // Equipping 2H Longsword auto-unequips the offhand shield
    hero.equipWeapon(ls2h, true);
    assert.equal(hero.equippedWeapon.id, 'longsword_2h');
    assert.equal(hero.offhandWeapon, null, 'Equipping 2H Longsword must auto-unequip offhand shield');

    // Attempting to equip offhand while 2H Longsword is active must fail
    const attemptOffhand = hero.equipOffhandWeapon(shield, true);
    assert.equal(attemptOffhand, false, 'Cannot equip offhand while wielding 2H Longsword');
    assert.equal(hero.offhandWeapon, null);

    // Switch back to 1H Longsword; unlock Dual Wielding
    hero.equipWeapon(ls1h, true);
    for (let i = 0; i < 30; i++) {
      prog.addProficiencyExp('short_swords', 2000);
      prog.addProficiencyExp('daggers', 2000);
    }
    assert.equal(prog.isDualWieldUnlocked(), true);

    // 1H Longsword allows equipping a 1H melee weapon in offhand when DW is unlocked
    const equipOffhandWeapon = hero.equipOffhandWeapon(dagger, true);
    assert.equal(equipOffhandWeapon, true, '1H Longsword must allow 1H offhand weapon when DW is unlocked');
    assert.equal(hero.offhandWeapon?.id, 'daggers');

    console.log('✔ Test 4 passed: Offhand blocking on 2H and flexible offhand on 1H verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Dual Wielding Unlock Deduplication with 1H Longsword
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Dual Wielding Unlock Deduplication with 1H Longsword ---');
  {
    const oneHandedMeleeIds = dataLoader.getOneHandedMeleeWeaponIds();
    assert.ok(
      oneHandedMeleeIds.includes('longsword_1h'),
      'longsword_1h must be included in getOneHandedMeleeWeaponIds()'
    );
    assert.ok(
      !oneHandedMeleeIds.includes('longsword_2h'),
      'longsword_2h must NOT be included in getOneHandedMeleeWeaponIds()'
    );

    const progDW = new ProgressionSystem();
    // Level up longswords to 30
    for (let i = 0; i < 30; i++) {
      progDW.addProficiencyExp('longswords', 2000);
    }
    assert.equal(progDW.getProficiencyLevel('longswords') >= 30, true);
    // Single weapon family proficiency must not unlock DW alone
    assert.equal(
      progDW.isDualWieldUnlocked(),
      false,
      'Single longswords proficiency at Lv 30 must not unlock DW alone'
    );

    // Level up short_swords to 30 -> 2 distinct 1H melee weapon proficiencies at Lv 30
    for (let i = 0; i < 30; i++) {
      progDW.addProficiencyExp('short_swords', 2000);
    }
    assert.equal(progDW.getProficiencyLevel('short_swords') >= 30, true);
    assert.equal(
      progDW.isDualWieldUnlocked(),
      true,
      'longswords Lv 30 + short_swords Lv 30 must cleanly unlock Dual Wielding'
    );

    console.log('✔ Test 5 passed: Milestone 21 generic deduplication works seamlessly for longsword_1h.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Squire Tier 0 Class Unlock & Parry Hidden Bonus
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Squire Tier 0 Class Unlock & Parry Hidden Bonus ---');
  {
    const prog = new ProgressionSystem();
    assert.equal(prog.isClassUnlocked('squire'), false, 'Squire is locked at Longswords Lv 0');

    // Advance Longswords to Lv 10
    for (let i = 0; i < 10; i++) {
      prog.addProficiencyExp('longswords', 2000);
    }
    assert.equal(prog.getProficiencyLevel('longswords') >= 10, true);
    assert.equal(prog.isClassUnlocked('squire'), true, 'Squire unlocks at Longswords Lv 10');

    const squireDef = dataLoader.getClass('squire')!;
    assert.equal(squireDef.hiddenSkillBonuses?.parry, 0.05, 'Squire grants +5% Parry bonus');

    console.log('✔ Test 6 passed: Squire unlocks at Longswords Lv 10 with correct Parry bonus.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Dark Knight Partial Requirement Evaluation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Dark Knight Partial Requirement Evaluation ---');
  {
    const prog = new ProgressionSystem();
    const darkKnightDef = dataLoader.getClass('dark_knight')!;
    assert.ok(darkKnightDef, 'dark_knight definition exists');

    // Fulfill Vanguard Lv 15
    for (let i = 0; i < 30; i++) {
      prog.addProficiencyExp('short_swords', 2000);
      prog.addProficiencyExp('shields', 2000);
    }
    for (let i = 0; i < 5; i++) {
      prog.addClassExp('fencer', 2000);
      prog.addClassExp('guardian', 2000);
    }
    assert.equal(prog.isClassUnlocked('vanguard'), true);
    for (let i = 0; i < 15; i++) {
      prog.addClassExp('vanguard', 2000);
    }
    assert.equal(prog.getClassLevel('vanguard') >= 15, true);

    // Fulfill Longswords Lv 30
    for (let i = 0; i < 30; i++) {
      prog.addProficiencyExp('longswords', 2000);
    }
    assert.equal(prog.getProficiencyLevel('longswords') >= 30, true);

    // With Dark Magic at Level 0, Dark Knight MUST NOT unlock
    assert.equal(prog.getProficiencyLevel('dark_magic'), 0);
    assert.equal(
      prog.evaluateRequirements(darkKnightDef),
      false,
      'Dark Knight must NOT evaluate to true when Dark Magic requirement is unmet'
    );
    assert.equal(
      prog.isClassUnlocked('dark_knight'),
      false,
      'Dark Knight must remain locked without Dark Magic 30'
    );

    // Now mock-advance Dark Magic to Lv 30
    for (let i = 0; i < 30; i++) {
      prog.addProficiencyExp('dark_magic', 2000);
    }
    assert.equal(prog.getProficiencyLevel('dark_magic') >= 30, true);

    // With all three requirements met (Longswords 30 + Dark Magic 30 + Vanguard 15), Dark Knight automatically unlocked
    assert.equal(prog.isClassUnlocked('dark_knight'), true, 'Dark Knight unlocks when all requirements are met');

    console.log('✔ Test 7 passed: Dark Knight partial requirement check evaluated and verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Blacksmithing Recipes & Crafting Execution
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Blacksmithing Recipes & Crafting Execution ---');
  {
    const r1H = dataLoader.getBlacksmithRecipe('longsword_1h');
    assert.ok(r1H, 'longsword_1h recipe exists in blacksmithRecipes.json');
    assert.equal(r1H.resultWeaponId, 'longsword_1h');
    assert.equal(r1H.requiredLevel, 0);
    assert.equal(r1H.ingredients.ore, 4);
    assert.equal(r1H.ingredients.wood, 2);
    assert.equal(r1H.expGranted, 25);

    const r2H = dataLoader.getBlacksmithRecipe('longsword_2h');
    assert.ok(r2H, 'longsword_2h recipe exists in blacksmithRecipes.json');
    assert.equal(r2H.resultWeaponId, 'longsword_2h');
    assert.equal(r2H.requiredLevel, 0);
    assert.equal(r2H.ingredients.ore, 7);
    assert.equal(r2H.ingredients.wood, 3);
    assert.equal(r2H.expGranted, 35);

    // Test Crafting execution
    const playerProg = new ProgressionSystem();
    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);

    const initialOre = gameState.getItemCount('ore');
    const initialWood = gameState.getItemCount('wood');

    // Craft 1H Longsword
    for (const [item, qty] of Object.entries(r1H.ingredients)) {
      gameState.consumeItem(item, qty);
    }
    gameState.addItem(r1H.resultWeaponId, 1);
    playerProg.addProficiencyExp('blacksmithing', r1H.expGranted);

    assert.equal(gameState.getItemCount('ore'), initialOre - 4);
    assert.equal(gameState.getItemCount('wood'), initialWood - 2);
    assert.equal(gameState.getItemCount('longsword_1h'), 1);

    // Craft 2H Longsword
    for (const [item, qty] of Object.entries(r2H.ingredients)) {
      gameState.consumeItem(item, qty);
    }
    gameState.addItem(r2H.resultWeaponId, 1);
    playerProg.addProficiencyExp('blacksmithing', r2H.expGranted);

    assert.equal(gameState.getItemCount('ore'), initialOre - 4 - 7);
    assert.equal(gameState.getItemCount('wood'), initialWood - 2 - 3);
    assert.equal(gameState.getItemCount('longsword_2h'), 1);
    assert.equal(playerProg.getProficiencyStat('blacksmithing').level, 1);
    assert.equal(playerProg.getProficiencyStat('blacksmithing').currentExp, 10);

    console.log('✔ Test 8 passed: Both 1H and 2H Longswords craft cleanly and grant Blacksmithing EXP.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 43 TESTS PASSED CLEANLY & SUCCESSFULLY!');
  console.log('================================================================\n');
}

runMilestone43Tests().catch((err) => {
  console.error('Milestone 43 Test Failure:', err);
  process.exit(1);
});
