import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before any Phaser modules are loaded
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

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.innerHTMLSetCount++;
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

  public setAttribute(name: string, value: string) {
    this._attributes[name] = value;
  }
  public getAttribute(name: string): string | null {
    return this._attributes[name] ?? null;
  }
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
  public querySelector(_selector: string): any {
    return null;
  }
  public querySelectorAll(_selector: string): any[] {
    return [];
  }
  public getContext() {
    return dummyCtx;
  }
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
  querySelector: (sel: string) => {
    if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
    return null;
  },
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

async function runTests() {
  console.log('=== Starting Gear Ladder Milestone Crafting & Salvaging Test Suite ===\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const playerData = dataLoader.getPlayer();
  gameState.resetToDefault(playerData);
  (global as any).localStorage.clear();

  const mockScene = createMockPhaserScene(true);
  const hero = new Player(mockScene as any, 100, 100, playerData, 'hero', false);
  hero.entityName = 'Hero';

  // =========================================================================
  // TEST GROUP 1: BLACKSMITHING (BAND 2 STEEL & BAND 3 VOID)
  // =========================================================================
  console.log('--- Test Group 1: Blacksmithing Craft & Salvage ---');

  // 1.1 Band 2: Steel Longsword (Recipe: 6 ore, 2 wood, 2 steel_scrap | req Lvl 5, 50 exp)
  hero.progression.getProficiencyStat('blacksmithing').level = 5;
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  hero.inventory.clear();

  hero.addItem('ore', 6);
  hero.addItem('wood', 2);
  hero.addItem('steel_scrap', 2);

  const b2Craft = CraftingSystem.applyCraft(hero, dataLoader.getBlacksmithRecipe('steel_longsword')!, 'blacksmithing');
  assert.equal(b2Craft.success, true, 'Steel Longsword craft must succeed at Lv 5 Blacksmithing');
  assert.equal(b2Craft.expGranted, 50, 'Grants 50 Blacksmithing EXP');
  assert.equal(hero.getItemCount('steel_longsword'), 1, 'Hero receives 1 Steel Longsword');
  assert.equal(hero.getItemCount('ore'), 0, 'Ore consumed');
  assert.equal(hero.getItemCount('steel_scrap'), 0, 'Steel scrap consumed');

  // Salvage Steel Longsword
  const b2PreOre = gameState.getItemCount('ore');
  const b2PreWood = gameState.getItemCount('wood');
  const b2PreSteel = gameState.getItemCount('steel_scrap');
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;

  const b2Salvage = CraftingSystem.applySalvage(hero, 'steel_longsword', { count: 1, source: hero });
  assert.equal(b2Salvage.success, true, 'Steel Longsword salvage must succeed');
  assert.equal(b2Salvage.expGranted, 25, 'Salvage grants Math.ceil(50 * 0.5) = 25 Blacksmithing EXP');
  assert.equal(hero.getItemCount('steel_longsword'), 0, 'Weapon removed from inventory');
  assert.equal(gameState.getItemCount('ore') - b2PreOre, 3, 'Refunds 3 ore (50% of 6)');
  assert.equal(gameState.getItemCount('wood') - b2PreWood, 1, 'Refunds 1 wood (50% of 2)');
  assert.equal(gameState.getItemCount('steel_scrap') - b2PreSteel, 1, 'Refunds 1 steel scrap (50% of 2)');
  console.log('✔ Blacksmithing Band 2 (Steel Longsword) craft and salvage verified.');

  // 1.2 Band 3: Voidforged Longsword (Recipe: 8 ore, 2 steel_scrap, 1 void_plate | req Lvl 8, 80 exp)
  hero.progression.getProficiencyStat('blacksmithing').level = 8;
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  hero.addItem('ore', 8);
  hero.addItem('steel_scrap', 2);
  hero.addItem('void_plate', 1);

  const b3Craft = CraftingSystem.applyCraft(hero, dataLoader.getBlacksmithRecipe('void_longsword')!, 'blacksmithing');
  assert.equal(b3Craft.success, true, 'Voidforged Longsword craft must succeed at Lv 8 Blacksmithing');
  assert.equal(b3Craft.expGranted, 80, 'Grants 80 Blacksmithing EXP');
  assert.equal(hero.getItemCount('void_longsword'), 1, 'Hero receives 1 Voidforged Longsword');
  assert.equal(hero.getItemCount('void_plate'), 0, 'Void plate consumed');

  // Salvage Voidforged Longsword
  const b3PreOre = gameState.getItemCount('ore');
  const b3PreSteel = gameState.getItemCount('steel_scrap');
  const b3PreVoid = gameState.getItemCount('void_plate');
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;

  const b3Salvage = CraftingSystem.applySalvage(hero, 'void_longsword', { count: 1, source: hero });
  assert.equal(b3Salvage.success, true, 'Voidforged Longsword salvage must succeed');
  assert.equal(b3Salvage.expGranted, 40, 'Salvage grants Math.ceil(80 * 0.5) = 40 Blacksmithing EXP');
  assert.equal(hero.getItemCount('void_longsword'), 0, 'Weapon removed');
  assert.equal(gameState.getItemCount('ore') - b3PreOre, 4, 'Refunds 4 ore (50% of 8)');
  assert.equal(gameState.getItemCount('steel_scrap') - b3PreSteel, 1, 'Refunds 1 steel scrap (50% of 2)');
  const voidRefund = gameState.getItemCount('void_plate') - b3PreVoid;
  assert.ok(voidRefund === 0 || voidRefund === 1, 'Probabilistic void_plate refund (0.5)');
  console.log('✔ Blacksmithing Band 3 (Voidforged Longsword) craft and salvage verified.');

  // =========================================================================
  // TEST GROUP 2: BOWYER (BAND 2 REINFORCED STAFF & BAND 3 VOID STAFF)
  // =========================================================================
  console.log('\n--- Test Group 2: Bowyer Craft & Salvage ---');

  // 2.1 Band 2: Reinforced Staff (Recipe: 6 wood, 2 bone, 2 steel_scrap | req Lvl 5, 50 exp)
  hero.progression.getProficiencyStat('bowyer').level = 5;
  hero.progression.getProficiencyStat('bowyer').currentExp = 0;
  hero.addItem('wood', 6);
  hero.addItem('bone', 2);
  hero.addItem('steel_scrap', 2);

  const bowyerB2Craft = CraftingSystem.applyCraft(hero, dataLoader.getBowyerRecipe('reinforced_staff')!, 'bowyer');
  assert.equal(bowyerB2Craft.success, true, 'Reinforced Staff craft must succeed at Lv 5 Bowyer');
  assert.equal(bowyerB2Craft.expGranted, 50, 'Grants 50 Bowyer EXP');
  assert.equal(hero.getItemCount('reinforced_staff'), 1);

  // Salvage Reinforced Staff
  const byPreWood = gameState.getItemCount('wood');
  const byPreBone = gameState.getItemCount('bone');
  const byPreSteel = gameState.getItemCount('steel_scrap');

  const bowyerB2Salvage = CraftingSystem.applySalvage(hero, 'reinforced_staff', { count: 1, source: hero });
  assert.equal(bowyerB2Salvage.success, true, 'Reinforced Staff salvage must succeed');
  assert.equal(bowyerB2Salvage.expGranted, 25, 'Salvage grants 25 Bowyer EXP');
  assert.equal(hero.getItemCount('reinforced_staff'), 0);
  assert.equal(gameState.getItemCount('wood') - byPreWood, 3, 'Refunds 3 wood (50% of 6)');
  assert.equal(gameState.getItemCount('bone') - byPreBone, 1, 'Refunds 1 bone (50% of 2)');
  assert.equal(gameState.getItemCount('steel_scrap') - byPreSteel, 1, 'Refunds 1 steel scrap (50% of 2)');
  console.log('✔ Bowyer Band 2 (Reinforced Staff) craft and salvage verified.');

  // 2.2 Band 3: Voidforged Staff (Recipe: 8 wood, 2 steel_scrap, 1 void_plate | req Lvl 8, 80 exp)
  hero.progression.getProficiencyStat('bowyer').level = 8;
  hero.progression.getProficiencyStat('bowyer').currentExp = 0;
  hero.addItem('wood', 8);
  hero.addItem('steel_scrap', 2);
  hero.addItem('void_plate', 1);

  const bowyerB3Craft = CraftingSystem.applyCraft(hero, dataLoader.getBowyerRecipe('void_staff')!, 'bowyer');
  assert.equal(bowyerB3Craft.success, true, 'Voidforged Staff craft must succeed at Lv 8 Bowyer');
  assert.equal(bowyerB3Craft.expGranted, 80, 'Grants 80 Bowyer EXP');
  assert.equal(hero.getItemCount('void_staff'), 1);

  // Salvage Voidforged Staff
  const by3PreWood = gameState.getItemCount('wood');
  const by3PreSteel = gameState.getItemCount('steel_scrap');
  const by3PreVoid = gameState.getItemCount('void_plate');

  const bowyerB3Salvage = CraftingSystem.applySalvage(hero, 'void_staff', { count: 1, source: hero });
  assert.equal(bowyerB3Salvage.success, true, 'Voidforged Staff salvage must succeed');
  assert.equal(bowyerB3Salvage.expGranted, 40, 'Salvage grants 40 Bowyer EXP');
  assert.equal(hero.getItemCount('void_staff'), 0);
  assert.equal(gameState.getItemCount('wood') - by3PreWood, 4, 'Refunds 4 wood (50% of 8)');
  assert.equal(gameState.getItemCount('steel_scrap') - by3PreSteel, 1, 'Refunds 1 steel scrap (50% of 2)');
  const byVoidRefund = gameState.getItemCount('void_plate') - by3PreVoid;
  assert.ok(byVoidRefund === 0 || byVoidRefund === 1, 'Probabilistic void_plate refund');
  console.log('✔ Bowyer Band 3 (Voidforged Staff) craft and salvage verified.');

  // =========================================================================
  // TEST GROUP 3: ARMORSMITHING (BAND 3 VOID GEAR & ACCESSORIES)
  // =========================================================================
  console.log('\n--- Test Group 3: Armorsmithing Craft & Salvage ---');

  // 3.1 Voidforged Greathelm (Recipe: 1 void_plate, 2 steel_scrap, 4 ore | req Lvl 8, 80 exp)
  hero.progression.getProficiencyStat('armorsmithing').level = 8;
  hero.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  hero.addItem('void_plate', 1);
  hero.addItem('steel_scrap', 2);
  hero.addItem('ore', 4);

  const helmCraft = CraftingSystem.applyCraft(hero, dataLoader.getArmorsmithRecipe('void_greathelm')!, 'armorsmithing');
  assert.equal(helmCraft.success, true, 'Voidforged Greathelm craft must succeed');
  assert.equal(helmCraft.expGranted, 80, 'Grants 80 Armorsmithing EXP');
  assert.equal(hero.getItemCount('void_greathelm'), 1);

  // Salvage Voidforged Greathelm
  const asPreOre = gameState.getItemCount('ore');
  const asPreSteel = gameState.getItemCount('steel_scrap');
  const asPreVoid = gameState.getItemCount('void_plate');

  const helmSalvage = CraftingSystem.applySalvage(hero, 'void_greathelm', { count: 1, source: hero });
  assert.equal(helmSalvage.success, true);
  assert.equal(helmSalvage.expGranted, 40);
  assert.equal(hero.getItemCount('void_greathelm'), 0);
  assert.equal(gameState.getItemCount('ore') - asPreOre, 2, 'Refunds 2 ore (50% of 4)');
  assert.equal(gameState.getItemCount('steel_scrap') - asPreSteel, 1, 'Refunds 1 steel scrap (50% of 2)');
  const helmVoidRefund = gameState.getItemCount('void_plate') - asPreVoid;
  assert.ok(helmVoidRefund === 0 || helmVoidRefund === 1);
  console.log('✔ Armorsmithing Band 3 (Voidforged Greathelm) craft and salvage verified.');

  // 3.2 Voidforged Plate Armor (Recipe: 2 void_plate, 3 steel_scrap, 6 ore | req Lvl 8, 90 exp)
  hero.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  hero.addItem('void_plate', 2);
  hero.addItem('steel_scrap', 3);
  hero.addItem('ore', 6);

  const plateCraft = CraftingSystem.applyCraft(hero, dataLoader.getArmorsmithRecipe('void_plate_armor')!, 'armorsmithing');
  assert.equal(plateCraft.success, true, 'Voidforged Plate Armor craft must succeed');
  assert.equal(plateCraft.expGranted, 90, 'Grants 90 Armorsmithing EXP');
  assert.equal(hero.getItemCount('void_plate_armor'), 1);

  // Salvage Voidforged Plate Armor (2 void plate -> guaranteed 1 void plate refund!)
  const asPlatePreOre = gameState.getItemCount('ore');
  const asPlatePreSteel = gameState.getItemCount('steel_scrap');
  const asPlatePreVoid = gameState.getItemCount('void_plate');

  const plateSalvage = CraftingSystem.applySalvage(hero, 'void_plate_armor', { count: 1, source: hero });
  assert.equal(plateSalvage.success, true);
  assert.equal(plateSalvage.expGranted, 45, 'Grants 45 Armorsmithing EXP');
  assert.equal(hero.getItemCount('void_plate_armor'), 0);
  assert.equal(gameState.getItemCount('ore') - asPlatePreOre, 3, 'Refunds 3 ore (50% of 6)');
  assert.equal(gameState.getItemCount('void_plate') - asPlatePreVoid, 1, 'Guaranteed 1 void plate refund (50% of 2)');
  const plateSteelRefund = gameState.getItemCount('steel_scrap') - asPlatePreSteel;
  assert.ok(plateSteelRefund === 1 || plateSteelRefund === 2, 'Probabilistic steel scrap refund (1.5)');
  console.log('✔ Armorsmithing Band 3 (Voidforged Plate Armor) craft and salvage verified.');

  // 3.3 Voidforged Relic (Recipe: 1 void_core, 1 void_essence, 2 spider_silk | req Lvl 8, 95 exp)
  hero.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  hero.addItem('void_core', 1);
  hero.addItem('void_essence', 1);
  hero.addItem('spider_silk', 2);

  const relicCraft = CraftingSystem.applyCraft(hero, dataLoader.getArmorsmithRecipe('void_relic')!, 'armorsmithing');
  assert.equal(relicCraft.success, true, 'Voidforged Relic craft must succeed');
  assert.equal(relicCraft.expGranted, 95, 'Grants 95 Armorsmithing EXP');
  assert.equal(hero.getItemCount('void_relic'), 1);

  const asRelicPreSilk = gameState.getItemCount('spider_silk');
  const relicToSalvage = relicCraft.instanceId || 'void_relic';
  const relicSalvage = CraftingSystem.applySalvage(hero, relicToSalvage, { count: 1, source: hero });
  assert.equal(relicSalvage.success, true);
  assert.equal(relicSalvage.expGranted, 48, 'Grants Math.ceil(95 * 0.5) = 48 Armorsmithing EXP');
  assert.equal(hero.getItemCount('void_relic'), 0);
  assert.equal(gameState.getItemCount('spider_silk') - asRelicPreSilk, 1, 'Refunds 1 spider silk (50% of 2)');
  console.log('✔ Armorsmithing Band 3 (Voidforged Relic) craft and salvage verified.');

  // =========================================================================
  // TEST GROUP 4: HEAVY ARMOR PROFICIENCY & STAT APPLICATION
  // =========================================================================
  console.log('\n--- Test Group 4: Heavy Armor Stat Application & Proficiency ---');

  const greathelmDef = dataLoader.getArmor('void_greathelm');
  const plateDef = dataLoader.getArmor('void_plate_armor');
  assert.ok(greathelmDef);
  assert.ok(plateDef);
  assert.equal(greathelmDef.weightClass, 'heavy', 'Greathelm is heavy armor');
  assert.equal(plateDef.weightClass, 'heavy', 'Plate armor is heavy armor');

  const baseMainHp = hero.maxHp;
  const baseCritHp = hero.maxCriticalHp;
  hero.equipHelmet(greathelmDef, true);
  hero.equipBodyArmor(plateDef, true);

  assert.equal(hero.equippedHelmet?.id, 'void_greathelm');
  assert.equal(hero.equippedBodyArmor?.id, 'void_plate_armor');
  assert.equal(hero.maxHp, baseMainHp + 30 + 50, 'Max Main HP includes +30 from helm and +50 from plate (50/50 split)');
  assert.equal(hero.maxCriticalHp, baseCritHp + 30 + 50, 'Max Critical HP includes +30 from helm and +50 from plate (50/50 split)');

  // Verify heavy armor proficiency triggers on taking hit
  const heavyProfBefore = hero.progression.getProficiencyStat('heavy_armor').currentExp;
  hero.awardArmorWearExp('hit');
  const heavyProfAfter = hero.progression.getProficiencyStat('heavy_armor').currentExp;
  assert.ok(heavyProfAfter > heavyProfBefore, 'Heavy armor proficiency gained EXP when hit while wearing heavy armor');
  console.log('✔ Heavy armor stat application and proficiency EXP verified.');

  console.log('\n🎉 ALL GEAR LADDER MILESTONE TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
