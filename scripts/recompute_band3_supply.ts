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

// Node yields
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

// Recipe list for Band 3 Void rung & weapons
interface VoidRecipe {
  name: string;
  ingredients: Record<string, number>;
}

const voidRecipes: VoidRecipe[] = [
  { name: 'Spiked Morningstar (Maces)', ingredients: { ore: 8, steel_scrap: 5, orc_heavy_hide: 2 } },
  { name: 'War Bow (Bows)', ingredients: { wood: 8, wolf_claw: 2, spider_silk: 4 } },
  { name: 'Voidforged Short Sword (1H Sword)', ingredients: { ore: 6, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Longsword (1H Sword)', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Katana (1H Katana)', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Greatsword (2H Sword)', ingredients: { ore: 10, steel_scrap: 3, void_plate: 1 } },
  { name: 'Voidforged Spear (1H Spear)', ingredients: { ore: 8, wood: 2, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Halberd (2H Spear)', ingredients: { ore: 10, wood: 3, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Daggers (Daggers)', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },
  { name: 'Voidforged Crossbow (Crossbow)', ingredients: { ore: 8, wood: 3, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Staff (Staff)', ingredients: { wood: 8, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Tower Shield (Shield)', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { name: 'Voidforged Throwing Blades (Throwing)', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },
  { name: 'Voidforged Greathelm (Helm)', ingredients: { void_plate: 1, steel_scrap: 2, ore: 4 } },
  { name: 'Voidforged Plate Armor (Body)', ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 } },
  { name: 'Voidforged Pendant (Neck)', ingredients: { void_essence: 1, bone: 2, bowstring: 1 } },
  { name: 'Voidforged Band (Ring)', ingredients: { void_essence: 1, wolf_claw: 2, steel_scrap: 1 } },
  { name: 'Voidforged Relic (Chase Trinket)', ingredients: { void_core: 1, void_essence: 1, spider_silk: 2 } }
];

// Proposed enemy definitions
const proposedEnemyDefs: EnemyDef[] = [
  {
    id: 'cinder_hound',
    name: 'Cinder Hound',
    tier: 'common',
    hp: 32,
    criticalHpMax: 16,
    meleeDamage: 7,
    attackIntervalMs: 900,
    moveSpeed: 100,
    aggroRadius: 7,
    dropChance: 0.40,
    harvest: [
      { method: 'salvage', item: 'monster_meat', weight: 2 },
      { method: 'salvage', item: 'bone', weight: 2 }
    ],
    corpseHarvest: {
      skinning: {
        item: 'wolf_pelt',
        name: 'Wolf Pelt',
        count: 1,
        exp: 15,
        tags: ['armorsmithing']
      },
      butchering: {
        item: 'wolf_meat',
        name: 'Wolf Meat',
        count: 1,
        exp: 15,
        tags: ['cooking']
      }
    }
  },
  {
    id: 'magma_brute',
    name: 'Magma Brute',
    tier: 'common',
    hp: 65,
    criticalHpMax: 32,
    meleeDamage: 14,
    attackIntervalMs: 1700,
    moveSpeed: 70,
    aggroRadius: 6,
    dropChance: 0.40,
    harvest: [
      { method: 'salvage', item: 'ore', weight: 3 },
      { method: 'salvage', item: 'bone', weight: 1 }
    ]
  },
  {
    id: 'ash_wraith',
    name: 'Ash Wraith',
    tier: 'common',
    hp: 28,
    criticalHpMax: 14,
    meleeDamage: 9,
    attackIntervalMs: 1250,
    moveSpeed: 80,
    aggroRadius: 8,
    attackRangeTiles: 4,
    dropChance: 0.40,
    harvest: [
      { method: 'salvage', item: 'ectoplasm', weight: 2 },
      { method: 'salvage', item: 'bone', weight: 2 }
    ]
  },
  {
    id: 'obsidian_sentry',
    name: 'Obsidian Sentry',
    tier: 'common',
    hp: 75,
    criticalHpMax: 37,
    meleeDamage: 5,
    attackIntervalMs: 1600,
    moveSpeed: 65,
    aggroRadius: 6,
    dropChance: 0.40,
    harvest: [
      { method: 'salvage', item: 'ore', weight: 3 },
      { method: 'salvage', item: 'clay', weight: 2 }
    ]
  }
];

const proposedCalderaPool = [
  { enemyId: 'cinder_hound', weight: 25, type: 'core' },
  { enemyId: 'magma_brute', weight: 18, type: 'core' },
  { enemyId: 'ash_wraith', weight: 15, type: 'core' },
  { enemyId: 'obsidian_sentry', weight: 12, type: 'core' },
  { enemyId: 'undead', weight: 15, type: 'carry_over' },
  { enemyId: 'spider', weight: 15, type: 'carry_over' }
];

import { DataLoader } from '../src/utils/DataLoader.ts';
const craftingConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/craftingConfig.json'), 'utf8'));
(DataLoader.getInstance() as any).craftingConfigData = craftingConfig;

function simulateBandSupply(
  useProposed: boolean,
  runsPerFloor: number = 100
): { itemsPerFloor: Record<string, number>; bossKillsPerFloor: number; randomBossPicks: string } {
  const testConfig: DungeonConfig = JSON.parse(JSON.stringify(dungeonConfig));
  const testMap = new Map<string, EnemyDef>(enemiesMap);

  if (useProposed) {
    for (const p of proposedEnemyDefs) {
      testMap.set(p.id, p);
    }
    const magmaTyrantDef: EnemyDef = {
      id: 'magma_tyrant',
      name: 'Magma Tyrant',
      tier: 'boss',
      hp: 550,
      criticalHpMax: 275,
      meleeDamage: 30,
      attackIntervalMs: 1400,
      moveSpeed: 80,
      aggroRadius: 8,
      attackRangeTiles: 1,
      dropChance: 1.0,
      harvest: []
    };
    testMap.set(magmaTyrantDef.id, magmaTyrantDef);

    const caldera = testConfig.regions!.find(r => r.id === 'infernal_caldera')!;
    caldera.bossEnemyId = 'magma_tyrant';
    caldera.enemyPool = proposedCalderaPool;
  }

  const itemTotals: Record<string, number> = {};
  let totalFloors = 0;
  let bossKills = 0;
  let randomBossEncounterCount = 0;
  let randomBossId = '';

  for (let s = 1; s <= runsPerFloor; s++) {
    for (let f = 11; f <= 15; f++) {
      totalFloors++;
      const seed = s * 10000 + f;
      const rng = DungeonGenerator.createRng(seed);

      const dungeon: GeneratedDungeon = DungeonGenerator.generate(testConfig, rng, {
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

      // Enemy spawns
      for (const e of dungeon.enemySpawns) {
        const def = testMap.get(e.enemyId);
        if (!def) continue;

        if (def.tier === 'boss') {
          bossKills++;
          if (f !== 15) {
            randomBossEncounterCount++;
            randomBossId = def.id;
          }
          if (useProposed) {
            // New Magma Tyrant drops:
            // void_plate: 1 at 50%
            if (rng() < 0.50) itemTotals['void_plate'] = (itemTotals['void_plate'] || 0) + 1;
            // void_essence: 1 at 50%
            if (rng() < 0.50) itemTotals['void_essence'] = (itemTotals['void_essence'] || 0) + 1;
            // void_core: 1 at 10%
            if (rng() < 0.10) itemTotals['void_core'] = (itemTotals['void_core'] || 0) + 1;
            // Gemstone: 1 guaranteed (50% Fire, 50% Lightning)
            if (rng() < 0.50) {
              itemTotals['fire_gemstone'] = (itemTotals['fire_gemstone'] || 0) + 1;
            } else {
              itemTotals['lightning_gemstone'] = (itemTotals['lightning_gemstone'] || 0) + 1;
            }
          } else {
            // Old Colossus drops on F10
            // Colossus drops colossus_core, abyssal_ingot, dread_essence, heart_of_the_colossus
            // (Provides 0 Void materials!)
            itemTotals['colossus_core'] = (itemTotals['colossus_core'] || 0) + 1;
            itemTotals['abyssal_ingot'] = (itemTotals['abyssal_ingot'] || 0) + 1;
            itemTotals['dread_essence'] = (itemTotals['dread_essence'] || 0) + 1;
            if (rng() < 0.60) itemTotals['heart_of_the_colossus'] = (itemTotals['heart_of_the_colossus'] || 0) + 1;
          }
        } else if (def.tier === 'common') {
          const drop = rollCommonDrop(def, rng);
          if (drop) {
            itemTotals[drop.item] = (itemTotals[drop.item] || 0) + 1;
          }
        } else if (def.tier === 'elemental') {
          // Guaranteed 1-2 gemstone of school + secondary
          const school = def.id.replace('_elemental', '');
          const gemCount = Math.floor(rng() * 2) + 1;
          itemTotals[`${school}_gemstone`] = (itemTotals[`${school}_gemstone`] || 0) + gemCount;
        } else {
          // Elite and Epic
          const validHarvest = (def.harvest || []).filter(
            (h) => h.method !== 'skinning' && h.method !== 'butchering' && !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
          );
          for (const h of validHarvest) {
            const isRare = h.method === 'rare_drop';
            const roll = rng();
            const threshold = 0.35;
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

        // Corpse skinning
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
    itemsPerFloor[k] = Number((v / totalFloors).toFixed(3));
  }

  return {
    itemsPerFloor,
    bossKillsPerFloor: bossKills / totalFloors,
    randomBossPicks: randomBossId || (useProposed ? 'magma_tyrant' : 'abyssal_colossus')
  };
}

console.log('========================================================================================');
console.log('BAND 3 SUPPLY AUDIT: 500 FLOORS SAMPLED (100 FULL RUNS OF F11–F15)');
console.log('========================================================================================\n');

const beforeSim = simulateBandSupply(false, 100);
const afterSim = simulateBandSupply(true, 100);

console.log(`- Boss kills per floor (Before): ${beforeSim.bossKillsPerFloor.toFixed(3)} (Milestone F15: 0.200 + Random Boss: ${(beforeSim.bossKillsPerFloor - 0.2).toFixed(3)})`);
console.log(`  * Random Boss Roll picks: "${beforeSim.randomBossPicks}" (DungeonGenerator lines 848-854 routed by currentRegion.bossEnemyId)`);
console.log(`- Boss kills per floor (After):  ${afterSim.bossKillsPerFloor.toFixed(3)} (Milestone F15: 0.200 + Random Boss: ${(afterSim.bossKillsPerFloor - 0.2).toFixed(3)})`);
console.log(`  * Random Boss Roll picks: "${afterSim.randomBossPicks}" (infernal_caldera.bossEnemyId = "magma_tyrant")\n`);

console.log('--- Material Yields Per Band 3 Floor (Before vs. After) ---');
console.log('| Material | Before Yield/Flr | After Yield/Flr | Delta | Primary Source (After) |');
console.log('| :--- | :---: | :---: | :---: | :--- |');

const allMats = new Set<string>();
for (const r of voidRecipes) {
  for (const m of Object.keys(r.ingredients)) allMats.add(m);
}
allMats.add('fire_gemstone');
allMats.add('lightning_gemstone');
allMats.add('wolf_pelt');

for (const m of Array.from(allMats).sort()) {
  const b = beforeSim.itemsPerFloor[m] ?? 0;
  const a = afterSim.itemsPerFloor[m] ?? 0;
  const delta = (a - b).toFixed(3);
  const deltaSign = (a - b) >= 0 ? `+${delta}` : `${delta}`;
  let src = '';
  if (m === 'void_plate') src = 'Void Knight (salvage [2,3]) + Magma Tyrant (50% 1)';
  else if (m === 'void_essence') src = 'Void Knight (salvage [1,2]) + Magma Tyrant (50% 1)';
  else if (m === 'void_core') src = 'Void Knight (35% rare) + Magma Tyrant (10% rare)';
  else if (m === 'steel_scrap') src = 'Orc Warrior (salvage 1, elite roll unchanged)';
  else if (m === 'ore') src = 'Mining Rocks + Magma Brute / Obsidian Sentry salvage';
  else if (m === 'wood') src = 'Woodcutting Trees (nodes unchanged)';
  else if (m === 'bone') src = 'Cinder Hound + Ash Wraith salvage';
  else if (m === 'spider_silk') src = 'Giant Spider (15% carry-over pool: common drop + skinning)';
  else if (m === 'orc_heavy_hide') src = 'Orc Warrior (35% rare drop)';
  else if (m === 'wolf_claw') src = '0 in Band 3 (Band 1 farm only from Wolf)';
  else if (m === 'bowstring') src = '0 in Band 3 (Bands 1 & 2 farm only from Goblin Archer)';
  else if (m === 'fire_gemstone') src = 'Fire Elemental (1-2) + Magma Tyrant (50% 1)';
  else if (m === 'lightning_gemstone') src = 'Lightning Elemental (1-2) + Magma Tyrant (50% 1)';
  else if (m === 'wolf_pelt') src = 'Cinder Hound (corpse skinning 1)';
  console.log(`| ${m} | ${b.toFixed(3)} | ${a.toFixed(3)} | ${deltaSign} | ${src} |`);
}

// Band 1 & Band 2 fallback yields for wolf_claw and bowstring
const b1Sim = { wolf_claw: 0.45, bowstring: 0.38 };

console.log('\n--- Band 3 Void Ladder Pacing (Floors Per Craft: Before vs. After) ---');
console.log('| Recipe (Item) | Required Ingredients | Before Limiting Mat | Before Flrs | After Limiting Mat | After Flrs | Delta Flrs | Status Flag |');
console.log('| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |');

for (const r of voidRecipes) {
  let bMaxFlrs = 0;
  let bLimiting = '';
  let aMaxFlrs = 0;
  let aLimiting = '';

  for (const [mat, count] of Object.entries(r.ingredients)) {
    const bYield = beforeSim.itemsPerFloor[mat] ?? (b1Sim[mat as keyof typeof b1Sim] || 0.001);
    const aYield = afterSim.itemsPerFloor[mat] ?? (b1Sim[mat as keyof typeof b1Sim] || 0.001);

    const bFlrs = count / bYield;
    if (bFlrs > bMaxFlrs) {
      bMaxFlrs = bFlrs;
      bLimiting = beforeSim.itemsPerFloor[mat] !== undefined ? `${mat} (${bYield.toFixed(2)}/flr)` : `${mat} (B1 farm: ${bYield.toFixed(2)}/flr)`;
    }

    const aFlrs = count / aYield;
    if (aFlrs > aMaxFlrs) {
      aMaxFlrs = aFlrs;
      aLimiting = afterSim.itemsPerFloor[mat] !== undefined ? `${mat} (${aYield.toFixed(2)}/flr)` : `${mat} (B1/B2 farm: ${aYield.toFixed(2)}/flr)`;
    }
  }

  const ingStr = Object.entries(r.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  const deltaFlrs = (aMaxFlrs - bMaxFlrs).toFixed(1);
  const deltaStr = (aMaxFlrs - bMaxFlrs) < -0.05 ? `${deltaFlrs} flr (Faster)` : (aMaxFlrs - bMaxFlrs) > 0.05 ? `+${deltaFlrs} flr (Slower)` : '0.0 flr (Same)';

  let flag = 'Pass';
  if (r.name.includes('Relic')) flag = 'Pass (Chase Relic)';
  else if (r.name.includes('Morningstar')) flag = 'Pass (Approved Maces Exception)';
  else if (r.name.includes('War Bow')) {
    if (aMaxFlrs > bMaxFlrs) flag = 'FLAG: Slower (Spider 30->15)';
    else flag = 'Pass';
  } else if (aMaxFlrs > 8.0) flag = `FLAG: >8.0 flr (${aMaxFlrs.toFixed(1)})`;
  else if (aMaxFlrs > bMaxFlrs + 0.1) flag = `FLAG: Slower`;

  console.log(`| ${r.name} | ${ingStr} | ${bLimiting} | ${bMaxFlrs.toFixed(1)} flr | ${aLimiting} | ${aMaxFlrs.toFixed(1)} flr | ${deltaStr} | ${flag} |`);
}
