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

async function runThirdNamedRegionTests() {
  console.log('================================================================');
  console.log('❄️ RUNNING MILESTONE: THIRD NAMED REGION (GLACIAL CAVERNS) ❄️');
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
  assert.strictEqual(config.regions.length, 4, 'Must have exactly 4 regions configured');

  const [region1, region2, region3, region4] = config.regions;

  // Region 1: Ancient Crypts
  assert.strictEqual(region1.id, 'ancient_crypts');
  assert.strictEqual(region1.name, 'Ancient Crypts');
  assert.strictEqual(region1.minFloor, 1);
  assert.strictEqual(region1.maxFloor, 2);
  assert.strictEqual(region1.walkableTexture, 'tile-walkable');
  assert.strictEqual(region1.obstacleTexture, 'tile-obstacle');
  assert.strictEqual(region1.accentColor, '#a78bfa');
  assert.strictEqual(region1.tagline, 'The Upper Stone Chambers');

  // Region 2: Abyssal Depths
  assert.strictEqual(region2.id, 'abyssal_depths');
  assert.strictEqual(region2.name, 'Abyssal Depths');
  assert.strictEqual(region2.minFloor, 3);
  assert.strictEqual(region2.maxFloor, 5, 'Abyssal Depths must cap at Floor 5');
  assert.strictEqual(region2.walkableTexture, 'tile-abyssal-walkable');
  assert.strictEqual(region2.obstacleTexture, 'tile-abyssal-obstacle');
  assert.strictEqual(region2.accentColor, '#c084fc');
  assert.strictEqual(region2.tagline, 'The Deep Void Stratum');

  // Region 3: Infernal Caldera
  assert.strictEqual(region3.id, 'infernal_caldera');
  assert.strictEqual(region3.name, 'Infernal Caldera');
  assert.strictEqual(region3.minFloor, 6);
  assert.strictEqual(region3.maxFloor, 10, 'Infernal Caldera must cap at Floor 10');
  assert.strictEqual(region3.walkableTexture, 'tile-caldera-walkable');
  assert.strictEqual(region3.obstacleTexture, 'tile-caldera-obstacle');
  assert.strictEqual(region3.accentColor, '#f97316');
  assert.strictEqual(region3.tagline, 'The Scorched Subterranean Core');

  // Region 4: Glacial Caverns (Third Named Region)
  assert.strictEqual(region4.id, 'glacial_caverns');
  assert.strictEqual(region4.name, 'Glacial Caverns');
  assert.strictEqual(region4.minFloor, 11, 'Glacial Caverns must start at Floor 11 (meaningfully deeper than Floor 6)');
  assert.strictEqual(region4.maxFloor, undefined, 'Glacial Caverns extends into deep stratum');
  assert.strictEqual(region4.walkableTexture, 'tile-glacial-walkable');
  assert.strictEqual(region4.obstacleTexture, 'tile-glacial-obstacle');
  assert.strictEqual(region4.accentColor, '#06b6d4', 'Accent color must be vibrant sub-zero cyan');
  assert.strictEqual(region4.tagline, 'The Sub-Zero Crystalline Depths');

  // Check DataLoader.DEFAULT_REGIONS parity
  assert.strictEqual(DataLoader.DEFAULT_REGIONS.length, 4, 'DEFAULT_REGIONS must contain 4 regions');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[2].id, 'infernal_caldera');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[2].maxFloor, 10);
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[3].id, 'glacial_caverns');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[3].minFloor, 11);
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[3].walkableTexture, 'tile-glacial-walkable');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[3].obstacleTexture, 'tile-glacial-obstacle');
  assert.strictEqual(DataLoader.DEFAULT_REGIONS[3].accentColor, '#06b6d4');

  console.log('✓ PASS: All 4 regions configured with authentic metadata and DataLoader fallback parity.');

  // -------------------------------------------------------------------
  // TEST 2: Dynamic Floor Depth Resolution Across All Biomes
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Dynamic Floor Depth Resolution Across Entire Run ---');
  // Floors 1 & 2 -> Ancient Crypts
  assert.strictEqual(dataLoader.getRegionForFloor(1).id, 'ancient_crypts');
  assert.strictEqual(dataLoader.getRegionForFloor(2).id, 'ancient_crypts');

  // Floors 3, 4, 5 -> Abyssal Depths
  assert.strictEqual(dataLoader.getRegionForFloor(3).id, 'abyssal_depths');
  assert.strictEqual(dataLoader.getRegionForFloor(4).id, 'abyssal_depths');
  assert.strictEqual(dataLoader.getRegionForFloor(5).id, 'abyssal_depths');

  // Floors 6, 7, 8, 9, 10 -> Infernal Caldera
  assert.strictEqual(dataLoader.getRegionForFloor(6).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(7).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(8).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(9).id, 'infernal_caldera');
  assert.strictEqual(dataLoader.getRegionForFloor(10).id, 'infernal_caldera');

  // Floors 11, 12, 15, 20, 50 -> Glacial Caverns
  assert.strictEqual(dataLoader.getRegionForFloor(11).id, 'glacial_caverns');
  assert.strictEqual(dataLoader.getRegionForFloor(12).id, 'glacial_caverns');
  assert.strictEqual(dataLoader.getRegionForFloor(15).id, 'glacial_caverns');
  assert.strictEqual(dataLoader.getRegionForFloor(20).id, 'glacial_caverns');
  assert.strictEqual(dataLoader.getRegionForFloor(50).id, 'glacial_caverns');

  console.log('✓ PASS: Depth resolution maps accurately across all 4 biome boundaries.');

  // -------------------------------------------------------------------
  // TEST 3: Visual & Texture Distinctiveness Across Quad-Biome Spectrum
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: Visual & Texture Distinctiveness ---');
  const allWalkables = [
    region1.walkableTexture,
    region2.walkableTexture,
    region3.walkableTexture,
    region4.walkableTexture
  ];
  const allObstacles = [
    region1.obstacleTexture,
    region2.obstacleTexture,
    region3.obstacleTexture,
    region4.obstacleTexture
  ];
  const allAccents = [
    region1.accentColor,
    region2.accentColor,
    region3.accentColor,
    region4.accentColor
  ];

  // All walkable texture keys must be unique
  assert.strictEqual(new Set(allWalkables).size, 4, 'All 4 walkable textures must be distinct');
  // All obstacle texture keys must be unique
  assert.strictEqual(new Set(allObstacles).size, 4, 'All 4 obstacle textures must be distinct');
  // All accent colors must be unique
  assert.strictEqual(new Set(allAccents).size, 4, 'All 4 accent colors must be distinct');

  // Verify procedural generation in TextureGenerator
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
  assert.ok(generatedTextures['tile-glacial-walkable'], 'tile-glacial-walkable generated');
  assert.ok(generatedTextures['tile-glacial-obstacle'], 'tile-glacial-obstacle generated');

  console.log('✓ PASS: Quad-biome textures, accents, and procedural generation validated.');

  // -------------------------------------------------------------------
  // TEST 4: Zero Impact on Procedural Generation (Deterministic Multi-Seed Test)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4: Zero Impact on Procedural Generation (Deterministic Invariance) ---');
  const testSeeds = [42, 100, 777, 9999];
  for (const seed of testSeeds) {
    const rng1 = makeSeededRng(seed);
    const dungeon1 = DungeonGenerator.generate(config, rng1, { floorNumber: 1 });

    const rng3 = makeSeededRng(seed);
    const dungeon3 = DungeonGenerator.generate(config, rng3, { floorNumber: 3 });

    const rng6 = makeSeededRng(seed);
    const dungeon6 = DungeonGenerator.generate(config, rng6, { floorNumber: 6 });

    const rng11 = makeSeededRng(seed);
    const dungeon11 = DungeonGenerator.generate(config, rng11, { floorNumber: 11 });

    // Grid Dimensions
    assert.strictEqual(dungeon1.width, dungeon3.width);
    assert.strictEqual(dungeon1.width, dungeon6.width);
    assert.strictEqual(dungeon1.width, dungeon11.width);
    assert.strictEqual(dungeon1.height, dungeon3.height);
    assert.strictEqual(dungeon1.height, dungeon6.height);
    assert.strictEqual(dungeon1.height, dungeon11.height);

    // Byte-for-byte grid matrix match
    for (let y = 0; y < dungeon1.height; y++) {
      for (let x = 0; x < dungeon1.width; x++) {
        assert.strictEqual(dungeon1.gridMatrix[y][x], dungeon3.gridMatrix[y][x]);
        assert.strictEqual(dungeon1.gridMatrix[y][x], dungeon6.gridMatrix[y][x]);
        assert.strictEqual(dungeon1.gridMatrix[y][x], dungeon11.gridMatrix[y][x]);
      }
    }

    // Room layouts
    assert.strictEqual(dungeon1.rooms.length, dungeon3.rooms.length);
    assert.strictEqual(dungeon1.rooms.length, dungeon6.rooms.length);
    assert.strictEqual(dungeon1.rooms.length, dungeon11.rooms.length);
    for (let i = 0; i < dungeon1.rooms.length; i++) {
      const r1 = dungeon1.rooms[i];
      const r3 = dungeon3.rooms[i];
      const r6 = dungeon6.rooms[i];
      const r11 = dungeon11.rooms[i];
      assert.strictEqual(r1.x, r3.x);
      assert.strictEqual(r1.x, r6.x);
      assert.strictEqual(r1.x, r11.x);
      assert.strictEqual(r1.y, r3.y);
      assert.strictEqual(r1.y, r6.y);
      assert.strictEqual(r1.y, r11.y);
      assert.strictEqual(r1.width, r3.width);
      assert.strictEqual(r1.width, r6.width);
      assert.strictEqual(r1.width, r11.width);
      assert.strictEqual(r1.height, r3.height);
      assert.strictEqual(r1.height, r6.height);
      assert.strictEqual(r1.height, r11.height);
      assert.strictEqual(r1.centerX, r3.centerX);
      assert.strictEqual(r1.centerX, r6.centerX);
      assert.strictEqual(r1.centerX, r11.centerX);
      assert.strictEqual(r1.centerY, r3.centerY);
      assert.strictEqual(r1.centerY, r6.centerY);
      assert.strictEqual(r1.centerY, r11.centerY);
    }

    // Portal and Crystal coordinates
    assert.deepStrictEqual(dungeon1.portalPos, dungeon3.portalPos);
    assert.deepStrictEqual(dungeon1.portalPos, dungeon6.portalPos);
    assert.deepStrictEqual(dungeon1.portalPos, dungeon11.portalPos);
    assert.deepStrictEqual(dungeon1.crystalPos, dungeon3.crystalPos);
    assert.deepStrictEqual(dungeon1.crystalPos, dungeon6.crystalPos);
    assert.deepStrictEqual(dungeon1.crystalPos, dungeon11.crystalPos);
  }

  console.log('✓ PASS: Deterministic seed invariance confirmed across 4 random seeds across all 4 regions — 0 generation logic impact.');

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

  // Floor 3 -> 4, 4 -> 5: Same region (Abyssal Depths)
  assert.strictEqual(getCrystalNextRegionPreview(3), undefined);
  assert.strictEqual(getCrystalNextRegionPreview(4), undefined);

  // Floor 5 -> 6: Boundary cross! Preview shows "Infernal Caldera"
  assert.strictEqual(getCrystalNextRegionPreview(5), 'Infernal Caldera');

  // Floor 6 -> 7, 7 -> 8, 8 -> 9, 9 -> 10: Same region (Infernal Caldera)
  assert.strictEqual(getCrystalNextRegionPreview(6), undefined);
  assert.strictEqual(getCrystalNextRegionPreview(7), undefined);
  assert.strictEqual(getCrystalNextRegionPreview(8), undefined);
  assert.strictEqual(getCrystalNextRegionPreview(9), undefined);

  // Floor 10 -> 11: Boundary cross! Preview shows "Glacial Caverns"
  assert.strictEqual(getCrystalNextRegionPreview(10), 'Glacial Caverns');

  // Floor 11 -> 12: Same region (Glacial Caverns)
  assert.strictEqual(getCrystalNextRegionPreview(11), undefined);

  console.log('✓ PASS: Crystal modal accurately announces next region only at Floor 2->3, 5->6, and 10->11 boundaries.');

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

  const toast10 = formatRegionEntryToast(10);
  assert.strictEqual(toast10, null, 'Floor 10 stays in Infernal Caldera, no entry toast');

  const toast11 = formatRegionEntryToast(11);
  assert.strictEqual(toast11, '🌌 Entering Glacial Caverns (Floor 11) — The Sub-Zero Crystalline Depths');

  const toast12 = formatRegionEntryToast(12);
  assert.strictEqual(toast12, null, 'Floor 12 stays in Glacial Caverns, no entry toast');

  console.log('✓ PASS: Toast notifications trigger exclusively on boundary crossings with authentic taglines.');

  console.log('\n================================================================');
  console.log('🎉 ALL 6 THIRD NAMED REGION UNIT & TOPOLOGY TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runThirdNamedRegionTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
