import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = 'c:/Users/insan/.gemini/antigravity/scratch/RPG True Gring - The Guild';

async function main() {
  // Read dungeonConfig.json
  const configPath = path.resolve(workspaceDir, 'data/dungeonConfig.json');
  const dungeonConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  console.log('--- TEST 1: Config Structure & Regions Schema ---');
  assert.ok(Array.isArray(dungeonConfig.regions), 'regions should be an array in dungeonConfig.json');
  assert.ok(dungeonConfig.regions.length >= 3, 'Should have at least 3 regions configured');

  const crypts = dungeonConfig.regions.find((r: any) => r.id === 'ancient_crypts');
  assert.ok(crypts, 'ancient_crypts region must exist');
  assert.strictEqual(crypts.minFloor, 1);
  assert.strictEqual(crypts.maxFloor, 2);
  assert.strictEqual(crypts.walkableTexture, 'tile-walkable');
  assert.strictEqual(crypts.obstacleTexture, 'tile-obstacle');

  const abyss = dungeonConfig.regions.find((r: any) => r.id === 'abyssal_depths');
  assert.ok(abyss, 'abyssal_depths region must exist');
  assert.strictEqual(abyss.minFloor, 3);
  assert.strictEqual(abyss.maxFloor, 5, 'abyssal_depths capped at floor 5');
  assert.strictEqual(abyss.walkableTexture, 'tile-abyssal-walkable');
  assert.strictEqual(abyss.obstacleTexture, 'tile-abyssal-obstacle');
  assert.strictEqual(abyss.accentColor, '#c084fc');

  const caldera = dungeonConfig.regions.find((r: any) => r.id === 'infernal_caldera');
  assert.ok(caldera, 'infernal_caldera region must exist');
  assert.strictEqual(caldera.minFloor, 6);
  assert.strictEqual(caldera.walkableTexture, 'tile-caldera-walkable');
  assert.strictEqual(caldera.obstacleTexture, 'tile-caldera-obstacle');
  assert.strictEqual(caldera.accentColor, '#f97316');
  console.log('✅ Test 1 Passed: Regions schema is well-formed.');

  console.log('\n--- TEST 2: Region Depth Resolution Across Multiple Floors ---');
  function resolveRegion(floor: number, config: any) {
    const regions = config.regions && config.regions.length > 0 ? config.regions : [
      { id: 'ancient_crypts', name: 'Ancient Crypts', minFloor: 1, maxFloor: 2, walkableTexture: 'tile-walkable', obstacleTexture: 'tile-obstacle', accentColor: '#a78bfa' },
      { id: 'abyssal_depths', name: 'Abyssal Depths', minFloor: 3, maxFloor: 5, walkableTexture: 'tile-abyssal-walkable', obstacleTexture: 'tile-abyssal-obstacle', accentColor: '#c084fc' },
      { id: 'infernal_caldera', name: 'Infernal Caldera', minFloor: 6, maxFloor: 10, walkableTexture: 'tile-caldera-walkable', obstacleTexture: 'tile-caldera-obstacle', accentColor: '#f97316' },
      { id: 'glacial_caverns', name: 'Glacial Caverns', minFloor: 11, walkableTexture: 'tile-glacial-walkable', obstacleTexture: 'tile-glacial-obstacle', accentColor: '#06b6d4' }
    ];
    const match = regions.find((r: any) => {
      const min = r.minFloor ?? 1;
      const max = r.maxFloor ?? Infinity;
      return floor >= min && floor <= max;
    });
    return match || regions[0];
  }

  const f1 = resolveRegion(1, dungeonConfig);
  assert.strictEqual(f1.id, 'ancient_crypts');
  assert.strictEqual(f1.walkableTexture, 'tile-walkable');
  assert.strictEqual(f1.obstacleTexture, 'tile-obstacle');

  const f2 = resolveRegion(2, dungeonConfig);
  assert.strictEqual(f2.id, 'ancient_crypts');
  assert.strictEqual(f2.walkableTexture, 'tile-walkable');

  const f3 = resolveRegion(3, dungeonConfig);
  assert.strictEqual(f3.id, 'abyssal_depths');
  assert.strictEqual(f3.walkableTexture, 'tile-abyssal-walkable');
  assert.strictEqual(f3.obstacleTexture, 'tile-abyssal-obstacle');

  const f4 = resolveRegion(4, dungeonConfig);
  assert.strictEqual(f4.id, 'abyssal_depths');

  const f5 = resolveRegion(5, dungeonConfig);
  assert.strictEqual(f5.id, 'abyssal_depths');

  // Milestone 56 update: Abyssal Depths capped at 5; Floor 10 now resolves to infernal_caldera
  const f10 = resolveRegion(10, dungeonConfig);
  assert.strictEqual(f10.id, 'infernal_caldera', 'Floor 10 must resolve to infernal_caldera');
  console.log('✅ Test 2 Passed: Region resolution triggers accurately on Floor 1, 2 (Ancient Crypts), Floor 3, 4, 5 (Abyssal Depths), and Floor 10 (Infernal Caldera).');

  console.log('\n--- TEST 3: Deterministic Generation Integrity Across Runs ---');
  function makeSeededRng(seed: number) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  // Import DungeonGenerator logic
  const dungeonGenPath = pathToFileURL(path.resolve(workspaceDir, 'src/utils/DungeonGenerator.ts')).href;
  const { DungeonGenerator } = await import(dungeonGenPath);

  for (const seed of [42, 100, 777, 9999]) {
    const rng1 = makeSeededRng(seed);
    const dungeonFloor1 = DungeonGenerator.generate(dungeonConfig, rng1, { floorNumber: 1 });

    const rng2 = makeSeededRng(seed);
    const dungeonFloor3 = DungeonGenerator.generate(dungeonConfig, rng2, { floorNumber: 3 });

    // Grid dimensions
    assert.strictEqual(dungeonFloor1.width, dungeonFloor3.width, `Seed ${seed}: Width match`);
    assert.strictEqual(dungeonFloor1.height, dungeonFloor3.height, `Seed ${seed}: Height match`);

    // Grid matrix byte-for-byte comparison
    for (let y = 0; y < dungeonFloor1.height; y++) {
      for (let x = 0; x < dungeonFloor1.width; x++) {
        assert.strictEqual(
          dungeonFloor1.gridMatrix[y][x],
          dungeonFloor3.gridMatrix[y][x],
          `Seed ${seed}: Tile mismatch at (${x}, ${y})`
        );
      }
    }

    // Room layout, coordinates, center points
    assert.strictEqual(dungeonFloor1.rooms.length, dungeonFloor3.rooms.length, `Seed ${seed}: Room count match`);
    for (let i = 0; i < dungeonFloor1.rooms.length; i++) {
      const r1 = dungeonFloor1.rooms[i];
      const r3 = dungeonFloor3.rooms[i];
      assert.strictEqual(r1.x, r3.x);
      assert.strictEqual(r1.y, r3.y);
      assert.strictEqual(r1.width, r3.width);
      assert.strictEqual(r1.height, r3.height);
      assert.strictEqual(r1.centerX, r3.centerX);
      assert.strictEqual(r1.centerY, r3.centerY);
    }

    // Portal and Crystal placement
    assert.deepStrictEqual(dungeonFloor1.portalPos, dungeonFloor3.portalPos, `Seed ${seed}: Portal pos match`);
    assert.deepStrictEqual(dungeonFloor1.crystalPos, dungeonFloor3.crystalPos, `Seed ${seed}: Crystal pos match`);
  }
  console.log('✅ Test 3 Passed: DungeonGenerator produces 100% byte-identical room layout, connectivity, and crystal placement given identical seeds regardless of floor/theme.');

  console.log('\n--- ALL TEST SUITES PASSED! ---');
}

main().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
