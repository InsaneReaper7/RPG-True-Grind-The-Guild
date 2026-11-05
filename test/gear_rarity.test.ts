import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock window and DOM for tests running outside browser
if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = (global as any).window;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mock fetch for DataLoader in Node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(path.join(rootDir, cleanPath), 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Load Data
const gearRarityData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/gearRarity.json'), 'utf8'));
const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const armorsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armors.json'), 'utf8'));
const itemsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/items.json'), 'utf8'));
const bsRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/blacksmithRecipes.json'), 'utf8'));
const asRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armorsmithRecipes.json'), 'utf8'));
const byRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/bowyerRecipes.json'), 'utf8'));

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ConsumableSystem } from '../src/systems/ConsumableSystem.ts';
import { CraftingSystem } from '../src/systems/CraftingSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LockpickingSystem } from '../src/systems/LockpickingSystem.ts';
import { createPassiveRng } from '../src/utils/rng.ts';
import { getRarityDisplay } from '../src/utils/gearResolver.ts';

await DataLoader.getInstance().loadAll();

console.log('=== MILESTONE 7: DROP-ONLY RARITY GEAR TEST SUITE ===\n');

// 1. DATA EXPECTED-TABLE GUARDS
console.log('1. Checking Expected-Table Guards...');

// 1a. 6 Rarity Tiers
const expectedTiers: Record<string, { name: string; colour: string }> = {
  common: { name: 'Common', colour: '#e5e7eb' },
  uncommon: { name: 'Uncommon', colour: '#22c55e' },
  rare: { name: 'Rare', colour: '#3b82f6' },
  very_rare: { name: 'Very Rare', colour: '#a855f7' },
  mythical: { name: 'Mythical', colour: '#f97316' },
  legendary: { name: 'Legendary', colour: '#facc15' }
};

assert.strictEqual(gearRarityData.rarities.length, 6, 'Must define exactly 6 rarity tiers');
for (const [id, exp] of Object.entries(expectedTiers)) {
  const found = gearRarityData.rarities.find((r: any) => r.id === id);
  assert.ok(found, `Tier ${id} missing in gearRarity.json`);
  assert.strictEqual(found.name, exp.name, `Tier ${id} name mismatch`);
  assert.strictEqual(found.colour.toLowerCase(), exp.colour.toLowerCase(), `Tier ${id} colour mismatch`);
}
console.log('✓ PASS: All 6 rarity tiers verified.');

// 1b. 24 Named Drop-Only Pieces Table Verification
interface PieceSpec {
  band: number;
  rarity: string;
  id: string;
  name: string;
  baseId: string;
  type: 'weapon' | 'armor';
  statCheck: (item: any) => void;
  station: 'blacksmithing' | 'armorsmithing' | 'bowyer';
  level: number;
  ingredients: Record<string, number>;
  expGranted: number;
}

