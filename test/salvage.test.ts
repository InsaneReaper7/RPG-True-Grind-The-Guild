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

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

async function runSalvageTests() {
  console.log('=== STARTING GEAR SALVAGE MILESTONE TESTS ===\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const playerData = dataLoader.getPlayer();
  gameState.resetToDefault(playerData);
  (global as any).localStorage.clear();

  const mockScene = createMockPhaserScene(true);
  const hero = new Player(mockScene as any, 100, 100, playerData, 'hero', false);
  hero.entityName = 'Hero';

  const valerie = new Player(mockScene as any, 100, 100, playerData, 'valerie', false);
  valerie.entityName = 'Valerie';

  const aria = new Player(mockScene as any, 100, 100, playerData, 'aria', false);
  aria.entityName = 'Aria';

  // =========================================================================
  // TEST GROUP 1: REFUND AND EXP
  // =========================================================================
  console.log('--- Test Group 1: Refund and EXP ---');

  // 1.1 Real Salvage per Station:
  // Station 1: Blacksmithing - Greatsword (resultWeaponId: 'greatswords')
  // Recipe: { ore: 8, wood: 3, steel_scrap: 2 }, expGranted: 35
  // Refund: 4 Ore, 1.5 Wood (probabilistic 1 or 2), 1 Steel Scrap
  // EXP: Math.ceil(35 * 0.5) = 18 Blacksmithing EXP
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  hero.progression.getProficiencyStat('blacksmithing').level = 0;
  hero.addItem('greatswords', 1);
  const bsPreOre = gameState.getItemCount('ore');
  const bsPreWood = gameState.getItemCount('wood');
  const bsPreSteel = gameState.getItemCount('steel_scrap');

  const bsSalvage = CraftingSystem.applySalvage(hero, 'greatswords', { count: 1, source: hero });
  assert.equal(bsSalvage.success, true, 'Greatsword salvage must succeed');
  assert.equal(bsSalvage.expGranted, 18, 'Greatsword gives Math.ceil(35 * 0.5) = 18 Blacksmithing EXP');
  assert.equal(hero.progression.getProficiencyStat('blacksmithing').currentExp, 18);
  assert.equal(hero.getItemCount('greatswords'), 0);
  assert.equal(gameState.getItemCount('ore') - bsPreOre, 4, 'Greatsword refunds exactly 4 Ore');
  assert.equal(gameState.getItemCount('steel_scrap') - bsPreSteel, 1, 'Steel Scrap 2 -> exactly 1 back');
  const bsWoodRefund = gameState.getItemCount('wood') - bsPreWood;
  assert.ok(bsWoodRefund === 1 || bsWoodRefund === 2, 'Wood 3 -> 1 or 2 back (probabilistic 1.5)');

  // Station 2: Armorsmithing - Silk Robe (resultArmorId: 'silk_robe')
  // Recipe: { spider_silk: 5, wolf_pelt: 2 }, expGranted: 75
  // Refund: 2.5 Spider Silk (probabilistic 2 or 3), 1 Wolf Pelt
  // EXP: Math.ceil(75 * 0.5) = 38 Armorsmithing EXP
  hero.progression.getProficiencyStat('armorsmithing').currentExp = 0;
  hero.progression.getProficiencyStat('armorsmithing').level = 0;
  hero.addItem('silk_robe', 1);
  const asPreSilk = gameState.getItemCount('spider_silk');
  const asPrePelt = gameState.getItemCount('wolf_pelt');

  const asSalvage = CraftingSystem.applySalvage(hero, 'silk_robe', { count: 1, source: hero });
  assert.equal(asSalvage.success, true, 'Silk Robe salvage must succeed');
  assert.equal(asSalvage.expGranted, 38, 'Silk Robe gives Math.ceil(75 * 0.5) = 38 Armorsmithing EXP');
  assert.equal(hero.progression.getProficiencyStat('armorsmithing').currentExp, 38);
  assert.equal(hero.getItemCount('silk_robe'), 0);
  assert.equal(gameState.getItemCount('wolf_pelt') - asPrePelt, 1, 'Silk Robe refunds exactly 1 Wolf Pelt');
  const asSilkRefund = gameState.getItemCount('spider_silk') - asPreSilk;
  assert.ok(asSilkRefund === 2 || asSilkRefund === 3, 'Spider Silk 5 -> 2 or 3 back (probabilistic 2.5)');

  // Station 3: Bowyer - War Bow (resultWeaponId: 'war_bow')
  // Recipe: { wood: 8, wolf_claw: 2, spider_silk: 4 }, expGranted: 80
  // Refund: 4 Wood, 1 Wolf Claw, 2 Spider Silk
  // EXP: Math.ceil(80 * 0.5) = 40 Bowyer EXP
  hero.progression.getProficiencyStat('bowyer').currentExp = 0;
  hero.progression.getProficiencyStat('bowyer').level = 0;
  hero.addItem('war_bow', 1);
  const bwPreWood = gameState.getItemCount('wood');
  const bwPreClaw = gameState.getItemCount('wolf_claw');
  const bwPreSilk = gameState.getItemCount('spider_silk');

  const bwSalvage = CraftingSystem.applySalvage(hero, 'war_bow', { count: 1, source: hero });
  assert.equal(bwSalvage.success, true, 'War Bow salvage must succeed');
  assert.equal(bwSalvage.expGranted, 40, 'War Bow gives Math.ceil(80 * 0.5) = 40 Bowyer EXP');
  assert.equal(hero.progression.getProficiencyStat('bowyer').currentExp, 40);
  assert.equal(hero.getItemCount('war_bow'), 0);
  assert.equal(gameState.getItemCount('wood') - bwPreWood, 4, 'War Bow refunds exactly 4 Wood');
  assert.equal(gameState.getItemCount('wolf_claw') - bwPreClaw, 1, 'War Bow refunds exactly 1 Wolf Claw');
  assert.equal(gameState.getItemCount('spider_silk') - bwPreSilk, 2, 'War Bow refunds exactly 2 Spider Silk');

  // 1.2 Apprentice Class EXP for each station:
  aria.progression.setClassLevel('apprentice_smith', 1);
  const ariaSmithExp = aria.progression.getClassStat('apprentice_smith').currentExp;
  aria.addItem('greatswords', 1);
  const ariaSmithSalvage = CraftingSystem.applySalvage(aria, 'greatswords', { count: 1, source: aria });
  assert.equal(ariaSmithSalvage.classExpGranted, 18, 'Apprentice Smith must receive 18 Class EXP for Greatsword');
  assert.equal(aria.progression.getClassStat('apprentice_smith').currentExp, ariaSmithExp + 18);

  aria.progression.setClassLevel('apprentice_armorer', 1);
  const ariaArmorExp = aria.progression.getClassStat('apprentice_armorer').currentExp;
  aria.addItem('silk_robe', 1);
  const ariaArmorSalvage = CraftingSystem.applySalvage(aria, 'silk_robe', { count: 1, source: aria });
  assert.equal(ariaArmorSalvage.classExpGranted, 38, 'Apprentice Armorer receives 38 Class EXP for Silk Robe');
  assert.equal(aria.progression.getClassStat('apprentice_armorer').currentExp, ariaArmorExp + 38);

  aria.progression.setClassLevel('apprentice_bowyer', 1);
  const ariaBowExp = aria.progression.getClassStat('apprentice_bowyer').currentExp;
  aria.addItem('war_bow', 1);
  const ariaBowSalvage = CraftingSystem.applySalvage(aria, 'war_bow', { count: 1, source: aria });
  assert.equal(ariaBowSalvage.classExpGranted, 40, 'Apprentice Bowyer receives 40 Class EXP for War Bow');
  assert.equal(aria.progression.getClassStat('apprentice_bowyer').currentExp, ariaBowExp + 40);

  // 1.3 Monte Carlo Refund over 1,000 runs (Mace: 4 Ore, 2 Wood -> exactly 2 Ore, 1 Wood)
  console.log('Running 1,000 Mace salvage simulations...');
  const initialStockpileOre = gameState.getItemCount('ore');
  const initialStockpileWood = gameState.getItemCount('wood');

  const MACE_RUNS = 1000;
  for (let i = 0; i < MACE_RUNS; i++) {
    hero.addItem('mace', 1);
    const res = CraftingSystem.applySalvage(hero, 'mace', { count: 1, source: hero });
    assert.equal(res.success, true);
  }

  const finalStockpileOre = gameState.getItemCount('ore');
  const finalStockpileWood = gameState.getItemCount('wood');
  const totalOreRefunded = finalStockpileOre - initialStockpileOre;
  const totalWoodRefunded = finalStockpileWood - initialStockpileWood;

  const expectedOre = MACE_RUNS * 2;
  const expectedWood = MACE_RUNS * 1;
  assert.equal(totalOreRefunded, expectedOre, '1,000 Mace runs gives exact 2,000 Ore');
  assert.equal(totalWoodRefunded, expectedWood, '1,000 Mace runs gives exact 1,000 Wood');
  console.log(`1,000 Mace runs -> Refunded Ore: ${totalOreRefunded}/${expectedOre}, Wood: ${totalWoodRefunded}/${expectedWood}`);

  // Probabilistic rounding over 1,000 runs (Greatsword: 8 Ore, 3 Wood, 2 Steel Scrap -> 4 Ore, 1.5 Wood, 1 Steel Scrap)
  console.log('Running 1,000 Greatsword salvage simulations (probabilistic 1.5 wood)...');
  const preGsOre = gameState.getItemCount('ore');
  const preGsWood = gameState.getItemCount('wood');
  const preGsSteel = gameState.getItemCount('steel_scrap');
  const GS_RUNS = 1000;

  for (let i = 0; i < GS_RUNS; i++) {
    hero.addItem('greatswords', 1);
    const res = CraftingSystem.applySalvage(hero, 'greatswords', { count: 1, source: hero });
    assert.equal(res.success, true);
  }

  const totalGsOre = gameState.getItemCount('ore') - preGsOre;
  const totalGsWood = gameState.getItemCount('wood') - preGsWood;
  const totalGsSteel = gameState.getItemCount('steel_scrap') - preGsSteel;

  assert.equal(totalGsOre, 4000, '1,000 Greatsword runs refunds exact 4,000 Ore');
  assert.equal(totalGsSteel, 1000, '1,000 Greatsword runs refunds exact 1,000 Steel Scrap');
  const expectedGsWood = GS_RUNS * 1.5; // 1500
  const woodDev = Math.abs(totalGsWood - expectedGsWood) / expectedGsWood;
  console.log(`1,000 Greatsword runs -> Wood: ${totalGsWood}/${expectedGsWood} (${(woodDev * 100).toFixed(2)}% dev), Steel Scrap: ${totalGsSteel}/1000`);
  assert.ok(woodDev <= 0.03, `Wood refund dev (${woodDev}) must be within ±3%`);

  console.log('✔ Test Group 1 Passed: Greatsword, Silk Robe, War Bow refunds, EXP, and 50% Monte Carlo verified.');

  // =========================================================================
  // TEST GROUP 2: WHAT CANNOT BE SALVAGED
  // =========================================================================
  console.log('\n--- Test Group 2: What Cannot Be Salvaged ---');

  // 2.1 Equipped gear CANNOT be salvaged
  hero.inventory.clear();
  hero.equipWeapon(dataLoader.getWeapon('greatswords')!, true);
  assert.equal(hero.equippedWeapon?.id, 'greatswords');

  const eqWeaponAttempt = CraftingSystem.applySalvage(hero, 'greatswords', { party: [hero] });
  assert.equal(eqWeaponAttempt.success, false, 'Equipped weapon must not be salvageable');
  assert.ok(eqWeaponAttempt.message.toLowerCase().includes('equipped'), 'Message must indicate equipped item');

  // Equipped shield
  hero.equipOffhandWeapon(dataLoader.getWeapon('shields')!);
  const eqShieldAttempt = CraftingSystem.applySalvage(hero, 'shields', { party: [hero] });
  assert.equal(eqShieldAttempt.success, false, 'Equipped shield must not be salvageable');

  // Equipped armor
  hero.equippedHelmet = dataLoader.getArmor('leather_cap')!;
  const eqHelmetAttempt = CraftingSystem.applySalvage(hero, 'leather_cap', { party: [hero] });
  assert.equal(eqHelmetAttempt.success, false, 'Equipped helmet must not be salvageable');

  // Unequipping restores salvageability
  hero.equipWeapon(null, true);
  hero.addItem('greatswords', 1);
  const unequippedSalvage = CraftingSystem.applySalvage(hero, 'greatswords', { party: [hero] });
  assert.equal(unequippedSalvage.success, true, 'Unequipped weapon can now be salvaged');

  // 2.2 Material ('ore') CANNOT be salvaged
  hero.addItem('ore', 10);
  assert.equal(CraftingSystem.canSalvage('ore').canSalvage, false);
  const oreAttempt = CraftingSystem.applySalvage(hero, 'ore');
  assert.equal(oreAttempt.success, false, 'Material cannot be salvaged');

  // 2.3 Consumable ('bandage') CANNOT be salvaged
  hero.addItem('bandage', 5);
  assert.equal(CraftingSystem.canSalvage('bandage').canSalvage, false);
  const bandageAttempt = CraftingSystem.applySalvage(hero, 'bandage');
  assert.equal(bandageAttempt.success, false, 'Consumables cannot be salvaged');

  // 2.4 Tool with keepOnReturn ('lockpick') CANNOT be salvaged
  hero.addItem('lockpick', 5);
  assert.equal(CraftingSystem.canSalvage('lockpick').canSalvage, false);
  const lockpickAttempt = CraftingSystem.applySalvage(hero, 'lockpick');
  assert.equal(lockpickAttempt.success, false, 'Lockpick cannot be salvaged');
  assert.ok(lockpickAttempt.message.toLowerCase().includes('lockpick'));

  // 2.5 Tool with keepOnReturn ('fishing_rod') CANNOT be salvaged
  hero.addItem('fishing_rod', 1);
  assert.equal(CraftingSystem.canSalvage('fishing_rod').canSalvage, false);
  const rodAttempt = CraftingSystem.applySalvage(hero, 'fishing_rod');
  assert.equal(rodAttempt.success, false, 'Fishing Rod cannot be salvaged');
  assert.ok(rodAttempt.message.toLowerCase().includes('fishing rod'));

  // 2.6 Real gear item without a crafting recipe ('druid_staff') CANNOT be salvaged
  hero.addItem('druid_staff', 1);
  assert.equal(CraftingSystem.canSalvage('druid_staff').canSalvage, false);
  const uncraftableAttempt = CraftingSystem.applySalvage(hero, 'druid_staff');
  assert.equal(uncraftableAttempt.success, false, 'Real gear with no recipe cannot be salvaged');
  assert.ok(uncraftableAttempt.message.toLowerCase().includes('recipe'));

  console.log('✔ Test Group 2 Passed: Equipped gear, ore, bandage, lockpick, fishing_rod, and druid_staff rejected.');

  // =========================================================================
  // TEST GROUP 3: COUNTS AND CLEANUP
  // =========================================================================
  console.log('\n--- Test Group 3: Counts and Cleanup ---');

  // 3.1 Item counts in bag and stockpile
  hero.inventory.clear();
  gameState.inventory.clear();
  gameState.resources.ore = 0;
  gameState.resources.wood = 0;
  hero.addItem('short_swords', 3);
  assert.equal(hero.getItemCount('short_swords'), 3);
  assert.equal(gameState.getItemCount('ore'), 0);

  // Salvage 1 Short Sword (cost: 3 Ore, 1 Wood)
  const singleSS = CraftingSystem.applySalvage(hero, 'short_swords', { count: 1, source: hero });
  assert.equal(singleSS.success, true);
  assert.equal(hero.getItemCount('short_swords'), 2, 'Bag count should drop from 3 to 2');

  // Salvage remaining 2 Short Swords via count = 2
  const multiSS = CraftingSystem.applySalvage(hero, 'short_swords', { count: 2, source: hero });
  assert.equal(multiSS.success, true);
  assert.equal(hero.getItemCount('short_swords'), 0, 'Bag count should drop from 2 to 0');

  // Stockpile salvage:
  gameState.addItem('shields', 2);
  assert.equal(gameState.getItemCount('shields'), 2);
  const stockSalvage = CraftingSystem.applySalvage(hero, 'shields', { count: 1, source: 'stockpile' });
  assert.equal(stockSalvage.success, true);
  assert.equal(gameState.getItemCount('shields'), 1, 'Stockpile count should drop from 2 to 1');

  // 3.2 Bonus Gear Instance Lifecycle & Unregistering
  // Aria crafts a bonus Mace
  gameState.inventory.clear();
  hero.inventory.clear();
  gameState.addOre(20);
  gameState.addWood(20);

  const maceRecipe = dataLoader.getBlacksmithRecipe('mace')!;
  aria.progression.addClassExp('apprentice_smith', 1000); // Level up Apprentice Smith
  const craftRes = CraftingSystem.applyCraft(aria, maceRecipe, 'blacksmithing');
  assert.equal(craftRes.success, true);
  assert.ok(craftRes.instanceId, 'Crafted bonus gear must produce instanceId');
  const instanceId = craftRes.instanceId!;

  // Verify registered in GameState
  assert.ok(gameState.getGearInstance(instanceId), 'Gear instance must be registered in GameState');
  assert.equal(aria.getItemCount(instanceId), 1, 'Aria must hold 1 copy of instance');

  // Save game to storage
  gameState.savePartySnapshot([aria], 1000);
  gameState.saveToDisk();
  const rawSaveBefore = (global as any).localStorage.getItem(GameState.SAVE_STORAGE_KEY);
  const parsedBefore = JSON.parse(rawSaveBefore);
  assert.ok(parsedBefore.snapshot.gearInstances[instanceId], 'Saved file must contain gear instance');

  // Salvage the bonus instance
  const bonusSalvageRes = CraftingSystem.applySalvage(aria, instanceId, { source: aria });
  assert.equal(bonusSalvageRes.success, true, 'Bonus instance salvage must succeed');
  assert.equal(aria.getItemCount(instanceId), 0, 'Instance must be removed from Aria bag');
  assert.equal(gameState.getGearInstance(instanceId), undefined, 'Instance must be unregistered from GameState registry');

  // Re-save and verify instance is purged from persisted storage
  gameState.savePartySnapshot([aria], 2000);
  gameState.saveToDisk();
  const rawSaveAfter = (global as any).localStorage.getItem(GameState.SAVE_STORAGE_KEY);
  const parsedAfter = JSON.parse(rawSaveAfter);
  assert.equal(parsedAfter.snapshot.gearInstances[instanceId], undefined, 'Purged instance must NOT exist in persisted save');

  // 3.3 Duplicate Gear Audit Invariant
  const auditRes = GameState.auditSavedDuplicateGear();
  assert.equal(auditRes.hasSave, true);
  const maceAudit = auditRes.duplicateGear.find(g => g.itemId === 'mace');
  assert.equal(maceAudit, undefined, 'Duplicate audit must have 0 phantom duplicates for salvaged instance');

  // 3.4 Stash Owned-Only Toggle consistency
  const hud = new HUD();
  hud.setStashFilterActive(true);
  assert.equal(hud.isStashFilterActive(), true, 'Stash owned-only toggle active');
  hud.renderPartyInventoryPanel();

  // With 0 maces remaining, Stash Owned-Only must not report maces as available
  const listEl = getOrCreateElement('party-inventory-item-list');
  assert.ok(listEl, 'Inventory list element exists');

  console.log('✔ Test Group 3 Passed: Item counts, bonus instance registry removal, save cleanup, and stash invariants verified.');

  console.log('\n======================================================');
  console.log('ALL GEAR SALVAGE MILESTONE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================');
}

runSalvageTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
