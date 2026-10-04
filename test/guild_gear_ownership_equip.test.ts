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
    if (this._innerHTML) return this._innerHTML;
    if (this.children.length > 0) {
      return this.children.map(c => c.innerHTML || c.textContent || '').join(' ');
    }
    return '';
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
    (el as any)._innerHTML = inner;
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
  if (fs.existsSync(cleanPath)) {
    const content = fs.readFileSync(cleanPath, 'utf8');
    return {
      json: async () => JSON.parse(content)
    };
  }
  return {
    json: async () => ({})
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

async function runSuite() {
  console.log('================================================================');
  console.log('STARTING GUILD GEAR OWNERSHIP & PARTY EQUIP VERIFICATION SUITE');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');
  const { getBaseItemId } = await import('../src/utils/gearResolver.ts');

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
    startingWeaponId: 'fist',
    baseCarryCapacity: 45.0
  };

  const classesData = dataLoader.getClassesData();

  const getGuildGearCount = (itemId: string, party: any[], gameState: any): number => {
    const baseId = getBaseItemId(itemId);
    let count = 0;
    for (const m of party) {
      count += m.getItemCount(baseId);
      if (m.equippedWeapon && getBaseItemId(m.equippedWeapon.id) === baseId && m.equippedWeapon.id !== 'fist') count++;
      if (m.offhandWeapon && getBaseItemId(m.offhandWeapon.id) === baseId) count++;
      if (m.equippedHelmet && getBaseItemId(m.equippedHelmet.id) === baseId) count++;
      if (m.equippedBodyArmor && getBaseItemId(m.equippedBodyArmor.id) === baseId) count++;
      if (m.equippedNecklace && getBaseItemId(m.equippedNecklace.id) === baseId) count++;
      if (m.equippedRing && getBaseItemId(m.equippedRing.id) === baseId) count++;
      if (m.equippedAccessory && getBaseItemId(m.equippedAccessory.id) === baseId) count++;
    }
    count += gameState.getItemCount(baseId);
    return count;
  };

  // -------------------------------------------------------------
  // Test 1: Valerie Crafts Katana (Case a: Plain ID, Case b: Apprentice Instance ID)
  // -------------------------------------------------------------
  console.log('--- Test 1: Valerie Crafts Katana & Guild Hero Equips (Cases a & b) ---');
  {
    // CASE (a): Plain Katana
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const heroProg = new ProgressionSystem(classesData, 'Kaelen');
    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero-avatar', heroProg);
    hero.entityName = 'Kaelen';
    hero.clearInventory();

    const valerieProg = new ProgressionSystem(classesData, 'Valerie');
    valerieProg.getProficiencyStat('blacksmithing').level = 2;
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('bows')!, 32, 'valerie-avatar', valerieProg);
    valerie.entityName = 'Valerie';
    valerie.clearInventory();

    hud.update(hero, heroProg, 0, [hero, valerie]);
    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);

    // Valerie crafts plain Katana via UI
    hud.openBlacksmithingModal(valerie, valerieProg);
    const bsContainer = getOrCreateElement('blacksmithing-recipes-container');
    const katanaBtn = bsContainer.querySelector('[data-forge-recipe="katana"]') as MockElement;
    assert.ok(katanaBtn, 'Katana button exists');
    katanaBtn.onclick();

    assert.strictEqual(valerie.getItemCount('katana'), 1, 'Valerie bag has 1 Katana');
    assert.strictEqual(hero.getItemCount('katana'), 0, 'Hero bag has 0 Katana');
    assert.strictEqual(gameState.getItemCount('katana'), 0, 'Stockpile has 0 Katana');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1, 'Guild owns exactly 1 Katana');

    // Guild Hero equips Katana via paperdoll drop
    const equipResA = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipResA, true, 'Hero successfully equips Katana crafted by Valerie (Case a)');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero equipped weapon is Katana');
    assert.strictEqual(valerie.getItemCount('katana'), 0, 'Valerie bag is decremented by 1 (now 0)');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1, 'Total Katana count conserved at 1');

    // CASE (b): Apprentice Smith GearItemInstance Katana
    gameState.resetToDefault();
    gameState.inventory.clear();
    hero.clearInventory();
    valerie.clearInventory();
    hero.equippedWeapon = dataLoader.getWeapon('fist')!;
    valerie.equippedWeapon = dataLoader.getWeapon('bows')!;

    valerieProg.getProficiencyStat('blacksmithing').level = 10;
    valerieProg.setClassLevel('apprentice_smith', 5); // +5% stats
    hud.update(hero, heroProg, 0, [hero, valerie]);

    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);

    hud.openBlacksmithingModal(valerie, valerieProg);
    const katanaBtnB = bsContainer.querySelector('[data-forge-recipe="katana"]') as MockElement;
    katanaBtnB.onclick();

    let craftedInstId = '';
    for (const [key] of valerie.inventory.entries()) {
      if (key.startsWith('gear_katana_')) craftedInstId = key;
    }
    assert.ok(craftedInstId, 'Valerie received a GearItemInstance Katana');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1);

    // Hero equips Katana (using base ID payload 'katana' as sent by Stash)
    const equipResB = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipResB, true, 'Hero successfully equips Apprentice Katana instance (Case b)');
    assert.strictEqual(hero.equippedWeapon.id, craftedInstId, 'Hero equipped weapon has exact GearItemInstance ID');
    assert.strictEqual(hero.equippedWeapon.crafterName, 'Valerie', 'Hero equipped weapon retains crafterName');
    assert.strictEqual(hero.equippedWeapon.bonusPercent, 5, 'Hero equipped weapon retains +5% bonusPercent');
    assert.strictEqual(valerie.getItemCount('katana'), 0, 'Valerie bag has 0 Katana');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1, 'Total Katana count strictly conserved at 1');

    console.log('✓ Test 1 Passed: Both plain and Apprentice bonus Katana crafted by Valerie equip onto Hero with bonus preserved.');
  }

  // -------------------------------------------------------------
  // Test 2: Stockpile Equipping (Outpost Allowed vs Dungeon Refused)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Stockpile Equipping at Outpost vs Dungeon ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.clearInventory();

    // Place Katana in stockpile
    gameState.addItem('katana', 1);
    assert.strictEqual(gameState.getItemCount('katana'), 1, 'Stockpile has 1 Katana');

    // At Outpost: equipping succeeds
    hud.isOutpost = true;
    hud.update(hero, hero.progression, 0, [hero]);
    const equipOutpostRes = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipOutpostRes, true, 'Equipping from stockpile at Outpost succeeds');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero has Katana equipped');
    assert.strictEqual(gameState.getItemCount('katana'), 0, 'Katana removed from stockpile');

    // Unequip back to stockpile for dungeon test
    hero.equippedWeapon = dataLoader.getWeapon('fist')!;
    gameState.addItem('katana', 1);

    // In Dungeon: equipping from stockpile is refused
    hud.isOutpost = false;
    const equipDungeonRes = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipDungeonRes, false, 'Equipping from stockpile in dungeon is strictly refused');
    assert.strictEqual(gameState.getItemCount('katana'), 1, 'Stockpile Katana unconsumed');
    assert.strictEqual(hero.equippedWeapon.id, 'fist', 'Hero remains with fist in dungeon');

    hud.isOutpost = true;
    console.log('✓ Test 2 Passed: Outpost stockpile equip succeeds; dungeon stockpile equip is refused.');
  }

  // -------------------------------------------------------------
  // Test 3: Moving Equipped Gear Between Party Members (A -> B)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Moving Already-Equipped Gear from Member A to Member B ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.entityName = 'Kaelen';
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('katana')!, 32, 'valerie', new ProgressionSystem());
    valerie.entityName = 'Valerie';

    hud.update(hero, hero.progression, 0, [hero, valerie]);
    assert.strictEqual(valerie.equippedWeapon.id, 'katana', 'Valerie starts with Katana equipped');
    assert.strictEqual(hero.equippedWeapon.id, 'fist', 'Hero starts with Fist');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1, 'Guild owns exactly 1 Katana');

    // Hero equips Katana
    const moveRes = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(moveRes, true, 'Moving equipped Katana to Hero succeeds');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero now has Katana equipped');
    assert.strictEqual(valerie.equippedWeapon.id, 'fist', 'Valerie main slot reverted to default (fist)');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 1, 'Total Katana count remains strictly 1');

    console.log('✓ Test 3 Passed: Moving equipped gear unequipped from donor and equipped on target with count conserved.');
  }

  // -------------------------------------------------------------
  // Test 4: Two Copies vs One Copy
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Two Copies vs One Copy Behavior ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.entityName = 'Kaelen';
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('fist')!, 32, 'valerie', new ProgressionSystem());
    valerie.entityName = 'Valerie';
    hud.update(hero, hero.progression, 0, [hero, valerie]);

    // Give 2 Katanas in stockpile
    gameState.addItem('katana', 2);
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 2, 'Guild owns 2 Katanas');

    // Hero equips one
    const heroEquip = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(heroEquip, true);
    assert.strictEqual(hero.equippedWeapon.id, 'katana');
    assert.strictEqual(gameState.getItemCount('katana'), 1);

    // Valerie equips second
    const valerieEquip = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, valerie);
    assert.strictEqual(valerieEquip, true);
    assert.strictEqual(valerie.equippedWeapon.id, 'katana');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero STILL has Katana equipped');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 2, 'Total Katanas = 2 (both equipped)');

    console.log('✓ Test 4 Passed: Two copies allow both characters to equip concurrently.');
  }

  // -------------------------------------------------------------
  // Test 5: Free Copy Taken Before Stripping Worn Gear (Clarification 2)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Free Copy in Stockpile Taken Before Stripping Teammate Gear ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.entityName = 'Kaelen';
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('katana')!, 32, 'valerie', new ProgressionSystem());
    valerie.entityName = 'Valerie';
    hud.update(hero, hero.progression, 0, [hero, valerie]);

    // 1 Katana worn by Valerie, 1 free Katana in stockpile
    gameState.addItem('katana', 1);
    assert.strictEqual(valerie.equippedWeapon.id, 'katana');
    assert.strictEqual(gameState.getItemCount('katana'), 1);
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 2);

    // Hero equips Katana (base ID)
    const heroEquip = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(heroEquip, true);
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero equipped Katana from stockpile');
    assert.strictEqual(gameState.getItemCount('katana'), 0, 'Stockpile Katana consumed');
    assert.strictEqual(valerie.equippedWeapon.id, 'katana', 'Valerie KEEPS her equipped Katana (not stripped)');
    assert.strictEqual(getGuildGearCount('katana', [hero, valerie], gameState), 2, 'Total Katanas = 2');

    console.log('✓ Test 5 Passed: Free copy taken before stripping teammate gear confirmed.');
  }

  // -------------------------------------------------------------
  // Test 6: Exact Instance ID Selection (Never Substitute Another Copy)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Exact Instance ID Selection Without Substitution ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.entityName = 'Kaelen';
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('fist')!, 32, 'valerie', new ProgressionSystem());
    valerie.entityName = 'Valerie';
    hud.update(hero, hero.progression, 0, [hero, valerie]);

    const instA: any = {
      instanceId: 'gear_katana_instance_A',
      baseItemId: 'katana',
      crafterName: 'Valerie',
      bonusPercent: 12,
      craftedAt: 1000
    };
    const instB: any = {
      instanceId: 'gear_katana_instance_B',
      baseItemId: 'katana',
      crafterName: 'Valerie',
      bonusPercent: 4,
      craftedAt: 2000
    };
    gameState.registerGearInstance(instA);
    gameState.registerGearInstance(instB);

    // Valerie is wearing Instance A (+12%)
    valerie.equippedWeapon = dataLoader.getWeapon('gear_katana_instance_A')!;
    // Stockpile holds Instance B (+4%)
    gameState.addItem('gear_katana_instance_B', 1);

    // Hero explicitly requests to equip Instance A by exact instance ID
    const equipSpecificA = hud.handleSlotDrop('main', { itemId: 'gear_katana_instance_A', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equipSpecificA, true, 'Equip of exact instance A succeeds');
    assert.strictEqual(hero.equippedWeapon.id, 'gear_katana_instance_A', 'Hero received EXACTLY instance A');
    assert.strictEqual(hero.equippedWeapon.bonusPercent, 12, 'Hero received +12% instance A');
    assert.strictEqual(valerie.equippedWeapon.id, 'fist', 'Valerie unequipped instance A');
    assert.strictEqual(gameState.getItemCount('gear_katana_instance_B'), 1, 'Instance B remains unconsumed in stockpile');

    console.log('✓ Test 6 Passed: Exact instance ID payload takes that specific copy without substitution.');
  }

  // -------------------------------------------------------------
  // Test 7: Equipment Stash Split Display Badge (Clarification 3)
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Equipment Stash Split Display Badge (e.g. "x2 (1 worn by Valerie)") ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('fist')!, 32, 'hero', new ProgressionSystem());
    hero.entityName = 'Kaelen';
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('katana')!, 32, 'valerie', new ProgressionSystem());
    valerie.entityName = 'Valerie';

    // Valerie has 1 Katana worn, Stockpile has 1 Katana
    gameState.addItem('katana', 1);

    hud.update(hero, hero.progression, 0, [hero, valerie]);
    hud.setStashFilterActive(true); // Owned Only
    hud.renderPartyInventoryPanel();

    const stashList = getOrCreateElement('party-inventory-item-list');
    const katanaCard = stashList.querySelector('[data-item-id="katana"]') as MockElement;
    assert.ok(katanaCard, 'Katana rendered in Owned-Only Stash');
    assert.strictEqual(katanaCard.getAttribute('draggable'), 'true', 'Katana is draggable');
    assert.ok(stashList.innerHTML.includes('x2 (1 worn by Valerie)'), `Stash badge must display split count 'x2 (1 worn by Valerie)'`);

    console.log('✓ Test 7 Passed: Equipment Stash correctly renders split badge with worn breakdown.');
  }

  // -------------------------------------------------------------
  // Test 8: Rule Invariants (2H Clearing Offhand, Dual Wield Gating, Scout Dagger)
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Preserved Rule Invariants (2H, DW Gating, Scout Sidearm) ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    gameState.inventory.clear();

    const heroProg = new ProgressionSystem(classesData, 'Kaelen');
    const hero = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Kaelen' } as any, dataLoader.getWeapon('short_swords')!, 32, 'hero', heroProg);
    hero.entityName = 'Kaelen';

    hud.update(hero, heroProg, 0, [hero]);
    gameState.addItem('longswords', 1);
    gameState.addItem('shields', 1);
    gameState.addItem('daggers', 1);

    // 1. Equip 2H Longsword clears offhand
    hero.offhandWeapon = dataLoader.getWeapon('shields')!;
    const equip2H = hud.handleSlotDrop('main', { itemId: 'longswords', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equip2H, true);
    assert.strictEqual(hero.offhandWeapon, null, '2H weapon clears offhand');
    assert.strictEqual(hero.getItemCount('shields'), 1, 'Previous offhand shield placed in Hero bag');

    // Dropping shield into offhand while holding 2H is rejected
    const dropOffhand2H = hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
    assert.strictEqual(dropOffhand2H, false, 'Offhand equip rejected while wielding 2H weapon');

    // 2. Switch to 1H weapon -> Dual Wield gating
    hud.handleSlotDrop('main', { itemId: 'short_swords', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(hero.progression.isDualWieldUnlocked(), false);
    const dropMeleeOffhand = hud.handleSlotDrop('offhand', { itemId: 'daggers', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(dropMeleeOffhand, false, '1H melee weapon in offhand rejected without DW unlock');

    // Shield in offhand succeeds without DW
    const dropShield = hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
    assert.strictEqual(dropShield, true, 'Shield in offhand succeeds without DW');

    // 3. Scout Bow + Dagger sidearm rule
    const valerieProg = new ProgressionSystem(classesData, 'Valerie');
    const valerie = new Player(mockScene as any, 0, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('bows')!, 32, 'valerie', valerieProg);
    valerie.entityName = 'Valerie';
    valerie.activeClass = 'scout';
    hud.update(hero, heroProg, 0, [hero, valerie]);

    const valerieDaggerSidearm = hud.handleSlotDrop('offhand', { itemId: 'daggers', itemType: 'weapon', itemSlot: 'main' }, valerie);
    assert.strictEqual(valerieDaggerSidearm, true, 'Active Scout with Bow CAN equip dagger sidearm in offhand');
    assert.strictEqual(valerie.offhandWeapon?.id, 'daggers');

    console.log('✓ Test 8 Passed: 2H clearing offhand, DW gating, and Scout dagger sidearm rules intact.');
  }

  console.log('\n================================================================');
  console.log('ALL GUILD GEAR OWNERSHIP & EQUIP TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runSuite().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
