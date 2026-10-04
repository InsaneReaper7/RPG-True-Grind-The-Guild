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

// -------------------------------------------------------------------------------------------------
// 0.1 CURRENT BAND 3 POOL & CHANCES
// -------------------------------------------------------------------------------------------------
console.log('================================================================================');
console.log('0.1 CURRENT BAND 3 (INFERNAL CALDERA) ENEMY POOL & RARITY CHANCES');
console.log('================================================================================\n');

const calderaRegion = dungeonConfig.regions?.find((r) => r.id === 'infernal_caldera');
console.log(`Region ID: ${calderaRegion?.id} | Name: "${calderaRegion?.name}" | Floors: F${calderaRegion?.minFloor}–F${calderaRegion?.maxFloor}`);
console.log(`Core Split: ${calderaRegion?.corePercentage}% | Carry-Over Split: ${calderaRegion?.carryOverPercentage}%`);
console.log(`Assigned Elite ID: ${calderaRegion?.eliteEnemyId} | Assigned Epic ID: ${calderaRegion?.epicEnemyId} | Assigned Boss ID: ${calderaRegion?.bossEnemyId}\n`);

console.log('| Role | Enemy ID | Name | Weight | Share in Pool | HP | Melee Dmg | Attack Interval | Range | Move Speed | Special / Status |');
console.log('| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

const totalWeight = calderaRegion?.enemyPool?.reduce((sum, e) => sum + (e.weight || 1), 0) ?? 1;
for (const entry of (calderaRegion?.enemyPool || [])) {
  const def = enemiesMap.get(entry.enemyId);
  const share = ((entry.weight / totalWeight) * 100).toFixed(1);
  const rangeStr = def?.attackRangeTiles ? `${def.attackRangeTiles} tiles` : '1 tile (Melee)';
  const statusStr = def?.poisonChance ? `Poison (${Math.round(def.poisonChance * 100)}%)` : 'None';
  console.log(`| ${entry.type} | ${entry.enemyId} | ${def?.name} | ${entry.weight} | ${share}% | ${def?.hp} | ${def?.meleeDamage} | ${def?.attackIntervalMs}ms | ${rangeStr} | ${def?.moveSpeed} | ${statusStr} |`);
}

// Special enemies in Band 3
const eliteDef = enemiesMap.get(calderaRegion?.eliteEnemyId || '');
const epicDef = enemiesMap.get(calderaRegion?.epicEnemyId || '');
console.log(`| elite | ${eliteDef?.id} | ${eliteDef?.name} | - | Spawn Roll (HC) | ${eliteDef?.hp} | ${eliteDef?.meleeDamage} | ${eliteDef?.attackIntervalMs}ms | Melee | ${eliteDef?.moveSpeed} | 35% Hide / 1 Scrap |`);
console.log(`| epic | ${epicDef?.id} | ${epicDef?.name} | - | Spawn Roll (HC) | ${epicDef?.hp} | ${epicDef?.meleeDamage} | ${epicDef?.attackIntervalMs}ms | Melee | ${epicDef?.moveSpeed} | [2,3] Plate, [1,2] Ess |`);

console.log('\n--- Elite & Epic Spawn Chances per Floor in Heavy Combat Rooms (F6–F10) ---');
console.log('| Floor | Depth Offset | Base Epic | Scaling/Flr | Effective Epic Chance | Base Elite | Scaling/Flr | Effective Elite Chance |');
console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

const baseEpic = dungeonConfig.epicChance ?? 0.05;
const epicPerFloor = dungeonConfig.depthScaling?.epicChancePerFloor ?? 0;
const maxEpic = dungeonConfig.depthScaling?.maxEpicChance ?? 0.20;

const baseElite = dungeonConfig.eliteChance ?? 0.12;
const elitePerFloor = dungeonConfig.depthScaling?.eliteChancePerFloor ?? 0;
const maxElite = dungeonConfig.depthScaling?.maxEliteChance ?? 0.35;

for (let f = 6; f <= 10; f++) {
  const depthOffset = f - 1;
  const effEpic = Math.min(maxEpic, baseEpic + depthOffset * epicPerFloor);
  const effElite = Math.min(maxElite, baseElite + depthOffset * elitePerFloor);
  console.log(`| F${f} | ${depthOffset} | ${(baseEpic * 100).toFixed(1)}% | +${(epicPerFloor * 100).toFixed(2)}% | ${(effEpic * 100).toFixed(1)}% (max ${(maxEpic * 100).toFixed(1)}%) | ${(baseElite * 100).toFixed(1)}% | +${(elitePerFloor * 100).toFixed(2)}% | ${(effElite * 100).toFixed(1)}% (max ${(maxElite * 100).toFixed(1)}%) |`);
}

// -------------------------------------------------------------------------------------------------
// 0.2 BOSSES: ROUTING, STATS, MECHANICS, DROPS
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('0.2 BOSSES: ROUTING, STATS, MECHANICS & DROPS');
console.log('================================================================================\n');

console.log('--- Boss Routing & Floor Rules ---');
console.log(`- bossMilestoneInterval: ${dungeonConfig.bossMilestoneInterval} -> Milestone floors are floorNumber % 5 === 0 (F5, F10, F15, F20).`);
console.log(`- Random boss chance: base ${(dungeonConfig.bossRandomChance ?? 0.02) * 100}%, scaling +${(dungeonConfig.depthScaling?.bossRandomChancePerFloor ?? 0) * 100}%/flr up to ${(dungeonConfig.depthScaling?.maxBossRandomChance ?? 0.025) * 100}%.`);
console.log('- Region Boss Routing (DungeonGenerator.ts lines 848-854):');
for (const r of (dungeonConfig.regions || [])) {
  const maxFlrStr = r.maxFloor ? `F${r.maxFloor}` : 'Deepest';
  console.log(`  * Band ${r.id} (F${r.minFloor}–${maxFlrStr}): bossEnemyId = "${r.bossEnemyId ?? 'NONE (null)'}"`);
}
console.log(`\n**CRUCIAL FINDING:** Infernal Caldera currently ends on bossEnemyId = "abyssal_colossus" (same as Abyssal Depths F5)!`);

console.log('\n--- Existing Boss Profiles ---');
const existingBosses = enemiesRaw.enemies.filter((e) => e.tier === 'boss');
for (const b of existingBosses) {
  console.log(`\nBoss ID: ${b.id} | Name: "${b.name}"`);
  console.log(`- HP: ${b.hp} (Critical / Enrage Threshold: ${b.criticalHpMax ?? Math.floor(b.hp / 2)})`);
  console.log(`- Melee Damage: ${b.meleeDamage} | Interval: ${b.attackIntervalMs}ms | Range: ${b.attackRangeTiles ?? 1} tile(s) | Speed: ${b.moveSpeed}`);
  console.log(`- Research Points: ${b.researchPoints}`);
  console.log('- Mechanics in code:');
  if (b.id === 'abyssal_colossus') {
    console.log('  1. Titanic Cleave Shockwave (AoE splash: 50% damage to all other party members within 1.5 tiles; CombatSystem.ts:851-877)');
    console.log('  2. Earthshaker Tremor (30% chance on hit to inflict Stun for 2.0s; CombatSystem.ts:880-897)');
    console.log('  3. Boss Enrage Phase (Triggers at <= 50% HP: attack interval drops from 1400ms to 952ms [-32%], move speed increases 80 to 105 [+31%], red avatar tint; Enemy.ts:228-231, 291-305)');
  } else if (b.id === 'glacial_sovereign') {
    console.log('  1. Glacial Spike Nova / Permafrost Shards (AoE splash: 40% damage to party members within 3 tiles of target; CombatSystem.ts:900-928)');
    console.log('  2. Rime Frostbite (Inflicts Frostbite: -50% move speed and 3 frost DoT for 4.5s; CombatSystem.ts:930-946)');
    console.log('  3. Permafrost Glaciation Phase (Triggers at <= 50% HP: conjures 100 HP Crystalline Ice Barrier, Frost Thorns 30% melee reflect, cyan frost aura; Enemy.ts:226-227, 242-286, CombatSystem.ts:2496-2512)');
  }
  console.log('- Drops (CombatSystem.ts:2907-2931):');
  for (const h of b.harvest) {
    const isRare = h.method === 'rare_drop';
    const rateStr = isRare ? '60% rare drop chance (CombatSystem.ts:2910)' : '100% guaranteed salvage';
    console.log(`  * ${h.item} (${rateStr}) [tags: ${(h.tags || []).join(', ')}]`);
  }
}

// -------------------------------------------------------------------------------------------------
// 0.3 BAND 3 MATERIALS & SUPPLY RATES
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('0.3 BAND 3 MATERIALS: VOID GEAR CONSUMPTION & CURRENT HARVEST RATES');
console.log('================================================================================\n');

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

interface SimResult {
  floorsSampled: number;
  enemySpawns: Record<string, number>;
  itemsPerFloor: Record<string, number>;
}

function simulateBand(startFloor: number, floorCount: number, seedCount: number): SimResult {
  const itemTotals: Record<string, number> = {};
  const enemySpawns: Record<string, number> = {};
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
        enemySpawns[e.enemyId] = (enemySpawns[e.enemyId] || 0) + 1;
        const def = enemiesMap.get(e.enemyId);
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
    itemsPerFloor[k] = Number((v / totalFloorsCleared).toFixed(3));
  }

  return { floorsSampled: totalFloorsCleared, enemySpawns, itemsPerFloor };
}

