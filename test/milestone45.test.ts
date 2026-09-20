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

async function runMilestone45Tests() {
  console.log('================================================================');
  console.log('⚔️ RUNNING MILESTONE 45: CHANGEABLE PARTY LEADER TEST SUITE ⚔️');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const playerData = dataLoader.getPlayer();
  const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId)!;
  const classesData = dataLoader.getClassesData();

  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(playerData);

  // --- TEST 1: Initial State & Hero as Default Leader ---
  console.log('--- TEST 1: Initial Party Setup & Leader Invariants ---');
  const outpost = new OutpostScene();
  // Mock Phaser scene lifecycle necessities
  (outpost as any).sys = {
    settings: { data: {} },
    queueDepthSort: () => {},
    events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
    input: { enable: () => {}, disable: () => {} }
  };
  (outpost as any).make = {
    tilemap: () => ({
      addTilesetImage: () => ({}),
      createLayer: () => ({ setDepth: () => {} })
    }),
    graphics: () => ({
      fillStyle: () => {},
      fillRect: () => {},
      fillCircle: () => {},
      lineStyle: () => {},
      strokeRect: () => {},
      strokeCircle: () => {},
      lineBetween: () => {},
      generateTexture: () => {},
      destroy: () => {}
    })
  };
  (outpost as any).textures = {
    exists: () => true
  };
  (outpost as any).time = { now: 1000 };
  (outpost as any).events = { once: () => {}, on: () => {}, off: () => {}, emit: () => {} };
  (outpost as any).tweens = { add: () => ({ remove: () => {} }) };
  const createMockObj = () => {
    const obj: any = {
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
    return obj;
  };

  (outpost as any).input = {
    mouse: { disableContextMenu: () => {} },
    keyboard: { addKey: () => ({ on: () => {} }) },
    on: () => {},
    off: () => {}
  };
  let followedCameraTarget: any = null;
  (outpost as any).cameras = {
    main: {
      setBounds: () => {},
      startFollow: (target: any) => {
        followedCameraTarget = target;
      }
    }
  };
  (outpost as any).add = {
    existing: (item: any) => item,
    container: () => createMockObj(),
    image: () => createMockObj(),
    sprite: () => createMockObj(),
    graphics: () => createMockObj(),
    line: () => createMockObj(),
    text: () => createMockObj()
  };

  outpost.create();

  assert.strictEqual(outpost.party.length, 1, 'Party starts with 1 member');
  assert.strictEqual(outpost.player, outpost.party[0], 'outpost.player points to party[0]');
  assert.strictEqual(outpost.player.entityName, 'Guild Hero', 'Initial leader is Guild Hero');
  assert.strictEqual(followedCameraTarget, outpost.player, 'Camera follow target is initially Guild Hero');
  console.log('✔ Test 1 passed: Initial leader is Guild Hero and camera follow is anchored.');

  // --- TEST 2: Companion Addition ---
  console.log('\n--- TEST 2: Spawning Companion (Valerie) ---');
  const companionAdded = outpost.spawnTestCompanion();
  assert.strictEqual(companionAdded, true, 'Companion spawned successfully');
  assert.strictEqual(outpost.party.length, 2, 'Party now has 2 members');
  assert.strictEqual(outpost.party[0].entityName, 'Guild Hero', 'Hero remains at index 0');
  assert.strictEqual(outpost.party[1].entityName, 'Valerie', 'Valerie is companion at index 1');
  console.log('✔ Test 2 passed: Companion Valerie joined party at index 1.');

  // --- TEST 3: Outpost-Only Restriction ---
  console.log('\n--- TEST 3: Mid-Dungeon Leader Swapping Out-of-Scope / Blocked ---');
  const mainScene = new MainScene();
  (mainScene as any).sys = (outpost as any).sys;
  (mainScene as any).make = (outpost as any).make;
  (mainScene as any).textures = (outpost as any).textures;
  (mainScene as any).time = { now: 2000 };
  (mainScene as any).input = (outpost as any).input;
  (mainScene as any).cameras = (outpost as any).cameras;
  (mainScene as any).add = (outpost as any).add;
  (mainScene as any).events = (outpost as any).events;
  (mainScene as any).tweens = (outpost as any).tweens;

  // Call the mid-dungeon guarded helper
  mainScene.create();
  const dungeonSetLeaderResult = (window as any).__setPartyLeader?.(1);
  assert.strictEqual(dungeonSetLeaderResult, false, 'Mid-dungeon leader swapping is blocked');
  console.log('✔ Test 3 passed: Mid-dungeon leader change is strictly rejected.');

  // --- TEST 4: Leader Reassignment in Outpost ---
  console.log('\n--- TEST 4: Promoting Valerie to Party Leader in Outpost ---');
  const heroRef = outpost.party[0];
  const valerieRef = outpost.party[1];

  const promoted = outpost.changePartyLeader(1);
  assert.strictEqual(promoted, true, 'Valerie was promoted to Leader');

  // Verify party order
  assert.strictEqual(outpost.party[0], valerieRef, 'Valerie is now at party[0]');
  assert.strictEqual(outpost.party[1], heroRef, 'Guild Hero is now at party[1]');
  assert.strictEqual(outpost.player, valerieRef, 'outpost.player now returns Valerie');
  assert.strictEqual(outpost.player.entityName, 'Valerie', 'Active leader entityName is Valerie');

  // Verify camera follow updated
  assert.strictEqual(followedCameraTarget, valerieRef, 'Camera follow target shifted to Valerie');

  // Verify progression reference updated to Valerie
  assert.strictEqual(outpost.progressionSystem, valerieRef.progression, 'outpost.progressionSystem is now Valerie progression');
  assert.strictEqual(outpost.progressionSystem.ownerName, 'Valerie', 'Progression ownerName is Valerie');
  console.log('✔ Test 4 passed: Valerie successfully designated Leader and core references updated.');

  // --- TEST 5: System Invariants Under New Leader (Formation Slot 0, Highlights, Actions) ---
  console.log('\n--- TEST 5: Invariant Verification (Formation Slot 0, Highlight Colors, EXP) ---');
  // 5a. Destination highlight colors
  const testDestinations = [
    { x: 10, y: 10 },
    { x: 11, y: 10 }
  ];
  outpost.showMoveDestinationHighlights(testDestinations, outpost.party);
  assert.strictEqual(outpost.activeMoveHighlights.length, 2, 'Two destination highlights created');
  assert.strictEqual(outpost.activeMoveHighlights[0].unit, valerieRef, 'Highlight 0 corresponds to Valerie');
  assert.strictEqual(outpost.activeMoveHighlights[0].isLeader, true, 'Valerie receives isLeader=true (Cyan highlight)');
  assert.strictEqual(outpost.activeMoveHighlights[1].unit, heroRef, 'Highlight 1 corresponds to Guild Hero');
  assert.strictEqual(outpost.activeMoveHighlights[1].isLeader, false, 'Guild Hero receives isLeader=false (Emerald highlight)');

  // 5b. Sub-group highlight bugfix verification
  outpost.showMoveDestinationHighlights([{ x: 15, y: 15 }], [heroRef]);
  assert.strictEqual(outpost.activeMoveHighlights[0].isLeader, false, 'Hero moving alone does NOT falsely get leader highlight when Valerie is Leader');

  // 5c. EXP accrual on active leader
  const valerieInitialConstExp = valerieRef.progression.getProficiencyStat('construction').currentExp;
  outpost.progressionSystem.addProficiencyExp('construction', 25);
  assert.strictEqual(valerieRef.progression.getProficiencyStat('construction').currentExp, valerieInitialConstExp + 25, 'Construction EXP accrued to Valerie');
  console.log('✔ Test 5 passed: Formation highlights and active leader EXP accrual correctly follow Valerie.');

  // --- TEST 6: Downed Member Cannot Become Leader ---
  console.log('\n--- TEST 6: Downed State Guard ---');
  heroRef.state = 'downed';
  const promoteDownedHero = outpost.changePartyLeader(1);
  assert.strictEqual(promoteDownedHero, false, 'Cannot designate a downed member as leader');
  assert.strictEqual(outpost.party[0], valerieRef, 'Valerie remains leader');
  heroRef.state = 'idle';
  console.log('✔ Test 6 passed: Downed party member cannot be designated as Leader.');

  // --- TEST 7: Scene Transition Persistence (Outpost -> Dungeon -> Outpost) ---
  console.log('\n--- TEST 7: Scene Transition Persistence to Dungeon and Return ---');
  // Trigger save at transition
  gameState.savePartySnapshot(outpost.party, 3000);
  gameState.saveSnapshot(outpost.player, outpost.progressionSystem, 3000);

  const savedSnaps = gameState.getPartySnapshots();
  assert.strictEqual(savedSnaps[0].name, 'Valerie', 'Saved snapshot 0 is Valerie');
  assert.strictEqual(savedSnaps[1].name, 'Guild Hero', 'Saved snapshot 1 is Guild Hero');

  // Create fresh MainScene simulating entering Floor 1
  const dungeonScene = new MainScene();
  (dungeonScene as any).sys = (outpost as any).sys;
  (dungeonScene as any).make = (outpost as any).make;
  (dungeonScene as any).textures = (outpost as any).textures;
  (dungeonScene as any).time = { now: 4000 };
  (dungeonScene as any).input = (outpost as any).input;
  let dungeonCameraTarget: any = null;
  (dungeonScene as any).cameras = {
    main: {
      setBounds: () => {},
      startFollow: (target: any) => {
        dungeonCameraTarget = target;
      }
    }
  };
  (dungeonScene as any).add = (outpost as any).add;
  (dungeonScene as any).events = (outpost as any).events;
  (dungeonScene as any).tweens = (outpost as any).tweens;

  dungeonScene.create();

  assert.strictEqual(dungeonScene.party.length, 2, 'Dungeon party spawned 2 members');
  assert.strictEqual(dungeonScene.party[0].entityName, 'Valerie', 'Dungeon party[0] is Valerie');
  assert.strictEqual(dungeonScene.party[1].entityName, 'Guild Hero', 'Dungeon party[1] is Guild Hero');
  assert.strictEqual(dungeonScene.player, dungeonScene.party[0], 'dungeonScene.player is Valerie');
  assert.strictEqual(dungeonCameraTarget, dungeonScene.player, 'Dungeon camera followed Valerie');

  // Simulate returning from Dungeon back to Outpost
  gameState.savePartySnapshot(dungeonScene.party, 5000);
  gameState.saveSnapshot(dungeonScene.player, dungeonScene.progressionSystem, 5000);

  const returnOutpost = new OutpostScene();
  (returnOutpost as any).sys = (outpost as any).sys;
  (returnOutpost as any).make = (outpost as any).make;
  (returnOutpost as any).textures = (outpost as any).textures;
  (returnOutpost as any).time = { now: 6000 };
  (returnOutpost as any).input = (outpost as any).input;
  (returnOutpost as any).cameras = (outpost as any).cameras;
  (returnOutpost as any).add = (outpost as any).add;
  (returnOutpost as any).events = (outpost as any).events;
  (returnOutpost as any).tweens = (outpost as any).tweens;

  returnOutpost.create();

  assert.strictEqual(returnOutpost.party[0].entityName, 'Valerie', 'Returned outpost leader is Valerie');
  assert.strictEqual(returnOutpost.party[1].entityName, 'Guild Hero', 'Returned outpost companion is Guild Hero');
  console.log('✔ Test 7 passed: Leadership seamlessly persisted through Dungeon entry and Return to Outpost.');

  // --- TEST 8: Reversibility (Promoting Hero Back to Leader) ---
  console.log('\n--- TEST 8: Reversibility — Promoting Hero Back to Leader ---');
  const rePromoteHero = returnOutpost.changePartyLeader(1);
  assert.strictEqual(rePromoteHero, true, 'Hero was re-promoted to Leader');
  assert.strictEqual(returnOutpost.party[0].entityName, 'Guild Hero', 'Guild Hero is now index 0');
  assert.strictEqual(returnOutpost.party[1].entityName, 'Valerie', 'Valerie is now index 1');
  assert.strictEqual(returnOutpost.player.entityName, 'Guild Hero', 'returnOutpost.player is Guild Hero');
  assert.strictEqual(returnOutpost.progressionSystem.ownerName, 'Guild Hero', 'Progression owner restored to Guild Hero');

  // Test debug hook
  const hookResult = (window as any).__setPartyLeader?.('Valerie');
  assert.strictEqual(hookResult, true, 'Window debug hook __setPartyLeader cleanly switched leader to Valerie');
  assert.strictEqual(returnOutpost.player.entityName, 'Valerie', 'Player is Valerie via debug hook');

  const hookLeader = (window as any).__getPartyLeader?.();
  assert.strictEqual(hookLeader, returnOutpost.player, '__getPartyLeader returns current active leader');
  console.log('✔ Test 8 passed: Reversibility verified and debug hooks operate without issues.');

  console.log('\n================================================================');
  console.log('🎉 ALL 8 MILESTONE 45 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone45Tests().catch((err) => {
  console.error('❌ Milestone 45 test suite failed:', err);
  process.exit(1);
});
