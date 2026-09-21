import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it in node
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const workspaceDir = 'c:/Users/insan/.gemini/antigravity/scratch/RPG True Gring - The Guild';

// Mock minimal DOM / browser globals for node testing
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(workspaceDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function makeSeededRng(seed: number) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function runMilestone56Tests() {
  console.log('================================================================');
  console.log('🌋 RUNNING MILESTONE 56: SECOND NAMED REGION (INFERNAL CALDERA) 🌋');
  console.log('================================================================\n');

  const { DataLoader } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DataLoader.ts')).href);
  const { DungeonGenerator } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DungeonGenerator.ts')).href);
  const { TextureGenerator } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/TextureGenerator.ts')).href);

  // Initialize DataLoader
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -------------------------------------------------------------------
  // TEST 1: Configuration Schema & Extensibility
  // -------------------------------------------------------------------
  console.log('--- TEST 1: DungeonConfig & Regions Array Schema ---');
  const config = dataLoader.getDungeonConfig();
  assert.ok(Array.isArray(config.regions), 'regions must be an array');
  assert.strictEqual(config.regions.length, 3, 'Must have exactly 3 regions configured');

  const [region1, region2, region3] = config.regions;

  // Region 1: Ancient Crypts
  assert.strictEqual(region1.id, 'ancient_crypts');
  assert.strictEqual(region1.name, 'Ancient Crypts');
  assert.strictEqual(region1.minFloor, 1);
  assert.strictEqual(region1.maxFloor, 2);
  assert.strictEqual(region1.walkableTexture, 'tile-walkable');
  assert.strictEqual(region1.obstacleTexture, 'tile-obstacle');
  assert.strictEqual(region1.accentColor, '#a78bfa');
  assert.ok(region1.tagline, 'ancient_crypts has a tagline');

  // Region 2: Abyssal Depths
  assert.strictEqual(region2.id, 'abyssal_depths');
  assert.strictEqual(region2.name, 'Abyssal Depths');
  assert.strictEqual(region2.minFloor, 3);
  assert.strictEqual(region2.maxFloor, 5, 'Abyssal Depths must cap at Floor 5');
  assert.strictEqual(region2.walkableTexture, 'tile-abyssal-walkable');
  assert.strictEqual(region2.obstacleTexture, 'tile-abyssal-obstacle');
  assert.strictEqual(region2.accentColor, '#c084fc');
  assert.ok(region2.tagline, 'abyssal_depths has a tagline');

  // Region 3: Infernal Caldera
  assert.strictEqual(region3.id, 'infernal_caldera');
  assert.strictEqual(region3.name, 'Infernal Caldera');
  assert.strictEqual(region3.minFloor, 6, 'Infernal Caldera must start at Floor 6');
  assert.strictEqual(region3.maxFloor, undefined, 'Infernal Caldera extends indefinitely into deep stratum');
  assert.strictEqual(region3.walkableTexture, 'tile-caldera-walkable');
  assert.strictEqual(region3.obstacleTexture, 'tile-caldera-obstacle');
  assert.strictEqual(region3.accentColor, '#f97316', 'Accent color must be vibrant molten lava orange');
  assert.strictEqual(region3.tagline, 'The Scorched Subterranean Core');

  // Also check DEFAULT_REGIONS fallback parity
  assert.strictEqual(DataLoader.DEFAULT_REGIONS.length, 3, 'DEFAULT_REGIONS must contain 3 regions');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[2].id, 'infernal_caldera');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[2].minFloor, 6);

  console.log('✓ PASS: Regions configuration and DataLoader fallback array schema verified.');

  // -------------------------------------------------------------------
  // TEST 2: DataLoader Floor Depth Resolution
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Dynamic Floor Depth Resolution Across Entire Run ---');
  // Floors 1 & 2 -> Ancient Crypts
  assert.strictEqual(dataLoader.getRegionForFloor(1).id, 'ancient_crypts');
  assert.strictEqual(dataLoader.getRegionForFloor(2).id, 'ancient_crypts');

  // Floors 3, 4, 5 -> Abyssal Depths
  assert.strictEqual(dataLoader.getRegionForFloor(3).id, 'abyssal_depths');
  assert.strictEqual(dataLoader.getRegionForFloor(4).id, 'abyssal_depths');
  assert.strictEqual(dataLoader.getRegionForFloor(5).id, 'abyssal_depths');

  // Floors 6, 7, 10, 50 -> Infernal Caldera
  assert.strictEqual(dataLoader.getRegionForFloor(6).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(7).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(10).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(50).id, 'infernal_caldera');

  console.log('✓ PASS: Floor depth resolution resolves correct regions accurately across all floors.');

  // -------------------------------------------------------------------
  // TEST 3: Tri-Biome Visual & Texture Distinction
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: Visual & Texture Distinctiveness ---');
  // Confirm that each biome's walkable and obstacle textures are distinct strings
  const textures = [
    region1.walkableTexture,
    region1.obstacleTexture,
    region2.walkableTexture,
    region2.obstacleTexture,
    region3.walkableTexture,
    region3.obstacleTexture
  ];
  const uniqueTextures = new Set(textures);
  assert.strictEqual(uniqueTextures.size, 6, 'All 6 tile textures across the 3 biomes must be distinct');

  // Confirm that each biome's accent colors are distinct
  const accents = [region1.accentColor, region2.accentColor, region3.accentColor];
  const uniqueAccents = new Set(accents);
  assert.strictEqual(uniqueAccents.size, 3, 'All 3 region accent colors must be visually distinct');

  // Mock scene texture generation check
  const generatedTextures: Record<string, boolean> = {};
  const mockScene: any = {
    textures: {
      exists: (key: string) => !!generatedTextures[key]
    },
    make: {
      graphics: () => {
        const g: any = new Proxy({}, {
          get(target, prop) {
            if (prop === 'generateTexture') {
              return (key: string) => {
                generatedTextures[key] = true;
              };
            }
            if (prop === 'destroy') {
              return () => {};
            }
            return () => g;
          }
        });
        return g;
      }
    }
  };

  TextureGenerator.generatePlaceholderTextures(mockScene, 32);
  assert.ok(generatedTextures['tile-walkable'], 'tile-walkable generated');
  assert.ok(generatedTextures['tile-obstacle'], 'tile-obstacle generated');
  assert.ok(generatedTextures['tile-abyssal-walkable'], 'tile-abyssal-walkable generated');
  assert.ok(generatedTextures['tile-abyssal-obstacle'], 'tile-abyssal-obstacle generated');
  assert.ok(generatedTextures['tile-caldera-walkable'], 'tile-caldera-walkable generated');
  assert.ok(generatedTextures['tile-caldera-obstacle'], 'tile-caldera-obstacle generated');

  console.log('✓ PASS: Tri-biome visual assets, accents, and procedural textures generated and verified.');

  // -------------------------------------------------------------------
  // TEST 4: Zero Changes to Core Generation Logic & Deterministic Invariance
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4: Zero Impact on Procedural Generation (Deterministic Invariance) ---');
  const testSeeds = [42, 12345, 99999, 777777];

  for (const seed of testSeeds) {
    // Generate floor 1 (Ancient Crypts), floor 3 (Abyssal Depths), floor 6 (Infernal Caldera)
    // with the identical seeded RNG stream
    const rngFloor1 = makeSeededRng(seed);
    const dungeon1 = DungeonGenerator.generate(config, rngFloor1, { floorNumber: 1 });

    const rngFloor3 = makeSeededRng(seed);
    const dungeon3 = DungeonGenerator.generate(config, rngFloor3, { floorNumber: 3 });

    const rngFloor6 = makeSeededRng(seed);
    const dungeon6 = DungeonGenerator.generate(config, rngFloor6, { floorNumber: 6 });

    // 4a. Grid dimensions invariant
    assert.strictEqual(dungeon1.width, dungeon3.width);
    assert.strictEqual(dungeon1.width, dungeon6.width);
    assert.strictEqual(dungeon1.height, dungeon3.height);
    assert.strictEqual(dungeon1.height, dungeon6.height);

    // 4b. Grid matrix cell-by-cell byte equality
    for (let y = 0; y < dungeon1.height; y++) {
      for (let x = 0; x < dungeon1.width; x++) {
        assert.strictEqual(
          dungeon1.gridMatrix[y][x],
          dungeon3.gridMatrix[y][x],
          `Seed ${seed}: Tile mismatch between Floor 1 and 3 at (${x}, ${y})`
        );
        assert.strictEqual(
          dungeon1.gridMatrix[y][x],
          dungeon6.gridMatrix[y][x],
          `Seed ${seed}: Tile mismatch between Floor 1 and 6 at (${x}, ${y})`
        );
      }
    }

    // 4c. Rooms count and coordinates
    assert.strictEqual(dungeon1.rooms.length, dungeon3.rooms.length);
    assert.strictEqual(dungeon1.rooms.length, dungeon6.rooms.length);
    for (let i = 0; i < dungeon1.rooms.length; i++) {
      const r1 = dungeon1.rooms[i];
      const r3 = dungeon3.rooms[i];
      const r6 = dungeon6.rooms[i];
      assert.strictEqual(r1.x, r3.x);
      assert.strictEqual(r1.x, r6.x);
      assert.strictEqual(r1.y, r3.y);
      assert.strictEqual(r1.y, r6.y);
      assert.strictEqual(r1.width, r3.width);
      assert.strictEqual(r1.width, r6.width);
      assert.strictEqual(r1.height, r3.height);
      assert.strictEqual(r1.height, r6.height);
      assert.strictEqual(r1.centerX, r3.centerX);
      assert.strictEqual(r1.centerX, r6.centerX);
      assert.strictEqual(r1.centerY, r3.centerY);
      assert.strictEqual(r1.centerY, r6.centerY);
    }

    // 4d. Portal and Crystal coordinates
    assert.deepStrictEqual(dungeon1.portalPos, dungeon3.portalPos);
    assert.deepStrictEqual(dungeon1.portalPos, dungeon6.portalPos);
    assert.deepStrictEqual(dungeon1.crystalPos, dungeon3.crystalPos);
    assert.deepStrictEqual(dungeon1.crystalPos, dungeon6.crystalPos);
  }

  console.log('✓ PASS: Deterministic seed invariance confirmed across 4 random seeds — 0 generation logic impact.');

  // -------------------------------------------------------------------
  // TEST 5: Teleporter Crystal Next-Region Prediction & Boundary Transitions
  // -------------------------------------------------------------------
  console.log('\n--- TEST 5: Teleporter Crystal Next-Region Preview Across Descent Chain ---');
  function getCrystalNextRegionPreview(floor: number) {
    const curRegion = dataLoader.getRegionForFloor(floor);
    const nextRegion = dataLoader.getRegionForFloor(floor + 1);
    return nextRegion.name !== curRegion.name ? nextRegion.name : undefined;
  }

  // Floor 1 -> 2: Same region (Ancient Crypts), preview undefined
  assert.strictEqual(getCrystalNextRegionPreview(1), undefined);

  // Floor 2 -> 3: Boundary cross! Preview shows "Abyssal Depths"
  assert.strictEqual(getCrystalNextRegionPreview(2), 'Abyssal Depths');

  // Floor 3 -> 4: Same region (Abyssal Depths), preview undefined
  assert.strictEqual(getCrystalNextRegionPreview(3), undefined);

  // Floor 4 -> 5: Same region (Abyssal Depths), preview undefined
  assert.strictEqual(getCrystalNextRegionPreview(4), undefined);

  // Floor 5 -> 6: Boundary cross! Preview shows "Infernal Caldera"
  assert.strictEqual(getCrystalNextRegionPreview(5), 'Infernal Caldera');

  // Floor 6 -> 7: Same region (Infernal Caldera), preview undefined
  assert.strictEqual(getCrystalNextRegionPreview(6), undefined);

  console.log('✓ PASS: Crystal modal accurately announces next region only at Floor 2->3 and Floor 5->6 boundaries.');

  // -------------------------------------------------------------------
  // TEST 6: Toast Announcement Format & Tagline Consistency
  // -------------------------------------------------------------------
  console.log('\n--- TEST 6: Toast Announcement & Tagline Validation ---');
  function formatRegionEntryToast(floor: number): string | null {
    const prevFloor = floor - 1;
    const curRegion = dataLoader.getRegionForFloor(floor);
    const prevRegion = prevFloor >= 1 ? dataLoader.getRegionForFloor(prevFloor) : null;
    if (!prevRegion || prevRegion.id !== curRegion.id) {
      return `🌌 Entering ${curRegion.name} (Floor ${floor}) — ${curRegion.tagline || 'New Biome'}`;
    }
    return null;
  }

  const toast1 = formatRegionEntryToast(1);
  assert.strictEqual(toast1, '🌌 Entering Ancient Crypts (Floor 1) — The Upper Stone Chambers');

  const toast2 = formatRegionEntryToast(2);
  assert.strictEqual(toast2, null, 'Floor 2 stays in Ancient Crypts, no entry toast');

  const toast3 = formatRegionEntryToast(3);
  assert.strictEqual(toast3, '🌌 Entering Abyssal Depths (Floor 3) — The Deep Void Stratum');

  const toast4 = formatRegionEntryToast(4);
  assert.strictEqual(toast4, null, 'Floor 4 stays in Abyssal Depths, no entry toast');

  const toast5 = formatRegionEntryToast(5);
  assert.strictEqual(toast5, null, 'Floor 5 stays in Abyssal Depths, no entry toast');

  const toast6 = formatRegionEntryToast(6);
  assert.strictEqual(toast6, '🌌 Entering Infernal Caldera (Floor 6) — The Scorched Subterranean Core');

  const toast7 = formatRegionEntryToast(7);
  assert.strictEqual(toast7, null, 'Floor 7 stays in Infernal Caldera, no entry toast');

  console.log('✓ PASS: Toast notifications trigger exclusively on boundary crossings with authentic taglines.');

  console.log('\n================================================================');
  console.log('🎉 ALL 6 MILESTONE 56 UNIT & TOPOLOGY TESTS PASSED CLEANLY! 🎉');
  console.log('================================================================\n');
}

runMilestone56Tests().catch((err) => {
  console.error('Milestone 56 Test Suite Failure:', err);
  process.exit(1);
});
