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
      style: {}
    }),
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
import { Pathfinder } from '../src/utils/Pathfinder.ts';

function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {},
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {}
    }, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => obj;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      }
    });
    return obj;
  };

  return {
    time: { now: 1000 },
    pathfinder,
    events: { emit: () => {}, on: () => {}, off: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: new Proxy({
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      line: createMockObj,
      circle: createMockObj,
      existing: (item: any) => item
    }, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return createMockObj;
      }
    }),
    tweens: {
      add: () => ({ remove: () => {} })
    }
  };
}

async function run() {
  console.log('=== TEST: VALERIE OFF-HAND DAGGER CONSERVATION & PROMPTS ===\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const playerData = dl.getPlayer();
  const { Player } = await import('../src/entities/Player.ts');

  // Track toasts shown
  const toasts: Array<{ message: string; type: string; duration: number }> = [];
  (globalThis as any).activeHUD = {
    showToast: (message: string, type: string = 'info', duration: number = 3000) => {
      toasts.push({ message, type, duration });
    }
  };

  // --- Test (a): 2H weapon equip while not Scout returns dagger to bag (conserved) and shows >=6s toast ---
  console.log('Test (a): 2H weapon equip while not Scout returns dagger to bag and shows >=6s toast');
  const sceneA = createMockScene();
  const heroA = new Player(sceneA, 5, 5, 'hero_a', playerData, 'warrior');
  heroA.entityName = 'Kaelen';
  heroA.activeClass = 'vanguard';
  heroA.equippedWeapon = dl.getWeapon('short_swords')!;
  heroA.offhandWeapon = dl.getWeapon('daggers')!;

  toasts.length = 0;
  const initialDaggersInBag = heroA.getItemCount('daggers');

  // Equip Greatsword (two-handed weapon)
  const greatswordDef = dl.getWeapon('greatswords')!;
  assert.equal(greatswordDef.twoHanded, true, 'Greatsword must be two-handed');
  const equipSuccess = heroA.equipWeapon(greatswordDef, true);
  assert.equal(equipSuccess, true, 'Equip Greatsword should succeed');

  // Off-hand must be unequipped and returned to bag
  assert.equal(heroA.offhandWeapon, null, 'Offhand weapon must be unequipped');
  assert.equal(heroA.getItemCount('daggers'), initialDaggersInBag + 1, 'Dagger must be added to inventory bag (conserved)');

  // Toast must be shown for >= 6000ms
  assert.ok(toasts.length > 0, 'A toast must have been triggered');
  const unequipToast = toasts.find(t => t.message.includes(`was unequipped: ${greatswordDef.name} is two-handed`));
  assert.ok(unequipToast, `Toast message must match format "{name}'s off-hand {item} was unequipped: {reason}". Found: ${JSON.stringify(toasts)}`);
  assert.ok(unequipToast.duration >= 6000, `Toast duration must be >= 6000ms, got ${unequipToast.duration}ms`);
  console.log(`  PASS: Off-hand returned to bag and toast shown for ${unequipToast.duration}ms: "${unequipToast.message}"\n`);

  // --- Test (b): Class switch away from Scout prompts confirmation. Cancel -> unmutated; Confirm -> dagger in bag, toast shown ---
  console.log('Test (b): Class switch away from Scout prompts confirmation');
  const sceneB = createMockScene();
  const valerieB = new Player(sceneB, 5, 5, 'valerie_b', playerData, 'warrior');
  valerieB.entityName = 'Valerie';
  valerieB.activeClass = 'scout';
  valerieB.equippedWeapon = dl.getWeapon('bows')!;
  valerieB.offhandWeapon = dl.getWeapon('daggers')!;
  valerieB.progression.setClassLevel('vanguard', 1);

  toasts.length = 0;
  let promptShown = '';

  // Case b1: User clicks Cancel on the confirmation prompt
  const cancelSwitchSuccess = valerieB.setActiveClass('vanguard', {
    confirmFn: (msg: string) => {
      promptShown = msg;
      return false; // User cancels
    }
  });

  assert.equal(cancelSwitchSuccess, false, 'Class switch must be aborted on Cancel');
  assert.equal(valerieB.activeClass, 'scout', 'Active class must remain scout');
  assert.ok(valerieB.offhandWeapon !== null && valerieB.offhandWeapon.id === 'daggers', 'Dagger must remain equipped');
  assert.equal(
    promptShown,
    "Switching Valerie to Vanguard will unequip Valerie's off-hand Daggers. Continue?",
    `Prompt text must match expected. Got: "${promptShown}"`
  );
  console.log(`  PASS: Cancel preserves Scout class and equipped Dagger; prompt was: "${promptShown}"`);

  // Case b2: User clicks Confirm on the confirmation prompt
  toasts.length = 0;
  const initialDaggerCountB = valerieB.getItemCount('daggers');
  const confirmSwitchSuccess = valerieB.setActiveClass('vanguard', {
    confirmFn: (msg: string) => {
      return true; // User confirms
    }
  });

  assert.equal(confirmSwitchSuccess, true, 'Class switch must succeed on Confirm');
  assert.equal(valerieB.activeClass, 'vanguard', 'Active class must change to vanguard');
  assert.equal(valerieB.offhandWeapon, null, 'Offhand dagger must be unequipped');
  assert.equal(valerieB.getItemCount('daggers'), initialDaggerCountB + 1, 'Dagger must be safely returned to inventory');

  const switchToast = toasts.find(t => t.message.includes("was unequipped: Scout class required"));
  assert.ok(switchToast, `Toast must show unequip reason. Found: ${JSON.stringify(toasts)}`);
  assert.ok(switchToast.duration >= 6000, `Toast duration must be >= 6000ms, got ${switchToast.duration}ms`);
  console.log(`  PASS: Confirm switches class, moves Dagger to bag, and toasts for ${switchToast.duration}ms: "${switchToast.message}"\n`);

  // --- Test (c): Valerie as Scout keeps dagger through save/load, floor transition, Outpost visit, and class unlock ---
  console.log('Test (c): Valerie as Scout keeps dagger through save/load, floor transitions, Outpost visit, and class unlock');
  const gameState = GameState.getInstance();
  gameState.resetToDefault(playerData, 'short_swords', 'Guild Hero');

  // Verify Valerie initial state in GameState
  const partySnapshots = gameState.getPartySnapshots();
  assert.ok(partySnapshots.length >= 2, 'Party should have at least Hero & Valerie');
  const valerieSnap = partySnapshots[1];
  assert.equal(valerieSnap.name, 'Valerie');
  assert.equal(valerieSnap.activeClass, 'scout');
  assert.equal(valerieSnap.equippedWeaponId, 'bows');
  assert.equal(valerieSnap.offhandWeaponId, 'daggers');

  // Create living Valerie player instance from snapshot
  const sceneC = createMockScene();
  const valerieC = new Player(sceneC, 5, 5, 'companion_1', playerData, 'warrior');
  valerieC.restoreFromSnapshot(valerieSnap, 1000);
  assert.equal(valerieC.activeClass, 'scout');
  assert.equal(valerieC.equippedWeapon.id, 'bows');
  assert.ok(valerieC.offhandWeapon !== null, 'Valerie must have offhand weapon');
  assert.equal(valerieC.offhandWeapon!.id, 'daggers');

  // 1. Save and Load
  const savedSnap = valerieC.getSnapshot(1000);
  assert.equal(savedSnap.offhandWeaponId, 'daggers', 'Snapshot must record offhandWeaponId as daggers');
  const valerieLoaded = new Player(sceneC, 5, 5, 'companion_1', playerData, 'warrior');
  valerieLoaded.restoreFromSnapshot(savedSnap, 1000);
  assert.ok(valerieLoaded.offhandWeapon !== null && valerieLoaded.offhandWeapon.id === 'daggers', 'Loaded Valerie must retain offhand dagger');
  console.log('  PASS (1/4): Valerie retains off-hand Dagger across save/load.');

  // 2. Floor Transition simulation (saving party snapshots and restoring on next floor)
  gameState.savePartySnapshot([valerieC], 1000);
  const newFloorParty = gameState.getPartySnapshots();
  const valerieFloor2 = new Player(sceneC, 10, 10, 'companion_1', playerData, 'warrior');
  valerieFloor2.restoreFromSnapshot(newFloorParty[0], 2000);
  assert.ok(valerieFloor2.offhandWeapon !== null && valerieFloor2.offhandWeapon.id === 'daggers', 'Floor transition must preserve offhand dagger');
  console.log('  PASS (2/4): Valerie retains off-hand Dagger across floor transitions.');

  // 3. Outpost visit simulation
  gameState.savePartySnapshot([valerieFloor2], 2000);
  valerieFloor2.recalculateDerivedStats(false);
  assert.ok(valerieFloor2.offhandWeapon !== null && valerieFloor2.offhandWeapon.id === 'daggers', 'Outpost visit must preserve offhand dagger');
  console.log('  PASS (3/4): Valerie retains off-hand Dagger during Outpost visits.');

  // 4. Class unlock simulation: Valerie unlocks a new class (e.g. Marksman or Ranger)
  valerieC.progression.setClassLevel('marksman', 1);
  valerieC.progression.setClassLevel('ranger', 1);
  // Recompute derived stats & check skill unlocks
  valerieC.recalculateDerivedStats(true);
  valerieC.checkSkillUnlocks();
  assert.equal(valerieC.activeClass, 'scout', 'Active class must remain Scout');
  assert.ok(valerieC.offhandWeapon !== null && valerieC.offhandWeapon.id === 'daggers', 'Class unlock must not unequip offhand dagger');
  console.log('  PASS (4/4): Valerie retains off-hand Dagger when new classes are unlocked.\n');

  console.log('ALL VALERIE SIDEARM CONSERVATION TESTS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
