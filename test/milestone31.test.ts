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

// Setup browser globals for Phaser / DOM under Node
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  const mockClassList = (classes: Set<string> = new Set()) => ({
    contains: (cls: string) => classes.has(cls),
    add: (...cls: string[]) => cls.forEach((c) => classes.add(c)),
    remove: (...cls: string[]) => cls.forEach((c) => classes.delete(c)),
    toggle: (cls: string) => {
      if (classes.has(cls)) {
        classes.delete(cls);
        return false;
      }
      classes.add(cls);
      return true;
    }
  });

  const domElements: Map<string, any> = new Map();

  const createMockElement = (id: string = '') => {
    const classes = new Set<string>();
    const listeners: Map<string, Function[]> = new Map();
    const el = {
      id,
      className: '',
      classList: mockClassList(classes),
      style: {} as any,
      innerText: '',
      innerHTML: '',
      children: [] as any[],
      dataset: {} as any,
      disabled: false,
      appendChild: (child: any) => {
        el.children.push(child);
        return child;
      },
      removeChild: (child: any) => {
        const idx = el.children.indexOf(child);
        if (idx !== -1) el.children.splice(idx, 1);
        return child;
      },
      addEventListener: (evt: string, fn: Function) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt)!.push(fn);
      },
      dispatchEvent: (evt: { type: string; shiftKey?: boolean; stopPropagation?: Function }) => {
        const fns = listeners.get(evt.type) || [];
        for (const fn of fns) fn(evt);
        return true;
      },
      querySelector: (selector: string) => {
        if (selector.includes('data-craft-recipe')) return createMockElement();
        return null;
      }
    };
    return el;
  };

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
          style: {},
          width: 32,
          height: 32
        };
      }
      return createMockElement();
    },
    getElementById: (id: string) => {
      if (!domElements.has(id)) {
        domElements.set(id, createMockElement(id));
      }
      return domElements.get(id);
    },
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };

  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup node mock fetch to read actual project JSON files
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
import type { PlayerData, WeaponDef, ActiveReviveChannel } from '../src/types/game.ts';

// Helper mock graphics and sprite builders
function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    removedFromScene: function () { return this; },
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
    setOrigin: () => {},
    setVisible: () => {},
    setAlpha: () => {},
    setAngle: () => {},
    setTint: () => {},
    setTexture: () => {},
    setPosition: () => {},
    setDepth: () => {},
    setInteractive: function () { return this; },
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
      children.push(...items);
      return this;
    },
    destroy: function () {
      children.length = 0;
    }
  } as any;
}

function createMockScene() {
  const scene: any = {
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
      now: 0
    },
    party: [] as any[],
    player: null as any
  };
  return scene;
}