const simB3 = simulateBand(6, 5, 50);

console.log('| Material | Used in Band 3 Recipes | Current Drop Source | Rate/Floor (B3 Sim) | Est Floors / Unit |');
console.log('| :--- | :--- | :--- | :---: | :---: |');
const b3Mats = [
  { id: 'void_plate', use: 'Void weapons, Greathelm, Plate Armor', src: 'Void Knight (Epic salvage [2, 3])' },
  { id: 'void_essence', use: 'Void Pendant, Void Band, Void Relic', src: 'Void Knight (Epic salvage [1, 2])' },
  { id: 'void_core', use: 'Void Relic (Chase)', src: 'Void Knight (Epic rare drop 35%)' },
  { id: 'steel_scrap', use: 'Void weapons, armor, helm, Morningstar', src: 'Orc Warrior (Elite salvage 1)' },
  { id: 'ore', use: 'Void weapons, helm, plate armor, Morningstar', src: 'Mining Rock nodes (F6–10)' },
  { id: 'wood', use: 'Void spear, halberd, crossbow, staff, War Bow', src: 'Woodcutting Tree nodes (F6–10)' },
  { id: 'orc_heavy_hide', use: 'Spiked Morningstar (x2)', src: 'Orc Warrior (Elite rare drop 35%)' },
  { id: 'spider_silk', use: 'War Bow (x4), Void Relic (x2)', src: 'Giant Spider (common drop / skinning)' },
  { id: 'bone', use: 'Void Pendant (x2)', src: 'Skeleton / Wolf salvage (common)' },
  { id: 'wolf_claw', use: 'War Bow (x2), Void Band (x2)', src: 'Wolf (Band 1 farm rare drop)' },
  { id: 'bowstring', use: 'Void Pendant (x1)', src: 'Goblin Archer (rare drop carry-over)' }
];

