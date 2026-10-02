import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type {
  DungeonConfig,
  EnemyDef,
  GeneratedDungeon,
  WeaponDef,
  ArmorDef,
  BlacksmithRecipeDef,
  BowyerRecipeDef,
  ArmorsmithRecipeDef
} from '../src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load Data
const weaponsData: { weapons: WeaponDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const armorsData: { armors: ArmorDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armors.json'), 'utf8'));
const blacksmithData: { recipes: BlacksmithRecipeDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/blacksmithRecipes.json'), 'utf8'));
const bowyerData: { recipes: BowyerRecipeDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/bowyerRecipes.json'), 'utf8'));
const armorsmithData: { recipes: ArmorsmithRecipeDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armorsmithRecipes.json'), 'utf8'));
const dungeonConfig: DungeonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8'));
const enemiesRaw: { enemies: EnemyDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));
const enemiesMap = new Map<string, EnemyDef>();
for (const e of enemiesRaw.enemies) {
  enemiesMap.set(e.id, e);
}

// -------------------------------------------------------------
// REPORT SECTION 0.1: CURRENT LADDER
// -------------------------------------------------------------
console.log('========================================================================');
console.log('ITEM 0.1: CURRENT GEAR LADDER (WEAPONS, SHIELDS & ARMOR)');
console.log('========================================================================\n');

interface RecipeInfo {
  recipeId: string;
  station: string;
  requiredLevel: number;
  ingredients: Record<string, number>;
}
const weaponRecipeMap = new Map<string, RecipeInfo>();
for (const r of blacksmithData.recipes) {
  if (r.resultWeaponId) {
    weaponRecipeMap.set(r.resultWeaponId, {
      recipeId: r.id,
      station: 'Blacksmithing',
      requiredLevel: r.requiredLevel,
      ingredients: r.ingredients
    });
  }
}
for (const r of bowyerData.recipes) {
  if (r.resultWeaponId) {
    weaponRecipeMap.set(r.resultWeaponId, {
      recipeId: r.id,
      station: 'Bowyer',
      requiredLevel: r.requiredLevel,
      ingredients: r.ingredients
    });
  }
}

const armorRecipeMap = new Map<string, RecipeInfo>();
for (const r of armorsmithData.recipes) {
  if (r.resultArmorId) {
    armorRecipeMap.set(r.resultArmorId, {
      recipeId: r.id,
      station: 'Armorsmithing',
      requiredLevel: r.requiredLevel,
      ingredients: r.ingredients
    });
  }
}

function getWeaponBand(id: string): { family: string; band: number } {
  switch (id) {
    case 'short_swords': return { family: '1H Swords', band: 1 };
    case 'longsword_1h': return { family: '1H Swords', band: 1 };
    case 'katana': return { family: '1H Swords (Katana)', band: 1 };
    case 'longsword_2h': return { family: '2H Swords', band: 1 };
    case 'greatswords': return { family: '2H Swords', band: 2 };
    case 'mace': return { family: 'Maces', band: 1 };
    case 'heavy_mace': return { family: 'Maces', band: 2 };
    case 'spiked_morningstar': return { family: 'Maces', band: 3 };
    case 'bows': return { family: 'Bows', band: 1 };
    case 'composite_bow': return { family: 'Bows', band: 2 };
    case 'war_bow': return { family: 'Bows', band: 3 };
    case 'spears': return { family: 'Spears (1H)', band: 1 };
    case 'spears_2h': return { family: 'Spears (2H)', band: 1 };
    case 'daggers': return { family: 'Daggers', band: 1 };
    case 'crossbows': return { family: 'Crossbows', band: 1 };
    case 'staff': return { family: 'Plain Staves', band: 1 };
    case 'shields': return { family: 'Shields', band: 1 };
    case 'throwing_weapons': return { family: 'Throwing Weapons', band: 1 };
    default: return { family: 'Other', band: 1 };
  }
}

console.log('--- CURRENT WEAPONS & SHIELDS LADDER ---');
console.log('| Family | Item Name (ID) | Band | Rec Lvl | Dmg | Interval | DPS | Range | Special Effect | Block% | Mit | Weight | Station |');
console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :--- |');

const ladderWeapons = [
  'short_swords', 'longsword_1h', 'katana',
  'longsword_2h', 'greatswords',
  'mace', 'heavy_mace', 'spiked_morningstar',
  'bows', 'composite_bow', 'war_bow',
  'spears', 'spears_2h',
  'daggers',
  'crossbows',
  'staff',
  'shields',
  'throwing_weapons'
];

for (const wId of ladderWeapons) {
  const w = weaponsData.weapons.find((x) => x.id === wId);
  if (!w) continue;
  const { family, band } = getWeaponBand(w.id);
  const recipe = weaponRecipeMap.get(w.id);
  const recLvl = recipe ? String(recipe.requiredLevel) : 'None';
  const station = recipe ? recipe.station : 'None';
  const interval = `${w.attackIntervalMs}ms`;
  const dps = ((w.baseDamage / (w.attackIntervalMs / 1000))).toFixed(2);
  const range = w.attackRangeTiles ? `${w.attackRangeTiles}` : '1 (melee)';
  let special = '-';
  if (w.bleedChance) special = `${Math.round(w.bleedChance * 100)}% bleed`;
  if (w.stunChance) special = `${Math.round(w.stunChance * 100)}% stun`;
  const block = w.baseBlock ? `${Math.round(w.baseBlock * 100)}%` : '-';
  const mit = w.baseMitigation ? `${w.baseMitigation}` : '-';

  console.log(`| ${family} | ${w.name} (\`${w.id}\`) | ${band} | ${recLvl} | ${w.baseDamage} | ${interval} | ${dps} | ${range} | ${special} | ${block} | ${mit} | ${w.weight}kg | ${station} |`);
}

console.log('\n--- CURRENT ARMOR & JEWELRY LADDER ---');
console.log('| Slot | Item Name (ID) | Band | Weight Class | Total HP | Main / Crit Split | Weight | Rec Lvl | Station | Special / Note |');
console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |');

function getArmorBand(id: string): number {
  switch (id) {
    case 'leather_cap': return 1;
    case 'leather_armor': return 1;
    case 'bone_necklace': return 1;
    case 'wolf_claw_ring': return 1;
    case 'silk_cowl': return 2;
    case 'silk_robe': return 2;
    case 'venom_charm': return 2;
    default: return 1;
  }
}

for (const a of armorsData.armors) {
  const band = getArmorBand(a.id);
  const recipe = armorRecipeMap.get(a.id);
  const recLvl = recipe ? String(recipe.requiredLevel) : 'None';
  const station = recipe ? recipe.station : 'None';
  const mainHp = Math.ceil(a.hpBonus / 2);
  const critHp = Math.floor(a.hpBonus / 2);
  const split = `+${mainHp} / +${critHp}`;
  const wc = a.weightClass || 'none (jewelry)';
  const special = (a as any).carryCapacityBonus ? `+${(a as any).carryCapacityBonus}kg carry` : '-';

  console.log(`| ${a.slot} | ${a.name} (\`${a.id}\`) | ${band} | ${wc} | +${a.hpBonus} HP | ${split} | ${a.weight}kg | ${recLvl} | ${station} | ${special} |`);
}

// -------------------------------------------------------------
// REPORT SECTION 0.2: ARMOR PROFICIENCY ARCHITECTURE & STATUS
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 0.2: ARMOR PROFICIENCY ARCHITECTURE & STATUS');
console.log('========================================================================\n');
console.log('1. What does each proficiency (light_armor, medium_armor, heavy_armor) do today?');
console.log('   - Registered in ProgressionSystem.ARMOR_PROFICIENCY_IDS as trainable stats initialized to level 0.');
console.log('   - Experience is earned in combat via Player.awardArmorWearExp(type):');
console.log('     * "hit": +1 EXP per equipped true armor piece (helmet, body) of that weight class.');
console.log('     * "attack": +1 EXP to each distinct active weight class worn across true armor slots.');
console.log('     * "kill": +2 EXP to each distinct active weight class worn across true armor slots.');
console.log('   - On leveling up: floating notification text ("Light Armor Level 1!"), triggers GameState.discoverProficiency(),');
console.log('     and renders in HUD Combat tab with weight-class specific color badges (#34d399 light, #fb923c medium, #60a5fa heavy).');
console.log('   - Passive Combat Scaling: Currently, armor proficiencies track mastery levels without applying direct damage reduction.');
console.log('     (Damage mitigation is provided directly by armor item HP pools and shield mitigation).\n');

console.log('2. How is an armor piece tagged with its weight class?');
console.log('   - In data/armors.json (and ArmorDef interface):');
console.log('     * True armor slots ("helmet", "body") declare: "weightClass": "light" | "medium" | "heavy".');
console.log('     * Accessories and jewelry ("necklace", "ring", "accessory") omit weightClass (undefined) and are treated as pure stat items.');
console.log('     * Player.getEquippedArmorWeightClasses() filters strictly to true armor slots (helmet/body) with weightClass defined.\n');

console.log('3. Is heavy armor equippable and trained?');
console.log('   - YES. Verified in milestone_armor_proficiency.test.ts (Test 5):');
console.log('     * Equipping an armor piece with slot: "body" and weightClass: "heavy" functions completely out-of-the-box.');
console.log('     * Hits and attacks properly credit heavy_armor EXP independently with zero cross-contamination.');
console.log('     * heavy_armor levels up, displays in HUD, and persists cleanly in save snapshots.');
console.log('     * The ONLY gap is data: data/armors.json currently contains only light and medium pieces; no heavy pieces exist yet.');

// -------------------------------------------------------------
// REPORT SECTION 0.3: MATERIAL SUPPLY PER CLEARED FLOOR
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 0.3: MATERIAL SUPPLY PER CLEARED FLOOR (50 SEEDS)');
console.log('========================================================================\n');

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
  totalEnemies: number;
  coreEnemies: number;
  carryOverEnemies: number;
  elites: number;
  epics: number;
  bosses: number;
  voidKnightSpawns: number;
  abyssalColossusSpawns: number;
  glacialSovereignSpawns: number;
  itemsPerFloor: Record<string, number>;
}

function simulateFullBand(
  bandIndex: number,
  startFloor: number,
  floorCount: number,
  seedCount: number
): FullBandSimResult {
  const region = dungeonConfig.regions![bandIndex];
  const coreSet = new Set((region.enemyPool || []).filter((e) => e.type === 'core').map((e) => e.enemyId));
  const carrySet = new Set((region.enemyPool || []).filter((e) => e.type === 'carry_over').map((e) => e.enemyId));

  let totalEnemies = 0;
  let coreEnemies = 0;
  let carryOverEnemies = 0;
  let elites = 0;
  let epics = 0;
  let bosses = 0;
  let voidKnightSpawns = 0;
  let abyssalColossusSpawns = 0;
  let glacialSovereignSpawns = 0;

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

        totalEnemies++;

        if (def.id === 'void_knight') voidKnightSpawns++;
        if (def.id === 'abyssal_colossus') abyssalColossusSpawns++;
        if (def.id === 'glacial_sovereign') glacialSovereignSpawns++;

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
    totalEnemies,
    coreEnemies,
    carryOverEnemies,
    elites,
    epics,
    bosses,
    voidKnightSpawns,
    abyssalColossusSpawns,
    glacialSovereignSpawns,
    itemsPerFloor
  };
}

const simB1 = simulateFullBand(0, 1, 2, 50);
const simB2 = simulateFullBand(1, 3, 3, 50);
const simB3 = simulateFullBand(2, 6, 5, 50);
const simB4 = simulateFullBand(3, 11, 5, 50);

const trackedMaterials = [
  'ore', 'wood', 'wild_herbs', 'bone', 'wolf_pelt', 'wolf_claw', 'bowstring', 'ectoplasm',
  'steel_scrap', 'spider_silk', 'spider_venom', 'orc_heavy_hide', 'orc_emblem',
  'abyssal_ingot', 'colossus_core', 'dread_essence', 'heart_of_the_colossus',
  'void_plate', 'void_essence', 'void_core',
  'rime_carapace', 'glacial_core', 'glacial_essence', 'eye_of_the_sovereign'
];

console.log('| Material | Band 1 (F1-2) | Band 2 (F3-5) | Band 3 (F6-10) | Band 4 (F11-15) | Category / Primary Source |');
console.log('| :--- | :---: | :---: | :---: | :---: | :--- |');

for (const m of trackedMaterials) {
  const v1 = simB1.itemsPerFloor[m] ?? 0;
  const v2 = simB2.itemsPerFloor[m] ?? 0;
  const v3 = simB3.itemsPerFloor[m] ?? 0;
  const v4 = simB4.itemsPerFloor[m] ?? 0;
  let src = 'Common / Node';
  if (['steel_scrap', 'orc_heavy_hide', 'orc_emblem'].includes(m)) src = 'Orc Warrior (Elite)';
  if (['spider_silk', 'spider_venom'].includes(m)) src = 'Giant Spider (Core)';
  if (['abyssal_ingot', 'colossus_core', 'dread_essence', 'heart_of_the_colossus'].includes(m)) src = 'Abyssal Colossus (Boss F5/F10)';
  if (['void_plate', 'void_essence', 'void_core'].includes(m)) src = 'Void Knight (Epic)';
  if (['rime_carapace', 'glacial_core', 'glacial_essence', 'eye_of_the_sovereign'].includes(m)) src = 'Glacial Sovereign (Boss F15)';

  console.log(`| \`${m}\` | ${v1.toFixed(2)} | ${v2.toFixed(2)} | ${v3.toFixed(2)} | ${v4.toFixed(2)} | ${src} |`);
}

console.log('\n--- ENEMY SPAWNS PER CLEARED FLOOR (AVERAGE) ---');
console.log(`- Band 2 (Abyss, F3-5):    Orc Warrior (Elite): ${(simB2.elites / simB2.floorsSampled).toFixed(2)}/flr | Abyssal Colossus (Boss): ${(simB2.abyssalColossusSpawns / simB2.floorsSampled).toFixed(2)}/flr (1 every 3 floors)`);
console.log(`- Band 3 (Caldera, F6-10): Orc Warrior (Elite): ${(simB3.elites / simB3.floorsSampled).toFixed(2)}/flr | Void Knight (Epic): ${(simB3.voidKnightSpawns / simB3.floorsSampled).toFixed(3)}/flr | Abyssal Colossus (Boss): ${(simB3.abyssalColossusSpawns / simB3.floorsSampled).toFixed(2)}/flr (1 every 5 floors)`);
console.log(`- Band 4 (Glacial, F11-15): Orc Warrior (Elite): ${(simB4.elites / simB4.floorsSampled).toFixed(2)}/flr | Void Knight (Epic): ${(simB4.voidKnightSpawns / simB4.floorsSampled).toFixed(3)}/flr | Glacial Sovereign (Boss): ${(simB4.glacialSovereignSpawns / simB4.floorsSampled).toFixed(2)}/flr (1 every 5 floors)`);

console.log(`\n--- VOID KNIGHT SPAWN FREQUENCY & DROP RATE ANALYSIS ---`);
const vkPerFloorB3 = simB3.voidKnightSpawns / simB3.floorsSampled;
console.log(`- Band 3 floors sampled: ${simB3.floorsSampled} (50 runs of F6-F10)`);
console.log(`- Total Void Knight spawns observed: ${simB3.voidKnightSpawns}`);
console.log(`- Void Knight spawn rate per Band 3 floor: ${(vkPerFloorB3 * 100).toFixed(1)}% (~1 spawn every ${(1 / vkPerFloorB3).toFixed(1)} cleared floors)`);
console.log(`- Void Knight material drops per cleared Band 3 floor:`);
console.log(`  * void_plate:   ${(simB3.itemsPerFloor['void_plate'] ?? 0).toFixed(2)} / floor (~1 plate every ${(1 / (simB3.itemsPerFloor['void_plate'] || 0.001)).toFixed(1)} floors)`);
console.log(`  * void_essence: ${(simB3.itemsPerFloor['void_essence'] ?? 0).toFixed(2)} / floor (~1 essence every ${(1 / (simB3.itemsPerFloor['void_essence'] || 0.001)).toFixed(1)} floors)`);
console.log(`  * void_core:    ${(simB3.itemsPerFloor['void_core'] ?? 0).toFixed(2)} / floor (~1 core every ${(1 / (simB3.itemsPerFloor['void_core'] || 0.001)).toFixed(1)} floors)`);
console.log(`- Boss materials per cleared Band 3 floor (Abyssal Colossus at F10):`);
console.log(`  * abyssal_ingot: ${(simB3.itemsPerFloor['abyssal_ingot'] ?? 0).toFixed(2)} / floor (~1 ingot every ${(1 / (simB3.itemsPerFloor['abyssal_ingot'] || 0.001)).toFixed(1)} floors)`);
console.log(`  * colossus_core: ${(simB3.itemsPerFloor['colossus_core'] ?? 0).toFixed(2)} / floor (~1 core every ${(1 / (simB3.itemsPerFloor['colossus_core'] || 0.001)).toFixed(1)} floors)`);

// -------------------------------------------------------------
// REPORT SECTION 0.4: STATIONS & FAMILIES TODAY
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 0.4: CURRENT CRAFTING STATIONS & WEAPON FAMILIES');
console.log('========================================================================\n');
console.log('| Family / Gear Category | Current Station | Existing Craftable Recipes in Data | Station Building / Bench |');
console.log('| :--- | :--- | :--- | :--- |');
console.log('| 1H Swords | Blacksmithing | Iron Shortsword (`short_sword`), Iron Longsword (`longsword_1h`), Forged Katana (`katana`) | Blacksmith Station |');
console.log('| 2H Swords | Blacksmithing | Two-Handed Longsword (`longsword_2h`), Steel Greatsword (`greatsword`) | Blacksmith Station |');
console.log('| Maces | Blacksmithing | Iron Mace (`mace`), Heavy War Mace (`heavy_mace`), Spiked Morningstar (`spiked_morningstar`) | Blacksmith Station |');
console.log('| Bows | Bowyer | Hunting Bow (`hunting_bow`), Composite Bow (`composite_bow`), War Bow (`war_bow`) | Bowyer Station |');
console.log('| Spears (1H & 2H) | Blacksmithing | Iron Spear (`spear`), Two-Handed Spear (`spears_2h`) | Blacksmith Station |');
console.log('| Daggers | Blacksmithing | Iron Daggers (`daggers`) | Blacksmith Station |');
console.log('| Crossbows | Blacksmithing | Arbalest Crossbow (`crossbow`) | Blacksmith Station |');
console.log('| Plain Staves | Bowyer | Hardwood Quarterstaff (`quarterstaff`) | Bowyer Station |');
console.log('| Shields | Blacksmithing | Iron Shield (`iron_shield`) | Blacksmith Station |');
console.log('| Throwing Weapons | Blacksmithing | Iron Throwing Knives (`throwing_weapons`) | Blacksmith Station |');
console.log('| Helmets | Armorsmithing | Leather Cap (`leather_cap`), Silk Cowl (`silk_cowl`) | Armorsmithing Bench |');
console.log('| Body Armor | Armorsmithing | Leather Armor (`leather_armor`), Silk Robe (`silk_robe`) | Armorsmithing Bench |');
console.log('| Jewelry & Accessories | Armorsmithing | Bone Necklace (`bone_necklace`), Wolf Claw Ring (`wolf_claw_ring`), Venom Charm (`venom_charm`) | Armorsmithing Bench |');

// -------------------------------------------------------------
// PROPOSED TABLES (SECTION 2)
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 2: PROPOSED WEAPONS TABLE');
console.log('========================================================================\n');

interface ProposedWeapon {
  family: string;
  band: number;
  name: string;
  id: string;
  damage: number;
  intervalMs: number;
  range: number;
  special: string;
  block: string;
  mit: string;
  weight: number;
  prevDps: number;
  recLvl: number;
  station: string;
  ingredients: Record<string, number>;
}

const proposedWeapons: ProposedWeapon[] = [
  // 1H Swords (Base: Iron Longsword 7 dmg, 1100ms, 6.36 DPS)
  {
    family: '1H Swords',
    band: 2,
    name: 'Steel Longsword',
    id: 'steel_longsword',
    damage: 9,
    intervalMs: 1100,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 4.5,
    prevDps: 6.36,
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 6, wood: 2, steel_scrap: 2 }
  },
  {
    family: '1H Swords (Bleed Katana)',
    band: 2,
    name: 'Folded Steel Katana',
    id: 'steel_katana',
    damage: 8,
    intervalMs: 900,
    range: 1,
    special: '30% bleed (+5%)',
    block: '-',
    mit: '-',
    weight: 3.5,
    prevDps: 6.67, // over Forged Katana (6.67 DPS)
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 6, wood: 2, steel_scrap: 2 }
  },
  {
    family: '1H Swords',
    band: 3,
    name: 'Voidforged Longsword',
    id: 'void_longsword',
    damage: 12,
    intervalMs: 1100,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 5.0,
    prevDps: 8.18, // over Steel Longsword (8.18 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 }
  },
  {
    family: '1H Swords (Bleed Katana)',
    band: 3,
    name: 'Voidforged Katana',
    id: 'void_katana',
    damage: 11,
    intervalMs: 900,
    range: 1,
    special: '35% bleed (+5%)',
    block: '-',
    mit: '-',
    weight: 4.0,
    prevDps: 8.89, // over Folded Steel Katana (8.89 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 }
  },
  // 2H Swords (Steel Greatsword already at Band 2: 16 dmg, 1400ms, 11.43 DPS)
  {
    family: '2H Swords',
    band: 3,
    name: 'Voidforged Greatsword',
    id: 'void_greatsword',
    damage: 20,
    intervalMs: 1400,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 10.0,
    prevDps: 11.43, // over Steel Greatsword (11.43 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 10, steel_scrap: 3, void_plate: 1 }
  },
  // Spears (Base: 1H Spear 7 dmg, 1100ms, 6.36 DPS)
  {
    family: 'Spears',
    band: 2,
    name: 'Steel Pike',
    id: 'steel_spear',
    damage: 9,
    intervalMs: 1100,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 4.5,
    prevDps: 6.36, // over Iron Spear (6.36 DPS)
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 6, wood: 3, steel_scrap: 2 }
  },
  {
    family: 'Spears',
    band: 3,
    name: 'Voidforged Pike',
    id: 'void_spear',
    damage: 11,
    intervalMs: 1100,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 5.0,
    prevDps: 8.18, // over Steel Pike (8.18 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 8, wood: 2, steel_scrap: 2, void_plate: 1 }
  },
  // Daggers (Base: Iron Daggers 3 dmg, 600ms, 5.00 DPS, 20% bleed)
  {
    family: 'Daggers',
    band: 2,
    name: 'Serrated Daggers',
    id: 'serrated_daggers',
    damage: 4,
    intervalMs: 600,
    range: 1,
    special: '25% bleed (+5%)',
    block: '-',
    mit: '-',
    weight: 1.2,
    prevDps: 5.00, // over Iron Daggers (5.00 DPS)
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 4, wood: 1, steel_scrap: 1, spider_venom: 1 }
  },
  {
    family: 'Daggers',
    band: 3,
    name: 'Voidforged Daggers',
    id: 'void_daggers',
    damage: 5,
    intervalMs: 600,
    range: 1,
    special: '30% bleed (+5%)',
    block: '-',
    mit: '-',
    weight: 1.5,
    prevDps: 6.67, // over Serrated Daggers (6.67 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 }
  },
  // Crossbows (Base: Arbalest Crossbow 9 dmg, 1500ms, 6.00 DPS, range 4)
  {
    family: 'Crossbows',
    band: 2,
    name: 'Heavy Crossbow',
    id: 'heavy_crossbow',
    damage: 12,
    intervalMs: 1550,
    range: 4,
    special: '-',
    block: '-',
    mit: '-',
    weight: 6.0,
    prevDps: 6.00, // over Arbalest (6.00 DPS)
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 7, wood: 3, steel_scrap: 2 }
  },
  {
    family: 'Crossbows',
    band: 3,
    name: 'Voidforged Crossbow',
    id: 'void_crossbow',
    damage: 15,
    intervalMs: 1500,
    range: 5, // range +1 per Director decision
    special: '-',
    block: '-',
    mit: '-',
    weight: 7.0,
    prevDps: 7.74, // over Heavy Crossbow (7.74 DPS)
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 8, wood: 3, steel_scrap: 2, void_plate: 1 }
  },
  // Plain Staves (Base: Hardwood Quarterstaff 7 dmg, 1300ms, 5.38 DPS)
  {
    family: 'Plain Staves',
    band: 2,
    name: 'Reinforced Staff',
    id: 'reinforced_staff',
    damage: 9,
    intervalMs: 1300,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 3.5,
    prevDps: 5.38, // over Hardwood Quarterstaff (5.38 DPS)
    recLvl: 5,
    station: 'Bowyer',
    ingredients: { wood: 6, bone: 2, steel_scrap: 2 }
  },
  {
    family: 'Plain Staves',
    band: 3,
    name: 'Voidforged Staff',
    id: 'void_staff',
    damage: 11,
    intervalMs: 1250,
    range: 1,
    special: '-',
    block: '-',
    mit: '-',
    weight: 4.0,
    prevDps: 6.92, // over Reinforced Staff (6.92 DPS)
    recLvl: 8,
    station: 'Bowyer',
    ingredients: { wood: 8, steel_scrap: 2, void_plate: 1 }
  },
  // Shields (Base: Iron Shield 2 dmg, 1500ms, 5% block, 1 mit)
  {
    family: 'Shields',
    band: 2,
    name: 'Steel Kite Shield',
    id: 'steel_shield',
    damage: 3,
    intervalMs: 1500,
    range: 1,
    special: '-',
    block: '7% (+40%)',
    mit: '2 (+100%)',
    weight: 7.5,
    prevDps: 1.33,
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 6, wood: 2, steel_scrap: 2 }
  },
  {
    family: 'Shields',
    band: 3,
    name: 'Voidforged Tower Shield',
    id: 'void_shield',
    damage: 4,
    intervalMs: 1500,
    range: 1,
    special: '-',
    block: '9% (+28.6%)',
    mit: '3 (+50%)',
    weight: 9.0,
    prevDps: 2.00,
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 }
  },
  // Throwing Weapons (Base: Iron Throwing Knives 4 dmg, 800ms, 5.00 DPS, range 3)
  {
    family: 'Throwing Weapons',
    band: 2,
    name: 'Steel Chakrams',
    id: 'steel_throwing_weapons',
    damage: 5,
    intervalMs: 800,
    range: 3,
    special: 'Sidearm-compatible',
    block: '-',
    mit: '-',
    weight: 1.2,
    prevDps: 5.00,
    recLvl: 5,
    station: 'Blacksmithing',
    ingredients: { ore: 4, wood: 1, steel_scrap: 2 }
  },
  {
    family: 'Throwing Weapons',
    band: 3,
    name: 'Voidforged Throwing Blades',
    id: 'void_throwing_weapons',
    damage: 6,
    intervalMs: 750,
    range: 3,
    special: 'Sidearm-compatible',
    block: '-',
    mit: '-',
    weight: 1.5,
    prevDps: 6.25,
    recLvl: 8,
    station: 'Blacksmithing',
    ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 }
  }
];

