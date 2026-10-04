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
    const rawAttrs = match[2] || match[5] || '';
    const inner = match[3] || '';

    const el = new MockElement(tagName);
    const idMatch = rawAttrs.match(/id=["']([^"']+)["']/i);
    if (idMatch) el.id = idMatch[1];
    const classMatch = rawAttrs.match(/class=["']([^"']+)["']/i);
    if (classMatch) {
      classMatch[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    }

    const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(rawAttrs)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      el.dataset[key] = dataMatch[2];
      el.setAttribute(`data-${dataMatch[1]}`, dataMatch[2]);
    }

    const draggableMatch = rawAttrs.match(/draggable=["']([^"']+)["']/i);
    if (draggableMatch) el.setAttribute('draggable', draggableMatch[1]);
    if (/disabled/i.test(rawAttrs)) el.disabled = true;

    if (inner && !/<[a-z]/i.test(inner)) {
      el.textContent = inner.trim();
    } else if (inner) {
      parseHTMLToTree(inner, el);
    }
    parent.appendChild(el);
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
    navigator: { userAgent: 'node' },
    localStorage: {
      _data: {} as Record<string, string>,
      getItem(k: string) { return this._data[k] ?? null; },
      setItem(k: string, v: string) { this._data[k] = String(v); },
      removeItem(k: string) { delete this._data[k]; },
      clear() { this._data = {}; }
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
    getElementById: (id: string) => getOrCreateElement(id),
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      for (const [_, el] of mockDomElements) {
        if (matchesSelector(el, sel)) return el;
        const found = el.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      mockDomElements.forEach(el => {
        if (matchesSelector(el, sel)) results.push(el);
        results.push(...el.querySelectorAll(sel));
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

// Pre-create UI elements needed for HUD constructor
[
  'player-hp', 'player-crit-hp', 'player-energy', 'player-weapon',
  'hud-proficiency-row', 'hud-proficiency-label', 'player-proficiency',
  'hud-class-row', 'player-class', 'player-status', 'player-wood', 'build-overlay-wood',
  'day-clock-badge', 'player-hunger-text', 'player-mood-text', 'hud-ration-row',
  'player-ration-text', 'hud-eat-ration-btn', 'downed-banner',
  'party-portraits-hud', 'party-reselect-all-btn',
  'party-overview-modal', 'close-party-btn', 'party-spawn-companion-btn', 'party-overview-roster', 'open-party-btn',
  'party-overview-inventory', 'party-inventory-item-list',
  'stash-toggle-filter-btn', 'stash-toggle-filter-indicator', 'stash-toggle-filter-label',
  'blacksmithing-modal', 'blacksmithing-recipes-container', 'close-blacksmithing-btn',
  'armorsmithing-modal', 'armorsmithing-recipes-container', 'close-armorsmithing-btn',
  'bowyer-modal', 'bowyer-recipes-container', 'close-bowyer-btn',
  'alchemy-modal', 'alchemy-recipes-container', 'close-alchemy-btn',
  'cooking-modal', 'cooking-recipes-container', 'close-cooking-btn', 'cooking-dishes-container'
].forEach((id) => getOrCreateElement(id));

async function runTests() {
  console.log('================================================================');
  console.log('STARTING DUPLICATE GEAR & STASH TOGGLE VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const mockScene = createMockPhaserScene(true);
  const hud = new HUD(mockScene, true);
  hud.setLocation('Guild Outpost', true);

  const basePlayerData = {
    name: 'Hero Leader',
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
  // Test 1: Station x Mood Yield Table (Gear Strictly 1x vs Consumables Multiplier)
  // -------------------------------------------------------------
  console.log('--- Test 1: Station x Mood Yield Table ---');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();

    const moodScenarios = [
      { name: 'Depressed / Lowest (Mood 10 -> 0% Bonus)', moodVal: 10, expectedMultiplier: 1 },
      { name: 'Normal (Mood 50 -> 0% Bonus)', moodVal: 50, expectedMultiplier: 1 },
      { name: 'Euphoric (Mood 100 -> +100% Bonus)', moodVal: 100, expectedMultiplier: 2 }
    ];

    const testCases = [
      {
        station: 'Blacksmithing (Weapon)',
        openModal: () => {
          hero.progression.getProficiencyStat('blacksmithing').level = 2;
          hud.openBlacksmithingModal(hero, hero.progression);
        },
        containerId: 'blacksmithing-recipes-container',
        attr: 'data-forge-recipe',
        recipeId: 'katana',
        resultId: 'katana',
        isGear: true,
        baseYield: 1
      },
      {
        station: 'Blacksmithing (Shield)',
        openModal: () => hud.openBlacksmithingModal(hero, hero.progression),
        containerId: 'blacksmithing-recipes-container',
        attr: 'data-forge-recipe',
        recipeId: 'iron_shield',
        resultId: 'shields',
        isGear: true,
        baseYield: 1
      },
      {
        station: 'Armorsmithing (Armor)',
        openModal: () => hud.openArmorsmithingModal(hero, hero.progression),
        containerId: 'armorsmithing-recipes-container',
        attr: 'data-armor-recipe',
        recipeId: 'leather_armor',
        resultId: 'leather_armor',
        isGear: true,
        baseYield: 1
      },
      {
        station: 'Bowyer (Ranged)',
        openModal: () => hud.openBowyerModal(hero, hero.progression),
        containerId: 'bowyer-recipes-container',
        attr: 'data-bow-recipe',
        recipeId: 'hunting_bow',
        resultId: 'bows',
        isGear: true,
        baseYield: 1
      },
      {
        station: 'Alchemy (Consumable)',
        openModal: () => {
          gameState.discoverAlchemyRecipe('bone_meal');
          hud.openAlchemyModal(hero, hero.progression);
        },
        containerId: 'alchemy-recipes-container',
        attr: 'data-craft-recipe',
        recipeId: 'bone_meal',
        resultId: 'bone_meal',
        isGear: false,
        baseYield: 2
      },
      {
        station: 'Alchemy (Revive Potion)',
        openModal: () => {
          gameState.discoverAlchemyRecipe('revive_potion');
          hud.openAlchemyModal(hero, hero.progression);
        },
        containerId: 'alchemy-recipes-container',
        attr: 'data-craft-recipe',
        recipeId: 'revive_potion',
        resultId: 'revive_potion',
        isGear: false,
        baseYield: 1
      }
    ];

    for (const testCase of testCases) {
      console.log(`\nEvaluating Station: ${testCase.station} [Recipe: ${testCase.recipeId}]`);
      for (const scenario of moodScenarios) {
        gameState.resetToDefault();
        hero.clearInventory();
        gameState.inventory.clear();

        // Stockpile sufficient materials
        gameState.addItem('wood', 100);
        gameState.addItem('ore', 100);
        gameState.addItem('steel_scrap', 100);
        gameState.addItem('wolf_pelt', 100);
        gameState.addItem('spider_silk', 100);
        gameState.addItem('bowstring', 100);
        gameState.addItem('bone', 100);
        if (testCase.recipeId !== 'bone_meal') {
          gameState.addItem('bone_meal', 100);
        }
        gameState.addItem('wild_herbs', 100);
        gameState.addItem('monster_meat', 100);
        gameState.addItem('slime_gel', 100);

        // Set mood
        hero.mood = scenario.moodVal;
        hud.update(hero, hero.progression, 0, [hero]);

        const preCrafterBag = hero.getItemCount(testCase.resultId);
        const preStockpile = gameState.getItemCount(testCase.resultId);
        assert.strictEqual(preCrafterBag, 0, 'Crafter bag initially empty of product');
        assert.strictEqual(preStockpile, 0, 'Stockpile initially empty of product');

        // Open modal and click craft button
        testCase.openModal();
        const container = getOrCreateElement(testCase.containerId);
        const craftBtn = container.querySelector(`[${testCase.attr}="${testCase.recipeId}"]`) as MockElement;
        assert.ok(craftBtn, `Craft button for ${testCase.recipeId} must be rendered`);
        craftBtn.onclick();

        const postCrafterBag = hero.getItemCount(testCase.resultId);
        const postStockpile = gameState.getItemCount(testCase.resultId);
        const postTotal = postCrafterBag + postStockpile;

        // Gear must ALWAYS be strictly 1 copy, regardless of mood!
        // Consumables receive mood bonus multiplier (1x on normal/low, 2x on euphoric)
        const expectedYield = testCase.isGear ? 1 : (testCase.baseYield * scenario.expectedMultiplier);

        assert.strictEqual(postStockpile, 0, `${testCase.station} must deposit 0 copies to stockpile`);
        assert.strictEqual(postCrafterBag, expectedYield, `${testCase.station} under ${scenario.name} crafter bag must be ${expectedYield}`);
        assert.strictEqual(postTotal, expectedYield, `${testCase.station} total across all stores must be ${expectedYield}`);

        console.log(`  ${scenario.name}: Bag=${postCrafterBag}, Stockpile=${postStockpile}, Total=${postTotal} (Expected: ${expectedYield}) -> OK`);
      }
    }

    console.log('\n✓ Test 1 Passed: Gear strictly crafts 1x under all mood tiers; consumables receive mood multiplier.');
  }

  // -------------------------------------------------------------
  // Test 2: Single-Copy Equip Lockout
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Single-Copy Equip Lockout ---');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('bows')!, 32, 'companion-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    hero.clearInventory();
    valerie.clearInventory();
    gameState.inventory.clear();

    gameState.addItem('ore', 50);
    gameState.addItem('wood', 50);

    hero.progression.getProficiencyStat('blacksmithing').level = 2;
    hud.update(hero, hero.progression, 0, [hero, valerie]);

    // Craft 1 Katana via UI
    hud.openBlacksmithingModal(hero, hero.progression);
    const bsContainer = getOrCreateElement('blacksmithing-recipes-container');
    const katanaBtn = bsContainer.querySelector('[data-forge-recipe="katana"]') as MockElement;
    assert.ok(katanaBtn, 'Katana forge button found');
    katanaBtn.onclick();

    assert.strictEqual(hero.getItemCount('katana'), 1, 'Crafter has 1 Katana in bag');
    assert.strictEqual(valerie.getItemCount('katana'), 0, 'Companion has 0 Katana');
    assert.strictEqual(gameState.getItemCount('katana'), 0, 'Stockpile has 0 Katana');

    // Crafter equips the single Katana
    const equipHeroRes = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipHeroRes, true, 'Crafter successfully equips Katana');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Crafter equipped weapon is Katana');
    assert.strictEqual(hero.getItemCount('katana'), 0, 'Crafter bag now has 0 unequipped Katana');

    // Companion attempts to equip Katana -> Under Guild-wide ownership rule, it moves from Hero to Valerie!
    const equipValerieRes = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, valerie);
    assert.strictEqual(equipValerieRes, true, 'Companion equip of Katana succeeds by moving it from Hero');
    assert.strictEqual(valerie.equippedWeapon.id, 'katana', 'Companion equipped weapon is now Katana');
    assert.strictEqual(hero.equippedWeapon.id, 'fist', 'Hero main hand slot reverted to default (fist)');
    assert.notStrictEqual(hero.equippedWeapon.id, 'katana', 'Katana must NOT be equipped on both characters at once');

    // Conservation: total count across all bags, stockpile and equipped slots strictly remains 1
    const heroEquippedCount = hero.equippedWeapon.id === 'katana' ? 1 : 0;
    const valerieEquippedCount = valerie.equippedWeapon.id === 'katana' ? 1 : 0;
    const totalKatanaCount = hero.getItemCount('katana') + valerie.getItemCount('katana') + gameState.getItemCount('katana') + heroEquippedCount + valerieEquippedCount;
    assert.strictEqual(totalKatanaCount, 1, 'Total Katana count across guild bags, stockpile, and equipped slots stays strictly 1');

    console.log('✓ Test 2 Passed: Single crafted copy equip moves from member to member without duplication.');
  }

  // -------------------------------------------------------------
  // Test 3: Equipment Stash Owned-Only Toggle & Empty Notice
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Equipment Stash Owned-Only Toggle & Empty Notice ---');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    hero.clearInventory();
    gameState.inventory.clear();

    hud.update(hero, hero.progression, 0, [hero]);
    hud.openPartyOverviewModal();

    // Verify toggle defaults to ON (Owned Only = true)
    assert.strictEqual(hud.isStashFilterActive(), true, 'Stash toggle defaults to ON (true)');

    hud.renderPartyInventoryPanel();
    const stashList = getOrCreateElement('party-inventory-item-list');
    
    // When Owned-Only is ON and hero owns no extra gear, empty notice is displayed
    const emptyNotice = stashList.querySelector('.party-inventory-empty');
    assert.ok(emptyNotice, 'Empty state notice element exists');
    assert.strictEqual(emptyNotice.textContent, 'No gear owned yet — craft some at the Outpost stations.');

    // Unowned Katana is not rendered
    assert.strictEqual(stashList.querySelector('[data-item-id="katana"]'), null, 'Unowned Katana absent in Owned-Only mode');

    // Toggle OFF -> Full catalog mode
    hud.toggleStashFilter();
    assert.strictEqual(hud.isStashFilterActive(), false, 'Stash toggle is now OFF (false)');
    
    // In Catalog mode, Katana card is rendered with "Craft Required" and draggable="false"
    const catalogKatana = stashList.querySelector('[data-item-id="katana"]') as MockElement;
    assert.ok(catalogKatana, 'Katana card rendered in Full Catalog mode');
    assert.ok(stashList.innerHTML.includes('Craft Required'), 'Unowned item displays Craft Required badge');

    // Craft Katana and toggle ON again
    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);
    hero.progression.getProficiencyStat('blacksmithing').level = 2;
    hud.openBlacksmithingModal(hero, hero.progression);
    const bsContainer = getOrCreateElement('blacksmithing-recipes-container');
    const katanaBtn = bsContainer.querySelector('[data-forge-recipe="katana"]') as MockElement;
    katanaBtn.onclick();
    assert.strictEqual(hero.getItemCount('katana'), 1);

    hud.toggleStashFilter();
    assert.strictEqual(hud.isStashFilterActive(), true, 'Stash toggle is back ON (true)');
    
    const ownedKatana = stashList.querySelector('[data-item-id="katana"]') as MockElement;
    assert.ok(ownedKatana, 'Owned Katana card rendered in Owned-Only mode');
    assert.strictEqual(ownedKatana.getAttribute('draggable'), 'true', 'Owned Katana is draggable');
    assert.strictEqual(stashList.innerHTML.includes('Craft Required'), false, 'Owned-Only view does not show any Craft Required badge');

    // Unowned items (like iron_sword or iron_shield) must NOT be present
    assert.strictEqual(stashList.querySelector('[data-item-id="iron_sword"]'), null, 'Unowned iron_sword absent in Owned-Only mode');

    (hud as any).partyInventoryFilter = 'weapons';
    hud.renderPartyInventoryPanel();
    assert.ok(stashList.querySelector('[data-item-id="katana"]'), 'Katana appears under Weapons tab');

    (hud as any).partyInventoryFilter = 'armor';
    hud.renderPartyInventoryPanel();
    assert.strictEqual(stashList.querySelector('[data-item-id="katana"]'), null, 'Katana does not appear under Armor tab');

    (hud as any).partyInventoryFilter = 'all';
    hud.renderPartyInventoryPanel();
    assert.ok(stashList.querySelector('[data-item-id="katana"]'), 'Katana appears under All tab');

    console.log('✓ Test 3 Passed: Stash Owned-Only toggle filters, empty notice, and categories verified.');
  }

  // -------------------------------------------------------------
  // Test 4: Non-Destructive Save Audit Helper
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Non-Destructive Save Audit Helper ---');
  {
    const originalSave = {
      version: 1,
      savedAt: Date.now(),
      metadata: { leaderName: 'Hero', gameDay: 1, partySize: 2 },
      snapshot: {
        inventory: {
          katana: 1,
          leather_armor: 1,
          bone_meal: 15,
          wood: 50
        },
        party: [
          {
            id: 'player',
            name: 'Guild Hero',
            inventory: {
              katana: 2,
              short_swords: 1
            }
          },
          {
            id: 'companion_1',
            name: 'Valerie',
            inventory: {
              katana: 1,
              leather_armor: 1
            }
          }
        ]
      }
    };

    window.localStorage.setItem(GameState.SAVE_STORAGE_KEY, JSON.stringify(originalSave));

    const auditResult = GameState.auditSavedDuplicateGear();

    // Verify audit results
    assert.strictEqual(auditResult.hasSave, true, 'Audit finds save');
    
    const katanaAudit = auditResult.duplicateGear.find(g => g.itemId === 'katana');
    assert.ok(katanaAudit, 'Katana flagged as duplicate gear');
    assert.strictEqual(katanaAudit.totalCount, 4, '4 total Katana detected across all locations');
    assert.strictEqual(katanaAudit.locations['Stockpile'], 1, '1 Katana in stockpile');
    assert.strictEqual(katanaAudit.locations['Guild Hero (Bag)'], 2, '2 Katana in Hero bag');
    assert.strictEqual(katanaAudit.locations['Valerie (Bag)'], 1, '1 Katana in Valerie bag');

    const armorAudit = auditResult.duplicateGear.find(g => g.itemId === 'leather_armor');
    assert.ok(armorAudit, 'Leather armor flagged');
    assert.strictEqual(armorAudit.totalCount, 2, '2 total leather armors detected');

    const boneMealAudit = auditResult.stockpileConsumables.find(c => c.itemId === 'bone_meal');
    assert.ok(boneMealAudit, 'Bone meal flagged in stockpiled consumables');
    assert.strictEqual(boneMealAudit.count, 15, '15 bone meal in stockpile detected');

    // CRITICAL: verify non-destructive nature - save in localStorage must NOT be modified
    const saveAfterAudit = JSON.parse(window.localStorage.getItem(GameState.SAVE_STORAGE_KEY)!);
    assert.deepStrictEqual(saveAfterAudit, originalSave, 'Save data in localStorage was not mutated or stripped');

    console.log('✓ Test 4 Passed: Non-destructive save audit helper detects duplicates without mutating save.');
  }

  console.log('\n================================================================');
  console.log('ALL DUPLICATE GEAR & STASH TOGGLE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
