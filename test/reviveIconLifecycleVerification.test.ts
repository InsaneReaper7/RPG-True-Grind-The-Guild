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
    destroy: () => {
      obj.isDestroyed = true;
    },
    isDestroyed: false,
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
    add: () => obj,
    x: 0,
    y: 0,
    width: 32,
    height: 32
  };
  return obj;
}

async function runReviveIconLifecycleTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING: REVIVE ICON LIFECYCLE & TEARDOWN ACROSS ALL REVIVAL PATHS');
  console.log('========================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const playerData = dataLoader.getPlayer();
  const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId)!;

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
    sprite: () => createMockObj(),
    image: () => createMockObj(),
    text: () => createMockObj(),
    graphics: () => createMockObj(),
    container: () => createMockObj(),
    circle: () => createMockObj(),
    existing: (o: any) => o
  };
  const mockMake = {
    tilemap: () => ({
      addTilesetImage: () => ({}),
      createLayer: () => createMockObj(),
      width: 20,
      height: 20
    })
  };
  const mockTextures = {
    exists: (k: string) => true
  };
  const mockInput = {
    mouse: { disableContextMenu: () => {} },
    on: () => {},
    off: () => {}
  };
  const mockCameras = {
    main: {
      setBounds: () => {},
      startFollow: () => {},
      stopFollow: () => {}
    }
  };
  const mockTweens = {
    add: () => ({
      stop: () => {},
      remove: () => {}
    })
  };
  const mockEvents = {
    once: () => {},
    on: () => {},
    off: () => {},
    emit: () => {}
  };

  function setupSceneMocks(scene: any) {
    scene.sys = mockSys;
    scene.time = mockTime;
    scene.add = mockAdd;
    scene.make = mockMake;
    scene.textures = mockTextures;
    scene.input = mockInput;
    scene.cameras = mockCameras;
    scene.tweens = mockTweens;
    scene.events = mockEvents;
    scene.scene = { restart: () => {}, start: () => {} };
  }

  // =========================================================================
  // TEST 1: Member Arrives Downed via Teleport -> Revived by Outpost Bed
  // =========================================================================
  console.log('[Test 1] Member arrives Downed via Teleport -> Revived by Outpost Bed');

  // Configure party in GameState with 1 conscious hero, 1 downed companion (Valerie)
  const valerieSnap = {
    id: 'companion_1',
    name: 'Valerie',
    avatarKey: 'companion-avatar',
    avatarTextureKey: 'companion-avatar',
    x: 4,
    y: 4,
    hp: 0,
    criticalHp: 0,
    energy: 100,
    equippedWeaponId: 'short_swords',
    offhandWeaponId: null,
    equippedHelmetId: null,
    equippedBodyArmorId: null,
    equippedNecklaceId: null,
    equippedRingId: null,
    equippedAccessoryId: null,
    baseCarryCapacity: 45,
    inventory: {},
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    activeClass: null,
    proficiencies: {},
    classLevels: {},
    classStats: {},
    unlockedClasses: [],
    activityCounts: {},
    bookLearnedSkills: [],
    hunger: 100,
    mood: 80,
    state: 'downed' as const
  };

  const heroSnap = {
    id: 'player',
    name: 'Guild Hero',
    avatarKey: 'player-avatar',
    avatarTextureKey: 'player-avatar',
    x: 3,
    y: 3,
    hp: 50,
    criticalHp: 25,
    energy: 100,
    equippedWeaponId: 'short_swords',
    offhandWeaponId: null,
    equippedHelmetId: null,
    equippedBodyArmorId: null,
    equippedNecklaceId: null,
    equippedRingId: null,
    equippedAccessoryId: null,
    baseCarryCapacity: 45,
    inventory: {},
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    activeClass: null,
    proficiencies: {},
    classLevels: {},
    classStats: {},
    unlockedClasses: [],
    activityCounts: {},
    bookLearnedSkills: [],
    hunger: 100,
    mood: 80,
    state: 'idle' as const
  };

  (gameState as any).partySnapshots = [heroSnap, valerieSnap];

  const outpost = new OutpostScene();
  setupSceneMocks(outpost);
  outpost.create();

  assert.strictEqual(outpost.party.length, 2, 'Outpost has 2 party members instantiated');
  const outpostHero = outpost.party[0];
  const outpostValerie = outpost.party[1];

  assert.strictEqual(outpostValerie.state, 'downed', 'Valerie arrived in Downed state');
  assert.ok(outpostValerie.reviveIconSprite, 'Arrival-created reviveIconSprite is actively present on Valerie');

  // Trigger Outpost bed rest on all party members
  let anyRestored = false;
  for (const member of outpost.party) {
    if (member.rest()) {
      anyRestored = true;
    }
  }

  assert.strictEqual(anyRestored, true, 'Bed rest restored at least one party member');
  assert.strictEqual(outpostValerie.state, 'idle', 'Valerie is now conscious (idle)');
  assert.strictEqual(outpostValerie.hp, outpostValerie.maxHp, 'Valerie HP fully restored');
  assert.strictEqual(outpostValerie.criticalHp, outpostValerie.maxCriticalHp, 'Valerie Crit HP fully restored');
  assert.strictEqual(outpostValerie.reviveIconSprite, undefined, 'CRITICAL: Valerie revive icon sprite was destroyed and cleared on bed rest!');

  console.log('  ✔ Test 1 passed: Teleport-arrived downed member revived via Bed correctly destroys revive icon.');

  // =========================================================================
  // TEST 2: Member Goes Downed Mid-Scene -> Revived by Bed
  // =========================================================================
  console.log('\n[Test 2] Member goes Downed mid-scene -> Revived by Bed');

  // Valerie takes lethal damage mid-scene
  outpostValerie.takeDamage(outpostValerie.maxHp + outpostValerie.maxCriticalHp + 50);
  assert.strictEqual(outpostValerie.state, 'downed', 'Valerie entered Downed state mid-scene');
  assert.ok(outpostValerie.reviveIconSprite, 'Mid-scene reviveIconSprite created on Valerie');

  // Rest in bed
  const rested = outpostValerie.rest();
  assert.strictEqual(rested, true, 'Rest succeeded on mid-scene downed member');
  assert.strictEqual(outpostValerie.state, 'idle', 'Valerie conscious after bed rest');
  assert.strictEqual(outpostValerie.reviveIconSprite, undefined, 'CRITICAL: Mid-scene revive icon cleanly destroyed on bed rest.');

  console.log('  ✔ Test 2 passed: Mid-scene downed member revived via Bed correctly destroys revive icon.');

  // =========================================================================
  // TEST 3: Member Arrives Downed via Teleport -> Revived by Revive Potion Channel
  // =========================================================================
  console.log('\n[Test 3] Member arrives Downed via Teleport -> Revived by Revive Potion Channel');

  // Reset to downed arrival
  (gameState as any).partySnapshots = [heroSnap, valerieSnap];
  const outpostPotionScene = new OutpostScene();
  setupSceneMocks(outpostPotionScene);
  outpostPotionScene.create();

  const potionValerie = outpostPotionScene.party[1];
  const potionHero = outpostPotionScene.party[0];
  assert.strictEqual(potionValerie.state, 'downed');
  assert.ok(potionValerie.reviveIconSprite, 'Revive icon present on arrival');

  // Add revive potion to inventory and start channel
  gameState.addItem('revive_potion', 1);
  const channelStarted = outpostPotionScene.startReviveChannel(potionHero, potionValerie);
  assert.strictEqual(channelStarted, true, 'Revive channel started');

  // Complete channel
  const activeChannel = (outpostPotionScene as any).activeReviveChannels.get(potionHero);
  assert.ok(activeChannel);
  outpostPotionScene.completeReviveChannel(potionHero, activeChannel);

  assert.strictEqual(potionValerie.state, 'idle', 'Valerie conscious after channel completion');
  assert.strictEqual(potionValerie.reviveIconSprite, undefined, 'CRITICAL: Revive icon destroyed after Revive Potion channel completion.');

  console.log('  ✔ Test 3 passed: Teleport-arrived downed member revived via Revive Potion channel correctly destroys revive icon.');

  // =========================================================================
  // TEST 4: Member Arrives Downed -> Revived by Combat Medic Mass Revive
  // =========================================================================
  console.log('\n[Test 4] Member arrives Downed -> Revived by Combat Medic Mass Revive');

  const dungeonScene = new MainScene();
  setupSceneMocks(dungeonScene);
  dungeonScene.create();

  // Create a 2nd member who arrives downed in dungeon
  const medicHero = dungeonScene.party[0];
  const downedDungeonAlly = dungeonScene.party[1];
  downedDungeonAlly.restoreFromSnapshot(valerieSnap as any, 3000);

  assert.strictEqual(downedDungeonAlly.state, 'downed');
  assert.ok(downedDungeonAlly.reviveIconSprite, 'Dungeon ally has revive icon');

  // Setup CombatSystem and cast Mass Revive
  const combatSystem = new CombatSystem(dungeonScene);
  combatSystem.setParty(dungeonScene.party);
  medicHero.progression.setClassLevel('combat_medic', 40);
  medicHero.knownSkillIds.push('mass_revive');
  medicHero.equippedSkillIds.push('mass_revive');
  medicHero.energy = 100;
  downedDungeonAlly.x = medicHero.x + 32;
  downedDungeonAlly.y = medicHero.y;

  const massReviveCast = combatSystem.castSkill(medicHero, 'mass_revive', medicHero);
  assert.strictEqual(massReviveCast, true, 'Mass Revive cast succeeded');
  assert.strictEqual(downedDungeonAlly.state, 'idle', 'Ally revived to idle');
  assert.strictEqual(downedDungeonAlly.reviveIconSprite, undefined, 'CRITICAL: Revive icon destroyed after Mass Revive.');

  console.log('  ✔ Test 4 passed: Teleport-arrived downed member revived via Combat Medic Mass Revive correctly destroys revive icon.');

  // =========================================================================
  // TEST 5: Member Recovered via Full Party Wipe (finishWipe)
  // =========================================================================
  console.log('\n[Test 5] Member recovered via Full Party Wipe (finishWipe)');

  downedDungeonAlly.state = 'downed';
  downedDungeonAlly.hp = 0;
  downedDungeonAlly.criticalHp = 0;
  downedDungeonAlly.showReviveIcon();
  assert.ok(downedDungeonAlly.reviveIconSprite, 'Revive icon present before wipe recovery');

  // Trigger party wipe finish logic
  downedDungeonAlly.clearDownedState();
  assert.strictEqual(downedDungeonAlly.state, 'idle');
  assert.strictEqual(downedDungeonAlly.reviveIconSprite, undefined, 'CRITICAL: Revive icon destroyed via clearDownedState in wipe recovery.');

  console.log('  ✔ Test 5 passed: Party wipe recovery correctly tears down revive icon.');

  // =========================================================================
  // TEST 6: Defensive Invariant Enforcement
  // =========================================================================
  console.log('\n[Test 6] Defensive Invariant: Living character cannot display revive icon');

  const consciousHero = outpost.party[0];
  assert.strictEqual(consciousHero.state, 'idle');
  assert.strictEqual(consciousHero.reviveIconSprite, undefined);

  // Attempting to show revive icon while conscious is blocked
  consciousHero.showReviveIcon();
  assert.strictEqual(consciousHero.reviveIconSprite, undefined, 'showReviveIcon blocked while state is not downed');

  // If a reviveIconSprite was somehow manually injected, update() immediately destroys it
  consciousHero.reviveIconSprite = createMockObj();
  assert.ok(consciousHero.reviveIconSprite);
  consciousHero.update(1000, 16);
  assert.strictEqual(consciousHero.reviveIconSprite, undefined, 'CRITICAL: Invariant in update() immediately destroyed stale revive icon on conscious entity!');

  console.log('  ✔ Test 6 passed: Defensive invariant protects against lingering revive icons under all conditions.');

  console.log('\n========================================================================');
  console.log('🎉 ALL REVIVE ICON LIFECYCLE TESTS PASSED WITH 100% SUCCESS! 🎉');
  console.log('========================================================================\n');
}

runReviveIconLifecycleTests().catch((err) => {
  console.error('❌ Revive icon lifecycle tests failed:', err);
  process.exit(1);
});