console.log('| Family | Band | Proposed Name (ID) | Dmg | Interval | DPS | DPS Step | Range | Special | Block / Mit | Recipe (Ingredients & Lvl) | Station |');
console.log('| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- | :--- |');

for (const pw of proposedWeapons) {
  const dps = pw.damage / (pw.intervalMs / 1000);
  const stepPct = (((dps - pw.prevDps) / pw.prevDps) * 100).toFixed(1);
  const ingStr = Object.entries(pw.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  const recStr = `Lvl ${pw.recLvl}: ${ingStr}`;
  const blockMit = pw.block !== '-' ? `${pw.block} / ${pw.mit} mit` : '-';

  console.log(`| ${pw.family} | ${pw.band} | ${pw.name} (\`${pw.id}\`) | ${pw.damage} | ${pw.intervalMs}ms | ${dps.toFixed(2)} | +${stepPct}% | ${pw.range} | ${pw.special} | ${blockMit} | ${recStr} | ${pw.station} |`);
}

// -------------------------------------------------------------
// PROPOSED ARMOR TABLE
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 2: PROPOSED ARMOR & JEWELRY TABLE (BAND 3 VOID RUNGS)');
console.log('========================================================================\n');

interface ProposedArmor {
  slot: string;
  band: number;
  name: string;
  id: string;
  weightClass: string;
  hpBonus: number;
  weight: number;
  prevHp: number;
  recLvl: number;
  station: string;
  special: string;
  ingredients: Record<string, number>;
}

const proposedArmors: ProposedArmor[] = [
  {
    slot: 'helmet',
    band: 3,
    name: 'Voidforged Greathelm',
    id: 'void_greathelm',
    weightClass: 'heavy',
    hpBonus: 60,
    weight: 4.5,
    prevHp: 30, // Silk Cowl (+30 HP)
    recLvl: 8,
    station: 'Armorsmithing',
    special: 'Heavy armor rung (+100% HP)',
    ingredients: { void_plate: 1, steel_scrap: 2, ore: 4 }
  },
  {
    slot: 'body',
    band: 3,
    name: 'Voidforged Plate Armor',
    id: 'void_plate_armor',
    weightClass: 'heavy',
    hpBonus: 100,
    weight: 12.0,
    prevHp: 50, // Silk Robe (+50 HP)
    recLvl: 8,
    station: 'Armorsmithing',
    special: 'Heavy armor rung (+100% HP)',
    ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 }
  },
  {
    slot: 'necklace',
    band: 3,
    name: 'Voidforged Pendant',
    id: 'void_pendant',
    weightClass: 'none (jewelry)',
    hpBonus: 40,
    weight: 0.5,
    prevHp: 20, // Bone Necklace (+20 HP)
    recLvl: 8,
    station: 'Armorsmithing',
    special: 'Pure defense talisman (+100% HP)',
    ingredients: { void_essence: 1, bone: 2, bowstring: 1 }
  },
  {
    slot: 'ring',
    band: 3,
    name: 'Voidforged Band',
    id: 'void_ring',
    weightClass: 'none (jewelry)',
    hpBonus: 28,
    weight: 0.2,
    prevHp: 14, // Wolf Claw Ring (+14 HP)
    recLvl: 8,
    station: 'Armorsmithing',
    special: 'Endurance signet (+100% HP)',
    ingredients: { void_essence: 1, wolf_claw: 2, steel_scrap: 1 }
  },
  {
    slot: 'accessory',
    band: 3,
    name: 'Voidforged Relic',
    id: 'void_relic',
    weightClass: 'none (jewelry)',
    hpBonus: 50,
    weight: 0.5,
    prevHp: 26, // Venom Charm (+26 HP, +5kg)
    recLvl: 8,
    station: 'Armorsmithing',
    special: '+10kg carry capacity, +92.3% HP',
    ingredients: { void_core: 1, void_essence: 1, spider_silk: 2 }
  }
];

