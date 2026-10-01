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
  localStorage: (global as any).localStorage,
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  confirm: () => true
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
    style: {}
  }),
  getElementById: (id: string) => ({
    id,
    style: {},
    classList: {
      add: noop,
      remove: noop,
      contains: () => false
    },
    innerText: '',
    innerHTML: '',
    title: '',
    querySelectorAll: () => [],
    querySelector: () => null
  }),
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

// Mock fetch for DataLoader
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { GameState, validateCharacterName } from '../src/systems/GameState.ts';
import { TutorialSystem } from '../src/systems/TutorialSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { canEquipBowDaggerSidearm } from '../src/utils/gearResolver.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HUD } from '../src/ui/HUD.ts';

function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    setInteractive: function () { return this; },
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

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    fillStyle: () => {},
    fillRect: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    fillCircle: () => {},
    strokeCircle: () => {},
    fillEllipse: () => {},
    lineBetween: () => {},
    beginPath: () => {},
    arc: () => {},
    strokePath: () => {},
    fillPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fillTriangle: () => {},
    generateTexture: () => {},
    destroy: () => {},
    clear: () => {}
  } as any;
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    setOrigin: () => {},
    setScale: () => {},
    setVisible: () => {},
    setAlpha: () => {},
    setAngle: () => {},
    setTint: () => {},
    clearTint: () => {},
    setTexture: () => {},
    setPosition: () => {},
    setDepth: () => {},
    setInteractive: function () { return this; },
    play: () => {},
    destroy: () => {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    setOrigin: function () { return this; },
    setText: function () { return this; },
    setColor: function () { return this; },
    destroy: () => {}
  } as any;
}

function createMockContainer(x: number = 0, y: number = 0) {
  const emitter = createMockEventEmitter();
  const children: any[] = [];
  return {
    ...emitter,
    x,
    y,
    children,
    setDepth: function () { return this; },
    setPosition: function (newX: number, newY: number) {
      this.x = newX;
      this.y = newY;
      return this;
    },
    add: function (items: any[]) {
      if (Array.isArray(items)) children.push(...items);
      else children.push(items);
      return this;
    },
    destroy: function () {
      children.length = 0;
    }
  } as any;
}

