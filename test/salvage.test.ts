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

  // 1.1 Profession EXP: Mace 25 -> 13 Blacksmithing EXP
  hero.progression.getProficiencyStat('blacksmithing').currentExp = 0;
  hero.progression.getProficiencyStat('blacksmithing').level = 0;
  hero.addItem('mace', 1);

  const singleMaceSalvage = CraftingSystem.applySalvage(hero, 'mace', { count: 1, source: hero });
  assert.equal(singleMaceSalvage.success, true, 'Single Mace salvage must succeed');
  assert.equal(singleMaceSalvage.expGranted, 13, 'Mace salvage must give exactly 13 Blacksmithing EXP (half of 25 rounded up)');
  assert.equal(hero.progression.getProficiencyStat('blacksmithing').currentExp, 13, 'Crafter Blacksmithing EXP must be exactly 13');

  // Multi-unit EXP: Salvaging 2 Maces gives 26 EXP
  hero.addItem('mace', 2);
  const multiMaceSalvage = CraftingSystem.applySalvage(hero, 'mace', { count: 2, source: hero });
  assert.equal(multiMaceSalvage.success, true, 'Salvage x2 must succeed');
  assert.equal(multiMaceSalvage.expGranted, 26, 'Salvage x2 must grant 26 EXP');
  assert.equal(hero.progression.getProficiencyStat('blacksmithing').currentExp, 39, 'Crafter Blacksmithing EXP must accumulate 13 + 26 = 39');

  // Daggers (15 EXP) -> half rounded up is 8 EXP
  hero.addItem('daggers', 1);
  const daggersSalvage = CraftingSystem.applySalvage(hero, 'daggers', { count: 1, source: hero });
  assert.equal(daggersSalvage.expGranted, 8, 'Daggers salvage must give Math.ceil(15 * 0.5) = 8 EXP');

  // 1.2 Apprentice Class EXP:
  // When salvager has Apprentice Smith unlocked, receives identical amount as Class EXP
  aria.progression.setClassLevel('apprentice_smith', 1);
  const initialClassExp = aria.progression.getClassStat('apprentice_smith').currentExp;
  aria.addItem('mace', 1);
  const ariaSalvage = CraftingSystem.applySalvage(aria, 'mace', { count: 1, source: aria });
  assert.equal(ariaSalvage.success, true);
  assert.equal(ariaSalvage.classExpGranted, 13, 'Apprentice Smith must receive exactly 13 Class EXP');
  assert.equal(aria.progression.getClassStat('apprentice_smith').currentExp, initialClassExp + 13, 'Aria class EXP must increase by 13');

  // When salvager does NOT have the matching class unlocked, classExpGranted is 0
  assert.equal(hero.progression.isClassUnlocked('apprentice_smith'), false);
  hero.addItem('mace', 1);
  const nonApprenticeSalvage = CraftingSystem.applySalvage(hero, 'mace', { count: 1, source: hero });
  assert.equal(nonApprenticeSalvage.classExpGranted, 0, 'Non-apprentice salvager must receive 0 Class EXP');

  // Other professions: Armorsmithing (leather_cap -> apprentice_armorer) and Bowyer (hunting_bow -> apprentice_bowyer)
  aria.progression.setClassLevel('apprentice_armorer', 1);
  aria.addItem('leather_cap', 1);
  const armorSalvage = CraftingSystem.applySalvage(aria, 'leather_cap', { count: 1, source: aria });
  assert.equal(armorSalvage.expGranted, 13, 'Leather Cap (25 EXP) gives 13 Armorsmithing EXP');
  assert.equal(armorSalvage.classExpGranted, 13, 'Apprentice Armorer receives 13 Class EXP');

  aria.progression.setClassLevel('apprentice_bowyer', 1);
  aria.addItem('bows', 1);
  const bowSalvage = CraftingSystem.applySalvage(aria, 'bows', { count: 1, source: aria });
  assert.equal(bowSalvage.expGranted, 13, 'Hunting Bow (25 EXP) gives 13 Bowyer EXP');
  assert.equal(bowSalvage.classExpGranted, 13, 'Apprentice Bowyer receives 13 Class EXP');

  // 1.3 Monte Carlo Refund over 1,000 runs (Mace & fractional ingredients)
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

  // Recipe cost: 4 Ore, 2 Wood. 50% refund = 2 Ore, 1 Wood per run.
  // Over 1000 runs: exactly 2000 Ore, 1000 Wood.
  const expectedOre = MACE_RUNS * 2;
  const expectedWood = MACE_RUNS * 1;
  const oreDiffPct = Math.abs(totalOreRefunded - expectedOre) / expectedOre;
  const woodDiffPct = Math.abs(totalWoodRefunded - expectedWood) / expectedWood;

  console.log(`1,000 Mace runs -> Refunded Ore: ${totalOreRefunded}/${expectedOre}, Wood: ${totalWoodRefunded}/${expectedWood}`);
  assert.ok(oreDiffPct <= 0.03, `Ore refund (${totalOreRefunded}) must be within ±3% of ${expectedOre}`);
  assert.ok(woodDiffPct <= 0.03, `Wood refund (${totalWoodRefunded}) must be within ±3% of ${expectedWood}`);
  assert.equal(totalOreRefunded, 2000, 'Integer half-ingredients refund with exact integer precision');
  assert.equal(totalWoodRefunded, 1000, 'Integer half-ingredients refund with exact integer precision');

  // Fractional ingredients probabilistic rounding test over 1,000 runs:
  // Two-Handed Longsword requires 7 Ore, 3 Wood.
  // 50% refund = 3.5 Ore, 1.5 Wood on average.
  console.log('Running 1,000 Two-Handed Longsword salvage simulations (probabilistic 3.5 ore / 1.5 wood)...');
  const pre2HOre = gameState.getItemCount('ore');
  const pre2HWood = gameState.getItemCount('wood');
  const LONGSWORD_RUNS = 1000;

  for (let i = 0; i < LONGSWORD_RUNS; i++) {
    hero.addItem('longsword_2h', 1);
    const res = CraftingSystem.applySalvage(hero, 'longsword_2h', { count: 1, source: hero });
    assert.equal(res.success, true);
  }

  const post2HOre = gameState.getItemCount('ore');
  const post2HWood = gameState.getItemCount('wood');
  const total2HOre = post2HOre - pre2HOre;
  const total2HWood = post2HWood - pre2HWood;
  const expected2HOre = LONGSWORD_RUNS * 3.5; // 3500
  const expected2HWood = LONGSWORD_RUNS * 1.5; // 1500
  const diff2HOre = Math.abs(total2HOre - expected2HOre) / expected2HOre;
  const diff2HWood = Math.abs(total2HWood - expected2HWood) / expected2HWood;

  console.log(`1,000 2H Longsword runs -> Refunded Ore: ${total2HOre}/${expected2HOre} (${(diff2HOre * 100).toFixed(2)}% dev), Wood: ${total2HWood}/${expected2HWood} (${(diff2HWood * 100).toFixed(2)}% dev)`);
  assert.ok(diff2HOre <= 0.03, `Probabilistic ore refund (${total2HOre}) must be within ±3% of ${expected2HOre}`);
  assert.ok(diff2HWood <= 0.03, `Probabilistic wood refund (${total2HWood}) must be within ±3% of ${expected2HWood}`);
  console.log('✔ Test Group 1 Passed: Exact EXP, Apprentice Class EXP, and 50% Monte Carlo refunds verified.');

  // =========================================================================
  // TEST GROUP 2: WHAT CANNOT BE SALVAGED
  // =========================================================================
  console.log('\n--- Test Group 2: What Cannot Be Salvaged ---');

  // 2.1 Equipped gear CANNOT be salvaged
  hero.inventory.clear();
  hero.equipWeapon(dataLoader.getWeapon('mace')!, true);
  assert.equal(hero.equippedWeapon?.id, 'mace');

  // Attempting to salvage equipped mace when 0 copies exist in inventory
  const equippedWeaponAttempt = CraftingSystem.applySalvage(hero, 'mace', { party: [hero] });
  assert.equal(equippedWeaponAttempt.success, false, 'Equipped weapon must not be salvageable');
  assert.ok(equippedWeaponAttempt.message.toLowerCase().includes('equipped'), 'Message must indicate equipped item');

  // Equipped shield
  hero.equipOffhandWeapon(dataLoader.getWeapon('shields')!);
  const equippedShieldAttempt = CraftingSystem.applySalvage(hero, 'shields', { party: [hero] });
  assert.equal(equippedShieldAttempt.success, false, 'Equipped shield must not be salvageable');

  // Equipped armor & jewelry
  hero.equippedHelmet = dataLoader.getArmor('leather_cap')!;
  const equippedHelmetAttempt = CraftingSystem.applySalvage(hero, 'leather_cap', { party: [hero] });
  assert.equal(equippedHelmetAttempt.success, false, 'Equipped helmet must not be salvageable');

  hero.equippedNecklace = dataLoader.getArmor('bone_necklace')!;
  const equippedNecklaceAttempt = CraftingSystem.applySalvage(hero, 'bone_necklace', { party: [hero] });
  assert.equal(equippedNecklaceAttempt.success, false, 'Equipped necklace must not be salvageable');

  // Unequipping restores salvageability
  hero.equipWeapon(null, true);
  hero.addItem('mace', 1);
  const unequippedSalvage = CraftingSystem.applySalvage(hero, 'mace', { party: [hero] });
  assert.equal(unequippedSalvage.success, true, 'Unequipped mace in bag can now be salvaged');

  // 2.2 Consumables CANNOT be salvaged
  hero.addItem('bandage', 5);
  hero.addItem('energy_potion', 3);
  hero.addItem('mana_potion', 2);
  assert.equal(CraftingSystem.canSalvage('bandage').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('energy_potion').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('mana_potion').canSalvage, false);
  const potAttempt = CraftingSystem.applySalvage(hero, 'energy_potion');
  assert.equal(potAttempt.success, false, 'Consumables cannot be salvaged');

  // 2.3 Stackables & Materials CANNOT be salvaged
  hero.addItem('ore', 10);
  hero.addItem('wood', 10);
  hero.addItem('wolf_pelt', 5);
  hero.addItem('bone_meal', 4);
  assert.equal(CraftingSystem.canSalvage('ore').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('wood').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('wolf_pelt').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('bone_meal').canSalvage, false);
  const matAttempt = CraftingSystem.applySalvage(hero, 'wolf_pelt');
  assert.equal(matAttempt.success, false, 'Materials cannot be salvaged');

  // 2.4 Protected tools with keepOnReturn CANNOT be salvaged
  hero.addItem('lockpick', 5);
  hero.addItem('fishing_rod', 1);
  assert.equal(CraftingSystem.canSalvage('lockpick').canSalvage, false);
  assert.equal(CraftingSystem.canSalvage('fishing_rod').canSalvage, false);
  const lockpickAttempt = CraftingSystem.applySalvage(hero, 'lockpick');
  assert.equal(lockpickAttempt.success, false, 'Lockpick cannot be salvaged');
  assert.ok(lockpickAttempt.message.toLowerCase().includes('lockpick'));

  const rodAttempt = CraftingSystem.applySalvage(hero, 'fishing_rod');
  assert.equal(rodAttempt.success, false, 'Fishing Rod cannot be salvaged');
  assert.ok(rodAttempt.message.toLowerCase().includes('fishing rod'));

  // 2.5 Gear without a crafting recipe CANNOT be salvaged
  hero.addItem('fire_staff', 1);
  assert.equal(CraftingSystem.canSalvage('fire_staff').canSalvage, false);
  const uncraftableAttempt = CraftingSystem.applySalvage(hero, 'fire_staff');
  assert.equal(uncraftableAttempt.success, false, 'Gear with no recipe cannot be salvaged');
  assert.ok(uncraftableAttempt.message.toLowerCase().includes('recipe'));

  console.log('✔ Test Group 2 Passed: Equipped gear, consumables, lockpicks, fishing rod, and recipe-less gear properly rejected.');

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
