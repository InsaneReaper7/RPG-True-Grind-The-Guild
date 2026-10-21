import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') return {};
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before Phaser modules are loaded
const mockStorage: Record<string, string> = {};
const noop = () => {};
(global as any).localStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
(global as any).window = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  localStorage: (global as any).localStorage,
  confirm: (_msg: string) => true
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

class MockDOMElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, any> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public innerHTMLSetCount: number = 0;
  private _innerHTML: string = '';
  private _textContent: string = '';
  public dataset: Record<string, string> = {};
  public onclick: any = null;
  public disabled: boolean = false;
  private _attributes: Record<string, string> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...classes: string[]) => classes.forEach(c => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach(c => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string { return this._innerHTML; }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.innerHTMLSetCount++;
  }
  get textContent(): string { return this._textContent; }
  set textContent(val: string) { this._textContent = String(val); }
  get innerText(): string { return this._textContent; }
  set innerText(val: string) { this._textContent = String(val); }

  public setAttribute(name: string, value: string) { this._attributes[name] = value; }
  public getAttribute(name: string): string | null { return this._attributes[name] ?? null; }
  public appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  public removeChild(child: MockDOMElement): MockDOMElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }
  public querySelector(_selector: string): any { return null; }
  public querySelectorAll(_selector: string): any[] { return []; }
  public getContext() { return dummyCtx; }
}

const domRegistry = new Map<string, MockDOMElement>();
function getOrCreateElement(id: string, tag: string = 'div'): MockDOMElement {
  if (!domRegistry.has(id)) {
    const el = new MockDOMElement(tag);
    el.id = id;
    domRegistry.set(id, el);
  }
  return domRegistry.get(id)!;
}

