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
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function createMockObj() {
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
    fillRect: () => obj,
    strokeRect: () => obj,
    lineStyle: () => obj,
    fillStyle: () => obj,
    strokeCircle: () => obj,
    fillCircle: () => obj,
    strokePath: () => obj,
    beginPath: () => obj,
    moveTo: () => obj,
    lineTo: () => obj,
    closePath: () => obj,
    stroke: () => obj,
    fill: () => obj,
    lineBetween: () => obj,
    generateTexture: () => obj,
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {},
    x: 0,
    y: 0,
    width: 32,
    height: 32
  };
  return obj;
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🛡️ TESTING DOWNED LEADER SOFTLOCK FIX (BOTH COMPONENTS + INVARIANTS) 🛡️');
  console.log('========================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const playerData = dataLoader.getPlayer();

  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(playerData);

  const mockSys = {
    settings: { data: {} },
    queueDepthSort: () => {},
    events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
    input: { enable: () => {}, disable: () => {} },
    game: { config: { width: 800, height: 600 } },
    canvas: { width: 800, height: 600 },
    displayList: { add: () => {}, remove: () => {} },
    updateList: { add: () => {}, remove: () => {} }
  };
  const mockTime = { now: 1000, delayedCall: () => ({ remove: () => {} }) };
  const mockAdd = {
    existing: (obj: any) => obj,
    container: () => createMockObj(),
    image: () => createMockObj(),
    sprite: () => createMockObj(),
    graphics: () => createMockObj(),
    line: () => createMockObj(),
    text: () => createMockObj()
  };
  const mockMake = {
    tilemap: () => ({
      addTilesetImage: () => ({}),
      createLayer: () => ({})
    })
  };
  const mockTextures = {
    exists: () => true,
    get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) })
  };
  const mockInput = {
    mouse: { disableContextMenu: () => {} },
    keyboard: {
      createCursorKeys: () => ({}),
      addKey: () => ({ on: () => {}, isDown: false, reset: () => {} })
    },
    on: () => {},
    off: () => {}
  };
  const mockCameras = {
    main: {
      setBounds: () => {},
      startFollow: () => {},
      stopFollow: () => {},
      getWorldPoint: (x: number, y: number) => ({ x, y }),
      scrollX: 0,
      scrollY: 0
    }
  };
  const mockTweens = {
    add: () => ({ remove: () => {} })
  };
  const mockEvents = { once: () => {}, on: () => {}, emit: () => {} };

  // =========================================================================
  // TEST 1: Normal leader-swapping remains strictly locked in dungeon when Leader is conscious
  // =========================================================================
  console.log('[Test 1] Testing normal leader-swapping restriction in Dungeon when Leader is conscious...');
  const dungeon = new MainScene();
  (dungeon as any).sys = mockSys;
  (dungeon as any).time = mockTime;
  (dungeon as any).add = mockAdd;
  (dungeon as any).make = mockMake;
  (dungeon as any).textures = mockTextures;
  (dungeon as any).input = mockInput;
  (dungeon as any).cameras = mockCameras;
  (dungeon as any).tweens = mockTweens;
  (dungeon as any).events = mockEvents;
  (dungeon as any).scene = { restart: () => {}, start: () => {} };

  dungeon.create();
  assert.strictEqual(dungeon.party.length, 2, 'Dungeon started with Hero and Valerie');
  assert.strictEqual(dungeon.player.entityName, 'Guild Hero');
  assert.strictEqual(dungeon.player.state, 'idle', 'Leader is conscious');

  // Attempting to swap leader mid-dungeon while leader is conscious MUST return false
  const consciousSwapResult = dungeon.changePartyLeader(1);
  assert.strictEqual(consciousSwapResult, false, 'Leader-swap mid-dungeon is blocked when leader is conscious');
  assert.strictEqual(dungeon.party[0].entityName, 'Guild Hero', 'Guild Hero remains Leader');
  console.log('  ✔ Test 1 passed: Normal leader swapping is correctly blocked mid-dungeon when leader is conscious.');

  // =========================================================================
  // TEST 2: Emergency leader promotion mid-dungeon specifically when Leader is Downed
  // =========================================================================
  console.log('\n[Test 2] Testing emergency leader promotion mid-dungeon when Leader is Downed...');
  const hero = dungeon.party[0];
  hero.hp = 0;
  hero.criticalHp = 0;
  hero.state = 'downed';
  hero.showReviveIcon();

  assert.strictEqual(dungeon.player.state, 'downed', 'Leader is now genuinely Downed');

  // Try promoting a downed member (should fail)
  dungeon.spawnTestCompanion(); // Companion 2: Kaelen
  const kaelen = dungeon.party[2];
  kaelen.hp = 0;
  kaelen.criticalHp = 0;
  kaelen.state = 'downed';

  const promoteDownedResult = dungeon.changePartyLeader(2);
  assert.strictEqual(promoteDownedResult, false, 'Cannot designate a downed ally as Leader');

  // Promote conscious Companion 1 (Valerie)
  const promoteValerieResult = dungeon.changePartyLeader(1);
  assert.strictEqual(promoteValerieResult, true, 'Emergency swap succeeded for conscious Valerie');
  assert.strictEqual(dungeon.party[0].entityName, 'Valerie', 'Valerie is now index 0 (Leader)');
  assert.strictEqual(dungeon.party[1].entityName, 'Guild Hero', 'Former leader is now index 1');
  assert.strictEqual(dungeon.player.entityName, 'Valerie', 'this.player points to Valerie');
  assert.strictEqual(dungeon.player.state, 'idle', 'New leader is conscious and controllable');

  // Verify that now that Valerie (conscious) is Leader, mid-dungeon leader swapping is re-locked!
  const reLockCheck = dungeon.changePartyLeader(1);
  assert.strictEqual(reLockCheck, false, 'Swapping is immediately re-locked once new leader is conscious');
  console.log('  ✔ Test 2 passed: Emergency leader swap succeeds when leader is downed and immediately re-locks once conscious.');

  // =========================================================================
  // TEST 3: Teleporter Crystal Interaction by conscious companion when Leader is Downed
  // =========================================================================
  console.log('\n[Test 3] Testing Teleporter Crystal interaction with Downed Leader...');
  const currentValerie = dungeon.party.find(m => m.entityName === 'Valerie')!;
  dungeon.party = [hero, currentValerie, kaelen];
  assert.strictEqual(dungeon.player, hero);
  assert.strictEqual(hero.state, 'downed');

  let modalOpened = false;
  (dungeon as any).openCrystalModal = () => {
    modalOpened = true;
  };

  const crystalPos = (dungeon as any).crystalPos;
  const valerie = dungeon.party[1];
  // Place Valerie adjacent to crystal
  valerie.gridPos = { x: crystalPos.x + 1, y: crystalPos.y };
  // Hero is far away at (2, 2)
  hero.gridPos = { x: 2, y: 2 };

  // Trigger crystal interaction
  (dungeon as any).triggerCrystalInteraction();

  assert.strictEqual(modalOpened, true, 'Teleporter Crystal modal opened because conscious Valerie is adjacent, despite Hero being Downed far away');
  console.log('  ✔ Test 3 passed: Conscious companion triggers Teleporter Crystal modal while Leader is Downed.');

  // =========================================================================
  // TEST 4: Conscious Companion Pathfinding to Crystal when not initially adjacent
  // =========================================================================
  console.log('\n[Test 4] Testing conscious companion pathfinding to Crystal when not initially adjacent...');
  modalOpened = false;
  // Move Valerie away from crystal to (10, 10)
  valerie.gridPos = { x: 10, y: 10 };
  (dungeon as any).pathfinder = {
    findPath: async (from: any, to: any) => [{ x: to.x, y: to.y }]
  };

  (dungeon as any).triggerCrystalInteraction();
  assert.ok(valerie.claimedDestination !== null, 'Valerie was assigned destination near crystal');
  assert.strictEqual(hero.claimedDestination, null, 'Downed Hero was NOT commanded to move');
  console.log('  ✔ Test 4 passed: Conscious companion pathfinds toward crystal while downed leader is stationary.');

  // =========================================================================
  // TEST 5: Outpost Portal Interaction by conscious companion
  // =========================================================================
  console.log('\n[Test 5] Testing Outpost Portal interaction generalized to conscious members...');
  const outpost = new OutpostScene();
  (outpost as any).sys = mockSys;
  (outpost as any).time = mockTime;
  (outpost as any).add = mockAdd;
  (outpost as any).make = mockMake;
  (outpost as any).textures = mockTextures;
  (outpost as any).input = mockInput;
  (outpost as any).cameras = mockCameras;
  (outpost as any).tweens = mockTweens;
  (outpost as any).events = mockEvents;
  (outpost as any).scene = { restart: () => {}, start: () => {} };

  outpost.create();
  // Ensure party has 3 members
  outpost.spawnTestCompanion();

  let outpostTransitioned = false;
  (outpost as any).executeTransitionToDungeon = () => {
    outpostTransitioned = true;
  };

  const portalPos = (outpost as any).portalPos;
  // Put Valerie adjacent to portal
  outpost.party[1].gridPos = { x: portalPos.x + 1, y: portalPos.y };
  (outpost as any).triggerPortalTransition();

  assert.strictEqual(outpostTransitioned, true, 'Outpost portal transition triggered by adjacent conscious companion');
  console.log('  ✔ Test 5 passed: Outpost portal transition functions with any conscious party member.');

  console.log('\n========================================================================');
  console.log('🎉 ALL 5 SOFTLOCK FIX TESTS PASSED WITH 100% SUCCESS! 🎉');
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('❌ Softlock fix test suite failed:', err);
  process.exit(1);
});
