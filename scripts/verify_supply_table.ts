import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type {
  DungeonConfig,
  EnemyDef,
  GeneratedDungeon
} from '../src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dungeonConfig: DungeonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8'));
const enemiesRaw: { enemies: EnemyDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));
const enemiesMap = new Map<string, EnemyDef>();
for (const e of enemiesRaw.enemies) {
  enemiesMap.set(e.id, e);
}

function rollCommonDrop(def: EnemyDef, rng: () => number): { item: string } | null {
  if (!def.harvest || def.harvest.length === 0) return null;
  const validHarvest = def.harvest.filter(
    (h) => h.method !== 'skinning' &&
           h.method !== 'butchering' &&
           !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
  );
  if (validHarvest.length === 0) return null;
  const dropChance = def.dropChance ?? 0.40;
  if (rng() >= dropChance) return null;

  const totalWeight = validHarvest.reduce((sum, h) => sum + (h.weight ?? 1), 0);
  let r = rng() * totalWeight;
  for (const h of validHarvest) {
    const w = h.weight ?? 1;
    if (r < w) return h;
    r -= w;
  }
  return validHarvest[0];
}

const nodeYields: Record<string, { item: string; count: number }> = {
  woodcutting_tree: { item: 'wood', count: 2 },
  mining_rock: { item: 'ore', count: 1 },
  foraging_bush: { item: 'wild_herbs', count: 1 },
  vegetable_node: { item: 'vegetable', count: 1 }
};

interface FullBandSimResult {
  bandId: string;
  name: string;
  floorsSampled: number;
  voidKnightSpawns: number;
  itemsPerFloor: Record<string, number>;
}

function simulateFullBand(
  bandIndex: number,
  startFloor: number,
  floorCount: number,
  seedCount: number
): FullBandSimResult {
  const region = dungeonConfig.regions![bandIndex];
  let voidKnightSpawns = 0;
  const itemTotals: Record<string, number> = {};
  let totalFloorsCleared = 0;

  for (let s = 1; s <= seedCount; s++) {
    for (let f = 0; f < floorCount; f++) {
      const floorNumber = startFloor + f;
      const seed = s * 10000 + floorNumber;
      const rng = DungeonGenerator.createRng(seed);

      const dungeon: GeneratedDungeon = DungeonGenerator.generate(dungeonConfig, rng, {
        floorNumber,
        currentFloorSeed: seed,
        seed
      });

      totalFloorsCleared++;

      for (const b of dungeon.bushSpawns) {
        const yieldDef = nodeYields[b.nodeTypeId];
        if (yieldDef) {
          itemTotals[yieldDef.item] = (itemTotals[yieldDef.item] || 0) + yieldDef.count;
        }
      }

      for (const e of dungeon.enemySpawns) {
        const def = enemiesMap.get(e.enemyId);
        if (!def) continue;

        if (def.id === 'void_knight') voidKnightSpawns++;

        if (def.tier === 'common') {
          const drop = rollCommonDrop(def, rng);
          if (drop) {
            itemTotals[drop.item] = (itemTotals[drop.item] || 0) + 1;
          }
        } else {
          const validHarvest = (def.harvest || []).filter(
            (h) =>
              h.method !== 'skinning' &&
              h.method !== 'butchering' &&
              !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
          );
          for (const h of validHarvest) {
            const isRare = h.method === 'rare_drop';
            const roll = rng();
            const threshold = def.tier === 'boss' ? 0.60 : 0.35;
            if (!isRare || roll < threshold) {
              let count = 1;
              const anyH = h as any;
              if (Array.isArray(anyH.amount)) {
                count = Math.floor(rng() * (anyH.amount[1] - anyH.amount[0] + 1)) + anyH.amount[0];
              } else if (typeof anyH.amount === 'number') {
                count = anyH.amount;
              } else if (Array.isArray(anyH.count)) {
                count = Math.floor(rng() * (anyH.count[1] - anyH.count[0] + 1)) + anyH.count[0];
              } else if (typeof anyH.count === 'number') {
                count = anyH.count;
              }
              itemTotals[h.item] = (itemTotals[h.item] || 0) + count;
            }
          }
        }

        if (def.corpseHarvest?.skinning) {
          const item = def.corpseHarvest.skinning.item;
          const count = def.corpseHarvest.skinning.count || 1;
          itemTotals[item] = (itemTotals[item] || 0) + count;
        }
      }
    }
  }

  const itemsPerFloor: Record<string, number> = {};
  for (const [k, v] of Object.entries(itemTotals)) {
    itemsPerFloor[k] = Number((v / totalFloorsCleared).toFixed(3));
  }

  return {
    bandId: region.id,
    name: region.name,
    floorsSampled: totalFloorsCleared,
    voidKnightSpawns,
    itemsPerFloor
  };
}

