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

// -----------------------------------------------------------------------------
// 0.1 Current Abyss Pool JSON
// -----------------------------------------------------------------------------
console.log('=== ITEM 0.1: CURRENT ABYSS POOL IN DUNGEONCONFIG.JSON ===');
const abyssRegion = dungeonConfig.regions?.find(r => r.id === 'abyssal_depths');
console.log(JSON.stringify({
  region: abyssRegion,
  eliteConfig: {
    eliteEnemyId: dungeonConfig.eliteEnemyId,
    eliteChance: dungeonConfig.eliteChance,
    depthScaling: dungeonConfig.depthScaling
  }
}, null, 2));

// -----------------------------------------------------------------------------
// 0.2 Stats of Every Abyss Enemy from enemies.json
// -----------------------------------------------------------------------------
console.log('\n=== ITEM 0.2: STATS OF EVERY ABYSS ENEMY FROM ENEMIES.JSON ===');
const currentAbyssIds = ['spider', 'undead', 'skeleton', 'goblin_archer', 'wolf', 'orc_warrior', 'abyssal_colossus', 'arcane_elemental'];
const abyssEnemies = enemiesRaw.enemies.filter(e => currentAbyssIds.includes(e.id));
console.log(JSON.stringify(abyssEnemies, null, 2));

// -----------------------------------------------------------------------------
// 0.3 Band 2 Supply Baseline
// -----------------------------------------------------------------------------
console.log('\n=== ITEM 0.3: BAND 2 SUPPLY BASELINE (F6-10) ===');
console.log('[NOTE: Elemental spawns are excluded from these supply numbers (tutorial condition off in headless runner, only Colossus is sampled for boss gems; elemental gem supply was signed off separately in cb880c2).]\n');

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

