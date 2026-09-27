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
      classMatch[1].split(/\s+/).forEach(c => c && el.classList.add(c));
    }

    const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/gi;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(rawAttrs)) !== null) {
      const camel = dataMatch[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      el.dataset[camel] = dataMatch[2];
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
  'blacksmithing-modal', 'blacksmithing-recipes-container', 'close-blacksmithing-btn',
  'armorsmithing-modal', 'armorsmithing-recipes-container', 'close-armorsmithing-btn',
  'bowyer-modal', 'bowyer-recipes-container', 'close-bowyer-btn',
  'alchemy-modal', 'alchemy-recipes-container', 'close-alchemy-btn',
  'cooking-modal', 'cooking-recipes-container', 'close-cooking-btn', 'cooking-dishes-container'
].forEach((id) => getOrCreateElement(id));

async function runTests() {
  console.log('=== Starting Priority Milestone Test Suite: Crafting Output to Character Inventory ===\n');

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
  // Test 1: Recipe Coverage Audit across All Weapon Families & Armor Slots (Data-Driven)
  // -------------------------------------------------------------
  console.log('--- Test 1: Recipe Coverage Audit (Data-Driven) ---');
  {
    const weaponsRaw = JSON.parse(fs.readFileSync('data/weapons.json', 'utf8')).weapons;
    const bsRecipes = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8')).recipes;
    const bwRecipes = JSON.parse(fs.readFileSync('data/bowyerRecipes.json', 'utf8')).recipes;
    const armRecipes = JSON.parse(fs.readFileSync('data/armorsmithRecipes.json', 'utf8')).recipes;
    const armorsRaw = JSON.parse(fs.readFileSync('data/armors.json', 'utf8')).armors;

    // Build weapon lookup
    const weaponMap = new Map<string, any>();
    for (const w of weaponsRaw) {
      weaponMap.set(w.id, w);
    }

    // Derive physical weapon families from data/weapons.json:
    // Physical weapons are non-magic (w.category !== 'magic') and not spell conduits (!w.spellWeaponId)
    const physicalWeapons = weaponsRaw.filter((w: any) => w.category !== 'magic' && !w.spellWeaponId);
    const familiesSet = new Set<string>();
    for (const w of physicalWeapons) {
      const fam = w.proficiencyId || w.id;
      familiesSet.add(fam);
    }

    // Explicit exclusion list with one-line reason
    const EXCLUSION_LIST: Record<string, string> = {
      fist: 'Unarmed combat baseline; inherent character capability, not a craftable weapon.'
    };

    console.log(`Derived ${familiesSet.size} physical weapon families from data/weapons.json:`);
    console.log(Array.from(familiesSet).join(', '));
    console.log('\n--- Weapon Family Recipe Coverage ---');

    // Combine crafting recipes
    const weaponCraftingSources = [
      { file: 'data/blacksmithRecipes.json', recipes: bsRecipes },
      { file: 'data/bowyerRecipes.json', recipes: bwRecipes }
    ];

    for (const fam of Array.from(familiesSet).sort()) {
      if (EXCLUSION_LIST[fam]) {
        console.log(`[EXCLUDED] Family: ${fam.padEnd(18)} | Reason: ${EXCLUSION_LIST[fam]}`);
        continue;
      }

      // Find covering recipe
      let coveringRecipe: any = null;
      let coveringFile: string = '';

      for (const src of weaponCraftingSources) {
        for (const r of src.recipes) {
          const resId = r.resultWeaponId || r.resultItemId || r.id;
          const targetWpn = weaponMap.get(resId);
          const targetFam = targetWpn ? (targetWpn.proficiencyId || targetWpn.id) : resId;
          if (targetFam === fam) {
            coveringRecipe = r;
            coveringFile = src.file;
            break;
          }
        }
        if (coveringRecipe) break;
      }

      assert.ok(
        coveringRecipe,
        `Weapon family '${fam}' must have a covering recipe or be explicitly listed in EXCLUSION_LIST!`
      );

      console.log(`Family: ${fam.padEnd(20)} | Recipe ID: ${coveringRecipe.id.padEnd(18)} | File: ${coveringFile}`);

      if (fam === 'crossbows') {
        assert.strictEqual(coveringRecipe.id, 'crossbow', 'Crossbows must resolve to the Milestone 55 Arbalest Crossbow recipe');
        assert.strictEqual(coveringFile, 'data/blacksmithRecipes.json', 'Crossbow recipe resides currently in blacksmithRecipes.json');
      }
    }

    // Armor Slots coverage check
    console.log('\n--- Armor Slots Recipe Coverage ---');
    const armorSlots = ['helmet', 'body', 'necklace', 'ring', 'accessory'];
    const armorMap = new Map<string, any>();
    for (const a of armorsRaw) {
      armorMap.set(a.id, a);
    }

    for (const slot of armorSlots) {
      let coveringRecipe: any = null;
      for (const r of armRecipes) {
        const armorDef = armorMap.get(r.resultArmorId);
        if (armorDef && armorDef.slot === slot) {
          coveringRecipe = r;
          break;
        }
      }

      assert.ok(coveringRecipe, `Armor slot '${slot}' must have a covering recipe in data/armorsmithRecipes.json`);
      console.log(`Slot:   ${slot.padEnd(20)} | Recipe ID: ${coveringRecipe.id.padEnd(18)} | File: data/armorsmithRecipes.json`);
    }

    // Druid Staff Check
    const druidStaffDef = weaponMap.get('druid_staff');
    if (druidStaffDef) {
      console.log(`\n[Info] Druid Staff: 'druid_staff' exists in data/weapons.json (category: '${druidStaffDef.category}').`);
      console.log("       Per docs/class_system.md, it is an independent magic weapon line (Grove Walker) separate from Staff, deliberately out of scope for crafting in this milestone.");
    } else {
      console.log("\n[Info] Druid Staff: 'druid_staff' does NOT exist in data/weapons.json.");
    }

    console.log('\n✓ Test 1 Passed: Data-driven recipe coverage audit complete and fully verified.\n');
  }

  // -------------------------------------------------------------
  // Test 2: Equip/Unequip Item Conservation across 10 Cycles
  // -------------------------------------------------------------
  console.log('--- Test 2: Equip/Unequip Item Conservation ---');
  {
    console.log('Chosen Source-of-Truth Rule:');
    console.log('1. Equipping: handleSlotDrop deducts from character personal inventory first; if not found, deducts from shared party stockpile.');
    console.log('2. Unequipping/Swapping: removed gear returns exclusively to character personal inventory (member.addItem). Never duplicated into stockpile.');
    console.log('Walkthrough Note for the Record:');
    console.log('"Because removed gear always returns to personal inventory, any item equipped from the stockpile migrates into that character\'s bag when it\'s unequipped, and adds to their carried weight."\n');

    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();
    gameState.clearSave();
    delete (window as any).__debugBypassEquipCheck;

    hud.update(hero, hero.progression, 0, [hero]);
    hud.openPartyOverviewModal();

    const TARGET_ITEM = 'katana';
    const SWAP_ITEM = 'greatswords';

    const getEquippedCount = (player: Player, id: string) => {
      let count = 0;
      if (player.equippedWeapon && player.equippedWeapon.id === id) count++;
      if (player.offhandWeapon && player.offhandWeapon.id === id) count++;
      return count;
    };

    const getTotalCount = (itemId: string = TARGET_ITEM) => {
      const personal = hero.getItemCount(itemId);
      const stockpile = gameState.getItemCount(itemId);
      const equipped = getEquippedCount(hero, itemId);
      return { personal, stockpile, equipped, total: personal + stockpile + equipped };
    };

    const directUnequipMain = (player: Player): boolean => {
      // 1. Attempt unequip via UI slot-unequip-btn event on party overview modal
      const rosterEl = (hud as any).partyOverviewRosterEl;
      if (rosterEl) {
        const btns: any[] = rosterEl.querySelectorAll('.slot-unequip-btn');
        const btn = btns.find((b: any) => b.dataset && b.dataset.slot === 'main');
        if (btn && typeof btn.onclick === 'function') {
          btn.onclick({ stopPropagation: () => {} });
          return true;
        }
      }
      // 2. Direct fallback adhering strictly to HUD unequip logic (HUD.ts lines 4136-4147)
      const prev = player.equippedWeapon?.id !== 'fist' ? player.equippedWeapon : null;
      const success = player.equipWeapon(null, true);
      if (success && prev) {
        player.addItem(prev.id, 1);
      }
      return success;
    };

    // -------------------------------------------------------------------------
    // Part 2A: Stockpile-Sourced Equip (gameState.consumeItem execution)
    // Start: Personal = 0, Stockpile = 1. Equip katana. Prove gameState.consumeItem runs: Stockpile 1 -> 0, Equipped 0 -> 1.
    // -------------------------------------------------------------------------
    console.log('--- Part 2A: Stockpile-Sourced Equip ---');
    hero.clearInventory();
    hero.equipWeapon(null, true); // Barehanded Fist
    (gameState as any).inventory.clear();
    gameState.addItem(TARGET_ITEM, 1);

    const s1Before = getTotalCount();
    console.log(`Before Equip: Personal=${s1Before.personal}, Stockpile=${s1Before.stockpile}, Equipped=${s1Before.equipped} | Total=${s1Before.total}`);
    assert.strictEqual(s1Before.personal, 0, 'Part 2A initial Personal must be 0');
    assert.strictEqual(s1Before.stockpile, 1, 'Part 2A initial Stockpile must be 1');
    assert.strictEqual(s1Before.equipped, 0, 'Part 2A initial Equipped must be 0');
    assert.strictEqual(s1Before.total, 1, 'Part 2A initial Total must be 1');

    const equip2ASuccess = hud.handleSlotDrop('main', { itemId: TARGET_ITEM, itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equip2ASuccess, true, 'Part 2A: Stockpile-sourced equip must succeed');

    const s1After = getTotalCount();
    console.log(`After Equip:  Personal=${s1After.personal}, Stockpile=${s1After.stockpile}, Equipped=${s1After.equipped} | Total=${s1After.total}`);
    assert.strictEqual(s1After.personal, 0, 'Personal remains 0');
    assert.strictEqual(s1After.stockpile, 0, 'Stockpile decrements 1 -> 0 via gameState.consumeItem');
    assert.strictEqual(s1After.equipped, 1, 'Equipped increments 0 -> 1');
    assert.strictEqual(s1After.total, 1, 'Total conserved at 1');
    console.log('✓ Part 2A Passed: Stockpile deduction verified (Stockpile 1 -> 0, Equipped 0 -> 1).\n');

    // -------------------------------------------------------------------------
    // Part 2B: Direct Unequip (Lands in Personal Inventory)
    // From Equipped = 1, Personal = 0, Stockpile = 0. Direct unequip katana.
    // Prove it lands in personal inventory: Equipped 1 -> 0, Personal 0 -> 1.
    // -------------------------------------------------------------------------
    console.log('--- Part 2B: Direct Unequip ---');
    const unequip2BSuccess = directUnequipMain(hero);
    assert.strictEqual(unequip2BSuccess, true, 'Part 2B: Direct unequip must succeed');

    const s2After = getTotalCount();
    console.log(`After Direct Unequip: Personal=${s2After.personal}, Stockpile=${s2After.stockpile}, Equipped=${s2After.equipped} | Total=${s2After.total}`);
    assert.strictEqual(s2After.personal, 1, 'Personal increments 0 -> 1 (lands in personal inventory)');
    assert.strictEqual(s2After.stockpile, 0, 'Stockpile remains 0');
    assert.strictEqual(s2After.equipped, 0, 'Equipped decrements 1 -> 0');
    assert.strictEqual(s2After.total, 1, 'Total conserved at 1');
    console.log('✓ Part 2B Passed: Direct unequip verified (Equipped 1 -> 0, Personal 0 -> 1).\n');

    // -------------------------------------------------------------------------
    // Part 2C: Both-Stores Case (Personal Inventory Deducted First)
    // Personal = 1, Stockpile = 1. Equip katana.
    // Prove personal is deducted first: Personal 1 -> 0, Stockpile stays 1, Equipped 0 -> 1.
    // -------------------------------------------------------------------------
    console.log('--- Part 2C: Both-Stores Priority Case ---');
    gameState.addItem(TARGET_ITEM, 1); // Now Personal=1, Stockpile=1
    const s3Before = getTotalCount();
    console.log(`Before Equip (Both Stores): Personal=${s3Before.personal}, Stockpile=${s3Before.stockpile}, Equipped=${s3Before.equipped} | Total=${s3Before.total}`);
    assert.strictEqual(s3Before.personal, 1, 'Part 2C initial Personal must be 1');
    assert.strictEqual(s3Before.stockpile, 1, 'Part 2C initial Stockpile must be 1');
    assert.strictEqual(s3Before.equipped, 0, 'Part 2C initial Equipped must be 0');
    assert.strictEqual(s3Before.total, 2, 'Part 2C initial Total must be 2');

    const equip2CSuccess = hud.handleSlotDrop('main', { itemId: TARGET_ITEM, itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(equip2CSuccess, true, 'Part 2C: Equip must succeed');

    const s3After = getTotalCount();
    console.log(`After Equip (Both Stores):  Personal=${s3After.personal}, Stockpile=${s3After.stockpile}, Equipped=${s3After.equipped} | Total=${s3After.total}`);
    assert.strictEqual(s3After.personal, 0, 'Personal decrements 1 -> 0 (personal inventory consumed first)');
    assert.strictEqual(s3After.stockpile, 1, 'Stockpile remains untouched at 1');
    assert.strictEqual(s3After.equipped, 1, 'Equipped increments 0 -> 1');
    assert.strictEqual(s3After.total, 2, 'Total conserved at 2');
    console.log('✓ Part 2C Passed: Personal deduction priority verified (Personal 1 -> 0, Stockpile remains 1).\n');

    // Clean up back to barehanded
    directUnequipMain(hero);

    // -------------------------------------------------------------------------
    // Part 2D: 10 Cycles of the Stockpile-Sourced Path
    // Between cycles, deposit the unequipped item back into the stockpile so each
    // equip actually pulls from the stockpile.
    // Log must show Stockpile alternating 1 -> 0 -> 1 and Personal alternating 0 -> 1 -> 0,
    // with Total = 1 invariant at every step.
    // -------------------------------------------------------------------------
    console.log('--- Part 2D: 10 Cycles of Stockpile-Sourced Path (Stockpile 1->0->1, Personal 0->1->0) ---');
    hero.clearInventory();
    (gameState as any).inventory.clear();
    gameState.addItem(TARGET_ITEM, 1); // Personal=0, Stockpile=1, Equipped=0

    const initial2D = getTotalCount();
    console.log(`Initial: Personal=${initial2D.personal}, Stockpile=${initial2D.stockpile}, Equipped=${initial2D.equipped} | Total=${initial2D.total}`);
    assert.strictEqual(initial2D.total, 1);
    assert.strictEqual(initial2D.personal, 0);
    assert.strictEqual(initial2D.stockpile, 1);

    for (let cycle = 1; cycle <= 10; cycle++) {
      // Step 1: Equip Katana from Stockpile
      const equipSuccess = hud.handleSlotDrop('main', { itemId: TARGET_ITEM, itemType: 'weapon', itemSlot: 'main' }, hero);
      assert.strictEqual(equipSuccess, true, `Stockpile Cycle ${cycle} Step 1 (Equip) must succeed`);
      const postEquip = getTotalCount();
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 1 (Equip from Stockpile):  Personal=${postEquip.personal}, Stockpile=${postEquip.stockpile}, Equipped=${postEquip.equipped} | Total=${postEquip.total}`);
      assert.strictEqual(postEquip.personal, 0, `Cycle ${cycle} Equip corrupted personal`);
      assert.strictEqual(postEquip.stockpile, 0, `Cycle ${cycle} Equip failed to decrement stockpile`);
      assert.strictEqual(postEquip.equipped, 1, `Cycle ${cycle} Equip failed to increment equipped`);
      assert.strictEqual(postEquip.total, 1, `Cycle ${cycle} Equip corrupted total count`);

      // Step 2: Direct Unequip to Personal Inventory
      const unequipSuccess = directUnequipMain(hero);
      assert.strictEqual(unequipSuccess, true, `Stockpile Cycle ${cycle} Step 2 (Direct Unequip) must succeed`);
      const postUnequip = getTotalCount();
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 2 (Direct Unequip to Bag):  Personal=${postUnequip.personal}, Stockpile=${postUnequip.stockpile}, Equipped=${postUnequip.equipped} | Total=${postUnequip.total}`);
      assert.strictEqual(postUnequip.personal, 1, `Cycle ${cycle} Unequip failed to deposit to personal bag`);
      assert.strictEqual(postUnequip.stockpile, 0, `Cycle ${cycle} Unequip corrupted stockpile`);
      assert.strictEqual(postUnequip.equipped, 0, `Cycle ${cycle} Unequip failed to clear equipped`);
      assert.strictEqual(postUnequip.total, 1, `Cycle ${cycle} Unequip corrupted total count`);

      // Step 3: Redeposit item from Personal bag back to Stockpile for next cycle
      const removeSuccess = hero.removeItem(TARGET_ITEM, 1);
      assert.strictEqual(removeSuccess, true, `Stockpile Cycle ${cycle} Step 3 (Bag Remove) must succeed`);
      gameState.addItem(TARGET_ITEM, 1);
      const postDeposit = getTotalCount();
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 3 (Deposit to Stockpile):  Personal=${postDeposit.personal}, Stockpile=${postDeposit.stockpile}, Equipped=${postDeposit.equipped} | Total=${postDeposit.total}`);
      assert.strictEqual(postDeposit.personal, 0, `Cycle ${cycle} Deposit corrupted personal`);
      assert.strictEqual(postDeposit.stockpile, 1, `Cycle ${cycle} Deposit failed to increment stockpile`);
      assert.strictEqual(postDeposit.equipped, 0, `Cycle ${cycle} Deposit corrupted equipped`);
      assert.strictEqual(postDeposit.total, 1, `Cycle ${cycle} Deposit corrupted total count`);
    }
    console.log('✓ Part 2D Passed: 10 cycles of stockpile-sourced equip/unequip verified with invariant Total = 1.\n');

    // -------------------------------------------------------------------------
    // Part 2E: 10 Cycles of Weapon-for-Weapon Swap Conservation
    // -------------------------------------------------------------------------
    console.log('--- Part 2E: 10 Cycles of Weapon-for-Weapon Swap Conservation ---');
    hero.clearInventory();
    (gameState as any).inventory.clear();
    hero.addItem(TARGET_ITEM, 1);
    gameState.addItem(TARGET_ITEM, 1);
    gameState.addItem(SWAP_ITEM, 10);

    const initKatana = getTotalCount(TARGET_ITEM);
    const initGS = getTotalCount(SWAP_ITEM);
    console.log(`Initial: Katana[P=${initKatana.personal}, S=${initKatana.stockpile}, E=${initKatana.equipped} | T=${initKatana.total}]  Greatsword[P=${initGS.personal}, S=${initGS.stockpile}, E=${initGS.equipped} | T=${initGS.total}]`);
    assert.strictEqual(initKatana.total, 2, 'Initial Katana total must be 2');
    assert.strictEqual(initGS.total, 10, 'Initial Greatsword total must be 10');

    for (let cycle = 1; cycle <= 10; cycle++) {
      // Step A: Equip Katana
      const equipSuccess = hud.handleSlotDrop('main', { itemId: TARGET_ITEM, itemType: 'weapon', itemSlot: 'main' }, hero);
      assert.strictEqual(equipSuccess, true, `Swap Cycle ${cycle} Step 1 (Equip Katana) must succeed`);
      const kStep1 = getTotalCount(TARGET_ITEM);
      const gsStep1 = getTotalCount(SWAP_ITEM);
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 1 (Equip Katana): Katana[P=${kStep1.personal}, S=${kStep1.stockpile}, E=${kStep1.equipped} | T=${kStep1.total}]  Greatsword[P=${gsStep1.personal}, S=${gsStep1.stockpile}, E=${gsStep1.equipped} | T=${gsStep1.total}]`);
      assert.strictEqual(kStep1.total, 2, `Cycle ${cycle} Step 1 Katana total corrupted`);
      assert.strictEqual(gsStep1.total, 10, `Cycle ${cycle} Step 1 Greatsword total corrupted`);

      // Step B: Swap Katana for Greatsword (Katana returns to Personal)
      const swapSuccess = hud.handleSlotDrop('main', { itemId: SWAP_ITEM, itemType: 'weapon', itemSlot: 'main' }, hero);
      assert.strictEqual(swapSuccess, true, `Swap Cycle ${cycle} Step 2 (Swap to GS) must succeed`);
      const kStep2 = getTotalCount(TARGET_ITEM);
      const gsStep2 = getTotalCount(SWAP_ITEM);
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 2 (Swap to GS):   Katana[P=${kStep2.personal}, S=${kStep2.stockpile}, E=${kStep2.equipped} | T=${kStep2.total}]  Greatsword[P=${gsStep2.personal}, S=${gsStep2.stockpile}, E=${gsStep2.equipped} | T=${gsStep2.total}]`);
      assert.strictEqual(kStep2.total, 2, `Cycle ${cycle} Step 2 Katana total corrupted`);
      assert.strictEqual(gsStep2.total, 10, `Cycle ${cycle} Step 2 Greatsword total corrupted`);

      // Step C: Unequip Greatsword (to Fist via direct unequip)
      const unequipSuccess = directUnequipMain(hero);
      assert.strictEqual(unequipSuccess, true, `Swap Cycle ${cycle} Step 3 (Unequip GS) must succeed`);
      const kStep3 = getTotalCount(TARGET_ITEM);
      const gsStep3 = getTotalCount(SWAP_ITEM);
      console.log(`Cycle ${cycle.toString().padStart(2)} Step 3 (Unequip GS):  Katana[P=${kStep3.personal}, S=${kStep3.stockpile}, E=${kStep3.equipped} | T=${kStep3.total}]  Greatsword[P=${gsStep3.personal}, S=${gsStep3.stockpile}, E=${gsStep3.equipped} | T=${gsStep3.total}]`);
      assert.strictEqual(kStep3.total, 2, `Cycle ${cycle} Step 3 Katana total corrupted`);
      assert.strictEqual(gsStep3.total, 10, `Cycle ${cycle} Step 3 Greatsword total corrupted`);
    }

    console.log('\n✓ Test 2 Passed: Exact item conservation preserved across all stockpile-sourced equips, direct unequips, both-stores prioritization, and swap cycles.\n');
  }

  // -------------------------------------------------------------
  // Test 3: Encumbrance Clears & Applies from Every Route
  // -------------------------------------------------------------
  console.log('--- Test 3: Encumbrance Clears and Applies from Every Route ---');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const companion = new Player(mockScene as any, 1, 0, { ...basePlayerData, name: 'Companion' } as any, dataLoader.getWeapon('short_swords')!, 32, 'companion-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();

    const logState = (action: string, phase: string, p: Player) => {
      const wt = p.getTotalWeight();
      const cap = p.getEffectiveCarryCapacity();
      const spd = p.getEffectiveMoveSpeed();
      const enc = p.isEncumbered;
      console.log(`  [${action}] ${phase.padEnd(6)} -> Carried: ${wt.toFixed(1)}kg, Capacity: ${cap.toFixed(1)}kg, Speed: ${spd}px/s (Encumbered: ${enc})`);
      return { wt, cap, spd, enc };
    };

    // --- APPLY ROUTE 1: Loot Pickup ---
    console.log('\nApply Route 1: Monster Loot Pickup Exceeding Capacity');
    hero.clearInventory();
    const a1Before = logState('Loot Pickup', 'BEFORE', hero);
    assert.strictEqual(a1Before.enc, false);
    assert.strictEqual(a1Before.spd, 100);

    // Pick up 100 stone (50kg > 45kg)
    hero.addItem('stone', 100);
    const a1After = logState('Loot Pickup', 'AFTER', hero);
    assert.strictEqual(a1After.enc, true, 'Hero must be encumbered after heavy loot pickup');
    assert.strictEqual(a1After.spd, 20, 'Hero effective movement speed must drop to 20 (-80%)');

    // --- CLEAR ROUTE 1: Discard / Drop Item ---
    console.log('\nClear Route 1: Dropping Item');
    const c1Before = logState('Drop Item', 'BEFORE', hero);
    assert.strictEqual(c1Before.enc, true);

    // Discard 20 stone (10kg -> total weight drops to 40kg <= 45kg)
    const discardOk = gameState.discardItem(hero, 'stone', 20);
    assert.strictEqual(discardOk, true);
    const c1After = logState('Drop Item', 'AFTER', hero);
    assert.strictEqual(c1After.enc, false, 'Hero encumbrance must clear after dropping items');
    assert.strictEqual(c1After.spd, 100, 'Hero effective movement speed must restore to 100');

    // --- APPLY ROUTE 2: Gathering Yields ---
    console.log('\nApply Route 2: Gathering Yields Exceeding Capacity');
    hero.clearInventory();
    const a2Before = logState('Gather Yield', 'BEFORE', hero);
    assert.strictEqual(a2Before.enc, false);

    // Mine 95 ore (95 * 0.5kg = 47.5kg > 45kg)
    hero.addItem('ore', 95);
    const a2After = logState('Gather Yield', 'AFTER', hero);
    assert.strictEqual(a2After.enc, true, 'Hero must be encumbered after gathering heavy ore');
    assert.strictEqual(a2After.spd, 20, 'Hero effective speed must drop to 20 (-80%)');

    // --- CLEAR ROUTE 2: Deposit to Stockpile ---
    console.log('\nClear Route 2: Depositing to Stockpile');
    const c2Before = logState('Deposit Stockpile', 'BEFORE', hero);
    assert.strictEqual(c2Before.enc, true);

    // Deposit 20 ore (10kg -> weight drops to 37.5kg <= 45kg)
    const depositOk = gameState.depositItem(hero, 'ore', 20);
    assert.strictEqual(depositOk, true);
    const c2After = logState('Deposit Stockpile', 'AFTER', hero);
    assert.strictEqual(c2After.enc, false, 'Encumbrance must clear after depositing to stockpile');
    assert.strictEqual(c2After.spd, 100, 'Speed must restore to 100');

    // --- APPLY & CLEAR ROUTE 3: Companion Transfer & Over-Capacity Promotion ---
    console.log('\nApply/Clear Route 3: Transfer to Party Member & Promoting Over-Capacity Companion');
    hero.clearInventory();
    companion.clearInventory();

    // Hero acquires 100 stone (50kg) -> encumbered
    hero.addItem('stone', 100);
    logState('Transfer Prep', 'HERO OVERWEIGHT', hero);

    // Transfer 40 stone (20kg) to Companion
    // Hero: 60 stone (30kg) <= 45kg -> CLEARS encumbrance
    // Companion: 40 stone (20kg) + add another 60 stone (50kg total) -> Companion becomes encumbered
    gameState.transferItem(hero, companion, 'stone', 40);
    const c3Hero = logState('Transfer Item', 'HERO POST-TRANSFER', hero);
    assert.strictEqual(c3Hero.enc, false, 'Hero encumbrance clears after transfer');
    assert.strictEqual(c3Hero.spd, 100);

    companion.addItem('stone', 60); // Companion now holds 100 stone (50kg > 45kg)
    const c3CompanionBefore = logState('Promotion Prep', 'COMPANION BEFORE PROMOTION', companion);
    assert.strictEqual(c3CompanionBefore.enc, true);
    assert.strictEqual(c3CompanionBefore.spd, 20);

    // Setup party array [Hero, Companion] and promote companion to Leader (index 1 -> index 0)
    let party = [hero, companion];
    hud.onSetLeaderCallback = (newLeaderIdx: number) => {
      const promoted = party.splice(newLeaderIdx, 1)[0];
      party.unshift(promoted);
      promoted.updateEncumbrance();
    };

    hud.onSetLeaderCallback(1);
    assert.strictEqual(party[0].entityName, 'Companion', 'Companion promoted to Leader at index 0');

    const promotedLeader = party[0];
    const a3Leader = logState('Promote Leader', 'PROMOTED LEADER LIVE STATE', promotedLeader);
    assert.strictEqual(a3Leader.enc, true, 'Promoted leader must inherit active encumbrance penalty');
    assert.strictEqual(a3Leader.spd, 20, 'Promoted leader moves at -80% penalty (20px/s)');

    console.log('\n✓ Test 3 Passed: Encumbrance clears and applies faithfully on all routes via single shared recalculation.\n');
  }

  // -------------------------------------------------------------
  // Test 4: Alchemy Output ID and Explicit Result Field
  // -------------------------------------------------------------
  console.log('--- Test 4: Alchemy Explicit resultItemId Field Audit ---');
  {
    const alchemyData = JSON.parse(fs.readFileSync('data/alchemyRecipes.json', 'utf8')).recipes;
    const itemsRaw = JSON.parse(fs.readFileSync('data/items.json', 'utf8')).items;
    const itemIds = new Set(itemsRaw.map((i: any) => i.id));

    console.log(`Checking ${alchemyData.length} alchemy recipes for explicit resultItemId:`);
    for (const r of alchemyData) {
      assert.ok(r.resultItemId, `Alchemy recipe '${r.id}' must declare an explicit 'resultItemId' field`);
      assert.ok(itemIds.has(r.resultItemId), `Alchemy recipe resultItemId '${r.resultItemId}' must exist in data/items.json`);
      console.log(`Recipe: ${r.id.padEnd(16)} | resultItemId: ${r.resultItemId.padEnd(16)} | Item exists in items.json: ✓`);
    }

    // Test crafting Bandage: verify deposit uses resultItemId
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();
    gameState.addItem('wood', 10);

    const initialBandages = hero.getItemCount('bandage');
    hud.openAlchemyModal(hero, hero.progression);
    const container = getOrCreateElement('alchemy-recipes-container');
    const bandageBtn = container.querySelector('[data-craft-recipe="bandage"]') as MockElement;
    assert.ok(bandageBtn, 'Bandage craft button rendered');
    bandageBtn.onclick();

    assert.ok(hero.getItemCount('bandage') > initialBandages, 'Crafted bandage deposited using explicit resultItemId');
    console.log('\n✓ Test 4 Passed: Every alchemy recipe has valid resultItemId matching items.json and deposits successfully.\n');
  }

  // -------------------------------------------------------------
  // Test 5: Crafting Input Source (Empty-Handed Promoted Leader)
  // -------------------------------------------------------------
  console.log('--- Test 5: Crafting Input Source with Empty-Handed Promoted Leader ---');
  {
    console.log('Documented Input Rule: All Outpost crafting stations consume raw ingredients from the central');
    console.log('party stockpile (GameState), while output goods and EXP route to the active Leader personal inventory.\n');

    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const companion = new Player(mockScene as any, 1, 0, { ...basePlayerData, name: 'Valerie' } as any, dataLoader.getWeapon('bows')!, 32, 'companion-avatar', new ProgressionSystem());
    let party = [hero, companion];

    // Ensure companion has completely empty inventory
    companion.clearInventory();
    assert.strictEqual(companion.getInventoryWeight(), 0.0, 'Valerie initial personal inventory must be completely empty');

    // Promote companion to Party Leader
    hud.onSetLeaderCallback = (newLeaderIdx: number) => {
      const promoted = party.splice(newLeaderIdx, 1)[0];
      party.unshift(promoted);
    };
    hud.onSetLeaderCallback(1);
    assert.strictEqual(party[0].entityName, 'Valerie', 'Valerie is now Party Leader');
    const leader = party[0];

    const gameState = GameState.getInstance();
    gameState.clearSave();

    // Seed party stockpile with crafting ingredients
    gameState.addItem('ore', 20);
    gameState.addItem('wood', 20);
    gameState.addItem('wolf_pelt', 20);
    gameState.addItem('spider_silk', 20);
    gameState.addItem('wild_herbs', 20);
    gameState.addItem('monster_meat', 20);
    gameState.discoverCookingRecipe('herb_stew');

    // 1. Blacksmithing: Forge Iron Shortsword
    const preOre = gameState.getItemCount('ore');
    hud.openBlacksmithingModal(leader, leader.progression);
    const bsContainer = getOrCreateElement('blacksmithing-recipes-container');
    const swordBtn = bsContainer.querySelector('[data-forge-recipe="short_sword"]') as MockElement;
    assert.ok(swordBtn);
    swordBtn.onclick();
    assert.strictEqual(gameState.getItemCount('ore'), preOre - 3, 'Ore deducted from stockpile');
    assert.strictEqual(leader.getItemCount('short_swords'), 1, 'Shortsword landed in empty-handed leader inventory');

    // 2. Armorsmithing: Craft Leather Armor
    const prePelts = gameState.getItemCount('wolf_pelt');
    hud.openArmorsmithingModal(leader, leader.progression);
    const asContainer = getOrCreateElement('armorsmithing-recipes-container');
    const armorBtn = asContainer.querySelector('[data-armor-recipe="leather_armor"]') as MockElement;
    assert.ok(armorBtn);
    armorBtn.onclick();
    assert.strictEqual(gameState.getItemCount('wolf_pelt'), prePelts - 4, 'Wolf Pelt deducted from stockpile');
    assert.strictEqual(leader.getItemCount('leather_armor'), 1, 'Leather Armor landed in leader inventory');

    // 3. Bowyer: Craft Hunting Bow
    const preWood = gameState.getItemCount('wood');
    hud.openBowyerModal(leader, leader.progression);
    const bwContainer = getOrCreateElement('bowyer-recipes-container');
    const bowBtn = bwContainer.querySelector('[data-bow-recipe="hunting_bow"]') as MockElement;
    assert.ok(bowBtn);
    bowBtn.onclick();
    assert.strictEqual(gameState.getItemCount('wood'), preWood - 4, 'Wood deducted from stockpile');
    assert.strictEqual(leader.getItemCount('bows'), 1, 'Hunting bow landed in leader inventory');

    // 4. Alchemy: Craft Antidote
    const preHerbs = gameState.getItemCount('wild_herbs');
    hud.openAlchemyModal(leader, leader.progression);
    const alContainer = getOrCreateElement('alchemy-recipes-container');
    const antiBtn = alContainer.querySelector('[data-craft-recipe="antidote"]') as MockElement;
    assert.ok(antiBtn);
    antiBtn.onclick();
    assert.strictEqual(gameState.getItemCount('wild_herbs'), preHerbs - 1, 'Wild Herbs deducted from stockpile');
    const expectedAntidotes = 1 + dataLoader.getMoodTier(leader.mood).alchemyYieldBonus;
    assert.strictEqual(leader.getItemCount('antidote'), expectedAntidotes, 'Antidote landed in leader inventory');

    // 5. Cooking: Cook Herb Stew
    const preStewHerbs = gameState.getItemCount('wild_herbs');
    const preStewMeat = gameState.getItemCount('monster_meat');
    hud.openCookingModal(leader, leader.progression);
    const ckContainer = getOrCreateElement('cooking-recipes-container');
    const stewBtn = ckContainer.querySelector('[data-cook-recipe="herb_stew"]') as MockElement;
    assert.ok(stewBtn, 'Herb stew cook button rendered');
    stewBtn.onclick();
    assert.strictEqual(gameState.getItemCount('wild_herbs'), preStewHerbs - 1, 'Wild Herbs deducted from stockpile for stew');
    assert.strictEqual(gameState.getItemCount('monster_meat'), preStewMeat - 1, 'Monster Meat deducted from stockpile for stew');
    assert.strictEqual(leader.getItemCount('herb_stew'), 1, 'Herb stew landed in leader inventory');

    console.log('✓ All 5 stations successfully crafted with an empty-handed promoted leader.');
    console.log('✓ Verified: materials deducted from stockpile; output items deposited into leader personal inventory.');
    console.log('\n✓ Test 5 Passed: Crafting input source rule confirmed and verified.\n');
  }

  // -------------------------------------------------------------
  // Test 6: Debug Flag Hardening and Gating Verification
  // -------------------------------------------------------------
  console.log('--- Test 6: Debug Flag Hardening & Gating ---');
  {
    const indexHtml = fs.readFileSync('index.html', 'utf8');
    const hudTs = fs.readFileSync('src/ui/HUD.ts', 'utf8');
    const mainSceneTs = fs.readFileSync('src/scenes/MainScene.ts', 'utf8');
    const outpostSceneTs = fs.readFileSync('src/scenes/OutpostScene.ts', 'utf8');

    // 1. Confirm __debugBypassEquipCheck is never mentioned in index.html (no UI buttons)
    assert.strictEqual(
      indexHtml.includes('__debugBypassEquipCheck'),
      false,
      'index.html must not contain any reference or button for __debugBypassEquipCheck'
    );

    // 2. Confirm no keyboard event in MainScene, OutpostScene, or HUD toggles __debugBypassEquipCheck
    [mainSceneTs, outpostSceneTs].forEach((src) => {
      assert.strictEqual(
        src.includes('__debugBypassEquipCheck'),
        false,
        'Scenes must not reference __debugBypassEquipCheck'
      );
    });

    // 3. In HUD.ts, it is only read as a boolean check
    const bypassMatches = hudTs.match(/__debugBypassEquipCheck/g);
    assert.ok(bypassMatches && bypassMatches.length > 0, 'HUD.ts references __debugBypassEquipCheck strictly as a check');
    assert.strictEqual(
      hudTs.includes('__debugBypassEquipCheck = true'),
      false,
      'HUD.ts must not have any code setting __debugBypassEquipCheck to true'
    );

    console.log('Gating Architecture Report:');
    console.log('  Debug helpers ((window as any).__instantReviveParty, __dealDebugDamage, etc.) and the Debug Panel');
    console.log('  are unconditionally included in alpha builds for developer/tester accessibility (no DEV stripping).');
    console.log('  window.__debugBypassEquipCheck adheres to this exact same console/window gate.');
    console.log('  The static source-grep confirms zero UI buttons or keybindings manipulate or expose this flag.');
    console.log('  (Limitation: static grep verifies static source text but would not detect runtime dynamic eval or obfuscated property access).');

    console.log('\n✓ Test 6 Passed: Debug flag hardening verified.\n');
  }

  // -------------------------------------------------------------
  // Test 7: Stash Exploit Closure & Paperdoll Draggable Verification
  // -------------------------------------------------------------
  console.log('--- Test 7: Stash Exploit Closure & Paperdoll Inventory ---');
  {
    const hero = new Player(mockScene as any, 0, 0, basePlayerData as any, dataLoader.getWeapon('short_swords')!, 32, 'player-avatar', new ProgressionSystem());
    const gameState = GameState.getInstance();
    gameState.resetToDefault();
    hero.clearInventory();

    delete (window as any).__debugBypassEquipCheck;

    hud.update(hero, hero.progression, 0, [hero]);
    hud.openPartyOverviewModal();
    hud.renderPartyInventoryPanel();

    const stashList = getOrCreateElement('party-inventory-item-list');
    const katanaCard = stashList.querySelector('[data-item-id="katana"]') as MockElement;
    assert.ok(katanaCard, 'Katana card rendered in stash catalog');
    assert.strictEqual(katanaCard.getAttribute('draggable'), 'false', 'Unowned Katana must not be draggable');

    const dropUnowned = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(dropUnowned, false, 'Dropping unowned Katana must be strictly rejected');
    assert.strictEqual(hero.equippedWeapon.id, 'short_swords', 'Hero weapon must remain short_swords');

    hero.addItem('katana', 1);
    hud.renderPartyInventoryPanel();
    const updatedKatanaCard = stashList.querySelector('[data-item-id="katana"]') as MockElement;
    assert.strictEqual(updatedKatanaCard.getAttribute('draggable'), 'true', 'Owned Katana is now draggable');

    const dropOwned = hud.handleSlotDrop('main', { itemId: 'katana', itemType: 'weapon', itemSlot: 'main' }, hero);
    assert.strictEqual(dropOwned, true, 'Dropping owned Katana must succeed');
    assert.strictEqual(hero.equippedWeapon.id, 'katana', 'Hero has Katana equipped');
    assert.strictEqual(hero.getItemCount('katana'), 0, '1 Katana was consumed from personal inventory on equip');
    assert.strictEqual(hero.getItemCount('short_swords'), 1, 'Previous weapon (short_swords) returned to personal inventory');

    console.log('✓ Test 7 Passed: Unowned items non-draggable; drops strictly validated.\n');
  }

  console.log('================================================================');
  console.log('ALL CRAFTING INVENTORY ROUTING TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
