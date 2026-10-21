import fs from 'fs';
import Module from 'node:module';
import assert from 'node:assert/strict';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals for Phaser / DOM under Node
const noop = () => {};
const mockClassList = (classes: Set<string> = new Set()) => ({
  contains: (cls: string) => classes.has(cls),
  add: (...cls: string[]) => cls.forEach((c) => classes.add(c)),
  remove: (...cls: string[]) => cls.forEach((c) => classes.delete(c)),
  toggle: (cls: string) => {
    if (classes.has(cls)) {
      classes.delete(cls);
      return false;
    }
    classes.add(cls);
    return true;
  }
});

const domElements: Map<string, any> = new Map();
const storageMap = new Map<string, string>();

const createMockElement = (id: string = '') => {
  const classes = new Set<string>();
  const listeners: Map<string, Function[]> = new Map();
  const el = {
    id,
    className: '',
    classList: mockClassList(classes),
    style: {} as any,
    innerText: '',
    innerHTML: '',
    children: [] as any[],
    dataset: {} as any,
    disabled: false,
    appendChild: (child: any) => {
      el.children.push(child);
      return child;
    },
    removeChild: (child: any) => {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      return child;
    },
    addEventListener: (evt: string, fn: Function) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
    },
    dispatchEvent: (evt: { type: string; shiftKey?: boolean; stopPropagation?: Function }) => {
      const fns = listeners.get(evt.type) || [];
      for (const fn of fns) fn(evt);
      return true;
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return el;
};

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
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      return {
        getContext: () => dummyCtx,
        style: {},
        width: 32,
        height: 32
      };
    }
    return createMockElement();
  },
  getElementById: (id: string) => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id));
    }
    return domElements.get(id);
  },
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

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

(global as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i: number) => Array.from(storageMap.keys())[i] || null
};


function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    setInteractive: function () { return this; },
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
      const list = listeners.get(evt);
      if (list) list.forEach(fn => fn(...args));
      return true;
    }
  };
}

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    fillStyle: () => {},
    fillRect: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    fillCircle: () => {},
    strokeCircle: () => {},
    fillEllipse: () => {},
    lineBetween: () => {},
    beginPath: () => {},
    arc: () => {},
    strokePath: () => {},
    fillPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fillTriangle: () => {},
    generateTexture: () => {},
    destroy: () => {},
    clear: () => {},
    setDepth: () => ({})
  } as any;
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    setOrigin: () => {},
    setScale: () => {},
    setVisible: () => {},
    setAlpha: () => {},
    setAngle: () => {},
    setTint: () => {},
    clearTint: () => {},
    setTexture: () => {},
    setPosition: () => {},
    setDepth: () => {},
    setInteractive: function () { return this; },
    destroy: () => {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    setOrigin: function () { return this; },
    setText: function () { return this; },
    setColor: function () { return this; },
    setDepth: function () { return this; },
    destroy: () => {}
  } as any;
}

function createMockContainer(x: number = 0, y: number = 0) {
  const emitter = createMockEventEmitter();
  const children: any[] = [];
  return {
    ...emitter,
    x,
    y,
    children,
    setDepth: function () { return this; },
    setPosition: function (newX: number, newY: number) {
      this.x = newX;
      this.y = newY;
      return this;
    },
    add: function (items: any[]) {
      children.push(...items);
      return this;
    },
    destroy: function () {
      children.length = 0;
    }
  } as any;
}

