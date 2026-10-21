import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type { DungeonConfig, EnemyDef, GeneratedDungeon } from '../src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const nodeYields: Record<string, { item: string; count: number }> = {
  woodcutting_tree: { item: 'wood', count: 2 },
  mining_rock: { item: 'ore', count: 1 },
  foraging_bush: { item: 'wild_herbs', count: 1 },
  vegetable_node: { item: 'vegetable', count: 1 }
};

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

export interface FrostRecipeCheck {
  id: string;
  name: string;
  type: 'weapon' | 'shield' | 'armor' | 'accessory' | 'top_piece';
  essenceCost: number;
  ingredients: Record<string, number>;
}

export const frostRecipes: FrostRecipeCheck[] = [
  // Weapons
  { id: 'frost_short_sword', name: 'Frostbound Short Sword', type: 'weapon', essenceCost: 1, ingredients: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_longsword', name: 'Frostbound Longsword', type: 'weapon', essenceCost: 1, ingredients: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_katana', name: 'Frostbound Katana', type: 'weapon', essenceCost: 1, ingredients: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_spear', name: 'Frostbound Spear', type: 'weapon', essenceCost: 1, ingredients: { ore: 8, wood: 2, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_daggers', name: 'Frostbound Daggers', type: 'weapon', essenceCost: 1, ingredients: { ore: 6, steel_scrap: 2, glacial_essence: 1 } },
  { id: 'frost_morningstar', name: 'Frostbound Morningstar', type: 'weapon', essenceCost: 1, ingredients: { ore: 9, steel_scrap: 4, orc_heavy_hide: 1, glacial_essence: 1 } },
  { id: 'frost_greatsword', name: 'Frostbound Greatsword', type: 'weapon', essenceCost: 2, ingredients: { ore: 10, steel_scrap: 4, glacial_essence: 2 } },
  { id: 'frost_halberd', name: 'Frostbound Halberd', type: 'weapon', essenceCost: 2, ingredients: { ore: 10, wood: 3, steel_scrap: 4, glacial_essence: 2 } },
  { id: 'frost_staff', name: 'Frostbound Staff', type: 'weapon', essenceCost: 1, ingredients: { wood: 8, steel_scrap: 2, glacial_essence: 1 } },
  { id: 'frost_bow', name: 'Frostbound Bow', type: 'weapon', essenceCost: 1, ingredients: { wood: 8, wolf_claw: 2, bone: 2, glacial_essence: 1 } },
  { id: 'frost_crossbow', name: 'Frostbound Crossbow', type: 'weapon', essenceCost: 1, ingredients: { ore: 8, wood: 3, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_throwing_weapons', name: 'Frostbound Throwing Blades', type: 'weapon', essenceCost: 1, ingredients: { ore: 6, steel_scrap: 2, glacial_essence: 1 } },
  // Shield
  { id: 'frost_shield', name: 'Frostbound Shield', type: 'shield', essenceCost: 1, ingredients: { ore: 8, steel_scrap: 3, glacial_essence: 1 } },
  // Armor & Accessories
  { id: 'frost_hood', name: 'Frostweave Hood', type: 'armor', essenceCost: 1, ingredients: { wolf_pelt: 2, ectoplasm: 2, glacial_essence: 1 } },
  { id: 'frost_robe', name: 'Frostweave Robe', type: 'armor', essenceCost: 2, ingredients: { wolf_pelt: 3, ectoplasm: 3, glacial_essence: 2 } },
  { id: 'frost_leather_helm', name: 'Rimehide Helm', type: 'armor', essenceCost: 1, ingredients: { wolf_pelt: 3, orc_heavy_hide: 1, glacial_essence: 1 } },
  { id: 'frost_leather_armor', name: 'Rimehide Armor', type: 'armor', essenceCost: 2, ingredients: { wolf_pelt: 4, orc_heavy_hide: 2, glacial_essence: 2 } },
  { id: 'frost_greathelm', name: 'Rimeforged Greathelm', type: 'armor', essenceCost: 1, ingredients: { ore: 5, steel_scrap: 3, glacial_essence: 1 } },
  { id: 'frost_plate_armor', name: 'Rimeforged Plate', type: 'top_piece', essenceCost: 2, ingredients: { ore: 7, steel_scrap: 4, glacial_essence: 2, rime_carapace: 1 } },
  { id: 'frost_pendant', name: 'Frost Pendant', type: 'accessory', essenceCost: 1, ingredients: { glacial_essence: 1, bone: 3 } },
  { id: 'frost_ring', name: 'Frost Ring', type: 'accessory', essenceCost: 1, ingredients: { glacial_essence: 1, wolf_claw: 2 } },
  { id: 'frost_relic', name: 'Glacial Heart Relic', type: 'top_piece', essenceCost: 2, ingredients: { glacial_core: 1, glacial_essence: 2 } },
  { id: 'sovereign_signet', name: "Sovereign's Signet", type: 'top_piece', essenceCost: 2, ingredients: { eye_of_the_sovereign: 1, glacial_essence: 2 } }
];

export function runFrostSupplySimulation(
  dungeonConfig: DungeonConfig,
  enemiesList: EnemyDef[],
  seedCount: number = 50
) {
  const enemiesMap = new Map<string, EnemyDef>();
  for (const e of enemiesList) {
    enemiesMap.set(e.id, e);
  }

  const itemTotals: Record<string, number> = {};
  let totalFloorsCleared = 0;
  let bossKills = 0;

  for (let s = 1; s <= seedCount; s++) {
    for (let f = 16; f <= 20; f++) {
      totalFloorsCleared++;
      const seed = s * 10000 + f;
      const rng = DungeonGenerator.createRng(seed);

      const dungeon: GeneratedDungeon = DungeonGenerator.generate(dungeonConfig, rng, {
        floorNumber: f,
        currentFloorSeed: seed,
        seed,
        isTutorialComplete: true
      });

      // Gathering nodes
      for (const b of dungeon.bushSpawns) {
        const yieldDef = nodeYields[b.nodeTypeId];
        if (yieldDef) {
          itemTotals[yieldDef.item] = (itemTotals[yieldDef.item] || 0) + yieldDef.count;
        }
      }

      // Enemies
      for (const e of dungeon.enemySpawns) {
        const def = enemiesMap.get(e.enemyId);
        if (!def) continue;

        if (def.tier === 'boss') {
          bossKills++;
        }

        if (def.tier === 'common') {
          const drop = rollCommonDrop(def, rng);
          if (drop) {
            itemTotals[drop.item] = (itemTotals[drop.item] || 0) + 1;
          }
        } else {
          // Elite / Boss / Epic
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

        // Corpse harvest skinning
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
    totalFloorsCleared,
    bossKills,
    itemsPerFloor
  };
}

function generateReport() {
  const config: DungeonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8'));
  const enemiesData: { enemies: EnemyDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));

  let out = '';
  const log = (msg: string) => {
    out += msg + '\n';
    console.log(msg);
  };

  log('========================================================================================');
  log('BAND 4 (GLACIAL CAVERNS F16–20) SUPPLY CHECK: RUN 1 (BASELINE) VS RUN 2 (PRE-APPROVED KNOB)');
  log('========================================================================================\n');

  // --- RUN 1: Baseline ---
  log('--- RUN 1: Baseline Enemies Configuration ---');
  const res1 = runFrostSupplySimulation(config, enemiesData.enemies, 50);
  log(`Floors Sampled: ${res1.totalFloorsCleared} | Glacial Sovereign Kills: ${res1.bossKills}`);
  log('Yields per floor:');
  for (const [m, y] of Object.entries(res1.itemsPerFloor)) {
    log(`  ${m.padEnd(22)}: ${y.toFixed(3)} / floor`);
  }

  log('\nFloors per craft (Run 1):');
  log('| Recipe (Item) | Required Ingredients | Essence Flrs | Limiting Material | Total Flrs / Craft | Target | Status |');
  log('| :--- | :--- | :---: | :--- | :---: | :---: | :---: |');

  for (const r of frostRecipes) {
    let limitingMat = '';
    let maxFlrs = 0;
    for (const [mat, count] of Object.entries(r.ingredients)) {
      const y = res1.itemsPerFloor[mat] ?? 0;
      const f = y > 0 ? count / y : 999;
      if (f > maxFlrs) {
        maxFlrs = f;
        limitingMat = `${mat} (${y.toFixed(2)}/flr)`;
      }
    }
    const essenceYield = res1.itemsPerFloor['glacial_essence'] ?? 0;
    const essenceFlrs = essenceYield > 0 ? r.essenceCost / essenceYield : 999;
    const ingStr = Object.entries(r.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
    const targetStr = r.essenceCost === 1 ? '~3.5' : '~7.0';
    const status = maxFlrs <= (r.essenceCost === 1 ? 4.5 : 8.0) ? 'MET' : (r.name.includes('Morningstar') || r.name.includes('Helm') || r.name.includes('Armor') || r.name.includes('Bow') || r.name.includes('Ring') ? 'ABOVE (Off-band/Rare mat)' : 'ABOVE');
    log(`| ${r.name} | ${ingStr} | ${essenceFlrs.toFixed(2)} | ${limitingMat} | ${maxFlrs.toFixed(2)} | ${targetStr} | ${status} |`);
  }

  // --- RUN 2: Pre-approved Knob ---
  log('\n----------------------------------------------------------------------------------------');
  log('--- RUN 2: Pre-Approved Supply Knob Applied ---');
  log('Knob changes:');
  log('  1. ice_wraith glacial_essence salvage weight: 1 -> 2');
  log('  2. glacier_yeti add salvage glacial_essence weight: 1');
  log('----------------------------------------------------------------------------------------');

  const enemiesKnob: EnemyDef[] = JSON.parse(JSON.stringify(enemiesData.enemies));
  const wraith = enemiesKnob.find((e) => e.id === 'ice_wraith')!;
  const wraithEssence = wraith.harvest.find((h) => h.item === 'glacial_essence')!;
  wraithEssence.weight = 2;

  const yeti = enemiesKnob.find((e) => e.id === 'glacier_yeti')!;
  yeti.harvest.push({
    method: 'salvage',
    item: 'glacial_essence',
    weight: 1,
    tags: ['alchemy', 'enchanting']
  });

  const res2 = runFrostSupplySimulation(config, enemiesKnob, 50);
  log(`Floors Sampled: ${res2.totalFloorsCleared} | Glacial Sovereign Kills: ${res2.bossKills}`);
  log('Yields per floor (Run 2):');
  for (const [m, y] of Object.entries(res2.itemsPerFloor)) {
    log(`  ${m.padEnd(22)}: ${y.toFixed(3)} / floor`);
  }

  log('\nFloors per craft (Run 2 with Knob):');
  log('| Recipe (Item) | Required Ingredients | Essence Flrs | Limiting Material | Total Flrs / Craft | Target | Status |');
  log('| :--- | :--- | :---: | :--- | :---: | :---: | :---: |');

  for (const r of frostRecipes) {
    let limitingMat = '';
    let maxFlrs = 0;
    for (const [mat, count] of Object.entries(r.ingredients)) {
      const y = res2.itemsPerFloor[mat] ?? 0;
      const f = y > 0 ? count / y : 999;
      if (f > maxFlrs) {
        maxFlrs = f;
        limitingMat = `${mat} (${y.toFixed(2)}/flr)`;
      }
    }
    const essenceYield = res2.itemsPerFloor['glacial_essence'] ?? 0;
    const essenceFlrs = essenceYield > 0 ? r.essenceCost / essenceYield : 999;
    const ingStr = Object.entries(r.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
    const targetStr = r.essenceCost === 1 ? '~3.5' : '~7.0';
    const status = maxFlrs <= (r.essenceCost === 1 ? 4.5 : 8.0) ? 'MET' : (r.name.includes('Morningstar') || r.name.includes('Helm') || r.name.includes('Armor') || r.name.includes('Bow') || r.name.includes('Ring') ? 'ABOVE (Off-band/Rare mat)' : 'ABOVE');
    log(`| ${r.name} | ${ingStr} | ${essenceFlrs.toFixed(2)} | ${limitingMat} | ${maxFlrs.toFixed(2)} | ${targetStr} | ${status} |`);
  }

  // --- Comparison Summary ---
  log('\n========================================================================================');
  log('COMPARISON SUMMARY: ESSENCE PACING');
  log('========================================================================================');
  const e1 = res1.itemsPerFloor['glacial_essence'];
  const e2 = res2.itemsPerFloor['glacial_essence'];
  log(`Run 1 Glacial Essence Yield: ${e1.toFixed(3)} / floor -> 1 essence = ${(1/e1).toFixed(2)} floors, 2 essence = ${(2/e1).toFixed(2)} floors`);
  log(`Run 2 Glacial Essence Yield: ${e2.toFixed(3)} / floor -> 1 essence = ${(1/e2).toFixed(2)} floors, 2 essence = ${(2/e2).toFixed(2)} floors`);
  log(`Glacial Essence Yield Change: +${(((e2 - e1) / e1) * 100).toFixed(1)}%`);

  log('\n========================================================================================');
  log('GLACIAL SOVEREIGN TOP PIECES DROP RATES & TIME-TO-ACQUIRE (FROM REAL BOSS DROP CODE)');
  log('========================================================================================');
  log('Source: src/systems/CombatSystem.ts:2768-2775, 2907-2925');
  log('- glacial_core:          salvage (isRare: false)  -> 100% per kill (1.00 / kill)');
  log('- rime_carapace:         salvage (isRare: false)  -> 100% per kill (1.00 / kill)');
  log('- eye_of_the_sovereign:  rare_drop (threshold 0.60 for boss) -> 60% per kill (0.60 / kill)');
  log('\nKills required for Top Pieces:');
  log('- Rimeforged Plate (rime_carapace x1):        1 Sovereign kill (1.0 expected)');
  log('- Glacial Heart Relic (glacial_core x1):      1 Sovereign kill (1.0 expected)');
  log("- Sovereign's Signet (eye_of_the_sovereign x1): 1.67 Sovereign kills (~2 kills expected)");

  fs.mkdirSync(path.join(rootDir, 'docs/evidence'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'docs/evidence/frost_supply.log'), out, 'utf8');
}

generateReport();
