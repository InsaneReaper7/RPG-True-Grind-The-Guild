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

async function runTests() {
  console.log('================================================================');
  console.log('⚔️ RUNNING MILESTONE: ENVIRONMENTS EVERY 5 FLOORS, GATES & TUNING');
  console.log('================================================================\n');

  const { DataLoader } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DataLoader.ts')).href);
  const { DungeonGenerator } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/utils/DungeonGenerator.ts')).href);
  const { GameState } = await import(pathToFileURL(path.resolve(workspaceDir, 'src/systems/GameState.ts')).href);

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const dungeonConfig = dataLoader.getDungeonConfig();

  // -------------------------------------------------------------------
  // TEST 1: Region Layout & 5-Floor Cadence
  // -------------------------------------------------------------------
  console.log('--- TEST 1: Region Layout & 5-Floor Cadence ---');
  const regions = dungeonConfig.regions;
  const crypts = regions.find((r: any) => r.id === 'ancient_crypts')!;
  const abyss = regions.find((r: any) => r.id === 'abyssal_depths')!;
  const caldera = regions.find((r: any) => r.id === 'infernal_caldera')!;
  const glacial = regions.find((r: any) => r.id === 'glacial_caverns')!;

  assert.ok(crypts && abyss && caldera && glacial, 'All 4 regions must be defined');
  assert.strictEqual(crypts.minFloor, 1);
  assert.strictEqual(crypts.maxFloor, 5);
  assert.strictEqual(abyss.minFloor, 6);
  assert.strictEqual(abyss.maxFloor, 10);
  assert.strictEqual(caldera.minFloor, 11);
  assert.strictEqual(caldera.maxFloor, 15);
  assert.strictEqual(glacial.minFloor, 16);
  assert.strictEqual(glacial.maxFloor, undefined);

  // Region depth scaling offsets (preserves Elite/Epic rates across deeper floor numbers)
  assert.strictEqual(crypts.depthScalingOffset, 0);
  assert.strictEqual(abyss.depthScalingOffset, 0);
  assert.strictEqual(caldera.depthScalingOffset, 5);
  assert.strictEqual(glacial.depthScalingOffset, 10);
  console.log('✓ PASS: Region bounds and depthScalingOffsets verified.');

  // -------------------------------------------------------------------
  // TEST 2: Milestone Boss Spawns
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: Milestone Boss Spawns ---');
  const rng = makeSeededRng(12345);

  const d5 = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 5 });
  assert.strictEqual(d5.rooms.find(r => r.type === 'boss') !== undefined, true, 'F5 must have boss room');
  assert.strictEqual(d5.enemySpawns.some(e => e.enemyId === 'bone_warden'), true, 'F5 must spawn bone_warden');

  const d10 = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 10 });
  assert.strictEqual(d10.rooms.find(r => r.type === 'boss') !== undefined, true, 'F10 must have boss room');
  assert.strictEqual(d10.enemySpawns.some(e => e.enemyId === 'abyssal_colossus'), true, 'F10 must spawn abyssal_colossus');

  const d15 = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 15 });
  assert.strictEqual(d15.rooms.find(r => r.type === 'boss') !== undefined, true, 'F15 must have boss room');
  assert.strictEqual(d15.enemySpawns.some(e => e.enemyId === 'magma_tyrant'), true, 'F15 must spawn magma_tyrant');

  const d20 = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 20 });
  assert.strictEqual(d20.rooms.find(r => r.type === 'boss') !== undefined, true, 'F20 must have boss room');
  assert.strictEqual(d20.enemySpawns.some(e => e.enemyId === 'glacial_sovereign'), true, 'F20 must spawn glacial_sovereign');
  console.log('✓ PASS: F5 (Bone Warden), F10 (Colossus), F15 (Tyrant), F20 (Sovereign) milestone spawns verified.');

  // -------------------------------------------------------------------
  // TEST 3: Random Boss Prohibition in Crypts & Incomplete Tutorial
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: Random Boss Prohibition ---');
  // 3a. Crypts (F1-4) must NEVER spawn random bosses even with tutorial complete
  for (let f = 1; f <= 4; f++) {
    for (let s = 1; s <= 20; s++) {
      const testRng = makeSeededRng(s * 101 + f);
      const d = DungeonGenerator.generate(dungeonConfig, testRng, { floorNumber: f, isTutorialComplete: true });
      assert.strictEqual(d.rooms.filter(r => r.type === 'boss').length, 0, `F${f} seed ${s} must have NO boss room`);
    }
  }
  console.log('  ✓ Crypts (F1-4) strictly forbids random bosses across 80 tests.');

  // 3b. Tutorial incomplete must NEVER spawn random bosses in any region
  for (const f of [2, 4, 7, 9, 12, 14]) {
    for (let s = 1; s <= 10; s++) {
      const testRng = makeSeededRng(s * 999 + f);
      const d = DungeonGenerator.generate(dungeonConfig, testRng, { floorNumber: f, isTutorialComplete: false });
      assert.strictEqual(d.rooms.filter(r => r.type === 'boss').length, 0, `F${f} with tutorial incomplete must have NO boss room`);
    }
  }
  console.log('  ✓ Tutorial incomplete strictly forbids random bosses across 60 tests.');

  // -------------------------------------------------------------------
  // TEST 4: Elemental Band Lookup Strictly by Region ID
  // -------------------------------------------------------------------
  console.log('\n--- TEST 4: Elemental Band Lookup Strictly by Region ID ---');
  for (let f = 1; f <= 20; f++) {
    const testRng = makeSeededRng(f * 333);
    const d = DungeonGenerator.generate(dungeonConfig, testRng, { floorNumber: f });
    const region = dataLoader.getRegionForFloor(f);
    if (f <= 5) {
      assert.strictEqual(region.id, 'ancient_crypts');
      assert.strictEqual(d.band, 1);
    } else if (f <= 10) {
      assert.strictEqual(region.id, 'abyssal_depths');
      assert.strictEqual(d.band, 2);
    } else if (f <= 15) {
      assert.strictEqual(region.id, 'infernal_caldera');
      assert.strictEqual(d.band, 3);
    } else {
      assert.strictEqual(region.id, 'glacial_caverns');
      assert.strictEqual(d.band, 4);
    }
  }
  console.log('✓ PASS: Regions and elemental bands map cleanly across all floors F1-20.');

  // -------------------------------------------------------------------
  // TEST 5: Area Boss Gates & Persistence
  // -------------------------------------------------------------------
  console.log('\n--- TEST 5: Area Boss Gates & Persistence ---');
  const gs = GameState.getInstance();
  gs.resetToDefault();

  assert.strictEqual(gs.isAreaBossDefeated('bone_warden'), false);
  assert.strictEqual(gs.isAreaBossDefeated('abyssal_colossus'), false);
  assert.strictEqual(gs.isAreaBossDefeated('magma_tyrant'), false);
  assert.strictEqual(gs.isAreaBossDefeated('glacial_sovereign'), false);

  gs.recordDefeatedAreaBoss('bone_warden');
  assert.strictEqual(gs.isAreaBossDefeated('bone_warden'), true);
  assert.strictEqual(gs.isAreaBossDefeated('abyssal_colossus'), false);

  const snapshot = gs.getSnapshot()!;
  assert.ok(snapshot.defeatedAreaBosses?.includes('bone_warden'));

  gs.resetToDefault();
  assert.strictEqual(gs.isAreaBossDefeated('bone_warden'), false);
  gs.restoreFromLoadedSnapshot(snapshot);
  assert.strictEqual(gs.isAreaBossDefeated('bone_warden'), true);
  console.log('✓ PASS: Area boss gates unlock and persist through snapshots.');

  // -------------------------------------------------------------------
  // TEST 6: Backward Compatible Save Migration
  // -------------------------------------------------------------------
  console.log('\n--- TEST 6: Backward Compatible Save Migration ---');
  const legacySnapshot = {
    ...snapshot,
    dungeonFloorCount: 12,
    lifetimeDungeonFloorCount: 12,
    defeatedAreaBosses: undefined
  };

  gs.resetToDefault();
  gs.restoreFromLoadedSnapshot(legacySnapshot as any);

  assert.strictEqual(gs.isAreaBossDefeated('bone_warden'), true, 'F5 gate unlocked for floor 12 veteran');
  assert.strictEqual(gs.isAreaBossDefeated('abyssal_colossus'), true, 'F10 gate unlocked for floor 12 veteran');
  assert.strictEqual(gs.isAreaBossDefeated('magma_tyrant'), false, 'F15 gate locked for floor 12 veteran');
  console.log('✓ PASS: Veteran save retroactively clears gates without locking out reached depth.');

  // -------------------------------------------------------------------
  // TEST 7: Boss Stats & Guaranteed Drop Tables
  // -------------------------------------------------------------------
  console.log('\n--- TEST 7: Boss Stats & Guaranteed Drop Tables ---');
  const warden = dataLoader.getEnemy('bone_warden')!;
  const colossus = dataLoader.getEnemy('abyssal_colossus')!;
  const tyrant = dataLoader.getEnemy('magma_tyrant')!;
  const sovereign = dataLoader.getEnemy('glacial_sovereign')!;

  assert.ok(warden && colossus && tyrant && sovereign);

  // Bone Warden
  assert.strictEqual(warden.hp, 240);
  assert.strictEqual(warden.criticalHpMax, 120);
  assert.strictEqual(warden.meleeDamage, 19);
  assert.strictEqual(warden.tier, 'boss');
  assert.strictEqual(warden.researchPoints, 20);

  const boneDrop = warden.harvest?.find(h => h.item === 'bone');
  const oreDrop = warden.harvest?.find(h => h.item === 'ore');
  assert.ok(boneDrop, 'Warden must drop bone');
  assert.ok(oreDrop, 'Warden must drop ore');
  assert.strictEqual(boneDrop.amount, 3, 'Warden drops 3 bone');
  assert.strictEqual(oreDrop.amount, 2, 'Warden drops 2 ore');
  const holyGemDrop = warden.harvest?.find(h => h.item === 'holy_gemstone');
  assert.ok(holyGemDrop, 'Warden must drop holy_gemstone in enemies.json');

  // Colossus tuned stats
  assert.strictEqual(colossus.meleeDamage, 28);
  const arcaneDrop = colossus.harvest?.find(h => h.item === 'arcane_gemstone');
  assert.ok(arcaneDrop, 'Colossus must drop arcane_gemstone in enemies.json');

  // Sovereign
  const iceDrop = sovereign.harvest?.find(h => h.item === 'ice_gemstone');
  assert.ok(iceDrop, 'Sovereign must drop ice_gemstone in enemies.json');
  console.log('✓ PASS: All boss stats, mechanics, and gemstone drops verified.');

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
