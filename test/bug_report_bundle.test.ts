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

console.log('ALL BugReportBundle tests passed!\n');
