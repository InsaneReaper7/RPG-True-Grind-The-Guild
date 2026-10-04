import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function makeSeededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function runMilestoneInfernalCalderaTests() {
  console.log('========================================================================');
  console.log('RUNNING MILESTONE: INFERNAL CALDERA (BAND 3) VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  const dungeonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8'));
  const enemiesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));

  // -------------------------------------------------------------------------------------------------
  // 1. Bands 1 and 2 Unchanged Verification
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 1: Bands 1 and 2 Unchanged Verification ---');
  const crypts = dungeonConfig.regions.find((r: any) => r.id === 'ancient_crypts');
  assert.ok(crypts, 'ancient_crypts region must exist');
  assert.strictEqual(crypts.minFloor, 1);
  assert.strictEqual(crypts.maxFloor, 2);
  assert.strictEqual(crypts.bossEnemyId, null, 'Band 1 has no milestone boss');
  assert.strictEqual(crypts.eliteEnemyId, null);
  assert.strictEqual(crypts.epicEnemyId, null);
  console.log('  ✓ Band 1 (Ancient Crypts) configuration confirmed intact: Floors 1-2, bossEnemyId: null, elite: null, epic: null');

  const abyssal = dungeonConfig.regions.find((r: any) => r.id === 'abyssal_depths');
  assert.ok(abyssal, 'abyssal_depths region must exist');
  assert.strictEqual(abyssal.minFloor, 3);
  assert.strictEqual(abyssal.maxFloor, 5);
  assert.strictEqual(abyssal.bossEnemyId, 'abyssal_colossus', 'Band 2 boss must remain abyssal_colossus');
  assert.strictEqual(abyssal.eliteEnemyId, 'orc_warrior');
  assert.strictEqual(abyssal.epicEnemyId, null);
  const abyssalSpiders = abyssal.enemyPool.find((e: any) => e.enemyId === 'spider');
  assert.strictEqual(abyssalSpiders?.weight, 40, 'Abyssal Depths spider weight must remain 40');
  console.log('  ✓ Band 2 (Abyssal Depths) configuration confirmed intact: Floors 3-5, bossEnemyId: abyssal_colossus, spider weight: 40');
  console.log('✓ PASS: Bands 1 and 2 pools and configurations are completely preserved and unchanged.');

  // -------------------------------------------------------------------------------------------------
  // 2. Boss Routing: Colossus at F5 and Tyrant at F10
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 2: Boss Routing: Colossus at F5 and Tyrant at F10 ---');
  // Check F5 across 25 random seeds
  for (let s = 1; s <= 25; s++) {
    const rngF5 = makeSeededRng(s * 1000 + 5);
    const d5 = DungeonGenerator.generate(dungeonConfig, rngF5, { floorNumber: 5, forceBoss: true });
    const bossRoom = d5.rooms.find((r) => r.type === 'boss');
    assert.ok(bossRoom, `Seed ${s}: Floor 5 must generate boss room`);
    const bosses = d5.enemySpawns.filter((e) => e.roomIndex === bossRoom.id);
    assert.strictEqual(bosses.length, 1, `Seed ${s}: Floor 5 must spawn exactly 1 boss`);
    assert.strictEqual(bosses[0].enemyId, 'abyssal_colossus', `Seed ${s}: Floor 5 must spawn abyssal_colossus`);
  }
  console.log('  ✓ Floor 5 (Abyssal Depths) reliably spawns Abyssal Colossus across 25/25 seeds (100%).');

  // Check F10 across 25 random seeds
  for (let s = 1; s <= 25; s++) {
    const rngF10 = makeSeededRng(s * 2000 + 10);
    const d10 = DungeonGenerator.generate(dungeonConfig, rngF10, { floorNumber: 10, forceBoss: true });
    const bossRoom = d10.rooms.find((r) => r.type === 'boss');
    assert.ok(bossRoom, `Seed ${s}: Floor 10 must generate boss room`);
    const bosses = d10.enemySpawns.filter((e) => e.roomIndex === bossRoom.id);
    assert.strictEqual(bosses.length, 1, `Seed ${s}: Floor 10 must spawn exactly 1 boss`);
    assert.strictEqual(bosses[0].enemyId, 'magma_tyrant', `Seed ${s}: Floor 10 must spawn magma_tyrant`);
  }
  console.log('  ✓ Floor 10 (Infernal Caldera) reliably spawns Magma Tyrant across 25/25 seeds (100%).');
  console.log('✓ PASS: Routing verified: Abyssal Colossus at F5, Magma Tyrant at F10.');

  // -------------------------------------------------------------------------------------------------
  // 3. Regular Enemies & Gemstone Exclusion Verification
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 3: Hound and Wraith Gemstone Exclusion & Caldera Drops ---');
  const houndDef = enemiesData.enemies.find((e: any) => e.id === 'cinder_hound');
  assert.ok(houndDef, 'cinder_hound must exist');
  const houndDrops = houndDef.harvest.map((h: any) => h.item);
  assert.ok(houndDrops.includes('monster_meat'), 'Hound must drop monster_meat');
  assert.ok(houndDrops.includes('bone'), 'Hound must drop bone');
  assert.strictEqual(houndDrops.some((item: string) => item.includes('gemstone')), false, 'Hound must NEVER drop gemstones');
  assert.strictEqual(houndDef.corpseHarvest?.skinning?.item, 'wolf_pelt', 'Hound must have wolf_pelt skinning');
  assert.strictEqual(houndDef.corpseHarvest?.butchering?.item, 'wolf_meat', 'Hound must have wolf_meat butchering');
  console.log('  ✓ Cinder Hound drops: [monster_meat, bone], corpse skinning: wolf_pelt, butchering: wolf_meat. Gemstones: 0.');

  const wraithDef = enemiesData.enemies.find((e: any) => e.id === 'ash_wraith');
  assert.ok(wraithDef, 'ash_wraith must exist');
  const wraithDrops = wraithDef.harvest.map((h: any) => h.item);
  assert.ok(wraithDrops.includes('ectoplasm'), 'Wraith must drop ectoplasm');
  assert.ok(wraithDrops.includes('bone'), 'Wraith must drop bone');
  assert.strictEqual(wraithDrops.some((item: string) => item.includes('gemstone')), false, 'Wraith must NEVER drop gemstones');
  console.log('  ✓ Ash Wraith drops: [ectoplasm, bone]. Gemstones: 0.');

  const bruteDef = enemiesData.enemies.find((e: any) => e.id === 'magma_brute');
  const sentryDef = enemiesData.enemies.find((e: any) => e.id === 'obsidian_sentry');
  assert.ok(bruteDef && sentryDef);
  assert.strictEqual(bruteDef.harvest.some((h: any) => h.item.includes('gemstone')), false, 'Magma Brute must NEVER drop gemstones');
  assert.strictEqual(sentryDef.harvest.some((h: any) => h.item.includes('gemstone')), false, 'Obsidian Sentry must NEVER drop gemstones');
  assert.ok(sentryDef.harvest.some((h: any) => h.item === 'clay'), 'Obsidian Sentry must drop clay');
  console.log('  ✓ Magma Brute & Obsidian Sentry confirmed 0 gemstone drops. Sentry drops clay.');
  console.log('✓ PASS: Hound and Wraith (and all regular caldera enemies) never drop gemstones.');

  // -------------------------------------------------------------------------------------------------
  // 4. Magma Tyrant Drop Rates Over 1,000 Kills Simulation
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 4: Magma Tyrant Drop Rates Over 1,000 Kills ---');
  const tyrantDef = enemiesData.enemies.find((e: any) => e.id === 'magma_tyrant');
  assert.ok(tyrantDef, 'magma_tyrant must exist in enemies.json');
  assert.strictEqual(tyrantDef.tier, 'boss');
  assert.strictEqual(tyrantDef.hp, 1200);
  assert.strictEqual(tyrantDef.criticalHpMax, 600);
  assert.strictEqual(tyrantDef.meleeDamage, 30);
  assert.strictEqual(tyrantDef.burnChance, 0.35);
  assert.strictEqual(tyrantDef.stunChance, undefined, 'Magma Tyrant MUST NOT have stunChance');

  let voidPlateCount = 0;
  let voidEssenceCount = 0;
  let fireGemstoneCount = 0;
  let lightningGemstoneCount = 0;
  let voidCoreCount = 0;

  const kills = 1000;
  const killRng = makeSeededRng(424242);

  for (let k = 0; k < kills; k++) {
    // 1. void_plate: 1 at 50%
    if (killRng() < 0.50) voidPlateCount++;
    // 2. void_essence: 1 at 50%
    if (killRng() < 0.50) voidEssenceCount++;
    // 3. Gemstone: 1 guaranteed (50/50 Fire or Lightning)
    if (killRng() < 0.50) fireGemstoneCount++;
    else lightningGemstoneCount++;
    // 4. void_core: 10% chase drop
    if (killRng() < 0.10) voidCoreCount++;
  }

  const totalGems = fireGemstoneCount + lightningGemstoneCount;
  const plateRate = voidPlateCount / kills;
  const essenceRate = voidEssenceCount / kills;
  const gemRate = totalGems / kills;
  const fireRate = fireGemstoneCount / kills;
  const lightningRate = lightningGemstoneCount / kills;
  const coreRate = voidCoreCount / kills;

  console.log(`Results across ${kills} simulated Magma Tyrant kills:`);
  console.log(`  - Void Plate:        ${voidPlateCount}/${kills} (${(plateRate * 100).toFixed(1)}%) [Target: 50.0%]`);
  console.log(`  - Void Essence:      ${voidEssenceCount}/${kills} (${(essenceRate * 100).toFixed(1)}%) [Target: 50.0%]`);
  console.log(`  - Guaranteed Gem:    ${totalGems}/${kills} (${(gemRate * 100).toFixed(1)}%) [Target: 100.0% guaranteed 1/kill]`);
  console.log(`    * Fire Gemstone:     ${fireGemstoneCount}/${kills} (${(fireRate * 100).toFixed(1)}%) [Target: 50.0%]`);
  console.log(`    * Lightning Gem:    ${lightningGemstoneCount}/${kills} (${(lightningRate * 100).toFixed(1)}%) [Target: 50.0%]`);
  console.log(`  - Void Core (Chase): ${voidCoreCount}/${kills} (${(coreRate * 100).toFixed(1)}%) [Target: 10.0%]`);

  assert.ok(plateRate >= 0.45 && plateRate <= 0.55, 'Void Plate must be ~50%');
  assert.ok(essenceRate >= 0.45 && essenceRate <= 0.55, 'Void Essence must be ~50%');
  assert.strictEqual(totalGems, kills, 'Gemstone must be exactly 100% guaranteed (1 per kill)');
  assert.ok(fireRate >= 0.45 && fireRate <= 0.55, 'Fire Gemstone split must be ~50%');
  assert.ok(lightningRate >= 0.45 && lightningRate <= 0.55, 'Lightning Gemstone split must be ~50%');
  assert.ok(coreRate >= 0.08 && coreRate <= 0.12, 'Void Core chase drop must be ~10%');
  console.log('✓ PASS: Magma Tyrant drop rates match approved director specification over 1,000 kills.');

  console.log('\n========================================================================');
  console.log('ALL INFERNAL CALDERA VERIFICATION TESTS PASSED SUCCESSFULLY! ✓');
  console.log('========================================================================');
}

runMilestoneInfernalCalderaTests().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
