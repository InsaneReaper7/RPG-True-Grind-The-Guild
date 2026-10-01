import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Module from 'node:module';

// Intercept phaser3spectorjs if Phaser probes for it
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
  public onchange: any = null;
  public onclick: any = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  public innerHTMLSetCount: number = 0;
  private _attributes: Record<string, string> = {};

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
    if (this.children.length > 0) {
      return this.children.map(c => c.innerHTML || c.textContent || '').join(' ');
    }
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.innerHTMLSetCount++;
    this.children = [];
    parseHTMLToTree(val, this);
  }

  get value(): string {
    return this._textContent;
  }
  set value(v: string) {
    this._textContent = v;
  }

  public setAttribute(name: string, value: string): void {
    this._attributes[name] = value;
  }

  public getAttribute(name: string): string | null {
    return this._attributes[name] ?? null;
  }

  public removeAttribute(name: string): void {
    delete this._attributes[name];
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

  public querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
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
      return el.getAttribute(trimmedAttrName) === val;
    }
    const trimmed = attrExp.trim();
    if (trimmed.startsWith('data-')) {
      const camel = trimmed.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      return el.dataset[camel] !== undefined;
    }
    return el.getAttribute(trimmed) !== null;
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function parseHTMLToTree(html: string, parent: MockElement) {
  const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9\-]+)([^>]*)\/>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1] || match[4];
    const attrs = match[2] || match[5] || '';
    const inner = match[3] || '';

    const el = new MockElement(tagName);
    const idMatch = attrs.match(/id=["']([^"']+)["']/);
    if (idMatch) el.id = idMatch[1];
    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (classMatch) {
      el.className = classMatch[1];
      classMatch[1].split(/\s+/).forEach(c => c && el.classList.add(c));
    }
    const dataMatches = attrs.matchAll(/data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g);
    for (const dm of dataMatches) {
      const camel = dm[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      el.dataset[camel] = dm[2];
      el.setAttribute(`data-${dm[1]}`, dm[2]);
    }
    if (inner && !/<[a-z]/i.test(inner)) {
      el.textContent = inner.trim();
    } else if (inner) {
      parseHTMLToTree(inner, el);
    }
    parent.appendChild(el);
  }
}

const elementRegistry = new Map<string, MockElement>();

function getOrCreateElement(id: string, tag: string = 'div'): MockElement {
  if (!elementRegistry.has(id)) {
    const el = new MockElement(tag);
    el.id = id;
    elementRegistry.set(id, el);
  }
  return elementRegistry.get(id)!;
}

const noop = () => {};

(global as any).window = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  ontouchstart: null,
  localStorage: {
    _store: {} as Record<string, string>,
    getItem(k: string) { return this._store[k] || null; },
    setItem(k: string, v: string) { this._store[k] = v; },
    removeItem(k: string) { delete this._store[k]; },
    clear() { this._store = {}; }
  }
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
        style: {}
      };
    }
    return new MockElement(tag);
  },
  getElementById: (id: string) => elementRegistry.get(id) || null,
  querySelector: (sel: string) => {
    for (const el of elementRegistry.values()) {
      if (matchesSelector(el, sel)) return el;
      const sub = el.querySelector(sel);
      if (sub) return sub;
    }
    return null;
  },
  querySelectorAll: (sel: string) => {
    const list: MockElement[] = [];
    for (const el of elementRegistry.values()) {
      if (matchesSelector(el, sel)) list.push(el);
      list.push(...el.querySelectorAll(sel));
    }
    return list;
  },
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: new MockElement('html'),
  body: new MockElement('body')
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