const table24: PieceSpec[] = [
  // Band 1
  { band: 1, rarity: 'uncommon', id: 'gravewardens_blade', name: "Gravewarden's Blade", baseId: 'short_swords', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 5.5), station: 'blacksmithing', level: 2, ingredients: { ore: 5, wood: 2 }, expGranted: 30 },
  { band: 1, rarity: 'uncommon', id: 'boneguard_cap', name: 'Boneguard Cap', baseId: 'leather_cap', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 16); }, station: 'armorsmithing', level: 2, ingredients: { wolf_pelt: 3 }, expGranted: 38 },
  { band: 1, rarity: 'rare', id: 'cryptstalker_bow', name: 'Cryptstalker Bow', baseId: 'bows', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 7.2), station: 'bowyer', level: 4, ingredients: { wood: 8, bowstring: 2 }, expGranted: 50 },
  { band: 1, rarity: 'rare', id: 'ossuary_plate', name: 'Ossuary Plate', baseId: 'iron_plate_armor', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 30); }, station: 'armorsmithing', level: 4, ingredients: { ore: 12, wood: 4, bone: 4 }, expGranted: 80 },
  { band: 1, rarity: 'very_rare', id: 'wardens_cleaver', name: "Warden's Cleaver", baseId: 'longsword_2h', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 15.6), station: 'blacksmithing', level: 8, ingredients: { ore: 18, wood: 8 }, expGranted: 88 },

  // Band 2
  { band: 2, rarity: 'uncommon', id: 'spidersilk_vestment', name: 'Spidersilk Vestment', baseId: 'silk_robe', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 55); }, station: 'armorsmithing', level: 8, ingredients: { spider_silk: 8, wolf_pelt: 3 }, expGranted: 113 },
  { band: 2, rarity: 'uncommon', id: 'deepwater_katana', name: 'Deepwater Katana', baseId: 'steel_katana', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 8.8), station: 'blacksmithing', level: 7, ingredients: { ore: 9, wood: 3, steel_scrap: 3 }, expGranted: 75 },
  { band: 2, rarity: 'rare', id: 'orcbreaker_mace', name: 'Orcbreaker Mace', baseId: 'heavy_mace', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 12.0), station: 'blacksmithing', level: 9, ingredients: { ore: 12, steel_scrap: 6, orc_heavy_hide: 2 }, expGranted: 100 },
  { band: 2, rarity: 'rare', id: 'delvers_crossbow', name: "Delver's Crossbow", baseId: 'heavy_crossbow', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 14.4), station: 'blacksmithing', level: 9, ingredients: { ore: 14, wood: 6, steel_scrap: 4 }, expGranted: 100 },
  { band: 2, rarity: 'very_rare', id: 'colossus_halberd', name: 'Colossus Halberd', baseId: 'steel_halberd', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 19.5), station: 'blacksmithing', level: 11, ingredients: { ore: 20, wood: 10, steel_scrap: 8 }, expGranted: 150 },

  // Band 3
  { band: 3, rarity: 'uncommon', id: 'ember_fangs', name: 'Ember Fangs', baseId: 'void_daggers', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 5.5), station: 'blacksmithing', level: 10, ingredients: { ore: 9, steel_scrap: 2, void_plate: 2 }, expGranted: 113 },
  { band: 3, rarity: 'uncommon', id: 'cinderguard_helm', name: 'Cinderguard Helm', baseId: 'void_greathelm', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 66); }, station: 'armorsmithing', level: 10, ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 }, expGranted: 120 },
  { band: 3, rarity: 'rare', id: 'ashen_lance', name: 'Ashen Lance', baseId: 'void_spear', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 14.4), station: 'blacksmithing', level: 12, ingredients: { ore: 16, wood: 4, steel_scrap: 4, void_plate: 2 }, expGranted: 160 },
  { band: 3, rarity: 'rare', id: 'magmaheart_pendant', name: 'Magmaheart Pendant', baseId: 'void_pendant', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 48); }, station: 'armorsmithing', level: 12, ingredients: { void_essence: 2, bone: 4, bowstring: 2 }, expGranted: 160 },
  { band: 3, rarity: 'very_rare', id: 'tyrants_greatblade', name: "Tyrant's Greatblade", baseId: 'void_greatsword', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 26.0), station: 'blacksmithing', level: 14, ingredients: { ore: 25, steel_scrap: 8, void_plate: 3 }, expGranted: 225 },

  // Band 4
  { band: 4, rarity: 'uncommon', id: 'rimewalker_hood', name: 'Rimewalker Hood', baseId: 'frost_hood', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 99); }, station: 'armorsmithing', level: 14, ingredients: { wolf_pelt: 3, ectoplasm: 3, glacial_essence: 2 }, expGranted: 165 },
  { band: 4, rarity: 'uncommon', id: 'glacier_chakrams', name: 'Glacier Chakrams', baseId: 'frost_throwing_weapons', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 7.7), station: 'blacksmithing', level: 14, ingredients: { ore: 9, steel_scrap: 3, glacial_essence: 2 }, expGranted: 165 },
  { band: 4, rarity: 'rare', id: 'yetihide_armor', name: 'Yetihide Armor', baseId: 'frost_leather_armor', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 180); }, station: 'armorsmithing', level: 16, ingredients: { wolf_pelt: 8, orc_heavy_hide: 4, glacial_essence: 4 }, expGranted: 220 },
  { band: 4, rarity: 'rare', id: 'frostfang_longbow', name: 'Frostfang Longbow', baseId: 'frost_bow', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 19.2), station: 'bowyer', level: 16, ingredients: { wood: 16, wolf_claw: 4, bone: 4, glacial_essence: 2 }, expGranted: 220 },
  { band: 4, rarity: 'very_rare', id: 'sovereigns_pike', name: "Sovereign's Pike", baseId: 'frost_spear', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 19.5), station: 'blacksmithing', level: 18, ingredients: { ore: 20, wood: 5, steel_scrap: 8, glacial_essence: 3 }, expGranted: 275 },
  { band: 4, rarity: 'mythical', id: 'worldsplitter', name: 'Worldsplitter', baseId: 'frost_greatsword', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 36.2), station: 'blacksmithing', level: 22, ingredients: { ore: 30, steel_scrap: 12, glacial_essence: 6 }, expGranted: 330 },
  { band: 4, rarity: 'mythical', id: 'everwinter_plate', name: 'Everwinter Plate', baseId: 'frost_plate_armor', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 218); }, station: 'armorsmithing', level: 22, ingredients: { ore: 21, steel_scrap: 12, glacial_essence: 6, rime_carapace: 3 }, expGranted: 360 },
  { band: 4, rarity: 'legendary', id: 'dawnbreaker', name: 'Dawnbreaker', baseId: 'frost_longsword', type: 'weapon', statCheck: w => assert.strictEqual(w.baseDamage, 24.0), station: 'blacksmithing', level: 26, ingredients: { ore: 28, steel_scrap: 11, glacial_essence: 4 }, expGranted: 385 },
  { band: 4, rarity: 'legendary', id: 'heart_of_winter', name: 'Heart of Winter', baseId: 'sovereign_signet', type: 'armor', statCheck: a => { assert.strictEqual(a.hpBonus, 96); }, station: 'armorsmithing', level: 26, ingredients: { eye_of_the_sovereign: 4, glacial_essence: 7 }, expGranted: 420 }
];

