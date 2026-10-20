import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Setup minimal browser globals for Phaser import under Node
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

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

async function runTests() {
  console.log('--- STARTING INGREDIENT BAG TEST SUITE ---');
  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const gs = GameState.getInstance();

  // ==========================================
  // Test 1: Recipe and Armor Definition
  // ==========================================
  console.log('\n--- Test 1: Definition & Crafting Recipe ---');
  const bagArmor = dl.getArmor('ingredient_bag');
  assert.ok(bagArmor, 'ingredient_bag must exist in armors.json');
  assert.equal(bagArmor.slot, 'accessory', 'ingredient_bag must be an accessory slot armor');
  assert.equal(bagArmor.weight, 0.5, 'Bag accessory weight is 0.5 kg');

  const armorsmithRecipes = dl.getArmorsmithRecipesData().recipes;
  const bagRecipe = armorsmithRecipes.find(r => r.resultArmorId === 'ingredient_bag');
  assert.ok(bagRecipe, 'ingredient_bag must have a crafting recipe in armorsmithRecipes.json');
  assert.equal(bagRecipe.requiredLevel, 1, 'Requires Armorsmithing Lv 1');
  assert.equal(bagRecipe.ingredients.wolf_pelt, 3, 'Recipe requires 3 wolf_pelt');
  assert.equal(bagRecipe.ingredients.bowstring, 1, 'Recipe requires 1 bowstring');
  console.log('✔ Test 1 passed: ingredient_bag definition and Lv 1 crafting recipe verified.');

  // ==========================================
  // Test 2: Weight Math (with and without bag)
  // ==========================================
  console.log('\n--- Test 2: Weight Math & Exemption ---');
  const mockScene = createMockScene();
  const player = new Player(mockScene, 10, 10, 'hero', {
    hp: 100, criticalHp: 100, energy: 100,
    knownSkillIds: [], equippedSkillIds: [], autocastMap: {}, skillCooldownsRemainingMs: {},
    proficiencies: {}, classLevels: {}, unlockedClasses: [], resources: { wood: 0 }
  });

  // Base weight without items
  const baseWeight = player.getInventoryWeight();
  assert.equal(baseWeight, 0, 'Empty inventory has 0 weight');

  // Add 10 kg of crypt_meat (crypt_meat weight = 0.3 kg, so 30 cuts = 9 kg)
  player.addItem('crypt_meat', 30);
  const unequippedMeatWeight = player.getInventoryWeight();
  assert.ok(Math.abs(unequippedMeatWeight - 9.0) < 0.01, `Expected ~9.0 kg without bag, got ${unequippedMeatWeight}`);

  // Equip ingredient bag (accessory slot)
  player.equipArmorSlot('accessory', bagArmor, true);
  assert.equal(player.equippedAccessory?.id, 'ingredient_bag');

  // 9 kg of ingredients are fully exempt (up to 15 kg). The bag itself weighs 0.5 kg.
  const invWeight = player.getInventoryWeight();
  assert.equal(invWeight, 0, 'Inventory weight of exempt ingredients is 0 kg');
  const totalWeight = player.getTotalWeight();
  assert.ok(Math.abs(totalWeight - 0.5) < 0.01, `Expected total 0.5 kg (only bag equipped weight), got ${totalWeight}`);

  // Add more meat: 60 cuts of crypt_meat total = 18.0 kg
  player.addItem('crypt_meat', 30);
  // 18.0 kg of meat - 15.0 kg exempt = 3.0 kg remaining + 0.5 kg bag = 3.5 kg
  const heavyInvWeight = player.getInventoryWeight();
  assert.ok(Math.abs(heavyInvWeight - 3.0) < 0.01, `Expected 3.0 kg inventory weight, got ${heavyInvWeight}`);
  const heavyTotalWeight = player.getTotalWeight();
  assert.ok(Math.abs(heavyTotalWeight - 3.5) < 0.01, `Expected 3.5 kg total weight, got ${heavyTotalWeight}`);

  // Unequip bag
  player.equipArmorSlot('accessory', null, true);
  assert.equal(player.equippedAccessory, null);
  const unequippedTotalWeight = player.getInventoryWeight();
  assert.ok(Math.abs(unequippedTotalWeight - 18.0) < 0.01, `Expected full 18.0 kg unequipped, got ${unequippedTotalWeight}`);
  console.log('✔ Test 2 passed: 15 kg exemption math and unequipped full weight verified.');

  // ==========================================
  // Test 3: Returning run auto-deposits ingredients, leaving bag empty of ingredients
  // ==========================================
  console.log('\n--- Test 3: Auto-Deposit on Return ---');
  // Re-equip bag
  player.equipArmorSlot('accessory', bagArmor, true);
  assert.equal(player.getItemCount('crypt_meat'), 60);

  // Return to outpost: autoDepositPartyMaterials
  const depositRes = gs.autoDepositPartyMaterials([player]);
  assert.ok(depositRes.depositedCount >= 60, `Deposited at least 60 items, got ${depositRes.depositedCount}`);

  // Bag is now empty of ingredients
  assert.equal(player.getItemCount('crypt_meat'), 0, 'Player bag has 0 crypt_meat after returning to outpost');
  assert.equal(player.equippedAccessory?.id, 'ingredient_bag', 'Ingredient bag remains equipped in accessory slot');
  assert.ok(gs.getItemCount('crypt_meat') >= 60, 'Stockpile received the 60 crypt_meat');
  console.log('✔ Test 3 passed: Auto-deposit empties ingredients into stockpile on return while keeping bag equipped.');

  console.log('\nALL INGREDIENT BAG TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