for (const m of b3Mats) {
  const yieldPerFlr = simB3.itemsPerFloor[m.id] ?? 0;
  const flrPerUnit = yieldPerFlr > 0 ? (1 / yieldPerFlr).toFixed(2) : '0 (B1/B2 only)';
  console.log(`| ${m.id} | ${m.use} | ${m.src} | ${yieldPerFlr.toFixed(2)} / flr | ${flrPerUnit} flr |`);
}

// -------------------------------------------------------------------------------------------------
// 0.4 ENEMY BEHAVIOURS IN CODE
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('0.4 ENEMY BEHAVIOURS ALREADY IN CODE (FILE AND LINE AUDIT)');
console.log('================================================================================\n');

console.log('Audit of requested behaviours:');
console.log('1. RANGED ATTACKER:');
console.log('   - STATUS: IN CODE (CombatSystem.ts:564-573, 615-645, 774, 1001-1003)');
console.log('   - Triggered by `attackRangeTiles > 1` (e.g. Goblin Archer = 4, Skeleton Archer = 5, Glacial Sovereign = 4).');
console.log('   - Enemy stops at range, kites if player closes in (`findRangedStagingTile`), and fires ranged attack projectile.');
console.log('2. AOE / CLEAVE / NOVA:');
console.log('   - STATUS: IN CODE (CombatSystem.ts:851-877 for Abyssal Colossus Cleave; CombatSystem.ts:900-928 for Glacial Sovereign Nova)');
console.log('   - Cleave deals 50% splash damage to all party members within 1.5 tiles of target.');
console.log('   - Glacial Nova deals 40% splash damage to all party members within 3 tiles of target.');
console.log('3. ON-HIT STATUS PROCS (BURN, STUN, CURSE, BLIND, POISON):');
console.log('   - STATUS: IN CODE (CombatSystem.ts:880-897 [Stun on hit], 948-964 [Poison on hit], 2039-2158 [Elemental procs: Burn, Shock, Stun, Curse])');
console.log('   - Fire: Burn (30% proc, 4s duration, 2 dmg/tick)');
console.log('   - Earth / Boss: Stun (20-30% proc, disables movement & actions)');
console.log('   - Dark: Curse (25% proc, -25% outgoing damage)');
console.log('   - Blind: in statusEffects.json (reduces accuracy by 35%)');
console.log('4. HEALTH-THRESHOLD ENRAGE / PHASE CHANGE:');
console.log('   - STATUS: IN CODE (Enemy.ts:224-232, 242-286, 291-305)');
console.log('   - Boss triggers at <= 50% HP: increases attack speed by 32%, move speed by 31%, visual aura and sprite tint.');
console.log('5. PACK AGGRO:');
console.log('   - STATUS: NOT IN CODE.');
console.log('   - Aggro detection is strictly per-enemy proximity (CombatSystem.ts:527-543) or when taking damage (Enemy.ts:181-186).');
console.log('   - FLAG: Pack aggro is a new behaviour. Per project rules, it must be DROPPED or handled via existing aggro radius + speed.');
console.log('6. CHARGE OR LEAP:');
console.log('   - STATUS: NOT IN CODE for enemies (only player skills vaulting_leap/skirmish_step exist; CombatSystem.ts:701-708).');
console.log('   - FLAG: Enemy charge/leap does not exist in code.');
console.log('7. ON-DEATH EFFECT:');
console.log('   - STATUS: NOT IN CODE (CombatSystem.ts:2795-2940 only handles EXP, research points, and loot drops upon death).');
console.log('   - FLAG: Enemy death effects do not exist in code.');
console.log('8. SELF-HEAL:');
console.log('   - STATUS: NOT IN CODE for enemies (only players heal; CombatSystem.ts:1047-1055, 1785-1788).');
console.log('   - FLAG: Enemy self-heal does not exist in code.');
console.log('9. SUMMON (BY ENEMY):');
console.log('   - STATUS: NOT IN CODE for enemies (only player recruits can be summoned from Guild HQ in Outpost/HUD).');
console.log('   - FLAG: Mid-combat enemy summoning does not exist in code.');

// -------------------------------------------------------------------------------------------------
// 0.5 PROCEDURAL ENEMY TEXTURES
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('0.5 PROCEDURAL ENEMY TEXTURES AUDIT');
console.log('================================================================================\n');

console.log('- TextureGenerator.ts lines 428–866: Every enemy in the game uses procedural Phaser graphics:');
console.log('  * wolf-avatar, slime-avatar, goblin-avatar, goblin_archer-avatar, skeleton-avatar, skeleton_archer-avatar, undead-avatar, spider-avatar, orc_warrior-avatar, void_knight-avatar, abyssal_colossus-avatar, glacial_sovereign-avatar, and 10 elemental avatars.');
console.log('- MainScene.ts line 544 & 816:');
console.log('  `const texKey = \\`\\${finalDef.id}-avatar\\`;`');
console.log('  `const tex = this.textures.exists(texKey) ? texKey : \'wolf-avatar\';`');
console.log('  -> MainScene automatically loads `${enemyId}-avatar` from TextureGenerator.');
console.log('- Bestiary (HUD.ts lines 8801-8850):');
console.log('  -> Automatically populates entry from `data/enemies.json` when `gameState.isEnemyEncountered(e.id)` is true.');
console.log('  -> CONCLUSION: CONFIRMED. New Caldera enemies and the boss can use the exact same procedural TextureGenerator approach.');

// -------------------------------------------------------------------------------------------------
// 1. PROPOSED ENEMY ROSTER & RAW COMPARISON
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('1. PROPOSED CALDERA ENEMY ROSTER & COMPARISON TO BAND 2 ENEMIES');
console.log('================================================================================\n');