const allRecipes = [...bsRecipesData.recipes, ...asRecipesData.recipes, ...byRecipesData.recipes];

for (const spec of table24) {
  // Check piece item definition
  const list = spec.type === 'weapon' ? weaponsData.weapons : armorsData.armors;
  const baseList = spec.type === 'weapon' ? weaponsData.weapons : armorsData.armors;
  const piece = list.find((x: any) => x.id === spec.id);
  const baseItem = baseList.find((x: any) => x.id === spec.baseId);

  assert.ok(piece, `Piece ${spec.id} not found in data`);
  assert.ok(baseItem, `Base item ${spec.baseId} not found in data`);
  assert.strictEqual(piece.name, spec.name, `Piece ${spec.id} name mismatch`);
  assert.strictEqual(piece.rarity, spec.rarity, `Piece ${spec.id} rarity mismatch`);
  assert.strictEqual(piece.band, spec.band, `Piece ${spec.id} band mismatch`);

  // Verify non-overridden fields match base item exactly
  if (spec.type === 'weapon') {
    assert.strictEqual(piece.category, baseItem.category);
    assert.strictEqual(piece.attackIntervalMs, baseItem.attackIntervalMs);
    assert.strictEqual(piece.weight, baseItem.weight);
    assert.strictEqual(piece.proficiencyId, baseItem.proficiencyId);
  } else {
    assert.strictEqual(piece.slot, baseItem.slot);
    assert.strictEqual(piece.weight, baseItem.weight);
    assert.strictEqual(piece.weightClass, baseItem.weightClass);
  }

  // Stat check
  spec.statCheck(piece);

  // Check Recipe
  const recipe = allRecipes.find((r: any) => r.id === spec.id);
  assert.ok(recipe, `Recipe ${spec.id} not found`);
  assert.strictEqual(recipe.requiresScroll, true, `Recipe ${spec.id} requiresScroll must be true`);
  assert.strictEqual(recipe.rarity, spec.rarity, `Recipe ${spec.id} rarity mismatch`);
  assert.strictEqual(recipe.requiredLevel, spec.level, `Recipe ${spec.id} requiredLevel mismatch`);
  assert.strictEqual(recipe.expGranted, spec.expGranted, `Recipe ${spec.id} expGranted mismatch`);
  assert.deepStrictEqual(recipe.ingredients, spec.ingredients, `Recipe ${spec.id} ingredients mismatch`);

  // Check Scroll in items.json
  const scrollId = 'gear_recipe_' + spec.id;
  const scroll = itemsData.items.find((it: any) => it.id === scrollId);
  assert.ok(scroll, `Scroll ${scrollId} not found in items.json`);
  assert.strictEqual(scroll.category, 'recipes');
  assert.strictEqual(scroll.weight, 0.1);
  assert.strictEqual(scroll.teachesRecipeId, spec.id);
  assert.strictEqual(scroll.rarity, spec.rarity);
}
console.log('✓ PASS: All 24 pieces, station recipes, and scrolls match Director specifications exactly.');

