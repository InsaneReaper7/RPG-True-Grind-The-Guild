import fs from 'fs';

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

async function runSim() {
  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const dungeonConfig = dataLoader.getDungeonConfig();

  const TRIALS = 1000;
  console.log(`=== Simulation over ${TRIALS} floors (F1-6) ===\n`);
  console.log('| Floor | Avg Trees | Avg Bushes (Herbs) | Avg Rocks (Ore) | Avg Wood Yield |');
  console.log('|---|---|---|---|---|');

  for (let f = 1; f <= 6; f++) {
    let totalTrees = 0;
    let totalBushes = 0;
    let totalRocks = 0;

    for (let t = 0; t < TRIALS; t++) {
      const seed = 100000 * f + t;
      const rng = DungeonGenerator.createRng(seed);
      const dungeon = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: f, seed });

      for (const node of dungeon.bushSpawns) {
        if (node.nodeTypeId === 'woodcutting_tree') totalTrees++;
        else if (node.nodeTypeId === 'foraging_bush') totalBushes++;
        else if (node.nodeTypeId === 'mining_rock') totalRocks++;
      }
    }

    const avgTrees = totalTrees / TRIALS;
    const avgBushes = totalBushes / TRIALS;
    const avgRocks = totalRocks / TRIALS;
    const avgWood = avgTrees * 2; // yieldCount is 2 per tree in gatheringNodes.json

    console.log(`| F${f} | ${avgTrees.toFixed(2)} | ${avgBushes.toFixed(2)} | ${avgRocks.toFixed(2)} | ${avgWood.toFixed(2)} |`);
  }
}

runSim();
