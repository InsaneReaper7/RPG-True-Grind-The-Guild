import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type { DungeonConfig, EnemyDef, GeneratedDungeon } from '../src/types/game.ts';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load configurations and bestiary
const dungeonConfig: DungeonConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8')
);
const enemiesRaw = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8')
);
const enemiesMap = new Map<string, EnemyDef>();
for (const e of enemiesRaw.enemies) {
  enemiesMap.set(e.id, e);
}

const nodeYields: Record<string, { item: string; count: number }> = {
  woodcutting_tree: { item: 'wood', count: 2 },
  mining_rock: { item: 'ore', count: 1 },
  foraging_bush: { item: 'wild_herbs', count: 1 },
  vegetable_node: { item: 'vegetable', count: 1 }
};

interface BandSimulationResult {
  bandId: string;
  name: string;
  floorsSampled: number;
  totalEnemies: number;
  coreEnemies: number;
  carryOverEnemies: number;
  elites: number;
  epics: number;
  bosses: number;
  itemsPerFloor: Record<string, number>;
  illegalSpawnsOnBand1: string[];
}

function simulateBand(
  bandIndex: number,
  startFloor: number,
  floorCount: number,
  seedCount: number
): BandSimulationResult {
  const region = dungeonConfig.regions![bandIndex];
  const coreSet = new Set(
    (region.enemyPool || []).filter((e) => e.type === 'core').map((e) => e.enemyId)
  );
  const carrySet = new Set(
    (region.enemyPool || []).filter((e) => e.type === 'carry_over').map((e) => e.enemyId)
  );

  let totalEnemies = 0;
  let coreEnemies = 0;
  let carryOverEnemies = 0;
  let elites = 0;
  let epics = 0;
  let bosses = 0;

  const itemTotals: Record<string, number> = {
    bone: 0,
    ectoplasm: 0,
    wolf_pelt: 0,
    bowstring: 0,
    ore: 0,
    wood: 0,
    wild_herbs: 0,
    steel_scrap: 0,
    spider_silk: 0,
    spider_venom: 0,
    orc_heavy_hide: 0
  };

  const illegalSpawnsOnBand1: string[] = [];

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

      // 1. Process Gathering Nodes
      for (const b of dungeon.bushSpawns) {
        const yieldDef = nodeYields[b.nodeTypeId];
        if (yieldDef) {
          itemTotals[yieldDef.item] = (itemTotals[yieldDef.item] || 0) + yieldDef.count;
        }
      }

      // 2. Process Enemy Spawns & Loot
      for (const e of dungeon.enemySpawns) {
        const def = enemiesMap.get(e.enemyId);
        if (!def) continue;

        totalEnemies++;

        if (def.tier === 'boss') {
          bosses++;
        } else if (def.tier === 'epic') {
          epics++;
        } else if (def.tier === 'elite') {
          elites++;
        } else {
          if (coreSet.has(def.id)) {
            coreEnemies++;
          } else if (carrySet.has(def.id)) {
            carryOverEnemies++;
          }
        }

        // Purity check for Band 1
        if (bandIndex === 0) {
          if (def.tier !== 'common' || !coreSet.has(def.id)) {
            illegalSpawnsOnBand1.push(`${def.id} (${def.tier}) on floor ${floorNumber} seed ${seed}`);
          }
        }

        // Loot roll
        if (def.tier === 'common') {
          const drop = rollCommonDrop(def, rng);
          if (drop) {
            itemTotals[drop.item] = (itemTotals[drop.item] || 0) + 1;
          }
        } else {
          // Elite / Epic / Boss drop simulation per CombatSystem lines 2465-2481
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
              itemTotals[h.item] = (itemTotals[h.item] || 0) + 1;
            }
          }
        }

        // Corpse skinning yield
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
    itemsPerFloor[k] = Number((v / totalFloorsCleared).toFixed(2));
  }

  return {
    bandId: region.id,
    name: region.name,
    floorsSampled: totalFloorsCleared,
    totalEnemies,
    coreEnemies,
    carryOverEnemies,
    elites,
    epics,
    bosses,
    itemsPerFloor,
    illegalSpawnsOnBand1
  };
}

console.log('========================================================================');
console.log('      FLOOR-BAND SEGMENTATION HEADLESS SIMULATION (50 SEEDS)');
console.log('========================================================================\n');

// Simulate 20 floors per band across 50 seeds
// Band 1: Floors 1-2 (2 floors repeated across seeds to reach 20 floor clears: 10 runs of 2 floors)
const b1 = simulateBand(0, 1, 2, 50);
// Band 2: Floors 3-5 (3 floors per run)
const b2 = simulateBand(1, 3, 3, 50);
// Band 3: Floors 6-10 (5 floors per run)
const b3 = simulateBand(2, 6, 5, 50);
// Band 4: Floors 11-15 (5 floors per run)
const b4 = simulateBand(3, 11, 5, 50);

console.log('------------------------------------------------------------------------');
console.log('SUMMARY TABLE: AVERAGE DROPS & YIELDS PER CLEARED FLOOR');
console.log('------------------------------------------------------------------------');
console.log('| Material        | Band 1 (Crypts) | Band 2 (Abyss) | Band 3 (Caldera) | Band 4 (Glacial) |');
console.log('| :-------------- | :-------------: | :------------: | :--------------: | :--------------: |');
const mats = ['bone', 'ectoplasm', 'wolf_pelt', 'bowstring', 'ore', 'wood', 'wild_herbs', 'steel_scrap', 'spider_silk', 'spider_venom'];
for (const m of mats) {
  const v1 = b1.itemsPerFloor[m] ?? 0;
  const v2 = b2.itemsPerFloor[m] ?? 0;
  const v3 = b3.itemsPerFloor[m] ?? 0;
  const v4 = b4.itemsPerFloor[m] ?? 0;
  console.log(`| ${m.padEnd(15, ' ')} | ${String(v1).padStart(15, ' ')} | ${String(v2).padStart(14, ' ')} | ${String(v3).padStart(16, ' ')} | ${String(v4).padStart(16, ' ')} |`);
}
console.log('------------------------------------------------------------------------\n');

