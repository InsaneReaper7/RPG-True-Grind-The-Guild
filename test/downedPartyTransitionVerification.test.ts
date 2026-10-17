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

async function runDownedMemberTransitionTest() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING: DOWNED PARTY MEMBERS TRAVEL WITH CONSCIOUS TELEPORTER TRIGGER');
  console.log('========================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const playerData = dataLoader.getPlayer();
  const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId)!;
  const classesData = dataLoader.getClassesData();

  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(playerData);

  // Setup mock scene infrastructure
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

  // --- Step 1: Initialize Dungeon MainScene with 3 Party Members ---
  console.log('[Step 1] Booting MainScene with 3-member party (Hero, Valerie, Kaelen)...');
  const dungeonScene = new MainScene();
  (dungeonScene as any).sys = mockSys;
  (dungeonScene as any).time = mockTime;
  (dungeonScene as any).add = mockAdd;
  (dungeonScene as any).make = mockMake;
  (dungeonScene as any).textures = mockTextures;
  (dungeonScene as any).input = mockInput;
  (dungeonScene as any).cameras = mockCameras;
  (dungeonScene as any).tweens = mockTweens;
  const mockEvents = { once: () => {}, on: () => {}, emit: () => {} };
  (dungeonScene as any).events = mockEvents;
  (dungeonScene as any).scene = { restart: () => {}, start: () => {} };

  dungeonScene.create();

  // Add 3rd member (Kaelen) so party has 3 members
  dungeonScene.spawnTestCompanion();

  assert.strictEqual(dungeonScene.party.length, 3, 'Party has 3 members instantiated in Dungeon');
  const hero = dungeonScene.party[0];
  const valerie = dungeonScene.party[1];
  const kaelen = dungeonScene.party[2];

  console.log(`  Party member 0: ${hero.entityName} (Leader)`);
  console.log(`  Party member 1: ${valerie.entityName}`);
  console.log(`  Party member 2: ${kaelen.entityName}`);

  // --- Step 2: Simulate Leader (Hero) and Kaelen Downed Far Away from Crystal ---
  console.log('\n[Step 2] Down the Leader (Hero) and Kaelen, leaving Valerie conscious...');
  hero.gridPos = { x: 5, y: 5 };
  hero.x = 5 * 32 + 16;
  hero.y = 5 * 32 + 16;
  hero.hp = 0;
  hero.criticalHp = 0;
  hero.state = 'downed';
  hero.showReviveIcon();

  kaelen.gridPos = { x: 6, y: 5 };
  kaelen.x = 6 * 32 + 16;
  kaelen.y = 6 * 32 + 16;
  kaelen.hp = 0;
  kaelen.criticalHp = 0;
  kaelen.state = 'downed';
  kaelen.showReviveIcon();

  // Valerie is conscious and positioned at the Teleporter Crystal
  const crystalPos = (dungeonScene as any).crystalPos;
  valerie.gridPos = { x: crystalPos.x + 1, y: crystalPos.y };
  valerie.x = valerie.gridPos.x * 32 + 16;
  valerie.y = valerie.gridPos.y * 32 + 16;
  valerie.hp = 50;
  valerie.criticalHp = 25;
  valerie.state = 'idle';

  console.log(`  Hero: state='${hero.state}', HP=${hero.hp}/${hero.maxHp}, Pos=(${hero.gridPos.x}, ${hero.gridPos.y})`);
  console.log(`  Kaelen: state='${kaelen.state}', HP=${kaelen.hp}/${kaelen.maxHp}, Pos=(${kaelen.gridPos.x}, ${kaelen.gridPos.y})`);
  console.log(`  Valerie: state='${valerie.state}', HP=${valerie.hp}/${valerie.maxHp}, Pos=(${valerie.gridPos.x}, ${valerie.gridPos.y}), Crystal=(${crystalPos.x}, ${crystalPos.y})`);

  assert.strictEqual(hero.state, 'downed');
  assert.strictEqual(kaelen.state, 'downed');
  assert.strictEqual(valerie.state, 'idle');
  const distHeroToCrystal = Math.hypot(hero.gridPos.x - crystalPos.x, hero.gridPos.y - crystalPos.y);
  console.log(`  Distance between Downed Leader and Crystal: ${distHeroToCrystal.toFixed(1)} tiles (physically separated)`);
  assert.ok(distHeroToCrystal > 5, 'Leader is physically separated from the crystal');

  // --- Step 3: Trigger Transition to Outpost via Valerie ---
  console.log('\n[Step 3] Conscious Valerie triggers Return to Outpost (executeTransitionToOutpost)...');
  dungeonScene.executeTransitionToOutpost();

  const savedPartySnaps = gameState.getPartySnapshots();
  console.log(`  Snapshots saved by GameState: ${savedPartySnaps.length} members`);
  assert.strictEqual(savedPartySnaps.length, 3, 'All 3 members saved in party snapshots');

  assert.strictEqual(savedPartySnaps[0].name, 'Guild Hero');
  assert.strictEqual(savedPartySnaps[0].state, 'downed', 'Hero snapshot retains downed state');
  assert.strictEqual(savedPartySnaps[0].hp, 0, 'Hero snapshot retains 0 HP');

  assert.strictEqual(savedPartySnaps[1].name, 'Valerie');
  assert.strictEqual(savedPartySnaps[1].state, 'idle', 'Valerie snapshot retains conscious idle state');
  assert.strictEqual(savedPartySnaps[1].hp, 50, 'Valerie snapshot retains 50 HP');

  assert.strictEqual(savedPartySnaps[2].name, 'Kaelen');
  assert.strictEqual(savedPartySnaps[2].state, 'downed', 'Kaelen snapshot retains downed state');
  assert.strictEqual(savedPartySnaps[2].hp, 0, 'Kaelen snapshot retains 0 HP');

  console.log('  ✔ Saved snapshots correctly capture all 3 members with respective conscious/downed states');

  // --- Step 4: Boot Destination OutpostScene and Verify All 3 Arrived ---
  console.log('\n[Step 4] Spawning OutpostScene from saved snapshot...');
  const outpostScene = new OutpostScene();
  (outpostScene as any).sys = mockSys;
  (outpostScene as any).time = { now: 2000, delayedCall: () => ({ remove: () => {} }) };
  (outpostScene as any).add = mockAdd;
  (outpostScene as any).make = mockMake;
  (outpostScene as any).textures = mockTextures;
  (outpostScene as any).input = mockInput;
  (outpostScene as any).cameras = mockCameras;
  (outpostScene as any).tweens = mockTweens;
  (outpostScene as any).events = mockEvents;
  (outpostScene as any).scene = { restart: () => {}, start: () => {} };

  outpostScene.create();

  console.log(`  Outpost party count: ${outpostScene.party.length}`);
  assert.strictEqual(outpostScene.party.length, 3, 'CRITICAL: All 3 party members arrived together in the Outpost!');

  const outpostHero = outpostScene.party[0];
  const outpostValerie = outpostScene.party[1];
  const outpostKaelen = outpostScene.party[2];

  console.log(`  Outpost Member 0: ${outpostHero.entityName} — state='${outpostHero.state}', HP=${outpostHero.hp}/${outpostHero.maxHp}`);
  console.log(`  Outpost Member 1: ${outpostValerie.entityName} — state='${outpostValerie.state}', HP=${outpostValerie.hp}/${outpostValerie.maxHp}`);
  console.log(`  Outpost Member 2: ${outpostKaelen.entityName} — state='${outpostKaelen.state}', HP=${outpostKaelen.hp}/${outpostKaelen.maxHp}`);

  assert.strictEqual(outpostHero.entityName, 'Guild Hero');
  assert.strictEqual(outpostHero.state, 'downed', 'Downed Leader arrived in Outpost and is still Downed (not lost, not dead)');
  assert.strictEqual(outpostHero.hp, 0, 'Downed Leader retains 0 HP');

  assert.strictEqual(outpostValerie.entityName, 'Valerie');
  assert.strictEqual(outpostValerie.state, 'idle', 'Conscious member arrived intact and conscious');
  assert.strictEqual(outpostValerie.hp, 50);

  assert.strictEqual(outpostKaelen.entityName, 'Kaelen');
  assert.strictEqual(outpostKaelen.state, 'downed', 'Downed companion arrived in Outpost and is still Downed');
  assert.strictEqual(outpostKaelen.hp, 0);

  console.log('  ✔ All members spawned at the Outpost portal together in formation.');

  // --- Step 5: Test Continue Descent (Next Floor) Transition ---
  console.log('\n[Step 5] Testing Continue Descent to Floor 2 with Downed Leader...');
  // Reset floor count to simulate mid-dungeon descent
  gameState.incrementDungeonFloorCount(); // Floor 1
  (dungeonScene as any).isTransitioning = false;

  dungeonScene.executeContinueDescent();

  const descentDungeonScene = new MainScene();
  (descentDungeonScene as any).sys = mockSys;
  (descentDungeonScene as any).time = { now: 3000, delayedCall: () => ({ remove: () => {} }) };
  (descentDungeonScene as any).add = mockAdd;
  (descentDungeonScene as any).make = mockMake;
  (descentDungeonScene as any).textures = mockTextures;
  (descentDungeonScene as any).input = mockInput;
  (descentDungeonScene as any).cameras = mockCameras;
  (descentDungeonScene as any).tweens = mockTweens;
  (descentDungeonScene as any).scene = { restart: () => {}, start: () => {} };
  (descentDungeonScene as any).events = mockEvents;

  descentDungeonScene.create();

  console.log(`  Floor 2 party count: ${descentDungeonScene.party.length}`);
  assert.strictEqual(descentDungeonScene.party.length, 3, 'CRITICAL: All 3 party members arrived together on Floor 2!');

  const floor2Hero = descentDungeonScene.party[0];
  const floor2Valerie = descentDungeonScene.party[1];
  const floor2Kaelen = descentDungeonScene.party[2];

  assert.strictEqual(floor2Hero.state, 'downed', 'Hero remains downed on Floor 2 arrival');
  assert.strictEqual(floor2Hero.hp, 0);
  assert.strictEqual(floor2Valerie.state, 'idle', 'Valerie remains conscious on Floor 2');
  assert.strictEqual(floor2Kaelen.state, 'downed', 'Kaelen remains downed on Floor 2');

  console.log('  ✔ Descent transition also carries over all party members including Downed ones.');

  console.log('\n========================================================================');
  console.log('🎉 VERIFICATION CONFIRMED: NO PARTY MEMBER IS EVER LEFT BEHIND! 🎉');
  console.log('========================================================================\n');
}

runDownedMemberTransitionTest().catch((err) => {
  console.error('❌ Downed member transition verification failed:', err);
  process.exit(1);
});