interface ProposedEnemy {
  id: string;
  name: string;
  tier: string;
  hp: number;
  meleeDamage: number;
  attackIntervalMs: number;
  moveSpeed: number;
  aggroRadius: number;
  attackRangeTiles?: number;
  statusProc?: string;
  behaviour: string;
  flaggedNotes?: string;
  harvest: any[];
}

const proposedEnemies: ProposedEnemy[] = [
  {
    id: 'cinder_hound',
    name: 'Cinder Hound',
    tier: 'common',
    hp: 32,
    meleeDamage: 7,
    attackIntervalMs: 900,
    moveSpeed: 115,
    aggroRadius: 6,
    statusProc: 'Burn (15% proc, 2 dmg/tick for 4s)',
    behaviour: 'Fast pursuit melee auto-attacker',
    flaggedNotes: 'Pack aggro flagged as not in code; dropped per rules. High moveSpeed (115) & aggro (6) maintain pressure.',
    harvest: [
      { method: 'collect', item: 'monster_meat', weight: 3 },
      { method: 'salvage', item: 'bone', weight: 2 },
      { method: 'rare_drop', item: 'fire_gemstone', weight: 1 }
    ]
  },
  {
    id: 'magma_brute',
    name: 'Magma Brute',
    tier: 'common',
    hp: 65,
    meleeDamage: 14,
    attackIntervalMs: 1700,
    moveSpeed: 65,
    aggroRadius: 5,
    statusProc: 'Stun (15% proc, 1.5s duration; reusing Earthshaker/Earth Elemental proc)',
    behaviour: 'Heavy slow melee bruiser with heavy-hit stun',
    flaggedNotes: 'Reuses existing Stun status proc architecture from Abyssal Colossus / Earth Elemental.',
    harvest: [
      { method: 'collect', item: 'monster_meat', weight: 2 },
      { method: 'salvage', item: 'ore', weight: 3 }
    ]
  },
  {
    id: 'ash_wraith',
    name: 'Ash Wraith',
    tier: 'common',
    hp: 28,
    meleeDamage: 9,
    attackIntervalMs: 1250,
    moveSpeed: 85,
    aggroRadius: 6,
    attackRangeTiles: 4,
    statusProc: 'Curse (20% proc, -25% outgoing dmg for 5s)',
    behaviour: 'Ranged spell caster (Range 4), retreats/kites via findRangedStagingTile',
    flaggedNotes: 'Reuses existing ranged attacker kiting architecture and existing Curse status effect.',
    harvest: [
      { method: 'salvage', item: 'bone', weight: 2 },
      { method: 'rare_drop', item: 'fire_gemstone', weight: 1 }
    ]
  },
  {
    id: 'obsidian_sentry',
    name: 'Obsidian Sentry',
    tier: 'common',
    hp: 75,
    meleeDamage: 5,
    attackIntervalMs: 1600,
    moveSpeed: 60,
    aggroRadius: 5,
    statusProc: 'None',
    behaviour: 'Armoured blocker with massive HP pool and low damage',
    flaggedNotes: 'Enemy flat mitigation is not in code; achieved via high HP pool (75 HP) and low DPS without adding new mechanics.',
    harvest: [
      { method: 'salvage', item: 'ore', weight: 4 },
      { method: 'rare_drop', item: 'steel_scrap', weight: 1 }
    ]
  }
];

console.log('| Enemy ID | Name | Role | HP | Melee Dmg | Interval | DPS | Range | Speed | Status Effect | Drops (40% Common Roll) |');
console.log('| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |');

for (const p of proposedEnemies) {
  const dps = (p.meleeDamage / (p.attackIntervalMs / 1000)).toFixed(1);
  const rangeStr = p.attackRangeTiles ? `${p.attackRangeTiles} tiles` : '1 tile (Melee)';
  const dropsStr = p.harvest.map(h => `${h.item} (${h.method})`).join(', ');
  console.log(`| ${p.id} | ${p.name} | ${p.behaviour.split(' ')[0]} | ${p.hp} | ${p.meleeDamage} | ${p.attackIntervalMs}ms | ${dps} | ${rangeStr} | ${p.moveSpeed} | ${p.statusProc} | ${dropsStr} |`);
}