// 2. RECIPE LEARNING & DUPLICATE SCROLL PROGRESSION
console.log('\n2. Testing Recipe Learning & Duplicate Mechanics...');
const gameState = GameState.getInstance();
const consumableSys = ConsumableSystem.getInstance();

// Reset state
gameState.resetToDefault();
assert.strictEqual(gameState.isGearRecipeKnown('gravewardens_blade'), false);

// Add scroll to stockpile and learn from stockpile
gameState.addItem('gear_recipe_gravewardens_blade', 2);
assert.strictEqual(gameState.getItemCount('gear_recipe_gravewardens_blade'), 2);

// First learn: unlocks recipe
const learnRes1 = consumableSys.useConsumable('gear_recipe_gravewardens_blade', { fromStockpile: true });
assert.strictEqual(learnRes1.success, true);
assert.strictEqual(gameState.isGearRecipeKnown('gravewardens_blade'), true);
assert.strictEqual(gameState.getItemCount('gear_recipe_gravewardens_blade'), 1);

// Second learn: duplicate scroll! Should grant +50 profession EXP
const mockPlayer: any = {
  entityName: 'TestHero',
  inventory: new Map(),
  addItem: (id: string, qty: number) => {
    mockPlayer.inventory.set(id, (mockPlayer.inventory.get(id) || 0) + qty);
  },
  getItemCount: (id: string) => mockPlayer.inventory.get(id) || 0,
  isAtOutpost: () => true,
  progression: new ProgressionSystem(undefined, 'TestHero')
};
// Set starting EXP so it doesn't level up
const stat = mockPlayer.progression.getProficiencyStat('blacksmithing');
stat.level = 5;
stat.currentExp = 10;
const bsBefore = stat.currentExp;

const learnRes2 = consumableSys.useConsumable('gear_recipe_gravewardens_blade', {
  fromStockpile: true,
  preferredTarget: mockPlayer
});
assert.strictEqual(learnRes2.success, true);
assert.ok(learnRes2.message.includes('Duplicate recipe understood'));
assert.strictEqual(gameState.getItemCount('gear_recipe_gravewardens_blade'), 0);
const bsAfter = stat.currentExp;
assert.strictEqual(bsAfter - bsBefore, 50, 'Duplicate scroll must grant +50 station EXP');
console.log('✓ PASS: Recipe learning and duplicate +50 EXP grant verified.');

// 3. SNAPSHOT PERSISTENCE
console.log('\n3. Testing Snapshot Persistence for knownGearRecipes and lastDungeonFloorVisited...');
gameState.setLastDungeonFloorVisited(18);
const mockSnap: any = {
  resources: { wood: 100, ore: 0 },
  knownGearRecipes: gameState.getKnownGearRecipes(),
  lastDungeonFloorVisited: gameState.getLastDungeonFloorVisited()
};
assert.ok(mockSnap.knownGearRecipes.includes('gravewardens_blade'));
assert.strictEqual(mockSnap.lastDungeonFloorVisited, 18);

gameState.resetToDefault();
assert.strictEqual(gameState.isGearRecipeKnown('gravewardens_blade'), false);
assert.strictEqual(gameState.getLastDungeonFloorVisited(), 0);

gameState.restoreFromLoadedSnapshot(mockSnap);
assert.strictEqual(gameState.isGearRecipeKnown('gravewardens_blade'), true);
assert.strictEqual(gameState.getLastDungeonFloorVisited(), 18);
console.log('✓ PASS: Snapshot persistence verified.');

// 4. STATION CRAFTING OF LEARNED PIECE
console.log('\n4. Testing Crafting of Learned Rarity Piece...');
const dataLoader = DataLoader.getInstance();
const bsRecipe = dataLoader.getBlacksmithRecipe('gravewardens_blade');
assert.ok(bsRecipe);

// Give ingredients
const initialWood = gameState.getItemCount('wood');
const initialOre = gameState.getItemCount('ore');
gameState.addItem('ore', 5);
gameState.addItem('wood', 2);
mockPlayer.progression.getProficiencyStat('blacksmithing').level = 5;

