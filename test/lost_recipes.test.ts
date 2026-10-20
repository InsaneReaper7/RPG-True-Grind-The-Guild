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
const { ConsumableSystem } = await import('../src/systems/ConsumableSystem.ts');
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
  console.log('--- STARTING LOST RECIPES TEST SUITE ---');
  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const gs = GameState.getInstance();

  // ==========================================
  // Guard 1: Data guard for tiers & scroll IDs (Change 4)
  // ==========================================
  console.log('\n--- Guard 1: Data Guard (Enemies, Tiers, Scroll Items) ---');
  const enemiesData = dl.getEnemiesData();
  const cookingConfig = dl.getCookingConfig();
  const validTiers = Object.keys(cookingConfig.lostRecipeChanceByTier);

  let enemiesWithScrolls = 0;
  for (const enemy of enemiesData.enemies) {
    if (enemy.lostRecipeScrolls && enemy.lostRecipeScrolls.length > 0) {
      enemiesWithScrolls++;
      assert.ok(
        validTiers.includes(enemy.tier),
        `Enemy ${enemy.id} with lostRecipeScrolls must have tier in cookingConfig (${validTiers.join(', ')}), got: ${enemy.tier}`
      );

      for (const scrollId of enemy.lostRecipeScrolls) {
        const itemDef = dl.getItem(scrollId);
        assert.ok(itemDef, `Scroll item ${scrollId} listed in enemy ${enemy.id} must exist in items.json`);
        assert.equal(itemDef.category, 'consumables', `Scroll item ${scrollId} must be category 'consumables'`);
      }
    }
  }
  assert.ok(enemiesWithScrolls >= 3, `Expected at least 3 enemies with lostRecipeScrolls, found ${enemiesWithScrolls}`);
  console.log(`✔ Guard 1 passed: All ${enemiesWithScrolls} enemies with scrolls have valid tiers and existing items.`);

  // ==========================================
  // Guard 2: Grep-style check that CombatSystem holds no 'lost_recipe_' literals (Change 4)
  // ==========================================
  console.log('\n--- Guard 2: CombatSystem.ts Literal Guard ---');
  const combatSystemCode = fs.readFileSync(path.resolve(rootDir, 'src/systems/CombatSystem.ts'), 'utf8');
  assert.ok(
    !combatSystemCode.includes('lost_recipe_'),
    'CombatSystem.ts must contain zero "lost_recipe_" string literals (scroll drops must be data-driven)'
  );
  console.log('✔ Guard 2 passed: CombatSystem.ts is completely data-driven with no hardcoded scroll IDs.');

  // ==========================================
  // Test 9a: Lost recipes cannot be discovered via experimentation
  // ==========================================
  console.log('\n--- Test 9a: Secrecy & Experimentation Lockout ---');
  const mockScene = createMockScene();
  const player = new Player(mockScene, 10, 10, 'hero', {
    hp: 100,
    criticalHp: 100,
    energy: 100,
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: {},
    classLevels: {},
    unlockedClasses: [],
    resources: { wood: 0 }
  });

  // Set cooking level to 50 to unlock 5 slots
  if (player.progression) {
    player.progression.getProficiencyStat('cooking').level = 50;
  }

  // Warlord's Roast: 5 ingredients
  const warlordIngredients = ['prime_crypt_meat', 'garlic', 'onion', 'rosemary', 'black_pepper'];
  for (const id of warlordIngredients) {
    gs.addItem(id, 5);
  }

  // Ensure warlords_roast is not discovered yet
  assert.equal(gs.isCookingRecipeDiscovered('warlords_roast'), false);

  // Experimenting with warlordIngredients should refuse discovery and return Burnt Mush
  const expRes = CookingSystem.experiment(player, warlordIngredients);
  console.log('expRes:', expRes);
  assert.equal(expRes.refusedLostRecipe, true, 'Experimenting lost recipe before reading scroll refuses discovery');
  assert.equal(expRes.success, false);
  assert.equal(gs.isCookingRecipeDiscovered('warlords_roast'), false, 'Recipe remains locked');
  console.log('✔ Test 9a passed: Lost recipe cannot be unlocked via kitchen experimentation.');

  // ==========================================
  // Test 9b: Reading scroll unlocks the recipe
  // ==========================================
  console.log('\n--- Test 9b: Scroll Deciphering ---');
  // Add scroll to player pack
  player.addItem('lost_recipe_warlords_roast', 1);
  assert.equal(player.getItemCount('lost_recipe_warlords_roast'), 1);

  // Use consumable scroll
  const useResult = ConsumableSystem.getInstance().useConsumable('lost_recipe_warlords_roast', {
    party: [player]
  });

  assert.equal(useResult.success, true, 'Scroll usage must succeed');
  assert.equal(player.getItemCount('lost_recipe_warlords_roast'), 0, 'Scroll consumed from inventory');
  assert.equal(gs.isCookingRecipeDiscovered('warlords_roast'), true, 'Warlord\'s Roast is permanently discovered!');

  // Now cooking it known or experimenting works
  const cookRes = CookingSystem.experiment(player, warlordIngredients);
  assert.equal(cookRes.success, true);
  assert.equal(cookRes.dish?.recipeId, 'warlords_roast');
  console.log('✔ Test 9b passed: Deciphering scroll permanently unlocks the lost recipe.');

  // ==========================================
  // Test 9c: Legendary dish party buff fan-out (Change 3)
  // ==========================================
  console.log('\n--- Test 9c: Legendary Party-Wide Buff Fan-Out ---');
  // Let's create a party: leader, companion1 (alive), companion2 (downed)
  const companion1 = new Player(mockScene, 12, 10, 'companion1', {
    hp: 100, criticalHp: 100, energy: 100,
    knownSkillIds: [], equippedSkillIds: [], autocastMap: {}, skillCooldownsRemainingMs: {},
    proficiencies: {}, classLevels: {}, unlockedClasses: [], resources: { wood: 0 }
  });
  const companion2 = new Player(mockScene, 14, 10, 'companion2', {
    hp: 0, criticalHp: 0, energy: 0,
    knownSkillIds: [], equippedSkillIds: [], autocastMap: {}, skillCooldownsRemainingMs: {},
    proficiencies: {}, classLevels: {}, unlockedClasses: [], resources: { wood: 0 }
  });
  companion2.state = 'downed';

  const party = [player, companion1, companion2];

  // Learn Warden's Ossuary Feast (legendary)
  player.addItem('lost_recipe_wardens_ossuary_feast', 1);
  ConsumableSystem.getInstance().useConsumable('lost_recipe_wardens_ossuary_feast', { party });
  assert.equal(gs.isCookingRecipeDiscovered('wardens_ossuary_feast'), true);

  // Cook and eat Warden's Ossuary Feast
  const feastIngredients = ['prime_crypt_meat', 'garlic', 'potato', 'rosemary', 'saffron'];
  for (const id of feastIngredients) {
    gs.addItem(id, 5);
  }
  const feastCook = CookingSystem.experiment(player, feastIngredients);
  assert.equal(feastCook.success, true);
  assert.equal(feastCook.dish?.recipeId, 'wardens_ossuary_feast');

  // Eat Warden's Ossuary Feast
  const eatRes = ConsumableSystem.getInstance().useConsumable('wardens_ossuary_feast', {
    party,
    preferredTarget: player
  });
  assert.equal(eatRes.success, true);

  // Leader has dish_buff
  assert.ok(player.hasStatusEffect('dish_buff'), 'Leader has dish_buff');
  // Alive companion has dish_buff fan-out
  assert.ok(companion1.hasStatusEffect('dish_buff'), 'Alive companion received party dish_buff fan-out');
  // Downed companion skipped
  assert.ok(!companion2.hasStatusEffect('dish_buff'), 'Downed companion was skipped');
  console.log('✔ Test 9c passed: Legendary dishes fan-out party-wide and skip downed members.');

  console.log('\nALL LOST RECIPES TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
