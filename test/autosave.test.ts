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
  const mockStorage: Record<string, string> = {};
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
    localStorage: (global as any).localStorage
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
    getElementById: () => null,
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
import { isCraftingClass, getBaseItemId, resolveGearStats } from '../src/utils/gearResolver.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { PlayerData, WeaponDef, ArmorDef } from '../src/types/game.ts';

const mockPlayerData: PlayerData = {
  id: 'test_crafter',
  name: 'Valerie',
  maxHp: 60,
  criticalHpMax: 30,
  maxEnergy: 50,
  moveSpeed: 100,
  attackRangeTiles: 1,
  energyRegenPerSecond: 1,
  hpRegenPerSecond: 0.5,
  baseCarryCapacity: 50,
  knownSkillIds: [],
  equippedSkillIds: []
};

async function runTests() {
  const { Player } = await import('../src/entities/Player.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');

  function createMockScene(): any {
    const createMockObj = () => {
      const obj: any = {
        on: () => obj,
        once: () => obj,
        off: () => obj,
        emit: () => obj,
        destroy: () => {},
        setOrigin: () => obj,
        setDepth: () => obj,
        setLineWidth: () => obj,
        setVisible: () => obj,
        setAngle: () => obj,
        setAlpha: () => obj,
        setTint: () => obj,
        clearTint: () => obj,
        setInteractive: () => obj,
        play: () => obj,
        anims: { play: () => {} },
        clear: () => obj,
        fillStyle: () => obj,
        fillRect: () => obj,
        lineStyle: () => obj,
        strokeRect: () => obj,
        strokeLineShape: () => obj,
        beginPath: () => obj,
        moveTo: () => obj,
        lineTo: () => obj,
        strokePath: () => obj,
        setText: () => obj,
        setColor: () => obj,
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
      tileSize: 32,
      sound: { play: () => {} },
      time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
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
        existing: (item: any) => item
      },
      tweens: {
        add: (config: any) => {
          if (config && config.onComplete) config.onComplete();
          return { stop: () => {} };
        }
      }
    };
  }

  const mockScene = createMockScene();
  const fistWeapon: WeaponDef = {
    id: 'fist',
    name: 'Fist',
    category: 'unarmed',
    twoHanded: false,
    attackIntervalMs: 750,
    baseDamage: 4,
    baseAccuracy: 0.65
  };

  function createTestPlayer(data: PlayerData = mockPlayerData, prog?: ProgressionSystem): Player {
    return new Player(mockScene, 0, 0, data, fistWeapon, 32, 'avatar_hero', prog);
  }

  console.log('=== Running Crafting Mastery Apprentice Tests ===\n');

  // 1. Load Data
  const dl = DataLoader.getInstance();
  await dl.loadAll();
  const gameState = GameState.getInstance();
  gameState.resetToDefault();

  console.log('✔ DataLoader initialized.');

  console.log('=== AUTOSAVE: craft / cook / build / tutorial (owner request 2026-11-15) ===');
  const { TutorialSystem } = await import('../src/systems/TutorialSystem.ts');
  const { CookingSystem } = await import('../src/systems/CookingSystem.ts');
  if (!(gameState as any).snapshot) gameState.initFromPlayerData(mockPlayerData as any);
  assert.ok((gameState as any).snapshot, 'GameState has a snapshot');

  const saves: string[] = [];
  gameState.setAutosaveHandler((reasons) => { saves.push(reasons); });

  // 1. Crafting at a station (CraftingSystem.applyCraft, shared by all 9 stations)
  const player = createTestPlayer();
  gameState.addItem('ore', 100);
  gameState.addItem('wood', 100);
  const mace = dl.getBlacksmithRecipes().find((r) => r.id === 'mace')!;
  assert.ok(CraftingSystem.applyCraft(player, mace, 'blacksmithing').success, 'craft succeeded');
  assert.equal(gameState.hasPendingAutosave(), true, 'craft requests an autosave');
  assert.equal(gameState.flushAutosave(), true);
  assert.deepEqual(saves, ['craft']);
  console.log('✔ Crafting autosaves');

  // 2. Batch crafting: 3 crafts in a row are merged into ONE save
  saves.length = 0;
  CraftingSystem.applyCraft(player, mace, 'blacksmithing');
  CraftingSystem.applyCraft(player, mace, 'blacksmithing');
  CraftingSystem.applyCraft(player, mace, 'blacksmithing');
  await new Promise((r) => setTimeout(r, GameState.AUTOSAVE_DEBOUNCE_MS + 100));
  assert.deepEqual(saves, ['craft'], 'three crafts -> exactly one debounced save');
  console.log('✔ Batch crafts are merged into one save (debounced)');

  // 3. A failed craft does not save
  saves.length = 0;
  const poor = createTestPlayer();
  gameState.inventory.clear();
  (gameState as any).resources = { ...(gameState as any).resources, wood: 0 };
  const failed = CraftingSystem.applyCraft(poor, mace, 'blacksmithing');
  assert.equal(failed.success, false, 'craft without materials fails');
  assert.equal(gameState.hasPendingAutosave(), false, 'failed craft requests no save');
  console.log('✔ Failed crafts do not save');

  // 4. Cooking (experiment and known recipes both go through CookingSystem.experiment)
  saves.length = 0;
  player.addItem('crypt_meat', 2);
  player.addItem('wild_herbs', 2);
  const cooked = CookingSystem.experiment(player, ['crypt_meat', 'wild_herbs']);
  assert.ok(cooked.success, 'cooking succeeded');
  gameState.flushAutosave();
  assert.deepEqual(saves, ['cook']);
  console.log('✔ Cooking autosaves');

  // 5. Placing and demolishing a structure
  saves.length = 0;
  gameState.addPlacedBuildable({ id: 'wooden_wall', x: 3, y: 4 } as any);
  gameState.flushAutosave();
  gameState.removePlacedBuildable(3, 4);
  gameState.flushAutosave();
  assert.deepEqual(saves, ['build', 'demolish']);
  console.log('✔ Building and demolishing autosave');

  // 6. Completing a tutorial step, and finishing the tutorial
  saves.length = 0;
  const tut = TutorialSystem.getInstance();
  tut.reset();
  assert.equal(tut.advanceStep(), true, 'tutorial step advanced');
  gameState.flushAutosave();
  assert.deepEqual(saves, ['tutorial']);
  saves.length = 0;
  tut.completeTutorial();
  gameState.flushAutosave();
  assert.deepEqual(saves, ['tutorial']);
  console.log('✔ Tutorial steps autosave');

  // 7. Mixed actions in one window are reported together
  saves.length = 0;
  gameState.addPlacedBuildable({ id: 'wooden_wall', x: 5, y: 5 } as any);
  gameState.addItem('ore', 100); gameState.addItem('wood', 100);
  CraftingSystem.applyCraft(player, mace, 'blacksmithing');
  gameState.flushAutosave();
  assert.deepEqual(saves, ['build, craft']);
  console.log('✔ One save covers several actions');

  // 8. No handler (dungeon): nothing is written mid-floor; no handler + safe zone keeps the old immediate save
  saves.length = 0;
  gameState.setAutosaveHandler(null);
  gameState.setSafeZone(false);
  let diskWrites = 0;
  const realSave = gameState.saveToDisk.bind(gameState);
  (gameState as any).saveToDisk = () => { diskWrites++; return true; };
  gameState.addPlacedBuildable({ id: 'wooden_wall', x: 6, y: 6 } as any);
  assert.equal(diskWrites, 0, 'dungeon: no mid-floor disk write');
  assert.equal(gameState.hasPendingAutosave(), false);
  gameState.setSafeZone(true);
  gameState.addPlacedBuildable({ id: 'wooden_wall', x: 7, y: 7 } as any);
  assert.equal(diskWrites, 1, 'safe zone without handler: immediate save (previous behaviour)');
  (gameState as any).saveToDisk = realSave;
  console.log('✔ No mid-floor saves in the dungeon; safe-zone fallback unchanged');

  console.log('\nALL AUTOSAVE TESTS PASSED');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
