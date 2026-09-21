import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// --- MOCK DOM IMPLEMENTATION ---
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
  public ondragstart: any = null;
  public ondragend: any = null;
  public ondragover: any = null;
  public ondragleave: any = null;
  public ondrop: any = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  public innerHTMLSetCount: number = 0;
  private _listeners: Record<string, any[]> = {};

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

  public appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentElement = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  public querySelector<T = MockElement>(sel: string): T | null {
    const results = this.querySelectorAll<T>(sel);
    return results.length > 0 ? results[0] : null;
  }

  public querySelectorAll<T = MockElement>(sel: string): T[] {
    const results: MockElement[] = [];
    const search = (node: MockElement) => {
      for (const child of node.children) {
        if (matchesSelector(child, sel)) {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results as unknown as T[];
  }

  public closest<T = MockElement>(sel: string): T | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (matchesSelector(curr, sel)) return curr as unknown as T;
      curr = curr.parentElement;
    }
    return null;
  }

  public addEventListener(type: string, fn: any) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  public removeEventListener(type: string, fn: any) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(l => l !== fn);
  }
}

function matchesSelector(el: MockElement, sel: string): boolean {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  if (sel.startsWith('[')) {
    const m = /\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/.exec(sel);
    if (m) {
      const attr = m[1];
      const val = m[2];
      if (attr.startsWith('data-')) {
        const dataKey = attr.slice(5);
        if (val !== undefined) return el.dataset[dataKey] === val;
        return el.dataset[dataKey] !== undefined;
      }
    }
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function parseHTMLToTree(html: string, root: MockElement) {
  const tokenRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
  const stack: MockElement[] = [root];
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[0].startsWith('<!--')) continue;

    const isClosing = match[1] === '/';
    const tagName = match[2];
    const attrsStr = match[3];
    const isSelfClosing = match[4] === '/' || (tagName && ['br', 'hr', 'img', 'input'].includes(tagName.toLowerCase()));
    const textContent = match[5];

    if (textContent) {
      const trimmed = textContent.trim();
      if (trimmed && stack.length > 0) {
        stack[stack.length - 1].textContent = (stack[stack.length - 1].textContent || '') + trimmed;
      }
    } else if (tagName) {
      if (isClosing) {
        while (stack.length > 1) {
          const top = stack.pop()!;
          if (top.tagName.toLowerCase() === tagName.toLowerCase()) {
            break;
          }
        }
      } else {
        const el = new MockElement(tagName);
        el.parentElement = stack[stack.length - 1];

        if (attrsStr) {
          const classMatch = /class="([^"]*)"/.exec(attrsStr);
          if (classMatch) {
            classMatch[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
          }
          const idMatch = /id="([^"]*)"/.exec(attrsStr);
          if (idMatch) el.id = idMatch[1];

          const attrRegex = /([a-zA-Z0-9-]+)(?:="([^"]*)")?/g;
          let aMatch;
          while ((aMatch = attrRegex.exec(attrsStr)) !== null) {
            const attrName = aMatch[1];
            const attrVal = aMatch[2] !== undefined ? aMatch[2] : '';
            if (attrName.startsWith('data-')) {
              const dataKey = attrName.slice(5);
              const camelKey = dataKey.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
              el.dataset[dataKey] = attrVal;
              el.dataset[camelKey] = attrVal;
            }
          }
        }

        stack[stack.length - 1].children.push(el);
        if (!isSelfClosing) {
          stack.push(el);
        }
      }
    }
  }
}

const mockDomElements = new Map<string, MockElement>();
function getOrCreateElement(id: string): MockElement {
  if (!mockDomElements.has(id)) {
    const el = new MockElement('div');
    el.id = id;
    mockDomElements.set(id, el);
  }
  return mockDomElements.get(id)!;
}

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
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: () => dummyCtx,
          style: {}
        };
      }
      return new MockElement(tag);
    },
    getElementById: (id: string) => getOrCreateElement(id),
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      mockDomElements.forEach(el => {
        if (matchesSelector(el, sel)) results.push(el);
      });
      return results;
    },
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: new MockElement('html'),
    body: new MockElement('body')
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
      setAngle: () => obj,
      setAlpha: () => obj,
      setScale: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setPosition: () => obj,
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
      addEvent: () => ({ remove: () => {} })
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

