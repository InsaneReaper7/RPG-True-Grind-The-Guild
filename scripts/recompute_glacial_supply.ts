import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type { DungeonConfig, EnemyDef, GeneratedDungeon } from '../src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load Current (After) Data
const currentDungeonConfig: DungeonConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8')
);
const currentEnemiesRaw: { enemies: EnemyDef[] } = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8')
);

// 2. Load c343c01 (Before) Data
let oldDungeonConfig: DungeonConfig;
let oldEnemiesRaw: { enemies: EnemyDef[] };

try {
  oldDungeonConfig = JSON.parse(execSync('git show c343c01:data/dungeonConfig.json', { encoding: 'utf8' }));
  oldEnemiesRaw = JSON.parse(execSync('git show c343c01:data/enemies.json', { encoding: 'utf8' }));
} catch (err) {
  console.warn('Could not load c343c01 via git show, falling back to current config');
  oldDungeonConfig = currentDungeonConfig;
  oldEnemiesRaw = currentEnemiesRaw;
}

const nodeYields: Record<string, { item: string; count: number }> = {
  woodcutting_tree: { item: 'wood', count: 2 },
  mining_rock: { item: 'ore', count: 1 },
  foraging_bush: { item: 'wild_herbs', count: 1 },
  vegetable_node: { item: 'vegetable', count: 1 }
};

function simulateGlacialSupply(dungeonConfig: DungeonConfig, enemiesList: EnemyDef[]) {
  const enemiesMap = new Map<string, EnemyDef>();
  for (const e of enemiesList) {
    enemiesMap.set(e.id, e);
  }

  const itemTotals: Record<string, number> = {
    bone: 0,
    ore: 0,
    wood: 0,
    steel_scrap: 0,
    ectoplasm: 0,
    bowstring: 0,
    spider_silk: 0,
    glacial_essence: 0,
    wolf_pelt: 0,
    glacial_meat: 0,
    prime_glacial_meat: 0,
    salt: 0,
    black_pepper: 0
  };

  const seedCount = 50;
  const floorCount = 5; // F16-20
  let totalFloors = 0;

  for (let s = 1; s <= seedCount; s++) {
    for (let f = 0; f < floorCount; f++) {
      const floorNumber = 16 + f;
      const seed = s * 10000 + floorNumber;
      const rng = DungeonGenerator.createRng(seed);

      const dungeon: GeneratedDungeon = DungeonGenerator.generate(dungeonConfig, rng, {
        floorNumber,
        currentFloorSeed: seed,
        seed
      });
      totalFloors++;

      // Process Gathering Nodes
      for (const b of dungeon.bushSpawns) {
        const y = nodeYields[b.nodeTypeId];
        if (y && itemTotals[y.item] !== undefined) {
          itemTotals[y.item] += y.count;
        }
      }

      // Process Enemy Spawns & Loot
      for (const e of dungeon.enemySpawns) {
        const def = enemiesMap.get(e.enemyId);
        if (!def) continue;

        // Common drop
        if (def.tier === 'common') {
          if (def.harvest && def.harvest.length > 0) {
            const valid = def.harvest.filter(
              (h) => h.method !== 'skinning' &&
                     h.method !== 'butchering' &&
                     !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
            );
            const dropChance = def.dropChance ?? 0.4;
            if (rng() < dropChance && valid.length > 0) {
              const totalW = valid.reduce((sum, h) => sum + (h.weight ?? 1), 0);
              let r = rng() * totalW;
              for (const h of valid) {
                const w = h.weight ?? 1;
                if (r < w) {
                  if (itemTotals[h.item] !== undefined) itemTotals[h.item]++;
                  break;
                }
                r -= w;
              }
            }
          }
        } else {
          // Elite / Epic / Boss drops
          const valid = (def.harvest || []).filter(
            (h) => h.method !== 'skinning' &&
                   h.method !== 'butchering' &&
                   !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
          );
          for (const h of valid) {
            const isRare = h.method === 'rare_drop';
            const threshold = def.tier === 'boss' ? 0.60 : 0.35;
            if (!isRare || rng() < threshold) {
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
              if (itemTotals[h.item] !== undefined) itemTotals[h.item] += count;
            }
          }
        }

        // Corpse harvest: skinning
        if (def.corpseHarvest?.skinning) {
          const item = def.corpseHarvest.skinning.item;
          const count = def.corpseHarvest.skinning.count || 1;
          if (itemTotals[item] !== undefined) itemTotals[item] += count;
        }

        // Corpse harvest: butchering
        if (def.corpseHarvest?.butchering) {
          const b = def.corpseHarvest.butchering;
          if (b.premiumItem && b.premiumChance && rng() < b.premiumChance) {
            if (itemTotals[b.premiumItem] !== undefined) itemTotals[b.premiumItem]++;
          } else {
            if (itemTotals[b.item] !== undefined) itemTotals[b.item] += (b.count || 1);
          }
        }

        // Ingredient drops (cooking roll: 12% per cookingConfig)
        if (def.ingredientDrops && def.ingredientDrops.length > 0) {
          if (rng() < 0.12) {
            const totalW = def.ingredientDrops.reduce((sum, i) => sum + (i.weight ?? 1), 0);
            let r = rng() * totalW;
            for (const ing of def.ingredientDrops) {
              const w = ing.weight ?? 1;
              if (r < w) {
                if (itemTotals[ing.item] !== undefined) itemTotals[ing.item]++;
                break;
              }
              r -= w;
            }
          }
        }
      }
    }
  }

  const yields: Record<string, number> = {};
  for (const [k, v] of Object.entries(itemTotals)) {
    yields[k] = Number((v / totalFloors).toFixed(3));
  }
  return yields;
}

console.log('========================================================================================');
console.log('GLACIAL CAVERNS SUPPLY PACING SIMULATION: F16–20 BEFORE (c343c01) VS AFTER');
console.log('========================================================================================\n');

const beforeYields = simulateGlacialSupply(oldDungeonConfig, oldEnemiesRaw.enemies);
const afterYields = simulateGlacialSupply(currentDungeonConfig, currentEnemiesRaw.enemies);

console.log('| Material / Food | Before (c343c01) | After (Glacial Native) | Change (%) | Flagged (> 25% drop)? | Note |');
console.log('| :--- | :---: | :---: | :---: | :---: | :--- |');

for (const k of Object.keys(beforeYields)) {
  const b = beforeYields[k];
  const a = afterYields[k];
  let pctChangeStr = 'N/A';
  let flagged = 'NO';
  let note = '';

  if (b > 0) {
    const pct = ((a - b) / b) * 100;
    pctChangeStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    if (pct < -25) {
      flagged = 'FLAGGED';
      if (k === 'bowstring') note = 'Expected: skeleton_archer leaves pool';
      else if (k === 'spider_silk') note = 'Expected: spider leaves pool';
    }
  } else if (a > 0) {
    pctChangeStr = '+∞ (new source)';
    note = 'Native Glacial harvest source introduced';
  } else {
    pctChangeStr = '0.0%';
  }

  console.log(`| ${k.padEnd(18, ' ')} | ${String(b).padStart(16, ' ')} | ${String(a).padStart(22, ' ')} | ${pctChangeStr.padStart(10, ' ')} | ${flagged.padStart(21, ' ')} | ${note} |`);
}

console.log('\n========================================================================================');
console.log('SUPPLY PACING ANALYSIS COMPLETE');
console.log('========================================================================================');
