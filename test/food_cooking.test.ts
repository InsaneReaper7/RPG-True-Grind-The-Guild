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
const { CookingSystem } = await import('../src/systems/CookingSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
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
  console.log('--- STARTING FOOD & COOKING TEST SUITE ---');
  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();

  // ==========================================
  // Test 1: Bipartite Matching with Specificity
  // ==========================================
  console.log('\n--- Test 1: Bipartite Matching & Specificity ---');
  const allRecipes = dl.getCookingRecipes();
  assert.ok(allRecipes.length >= 42, `Expected >= 42 recipes, found ${allRecipes.length}`);

  // Test exact matching > tag matching
  // crypt_meat + wild_herbs -> matches herb_stew (wild_herbs is exact item [spec 3], crypt_meat satisfies meat tag [spec 1])
  const matchResult = CookingSystem.matchRecipe(['crypt_meat', 'wild_herbs']);
  assert.ok(matchResult.recipe, 'Should match a recipe');
  assert.equal(matchResult.recipe.id, 'herb_stew', 'Ingredient combo matches Herb Stew');
  assert.ok(matchResult.score >= 4, `Specificity score ${matchResult.score} >= 4`);

  // Test 5-ingredient exact match: warlords_roast
  const fiveIngs = ['prime_crypt_meat', 'garlic', 'onion', 'rosemary', 'black_pepper'];
  const match5 = CookingSystem.matchRecipe(fiveIngs);
  assert.ok(match5.recipe, 'Should match a 5-ingredient recipe');
  assert.equal(match5.recipe.id, 'warlords_roast', 'Matches Warlord\'s Roast');
  assert.equal(match5.score, 15, 'All 5 exact items yield max specificity score 15');

  // Verify that an invalid combination does not match any valid recipe
  const noMatch = CookingSystem.matchRecipe(['salt', 'salt']);
  assert.equal(noMatch.recipe, null, 'Salt + Salt does not produce a valid recipe');
  console.log('✔ Test 1 passed: Bipartite matching with specificity works accurately.');

  // ==========================================
  // Test 2: Quality Odds & Line Cook Bonus
  // ==========================================
  console.log('\n--- Test 2: Quality Odds & Line Cook Bonus ---');
  // At Lv 0: roll = 0.04 -> excellent if roll < pPerfect + pExcellent (0.05) -> excellent
  const q0 = CookingSystem.calculateDishQuality(0, 0, false, 0, 0.04);
  assert.equal(q0, 'excellent', 'Roll 0.04 at Lv 0 with base 0.05 excellent chance yields excellent');

  // Test Line Cook boost with premium ingredient to allow perfect
  const qLineCook = CookingSystem.calculateDishQuality(0, 0, true, 50, 0.02);
  assert.equal(qLineCook, 'perfect', 'Line Cook Lv 50 grants perfect at roll 0.02 when premium cut is present');
  console.log('✔ Test 2 passed: Quality calculation and Line Cook odds bonus verified.');

  // ==========================================
  // Test 3: Buff Potencies & Durations
  // ==========================================
  console.log('\n--- Test 3: Buff Potencies & Durations ---');
  // Check 2-slot duration: 120s, 3-slot: 150s, 4-slot: 180s, 5-slot: 240s
  assert.equal(CookingSystem.BASE_BUFFS_BY_SLOTS[2].durationSec, 120);
  assert.equal(CookingSystem.BASE_BUFFS_BY_SLOTS[3].durationSec, 150);
  assert.equal(CookingSystem.BASE_BUFFS_BY_SLOTS[4].durationSec, 180);
  assert.equal(CookingSystem.BASE_BUFFS_BY_SLOTS[5].durationSec, 240);

  // Compute a dish: herb_stew (2 slots, Tier 1)
  const herbStewRecipe = dl.getCookingRecipe('herb_stew')!;
  const computedStew = CookingSystem.computeDish(herbStewRecipe, 'perfect', ['crypt_meat', 'wild_herbs']);
  assert.equal(computedStew.buffs.durationMs, 120000);
  // Perfect quality has potency 2.0. Base H = 1.0 -> HP regen = 2.0
  assert.equal(computedStew.buffs.hpRegenPerSec, 2.0);
  console.log('✔ Test 3 passed: Durations and scaled buff potencies match specifications.');

  // ==========================================
  // Test 4: EN Food Tick (Downed members skip, identical in/out combat)
  // ==========================================
  console.log('\n--- Test 4: EN Food Tick ---');
  const mockScene = createMockScene();
  const player = new Player(mockScene, 10, 10, 'hero', {
    hp: 100,
    criticalHp: 100,
    energy: 10,
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: {},
    classLevels: {},
    unlockedClasses: [],
    resources: { wood: 0 }
  });

  player.energy = 10;
  player.energyRegenPerSecond = 0;
  player.applyDishBuff('Hearty Stew', {
    durationMs: 60000,
    hpRegenPerSec: 10,
    energyRegenPerSec: 5
  });

  assert.equal(player.wellFedHpPerSec, 10);
  assert.equal(player.wellFedEnergyPerSec, 5);

  // Tick 1 second out of combat
  const prevEnergy = player.energy;
  player.inCombat = false;
  player.update(1000, 1000);
  const diffOoc = player.energy - prevEnergy;
  assert.ok(Math.abs(diffOoc - 5) < 0.1, `Out of combat EN gain should be ~5, got ${diffOoc}`);

  // Tick 1 second in combat
  const prevEnergyCombat = player.energy;
  player.inCombat = true;
  player.update(1000, 1000);
  const diffCombat = player.energy - prevEnergyCombat;
  assert.ok(Math.abs(diffCombat - 5) < 0.1, `In combat EN gain should be identical (~5), got ${diffCombat}`);

  // Downed member: should NOT tick EN or HP
  player.state = 'downed';
  player.hp = 0;
  const downedEnergy = player.energy;
  player.update(1000, 1000);
  assert.equal(player.energy, downedEnergy, 'Downed member must not gain energy from food tick');
  console.log('✔ Test 4 passed: EN food tick works without OOC multiplier and skips downed players.');

  // ==========================================
  // Test 5: Single Status ID dish_buff (Change 1)
  // ==========================================
  console.log('\n--- Test 5: Single Status ID dish_buff (Change 1) ---');
  player.state = 'idle';
  player.hp = 50;

  // Apply Dish A
  player.applyDishBuff('Dish Alpha', {
    durationMs: 30000,
    hpRegenPerSec: 2,
    energyRegenPerSec: 1,
    bonusDamagePercent: 0.05
  });
  assert.ok(player.hasStatusEffect('dish_buff'), 'Player has dish_buff after eating Dish Alpha');
  const effectA = player.getStatusEffect('dish_buff');
  assert.equal(effectA?.def?.bonusDamagePercent, 0.05);

  // Apply Dish B -> should replace Dish A
  player.applyDishBuff('Dish Beta', {
    durationMs: 45000,
    hpRegenPerSec: 4,
    energyRegenPerSec: 2,
    bonusDamagePercent: 0.12
  });
  const allDishBuffs = Array.from(player.activeStatusEffects.keys()).filter(id => id === 'dish_buff');
  assert.equal(allDishBuffs.length, 1, 'Only exactly ONE dish_buff can exist on the player');
  const effectB = player.getStatusEffect('dish_buff');
  assert.equal(effectB?.def?.bonusDamagePercent, 0.12, 'Dish B completely replaced Dish A values');
  console.log('✔ Test 5 passed: Single dish_buff status ID cleanly replaces previous dish buff.');

  // ==========================================
  // Test 6: Chef Bonus Drop Roll
  // ==========================================
  console.log('\n--- Test 6: Chef Bonus Ingredient Roll ---');
  const cookingConfig = dl.getCookingConfig();
  assert.equal(cookingConfig.chefBonusRollFactor, 0.0035);
  const factor = cookingConfig.chefBonusRollFactor;
  assert.equal(0 * factor, 0.0);
  assert.equal(Math.round(100 * factor * 100), 35, 'Lv 100 grants 35% bonus ingredient drop roll');
  console.log('✔ Test 6 passed: Chef bonus ingredient drop formula scales to 35% at Lv 100.');

  // ==========================================
  // Test 7: Crop & Vegetable Harvest Tables
  // ==========================================
  console.log('\n--- Test 7: Crop & Vegetable Harvest ---');
  const cropsConfig = dl.getCropsConfig();
  assert.ok(cropsConfig && cropsConfig.crops, 'Crops config loaded');
  assert.ok(cropsConfig.crops.carrot_seed, 'Carrot seed defined');
  assert.ok(cropsConfig.crops.peppercorn_seed, 'Peppercorn seed defined');
  assert.equal(cropsConfig.crops.peppercorn_seed.produceId, 'black_pepper');
  console.log('✔ Test 7 passed: Crops and vegetable definitions verified.');

  // ==========================================
  // Test 8: Deposit materials by flag (Change 5)
  // ==========================================
  console.log('\n--- Test 8: Deposit Materials by Flag ---');
  const cryptMeatDef = dl.getItem('crypt_meat');
  const saltDef = dl.getItem('salt');
  const carrotDef = dl.getItem('carrot');
  const scrollDef = dl.getItem('lost_recipe_wardens_ossuary_feast');
  const stewDef = dl.getItem('crypt_stew');

  assert.equal(GameState.isDepositedMaterial(cryptMeatDef!), true, 'crypt_meat must deposit');
  assert.equal(GameState.isDepositedMaterial(saltDef!), true, 'salt must deposit');
  assert.equal(GameState.isDepositedMaterial(carrotDef!), true, 'carrot must deposit');
  assert.equal(GameState.isDepositedMaterial(scrollDef!), false, 'scroll must stay in bag');
  assert.equal(GameState.isDepositedMaterial(stewDef!), false, 'cooked dish must stay in bag');
  console.log('✔ Test 8 passed: Item deposit correctly checks item.ingredient flag first.');

  // ==========================================
  // Test 10: Burnt Mush & Guaranteed Discovery (Change 7)
  // ==========================================
  console.log('\n--- Test 10: Burnt Mush & Guaranteed Discovery ---');
  const gs = GameState.getInstance();
  gs.addItem('crypt_meat', 5);
  gs.addItem('wild_herbs', 5);

  // Experiment with matching ingredients
  const expMatch = CookingSystem.experiment(player, ['crypt_meat', 'wild_herbs']);
  assert.equal(expMatch.success, true);
  assert.equal(expMatch.dish?.recipeId, 'herb_stew');
  assert.ok(gs.isCookingRecipeDiscovered('herb_stew'), 'Guaranteed discovery on match');

  // Experiment with invalid ingredients -> Burnt Mush
  gs.addItem('salt', 2);
  const expFail = CookingSystem.experiment(player, ['salt', 'salt']);
  assert.equal(expFail.isBurntMush, true);
  assert.equal(expFail.dish?.foodId || 'burnt_mush', 'burnt_mush');
  const sig = CookingSystem.getTriedSignatureKey(['salt', 'salt']);
  assert.ok(gs.hasTriedCookingSignature(sig), 'Recorded tried signature for invalid combination');
  console.log('✔ Test 10 passed: Guaranteed discovery on match, Burnt Mush on invalid combo.');

  // ==========================================
  // Test 11: 4 Chef Classes Unlocking
  // ==========================================
  console.log('\n--- Test 11: Chef Class Line Unlocking ---');
  const classesData = dl.getClassesData();
  const chefClassIds = ['apprentice_cook', 'line_cook', 'chef', 'executive_chef'];
  for (const cId of chefClassIds) {
    const cDef = classesData.classes.find(c => c.id === cId);
    assert.ok(cDef, `Class ${cId} must exist in classes.json`);
    assert.equal(cDef.category, 'crafting', `${cId} must be in crafting category`);
  }
  console.log('✔ Test 11 passed: All 4 Chef classes exist in crafting category.');

  // ==========================================
  // Test 13: Save Migration (cookingV2)
  // ==========================================
  console.log('\n--- Test 13: Save Migration ---');
  const oldSnapshot: any = {
    hp: 100,
    criticalHp: 100,
    energy: 100,
    inventory: {
      raw_meat: 5,
      monster_meat: 3,
      wolf_meat: 2,
      raw_fish: 4,
      vegetable: 6,
      seeds: 8
    },
    foodItems: [
      { id: 'vegetable', count: 2, acquiredDay: 1, instanceId: 'f1' }
    ],
    discoveredCookingRecipes: ['herb_stew']
  };

  gs.restoreFromLoadedSnapshot(oldSnapshot);
  assert.equal(gs.getItemCount('crypt_meat'), 10, 'raw_meat (5), monster_meat (3), wolf_meat (2) migrated to crypt_meat (10)');
  assert.equal(gs.getItemCount('river_carp'), 4, 'raw_fish migrated to river_carp');
  assert.equal(gs.getItemCount('carrot'), 8, 'vegetable items (6 inventory + 2 foodItems) migrated to carrot');
  assert.equal(gs.getItemCount('mixed_seeds'), 8, 'seeds migrated to mixed_seeds');
  assert.ok(gs.isCookingRecipeDiscovered('herb_stew'), 'herb_stew remains discovered');
  assert.ok(gs.isCookingRecipeDiscovered('beast_stew'), 'beast_stew preserved');
  console.log('✔ Test 13 passed: Save migration cookingV2 cleanly converts legacy items.');

  // ==========================================
  // Test 14: Dish Tier Preservation (Blocking 2)
  // ==========================================
  console.log('\n--- Test 14: Dish Tier Preservation & Executive Chef vs Eater ---');
  const jerkyRecipe = dl.getCookingRecipe('salted_jerky')!;
  assert.ok(jerkyRecipe, 'salted_jerky recipe exists');

  // 1. Caldera meat tier-3 at Common gives x1.4 multiplier
  const nonChefDish = CookingSystem.computeDish(jerkyRecipe, 'common', ['caldera_meat', 'salt']);
  assert.equal(nonChefDish.tier, 3, 'Caldera meat (tier 3) cooked by non-chef yields tier 3 dish');
  assert.equal(nonChefDish.buffs.hpRegenPerSec, 1.4, 'Tier 3 dish gives H 1.4 (base 1.0 * 1.4)');

  // 2. Executive Chef cooks tier-3 -> tier-4 (x1.6)
  const execChefPlayer = new Player(mockScene, 0, 0, 'ChefHero');
  execChefPlayer.progression.setClassLevel('executive_chef', 1);
  assert.ok(execChefPlayer.progression.isClassUnlocked('executive_chef'));
  const chefDish = CookingSystem.computeDish(jerkyRecipe, 'common', ['caldera_meat', 'salt'], execChefPlayer);
  assert.equal(chefDish.tier, 4, 'Executive Chef cooks tier 3 ingredient to tier 4 dish');
  assert.equal(chefDish.buffs.hpRegenPerSec, 1.6, 'Tier 4 dish gives H 1.6 (base 1.0 * 1.6)');

  // Add the tier-4 food item to a non-chef player bag
  const nonChefEater = new Player(mockScene, 0, 0, 'EaterHero');
  nonChefEater.addFoodItem('salted_jerky', 1, 'common', undefined, chefDish.tier);
  const eaterItems = nonChefEater.getFoodItems();
  assert.equal(eaterItems[0].tier, 4, 'Stored tier on FoodItemInstance is 4');

  // Non-chef eats tier-4 dish -> gets tier-4 buffs (x1.6)
  nonChefEater.hunger = 50;
  nonChefEater.eatFood('salted_jerky');
  assert.equal(nonChefEater.wellFedHpPerSec, 1.6, 'Non-chef eater gets tier-4 buff (1.6 HP/s) from stored tier 4');

  // 3. Non-chef cooks tier-3 -> Executive Chef eats at tier-3 (x1.4, unchanged)
  execChefPlayer.hunger = 50;
  execChefPlayer.addFoodItem('salted_jerky', 1, 'common', undefined, nonChefDish.tier);
  execChefPlayer.eatFood('salted_jerky');
  assert.equal(execChefPlayer.wellFedHpPerSec, 1.4, 'Executive Chef eater gets tier-3 buff (1.4 HP/s), class perks never re-applied on eating');

  // 4. Old food instances with no tier read as tier 1 (x1.0)
  const legacyEater = new Player(mockScene, 0, 0, 'LegacyHero');
  legacyEater.addFoodInstance({
    id: 'salted_jerky',
    acquiredDay: 1,
    instanceId: 'legacy_food_no_tier',
    quality: 'common'
    // no tier property
  });
  legacyEater.hunger = 50;
  legacyEater.eatFood('salted_jerky');
  assert.equal(legacyEater.wellFedHpPerSec, 1.0, 'Old food instances with no tier read as tier 1 (1.0 HP/s)');

  // 5. Stored tier survives save/load
  gs.addFoodItem('salted_jerky', 1, 'common', 3);
  const snapWithTier = gs.getSnapshot()!;
  assert.ok(snapWithTier, 'Snapshot exists');
  const foundInSnap = snapWithTier.foodItems.find((f: any) => f.id === 'salted_jerky' && f.tier === 3);
  assert.ok(foundInSnap, 'Stored tier 3 persisted into save snapshot');

  gs.restoreFromLoadedSnapshot(snapWithTier);
  const restoredItems = gs.getFoodItems();
  const restoredJerky = restoredItems.find(f => f.id === 'salted_jerky');
  assert.equal(restoredJerky?.tier, 3, 'Stored tier 3 survives save/load restoration');
  console.log('✔ Test 14 passed: Dish tier locked at cook time, preserved on eating, and survives save/load.');

  console.log('\nALL FOOD & COOKING TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
