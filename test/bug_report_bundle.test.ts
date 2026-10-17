import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('--- TEST SUITE: BugReportBundle ---');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Mock localStorage if in Node environment
const storageData: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageData[key] ?? null,
    setItem: (key: string, val: string) => { storageData[key] = String(val); },
    removeItem: (key: string) => { delete storageData[key]; },
    clear: () => {
      for (const k of Object.keys(storageData)) delete storageData[k];
    }
  };
}

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { buildBugReportBundle, buildLiveSnapshot } = await import('../src/systems/BugReport.ts');
const { EventLog } = await import('../src/systems/EventLog.ts');

await DataLoader.getInstance().loadAll();
const dl = DataLoader.getInstance();
const gs = GameState.getInstance();
gs.initFromPlayerData(dl.getPlayer());

// Pre-populate a saved game into localStorage
const testSaveFile = {
  version: 1,
  savedAt: 1700000000000,
  metadata: {
    leaderName: 'Hero',
    gameDay: 3,
    partySize: 2,
    researchPoints: 10,
    wood: 50,
    ore: 20,
    saveTime: 1700000000000,
    saveVersion: 1
  },
  snapshot: gs.getSnapshot()
};
localStorage.setItem('RPG_TRUE_GRIND_SAVE_V1', JSON.stringify(testSaveFile));

// 1. Bundle contains all required fields and version
{
  console.log('1. Testing bundle field completeness...');
  const bundle = buildBugReportBundle({
    whatHappened: 'Hero fell through dungeon wall on F2',
    whatExpected: 'Should hit collision',
    category: 'Combat'
  });

  assert.ok(bundle.reportId.startsWith('TG-'), `Report ID should start with TG-, got ${bundle.reportId}`);
  assert.strictEqual(bundle.category, 'Combat');
  assert.strictEqual(bundle.whatHappened, 'Hero fell through dungeon wall on F2');
  assert.strictEqual(bundle.whatExpected, 'Should hit collision');
  assert.ok(typeof bundle.version === 'string' && bundle.version.length > 0, 'Version should be present');
  assert.ok(typeof bundle.buildDate === 'string' && bundle.buildDate.length > 0, 'Build date should be present');
  assert.ok(typeof bundle.browser === 'string', 'Browser should be string');
  assert.ok(typeof bundle.sessionLengthMs === 'number', 'sessionLengthMs should be number');
  assert.ok(bundle.liveSnapshot !== null, 'liveSnapshot must be present');
  assert.ok(bundle.lastSavedFile !== null, 'lastSavedFile must be present from localStorage');
  assert.strictEqual(bundle.lastSavedFile, JSON.stringify(testSaveFile));
  assert.ok(Array.isArray(bundle.eventLog.entries), 'eventLog.entries must be an array');
  assert.ok(typeof bundle.eventLog.text === 'string', 'eventLog.text must be string');
  console.log('✓ Bundle field completeness passed');
}

// 2. Snapshot creation is read-only (GameState & localStorage remain completely unchanged)
{
  console.log('2. Testing read-only snapshot guarantee (GameState & storage unchanged)...');
  const gsStateBefore = JSON.stringify(gs);
  const storageBefore = JSON.stringify(storageData);

  const bundle = buildBugReportBundle({
    whatHappened: 'Testing snapshot mutation guard',
    category: 'Other'
  });

  const gsStateAfter = JSON.stringify(gs);
  const storageAfter = JSON.stringify(storageData);

  assert.strictEqual(gsStateBefore, gsStateAfter, 'GameState must not be mutated when taking snapshot');
  assert.strictEqual(storageBefore, storageAfter, 'localStorage must not be mutated when taking snapshot');
  console.log('✓ Read-only snapshot guarantee passed');
}

// 3. Save snapshot round-trips correctly
{
  console.log('3. Testing snapshot round-trip (bundle -> restoreFromLoadedSnapshot)...');
  const liveSnap = buildLiveSnapshot();
  assert.ok(liveSnap.party && liveSnap.party.length > 0, 'Live snapshot must contain party');

  // Modify GameState temporarily
  gs.addWood(999);
  const woodBefore = gs.getWood();

  // Restore from bundle's liveSnapshot
  gs.restoreFromLoadedSnapshot(liveSnap);

  assert.strictEqual(gs.getPartySnapshots().length, liveSnap.party.length, 'Party size should match after restore');
  assert.strictEqual(gs.getPartySnapshots()[0].name, liveSnap.party[0].name, 'Leader name should match after restore');
  console.log('✓ Snapshot round-trip passed');
}