// Pre-create UI elements needed for HUD constructor
[
  'player-hp', 'player-crit-hp', 'player-energy', 'player-weapon',
  'hud-proficiency-row', 'hud-proficiency-label', 'player-proficiency',
  'hud-class-row', 'player-class', 'player-status', 'player-wood', 'build-overlay-wood',
  'day-clock-badge', 'player-hunger-text', 'player-mood-text', 'hud-ration-row',
  'player-ration-text', 'hud-eat-ration-btn', 'downed-banner',
  'portrait-card-0', 'portrait-name-0', 'portrait-avatar-0', 'portrait-hp-bar-0', 'portrait-crit-bar-0', 'portrait-energy-bar-0', 'portrait-status-0', 'portrait-hotkey-0',
  'portrait-card-1', 'portrait-name-1', 'portrait-avatar-1', 'portrait-hp-bar-1', 'portrait-crit-bar-1', 'portrait-energy-bar-1', 'portrait-status-1', 'portrait-hotkey-1',
  'portrait-card-2', 'portrait-name-2', 'portrait-avatar-2', 'portrait-hp-bar-2', 'portrait-crit-bar-2', 'portrait-energy-bar-2', 'portrait-status-2', 'portrait-hotkey-2',
  'portrait-card-3', 'portrait-name-3', 'portrait-avatar-3', 'portrait-hp-bar-3', 'portrait-crit-bar-3', 'portrait-energy-bar-3', 'portrait-status-3', 'portrait-hotkey-3',
  'party-portraits-hud', 'party-reselect-all-btn',
  'party-overview-modal', 'close-party-btn', 'party-spawn-companion-btn', 'party-overview-roster', 'open-party-btn',
  'party-overview-inventory', 'party-inventory-item-list',
  'inv-filter-all', 'inv-filter-weapons', 'inv-filter-armor', 'inv-filter-jewelry',
  'debug-skills-panel', 'debug-member-select', 'close-debug-skills-btn',
  'cooking-modal', 'close-cooking-btn', 'cooking-stockpile-meat', 'cooking-stockpile-ration', 'cooking-recipes-container', 'cooking-status-msg',
  'skill-loadout-modal', 'close-loadout-btn', 'loadout-member-select', 'active-class-current-badge', 'active-class-container', 'equip-slots-container', 'known-skills-container', 'slots-count-badge',
  'research-tree-modal', 'close-research-btn', 'research-tree-container', 'research-tier-badge', 'research-wood-badge',
  'alchemy-modal', 'close-alchemy-btn', 'alchemy-modal-prof', 'alchemy-stockpile-slimes', 'alchemy-stockpile-herbs', 'alchemy-stockpile-mushrooms', 'alchemy-recipes-container', 'alchemy-status-msg',
  'blacksmithing-modal', 'close-blacksmithing-btn', 'blacksmithing-modal-prof', 'blacksmithing-stockpile-ore', 'blacksmithing-stockpile-steel-scrap', 'blacksmithing-stockpile-orc-heavy-hide', 'blacksmithing-recipes-container', 'blacksmithing-status-msg',
  'armorsmithing-modal', 'close-armorsmithing-btn', 'armorsmithing-modal-prof', 'armorsmithing-stockpile-wolf-pelt', 'armorsmithing-stockpile-spider-silk', 'armorsmithing-recipes-container', 'armorsmithing-status-msg',
  'knowledge-base-modal', 'close-knowledge-btn', 'open-knowledge-btn'
].forEach(id => getOrCreateElement(id));