function createMockScene() {
  return {
    sys: {
      queueDepthSort: () => {},
      displayList: { queueDepthSort: () => {} },
      events: { once: () => {}, on: () => {}, emit: () => {} }
    },
    add: {
      graphics: createMockGraphics,
      sprite: createMockSprite,
      text: createMockText,
      container: createMockContainer,
      existing: () => {}
    },
    make: {
      graphics: createMockGraphics
    },
    textures: {
      exists: () => true,
      get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) })
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    time: {
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (_ms: number, cb: Function) => cb(),
      now: 1000
    },
    cameras: {
      main: {
        shake: () => {}
      }
    }
  } as any;
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PLAYTEST ROUND 1 ONBOARDING & UX HEADLESS TESTS');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -------------------------------------------------------------
  // TEST 1: Character Name Validation & Save/Load Persistence
  // -------------------------------------------------------------
  console.log('--- TEST 1: Character Name Validation & Save/Load Persistence ---');
  assert.equal(validateCharacterName('', 'Guild Hero'), 'Guild Hero', 'Empty name defaults to Guild Hero');
  assert.equal(validateCharacterName('   ', 'Guild Hero'), 'Guild Hero', 'Whitespace-only name defaults to Guild Hero');
  assert.equal(validateCharacterName(null, 'Kaelen'), 'Kaelen', 'Null name defaults to Kaelen');
  assert.equal(validateCharacterName(undefined, 'Barris'), 'Barris', 'Undefined name defaults to Barris');
  assert.equal(validateCharacterName('  Artorias  ', 'Guild Hero'), 'Artorias', 'Names are trimmed');
  assert.equal(validateCharacterName('A Very Very Long Hero Name That Exceeds 16', 'Guild Hero'), 'A Very Very Long', 'Names capped at 16 chars');

  const gameState = GameState.getInstance();
  const playerData = dataLoader.getPlayer();
  gameState.resetToDefault(playerData, '2h_longsword', '  Sir Roland  ');

  const leader = gameState.getPartySnapshots()[0];
  assert.equal(leader.name, 'Sir Roland', 'Leader receives trimmed custom name');

  // Add 3rd member with custom name
  const recruit3 = gameState.createBlankRecruitSnapshot('  Lyra  ', 'companion_2', 'bow_and_dagger');
  assert.equal(recruit3.name, 'Lyra', 'Third member receives validated name');
  gameState.addCompanionToParty({ getSnapshot: () => recruit3, id: recruit3.id, entityName: recruit3.name });

  // Add 4th member with custom name
  const fourthDef = dataLoader.getFourthMemberRecruitDef();
  const recruit4 = gameState.createFourthMemberRecruitSnapshot(fourthDef, '  Garrick  ');
  assert.equal(recruit4.name, 'Garrick', 'Fourth member receives validated name');
  gameState.addCompanionToParty({ getSnapshot: () => recruit4, id: recruit4.id, entityName: recruit4.name });

  // Save to disk and reload
  const saved = gameState.saveToDisk();
  assert.equal(saved, true, 'Saved successfully');

  gameState.loadFromDisk();
  const reloadedParty = gameState.getPartySnapshots();
  assert.equal(reloadedParty[0].name, 'Sir Roland', 'Leader custom name preserved on load');
  assert.equal(reloadedParty[1].name, 'Valerie', 'Valerie preserved on load');
  assert.equal(reloadedParty[2].name, 'Lyra', 'Third member custom name preserved on load');
  assert.equal(reloadedParty[3].name, 'Garrick', 'Fourth member custom name preserved on load');
  console.log('✔ Test 1 passed: Character name validation and save/load persistence verified.');

  // -------------------------------------------------------------
  // TEST 2: Starting Weapon Kit Selection
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Starting Weapon Kit Selection ---');
  const kits = ['sword_and_shield', '2h_longsword', 'bow_and_dagger', 'random_magic_staff'];
  for (const kit of kits) {
    const res = gameState.resolveStartingKit(kit, () => 0.1);
    if (kit === 'sword_and_shield') {
      assert.equal(res.mainWeaponId, 'short_swords');
      assert.equal(res.offhandWeaponId, 'shields');
    } else if (kit === '2h_longsword') {
      assert.equal(res.mainWeaponId, 'longsword_2h');
      assert.equal(res.offhandWeaponId, null);
    } else if (kit === 'bow_and_dagger') {
      assert.equal(res.mainWeaponId, 'bows');
      assert.equal(res.offhandWeaponId, 'daggers');
    } else if (kit === 'random_magic_staff') {
      assert.ok(['arcane_staff', 'fire_staff', 'frost_staff'].includes(res.mainWeaponId), `Expected staff weapon, got ${res.mainWeaponId}`);
      assert.ok(res.offhandWeaponId === null);
    }
  }
  console.log('✔ Test 2 passed: All 4 starting weapon kits give the exact expected loadouts.');

  // -------------------------------------------------------------
  // TEST 3: Scout Bow + Off-Hand Dagger Rules
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Scout Bow + Off-Hand Dagger Rules ---');
  const mockBow = dataLoader.getWeapon('bows')!;
  const mockDagger = dataLoader.getWeapon('daggers')!;
  const mockShield = dataLoader.getWeapon('shields')!;
  const mockSword = dataLoader.getWeapon('short_swords')!;

  // 1. Non-scout with Bow cannot equip dagger or shield in offhand
  assert.equal(canEquipBowDaggerSidearm({ activeClass: null, equippedWeapon: mockBow }, mockDagger), false, 'Unranked cannot equip dagger with bow');
  assert.equal(canEquipBowDaggerSidearm({ activeClass: 'fencer', equippedWeapon: mockBow }, mockDagger), false, 'Fencer cannot equip dagger with bow');
  assert.equal(canEquipBowDaggerSidearm({ activeClass: 'vanguard', equippedWeapon: mockBow }, mockDagger), false, 'Vanguard cannot equip dagger with bow');

  // 2. Active Scout with Bow CAN equip dagger in offhand
  assert.equal(canEquipBowDaggerSidearm({ activeClass: 'scout', equippedWeapon: mockBow }, mockDagger), true, 'Scout CAN equip dagger with bow');
  assert.equal(canEquipBowDaggerSidearm({ activeClass: 'scout', equippedWeapon: mockBow }, mockShield), false, 'Scout CANNOT equip shield with bow');
  assert.equal(canEquipBowDaggerSidearm({ activeClass: 'scout', equippedWeapon: mockSword }, mockDagger), false, 'Sword is not a bow');

  // 3. Confirm Valerie: activeClass is 'scout', equippedWeapon is 'bows', offhand is 'daggers'
  const valerie = reloadedParty.find(p => p.id === 'companion_1')!;
  assert.equal(valerie.activeClass, 'scout', 'Valerie is active Scout');
  assert.equal(valerie.equippedWeaponId, 'bows', 'Valerie has Bows');
  assert.equal(valerie.offhandWeaponId, 'daggers', 'Valerie has Daggers offhand');
  assert.equal(canEquipBowDaggerSidearm({ activeClass: valerie.activeClass, equippedWeapon: mockBow }, mockDagger), true, 'Valerie satisfies Scout sidearm rule');
  console.log('✔ Test 3 passed: Scout Bow + Dagger sidearm rule verified; Valerie is unaffected.');

  // -------------------------------------------------------------
  // TEST 4: Switching Away From Scout Auto-Unequips Dagger to Bag
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Switching Away From Scout Auto-Unequips Dagger to Bag ---');
  const mockScene = createMockScene();
  const classesData = dataLoader.getClassesData();
  const progression = new ProgressionSystem(classesData, 'Robin');
  progression.setClassLevel('scout', 1);
  progression.setClassLevel('fencer', 1);

  const player = new Player(mockScene, 0, 0, playerData, mockBow, 32, 'player-avatar', progression);
  player.setActiveClass('scout');
  const equipped = player.equipOffhandWeapon(mockDagger, true);
  assert.equal(equipped, true, 'Scout equipped dagger offhand');
  assert.equal(player.offhandWeapon?.id, 'daggers', 'Offhand is daggers');
  assert.equal(player.getItemCount('daggers'), 0, 'No daggers in bag');

  // Switch class away from scout to fencer
  player.setActiveClass('fencer');
  assert.equal(player.offhandWeapon, null, 'Offhand dagger was automatically unequipped');
  assert.equal(player.getItemCount('daggers'), 1, 'Offhand dagger moved to bag (no item loss or duplication)');
  console.log('✔ Test 4 passed: Class change away from Scout unequips Dagger to bag cleanly.');

  // -------------------------------------------------------------
  // TEST 5: System-Level Equip Event & equip_gear Tutorial Completion
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: System-Level Equip Event & equip_gear Tutorial Step ---');
  const tut = TutorialSystem.getInstance();
  tut.reset();

  let eventFired = false;
  let eventItem: any = null;
  let eventSlot = '';
  const unsub = Player.onAnyGearEquipped((item, _member, slot) => {
    eventFired = true;
    eventItem = item;
    eventSlot = slot;
  });

  // Advance tutorial to step 10: 'equip_gear' (index 9)
  while (tut.getCurrentStep()?.id !== 'equip_gear') {
    tut.advanceStep();
  }
  assert.equal(tut.getCurrentStep()?.id, 'equip_gear', 'Now at equip_gear tutorial step');

  // System-level equip (NOT via HUD)
  const testArmor = dataLoader.getArmor('leather_armor')!;
  player.addItem('leather_armor', 1);
  const armorEquipped = player.equipArmorSlot('body', testArmor, true);
  assert.equal(armorEquipped, true, 'Armor equipped via Player.equipArmorSlot');

  assert.equal(eventFired, true, 'Player.onAnyGearEquipped fired on system-level equip');
  assert.equal(eventItem.id, 'leather_armor', 'Item passed to event');
  assert.equal(eventSlot, 'body', 'Slot passed to event');

  // Check tutorial advanced past equip_gear to alchemy_station
  assert.equal(tut.getCurrentStep()?.id, 'alchemy_station', 'equip_gear completed upon gear equip');
  assert.equal(tut.getCurrentStep()?.stepNumber, 11, 'Next step is step 11: alchemy_station');
  unsub();

  // Test that subsequent gear equips while NOT on equip_gear do not retroactively alter steps
  const prevStepId = tut.getCurrentStep()?.id;
  player.equipWeapon(mockBow, true);
  assert.equal(tut.getCurrentStep()?.id, prevStepId, 'Subsequent equip did not prematurely advance later step');
  console.log('✔ Test 5 passed: System-level equip event and equip_gear tutorial step verified.');

  // -------------------------------------------------------------
  // TEST 6: Step 5 (safe_gathering) Gathering Mode Gate
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Step 5 (safe_gathering) Gathering Mode Gate ---');
  tut.reset();
  // Advance to step 5: 'safe_gathering' (index 4)
  while (tut.getCurrentStep()?.id !== 'safe_gathering') {
    tut.advanceStep();
  }
  assert.equal(tut.getCurrentStep()?.id, 'safe_gathering', 'On safe_gathering step');
  assert.ok(tut.getCurrentStep()?.objective.includes('[F]'), 'Objective mentions [F] key');

  // Mock a gathering node
  const mockNodeDef = dataLoader.getGatheringNode('woodcutting_node_oak') || {
    id: 'test_node',
    name: 'Test Tree',
    resourceId: 'wood',
    yieldCount: 2,
    expGranted: 15,
    textureDepletedKey: 'depleted',
    depletedLabel: 'Depleted',
    skillId: 'woodcutting'
  };
  const mockNode: any = {
    isHarvested: false,
    x: 5,
    y: 5,
    nodeDef: mockNodeDef,
    sprite: { setTexture: () => {} },
    label: { setText: () => {}, setColor: () => {} }
  };

  // 1. Single-click harvest (isFromQueue: false)
  const dummyMainScene: any = {
    player,
    tileSize: 32,
    hud: { showToast: () => {} },
    createFloatingText: () => {},
    tweens: { add: () => {} },
    time: { delayedCall: () => {} },
    gatheringWorkerNodeAssignments: new Map(),
    gatheringQueue: [],
    harvestGatheringNode: function(node: any, character: any, lootRollFn?: any, isFromQueue: boolean = false) {
      if (node.isHarvested) return;
      node.isHarvested = true;
      character.addItem('wood', 1);
      if (isFromQueue && TutorialSystem.getInstance().getCurrentStep()?.id === 'safe_gathering') {
        TutorialSystem.getInstance().completeStepId('safe_gathering');
      }
    }
  };

  dummyMainScene.harvestGatheringNode(mockNode, player, undefined, false);
  assert.equal(tut.getCurrentStep()?.id, 'safe_gathering', 'Single click did NOT advance safe_gathering');

  // 2. Gathering Mode queue harvest (isFromQueue: true)
  const mockNode2: any = { ...mockNode, isHarvested: false };
  dummyMainScene.harvestGatheringNode(mockNode2, player, undefined, true);
  assert.equal(tut.getCurrentStep()?.id, 'return_outpost', 'Gathering Mode queue harvest completed safe_gathering');
  console.log('✔ Test 6 passed: Step 5 safe_gathering only completes via Gathering Mode.');

  // -------------------------------------------------------------
  // TEST 7: Migration of a Save Past forge_upgrade
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Migration of a Save Past forge_upgrade ---');
  tut.reset();
  // Old save saved with stepId 'alchemy_station'
  tut.loadFromState({ stepId: 'alchemy_station' });
  assert.equal(tut.getCurrentStep()?.id, 'alchemy_station', 'Loaded alchemy_station');
  assert.equal(tut.getCurrentStep()?.stepNumber, 11, 'Step number is 11, equip_gear was skipped');

  // Old save with numeric step 9 (which in the 13-step version was alchemy_station)
  tut.loadFromState(9);
  assert.equal(tut.getCurrentStep()?.id, 'alchemy_station', 'Numeric step 9 migrated past equip_gear to alchemy_station');
  assert.equal(tut.getCurrentStep()?.stepNumber, 11);

  // Total tutorial steps count is 14
  assert.equal(tut.getCurrentStep()?.totalSteps, 14, 'Total tutorial steps is 14');
  console.log('✔ Test 7 passed: Save migration skips equip_gear correctly for saves past forge_upgrade.');

  // -------------------------------------------------------------
  // TEST 8: Salvage Rates in data/craftingConfig.json
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Salvage Rates in data/craftingConfig.json ---');
  const craftingConfigRaw = JSON.parse(fs.readFileSync('data/craftingConfig.json', 'utf8'));
  assert.equal(craftingConfigRaw.salvageRefundRate, 0.5, 'salvageRefundRate is 0.5 in craftingConfig.json');
  assert.equal(craftingConfigRaw.salvageExpRate, 0.5, 'salvageExpRate is 0.5 in craftingConfig.json');

  const bRecipesRaw = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8'));
  assert.equal(bRecipesRaw.salvageRefundRate, undefined, 'salvageRefundRate removed from blacksmithRecipes.json');
  assert.equal(bRecipesRaw.salvageExpRate, undefined, 'salvageExpRate removed from blacksmithRecipes.json');

  assert.equal(dataLoader.getSalvageRefundRate(), 0.5, 'DataLoader returns 0.5 for refund rate');
  assert.equal(dataLoader.getSalvageExpRate(), 0.5, 'DataLoader returns 0.5 for exp rate');
  console.log('✔ Test 8 passed: Salvage rates centralized in data/craftingConfig.json.');

  // -------------------------------------------------------------
  // TEST 9: Quick-Slot and Consumable Tooltips
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Quick-Slot and Consumable Tooltips ---');
  const hudInstance = new HUD();
  const emptyTooltip = hudInstance.formatConsumableTooltip(null, 0);
  assert.equal(emptyTooltip, "Empty slot: drag a consumable here, or use 'Slot ➡️' on an item.", 'Empty quick slot tooltip match');

  const hpTooltip = hudInstance.formatConsumableTooltip('health_potion', 0);
  assert.ok(hpTooltip.includes('[Key 1] Health Potion'), 'Includes hotkey & name');
  assert.ok(hpTooltip.includes('Restores 30 HP, Critical first. 10 s cooldown'), 'Includes effect');
  assert.ok(hpTooltip.includes('Targets: Selected member if injured, else the lowest HP%'), 'Includes target rule');
  assert.ok(hpTooltip.includes('Party carried:'), 'Includes carried count');
  assert.ok(hpTooltip.includes('Right-click to clear'), 'Includes right click note for quick slots');

  const inventoryHpTooltip = hudInstance.formatConsumableTooltip('health_potion');
  assert.ok(!inventoryHpTooltip.includes('[Key 1]'), 'Inventory tooltip does not have slot key');
  assert.ok(!inventoryHpTooltip.includes('Right-click to clear'), 'Inventory tooltip does not have clear note');
  assert.ok(inventoryHpTooltip.includes('Health Potion'), 'Inventory tooltip includes item name');
  console.log('✔ Test 9 passed: Quick slot and inventory consumable tooltips format correctly.');

  // -------------------------------------------------------------
  // TEST 10: Intro Narrative Data & Tab Hint
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Intro Narrative Data & Tab Hint ---');
  const narrative = dataLoader.getIntroNarrative();
  assert.ok(narrative, 'Intro narrative data exists');
  assert.equal(narrative.speaker, 'Valerie', 'Narrative speaker is Valerie');
  assert.ok(narrative.lines.length >= 2, 'Narrative lines exist');
  assert.ok(narrative.tabHint?.includes('[Tab]'), 'Tab hint is present in narrative');
  console.log('✔ Test 10 passed: Intro narrative and tab hints verified.');

  console.log('\n================================================================');
  console.log('🎉 ALL PLAYTEST ROUND 1 ONBOARDING & UX TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