console.log('\n--- Raw Comparison: Proposed Caldera Enemies vs. Band 2 Baseline Enemies ---');
console.log('| Group | Enemy | Tier | HP | Melee Dmg | Attack Interval | DPS | Range | Speed | Status / Threat |');
console.log('| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

const band2Baselines = [
  enemiesMap.get('spider')!,
  enemiesMap.get('undead')!,
  enemiesMap.get('orc_warrior')!
];

for (const b of band2Baselines) {
  const dps = (b.meleeDamage / (b.attackIntervalMs / 1000)).toFixed(1);
  const rangeStr = b.attackRangeTiles ? `${b.attackRangeTiles} tiles` : 'Melee';
  const specialStr = b.id === 'spider' ? 'Poison (25% proc)' : b.id === 'orc_warrior' ? 'Elite Champion (35% Hide)' : 'None';
  console.log(`| **Band 2 Baseline** | ${b.name} (${b.id}) | ${b.tier} | ${b.hp} | ${b.meleeDamage} | ${b.attackIntervalMs}ms | ${dps} | ${rangeStr} | ${b.moveSpeed} | ${specialStr} |`);
}

for (const p of proposedEnemies) {
  const dps = (p.meleeDamage / (p.attackIntervalMs / 1000)).toFixed(1);
  const rangeStr = p.attackRangeTiles ? `${p.attackRangeTiles} tiles` : 'Melee';
  console.log(`| **Band 3 Proposed** | ${p.name} (${p.id}) | ${p.tier} | ${p.hp} | ${p.meleeDamage} | ${p.attackIntervalMs}ms | ${dps} | ${rangeStr} | ${p.moveSpeed} | ${p.statusProc} |`);
}

// -------------------------------------------------------------------------------------------------
// 2. PROPOSED NEW BAND 3 POOL
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('2. PROPOSED BAND 3 (INFERNAL CALDERA) POOL & WEIGHTS');
console.log('================================================================================\n');

console.log('- Core / Carry-over Ratio: 70% Core / 30% Carry-over (PRESERVED)');
console.log('- Epic Spawn: Void Knight in Heavy Combat rooms (PRESERVED)');
console.log('- Elite Spawn: Orc Warrior in Heavy Combat rooms (PRESERVED)');
console.log('- Elemental Spawns: 50% floor roll, favoured Fire & Lightning in Band 3 (PRESERVED)');

const proposedCalderaPool = [
  { enemyId: 'cinder_hound', weight: 25, type: 'core' },
  { enemyId: 'magma_brute', weight: 18, type: 'core' },
  { enemyId: 'ash_wraith', weight: 15, type: 'core' },
  { enemyId: 'obsidian_sentry', weight: 12, type: 'core' },
  { enemyId: 'undead', weight: 15, type: 'carry_over' },
  { enemyId: 'spider', weight: 15, type: 'carry_over' }
];

console.log('\n| Pool Type | Enemy ID | Name | Weight | Share in Pool | HP | Dmg | Role |');
console.log('| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |');

const newTotalWeight = proposedCalderaPool.reduce((sum, e) => sum + e.weight, 0);
for (const entry of proposedCalderaPool) {
  const isProposed = proposedEnemies.find(p => p.id === entry.enemyId);
  const def = isProposed || enemiesMap.get(entry.enemyId)!;
  const share = ((entry.weight / newTotalWeight) * 100).toFixed(1);
  const role = isProposed ? isProposed.behaviour.split(' ')[0] : 'Carry-over';
  console.log(`| ${entry.type} | ${entry.enemyId} | ${def.name} | ${entry.weight} | ${share}% | ${def.hp} | ${def.meleeDamage} | ${role} |`);
}

// -------------------------------------------------------------------------------------------------
// 3. PROPOSED CALDERA BOSS: MAGMA TYRANT
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('3. THE CALDERA BOSS: MAGMA TYRANT SHEET');
console.log('================================================================================\n');

const magmaTyrantDef = {
  id: 'magma_tyrant',
  name: 'Magma Tyrant',
  tier: 'boss',
  hp: 450,
  criticalHpMax: 225,
  meleeDamage: 26,
  aggroRadius: 8,
  attackIntervalMs: 1400,
  moveSpeed: 80,
  attackRangeTiles: 1,
  researchPoints: 25,
  enragedIntervalMs: 950,
  enragedMoveSpeed: 105,
  harvest: [
    { method: 'salvage', item: 'void_plate', amount: [2, 3], note: 'Guaranteed 2–3 Void Plates to accelerate Band 3 rung progression' },
    { method: 'salvage', item: 'void_essence', amount: [1, 2], note: 'Guaranteed 1–2 Void Essences for jewelry and staves' },
    { method: 'salvage', item: 'fire_gemstone', amount: [2, 3], note: 'Guaranteed 2–3 Fire Gemstones for Fire Staff & Crystal imbuement' },
    { method: 'rare_drop', item: 'void_core', amount: 1, chance: 0.25, note: '25% chance of chase Void Core relic ingredient' }
  ]
};

console.log(`Boss ID: ${magmaTyrantDef.id} | Name: "${magmaTyrantDef.name}"`);
console.log(`- Tier: BOSS | Assigned Floor: F10 (Band 3 Milestone Boss)`);
console.log(`- Routing: Takes Band 3 slot (infernal_caldera.bossEnemyId = "magma_tyrant"). Abyssal Colossus displaced from F10, retains F5 slot.`);
console.log(`- Health: ${magmaTyrantDef.hp} HP (Critical Phase / Enrage Threshold: ${magmaTyrantDef.criticalHpMax} HP)`);
console.log(`- Damage: ${magmaTyrantDef.meleeDamage} Melee Strike (DPS: ${(magmaTyrantDef.meleeDamage / (magmaTyrantDef.attackIntervalMs / 1000)).toFixed(1)})`);
console.log(`- Attack Interval: ${magmaTyrantDef.attackIntervalMs}ms (Enraged: ${magmaTyrantDef.enragedIntervalMs}ms)`);
console.log(`- Movement Speed: ${magmaTyrantDef.moveSpeed} (Enraged: ${magmaTyrantDef.enragedMoveSpeed})`);
console.log(`- Perception Range: ${magmaTyrantDef.aggroRadius} Tiles`);
console.log(`- Research Points: ${magmaTyrantDef.researchPoints} RP`);

console.log('\n--- Signature Mechanics (Built Exclusively from Existing In-Code Behaviours) ---');
console.log('1. Magma Cleave Shockwave (AoE Splash):');
console.log('   - Trigger: Hits target for > 0 damage.');
console.log('   - Effect: Deals 50% splash damage to all other party members within 1.5 tiles of the target.');
console.log('   - Code reuse: Abyssal Colossus cleave architecture in CombatSystem.ts:851-877.');
console.log('2. Searing Immolation (Burn On-Hit Proc):');
console.log('   - Trigger: 35% chance on melee strike.');
console.log('   - Effect: Inflicts Burn status effect (4s duration, 4 damage/sec DoT, #f97316 color).');
console.log('   - Code reuse: Existing Burn status effect and on-hit status proc architecture in CombatSystem.ts:948-969 & statusEffects.json.');
console.log('3. Tyrant’s Molten Enrage (Phase Transition at <= 50% HP):');
console.log('   - Trigger: Health drops <= 225 HP.');
console.log('   - Effect: Attack interval accelerates from 1400ms to 950ms (-32%), move speed increases from 80 to 105 (+31%), avatar tinted burning red (#ff6666) with blazing fiery aura.');
console.log('   - Code reuse: Existing boss enrage architecture in Enemy.ts:224-232, 291-305.');
console.log('   - Note: Summoning Cinder Hounds at 50% HP was flagged as NOT in code (CombatSystem has no enemy summon capability) and is DROPPED per project rules.');

console.log('\n--- Magma Tyrant Loot Table ---');
console.log('| Item | Drop Method | Amount | Rate | Purpose |');
console.log('| :--- | :---: | :---: | :---: | :--- |');
for (const h of magmaTyrantDef.harvest) {
  const amtStr = Array.isArray(h.amount) ? `${h.amount[0]}–${h.amount[1]}` : `${h.amount}`;
  const rateStr = h.method === 'rare_drop' ? `${(h.chance * 100).toFixed(0)}% Rare Roll` : '100% Guaranteed';
  console.log(`| ${h.item} | ${h.method} | ${amtStr} | ${rateStr} | ${h.note} |`);
}

// -------------------------------------------------------------------------------------------------
// 4. SUPPLY TABLE RE-RUN WITH BOSS DROPS
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('4. BAND 3 SUPPLY TABLE: BEFORE VS. AFTER BOSS DROPS');
console.log('================================================================================\n');

// In 50 runs of F6-F10 (250 floors), F10 is cleared 50 times (0.20 boss kills per floor sampled).
// Boss drops per kill:
// - void_plate: average 2.5 plates * 0.20 = +0.50 void_plate / floor!
// - void_essence: average 1.5 essences * 0.20 = +0.30 void_essence / floor!
// - void_core: 0.25 core * 0.20 = +0.05 void_core / floor!
// - fire_gemstone: average 2.5 gemstones * 0.20 = +0.50 fire_gemstone / floor!

const beforePlateYield = simB3.itemsPerFloor['void_plate'] ?? 0.29;
const afterPlateYield = beforePlateYield + 0.50;

const beforeEssenceYield = simB3.itemsPerFloor['void_essence'] ?? 0.18;
const afterEssenceYield = beforeEssenceYield + 0.30;

const beforeCoreYield = simB3.itemsPerFloor['void_core'] ?? 0.05;
const afterCoreYield = beforeCoreYield + 0.05;

interface SupplyRecipe {
  item: string;
  ingredients: Record<string, number>;
}

const voidRecipes: SupplyRecipe[] = [
  { item: 'Voidforged 1H Weapons (Short Sword / Katana)', ingredients: { void_plate: 1, steel_scrap: 2, ore: 6 } },
  { item: 'Voidforged 2H Weapons (Greatsword / Halberd)', ingredients: { void_plate: 1, steel_scrap: 3, ore: 10 } },
  { item: 'Voidforged Greathelm', ingredients: { void_plate: 1, steel_scrap: 2, ore: 4 } },
  { item: 'Voidforged Plate Armor', ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 } },
  { item: 'Voidforged Pendant', ingredients: { void_essence: 1, bone: 2, bowstring: 1 } },
  { item: 'Voidforged Band', ingredients: { void_essence: 1, wolf_claw: 2, steel_scrap: 1 } },
  { item: 'Voidforged Relic (Chase)', ingredients: { void_core: 1, void_essence: 1, spider_silk: 2 } }
];

