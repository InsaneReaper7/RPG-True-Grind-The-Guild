import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface RecipeItem {
  id: string;
  name: string;
  station: string;
  requiredLevel: number;
}

const blacksmith = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/blacksmithRecipes.json'), 'utf8'));
const bowyer = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/bowyerRecipes.json'), 'utf8'));
const armorsmith = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armorsmithRecipes.json'), 'utf8'));
const alchemy = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/alchemyRecipes.json'), 'utf8'));

const list: RecipeItem[] = [];

for (const r of blacksmith.recipes) {
  list.push({ id: r.id, name: r.name, station: 'Blacksmithing', requiredLevel: r.requiredLevel ?? 0 });
}
for (const r of bowyer.recipes) {
  list.push({ id: r.id, name: r.name, station: 'Bowyer', requiredLevel: r.requiredLevel ?? 0 });
}
for (const r of armorsmith.recipes) {
  list.push({ id: r.id, name: r.name, station: 'Armorsmithing', requiredLevel: r.requiredLevel ?? 0 });
}
for (const r of alchemy.recipes) {
  list.push({ id: r.id, name: r.name, station: 'Alchemy', requiredLevel: r.requiredLevel ?? 0 });
}

console.log('----------------------------------------------------------------------------------------------------');
console.log(
  'Station'.padEnd(16) +
  'Recipe ID'.padEnd(28) +
  'Recipe Name'.padEnd(30) +
  'Req Lv'
);
console.log('----------------------------------------------------------------------------------------------------');

for (const item of list) {
  console.log(
    item.station.padEnd(16) +
    item.id.padEnd(28) +
    item.name.padEnd(30) +
    String(item.requiredLevel).padStart(6)
  );
}
console.log('----------------------------------------------------------------------------------------------------');
console.log(`Total Recipes Verified: ${list.length}`);