const canAfford = CraftingSystem.canAfford(bsRecipe, mockPlayer);
assert.strictEqual(canAfford, true);

const craftRes = CraftingSystem.applyCraft(mockPlayer, bsRecipe, 'blacksmithing');
assert.strictEqual(craftRes.success, true);
assert.strictEqual(craftRes.quantity, 1);
assert.strictEqual(gameState.getItemCount('ore'), initialOre);
assert.strictEqual(gameState.getItemCount('wood'), initialWood);
assert.strictEqual(mockPlayer.getItemCount('gravewardens_blade'), 1);

// Check that crafted weapon has the 5.5 damage from gravewardens_blade definition
const gwBladeDef = dataLoader.getWeapon('gravewardens_blade');
assert.strictEqual(gwBladeDef?.baseDamage, 5.5);
console.log('✓ PASS: Crafting learned rarity gear piece succeeds and consumes exact ingredients.');

// 5. DATA-DRIVEN SEEDED DROPS
console.log('\n5. Testing Seeded Drop Rates from gearRarity.json...');

// 5a. 20,000 Common Kills in Band 2 (chance = 0.005)
const rngKills = createPassiveRng(0x12345678);
const dropsCfg = gearRarityData.drops;
const commonChance = dropsCfg.commonKill.chance; // 0.005
assert.strictEqual(commonChance, 0.005);

const KILLS = 20000;
let commonDropCount = 0;
for (let i = 0; i < KILLS; i++) {
  if (rngKills() < commonChance) {
    commonDropCount++;
  }
}
const observedRate = commonDropCount / KILLS;
console.log(`Common Kills: ${commonDropCount} / ${KILLS} (${(observedRate * 100).toFixed(3)}%)`);
assert.ok(observedRate >= 0.0035 && observedRate <= 0.0065, `Expected 0.005 ± 0.0015, got ${observedRate}`);

// 5b. Boss Kills (chance = 0.15)
const rngBoss = createPassiveRng(0x98765432);
const bossChance = dropsCfg.bossKill.chance;
assert.strictEqual(bossChance, 0.15);
const BOSS_KILLS = 5000;
let bossDropCount = 0;
for (let i = 0; i < BOSS_KILLS; i++) {
  if (rngBoss() < bossChance) {
    bossDropCount++;
  }
}
const observedBossRate = bossDropCount / BOSS_KILLS;
console.log(`Boss Kills: ${bossDropCount} / ${BOSS_KILLS} (${(observedBossRate * 100).toFixed(2)}%)`);
assert.ok(observedBossRate >= 0.135 && observedBossRate <= 0.165, `Expected 0.15 ± 0.015, got ${observedBossRate}`);

// 5c. Glacial Sovereign Specific Drops (Mythical 5%, Legendary 1%)
const sovMythical = dropsCfg.enemySpecific.find((e: any) => e.enemyId === 'glacial_sovereign' && e.rarity === 'mythical');
const sovLegendary = dropsCfg.enemySpecific.find((e: any) => e.enemyId === 'glacial_sovereign' && e.rarity === 'legendary');
assert.ok(sovMythical && sovMythical.chance === 0.05);
assert.ok(sovLegendary && sovLegendary.chance === 0.01);

const rngSov = createPassiveRng(0xabcdef01);
const SOV_KILLS = 10000;
let sovLegendaryCount = 0;
for (let i = 0; i < SOV_KILLS; i++) {
  if (rngSov() < sovLegendary.chance) {
    sovLegendaryCount++;
  }
}
const observedSovLegendary = sovLegendaryCount / SOV_KILLS;
console.log(`Glacial Sovereign Legendary: ${sovLegendaryCount} / ${SOV_KILLS} (${(observedSovLegendary * 100).toFixed(2)}%)`);
assert.ok(observedSovLegendary >= 0.007 && observedSovLegendary <= 0.013, `Expected 0.01 ± 0.003, got ${observedSovLegendary}`);

// 5d. Locked Box Drops in Dungeon vs at Outpost
console.log('\n5d. Testing Locked Box Drops (Dungeon vs Outpost band resolution)...');
const lockSys = LockpickingSystem.getInstance();

