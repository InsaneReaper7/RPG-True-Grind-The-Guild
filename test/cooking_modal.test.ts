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

// Create Cooking Modal DOM elements matching index.html
const modalIds = [
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

for (const id of modalIds) {
  const isSelect = id.includes('cooking-exp-slot');
  const isBtn = id.includes('btn');
  getOrCreateElement(id, isSelect ? 'select' : isBtn ? 'button' : 'div');
}

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { HUD } = await import('../src/ui/HUD.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
  const createMockObj = () => new Proxy({
    x: 0,
    y: 0,
    parentContainer: null,
    destroy: () => {},
    removeFromDisplayList: () => {},
    addedToScene: () => {},
    removedFromScene: () => {}
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

  return {
    time: { now: 1000 },
    pathfinder,
    events: { emit: () => {}, on: () => {}, off: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: new Proxy({
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      line: createMockObj,
      circle: createMockObj,
      existing: (item: any) => item
    }, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return createMockObj;
      }
    }),
    tweens: {
      add: () => ({ remove: () => {} })
    }
  };
}

async function runTests() {
  console.log('--- STARTING COOKING MODAL TEST SUITE ---');
  await DataLoader.getInstance().loadAll();
  const gs = GameState.getInstance();
  const mockScene = createMockScene();
  const player = new Player(mockScene, 0, 0, 'ChefHero');

  const hud = new HUD();
  (globalThis as any).window.activeHUD = hud;

  // ==========================================
  // Guard 1: Grep cleanliness check on src/ui/HUD.ts
  // ==========================================
  console.log('\n--- Step 1: Grep Cleanliness Guard on src/ui/HUD.ts ---');
  const hudCode = fs.readFileSync(path.resolve(rootDir, 'src/ui/HUD.ts'), 'utf8');
  const forbiddenRegex = /(monster_meat|wolf_meat|calculateDishQuality)/g;
  const grepMatches = hudCode.match(forbiddenRegex);
  assert.equal(grepMatches, null, `HUD.ts must contain zero occurrences of monster_meat, wolf_meat, calculateDishQuality. Found: ${JSON.stringify(grepMatches)}`);
  console.log('✔ Guard 1 passed: Grep check is completely clean.');

  // ==========================================
  // Step 2: Cooking 30 shows exactly 4 visible selects, with options matching carried + stockpile
  // ==========================================
  console.log('\n--- Step 2: Cooking 30 Slot Rendering & Ingredient Options ---');
  // Set player cooking level to 30
  player.progression.getProficiencyStat('cooking').level = 30;

  // Add ingredients: crypt_meat and salt
  gs.addItem('crypt_meat', 3);
  player.addItem('salt', 2);

  hud.openCookingModal(player, player.progression);

  // Check slot count text
  const slotsInfoEl = getOrCreateElement('cooking-slots-info');
  assert.equal(slotsInfoEl.innerText, '4 / 5 slots, next at Cooking 45');

  // Check 5 selects visibility: exactly 4 visible
  const slot1 = getOrCreateElement('cooking-exp-slot1');
  const slot2 = getOrCreateElement('cooking-exp-slot2');
  const slot3 = getOrCreateElement('cooking-exp-slot3');
  const slot4 = getOrCreateElement('cooking-exp-slot4');
  const slot5 = getOrCreateElement('cooking-exp-slot5');

  assert.equal(slot1.style.display, 'block', 'Slot 1 visible');
  assert.equal(slot2.style.display, 'block', 'Slot 2 visible');
  assert.equal(slot3.style.display, 'block', 'Slot 3 visible');
  assert.equal(slot4.style.display, 'block', 'Slot 4 visible');
  assert.equal(slot5.style.display, 'none', 'Slot 5 hidden');

  const visibleSelects = [slot1, slot2, slot3, slot4, slot5].filter(s => s.style.display !== 'none');
  assert.equal(visibleSelects.length, 4, 'Exactly 4 selects visible at Cooking 30');

  // Verify options match ingredients player has (crypt_meat: 3, salt: 2)
  const optionValues = slot1.children.map(c => c.value);
  assert.ok(optionValues.includes('crypt_meat'), 'crypt_meat option present');
  assert.ok(optionValues.includes('salt'), 'salt option present');
  const cryptMeatOpt = slot1.children.find(c => c.value === 'crypt_meat');
  assert.ok(cryptMeatOpt?.innerText.includes('(3)'), 'crypt_meat displays correct total count (3)');
  const saltOpt = slot1.children.find(c => c.value === 'salt');
  assert.ok(saltOpt?.innerText.includes('(2)'), 'salt displays correct total count (2)');
  console.log('✔ Step 2 passed: Exactly 4 visible selects rendered at Lv 30 with correct ingredient options.');

  // ==========================================
  // Step 3: Choosing crypt_meat + salt and clicking Experiment discovers salted_jerky through CookingSystem
  // ==========================================
  console.log('\n--- Step 3: Experiment Discovery of salted_jerky ---');
  slot1.value = 'crypt_meat';
  slot2.value = 'salt';

  assert.equal(gs.isCookingRecipeDiscovered('salted_jerky'), false, 'salted_jerky undiscovered before experiment');

  hud.handleCookingExperiment();

  assert.equal(gs.isCookingRecipeDiscovered('salted_jerky'), true, 'salted_jerky permanently discovered through CookingSystem');
  const expStatusEl = getOrCreateElement('cooking-exp-status');
  assert.ok(expStatusEl.innerText.includes('Salted Jerky'), `Status should announce discovery: ${expStatusEl.innerText}`);
  console.log('✔ Step 3 passed: salted_jerky successfully discovered via experiment.');

  // ==========================================
  // Step 4: Recipe Journal shows 1 / 32
  // ==========================================
  console.log('\n--- Step 4: Recipe Journal 1 / 32 Progress ---');
  hud.switchCookingTab('journal');
  const journalProgressEl = getOrCreateElement('cooking-journal-progress');
  assert.equal(journalProgressEl.innerText, '1 / 32 Discovered', `Journal progress must be 1 / 32 Discovered, got: ${journalProgressEl.innerText}`);

  const journalContainer = getOrCreateElement('cooking-journal-container');
  assert.equal(journalContainer.children.length, 32, 'Journal renders all 32 discoverable recipes');
  console.log('✔ Step 4 passed: Recipe journal displays exactly 1 / 32 Discovered.');

  // ==========================================
  // Step 5: Lost Recipes tab lists 10 entries
  // ==========================================
  console.log('\n--- Step 5: Lost Recipes Tab Lists 10 Entries ---');
  hud.switchCookingTab('lost');
  const lostProgressEl = getOrCreateElement('cooking-lost-progress');
  assert.equal(lostProgressEl.innerText, '0 / 10 Deciphered');

  const lostContainer = getOrCreateElement('cooking-lost-container');
  assert.equal(lostContainer.children.length, 10, `Lost tab must list 10 entries, got ${lostContainer.children.length}`);
  console.log('✔ Step 5 passed: Lost tab lists exactly 10 entries with dropping enemy hints.');

  console.log('\nALL COOKING MODAL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