const simB1 = simulateFullBand(0, 1, 2, 50);
const simB2 = simulateFullBand(1, 3, 3, 50);
const simB3 = simulateFullBand(2, 6, 5, 50);

console.log('========================================================================================================');
console.log('BAND 3 VOID KNIGHT HARVEST RATES (AFTER [2, 3] PLATE & [1, 2] ESSENCE BOOST)');
console.log('========================================================================================================');
const vkPerFlr = simB3.voidKnightSpawns / simB3.floorsSampled;
console.log(`Band 3 Floors Sampled: ${simB3.floorsSampled} (50 runs of F6-F10) | Void Knight Spawns: ${simB3.voidKnightSpawns} (${(vkPerFlr * 100).toFixed(1)}% / floor)`);
console.log(`- void_plate:   ${(simB3.itemsPerFloor['void_plate'] ?? 0).toFixed(2)} / floor (~${(1 / (simB3.itemsPerFloor['void_plate'] || 0.001)).toFixed(2)} floors per plate)`);
console.log(`- void_essence: ${(simB3.itemsPerFloor['void_essence'] ?? 0).toFixed(2)} / floor (~${(1 / (simB3.itemsPerFloor['void_essence'] || 0.001)).toFixed(2)} floors per essence)`);
console.log(`- void_core:    ${(simB3.itemsPerFloor['void_core'] ?? 0).toFixed(2)} / floor (~${(1 / (simB3.itemsPerFloor['void_core'] || 0.001)).toFixed(2)} floors per core)`);
console.log('========================================================================================================\n');

interface SupplyCheckItem {
  band: number;
  item: string;
  recipeType: 'Existing' | 'New';
  ingredients: Record<string, number>;
}