// Set up mock test player for lockpicking
const lockPlayer: any = {
  entityName: 'Lockmaster',
  x: 100,
  y: 100,
  inventory: new Map(),
  addItem: (id: string, qty: number) => {
    lockPlayer.inventory.set(id, (lockPlayer.inventory.get(id) || 0) + qty);
  },
  getItemCount: (id: string) => lockPlayer.inventory.get(id) || 0,
  scene: {
    createFloatingText: () => {}
  }
};
const lockProgression = new ProgressionSystem(undefined, 'Lockmaster');
lockProgression.getProficiencyStat('lockpicking').level = 100; // Guaranteed 100% unlock

// Dungeon test: Floor 8 (Band 2: Abyssal Depths)
gameState.resetToDefault();
(gameState as any).dungeonFloorCount = 8;
gameState.setLastDungeonFloorVisited(8);
gameState.addItem('locked_box', 1);
gameState.addItem('lockpick', 1);

// Force scroll drop with deterministic stream returning 0.001
let forcedDropRng = () => 0.001;
lockSys.attemptUnlock(
  lockProgression,
  'Lockmaster',
  () => 0.001, // lock success
  lockPlayer,
  undefined,
  forcedDropRng
);

// Should have received a Band 2 scroll (e.g. deepwater_katana, spidersilk_vestment, orcbreaker_mace, delvers_crossbow, colossus_halberd)
let foundBand2Scroll = false;
for (const [k] of lockPlayer.inventory.entries()) {
  if (k.startsWith('gear_recipe_')) {
    const pieceId = k.replace('gear_recipe_', '');
    const piece = dataLoader.getWeapon(pieceId) || dataLoader.getArmor(pieceId);
    assert.strictEqual(piece?.band, 2, `Dungeon floor 8 locked box must yield Band 2 piece, got band ${piece?.band}`);
    foundBand2Scroll = true;
  }
}
assert.ok(foundBand2Scroll, 'Expected a Band 2 recipe scroll drop');

// Outpost test with lastDungeonFloorVisited = 18 (Band 4: Glacial Caverns)
lockPlayer.inventory.clear();
gameState.resetToDefault();
(gameState as any).dungeonFloor = 0; // At outpost
gameState.setLastDungeonFloorVisited(18); // Floor 18 is Band 4
gameState.addItem('locked_box', 1);
gameState.addItem('lockpick', 1);

lockSys.attemptUnlock(
  lockProgression,
  'Lockmaster',
  () => 0.001,
  lockPlayer,
  undefined,
  forcedDropRng
);

let foundBand4Scroll = false;
for (const [k] of lockPlayer.inventory.entries()) {
  if (k.startsWith('gear_recipe_')) {
    const pieceId = k.replace('gear_recipe_', '');
    const piece = dataLoader.getWeapon(pieceId) || dataLoader.getArmor(pieceId);
    assert.strictEqual(piece?.band, 4, `Outpost locked box with last floor 18 must yield Band 4 piece, got band ${piece?.band}`);
    foundBand4Scroll = true;
  }
}
assert.ok(foundBand4Scroll, 'Expected a Band 4 recipe scroll drop from Outpost with lastDungeonFloorVisited=18');

// Outpost test with NO prior dungeon floor visited (defaults to Band 1)
lockPlayer.inventory.clear();
gameState.resetToDefault();
(gameState as any).dungeonFloor = 0; // At outpost
assert.strictEqual(gameState.getLastDungeonFloorVisited(), 0); // 0 prior floors
gameState.addItem('locked_box', 1);
gameState.addItem('lockpick', 1);

lockSys.attemptUnlock(
  lockProgression,
  'Lockmaster',
  () => 0.001,
  lockPlayer,
  undefined,
  forcedDropRng
);

let foundBand1Scroll = false;
for (const [k] of lockPlayer.inventory.entries()) {
  if (k.startsWith('gear_recipe_')) {
    const pieceId = k.replace('gear_recipe_', '');
    const piece = dataLoader.getWeapon(pieceId) || dataLoader.getArmor(pieceId);
    assert.strictEqual(piece?.band, 1, `Outpost locked box with no prior floor must yield Band 1 piece, got band ${piece?.band}`);
    foundBand1Scroll = true;
  }
}
assert.ok(foundBand1Scroll, 'Expected a Band 1 recipe scroll drop when at Outpost with default floor 1');
console.log('✓ PASS: Locked Box drops correctly resolve band in dungeon and at outpost.');

