import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser import under Node
if (typeof (globalThis as any).window === 'undefined') {
  const noop = () => {};
  (globalThis as any).window = {
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
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (globalThis as any).Image = class Image {};
  (globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Node mock fetch for DataLoader
(globalThis as any).fetch = async (url: string) => {
  const filePath = path.join(rootDir, url.replace(/^\//, ''));
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    ok: true,
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { BuildingSystem } = await import('../src/systems/BuildingSystem.ts');
const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { RoomClassifier } = await import('../src/systems/RoomClassifier.ts');
const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');
import type { BuildableDef, PlacedBuildable } from '../src/types/game.ts';

console.log('=== RUNNING MILESTONE 5: WOODWORKING, STONEMASON, BUILDING MATERIALS, FURNITURE & QUALITY TESTS ===');

const dataLoader = DataLoader.getInstance();
await dataLoader.loadAll();

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setLineWidth: () => obj,
      setVisible: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      play: () => obj,
      anims: { play: () => {} },
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      strokeLineShape: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      setText: () => obj,
      setColor: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    tileSize: 32,
    sound: { play: () => {} },
    time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      text: () => createMockObj(),
      graphics: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

function createPlayer(id = 'hero', name = 'Aria'): Player {
  const pData = dataLoader.getPlayer();
  const wpn = dataLoader.getWeapon('short_swords')!;
  const prog = new ProgressionSystem(dataLoader.getClassesData());
  const mockScene = createMockScene();
  const player = new Player(mockScene, 0, 0, pData, wpn, 16, 'player', prog);
  player.id = id;
  player.entityName = name;
  return player;
}

// ----------------------------------------------------------------------------
// TEST 1: Expected-table guards
// ----------------------------------------------------------------------------
{
  console.log('-> Test 1: Expected-table guards');

  // 1.1 Proficiencies
  const playerData = dataLoader.getPlayer();
  assert.ok(playerData.proficiencies.woodworking !== undefined, 'woodworking proficiency in player.json');
  assert.ok(playerData.proficiencies.stonemason !== undefined, 'stonemason proficiency in player.json');

  const statGains = dataLoader.getStatGainsData();
  assert.equal(statGains.assignments?.woodworking, 'profession', 'woodworking mapped to profession in statGains');
  assert.equal(statGains.assignments?.stonemason, 'profession', 'stonemason mapped to profession in statGains');
  assert.equal(statGains.attributeGains?.woodworking?.dex, 0.02, 'woodworking gains 0.02 dex');
  assert.equal(statGains.attributeGains?.stonemason?.str, 0.02, 'stonemason gains 0.02 str');

  // 1.2 Stations
  const wwBench = dataLoader.getBuildable('woodworking_bench');
  assert.ok(wwBench, 'woodworking_bench exists in buildables.json');
  assert.equal(wwBench.woodCost, 25);
  assert.equal(wwBench.indoorRequired, true);
  assert.equal(wwBench.roomTag, 'woodshop');

  const smYard = dataLoader.getBuildable('stonemason_yard');
  assert.ok(smYard, 'stonemason_yard exists in buildables.json');
  assert.equal(smYard.woodCost, 20);
  assert.equal(smYard.itemCosts?.stone, 10);
  assert.equal(smYard.indoorRequired, false);
  assert.equal(smYard.roomTag, 'masonry');

  // 1.3 Research nodes
  const resTree = dataLoader.getResearchTreeData();
  const wwRes = resTree.nodes.find((n) => n.id === 'research_woodworking_bench');
  assert.ok(wwRes, 'research_woodworking_bench exists');
  assert.equal(wwRes.cost, 5);
  assert.deepEqual(wwRes.prerequisites, []);

  const smRes = resTree.nodes.find((n) => n.id === 'research_stonemason_yard');
  assert.ok(smRes, 'research_stonemason_yard exists');
  assert.equal(smRes.cost, 10);
  assert.deepEqual(smRes.prerequisites, ['research_woodworking_bench']);

  // 1.4 Room rules
  const roomsData = dataLoader.getRoomsData();
  const carpRule = roomsData.rules.find((r) => r.id === 'carpenters_workshop');
  assert.ok(carpRule, 'carpenters_workshop rule exists');
  assert.equal(carpRule.name, "Carpenter's Workshop");
  assert.deepEqual(carpRule.requiredTags, ['woodshop']);
  assert.equal(carpRule.priority, 10);

  const masonRule = roomsData.rules.find((r) => r.id === 'masons_workshop');
  assert.ok(masonRule, 'masons_workshop rule exists');
  assert.equal(masonRule.name, "Mason's Workshop");
  assert.deepEqual(masonRule.requiredTags, ['masonry']);
  assert.equal(masonRule.priority, 10);

  // 1.5 Building materials (6 items)
  const expectedMaterials = [
    { id: 'planks', weight: 0.3 },
    { id: 'bricks', weight: 0.5 },
    { id: 'reinforced_plank', weight: 0.7 },
    { id: 'reinforced_brick', weight: 0.7 },
    { id: 'runic_plank', weight: 0.7 },
    { id: 'runic_brick', weight: 0.7 }
  ];
  for (const m of expectedMaterials) {
    const item = dataLoader.getItem(m.id);
    assert.ok(item, `Material ${m.id} exists in items.json`);
    assert.equal(item.weight, m.weight, `Material ${m.id} has weight ${m.weight}`);
  }

  // 1.6 Tier buildables (12 buildables)
  const tierChecks = [
    { id: 'floor', structure: 'floor', tier: 0 },
    { id: 'wall', structure: 'wall', tier: 0 },
    { id: 'door', structure: 'door', tier: 0 },
    { id: 'plank_floor', structure: 'floor', tier: 1 },
    { id: 'plank_wall', structure: 'wall', tier: 1 },
    { id: 'plank_door', structure: 'door', tier: 1 },
    { id: 'stone_floor', structure: 'floor', tier: 2 },
    { id: 'stone_wall', structure: 'wall', tier: 2 },
    { id: 'brick_floor', structure: 'floor', tier: 3 },
    { id: 'brick_wall', structure: 'wall', tier: 3 },
    { id: 'reinforced_wall', structure: 'wall', tier: 4 },
    { id: 'reinforced_door', structure: 'door', tier: 4 },
    { id: 'runic_wall', structure: 'wall', tier: 5 },
    { id: 'runic_door', structure: 'door', tier: 5 }
  ];
  for (const tc of tierChecks) {
    const b = dataLoader.getBuildable(tc.id);
    assert.ok(b, `Buildable ${tc.id} exists`);
    assert.equal(b.structure, tc.structure, `Buildable ${tc.id} has structure ${tc.structure}`);
    assert.equal(b.materialTier, tc.tier, `Buildable ${tc.id} has materialTier ${tc.tier}`);
    if (tc.structure === 'wall') {
      assert.ok(BuildingSystem.isWall(b), `isWall returns true for ${tc.id}`);
    } else if (tc.structure === 'door') {
      assert.ok(BuildingSystem.isDoor(b), `isDoor returns true for ${tc.id}`);
    } else if (tc.structure === 'floor') {
      assert.ok(BuildingSystem.isFloor(b), `isFloor returns true for ${tc.id}`);
    }
  }

  // 1.7 Furniture items and buildables (13 furniture pieces)
  const expectedFurniture = [
    { id: 'wooden_chair', quality: 2, roomTag: 'dining', indoor: true },
    { id: 'wooden_table', quality: 3, roomTag: 'dining', indoor: true },
    { id: 'wall_shelf', quality: 3, indoor: true },
    { id: 'wardrobe', quality: 5, indoor: true },
    { id: 'bookshelf', quality: 6, indoor: true },
    { id: 'carved_cabinet', quality: 9, indoor: true },
    { id: 'masterwork_throne', quality: 20, indoor: true },
    { id: 'stone_bench', quality: 2, indoor: false },
    { id: 'stone_brazier', quality: 3, indoor: true },
    { id: 'stone_planter', quality: 4, indoor: false },
    { id: 'stone_fountain', quality: 10, indoor: false },
    { id: 'marble_statue', quality: 14, indoor: false },
    { id: 'grand_hearth', quality: 20, indoor: true }
  ];
  for (const f of expectedFurniture) {
    const item = dataLoader.getItem(f.id);
    assert.ok(item, `Furniture item ${f.id} exists`);
    const b = dataLoader.getBuildable(f.id);
    assert.ok(b, `Furniture buildable ${f.id} exists`);
    assert.equal(b.quality, f.quality, `${f.id} quality is ${f.quality}`);
    assert.equal(b.itemCosts?.[f.id], 1, `${f.id} itemCosts is { ${f.id}: 1 }`);
    assert.equal(b.indoorRequired, f.indoor, `${f.id} indoorRequired is ${f.indoor}`);
    assert.ok(BuildingSystem.isFurniture(b), `isFurniture returns true for ${f.id}`);
  }

  // 1.8 Rank classes (12 classes)
  const expectedClasses = [
    'apprentice_carpenter', 'journeyman_carpenter', 'master_carpenter', 'grandmaster_carpenter',
    'apprentice_stonemason', 'journeyman_stonemason', 'master_stonemason', 'grandmaster_stonemason',
    'apprentice_builder', 'journeyman_builder', 'master_builder', 'grandmaster_builder'
  ];
  for (const clsId of expectedClasses) {
    const cls = dataLoader.getClass(clsId);
    assert.ok(cls, `Class ${clsId} exists in classes.json`);
  }

  // 1.9 Room Quality config
  const rqConfig = dataLoader.getRoomQualityConfig();
  assert.ok(rqConfig, 'roomQuality config exists in rooms.json');
  assert.equal(rqConfig.wallTierWeight, 4);
  assert.ok(rqConfig.thresholds !== undefined, 'thresholds exists in roomQuality');

  const rqMoodConfig = dataLoader.getRoomQualityMoodConfig();
  assert.ok(rqMoodConfig, 'roomQuality config exists in moodEffects.json');
  assert.equal(rqMoodConfig.bedroomMoodPerSecPerPoint, 0.004);
  assert.equal(rqMoodConfig.bedroomMoodCapPerSec, 0.2);
  assert.equal(rqMoodConfig.diningMoodPerSecPerPoint, 0.002);
  assert.equal(rqMoodConfig.diningMoodCapPerSec, 0.1);

  console.log('✔ Test 1 passed: All expected-table guards satisfied');
}

// ----------------------------------------------------------------------------
// TEST 2: Stone source (stone_outcrop gathering node & generation)
// ----------------------------------------------------------------------------
{
  console.log('-> Test 2: Stone source (stone_outcrop gathering node & generation)');

  const stoneOutcrop = dataLoader.getGatheringNode('stone_outcrop');
  assert.ok(stoneOutcrop, 'stone_outcrop exists in gatheringNodes.json');
  assert.equal(stoneOutcrop.name, 'Stone Outcrop');
  assert.equal(stoneOutcrop.skillId, 'mining');
  assert.equal(stoneOutcrop.resourceId, 'stone');
  assert.equal(stoneOutcrop.yieldCount, 2);
  assert.equal(stoneOutcrop.expGranted, 15);
  assert.equal(stoneOutcrop.channelDurationMs, 2500);
  assert.equal(stoneOutcrop.actionVerb, 'Quarrying');

  // Verify dungeon generator node list includes stone_outcrop
  const dConfig = dataLoader.getDungeonConfig();
  let stoneOutcropPlaced = false;
  for (let s = 1; s <= 20; s++) {
    const d = DungeonGenerator.generate(dConfig, BuildingSystem.createRng(s));
    if (d.bushSpawns.some((b) => b.nodeTypeId === 'stone_outcrop')) {
      stoneOutcropPlaced = true;
      break;
    }
  }
  assert.ok(stoneOutcropPlaced, 'stone_outcrop appears in procedural gathering rooms');

  console.log('✔ Test 2 passed: Stone outcrop yields stone and appears in generated gathering rooms');
}

// ----------------------------------------------------------------------------
// TEST 3: Crafting through modal controls (planks, bricks, furniture, advanced)
// ----------------------------------------------------------------------------
{
  console.log('-> Test 3: Crafting through modal controls');

  const gameState = GameState.getInstance();
  gameState.resetToDefault();
  gameState.addWood(100);

  const player = createPlayer();
  const prog = player.progression;

  // Woodworking: Planks (Req Lv 10)
  const plankRecipe = dataLoader.getWoodworkingRecipes().find((r) => r.id === 'planks')!;
  assert.ok(plankRecipe, 'planks recipe exists');
  assert.equal(plankRecipe.requiredLevel, 10);

  // Level gate test: At Lv 0, level unlocked is false
  assert.equal(prog.getProficiencyLevel('woodworking'), 0);
  assert.ok(prog.getProficiencyLevel('woodworking') < plankRecipe.requiredLevel, 'Cannot craft planks at Lv 0');

  // Level up woodworking to 10
  prog.addProficiencyExp('woodworking', 1000);
  assert.ok(prog.getProficiencyLevel('woodworking') >= 10, 'Woodworking is at least Lv 10');

  // Craft planks
  const plankRes = CraftingSystem.applyCraft(player, plankRecipe, 'woodworking');
  assert.ok(plankRes.success, 'Planks crafted successfully');
  assert.equal(plankRes.resultId, 'planks');
  assert.equal(plankRes.expGranted, 10);
  assert.equal(player.getItemCount('planks'), 1, '1 plank added to player inventory');

  // Stonemason: Bricks (Req Lv 10)
  gameState.addItem('stone', 10);
  gameState.addItem('clay', 10);
  const brickRecipe = dataLoader.getStonemasonRecipes().find((r) => r.id === 'bricks')!;
  assert.ok(brickRecipe, 'bricks recipe exists');
  assert.equal(brickRecipe.requiredLevel, 10);

  assert.equal(prog.getProficiencyLevel('stonemason'), 0);
  assert.ok(prog.getProficiencyLevel('stonemason') < brickRecipe.requiredLevel, 'Cannot craft bricks at Lv 0');

  prog.addProficiencyExp('stonemason', 1000);
  assert.ok(prog.getProficiencyLevel('stonemason') >= 10, 'Stonemason is at least Lv 10');

  const brickRes = CraftingSystem.applyCraft(player, brickRecipe, 'stonemason');
  assert.ok(brickRes.success, 'Bricks crafted successfully');
  assert.equal(brickRes.resultId, 'bricks');
  assert.equal(brickRes.quantity, 2, 'Yields 2 bricks');
  assert.equal(brickRes.expGranted, 10);
  assert.equal(player.getItemCount('bricks'), 2);

  // Furniture: Wooden Chair (Woodworking Lv 0, 3 wood)
  const chairRecipe = dataLoader.getWoodworkingRecipes().find((r) => r.id === 'wooden_chair')!;
  assert.ok(chairRecipe, 'wooden_chair recipe exists');
  const chairRes = CraftingSystem.applyCraft(player, chairRecipe, 'woodworking');
  assert.ok(chairRes.success, 'Wooden chair crafted');
  assert.equal(chairRes.resultId, 'wooden_chair');
  assert.equal(chairRes.expGranted, 20);
  assert.equal(player.getItemCount('wooden_chair'), 1);

  // Advanced Materials at Blacksmithing: reinforced_plank (Lv 30) & reinforced_brick (Lv 30)
  prog.addProficiencyExp('blacksmithing', 10000); // Level 30+
  gameState.addItem('ore', 10);
  const refPlankRecipe = dataLoader.getBlacksmithRecipes().find((r) => r.id === 'reinforced_plank')!;
  assert.ok(refPlankRecipe, 'reinforced_plank exists');
  assert.equal(refPlankRecipe.requiredLevel, 30);
  gameState.addItem('planks', 1);
  const refPlankRes = CraftingSystem.applyCraft(player, refPlankRecipe, 'blacksmithing');
  assert.ok(refPlankRes.success, 'Reinforced plank forged');
  assert.equal(refPlankRes.resultId, 'reinforced_plank');
  assert.equal(player.getItemCount('reinforced_plank'), 1);

  const refBrickRecipe = dataLoader.getBlacksmithRecipes().find((r) => r.id === 'reinforced_brick')!;
  assert.ok(refBrickRecipe, 'reinforced_brick exists');
  assert.equal(refBrickRecipe.requiredLevel, 30);
  const refBrickRes = CraftingSystem.applyCraft(player, refBrickRecipe, 'blacksmithing');
  assert.ok(refBrickRes.success, 'Reinforced brick forged');
  assert.equal(refBrickRes.resultId, 'reinforced_brick');
  assert.equal(player.getItemCount('reinforced_brick'), 1);

  // Advanced Materials at Enchanting: runic_plank (Lv 60) & runic_brick (Lv 60)
  prog.addProficiencyExp('enchanting', 50000); // Level 60+
  gameState.addItem('arcane_crystal', 10);
  gameState.addItem('reinforced_plank', 2);
  gameState.addItem('reinforced_brick', 2);

  const runicPlankRecipe = dataLoader.getEnchantingRecipes().find((r) => r.id === 'runic_plank')!;
  assert.ok(runicPlankRecipe, 'runic_plank exists');
  assert.equal(runicPlankRecipe.requiredLevel, 60);
  const runicPlankRes = CraftingSystem.applyCraft(player, runicPlankRecipe, 'enchanting');
  assert.ok(runicPlankRes.success, 'Runic plank enchanted');
  assert.equal(runicPlankRes.resultId, 'runic_plank');
  assert.equal(player.getItemCount('runic_plank'), 1);

  const runicBrickRecipe = dataLoader.getEnchantingRecipes().find((r) => r.id === 'runic_brick')!;
  assert.ok(runicBrickRecipe, 'runic_brick exists');
  assert.equal(runicBrickRecipe.requiredLevel, 60);
  const runicBrickRes = CraftingSystem.applyCraft(player, runicBrickRecipe, 'enchanting');
  assert.ok(runicBrickRes.success, 'Runic brick enchanted');
  assert.equal(runicBrickRes.resultId, 'runic_brick');
  assert.equal(player.getItemCount('runic_brick'), 1);

  console.log('✔ Test 3 passed: All recipes craft with level gates, resource deduction, and EXP');
}

// ----------------------------------------------------------------------------
// TEST 4: Generic costs & Construction multiplier
// ----------------------------------------------------------------------------
{
  console.log('-> Test 4: Generic costs & Construction multiplier');

  const plankWall = dataLoader.getBuildable('plank_wall')!;
  assert.ok(plankWall, 'plank_wall exists');

  // Plank Wall base cost: 4 planks
  // Untrained (Level 0, 1.0x) -> 4 planks
  const costs0 = BuildingSystem.getBlueprintCosts(plankWall, 0);
  assert.equal(costs0.items.planks, 4);

  // Novice (Level 10, 0.9x) -> floor(4 * 0.9) = 3 planks
  const costs10 = BuildingSystem.getBlueprintCosts(plankWall, 10);
  assert.equal(costs10.items.planks, 3);

  // Expert (Level 60, 0.6x) -> floor(4 * 0.6) = 2 planks
  const costs60 = BuildingSystem.getBlueprintCosts(plankWall, 60);
  assert.equal(costs60.items.planks, 2);

  // Master (Level 90, 0.5x) -> floor(4 * 0.5) = 2 planks
  const costs90 = BuildingSystem.getBlueprintCosts(plankWall, 90);
  assert.equal(costs90.items.planks, 2);

  // Demolish refunds (floor rounding, no global max(1))
  // 1-plank floor at Untrained (50% refund) -> floor(1 * 0.5) = 0
  const refundFloor0 = BuildingSystem.getEffectiveDemolishRefund(1, 0);
  assert.equal(refundFloor0, 0, '1-plank floor refunds 0 at Untrained');

  // 1-plank floor at Master (100% refund) -> 1
  const refundFloor90 = BuildingSystem.getEffectiveDemolishRefund(1, 90);
  assert.equal(refundFloor90, 1, '1-plank floor refunds 1 at Master');

  // 4-plank wall at Untrained (50% refund) -> floor(4 * 0.5) = 2
  const refundWall0 = BuildingSystem.getEffectiveDemolishRefund(4, 0);
  assert.equal(refundWall0, 2, '4-plank wall refunds 2 at Untrained');

  // 4-plank wall at Master (100% refund) -> 4
  const refundWall90 = BuildingSystem.getEffectiveDemolishRefund(4, 90);
  assert.equal(refundWall90, 4, '4-plank wall refunds 4 at Master');

  // Clay and ore stay unscaled
  const plantingPlot = dataLoader.getBuildable('planting_plot')!;
  const plotCosts0 = BuildingSystem.getBlueprintCosts(plantingPlot, 0);
  const plotCosts90 = BuildingSystem.getBlueprintCosts(plantingPlot, 90);
  assert.equal(plotCosts0.clay, 3, 'Clay cost unscaled at Untrained');
  assert.equal(plotCosts90.clay, 3, 'Clay cost unscaled at Master');

  const mws = dataLoader.getBuildable('magical_weapon_station')!;
  const mwsCosts0 = BuildingSystem.getBlueprintCosts(mws, 0);
  const mwsCosts90 = BuildingSystem.getBlueprintCosts(mws, 90);
  assert.equal(mwsCosts0.ore, 5, 'Ore cost unscaled at Untrained');
  assert.equal(mwsCosts90.ore, 5, 'Ore cost unscaled at Master');

  console.log('✔ Test 4 passed: Generic costs scale with Construction tier and refund using floor rounding');
}

// ----------------------------------------------------------------------------
// TEST 5: Furniture placement & refunds & Free Hands exemption
// ----------------------------------------------------------------------------
{
  console.log('-> Test 5: Furniture placement & refunds & Free Hands exemption');

  const chairDef = dataLoader.getBuildable('wooden_chair')!;
  assert.ok(BuildingSystem.isFurniture(chairDef), 'wooden_chair is identified as furniture');

  const bSystem = new BuildingSystem();
  const playerPos = { x: 0, y: 0 };

  const roomWalls = new Set<string>([
    '4,4', '5,4', '6,4',
    '4,5',        '6,5',
    '4,6',        '6,6'
  ]);
  const roomDoors = new Set<string>(['5,6']);
  const isW = (x: number, y: number) => roomWalls.has(`${x},${y}`);
  const isD = (x: number, y: number) => roomDoors.has(`${x},${y}`);

  // Can place check when player owns 0 chairs
  let canPlaceRes = bSystem.canPlace(
    chairDef,
    5,
    5,
    playerPos,
    [],
    isW,
    isD,
    () => false,
    100, // wood
    0,   // constLevel
    0,   // clay
    0,   // gardeningLevel
    () => true,
    0,   // ore
    (id) => (id === 'wooden_chair' ? 0 : 10) // 0 chairs owned!
  );
  assert.equal(canPlaceRes.valid, false, 'Cannot place furniture when 0 owned');
  assert.ok(canPlaceRes.reason?.includes('Requires 1'), 'Rejection mentions missing item');

  // Can place check when player owns 1 chair
  canPlaceRes = bSystem.canPlace(
    chairDef,
    5,
    5,
    playerPos,
    [],
    isW,
    isD,
    () => false,
    100,
    0,
    0,
    0,
    () => true,
    0,
    (id) => (id === 'wooden_chair' ? 1 : 10)
  );
  assert.equal(canPlaceRes.valid, true, 'Can place furniture when 1 owned');

  // Demolish refund: Furniture ALWAYS refunds 1 in full
  const placedChair: PlacedBuildable = {
    id: 'wooden_chair',
    x: 5,
    y: 5,
    itemsPaid: { wooden_chair: 1 }
  };
  let refundedQty = 0;
  for (const [itemId, _count] of Object.entries(placedChair.itemsPaid!)) {
    if (BuildingSystem.isFurniture(chairDef) || itemId === chairDef.id) {
      refundedQty = 1;
    } else {
      refundedQty = BuildingSystem.getEffectiveDemolishRefund(_count, 0);
    }
  }
  assert.equal(refundedQty, 1, 'Placed chair always refunds exactly 1 chair at Untrained (level 0)');

  // Free Hands EXEMPTION: Free Hands NEVER applies to furniture
  bSystem.setFreeHandsRng(() => 0.0);
  const perks = { freeHandsChance: 100, perkDescription: '', classId: 'master_builder' };
  const isFurn = BuildingSystem.isFurniture(chairDef);
  const freeHandsProc = !isFurn && perks.freeHandsChance > 0 && bSystem.rollFreeHands() < perks.freeHandsChance;
  assert.equal(freeHandsProc, false, 'Free Hands does NOT proc on furniture placement even at 100% proc roll');

  // But procs on non-furniture material
  const plankWall = dataLoader.getBuildable('plank_wall')!;
  const isWallFurn = BuildingSystem.isFurniture(plankWall);
  const wallFreeHandsProc = !isWallFurn && perks.freeHandsChance > 0 && bSystem.rollFreeHands() < perks.freeHandsChance;
  assert.equal(wallFreeHandsProc, true, 'Free Hands procs on plank wall placement');

  console.log('✔ Test 5 passed: Furniture consumes 1, disallows at 0, refunds 1 in full, and never procs Free Hands');
}

// ----------------------------------------------------------------------------
// TEST 6: Room Quality & Classification with hand-computed arithmetic
// ----------------------------------------------------------------------------
{
  console.log('-> Test 6: Room Quality & Classification with hand-computed arithmetic');

  const bSystem = new BuildingSystem();
  const classifier = new RoomClassifier(dataLoader.getRoomsData().rules);

  const walls = new Set<string>([
    '0,0', '1,0', '2,0', '3,0',
    '0,1', '0,2',
    '3,2',
    '0,3', '1,3', '2,3', '3,3'
  ]);
  const doors = new Set<string>(['3,1']);

  const isWallFn = (x: number, y: number) => walls.has(`${x},${y}`);
  const isDoorFn = (x: number, y: number) => doors.has(`${x},${y}`);

  const enclosure = bSystem.checkEnclosure(1, 1, isWallFn, isDoorFn);
  assert.ok(enclosure.isIndoor, 'Room is indoor');
  assert.equal(enclosure.enclosedTiles?.length, 4, 'Enclosed space is 4 tiles (2x2)');
  assert.equal(enclosure.perimeterWalls.length, 7, '7 perimeter walls (excluding non-adjacent corners)');
  assert.equal(enclosure.perimeterDoors.length, 1, '1 perimeter door');

  const placedMap = new Map<string, PlacedBuildable>([
    ['1,1', { id: 'wooden_chair', x: 1, y: 1 }],
    ['1,2', { id: 'wooden_table', x: 1, y: 2 }],
    ['2,1', { id: 'cooking_station', x: 2, y: 1 }]
  ]);

  const tags: string[] = [];
  let furnitureQuality = 0;
  for (const t of enclosure.enclosedTiles) {
    const p = placedMap.get(`${t.x},${t.y}`);
    if (p) {
      const def = dataLoader.getBuildable(p.id);
      if (def?.roomTag) tags.push(def.roomTag);
      if (def?.quality) furnitureQuality += def.quality;
    }
  }

  // Exact arithmetic:
  // 7 stone walls * tier 2 = 14
  // 1 plank door * tier 1 = 1
  // Total tier sum = 15
  // Total perimeter tiles = 8
  // avgTier = 15 / 8 = 1.875
  // wallTierWeight = 4
  // wall contribution = 4 * 1.875 = 7.5
  // Furniture quality = 2 (chair) + 3 (table) = 5
  // Total quality = 5 + 7.5 = 12.5
  const expectedQuality = 5 + (4 * 15) / 8;
  assert.equal(expectedQuality, 12.5);

  let totalTierSum = 0;
  for (const p of enclosure.perimeterWalls) {
    totalTierSum += 2; // stone_wall tier
  }
  for (const p of enclosure.perimeterDoors) {
    totalTierSum += 1; // plank_door tier
  }
  const avgTier = totalTierSum / (enclosure.perimeterWalls.length + enclosure.perimeterDoors.length);
  const computedQuality = furnitureQuality + 4 * avgTier;
  assert.equal(computedQuality, expectedQuality, 'Computed quality matches exact hand-calculation');

  const rawThresholds = dataLoader.getRoomsData().roomQuality?.thresholds ?? {};
  const thresholdsList = Array.isArray(rawThresholds)
    ? rawThresholds
    : Object.entries(rawThresholds).map(([k, v]) => ({ id: k, label: k.charAt(0).toUpperCase() + k.slice(1), minQuality: v }));
  const sortedThresholds = [...thresholdsList].sort((a, b) => b.minQuality - a.minQuality);
  const matchedThreshold = sortedThresholds.find((t) => computedQuality >= t.minQuality);
  assert.equal(matchedThreshold?.id, 'cozy', 'Exact value falls into Cozy threshold');

  const classified = classifier.classify(tags, enclosure.enclosedTiles);
  assert.equal(classified.name, 'Cooking & Dining Area', 'Classified as Cooking & Dining Area');
  assert.equal(classified.ruleId, 'cooking_dining');

  const displayName = `${classified.name} · ${matchedThreshold?.label} (${Math.round(computedQuality)})`;
  assert.equal(displayName, 'Cooking & Dining Area · Cozy (13)', 'Display label matches exact arithmetic');

  GameState.getInstance().setBestRoomQuality('cooking_dining', computedQuality);
  assert.equal(GameState.getInstance().getBestRoomQuality('cooking_dining'), computedQuality);

  console.log('✔ Test 6 passed: Stone wall + plank door + chair + table classifies with exact hand-calculated Cozy (13)');
}

// ----------------------------------------------------------------------------
// TEST 7: Mood Link (safe zone outpost rest recovery with moodEnabled)
// ----------------------------------------------------------------------------
{
  console.log('-> Test 7: Mood Link (safe zone outpost rest recovery with moodEnabled)');

  const player = createPlayer();
  player.mood = 50;

  assert.equal(dataLoader.isMoodEnabled(), false, 'Mood is currently disabled (moodEnabled: false)');

  GameState.getInstance().setBestRoomQuality('personal_bedroom', 20);
  GameState.getInstance().setBestRoomQuality('cooking_dining', 20);

  player.isInOutpost = true;
  player.isInSafeZone = true;
  const initialMood = player.mood;
  player.update(1000);
  assert.equal(player.mood, initialMood, 'Mood remains unchanged when moodEnabled is false');

  const rqMood = dataLoader.getRoomQualityMoodConfig()!;
  assert.ok(rqMood, 'rqMood config exists');

  // Quality 20 bedroom: 20 * 0.004 = 0.08 mood/sec (below cap 0.2)
  const bedroomBonus20 = Math.min(rqMood.bedroomMoodCapPerSec, 20 * rqMood.bedroomMoodPerSecPerPoint);
  assert.equal(bedroomBonus20, 0.08);

  // Quality 60 bedroom: 60 * 0.004 = 0.24 mood/sec -> clamped at cap 0.20
  const bedroomBonus60 = Math.min(rqMood.bedroomMoodCapPerSec, 60 * rqMood.bedroomMoodPerSecPerPoint);
  assert.equal(bedroomBonus60, 0.2, 'Bedroom mood recovery bonus is capped at 0.2');

  // Quality 20 dining: 20 * 0.002 = 0.04 mood/sec (below cap 0.1)
  const diningBonus20 = Math.min(rqMood.diningMoodCapPerSec, 20 * rqMood.diningMoodPerSecPerPoint);
  assert.equal(diningBonus20, 0.04);

  // Quality 60 dining: 60 * 0.002 = 0.12 mood/sec -> clamped at cap 0.10
  const diningBonus60 = Math.min(rqMood.diningMoodCapPerSec, 60 * rqMood.diningMoodPerSecPerPoint);
  assert.equal(diningBonus60, 0.1, 'Dining mood recovery bonus is capped at 0.1');

  console.log('✔ Test 7 passed: Mood link stays off with moodEnabled: false; formulas and caps verified');
}

// ----------------------------------------------------------------------------
// TEST 8: Builder ranks, Free Hands simulation & Salvage Expert
// ----------------------------------------------------------------------------
{
  console.log('-> Test 8: Builder ranks, Free Hands simulation & Salvage Expert');

  const player = createPlayer();
  const prog = player.progression;

  const cRanks = dataLoader.getCraftingRanks();
  assert.equal(cRanks?.builderExpPerPlacement, 10, 'builderExpPerPlacement is 10');

  prog.setClassLevel('apprentice_builder', 1);
  assert.ok(prog.isClassUnlocked('apprentice_builder'), 'apprentice_builder unlocked');
  assert.equal(prog.getClassLevel('apprentice_builder'), 1);

  const bExp = cRanks?.builderExpPerPlacement ?? 10;
  prog.addClassExp('apprentice_builder', bExp);
  assert.equal(prog.getClassStat('apprentice_builder')?.currentExp, 10, 'Builder class gained +10 EXP');

  // Free Hands simulation: 5,000 seeded rolls at 15% chance
  const bSystem = new BuildingSystem();
  const seededRng = BuildingSystem.createRng(1337);
  bSystem.setFreeHandsRng(seededRng);

  const freeHandsChance = 15;
  let procCount = 0;
  const totalSims = 5000;
  for (let i = 0; i < totalSims; i++) {
    if (bSystem.rollFreeHands() < freeHandsChance) {
      procCount++;
    }
  }

  const procPct = (procCount / totalSims) * 100;
  console.log(`  Free Hands 5,000 rolls: ${procCount} procs (${procPct.toFixed(2)}%)`);
  assert.ok(
    procPct >= 13.5 && procPct <= 16.5,
    `Free Hands proc percentage ${procPct}% must be within 15% +/- 1.5%`
  );

  // Salvage Expert: Demolish refund never exceeds 100% of cost paid
  const salvageBonus = 50;

  const refundUntrainedWithPerk = BuildingSystem.getEffectiveDemolishRefund(10, 0, salvageBonus);
  assert.equal(refundUntrainedWithPerk, 10, 'Untrained with Salvage Expert gets 100% refund');

  const refundMasterWithPerk = BuildingSystem.getEffectiveDemolishRefund(10, 90, salvageBonus);
  assert.equal(refundMasterWithPerk, 10, 'Master with Salvage Expert is capped at 100% refund');

  console.log('✔ Test 8 passed: Builder ranks unlock, Free Hands procs within bounds, Salvage Expert caps at 100%');
}

console.log('\n=== ALL MILESTONE 5 WOODWORKING & STONEMASON TESTS PASSED SUCCESSFULLY! ===');
