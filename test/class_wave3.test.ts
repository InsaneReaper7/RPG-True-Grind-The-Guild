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

// Setup minimal browser globals for Phaser import under Node
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
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: noop,
      removeChild: noop,
      addEventListener: noop,
      querySelectorAll: () => []
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
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

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { CraftingSystem } from '../src/systems/CraftingSystem.ts';
import { LockpickingSystem } from '../src/systems/LockpickingSystem.ts';
import { isCraftingClass } from '../src/utils/gearResolver.ts';

function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    removeFromUpdateList: function () { return this; },
    addedToScene: function () { return this; },
    on: function (evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
      return this;
    },
    once: function (evt: string, fn: Function) {
      const wrapper = (...args: any[]) => {
        this.off(evt, wrapper);
        fn(...args);
      };
      return this.on(evt, wrapper);
    },
    off: function (evt: string, fn: Function) {
      const list = listeners.get(evt);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
      return this;
    },
    emit: function (evt: string, ...args: any[]) {
      const fns = (listeners.get(evt) || []).slice();
      for (const fn of fns) fn(...args);
      return true;
    }
  };
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    depth: 0,
    alpha: 1,
    texture: { key: 'avatar' },
    setOrigin: function () { return this; },
    setScale: function () { return this; },
    setDepth: function () { return this; },
    setAlpha: function () { return this; },
    setVisible: function () { return this; },
    setTexture: function () { return this; },
    setAngle: function () { return this; },
    setInteractive: function () { return this; },
    disableInteractive: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    setText: function () { return this; },
    setColor: function () { return this; },
    setOrigin: function () { return this; },
    setDepth: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    fillStyle: function () { return this; },
    fillRect: function () { return this; },
    lineStyle: function () { return this; },
    strokeRect: function () { return this; },
    fillCircle: function () { return this; },
    strokeCircle: function () { return this; },
    fillEllipse: function () { return this; },
    strokeEllipse: function () { return this; },
    clear: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockScene(): any {
  const noop = () => {};
  const mockScene: any = {
    sys: {
      settings: { data: {} },
      queueDepthSort: noop,
      displayList: { queueDepthSort: noop },
      updateList: { add: noop, remove: noop },
      events: { once: noop, on: noop, off: noop, emit: noop },
      input: { enable: noop, disable: noop }
    },
    time: { now: 1000, delayedCall: (_ms: number, cb: Function) => cb() },
    add: {
      existing: noop,
      sprite: createMockSprite,
      text: createMockText,
      graphics: createMockGraphics,
      container: (x: number = 0, y: number = 0) => {
        const emitter = createMockEventEmitter();
        const children: any[] = [];
        return {
          ...emitter,
          x,
          y,
          children,
          setDepth: function () { return this; },
          add: function (...items: any[]) {
            children.push(...items);
            return this;
          },
          destroy: function () {
            children.length = 0;
          }
        };
      }
    },
    tweens: { add: () => ({ stop: () => {} }) },
    events: { emit: noop, on: noop, once: noop },
    scene: { start: noop },
    cameras: { main: { stopFollow: noop } },
    input: { mouse: { disableContextMenu: noop }, keyboard: { addKey: () => ({ on: noop, reset: noop }) } },
    hud: {
      showToast: noop,
      updateInventory: noop,
      setLocation: noop,
      destroy: noop,
      setBuildCallbacks: noop,
      setPartyLeaderChangeHandler: noop
    },
    createFloatingText: noop,
    tileSize: 32
  };
  return mockScene;
}

