import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// In-memory mock localStorage implementation
class MockLocalStorage implements Storage {
  private store: Map<string, string> = new Map();
  public shouldFail: boolean = false;
  public failureError: string = 'QuotaExceededError: Dom storage limit exceeded';

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    if (this.shouldFail) {
      throw new Error(this.failureError);
    }
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  removeItem(key: string): void {
    if (this.shouldFail) {
      throw new Error(this.failureError);
    }
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail) {
      throw new Error(this.failureError);
    }
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockLocalStorage();

// Setup minimal browser globals for Phaser / DOM tests under Node
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    localStorage: mockStorage
  };
} else {
  (global as any).window.localStorage = mockStorage;
}
(global as any).localStorage = mockStorage;

// Setup mock DOM for HUD testing
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, any> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...classes: string[]) => classes.forEach(c => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach(c => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public onclick: any = null;
  public onchange: any = null;
  public oninput: any = null;
  public disabled: boolean = false;
  public title: string = '';
  public innerHTML: string = '';
  public innerText: string = '';
  public value: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }
}

const domRegistry = new Map<string, MockElement>();
function getOrCreateElement(id: string, tag: string = 'div'): MockElement {
  if (!domRegistry.has(id)) {
    const el = new MockElement(tag);
    el.id = id;
    domRegistry.set(id, el);
  }
  return domRegistry.get(id)!;
}

