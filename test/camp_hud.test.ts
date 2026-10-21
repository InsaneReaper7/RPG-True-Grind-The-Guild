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

// --- BROWSER DOM MOCKS FOR NODE ---
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public title: string = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...classes: string[]) => classes.forEach(c => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach(c => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public onclick: any = null;
  public onchange: any = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  private _value: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = String(val);
  }

  get innerText(): string {
    return this._textContent;
  }
  set innerText(val: string) {
    this._textContent = String(val);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.children = [];
  }

  get value(): string {
    return this._value;
  }
  set value(v: string) {
    this._value = String(v);
  }

  public appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  public querySelector<T = MockElement>(selector: string): T | null {
    const all = this.querySelectorAll(selector);
    return (all.length > 0 ? all[0] : null) as any;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  public click(): void {
    if (this.disabled) return;
    if (typeof this.onclick === 'function') {
      this.onclick({ stopPropagation: () => {} } as any);
    }
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return el.id === selector.substring(1);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.substring(1));
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attrExp = selector.slice(1, -1);
    if (attrExp.includes('=')) {
      const [attrName, rawVal] = attrExp.split('=');
      const val = rawVal.replace(/['"]/g, '').trim();
      const trimmedAttrName = attrName.trim();
      if (trimmedAttrName.startsWith('data-')) {
        const camel = trimmedAttrName.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        return el.dataset[camel] === val;
      }
    }
    const trimmed = attrExp.trim();
    if (trimmed.startsWith('data-')) {
      const camel = trimmed.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      return el.dataset[camel] !== undefined;
    }
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

const elementRegistry = new Map<string, MockElement>();

function getOrCreateElement(id: string, tagName: string = 'div'): MockElement {
  if (!elementRegistry.has(id)) {
    const el = new MockElement(tagName);
    el.id = id;
    elementRegistry.set(id, el);
  }
  return elementRegistry.get(id)!;
}

const dummyCtx: any = new Proxy({
  fillStyle: '',
  globalCompositeOperation: '',
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  createImageData: () => ({ data: [0, 0, 0, 0] })
}, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return () => {};
  },
  set(target, prop, value) {
    (target as any)[prop] = value;
    return true;
  }
});

(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: 'http://localhost' },
  focus: () => {},
  navigator: { userAgent: 'node' }
};

(globalThis as any).document = {
  createElement: (tagName: string) => {
    if (tagName.toLowerCase() === 'canvas') {
      return {
        getContext: () => dummyCtx,
        style: {}
      };
    }
    return new MockElement(tagName);
  },
  getElementById: (id: string) => elementRegistry.get(id) || null,
  querySelector: (sel: string) => {
    if (sel.startsWith('#')) return elementRegistry.get(sel.slice(1)) || null;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  documentElement: new MockElement('html'),
  body: new MockElement('body')
};

(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
(globalThis as any).HTMLVideoElement = class HTMLVideoElement {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Create DOM elements matching index.html
const allDomIds = [
  // Camp HUD Buttons
  'camp-make-btn',
  'camp-cook-btn',
  'camp-break-btn',

  // Party Portraits
  'party-portraits-hud',
  'party-reselect-all-btn',
  'gathering-mode-toggle-btn',
  'gathering-mode-banner',
  'party-portrait-0',
  'party-portrait-1',
  'party-portrait-2',
  'party-portrait-3',
  'party-portrait-name-0',
  'party-portrait-name-1',
  'party-portrait-name-2',
  'party-portrait-name-3',
  'party-portrait-avatar-0',
  'party-portrait-avatar-1',
  'party-portrait-avatar-2',
  'party-portrait-avatar-3',
  'party-portrait-hp-bar-0',
  'party-portrait-hp-bar-1',
  'party-portrait-hp-bar-2',
  'party-portrait-hp-bar-3',
  'party-portrait-crit-bar-0',
  'party-portrait-crit-bar-1',
  'party-portrait-crit-bar-2',
  'party-portrait-crit-bar-3',
  'party-portrait-energy-bar-0',
  'party-portrait-energy-bar-1',
  'party-portrait-energy-bar-2',
  'party-portrait-energy-bar-3',
  'party-portrait-status-0',
  'party-portrait-status-1',
  'party-portrait-status-2',
  'party-portrait-status-3',
  'party-portrait-hotkey-0',
  'party-portrait-hotkey-1',
  'party-portrait-hotkey-2',
  'party-portrait-hotkey-3',

  // HUD Card & Badges
  'hud-card',
  'player-hp-text',
  'player-crit-hp-text',
  'player-energy-text',
  'equipped-weapon-text',
  'hud-proficiency-row',
  'proficiency-label',
  'proficiency-text',
  'hud-construction-row',
  'construction-prof-text',
  'hud-wood-row',
  'player-wood-text',
  'location-badge',
  'room-badge',
  'player-status-text',
  'hud-skills-list',
  'outpost-controls',
  'open-loadout-btn',
  'toggle-build-btn',
  'close-loadout-btn',
  'skill-loadout-modal',
  'equip-slots-container',
  'known-skills-container',
  'slots-count-badge',
  'unlock-modal',
  'unlocked-class-name',
  'unlocked-class-fantasy',
  'downed-banner',
  'build-mode-overlay',
  'build-overlay-wood',
  'build-tier-badge',
  'build-rotation-badge',
  'exit-build-btn',
  'build-palette-container',
  'build-feedback-toast',
  'debug-skills-panel',
  'debug-skills-list',
  'debug-member-select',
  'debug-exp-log-list',
  'debug-clear-exp-log-btn',
  'quick-bar-hud',
  'quick-slot-0',
  'quick-slot-1',
  'quick-slot-2',
  'quick-slot-3',
  'quick-slot-icon-0',
  'quick-slot-icon-1',
  'quick-slot-icon-2',
  'quick-slot-icon-3',
  'quick-slot-count-0',
  'quick-slot-count-1',
  'quick-slot-count-2',
  'quick-slot-count-3',
  'quick-slot-cd-0',
  'quick-slot-cd-1',
  'quick-slot-cd-2',
  'quick-slot-cd-3',

  // Cooking Modal
  'cooking-modal',
  'close-cooking-btn',
  'cooking-modal-prof',
  'cooking-tab-cook-btn',
  'cooking-tab-journal-btn',
  'cooking-tab-lost-btn',
  'cooking-tab-cook-view',
  'cooking-tab-journal-view',
  'cooking-tab-lost-view',
  'cooking-slots-info',
  'cooking-slots-container',
  'cooking-exp-slot1',
  'cooking-exp-slot2',
  'cooking-slot3-wrap',
  'cooking-exp-slot3',
  'cooking-slot4-wrap',
  'cooking-exp-slot4',
  'cooking-slot5-wrap',
  'cooking-exp-slot5',
  'cooking-experiment-btn',
  'cooking-exp-status',
  'cooking-recipes-container',
  'cooking-dishes-container',
  'cooking-toggle-filter-btn',
  'cooking-journal-progress',
  'cooking-journal-container',
  'cooking-lost-progress',
  'cooking-lost-container'
];

for (const id of allDomIds) {
  const isSelect = id.includes('cooking-exp-slot') || id === 'debug-member-select';
  const isBtn = id.includes('btn');
  const el = getOrCreateElement(id, isSelect ? 'select' : isBtn ? 'button' : 'div');
  if (isBtn || id.startsWith('camp-')) {
    el.style.display = 'none';
  }
}

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { TutorialSystem } = await import('../src/systems/TutorialSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { HUD } = await import('../src/ui/HUD.ts');
const { MainScene } = await import('../src/scenes/MainScene.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
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
    parentContainer: null,
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {},
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
    parentContainer: null,
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {},
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
    parentContainer: null,
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {},
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
    parentContainer: null,
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {},
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
      if (Array.isArray(items)) children.push(...items);
      else children.push(items);
      return this;
    },
    destroy: function () {
      children.length = 0;
    }
  } as any;
}

function createMockScene(): any {
  let simulatedTime = 1000;
  const dungeon = {
    rooms: [
      { id: 0, x: 1, y: 1, width: 4, height: 4, type: 'entrance' },
      { id: 1, x: 7, y: 1, width: 6, height: 6, type: 'light_combat' },
      { id: 2, x: 15, y: 1, width: 6, height: 6, type: 'normal' },
      { id: 3, x: 1, y: 7, width: 5, height: 5, type: 'boss' },
      { id: 4, x: 7, y: 7, width: 5, height: 5, type: 'crystal' }
    ]
  };

  const gridMatrix: number[][] = [];
  for (let y = 0; y < 25; y++) {
    gridMatrix[y] = [];
    for (let x = 0; x < 25; x++) {
      gridMatrix[y][x] = 0;
    }
  }

  const pathfinder = new Pathfinder(gridMatrix);

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
    mapWidth: 25,
    mapHeight: 25,
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
    time: {
      get now() { return simulatedTime; },
      set now(v: number) { simulatedTime = v; },
      delayedCall: (_ms: number, fn: Function) => { fn(); }
    },
    pathfinder,
    combatSystem: {
      inCombatState: false,
      isInCombat() { return this.inCombatState; }
    },
    hud: null as any
  };

  const heroData = {
    name: 'Guild Hero',
    baseCarryCapacity: 45,
    maxHp: 50,
    maxCriticalHp: 25,
    maxEnergy: 100,
    level: 1
  };
  const weaponDef = { id: 'short_swords', name: 'Short Sword' };

  const hero = new Player(mockScene, 8, 2, heroData, weaponDef, 32, 'player-avatar', new ProgressionSystem(undefined, 'LeaderHero'));
  hero.entityName = 'Guild Hero';
  hero.hp = 50;
  hero.maxHp = 50;
  hero.criticalHp = 25;
  hero.maxCriticalHp = 25;
  hero.energy = 100;
  hero.maxEnergy = 100;
  hero.inventory = new Map<string, number>();

  const valerie = new Player(mockScene, 8, 3, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Valerie'));
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
  mockScene.isInCampRadius = MainScene.prototype.isInCampRadius.bind(mockScene);
  mockScene.getTrailblazerSenseBonusForMember = MainScene.prototype.getTrailblazerSenseBonusForMember.bind(mockScene);

  return mockScene;
}

async function runCampHudTests() {
  console.log('================================================================');
  console.log('🏕️ RUNNING CAMP HUD & INTERACTIVE CONTROLS TEST SUITE');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  TutorialSystem.getInstance().completeTutorial();
  const gs = GameState.getInstance();
  gs.resetToDefault();

  const mockScene = createMockScene();
  const hud = new HUD();
  hud.scene = mockScene;
  mockScene.hud = hud;

  const hero = mockScene.player;
  const valerie = mockScene.party[1];

  const makeBtn = getOrCreateElement('camp-make-btn');
  const cookBtn = getOrCreateElement('camp-cook-btn');
  const breakBtn = getOrCreateElement('camp-break-btn');

  // ==========================================
  // Test 1: In dungeon with no camp: Make Camp is visible. Click it & complete channel.
  // ==========================================
  console.log('--- Test 1: Dungeon with no camp -> Make Camp visible -> Click & complete channel ---');
  // Initially no camp, hero lacks materials
  hud.update(hero, hero.progression, 0, mockScene.party);
  assert.equal(makeBtn.style.display, 'inline-block', 'Make Camp button must be visible in dungeon with no camp');
  assert.equal(cookBtn.style.display, 'none', 'Cook at Campfire button must be hidden when no camp exists');
  assert.equal(breakBtn.style.display, 'none', 'Break Camp button must be hidden when no camp exists');
  assert.equal(makeBtn.disabled, true, 'Make Camp should be disabled when lacking wood/herbs');
  assert.match(makeBtn.title, /Need 5 Wood, 2 Wild Herbs/, 'Title shows missing resource precondition');

  // Give wood and herbs
  hero.addItem('wood', 5);
  hero.addItem('wild_herbs', 2);
  hud.update(hero, hero.progression, 0, mockScene.party);
  assert.equal(makeBtn.disabled, false, 'Make Camp is enabled when preconditions met');

  // Click Make Camp through the UI button
  makeBtn.click();
  assert.notEqual(mockScene.activeCampChannel, null, 'Clicking Make Camp button must start camp pitching channel');
  assert.equal(hero.state, 'channeling', 'Hero should be in channeling state');

  // Complete channel
  mockScene.completeMakeCamp();
  assert.notEqual(mockScene.currentCamp, null, 'Camp must exist after channel completion');
  assert.equal(hero.getItemCount('wood'), 0, 'Wood cost deducted from bag');
  assert.equal(hero.getItemCount('wild_herbs'), 0, 'Herbs cost deducted from bag');

  // HUD buttons update: Make Camp is hidden, Cook & Break become visible
  assert.equal(makeBtn.style.display, 'none', 'Make Camp button must hide when camp exists');
  assert.equal(cookBtn.style.display, 'inline-block', 'Cook at Campfire button must become visible in camp radius');
  assert.equal(breakBtn.style.display, 'inline-block', 'Break Camp button must become visible in camp radius');
  console.log('✔ Test 1 passed: Make Camp button initiates channel and transitions to Cook & Break buttons.');

  // ==========================================
  // Test 2: Click Cook at Campfire -> Modal opens in campfire mode -> Bag only ingredients
  // ==========================================
  console.log('\n--- Test 2: Cook at Campfire UI -> campfireMode bagOnly dropdowns ---');
  // Stockpile item (should NOT appear in campfire mode)
  gs.addItem('crypt_meat', 10);
  // Bag item in hero bag (SHOULD appear)
  hero.addItem('salt', 4);
  // Bag item in companion bag (SHOULD appear via party pooling)
  valerie.addItem('cave_mushroom', 3);

  // Click Cook at Campfire button
  cookBtn.click();
  assert.equal(hud.isCookingModalOpen(), true, 'Cooking modal opened upon clicking Cook at Campfire');
  assert.equal(hud.isCampfireMode, true, 'HUD isCampfireMode must be true when opened from campfire');

  // Check ingredient select dropdown 1 options
  const slot1 = getOrCreateElement('cooking-exp-slot1');
  const optionValues = slot1.children.map(c => (c as any).value);
  assert.ok(optionValues.includes('salt'), 'Salt from hero bag must be present in dropdown options');
  assert.ok(optionValues.includes('cave_mushroom'), 'Cave mushroom from party companion bag must be present in dropdown options');
  assert.ok(!optionValues.includes('crypt_meat'), 'Stockpile-only crypt_meat must be ABSENT from campfire dropdown options');

  hud.closeCookingModal();
  assert.equal(hud.isCookingModalOpen(), false, 'Cooking modal closed cleanly');
  console.log('✔ Test 2 passed: Cook at Campfire opens modal in campfireMode with bag-only ingredient options.');

  // ==========================================
  // Test 3: Wait 20s of scene time, then click Break Camp -> camp_rested buff & buttons reset
  // ==========================================
  console.log('\n--- Test 3: Wait 20s scene time -> Click Break Camp -> camp_rested applied & buttons reset ---');
  // Advance scene time past 20 seconds
  mockScene.time.now += 22000;

  // Click Break Camp button
  breakBtn.click();
  assert.equal(mockScene.currentCamp, null, 'Camp destroyed after Break Camp');

  // Check camp_rested buff on party members
  const heroRested = hero.activeStatusEffects.get('camp_rested');
  const valerieRested = valerie.activeStatusEffects.get('camp_rested');
  assert.notEqual(heroRested, undefined, 'Hero received camp_rested buff');
  assert.notEqual(valerieRested, undefined, 'Valerie received camp_rested buff');

  // Verify buttons reset
  assert.equal(cookBtn.style.display, 'none', 'Cook at Campfire button hidden after camp broken');
  assert.equal(breakBtn.style.display, 'none', 'Break Camp button hidden after camp broken');
  assert.equal(makeBtn.style.display, 'inline-block', 'Make Camp button is visible again on floor');
  assert.equal(makeBtn.disabled, true, 'Make Camp is disabled because only 1 camp allowed per floor');
  assert.match(makeBtn.title, /Only one camp per floor allowed/, 'Precondition reason displayed on Make Camp');
  console.log('✔ Test 3 passed: Break Camp applies camp_rested and resets HUD buttons.');

  // ==========================================
  // Test 4: With an aggroed enemy in the room: Make Camp shows "Enemies nearby" reason & click does nothing
  // ==========================================
  console.log('\n--- Test 4: Aggroed enemy in room -> "Enemies nearby" reason & click does nothing ---');
  // Reset floor camp count to allow new camp attempt
  mockScene.floorCampCreatedCount = 0;
  mockScene.currentCamp = null;
  hero.addItem('wood', 10);
  hero.addItem('wild_herbs', 5);

  // Spawn aggroed enemy in the same room (room id 1)
  const aggroedEnemy: any = {
    roomIndex: 1,
    isAggroed: true,
    state: 'combat',
    gridPos: { x: 9, y: 3 },
    isAlive: () => true,
    targetEntity: hero,
    clearTarget: () => {}
  };
  mockScene.enemies = [aggroedEnemy];

  hud.update(hero, hero.progression, 0, mockScene.party);
  assert.equal(makeBtn.style.display, 'inline-block', 'Make Camp button visible');
  assert.equal(makeBtn.disabled, true, 'Make Camp button must be disabled with aggroed enemy nearby');
  assert.equal(makeBtn.title, 'Enemies nearby', 'Button title must show "Enemies nearby" reason');
  assert.ok(makeBtn.textContent.includes('Enemies nearby'), 'Button label must show "Enemies nearby" reason');

  // Attempt click while disabled
  makeBtn.click();
  assert.equal(mockScene.activeCampChannel, null, 'Clicking disabled Make Camp button does nothing');
  assert.equal(mockScene.currentCamp, null, 'No camp created');
  console.log('✔ Test 4 passed: Aggroed enemy causes "Enemies nearby" disabled reason and blocks action.');

  // ==========================================
  // Test 5: The C key behaves the same as the button; Construction EXP is unchanged
  // ==========================================
  console.log('\n--- Test 5: Hotkey [C] behaves the same as Make Camp button without granting Construction EXP ---');
  // Remove aggroed enemy
  mockScene.enemies = [];
  hud.update(hero, hero.progression, 0, mockScene.party);
  assert.equal(makeBtn.disabled, false, 'Make Camp enabled once enemy removed');

  const initialConstExp = hero.progression.getProficiencyStat('construction').currentExp;
  const initialConstLevel = hero.progression.getProficiencyStat('construction').level;

  // Simulate C hotkey in dungeon (runs scene.startMakeCamp())
  const cResult = mockScene.startMakeCamp();
  assert.equal(cResult, true, 'Pressing C initiates Make Camp channel identically to button');
  assert.notEqual(mockScene.activeCampChannel, null, 'Active camp channel established via C key');

  // Verify Construction EXP is UNCHANGED
  const finalConstExp = hero.progression.getProficiencyStat('construction').currentExp;
  const finalConstLevel = hero.progression.getProficiencyStat('construction').level;
  assert.equal(finalConstExp, initialConstExp, 'Construction EXP must NOT change when pressing C');
  assert.equal(finalConstLevel, initialConstLevel, 'Construction level must NOT change when pressing C');

  // Complete channel and verify camp stands
  mockScene.completeMakeCamp();
  assert.notEqual(mockScene.currentCamp, null, 'Camp created via C hotkey flow');
  assert.equal(makeBtn.style.display, 'none', 'Make Camp hidden');
  assert.equal(cookBtn.style.display, 'inline-block', 'Cook button visible');
  assert.equal(breakBtn.style.display, 'inline-block', 'Break button visible');
  console.log('✔ Test 5 passed: C key triggers Make Camp with zero Construction EXP side-effects.');

  console.log('\n================================================================');
  console.log('🎉 ALL 5 CAMP HUD TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

runCampHudTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