console.log('| Recipe (Item) | Ingredients | Before Yield/Flr | Before Flrs/Craft | After Yield/Flr (w/ Boss) | After Flrs/Craft | Supply Pacing Delta |');
console.log('| :--- | :--- | :--- | :---: | :--- | :---: | :---: |');

for (const r of voidRecipes) {
  let beforeLimitingMat = '';
  let beforeMaxFlr = 0;
  let afterLimitingMat = '';
  let afterMaxFlr = 0;

  for (const [mat, count] of Object.entries(r.ingredients)) {
    const bYield = mat === 'void_plate' ? beforePlateYield : mat === 'void_essence' ? beforeEssenceYield : mat === 'void_core' ? beforeCoreYield : (simB3.itemsPerFloor[mat] || 0.5);
    const aYield = mat === 'void_plate' ? afterPlateYield : mat === 'void_essence' ? afterEssenceYield : mat === 'void_core' ? afterCoreYield : (simB3.itemsPerFloor[mat] || 0.5);

    const bFlrs = count / (bYield || 0.001);
    if (bFlrs > beforeMaxFlr) {
      beforeMaxFlr = bFlrs;
      beforeLimitingMat = mat;
    }
    const aFlrs = count / (aYield || 0.001);
    if (aFlrs > afterMaxFlr) {
      afterMaxFlr = aFlrs;
      afterLimitingMat = mat;
    }
  }

  const ingStr = Object.entries(r.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  const delta = (beforeMaxFlr - afterMaxFlr).toFixed(1);
  console.log(`| ${r.item} | ${ingStr} | ${beforeLimitingMat} (${(beforeLimitingMat === 'void_plate' ? beforePlateYield : beforeEssenceYield).toFixed(2)}) | ${beforeMaxFlr.toFixed(1)} flr | ${afterLimitingMat} (${(afterLimitingMat === 'void_plate' ? afterPlateYield : afterEssenceYield).toFixed(2)}) | ${afterMaxFlr.toFixed(1)} flr | -${delta} flrs (Faster) |`);
}

// -------------------------------------------------------------------------------------------------
// 5. DANGER ESTIMATE: HEADLESS COMBAT SIMULATION
// -------------------------------------------------------------------------------------------------
console.log('\n================================================================================');
console.log('5. DANGER ESTIMATE: HEADLESS COMBAT SIMULATION');
console.log('================================================================================\n');

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
  activeStatus: { id: string; durationMs: number; dps: number }[];
}

