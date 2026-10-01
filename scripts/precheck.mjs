import fs from 'fs';

const weaponsData = JSON.parse(fs.readFileSync('data/weapons.json', 'utf8'));
const armorsData = JSON.parse(fs.readFileSync('data/armors.json', 'utf8'));
const itemsData = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const enemiesData = JSON.parse(fs.readFileSync('data/enemies.json', 'utf8'));
const bsData = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8'));
const asData = JSON.parse(fs.readFileSync('data/armorsmithRecipes.json', 'utf8'));
const bwData = JSON.parse(fs.readFileSync('data/bowyerRecipes.json', 'utf8'));
const alcData = JSON.parse(fs.readFileSync('data/alchemyRecipes.json', 'utf8'));
const cookData = JSON.parse(fs.readFileSync('data/cookingRecipes.json', 'utf8'));

const recipes = [
  ...bsData.recipes.map(r => ({ ...r, station: 'blacksmithing' })),
  ...asData.recipes.map(r => ({ ...r, station: 'armorsmithing' })),
  ...bwData.recipes.map(r => ({ ...r, station: 'bowyer' })),
  ...alcData.recipes.map(r => ({ ...r, station: 'alchemy' })),
  ...cookData.recipes.map(r => ({ ...r, station: 'cooking' }))
];

const recipeResultToRecipe = new Map();
for (const r of recipes) {
  const resultId = r.resultItemId || r.resultWeaponId || r.resultArmorId || r.resultFoodId || r.id;
  if (!recipeResultToRecipe.has(resultId)) {
    recipeResultToRecipe.set(resultId, []);
  }
  recipeResultToRecipe.get(resultId).push(r);
}

// Check all weapons and shields
console.log('=== WEAPONS & SHIELDS ===');
for (const w of weaponsData.weapons) {
  const recs = recipeResultToRecipe.get(w.id);
  const recStr = recs ? recs.map(r => `${r.id} (${r.station})`).join(', ') : 'NO RECIPE';
  console.log(`Weapon/Shield: id=${w.id}, name="${w.name}", category=${w.category}, recipe=${recStr}`);
}

// Check all armors and accessories
console.log('\n=== ARMOR & ACCESSORIES ===');
for (const a of armorsData.armors) {
  const recs = recipeResultToRecipe.get(a.id);
  const recStr = recs ? recs.map(r => `${r.id} (${r.station})`).join(', ') : 'NO RECIPE';
  console.log(`Armor/Accessory: id=${a.id}, name="${a.name}", slot=${a.slot}, recipe=${recStr}`);
}

// Drops check
console.log('\n=== ENEMY DROPS CHECK ===');
const drops = new Set();
for (const e of enemiesData.enemies) {
  if (e.lootTable) {
    for (const l of e.lootTable) {
      drops.add(l.itemId);
    }
  }
}
console.log('Enemy drops:', Array.from(drops));

// Starting kit gear check
console.log('\n=== STARTING KITS GEAR ===');
const startingGear = ['short_swords', 'shields', 'longsword_2h', 'bows', 'daggers', 'fire_staff'];
for (const sg of startingGear) {
  const recs = recipeResultToRecipe.get(sg);
  const recStr = recs ? recs.map(r => `${r.id} (${r.station})`).join(', ') : 'NO RECIPE';
  console.log(`Starting gear ${sg}: recipe=${recStr}`);
}
