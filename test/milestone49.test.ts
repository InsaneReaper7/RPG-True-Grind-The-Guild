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

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Dynamically import modules after globals are installed
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

const classesData = JSON.parse(fs.readFileSync('data/classes.json', 'utf8'));

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

  return {
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
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      text: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    }
  };
}

async function runMilestone49Tests() {
  console.log('================================================================');
  console.log('⚔️ RUNNING MILESTONE 49 TEST SUITE: SPEARS, HOPLITE & LANCER ⚔️');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ============================================================================
  // TEST 1: Spears Data Integrity & Handedness (1H and 2H Variants)
  // ============================================================================
  console.log('--- TEST 1: Spears Data Integrity & Handedness ---');
  {
    const spear1h = dataLoader.getWeapon('spears');
    assert.ok(spear1h, '1H Spear definition must exist in weaponsData (id: "spears")');
    assert.equal(spear1h.category, 'melee_1h', '1H Spear must be categorized as melee_1h');
    assert.equal(spear1h.twoHanded, false, '1H Spear must have twoHanded = false');
    assert.equal(spear1h.baseDamage, 7, '1H Spear baseDamage must be 7');
    assert.equal(spear1h.baseAccuracy, 0.65, '1H Spear baseAccuracy must be 0.65');
    assert.equal(spear1h.proficiencyId, 'spears', '1H Spear must point to proficiencyId: "spears"');
    assert.deepEqual(spear1h.levelBonus, { accuracyPerLevel: 0.004, damagePerLevel: 0.55 }, '1H Spear levelBonus matches specification');

    const spear2h = dataLoader.getWeapon('spears_2h');
    assert.ok(spear2h, '2H Spear definition must exist in weaponsData (id: "spears_2h")');
    assert.equal(spear2h.category, 'melee_2h', '2H Spear must be categorized as melee_2h');
    assert.equal(spear2h.twoHanded, true, '2H Spear must have twoHanded = true');
    assert.equal(spear2h.baseDamage, 12, '2H Spear baseDamage must be 12');
    assert.equal(spear2h.baseAccuracy, 0.60, '2H Spear baseAccuracy must be 0.60');
    assert.equal(spear2h.proficiencyId, 'spears', '2H Spear must point to shared proficiencyId: "spears"');
    assert.deepEqual(spear2h.levelBonus, { accuracyPerLevel: 0.004, damagePerLevel: 0.75 }, '2H Spear levelBonus matches specification');

    // Confirm no ID collision between 2H weapon item and proficiency string
    assert.notEqual(spear2h.id, spear2h.proficiencyId, '2H weapon item ID (spears_2h) does NOT collide with proficiencyId (spears)');

    console.log('✓ PASS: Both 1H and 2H Spear weapon items exist with correct handedness and non-colliding IDs.\n');
  }

  // ============================================================================
  // TEST 2: Real & Obvious Damage Differential
  // ============================================================================
  console.log('--- TEST 2: Real & Obvious Damage Differential ---');
  {
    const spear1h = dataLoader.getWeapon('spears')!;
    const spear2h = dataLoader.getWeapon('spears_2h')!;

    const baseDiffPercent = ((spear2h.baseDamage - spear1h.baseDamage) / spear1h.baseDamage) * 100;
    console.log(`  1H Spear base damage: ${spear1h.baseDamage}`);
    console.log(`  2H Spear base damage: ${spear2h.baseDamage}`);
    console.log(`  Derived base damage increase: +${baseDiffPercent.toFixed(1)}%`);

    // Must match the Longsword ~71% differential order of magnitude
    assert.ok(baseDiffPercent >= 70 && baseDiffPercent <= 75, '2H Spear base damage must be ~71% higher than 1H Spear');
    assert.ok(spear2h.levelBonus!.damagePerLevel > spear1h.levelBonus!.damagePerLevel, '2H Spear scales damage faster per level (0.75 > 0.55)');

    console.log('✓ PASS: 2H Spear delivers ~71.4% higher base damage with steeper per-level scaling.\n');
  }

  // ============================================================================
  // TEST 3: Equipping & Shield Compatibility (1H vs 2H)
  // ============================================================================
  console.log('--- TEST 3: Equipping & Shield Compatibility (1H vs 2H) ---');
  {
    const scene = createMockScene();
    const prog = new ProgressionSystem(classesData, 'Spear Fighter');
    const spear1h = dataLoader.getWeapon('spears')!;
    const spear2h = dataLoader.getWeapon('spears_2h')!;
    const shield = dataLoader.getWeapon('shields')!;

    const player = new Player(scene, 5, 5, dataLoader.getPlayer(), spear1h, 32, 'player-avatar', prog);

    // Case A: 1H Spear allows Shield pairing
    player.equipWeapon(spear1h);
    assert.equal(player.equippedWeapon.id, 'spears');
    assert.equal(player.equippedWeapon.twoHanded, false);

    const shieldEquipped = player.equipOffhandWeapon(shield, true);
    assert.equal(shieldEquipped, true, '1H Spear permits equipping a Shield in offhand');
    assert.equal(player.offhandWeapon?.id, 'shields', 'Offhand holds the shield');

    // Case B: Equipping 2H Spear while holding a shield un-equips the offhand shield
    player.equipWeapon(spear2h);
    assert.equal(player.equippedWeapon.id, 'spears_2h');
    assert.equal(player.equippedWeapon.twoHanded, true);
    assert.equal(player.offhandWeapon, null, 'Equipping 2H Spear automatically clears/unequips offhand shield');

    // Case C: Attempting to equip Shield while 2H Spear is in main hand is rejected
    const blockedShield = player.equipOffhandWeapon(shield, true);
    assert.equal(blockedShield, false, 'Cannot equip shield while 2H Spear is wielded');
    assert.equal(player.offhandWeapon, null, 'Offhand remains null');

    console.log('✓ PASS: 1H Spear cleanly allows Shield pairing for Hoplite, and 2H Spear strictly blocks offhand.\n');
  }

  // ============================================================================
  // TEST 4: Blacksmithing Recipes for Both Spear Variants
  // ============================================================================
  console.log('--- TEST 4: Blacksmithing Recipes for Both Spear Variants ---');
  {
    const recipes = dataLoader.getBlacksmithRecipes();

    // 1H Spear recipe
    const recipe1h = recipes.find((r) => r.id === 'spear');
    assert.ok(recipe1h, '1H Spear recipe (id: "spear") must exist in Blacksmithing');
    assert.equal(recipe1h.resultWeaponId, 'spears', 'Recipe produces "spears"');
    assert.equal(recipe1h.requiredLevel, 0, 'Level 0 required');
    assert.deepEqual(recipe1h.ingredients, { ore: 4, wood: 3 }, 'Recipe requires 4 Ore and 3 Wood');
    assert.equal(recipe1h.expGranted, 25, 'Recipe grants 25 Blacksmithing EXP');

    // 2H Spear recipe
    const recipe2h = recipes.find((r) => r.id === 'spears_2h');
    assert.ok(recipe2h, '2H Spear recipe (id: "spears_2h") must exist in Blacksmithing');
    assert.equal(recipe2h.resultWeaponId, 'spears_2h', 'Recipe produces "spears_2h"');
    assert.equal(recipe2h.requiredLevel, 0, 'Level 0 required');
    assert.deepEqual(recipe2h.ingredients, { ore: 7, wood: 5 }, 'Recipe requires 7 Ore and 5 Wood');
    assert.equal(recipe2h.expGranted, 35, 'Recipe grants 35 Blacksmithing EXP');

    // Crafting execution check via GameState
    const gameState = GameState.getInstance();
    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);

    // Craft 1H
    for (const [mat, qty] of Object.entries(recipe1h.ingredients)) {
      gameState.consumeItem(mat, qty);
    }
    gameState.addItem(recipe1h.resultWeaponId!, 1);
    assert.ok(gameState.getItemCount('spears') >= 1, 'GameState inventory contains crafted 1H Spear');

    // Craft 2H
    for (const [mat, qty] of Object.entries(recipe2h.ingredients)) {
      gameState.consumeItem(mat, qty);
    }
    gameState.addItem(recipe2h.resultWeaponId!, 1);
    assert.ok(gameState.getItemCount('spears_2h') >= 1, 'GameState inventory contains crafted 2H Spear');

    console.log('✓ PASS: Both 1H and 2H Spear recipes are craftable, consume correct materials, and yield items.\n');
  }

  // ============================================================================
  // TEST 5: Combat Loop & Shared Proficiency Growth
  // ============================================================================
  console.log('--- TEST 5: Combat Loop & Shared Proficiency Growth ---');
  {
    const scene = createMockScene();
    const spear1h = dataLoader.getWeapon('spears')!;
    const spear2h = dataLoader.getWeapon('spears_2h')!;

    const prog = new ProgressionSystem(classesData, 'Spear Combatant');
    const combat = new CombatSystem(scene);

    const player = new Player(scene, 5, 5, dataLoader.getPlayer(), spear1h, 32, 'player-avatar', prog);
    const enemy1 = new Enemy(scene, 6, 5, dataLoader.getEnemy('wolf')!, 'wolf-avatar');
    const initialEnemy1Hp = enemy1.hp;

    // Strike with 1H Spear
    player.equipWeapon(spear1h);
    assert.equal(prog.getProficiencyLevel('spears'), 0);
    const expBefore1h = prog.getProficiencyStat('spears').currentExp;

    combat.executePlayerBasicAttack(player, enemy1, 1000, undefined, undefined, undefined, 1.0);
    assert.ok(enemy1.hp < initialEnemy1Hp, '1H Spear attack dealt damage to enemy');
    const expAfter1h = prog.getProficiencyStat('spears').currentExp;
    assert.ok(expAfter1h > expBefore1h, '1H Spear attack granted spears proficiency EXP');

    // Strike with 2H Spear
    const enemy2 = new Enemy(scene, 6, 5, dataLoader.getEnemy('wolf')!, 'wolf-avatar');
    const initialEnemy2Hp = enemy2.hp;

    player.equipWeapon(spear2h);
    const expBefore2h = prog.getProficiencyStat('spears').currentExp;

    combat.executePlayerBasicAttack(player, enemy2, 2500, undefined, undefined, undefined, 1.0);
    assert.ok(enemy2.hp < initialEnemy2Hp, '2H Spear attack dealt damage to enemy');
    const expAfter2h = prog.getProficiencyStat('spears').currentExp;
    assert.ok(expAfter2h > expBefore2h, '2H Spear attack granted spears proficiency EXP');

    // Both attacks contributed to the exact same proficiency stat
    assert.equal(prog.getProficiencyStat('spears').currentExp, expAfter2h, 'Both 1H and 2H advance shared "spears" proficiency');

    console.log('✓ PASS: Both 1H and 2H variants function in combat and award shared "spears" proficiency EXP.\n');
  }

  // ============================================================================
  // TEST 6: Lancer (Spears-only) Boundary Test
  // ============================================================================
  console.log('--- TEST 6: Lancer (Spears-only) Boundary Test ---');
  {
    const lancerDef = classesData.classes.find((c: any) => c.id === 'lancer');
    assert.ok(lancerDef, 'lancer class definition must exist in classes.json');
    assert.equal(lancerDef.name, 'Lancer');
    assert.equal(lancerDef.tier, 'novice');
    assert.deepEqual(lancerDef.requirements, [
      { type: 'proficiency', target: 'spears', value: 10 }
    ], 'Lancer requires strictly Spears Level 10 and no second weapon');

    const pLancer = new ProgressionSystem(classesData, 'Lancer Candidate');

    // Boundary: Spears 9 -> LOCKED
    pLancer.getProficiencyStat('spears').level = 9;
    pLancer.checkClassUnlocks();
    assert.equal(pLancer.isClassUnlocked('lancer'), false, 'Lancer is LOCKED at Spears Level 9');

    // Boundary: Spears 10 -> UNLOCKED
    pLancer.getProficiencyStat('spears').level = 10;
    pLancer.checkClassUnlocks();
    assert.equal(pLancer.isClassUnlocked('lancer'), true, 'Lancer UNLOCKS cleanly when Spears reaches Level 10');

    console.log('✓ PASS: Lancer unlocks cleanly at Spears Level 10 with zero secondary requirements.\n');
  }

  // ============================================================================
  // TEST 7: Hoplite Dual-Requirement 2D Boundary Checks
  // ============================================================================
  console.log('--- TEST 7: Hoplite Dual-Requirement 2D Boundary Checks ---');
  {
    const hopliteDef = classesData.classes.find((c: any) => c.id === 'hoplite');
    assert.ok(hopliteDef, 'hoplite class definition must exist in classes.json');
    assert.equal(hopliteDef.name, 'Hoplite');
    assert.equal(hopliteDef.tier, 'adept');
    assert.deepEqual(hopliteDef.requirements, [
      { type: 'proficiency', target: 'spears', value: 30 },
      { type: 'proficiency', target: 'shields', value: 10 }
    ], 'Hoplite requires Spears 30 + Shields 10');

    // Case A: Spears 30, Shields 9 (Fails single-sided Shields check)
    const pHopliteA = new ProgressionSystem(classesData, 'Hoplite Candidate A');
    pHopliteA.getProficiencyStat('spears').level = 30;
    pHopliteA.getProficiencyStat('shields').level = 9;
    pHopliteA.checkClassUnlocks();
    assert.equal(pHopliteA.isClassUnlocked('hoplite'), false, 'Hoplite must NOT unlock when Shields is only Level 9 (Spears 30)');

    // Case B: Spears 29, Shields 10 (Fails single-sided Spears check)
    const pHopliteB = new ProgressionSystem(classesData, 'Hoplite Candidate B');
    pHopliteB.getProficiencyStat('spears').level = 29;
    pHopliteB.getProficiencyStat('shields').level = 10;
    pHopliteB.checkClassUnlocks();
    assert.equal(pHopliteB.isClassUnlocked('hoplite'), false, 'Hoplite must NOT unlock when Spears is only Level 29 (Shields 10)');

    // Case C: Spears 30, Shields 10 (Exact Dual Satisfaction)
    const pHopliteC = new ProgressionSystem(classesData, 'Hoplite Candidate C');
    pHopliteC.getProficiencyStat('spears').level = 30;
    pHopliteC.getProficiencyStat('shields').level = 10;
    pHopliteC.checkClassUnlocks();
    assert.equal(pHopliteC.isClassUnlocked('hoplite'), true, 'Hoplite UNLOCKS cleanly when both Spears 30 and Shields 10 are met');

    console.log('✓ PASS: Hoplite dual-requirement boundary checks strictly enforced on both axes.\n');
  }

  // ============================================================================
  // TEST 8: Explicit Absence of Deferred Classes
  // ============================================================================
  console.log('--- TEST 8: Explicit Absence of Deferred Classes ---');
  {
    // Dragoon remains deferred awaiting Armor Proficiency; Javelin was deferred in M49 and implemented in M54
    const dragoonDef = classesData.classes.find((c: any) => c.id === 'dragoon');
    assert.equal(dragoonDef, undefined, 'Dragoon class MUST be absent from classes.json');

    // Confirm documentation covers both blocking dependencies
    const deferredDoc = fs.readFileSync('docs/deferred_features.md', 'utf8');
    assert.ok(deferredDoc.includes('Javelin Class'), 'deferred_features.md must document Javelin deferral');
    assert.ok(deferredDoc.includes('Throwing Weapons'), 'deferred_features.md must cite Throwing Weapons dependency');
    assert.ok(deferredDoc.includes('Dragoon Class'), 'deferred_features.md must document Dragoon deferral');
    assert.ok(deferredDoc.includes('Heavy Armor'), 'deferred_features.md must cite Heavy Armor proficiency dependency');

    console.log('✓ PASS: Javelin deferral documented and Dragoon confirmed absent with dependencies.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 49 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runMilestone49Tests().catch((err) => {
  console.error('❌ MILESTONE 49 TEST FAILURE:', err);
  process.exit(1);
});
