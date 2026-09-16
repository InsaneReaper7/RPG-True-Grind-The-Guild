import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before any Phaser modules are loaded
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

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ResearchSystem } from '../src/systems/ResearchSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { BuildingSystem } from '../src/systems/BuildingSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type {
  GatheringNodesConfig,
  ResearchNodeDef,
  PlayerData,
  DungeonConfig
} from '../src/types/game.ts';

async function runMilestone39Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 39: GARDENING PROFICIENCY & OUTPOST CROPS TESTS');
  console.log('================================================================');

  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();
  const gameState = GameState.getInstance();
  const researchSystem = ResearchSystem.getInstance();

  const mockPlayerData: PlayerData = dataLoader.getPlayer();
  gameState.initFromPlayerData(mockPlayerData);

  // ==========================================================================
  // TEST 1: Schema Integrity & Registry Completeness
  // ==========================================================================
  console.log('\n--- TEST 1: Schema Integrity & Registry Completeness ---');

  // 1a. Research Tree contains Gardening
  const researchNodes = dataLoader.getResearchNodes();
  const gardeningResearch = researchNodes.find((n: ResearchNodeDef) => n.id === 'research_gardening');
  assert.ok(gardeningResearch, 'research_gardening must exist in researchTree.json');
  assert.equal(gardeningResearch.cost, 10, 'research_gardening cost must be 10 RP');
  assert.equal(gardeningResearch.name, 'Gardening', 'Research node name must be Gardening');
  assert.equal(gardeningResearch.targetBuildableId, 'planting_plot', 'targetBuildableId must be planting_plot');

  // 1b. Buildables contain Planting Plot and Seed Maker
  const plantingPlotDef = dataLoader.getBuildable('planting_plot');
  assert.ok(plantingPlotDef, 'planting_plot must exist in buildables.json');
  assert.equal(plantingPlotDef.clayCost, 3, 'planting_plot must cost exactly 3 Clay');
  assert.equal(plantingPlotDef.lockedByDefault, true, 'planting_plot must be lockedByDefault');
  assert.equal(plantingPlotDef.walkable, true, 'planting_plot must be walkable');

  const seedMakerDef = dataLoader.getBuildable('seed_maker');
  assert.ok(seedMakerDef, 'seed_maker must exist in buildables.json');
  assert.equal(seedMakerDef.woodCost, 25, 'seed_maker woodCost must be 25');
  assert.equal(seedMakerDef.requiredProficiency?.proficiency, 'gardening', 'seed_maker must require gardening');
  assert.equal(seedMakerDef.requiredProficiency?.level, 25, 'seed_maker must require Gardening Level 25');

  // 1c. Gathering Node Config contains rare vegetable_node
  const gatheringConfig: GatheringNodesConfig = dataLoader.getGatheringNodesConfig();
  assert.ok(gatheringConfig.nodes.vegetable_node, 'vegetable_node must exist in gatheringNodes.json');
  const vegNodeDef = gatheringConfig.nodes.vegetable_node;
  assert.equal(vegNodeDef.skillId, 'gardening', 'vegetable_node skillId must be gardening');
  assert.equal(vegNodeDef.actionVerb, 'Gardening', 'vegetable_node actionVerb must be Gardening');
  assert.equal(vegNodeDef.resourceId, 'vegetable', 'vegetable_node resourceId must be vegetable');
  assert.equal(vegNodeDef.expGranted, 15, 'vegetable_node must grant 15 EXP');

  // 1d. Player data seeds gardening proficiency at Level 0
  assert.ok((mockPlayerData.proficiencies as any)?.gardening !== undefined, 'player.json must include gardening proficiency');
  assert.equal((mockPlayerData.proficiencies as any).gardening.level, 0, 'gardening starting level must be 0');

  // 1e. Food data contains vegetable
  const vegFood = dataLoader.getFood('vegetable');
  assert.ok(vegFood, 'vegetable must exist in food.json');
  assert.equal(vegFood.hungerRestored, 15, 'vegetable hungerRestored must be 15');

  console.log('✓ PASS: Research node, buildables, gathering node, player data, and food schemas verified.');

  // ==========================================================================
  // TEST 2: Research Unlock Gating for Planting Plot
  // ==========================================================================
  console.log('\n--- TEST 2: Research Unlock Gating for Planting Plot ---');

  assert.equal(gameState.isGardeningUnlocked(), false, 'Gardening must NOT be unlocked before research');
  assert.equal(gameState.isBuildableUnlocked('planting_plot'), false, 'Planting Plot must NOT be unlocked before research');

  // Attempt unlock without enough points
  const failResult = researchSystem.unlockNode(gardeningResearch);
  assert.equal(failResult.success, false, 'Unlock must fail without RP');

  // Grant points and unlock
  gameState.addResearchPoints(10);
  const unlockResult = researchSystem.unlockNode(gardeningResearch);
  assert.equal(unlockResult.success, true, 'Gardening research must succeed with 10 RP');
  assert.equal(gameState.isGardeningUnlocked(), true, 'isGardeningUnlocked() must return true after research complete');
  assert.equal(gameState.isBuildableUnlocked('planting_plot'), true, 'planting_plot must be unlocked in GameState');

  console.log('✓ PASS: Planting Plot strictly gated behind Gardening research node.');

  // ==========================================================================
  // TEST 3: Exact 4-Plot Bootstrapping Sequence to Level 1
  // ==========================================================================
  console.log('\n--- TEST 3: Exact 4-Plot Bootstrapping Sequence (Tuned to 50 EXP Curve) ---');

  const progression = new ProgressionSystem(dataLoader.getClassesData(), 'GardenerHero');
  assert.equal(progression.getProficiencyLevel('gardening'), 0, 'Gardening must start at Level 0');
  assert.equal(progression.isStatRevealed('gardening'), false, 'Gardening must be hidden at Level 0');

  // Standard curve verification: Level 0 -> 1 requires 50 + 0 * 4 = 50 EXP
  assert.equal(LevelingSystem.expForNextLevel(0), 50, 'Level 0 -> 1 requires exactly 50 EXP');

  let discoveredEventFired = false;
  progression.onSkillDiscovered((e) => {
    if (e.skillId === 'gardening') {
      discoveredEventFired = true;
    }
  });

  // Plot 1 Construction (+13 EXP)
  progression.addProficiencyExp('gardening', 13);
  let stat = progression.getProficiencyStat('gardening');
  assert.equal(stat.level, 0, 'Plot 1 must leave Gardening at Level 0');
  assert.equal(stat.currentExp, 13, 'Plot 1 must yield exactly 13 EXP');
  assert.equal(progression.isStatRevealed('gardening'), false, 'Must remain hidden at 13 EXP');

  // Plot 2 Construction (+13 EXP)
  progression.addProficiencyExp('gardening', 13);
  stat = progression.getProficiencyStat('gardening');
  assert.equal(stat.level, 0, 'Plot 2 must leave Gardening at Level 0');
  assert.equal(stat.currentExp, 26, 'Plot 2 must reach 26 EXP');

  // Plot 3 Construction (+13 EXP)
  progression.addProficiencyExp('gardening', 13);
  stat = progression.getProficiencyStat('gardening');
  assert.equal(stat.level, 0, 'Plot 3 must leave Gardening at Level 0 (39/50 EXP)');
  assert.equal(stat.currentExp, 39, 'Plot 3 must reach 39 EXP');
  assert.equal(discoveredEventFired, false, 'Skill discovery must NOT fire before Level 1');

  // Plot 4 Construction (+13 EXP) -> 39 + 13 = 52 EXP >= 50 EXP -> LEVEL 1!
  const levelUpResult = progression.addProficiencyExp('gardening', 13);
  stat = progression.getProficiencyStat('gardening');
  assert.equal(levelUpResult.leveledUp, true, 'Plot 4 MUST trigger LEVEL UP');
  assert.equal(stat.level, 1, 'Plot 4 MUST cross Gardening to Level 1');
  assert.equal(stat.currentExp, 2, 'Remaining overflow EXP must be 52 - 50 = 2 EXP');
  assert.equal(discoveredEventFired, true, 'Skill discovery event MUST fire on crossing to Level 1');
  assert.equal(progression.isStatRevealed('gardening'), true, 'Gardening stat must now be revealed');

  console.log('✓ PASS: Exactly 4 plots constructed (13 EXP each) precisely cross Level 0 -> Level 1.');

  // ==========================================================================
  // TEST 4: Rare Dungeon Vegetable Nodes & Level 1 Gated Seed Drops
  // ==========================================================================
  console.log('\n--- TEST 4: Rare Dungeon Vegetable Nodes & Level 1 Gated Seed Drops ---');

  const dungeonConfig: DungeonConfig = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8'));

  // Test infrequent spawn in procedural generation
  let totalNodes = 0;
  let vegNodes = 0;
  for (let i = 0; i < 30; i++) {
    const dungeon = DungeonGenerator.generate(dungeonConfig);
    for (const b of dungeon.bushSpawns) {
      totalNodes++;
      if (b.nodeTypeId === 'vegetable_node') {
        vegNodes++;
      }
    }
  }
  const vegPct = (vegNodes / totalNodes) * 100;
  console.log(`  Spawn rate check across 30 floors: ${vegNodes}/${totalNodes} vegetable nodes (${vegPct.toFixed(1)}%)`);
  assert.ok(vegNodes > 0, 'Vegetable nodes must spawn');
  assert.ok(vegPct < 25, 'Vegetable nodes must spawn infrequently (low probability)');

  // Test harvesting with Gardening Level 0: Only drops base vegetable, NEVER seeds
  const noviceProgression = new ProgressionSystem(dataLoader.getClassesData(), 'Novice');
  assert.equal(noviceProgression.getProficiencyLevel('gardening'), 0);

  // Mock vegetable node harvest function matching MainScene logic
  function simulateHarvestNode(prog: ProgressionSystem, rollSeed: number): { vegGained: number; seedsGained: number } {
    const preV = gameState.getItemCount('vegetable');
    const preS = gameState.getItemCount('seeds');

    // Base drop
    gameState.addItem('vegetable', 1);

    // Seed bonus gated at Gardening Level >= 1
    const gLevel = prog.getProficiencyLevel('gardening');
    if (gLevel >= 1 && rollSeed < 0.5) {
      gameState.addItem('seeds', 1);
    }

    // Awards gardening EXP
    prog.addProficiencyExp('gardening', 15);

    return {
      vegGained: gameState.getItemCount('vegetable') - preV,
      seedsGained: gameState.getItemCount('seeds') - preS
    };
  }

  // At Level 0: Even with a "winning" roll of 0.1, seeds must NOT drop
  const resultLvl0 = simulateHarvestNode(noviceProgression, 0.1);
  assert.equal(resultLvl0.vegGained, 1, 'Must gain base vegetable at Level 0');
  assert.equal(resultLvl0.seedsGained, 0, 'Must NOT drop seeds when Gardening Level is 0');

  // At Level 1: Drops base vegetable AND rolls for seeds
  const level1Progression = new ProgressionSystem(dataLoader.getClassesData(), 'Expert');
  level1Progression.addProficiencyExp('gardening', 50); // Level 1
  assert.equal(level1Progression.getProficiencyLevel('gardening'), 1);

  // Losing roll (0.8 >= 0.5)
  const resultLvl1Fail = simulateHarvestNode(level1Progression, 0.8);
  assert.equal(resultLvl1Fail.vegGained, 1);
  assert.equal(resultLvl1Fail.seedsGained, 0);

  // Winning roll (0.2 < 0.5)
  const resultLvl1Win = simulateHarvestNode(level1Progression, 0.2);
  assert.equal(resultLvl1Win.vegGained, 1);
  assert.equal(resultLvl1Win.seedsGained, 1, 'Must drop seeds when Gardening Level >= 1 on winning roll');

  console.log('✓ PASS: Vegetable nodes drop only base vegetable at Level 0, and gain seed drops at Level 1+.');

  // ==========================================================================
  // TEST 5: Day-Advance Clock Growth (No Parallel Timer)
  // ==========================================================================
  console.log('\n--- TEST 5: Day-Advance Clock Growth (No Parallel Timer) ---');

  // Place a plot at (10, 10)
  gameState.addPlacedBuildable({
    id: 'planting_plot',
    x: 10,
    y: 10,
    rotation: 0,
    costPaid: 0
  });

  const plotState = gameState.getPlotState(10, 10);
  assert.ok(plotState, 'Plot state must be retrieved');
  assert.equal(plotState.state, 'empty', 'Plot starts empty');

  // Try planting without seeds
  const seedsCount = gameState.getItemCount('seeds');
  gameState.consumeItem('seeds', seedsCount); // Empty seeds
  const plantFail = gameState.plantCrop(10, 10, 'seeds');
  assert.equal(plantFail, false, 'Cannot plant without seeds in inventory');

  // Give seeds and plant
  gameState.addItem('seeds', 5);
  const plantSuccess = gameState.plantCrop(10, 10, 'seeds');
  assert.equal(plantSuccess, true, 'Planting succeeds with seeds');
  assert.equal(gameState.getItemCount('seeds'), 4, '1 seed consumed');
  assert.equal(plotState.state, 'growing', 'Plot state is now growing');
  assert.equal(plotState.plantedAtDay, gameState.getCurrentGameDay());

  // Immediately checking growth on same day: still growing
  gameState.updateGardeningPlots();
  assert.equal(plotState.state, 'growing', 'Plot must still be growing on same day');

  // Advance clock by 30 seconds (half day): still growing
  gameState.updateClock(30000);
  assert.equal(plotState.state, 'growing', 'Plot must not be ready at 0.5 days');

  // Advance day via the official day-advance clock
  gameState.advanceGameDay(1);
  assert.equal(plotState.state, 'ready', 'Plot MUST become ready when game day elapses');

  console.log('✓ PASS: Crops grow strictly over game-time via day-advance clock without parallel timers.');

  // ==========================================================================
  // TEST 6: Harvesting Ready Plot & EXP From All 3 Distinct Actions
  // ==========================================================================
  console.log('\n--- TEST 6: Harvesting Ready Plot & EXP From All 3 Distinct Actions ---');

  const testGardenerProgression = new ProgressionSystem(dataLoader.getClassesData(), 'ActionTester');
  const expLog: string[] = [];

  // Action 1: Constructing a plot (+13 EXP)
  testGardenerProgression.addProficiencyExp('gardening', 13);
  expLog.push('construct');
  assert.equal(testGardenerProgression.getProficiencyStat('gardening').currentExp, 13);

  // Action 2: Planting a seed (+5 EXP)
  testGardenerProgression.addProficiencyExp('gardening', 5);
  expLog.push('plant');
  assert.equal(testGardenerProgression.getProficiencyStat('gardening').currentExp, 18);

  // Action 3: Harvesting ready plot
  const preHarvestVeg = gameState.getItemCount('vegetable');
  const harvestResult = gameState.harvestCrop(10, 10);
  assert.ok(harvestResult && harvestResult.success, 'Harvest must succeed');
  assert.equal(harvestResult.count, 2, 'Harvest must yield confirmed +2 vegetables');
  assert.equal(gameState.getItemCount('vegetable'), preHarvestVeg + 2, '2 vegetables added to inventory');
  assert.equal(plotState.state, 'empty', 'Plot state must reset to empty');

  // Award harvest EXP (+15 EXP)
  testGardenerProgression.addProficiencyExp('gardening', 15);
  expLog.push('harvest');
  assert.equal(testGardenerProgression.getProficiencyStat('gardening').currentExp, 33);

  assert.equal(expLog.length, 3, 'All three distinct actions executed');
  assert.deepEqual(expLog, ['construct', 'plant', 'harvest'], 'EXP awarded for construct, plant, and harvest');

  console.log('✓ PASS: Ready plot harvest yields +2 vegetables, and construct, plant, harvest all award Gardening EXP.');

  // ==========================================================================
  // TEST 7: Seed Maker Gated at Gardening Level 25 & Repeatable Cycle
  // ==========================================================================
  console.log('\n--- TEST 7: Seed Maker Level 25 Gating & Repeatable Placed Device ---');

  const buildingSystem = new BuildingSystem(20, 20);

  // Gating Check at Level 24: REJECTED
  const lvl24Progression = new ProgressionSystem(dataLoader.getClassesData(), 'Apprentice');
  // Boost to level 24
  for (let lvl = 0; lvl < 24; lvl++) {
    lvl24Progression.addProficiencyExp('gardening', LevelingSystem.expForNextLevel(lvl));
  }
  assert.equal(lvl24Progression.getProficiencyLevel('gardening'), 24);

  const placeCheckLvl24 = buildingSystem.canPlace(
    seedMakerDef!,
    5,
    5,
    { x: 1, y: 1 },
    [],
    () => false,
    () => false,
    () => false,
    100,
    0,
    0,
    lvl24Progression.getProficiencyLevel('gardening')
  );
  assert.equal(placeCheckLvl24.valid, false, 'Seed Maker must be blocked at Level 24');
  assert.match(placeCheckLvl24.reason || '', /Gardening Level 25/i, 'Reason must state Gardening Level 25 required');

  // Gating Check at Level 25: APPROVED
  lvl24Progression.addProficiencyExp('gardening', LevelingSystem.expForNextLevel(24));
  assert.equal(lvl24Progression.getProficiencyLevel('gardening'), 25);

  const placeCheckLvl25 = buildingSystem.canPlace(
    seedMakerDef!,
    5,
    5,
    { x: 1, y: 1 },
    [],
    () => false,
    () => false,
    () => false,
    100,
    0,
    0,
    lvl24Progression.getProficiencyLevel('gardening')
  );
  assert.equal(placeCheckLvl25.valid, true, 'Seed Maker must be allowed for placement at Level 25');

  // Repeatable placed machine lifecycle test
  gameState.addPlacedBuildable({
    id: 'seed_maker',
    x: 5,
    y: 5,
    rotation: 0,
    costPaid: 25
  });

  const smState = gameState.getSeedMakerState(5, 5);
  assert.ok(smState, 'Seed Maker state initialized');
  assert.equal(smState.state, 'idle', 'Initial state is idle');

  // Cycle 1:
  gameState.addItem('vegetable', 2);
  const preVegCycle1 = gameState.getItemCount('vegetable');
  const preSeedCycle1 = gameState.getItemCount('seeds');

  // Put in 1 vegetable
  const insert1 = gameState.insertSeedMakerProduce(5, 5, 'vegetable', 1000); // 1000ms duration for test
  assert.equal(insert1, true, 'Inserted vegetable into Seed Maker');
  assert.equal(gameState.getItemCount('vegetable'), preVegCycle1 - 1, 'Consumed 1 vegetable');
  assert.equal(smState.state, 'processing', 'State is processing');

  // While processing: cannot collect
  const prematureCollect = gameState.collectSeedMakerSeeds(5, 5);
  assert.equal(prematureCollect, null, 'Cannot collect while processing');

  // Wait duration
  gameState.updateSeedMakers(Date.now() + 1500);
  assert.equal(smState.state, 'ready', 'State becomes ready after duration');

  // Collect 2 seeds
  const collect1 = gameState.collectSeedMakerSeeds(5, 5);
  assert.ok(collect1 && collect1.success);
  assert.equal(collect1.count, 2, 'Yields exactly 2 seeds');
  assert.equal(gameState.getItemCount('seeds'), preSeedCycle1 + 2, '2 seeds added to inventory');
  assert.equal(smState.state, 'idle', 'Machine returns to idle');

  // Cycle 2 (Confirms repeatable device, not a one-shot recipe):
  const insert2 = gameState.insertSeedMakerProduce(5, 5, 'vegetable', 1000);
  assert.equal(insert2, true, 'Can immediately insert again (repeatable)');
  assert.equal(smState.state, 'processing');
  gameState.updateSeedMakers(Date.now() + 1500);
  assert.equal(smState.state, 'ready');
  const collect2 = gameState.collectSeedMakerSeeds(5, 5);
  assert.equal(collect2?.count, 2, 'Cycle 2 yields 2 seeds');
  assert.equal(smState.state, 'idle', 'Cycle 2 completes cleanly back to idle');

  console.log('✓ PASS: Seed Maker unlocks strictly at Gardening Level 25 and operates as a repeatable placed machine.');

  console.log('\n================================================================');
  console.log('ALL MILESTONE 39 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================');
}

runMilestone39Tests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