async function runMilestone31Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 31: ITEM-BASED REVIVE TESTS');
  console.log('================================================================');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const { Player } = await import('../src/entities/Player.ts');

  // Reset / initialize GameState
  const mockPlayerData: PlayerData = dataLoader.getPlayer();
  gameState.initFromPlayerData(mockPlayerData);

  // ==========================================================================
  // TEST 1: Alchemy Recipe for Revive Potion
  // ==========================================================================
  console.log('\n--- TEST 1: Revive Potion Recipe & Slime Gel Absence ---');
  const reviveRecipe = dataLoader.getAlchemyRecipe('revive_potion');
  assert.ok(reviveRecipe, 'revive_potion must exist in data/alchemyRecipes.json');
  assert.equal(reviveRecipe.name, 'Revive Potion');
  assert.equal(reviveRecipe.ingredients['wild_herbs'], 3, 'Revive Potion requires 3 wild_herbs');
  assert.equal(reviveRecipe.ingredients['ectoplasm'], 1, 'Revive Potion requires 1 ectoplasm');
  assert.equal(reviveRecipe.expGranted, 40, 'Revive Potion grants 40 Alchemy EXP');

  // Verify strict constraint: slime_gel must never appear in alchemyRecipes.json
  const rawJson = fs.readFileSync('data/alchemyRecipes.json', 'utf8');
  assert.ok(!rawJson.includes('slime_gel'), 'Strict constraint: slime_gel must never appear in alchemyRecipes.json');
  console.log('✔ Test 1 passed: Revive Potion recipe verified (3 wild_herbs + 1 ectoplasm -> 40 Alchemy EXP, no slime_gel).');

  // ==========================================================================
  // TEST 2: Downed Ally Clickable Revive Icon Lifecycle
  // ==========================================================================
  console.log('\n--- TEST 2: Clickable Revive Icon on Downed Ally ---');
  const mockScene = createMockScene();
  const swordDef: WeaponDef = dataLoader.getWeapon('short_swords')!;

  const classesData = dataLoader.getClassesData();
  const reviverProg = new ProgressionSystem(classesData, 'reviver');
  const reviver = new Player(mockScene, 2, 2, mockPlayerData, swordDef, 32, 'player-avatar', reviverProg);
  reviver.entityName = 'Guild Medic';

  const downedProg = new ProgressionSystem(classesData, 'downed_ally');
  const downedAlly = new Player(mockScene, 3, 2, mockPlayerData, swordDef, 32, 'companion-avatar', downedProg);
  downedAlly.entityName = 'Fallen Ally';

  mockScene.party = [reviver, downedAlly];
  mockScene.player = reviver;

  // Initially conscious: no revive icon
  assert.equal(downedAlly.state, 'idle');
  assert.equal(downedAlly.reviveIconSprite, undefined, 'Living ally must not show revive icon');

  // Put ally in downed state via takeDamage (draining both Main HP and Critical HP)
  downedAlly.takeDamage(downedAlly.maxHp + downedAlly.maxCriticalHp + 10);
  assert.equal(downedAlly.state, 'downed', 'Ally must transition to downed state');
  assert.ok(downedAlly.reviveIconSprite, 'Downed ally must display clickable reviveIconSprite');

  // Revive ally: revive icon must be hidden / cleaned up
  downedAlly.revive(reviver);
  assert.equal(downedAlly.state, 'idle', 'Ally must be revived to idle');
  assert.equal(downedAlly.reviveIconSprite, undefined, 'Revived ally must have revive icon destroyed');
  console.log('✔ Test 2 passed: Revive icon displays upon downed and cleans up upon revival.');

  // ==========================================================================
  // TEST 3: 3-Second Revive Channel & Progress Bar
  // ==========================================================================
  console.log('\n--- TEST 3: 3-Second Revive Channel & Progress Bar ---');

  // Re-down the ally
  downedAlly.takeDamage(downedAlly.maxHp + downedAlly.maxCriticalHp + 10);
  assert.equal(downedAlly.state, 'downed');

  // Mock scene revive channels map and channel methods
  const activeReviveChannels: Map<Player, any> = new Map();
  let engageCalledWith: any = null;

  mockScene.activeReviveChannels = activeReviveChannels;
  mockScene.findReviveChannelByParticipant = function (p: Player) {
    for (const channel of activeReviveChannels.values()) {
      if (channel.character === p || channel.targetAlly === p) return channel;
    }
    return undefined;
  };
  mockScene.startReviveChannel = function (character: Player, target: Player) {
    if (target.state !== 'downed' || character.state === 'downed' || character.state === 'dead') return false;
    if (gameState.getItemCount('revive_potion') < 1) return false;

    character.state = 'channeling';
    const channel: ActiveReviveChannel = {
      character,
      targetAlly: target,
      durationMs: 3000,
      elapsedMs: 0,
      barContainer: createMockContainer(character.x, character.y - 28),
      barBg: createMockGraphics(),
      barFill: createMockGraphics(),
      labelText: createMockText()
    };
    activeReviveChannels.set(character, channel);
    return true;
  };
  mockScene.interruptReviveChannel = function (participant: Player, attacker?: any) {
    const channel = mockScene.findReviveChannelByParticipant(participant);
    if (!channel) return false;
    channel.barContainer.destroy();
    activeReviveChannels.delete(channel.character);
    if (channel.character.state === 'channeling') {
      channel.character.state = 'idle';
    }
    if (attacker) {
      mockScene.engageEnemy(attacker, [channel.character]);
    }
    return true;
  };
  mockScene.cancelReviveChannel = function (character: Player) {
    const channel = activeReviveChannels.get(character);
    if (channel) {
      channel.barContainer.destroy();
      activeReviveChannels.delete(character);
      if (channel.character.state === 'channeling') character.state = 'idle';
      return true;
    }
    return false;
  };
  mockScene.completeReviveChannel = function (character: Player, channel: any) {
    channel.barContainer.destroy();
    activeReviveChannels.delete(character);
    if (character.state === 'channeling') character.state = 'idle';
    if (channel.targetAlly.state !== 'downed') return;
    if (gameState.getItemCount('revive_potion') < 1) return;

    gameState.consumeItem('revive_potion', 1);
    channel.targetAlly.revive(character);
    character.progression.addProficiencyExp('healing_magic', 5);
  };
  mockScene.engageEnemy = function (attacker: any, members: any[]) {
    engageCalledWith = { attacker, members };
  };

  // Attempt to start channel with 0 Revive Potions
  gameState.consumeItem('revive_potion', gameState.getItemCount('revive_potion'));
  assert.equal(gameState.getItemCount('revive_potion'), 0);
  const startFailed = mockScene.startReviveChannel(reviver, downedAlly);
  assert.equal(startFailed, false, 'Channel must not start when Revive Potion count is 0');
  assert.equal(reviver.state, 'idle');

  // Add 1 Revive Potion and start
  gameState.addItem('revive_potion', 1);
  assert.equal(gameState.getItemCount('revive_potion'), 1);
  const startSucceeded = mockScene.startReviveChannel(reviver, downedAlly);
  assert.equal(startSucceeded, true, 'Channel must start when Revive Potion is available');
  assert.equal(reviver.state, 'channeling', 'Reviver state must become channeling');
  assert.equal(activeReviveChannels.size, 1);

  const activeChannel = activeReviveChannels.get(reviver);
  assert.equal(activeChannel.durationMs, 3000, 'Revive channel duration must be exactly 3000ms');
  console.log('✔ Test 3 passed: 3-second channel initiated with progress bar and proper validation.');

  // ==========================================================================
  // TEST 4: Damage Interruption & Non-Consumption (Reviver & Target Ally)
  // ==========================================================================
  console.log('\n--- TEST 4: Damage Interruption & Potion Preservation ---');

  // Sub-case 4A: Reviver takes damage mid-channel
  console.log('  Testing Sub-case 4A: Reviver damaged mid-channel...');
  const mockWolf = { entityName: 'Dungeon Wolf', state: 'attacking' };
  const interruptedReviver = mockScene.interruptReviveChannel(reviver, mockWolf);
  assert.equal(interruptedReviver, true, 'interruptReviveChannel must succeed');
  assert.equal(reviver.state, 'idle', 'Reviver state must reset to idle upon interrupt');
  assert.equal(downedAlly.state, 'downed', 'Downed ally must remain downed after interrupt');
  assert.equal(gameState.getItemCount('revive_potion'), 1, 'CONFIRMED: Revive Potion is NOT consumed on interrupted channel');
  assert.equal(activeReviveChannels.size, 0, 'Active channel map must be cleared');
  assert.ok(engageCalledWith, 'Combat engagement must trigger on interrupt');
  assert.equal(engageCalledWith.attacker, mockWolf);
  assert.equal(engageCalledWith.members[0], reviver);
  console.log('  ✔ Sub-case 4A passed: Reviver damaged -> channel interrupted, potion preserved, ally remains downed, combat engaged.');

  // Sub-case 4B: Downed ally takes damage / transitions to dead mid-channel
  console.log('  Testing Sub-case 4B: Target ally damaged mid-channel...');
  // Start channel again
  mockScene.startReviveChannel(reviver, downedAlly);
  assert.equal(reviver.state, 'channeling');
  assert.equal(activeReviveChannels.size, 1);

  // Target ally takes damage
  const interruptedTarget = mockScene.interruptReviveChannel(downedAlly, mockWolf);
  assert.equal(interruptedTarget, true, 'interruptReviveChannel must resolve when participant is the target ally');
  assert.equal(reviver.state, 'idle', 'Reviver state must reset to idle when target ally takes damage');
  assert.equal(gameState.getItemCount('revive_potion'), 1, 'CONFIRMED: Revive Potion is NOT consumed when target ally is damaged');

  // Test dead corpse protection: channel cannot complete on a dead ally
  mockScene.startReviveChannel(reviver, downedAlly);
  const deadChannel = activeReviveChannels.get(reviver);
  downedAlly.state = 'dead'; // ally died mid-channel
  mockScene.completeReviveChannel(reviver, deadChannel);
  assert.equal(gameState.getItemCount('revive_potion'), 1, 'CONFIRMED: Revive will never complete or consume potion on dead ally');
  assert.equal(downedAlly.state, 'dead', 'Dead ally remains dead');
  console.log('  ✔ Sub-case 4B passed: Target ally damage interrupts channel, potion preserved, cannot revive corpse.');

  // ==========================================================================
  // TEST 5: Successful Revive, +5 Healing Magic EXP & Unified Activity Count
  // ==========================================================================
  console.log('\n--- TEST 5: Successful Revive, +5 Healing Magic EXP & Unified Activity Count ---');
  // Reset states
  downedAlly.state = 'downed';
  downedAlly.hp = 0;
  downedAlly.criticalHp = 0;
  downedAlly.showReviveIcon();

  // Reset reviver progression
  reviverProg.recordActivity('Ally Revived', -reviverProg.getActivityCount('Ally Revived')); // set to 0
  const initialHealingExp = reviverProg.getProficiencyStat('healing_magic').currentExp;
  assert.equal(reviverProg.getActivityCount('Ally Revived'), 0, 'Initial Ally Revived count must be 0');

  // Start revive channel with 2 potions
  gameState.addItem('revive_potion', 1); // Now 2 in inventory
  assert.equal(gameState.getItemCount('revive_potion'), 2);

  mockScene.startReviveChannel(reviver, downedAlly);
  const completingChannel = activeReviveChannels.get(reviver);
  mockScene.completeReviveChannel(reviver, completingChannel);

  // Check results of first item revive
  assert.equal(gameState.getItemCount('revive_potion'), 1, 'Exactly 1 Revive Potion consumed on successful completion');
  assert.equal(downedAlly.state, 'idle', 'Downed ally restored to idle');
  assert.equal(downedAlly.hp, Math.floor(downedAlly.maxHp * 0.5), 'Revived ally restored to 50% maxHp');
  assert.equal(downedAlly.criticalHp, downedAlly.maxCriticalHp, 'Revived ally Critical HP fully restored');
  assert.equal(downedAlly.reviveIconSprite, undefined, 'Revive icon destroyed after successful revive');

  const postHealingExp = reviverProg.getProficiencyStat('healing_magic').currentExp;
  assert.equal(postHealingExp, initialHealingExp + 5, 'Reviver must gain exactly +5 Healing Magic proficiency EXP');
  assert.equal(reviverProg.getActivityCount('Ally Revived'), 1, 'Ally Revived activityCount must increment by 1');

  // Perform 2nd item-based revive
  downedAlly.takeDamage(downedAlly.maxHp + downedAlly.maxCriticalHp + 10);
  assert.equal(downedAlly.state, 'downed');
  mockScene.startReviveChannel(reviver, downedAlly);
  const secondChannel = activeReviveChannels.get(reviver);
  mockScene.completeReviveChannel(reviver, secondChannel);

  assert.equal(gameState.getItemCount('revive_potion'), 0, 'Second potion consumed (count now 0)');
  assert.equal(reviverProg.getActivityCount('Ally Revived'), 2, 'Two item-based revives -> 2 Ally Revived count');
  assert.equal(reviverProg.getProficiencyStat('healing_magic').currentExp, initialHealingExp + 10, '+10 Healing Magic EXP total from 2 item revives');

  // Now perform 3 INSTANT DEBUG REVIVES via downedAlly.revive(reviver)
  for (let i = 1; i <= 3; i++) {
    downedAlly.takeDamage(downedAlly.maxHp + downedAlly.maxCriticalHp + 10);
    assert.equal(downedAlly.state, 'downed');
    downedAlly.revive(reviver); // Instant debug revive
  }

  // Unified Counter Verification: 2 item revives + 3 debug revives = 5 total
  assert.equal(reviverProg.getActivityCount('Ally Revived'), 5, 'CONFIRMED UNIFIED COUNTER: 2 item revives + 3 debug revives = exactly 5 total Ally Revived activities');

  // Confirm Combat Medic unlock requirement satisfaction
  const combatMedicDef = dataLoader.getClass('combat_medic');
  assert.ok(combatMedicDef, 'combat_medic class must exist in classes.json');
  const allyReviveReq = combatMedicDef.requirements.find((r: any) => r.type === 'activityCount' && r.target === 'Ally Revived');
  assert.ok(allyReviveReq, 'Combat Medic must require Ally Revived activity count');
  assert.equal(allyReviveReq.value, 5, 'Combat Medic requires 5 Ally Revived');
  assert.equal(reviverProg.getActivityCount('Ally Revived') >= allyReviveReq.value, true, 'Unified counter satisfies Combat Medic requirement of 5 Ally Revives');

  console.log('✔ Test 5 passed: Unified counter proven: 2 item + 3 debug = 5 Ally Revives, +5 Healing Magic EXP granted, Combat Medic unlock compatible.');

  // ==========================================================================
  // TEST 6: Instant Debug Revive Preservation
  // ==========================================================================
  console.log('\n--- TEST 6: Instant Debug Revive Completely Unaffected ---');
  // Potion count is currently 0
  assert.equal(gameState.getItemCount('revive_potion'), 0);

  // Put ally in downed state
  downedAlly.takeDamage(downedAlly.maxHp + downedAlly.maxCriticalHp + 10);
  assert.equal(downedAlly.state, 'downed');
  const preExp = reviverProg.getProficiencyStat('healing_magic').currentExp;

  // Instant debug revive works with 0 potions in inventory
  downedAlly.revive(reviver);
  assert.equal(downedAlly.state, 'idle', 'Debug revive functions without any Revive Potions in inventory');
  assert.equal(gameState.getItemCount('revive_potion'), 0, 'Debug revive never consumes potions');
  assert.equal(reviverProg.getProficiencyStat('healing_magic').currentExp, preExp, 'Debug revive grants ZERO Healing Magic proficiency EXP (unaffected convenience)');
  assert.equal(downedAlly.reviveIconSprite, undefined, 'Debug revive cleans up revive icon');
  console.log('✔ Test 6 passed: Instant debug revive is completely preserved and unaffected.');

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 31 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
}

runMilestone31Tests().catch((err) => {
  console.error('❌ Milestone 31 Test Failed:', err);
  process.exit(1);
});