// 4. Measure a real late-game report's size
{
  console.log('4. Testing late-game bug report bundle size (must be under 1.5 MB)...');
  const log = EventLog.resetInstance();

  // 1) Fill event log with 2,000 real entries
  for (let i = 1; i <= 2000; i++) {
    log.setLocation(Math.floor(i / 100) + 1);
    log.add(
      i % 2 === 0 ? 'combat' : 'damage',
      `Combat action #${i}: dealt 125 damage to Shadow Stalker; received 42 shadow damage.`,
      { index: i, damageDealt: 125, damageTaken: 42, target: 'shadow_stalker' }
    );
  }

  // 2) Populate late-game GameState: full stockpile, world flags, buildables
  const allClasses = dl.getClasses();
  assert.ok(allClasses.length >= 95, `Expected at least 95 classes in DataLoader, got ${allClasses.length}`);

  for (let i = 0; i < 50; i++) {
    gs.addItem(`stockpile_resource_${i}`, 999);
  }
  for (let i = 0; i < 30; i++) {
    (gs as any).completedResearchIds.add(`research_node_${i}`);
    (gs as any).unlockedBuildables.add(`buildable_recipe_${i}`);
  }

  // 3) Create full 4-member party with 20+ item stacks each and all 95 classes tracked
  const partySnapshots: any[] = [];
  const memberNames = ['Valerie', 'Garrick', 'Lyra', 'Kaelen'];
  for (let m = 0; m < 4; m++) {
    const inv: Record<string, number> = {};
    for (let it = 0; it < 25; it++) {
      inv[`item_stack_tier4_${it}`] = 99;
    }

    const classLevels: Record<string, number> = {};
    const classStats: Record<string, any> = {};
    for (const c of allClasses) {
      classLevels[c.id] = 50;
      classStats[c.id] = { level: 50, currentExp: 1250 };
    }

    const profs: Record<string, any> = {};
    const profIds = ['short_swords', 'longswords', 'greatswords', 'daggers', 'shields', 'heavy_armor', 'medium_armor', 'light_armor', 'fire_magic', 'water_magic'];
    for (const p of profIds) {
      profs[p] = { level: 60, currentExp: 3400 };
    }

    partySnapshots.push({
      id: `party_member_${m}`,
      name: memberNames[m],
      hp: 850,
      criticalHp: 420,
      energy: 300,
      baseCarryCapacity: 120.0,
      equippedWeaponId: 'greatswords',
      offhandWeaponId: null,
      equippedHelmetId: 'iron_helmet',
      equippedBodyArmorId: 'iron_chestplate',
      equippedNecklaceId: 'ruby_necklace',
      equippedRingId: 'gold_ring',
      equippedAccessoryId: 'warriors_talisman',
      inventory: inv,
      foodItems: [],
      knownSkillIds: ['slash', 'cleave', 'iron_skin', 'berserk', 'whirlwind'],
      equippedSkillIds: ['slash', 'cleave', 'iron_skin', 'berserk', 'whirlwind'],
      autocastMap: { slash: true, cleave: true, iron_skin: true, berserk: true, whirlwind: false },
      skillCooldownsRemainingMs: { slash: 0, cleave: 1200, iron_skin: 0, berserk: 4500, whirlwind: 0 },
      proficiencies: profs,
      classLevels,
      classStats,
      activeClass: allClasses[m % allClasses.length].id,
      unlockedClasses: allClasses.map((c: any) => c.id),
      activityCounts: { kills: 1420, damageDone: 954000, crafts: 150 },
      bookLearnedSkills: ['arcane_intellect', 'ancient_vigor'],
      hunger: 95,
      mood: 85,
      state: 'idle'
    });
  }

  (gs as any).partySnapshots = partySnapshots;

  // Persist into localStorage so lastSavedFile also has the full late-game save
  gs.saveToDisk();

  // 4) Build bug report bundle
  const bundle = buildBugReportBundle({
    whatHappened: 'Late game performance test with 4 party members and 2,000 log entries.',
    whatExpected: 'Report bundle size remains well within the 2 MB streaming limit.',
    category: 'Combat'
  });

  const serialized = JSON.stringify(bundle);
  const byteSize = Buffer.byteLength(serialized, 'utf-8');
  const sizeMb = (byteSize / (1024 * 1024)).toFixed(3);
  const sizeKb = (byteSize / 1024).toFixed(1);

  console.log(`Late-game bundle size: ${byteSize} bytes (${sizeKb} KB, ${sizeMb} MB)`);

  const MAX_ALLOWED_BYTES = 1.5 * 1024 * 1024; // 1.5 MB limit
  if (byteSize > MAX_ALLOWED_BYTES) {
    console.error('BUNDLE SIZE EXCEEDED 1.5 MB! Breakdown:');
    for (const [k, v] of Object.entries(bundle)) {
      const fieldBytes = Buffer.byteLength(JSON.stringify(v), 'utf-8');
      console.error(`- ${k}: ${(fieldBytes / 1024).toFixed(1)} KB`);
    }
  }

  assert.ok(
    byteSize < MAX_ALLOWED_BYTES,
    `Bundle size (${byteSize} bytes / ${sizeMb} MB) must be under 1.5 MB (1,572,864 bytes)`
  );
  console.log('✓ Late-game bundle size is well under 1.5 MB cap');
}

console.log('ALL BugReportBundle tests passed!\n');