async function runTests() {
  console.log('--- Starting Milestone 51 Test Suite: Weight & Encumbrance ---');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { HiddenSkillSystem } = await import('../src/systems/HiddenSkillSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const mockScene = createMockPhaserScene(true);
  const hud = new HUD(mockScene, true);

  const basePlayerData = {
    name: 'Guild Hero',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords',
    baseCarryCapacity: 45.0
  };

  // -------------------------------------------------------------
  // Test 1: Authoritative Item Weights Registry & Data Definitions
  // -------------------------------------------------------------
  console.log('\nTest 1: Authoritative item weights registry & data definitions');
  {
    // Check resources in data/items.json
    const itemsData = dataLoader.getItemsData();
    assert.ok(itemsData && itemsData.items.length > 0, 'items.json must contain registered items');

    const expectedResources: Record<string, number> = {
      wood: 0.2,
      stone: 0.5,
      ore: 0.5,
      iron_ore: 0.5,
      herbs: 0.05,
      wild_herbs: 0.05,
      dirt: 0.2,
      clay: 0.3,
      seeds: 0.02,
      wolf_pelt: 0.5,
      wolf_meat: 0.3,
      raw_meat: 0.3,
      spider_silk: 0.05,
      slime_jelly: 0.2,
      steel_scrap: 0.3,
      orc_heavy_hide: 1.0,
      lockpick: 0.05,
      broken_lockbox: 1.5,
      locked_box: 2.5
    };

    for (const [id, expectedWeight] of Object.entries(expectedResources)) {
      const itemDef = dataLoader.getItem(id);
      assert.ok(itemDef, `Item '${id}' must be present in items.json`);
      assert.strictEqual(
        itemDef.weight,
        expectedWeight,
        `Item '${id}' weight must be ${expectedWeight}kg, found ${itemDef.weight}`
      );
      assert.strictEqual(
        dataLoader.getItemWeight(id),
        expectedWeight,
        `DataLoader.getItemWeight('${id}') must return ${expectedWeight}kg`
      );
    }

    // Check weapons have weights
    const fist = dataLoader.getWeapon('fist');
    assert.strictEqual(fist?.weight, 0, 'Fist must have 0kg weight');

    const dagger = dataLoader.getWeapon('daggers');
    assert.strictEqual(dagger?.weight, 1.0, 'Daggers must have 1.0kg weight');

    const shortSword = dataLoader.getWeapon('short_swords');
    assert.strictEqual(shortSword?.weight, 3.0, 'Short swords must have 3.0kg weight');

    const greatsword = dataLoader.getWeapon('greatswords');
    assert.strictEqual(greatsword?.weight, 9.0, 'Greatswords must have 9.0kg weight');

    // Check armors have weights
    const leatherArmor = dataLoader.getArmor('leather_armor');
    assert.strictEqual(leatherArmor?.weight, 5.0, 'Leather armor must weigh 5.0kg');

    const silkRobe = dataLoader.getArmor('silk_robe');
    assert.strictEqual(silkRobe?.weight, 3.0, 'Silk robe must weigh 3.0kg');

    const venomCharm = dataLoader.getArmor('venom_charm');
    assert.strictEqual(venomCharm?.weight, 0.5, 'Venom charm must weigh 0.5kg');
    assert.strictEqual(venomCharm?.carryCapacityBonus, 5.0, 'Venom charm must grant +5.0kg carry capacity bonus');

    // Check foods have weights
    const ration = dataLoader.getFood('ration');
    assert.strictEqual(ration?.weight, 0.5, 'Ration must weigh 0.5kg');

    const stew = dataLoader.getFood('beast_stew');
    assert.strictEqual(stew?.weight, 0.6, 'Beast stew must weigh 0.6kg');

    // Check player default capacity
    const playerData = dataLoader.getPlayer();
    assert.strictEqual(playerData.baseCarryCapacity, 45.0, 'Player baseCarryCapacity must be 45.0kg');

    console.log('✓ Authoritative item weights registry verified across all item types, weapons, armors, and foods.');
  }

  // -------------------------------------------------------------
  // Test 2: Per-Character Weight & Personal Inventory Independence
  // -------------------------------------------------------------
  console.log('\nTest 2: Per-character weight & personal inventory independence');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';

    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());
    companion.entityName = 'Companion';

    // Verify initial independent weights
    assert.strictEqual(hero.getInventoryWeight(), 0, 'Hero initial inventory weight must be 0');
    assert.strictEqual(companion.getInventoryWeight(), 0, 'Companion initial inventory weight must be 0');
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 45.0, 'Hero carry capacity must be 45.0kg');
    assert.strictEqual(companion.getEffectiveCarryCapacity(), 45.0, 'Companion carry capacity must be 45.0kg');

    // Add 50 wood (10kg) and 20 iron_ore (10kg) to Hero only
    hero.addItem('wood', 50);
    hero.addItem('iron_ore', 20);

    assert.strictEqual(hero.getItemCount('wood'), 50, 'Hero has 50 wood');
    assert.strictEqual(hero.getItemCount('iron_ore'), 20, 'Hero has 20 iron_ore');
    assert.strictEqual(hero.getInventoryWeight(), 20.0, 'Hero inventory weight must be 20.0kg');

    // Companion must have 0 items and 0 weight (ZERO spillover, no shared pool)
    assert.strictEqual(companion.getItemCount('wood'), 0, 'Companion must have 0 wood');
    assert.strictEqual(companion.getItemCount('iron_ore'), 0, 'Companion must have 0 iron_ore');
    assert.strictEqual(companion.getInventoryWeight(), 0, 'Companion inventory weight must remain 0kg');
    assert.strictEqual(companion.getTotalWeight(), companion.getEquippedWeight(), 'Companion total weight unchanged');

    // Equip heavy armor (leather_armor, 5.0kg) on Companion only
    const leatherArmor = dataLoader.getArmor('leather_armor')!;
    companion.equipArmorSlot('body', leatherArmor, true);

    assert.strictEqual(companion.getEquippedWeight(), 5.0, 'Companion equipped weight must be 5.0kg');
    assert.strictEqual(companion.getTotalWeight(), 5.0, 'Companion total weight must be 5.0kg');
    assert.strictEqual(hero.getEquippedWeight(), 0, 'Hero equipped weight must remain 0kg');
    assert.strictEqual(hero.getTotalWeight(), 20.0, 'Hero total weight must remain 20.0kg');

    console.log('✓ Per-character personal inventory grids and weight totals operate strictly independently.');
  }

  // -------------------------------------------------------------
  // Test 3: Downed Member Independence (Zero Weight Redistribution)
  // -------------------------------------------------------------
  console.log('\nTest 3: Downed member independence (zero weight redistribution)');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';
    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());
    companion.entityName = 'Companion';

    // Hero carries 30kg (60 stone)
    hero.addItem('stone', 60);
    assert.strictEqual(hero.getTotalWeight(), 30.0, 'Hero has 30kg');

    // Companion carries 20kg (40 stone)
    companion.addItem('stone', 40);
    assert.strictEqual(companion.getTotalWeight(), 20.0, 'Companion has 20kg');

    // Companion is Downed
    companion.state = 'downed';

    // Companion STILL holds their 20kg, and Hero STILL holds 30kg with 45kg capacity
    assert.strictEqual(companion.getItemCount('stone'), 40, 'Downed member still holds their items');
    assert.strictEqual(companion.getTotalWeight(), 20.0, 'Downed member still carries their 20.0kg weight');
    assert.strictEqual(hero.getTotalWeight(), 30.0, 'Hero weight must NOT increase when ally is downed');
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 45.0, 'Hero capacity must NOT decrease or redistribute');

    // Revive companion
    companion.revive(hero);
    assert.strictEqual(companion.getItemCount('stone'), 40, 'Revived companion retains all items');
    assert.strictEqual(companion.getTotalWeight(), 20.0, 'Revived companion retains weight');
    assert.strictEqual(hero.getTotalWeight(), 30.0, 'Hero weight unaffected by revive');

    console.log('✓ Downed members retain all weight and items; zero weight redistributes to survivors.');
  }

  // -------------------------------------------------------------
  // Test 4: Carry Capacity & Encumbrance Consequence (-80% Flat Movement Speed Penalty)
  // -------------------------------------------------------------
  console.log('\nTest 4: Carry capacity and encumbrance speed penalty (-80%)');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';

    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());
    companion.entityName = 'Companion';

    // Base move speed is 100
    assert.strictEqual(hero.moveSpeed, 100, 'Unencumbered hero moves at full speed (100)');
    assert.strictEqual(companion.moveSpeed, 100, 'Unencumbered companion moves at full speed (100)');

    // Add 45kg (90 stone) -> exactly at capacity
    hero.addItem('stone', 90);
    assert.strictEqual(hero.getTotalWeight(), 45.0, 'Hero has exactly 45.0kg');
    assert.strictEqual(hero.isEncumbered, false, 'Weight == capacity is NOT encumbered');
    assert.strictEqual(hero.moveSpeed, 100, 'Hero still moves at full speed at exact capacity');

    // Add 1 more stone (0.5kg) -> 45.5kg > 45.0kg -> ENCUMBERED!
    hero.addItem('stone', 1);
    assert.strictEqual(hero.getTotalWeight(), 45.5, 'Hero weight is 45.5kg');
    assert.strictEqual(hero.isEncumbered, true, 'Hero is now encumbered');

    // Consequence: flat -80% speed penalty (moveSpeed * 0.20)
    assert.strictEqual(hero.moveSpeed, 20, 'Hero speed reduced by -80% (100 * 0.20 = 20)');

    // Companion remains unaffected
    assert.strictEqual(companion.isEncumbered, false, 'Companion is not encumbered');
    assert.strictEqual(companion.moveSpeed, 100, 'Companion continues moving at full speed (100)');

    // Equip venom charm on Hero (+5.0kg capacity bonus)
    const venomCharm = dataLoader.getArmor('venom_charm')!;
    hero.equipArmorSlot('accessory', venomCharm, true);

    // Hero effective capacity is now 50.0kg. Total weight: 45.5kg (stone) + 0.5kg (charm) = 46.0kg <= 50.0kg!
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 50.0, 'Carry capacity increased to 50.0kg');
    assert.strictEqual(hero.getTotalWeight(), 46.0, 'Total weight is 46.0kg');
    assert.strictEqual(hero.isEncumbered, false, 'Hero is no longer encumbered with accessory capacity bonus');
    assert.strictEqual(hero.moveSpeed, 100, 'Hero move speed restored to 100');

    console.log('✓ Flat -80% movement speed penalty strictly enforced on encumbered units while unencumbered units move normally.');
  }

  // -------------------------------------------------------------
  // Test 5: Item Transfer & Discarding / Weight Shedding
  // -------------------------------------------------------------
  console.log('\nTest 5: Item transfer and discard between party members');
  {
    const gameState = GameState.getInstance();
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';

    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());
    companion.entityName = 'Companion';

    // Hero carries 100 stone (50kg) -> encumbered
    hero.addItem('stone', 100);
    assert.strictEqual(hero.getTotalWeight(), 50.0);
    assert.strictEqual(hero.isEncumbered, true);
    assert.strictEqual(hero.moveSpeed, 20);

    // Transfer 20 stone (10kg) from Hero to Companion
    const transferSuccess = gameState.transferItem(hero, companion, 'stone', 20);
    assert.strictEqual(transferSuccess, true, 'Item transfer must succeed');

    // Hero now has 80 stone (40kg) <= 45kg capacity -> unencumbered!
    assert.strictEqual(hero.getItemCount('stone'), 80, 'Hero now has 80 stone');
    assert.strictEqual(hero.getTotalWeight(), 40.0, 'Hero total weight dropped to 40.0kg');
    assert.strictEqual(hero.isEncumbered, false, 'Hero encumbrance cleared after transfer');
    assert.strictEqual(hero.moveSpeed, 100, 'Hero move speed restored to 100');

    // Companion received 20 stone (10kg)
    assert.strictEqual(companion.getItemCount('stone'), 20, 'Companion received 20 stone');
    assert.strictEqual(companion.getTotalWeight(), 10.0, 'Companion total weight is 10.0kg');
    assert.strictEqual(companion.isEncumbered, false, 'Companion remains unencumbered');

    // Discard 10 stone (5kg) from Companion
    const discardSuccess = gameState.discardItem(companion, 'stone', 10);
    assert.strictEqual(discardSuccess, true, 'Item discard must succeed');
    assert.strictEqual(companion.getItemCount('stone'), 10, 'Companion now has 10 stone');
    assert.strictEqual(companion.getTotalWeight(), 5.0, 'Companion weight dropped to 5.0kg');

    console.log('✓ Transferring and discarding items sheds weight and resolves encumbrance immediately.');
  }

  // -------------------------------------------------------------
  // Test 6: Gathering Continuity Under Encumbrance & Bag Yield Routing
  // -------------------------------------------------------------
  console.log('\nTest 6: Gathering continuity under encumbrance (-80% speed) across multi-node queue');
  {
    // 6a. Yield routing isolation to harvesting worker personal bag
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());

    companion.addItem('wood', 10);
    assert.strictEqual(companion.getItemCount('wood'), 10, 'Companion receives harvested wood directly in bag');
    assert.strictEqual(companion.getInventoryWeight(), 2.0, 'Companion bag weight increases');
    assert.strictEqual(hero.getItemCount('wood'), 0, 'Hero does not receive wood harvested by companion');

    // 6b. Approved Plan Scenario: Worker becomes encumbered mid-queue and continues
    // walking, channeling, and clearing subsequent nodes at 20% speed without stalling or timing out.
    const timerEvents: Array<{
      delay: number;
      loop: boolean;
      callback: () => void;
      elapsed: number;
      removed: boolean;
    }> = [];

    const queueScene: any = {
      ...mockScene,
      time: {
        now: 0,
        addEvent: (cfg: { delay: number; loop?: boolean; callback: () => void }) => {
          const ev = {
            delay: cfg.delay,
            loop: cfg.loop ?? false,
            callback: cfg.callback,
            elapsed: 0,
            removed: false
          };
          timerEvents.push(ev);
          return {
            remove: () => {
              ev.removed = true;
            }
          };
        }
      }
    };

    const worker = new Player(queueScene, 0, 0, basePlayerData as any, new ProgressionSystem());
    worker.entityName = 'QueueWorker';
    worker.isPartyMember = true;

    // Equip 5.0kg armor + 10.0kg items (total 15.0kg <= 45.0kg capacity) -> starts UNENCUMBERED
    const leatherArmor = dataLoader.getArmor('leather_armor')!;
    worker.equipArmorSlot('body', leatherArmor, true);
    worker.addItem('wood', 50); // 10.0kg
    assert.strictEqual(worker.getTotalWeight(), 15.0, 'Worker initial total weight is 15.0kg');
    assert.strictEqual(worker.isEncumbered, false, 'Worker starts unencumbered');
    assert.strictEqual(worker.moveSpeed, 100, 'Worker moves at full unencumbered speed (100)');

    // Define two real gathering nodes:
    // Node 1 at (3, 0) - adjacent target (2, 0), travel = 2 tiles (64px)
    // Node 2 at (11, 0) - adjacent target (10, 0), travel = 8 tiles (256px) from Node 1!
    const node1: any = {
      id: 'node1',
      x: 3,
      y: 0,
      isHarvested: false,
      nodeDef: {
        id: 'stone_deposit_1',
        name: 'Stone Deposit',
        resourceId: 'stone',
        channelDurationMs: 1000,
        actionVerb: 'Mining',
        color: '#94a3b8'
      },
      sprite: { setTexture: () => {} },
      label: { setText: () => {}, setColor: () => {} }
    };

    const node2: any = {
      id: 'node2',
      x: 11,
      y: 0,
      isHarvested: false,
      nodeDef: {
        id: 'iron_vein_2',
        name: 'Iron Vein',
        resourceId: 'iron_ore',
        channelDurationMs: 1000,
        actionVerb: 'Mining',
        color: '#f59e0b'
      },
      sprite: { setTexture: () => {} },
      label: { setText: () => {}, setColor: () => {} }
    };

    // Gathering Queue State
    let gatheringQueue = [node1, node2];
    const gatheringArrivalTimers = new Map<any, any>();
    const activeGatherChannels = new Map<any, any>();
    const workerAssignments = new Map<any, any>();

    const startGatherChannel = (char: Player, targetNode: any) => {
      char.state = 'channeling';
      char.claimedDestination = null;
      activeGatherChannels.set(char, {
        node: targetNode,
        durationMs: targetNode.nodeDef.channelDurationMs,
        elapsedMs: 0
      });
    };

    const completeGatherChannel = (char: Player) => {
      const channel = activeGatherChannels.get(char);
      if (!channel) return;
      activeGatherChannels.delete(char);
      channel.node.isHarvested = true;

      if (channel.node === node1) {
        // Yield 70 stone (35.0kg) -> pushes worker over 45.0kg capacity to 50.0kg!
        char.addItem('stone', 70);
      } else if (channel.node === node2) {
        // Yield 20 iron ore (10.0kg)
        char.addItem('iron_ore', 20);
      }

      workerAssignments.delete(char);
      char.state = 'idle';

      // Advance queue to next node
      processQueue();
    };

    const dispatchWorker = (char: Player, targetNode: any) => {
      workerAssignments.set(char, targetNode);
      const targetTile = { x: targetNode.x - 1, y: targetNode.y };
      char.claimedDestination = { ...targetTile };

      // Build straight path of tiles from current position to target tile
      const startX = char.gridPos.x;
      const pathSteps: any[] = [];
      const dir = targetTile.x >= startX ? 1 : -1;
      for (let curX = startX + dir; dir > 0 ? curX <= targetTile.x : curX >= targetTile.x; curX += dir) {
        pathSteps.push({ x: curX, y: targetTile.y });
      }

      char.followPath(pathSteps, () => {
        if (Math.hypot(char.gridPos.x - targetNode.x, char.gridPos.y - targetNode.y) <= 1.5) {
          startGatherChannel(char, targetNode);
        }
      });

      // Arrival polling check event (reproducing MainScene.ts checkArrival)
      const checkArrival = queueScene.time.addEvent({
        delay: 150,
        loop: true,
        callback: () => {
          if (Math.hypot(char.gridPos.x - targetNode.x, char.gridPos.y - targetNode.y) <= 1.5) {
            checkArrival.remove();
            gatheringArrivalTimers.delete(char);
            startGatherChannel(char, targetNode);
          } else if (!char.isMoving() && char.state !== 'moving') {
            checkArrival.remove();
            gatheringArrivalTimers.delete(char);
          }
        }
      });
      gatheringArrivalTimers.set(char, checkArrival);
    };

    const processQueue = () => {
      if (gatheringQueue.length === 0) return;
      const nextNode = gatheringQueue.find(n => !n.isHarvested && !Array.from(workerAssignments.values()).includes(n));
      if (!nextNode) return;
      gatheringQueue = gatheringQueue.filter(n => n !== nextNode);
      dispatchWorker(worker, nextNode);
    };

    // Step simulation clock helper
    const stepSimulation = (deltaMs: number) => {
      queueScene.time.now += deltaMs;
      worker.update(queueScene.time.now, deltaMs);

      // Process channel progress
      const channel = activeGatherChannels.get(worker);
      if (channel) {
        channel.elapsedMs += deltaMs;
        if (channel.elapsedMs >= channel.durationMs) {
          completeGatherChannel(worker);
        }
      }

      // Process scheduled timer events
      for (const ev of [...timerEvents]) {
        if (ev.removed) continue;
        ev.elapsed += deltaMs;
        while (ev.elapsed >= ev.delay && !ev.removed) {
          ev.callback();
          if (ev.loop && !ev.removed) {
            ev.elapsed -= ev.delay;
          } else {
            ev.removed = true;
            break;
          }
        }
      }
    };

    // 1. Start queue with Node 1 & Node 2
    processQueue();
    assert.strictEqual(workerAssignments.get(worker), node1, 'Worker assigned to node 1');
    assert.strictEqual(worker.state, 'moving');

    // 2. Walk to Node 1 at full unencumbered speed (100 px/sec)
    // Distance from (0,0) to (2,0) is 64px = 640ms
    let elapsed = 0;
    while (worker.state === 'moving' && elapsed < 2000) {
      stepSimulation(50);
      elapsed += 50;
    }
    assert.strictEqual(worker.state, 'channeling', 'Worker arrived at Node 1 and started channeling');

    // 3. Channel Node 1 (1000ms)
    elapsed = 0;
    while (activeGatherChannels.has(worker) && elapsed < 2000) {
      stepSimulation(50);
      elapsed += 50;
    }
    assert.strictEqual(node1.isHarvested, true, 'Node 1 harvested successfully');

    // 4. VERIFY MID-QUEUE ENCUMBERANCE TRANSITION:
    // Worker held 15.0kg + received 35.0kg stone = 50.0kg > 45.0kg capacity!
    assert.strictEqual(worker.getTotalWeight(), 50.0, 'Worker weight is now 50.0kg');
    assert.strictEqual(worker.isEncumbered, true, 'Worker transitioned to ENCUMBERED mid-queue');
    assert.strictEqual(worker.encumbranceMultiplier, 0.20, 'Encumbrance penalty is flat -80%');
    assert.strictEqual(worker.moveSpeed, 20, 'Worker speed reduced to 20 px/sec (100 * 0.20)');

    // 5. Worker should now be dispatched to Node 2 at (11, 0)
    assert.strictEqual(workerAssignments.get(worker), node2, 'Worker auto-dispatched to Node 2 mid-queue');
    assert.strictEqual(worker.state, 'moving', 'Worker is moving toward Node 2 under encumbrance');

    // 6. Travel from (2, 0) to (10, 0) is 8 tiles (256 pixels).
    // At reduced speed (20 px/s), travel time is 256 / 20 = 12.8 seconds (12,800ms)!
    // A fixed-duration arrival timer (e.g. 2s or 3s) would have prematurely timed out and stalled here.
    let walkingTimeMs = 0;
    let checkedAt3000ms = false;
    let checkedAt8000ms = false;

    while (worker.state === 'moving' && walkingTimeMs < 20000) {
      stepSimulation(50);
      walkingTimeMs += 50;

      // Checkpoint at 3000ms: worker must STILL be moving, not stalled or timed out
      if (walkingTimeMs >= 3000 && !checkedAt3000ms) {
        assert.strictEqual(worker.state, 'moving', 'Worker still moving at 3000ms (no fixed-duration timeout stall)');
        assert.strictEqual(worker.moveSpeed, 20, 'Worker maintains 20% speed throughout travel');
        checkedAt3000ms = true;
      }
      // Checkpoint at 8000ms: worker continues walking without stall
      if (walkingTimeMs >= 8000 && !checkedAt8000ms) {
        assert.strictEqual(worker.state, 'moving', 'Worker continues moving at 8000ms without stalling');
        checkedAt8000ms = true;
      }
    }

    assert.ok(checkedAt3000ms && checkedAt8000ms, 'Both mid-walk travel checkpoints evaluated');
    assert.strictEqual(worker.state, 'channeling', 'Worker safely arrived at Node 2 at reduced speed and began channeling');
    assert.strictEqual(worker.gridPos.x, 10, 'Worker reached adjacent tile (10, 0) for Node 2');

    // 7. Channel Node 2 (1000ms)
    elapsed = 0;
    while (activeGatherChannels.has(worker) && elapsed < 2000) {
      stepSimulation(50);
      elapsed += 50;
    }

    // 8. Queue completion verification
    assert.strictEqual(node2.isHarvested, true, 'Node 2 harvested successfully');
    assert.strictEqual(gatheringQueue.length, 0, 'Gathering queue exhausted');
    assert.strictEqual(workerAssignments.size, 0, 'No active node assignments remaining');
    assert.strictEqual(worker.state, 'idle', 'Worker holds position in idle state upon queue completion');

    // Personal bag contents verified
    assert.strictEqual(worker.getItemCount('wood'), 50, 'Retains initial 50 wood');
    assert.strictEqual(worker.getItemCount('stone'), 70, 'Received 70 stone from node 1');
    assert.strictEqual(worker.getItemCount('iron_ore'), 20, 'Received 20 iron ore from node 2');
    assert.strictEqual(worker.getTotalWeight(), 60.0, 'Worker final total weight is 60.0kg');

    console.log('✓ Encumbered worker successfully completed multi-node queue at 20% speed without stalling or timing out.');
  }

  // -------------------------------------------------------------
  // Test 7: Iron Back Hidden Skill Progression & Mitigation Tiers
  // -------------------------------------------------------------
  console.log('\nTest 7: Iron Back hidden skill progression, capacity bonus, and penalty mitigation');
  {
    const progression = new ProgressionSystem();
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, progression);
    hero.entityName = 'Hero';

    // Verify iron_back is registered in hidden skills
    const ironBackDef = HiddenSkillSystem.getInstance().getSkillDef('iron_back');
    assert.ok(ironBackDef, 'iron_back must be defined in hiddenSkills.json and registered');
    assert.strictEqual(ironBackDef.triggerType, 'onEncumberedMove');

    // Overload hero to 100kg (200 stone)
    hero.addItem('stone', 200);
    assert.strictEqual(hero.isEncumbered, true);
    assert.strictEqual(hero.encumbranceMultiplier, 0.20, 'Tier 0 encumbranceMultiplier is 0.20 (-80%)');
    assert.strictEqual(hero.moveSpeed, 20);

    // Tier 1 (Lv1 - Lv29): +10kg capacity, multiplier remains 0.20
    hero.progression.getProficiencyStat('iron_back').level = 1;
    hero.updateEncumbrance();
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 55.0, 'Tier 1 grants +10kg carry capacity');
    assert.strictEqual(hero.encumbranceMultiplier, 0.20, 'Tier 1 encumbranceMultiplier remains 0.20');

    // Tier 2 (Lv30 - Lv59): +20kg capacity, multiplier softens to 0.40 (-60% penalty)
    hero.progression.getProficiencyStat('iron_back').level = 30;
    hero.updateEncumbrance();
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 65.0, 'Tier 2 grants +20kg carry capacity');
    assert.strictEqual(hero.encumbranceMultiplier, 0.40, 'Tier 2 encumbranceMultiplier softens to 0.40');
    assert.strictEqual(hero.moveSpeed, 40, 'Hero moveSpeed becomes 40 (100 * 0.40)');

    // Tier 3 (Lv60 - Lv89): +35kg capacity, multiplier softens to 0.60 (-40% penalty)
    hero.progression.getProficiencyStat('iron_back').level = 60;
    hero.updateEncumbrance();
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 80.0, 'Tier 3 grants +35kg carry capacity');
    assert.strictEqual(hero.encumbranceMultiplier, 0.60, 'Tier 3 encumbranceMultiplier softens to 0.60');
    assert.strictEqual(hero.moveSpeed, 60, 'Hero moveSpeed becomes 60 (100 * 0.60)');

    // Tier 4 (Lv90+): +50kg capacity, multiplier softens to 0.80 (-20% penalty)
    hero.progression.getProficiencyStat('iron_back').level = 90;
    hero.updateEncumbrance();
    assert.strictEqual(hero.getEffectiveCarryCapacity(), 95.0, 'Tier 4 grants +50kg carry capacity');
    assert.strictEqual(hero.encumbranceMultiplier, 0.80, 'Tier 4 encumbranceMultiplier softens to 0.80');
    assert.strictEqual(hero.moveSpeed, 80, 'Hero moveSpeed becomes 80 (100 * 0.80)');

    console.log('✓ Iron Back hidden skill tiers provide scaling carry capacity and movement penalty mitigation.');
  }

  // -------------------------------------------------------------
  // Test 8: Snapshot Serialization & Multi-Floor Persistence
  // -------------------------------------------------------------
  console.log('\nTest 8: Snapshot serialization and persistence of personal inventory');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';

    hero.addItem('wood', 25);
    hero.addItem('stone', 10);
    hero.addItem('iron_ore', 5);

    const snapshot = hero.getSnapshot(1000);
    assert.ok(snapshot.inventory, 'Snapshot must include inventory object');
    assert.strictEqual(snapshot.inventory['wood'], 25);
    assert.strictEqual(snapshot.inventory['stone'], 10);
    assert.strictEqual(snapshot.inventory['iron_ore'], 5);

    // Restore into fresh player
    const freshPlayer = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    freshPlayer.restoreFromSnapshot(snapshot, 1000);

    assert.strictEqual(freshPlayer.getItemCount('wood'), 25);
    assert.strictEqual(freshPlayer.getItemCount('stone'), 10);
    assert.strictEqual(freshPlayer.getItemCount('iron_ore'), 5);
    assert.strictEqual(freshPlayer.getInventoryWeight(), hero.getInventoryWeight());
    assert.strictEqual(freshPlayer.getTotalWeight(), hero.getTotalWeight());

    console.log('✓ Personal inventory and weight state serialize and restore faithfully across snapshots.');
  }

  // -------------------------------------------------------------
  // Test 9: Party Overview HUD Roster & Portrait Encumbrance Indicators
  // -------------------------------------------------------------
  console.log('\nTest 9: Party Overview HUD roster and portrait encumbrance indicators');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, new ProgressionSystem());
    hero.entityName = 'Hero';
    const companion = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Companion' } as any, new ProgressionSystem());
    companion.entityName = 'Companion';

    // Companion is encumbered (100 stone = 50kg)
    companion.addItem('stone', 100);
    assert.strictEqual(companion.isEncumbered, true);

    const party = [hero, companion];
    hud.updatePartyPortraits(party);

    // Check party portrait status on companion card [1]
    const compStatusEl = getOrCreateElement('party-portrait-status-1');
    assert.ok(compStatusEl.innerText.includes('ENC'), 'Portrait status shows ENC when member is encumbered');

    // Check party portrait status on unencumbered hero [0]
    const heroStatusEl = getOrCreateElement('party-portrait-status-0');
    assert.strictEqual(heroStatusEl.innerText.includes('ENC'), false, 'Unencumbered hero portrait does not show ENC');

    // Render Party Overview Modal
    hud.renderPartyOverviewModal(true);
    const rosterEl = getOrCreateElement('party-overview-roster');
    assert.ok(rosterEl.innerHTML.includes('⚖️ Weight:'), 'Roster card must display Weight bar');
    assert.ok(rosterEl.innerHTML.includes('🎒 Personal Bag'), 'Roster card must display Personal Bag section');
    assert.ok(rosterEl.innerHTML.includes('party-item-discard-btn'), 'Roster card must include item Drop buttons');
    assert.ok(rosterEl.innerHTML.includes('party-item-transfer-select'), 'Roster card must include item Transfer dropdown');
    assert.ok(rosterEl.innerHTML.includes('ENCUMBERED'), 'Companion roster card must flag ENCUMBERED status');

    console.log('✓ Party overview roster and HUD portraits dynamically reflect weight and encumbrance.');
  }

  console.log('\n=========================================');
  console.log('All Milestone 51 tests passed successfully!');
  console.log('=========================================');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
