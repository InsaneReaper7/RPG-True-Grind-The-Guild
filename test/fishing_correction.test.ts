import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  (globalThis as any).window = (global as any).window;
  (globalThis as any).document = (global as any).document;
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function createMockMainScene(MainSceneClass: any, seed: number = 42) {
  const scene = new MainSceneClass();
  const noop = () => {};
  (scene as any).sys = {
    settings: { data: {} },
    queueDepthSort: noop,
    events: { once: noop, on: noop, off: noop, emit: noop },
    input: { enable: noop, disable: noop }
  };
  (scene as any).make = {
    tilemap: () => ({
      addTilesetImage: () => ({}),
      createLayer: () => ({ setDepth: () => {} })
    }),
    graphics: () => ({
      fillStyle: noop,
      fillRect: noop,
      fillCircle: noop,
      lineStyle: noop,
      strokeRect: noop,
      strokeCircle: noop,
      lineBetween: noop,
      generateTexture: noop,
      destroy: noop,
      clear: noop
    })
  };
  (scene as any).textures = {
    exists: () => true
  };
  (scene as any).time = {
    now: 1000,
    addEvent: (cfg: any) => {
      let cancelled = false;
      return {
        remove: () => { cancelled = true; }
      };
    },
    delayedCall: (ms: number, fn: any) => {
      if (typeof fn === 'function') fn();
      return { remove: noop };
    }
  };
  (scene as any).events = { once: noop, on: noop, off: noop, emit: noop };
  (scene as any).tweens = { add: () => ({ remove: noop }) };

  const createMockDisplayObj = () => {
    const obj: any = {
      x: 0,
      y: 0,
      text: '',
      color: '',
      visible: true,
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setScrollFactor: () => obj,
      setPadding: () => obj,
      setWordWrapWidth: () => obj,
      setShadow: () => obj,
      setStroke: () => obj,
      setLineWidth: () => obj,
      setVisible: (v: boolean) => { obj.visible = v; return obj; },
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setTexture: (key: string) => { obj.texture = key; return obj; },
      setFrame: () => obj,
      setSize: () => obj,
      setDisplaySize: () => obj,
      setPosition: (x: number, y: number) => { obj.x = x; obj.y = y; return obj; },
      setScale: () => obj,
      setText: (t: string) => { obj.text = t; return obj; },
      setColor: (c: string) => { obj.color = c; return obj; },
      setStyle: (s: any) => { obj.style = { ...obj.style, ...s }; return obj; },
      clear: () => obj,
      removeFromDisplayList: () => obj,
      addedToScene: () => obj,
      removedFromScene: () => obj,
      addedToContainer: () => obj,
      removedFromContainer: () => obj,
      parentContainer: null,
      lineStyle: () => obj,
      strokeCircle: () => obj,
      fillStyle: () => obj,
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: () => obj,
      lineBetween: () => obj,
      add: (items: any[]) => { obj.children = items; return obj; }
    };
    return obj;
  };

  const toastsEmitted: string[] = [];
  (scene as any).hud = {
    showToast: (msg: string, type?: string, dur?: number) => {
      toastsEmitted.push(msg);
    },
    setGatheringModeActive: noop,
    updatePartyMembers: noop,
    updateLeaderPortrait: noop,
    updateBuildOverlay: noop,
    renderStockpileModal: noop,
    renderResearchTreeModal: noop,
    renderBlacksmithingModal: noop,
    toastsEmitted
  };

  (scene as any).pathfinder = {
    findPath: async () => []
  };
  (scene as any).gridMatrix = Array.from({ length: 40 }, () => Array(40).fill(0));
  (scene as any).mapWidth = 40;
  (scene as any).mapHeight = 40;
  (scene as any).tileSize = 16;

  (scene as any).add = {
    existing: (obj: any) => obj,
    sprite: () => createMockDisplayObj(),
    image: () => createMockDisplayObj(),
    text: () => createMockDisplayObj(),
    graphics: () => createMockDisplayObj(),
    container: () => createMockDisplayObj(),
    circle: () => createMockDisplayObj()
  };

  (scene as any).cameras = {
    main: {
      setBounds: noop,
      startFollow: noop,
      setZoom: noop,
      scrollX: 0,
      scrollY: 0
    }
  };

  (scene as any).input = {
    on: noop,
    keyboard: {
      on: noop,
      addKey: () => ({ on: noop, isDown: false }),
      createCursorKeys: () => ({ up: {}, down: {}, left: {}, right: {} })
    }
  };

  return { scene, toastsEmitted };
}