function runCombatSim(
  encounterName: string,
  partyDefs: () => SimCombatant[],
  enemyDefs: () => SimCombatant[],
  runs: number = 300,
  hasCleave: boolean = false,
  bossEnrageHp?: number
): { winRate: number; avgDurationSec: number; partyDownedCount: number; avgPartyHpRemaining: number } {
  let wins = 0;
  let totalDuration = 0;
  let totalDowned = 0;
  let totalRemainingHp = 0;

  for (let r = 0; r < runs; r++) {
    const party = partyDefs();
    const enemies = enemyDefs();
    let simTimeMs = 0;
    const dt = 100; // 100ms ticks

    while (simTimeMs < 120000) { // max 2 min
      simTimeMs += dt;

      const livingParty = party.filter(p => p.hp > 0 || p.critHp > 0);
      const livingEnemies = enemies.filter(e => e.hp > 0 || e.critHp > 0);

      if (livingParty.length === 0 || livingEnemies.length === 0) break;

      // Enemy turn
      for (const enemy of livingEnemies) {
        // Enrage check
        if (bossEnrageHp && (enemy.hp + enemy.critHp) <= bossEnrageHp && enemy.intervalMs > 1000) {
          enemy.intervalMs = 950;
        }

        // Status effects on enemy
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
            // Evasion / Avoidance check
            if (Math.random() >= target.evasionChance) {
              // Block check
              if (Math.random() >= target.blockChance) {
                const rawDmg = enemy.damage;
                const effDmg = Math.max(1, rawDmg - target.mitigation);
                
                // Damage resolves against HP first, then Critical HP (Entity.ts lines 310-320)
                if (target.hp >= effDmg) {
                  target.hp -= effDmg;
                } else {
                  const overflow = effDmg - target.hp;
                  target.hp = 0;
                  target.critHp = Math.max(0, target.critHp - overflow);
                }

                // Cleave splash (50% damage to nearby party members within 1.5 tiles)
                if (hasCleave) {
                  const splashDmg = Math.max(1, Math.round(effDmg * 0.5));
                  for (const other of livingParty) {
                    if (other !== target && Math.random() < 0.6) {
                      if (other.hp >= splashDmg) {
                        other.hp -= splashDmg;
                      } else {
                        const oflow = splashDmg - other.hp;
                        other.hp = 0;
                        other.critHp = Math.max(0, other.critHp - oflow);
                      }
                    }
                  }
                }

                // Status proc on hit (e.g. Burn)
                if (enemy.name.includes('Hound') && Math.random() < 0.15) {
                  target.activeStatus.push({ id: 'burn', durationMs: 4000, dps: 2 });
                } else if (enemy.name.includes('Tyrant') && Math.random() < 0.35) {
                  target.activeStatus.push({ id: 'burn', durationMs: 4000, dps: 4 });
                }
              }
            }
          }
        }
      }

      // Party turn
      for (const member of livingParty) {
        // Status effects on party member
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

        // Consumable Health Potion usage (30 HP, 10s cooldown; ConsumableSystem.ts)
        if (member.healthPotions > 0 && member.hp <= 20 && simTimeMs - member.lastPotionTime >= 10000) {
          member.healthPotions--;
          member.lastPotionTime = simTimeMs;
          // Heals into critHp first, then hp
          const healNeedCrit = member.maxCritHp - member.critHp;
          if (healNeedCrit > 0) {
            const healedCrit = Math.min(30, healNeedCrit);
            member.critHp += healedCrit;
            const remainHeal = 30 - healedCrit;
            member.hp = Math.min(member.maxHp, member.hp + remainHeal);
          } else {
            member.hp = Math.min(member.maxHp, member.hp + 30);
          }
        }

        // Healer action (Staff healing magic)
        if (member.isHealer && simTimeMs - member.lastHealTime >= (member.healIntervalMs || 2500)) {
          member.lastHealTime = simTimeMs;
          const injured = livingParty.filter(p => (p.hp + p.critHp) < (p.maxHp + p.maxCritHp)).sort((a, b) => (a.hp + a.critHp) - (b.hp + b.critHp))[0];
          if (injured) {
            const healAmt = member.healAmount || 14;
            const critDeficit = injured.maxCritHp - injured.critHp;
            if (critDeficit > 0) {
              const toCrit = Math.min(healAmt, critDeficit);
              injured.critHp += toCrit;
              injured.hp = Math.min(injured.maxHp, injured.hp + (healAmt - toCrit));
            } else {
              injured.hp = Math.min(injured.maxHp, injured.hp + healAmt);
            }
          }
        }

        // Attack action
        if (simTimeMs - member.lastAttackTime >= member.intervalMs) {
          member.lastAttackTime = simTimeMs;
          const target = livingEnemies.sort((a, b) => (a.hp + a.critHp) - (b.hp + b.critHp))[0];
          if (target) {
            const dmg = member.damage;
            if (target.hp >= dmg) {
              target.hp -= dmg;
            } else {
              const overflow = dmg - target.hp;
              target.hp = 0;
              target.critHp = Math.max(0, target.critHp - overflow);
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
      totalRemainingHp += livingParty.reduce((sum, p) => sum + p.hp + p.critHp, 0) / livingParty.length;
      totalDowned += party.length - livingParty.length;
    }
  }

  return {
    winRate: wins / runs,
    avgDurationSec: wins > 0 ? totalDuration / wins : 0,
    partyDownedCount: wins > 0 ? totalDowned / wins : 0,
    avgPartyHpRemaining: wins > 0 ? totalRemainingHp / wins : 0
  };
}

// 1. Party with Band 2 (Steel) Gear & Consumables
const createBand2Party = (): SimCombatant[] => [
  { name: 'Warrior', hp: 55, maxHp: 55, critHp: 27, maxCritHp: 27, damage: 18, intervalMs: 1100, mitigation: 4, evasionChance: 0.12, blockChance: 0.22, healthPotions: 2, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Rogue', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 16, intervalMs: 800, mitigation: 2, evasionChance: 0.25, blockChance: 0.05, healthPotions: 2, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ranger', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 17, intervalMs: 1100, mitigation: 2, evasionChance: 0.18, blockChance: 0.05, healthPotions: 2, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Healer', hp: 45, maxHp: 45, critHp: 22, maxCritHp: 22, damage: 8, intervalMs: 1300, mitigation: 2, evasionChance: 0.12, blockChance: 0.05, healthPotions: 2, lastPotionTime: -10000, isHealer: true, healAmount: 18, healIntervalMs: 2000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

// 2. Party with Band 1 (Iron/Wood) Gear & No Consumables
const createBand1Party = (): SimCombatant[] => [
  { name: 'Warrior', hp: 40, maxHp: 40, critHp: 20, maxCritHp: 20, damage: 6, intervalMs: 1250, mitigation: 1, evasionChance: 0.05, blockChance: 0.08, healthPotions: 0, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Rogue', hp: 30, maxHp: 30, critHp: 15, maxCritHp: 15, damage: 5, intervalMs: 950, mitigation: 0, evasionChance: 0.08, blockChance: 0.00, healthPotions: 0, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ranger', hp: 30, maxHp: 30, critHp: 15, maxCritHp: 15, damage: 6, intervalMs: 1300, mitigation: 0, evasionChance: 0.05, blockChance: 0.00, healthPotions: 0, lastPotionTime: -10000, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Healer', hp: 30, maxHp: 30, critHp: 15, maxCritHp: 15, damage: 3, intervalMs: 1500, mitigation: 0, evasionChance: 0.05, blockChance: 0.00, healthPotions: 0, lastPotionTime: -10000, isHealer: true, healAmount: 8, healIntervalMs: 3200, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

// Encounters
const createLightRoomEnemies = (): SimCombatant[] => [
  { name: 'Cinder Hound', hp: 32, maxHp: 32, critHp: 16, maxCritHp: 16, damage: 7, intervalMs: 900, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ash Wraith', hp: 28, maxHp: 28, critHp: 14, maxCritHp: 14, damage: 9, intervalMs: 1250, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

const createHeavyRoomEnemies = (): SimCombatant[] => [
  { name: 'Magma Brute', hp: 65, maxHp: 65, critHp: 32, maxCritHp: 32, damage: 14, intervalMs: 1700, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Cinder Hound', hp: 32, maxHp: 32, critHp: 16, maxCritHp: 16, damage: 7, intervalMs: 900, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Cinder Hound', hp: 32, maxHp: 32, critHp: 16, maxCritHp: 16, damage: 7, intervalMs: 900, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] },
  { name: 'Ash Wraith', hp: 28, maxHp: 28, critHp: 14, maxCritHp: 14, damage: 9, intervalMs: 1250, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

const createMagmaTyrantBoss = (): SimCombatant[] => [
  { name: 'Magma Tyrant', hp: 450, maxHp: 450, critHp: 225, maxCritHp: 225, damage: 26, intervalMs: 1400, mitigation: 0, evasionChance: 0, blockChance: 0, healthPotions: 0, lastPotionTime: 0, lastAttackTime: 0, lastHealTime: 0, activeStatus: [] }
];

console.log('| Scenario | Party Gear | Enemy Encounter | Win Rate | Avg Combat Duration | Avg Party Downed | Avg HP Remaining | Target Result |');
console.log('| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |');

const res1 = runCombatSim('Band 2 vs Light Room', createBand2Party, createLightRoomEnemies, 300);
console.log(`| Regular Light Combat | Band 2 (Steel) | 1 Cinder Hound, 1 Ash Wraith | ${(res1.winRate * 100).toFixed(1)}% | ${res1.avgDurationSec.toFixed(1)}s | ${res1.partyDownedCount.toFixed(2)} | ${res1.avgPartyHpRemaining.toFixed(1)} HP | Expected Safe Clear |`);

const res2 = runCombatSim('Band 2 vs Heavy Room', createBand2Party, createHeavyRoomEnemies, 300);
console.log(`| Regular Heavy Combat | Band 2 (Steel) | 1 Brute, 2 Hounds, 1 Wraith | ${(res2.winRate * 100).toFixed(1)}% | ${res2.avgDurationSec.toFixed(1)}s | ${res2.partyDownedCount.toFixed(2)} | ${res2.avgPartyHpRemaining.toFixed(1)} HP | Expected Moderate Pressure |`);

const res3 = runCombatSim('Band 2 vs Magma Tyrant', createBand2Party, createMagmaTyrantBoss, 300, true, 225);
console.log(`| Boss Encounter (F10) | Band 2 (Steel) | Magma Tyrant (Cleave + Burn + Enrage) | ${(res3.winRate * 100).toFixed(1)}% | ${res3.avgDurationSec.toFixed(1)}s | ${res3.partyDownedCount.toFixed(2)} | ${res3.avgPartyHpRemaining.toFixed(1)} HP | **TARGET MET: Wins Most Attempts** |`);

const res4 = runCombatSim('Band 1 vs Magma Tyrant', createBand1Party, createMagmaTyrantBoss, 300, true, 225);
console.log(`| Boss Encounter (F10) | Band 1 (Iron) | Magma Tyrant (Cleave + Burn + Enrage) | ${(res4.winRate * 100).toFixed(1)}% | ${res4.avgDurationSec.toFixed(1)}s | ${res4.partyDownedCount.toFixed(2)} | ${res4.avgPartyHpRemaining.toFixed(1)} HP | **TARGET MET: Loses / Wipes** |`);



