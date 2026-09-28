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
      addEventListener: noop,
      querySelectorAll: () => []
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

const mockPlayerData = {
  name: 'Guild Hero',
  startingWeaponId: 'short_swords',
  baseStats: { hp: 50, criticalHp: 25, energy: 100 }
};

function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    removedFromScene: function () { return this; },
    on: function (evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
      return this;
    },
    once: function (evt: string, fn: Function) {
      const wrapper = (...args: any[]) => {
        this.off(evt, wrapper);
        fn(...args);
      };
      return this.on(evt, wrapper);
    },
    off: function (evt: string, fn: Function) {
      const list = listeners.get(evt);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
      return this;
    },
    emit: function (evt: string, ...args: any[]) {
      const fns = (listeners.get(evt) || []).slice();
      for (const fn of fns) fn(...args);
      return true;
    }
  };
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    depth: 0,
    alpha: 1,
    texture: { key: 'avatar' },
    setOrigin: function () { return this; },
    setScale: function () { return this; },
    setDepth: function () { return this; },
    setAlpha: function () { return this; },
    setVisible: function () { return this; },
    setTexture: function () { return this; },
    setAngle: function () { return this; },
    setInteractive: function () { return this; },
    disableInteractive: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    setText: function () { return this; },
    setColor: function () { return this; },
    setOrigin: function () { return this; },
    setDepth: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    fillStyle: function () { return this; },
    fillRect: function () { return this; },
    lineStyle: function () { return this; },
    strokeRect: function () { return this; },
    fillCircle: function () { return this; },
    strokeCircle: function () { return this; },
    fillEllipse: function () { return this; },
    strokeEllipse: function () { return this; },
    clear: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockScene(): any {
  const noop = () => {};
  const mockScene: any = {
    sys: {
      settings: { data: {} },
      queueDepthSort: noop,
      displayList: { queueDepthSort: noop },
      events: { once: noop, on: noop, off: noop, emit: noop },
      input: { enable: noop, disable: noop }
    },
    time: { now: 1000, delayedCall: (_ms: number, cb: Function) => cb() },
    add: {
      existing: noop,
      sprite: createMockSprite,
      text: createMockText,
      graphics: createMockGraphics,
      container: (x: number = 0, y: number = 0) => {
        const emitter = createMockEventEmitter();
        const children: any[] = [];
        return {
          ...emitter,
          x,
          y,
          children,
          setDepth: function () { return this; },
          add: function (...items: any[]) {
            children.push(...items);
            return this;
          },
          destroy: function () {
            children.length = 0;
          }
        };
      }
    },
    tweens: { add: () => ({ stop: () => {} }) },
    events: { emit: noop, on: noop, once: noop },
    scene: { start: noop },
    cameras: { main: { stopFollow: noop } },
    input: { mouse: { disableContextMenu: noop }, keyboard: { addKey: () => ({ on: noop, reset: noop }) } },
    hud: {
      showToast: noop,
      updateInventory: noop,
      setLocation: noop,
      destroy: noop,
      setBuildCallbacks: noop,
      setPartyLeaderChangeHandler: noop
    },
    createFloatingText: noop,
    tileSize: 32
  };
  return mockScene;
}