function createMockPhaserScene(isOutpost: boolean = true) {
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
      setVisible: () => obj,
      setText: () => obj,
      setColor: () => obj,
      setAlpha: () => obj,
      setScale: () => obj,
      setAngle: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setPosition: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setDisplaySize: () => obj,
      setSize: () => obj,
      setFrame: () => obj,
      setTexture: () => obj,
      setStyle: () => obj,
      setPadding: () => obj,
      setWordWrapWidth: () => obj,
      setShadow: () => obj,
      setStroke: () => obj,
      setLineWidth: () => obj,
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    isOutpost,
    sound: { play: () => {} },
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (_ms: number, cb: () => void) => cb()
    },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      text: () => createMockObj(),
      graphics: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      image: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (cfg: any) => {
        if (cfg?.onComplete) cfg.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

// Seed mock DOM elements
[
  // Main HUD
  'hud-gold', 'hud-ore', 'hud-wood', 'hud-stone', 'hud-dungeon-tokens',
  'location-badge', 'fps-display', 'turn-indicator', 'turn-text',
  'wave-indicator', 'wave-text', 'downed-banner',
  'hud-proficiency-row', 'hud-proficiency-label', 'player-proficiency',
  'hud-class-row', 'player-class', 'player-status', 'player-wood', 'build-overlay-wood',
  'day-clock-badge', 'player-hunger-text', 'player-mood-text', 'hud-ration-row',
  'player-ration-text', 'hud-eat-ration-btn',
  'party-portraits-hud', 'party-reselect-all-btn',
  'party-overview-modal', 'close-party-btn', 'party-spawn-companion-btn', 'party-overview-roster', 'open-party-btn',
  'party-overview-inventory', 'party-inventory-item-list',

  // Blacksmithing
  'blacksmithing-modal', 'blacksmithing-recipes-container', 'close-blacksmithing-btn',
  'blacksmithing-modal-prof', 'blacksmithing-stockpile-ore', 'blacksmithing-stockpile-steel-scrap',
  'blacksmithing-stockpile-orc-heavy-hide', 'blacksmithing-status-msg',
  'blacksmithing-toggle-filter-btn', 'blacksmithing-toggle-filter-label', 'blacksmithing-toggle-filter-indicator',

  // Armorsmithing
  'armorsmithing-modal', 'armorsmithing-recipes-container', 'close-armorsmithing-btn',
  'armorsmithing-modal-prof', 'armorsmithing-stockpile-wolf-pelt', 'armorsmithing-stockpile-spider-silk',
  'armorsmithing-status-msg',
  'armorsmithing-toggle-filter-btn', 'armorsmithing-toggle-filter-label', 'armorsmithing-toggle-filter-indicator',

  // Bowyer
  'bowyer-modal', 'bowyer-recipes-container', 'close-bowyer-btn',
  'bowyer-modal-prof', 'bowyer-stockpile-wood', 'bowyer-stockpile-spider-silk', 'bowyer-stockpile-bone-claw',
  'bowyer-status-msg',
  'bowyer-toggle-filter-btn', 'bowyer-toggle-filter-label', 'bowyer-toggle-filter-indicator',

  // Alchemy
  'alchemy-modal', 'alchemy-recipes-container', 'close-alchemy-btn',
  'alchemy-modal-prof', 'alchemy-modal-wood', 'alchemy-modal-bandages', 'alchemy-modal-energy-potions',
  'alchemy-modal-mana-potions', 'alchemy-modal-revive-potions', 'alchemy-modal-escape-stones', 'alchemy-modal-antidotes',
  'alchemy-mood-value', 'alchemy-mood-effect', 'alchemy-player-status',
  'alchemy-toggle-filter-btn', 'alchemy-toggle-filter-label', 'alchemy-toggle-filter-indicator',

  // Cooking
  'cooking-modal', 'cooking-recipes-container', 'close-cooking-btn', 'cooking-dishes-container',
  'cooking-modal-prof', 'cooking-stockpile-herbs', 'cooking-stockpile-monster-meat', 'cooking-stockpile-wolf-meat',
  'cooking-exp-slot1', 'cooking-exp-slot2', 'cooking-experiment-btn', 'cooking-exp-status',
  'cooking-toggle-filter-btn', 'cooking-toggle-filter-label', 'cooking-toggle-filter-indicator',

  // Stockpile
  'stockpile-modal', 'close-stockpile-btn', 'open-stockpile-btn',
  'stockpile-search-input', 'stockpile-clear-search-btn',
  'stockpile-toggle-held-btn', 'stockpile-toggle-held-label', 'stockpile-toggle-held-indicator',
  'stockpile-items-container', 'stockpile-metric-distinct', 'stockpile-metric-total',
  'stockpile-metric-rp', 'stockpile-metric-wood', 'stockpile-metric-ore'
].forEach((id) => getOrCreateElement(id));

async function runTests() {
  console.log('=== Starting Crafting Station Recipe Filter Test Suite ===\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // --- TEST 1: index.html markup & CSS consistency ---
  console.log('--- Test 1: Markup and CSS for Crafting Station Toggle Filter Buttons ---');
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const stations = ['blacksmithing', 'armorsmithing', 'bowyer', 'alchemy', 'cooking'];
  for (const st of stations) {
    assert.ok(html.includes(`id="${st}-toggle-filter-btn"`), `index.html must contain #${st}-toggle-filter-btn`);
    assert.ok(html.includes(`id="${st}-toggle-filter-indicator"`), `index.html must contain #${st}-toggle-filter-indicator`);
    assert.ok(html.includes(`id="${st}-toggle-filter-label"`), `index.html must contain #${st}-toggle-filter-label`);
    assert.ok(html.includes(`Showing: Unlocked Only`), `Default label for #${st} filter must be 'Showing: Unlocked Only'`);
  }
  assert.ok(html.includes('.crafting-toggle-btn') || html.includes('.stockpile-toggle-btn'), 'CSS rules must style toggle buttons');
  console.log('✓ Test 1 Passed: index.html markup and styling verified for all 5 stations.\n');

  // --- Setup Entities & HUD ---
  const mockScene = createMockPhaserScene(true);
  const hud = new HUD(mockScene, true);
  hud.setLocation('Guild Outpost', true);

  const gameState = GameState.getInstance();
  gameState.clearSave();
  gameState.resetDiscoveries(true);

  const basePlayerData = {
    id: 'hero',
    name: 'Guild Hero',
    avatarKey: 'hero-avatar',
    hp: 50,
    criticalHp: 25,
    energy: 100,
    hunger: 100,
    mood: 80,
    proficiencies: {
      blacksmithing: { level: 0, currentExp: 0 },
      armorsmithing: { level: 0, currentExp: 0 },
      bowyer: { level: 0, currentExp: 0 },
      alchemy: { level: 0, currentExp: 0 },
      cooking: { level: 0, currentExp: 0 }
    }
  };

  const progression = new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero');
  const hero = new Player(mockScene as any, 100, 100, basePlayerData as any, progression);

  // --- TEST 2: Initial Filter State & Success Criteria Defaults ---
  console.log('--- Test 2: Initial Filter State Defaults to Unlocked Only ---');
  for (const st of stations) {
    assert.strictEqual(hud.isCraftingFilterActive(st), true, `${st} must default to isCraftingFilterActive = true`);
  }
  console.log('✓ Test 2 Passed: Every crafting station filter defaults to true (unlocked-only).\n');

  // --- TEST 3: Blacksmithing Station Filtering ---
  console.log('--- Test 3: Blacksmithing Station Recipe Filter ---');
  hud.openBlacksmithingModal(hero, progression);
  const bsContainer = getOrCreateElement('blacksmithing-recipes-container');
  const bsBtn = getOrCreateElement('blacksmithing-toggle-filter-btn');
  const bsLabel = getOrCreateElement('blacksmithing-toggle-filter-label');
  const bsIndicator = getOrCreateElement('blacksmithing-toggle-filter-indicator');

  // At Level 0: Heavy War Mace (Lv 5) and Spiked Morningstar (Lv 10) should be HIDDEN
  assert.strictEqual(bsIndicator.innerText, '✅');
  assert.strictEqual(bsLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(bsContainer.innerHTML.includes('Iron Mace'), 'Iron Mace (Lv 0) must be shown');
  assert.ok(!bsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace (Lv 5) must be HIDDEN when filter is active');
  assert.ok(!bsContainer.innerHTML.includes('Spiked Morningstar'), 'Spiked Morningstar (Lv 10) must be HIDDEN when filter is active');
  const bsCountFiltered = bsContainer.children.length;

  // Toggle to "Show All"
  bsBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('blacksmithing'), false, 'Blacksmithing filter is now false (Show All)');
  assert.strictEqual(bsIndicator.innerText, '👁️');
  assert.strictEqual(bsLabel.innerText, 'Showing: All Recipes');
  assert.ok(bsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace (Lv 5) must be visible when Show All is active');
  assert.ok(bsContainer.innerHTML.includes('Spiked Morningstar'), 'Spiked Morningstar (Lv 10) must be visible when Show All is active');
  assert.ok(bsContainer.innerHTML.includes('Req. Blacksmithing Lv 5'), 'Locked badge for Lv 5 must be present');
  assert.ok(bsContainer.innerHTML.includes('Req. Blacksmithing Lv 10'), 'Locked badge for Lv 10 must be present');
  const bsCountAll = bsContainer.children.length;
  console.log(`  Per-Station Count: Blacksmithing -> Unlocked Only = ${bsCountFiltered}, Show All = ${bsCountAll}`);

  // Toggle back to Unlocked Only
  bsBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('blacksmithing'), true, 'Blacksmithing filter is back to true');
  assert.strictEqual(bsIndicator.innerText, '✅');
  assert.strictEqual(bsLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(!bsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace must be hidden again');
  assert.ok(!bsContainer.innerHTML.includes('Spiked Morningstar'), 'Spiked Morningstar must be hidden again');
  console.log('✓ Test 3 Passed: Blacksmithing filter toggles cleanly between unlocked-only and show all.\n');

  // --- TEST 4: Armorsmithing Station Filtering ---
  console.log('--- Test 4: Armorsmithing Station Recipe Filter ---');
  hud.openArmorsmithingModal(hero, progression);
  const asContainer = getOrCreateElement('armorsmithing-recipes-container');
  const asBtn = getOrCreateElement('armorsmithing-toggle-filter-btn');
  const asLabel = getOrCreateElement('armorsmithing-toggle-filter-label');
  const asIndicator = getOrCreateElement('armorsmithing-toggle-filter-indicator');

  // At Level 0: Only Leather Cap & Leather Armor (Lv 0) should be visible
  assert.strictEqual(asIndicator.innerText, '✅');
  assert.strictEqual(asLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(asContainer.innerHTML.includes('Leather Cap'), 'Leather Cap (Lv 0) must be shown');
  assert.ok(asContainer.innerHTML.includes('Leather Armor'), 'Leather Armor (Lv 0) must be shown');
  assert.ok(!asContainer.innerHTML.includes('Bone Necklace'), 'Bone Necklace (Lv 1) must be HIDDEN when filter is active');
  assert.ok(!asContainer.innerHTML.includes('Wolf Claw Ring'), 'Wolf Claw Ring (Lv 2) must be HIDDEN when filter is active');
  assert.ok(!asContainer.innerHTML.includes('Venom Charm'), 'Venom Charm (Lv 4) must be HIDDEN when filter is active');
  assert.ok(!asContainer.innerHTML.includes('Silk Cowl'), 'Silk Cowl (Lv 5) must be HIDDEN when filter is active');
  const asCountFiltered = asContainer.children.length;

  // Toggle to "Show All"
  asBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('armorsmithing'), false);
  assert.strictEqual(asIndicator.innerText, '👁️');
  assert.strictEqual(asLabel.innerText, 'Showing: All Recipes');
  assert.ok(asContainer.innerHTML.includes('Bone Necklace'), 'Bone Necklace must be shown in Show All');
  assert.ok(asContainer.innerHTML.includes('Silk Cowl'), 'Silk Cowl must be shown in Show All');
  assert.ok(asContainer.innerHTML.includes('Req. Armorsmithing Lv 5'), 'Locked badge for Lv 5 must be present');
  const asCountAll = asContainer.children.length;
  console.log(`  Per-Station Count: Armorsmithing -> Unlocked Only = ${asCountFiltered}, Show All = ${asCountAll}`);

  // Toggle back
  asBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('armorsmithing'), true);
  assert.ok(!asContainer.innerHTML.includes('Bone Necklace'), 'Bone Necklace hidden again');
  assert.ok(!asContainer.innerHTML.includes('Silk Cowl'), 'Silk Cowl hidden again');
  console.log('✓ Test 4 Passed: Armorsmithing filter toggles cleanly between unlocked-only and show all.\n');

  // --- TEST 5: Bowyer Station Filtering ---
  console.log('--- Test 5: Bowyer Station Recipe Filter ---');
  hud.openBowyerModal(hero, progression);
  const byContainer = getOrCreateElement('bowyer-recipes-container');
  const byBtn = getOrCreateElement('bowyer-toggle-filter-btn');
  const byLabel = getOrCreateElement('bowyer-toggle-filter-label');
  const byIndicator = getOrCreateElement('bowyer-toggle-filter-indicator');

  // At Level 0: Hunting Bow & Quarterstaff (Lv 0) should be shown, Composite Bow (Lv 5) & War Bow (Lv 10) hidden
  assert.strictEqual(byIndicator.innerText, '✅');
  assert.strictEqual(byLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(byContainer.innerHTML.includes('Hunting Bow'), 'Hunting Bow (Lv 0) must be shown');
  assert.ok(!byContainer.innerHTML.includes('Composite Bow'), 'Composite Bow (Lv 5) must be HIDDEN');
  assert.ok(!byContainer.innerHTML.includes('War Bow'), 'War Bow (Lv 10) must be HIDDEN');
  const byCountFiltered = byContainer.children.length;

  // Toggle to "Show All"
  byBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('bowyer'), false);
  assert.strictEqual(byIndicator.innerText, '👁️');
  assert.strictEqual(byLabel.innerText, 'Showing: All Recipes');
  assert.ok(byContainer.innerHTML.includes('Composite Bow'), 'Composite Bow visible in Show All');
  assert.ok(byContainer.innerHTML.includes('War Bow'), 'War Bow visible in Show All');
  assert.ok(byContainer.innerHTML.includes('Req. Bowyer Lv 5'), 'Req Lv 5 badge shown');
  assert.ok(byContainer.innerHTML.includes('Req. Bowyer Lv 10'), 'Req Lv 10 badge shown');
  const byCountAll = byContainer.children.length;
  console.log(`  Per-Station Count: Bowyer -> Unlocked Only = ${byCountFiltered}, Show All = ${byCountAll}`);

  // Toggle back
  byBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('bowyer'), true);
  assert.ok(!byContainer.innerHTML.includes('Composite Bow'), 'Composite Bow hidden again');
  assert.ok(!byContainer.innerHTML.includes('War Bow'), 'War Bow hidden again');
  console.log('✓ Test 5 Passed: Bowyer filter toggles cleanly between unlocked-only and show all.\n');

  // --- TEST 6: Cooking Station Filtering & Discovery Secrecy ---
  console.log('--- Test 6: Cooking Station Recipe Filter & Discovery Secrecy ---');
  gameState.clearSave();
  gameState.resetDiscoveries(true);

  const ckContainer = getOrCreateElement('cooking-recipes-container');
  const ckBtn = getOrCreateElement('cooking-toggle-filter-btn');
  const ckLabel = getOrCreateElement('cooking-toggle-filter-label');
  const ckIndicator = getOrCreateElement('cooking-toggle-filter-indicator');

  // Scenario 6A: 0 recipes discovered initially
  hud.openCookingModal(hero, progression);
  assert.strictEqual(ckIndicator.innerText, '✅');
  assert.strictEqual(ckLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(ckContainer.innerHTML.includes('No recipes discovered yet'), 'Empty banner shown when 0 recipes discovered in Unlocked Only');
  assert.ok(!ckContainer.innerHTML.includes('recipes still undiscovered'), 'Count banner omitted in Unlocked Only');

  // Toggle to Show All with 0 discoveries: empty banner AND count banner rendered; NEVER recipe names!
  ckBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('cooking'), false);
  assert.strictEqual(ckLabel.innerText, 'Showing: All Recipes');
  assert.ok(ckContainer.innerHTML.includes('No recipes discovered yet'), 'Empty banner shown in Show All when 0 discovered');
  assert.ok(ckContainer.innerHTML.includes('2 recipes still undiscovered'), 'Count banner renders 2 recipes undiscovered');
  assert.ok(!ckContainer.innerHTML.includes('Herb Stew'), 'Herb Stew must NOT be revealed');
  assert.ok(!ckContainer.innerHTML.includes('herb_stew'), 'herb_stew ID must NOT be revealed');
  assert.ok(!ckContainer.innerHTML.includes('Hearty Beast Stew'), 'Hearty Beast Stew must NOT be revealed');
  assert.ok(!ckContainer.innerHTML.includes('beast_stew'), 'beast_stew ID must NOT be revealed');

  // Scenario 6B: Discover only herb_stew
  gameState.discoverCookingRecipe('herb_stew');
  ckBtn.onclick?.(); // Back to Unlocked Only
  assert.strictEqual(hud.isCraftingFilterActive('cooking'), true);
  assert.strictEqual(ckLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(ckContainer.innerHTML.includes('Herb Stew'), 'Discovered recipe Herb Stew must be shown in Unlocked Only');
  assert.ok(!ckContainer.innerHTML.includes('Hearty Beast Stew'), 'Undiscovered Hearty Beast Stew must NOT appear anywhere in Unlocked Only');
  assert.ok(!ckContainer.innerHTML.includes('beast_stew'), 'Undiscovered beast_stew ID must NOT appear anywhere in Unlocked Only');
  assert.ok(!ckContainer.innerHTML.includes('recipes still undiscovered'), 'Count line must NOT appear in Unlocked Only');
  const ckCountFiltered = ckContainer.children.length;

  // Toggle to Show All with 1 discovery
  ckBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('cooking'), false);
  assert.strictEqual(ckLabel.innerText, 'Showing: All Recipes');
  assert.ok(ckContainer.innerHTML.includes('Herb Stew'), 'Herb Stew shown in Show All');
  // CRITICAL SECRECY ASSERTION: undiscovered recipe name and ID must NEVER appear anywhere in DOM
  assert.ok(!ckContainer.innerHTML.includes('Hearty Beast Stew'), 'Hearty Beast Stew name must NEVER appear in Show All');
  assert.ok(!ckContainer.innerHTML.includes('beast_stew'), 'beast_stew ID must NEVER appear in Show All');
  assert.ok(ckContainer.innerHTML.includes('1 recipe still undiscovered'), 'Single count line indicates 1 recipe undiscovered');
  const ckCountAll = ckContainer.children.length;
  console.log(`  Per-Station Count: Cooking -> Unlocked Only = ${ckCountFiltered}, Show All = ${ckCountAll} (1 Discovered, 1 Undiscovered Count Line)`);

  // Scenario 6C: Now discover beast_stew -> It should now immediately appear!
  gameState.discoverCookingRecipe('beast_stew');
  hud.renderCookingModal(hero, progression);
  assert.ok(ckContainer.innerHTML.includes('Hearty Beast Stew'), 'Hearty Beast Stew now appears after discovery');
  assert.ok(!ckContainer.innerHTML.includes('recipes still undiscovered'), 'Undiscovered count line disappears when 0 remain undiscovered');

  // Toggle back to Unlocked Only
  ckBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('cooking'), true);
  assert.ok(ckContainer.innerHTML.includes('Herb Stew'), 'Herb Stew shown');
  assert.ok(ckContainer.innerHTML.includes('Hearty Beast Stew'), 'Hearty Beast Stew shown in Unlocked Only now that it is discovered');
  console.log('✓ Test 6 Passed: Cooking filter enforces strict discovery secrecy (count-only in Show All; zero names/IDs leaked).\n');

  // --- TEST 7: Alchemy Station Filtering ---
  console.log('--- Test 7: Alchemy Station Recipe Filter ---');
  hud.openAlchemyModal(hero, progression);
  const alContainer = getOrCreateElement('alchemy-recipes-container');
  const alBtn = getOrCreateElement('alchemy-toggle-filter-btn');
  const alLabel = getOrCreateElement('alchemy-toggle-filter-label');
  const alIndicator = getOrCreateElement('alchemy-toggle-filter-indicator');

  assert.strictEqual(alIndicator.innerText, '✅');
  assert.strictEqual(alLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(alContainer.innerHTML.includes('Bandage'), 'Bandage must be shown');
  assert.ok(alContainer.innerHTML.includes('Energy Potion'), 'Energy Potion must be shown');
  assert.ok(alContainer.innerHTML.includes('Bone Meal'), 'Bone Meal must be shown at Lv 0');
  assert.ok(alContainer.innerHTML.includes('Revive Potion'), 'Revive Potion must be shown at Lv 0');
  assert.ok(alContainer.innerHTML.includes('Health Potion'), 'Health Potion must be shown');
  const alCountFiltered = alContainer.children.length;
  assert.strictEqual(alCountFiltered, 8, 'All 8 Alchemy recipes must be unlocked and shown at Lv 0');

  // Toggle to Show All
  alBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('alchemy'), false);
  assert.strictEqual(alIndicator.innerText, '👁️');
  assert.strictEqual(alLabel.innerText, 'Showing: All Recipes');
  const alCountAll = alContainer.children.length;
  assert.strictEqual(alCountAll, 8, 'All 8 Alchemy recipes must be shown in Show All');
  console.log(`  Per-Station Count: Alchemy -> Unlocked Only = ${alCountFiltered}, Show All = ${alCountAll}`);

  // Toggle back
  alBtn.onclick?.();
  assert.strictEqual(hud.isCraftingFilterActive('alchemy'), true);
  assert.strictEqual(alIndicator.innerText, '✅');
  assert.strictEqual(alLabel.innerText, 'Showing: Unlocked Only');
  console.log('✓ Test 7 Passed: Alchemy filter toggle functions consistently with 8 recipes.\n');

  // --- TEST 8: Live Level-Up Dynamic Recipe Unlocking ---
  console.log('--- Test 8: Live Proficiency Level-Up Unlocks Recipe While Filter Remains Active ---');
  // Back to Blacksmithing with Level 0: Heavy War Mace is hidden in default filter
  hud.openBlacksmithingModal(hero, progression);
  assert.ok(!bsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace is hidden at Lv 0');

  // Grant Blacksmithing EXP to reach Level 5
  progression.addProficiencyExp('blacksmithing', 350);
  const bsStat = progression.getProficiencyStat('blacksmithing');
  assert.ok(bsStat.level >= 5, `Hero blacksmithing level is now ${bsStat.level} (>= 5)`);

  // Re-render modal with filter still ON (unlocked-only)
  hud.renderBlacksmithingModal(hero, progression);
  assert.strictEqual(hud.isCraftingFilterActive('blacksmithing'), true, 'Filter is still active (unlocked-only)');
  assert.strictEqual(bsLabel.innerText, 'Showing: Unlocked Only');
  assert.ok(bsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace (Lv 5) now dynamically appears in unlocked-only list!');
  assert.ok(!bsContainer.innerHTML.includes('Spiked Morningstar'), 'Spiked Morningstar (Lv 10) remains hidden');
  console.log('✓ Test 8 Passed: Leveling up proficiency immediately unlocks recipes in the filtered view.\n');

  // --- TEST 9: Leader Change Re-Renders Active Crafting Station Modal ---
  console.log('--- Test 9: OutpostScene.changePartyLeader Dynamically Re-Renders Open Crafting Modal ---');
  const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
  const outpost = new OutpostScene();
  // Scene lifecycle mocks
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
  (outpost as any).textures = { exists: () => true };
  (outpost as any).time = { now: 1000 };
  (outpost as any).events = { once: () => {}, on: () => {}, off: () => {}, emit: () => {} };
  (outpost as any).tweens = { add: () => ({ remove: () => {} }) };
  (outpost as any).input = {
    mouse: { disableContextMenu: () => {} },
    keyboard: { addKey: () => ({ on: () => {} }) },
    on: () => {},
    off: () => {}
  };
  (outpost as any).cameras = {
    main: {
      setBounds: () => {},
      startFollow: () => {}
    }
  };
  (outpost as any).add = {
    existing: (item: any) => item,
    container: () => mockScene.add.rectangle(),
    image: () => mockScene.add.rectangle(),
    sprite: () => mockScene.add.rectangle(),
    graphics: () => mockScene.add.graphics(),
    line: () => mockScene.add.line(),
    text: () => mockScene.add.text(),
    rectangle: () => mockScene.add.rectangle(),
    circle: () => mockScene.add.circle()
  };

  outpost.create();
  assert.strictEqual(outpost.party.length, 1, 'Outpost initial party has 1 member (Guild Hero)');
  outpost.spawnTestCompanion();
  assert.strictEqual(outpost.party.length, 2, 'Outpost now has 2 members (Guild Hero & Valerie)');

  const leaderHero = outpost.party[0];
  const compValerie = outpost.party[1];

  // Hero has Blacksmithing Level 0; Valerie has Blacksmithing Level 5
  assert.strictEqual(leaderHero.progression.getProficiencyStat('blacksmithing').level, 0);
  compValerie.progression.addProficiencyExp('blacksmithing', 350);
  const valerieBsLevel = compValerie.progression.getProficiencyStat('blacksmithing').level;
  assert.ok(valerieBsLevel >= 5, `Valerie blacksmithing level is ${valerieBsLevel} (>= 5)`);

  // Open Blacksmithing modal with Hero (Lv 0) as leader
  outpost.hud.openBlacksmithingModal(outpost.player, outpost.progressionSystem);
  assert.strictEqual(outpost.hud.isCraftingFilterActive('blacksmithing'), true);
  const outpostBsContainer = getOrCreateElement('blacksmithing-recipes-container');
  const cardsBeforePromo = outpostBsContainer.children.length;
  console.log(`  Initial Hero (Lv 0) leader visible recipe count: ${cardsBeforePromo}`);
  assert.ok(outpostBsContainer.innerHTML.includes('Iron Mace'), 'Iron Mace visible for Lv 0 Hero');
  assert.ok(!outpostBsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace hidden for Lv 0 Hero');

  // Promote Valerie to Leader via the REAL OutpostScene.changePartyLeader
  const promoSuccess = outpost.changePartyLeader(1);
  assert.strictEqual(promoSuccess, true, 'Valerie promoted via outpost.changePartyLeader(1)');
  assert.strictEqual(outpost.player.entityName, 'Valerie', 'Active leader is now Valerie');

  // Assert modal re-rendered live to match Valerie's proficiency
  const cardsAfterPromo = outpostBsContainer.children.length;
  console.log(`  Promoted Valerie (Lv 5) leader visible recipe count: ${cardsAfterPromo}`);
  assert.ok(cardsAfterPromo > cardsBeforePromo, 'Visible recipe count increased to reflect new leader proficiency');
  assert.ok(outpostBsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace is now visible for Lv 5 Valerie');

  // Demote/swap back to Hero
  const demoteSuccess = outpost.changePartyLeader(1);
  assert.strictEqual(demoteSuccess, true, 'Hero promoted back via outpost.changePartyLeader(1)');
  assert.strictEqual(outpost.player.entityName, 'Guild Hero', 'Active leader is back to Guild Hero');
  const cardsAfterDemote = outpostBsContainer.children.length;
  console.log(`  Restored Hero (Lv 0) leader visible recipe count: ${cardsAfterDemote}`);
  assert.strictEqual(cardsAfterDemote, cardsBeforePromo, 'Visible recipe count reverted to match Hero proficiency');
  assert.ok(!outpostBsContainer.innerHTML.includes('Heavy War Mace'), 'Heavy War Mace hidden again for Hero');
  console.log('✓ Test 9 Passed: OutpostScene.changePartyLeader dynamically re-renders open crafting modal.\n');

  console.log('================================================================');
  console.log('ALL CRAFTING RECIPE FILTER TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