async function runFishingCorrectionTests() {
  console.log('================================================================');
  console.log('🎣 RUNNING FISHING CORRECTION & TOOL MECHANIC TEST SUITE 🎣');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const resetSilent = (gs: any) => {
    const origLog = console.log;
    console.log = (...args: any[]) => {
      if (typeof args[0] === 'string' && args[0].includes('[GameState] Initialized from player.json')) return;
      origLog(...args);
    };
    try {
      gs.resetToDefault();
    } finally {
      console.log = origLog;
    }
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Static Data & Schema Alignment
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Static Data & Schema Alignment ---');
  {
    // Research Tree
    const researchTreeRaw = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8'));
    const fishingNode = researchTreeRaw.nodes?.find((n: any) => n.id === 'research_fishing');
    assert.ok(fishingNode, 'research_fishing must be defined in data/researchTree.json');
    assert.strictEqual(fishingNode.cost, 10, 'research_fishing cost must be 10 (matching digging, skinning, butchering)');
    assert.deepStrictEqual(fishingNode.prerequisites, [], 'research_fishing must have prerequisites: []');

    // Items: Fishing Rod
    const itemsRaw = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
    const fishingRod = itemsRaw.items?.find((i: any) => i.id === 'fishing_rod');
    const lockpick = itemsRaw.items?.find((i: any) => i.id === 'lockpick');
    assert.ok(fishingRod, 'fishing_rod must be registered in data/items.json');
    assert.strictEqual(fishingRod.category, 'reagents', 'fishing_rod category must be reagents (matching lockpick)');
    assert.strictEqual(lockpick.category, 'reagents', 'lockpick category must be reagents');
    assert.strictEqual(fishingRod.icon, '🎣', 'fishing_rod icon must be 🎣');
    assert.strictEqual(fishingRod.weight, 1.0, 'fishing_rod weight must be 1.0');

    // Blacksmithing Recipe
    const blacksmithRaw = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8'));
    const rodRecipe = blacksmithRaw.recipes?.find((r: any) => r.id === 'fishing_rod');
    assert.ok(rodRecipe, 'fishing_rod recipe must exist in data/blacksmithRecipes.json');
    assert.strictEqual(rodRecipe.resultItemId, 'fishing_rod');
    assert.strictEqual(rodRecipe.requiredLevel, 0);
    assert.strictEqual(rodRecipe.expGranted, 20);
    assert.strictEqual(rodRecipe.ingredients.wood, 3);
    assert.strictEqual(rodRecipe.ingredients.spider_silk, 2);

    // Gathering Node: requiredToolItemId
    const gatheringNodesRaw = JSON.parse(fs.readFileSync('data/gatheringNodes.json', 'utf8'));
    const fishingSpotDef = gatheringNodesRaw.nodes?.fishing_spot;
    assert.ok(fishingSpotDef, 'fishing_spot must exist in data/gatheringNodes.json');
    assert.strictEqual(fishingSpotDef.requiredToolItemId, 'fishing_rod', 'fishing_spot must define requiredToolItemId: "fishing_rod"');

    console.log('✔ Test 1 passed: Static data, categories, recipes, and schema requirements verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 1B: Blacksmith Crafting — Fishing Rod from Stockpile to Leader Inventory
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1B: Blacksmith Crafting (Stockpile Deduction -> Leader Inventory) ---');
  {
    const gameState = GameState.getInstance();
    resetSilent(gameState);
    gameState.clearSave();

    // 1. Party Leader setup with empty inventory
    const { scene } = createMockMainScene(MainScene);
    const heroData = dataLoader.getPlayer();
    const leader = new Player(scene, 10, 10, heroData, dataLoader.getWeapon('short_swords')!, 16, 'player-avatar', new ProgressionSystem());
    leader.entityName = 'Guild Hero';
    leader.clearInventory();
    scene.party = [leader];

    // 2. Stockpile setup: deposit 3 Wood and 2 Spider Silk into party stockpile
    const initialWood = gameState.getItemCount('wood');
    const initialSilk = gameState.getItemCount('spider_silk');

    gameState.addItem('wood', 3);
    gameState.addItem('spider_silk', 2);

    const preStockpileWood = gameState.getItemCount('wood');
    const preStockpileSilk = gameState.getItemCount('spider_silk');
    const preLeaderRod = leader.getItemCount('fishing_rod');
    const preBsExp = leader.progression.getProficiencyStat('blacksmithing')?.currentExp || 0;

    assert.strictEqual(preStockpileWood, initialWood + 3, 'Stockpile must have added 3 wood');
    assert.strictEqual(preStockpileSilk, initialSilk + 2, 'Stockpile must have added 2 spider silk');
    assert.strictEqual(preLeaderRod, 0, 'Leader must start with 0 fishing rods');
    assert.strictEqual(preBsExp, 0, 'Leader must start with 0 blacksmithing exp');

    console.log(`[Blacksmith Crafting] Initial Stockpile: wood=${preStockpileWood}, spider_silk=${preStockpileSilk}`);
    console.log(`[Blacksmith Crafting] Initial Leader Inventory: fishing_rod=${preLeaderRod}, Blacksmithing EXP=${preBsExp}`);

    // Retrieve fishing_rod recipe
    const blacksmithRaw = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8'));
    const rodRecipe = blacksmithRaw.recipes?.find((r: any) => r.id === 'fishing_rod');
    assert.ok(rodRecipe, 'fishing_rod recipe must exist');

    // Execute craft per crafting routing rule (as executed in HUD.ts line 6238):
    // A. Consume materials from central stockpile
    for (const [item, qty] of Object.entries(rodRecipe.ingredients)) {
      gameState.consumeItem(item, qty as number);
    }
    // B. Add crafted item to active Party Leader's personal inventory
    const resultId = rodRecipe.resultItemId || rodRecipe.id;
    const resultQty = rodRecipe.resultCount ?? 1;
    leader.addItem(resultId, resultQty);
    // C. Award Blacksmithing EXP to Party Leader
    leader.progression.addProficiencyExp('blacksmithing', rodRecipe.expGranted);

    // Verify post-craft state
    const postStockpileWood = gameState.getItemCount('wood');
    const postStockpileSilk = gameState.getItemCount('spider_silk');
    const postLeaderRod = leader.getItemCount('fishing_rod');
    const postBsExp = leader.progression.getProficiencyStat('blacksmithing')?.currentExp || 0;

    console.log(`[Blacksmith Crafting] Material Deduction: wood ${preStockpileWood} -> ${postStockpileWood} (-3), spider_silk ${preStockpileSilk} -> ${postStockpileSilk} (-2)`);
    console.log(`[Blacksmith Crafting] EXP Awarded: +${rodRecipe.expGranted} Blacksmithing EXP to Party Leader (Total: ${postBsExp})`);
    console.log(`[Blacksmith Crafting] Output Item Routing: ${resultQty}x '${resultId}' deposited into Leader's personal inventory (Count: ${postLeaderRod})`);

    assert.strictEqual(postStockpileWood, initialWood, 'Stockpile wood must be reduced by 3');
    assert.strictEqual(postStockpileSilk, initialSilk, 'Stockpile spider_silk must be reduced by 2');
    assert.strictEqual(postLeaderRod, 1, 'Leader personal inventory must contain exactly 1 fishing_rod');
    assert.strictEqual(postBsExp, 20, 'Leader must receive +20 Blacksmithing EXP');

    console.log('✔ Test 1B passed: Fishing Rod successfully crafted at Blacksmith with stockpile deduction and leader personal inventory routing.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Seed Determinism & Full Scene Invariance (MainScene.create())
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Seed Determinism & Full Scene Invariance (MainScene.create()) ---');
  console.log('Invariance Standard: Compares exact positions, types, and stats of every entity across seeds.\n');
  {
    const dungeonConfig = dataLoader.getDungeonConfig();
    let seedsWithFishingSpots = 0;
    let seedCandidate = 1;
    const testedSeeds: number[] = [];

    // Ensure at least 5 seeds spawn >= 1 fishing spots, testing a robust multi-seed batch
    while (seedsWithFishingSpots < 5 || testedSeeds.length < 8) {
      const seed = seedCandidate++;
      testedSeeds.push(seed);

      // Scenario A: Fishing Research is LOCKED
      const gameState = GameState.getInstance();
      resetSilent(gameState);
      (gameState as any).completedResearchIds.delete('research_fishing');
      assert.strictEqual(gameState.isFishingUnlocked(), false, 'Fishing must be locked initially');

      const makeRngA = () => {
        let s = seed;
        return () => {
          s = (s * 9301 + 49297) % 233280;
          return s / 233280;
        };
      };
      const dungeonA = DungeonGenerator.generate(dungeonConfig, makeRngA(), { floorNumber: 1 });
      const { scene: sceneA } = createMockMainScene(MainScene, seed);
      sceneA.dungeon = dungeonA;
      const origLog = console.log;
      console.log = (...args: any[]) => {
        if (typeof args[0] === 'string' && (args[0].includes('[Debug Tools]') || args[0].includes('[Player'))) return;
        origLog(...args);
      };
      try {
        sceneA.create();
      } finally {
        console.log = origLog;
      }

      // Collect Scenario A entities with exact positions, types, and stats
      const enemiesA = sceneA.enemies.map((e: any) => ({
        id: e.enemyData.id,
        gridX: e.gridPos.x,
        gridY: e.gridPos.y,
        hp: e.hp
      }));
      const nonFishingNodesA = sceneA.gatheringNodes
        .filter((n: any) => n.nodeDef.skillId !== 'fishing')
        .map((n: any) => ({ id: n.nodeDef.id, x: n.x, y: n.y }));
      const fishingNodesA = sceneA.gatheringNodes.filter((n: any) => n.nodeDef.skillId === 'fishing');

      // Scenario B: Fishing Research is UNLOCKED
      resetSilent(gameState);
      gameState.completeResearch('research_fishing');
      assert.strictEqual(gameState.isFishingUnlocked(), true, 'Fishing must be unlocked');

      const makeRngB = () => {
        let s = seed;
        return () => {
          s = (s * 9301 + 49297) % 233280;
          return s / 233280;
        };
      };
      const dungeonB = DungeonGenerator.generate(dungeonConfig, makeRngB(), { floorNumber: 1 });
      const { scene: sceneB } = createMockMainScene(MainScene, seed);
      sceneB.dungeon = dungeonB;
      console.log = (...args: any[]) => {
        if (typeof args[0] === 'string' && (args[0].includes('[Debug Tools]') || args[0].includes('[Player'))) return;
        origLog(...args);
      };
      try {
        sceneB.create();
      } finally {
        console.log = origLog;
      }

      // Collect Scenario B entities with exact positions, types, and stats
      const enemiesB = sceneB.enemies.map((e: any) => ({
        id: e.enemyData.id,
        gridX: e.gridPos.x,
        gridY: e.gridPos.y,
        hp: e.hp
      }));
      const nonFishingNodesB = sceneB.gatheringNodes
        .filter((n: any) => n.nodeDef.skillId !== 'fishing')
        .map((n: any) => ({ id: n.nodeDef.id, x: n.x, y: n.y }));
      const fishingNodesB = sceneB.gatheringNodes.filter((n: any) => n.nodeDef.skillId === 'fishing');

      if (fishingNodesB.length > 0) {
        seedsWithFishingSpots++;
      }

      // Assertions covering positions, types, and entity properties
      assert.strictEqual(fishingNodesA.length, 0, `Seed ${seed}: Zero fishing spots when research is locked`);
      assert.deepStrictEqual(enemiesA, enemiesB, `Seed ${seed}: Enemies match 100% by id, position (gridX, gridY), and hp`);
      assert.deepStrictEqual(nonFishingNodesA, nonFishingNodesB, `Seed ${seed}: Non-fishing gathering nodes match 100% by id and position (x, y)`);
      assert.deepStrictEqual(dungeonA.rooms, dungeonB.rooms, `Seed ${seed}: Dungeon rooms match 100% by position, dimensions, and type`);
      assert.deepStrictEqual(dungeonA.waterTiles, dungeonB.waterTiles, `Seed ${seed}: Water tiles match 100% by position (x, y)`);

      console.log(`Seed ${seed.toString().padStart(2)}: Fishing spots spawned = ${fishingNodesB.length} (unlocked) vs ${fishingNodesA.length} (locked) | Water tiles = ${dungeonB.waterTiles?.length || 0}`);
      console.log(`         Enemies: ${enemiesA.length} matched by position (gridX, gridY), type (id), and HP`);
      console.log(`         Gathering nodes: ${nonFishingNodesA.length} non-fishing nodes matched by position (x, y) and type (id)`);
      console.log(`         Rooms: ${dungeonA.rooms.length} matched by (x, y, w, h, type) | Invariance: 100% EXACT MATCH`);
    }

    console.log(`\nTotal seeds tested: ${testedSeeds.length} (Seeds spawning fishing spots: ${seedsWithFishingSpots})`);
    assert.ok(seedsWithFishingSpots >= 5, `Must have at least 5 seeds spawning fishing spots (found: ${seedsWithFishingSpots})`);
    console.log('✔ Test 2 passed: MainScene.create() seed invariance verified across seeds (100% identical positions and types).\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Pre-Gate Save Migration
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Pre-Gate Save Migration on Load ---');
  {
    const gameState = GameState.getInstance();

    // 3a. Leader has Fishing EXP > 0, research_fishing absent
    const preGateSaveFixture: any = {
      hp: 100,
      criticalHp: 25,
      energy: 50,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      skillCooldownsRemainingMs: {},
      proficiencies: {
        short_swords: { level: 2, currentExp: 30 },
        fishing: { level: 3, currentExp: 45 }
      },
      classLevels: {},
      unlockedClasses: [],
      resources: { wood: 10, ore: 5 },
      completedResearchIds: ['research_blacksmithing_station']
    };

    gameState.restoreFromLoadedSnapshot(preGateSaveFixture);
    assert.strictEqual(gameState.isFishingUnlocked(), true, 'Pre-gate save with Fishing EXP must auto-unlock research_fishing');
    assert.ok(gameState.getCompletedResearch().includes('research_fishing'), 'completedResearchIds must include research_fishing');

    // 3b. Leader has 0 fishing, but Companion has Fishing EXP > 0
    const companionSaveFixture: any = {
      hp: 100,
      criticalHp: 25,
      energy: 50,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      skillCooldownsRemainingMs: {},
      proficiencies: {
        short_swords: { level: 1, currentExp: 0 },
        fishing: { level: 0, currentExp: 0 }
      },
      party: [
        {
          id: 'companion_valerie',
          name: 'Valerie',
          proficiencies: {
            daggers: { level: 2, currentExp: 20 },
            fishing: { level: 1, currentExp: 15 }
          }
        }
      ],
      classLevels: {},
      unlockedClasses: [],
      resources: { wood: 10, ore: 5 },
      completedResearchIds: []
    };

    gameState.restoreFromLoadedSnapshot(companionSaveFixture);
    assert.strictEqual(gameState.isFishingUnlocked(), true, 'Pre-gate save with Companion Fishing EXP must auto-unlock research_fishing');

    // 3c. Fresh save with 0 fishing EXP and 0 completed research
    const freshSaveFixture: any = {
      hp: 100,
      criticalHp: 25,
      energy: 50,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      skillCooldownsRemainingMs: {},
      proficiencies: {
        short_swords: { level: 0, currentExp: 0 }
      },
      classLevels: {},
      unlockedClasses: [],
      resources: { wood: 10, ore: 5 },
      completedResearchIds: []
    };

    gameState.restoreFromLoadedSnapshot(freshSaveFixture);
    assert.strictEqual(gameState.isFishingUnlocked(), false, 'Fresh save with no Fishing EXP must remain locked');

    console.log('✔ Test 3 passed: Pre-gate save migration auto-grants research_fishing when EXP > 0 and preserves lock for fresh saves.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Personal Inventory Tool Requirement & Mid-Channel Edge Case
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Personal Inventory Tool Requirement & Mid-Channel Edge Case ---');
  {
    const gameState = GameState.getInstance();
    resetSilent(gameState);
    gameState.completeResearch('research_fishing');

    const { scene } = createMockMainScene(MainScene);
    const heroData = dataLoader.getPlayer();
    const hero = new Player(scene, 10, 10, heroData, null, 16, 'hero-sprite');
    hero.entityName = 'Hero';
    const valerie = new Player(scene, 11, 10, heroData, null, 16, 'valerie-sprite');
    valerie.entityName = 'Valerie';
    scene.party = [hero, valerie];

    // Setup node
    const fishingSpot = scene.spawnGatheringNode(10, 11, 'fishing_spot');
    assert.strictEqual(fishingSpot.nodeDef.requiredToolItemId, 'fishing_rod');

    // Initially neither carries a fishing_rod
    assert.strictEqual(hero.getItemCount('fishing_rod'), 0);
    assert.strictEqual(valerie.getItemCount('fishing_rod'), 0);

    const checkHeroNoTool = scene.canInteractWithGatheringNode(fishingSpot, hero);
    assert.strictEqual(checkHeroNoTool.canInteract, false);
    assert.ok(checkHeroNoTool.reason?.includes('Fishing Rod'));

    const checkValerieNoTool = scene.canInteractWithGatheringNode(fishingSpot, valerie);
    assert.strictEqual(checkValerieNoTool.canInteract, false);
    assert.ok(checkValerieNoTool.reason?.includes('Valerie must carry a Fishing Rod'));

    // Give Leader a Fishing Rod
    hero.addItem('fishing_rod', 1);
    assert.strictEqual(hero.getItemCount('fishing_rod'), 1);
    assert.strictEqual(valerie.getItemCount('fishing_rod'), 0);

    // Leader can interact; Valerie is blocked
    const checkHeroWithTool = scene.canInteractWithGatheringNode(fishingSpot, hero);
    assert.strictEqual(checkHeroWithTool.canInteract, true);

    const checkValerieStillBlocked = scene.canInteractWithGatheringNode(fishingSpot, valerie);
    assert.strictEqual(checkValerieStillBlocked.canInteract, false);

    // Test interactWithGatheringNode with Valerie
    scene.interactWithGatheringNode(fishingSpot, valerie);
    assert.strictEqual(scene.activeGatherChannels.has(valerie), false, 'Valerie must not be allowed to channel');

    // Test interactWithGatheringNode with multi-selection [hero, valerie]
    scene.interactWithGatheringNode(fishingSpot, [hero, valerie]);
    assert.strictEqual(scene.activeGatherChannels.has(hero), true, 'Hero carrying rod starts channeling');
    assert.strictEqual(scene.activeGatherChannels.has(valerie), false, 'Valerie without rod is excluded');

    // Complete gather channel: tool must NOT be consumed
    const activeCh = scene.activeGatherChannels.get(hero)!;
    scene.completeGatherChannel(hero, activeCh);
    assert.strictEqual(fishingSpot.isHarvested, true, 'Fishing spot is harvested');
    assert.strictEqual(hero.getItemCount('fishing_rod'), 1, 'Fishing rod must NOT be consumed on gather completion (persistently carried)');
    assert.ok((hero.getItemCount('raw_fish') + hero.getItemCount('aquatic_reagent')) > 0, 'Hero received resource yield');

    // Test Edge Case: Mid-channel tool removal
    const freshSpot = scene.spawnGatheringNode(12, 12, 'fishing_spot');
    const startOk = scene.startGatherChannel(hero, freshSpot);
    assert.strictEqual(startOk, true, 'Hero starts second channel');
    assert.strictEqual(scene.activeGatherChannels.has(hero), true);

    // Mid-channel: Transfer rod away from hero
    hero.removeItem('fishing_rod', 1);
    assert.strictEqual(hero.getItemCount('fishing_rod'), 0);

    const midChannel = scene.activeGatherChannels.get(hero)!;
    const initialFish = hero.getItemCount('raw_fish');
    const initialReagents = hero.getItemCount('aquatic_reagent');

    scene.completeGatherChannel(hero, midChannel);

    assert.strictEqual(freshSpot.isHarvested, false, 'Harvest must abort: freshSpot remains unharvested');
    assert.strictEqual(hero.getItemCount('raw_fish'), initialFish, 'No fish awarded when tool is removed mid-channel');
    assert.strictEqual(hero.getItemCount('aquatic_reagent'), initialReagents, 'No reagents awarded when tool is removed mid-channel');
    assert.strictEqual(hero.state, 'idle', 'Hero state returned to idle');

    console.log('✔ Test 4 passed: Personal inventory tool requirement, non-consumption, and mid-channel removal verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Gathering Mode Auto-Queue Filtering & Single Toast
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Gathering Mode Auto-Queue Filtering & Single Toast ---');
  {
    const gameState = GameState.getInstance();
    resetSilent(gameState);
    gameState.completeResearch('research_fishing');

    const { scene, toastsEmitted } = createMockMainScene(MainScene);
    const heroData = dataLoader.getPlayer();
    const hero = new Player(scene, 10, 10, heroData, null, 16, 'hero-sprite');
    hero.entityName = 'Hero';
    const valerie = new Player(scene, 11, 10, heroData, null, 16, 'valerie-sprite');
    valerie.entityName = 'Valerie';
    scene.party = [hero, valerie];

    // Case 5a: Marquee drag includes 3 fishing spots, NO member carries a rod
    const spot1 = scene.spawnGatheringNode(15, 15, 'fishing_spot');
    const spot2 = scene.spawnGatheringNode(16, 15, 'fishing_spot');
    const spot3 = scene.spawnGatheringNode(17, 15, 'fishing_spot');

    toastsEmitted.length = 0;
    scene.startGatheringQueue([spot1, spot2, spot3]);

    assert.strictEqual(scene.gatheringQueue.length, 0, 'Queue must be empty when no party member carries a rod');
    const skippedToasts = toastsEmitted.filter(t => t.includes('Skipped'));
    console.log(`[Gathering Mode Toast Audit - Case 5a: 3 fishing spots, 0 tool carriers]`);
    console.log(`  Emitted toasts (${toastsEmitted.length} total, exactly 1 skip toast required):`);
    toastsEmitted.forEach((t, i) => console.log(`    [Toast ${i + 1}] "${t}"`));
    assert.strictEqual(skippedToasts.length, 1, 'Exactly ONE warning toast must be emitted for skipped nodes');
    assert.ok(skippedToasts[0].includes('Skipped 3 node(s)'));

    // Case 5b: Marquee drag includes 2 trees and 2 fishing spots, NO member carries a rod
    const tree1 = scene.spawnGatheringNode(20, 20, 'woodcutting_tree');
    const tree2 = scene.spawnGatheringNode(21, 20, 'woodcutting_tree');
    toastsEmitted.length = 0;

    scene.startGatheringQueue([tree1, tree2, spot1, spot2]);
    // The 2 trees are accepted and immediately assigned to the 2 idle workers
    assert.strictEqual(scene.gatheringWorkerNodeAssignments.size, 2, '2 workers assigned to the 2 queued trees');
    const assignedNodes = Array.from(scene.gatheringWorkerNodeAssignments.values());
    assert.ok(assignedNodes.includes(tree1) && assignedNodes.includes(tree2), 'Workers assigned to tree1 and tree2');
    const mixedSkippedToasts = toastsEmitted.filter(t => t.includes('Skipped'));
    console.log(`[Gathering Mode Toast Audit - Case 5b: 2 trees + 2 fishing spots, 0 tool carriers]`);
    console.log(`  Emitted toasts (${toastsEmitted.length} total, exactly 1 skip toast required):`);
    toastsEmitted.forEach((t, i) => console.log(`    [Toast ${i + 1}] "${t}"`));
    assert.strictEqual(mixedSkippedToasts.length, 1, 'Exactly ONE warning toast emitted for skipped fishing spots');
    assert.ok(mixedSkippedToasts[0].includes('Skipped 2 node(s)'));

    // Case 5c: Hero carries a rod, Valerie does not. Queue includes fishing spot.
    hero.addItem('fishing_rod', 1);
    scene.gatheringQueue = [spot1];
    scene.gatheringQueueWorkers = new Set([hero, valerie]);
    scene.gatheringWorkerNodeAssignments.clear();

    scene.processGatheringQueue();
    assert.strictEqual(scene.gatheringWorkerNodeAssignments.get(hero), spot1, 'Hero carrying rod is assigned to fishing spot');
    assert.strictEqual(scene.gatheringWorkerNodeAssignments.has(valerie), false, 'Valerie without rod is not assigned to fishing spot');

    console.log('✔ Test 5 passed: Gathering Mode queue skips tool-lacking nodes with exactly one toast and assigns tool carriers correctly.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Genericness Proof (Synthetic Dummy Gathering Node & Tool)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Genericness Proof (Synthetic Dummy Node & Tool) ---');
  {
    const { scene } = createMockMainScene(MainScene);
    const heroData = dataLoader.getPlayer();
    const hero = new Player(scene, 10, 10, heroData, null, 16, 'hero-sprite');
    hero.entityName = 'SyntheticHero';
    scene.party = [hero];

    // Define a totally made-up synthetic gathering node definition with a made-up required tool
    const syntheticDef: any = {
      id: 'synthetic_resonator_matrix',
      name: 'Resonator Matrix',
      skillId: 'astral_tuning',
      resourceId: 'astral_dust',
      yieldCount: 1,
      expGranted: 15,
      channelDurationMs: 1500,
      respawnTimeMs: 15000,
      textureKey: 'dummy-tex',
      textureDepletedKey: 'dummy-depleted',
      label: 'Resonator Matrix',
      depletedLabel: 'Tuned Out',
      color: '#c084fc',
      actionVerb: 'Tuning',
      requiredToolItemId: 'synthetic_plasma_resonator'
    };

    const mockSprite: any = {
      x: 32,
      y: 32,
      on: () => mockSprite,
      setTexture: () => mockSprite
    };
    const mockLabel: any = {
      setText: () => mockLabel,
      setColor: () => mockLabel
    };

    const dummyNode: any = {
      x: 2,
      y: 2,
      sprite: mockSprite,
      label: mockLabel,
      nodeDef: syntheticDef,
      isHarvested: false
    };

    // Hero lacks synthetic_plasma_resonator
    assert.strictEqual(hero.getItemCount('synthetic_plasma_resonator'), 0);
    const checkNoTool = scene.canInteractWithGatheringNode(dummyNode, hero);
    assert.strictEqual(checkNoTool.canInteract, false, 'Synthetic node interaction must be blocked when lacking dummy tool');
    assert.ok(checkNoTool.reason?.includes('synthetic_plasma_resonator'));
    assert.strictEqual(scene.startGatherChannel(hero, dummyNode), false, 'Channeling synthetic node must fail');

    // Hero acquires synthetic_plasma_resonator
    hero.addItem('synthetic_plasma_resonator', 1);
    assert.strictEqual(hero.getItemCount('synthetic_plasma_resonator'), 1);

    const checkWithTool = scene.canInteractWithGatheringNode(dummyNode, hero);
    assert.strictEqual(checkWithTool.canInteract, true, 'Synthetic node interaction succeeds once dummy tool is acquired');
    assert.strictEqual(scene.startGatherChannel(hero, dummyNode), true, 'Channeling synthetic node succeeds with dummy tool');

    console.log('✔ Test 6 passed: Synthetic dummy node with synthetic tool confirmed 100% data-driven generic engine support.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Code Audit — Zero Skill-Name Comparisons in Interaction Path
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Code Audit — Zero Skill-Name Comparisons in Interaction Path ---');
  {
    const mainSceneCode = fs.readFileSync('src/scenes/MainScene.ts', 'utf8');

    // Extract canInteractWithGatheringNode body
    const canInteractMatch = mainSceneCode.match(/canInteractWithGatheringNode\s*\([^)]*\)\s*:\s*\{[^}]*\}\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(canInteractMatch, 'canInteractWithGatheringNode method must exist in MainScene.ts');
    const fnBody = canInteractMatch[1];

    assert.strictEqual(fnBody.includes('fishing'), false, 'canInteractWithGatheringNode must NOT check "fishing"');
    assert.strictEqual(fnBody.includes('skillId'), false, 'canInteractWithGatheringNode must NOT check skillId');
    assert.strictEqual(fnBody.includes('digging'), false, 'canInteractWithGatheringNode must NOT check digging');
    assert.strictEqual(fnBody.includes('skinning'), false, 'canInteractWithGatheringNode must NOT check skinning');
    assert.strictEqual(fnBody.includes('butchering'), false, 'canInteractWithGatheringNode must NOT check butchering');

    console.log('✔ Test 7 passed: Confirmed zero skill-name or skillId comparisons exist in canInteractWithGatheringNode.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 7 FISHING CORRECTION UNIT & INTEGRATION TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runFishingCorrectionTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