console.log('| Slot | Band | Proposed Name (ID) | Weight Class | Total HP | Main / Crit Split | HP Step | Weight | Recipe (Ingredients & Lvl) | Special / Note |');
console.log('| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |');

for (const pa of proposedArmors) {
  const mainHp = Math.ceil(pa.hpBonus / 2);
  const critHp = Math.floor(pa.hpBonus / 2);
  const split = `+${mainHp} / +${critHp}`;
  const stepPct = (((pa.hpBonus - pa.prevHp) / pa.prevHp) * 100).toFixed(1);
  const ingStr = Object.entries(pa.ingredients).map(([k, v]) => `${v} ${k}`).join(', ');
  const recStr = `Lvl ${pa.recLvl}: ${ingStr}`;

  console.log(`| ${pa.slot} | ${pa.band} | ${pa.name} (\`${pa.id}\`) | ${pa.weightClass} | +${pa.hpBonus} HP | ${split} | +${stepPct}% | ${pa.weight}kg | ${recStr} | ${pa.special} |`);
}

// -------------------------------------------------------------
// SUPPLY CHECK TABLE (SECTION 2)
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log('ITEM 2: SUPPLY CHECK — ESTIMATED FLOORS PER CRAFT');
console.log('========================================================================\n');

interface SupplyCheckItem {
  band: number;
  item: string;
  recipeType: 'Existing' | 'Proposed';
  ingredients: Record<string, number>;
}

