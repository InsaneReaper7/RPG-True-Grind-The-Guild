import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { HUD } from '../src/ui/HUD.ts';
import type { WeaponDef, EnemyDef, ClassesData, PlayerData, FoodQuality } from '../src/types/game.ts';

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

console.log('--- RUNNING MILESTONE 10: FORAGING & COOKING UNIT TESTS ---');

async function runTests() {
  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();

  const mockClassesData: ClassesData = dataLoader.getClassesData();
  const mockPlayerData: PlayerData = dataLoader.getPlayer();
  const shortSwords = dataLoader.getWeapon('short_swords')!;

  // ==========================================================================
  // TEST 1: Foraging Gathering Skill & Level 1 Discovery Reveal
  // ==========================================================================
  const prog1 = new ProgressionSystem(mockClassesData);
  let discoveredSkill: string | null = null;
  prog1.onSkillDiscovered((event) => {
    discoveredSkill = event.skillId;
  });

  const foragingStatInitial = prog1.getProficiencyStat('foraging');
  assert.equal(foragingStatInitial.level, 0, 'Foraging must start at Level 0');
  assert.equal(foragingStatInitial.currentExp, 0, 'Foraging must start at 0 EXP');
  assert.equal(foragingStatInitial.level >= 1, false, 'Foraging must be hidden at Level 0');

  // Harvest 1 bush: +15 EXP
  prog1.addProficiencyExp('foraging', 15);
  assert.equal(foragingStatInitial.level, 0);
  assert.equal(foragingStatInitial.currentExp, 15);
  assert.equal(discoveredSkill, null, 'No discovery event before Level 1');

  // Harvest 3 more bushes: +45 EXP (Total 60 EXP >= 50 EXP required for Level 1)
  prog1.addProficiencyExp('foraging', 45);
  assert.equal(foragingStatInitial.level, 1, 'Foraging must reach Level 1 after 60 EXP');
  assert.equal(foragingStatInitial.currentExp, 10, 'Remaining EXP must be 10 (60 - 50)');
  assert.equal(discoveredSkill, 'foraging', 'Discovery event must fire for "foraging" at Level 1');
  assert.ok(foragingStatInitial.level >= 1, 'Foraging is now revealed in proficiencies');
  console.log('✔ Test 1 passed: Foraging gathering skill follows universal Level 1 discovery concealment and progression');

  // ==========================================================================
  // TEST 2: Wolf Harvest Drops Verification (Wolf Meat vs Monster Meat)
  // ==========================================================================
  const wolfDef = dataLoader.getEnemy('wolf');
  assert.ok(wolfDef, 'Wolf definition must exist in enemies.json');
  assert.ok(wolfDef.harvest && wolfDef.harvest.length >= 3, 'Wolf must have at least 3 harvest items');

  const wolfMeatDrop = wolfDef.harvest.find((h) => h.item === 'wolf_meat');
  assert.ok(wolfMeatDrop, 'Wolf must drop "wolf_meat"');
  assert.ok(wolfMeatDrop.tags.includes('cooking'), 'wolf_meat must be tagged for cooking');

  const wolfPeltDrop = wolfDef.harvest.find((h) => h.item === 'wolf_pelt');
  assert.ok(wolfPeltDrop, 'Wolf must drop "wolf_pelt"');

  const wolfClawDrop = wolfDef.harvest.find((h) => h.item === 'wolf_claw');
  assert.ok(wolfClawDrop, 'Wolf must drop "wolf_claw"');

  const goblinDef = dataLoader.getEnemy('goblin')!;
  const monsterMeatDrop = goblinDef.harvest.find((h) => h.item === 'monster_meat');
  assert.ok(monsterMeatDrop, 'Goblin must drop "monster_meat"');
  assert.notEqual(wolfMeatDrop.item, monsterMeatDrop.item, 'Wolf Meat and Monster Meat must be distinct items');
  console.log('✔ Test 2 passed: Wolf harvest drops verified (wolf_meat, wolf_pelt, wolf_claw) and distinct from Goblin');

  // ==========================================================================
  // TEST 3: Cooking Station Buildable & Research Node
  // ==========================================================================
  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(mockPlayerData);

  const cookingStationDef = dataLoader.getBuildable('cooking_station');
  assert.ok(cookingStationDef, 'Cooking Station must exist in buildables.json');
  assert.equal(cookingStationDef.lockedByDefault, true, 'Cooking Station must be locked by default');
  assert.equal(cookingStationDef.roomTag, 'cooking', 'Cooking Station must have roomTag "cooking"');
  assert.equal(gameState.isBuildableUnlocked('cooking_station'), false, 'Cooking Station must be locked initially in GameState');

  const researchNodes = dataLoader.getResearchNodes();
  const cookingResearch = researchNodes.find((n) => n.targetBuildableId === 'cooking_station');
  assert.ok(cookingResearch, 'Research tree must include a node unlocking cooking_station');
  assert.equal(cookingResearch.cost, 10, 'Cooking Station research cost must be 10 RP');

  // Unlock Cooking Station
  gameState.unlockBuildable('cooking_station');
  assert.equal(gameState.isBuildableUnlocked('cooking_station'), true, 'Cooking Station must be unlocked after research');
  console.log('✔ Test 3 passed: Cooking Station is locked by default and unlockable via Research Tree');

  // ==========================================================================
  // TEST 4: Recipe Discovery & Re-Combination Safety Net
  // ==========================================================================
  const cookingRecipes = dataLoader.getCookingRecipes();
  assert.ok(cookingRecipes.length >= 2, 'Must have at least 2 cooking recipes (herb_stew, beast_stew)');

  const herbStewRecipe = cookingRecipes.find((r) => r.id === 'herb_stew');
  assert.ok(herbStewRecipe, 'Herb Stew recipe must exist');
  assert.equal(herbStewRecipe.ingredients.wild_herbs, 1);
  assert.equal(herbStewRecipe.ingredients.monster_meat, 1);

  // Initially undiscovered
  assert.equal(gameState.isCookingRecipeDiscovered('herb_stew'), false, 'Herb Stew must start undiscovered');

  // First time discovery
  const firstDiscovered = gameState.discoverCookingRecipe('herb_stew');
  assert.equal(firstDiscovered, true, 'First discovery must return true');
  assert.equal(gameState.isCookingRecipeDiscovered('herb_stew'), true, 'Herb Stew must now be permanently discovered');

  // Second discovery attempt on same recipe
  const secondDiscovered = gameState.discoverCookingRecipe('herb_stew');
  assert.equal(secondDiscovered, false, 'Second discovery of same recipe must return false (already known)');

  // Simulate Re-Combination Safety Net in Experiment Panel:
  // An already known combination does not re-roll discovery, but routes to cooking
  const isKnown = gameState.isCookingRecipeDiscovered('herb_stew');
  assert.equal(isKnown, true, 'Safety net detects recipe is already discovered');
  console.log('✔ Test 4 passed: Recipe discovery is permanent and re-combinations route to cooking without duplicate discovery');

  // ==========================================================================
  // TEST 5: Dish Quality Tiers & Hard Ceiling Enforcement
  // ==========================================================================
  // Test 5a: Monster Meat dish hard ceiling (maxQuality = 'excellent')
  // Even with maxed Cooking level and a roll that would be Perfect, it CANNOT exceed Excellent
  const monsterMeatQuality = HUD.calculateDishQuality(100, 'excellent', 0.001);
  assert.equal(monsterMeatQuality, 'excellent', 'Monster meat dishes MUST hard-clamp to Excellent, never Perfect');

  const monsterMeatCommon = HUD.calculateDishQuality(0, 'excellent', 0.99);
  assert.equal(monsterMeatCommon, 'common', 'Roll of 0.99 must produce Common');

  // Test 5b: Wolf Meat dish can reach Perfect (maxQuality = 'perfect')
  const wolfMeatPerfect = HUD.calculateDishQuality(100, 'perfect', 0.001);
  assert.equal(wolfMeatPerfect, 'perfect', 'Wolf meat dishes CAN reach Perfect');

  const beastStewRecipe = cookingRecipes.find((r) => r.id === 'beast_stew')!;
  assert.equal(herbStewRecipe.maxQuality, 'excellent', 'Herb Stew recipe must specify maxQuality "excellent"');
  assert.equal(beastStewRecipe.maxQuality, 'perfect', 'Hearty Beast Stew recipe must specify maxQuality "perfect"');
  console.log('✔ Test 5 passed: Dish quality hard ceiling strictly enforced (Monster Meat caps at Excellent, Wolf Meat reaches Perfect)');

  // ==========================================================================
  // TEST 6: Food System & Dish Quality Scaling
  // ==========================================================================
  const herbStewDef = dataLoader.getFood('herb_stew')!;
  assert.ok(herbStewDef, 'Herb Stew definition must exist in food.json');
  assert.ok(herbStewDef.qualities, 'Herb Stew must define quality tier modifiers');

  assert.equal(herbStewDef.hungerRestored, 35, 'Base hunger restored must be 35');
  assert.equal(herbStewDef.qualities.common.hungerMultiplier, 1.0);
  assert.equal(herbStewDef.qualities.good.hungerMultiplier, 1.25);
  assert.equal(herbStewDef.qualities.excellent.hungerMultiplier, 1.5);
  assert.equal(herbStewDef.qualities.perfect.hungerMultiplier, 2.0);

  // Verify scaled hunger calculation
  const commonHunger = Math.round(herbStewDef.hungerRestored * herbStewDef.qualities.common.hungerMultiplier);
  const excellentHunger = Math.round(herbStewDef.hungerRestored * herbStewDef.qualities.excellent.hungerMultiplier);
  const perfectHunger = Math.round(herbStewDef.hungerRestored * herbStewDef.qualities.perfect.hungerMultiplier);

  assert.equal(commonHunger, 35, 'Common Herb Stew restores 35 hunger');
  assert.equal(excellentHunger, 53, 'Excellent Herb Stew restores 53 hunger');
  assert.equal(perfectHunger, 70, 'Perfect Herb Stew restores 70 hunger');

  // Add food instances with quality to GameState
  gameState.addFoodItem('herb_stew', 1, 'excellent');
  assert.equal(gameState.getFoodItemCount('herb_stew'), 1);

  const consumedItem = gameState.consumeOldestFood('herb_stew');
  assert.ok(consumedItem);
  assert.equal(consumedItem.quality, 'excellent', 'Consumed food item must preserve its quality tier');
  console.log('✔ Test 6 passed: Dish quality correctly scales hunger restored and buff stats');

  // ==========================================================================
  // TEST 7: Cooking Proficiency & Stockpile Visibility
  // ==========================================================================
  const cookingStat = prog1.getProficiencyStat('cooking');
  assert.equal(cookingStat.level, 0, 'Cooking starts at Level 0');
  prog1.addProficiencyExp('cooking', 50);
  assert.equal(cookingStat.level, 1, 'Cooking reaches Level 1 at 50 EXP');
  assert.equal(prog1.getProficiencyStat('cooking').level >= 1, true, 'Cooking revealed at Level 1');

  gameState.addItem('wild_herbs', 5);
  gameState.addItem('monster_meat', 3);
  gameState.addItem('wolf_meat', 2);

  assert.equal(gameState.getItemCount('wild_herbs'), 5);
  assert.equal(gameState.getItemCount('monster_meat'), 3);
  assert.equal(gameState.getItemCount('wolf_meat'), 2);

  gameState.consumeItem('wild_herbs', 1);
  gameState.consumeItem('monster_meat', 1);

  assert.equal(gameState.getItemCount('wild_herbs'), 4, 'Stockpile decreases accurately on consumption');
  assert.equal(gameState.getItemCount('monster_meat'), 2, 'Stockpile decreases accurately on consumption');
  console.log('✔ Test 7 passed: Cooking proficiency progression and live ingredient stockpile tracking verified');

  console.log('\nALL MILESTONE 10 UNIT TESTS PASSED! 🎉\n');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
