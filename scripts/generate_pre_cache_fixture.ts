import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';

const dataLoader = DataLoader.getInstance();
await dataLoader.loadAll();

const config = dataLoader.getDungeonConfig();
const records: Record<number, { sha256: string; data: any }> = {};

for (let seed = 1; seed <= 50; seed++) {
  const d = DungeonGenerator.generate(config, DungeonGenerator.createRng(seed), {
    seed,
    currentFloorSeed: seed,
    floorNumber: 3,
    isTutorialComplete: true,
    isDiggingUnlocked: true,
    grove: { staffObtained: false, misses: 5 }
  });

  const floorData = {
    width: d.width,
    height: d.height,
    gridMatrix: d.gridMatrix,
    rooms: d.rooms,
    portalPos: d.portalPos,
    crystalPos: d.crystalPos,
    enemySpawns: d.enemySpawns,
    bushSpawns: d.bushSpawns,
    waterTiles: d.waterTiles || [],
    overgrownGrove: d.overgrownGrove,
    groveEligible: d.groveEligible
  };

  const sha256 = crypto.createHash('sha256').update(JSON.stringify(floorData)).digest('hex');
  records[seed] = {
    sha256,
    data: floorData
  };
}

const outDir = path.resolve('test/fixtures');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'dungeon_determinism_pre_cache_seeds_1_50.json');
fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');
console.log(`[Fixture] Wrote 50 dungeon fingerprints to ${outPath}`);