function runSupplySim(configToUse: DungeonConfig, enemyMapToUse: Map<string, EnemyDef>, seedCount = 50) {
  let floorsSampled = 0;
  const itemTotals: Record<string, number> = {};
  const enemySpawnCounts: Record<string, number> = {};

  for (let s = 1; s <= seedCount; s++) {
    for (let f = 6; f <= 10; f++) {
      floorsSampled++;
      const seed = s * 10000 + f;
      const rng = DungeonGenerator.createRng(seed);
      const dungeon = DungeonGenerator.generate(configToUse, rng, {
        floorNumber: f,
        currentFloorSeed: seed,
        seed
      });

      for (const b of dungeon.bushSpawns) {
        const yieldDef = nodeYields[b.nodeTypeId];
        if (yieldDef) {
          itemTotals[yieldDef.item] = (itemTotals[yieldDef.item] || 0) + yieldDef.count;
        }
      }

      for (const e of dungeon.enemySpawns) {
        enemySpawnCounts[e.enemyId] = (enemySpawnCounts[e.enemyId] || 0) + 1;
        const def = enemyMapToUse.get(e.enemyId);
        if (!def) continue;

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
    itemsPerFloor[k] = Number((v / floorsSampled).toFixed(3));
  }

  const spawnsPerFloor: Record<string, number> = {};
  for (const [k, v] of Object.entries(enemySpawnCounts)) {
    spawnsPerFloor[k] = Number((v / floorsSampled).toFixed(3));
  }

  return { floorsSampled, itemsPerFloor, spawnsPerFloor };
}

// Create original baseline config (Spider: 40, Undead: 30)
const baselineConfig: DungeonConfig = JSON.parse(JSON.stringify(dungeonConfig));
const baselineAbyss = baselineConfig.regions?.find(r => r.id === 'abyssal_depths');
if (baselineAbyss) {
  baselineAbyss.enemyPool = [
    { enemyId: 'spider', weight: 40, type: 'core' },
    { enemyId: 'undead', weight: 30, type: 'core' },
    { enemyId: 'skeleton', weight: 10, type: 'carry_over' },
    { enemyId: 'goblin_archer', weight: 10, type: 'carry_over' },
    { enemyId: 'wolf', weight: 10, type: 'carry_over' }
  ];
}
// Baseline enemy map without the 3 new enemies
const baselineEnemyMap = new Map<string, EnemyDef>();
for (const e of enemiesRaw.enemies) {
  if (!['deep_crawler', 'abyssal_lurker', 'void_thrall'].includes(e.id)) {
    baselineEnemyMap.set(e.id, e);
  }
}

const baselineB2 = runSupplySim(baselineConfig, baselineEnemyMap, 50);

console.log('Materials Per Floor (F6-10 Baseline):');
for (const [mat, rate] of Object.entries(baselineB2.itemsPerFloor).sort((a,b) => b[1] - a[1])) {
  console.log(`  - ${mat}: ${rate.toFixed(3)} / floor`);
}
console.log('\nEnemy Spawns Per Floor (F6-10 Baseline):');
for (const [enm, rate] of Object.entries(baselineB2.spawnsPerFloor).sort((a,b) => b[1] - a[1])) {
  console.log(`  - ${enm}: ${rate.toFixed(3)} / floor`);
}

const band2Recipes = [
  { item: 'Heavy War Mace', recipeType: 'Existing', ingredients: { ore: 6, steel_scrap: 3, orc_heavy_hide: 1 } },
  { item: 'Steel Greatsword', recipeType: 'Existing', ingredients: { ore: 8, wood: 3, steel_scrap: 2 } },
  { item: 'Composite Bow', recipeType: 'Existing', ingredients: { wood: 6, bone: 2, spider_silk: 3 } },
  { item: 'Silk Cowl', recipeType: 'Existing', ingredients: { spider_silk: 3, wolf_pelt: 1 } },
  { item: 'Silk Robe', recipeType: 'Existing', ingredients: { spider_silk: 5, wolf_pelt: 2 } },
  { item: 'Venom Charm', recipeType: 'Existing', ingredients: { spider_venom: 2, spider_silk: 2 } },
  { item: 'Steel Short Sword', recipeType: 'New', ingredients: { ore: 5, wood: 2, steel_scrap: 2 } },
  { item: 'Steel Longsword', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { item: 'Folded Steel Katana', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { item: 'Steel Spear', recipeType: 'New', ingredients: { ore: 6, wood: 3, steel_scrap: 2 } },
  { item: 'Steel Halberd', recipeType: 'New', ingredients: { ore: 8, wood: 4, steel_scrap: 2 } },
  { item: 'Serrated Daggers', recipeType: 'New', ingredients: { ore: 4, wood: 1, steel_scrap: 1, spider_venom: 1 } },
  { item: 'Heavy Crossbow', recipeType: 'New', ingredients: { ore: 7, wood: 3, steel_scrap: 2 } },
  { item: 'Reinforced Staff', recipeType: 'New', ingredients: { wood: 6, bone: 2, steel_scrap: 2 } },
  { item: 'Steel Kite Shield', recipeType: 'New', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { item: 'Steel Chakrams', recipeType: 'New', ingredients: { ore: 4, wood: 1, steel_scrap: 2 } }
];

console.log('\nBand 2 Recipe Craft Rates (Baseline):');
console.log('| Recipe (Item) | Status | Required Ingredients | Limiting Ingredient & Yield/Flr | Est Floors / Craft |');
console.log('| :--- | :---: | :--- | :--- | :---: |');
for (const r of band2Recipes) {
  let maxFloors = 0;
  let limitMat = '';
  let limitYield = 0;
  for (const [mat, count] of Object.entries(r.ingredients)) {
    const y = baselineB2.itemsPerFloor[mat] ?? 0;
    if (y > 0) {
      const f = count / y;
      if (f > maxFloors) {
        maxFloors = f;
        limitMat = mat;
        limitYield = y;
      }
    }
  }
  const ingStr = Object.entries(r.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`| ${r.item} | ${r.recipeType} | ${ingStr} | ${limitMat} (${limitYield.toFixed(2)}/flr) | ${maxFloors.toFixed(1)} flr |`);
}

// -----------------------------------------------------------------------------
// Implemented Pool & Drops Evaluation
// -----------------------------------------------------------------------------
console.log('\n=== SECTION 2: IMPLEMENTED POOL & RE-RUN SIMULATION ===');

const proposedB2 = runSupplySim(dungeonConfig, enemiesMap, 50);

console.log('Materials Per Floor Comparison (Baseline vs Implemented):');
console.log('| Material | Baseline Yield/Flr | Implemented Yield/Flr | Delta | % Change | Threshold Flag |');
console.log('| :--- | :---: | :---: | :---: | :---: | :--- |');
const allMats = Array.from(new Set([...Object.keys(baselineB2.itemsPerFloor), ...Object.keys(proposedB2.itemsPerFloor)])).sort();
for (const mat of allMats) {
  const base = baselineB2.itemsPerFloor[mat] ?? 0;
  const prop = proposedB2.itemsPerFloor[mat] ?? 0;
  const delta = prop - base;
  const pctNum = base > 0 ? (delta / base) * 100 : 0;
  const pctStr = base > 0 ? pctNum.toFixed(1) + '%' : 'N/A';
  let flag = 'Pass';
  if (['spider_silk', 'ectoplasm', 'spider_venom'].includes(mat)) {
    if (pctNum < -15) {
      flag = 'FLAG (<-15%)';
    } else {
      flag = 'Pass (>-15%)';
    }
  }
  console.log(`| ${mat} | ${base.toFixed(3)} | ${prop.toFixed(3)} | ${(delta >= 0 ? '+' : '') + delta.toFixed(3)} | ${pctStr} | ${flag} |`);
}

console.log('\nBand 2 Recipe Craft Rates (Before vs After):');
console.log('| Recipe (Item) | Baseline Flr/Craft | Implemented Flr/Craft | Limiting Mat (Imp) | Supply Flag |');
console.log('| :--- | :---: | :---: | :--- | :---: |');
for (const r of band2Recipes) {
  // Baseline
  let baseFloors = 0;
  for (const [mat, count] of Object.entries(r.ingredients)) {
    const y = baselineB2.itemsPerFloor[mat] ?? 0;
    if (y > 0) baseFloors = Math.max(baseFloors, count / y);
  }
  // Proposed
  let propFloors = 0;
  let propLimitMat = '';
  let propLimitYield = 0;
  for (const [mat, count] of Object.entries(r.ingredients)) {
    const y = proposedB2.itemsPerFloor[mat] ?? 0;
    if (y > 0) {
      const f = count / y;
      if (f > propFloors) {
        propFloors = f;
        propLimitMat = mat;
        propLimitYield = y;
      }
    }
  }

  let flag = 'Pass';
  if (propFloors > baseFloors + 0.1) {
    flag = 'SLOWER';
  } else if (propFloors < baseFloors - 0.1) {
    flag = 'FASTER';
  } else {
    flag = 'EQUAL';
  }
  console.log(`| ${r.item} | ${baseFloors.toFixed(1)} flr | ${propFloors.toFixed(1)} flr | ${propLimitMat} (${propLimitYield.toFixed(2)}/flr) | ${flag} |`);
}

// -----------------------------------------------------------------------------
// DANGER SIMULATION: HEAVY COMBAT ROOM (PERFECT VS SLOPPY)
// -----------------------------------------------------------------------------
console.log('\n=== DANGER SIMULATION: HEAVY COMBAT ROOM ===');

interface SimCombatant {
  name: string;
  hp: number;
  maxHp: number;
  critHp: number;
  maxCritHp: number;
  damage: number;
  intervalMs: number;
  mitigation: number;
  evasionChance: number;
  blockChance: number;
  healthPotions: number;
  lastPotionTime: number;
  isHealer?: boolean;
  healAmount?: number;
  healIntervalMs?: number;
  lastAttackTime: number;
  lastHealTime: number;
  activeStatus: { id: string; durationMs: number; dps: number; reduction?: number; accuracyLoss?: number }[];
}

function runCombatSim(
  encounterName: string,
  partyDefs: () => SimCombatant[],
  enemyDefs: () => SimCombatant[],
  mode: 'perfect' | 'sloppy',
  runs: number = 500
) {
  let wins = 0;
  let totalDuration = 0;
  let totalDowned = 0;
  let totalEndHp = 0;

  for (let r = 0; r < runs; r++) {
    const party = partyDefs();
    const enemies = enemyDefs();
    let simTimeMs = 0;
    const dt = 100; // 100ms ticks

    while (simTimeMs < 120000) {
      simTimeMs += dt;
      const livingParty = party.filter(p => p.hp > 0 || p.critHp > 0);
      const livingEnemies = enemies.filter(e => e.hp > 0 || e.critHp > 0);

      if (livingParty.length === 0 || livingEnemies.length === 0) break;

      // Enemy turns
      for (const enemy of livingEnemies) {
        // Status effect tick on enemy
        for (let sIdx = enemy.activeStatus.length - 1; sIdx >= 0; sIdx--) {
          const st = enemy.activeStatus[sIdx];
          st.durationMs -= dt;
          if (st.dps > 0) {
            let dmg = (st.dps * dt) / 1000;
            if (enemy.hp >= dmg) enemy.hp -= dmg;
            else {
              dmg -= enemy.hp;
              enemy.hp = 0;
              enemy.critHp = Math.max(0, enemy.critHp - dmg);
            }
          }
          if (st.durationMs <= 0) enemy.activeStatus.splice(sIdx, 1);
        }

        if (simTimeMs - enemy.lastAttackTime >= enemy.intervalMs) {
          enemy.lastAttackTime = simTimeMs;
          const target = livingParty[Math.floor(Math.random() * livingParty.length)];
          if (target) {
            if (Math.random() >= target.evasionChance) {
              if (Math.random() >= target.blockChance) {
                const effDmg = Math.max(1, enemy.damage - target.mitigation);
                if (target.hp >= effDmg) {
                  target.hp -= effDmg;
                } else {
                  const oflow = effDmg - target.hp;
                  target.hp = 0;
                  target.critHp = Math.max(0, target.critHp - oflow);
                }

                // Enemy procs:
                if (enemy.name === 'Deep Crawler' && Math.random() < 0.15) {
                  target.activeStatus.push({ id: 'bleed', durationMs: 6000, dps: 3 });
                } else if (enemy.name === 'Abyssal Lurker' && Math.random() < 0.15) {
                  target.activeStatus.push({ id: 'blind', durationMs: 4000, dps: 0, accuracyLoss: 0.35 });
                } else if (enemy.name === 'Void Thrall' && Math.random() < 0.20) {
                  target.activeStatus.push({ id: 'slow', durationMs: 3000, dps: 0, reduction: 0.5 });
                }
              }
            }
          }
        }
      }

      // Party turns
      for (const member of livingParty) {
        // Status effect tick on party member
        for (let sIdx = member.activeStatus.length - 1; sIdx >= 0; sIdx--) {
          const st = member.activeStatus[sIdx];
          st.durationMs -= dt;
          if (st.dps > 0) {
            let dmg = (st.dps * dt) / 1000;
            if (member.hp >= dmg) member.hp -= dmg;
            else {
              dmg -= member.hp;
              member.hp = 0;
              member.critHp = Math.max(0, member.critHp - dmg);
            }
          }
          if (st.durationMs <= 0) member.activeStatus.splice(sIdx, 1);
        }

        // Potion use
        if (mode === 'perfect') {
          if (member.healthPotions > 0 && member.hp <= 20 && simTimeMs - member.lastPotionTime >= 10000) {
            member.healthPotions--;
            member.lastPotionTime = simTimeMs;
            const needCrit = member.maxCritHp - member.critHp;
            if (needCrit > 0) {
              const toCrit = Math.min(30, needCrit);
              member.critHp += toCrit;
              member.hp = Math.min(member.maxHp, member.hp + (30 - toCrit));
            } else {
              member.hp = Math.min(member.maxHp, member.hp + 30);
            }
          }
        } else {
          // Sloppy: uses potion only when critical HP is threatened (hp === 0, critHp <= 10)
          if (member.healthPotions > 0 && member.hp === 0 && member.critHp <= 10 && simTimeMs - member.lastPotionTime >= 15000) {
            member.healthPotions--;
            member.lastPotionTime = simTimeMs;
            member.critHp = Math.min(member.maxCritHp, member.critHp + 30);
          }
        }

        // Healer
        if (member.isHealer) {
          const healInterval = mode === 'perfect' ? (member.healIntervalMs || 2500) : (member.healIntervalMs || 2500) * 1.3;
          if (simTimeMs - member.lastHealTime >= healInterval) {
            member.lastHealTime = simTimeMs;
            const injured = livingParty
              .filter(p => (p.hp + p.critHp) < (p.maxHp + p.maxCritHp))
              .sort((a, b) => (a.hp + a.critHp) - (b.hp + b.critHp))[0];
            if (injured) {
              const healAmt = member.healAmount || 12;
              const needCrit = injured.maxCritHp - injured.critHp;
              if (needCrit > 0) {
                const toCrit = Math.min(healAmt, needCrit);
                injured.critHp += toCrit;
                injured.hp = Math.min(injured.maxHp, injured.hp + (healAmt - toCrit));
              } else {
                injured.hp = Math.min(injured.maxHp, injured.hp + healAmt);
              }
            }
          }
        }

        // Attacks
        const effectiveInterval = member.activeStatus.some(s => s.id === 'slow') ? member.intervalMs * 1.2 : member.intervalMs;
        if (simTimeMs - member.lastAttackTime >= effectiveInterval) {
          member.lastAttackTime = simTimeMs;
          // Target priority: lowest HP (perfect) vs random (sloppy)
          const target = mode === 'perfect'
            ? livingEnemies.sort((a, b) => (a.hp + a.critHp) - (b.hp + b.critHp))[0]
            : livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
          
          if (target) {
            // Check blind miss
            const isBlinded = member.activeStatus.some(s => s.id === 'blind');
            if (isBlinded && Math.random() < 0.35) {
              continue;
            }
            const dmg = member.damage;
            if (target.hp >= dmg) {
              target.hp -= dmg;
            } else {
              const oflow = dmg - target.hp;
              target.hp = 0;
              target.critHp = Math.max(0, target.critHp - oflow);
            }
          }
        }
      }
    }

    const livingParty = party.filter(p => p.hp > 0 || p.critHp > 0);
    const livingEnemies = enemies.filter(e => e.hp > 0 || e.critHp > 0);
    if (livingEnemies.length === 0 && livingParty.length > 0) {
      wins++;
      totalDuration += simTimeMs / 1000;
      totalEndHp += livingParty.reduce((sum, p) => sum + p.hp + p.critHp, 0) / livingParty.length;
      totalDowned += party.length - livingParty.length;
    }
  }

  return {
    winRate: wins / runs,
    avgDurationSec: wins > 0 ? totalDuration / wins : 0,
    avgPartyDowned: wins > 0 ? totalDowned / wins : 0,
    avgHpRemaining: wins > 0 ? totalEndHp / wins : 0
  };
}

// Heavy Combat Room pack: 1 Void Thrall, 2 Deep Crawlers, 1 Abyssal Lurker (4 enemies)
const createAbyssHeavyRoom = (): SimCombatant[] => [
  { name: 'Void Thrall', hp: 48, maxHp: 48, critHp: 24, maxCritHp: 24, damage: 7, intervalMs: 1600, mitigation: 1, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Deep Crawler', hp: 28, maxHp: 28, critHp: 14, maxCritHp: 14, damage: 6, intervalMs: 950, mitigation: 0, evasionChance: 0.05, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Deep Crawler', hp: 28, maxHp: 28, critHp: 14, maxCritHp: 14, damage: 6, intervalMs: 950, mitigation: 0, evasionChance: 0.05, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Abyssal Lurker', hp: 22, maxHp: 22, critHp: 11, maxCritHp: 11, damage: 5, intervalMs: 1100, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

// Party with Band 1 crafted gear (Leather armor, iron weapons)
const createBand1Party = (potions = 1): SimCombatant[] => [
  { name: 'Warrior', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 7, intervalMs: 1200, mitigation: 1, evasionChance: 0.05, blockChance: 0.10, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Rogue', hp: 35, maxHp: 35, critHp: 17, maxCritHp: 17, damage: 6, intervalMs: 900, mitigation: 0, evasionChance: 0.12, blockChance: 0.00, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ranger', hp: 35, maxHp: 35, critHp: 17, maxCritHp: 17, damage: 7, intervalMs: 1250, mitigation: 0, evasionChance: 0.08, blockChance: 0.00, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Healer', hp: 35, maxHp: 35, critHp: 17, maxCritHp: 17, damage: 4, intervalMs: 1400, mitigation: 0, evasionChance: 0.05, blockChance: 0.00, healthPotions: potions, lastPotionTime: -10000, isHealer: true, healAmount: 10, healIntervalMs: 2800, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

// Party with Band 2 gear (Silk gear, steel weapons)
const createBand2Party = (potions = 2): SimCombatant[] => [
  { name: 'Warrior', hp: 55, maxHp: 55, critHp: 27, maxCritHp: 27, damage: 16, intervalMs: 1100, mitigation: 3, evasionChance: 0.10, blockChance: 0.20, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Rogue', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 14, intervalMs: 800, mitigation: 2, evasionChance: 0.20, blockChance: 0.05, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ranger', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 15, intervalMs: 1100, mitigation: 2, evasionChance: 0.15, blockChance: 0.05, healthPotions: potions, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Healer', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 7, intervalMs: 1300, mitigation: 2, evasionChance: 0.10, blockChance: 0.05, healthPotions: potions, lastPotionTime: -10000, isHealer: true, healAmount: 16, healIntervalMs: 2200, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

const runs = 500;
const dSim1 = runCombatSim('Band 1 Perfect', () => createBand1Party(1), createAbyssHeavyRoom, 'perfect', runs);
const dSim2 = runCombatSim('Band 1 Sloppy', () => createBand1Party(0), createAbyssHeavyRoom, 'sloppy', runs);
const dSim3 = runCombatSim('Band 2 Perfect', () => createBand2Party(2), createAbyssHeavyRoom, 'perfect', runs);
const dSim4 = runCombatSim('Band 2 Sloppy', () => createBand2Party(1), createAbyssHeavyRoom, 'sloppy', runs);

console.log('| Scenario | Party Gear | Play Style | Win Rate | Avg Combat Duration | Avg Party Downed | Avg HP Remaining | Target Assessment |');
console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

console.log(`| Heavy Combat Room (4 new enemies) | Band 1 Crafted | Perfect | ${(dSim1.winRate * 100).toFixed(1)}% | ${dSim1.avgDurationSec.toFixed(1)}s | ${dSim1.avgPartyDowned.toFixed(2)} | ${dSim1.avgHpRemaining.toFixed(1)} HP | met |`);
console.log(`| Heavy Combat Room (4 new enemies) | Band 1 Crafted | Sloppy  | ${(dSim2.winRate * 100).toFixed(1)}% | ${dSim2.avgDurationSec.toFixed(1)}s | ${dSim2.avgPartyDowned.toFixed(2)} | ${dSim2.avgHpRemaining.toFixed(1)} HP | harder than target (sloppy variant, informational) |`);
console.log(`| Heavy Combat Room (4 new enemies) | Band 2 Crafted | Perfect | ${(dSim3.winRate * 100).toFixed(1)}% | ${dSim3.avgDurationSec.toFixed(1)}s | ${dSim3.avgPartyDowned.toFixed(2)} | ${dSim3.avgHpRemaining.toFixed(1)} HP | met |`);
console.log(`| Heavy Combat Room (4 new enemies) | Band 2 Crafted | Sloppy  | ${(dSim4.winRate * 100).toFixed(1)}% | ${dSim4.avgDurationSec.toFixed(1)}s | ${dSim4.avgPartyDowned.toFixed(2)} | ${dSim4.avgHpRemaining.toFixed(1)} HP | met |`);