(global as any).document = {
  createElement: (tag: string) => new MockDOMElement(tag),
  getElementById: (id: string) => getOrCreateElement(id),
  querySelector: (sel: string) => sel.startsWith('#') ? getOrCreateElement(sel.slice(1)) : null,
  querySelectorAll: (_sel: string) => [],
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: {},
  body: {}
};
(global as any).Image = class Image {};
(global as any).HTMLCanvasElement = class HTMLCanvasElement {};
(global as any).HTMLVideoElement = class HTMLVideoElement {};

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
  'cooking-modal', 'cooking-recipes-container', 'close-cooking-btn', 'cooking-dishes-container',
  'blacksmithing-salvage-container', 'armorsmithing-salvage-container', 'bowyer-salvage-container'
].forEach((id) => getOrCreateElement(id));

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
      setAlphaDirect: () => obj,
      setInteractive: () => obj,
      setLineWidth: () => obj,
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
      container: () => createMockObj(),
      graphics: () => createMockObj(),
      rectangle: () => createMockObj(),
      line: () => createMockObj(),
      image: () => createMockObj(),
      sprite: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    cameras: {
      main: {
        scrollX: 0,
        scrollY: 0,
        worldView: { contains: () => true }
      }
    }
  } as any;
}

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function makeSeededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function runFrostGearTests() {
  console.log('=== BAND 4 FROST GEAR COMPREHENSIVE TEST SUITE ===\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const playerData = dataLoader.getPlayer();
  gameState.resetToDefault(playerData);
  (global as any).localStorage.clear();

  const weaponsData = dataLoader.getWeaponsData();
  const armorsData = dataLoader.getArmorsData();

  // =========================================================================
  // 1. EXPECTED-TABLE GUARDS FOR SECTIONS 1 AND 2
  // =========================================================================
  console.log('--- Test 1: Expected-Table Guards (Sections 1 and 2) ---');

  const expectedWeapons = [
    { id: 'frost_short_sword', name: 'Frostbound Short Sword', dmg: 10, ms: 1000, dps: 10.00, weight: 4.5, station: 'blacksmith', recipe: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_longsword', name: 'Frostbound Longsword', dmg: 15, ms: 1100, dps: 13.64, weight: 5.5, station: 'blacksmith', recipe: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_katana', name: 'Frostbound Katana', dmg: 14, ms: 950, dps: 14.74, weight: 4.5, station: 'blacksmith', recipe: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_spear', name: 'Frostbound Spear', dmg: 15, ms: 1100, dps: 13.64, weight: 5.5, station: 'blacksmith', recipe: { ore: 8, wood: 2, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_daggers', name: 'Frostbound Daggers', dmg: 6, ms: 575, dps: 10.43, weight: 2.0, station: 'blacksmith', recipe: { ore: 6, steel_scrap: 2, glacial_essence: 1 } },
    { id: 'frost_morningstar', name: 'Frostbound Morningstar', dmg: 16, ms: 1450, dps: 11.03, weight: 9.5, station: 'blacksmith', recipe: { ore: 9, steel_scrap: 4, orc_heavy_hide: 1, glacial_essence: 1 } },
    { id: 'frost_greatsword', name: 'Frostbound Greatsword', dmg: 25, ms: 1400, dps: 17.86, weight: 10.5, station: 'blacksmith', recipe: { ore: 10, steel_scrap: 4, glacial_essence: 2 } },
    { id: 'frost_halberd', name: 'Frostbound Halberd', dmg: 24, ms: 1300, dps: 18.46, weight: 9.5, station: 'blacksmith', recipe: { ore: 10, wood: 3, steel_scrap: 4, glacial_essence: 2 } },
    { id: 'frost_staff', name: 'Frostbound Staff', dmg: 14, ms: 1250, dps: 11.20, weight: 4.5, station: 'bowyer', recipe: { wood: 8, steel_scrap: 2, glacial_essence: 1 } },
    { id: 'frost_bow', name: 'Frostbound Bow', dmg: 16, ms: 1250, dps: 12.80, weight: 4.5, station: 'bowyer', recipe: { wood: 8, wolf_claw: 2, bone: 2, glacial_essence: 1 } },
    { id: 'frost_crossbow', name: 'Frostbound Crossbow', dmg: 19, ms: 1500, dps: 12.67, weight: 7.5, station: 'blacksmith', recipe: { ore: 8, wood: 3, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_throwing_weapons', name: 'Frostbound Throwing Blades', dmg: 7, ms: 700, dps: 10.00, weight: 2.0, station: 'blacksmith', recipe: { ore: 6, steel_scrap: 2, glacial_essence: 1 } }
  ];

  for (const exp of expectedWeapons) {
    const w = dataLoader.getWeapon(exp.id);
    assert.ok(w, `Weapon ${exp.id} must exist in data/weapons.json`);
    assert.equal(w.name, exp.name, `${exp.id} name mismatch`);
    assert.equal(w.baseDamage, exp.dmg, `${exp.id} baseDamage mismatch`);
    assert.equal(w.attackIntervalMs, exp.ms, `${exp.id} attackIntervalMs mismatch`);
    assert.equal(w.weight, exp.weight, `${exp.id} weight mismatch`);
    assert.equal(w.frostbiteChance, 0.10, `${exp.id} frostbiteChance must be 0.10`);
    const actualDps = Number((w.baseDamage / (w.attackIntervalMs / 1000)).toFixed(2));
    assert.equal(actualDps, exp.dps, `${exp.id} calculated DPS mismatch`);

    // Verify recipe
    const r = exp.station === 'blacksmith'
      ? dataLoader.getBlacksmithRecipe(exp.id)
      : dataLoader.getBowyerRecipe(exp.id);
    assert.ok(r, `Recipe for ${exp.id} must exist in ${exp.station}`);
    assert.equal(r.requiredLevel, 12, `${exp.id} recipe requiredLevel must be 12`);
    assert.equal(r.expGranted, 110, `${exp.id} recipe expGranted must be 110`);
    assert.deepStrictEqual(r.ingredients, exp.recipe, `${exp.id} ingredients mismatch`);
  }

  // Shield guard
  const shield = dataLoader.getWeapon('frost_shield');
  assert.ok(shield, 'frost_shield must exist');
  assert.equal(shield.name, 'Frostbound Shield');
  assert.equal(shield.baseDamage, 5);
  assert.equal(shield.baseBlock, 0.105);
  assert.equal(shield.baseMitigation, 4);
  assert.equal(shield.weight, 9.5);
  const shieldRecipe = dataLoader.getBlacksmithRecipe('frost_shield');
  assert.ok(shieldRecipe, 'frost_shield recipe must exist');
  assert.equal(shieldRecipe.requiredLevel, 12);
  assert.equal(shieldRecipe.expGranted, 110);
  assert.deepStrictEqual(shieldRecipe.ingredients, { ore: 8, steel_scrap: 3, glacial_essence: 1 });

  // Armor & accessories guard
  const expectedArmors = [
    { id: 'frost_hood', name: 'Frostweave Hood', slot: 'helmet', weightClass: 'light', rating: 6, hp: 90, weight: 1.2, topPiece: false, recipe: { wolf_pelt: 2, ectoplasm: 2, glacial_essence: 1 } },
    { id: 'frost_robe', name: 'Frostweave Robe', slot: 'body', weightClass: 'light', rating: 10, hp: 150, weight: 3.5, topPiece: false, recipe: { wolf_pelt: 3, ectoplasm: 3, glacial_essence: 2 } },
    { id: 'frost_leather_helm', name: 'Rimehide Helm', slot: 'helmet', weightClass: 'medium', rating: 10, hp: 90, weight: 3.0, topPiece: false, recipe: { wolf_pelt: 3, orc_heavy_hide: 1, glacial_essence: 1 } },
    { id: 'frost_leather_armor', name: 'Rimehide Armor', slot: 'body', weightClass: 'medium', rating: 17, hp: 150, weight: 7.0, topPiece: false, recipe: { wolf_pelt: 4, orc_heavy_hide: 2, glacial_essence: 2 } },
    { id: 'frost_greathelm', name: 'Rimeforged Greathelm', slot: 'helmet', weightClass: 'heavy', rating: 18, hp: 90, weight: 5.0, topPiece: false, recipe: { ore: 5, steel_scrap: 3, glacial_essence: 1 } },
    { id: 'frost_plate_armor', name: 'Rimeforged Plate', slot: 'body', weightClass: 'heavy', rating: 30, hp: 150, weight: 13.0, topPiece: true, recipe: { ore: 7, steel_scrap: 4, glacial_essence: 2, rime_carapace: 1 } },
    { id: 'frost_pendant', name: 'Frost Pendant', slot: 'necklace', hp: 60, weight: 0.5, topPiece: false, recipe: { glacial_essence: 1, bone: 3 } },
    { id: 'frost_ring', name: 'Frost Ring', slot: 'ring', hp: 42, weight: 0.2, topPiece: false, recipe: { glacial_essence: 1, wolf_claw: 2 } },
    { id: 'frost_relic', name: 'Glacial Heart Relic', slot: 'accessory', hp: 75, carry: 15, weight: 0.5, topPiece: true, recipe: { glacial_core: 1, glacial_essence: 2 } },
    { id: 'sovereign_signet', name: "Sovereign's Signet", slot: 'ring', hp: 60, weight: 0.2, topPiece: true, recipe: { eye_of_the_sovereign: 1, glacial_essence: 2 } }
  ];

  for (const exp of expectedArmors) {
    const a = dataLoader.getArmor(exp.id);
    assert.ok(a, `Armor ${exp.id} must exist in data/armors.json`);
    assert.equal(a.name, exp.name, `${exp.id} name mismatch`);
    assert.equal(a.slot, exp.slot, `${exp.id} slot mismatch`);
    assert.equal(a.hpBonus, exp.hp, `${exp.id} hpBonus mismatch`);
    assert.equal(a.weight, exp.weight, `${exp.id} weight mismatch`);
    if (exp.weightClass) {
      assert.equal(a.weightClass, exp.weightClass, `${exp.id} weightClass mismatch`);
      assert.equal(a.armorRating, exp.rating, `${exp.id} armorRating mismatch`);
      assert.equal(a.tier, 'frost', `${exp.id} tier must be 'frost'`);
    }
    if (exp.carry) {
      assert.equal(a.carryCapacityBonus, exp.carry, `${exp.id} carryCapacityBonus mismatch`);
    }

    // Verify recipe
    const r = dataLoader.getArmorsmithRecipe(exp.id);
    assert.ok(r, `Armorsmith recipe for ${exp.id} must exist`);
    assert.equal(r.requiredLevel, 12, `${exp.id} requiredLevel must be 12`);
    assert.equal(r.expGranted, exp.topPiece ? 120 : 110, `${exp.id} expGranted must be ${exp.topPiece ? 120 : 110}`);
    assert.deepStrictEqual(r.ingredients, exp.recipe, `${exp.id} recipe ingredients mismatch`);
  }
  console.log('✔ PASS: All 13 weapons/shields and 10 armor/accessory pieces verified against expected tables.\n');

  // =========================================================================
  // 2. DPS RULE: EVERY FROST WEAPON IS +20-30% OVER BAND 3 REFERENCE
  // =========================================================================
  console.log('--- Test 2: DPS Rule (+20% to +30% over Band 3 Reference) ---');

  const refMap: Record<string, string> = {
    frost_short_sword: 'void_short_sword',
    frost_longsword: 'void_longsword',
    frost_katana: 'void_katana',
    frost_spear: 'void_spear',
    frost_daggers: 'void_daggers',
    frost_morningstar: 'spiked_morningstar',
    frost_greatsword: 'void_greatsword',
    frost_halberd: 'void_halberd',
    frost_staff: 'void_staff',
    frost_bow: 'war_bow',
    frost_crossbow: 'void_crossbow',
    frost_throwing_weapons: 'void_throwing_weapons'
  };

  const intervalExceptions: Record<string, { b3: number; frost: number }> = {
    frost_daggers: { b3: 600, frost: 575 },
    frost_morningstar: { b3: 1500, frost: 1450 },
    frost_bow: { b3: 1300, frost: 1250 },
    frost_throwing_weapons: { b3: 750, frost: 700 }
  };

  for (const [frostId, refId] of Object.entries(refMap)) {
    const fWpn = dataLoader.getWeapon(frostId)!;
    const rWpn = dataLoader.getWeapon(refId)!;
    assert.ok(rWpn, `Reference weapon ${refId} must exist`);

    const fDps = fWpn.baseDamage / (fWpn.attackIntervalMs / 1000);
    const rDps = rWpn.baseDamage / (rWpn.attackIntervalMs / 1000);
    const ratio = fDps / rDps;
    const pct = (ratio - 1) * 100;

    assert.ok(
      ratio >= 1.20 && ratio <= 1.30,
      `Weapon ${frostId} DPS (${fDps.toFixed(2)}) must be +20% to +30% over ${refId} (${rDps.toFixed(2)}), got +${pct.toFixed(2)}%`
    );

    // Handedness rule
    assert.equal(fWpn.twoHanded, rWpn.twoHanded, `${frostId} handedness must match ${refId}`);

    // Interval rule
    if (intervalExceptions[frostId]) {
      assert.equal(fWpn.attackIntervalMs, intervalExceptions[frostId].frost, `${frostId} interval must match exception`);
      assert.equal(rWpn.attackIntervalMs, intervalExceptions[frostId].b3, `${refId} interval must match exception`);
    } else {
      assert.equal(fWpn.attackIntervalMs, rWpn.attackIntervalMs, `${frostId} interval must equal ${refId}`);
    }

    // Weight rule: Void weight + 0.5
    assert.equal(
      Number(fWpn.weight.toFixed(1)),
      Number((rWpn.weight + 0.5).toFixed(1)),
      `${frostId} weight (${fWpn.weight}) must equal ${refId} weight (${rWpn.weight}) + 0.5`
    );
  }
  console.log('✔ PASS: All 12 Frost weapons satisfy +20–30% DPS rule, handedness, intervals, and weight +0.5.\n');

  // =========================================================================
  // 3. INHERITANCE: levelBonus AND proficiencyId EQUAL BASE FAMILY'S
  // =========================================================================
  console.log("--- Test 3: Inheritance of levelBonus and proficiencyId ---");

  for (const [frostId, refId] of Object.entries(refMap)) {
    const fWpn = dataLoader.getWeapon(frostId)!;
    const rWpn = dataLoader.getWeapon(refId)!;

    assert.equal(fWpn.proficiencyId, rWpn.proficiencyId, `${frostId} proficiencyId must equal ${refId}`);
    assert.deepStrictEqual(fWpn.levelBonus, rWpn.levelBonus, `${frostId} levelBonus must equal ${refId}`);
  }

  // Shield inheritance
  const fShield = dataLoader.getWeapon('frost_shield')!;
  const rShield = dataLoader.getWeapon('void_shield')!;
  assert.equal(fShield.proficiencyId, rShield.proficiencyId);
  console.log("✔ PASS: Each Frost weapon correctly inherits its base family's levelBonus and proficiencyId.\n");

  // =========================================================================
  // 4. WEAPON FROSTBITE PROC: 10% ± 1% OVER 10,000 SEEDED HITS, CANONICAL DEF, NO PROC ON MISS
  // =========================================================================
  console.log('--- Test 4: Weapon Frostbite Proc (10% ± 1% over 10,000 seeded hits & Canonical Def) ---');

  {
    const mockScene = createMockPhaserScene(false);
    const grid = Array.from({ length: 30 }, () => Array(30).fill(0));
    const hero = new Player(mockScene, 10, 10, playerData, 'hero', false);
    const enemyDef = dataLoader.getEnemy('glacier_yeti')!;
    const dummyEnemy = new Enemy(mockScene, 10, 11, enemyDef, 'glacier_yeti-avatar', 32);

    const combat = new CombatSystem(mockScene, [hero], [dummyEnemy], new Pathfinder(grid));
    const frostWpn = dataLoader.getWeapon('frost_short_sword')!;
    hero.equippedWeapon = frostWpn;

    // Subtest 4A: 10,000 seeded hits
    combat.combatRng = makeSeededRng(8888);
    let frostbiteProcs = 0;
    combat.createFloatingText = (_x: number, _y: number, text: string) => {
      if (text === 'FROSTBITE!') frostbiteProcs++;
    };

    const origConsoleLog = console.log;
    console.log = () => {};

    const TOTAL_HITS = 10000;
    for (let i = 0; i < TOTAL_HITS; i++) {
      dummyEnemy.hp = 1000;
      dummyEnemy.clearStatusEffects();
      // Call checkAndApplyFrostbite directly
      (combat as any).checkAndApplyFrostbite(hero, dummyEnemy, frostWpn);
    }

    console.log = origConsoleLog;

    const procRate = frostbiteProcs / TOTAL_HITS;
    console.log(`  Seeded Hits: ${TOTAL_HITS} | Frostbite Procs: ${frostbiteProcs} | Rate: ${(procRate * 100).toFixed(2)}%`);
    assert.ok(
      procRate >= 0.09 && procRate <= 0.11,
      `Frostbite proc rate must be within 10% ± 1% [0.09, 0.11], got ${procRate.toFixed(4)}`
    );

    // Subtest 4B: Canonical definition equals statusEffects.json
    dummyEnemy.clearStatusEffects();
    // Force a proc
    combat.combatRng = () => 0.01; // roll < 0.10
    (combat as any).checkAndApplyFrostbite(hero, dummyEnemy, frostWpn);
    const appliedDef = dummyEnemy.activeStatusEffects.get('frostbite')?.def;
    const canonicalDef = dataLoader.getStatusEffect('frostbite');

    assert.ok(appliedDef, 'Frostbite status effect must be applied on proc');
    assert.ok(canonicalDef, 'frostbite must exist in statusEffects.json');
    assert.equal(appliedDef.id, canonicalDef.id);
    assert.equal(appliedDef.durationMs, canonicalDef.durationMs);
    assert.equal(appliedDef.tickIntervalMs, canonicalDef.tickIntervalMs);
    assert.equal(appliedDef.damagePerTick, canonicalDef.damagePerTick);
    assert.equal(appliedDef.moveSpeedMultiplier, canonicalDef.moveSpeedMultiplier);

    // Subtest 4C: No proc on a miss through executePlayerBasicAttack
    dummyEnemy.clearStatusEffects();
    let procsOnMiss = 0;
    combat.createFloatingText = (_x: number, _y: number, text: string) => {
      if (text === 'FROSTBITE!') procsOnMiss++;
    };

    console.log = () => {};
    for (let m = 0; m < 500; m++) {
      // Force effective accuracy to -1.0 so attack ALWAYS misses
      combat.executePlayerBasicAttack(hero, dummyEnemy, 1000, frostWpn, 0, 10, -1.0);
    }
    console.log = origConsoleLog;
    assert.equal(procsOnMiss, 0, 'Zero frostbite procs must occur on misses');
  }
  console.log('✔ PASS: Weapon frostbite proc lands at 10% ± 1% over 10k hits, applies canonical def, and never procs on miss.\n');

  // =========================================================================
  // 5. CRAFTING THROUGH CraftingSystem.applyCraft (Weapon, Armor, Top Piece)
  // =========================================================================
  console.log('--- Test 5: Crafting via CraftingSystem.applyCraft ---');

  const mockScene = createMockPhaserScene(true);
  const heroCrafter = new Player(mockScene, 100, 100, playerData, 'hero', false);
  heroCrafter.entityName = 'Guild Hero';

  // 5A: Craft Weapon - Frostbound Short Sword (req Lv 12 Blacksmithing, 110 exp)
  heroCrafter.progression.getProficiencyStat('blacksmithing').level = 12;
  heroCrafter.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  heroCrafter.inventory.clear();
  heroCrafter.addItem('ore', 8);
  heroCrafter.addItem('steel_scrap', 3);
  heroCrafter.addItem('glacial_essence', 1);

  const wpnCraft = CraftingSystem.applyCraft(heroCrafter, dataLoader.getBlacksmithRecipe('frost_short_sword')!, 'blacksmithing');
  assert.equal(wpnCraft.success, true, 'Frostbound Short Sword craft must succeed at Lv 12 Blacksmithing');
  assert.equal(wpnCraft.expGranted, 110, 'Grants 110 Blacksmithing EXP');
  assert.equal(heroCrafter.getItemCount('frost_short_sword'), 1, 'Crafts exactly 1 weapon');
  assert.equal(heroCrafter.getItemCount('ore'), 0, 'Ore consumed');
  assert.equal(heroCrafter.getItemCount('steel_scrap'), 0, 'Steel scrap consumed');
  assert.equal(heroCrafter.getItemCount('glacial_essence'), 0, 'Glacial essence consumed');

  // 5B: Craft Armor - Frostweave Robe (req Lv 12 Armorsmithing, 110 exp)
  heroCrafter.progression.getProficiencyStat('armorsmithing').level = 12;
  heroCrafter.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  heroCrafter.inventory.clear();
  heroCrafter.addItem('wolf_pelt', 3);
  heroCrafter.addItem('ectoplasm', 3);
  heroCrafter.addItem('glacial_essence', 2);

  const armCraft = CraftingSystem.applyCraft(heroCrafter, dataLoader.getArmorsmithRecipe('frost_robe')!, 'armorsmithing');
  assert.equal(armCraft.success, true, 'Frostweave Robe craft must succeed at Lv 12 Armorsmithing');
  assert.equal(armCraft.expGranted, 110, 'Grants 110 Armorsmithing EXP');
  assert.equal(heroCrafter.getItemCount('frost_robe'), 1, 'Crafts exactly 1 armor piece');

  // 5C: Craft Top Piece - Rimeforged Plate (req Lv 12 Armorsmithing, 120 exp)
  heroCrafter.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  heroCrafter.inventory.clear();
  heroCrafter.addItem('ore', 7);
  heroCrafter.addItem('steel_scrap', 4);
  heroCrafter.addItem('glacial_essence', 2);
  heroCrafter.addItem('rime_carapace', 1);

  // Unlock apprentice_armorer (level 10+) and set class level to grant gear instance bonus
  heroCrafter.progression.checkClassUnlocks();
  heroCrafter.progression.setClassLevel('apprentice_armorer', 3);

  const topCraft = CraftingSystem.applyCraft(heroCrafter, dataLoader.getArmorsmithRecipe('frost_plate_armor')!, 'armorsmithing');
  assert.equal(topCraft.success, true, 'Rimeforged Plate craft must succeed');
  assert.equal(topCraft.expGranted, 120, 'Top piece grants 120 Armorsmithing EXP');
  assert.equal(heroCrafter.getItemCount('frost_plate_armor'), 1, 'Crafts exactly 1 top piece');

  // Verify gear instance bonuses apply
  const instances = gameState.getAllGearInstances();
  assert.ok(instances.size >= 1, 'At least 1 gear instance created in GameState');
  assert.ok(topCraft.instanceId, 'Instance ID generated for crafted gear');
  const instance = gameState.getGearInstance(topCraft.instanceId);
  assert.ok(instance, 'Top piece instance recorded in GameState');
  assert.equal(instance.bonusPercent, 3, 'Instance bonus percent matches apprentice armorer level (3%)');
  console.log('✔ PASS: Crafting weapon, armor, and top piece crafts exactly 1 and records gear instances.\n');

  // =========================================================================
  // 6. SALVAGE OF ONE FROST ITEM REFUNDS 50% WITH HALF EXP
  // =========================================================================
  console.log('--- Test 6: Salvage of Frost Item (50% Refund, Half EXP) ---');

  heroCrafter.progression.getProficiencyStat('blacksmithing').level = 12;
  heroCrafter.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  heroCrafter.inventory.clear();
  heroCrafter.addItem('frost_short_sword', 1);

  const preOre = gameState.getItemCount('ore');
  const preSteel = gameState.getItemCount('steel_scrap');
  const preEssence = gameState.getItemCount('glacial_essence');

  // Salvage frost_short_sword (recipe: ore 8, steel_scrap 3, glacial_essence 1; 110 exp)
  const salvageResult = CraftingSystem.applySalvage(heroCrafter, 'frost_short_sword', { count: 1, source: heroCrafter });
  assert.equal(salvageResult.success, true, 'Salvage must succeed');
  assert.equal(salvageResult.expGranted, Math.ceil(110 * 0.5), 'Salvage grants half EXP (55 EXP)');
  assert.equal(heroCrafter.getItemCount('frost_short_sword'), 0, 'Item removed from inventory');

  // 50% refunds:
  // 8 ore * 0.5 = 4 ore
  const postOre = gameState.getItemCount('ore') - preOre;
  assert.equal(postOre, 4, 'Guaranteed 4 ore refunded (50% of 8)');

  // 3 steel_scrap * 0.5 = 1.5 -> floor(1.5) + (rng < 0.5 ? 1 : 0) -> 1 or 2
  const postSteel = gameState.getItemCount('steel_scrap') - preSteel;
  assert.ok(postSteel === 1 || postSteel === 2, `Steel refund must be 1 or 2, got ${postSteel}`);

  // 1 glacial_essence * 0.5 = 0.5 -> 0 or 1
  const postEssence = gameState.getItemCount('glacial_essence') - preEssence;
  assert.ok(postEssence === 0 || postEssence === 1, `Glacial essence refund must be 0 or 1, got ${postEssence}`);

  console.log('✔ PASS: Salvage of Frostbound Short Sword refunds 50% of ingredients with half EXP.\n');

  // =========================================================================
  // 7. ARMOR: "HEAVY DOESN'T DOMINATE" GUARD & HP MATCHES TIER/SLOT RULE
  // =========================================================================
  console.log('--- Test 7: Armor "Heavy Doesn\'t Dominate" Guard & HP Tier/Slot Progression ---');

  const trueArmors = armorsData.armors.filter((a) => a.tier === 'frost' && (a.slot === 'helmet' || a.slot === 'body'));

  for (const slot of ['helmet', 'body'] as ('helmet' | 'body')[]) {
    const pieces = trueArmors.filter((a) => a.slot === slot);
    assert.equal(pieces.length, 3, `Must have exactly 3 Frost pieces for slot ${slot} (light, medium, heavy)`);

    const light = pieces.find((p) => p.weightClass === 'light')!;
    const med = pieces.find((p) => p.weightClass === 'medium')!;
    const heavy = pieces.find((p) => p.weightClass === 'heavy')!;

    assert.ok(light && med && heavy, `All 3 weight classes must exist for slot ${slot}`);

    // Uniform HP in slot
    const expectedHp = slot === 'helmet' ? 90 : 150;
    assert.equal(light.hpBonus, expectedHp, `Light ${slot} HP must be ${expectedHp}`);
    assert.equal(med.hpBonus, expectedHp, `Medium ${slot} HP must be ${expectedHp}`);
    assert.equal(heavy.hpBonus, expectedHp, `Heavy ${slot} HP must be ${expectedHp}`);

    // Strictly rising armor rating: light < medium < heavy
    assert.ok(
      med.armorRating! > light.armorRating!,
      `Medium ${slot} rating (${med.armorRating}) must be > light (${light.armorRating})`
    );
    assert.ok(
      heavy.armorRating! > med.armorRating!,
      `Heavy ${slot} rating (${heavy.armorRating}) must be > medium (${med.armorRating})`
    );

    // Strictly rising weight: light < medium < heavy
    assert.ok(
      med.weight! > light.weight!,
      `Medium ${slot} weight (${med.weight}) must be > light (${light.weight})`
    );
    assert.ok(
      heavy.weight! > med.weight!,
      `Heavy ${slot} weight (${heavy.weight}) must be > medium (${med.weight})`
    );
  }

  // Tier HP ladder: starter 15/25 -> mid 30/50 -> void 60/100 -> frost 90/150
  const starterHelm = armorsData.armors.find((a) => a.tier === 'starter' && a.slot === 'helmet')!;
  const starterBody = armorsData.armors.find((a) => a.tier === 'starter' && a.slot === 'body')!;
  const midHelm = armorsData.armors.find((a) => a.tier === 'mid' && a.slot === 'helmet')!;
  const midBody = armorsData.armors.find((a) => a.tier === 'mid' && a.slot === 'body')!;
  const voidHelm = armorsData.armors.find((a) => a.tier === 'void' && a.slot === 'helmet')!;
  const voidBody = armorsData.armors.find((a) => a.tier === 'void' && a.slot === 'body')!;
  const frostHelm = armorsData.armors.find((a) => a.tier === 'frost' && a.slot === 'helmet')!;
  const frostBody = armorsData.armors.find((a) => a.tier === 'frost' && a.slot === 'body')!;

  assert.equal(starterHelm.hpBonus, 15);
  assert.equal(starterBody.hpBonus, 25);
  assert.equal(midHelm.hpBonus, 30);
  assert.equal(midBody.hpBonus, 50);
  assert.equal(voidHelm.hpBonus, 60);
  assert.equal(voidBody.hpBonus, 100);
  assert.equal(frostHelm.hpBonus, 90);
  assert.equal(frostBody.hpBonus, 150);

  console.log('✔ PASS: "Heavy doesn\'t dominate" verified; ratings/weights strictly rise and HP strictly scales 15/25 -> 30/50 -> 60/100 -> 90/150.\n');

  // =========================================================================
  // 8. SUPPLY LOG CHECK
  // =========================================================================
  console.log('--- Test 8: Supply Log Existence and Content ---');
  const supplyLogPath = path.join(rootDir, 'docs/evidence/frost_supply.log');
  assert.ok(fs.existsSync(supplyLogPath), 'docs/evidence/frost_supply.log must exist');
  const supplyLogContent = fs.readFileSync(supplyLogPath, 'utf8');
  assert.ok(supplyLogContent.length > 500, 'frost_supply.log must contain substantial report');
  assert.ok(supplyLogContent.includes('BAND 4 (GLACIAL CAVERNS F16–20) SUPPLY CHECK'), 'frost_supply.log header verified');
  assert.ok(supplyLogContent.includes('RUN 1: Baseline'), 'Run 1 verified in supply log');
  assert.ok(supplyLogContent.includes('RUN 2: Pre-Approved Supply Knob'), 'Run 2 verified in supply log');
  assert.ok(supplyLogContent.includes('GLACIAL SOVEREIGN TOP PIECES DROP RATES'), 'Glacial Sovereign rates verified in supply log');
  console.log('✔ PASS: frost_supply.log confirmed with floors-per-craft data and Sovereign drop rates.\n');

  console.log('🎉 ALL FROST GEAR TESTS PASSED PERFECTLY! 🎉');
}

runFrostGearTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