async function runTests() {
  console.log('================================================================');
  console.log('🏕️ RUNNING SURVIVALIST & DUNGEON CAMPS TEST SUITE');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CookingSystem } = await import('../src/systems/CookingSystem.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
  const { TutorialSystem } = await import('../src/systems/TutorialSystem.ts');
  const { computeDetectionChance } = await import('../src/utils/perception.ts');
  const { DungeonCamp } = await import('../src/entities/DungeonCamp.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  await DataLoader.getInstance().loadAll();

  function createMockMainScene(): any {
    const dataLoader = DataLoader.getInstance();
    const weaponDef = dataLoader.getWeapon('short_swords')!;
    const heroData = dataLoader.getPlayer();

    const mapWidth = 20;
    const mapHeight = 20;
    const gridMatrix: number[][] = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(0));
    for (let x = 0; x < mapWidth; x++) {
      gridMatrix[0][x] = 1;
      gridMatrix[mapHeight - 1][x] = 1;
    }
    for (let y = 0; y < mapHeight; y++) {
      gridMatrix[y][0] = 1;
      gridMatrix[y][mapWidth - 1] = 1;
    }

    const dungeon = {
      width: mapWidth,
      height: mapHeight,
      gridMatrix,
      rooms: [
        { id: 0, x: 1, y: 1, width: 5, height: 5, type: 'entrance' },
        { id: 1, x: 7, y: 1, width: 5, height: 5, type: 'light_combat' },
        { id: 2, x: 13, y: 1, width: 5, height: 5, type: 'gathering' },
        { id: 3, x: 1, y: 7, width: 5, height: 5, type: 'boss' },
        { id: 4, x: 7, y: 7, width: 5, height: 5, type: 'heavy_combat' }
      ],
      portalPos: { x: 2, y: 2 },
      crystalPos: { x: 8, y: 8 },
      crystalRoomIdx: 4,
      enemySpawns: [],
      bushSpawns: []
    };

    let simulatedTime = 1000;

    const mockScene: any = {
      sys: {
        queueDepthSort: () => {},
        displayList: { queueDepthSort: () => {} },
        events: { once: () => {}, on: () => {}, emit: () => {} }
      },
      add: {
        graphics: createMockGraphics,
        sprite: createMockSprite,
        text: createMockText,
        container: createMockContainer,
        existing: () => {}
      },
      make: {
        graphics: createMockGraphics
      },
      textures: {
        exists: () => true,
        get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) })
      },
      tweens: {
        add: () => ({ stop: () => {} })
      },
      dungeon,
      initialDungeon: dungeon,
      mapWidth,
      mapHeight,
      tileSize: 32,
      gridMatrix,
      party: [] as any[],
      player: null as any,
      enemies: [] as any[],
      currentCamp: null,
      floorCampCreatedCount: 0,
      trailblazerSenseRemainingMs: 0,
      activeCampChannel: null,
      activeGatherChannels: new Map(),
      activeReviveChannels: new Map(),
      gatheringArrivalTimers: new Map(),
      gatheringNodes: [],
      visitedRoomIndices: new Set(),
      selectedMembers: new Set(),
      clearMoveHighlightTimers: () => {},
      lastMoveDestinationHighlights: [],
      activeMoveHighlights: [],
      currentGatherSelectionHighlights: [],
      gatheringQueue: [],
      gatheringQueueWorkers: new Set(),
      gatheringWorkerNodeAssignments: new Map(),
      undiscoveredCaches: [],
      isWiping: false,
      isTransitioning: false,
      time: {
        get now() { return simulatedTime; },
        set now(v: number) { simulatedTime = v; },
        delayedCall: (_ms: number, fn: Function) => { fn(); }
      },
      pathfinder: {
        updateGrid: (_g: number[][]) => {}
      },
      combatSystem: {
        inCombatState: false,
        isInCombat() { return this.inCombatState; }
      },
      hud: {
        toasts: [] as string[],
        showToast(msg: string) { this.toasts.push(msg); }
      },
      createFloatingText: (_x: number, _y: number, _text: string, _color: string) => {},
      clearMoveDestinationHighlights: () => {}
    };

    const hero = new Player(mockScene, 2, 2, heroData, weaponDef, 32, 'player-avatar', new ProgressionSystem(undefined, 'LeaderHero'));
    hero.entityName = 'Guild Hero';
    hero.hp = 50;
    hero.maxHp = 50;
    hero.criticalHp = 25;
    hero.maxCriticalHp = 25;
    hero.energy = 100;
    hero.maxEnergy = 100;
    hero.inventory = new Map<string, number>();

    const valerie = new Player(mockScene, 2, 3, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Valerie'));
    valerie.entityName = 'Valerie';
    valerie.hp = 50;
    valerie.maxHp = 50;
    valerie.criticalHp = 25;
    valerie.maxCriticalHp = 25;
    valerie.energy = 100;
    valerie.maxEnergy = 100;
    valerie.inventory = new Map<string, number>();

    mockScene.player = hero;
    mockScene.party = [hero, valerie];
    mockScene.progressionSystem = hero.progression;

    hero.scene = mockScene;
    valerie.scene = mockScene;

    mockScene.isCampExcludedRoom = MainScene.prototype.isCampExcludedRoom.bind(mockScene);
    mockScene.canMakeCamp = MainScene.prototype.canMakeCamp.bind(mockScene);
    mockScene.startMakeCamp = MainScene.prototype.startMakeCamp.bind(mockScene);
    mockScene.completeMakeCamp = MainScene.prototype.completeMakeCamp.bind(mockScene);
    mockScene.cancelCampChannel = MainScene.prototype.cancelCampChannel.bind(mockScene);
    mockScene.breakCamp = MainScene.prototype.breakCamp.bind(mockScene);
    mockScene.destroyCamp = MainScene.prototype.destroyCamp.bind(mockScene);
    mockScene.respawnAtCamp = MainScene.prototype.respawnAtCamp.bind(mockScene);
    mockScene.handlePartyWipe = MainScene.prototype.handlePartyWipe.bind(mockScene);
    mockScene.isInCampRadius = MainScene.prototype.isInCampRadius.bind(mockScene);
    mockScene.getTrailblazerSenseBonusForMember = MainScene.prototype.getTrailblazerSenseBonusForMember.bind(mockScene);
    mockScene.resetPerVisitState = MainScene.prototype.resetPerVisitState.bind(mockScene);

    return mockScene;
  }

  // --- TEST 1 ---
  console.log('--- TEST 1: Expected-Table Guards ---');
  const campConfigRaw = JSON.parse(fs.readFileSync('data/campConfig.json', 'utf8'));
  assert.deepEqual(campConfigRaw.setupCost, { wood: 5, wild_herbs: 2 });
  assert.equal(campConfigRaw.setupChannelMs, 5000);
  assert.equal(campConfigRaw.campRadiusTiles, 3);
  assert.equal(campConfigRaw.campRegenMultiplier, 2.0);
  assert.equal(campConfigRaw.respawnHpPercent, 0.5);
  assert.equal(campConfigRaw.minRestSecondsForBuff, 20);
  assert.equal(campConfigRaw.campRestedStatusId, 'camp_rested');
  assert.deepEqual(campConfigRaw.excludedRooms, ['boss', 'entrance', 'crystal']);
  assert.equal(campConfigRaw.classExp.onSetup, 50);
  assert.equal(campConfigRaw.classExp.onBreakBuff, 25);

  const statusEffectsRaw = JSON.parse(fs.readFileSync('data/statusEffects.json', 'utf8'));
  const campRested = statusEffectsRaw.statusEffects.find((s: any) => s.id === 'camp_rested');
  assert.ok(campRested);
  assert.equal(campRested.bonusDamagePercent, 0.05);
  assert.equal(campRested.energyRegenPerSecond, 0.25);
  assert.equal(campRested.durationMs, 60000);
  assert.equal(campRested.tickIntervalMs, 1000);

  const classesRaw = JSON.parse(fs.readFileSync('data/classes.json', 'utf8'));
  for (const cId of ['survivalist', 'trailblazer', 'wilderness_warden', 'grand_survivalist']) {
    const cls = classesRaw.classes.find((c: any) => c.id === cId);
    assert.ok(cls, `${cId} must exist in classes.json`);
    assert.equal(cls.category, 'crafting');
  }
  console.log('✔ Test 1 passed: All expected-table guards verified for data files.\n');

  // --- TEST 2 ---
  console.log('--- TEST 2: Make Camp Refusal Conditions ---');
  const scene = createMockMainScene();
  TutorialSystem.getInstance().completeTutorial();
  scene.player.addItem('wood', 10);
  scene.player.addItem('wild_herbs', 5);

  // In combat
  scene.combatSystem.inCombatState = true;
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused in combat');
  scene.combatSystem.inCombatState = false;

  // Entrance room 0
  scene.player.gridPos = { x: 2, y: 2 };
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused in entrance room 0');

  // Boss room 3
  scene.player.gridPos = { x: 2, y: 8 };
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused in boss room');

  // Crystal room 4
  scene.player.gridPos = { x: 8, y: 8 };
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused in crystal room');

  // Allowed room 1
  scene.player.gridPos = { x: 8, y: 2 };
  assert.equal(scene.canMakeCamp().allowed, true, 'Allowed in light_combat room 1');

  // Aggroed enemy
  const testEnemy: any = {
    roomIndex: 1,
    isAggroed: true,
    isAlive: () => true,
    targetEntity: null,
    clearTarget: () => {}
  };
  scene.enemies.push(testEnemy);
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused with aggroed enemy');
  testEnemy.isAggroed = false;

  // Tutorial incomplete
  TutorialSystem.getInstance().reset();
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused during tutorial');
  TutorialSystem.getInstance().completeTutorial();

  // Missing herbs
  scene.player.removeItem('wild_herbs', 5);
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused without herbs');
  scene.player.addItem('wild_herbs', 5);

  // Second camp on floor
  scene.floorCampCreatedCount = 1;
  assert.equal(scene.canMakeCamp().allowed, false, 'Refused on duplicate camp');
  scene.floorCampCreatedCount = 0;

  // Bags remained untouched
  assert.equal(scene.player.getItemCount('wood'), 10);
  assert.equal(scene.player.getItemCount('wild_herbs'), 5);
  console.log('✔ Test 2 passed: All refusal conditions verified without bag mutations.\n');

  // --- TEST 3 ---
  console.log('--- TEST 3: Setup Channel, Cost Deduction & Activity/EXP ---');
  scene.player.inventory.clear();
  scene.party[1].inventory.clear();
  scene.player.addItem('wood', 5);
  scene.party[1].addItem('wild_herbs', 2);
  GameState.getInstance().addItem('wood', 100);
  const stockWoodBefore = GameState.getInstance().getItemCount('wood');

  scene.player.progression.recordActivity('Dungeon Camp Setup', 4);
  scene.party[1].progression.recordActivity('Dungeon Camp Setup', 4);

  assert.equal(scene.startMakeCamp(), true);
  assert.equal(scene.player.getItemCount('wood'), 5, 'Materials held until completion');
  scene.completeMakeCamp();

  assert.equal(scene.player.getItemCount('wood'), 0, 'Exact 5 wood consumed from leader bag');
  assert.equal(scene.party[1].getItemCount('wild_herbs'), 0, 'Exact 2 herbs consumed from ally bag');
  assert.equal(GameState.getInstance().getItemCount('wood'), stockWoodBefore, 'Stockpile untouched');
  assert.ok(scene.currentCamp);
  assert.equal(scene.gridMatrix[2][8], 1, 'Camp tile marked 1 in gridMatrix');
  assert.equal(scene.player.progression.getClassStat('survivalist').currentExp, 50, 'Granted 50 class EXP on setup');

  // Interrupted channel leaves bags and floor clean
  scene.destroyCamp();
  scene.floorCampCreatedCount = 0;
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  scene.startMakeCamp();
  scene.cancelCampChannel();
  assert.equal(scene.player.getItemCount('wood'), 5);
  assert.equal(scene.player.getItemCount('wild_herbs'), 2);
  assert.equal(scene.currentCamp, null);
  console.log('✔ Test 3 passed: Channel completion, cost deduction, and interruption verified.\n');

  // --- TEST 4 ---
  console.log('--- TEST 4: Rest Regen & Flat energyRegenPerSecond ---');
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  scene.startMakeCamp();
  scene.completeMakeCamp();

  const hero = scene.player;
  hero.inCombat = false;
  scene.combatSystem.inCombatState = false;
  hero.baseEnergyRegenPerSecond = 1.0;
  hero.energyRegenPerSecond = 1.0;

  // In camp out-of-combat: 4x rate (1.0 * 2.0 OOC * 2.0 Camp = 4.0 EN/s)
  hero.energy = 50;
  hero.update(scene.time.now, 1000);
  assert.equal(hero.energy, 54, 'Camp out-of-combat energy regen = 4x');

  // Outside camp: 2x rate
  hero.gridPos = { x: 18, y: 18 };
  hero.energy = 50;
  hero.update(scene.time.now, 1000);
  assert.equal(hero.energy, 52, 'Outside camp out-of-combat energy regen = 2x');

  // In combat: 1x rate
  hero.gridPos = { x: 8, y: 3 };
  hero.inCombat = true;
  hero.energy = 50;
  hero.update(scene.time.now, 1000);
  assert.equal(hero.energy, 51, 'In combat energy regen = 1x');
  hero.inCombat = false;

  // Flat energyRegenPerSecond tick (0.25 EN/s unscaled)
  const statusDef = DataLoader.getInstance().getStatusEffect('camp_rested');
  hero.energy = 50;
  hero.applyStatusEffect({ ...statusDef });
  hero.updateStatusEffects(1000);
  assert.equal(hero.energy, 50.25, 'energyRegenPerSecond ticks flat +0.25 EN/s');

  hero.state = 'downed';
  hero.energy = 50;
  hero.updateStatusEffects(1000);
  assert.equal(hero.energy, 50, 'Downed member does not tick energyRegenPerSecond');
  hero.clearDownedState();
  console.log('✔ Test 4 passed: Rest regen multipliers and flat status energy ticks verified.\n');

  // --- TEST 5 ---
  console.log('--- TEST 5: Party Wipe Respawn at Camp ---');
  scene.destroyCamp();
  scene.floorCampCreatedCount = 0;
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  console.log('CHECK CAN MAKE CAMP:', scene.canMakeCamp(), 'leaderPos:', scene.player.gridPos);
  assert.equal(scene.startMakeCamp(), true, 'Must succeed startMakeCamp');
  scene.completeMakeCamp();

  const campX = scene.currentCamp.x;
  const campY = scene.currentCamp.y;

  const enemy: any = {
    roomIndex: 1,
    isAggroed: true,
    targetEntity: scene.player,
    isAlive: () => true,
    clearTarget: function() { this.targetEntity = null; }
  };
  scene.enemies.push(enemy);

  scene.player.hp = 0;
  scene.player.criticalHp = 0;
  scene.player.state = 'downed';
  scene.party[1].hp = 0;
  scene.party[1].criticalHp = 0;
  scene.party[1].state = 'downed';

  scene.handlePartyWipe();

  assert.equal(scene.player.hp, Math.max(1, Math.floor(scene.player.maxHp * 0.5)), 'Hero restored to 50% HP');
  assert.equal(scene.player.criticalHp, scene.player.maxCriticalHp, 'Hero critical HP restored to full');
  assert.equal(scene.party[1].hp, Math.max(1, Math.floor(scene.party[1].maxHp * 0.5)), 'Ally restored to 50% HP');
  assert.equal(scene.party[1].criticalHp, scene.party[1].maxCriticalHp, 'Ally critical HP restored to full');
  assert.equal(enemy.isAggroed, false, 'Enemies disengaged');

  const p1Pos = `${scene.player.gridPos.x},${scene.player.gridPos.y}`;
  const p2Pos = `${scene.party[1].gridPos.x},${scene.party[1].gridPos.y}`;
  assert.notEqual(p1Pos, `${campX},${campY}`, 'Hero not on campfire tile');
  assert.notEqual(p2Pos, `${campX},${campY}`, 'Ally not on campfire tile');
  assert.notEqual(p1Pos, p2Pos, 'Party members on distinct tiles');
  assert.equal(scene.currentCamp, null, 'Camp consumed');
  assert.equal(scene.gridMatrix[campY][campX], 0, 'Grid tile restored');

  let sentToOutpost = false;
  scene.scene = { start: (k: string) => { if (k === 'OutpostScene') sentToOutpost = true; } };
  scene.player.state = 'downed';
  scene.party[1].state = 'downed';
  scene.handlePartyWipe();
  assert.equal(sentToOutpost, true, 'Second wipe sends party to Outpost');
  console.log('✔ Test 5 passed: Camp respawn restoration and subsequent Outpost wipe verified.\n');

  // --- TEST 6 ---
  console.log('--- TEST 6: Campfire Cooking ---');
  const cook = scene.player;
  cook.inventory.clear();
  scene.party[1].inventory.clear();
  cook.addItem('wild_herbs', 2);
  scene.party[1].addItem('carrot', 1);
  GameState.getInstance().addItem('wild_herbs', 50);
  const stockBeforeCook = GameState.getInstance().getItemCount('wild_herbs');

  const cookResult = CookingSystem.experiment(cook, ['wild_herbs', 'carrot'], {
    bagOnly: true,
    party: scene.party
  });
  assert.equal(cookResult.success, true);
  assert.equal(GameState.getInstance().getItemCount('wild_herbs'), stockBeforeCook, 'Stockpile herbs untouched');
  assert.equal(cook.getItemCount('wild_herbs'), 1);
  assert.equal(scene.party[1].getItemCount('carrot'), 0);
  console.log('✔ Test 6 passed: Campfire cooking strictly consumed bag materials.\n');

  // --- TEST 7 ---
  console.log('--- TEST 7: Break Camp & Buff Stacking ---');
  scene.dungeon = scene.initialDungeon;
  scene.isTransitioning = false;
  scene.isWiping = false;
  scene.player.gridPos = { x: 8, y: 3 };
  scene.player.removeStatusEffect('camp_rested');
  scene.party[1].removeStatusEffect('camp_rested');
  scene.destroyCamp();
  scene.floorCampCreatedCount = 0;
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  assert.equal(scene.startMakeCamp(), true, 'Must succeed startMakeCamp');
  scene.completeMakeCamp();

  scene.time.now += 10000;
  scene.breakCamp();
  assert.equal(scene.player.hasStatusEffect('camp_rested'), false, 'No buff under 20s');

  scene.floorCampCreatedCount = 0;
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  console.log('CHECK CAN MAKE CAMP:', scene.canMakeCamp(), 'leaderPos:', scene.player.gridPos);
  assert.equal(scene.startMakeCamp(), true, 'Must succeed startMakeCamp');
  scene.completeMakeCamp();

  scene.player.applyStatusEffect({
    id: 'dish_buff',
    name: 'Dish Buff',
    durationMs: 30000,
    tickIntervalMs: 1000,
    damagePerTick: 0,
    bonusDamagePercent: 0.10
  });

  scene.time.now += 25000;
  scene.breakCamp();
  assert.equal(scene.player.hasStatusEffect('camp_rested'), true);
  assert.equal(scene.player.hasStatusEffect('dish_buff'), true, 'Stacks with dish_buff');
  console.log('✔ Test 7 passed: 20s threshold and buff stacking verified.\n');

  // --- TEST 8 ---
  console.log('--- TEST 8: Survivalist Perks Scaling ---');
  const heroProg = scene.player.progression;
  heroProg.recordActivity('Dungeon Camp Setup', 50);
  heroProg.recordActivity('foraging', 60);
  heroProg.recordActivity('woodcutting', 60);
  heroProg.recordActivity('nature_magic', 60);
  heroProg.recordActivity('perception', 60);
  heroProg.setClassLevel('survivalist', 15);
  heroProg.setClassLevel('trailblazer', 15);
  heroProg.setClassLevel('wilderness_warden', 15);
  heroProg.setClassLevel('grand_survivalist', 1);

  const perks = CraftingSystem.getSurvivalistPerks(scene.party);
  assert.equal(perks.quickCampDiscountPercent, 0.30);
  assert.equal(perks.wellRestedDurationBonusPercent, 0.60);
  assert.equal(perks.trailblazerSenseDetectionPp, 15);
  assert.equal(perks.trailblazerSenseRadiusBonus, 1);
  assert.equal(perks.emergencyShelterUnlocked, true);

  scene.floorCampCreatedCount = 0;
  scene.player.addItem('wood', 10);
  scene.player.addItem('wild_herbs', 5);
  scene.combatSystem.inCombatState = true;
  const grandCheck = scene.canMakeCamp();
  assert.equal(grandCheck.allowed, true, 'Emergency shelter allows camp in combat');
  assert.equal(grandCheck.channelMs, 3000, 'In-combat channel is 3000ms');
  assert.equal(grandCheck.cost.wood, 7, 'Double cost in combat with 30% discount (10 * 0.7 = 7)');
  scene.combatSystem.inCombatState = false;
  console.log('✔ Test 8 passed: All 4 perk scalings and Emergency Shelter verified.\n');

  // --- TEST 9 ---
  console.log('--- TEST 9: Camp Clean-up on Floor Change / Visit Reset ---');
  scene.player.addItem('wood', 5);
  scene.player.addItem('wild_herbs', 2);
  scene.startMakeCamp();
  scene.completeMakeCamp();
  assert.ok(scene.currentCamp);

  scene.resetPerVisitState();
  assert.equal(scene.currentCamp, null);
  assert.equal(scene.floorCampCreatedCount, 0);
  assert.equal(scene.trailblazerSenseRemainingMs, 0);
  console.log('✔ Test 9 passed: Per-visit reset cleanly removes camp and clears grid obstacle.\n');

  console.log('================================================================');
  console.log('🎉 ALL 9 SURVIVALIST & DUNGEON CAMPS TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