const allBand2And3Recipes: SupplyCheckItem[] = [
  // Band 2 Existing
  { band: 2, item: 'Heavy War Mace (heavy_mace)', recipeType: 'Existing', ingredients: { ore: 6, steel_scrap: 3, orc_heavy_hide: 1 } },
  { band: 2, item: 'Steel Greatsword (greatsword)', recipeType: 'Existing', ingredients: { ore: 8, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Composite Bow (composite_bow)', recipeType: 'Existing', ingredients: { wood: 6, bone: 2, spider_silk: 3 } },
  { band: 2, item: 'Silk Cowl (silk_cowl)', recipeType: 'Existing', ingredients: { spider_silk: 3, wolf_pelt: 1 } },
  { band: 2, item: 'Silk Robe (silk_robe)', recipeType: 'Existing', ingredients: { spider_silk: 5, wolf_pelt: 2 } },
  { band: 2, item: 'Venom Charm (venom_charm)', recipeType: 'Existing', ingredients: { spider_venom: 2, spider_silk: 2 } },
  // Band 2 Proposed Weapons
  { band: 2, item: 'Steel Longsword (steel_longsword)', recipeType: 'Proposed', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Folded Steel Katana (steel_katana)', recipeType: 'Proposed', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Pike (steel_spear)', recipeType: 'Proposed', ingredients: { ore: 6, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Serrated Daggers (serrated_daggers)', recipeType: 'Proposed', ingredients: { ore: 4, wood: 1, steel_scrap: 1, spider_venom: 1 } },
  { band: 2, item: 'Heavy Crossbow (heavy_crossbow)', recipeType: 'Proposed', ingredients: { ore: 7, wood: 3, steel_scrap: 2 } },
  { band: 2, item: 'Reinforced Staff (reinforced_staff)', recipeType: 'Proposed', ingredients: { wood: 6, bone: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Kite Shield (steel_shield)', recipeType: 'Proposed', ingredients: { ore: 6, wood: 2, steel_scrap: 2 } },
  { band: 2, item: 'Steel Chakrams (steel_throwing_weapons)', recipeType: 'Proposed', ingredients: { ore: 4, wood: 1, steel_scrap: 2 } },

  // Band 3 Existing
  { band: 3, item: 'Spiked Morningstar (spiked_morningstar)', recipeType: 'Existing', ingredients: { ore: 8, steel_scrap: 5, orc_heavy_hide: 2 } },
  { band: 3, item: 'War Bow (war_bow)', recipeType: 'Existing', ingredients: { wood: 8, wolf_claw: 2, spider_silk: 4 } },
  // Band 3 Proposed Weapons
  { band: 3, item: 'Voidforged Longsword (void_longsword)', recipeType: 'Proposed', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Katana (void_katana)', recipeType: 'Proposed', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Greatsword (void_greatsword)', recipeType: 'Proposed', ingredients: { ore: 10, steel_scrap: 3, void_plate: 1 } },
  { band: 3, item: 'Voidforged Pike (void_spear)', recipeType: 'Proposed', ingredients: { ore: 8, wood: 2, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Daggers (void_daggers)', recipeType: 'Proposed', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },
  { band: 3, item: 'Voidforged Crossbow (void_crossbow)', recipeType: 'Proposed', ingredients: { ore: 8, wood: 3, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Staff (void_staff)', recipeType: 'Proposed', ingredients: { wood: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Tower Shield (void_shield)', recipeType: 'Proposed', ingredients: { ore: 8, steel_scrap: 2, void_plate: 1 } },
  { band: 3, item: 'Voidforged Throwing Blades (void_throwing_weapons)', recipeType: 'Proposed', ingredients: { ore: 6, steel_scrap: 1, void_plate: 1 } },
  // Band 3 Proposed Armor
  { band: 3, item: 'Voidforged Greathelm (void_greathelm)', recipeType: 'Proposed', ingredients: { void_plate: 1, steel_scrap: 2, ore: 4 } },
  { band: 3, item: 'Voidforged Plate Armor (void_plate_armor)', recipeType: 'Proposed', ingredients: { void_plate: 2, steel_scrap: 3, ore: 6 } },
  { band: 3, item: 'Voidforged Pendant (void_pendant)', recipeType: 'Proposed', ingredients: { void_essence: 1, bone: 2, bowstring: 1 } },
  { band: 3, item: 'Voidforged Band (void_ring)', recipeType: 'Proposed', ingredients: { void_essence: 1, wolf_claw: 2, steel_scrap: 1 } },
  { band: 3, item: 'Voidforged Relic (void_relic)', recipeType: 'Proposed', ingredients: { void_core: 1, void_essence: 1, spider_silk: 2 } }
];

console.log('| Band | Recipe (Item) | Status | Required Ingredients | Limiting Ingredient & Yield/Flr | Est Floors / Craft | Supply Threshold Flag |');
console.log('| :---: | :--- | :---: | :--- | :--- | :---: | :--- |');

for (const entry of allBand2And3Recipes) {
  const yields = entry.band === 2 ? simB2.itemsPerFloor : simB3.itemsPerFloor;
  let maxFloors = 0;
  let limitingMat = '';
  let limitingYield = 0;
  let missingMat = false;

  for (const [mat, count] of Object.entries(entry.ingredients)) {
    const y = yields[mat] ?? 0;
    if (y === 0) {
      // Check if material is carry-over from earlier band
      const earlierYield = mat === 'wolf_claw' || mat === 'wolf_pelt' || mat === 'bowstring' ? simB1.itemsPerFloor[mat] ?? 0 : 0;
      if (earlierYield > 0) {
        const f = count / earlierYield;
        if (f > maxFloors) {
          maxFloors = f;
          limitingMat = `${mat} (Band 1 farm)`;
          limitingYield = earlierYield;
        }
      } else {
        missingMat = true;
        limitingMat = `${mat} (0 drops in Band ${entry.band}!)`;
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
  const thresholdLimit = entry.band === 2 ? 4.0 : 5.0;
  let flag = '✅ Pass';

  if (missingMat) {
    flag = '⚠️ FLAG: 0 DROPS IN BAND';
  } else if (maxFloors > thresholdLimit) {
    flag = `⚠️ FLAG: > ${thresholdLimit} FLOORS (${maxFloors.toFixed(1)} flr)`;
  }

  const flrStr = missingMat ? 'N/A' : `${maxFloors.toFixed(1)} flr`;
  const limitStr = missingMat ? limitingMat : `${limitingMat} (${limitingYield.toFixed(2)}/flr)`;

  console.log(`| Band ${entry.band} | ${entry.item} | ${entry.recipeType} | ${ingFormatted} | ${limitStr} | ${flrStr} | ${flag} |`);
}
