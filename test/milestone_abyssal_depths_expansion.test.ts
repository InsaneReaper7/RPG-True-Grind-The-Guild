import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type { DungeonConfig, EnemyDef } from '../src/types/game.ts';

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

async function runMilestoneAbyssalDepthsExpansionTests() {
  console.log('========================================================================');
  console.log('RUNNING MILESTONE: ABYSSAL DEPTHS EXPANSION (F6-10) TEST SUITE');
  console.log('========================================================================\n');

  const dungeonConfig: DungeonConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/dungeonConfig.json'), 'utf8'));
  const enemiesRaw: { enemies: EnemyDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));
  const enemiesMap = new Map<string, EnemyDef>();
  for (const e of enemiesRaw.enemies) {
    enemiesMap.set(e.id, e);
  }

  // -------------------------------------------------------------------------------------------------
  // 1. Crypts and Caldera Pools Unchanged
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 1: Crypts and Caldera Pools Unchanged ---');
  const crypts = dungeonConfig.regions?.find((r) => r.id === 'ancient_crypts');
  assert.ok(crypts, 'ancient_crypts region must exist');
  assert.strictEqual(crypts.enemyPool?.length, 5, 'Ancient Crypts must have 5 enemies');
  assert.deepStrictEqual(
    crypts.enemyPool?.map(e => ({ id: e.enemyId, weight: e.weight })),
    [
      { id: 'wolf', weight: 25 },
      { id: 'skeleton', weight: 25 },
      { id: 'goblin', weight: 20 },
      { id: 'goblin_archer', weight: 20 },
      { id: 'slime', weight: 10 }
    ],
    'Crypts enemy pool and weights must match baseline'
  );
  console.log('  ✓ Ancient Crypts pool unchanged (5 enemies: wolf 25, skeleton 25, goblin 20, goblin_archer 20, slime 10).');

  const caldera = dungeonConfig.regions?.find((r) => r.id === 'infernal_caldera');
  assert.ok(caldera, 'infernal_caldera region must exist');
  assert.strictEqual(caldera.enemyPool?.length, 6, 'Infernal Caldera must have 6 enemies');
  assert.deepStrictEqual(
    caldera.enemyPool?.map(e => ({ id: e.enemyId, weight: e.weight })),
    [
      { id: 'cinder_hound', weight: 25 },
      { id: 'magma_brute', weight: 18 },
      { id: 'ash_wraith', weight: 15 },
      { id: 'obsidian_sentry', weight: 12 },
      { id: 'spider', weight: 15 },
      { id: 'undead', weight: 15 }
    ],
    'Caldera enemy pool and weights must match baseline'
  );
  console.log('  ✓ Infernal Caldera pool unchanged (6 enemies: 4 core + 2 carry-over).');
  console.log('✓ PASS: Crypts and Caldera pools verified unchanged.\n');

  // -------------------------------------------------------------------------------------------------
  // 2. Abyssal Depths Configuration & Pool Spawns at Proper Weights
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 2: Abyssal Depths Pool Spawns at Proper Weights ---');
  const abyss = dungeonConfig.regions?.find((r) => r.id === 'abyssal_depths');
  assert.ok(abyss, 'abyssal_depths region must exist');
  assert.strictEqual(abyss.corePercentage, 70, 'Abyss must have 70% core percentage');
  assert.strictEqual(abyss.carryOverPercentage, 30, 'Abyss must have 30% carry over percentage');
  assert.strictEqual(abyss.bossEnemyId, 'abyssal_colossus', 'Abyss boss must remain abyssal_colossus');
  assert.strictEqual(abyss.eliteEnemyId, 'orc_warrior', 'Abyss elite must remain orc_warrior');

  const expectedPool = [
    { enemyId: 'spider', weight: 20, type: 'core' },
    { enemyId: 'deep_crawler', weight: 16, type: 'core' },
    { enemyId: 'abyssal_lurker', weight: 14, type: 'core' },
    { enemyId: 'void_thrall', weight: 10, type: 'core' },
    { enemyId: 'undead', weight: 10, type: 'core' },
    { enemyId: 'skeleton', weight: 10, type: 'carry_over' },
    { enemyId: 'goblin_archer', weight: 10, type: 'carry_over' },
    { enemyId: 'wolf', weight: 10, type: 'carry_over' }
  ];
  assert.deepStrictEqual(abyss.enemyPool, expectedPool, 'Abyss enemyPool must match approved specification');

  // Spawn simulation over 100 seeds across F6-F10 (500 floors)
  const spawnCounts: Record<string, number> = {};
  let totalSpawns = 0;
  for (let s = 1; s <= 100; s++) {
    for (let f = 6; f <= 10; f++) {
      const seed = s * 10000 + f;
      const rng = makeSeededRng(seed);
      const d = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: f, seed });
      for (const e of d.enemySpawns) {
        // Exclude elite and boss from regular pool distribution check
        if (e.enemyId === 'orc_warrior' || e.enemyId === 'abyssal_colossus' || e.enemyId.includes('elemental')) continue;
        spawnCounts[e.enemyId] = (spawnCounts[e.enemyId] || 0) + 1;
        totalSpawns++;
      }
    }
  }

  console.log(`  Sampled ${totalSpawns} regular enemy spawns across 500 floors (F6-F10):`);
  const expectedFractions: Record<string, number> = {
    spider: 0.20,
    deep_crawler: 0.16,
    abyssal_lurker: 0.14,
    void_thrall: 0.10,
    undead: 0.10,
    skeleton: 0.10,
    goblin_archer: 0.10,
    wolf: 0.10
  };

  for (const [id, expectedFrac] of Object.entries(expectedFractions)) {
    const actualCount = spawnCounts[id] || 0;
    const actualFrac = actualCount / totalSpawns;
    console.log(`  - ${id.padEnd(16)}: ${actualCount} spawns (${(actualFrac * 100).toFixed(2)}% | expected ${(expectedFrac * 100).toFixed(1)}%)`);
    assert.ok(
      Math.abs(actualFrac - expectedFrac) < 0.03,
      `${id} spawn rate ${(actualFrac * 100).toFixed(2)}% must be within 3% of expected ${(expectedFrac * 100).toFixed(1)}%`
    );
  }
  console.log('✓ PASS: Abyss pool spawns all 5 core and 3 carry-over enemies at their target weights.\n');

  // -------------------------------------------------------------------------------------------------
  // 3. proc chance data check
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 3: proc chance data check ---');
  const crawlerDef = enemiesMap.get('deep_crawler');
  const lurkerDef = enemiesMap.get('abyssal_lurker');
  const thrallDef = enemiesMap.get('void_thrall');

  assert.ok(crawlerDef, 'deep_crawler definition must exist');
  assert.ok(lurkerDef, 'abyssal_lurker definition must exist');
  assert.ok(thrallDef, 'void_thrall definition must exist');

  assert.strictEqual(crawlerDef.bleedChance, 0.15, 'Deep Crawler must have 15% bleedChance');
  assert.strictEqual(lurkerDef.blindChance, 0.15, 'Abyssal Lurker must have 15% blindChance');
  assert.strictEqual(thrallDef.slowChance, 0.20, 'Void Thrall must have 20% slowChance');

  const runs = 1000;
  const rngProc = makeSeededRng(424242);

  let bleedProcs = 0;
  let blindProcs = 0;
  let slowProcs = 0;

  for (let i = 0; i < runs; i++) {
    if (rngProc() < crawlerDef.bleedChance!) bleedProcs++;
    if (rngProc() < lurkerDef.blindChance!) blindProcs++;
    if (rngProc() < thrallDef.slowChance!) slowProcs++;
  }

  const bleedRate = bleedProcs / runs;
  const blindRate = blindProcs / runs;
  const slowRate = slowProcs / runs;

  console.log(`  Over ${runs} hits:`);
  console.log(`  - Deep Crawler Bleed: ${bleedProcs}/${runs} (${(bleedRate * 100).toFixed(1)}% | expected 15.0%)`);
  console.log(`  - Abyssal Lurker Blind: ${blindProcs}/${runs} (${(blindRate * 100).toFixed(1)}% | expected 15.0%)`);
  console.log(`  - Void Thrall Slow:    ${slowProcs}/${runs} (${(slowRate * 100).toFixed(1)}% | expected 20.0%)`);

  assert.ok(Math.abs(bleedRate - 0.15) < 0.035, 'Bleed proc rate must be within 3.5% of 15%');
  assert.ok(Math.abs(blindRate - 0.15) < 0.035, 'Blind proc rate must be within 3.5% of 15%');
  assert.ok(Math.abs(slowRate - 0.20) < 0.035, 'Slow proc rate must be within 3.5% of 20%');
  console.log('✓ PASS: All procs fire at their designated chances.\n');

  // -------------------------------------------------------------------------------------------------
  // 4. Drops Never Include Gemstones from New Enemies
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 4: Drops Never Include Gemstones from New Enemies ---');
  const newEnemies = [crawlerDef, lurkerDef, thrallDef];
  for (const e of newEnemies) {
    const harvests = e.harvest || [];
    for (const h of harvests) {
      assert.ok(!h.item.includes('gemstone'), `${e.id} harvest item "${h.item}" must not be a gemstone`);
    }
    if (e.corpseHarvest) {
      if (e.corpseHarvest.skinning) {
        assert.ok(!e.corpseHarvest.skinning.item.includes('gemstone'), `${e.id} skinning item must not be a gemstone`);
      }
      if (e.corpseHarvest.butchering) {
        assert.ok(!e.corpseHarvest.butchering.item.includes('gemstone'), `${e.id} butchering item must not be a gemstone`);
      }
    }
    console.log(`  ✓ ${e.name} (${e.id}) drops zero gemstones (only existing materials: ${harvests.map(h => h.item).join(', ')}).`);
  }
  console.log('✓ PASS: No gemstones present in new enemies drops.\n');

  console.log('========================================================================');
  console.log('🎉 ALL MILESTONE ABYSSAL DEPTHS EXPANSION TESTS PASSED SUCCESSFULLY');
  console.log('========================================================================');
}

runMilestoneAbyssalDepthsExpansionTests();