async function runItemFlowUnificationTests() {
  console.log('================================================================');
  console.log('📦 RUNNING ITEM FLOW UNIFICATION TEST SUITE 📦');
  console.log('================================================================');

  // Dynamic imports after globals are setup
  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { LockpickingSystem } = await import('../src/systems/LockpickingSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(mockPlayerData);

  const mockScene = createMockScene();
  const classesData = dataLoader.getClassesData();
  const startingWeapon = dataLoader.getWeapon('short_swords')!;

  const progHero = new ProgressionSystem(classesData, 'Guild Hero');
  const hero = new Player(mockScene, 5, 5, mockPlayerData, startingWeapon, 32, 'player-avatar', progHero);
  hero.id = 'hero';
  hero.entityName = 'Guild Hero';
  hero.hp = 50;
  hero.criticalHp = 25;
  hero.energy = 100;

  const progCompanion = new ProgressionSystem(classesData, 'Valerie');
  const companion = new Player(mockScene, 6, 5, mockPlayerData, startingWeapon, 32, 'companion-avatar', progCompanion);
  companion.id = 'companion_1';
  companion.entityName = 'Valerie';
  companion.hp = 50;
  companion.criticalHp = 25;
  companion.energy = 100;

  const party: Player[] = [hero, companion];

  // ---------------------------------------------------------------------------
  // TEST 1: Conservation Per Source During Dungeon Runs
  // Invariant: Everything picked up during run goes to character bags;
  // Stockpile delta = 0 for gathering, corpse harvests, enemy drops, and lockbox.
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Conservation Per Source During Dungeon Runs ---');
  
  // Clear bags and record initial stockpile
  hero.clearInventory();
  companion.clearInventory();
  const initialStockpileWood = gameState.getItemCount('wood');
  const initialStockpileOre = gameState.getItemCount('ore');
  const initialStockpilePelts = gameState.getItemCount('wolf_pelt');

  // 1A: Gathering Node Harvest
  const mockWoodNode: any = {
    id: 'tree_1',
    x: 10,
    y: 10,
    sprite: createMockSprite(),
    label: createMockText(),
    nodeDef: {
      id: 'tree',
      name: 'Tree',
      skillId: 'woodcutting',
      resourceId: 'wood',
      yieldCount: 3,
      expGranted: 15
    }
  };
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockWoodNode, hero);
  assert.strictEqual(hero.getItemCount('wood'), 3, 'Hero bag should gain 3 wood');
  assert.strictEqual(gameState.getItemCount('wood'), initialStockpileWood, 'Stockpile wood must have delta 0');
  console.log('✔ 1A: Gathering harvest strictly routes to gatherer personal bag; stockpile delta = 0.');

  // 1B: Corpse Harvest (Skinning)
  const mockCorpseNode: any = {
    id: 'corpse_1',
    x: 10,
    y: 10,
    sprite: createMockSprite(),
    label: createMockText(),
    nodeDef: {
      id: 'corpse_wolf',
      name: 'Wolf Corpse',
      skillId: 'skinning',
      resourceId: 'wolf_pelt',
      yieldMin: 1,
      yieldMax: 1,
      expGranted: 15
    }
  };
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockCorpseNode, companion);
  assert.strictEqual(companion.getItemCount('wolf_pelt'), 1, 'Companion bag should gain 1 wolf pelt');
  assert.strictEqual(gameState.getItemCount('wolf_pelt'), initialStockpilePelts, 'Stockpile wolf_pelt must have delta 0');
  console.log('✔ 1B: Corpse harvest strictly routes to harvester personal bag; stockpile delta = 0.');

  // 1C: Common Enemy Drop
  const combatSystem = new CombatSystem(mockScene, party, []);
  const mockWolfEnemy = new Enemy(mockScene, 12, 10, dataLoader.getEnemy('wolf')!, 32);
  const originalRoll = CombatSystem.rollCommonEnemyDrop;
  CombatSystem.rollCommonEnemyDrop = () => ({ item: 'bone', method: 'standard_drop', roll: 0.1 });
  
  (combatSystem as any).handleTargetDefeated(hero, mockWolfEnemy, 'short_swords');
  assert.strictEqual(hero.getItemCount('bone'), 1, 'Killer bag should receive common drop');
  assert.strictEqual(gameState.getItemCount('bone'), 0, 'Stockpile bone must have delta 0');

  // Test downed killer routing to party leader
  companion.hp = 0;
  companion.criticalHp = 0;
  companion.state = 'downed';
  CombatSystem.rollCommonEnemyDrop = () => ({ item: 'slime_gel', method: 'standard_drop', roll: 0.1 });
  (combatSystem as any).handleTargetDefeated(companion, mockWolfEnemy, 'short_swords');
  assert.strictEqual(hero.getItemCount('slime_gel'), 1, 'Downed killer drop rerouted to party leader (party[0])');
  assert.strictEqual(companion.getItemCount('slime_gel'), 0, 'Downed killer does not receive drop');
  CombatSystem.rollCommonEnemyDrop = originalRoll;
  companion.hp = 50;
  companion.criticalHp = 25;
  companion.clearDownedState();
  console.log('✔ 1C: Kill loot routes to killer bag (or leader if downed); stockpile delta = 0.');

  // 1D: Dungeon Locked Box Opening
  const lockpickingSystem = LockpickingSystem.getInstance();
  hero.addItem('locked_box', 1);
  hero.addItem('lockpick', 3);
  hero.progression.addProficiencyExp('lockpicking', 50); // Level 1
  hero.isAtOutpost = () => false; // in dungeon

  const initialHeroOre = hero.getItemCount('ore');
  const initialStockpileOreBefore = gameState.getItemCount('ore');
  const unlockRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, () => 0.05, hero);
  assert.ok(unlockRes.success, 'Lockpicking should succeed');
  assert.strictEqual(gameState.getItemCount('ore'), initialStockpileOreBefore, 'Stockpile ore must not change when opening box in dungeon');
  assert.ok(hero.getItemCount('ore') > initialHeroOre, 'Opener personal bag must receive box material rewards in dungeon');
  console.log('✔ 1D: Dungeon lockbox rewards route to opener bag; stockpile delta = 0.');

  // ---------------------------------------------------------------------------
  // TEST 2: Round-Trip Auto-Deposit on Return With { fromDungeon: true }
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Round-Trip Auto-Deposit on Return With { fromDungeon: true } ---');
  hero.clearInventory();
  companion.clearInventory();

  // Materials (should deposit)
  hero.addItem('wood', 10);
  hero.addItem('ore', 5);
  hero.addItem('bone', 3);
  companion.addItem('wolf_pelt', 2);
  companion.addItem('spider_silk', 4);

  // Non-materials: tools, consumables, food (should stay in bags)
  hero.addItem('lockpick', 2);
  hero.addItem('fishing_rod', 1);
  hero.addItem('bandage', 3);
  hero.addItem('antidote', 1);
  hero.addFoodItem('herb_stew', 2, 'good', 1);
  companion.addItem('lockpick', 1);
  companion.addItem('energy_potion', 2);
  companion.addFoodItem('ration', 1, 'common', 1);

  const prevStockpileWood = gameState.getItemCount('wood');
  const prevStockpileOre = gameState.getItemCount('ore');
  const prevStockpileBone = gameState.getItemCount('bone');
  const prevStockpilePelts = gameState.getItemCount('wolf_pelt');
  const prevStockpileSilk = gameState.getItemCount('spider_silk');

  // Trigger auto-deposit
  const depositSummary = gameState.autoDepositPartyMaterials(party);
  assert.strictEqual(depositSummary.depositedCount, 10 + 5 + 3 + 2 + 4, 'All materials deposited (total 24)');
  
  // Verify stockpile gained materials
  assert.strictEqual(gameState.getItemCount('wood'), prevStockpileWood + 10);
  assert.strictEqual(gameState.getItemCount('ore'), prevStockpileOre + 5);
  assert.strictEqual(gameState.getItemCount('bone'), prevStockpileBone + 3);
  assert.strictEqual(gameState.getItemCount('wolf_pelt'), prevStockpilePelts + 2);
  assert.strictEqual(gameState.getItemCount('spider_silk'), prevStockpileSilk + 4);

  // Verify materials removed from bags
  assert.strictEqual(hero.getItemCount('wood'), 0);
  assert.strictEqual(hero.getItemCount('ore'), 0);
  assert.strictEqual(hero.getItemCount('bone'), 0);
  assert.strictEqual(companion.getItemCount('wolf_pelt'), 0);
  assert.strictEqual(companion.getItemCount('spider_silk'), 0);

  // Verify non-materials KEPT in bags
  assert.strictEqual(hero.getItemCount('lockpick'), 2, 'Lockpicks stay in bag');
  assert.strictEqual(hero.getItemCount('fishing_rod'), 1, 'Fishing rod stays in bag');
  assert.strictEqual(hero.getItemCount('bandage'), 3, 'Bandages stay in bag');
  assert.strictEqual(hero.getItemCount('antidote'), 1, 'Antidote stays in bag');
  assert.strictEqual(hero.getItemCount('herb_stew'), 2, 'Food stays in bag');
  assert.strictEqual(companion.getItemCount('lockpick'), 1, 'Companion lockpicks stay in bag');
  assert.strictEqual(companion.getItemCount('energy_potion'), 2, 'Potions stay in bag');
  assert.strictEqual(companion.getItemCount('ration'), 1, 'Companion food stays in bag');

  // Fresh boot / Save load test: verify OutpostScene does not auto-deposit unless fromDungeon: true
  const outpostScene = new OutpostScene();
  outpostScene.init(); // no data -> fromDungeon = false
  assert.strictEqual(outpostScene.arrivedFromDungeon, false, 'arrivedFromDungeon must be false on fresh boot / save load');
  
  outpostScene.init({ fromDungeon: true });
  assert.strictEqual(outpostScene.arrivedFromDungeon, true, 'arrivedFromDungeon must be true when fromDungeon: true passed');
  console.log('✔ Test 2 passed: Auto-deposit accurately routes materials to stockpile and keeps consumables, food, and tools in bags.');

  // ---------------------------------------------------------------------------
  // TEST 3: Party Wipe Recovery Sets { fromDungeon: true }
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Party Wipe Recovery Sets { fromDungeon: true } ---');
  let startedScene = '';
  let startedData: any = null;
  const mockSceneWipe: any = {
    ...mockScene,
    isWiping: false,
    isTransitioning: false,
    party: [hero, companion],
    player: hero,
    progressionSystem: progHero,
    enemies: [],
    clearMoveDestinationHighlights: () => {},
    time: { now: 1000, delayedCall: (_ms: number, cb: Function) => cb() },
    scene: {
      start: (key: string, data?: any) => {
        startedScene = key;
        startedData = data;
      }
    }
  };
  MainScene.prototype.handlePartyWipe.call(mockSceneWipe);
  assert.strictEqual(startedScene, 'OutpostScene', 'Wipe must transition to OutpostScene');
  assert.deepStrictEqual(startedData, { fromDungeon: true }, 'Wipe transition must pass { fromDungeon: true }');
  console.log('✔ Test 3 passed: Party wipe recovery passes { fromDungeon: true } ensuring materials auto-deposit without penalty.');

  // ---------------------------------------------------------------------------
  // TEST 4: Food Quality, Freshness & Multipliers in Bags
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Food Quality, Freshness & Multipliers in Bags ---');
  hero.clearInventory();
  hero.foodItems = [];

  // 4A: Adding food instances with rolled qualities and days
  hero.addFoodItem('herb_stew', 1, 'common', 1);
  hero.addFoodItem('herb_stew', 1, 'excellent', 2);
  hero.addFoodItem('ration', 1, 'good', 1);

  assert.strictEqual(hero.foodItems.length, 3, 'Hero should carry 3 distinct FoodItemInstances');
  assert.strictEqual(hero.getItemCount('herb_stew'), 2, 'Hero inventory shows count 2 for herb_stew');
  assert.strictEqual(hero.getItemCount('ration'), 1, 'Hero inventory shows count 1 for ration');

  // 4B: Oldest eaten first rule
  hero.setHunger(40);
  const ateFirst = hero.eatFood('herb_stew');
  assert.ok(ateFirst, 'Hero should eat herb_stew');
  assert.strictEqual(hero.foodItems.length, 2, 'One instance consumed');
  const remainingStew = hero.foodItems.find(f => f.id === 'herb_stew');
  assert.ok(remainingStew, 'Remaining stew must exist');
  assert.strictEqual(remainingStew!.acquiredDay, 2, 'Oldest Day 1 stew consumed; Day 2 stew remained');
  assert.strictEqual(remainingStew!.quality, 'excellent', 'Day 2 excellent quality preserved');

  // 4C: Quality Multipliers: eating 'excellent' food provides +50% hunger, 25s buff duration, 3 HP/sec
  hero.setHunger(40);
  const ateExcellent = hero.eatFood('herb_stew');
  assert.ok(ateExcellent, 'Hero should eat excellent herb_stew');
  // Base herb_stew gives 35 hunger * 1.5 = 52.5 -> 53
  assert.strictEqual(hero.hunger, 93, 'Excellent quality restores 1.5x hunger (40 + 53 = 93)');
  assert.strictEqual(hero.wellFedRemainingMs, 25000, 'Excellent quality grants 25000ms duration');
  assert.strictEqual(hero.wellFedHpPerSec, 3, 'Excellent quality grants 3 HP/sec');

  // 4D: Spoilage check across bags and stockpile
  hero.clearInventory();
  hero.foodItems = [];
  (gameState as any).foodItems = [];
  (gameState as any).inventory.delete('herb_stew');
  // herb_stew spoilageDays = 5
  hero.addFoodItem('herb_stew', 1, 'common', 1);
  gameState.addFoodInstance({ id: 'herb_stew', name: 'Herb Stew', acquiredDay: 1, quality: 'common' });

  // On day 3 (elapsed = 2 < 5), neither spoiled
  let spoiled = gameState.checkFoodSpoilage(party);
  assert.strictEqual(spoiled, 0, 'No food spoiled on Day 3');
  assert.strictEqual(hero.getItemCount('herb_stew'), 1);

  // Advance day by 5 (Day 1 -> Day 6, elapsed = 5 >= spoilageDays 5): both bag and stockpile spoil
  (gameState as any).currentGameDay += 5;
  spoiled = gameState.checkFoodSpoilage(party);
  assert.strictEqual(spoiled, 2, 'Both bag and stockpile herb_stew spoiled when elapsed >= 5');
  assert.strictEqual(hero.getItemCount('herb_stew'), 0, 'Hero bag food removed after spoilage');
  assert.strictEqual(gameState.getItemCount('herb_stew'), 0, 'Stockpile food removed after spoilage');

  // 4E: Save migration converts legacy plain food counts to FoodItemInstance
  const legacySnapshot = {
    ...hero.getSnapshot(1000),
    inventory: { ration: 3 },
    foodItems: undefined
  };
  hero.restoreFromSnapshot(legacySnapshot as any, 1000);
  assert.strictEqual(hero.foodItems.length, 3, 'Legacy 3 rations migrated to 3 FoodItemInstances');
  assert.strictEqual(hero.foodItems[0].id, 'ration');
  assert.strictEqual(hero.foodItems[0].quality, 'common');
  assert.strictEqual(hero.foodItems[0].acquiredDay, gameState.currentGameDay);
  console.log('✔ Test 4 passed: Food quality, oldest-eaten preservation, bag spoilage, and legacy save migration verified.');

  // ---------------------------------------------------------------------------
  // TEST 5: Tools (Lockpick & Fishing Rod) Retained and Functional
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Tools (Lockpick & Fishing Rod) Retained and Functional ---');
  hero.clearInventory();
  hero.addItem('lockpick', 5);
  hero.addItem('fishing_rod', 1);

  // Auto-deposit does not touch them
  const toolDeposit = gameState.autoDepositPartyMaterials([hero]);
  assert.strictEqual(toolDeposit.depositedCount, 0, 'Tools deposit 0 items');
  assert.strictEqual(hero.getItemCount('lockpick'), 5, 'Lockpicks stay 5 in bag');
  assert.strictEqual(hero.getItemCount('fishing_rod'), 1, 'Fishing rod stays 1 in bag');

  // Verify can fish with carried rod
  const fishingNodeDef: any = {
    id: 'fishing_spot',
    skillId: 'fishing',
    resourceId: 'raw_fish',
    requiredToolItemId: 'fishing_rod',
    yieldMin: 1,
    yieldMax: 1,
    expGranted: 15
  };
  const mockFishingNode: any = { id: 'fish_1', x: 2, y: 2, sprite: createMockSprite(), label: createMockText(), nodeDef: fishingNodeDef };
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishingNode, hero);
  assert.strictEqual(hero.getItemCount('raw_fish'), 1, 'Successfully fished raw_fish with carried rod');
  console.log('✔ Test 5 passed: Tools stay in personal bags and enable interactions.');

  // ---------------------------------------------------------------------------
  // TEST 6: Outpost Locked Box Opening Auto-Deposits Materials Immediately
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Outpost Locked Box Opening Auto-Deposits Materials Immediately ---');
  hero.clearInventory();
  hero.addItem('locked_box', 1);
  hero.addItem('lockpick', 1);
  hero.isAtOutpost = () => true;

  const outpostStockpileOreBefore = gameState.getItemCount('ore');
  const outpostUnlock = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, () => 0.05, hero);

  assert.ok(outpostUnlock.success, 'Outpost lockbox opened');
  assert.strictEqual(hero.getItemCount('ore'), 0, 'Ore did not stay in personal bag');
  assert.ok(gameState.getItemCount('ore') > outpostStockpileOreBefore, 'Stockpile ore increased immediately on Outpost box open');
  console.log('✔ Test 6 passed: Outpost locked box opens and deposits material rewards immediately.');

  console.log('\n================================================================');
  console.log('🎉 ALL ITEM FLOW UNIFICATION TESTS PASSED WITH 100% INVARIANTS! 🎉');
  console.log('================================================================\n');
}

runItemFlowUnificationTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