(global as any).document = {
  getElementById: (id: string) => {
    return getOrCreateElement(id);
  },
  querySelector: (_selector: string) => null,
  querySelectorAll: (_selector: string) => [],
  createElement: (tag: string) => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { HUD } from '../src/ui/HUD.ts';
import type { CharacterSnapshot, PlayerSnapshot } from '../src/types/game.ts';

async function runTestSuite() {
  console.log('--- Starting Persistent Saves Milestone Test Suite ---\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  gameState.resetToDefault(dataLoader.getPlayer());
  mockStorage.clear();
  mockStorage.shouldFail = false;

  // =========================================================================
  // TEST 1: Save Detection on Clean Profile
  // =========================================================================
  console.log('Test 1: Save Detection on Clean Profile');
  {
    mockStorage.clear();
    assert.equal(gameState.hasSave(), false, 'hasSave() must be false on clean profile');
    assert.equal(gameState.getSaveMetadata(), null, 'getSaveMetadata() must be null on clean profile');
    assert.equal(gameState.isStorageAvailable(), true, 'isStorageAvailable() must be true when storage works');
    console.log('✓ Clean profile correctly reports no existing save and functional storage.');
  }

  // =========================================================================
  // TEST 2: Player-Visible Response to Save Failure
  // =========================================================================
  console.log('\nTest 2: Player-Visible Response to Save Failure');
  {
    let callbackTriggered = false;
    let receivedErrorMessage = '';

    gameState.onSaveFailedCallback = (errMsg: string) => {
      callbackTriggered = true;
      receivedErrorMessage = errMsg;
    };

    // Simulate quota exceeded / storage disabled
    mockStorage.shouldFail = true;
    mockStorage.failureError = 'QuotaExceededError: Dom storage limit exceeded';

    const saveSuccess = gameState.saveToDisk();
    assert.equal(saveSuccess, false, 'saveToDisk() must return false when storage fails');
    assert.equal(callbackTriggered, true, 'onSaveFailedCallback must be triggered when save fails');
    assert.ok(receivedErrorMessage.includes('QuotaExceededError'), 'Error message must reflect the storage failure reason');
    assert.ok(gameState.getLastSaveError()?.includes('QuotaExceededError'), 'lastSaveError must record the storage failure reason');

    // Verify HUD notification hook
    const hud = new HUD();
    const saveFailureBadge = getOrCreateElement('save-failure-badge');
    // Trigger failure again to verify HUD reacts
    gameState.saveToDisk();
    assert.equal(saveFailureBadge.style.display, 'block', '#save-failure-badge must become visible on save failure');

    // Restore working storage
    mockStorage.shouldFail = false;
    gameState.onSaveFailedCallback = undefined;
    saveFailureBadge.style.display = 'none';
    console.log('✓ Save failure reliably triggers HUD error notification and displays persistent warning badge.');
  }

  // =========================================================================
  // TEST 3: Full Fidelity Check — Deep Serialization & Restoration
  // =========================================================================
  console.log('\nTest 3: Full Fidelity Check — Deep Serialization & Restoration');
  {
    mockStorage.clear();
    gameState.resetToDefault(dataLoader.getPlayer());

    // 1. Setup rich Outpost State
    gameState.setWood(450);
    gameState.setOre(120);
    gameState.addResearchPoints(35);
    gameState.unlockBuildable('planting_plot');
    gameState.unlockBuildable('seed_maker');
    gameState.unlockBuildable('alchemy_station');
    gameState.completeResearch('research_gardening');
    gameState.completeResearch('research_skinning');
    gameState.completeResearch('research_butchering');

    // Clock & Floor markers
    const expectedDay = 4;
    const expectedDayProgressMs = 27500;
    const expectedLifetimeFloorCount = 12;

    gameState.advanceGameDay(3); // Now Day 4
    gameState.setDayProgressMs(expectedDayProgressMs);
    gameState.setDungeonFloorCount(0); // Safely at Outpost
    gameState.setLifetimeDungeonFloorCount(expectedLifetimeFloorCount);

    // Knowledge Base discoveries
    gameState.discoverCookingRecipe('hearty_stew');
    gameState.discoverCookingRecipe('travelers_bread');
    gameState.discoverAlchemyRecipe('mana_potion');
    gameState.recordEnemyEncountered('goblin');
    gameState.recordEnemyEncountered('wolf');
    gameState.discoverProficiency('short_swords');
    gameState.discoverProficiency('dual_wielding');
    gameState.discoverProficiency('iron_back');
    gameState.discoverStatusEffect('bleed');
    gameState.discoverStatusEffect('poison');
    gameState.discoverGatheringNode('woodcutting_tree');
    gameState.discoverGatheringNode('foraging_bush');
    gameState.recordBookLearnedSkill('power_strike');

    // Stockpile items & food
    gameState.addItem('wood', 50);
    gameState.addItem('ore', 30);
    gameState.addItem('monster_meat', 5);
    gameState.addItem('wild_herbs', 10);
    gameState.addFoodItem('ration', 3, 'common');
    gameState.addFoodItem('hearty_stew', 2, 'rare');

    // Outpost Buildables
    gameState.addPlacedBuildable({ id: 'floor', x: 2, y: 2, rotation: 0, costPaid: 2 });
    gameState.addPlacedBuildable({ id: 'wall', x: 2, y: 1, rotation: 0, costPaid: 5 });
    gameState.addPlacedBuildable({
      id: 'planting_plot',
      x: 5,
      y: 6,
      rotation: 0,
      costPaid: 10,
      gardeningData: {
        state: 'growing',
        plantedCropId: 'seeds',
        plantedAtDay: 3,
        plantedAtDayProgress: 0.45,
        growthDays: 1
      }
    });
    gameState.addPlacedBuildable({
      id: 'seed_maker',
      x: 8,
      y: 9,
      rotation: 90,
      costPaid: 20,
      seedMakerData: {
        state: 'processing',
        startedTimeMs: 1234567,
        durationMs: 10000,
        inputItem: 'vegetable',
        outputItem: 'seeds',
        outputCount: 2
      }
    });

    // Party Roster: 4 members with distinct personal inventories and gear
    const leaderSnap: CharacterSnapshot = {
      id: 'hero',
      name: 'Guild Master Leo',
      avatarKey: 'player-avatar',
      hp: 150,
      criticalHp: 50,
      energy: 100,
      equippedWeaponId: 'short_swords',
      offhandWeaponId: 'daggers',
      equippedHelmetId: 'iron_helmet',
      equippedBodyArmorId: 'leather_armor',
      equippedNecklaceId: 'iron_necklace',
      equippedRingId: 'copper_ring',
      equippedAccessoryId: 'venom_charm',
      knownSkillIds: ['slash', 'thrust', 'power_strike'],
      equippedSkillIds: ['slash', 'thrust'],
      autocastMap: { slash: true, thrust: false },
      skillCooldownsRemainingMs: { slash: 500 },
      proficiencies: {
        short_swords: { level: 25, currentExp: 35 },
        daggers: { level: 15, currentExp: 10 },
        dual_wielding: { level: 10, currentExp: 5 }
      },
      classLevels: { fencer: 10, vanguard: 5 },
      unlockedClasses: ['fencer', 'vanguard'],
      activeClass: 'vanguard',
      bookLearnedSkills: ['power_strike'],
      hunger: 92,
      mood: 85,
      state: 'idle',
      inventory: { ration: 2, wild_herbs: 4 }
    };

    const comp1Snap: CharacterSnapshot = {
      id: 'comp_valerie',
      name: 'Valerie',
      avatarKey: 'companion-avatar',
      hp: 120,
      criticalHp: 40,
      energy: 90,
      equippedWeaponId: 'bows',
      offhandWeaponId: null,
      knownSkillIds: ['shoot', 'aimed_shot'],
      equippedSkillIds: ['shoot'],
      autocastMap: { shoot: true },
      proficiencies: { bows: { level: 20, currentExp: 15 } },
      classLevels: { marksman: 8 },
      unlockedClasses: ['marksman'],
      activeClass: 'marksman',
      hunger: 80,
      mood: 75,
      state: 'idle',
      inventory: { bandage: 3 }
    };

    const comp2Snap: CharacterSnapshot = {
      id: 'comp_barris',
      name: 'Barris',
      avatarKey: 'companion-avatar',
      hp: 180,
      criticalHp: 60,
      energy: 70,
      equippedWeaponId: 'mace',
      offhandWeaponId: 'shields',
      equippedHelmetId: 'iron_helmet',
      knownSkillIds: ['smash', 'block'],
      equippedSkillIds: ['smash'],
      autocastMap: { smash: true },
      proficiencies: { mace: { level: 18, currentExp: 22 }, shields: { level: 14, currentExp: 5 } },
      classLevels: { guardian: 7 },
      unlockedClasses: ['guardian'],
      activeClass: 'guardian',
      hunger: 95,
      mood: 90,
      state: 'idle',
      inventory: { ore: 12 }
    };

    const comp3Snap: CharacterSnapshot = {
      id: 'comp_selene',
      name: 'Selene',
      avatarKey: 'companion-avatar',
      hp: 0,
      criticalHp: 0,
      energy: 0,
      equippedWeaponId: 'fire_staff',
      offhandWeaponId: null,
      knownSkillIds: ['fireball'],
      equippedSkillIds: ['fireball'],
      autocastMap: { fireball: true },
      proficiencies: { staff: { level: 12, currentExp: 5 }, fire_magic: { level: 15, currentExp: 8 } },
      classLevels: { pyromancer: 6 },
      unlockedClasses: ['pyromancer'],
      activeClass: 'pyromancer',
      hunger: 60,
      mood: 40,
      state: 'downed', // Downed state survives
      inventory: { energy_potion: 1 }
    };

    // Store in GameState snapshots
    (gameState as any).partySnapshots = [leaderSnap, comp1Snap, comp2Snap, comp3Snap];

    // 2. Persist to storage
    const saveOk = gameState.saveToDisk();
    assert.equal(saveOk, true, 'saveToDisk() must succeed');
    assert.equal(gameState.hasSave(), true, 'hasSave() must report true after saving');

    // Verify metadata
    const meta = gameState.getSaveMetadata();
    assert.ok(meta, 'Save metadata must exist');
    assert.equal(meta.leaderName, 'Guild Master Leo');
    assert.equal(meta.gameDay, 4);
    assert.equal(meta.partySize, 4);
    assert.equal(meta.researchPoints, 46);
    assert.equal(meta.wood, 500);

    // 3. Clear in-memory singleton to simulate fresh process
    gameState.resetToDefault(dataLoader.getPlayer());

    // Confirm in-memory state is wiped
    assert.equal(gameState.getCurrentGameDay(), 1);
    assert.equal(gameState.getWood(), 1000);
    assert.equal(gameState.getResearchPoints(), 0);
    assert.equal(gameState.getPartySnapshots().length, 2);

    // 4. Load from storage
    const loadOk = gameState.loadFromDisk();
    assert.equal(loadOk, true, 'loadFromDisk() must succeed');

    // 5. NAMED FIDELITY ASSERTIONS
    assert.equal(
      gameState.getLifetimeDungeonFloorCount(),
      expectedLifetimeFloorCount,
      'lifetimeDungeonFloorCount must survive save/load cycle'
    );
    assert.equal(
      gameState.getDayProgressMs(),
      expectedDayProgressMs,
      'dayProgressMs must survive save/load cycle'
    );

    // 6. Detailed assertions across all domains
    assert.equal(gameState.getCurrentGameDay(), 4, 'Current game day must survive');
    assert.equal(gameState.getWood(), 500, 'Wood count must survive');
    assert.equal(gameState.getOre(), 150, 'Ore count must survive');
    assert.equal(gameState.getResearchPoints(), 46, 'Research points must survive');

    // Research Tree
    assert.ok(gameState.isBuildableUnlocked('planting_plot'), 'Unlocked buildables must survive');
    assert.ok(gameState.isBuildableUnlocked('seed_maker'), 'Seed maker unlock must survive');
    assert.ok(gameState.isResearchCompleted('research_gardening'), 'Completed research IDs must survive');
    assert.ok(gameState.isResearchCompleted('research_skinning'), 'Completed research IDs must survive');
    assert.ok(gameState.isResearchCompleted('research_butchering'), 'Completed research IDs must survive');

    // Knowledge Base
    assert.ok(gameState.isCookingRecipeDiscovered('hearty_stew'), 'Discovered cooking recipes must survive');
    assert.ok(gameState.isCookingRecipeDiscovered('travelers_bread'), 'Discovered cooking recipes must survive');
    assert.ok(gameState.isAlchemyRecipeDiscovered('mana_potion'), 'Discovered alchemy recipes must survive');
    assert.ok(gameState.isEnemyEncountered('goblin'), 'Encountered enemies must survive');
    assert.ok(gameState.isEnemyEncountered('wolf'), 'Encountered enemies must survive');
    assert.ok(gameState.isProficiencyDiscovered('short_swords'), 'Proficiency discoveries must survive');
    assert.ok(gameState.isProficiencyDiscovered('dual_wielding'), 'Proficiency discoveries must survive');
    assert.ok(gameState.isProficiencyDiscovered('iron_back'), 'Iron Back proficiency must survive');
    assert.ok(gameState.isStatusEffectDiscovered('bleed'), 'Status effect discoveries must survive');
    assert.ok(gameState.isGatheringNodeDiscovered('woodcutting_tree'), 'Gathering node discoveries must survive');
    assert.ok(gameState.isSkillBookLearned('power_strike'), 'Book-learned skills must survive');

    // Outpost Buildables & Gardening/Seed Maker
    const placed = gameState.getPlacedBuildables();
    assert.equal(placed.length, 4, 'All placed buildables must survive');
    const plot = gameState.getPlot(5, 6);
    assert.ok(plot && plot.gardeningData, 'Planting plot gardening data must survive');
    assert.equal(plot.gardeningData.state, 'growing');
    assert.equal(plot.gardeningData.plantedCropId, 'seeds');
    assert.equal(plot.gardeningData.plantedAtDay, 3);
    assert.equal(plot.gardeningData.plantedAtDayProgress, 0.45);

    const sm = gameState.getSeedMaker(8, 9);
    assert.ok(sm && sm.seedMakerData, 'Seed maker data must survive');
    assert.equal(sm.seedMakerData.state, 'processing');
    assert.equal(sm.seedMakerData.inputItem, 'vegetable');
    assert.equal(sm.seedMakerData.outputItem, 'seeds');
    assert.equal(sm.seedMakerData.outputCount, 2);

    // Party Roster & Personal Inventories
    const restoredParty = gameState.getPartySnapshots();
    assert.equal(restoredParty.length, 4, 'All 4 party members must survive');

    const hero = restoredParty[0];
    assert.equal(hero.name, 'Guild Master Leo');
    assert.equal(hero.activeClass, 'vanguard');
    assert.equal(hero.proficiencies.short_swords.level, 25);
    assert.equal(hero.proficiencies.short_swords.currentExp, 35);
    assert.equal(hero.equippedWeaponId, 'short_swords');
    assert.equal(hero.offhandWeaponId, 'daggers');
    assert.equal(hero.equippedHelmetId, 'iron_helmet');
    assert.equal(hero.equippedAccessoryId, 'venom_charm');
    assert.equal(hero.inventory?.ration, 2, 'Hero personal inventory must survive');
    assert.equal(hero.inventory?.wild_herbs, 4, 'Hero personal inventory must survive');

    const selene = restoredParty[3];
    assert.equal(selene.name, 'Selene');
    assert.equal(selene.state, 'downed', 'Downed member state must survive');
    assert.equal(selene.inventory?.energy_potion, 1, 'Companion personal inventory must survive');

    console.log('✓ Full fidelity verified: lifetimeDungeonFloorCount and dayProgressMs survive alongside party roster, gear, personal inventories, research tree, knowledge base, stockpile, and farming/seed maker states.');
  }

  // =========================================================================
  // TEST 4: Boot Title Screen UI States (Continue vs New Game)
  // =========================================================================
  console.log('\nTest 4: Boot Title Screen UI States (Continue vs New Game)');
  {
    const hud = new HUD();
    const continueBtn = getOrCreateElement('title-continue-btn', 'button') as HTMLButtonElement;
    const newGameBtn = getOrCreateElement('title-new-game-btn', 'button') as HTMLButtonElement;
    const summaryCard = getOrCreateElement('title-save-summary');
    const storageWarning = getOrCreateElement('title-storage-warning');

    // Case A: Save exists
    assert.equal(gameState.hasSave(), true);
    hud.initTitleScreen();
    assert.equal(continueBtn.disabled, false, 'Continue button must be enabled when a save exists');
    assert.ok(summaryCard.innerHTML.includes('Guild Outpost Checkpoint Found'), 'Summary card must show checkpoint found');
    assert.ok(summaryCard.innerHTML.includes('Guild Master Leo'), 'Summary card must name the party leader');
    assert.ok(summaryCard.innerHTML.includes('Day 4'), 'Summary card must show the game day');
    assert.equal(storageWarning.style.display, 'none', 'Storage warning must be hidden when storage is healthy');

    // Case B: Clean profile (no save exists)
    mockStorage.clear();
    assert.equal(gameState.hasSave(), false);
    hud.initTitleScreen();
    assert.equal(continueBtn.disabled, true, 'Continue button must be disabled on a fresh profile');
    assert.ok(summaryCard.innerHTML.includes('No Saved Game Found'), 'Summary card must show No Saved Game Found');
    console.log('✓ Title screen modal correctly dynamically configures Continue vs New Game across save states.');
  }

  // =========================================================================
  // TEST 5: Manual Reset Save
  // =========================================================================
  console.log('\nTest 5: Manual Reset Save');
  {
    // Re-save something
    gameState.saveToDisk();
    assert.equal(gameState.hasSave(), true);

    const hud = new HUD();
    const continueBtn = getOrCreateElement('title-continue-btn', 'button') as HTMLButtonElement;

    // Execute reset save
    hud.handleResetSave();
    assert.equal(gameState.hasSave(), false, 'Save must be wiped after handleResetSave()');
    assert.equal(gameState.getSaveMetadata(), null, 'Metadata must be null after reset');
    assert.equal(continueBtn.disabled, true, 'Continue button must become disabled after reset');
    console.log('✓ Manual Reset Save cleanly purges storage and updates UI state.');
  }

  // =========================================================================
  // TEST 6: Checkpoint Auto-Save Triggers in Outpost
  // =========================================================================
  console.log('\nTest 6: Checkpoint Auto-Save Triggers in Outpost');
  {
    mockStorage.clear();
    gameState.resetToDefault(dataLoader.getPlayer());
    gameState.setSafeZone(true); // Inside Outpost safe zone
    assert.equal(gameState.hasSave(), false);

    // Initial snapshot setup
    (gameState as any).snapshot = {
      resources: { wood: 100 },
      placedBuildables: [],
      party: [{ id: 'hero', name: 'Leader' }]
    };

    // Placing a buildable in safe zone automatically persists
    gameState.addPlacedBuildable({ id: 'floor', x: 1, y: 1, rotation: 0, costPaid: 2 });
    assert.equal(gameState.hasSave(), true, 'addPlacedBuildable in safe zone must auto-persist to storage');

    // Completing research in safe zone automatically persists
    gameState.completeResearch('research_gardening');
    assert.ok(gameState.isResearchCompleted('research_gardening'));

    // Loading from disk must reflect the auto-checkpoint
    const loadedState = GameState.getInstance();
    loadedState.loadFromDisk();
    assert.ok(loadedState.isResearchCompleted('research_gardening'), 'Auto-checkpointed research must persist in storage');
    assert.equal(loadedState.getPlacedBuildables().length, 1, 'Auto-checkpointed buildable must persist in storage');

    console.log('✓ Outpost operations automatically checkpoint to storage as safe-zone state evolves.');
  }

  console.log('\n=========================================');
  console.log('All Persistent Saves Milestone tests passed!');
  console.log('=========================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
