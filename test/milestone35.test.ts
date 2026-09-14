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

  get value(): string {
    return this._textContent;
  }
  set value(val: string) {
    this._textContent = String(val);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    this.innerHTMLSetCount++;
    this.children = [];
    parseHTMLToTree(html, this);
  }

  addEventListener(type: string, handler: any) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }

  removeEventListener(type: string, handler: any) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(h => h !== handler);
  }

  dispatchEvent(event: any) {
    if (this._listeners[event.type]) {
      this._listeners[event.type].forEach(h => h(event));
    }
    if (this[`on${event.type}`]) {
      this[`on${event.type}`](event);
    }
  }

  closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (matchesSelector(curr, selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const results: T[] = [];
    const traverse = (el: MockElement) => {
      if (matchesSelector(el, selector)) results.push(el as unknown as T);
      for (const ch of el.children) {
        traverse(ch);
      }
    };
    for (const ch of this.children) {
      traverse(ch);
    }
    return results;
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('[')) {
    const attrMatch = /\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/.exec(selector);
    if (attrMatch) {
      const attr = attrMatch[1];
      const val = attrMatch[2];
      const dataKey = attr.startsWith('data-') ? attr.slice(5) : attr;
      const camelKey = dataKey.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      const hasAttr = el.dataset[attr] !== undefined || el.dataset[dataKey] !== undefined || el.dataset[camelKey] !== undefined;
      if (!hasAttr) return false;
      if (val !== undefined) {
        return el.dataset[attr] === val || el.dataset[dataKey] === val || el.dataset[camelKey] === val;
      }
      return true;
    }
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
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

// Setup browser globals
const docElements: Record<string, MockElement> = {};
function getOrCreateElement(id: string, tagName: string = 'div'): MockElement {
  if (!docElements[id]) {
    const el = new MockElement(tagName);
    el.id = id;
    docElements[id] = el;
  }
  return docElements[id];
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
    getElementById: (id: string) => docElements[id] || null,
    querySelector: (sel: string) => {
      for (const k of Object.keys(docElements)) {
        const found = docElements[k].querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      for (const k of Object.keys(docElements)) {
        if (matchesSelector(docElements[k], sel)) results.push(docElements[k]);
        results.push(...docElements[k].querySelectorAll(sel));
      }
      return results;
    },
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: new MockElement('body')
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup node mock fetch
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { GameState } from '../src/systems/GameState.ts';
import { HUD } from '../src/ui/HUD.ts';
import type { WeaponDef, ArmorDef, PlayerData } from '../src/types/game.ts';

function createMockPhaserScene(isOutpost: boolean = true): any {
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

// Pre-create standard UI IDs so HUD constructor succeeds
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
  'armorsmithing-modal', 'close-armorsmithing-btn', 'armorsmithing-modal-prof', 'armorsmithing-stockpile-wolf-pelt', 'armorsmithing-stockpile-spider-silk', 'armorsmithing-recipes-container', 'armorsmithing-status-msg'
].forEach(id => getOrCreateElement(id));

async function runMilestone35Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 35: DRAG-AND-DROP EQUIPMENT SCREEN');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const mockScene = createMockPhaserScene(true);
  const hud = new HUD(mockScene, true);

  const basePlayerData: PlayerData = {
    name: 'Guild Hero',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords'
  };

  const startingWeapon = dataLoader.getWeapon('short_swords')!;
  const hero = new Player(mockScene, 0, 0, basePlayerData, startingWeapon, 'player_hero');
  hud.setLocation('Guild Outpost', true);
  hud.update(hero, hero.progression, 0, [hero]);

  // Open the Party Overview Modal
  hud.openPartyOverviewModal();

  const rosterEl = getOrCreateElement('party-overview-roster');
  const inventoryEl = getOrCreateElement('party-inventory-item-list');

  // ---------------------------------------------------------------------------
  // TEST 1: Paperdoll DOM Structure & Full Legacy Dropdown Removal
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Paperdoll DOM Structure & Legacy Dropdown Removal ---');
  assert.equal(hud.isPartyOverviewModalOpen(), true, 'Party overview modal should be open');

  const paperdoll = rosterEl.querySelector('.paperdoll-container');
  assert.ok(paperdoll, 'Paperdoll container must be rendered');

  const requiredSlots = ['main', 'offhand', 'helmet', 'body', 'necklace', 'ring', 'accessory'];
  for (const slotName of requiredSlots) {
    const slotEl = rosterEl.querySelector(`[data-slot="${slotName}"]`);
    assert.ok(slotEl, `Paperdoll must contain slot element for '${slotName}'`);
  }

  // Confirm legacy dropdowns are completely absent
  const legacySelectors = [
    '.party-main-select',
    '.party-offhand-select',
    '.party-helmet-select',
    '.party-body-select',
    '.party-necklace-select',
    '.party-ring-select',
    '.party-accessory-select'
  ];
  for (const sel of legacySelectors) {
    const found = rosterEl.querySelector(sel);
    assert.equal(found, null, `Legacy selector '${sel}' must be completely removed`);
  }
  console.log('✓ PASS: All 7 paperdoll slots rendered; all 7 legacy dropdowns completely removed.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Inventory Panel Draggable Items & Metadata
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Equipment Inventory Panel & Draggable Cards ---');
  const invCards = inventoryEl.querySelectorAll('.inventory-item-card');
  assert.ok(invCards.length > 0, 'Inventory panel must contain draggable equipment cards');

  const helmetCard = inventoryEl.querySelector('[data-item-id="leather_cap"]');
  assert.ok(helmetCard, 'Leather Cap card must exist in inventory');
  assert.equal(helmetCard.dataset.itemType, 'armor');
  assert.equal(helmetCard.dataset.itemSlot, 'helmet');

  const weaponCard = inventoryEl.querySelector('[data-item-id="katana"]');
  assert.ok(weaponCard, 'Katana card must exist in inventory');
  assert.equal(weaponCard.dataset.itemType, 'weapon');
  assert.equal(weaponCard.dataset.itemSlot, 'main');

  console.log(`✓ PASS: ${invCards.length} equipment items displayed with draggable attributes and slot metadata.\n`);

  // ---------------------------------------------------------------------------
  // TEST 3: Drag-and-Drop Equip across All 7 Slots
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Drag-and-Drop Equip (All 7 Slots) ---');
  const slotsToTest = [
    { slot: 'helmet', id: 'leather_cap', type: 'armor' as const, check: () => hero.equippedHelmet?.id === 'leather_cap' },
    { slot: 'body', id: 'leather_armor', type: 'armor' as const, check: () => hero.equippedBodyArmor?.id === 'leather_armor' },
    { slot: 'necklace', id: 'bone_necklace', type: 'armor' as const, check: () => hero.equippedNecklace?.id === 'bone_necklace' },
    { slot: 'ring', id: 'wolf_claw_ring', type: 'armor' as const, check: () => hero.equippedRing?.id === 'wolf_claw_ring' },
    { slot: 'accessory', id: 'venom_charm', type: 'armor' as const, check: () => hero.equippedAccessory?.id === 'venom_charm' },
    { slot: 'main', id: 'katana', type: 'weapon' as const, check: () => hero.equippedWeapon?.id === 'katana' },
    { slot: 'offhand', id: 'shields', type: 'weapon' as const, check: () => hero.offhandWeapon?.id === 'shields' }
  ];

  for (const item of slotsToTest) {
    const success = hud.handleSlotDrop(item.slot, { itemId: item.id, itemType: item.type, itemSlot: item.slot }, hero);
    assert.equal(success, true, `Dropping ${item.id} into ${item.slot} must succeed`);
    assert.equal(item.check(), true, `Hero must have ${item.id} equipped in ${item.slot}`);
  }
  console.log('✓ PASS: All 7 slots successfully equipped via drop handler with exact matching states.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Incompatible Drop Rejection with Zero Partial Mutation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Incompatible Drop Rejection (Zero Side Effects) ---');
  const snapshotBefore = {
    helmet: hero.equippedHelmet?.id,
    body: hero.equippedBodyArmor?.id,
    necklace: hero.equippedNecklace?.id,
    ring: hero.equippedRing?.id,
    accessory: hero.equippedAccessory?.id,
    main: hero.equippedWeapon?.id,
    offhand: hero.offhandWeapon?.id,
    hp: hero.hp,
    maxHp: hero.maxHp,
    critHp: hero.criticalHp,
    maxCritHp: hero.maxCriticalHp
  };

  // 1. Drop body armor onto helmet slot
  const dropBodyOnHelmet = hud.handleSlotDrop('helmet', { itemId: 'silk_robe', itemType: 'armor', itemSlot: 'body' }, hero);
  assert.equal(dropBodyOnHelmet, false, 'Dropping body armor on helmet slot must return false');

  // 2. Drop ring onto accessory slot
  const dropRingOnAcc = hud.handleSlotDrop('accessory', { itemId: 'wolf_claw_ring', itemType: 'armor', itemSlot: 'ring' }, hero);
  assert.equal(dropRingOnAcc, false, 'Dropping ring on accessory slot must return false');

  // 3. Drop weapon onto armor slot
  const dropWpnOnNecklace = hud.handleSlotDrop('necklace', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
  assert.equal(dropWpnOnNecklace, false, 'Dropping weapon on necklace slot must return false');

  // 4. Drop shield onto main hand
  const dropShieldOnMain = hud.handleSlotDrop('main', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
  assert.equal(dropShieldOnMain, false, 'Dropping shield on main hand must return false');

  // Assert ZERO state mutation occurred
  assert.equal(hero.equippedHelmet?.id, snapshotBefore.helmet, 'Helmet must remain unmutated');
  assert.equal(hero.equippedBodyArmor?.id, snapshotBefore.body, 'Body armor must remain unmutated');
  assert.equal(hero.equippedNecklace?.id, snapshotBefore.necklace, 'Necklace must remain unmutated');
  assert.equal(hero.equippedRing?.id, snapshotBefore.ring, 'Ring must remain unmutated');
  assert.equal(hero.equippedAccessory?.id, snapshotBefore.accessory, 'Accessory must remain unmutated');
  assert.equal(hero.equippedWeapon?.id, snapshotBefore.main, 'Main weapon must remain unmutated');
  assert.equal(hero.offhandWeapon?.id, snapshotBefore.offhand, 'Offhand must remain unmutated');
  assert.equal(hero.hp, snapshotBefore.hp, 'Main HP must remain unmutated');
  assert.equal(hero.criticalHp, snapshotBefore.critHp, 'Critical HP must remain unmutated');

  console.log('✓ PASS: All incompatible drops strictly rejected; character equipment and stats 100% unmutated.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Outpost-Only Armor Restriction
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Outpost-Only Armor Restriction ---');
  const dungeonScene = createMockPhaserScene(false); // isOutpost = false
  const dungeonHud = new HUD(dungeonScene, false);
  dungeonHud.update(hero, hero.progression, 0, [hero]);

  // Attempt to drop new helmet while outside outpost
  const equipOutsideOutpost = dungeonHud.handleSlotDrop('helmet', { itemId: 'silk_cowl', itemType: 'armor', itemSlot: 'helmet' }, hero);
  assert.equal(equipOutsideOutpost, false, 'Equipping armor outside Outpost must return false');
  assert.equal(hero.equippedHelmet?.id, 'leather_cap', 'Helmet must still be leather_cap');

  console.log('✓ PASS: Outpost restriction strictly enforced for armor drops.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: Off-Hand Rules (Shield, 2H Weapon, Dual Wielding)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Off-Hand Rules (Shield, 2H Block, DW Gating) ---');
  // 1. Equip 2-handed weapon in main hand
  const equip2H = hud.handleSlotDrop('main', { itemId: 'longswords', itemType: 'weapon', itemSlot: 'main' }, hero);
  assert.equal(equip2H, true, 'Equipping longsword in main hand succeeds');
  assert.equal(hero.offhandWeapon, null, 'Equipping 2H weapon must clear offhand');

  // Dropping into offhand while 2H equipped must fail
  const dropInto2HOffhand = hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
  assert.equal(dropInto2HOffhand, false, 'Dropping offhand while 2H weapon equipped must be rejected');

  // 2. Switch back to 1H weapon
  hud.handleSlotDrop('main', { itemId: 'short_swords', itemType: 'weapon', itemSlot: 'main' }, hero);

  // DW is not yet unlocked on fresh hero
  assert.equal(hero.progression.isDualWieldUnlocked(), false);
  const drop1HMeleeWithoutDW = hud.handleSlotDrop('offhand', { itemId: 'daggers', itemType: 'weapon', itemSlot: 'main' }, hero);
  assert.equal(drop1HMeleeWithoutDW, false, 'Equipping 1H melee weapon in offhand without DW must be rejected');

  // Shields should succeed even without DW
  const dropShield = hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
  assert.equal(dropShield, true, 'Shield in offhand must succeed without DW');
  assert.equal(hero.offhandWeapon?.id, 'shields');

  // Unlock Dual Wielding
  hero.progression.getProficiencyStat('short_swords').level = 30;
  hero.progression.getProficiencyStat('daggers').level = 30;
  assert.equal(hero.progression.isDualWieldUnlocked(), true);

  // Now 1H melee weapon in offhand succeeds!
  const drop1HMeleeWithDW = hud.handleSlotDrop('offhand', { itemId: 'daggers', itemType: 'weapon', itemSlot: 'main' }, hero);
  assert.equal(drop1HMeleeWithDW, true, 'Equipping 1H melee in offhand with DW unlocked must succeed');
  assert.equal(hero.offhandWeapon?.id, 'daggers');

  console.log('✓ PASS: Off-hand rules (2H lockout, shield bypass, DW unlock requirement) strictly enforced.\n');

  // ---------------------------------------------------------------------------
  // TEST 7: Two-Bar HP Split & Floor-of-1 Safety
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Two-Bar HP Split & Floor-of-1 Safety ---');
  const baseMainMax = hero.baseMaxHp;
  const baseCritMax = hero.baseMaxCriticalHp;

  // Equip Silk Cowl (+30 HP -> +15 Main, +15 Crit)
  hud.handleSlotDrop('helmet', { itemId: 'silk_cowl', itemType: 'armor', itemSlot: 'helmet' }, hero);
  assert.equal(hero.maxHp, baseMainMax + 13 + 10 + 7 + 13 + 15, 'Max HP matches full set');
  assert.equal(hero.maxCriticalHp, baseCritMax + 12 + 10 + 7 + 13 + 15, 'Max Crit HP matches full set');

  // Lower Crit HP to 5
  hero.criticalHp = 5;
  // Unequip silk cowl (-15 Crit HP) -> Floor of 1 must prevent death
  hero.equipArmorSlot('helmet', null, true);
  assert.equal(hero.criticalHp, 1, 'Critical HP must be strictly floored at 1, preventing death');

  console.log('✓ PASS: Two-bar HP split and Critical HP floor-of-1 safety rules verified.\n');

  // ---------------------------------------------------------------------------
  // TEST 8: Slot Unequip Interaction
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Slot Unequip Interaction ---');
  hud.renderPartyOverviewModal(true);

  // Re-equip offhand
  hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);
  assert.equal(hero.offhandWeapon?.id, 'shields');

  // Find offhand unequip button and click
  const offhandSlot = rosterEl.querySelector('[data-slot="offhand"]') as MockElement;
  assert.ok(offhandSlot, 'Offhand slot must exist');
  const offhandUnequipBtn = offhandSlot.querySelector('.slot-unequip-btn') as MockElement;
  assert.ok(offhandUnequipBtn, 'Offhand unequip button must exist');
  assert.ok(typeof offhandUnequipBtn.onclick === 'function', 'Offhand unequip button must have onclick handler');
  offhandUnequipBtn.onclick({ stopPropagation: () => {} });
  assert.equal(hero.offhandWeapon, null, 'Clicking offhand unequip button must unequip offhand');

  // Find necklace unequip button and click
  assert.equal(hero.equippedNecklace?.id, 'bone_necklace');
  const neckSlot = rosterEl.querySelector('[data-slot="necklace"]') as MockElement;
  assert.ok(neckSlot, 'Necklace slot must exist');
  const neckUnequipBtn = neckSlot.querySelector('.slot-unequip-btn') as MockElement;
  assert.ok(neckUnequipBtn, 'Necklace unequip button must exist');
  assert.ok(typeof neckUnequipBtn.onclick === 'function', 'Necklace unequip button must have onclick handler');
  neckUnequipBtn.onclick({ stopPropagation: () => {} });
  assert.equal(hero.equippedNecklace, null, 'Clicking necklace unequip button must unequip necklace');

  console.log('✓ PASS: Unequip buttons cleanly remove items and trigger unequip logic.\n');

  // ---------------------------------------------------------------------------
  // TEST 9: Live-Tick-During-Drag Resilience & In-Place DOM Persistence
  //         (Recurring Incident Prevention - Milestones 3 & 8)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 9: Live-Tick-During-Drag Resilience & In-Place DOM Persistence ---');
  hud.renderPartyOverviewModal(true);

  const initialInnerHTMLCount = rosterEl.innerHTMLSetCount;
  const helmetSlotNodeBefore = rosterEl.querySelector('[data-slot="helmet"]');
  const bodySlotNodeBefore = rosterEl.querySelector('[data-slot="body"]');
  const paperdollNodeBefore = rosterEl.querySelector('.paperdoll-container');

  assert.ok(helmetSlotNodeBefore, 'Helmet slot node must exist');
  assert.ok(bodySlotNodeBefore, 'Body slot node must exist');
  assert.ok(paperdollNodeBefore, 'Paperdoll container node must exist');

  // 1. User begins dragging Silk Cowl
  hud.activeDragPayload = { itemId: 'silk_cowl', itemType: 'armor', itemSlot: 'helmet' };

  // 2. User drags over helmet slot (highlight active)
  helmetSlotNodeBefore.ondragover({ preventDefault: () => {} });
  assert.equal(helmetSlotNodeBefore.classList.contains('drag-over-valid'), true, 'Slot should have drag-over-valid class');

  console.log('Simulating 500ms of rapid game ticks with changing live stats mid-drag...');
  const tickTimes = [100, 150, 200, 250, 300, 400, 500, 600];
  for (const t of tickTimes) {
    hero.hp = Math.max(10, hero.hp - 1);
    hero.energy = Math.max(10, hero.energy - 2);
    hero.hunger = Math.max(10, hero.hunger - 1);
    hero.mood = Math.max(10, hero.mood - 1);
    hud.update(hero, hero.progression, t, [hero]);
  }

  // ASSERTION: rosterEl.innerHTML was called 0 times during ticks!
  assert.equal(
    rosterEl.innerHTMLSetCount,
    initialInnerHTMLCount,
    'CRITICAL: rosterEl.innerHTML MUST NOT be called during live stat ticks while drag is in progress!'
  );

  // ASSERTION: DOM Element Identity (exact same references preserved)
  const helmetSlotNodeAfter = rosterEl.querySelector('[data-slot="helmet"]');
  const bodySlotNodeAfter = rosterEl.querySelector('[data-slot="body"]');
  const paperdollNodeAfter = rosterEl.querySelector('.paperdoll-container');

  assert.equal(helmetSlotNodeAfter, helmetSlotNodeBefore, 'CRITICAL: Helmet slot DOM node reference must be identical');
  assert.equal(bodySlotNodeAfter, bodySlotNodeBefore, 'CRITICAL: Body slot DOM node reference must be identical');
  assert.equal(paperdollNodeAfter, paperdollNodeBefore, 'CRITICAL: Paperdoll container DOM node reference must be identical');

  // ASSERTION: Drag state and visual highlight remained completely uninterrupted
  assert.equal(helmetSlotNodeAfter.classList.contains('drag-over-valid'), true, 'Drag highlight must persist intact across ticks');
  assert.notEqual(hud.activeDragPayload, null, 'Active drag payload must remain intact across ticks');

  // 3. User drops the item onto the slot
  helmetSlotNodeAfter.ondrop({ preventDefault: () => {} });

  assert.equal(hero.equippedHelmet?.id, 'silk_cowl', 'Silk cowl must now be equipped following drop');
  assert.equal(hud.activeDragPayload, null, 'Active drag payload cleared post-drop');

  console.log('✓ PASS: Zero innerHTML calls across 500ms of live ticks mid-drag; DOM references 100% persistent; drop succeeded cleanly.\n');

  // ---------------------------------------------------------------------------
  // TEST 10: Category Filter Tab Switching & Drag State Integrity
  // ---------------------------------------------------------------------------
  console.log('--- TEST 10: Category Filter Tab Switching & Drag State Integrity ---');
  // Start drag of a weapon
  hud.activeDragPayload = { itemId: 'short_swords', itemType: 'weapon', itemSlot: 'main' };

  // Switch filter tabs
  const tabArmor = getOrCreateElement('inv-filter-armor');
  tabArmor.dataset.filter = 'armor';
  (hud as any).partyInventoryFilter = 'armor';
  hud.renderPartyInventoryPanel();

  // Verify weapons are filtered out of the list
  const katanaInArmor = inventoryEl.querySelector('[data-item-id="katana"]');
  assert.equal(katanaInArmor, null, 'Weapons must not appear under armor filter');
  const robeInArmor = inventoryEl.querySelector('[data-item-id="silk_robe"]');
  assert.ok(robeInArmor, 'Silk robe must appear under armor filter');

  // Confirm active drag payload was not corrupted or orphaned by filter switch
  assert.deepEqual(hud.activeDragPayload, { itemId: 'short_swords', itemType: 'weapon', itemSlot: 'main' });

  // Reset filter to all
  (hud as any).partyInventoryFilter = 'all';
  hud.renderPartyInventoryPanel();
  hud.activeDragPayload = null;

  console.log('✓ PASS: Category filters update equipment inventory list without orphaning or corrupting active drag payloads.\n');

  console.log('================================================================');
  console.log('ALL MILESTONE 35 UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone35Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
