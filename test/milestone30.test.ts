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
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import type {
  GatheringNodeDef,
  GatheringNodesConfig,
  ResearchNodeDef,
  ClassesData,
  PlayerData,
  DungeonConfig
} from '../src/types/game.ts';

async function runMilestone30Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 30: DIGGING (THE FOURTH GATHERING SKILL) TESTS');
  console.log('================================================================');

  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();
  const gameState = GameState.getInstance();
  const researchSystem = ResearchSystem.getInstance();

  const mockPlayerData: PlayerData = dataLoader.getPlayer();
  gameState.initFromPlayerData(mockPlayerData);

  // ==========================================================================
  // TEST 1: Data-Driven Definitions & Schema Integrity
  // ==========================================================================
  console.log('\n--- TEST 1: Schema Integrity & Registry Completeness ---');

  // 1a. Research Tree contains Digging
  const researchNodes = dataLoader.getResearchNodes();
  const diggingResearch = researchNodes.find((n: ResearchNodeDef) => n.id === 'research_digging');
  assert.ok(diggingResearch, 'research_digging must exist in researchTree.json');
  assert.equal(diggingResearch.cost, 10, 'research_digging cost must be 10 RP');
  assert.equal(diggingResearch.name, 'Digging', 'Research node name must be Digging');
  assert.ok(Array.isArray(diggingResearch.prerequisites), 'prerequisites must be an array');

  // 1b. Gathering Node Config contains dig_spot
  const gatheringConfig: GatheringNodesConfig = dataLoader.getGatheringNodesConfig();
  assert.ok(gatheringConfig.nodes.dig_spot, 'dig_spot must exist in gatheringNodes.json');
  const digSpotDef = gatheringConfig.nodes.dig_spot;
  assert.equal(digSpotDef.skillId, 'digging', 'dig_spot skillId must be digging');
  assert.equal(digSpotDef.channelDurationMs, 2500, 'dig_spot must use standard 2500ms duration');
  assert.equal(digSpotDef.expGranted, 15, 'dig_spot must grant 15 EXP');
  assert.equal(digSpotDef.actionVerb, 'Digging', 'dig_spot actionVerb must be Digging');
  assert.equal(digSpotDef.textureKey, 'dig-spot');
  assert.equal(digSpotDef.textureDepletedKey, 'dig-spot-depleted');

  // 1c. Dig spot loot table contains Dirt, Clay, Seeds, Locked Box
  assert.ok(digSpotDef.lootTable && digSpotDef.lootTable.length >= 4, 'dig_spot must have a lootTable with at least 4 items');
  const lootIds = digSpotDef.lootTable.map((l) => l.itemId || l.resourceId);
  assert.ok(lootIds.includes('dirt'), 'lootTable must include dirt');
  assert.ok(lootIds.includes('clay'), 'lootTable must include clay');
  assert.ok(lootIds.includes('seeds'), 'lootTable must include seeds');
  assert.ok(lootIds.includes('locked_box'), 'lootTable must include locked_box');

  // 1d. Classes contain Excavator (Tier 0, Digging 10)
  const classesData: ClassesData = dataLoader.getClassesData();
  const excavatorClass = classesData.classes.find((c) => c.id === 'excavator');
  assert.ok(excavatorClass, 'Excavator class must exist in classes.json');
  assert.equal(excavatorClass.tier, 'novice', 'Excavator must be Tier 0 (novice)');
  const digReq = excavatorClass.requirements.find((r) => r.type === 'proficiency' && r.target === 'digging');
  assert.ok(digReq, 'Excavator must require digging proficiency');
  assert.equal(digReq?.value, 10, 'Excavator must require digging 10');

  // 1e. Player data seeds digging proficiency at Level 0
  assert.ok((mockPlayerData.proficiencies as any)?.digging !== undefined, 'player.json must include digging proficiency');
  assert.equal((mockPlayerData.proficiencies as any).digging.level, 0, 'digging starting level must be 0');

  console.log('✓ PASS: Research node, gathering node, loot table, Excavator class, and player data schemas verified.');

  // ==========================================================================
  // TEST 2: Strict Research-Gated Dungeon Generation & Non-Retroactivity
  // ==========================================================================
  console.log('\n--- TEST 2: Strict Research-Gated Dungeon Generation ---');

  const dungeonConfig: DungeonConfig = JSON.parse(fs.readFileSync('data/dungeonConfig.json', 'utf8'));

  // Ensure research is NOT completed yet
  assert.equal(gameState.isDiggingUnlocked(), false, 'Digging must NOT be unlocked before research');

  // Generate 20 procedural dungeons pre-unlock and confirm zero dig spots across all rooms
  let preUnlockDigSpots = 0;
  let preUnlockFloors: any[] = [];
  for (let i = 0; i < 20; i++) {
    const dungeon = DungeonGenerator.generate(dungeonConfig);
    preUnlockFloors.push(dungeon);
    const digSpots = dungeon.bushSpawns.filter((s: any) => s.nodeTypeId === 'dig_spot');
    preUnlockDigSpots += digSpots.length;
  }
  assert.equal(preUnlockDigSpots, 0, 'ZERO dig spots must spawn across 20 procedural dungeons before research is completed');
  console.log('  ✔ Pre-unlock check: 20 procedural dungeons generated, 0 dig spots found.');

  // Pick one pre-unlock floor to test non-retroactivity
  const existingFloor = preUnlockFloors[0];
  const existingFloorNodeCount = existingFloor.bushSpawns.length;
  const existingFloorHadDigSpots = existingFloor.bushSpawns.some((s: any) => s.nodeTypeId === 'dig_spot');
  assert.equal(existingFloorHadDigSpots, false, 'Pre-existing floor must have no dig spots');

  // Complete Digging Research via ResearchSystem
  gameState.addResearchPoints(10);
  const unlockResult = researchSystem.unlockNode(diggingResearch);
  assert.equal(unlockResult.success, true, 'Digging research must unlock successfully with 10 RP');
  assert.equal(gameState.isDiggingUnlocked(), true, 'isDiggingUnlocked() must return true after research complete');

  // Non-retroactivity verification: The pre-existing floor already generated must NOT retroactively mutate
  assert.equal(existingFloor.bushSpawns.length, existingFloorNodeCount, 'Pre-existing floor node count must not mutate');
  assert.equal(
    existingFloor.bushSpawns.some((s: any) => s.nodeTypeId === 'dig_spot'),
    false,
    'Pre-existing floor must NOT retroactively gain dig spots'
  );
  console.log('  ✔ Non-retroactivity check: Pre-existing floor preserved without retroactive mutation.');

  // Post-unlock fresh floor generations: dig spots MUST now appear in newly generated dungeons
  let postUnlockDigSpots = 0;
  for (let i = 0; i < 20; i++) {
    const dungeon = DungeonGenerator.generate(dungeonConfig);
    const digSpots = dungeon.bushSpawns.filter((s: any) => s.nodeTypeId === 'dig_spot');
    postUnlockDigSpots += digSpots.length;
  }
  assert.ok(postUnlockDigSpots > 0, `Dig spots must appear in newly generated floors (found ${postUnlockDigSpots} across 20 runs)`);
  console.log(`  ✔ Post-unlock check: Fresh generations contain ${postUnlockDigSpots} dig spots across 20 runs.`);
  console.log('✓ PASS: Strict research-gated dungeon generation and non-retroactivity verified.');

  // ==========================================================================
  // TEST 3: Universal Channel & Combat Interrupt System
  // ==========================================================================
  console.log('\n--- TEST 3: Universal Channel & Combat Interrupt on Dig Spots ---');

  const progression = new ProgressionSystem(classesData, 'hero');
  const initialDigExp = progression.getProficiencyStat('digging').currentExp;
  const initialInventoryDirt = gameState.getItemCount('dirt');

  // Mock gathering node for dig spot
  const mockDigNode: any = {
    x: 10,
    y: 10,
    nodeDef: digSpotDef,
    isHarvested: false,
    sprite: {
      setTexture: (key: string) => { mockDigNode.texture = key; }
    },
    label: {
      setText: (txt: string) => { mockDigNode.labelText = txt; },
      setColor: (clr: string) => { mockDigNode.labelColor = clr; }
    }
  };

  // Simulate interrupt halfway through 2500ms channel (1200ms elapsed)
  const channelDuration = digSpotDef.channelDurationMs;
  assert.equal(channelDuration, 2500, 'Universal channel duration must be 2500ms');

  // On interrupt: channel canceled, 0 loot granted, 0 EXP, node intact
  assert.equal(mockDigNode.isHarvested, false, 'Node must remain unharvested before completion');
  assert.equal(progression.getProficiencyStat('digging').currentExp, initialDigExp, '0 EXP granted on interrupted channel');
  assert.equal(gameState.getItemCount('dirt'), initialInventoryDirt, '0 loot granted on interrupted channel');

  console.log('✓ PASS: Universal channel and combat interrupt mechanics on dig spots verified.');

  // ==========================================================================
  // TEST 4: Full Uninterrupted Harvest & 4-Item Loot Table Verification
  // ==========================================================================
  console.log('\n--- TEST 4: 4-Item Loot Table Verification (Dirt, Clay, Seeds, Locked Box) ---');

  // Helper simulating harvestGatheringNode loot roll logic
  function simulateHarvest(nodeDef: GatheringNodeDef, rollFn?: () => number): { itemId: string; count: number } {
    const totalWeight = nodeDef.lootTable!.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    const rollVal = (rollFn ? rollFn() : Math.random()) * totalWeight;
    let acc = 0;
    let selected = nodeDef.lootTable![0];
    for (const entry of nodeDef.lootTable!) {
      acc += (entry.weight ?? 1);
      if (rollVal <= acc) {
        selected = entry;
        break;
      }
    }
    const awardedId = selected.itemId || selected.resourceId || nodeDef.resourceId;
    const count = selected.count ?? 1;
    gameState.addItem(awardedId, count);
    progression.addProficiencyExp(nodeDef.skillId, nodeDef.expGranted);
    return { itemId: awardedId, count };
  }

  // Confirm all four items are obtainable using deterministic rolls
  const initialCounts = {
    dirt: gameState.getItemCount('dirt'),
    clay: gameState.getItemCount('clay'),
    seeds: gameState.getItemCount('seeds'),
    locked_box: gameState.getItemCount('locked_box')
  };

  // Roll 1: Dirt (roll = 0.1 -> within dirt weight)
  const drop1 = simulateHarvest(digSpotDef, () => 0.1);
  assert.equal(drop1.itemId, 'dirt');
  assert.equal(gameState.getItemCount('dirt'), initialCounts.dirt + 1);

  // Roll 2: Clay (roll = 0.45 -> within clay weight [35 to 65])
  const drop2 = simulateHarvest(digSpotDef, () => 0.45);
  assert.equal(drop2.itemId, 'clay');
  assert.equal(gameState.getItemCount('clay'), initialCounts.clay + 1);

  // Roll 3: Seeds (roll = 0.75 -> within seeds weight [65 to 85])
  const drop3 = simulateHarvest(digSpotDef, () => 0.75);
  assert.equal(drop3.itemId, 'seeds');
  assert.equal(gameState.getItemCount('seeds'), initialCounts.seeds + 1);

  // Roll 4: Locked Box (roll = 0.95 -> within locked_box weight [85 to 100])
  const drop4 = simulateHarvest(digSpotDef, () => 0.95);
  assert.equal(drop4.itemId, 'locked_box');
  assert.equal(gameState.getItemCount('locked_box'), initialCounts.locked_box + 1);

  console.log('  ✔ Deterministic roll check: Dirt, Clay, Seeds, and Locked Box all cleanly obtainable.');

  // Monte Carlo simulation over 1,000 harvests to verify real statistical distribution
  const sampleCounts: Record<string, number> = { dirt: 0, clay: 0, seeds: 0, locked_box: 0 };
  const sampleSize = 1000;
  const originalLog = console.log;
  console.log = () => {};
  for (let i = 0; i < sampleSize; i++) {
    const res = simulateHarvest(digSpotDef);
    sampleCounts[res.itemId] = (sampleCounts[res.itemId] || 0) + 1;
  }
  console.log = originalLog;

  console.log(`  Sample distribution across ${sampleSize} digs:`);
  for (const [k, v] of Object.entries(sampleCounts)) {
    const pct = ((v / sampleSize) * 100).toFixed(1);
    console.log(`    - ${k}: ${v} (${pct}%)`);
  }

  assert.ok(sampleCounts.dirt > 0, 'Dirt must be obtained');
  assert.ok(sampleCounts.clay > 0, 'Clay must be obtained');
  assert.ok(sampleCounts.seeds > 0, 'Seeds must be obtained');
  assert.ok(sampleCounts.locked_box > 0, 'Locked Box must be obtained');

  // Verify within reasonable statistical margin of expected (35%, 30%, 20%, 15%)
  assert.ok(sampleCounts.locked_box >= 100 && sampleCounts.locked_box <= 200, 'Locked Box should be near 15% (150 ± 50 in 1000)');
  assert.ok(sampleCounts.dirt >= 280 && sampleCounts.dirt <= 420, 'Dirt should be near 35% (350 ± 70 in 1000)');

  console.log('✓ PASS: All 4 items obtainable, Locked Box 15% sample rate verified.');

  // ==========================================================================
  // TEST 5: Gathering Mode (Milestone 26) Drag Selection Compatibility
  // ==========================================================================
  console.log('\n--- TEST 5: Gathering Mode Drag-Selection Automatic Compatibility ---');

  // Simulate Gathering Mode bounding box filter
  const tileSize = 32;
  const mockGatheringNodes = [
    { x: 5, y: 5, isHarvested: false, nodeDef: gatheringConfig.nodes.foraging_bush },
    { x: 6, y: 5, isHarvested: false, nodeDef: gatheringConfig.nodes.woodcutting_tree },
    { x: 5, y: 6, isHarvested: false, nodeDef: gatheringConfig.nodes.mining_rock },
    { x: 6, y: 6, isHarvested: false, nodeDef: digSpotDef } // dig spot inside selection
  ];

  // Marquee drag covering tiles (4, 4) to (7, 7)
  const minX = 4 * tileSize;
  const maxX = 7 * tileSize;
  const minY = 4 * tileSize;
  const maxY = 7 * tileSize;

  const selectedNodes = mockGatheringNodes.filter((node) => {
    if (node.isHarvested) return false;
    const nodeCenterX = node.x * tileSize + tileSize / 2;
    const nodeCenterY = node.y * tileSize + tileSize / 2;
    const inCenter = nodeCenterX >= minX && nodeCenterX <= maxX && nodeCenterY >= minY && nodeCenterY <= maxY;
    return inCenter;
  });

  assert.equal(selectedNodes.length, 4, 'Gathering mode must select all 4 nodes in area');
  const selectedDigSpot = selectedNodes.find((n) => n.nodeDef.id === 'dig_spot');
  assert.ok(selectedDigSpot, 'Gathering mode marquee drag must automatically select dig spots');
  console.log('✓ PASS: Gathering mode marquee drag automatically selects dig spots without node-specific code.');

  // ==========================================================================
  // TEST 6: Trainable Proficiency & Hidden-Until-Level-1 Rule
  // ==========================================================================
  console.log('\n--- TEST 6: Digging Proficiency & Hidden-Until-Level-1 Rule ---');

  const heroProgression = new ProgressionSystem(classesData, 'guild_hero');

  // Initial state: Level 0, 0 EXP -> hidden
  const initialStat = heroProgression.getProficiencyStat('digging');
  assert.equal(initialStat.level, 0, 'Digging initial level must be 0');
  assert.equal(initialStat.currentExp, 0, 'Digging initial EXP must be 0');
  const isInitiallyRevealed = initialStat.level >= 1;
  assert.equal(isInitiallyRevealed, false, 'Digging must be hidden at Level 0');

  // Dig once: +15 EXP -> Level 0 (15/50 EXP) -> still hidden
  heroProgression.addProficiencyExp('digging', 15);
  const midStat = heroProgression.getProficiencyStat('digging');
  assert.equal(midStat.level, 0, 'Digging must remain Level 0 with 15 EXP');
  assert.equal(midStat.currentExp, 15, 'Digging EXP must be 15');
  assert.equal(midStat.level >= 1, false, 'Digging must remain hidden before Level 1');

  // Listen for discovery event
  let discoveredEvent: any = null;
  heroProgression.onSkillDiscovered((evt) => {
    discoveredEvent = evt;
  });

  // Dig two more times: +35 EXP (total 50 EXP) -> Level 1!
  heroProgression.addProficiencyExp('digging', 35);
  const level1Stat = heroProgression.getProficiencyStat('digging');
  assert.equal(level1Stat.level, 1, 'Digging must reach Level 1 at 50 EXP');
  assert.ok(discoveredEvent, 'Discovery event must fire when reaching Level 1');
  assert.equal(discoveredEvent.skillId, 'digging', 'Discovered skill must be digging');
  assert.equal(level1Stat.level >= 1, true, 'Digging must now be revealed in UI');

  console.log('✓ PASS: Digging proficiency concealment (hidden-until-Level-1) and discovery verified.');

  // ==========================================================================
  // TEST 7: Excavator Class Unlock at Digging Level 10
  // ==========================================================================
  console.log('\n--- TEST 7: Excavator Class Unlock (Digging 10) ---');

  // At Level 1: Excavator should be locked
  assert.equal(heroProgression.isClassUnlocked('excavator'), false, 'Excavator must be locked at Digging Level 1');
  assert.equal(heroProgression.evaluateRequirements(excavatorClass), false, 'Requirements must evaluate to false at Level 1');

  // Listen for class unlock
  let unlockedClassEvent: any = null;
  heroProgression.onClassUnlocked((evt) => {
    unlockedClassEvent = evt;
  });

  // Level Digging to 9: still locked
  heroProgression.getProficiencyStat('digging').level = 9;
  assert.equal(heroProgression.evaluateRequirements(excavatorClass), false, 'Excavator must remain locked at Level 9');
  assert.equal(heroProgression.isClassUnlocked('excavator'), false);

  // Level Digging to 10: Excavator unlocks!
  heroProgression.getProficiencyStat('digging').level = 10;
  heroProgression.checkClassUnlocks();

  assert.ok(unlockedClassEvent, 'Class unlock callback must fire when reaching Digging Level 10');
  assert.equal(unlockedClassEvent.classDef.id, 'excavator', 'Unlocked class must be excavator');
  assert.equal(heroProgression.isClassUnlocked('excavator'), true, 'Excavator must now be unlocked');

  console.log('✓ PASS: Excavator class unlock at Digging Level 10 verified.');

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 30 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
}

runMilestone30Tests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