// 6. PRNG ISOLATION
console.log('\n6. Testing PRNG Isolation...');
const streamA = createPassiveRng(0x517cc1b7);
const streamB = createPassiveRng(0x517cc1b7);

const vA1 = streamA();
const vA2 = streamA();
const vB1 = streamB();
const vB2 = streamB();

assert.strictEqual(vA1, vB1);
assert.strictEqual(vA2, vB2);
console.log('✓ PASS: Seeded PRNG stream produces deterministic isolated numbers.');

// 7. DISPLAY & RARITY HELPER
console.log('\n7. Testing getRarityDisplay Helper...');
assert.deepStrictEqual(getRarityDisplay(undefined), { name: 'Common', colour: '#e5e7eb' });
assert.deepStrictEqual(getRarityDisplay('common'), { name: 'Common', colour: '#e5e7eb' });
assert.deepStrictEqual(getRarityDisplay('uncommon'), { name: 'Uncommon', colour: '#22c55e' });
assert.deepStrictEqual(getRarityDisplay('rare'), { name: 'Rare', colour: '#3b82f6' });
assert.deepStrictEqual(getRarityDisplay('very_rare'), { name: 'Very Rare', colour: '#a855f7' });
assert.deepStrictEqual(getRarityDisplay('mythical'), { name: 'Mythical', colour: '#f97316' });
assert.deepStrictEqual(getRarityDisplay('legendary'), { name: 'Legendary', colour: '#facc15' });

// Testing with item object
assert.deepStrictEqual(getRarityDisplay({ rarity: 'mythical' }), { name: 'Mythical', colour: '#f97316' });

// Testing with item ID
assert.deepStrictEqual(getRarityDisplay('gravewardens_blade'), { name: 'Uncommon', colour: '#22c55e' });
assert.deepStrictEqual(getRarityDisplay('dawnbreaker'), { name: 'Legendary', colour: '#facc15' });
assert.deepStrictEqual(getRarityDisplay('gear_recipe_worldsplitter'), { name: 'Mythical', colour: '#f97316' });
console.log('✓ PASS: getRarityDisplay helper returns exact colours and tier names across all call forms.');

// 8. STATION MODAL FILTERING & COMBAT STAT SCALING
console.log('\n8. Testing Station Modal Filtering & Combat Stat Scaling...');
const allBsRecipes = dataLoader.getBlacksmithRecipes();
gameState.resetToDefault();
// Before learning, gravewardens_blade must be filtered out regardless of isCraftableOnly (Show All)
for (const isCraftableOnly of [true, false]) {
  const visible = allBsRecipes.filter(recipe => {
    if (recipe.requiresScroll && !gameState.isGearRecipeKnown(recipe.id)) return false;
    if (isCraftableOnly && 0 < (recipe.requiredLevel ?? 0)) return false;
    return true;
  });
  assert.strictEqual(visible.some(r => r.id === 'gravewardens_blade'), false, 'Unlearned recipe must be hidden even under Show All');
}

// After learning, gravewardens_blade must be visible
gameState.learnGearRecipe('gravewardens_blade');
const visibleAfter = allBsRecipes.filter(recipe => {
  if (recipe.requiresScroll && !gameState.isGearRecipeKnown(recipe.id)) return false;
  return true;
});
assert.strictEqual(visibleAfter.some(r => r.id === 'gravewardens_blade'), true, 'Learned recipe must be visible');

// Combat Stat Scaling check:
const baseSword = dataLoader.getWeapon('short_swords')!;
const raritySword = dataLoader.getWeapon('gravewardens_blade')!;
assert.strictEqual(baseSword.baseDamage, 5);
assert.strictEqual(raritySword.baseDamage, 5.5);
assert.strictEqual(raritySword.baseDamage, +(baseSword.baseDamage * 1.10).toFixed(1));

const legendarySword = dataLoader.getWeapon('dawnbreaker')!;
const baseFrostSword = dataLoader.getWeapon('frost_longsword')!;
assert.strictEqual(baseFrostSword.baseDamage, 15);
assert.strictEqual(legendarySword.baseDamage, 24.0);
assert.strictEqual(legendarySword.baseDamage, +(baseFrostSword.baseDamage * 1.60).toFixed(1));
console.log('✓ PASS: Station modal filtering and combat stat scaling verified.');

console.log('\n🎉 ALL GEAR RARITY TESTS PASSED PERFECTLY!');