async function runTests() {
  console.log('=== Wave 3: Utility Classes Validation (Excavator, Angler, Locksmith) ===\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const classesData = dataLoader.getClassesData();
  const mockPlayerData = {
    name: 'Guild Hero',
    startingWeaponId: 'short_swords',
    baseStats: { hp: 50, criticalHp: 25, energy: 100 }
  };
  gameState.initFromPlayerData(mockPlayerData);

  const mockWeapon = dataLoader.getWeapon('short_swords')!;
  const mockScene = createMockScene();

  const progHero = new ProgressionSystem(classesData, 'Guild Hero');
  const hero = new Player(mockScene, 0, 0, mockPlayerData, mockWeapon, 32, 'player-avatar', progHero);
  hero.id = 'hero';
  hero.entityName = 'Guild Hero';

  const progValerie = new ProgressionSystem(classesData, 'Valerie');
  const valerie = new Player(mockScene, 1, 0, mockPlayerData, mockWeapon, 32, 'companion-avatar', progValerie);
  valerie.id = 'valerie';
  valerie.entityName = 'Valerie';

  // -------------------------------------------------------------------------
  // Test 1: Data Categorization and Combat System Exclusion
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Data Categorization and Combat System Exclusion ---');

  const excavatorDef = dataLoader.getClass('excavator');
  const anglerDef = dataLoader.getClass('angler');
  const locksmithDef = dataLoader.getClass('locksmith');

  assert.ok(excavatorDef, 'Excavator class exists in classes.json');
  assert.ok(anglerDef, 'Angler class exists in classes.json');
  assert.ok(locksmithDef, 'Locksmith class exists in classes.json');

  assert.equal(excavatorDef?.category, 'crafting', 'Excavator must have category: crafting');
  assert.equal(anglerDef?.category, 'crafting', 'Angler must have category: crafting');
  assert.equal(locksmithDef?.category, 'crafting', 'Locksmith must have category: crafting');

  assert.equal(isCraftingClass('excavator'), true, 'isCraftingClass("excavator") must be true');
  assert.equal(isCraftingClass('angler'), true, 'isCraftingClass("angler") must be true');
  assert.equal(isCraftingClass('locksmith'), true, 'isCraftingClass("locksmith") must be true');

  // Verify Player.setActiveClass blocks utility/crafting classes
  hero.activeClass = null;
  hero.setActiveClass('excavator');
  assert.equal(hero.activeClass, null, 'Cannot set activeClass to excavator');
  hero.setActiveClass('angler');
  assert.equal(hero.activeClass, null, 'Cannot set activeClass to angler');
  hero.setActiveClass('locksmith');
  assert.equal(hero.activeClass, null, 'Cannot set activeClass to locksmith');

  // Locksmith keeps existing hiddenSkillBonuses
  assert.deepEqual(locksmithDef?.hiddenSkillBonuses, { evasion: 0.05 }, 'Locksmith must retain hiddenSkillBonuses { evasion: 0.05 }');

  console.log('✔ Excavator, Angler, and Locksmith categorized as crafting and blocked from activeClass.');

  // -------------------------------------------------------------------------
  // Test 2: Perk Helper Calculation & Text Across Levels (0, 10, 40)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 2: Perk Helper Calculation & Text (0, 10, 40) ---');

  const testProg = new ProgressionSystem(classesData, 'Test Hero');

  // At Lv 0 (locked): no perk
  const excavatorLocked = CraftingSystem.getCrafterPerks(testProg, 'digging');
  assert.equal(excavatorLocked.classLevel, 0);
  assert.equal(excavatorLocked.bonusYieldChance, 0);
  assert.equal(excavatorLocked.perkPercent, 0);
  assert.equal(excavatorLocked.perkDescription, undefined);

  const anglerLocked = CraftingSystem.getCrafterPerks(testProg, 'fishing');
  assert.equal(anglerLocked.classLevel, 0);
  assert.equal(anglerLocked.bonusYieldChance, 0);
  assert.equal(anglerLocked.perkDescription, undefined);

  const locksmithLocked = CraftingSystem.getCrafterPerks(testProg, 'lockpicking');
  assert.equal(locksmithLocked.classLevel, 0);
  assert.equal(locksmithLocked.savePickChance, 0);
  assert.equal(locksmithLocked.perkDescription, undefined);

  // Sibling helper parity
  const gatherPerkSibling = CraftingSystem.getGatherPerks(testProg, 'digging');
  assert.deepEqual(gatherPerkSibling, excavatorLocked, 'getGatherPerks must return identical result to getCrafterPerks');

  // Unlock classes and test Lv 10
  (testProg as any).unlockedClasses.add('excavator');
  testProg.getClassStat('excavator').level = 10;
  (testProg as any).unlockedClasses.add('angler');
  testProg.getClassStat('angler').level = 10;
  (testProg as any).unlockedClasses.add('locksmith');
  testProg.getClassStat('locksmith').level = 10;

  const excavatorLv10 = CraftingSystem.getCrafterPerks(testProg, 'digging');
  assert.equal(excavatorLv10.classLevel, 10);
  assert.equal(excavatorLv10.bonusYieldChance, 10, 'Excavator Lv 10 gives 10% bonus yield');
  assert.equal(excavatorLv10.perkDescription, 'Excavator Lv 10: +10% bonus yield');

  const anglerLv10 = CraftingSystem.getCrafterPerks(testProg, 'fishing');
  assert.equal(anglerLv10.classLevel, 10);
  assert.equal(anglerLv10.bonusYieldChance, 10, 'Angler Lv 10 gives 10% bonus yield');
  assert.equal(anglerLv10.perkDescription, 'Angler Lv 10: +10% bonus yield');

  const locksmithLv10 = CraftingSystem.getCrafterPerks(testProg, 'lockpicking');
  assert.equal(locksmithLv10.classLevel, 10);
  assert.equal(locksmithLv10.savePickChance, 10, 'Locksmith Lv 10 gives 10% save pick chance');
  assert.equal(locksmithLv10.perkDescription, 'Locksmith Lv 10: 10% chance to save a lockpick on a failed roll');

  // Test Lv 7 text requirement from prompt
  testProg.getClassStat('excavator').level = 7;
  assert.equal(CraftingSystem.getCrafterPerks(testProg, 'digging').perkDescription, 'Excavator Lv 7: +7% bonus yield');
  testProg.getClassStat('angler').level = 7;
  assert.equal(CraftingSystem.getCrafterPerks(testProg, 'fishing').perkDescription, 'Angler Lv 7: +7% bonus yield');
  testProg.getClassStat('locksmith').level = 7;
  assert.equal(CraftingSystem.getCrafterPerks(testProg, 'lockpicking').perkDescription, 'Locksmith Lv 7: 7% chance to save a lockpick on a failed roll');

  // Test Lv 40: caps at 15%
  testProg.getClassStat('excavator').level = 40;
  testProg.getClassStat('angler').level = 40;
  testProg.getClassStat('locksmith').level = 40;

  const excavatorLv40 = CraftingSystem.getCrafterPerks(testProg, 'digging');
  assert.equal(excavatorLv40.classLevel, 40);
  assert.equal(excavatorLv40.bonusYieldChance, 15, 'Excavator Lv 40 must cap at 15%');
  assert.equal(excavatorLv40.perkDescription, 'Excavator Lv 40: +15% bonus yield');

  const anglerLv40 = CraftingSystem.getCrafterPerks(testProg, 'fishing');
  assert.equal(anglerLv40.classLevel, 40);
  assert.equal(anglerLv40.bonusYieldChance, 15, 'Angler Lv 40 must cap at 15%');
  assert.equal(anglerLv40.perkDescription, 'Angler Lv 40: +15% bonus yield');

  const locksmithLv40 = CraftingSystem.getCrafterPerks(testProg, 'lockpicking');
  assert.equal(locksmithLv40.classLevel, 40);
  assert.equal(locksmithLv40.savePickChance, 15, 'Locksmith Lv 40 must cap at 15%');
  assert.equal(locksmithLv40.perkDescription, 'Locksmith Lv 40: 15% chance to save a lockpick on a failed roll');

  console.log('✔ Perk calculation and formatting match spec: Lv 0 is 0%, Lv 10 is 10%, Lv 40 capped at 15%.');

  // -------------------------------------------------------------------------
  // Test 3: Excavator In Action (Forced Rolls & Bonus Yield)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 3: Excavator In Action (Forced Rolls & Bonus Yield) ---');

  const digNodeDef = {
    id: 'dig_spot',
    name: 'Dig Spot',
    skillId: 'digging',
    resourceId: 'dirt',
    yieldCount: 1,
    expGranted: 15,
    actionVerb: 'Digging',
    lootTable: [
      { itemId: 'dirt', name: 'Dirt', weight: 35, count: 1 },
      { itemId: 'clay', name: 'Clay', weight: 30, count: 1 },
      { itemId: 'seeds', name: 'Seeds', weight: 20, count: 1 },
      { itemId: 'locked_box', name: 'Locked Box', weight: 15, count: 1 }
    ]
  };

  // 3A: Locked Excavator at forced roll 0.05 (< 10%) -> No perk triggers
  hero.clearInventory();
  valerie.clearInventory();
  const mockDigNode1: GatheringNode = {
    id: 'dig_1',
    x: 5,
    y: 5,
    nodeDef: { ...digNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  // Primary loot roll 0.1 gives Dirt (0.1 * 100 = 10 <= 35)
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockDigNode1, hero, () => 0.05);
  assert.equal(hero.getItemCount('dirt'), 1, 'Locked Excavator: yields only base 1 Dirt even with roll 0.05');
  assert.equal(hero.progression.getClassLevel('excavator'), 0);
  assert.equal(hero.progression.getClassStat('excavator').currentExp, 0, 'Locked Excavator gains no class EXP');

  // 3B: Excavator Lv 10 with roll 0.05 (< 10%) -> Perk triggers (extra drop)
  (hero.progression as any).unlockedClasses.add('excavator');
  hero.progression.getClassStat('excavator').level = 10;
  hero.progression.getClassStat('excavator').currentExp = 0;
  (valerie.progression as any).unlockedClasses.add('excavator');
  valerie.progression.getClassStat('excavator').level = 10;
  valerie.progression.getClassStat('excavator').currentExp = 0;

  hero.clearInventory();
  const mockDigNode2: GatheringNode = {
    id: 'dig_2',
    x: 5,
    y: 5,
    nodeDef: { ...digNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  // Constant roll 0.05 (< 10%): base roll chooses Dirt, perk triggers, extra roll chooses Dirt -> total 2 Dirt
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockDigNode2, hero, () => 0.05);
  assert.equal(hero.getItemCount('dirt'), 2, 'Excavator Lv 10 with roll 0.05: yields extra roll of drop (total 2 Dirt)');
  assert.equal(hero.progression.getClassStat('excavator').currentExp, 15, 'Acting character gains +15 Excavator Class EXP');
  assert.equal(valerie.progression.getClassStat('excavator').currentExp, 0, 'Non-acting companion gains 0 Class EXP');

  // 3C: Excavator Lv 10 with roll 0.50 (> 10%) -> Perk does not trigger
  hero.clearInventory();
  const mockDigNode3: GatheringNode = {
    id: 'dig_3',
    x: 5,
    y: 5,
    nodeDef: { ...digNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  // Constant roll 0.50 (50% > 10%): perk does not trigger
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockDigNode3, hero, () => 0.50);
  // Roll 0.50: 0.50 * 100 = 50 -> Clay (weight 35 to 65)
  assert.equal(hero.getItemCount('clay'), 1, 'Excavator Lv 10 with roll 0.50: only yields base 1 Clay (no bonus)');

  // 3D: Excavator Lv 40 (capped at 15%): roll 0.12 triggers, roll 0.18 does not
  hero.progression.getClassStat('excavator').level = 40;
  hero.clearInventory();
  const mockDigNode4: GatheringNode = {
    id: 'dig_4',
    x: 5,
    y: 5,
    nodeDef: { ...digNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockDigNode4, hero, () => 0.12);
  assert.equal(hero.getItemCount('dirt'), 2, 'Excavator Lv 40 with roll 0.12 (< 15%): triggers bonus yield (total 2 Dirt)');

  hero.clearInventory();
  const mockDigNode5: GatheringNode = {
    id: 'dig_5',
    x: 5,
    y: 5,
    nodeDef: { ...digNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockDigNode5, hero, () => 0.18);
  assert.equal(hero.getItemCount('dirt'), 1, 'Excavator Lv 40 with roll 0.18 (> 15%): does not trigger bonus yield (1 Dirt)');

  console.log('✔ Excavator bonus yield and class EXP verified for locked, Lv 10 (< 10% proc, > 10% no-proc), and Lv 40 (15% cap).');

  // -------------------------------------------------------------------------
  // Test 4: Angler In Action (Forced Rolls & Extra Fish/Item)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 4: Angler In Action (Forced Rolls & Extra Fish/Item) ---');

  const fishNodeDef = {
    id: 'fishing_spot',
    name: 'Fishing Spot',
    skillId: 'fishing',
    resourceId: 'raw_fish',
    yieldCount: 1,
    expGranted: 15,
    actionVerb: 'Fishing',
    lootTable: [
      { itemId: 'raw_fish', name: 'Raw Fish', weight: 70, count: 1 },
      { itemId: 'aquatic_reagent', name: 'Aquatic Reagent', weight: 30, count: 1 }
    ]
  };

  // 4A: Locked Angler at forced roll 0.05 (< 10%) -> No perk triggers
  hero.clearInventory();
  (hero.progression as any).unlockedClasses.delete('angler');
  hero.progression.getClassStat('angler').level = 0;
  hero.progression.getClassStat('angler').currentExp = 0;

  const mockFishNode1: GatheringNode = {
    id: 'fish_1',
    x: 6,
    y: 6,
    nodeDef: { ...fishNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishNode1, hero, () => 0.05);
  assert.equal(hero.getItemCount('raw_fish'), 1, 'Locked Angler: yields only 1 Raw Fish');
  assert.equal(hero.progression.getClassStat('angler').currentExp, 0, 'Locked Angler gains no class EXP');

  // 4B: Angler Lv 10 with roll 0.05 (< 10%) -> Perk triggers (+1 extra fish)
  (hero.progression as any).unlockedClasses.add('angler');
  hero.progression.getClassStat('angler').level = 10;
  hero.progression.getClassStat('angler').currentExp = 0;
  (valerie.progression as any).unlockedClasses.add('angler');
  valerie.progression.getClassStat('angler').level = 10;
  valerie.progression.getClassStat('angler').currentExp = 0;

  hero.clearInventory();
  const mockFishNode2: GatheringNode = {
    id: 'fish_2',
    x: 6,
    y: 6,
    nodeDef: { ...fishNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishNode2, hero, () => 0.05);
  assert.equal(hero.getItemCount('raw_fish'), 2, 'Angler Lv 10 with roll 0.05: yields +1 extra fish (total 2 Raw Fish)');
  assert.equal(hero.progression.getClassStat('angler').currentExp, 15, 'Acting character gains +15 Angler Class EXP');
  assert.equal(valerie.progression.getClassStat('angler').currentExp, 0, 'Non-acting companion gains 0 Class EXP');

  // 4C: Angler Lv 10 with roll 0.50 (> 10%) -> Perk does not trigger
  hero.clearInventory();
  const mockFishNode3: GatheringNode = {
    id: 'fish_3',
    x: 6,
    y: 6,
    nodeDef: { ...fishNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;

  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishNode3, hero, () => 0.50);
  assert.equal(hero.getItemCount('raw_fish'), 1, 'Angler Lv 10 with roll 0.50: yields only 1 Raw Fish');

  // 4D: Angler Lv 40 (capped at 15%): roll 0.12 triggers, roll 0.18 does not
  hero.progression.getClassStat('angler').level = 40;
  hero.clearInventory();
  const mockFishNode4: GatheringNode = {
    id: 'fish_4',
    x: 6,
    y: 6,
    nodeDef: { ...fishNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishNode4, hero, () => 0.12);
  assert.equal(hero.getItemCount('raw_fish'), 2, 'Angler Lv 40 with roll 0.12 (< 15%): triggers bonus yield (total 2)');

  hero.clearInventory();
  const mockFishNode5: GatheringNode = {
    id: 'fish_5',
    x: 6,
    y: 6,
    nodeDef: { ...fishNodeDef },
    sprite: createMockSprite(),
    label: createMockText(),
    isHarvested: false
  } as any;
  MainScene.prototype.harvestGatheringNode.call(mockScene, mockFishNode5, hero, () => 0.18);
  assert.equal(hero.getItemCount('raw_fish'), 1, 'Angler Lv 40 with roll 0.18 (> 15%): does not trigger bonus yield (total 1)');

  console.log('✔ Angler bonus yield and class EXP verified for locked, Lv 10 (< 10% proc, > 10% no-proc), and Lv 40 (15% cap).');

  // -------------------------------------------------------------------------
  // Test 5: Locksmith In Action (Success Rate Parity, Steady Hands & Class EXP)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 5: Locksmith In Action (Success Rate Parity, Steady Hands & Class EXP) ---');

  const lockpickingSystem = LockpickingSystem.getInstance();

  // 5A: Success rate calculation is 100% identical with and without Locksmith class
  const rateAt0 = lockpickingSystem.calculateSuccessRate(0);
  const rateAt10 = lockpickingSystem.calculateSuccessRate(10);
  const rateAt50 = lockpickingSystem.calculateSuccessRate(50);
  const rateAt100 = lockpickingSystem.calculateSuccessRate(100);

  assert.equal(rateAt0, 0.25, 'Base success rate is 25%');
  assert.equal(rateAt10, 0.325, 'Level 10 success rate is 32.5%');
  assert.equal(rateAt50, 0.625, 'Level 50 success rate is 62.5%');
  assert.equal(rateAt100, 1.0, 'Level 100 success rate is 100%');

  // calculateSuccessRate depends ONLY on proficiency level, unchanged by class
  assert.equal(lockpickingSystem.calculateSuccessRate(10), 0.325, 'Success rate is unchanged with or without Locksmith');

  // 5B: Steady hands perk on failed rolls
  hero.clearInventory();
  valerie.clearInventory();
  (gameState as any).inventory.clear();

  // Setup locked hero (Lv 0) with 1 box and 1 lockpick
  (hero.progression as any).unlockedClasses.delete('locksmith');
  hero.progression.getClassStat('locksmith').level = 0;
  hero.progression.getClassStat('locksmith').currentExp = 0;
  hero.progression.getProficiencyStat('lockpicking').level = 0; // successRate = 0.25

  hero.addItem('locked_box', 1);
  hero.addItem('lockpick', 1);

  // Forced roll sequence: roll = 0.9 (fails, since 0.9 >= 0.25), save roll = 0.05
  // For locked hero, roll 0.05 does NOT save pick
  let callCount = 0;
  const lockedRng = () => {
    callCount++;
    if (callCount === 1) return 0.9; // attempt roll (fail)
    return 0.05; // would be save roll
  };

  const lockedRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, lockedRng, hero);
  assert.equal(lockedRes.success, false, 'Unlock attempt failed');
  assert.equal(lockedRes.lockpicksConsumed, 1, 'Locked hero: failed roll consumes lockpick');
  assert.equal(hero.getItemCount('lockpick'), 0, 'Hero inventory lost lockpick');
  assert.equal(hero.progression.getClassStat('locksmith').currentExp, 0, 'No class EXP on failed roll');

  // 5C: Locksmith Lv 10: forced save roll 0.05 (< 10%) saves lockpick
  (hero.progression as any).unlockedClasses.add('locksmith');
  hero.progression.getClassStat('locksmith').level = 10;
  hero.progression.getClassStat('locksmith').currentExp = 0;
  (valerie.progression as any).unlockedClasses.add('locksmith');
  valerie.progression.getClassStat('locksmith').level = 10;
  valerie.progression.getClassStat('locksmith').currentExp = 0;

  hero.clearInventory();
  hero.addItem('locked_box', 1);
  hero.addItem('lockpick', 1);

  callCount = 0;
  const saveRng = () => {
    callCount++;
    if (callCount === 1) return 0.9; // attempt roll (fail: 0.9 >= 0.25)
    return 0.05; // save roll: 0.05 < 0.10 -> SAVED!
  };

  const savedRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, saveRng, hero);
  assert.equal(savedRes.success, false, 'Unlock attempt failed');
  assert.equal(savedRes.lockpicksConsumed, 0, 'Locksmith Lv 10 with roll 0.05: lockpick was saved (0 consumed)');
  assert.equal(hero.getItemCount('lockpick'), 1, 'Lockpick remained in inventory due to Steady Hands');

  // 5D: Locksmith Lv 10: forced save roll 0.50 (> 10%) consumes lockpick
  callCount = 0;
  const consumeRng = () => {
    callCount++;
    if (callCount === 1) return 0.9; // attempt roll (fail)
    return 0.50; // save roll: 0.50 >= 0.10 -> consumed
  };

  const consumedRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, consumeRng, hero);
  assert.equal(consumedRes.success, false, 'Unlock attempt failed');
  assert.equal(consumedRes.lockpicksConsumed, 1, 'Locksmith Lv 10 with roll 0.50: lockpick was consumed');
  assert.equal(hero.getItemCount('lockpick'), 0, 'Lockpick consumed from inventory');

  // 5E: Locksmith Lv 40 (capped at 15%): roll 0.12 saves pick, roll 0.18 consumes pick
  hero.progression.getClassStat('locksmith').level = 40;

  // Test 0.12 (< 15%)
  hero.addItem('lockpick', 1);
  callCount = 0;
  const capSaveRng = () => {
    callCount++;
    if (callCount === 1) return 0.9;
    return 0.12;
  };
  const capSaveRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, capSaveRng, hero);
  assert.equal(capSaveRes.lockpicksConsumed, 0, 'Locksmith Lv 40 with roll 0.12 (< 15%): lockpick saved');
  assert.equal(hero.getItemCount('lockpick'), 1);

  // Test 0.18 (> 15%)
  callCount = 0;
  const capConsumeRng = () => {
    callCount++;
    if (callCount === 1) return 0.9;
    return 0.18;
  };
  const capConsumeRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, capConsumeRng, hero);
  assert.equal(capConsumeRes.lockpicksConsumed, 1, 'Locksmith Lv 40 with roll 0.18 (> 15%): lockpick consumed');
  assert.equal(hero.getItemCount('lockpick'), 0);

  // 5F: Class EXP awarded on SUCCESSFUL pick only, to acting character only
  hero.clearInventory();
  hero.addItem('locked_box', 1);
  hero.addItem('lockpick', 1);
  hero.progression.getClassStat('locksmith').currentExp = 0;
  valerie.progression.getClassStat('locksmith').currentExp = 0;

  const successRng = () => 0.05; // 0.05 < 0.25 -> success on first roll!
  const winRes = lockpickingSystem.attemptUnlock(hero.progression, hero.entityName, successRng, hero);
  assert.equal(winRes.success, true, 'Lockpick succeeded');
  assert.equal(hero.progression.getClassStat('locksmith').currentExp, 35, 'Acting character earned +35 Locksmith Class EXP (matching SUCCESS_EXP)');
  assert.equal(valerie.progression.getClassStat('locksmith').currentExp, 0, 'Non-acting companion earned 0 Locksmith Class EXP');

  console.log('✔ Locksmith success rate parity, Steady Hands perk rolls, and acting-only Class EXP verified.');

  console.log('\n=== ALL WAVE 3 TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