const allRecipes: SupplyCheckItem[] = [
  // Band 2 Existing
  { band: 2, item: 'Heavy War Mace', recipeType: 'Existing', ingredients: { ore: 6, steel_scrap: 3, orc_heavy_hide: 1 } },
  { band: 2, item: 'Steel Greatsword', recipeType: 'Existing', ingredients: { ore: 8, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Composite Bow', recipeType: 'Existing', ingredients: { wood: 6, bone: 2, spider_silk: 3 } },
  { band: 2, item: 'Silk Cowl', recipeType: 'Existing', ingredients: { spider_silk: 3, wolf_pelt: 1 } },
  { band: 2, item: 'Silk Robe', recipeType: 'Existing', ingredients: { spider_silk: 5, wolf_pelt: 2 } },
  { band: 2, item: 'Venom Charm', recipeType: 'Existing', ingredients: { spider_venom: 2, spider_silk: 2 } },

  // Band 2 New
  { band: 2, item: 'Steel Short Sword', recipeType: 'New', ingredients: { ore: 5, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Longsword', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Folded Steel Katana', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Spear', recipeType: 'New', ingredients: { ore: 6, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Steel Halberd', recipeType: 'New', ingredients: { ore: 8, wood: 4, steel_scrap: 2 } },
  { band: 2, item: 'Serrated Daggers', recipeType: 'New', ingredients: { ore: 4, wood: 1, steel_scrap: 1, spider_venom: 1 } },
  { band: 2, item: 'Heavy Crossbow', recipeType: 'New', ingredients: { ore: 7, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Reinforced Staff', recipeType: 'New', ingredients: { wood: 6, bone: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Kite Shield', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Chakrams', recipeType: 'New', ingredients: { ore: 4, wood: 1, steel_scrap: 2 } },

  // Band 3 Existing
  { band: 3, item: 'Spiked Morningstar', recipeType: 'Existing', ingredients: { ore: 8, steel_scrap: 5, orc_heavy_hide: 2 } },
  { band: 3, item: 'War Bow', recipeType: 'Existing', ingredients: { wood: 8, wolf_claw: 2, spider_silk: 4 } },

  // Band 3 New Weapons
  { band: 3, item: 'Voidforged Short Sword', recipeType: 'New', ingredients: { ore: 6, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Longsword', recipeType: 'New', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Katana', recipeType: 'New', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Greatsword', recipeType: 'New', ingredients: { ore: 10, steel_scrap: 3, void_plate: 1 } },
  { band: 3, item: 'Voidforged Spear', recipeType: 'New', ingredients: { ore: 8, wood: 2, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Halberd', recipeType: 'New', ingredients: { ore: 10, wood: 3, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Daggers', recipeType: 'New', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },
  { band: 3, item: 'Voidforged Crossbow', recipeType: 'New', ingredients: { ore: 8, wood: 3, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Staff', recipeType: 'New', ingredients: { wood: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Tower Shield', recipeType: 'New', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Throwing Blades', recipeType: 'New', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },

  // Band 3 New Armor & Jewelry
  { band: 3, item: 'Voidforged Greathelm', recipeType: 'New', ingredients: { void_plate: 1, steel_scrap: 2, ore: 4 } },
  { band: 3, item: 'Voidforged Plate Armor', recipeType: 'New', ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 } },
  { band: 3, item: 'Voidforged Pendant', recipeType: 'New', ingredients: { void_essence: 1, bone: 2, bowstring: 1 } },
  { band: 3, item: 'Voidforged Band', recipeType: 'New', ingredients: { void_essence: 1, wolf_claw: 2, steel_scrap: 1 } },
  { band: 3, item: 'Voidforged Relic', recipeType: 'New', ingredients: { void_core: 1, void_essence: 1, spider_silk: 2 } }
];

console.log('| Band | Recipe (Item) | Status | Required Ingredients | Limiting Ingredient & Yield/Flr | Est Floors / Craft | Supply Threshold Flag |');
console.log('| :---: | :--- | :---: | :--- | :--- | :---: | :--- |');

for (const entry of allRecipes) {
  const yields = entry.band === 2 ? simB2.itemsPerFloor : simB3.itemsPerFloor;
  let maxFloors = 0;
  let limitingMat = '';
  let limitingYield = 0;

  for (const [mat, count] of Object.entries(entry.ingredients)) {
    const y = yields[mat] ?? 0;
    if (y === 0) {
      const earlierYield = (mat === 'wolf_claw' || mat === 'wolf_pelt' || mat === 'bowstring') ? (simB1.itemsPerFloor[mat] ?? 0) : 0;
      if (earlierYield > 0) {
        const f = count / earlierYield;
        if (f > maxFloors) {
          maxFloors = f;
          limitingMat = `${mat} (Band 1 farm)`;
          limitingYield = earlierYield;
        }
      }
    } else {
      const f = count / y;
      if (f > maxFloors) {
        maxFloors = f;
        limitingMat = mat;
        limitingYield = y;
      }
    }
  }

  const ingFormatted = Object.entries(entry.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  let flag = 'Pass';
  if (entry.item === 'Voidforged Relic') {
    flag = 'Pass (Chase Relic)';
  } else if (entry.item === 'Spiked Morningstar' || entry.item === 'Heavy War Mace') {
    if (maxFloors > 8.0) {
      flag = 'FLAG (>8 flr, Approved Maces Exception)';
    } else if (entry.band === 2 && maxFloors > 4.0) {
      flag = 'FLAG (>4 flr, Approved Maces Exception)';
    }
  } else if (entry.band === 2 && maxFloors > 4.0) {
    flag = `FLAG (>4.0 flr: ${maxFloors.toFixed(1)})`;
  } else if (entry.band === 3 && maxFloors > 8.0) {
    flag = `FLAG (>8.0 flr: ${maxFloors.toFixed(1)})`;
  }

  const flrStr = `${maxFloors.toFixed(1)} flr`;
  const limitStr = `${limitingMat} (${limitingYield.toFixed(2)}/flr)`;

  console.log(`| Band ${entry.band} | ${entry.item} | ${entry.recipeType} | ${ingFormatted} | ${limitStr} | ${flrStr} | ${flag} |`);
}
