import fs from 'node:fs';
import { DungeonGenerator } from '../src/utils/DungeonGenerator';

const dungeonConfig = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8'));

console.log('Testing 20 Generated First Floors (Seeds 1 to 20):');
console.log('='.repeat(65));
console.log('Seed'.padEnd(8) + '| Total Nodes'.padEnd(14) + '| Rock Veins'.padEnd(14) + '| Trees'.padEnd(10) + '| Bushes');
console.log('-'.repeat(65));

let totalRockVeins = 0;
let totalNodesAll = 0;
const perSeedData = [];

for (let seed = 1; seed <= 20; seed++) {
  const rng = DungeonGenerator.createRng(seed);
  const dungeon = DungeonGenerator.generate(dungeonConfig, rng, {
    floorNumber: 1,
    currentFloorSeed: seed,
    seed,
    isDiggingUnlocked: false
  });

  const rocks = dungeon.bushSpawns.filter(b => b.nodeTypeId === 'mining_rock').length;
  const trees = dungeon.bushSpawns.filter(b => b.nodeTypeId === 'woodcutting_tree').length;
  const bushes = dungeon.bushSpawns.filter(b => b.nodeTypeId === 'foraging_bush').length;
  const total = dungeon.bushSpawns.length;

  totalRockVeins += rocks;
  totalNodesAll += total;
  perSeedData.push({ seed, total, rocks, trees, bushes });

  console.log(
    `Seed ${seed}`.padEnd(8) +
    `| ${total}`.padEnd(14) +
    `| ${rocks}`.padEnd(14) +
    `| ${trees}`.padEnd(10) +
    `| ${bushes}`
  );
}

console.log('='.repeat(65));
console.log(`Summary over 20 floors:`);
console.log(`Total Rock Veins: ${totalRockVeins}`);
console.log(`Average Rock Veins per floor: ${(totalRockVeins / 20).toFixed(2)}`);
console.log(`Average Ore per fully cleared floor (1 ore/vein at 100%): ${(totalRockVeins / 20).toFixed(2)} Ore`);
console.log(`Average Total Gathering Nodes per floor: ${(totalNodesAll / 20).toFixed(2)}`);