// 1. Starter Set Economy Calculation (Band 1)
// Starter Set: Iron Shortsword (3 ore, 1 wood) + Leather Cap (2 wolf_pelt) + Leather Armor (4 wolf_pelt)
// Total needs: 3 ore, 1 wood, 6 wolf_pelt
const b1OrePerFloor = b1.itemsPerFloor['ore'] || 1;
const b1WoodPerFloor = b1.itemsPerFloor['wood'] || 1;
const b1PeltsPerFloor = b1.itemsPerFloor['wolf_pelt'] || 1;

const floorsForOre = Math.ceil(3 / b1OrePerFloor);
const floorsForWood = Math.ceil(1 / b1WoodPerFloor);
const floorsForPelts = Math.ceil(6 / b1PeltsPerFloor);
const floorsForStarterSet = Math.max(floorsForOre, floorsForWood, floorsForPelts);

console.log(`STARTER SET ECONOMY (Iron Shortsword + Leather Cap + Leather Armor):`);
console.log(`- Requirements: 3 Ore, 1 Wood, 6 Wolf Pelts`);
console.log(`- Band 1 Yields / Floor: Ore=${b1OrePerFloor}, Wood=${b1WoodPerFloor}, Wolf Pelts=${b1PeltsPerFloor}`);
console.log(`- Floors Needed for Ore:   ${floorsForOre} floor(s)`);
console.log(`- Floors Needed for Wood:  ${floorsForWood} floor(s)`);
console.log(`- Floors Needed for Pelts: ${floorsForPelts} floor(s)`);
console.log(`=> COMPLETE STARTER SET CRAFTABLE IN: ${floorsForStarterSet} Band 1 floor clears!\n`);

// 2. Isolation Verification (Band 1 Purity)
console.log(`ISOLATION & PURITY VERIFICATION:`);
console.log(`- Illegal Spawns on Band 1 across 50 seeds: ${b1.illegalSpawnsOnBand1.length}`);
if (b1.illegalSpawnsOnBand1.length > 0) {
  console.error('❌ FAIL: Found illegal spawns on Band 1:', b1.illegalSpawnsOnBand1.slice(0, 10));
  process.exit(1);
} else {
  console.log('✅ PASS: Exactly 0 Band 2+ core enemies, elites, or epics spawned on Band 1 across 50 seeds.\n');
}

// 3. Core vs Carry-over Ratios
console.log(`CORE VS CARRY-OVER DISTRIBUTION RATIO CHECK (Target: 70% ± 5% Core, 30% ± 5% Carry):`);
function checkRatio(band: BandSimulationResult, expectedCorePct: number, expectedCarryPct: number) {
  const commonTotal = band.coreEnemies + band.carryOverEnemies;
  const actualCorePct = (band.coreEnemies / commonTotal) * 100;
  const actualCarryPct = (band.carryOverEnemies / commonTotal) * 100;
  const diffCore = Math.abs(actualCorePct - expectedCorePct);
  const diffCarry = Math.abs(actualCarryPct - expectedCarryPct);
  const passed = diffCore <= 5.0 && diffCarry <= 5.0;
  console.log(`- ${band.name.padEnd(20, ' ')}: Core=${actualCorePct.toFixed(1)}% (tgt ${expectedCorePct}%), Carry=${actualCarryPct.toFixed(1)}% (tgt ${expectedCarryPct}%) => ${passed ? '✅ PASS' : '❌ FAIL'}`);
  if (!passed) {
    throw new Error(`Ratio exceeded ±5% tolerance in ${band.name}`);
  }
}

checkRatio(b1, 100, 0);
checkRatio(b2, 70, 30);
checkRatio(b3, 70, 30);
checkRatio(b4, 70, 30);
console.log('');

// 4. Threshold Flagging (Flag but don't tune)
console.log(`THRESHOLD MONITORING:`);
const b1Bowstring = b1.itemsPerFloor['bowstring'] ?? 0;
console.log(`- Band 1 Bowstring per floor: ${b1Bowstring} (Threshold: 0.5)`);
if (b1Bowstring < 0.5) {
  console.log(`  ⚠️ FLAGGED FOR REVIEW: bowstring is ${b1Bowstring} < 0.5 per floor in Band 1.`);
} else {
  console.log(`  ✓ Bowstring meets or exceeds target threshold.`);
}

const b2SteelScrap = b2.itemsPerFloor['steel_scrap'] ?? 0;
console.log(`- Band 2 Steel Scrap per floor: ${b2SteelScrap} (Threshold: 1.0)`);
if (b2SteelScrap < 1.0) {
  console.log(`  ⚠️ FLAGGED FOR REVIEW: steel_scrap is ${b2SteelScrap} < 1.0 per floor in Band 2.`);
} else {
  console.log(`  ✓ Steel Scrap meets or exceeds target threshold.`);
}

console.log('\n========================================================================');
console.log('             ALL SEGMENTATION INVARIANTS VERIFIED!');
console.log('========================================================================');
