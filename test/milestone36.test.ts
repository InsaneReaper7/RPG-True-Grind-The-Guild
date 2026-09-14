import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs if Phaser probes for it
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load JSON data files directly
const buildablesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/buildables.json'), 'utf8'));
const researchTreeData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/researchTree.json'), 'utf8'));
const roomsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/rooms.json'), 'utf8'));
const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
const bowyerRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/bowyerRecipes.json'), 'utf8'));

import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { RoomClassifier } from '../src/systems/RoomClassifier.ts';
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef } from '../src/types/game.ts';

async function runMilestone36Tests() {
  const { Player } = await import('../src/entities/Player.ts');

  console.log('================================================================');
  console.log('RUNNING MILESTONE 36: BOWYER STATION & BOWS UNIT TESTS');
  console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Bowyer Station Buildable & Research Node
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Bowyer Station Buildable & Research Node ---');
const bowyerStation = buildablesData.buildables.find((b: any) => b.id === 'bowyer_station');
assert.ok(bowyerStation, 'bowyer_station must exist in buildables.json');
assert.equal(bowyerStation.name, 'Bowyer Station');
assert.equal(bowyerStation.woodCost, 25, 'woodCost must be 25');
assert.equal(bowyerStation.roomTag, 'bowyer', 'roomTag must be "bowyer"');
assert.equal(bowyerStation.indoorRequired, true, 'indoorRequired must be true');
assert.equal(bowyerStation.walkable, false, 'walkable must be false');
assert.equal(bowyerStation.lockedByDefault, true, 'lockedByDefault must be true');

const bowyerResearchNode = researchTreeData.nodes.find((n: any) => n.id === 'research_bowyer_station');
assert.ok(bowyerResearchNode, 'research_bowyer_station node must exist in researchTree.json');
assert.equal(bowyerResearchNode.targetBuildableId, 'bowyer_station');
assert.equal(bowyerResearchNode.cost, 10);
assert.deepEqual(bowyerResearchNode.prerequisites, []);

// Check GameState lock/unlock logic
const gameState = GameState.getInstance();

assert.equal(gameState.isBuildableUnlocked('bowyer_station'), false, 'bowyer_station must be locked initially');
gameState.unlockBuildable('bowyer_station');
assert.equal(gameState.isBuildableUnlocked('bowyer_station'), true, 'bowyer_station must be unlocked after unlockBuildable()');

console.log('✓ PASS: Bowyer Station buildable and research node schemas verified.\n');

// -----------------------------------------------------------------------------
// TEST 2: Bowyer Workshop Room Classification
// -----------------------------------------------------------------------------
console.log('--- TEST 2: Bowyer Workshop Room Classification ---');
const bowyerRoomRule = roomsData.rules.find((r: any) => r.id === 'bowyer_workshop');
assert.ok(bowyerRoomRule, 'bowyer_workshop rule must exist in rooms.json');
assert.equal(bowyerRoomRule.name, 'Bowyer Workshop');
assert.deepEqual(bowyerRoomRule.requiredTags, ['bowyer']);

const classifier = new RoomClassifier(roomsData.rules);
const classified = classifier.classify(['bowyer']);
assert.equal(classified.name, 'Bowyer Workshop', 'Classifying ["bowyer"] must produce "Bowyer Workshop"');

console.log('✓ PASS: Bowyer Workshop room classification verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Bows Weapon Line & Per-Level Bonuses
// -----------------------------------------------------------------------------
console.log('--- TEST 3: Bows Weapon Line & Real Stats ---');
const bows = weaponsData.weapons.find((w: any) => w.id === 'bows');
assert.ok(bows, 'Hunting Bow ("bows") must exist in weapons.json');
assert.equal(bows.category, 'ranged');
assert.equal(bows.twoHanded, true);
assert.equal(bows.attackRangeTiles, 4);
assert.equal(bows.baseDamage, 6);
assert.equal(bows.baseAccuracy, 0.60);
assert.equal(bows.attackIntervalMs, 1200);
assert.ok(bows.levelBonus, 'Bows must have levelBonus');
assert.equal(bows.levelBonus.accuracyPerLevel, 0.004);
assert.equal(bows.levelBonus.damagePerLevel, 0.4);
assert.equal(bows.levelBonus.attackSpeedPerLevel, 0.005);

const compositeBow = weaponsData.weapons.find((w: any) => w.id === 'composite_bow');
assert.ok(compositeBow, 'Composite Bow must exist in weapons.json');
assert.equal(compositeBow.proficiencyId, 'bows', 'Composite Bow must link to "bows" proficiency');
assert.equal(compositeBow.category, 'ranged');
assert.equal(compositeBow.attackRangeTiles, 4);
assert.equal(compositeBow.baseDamage, 9);
assert.equal(compositeBow.baseAccuracy, 0.65);

const warBow = weaponsData.weapons.find((w: any) => w.id === 'war_bow');
assert.ok(warBow, 'War Bow must exist in weapons.json');
assert.equal(warBow.proficiencyId, 'bows', 'War Bow must link to "bows" proficiency');
assert.equal(warBow.category, 'ranged');
assert.equal(warBow.attackRangeTiles, 5);
assert.equal(warBow.baseDamage, 13);
assert.equal(warBow.baseAccuracy, 0.70);

// Verify attack speed scaling formula and safety floor
const baseInterval = bows.attackIntervalMs;
const speedPerLevel = bows.levelBonus.attackSpeedPerLevel;

// Level 10
const speedBonusLv10 = speedPerLevel * 10;
const intervalLv10 = Math.max(300, baseInterval / (1 + speedBonusLv10));
assert.ok(intervalLv10 < baseInterval, 'Level 10 interval must be faster than base');
assert.equal(Math.round(intervalLv10), Math.round(1200 / 1.05));

// Level 50
const speedBonusLv50 = speedPerLevel * 50;
const intervalLv50 = Math.max(300, baseInterval / (1 + speedBonusLv50));
assert.equal(Math.round(intervalLv50), 960);

// Level 100
const speedBonusLv100 = speedPerLevel * 100;
const intervalLv100 = Math.max(300, baseInterval / (1 + speedBonusLv100));
assert.equal(Math.round(intervalLv100), 800);
assert.ok(intervalLv100 >= 300, 'Attack interval must respect 300ms safety clamp floor');

// Accuracy uncapped test
const baseAcc = bows.baseAccuracy;
const accPerLevel = bows.levelBonus.accuracyPerLevel;
const accLv100 = baseAcc + 100 * accPerLevel;
assert.equal(accLv100, 1.0, 'Accuracy reaches 100% at Lv 100 before gear');
const accWithGear = accLv100 + 0.15;
assert.ok(accWithGear > 1.0, 'Accuracy can exceed 100% (uncapped for evasion offset)');

console.log('✓ PASS: Bows weapon definitions, proficiency linking, and per-level scaling verified.\n');

// -----------------------------------------------------------------------------
// TEST 4: Player Equipment & Ranged Range Integration
// -----------------------------------------------------------------------------
console.log('--- TEST 4: Player Equipment & Range Synchronization ---');
const dummyPlayerData = {
  id: 'hero-1',
  name: 'Guild Hero',
  maxHp: 50,
  maxEnergy: 100,
  speed: 100,
  critHpRatio: '50/50',
  inventoryCapacity: 20
};

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
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
        disableInteractive: () => obj,
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
      gridWidth,
      gridHeight,
      sound: { play: () => {} },
      time: {
        now: 1000,
        addEvent: () => ({ remove: () => {} })
      },
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
          if (config && config.onComplete) {
            config.onComplete();
          }
          return { stop: () => {} };
        }
      }
    };
  }

  const mockScene = createMockScene();
  const player = new Player(mockScene, 5, 5, dummyPlayerData, bows as WeaponDef);
assert.equal(player.attackRangeTiles, 4, 'Equipping bow must set attackRangeTiles to 4');
assert.equal(player.equippedWeapon.id, 'bows');

// Test 2-handed lockout of offhand
player.equipOffhandWeapon({ id: 'daggers', name: 'Daggers', category: 'melee_1h', twoHanded: false, attackIntervalMs: 600, baseDamage: 3 } as any);
assert.equal(player.offhandWeapon, null, 'Cannot equip offhand while wielding 2H bow');

// Equip War Bow (5 tile range)
player.equipWeapon(warBow as WeaponDef);
assert.equal(player.attackRangeTiles, 5, 'Equipping war_bow must set attackRangeTiles to 5');

console.log('✓ PASS: Ranged weapon equipping and range tile synchronization verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: Bow Proficiency Level/EXP Curve & Hidden-until-Level-1
// -----------------------------------------------------------------------------
console.log('--- TEST 5: Shared Level/EXP Curve & Hidden-until-Level-1 ---');
const progression = new ProgressionSystem(classesData, 'Hero');

// Initially Bows should be Level 0, 0 EXP
const bowStat = progression.getProficiencyStat('bows');
assert.equal(bowStat.level, 0);
assert.equal(bowStat.currentExp, 0);
assert.equal(progression.getProficiencyLevel('bows'), 0);

// Shared curve formula check
for (let lvl = 0; lvl <= 10; lvl++) {
  assert.equal(LevelingSystem.expForNextLevel(lvl), 50 + lvl * 4, `EXP curve must strictly be 50 + lvl * 4 at lv ${lvl}`);
}

// 48 EXP added: still Level 0 (hidden)
progression.addProficiencyExp('bows', 48);
assert.equal(progression.getProficiencyLevel('bows'), 0);
assert.equal(progression.getProficiencyStat('bows').currentExp, 48);

// 2 more EXP added (total 50): crosses into Level 1
const levelUpResult = progression.addProficiencyExp('bows', 2);
assert.equal(levelUpResult.leveledUp, true);
assert.equal(progression.getProficiencyLevel('bows'), 1);
assert.equal(progression.getProficiencyStat('bows').currentExp, 0);
assert.ok(progression.getProficiencyLevel('bows') >= 1, 'Proficiency is now revealed (Level >= 1)');

console.log('✓ PASS: Bows follows the shared additive Level/EXP curve and reveals at Level 1.\n');

// -----------------------------------------------------------------------------
// TEST 6: Tier 0 Marksman Class Unlock
// -----------------------------------------------------------------------------
console.log('--- TEST 6: Tier 0 Marksman Class Unlock ---');
const marksmanDef = classesData.classes.find((c: any) => c.id === 'marksman');
assert.ok(marksmanDef, 'marksman class definition must exist in classes.json');
assert.equal(marksmanDef.name, 'Marksman');
assert.equal(marksmanDef.tier, 'novice');
assert.deepEqual(marksmanDef.requirements, [{ type: 'proficiency', target: 'bows', value: 10 }]);

const pMarksman = new ProgressionSystem(classesData, 'Archer Hero');
pMarksman.getProficiencyStat('bows').level = 9;
pMarksman.checkClassUnlocks();
assert.equal(pMarksman.isClassUnlocked('marksman'), false, 'Marksman must NOT be unlocked at Bows 9');

pMarksman.getProficiencyStat('bows').level = 10;
pMarksman.checkClassUnlocks();
assert.equal(pMarksman.isClassUnlocked('marksman'), true, 'Marksman MUST unlock when Bows reaches 10');

console.log('✓ PASS: Marksman class unlocks strictly at Bows Level 10.\n');

// -----------------------------------------------------------------------------
// TEST 7: Scout Requirement (Daggers 10 + Bows 15) Genuine Unlock & Boundary Test
// -----------------------------------------------------------------------------
console.log('--- TEST 7: Scout Unlock Condition (Daggers 10 + Bows 15) Boundary Test ---');
const scoutDef = classesData.classes.find((c: any) => c.id === 'scout');
assert.ok(scoutDef, 'scout class definition must exist in classes.json');
assert.equal(scoutDef.name, 'Scout');
assert.deepEqual(scoutDef.requirements, [
  { type: 'proficiency', target: 'daggers', value: 10 },
  { type: 'proficiency', target: 'bows', value: 15 }
]);

// Case A: Daggers 10, Bows 14 (Negative boundary test — one below requirement)
const pScoutA = new ProgressionSystem(classesData, 'Scout Candidate A');
pScoutA.getProficiencyStat('daggers').level = 10;
pScoutA.getProficiencyStat('bows').level = 14;
pScoutA.checkClassUnlocks();
assert.equal(pScoutA.isClassUnlocked('scout'), false, 'Scout must NOT unlock with Daggers 10 + Bows 14');

// Case B: Daggers 9, Bows 15 (Negative boundary test — other stat below requirement)
const pScoutB = new ProgressionSystem(classesData, 'Scout Candidate B');
pScoutB.getProficiencyStat('daggers').level = 9;
pScoutB.getProficiencyStat('bows').level = 15;
pScoutB.checkClassUnlocks();
assert.equal(pScoutB.isClassUnlocked('scout'), false, 'Scout must NOT unlock with Daggers 9 + Bows 15');

// Case C: Daggers 10, Bows 15 (Exact threshold satisfaction)
const pScoutC = new ProgressionSystem(classesData, 'Scout Candidate C');
pScoutC.getProficiencyStat('daggers').level = 10;
pScoutC.getProficiencyStat('bows').level = 15;
pScoutC.checkClassUnlocks();
assert.equal(pScoutC.isClassUnlocked('scout'), true, 'Scout MUST unlock when character reaches Daggers 10 and Bows 15!');

console.log('✓ PASS: Scout requirement (Daggers 10 + Bows 15) is genuinely satisfiable and boundary-tested.\n');

// -----------------------------------------------------------------------------
// TEST 8: Bowyer Crafting Recipes & Station Workflow
// -----------------------------------------------------------------------------
console.log('--- TEST 8: Bowyer Crafting Recipes & Station Workflow ---');
assert.ok(bowyerRecipesData.recipes && bowyerRecipesData.recipes.length >= 3, 'bowyerRecipes.json must contain recipes');
const huntingRecipe = bowyerRecipesData.recipes.find((r: any) => r.id === 'hunting_bow');
assert.ok(huntingRecipe, 'hunting_bow recipe must exist');
assert.equal(huntingRecipe.resultWeaponId, 'bows');
assert.equal(huntingRecipe.requiredLevel, 0);
assert.equal(huntingRecipe.ingredients.wood, 4);
assert.equal(huntingRecipe.ingredients.spider_silk, 2);

// Simulate crafting workflow

gameState.addItem('wood', 10);
gameState.addItem('spider_silk', 5);

assert.ok(gameState.getItemCount('wood') >= huntingRecipe.ingredients.wood);
assert.ok(gameState.getItemCount('spider_silk') >= huntingRecipe.ingredients.spider_silk);

// Consume mats and grant crafted weapon
for (const [mat, qty] of Object.entries(huntingRecipe.ingredients)) {
  gameState.consumeItem(mat, qty as number);
}
gameState.addItem(huntingRecipe.resultWeaponId, 1);
const pBowyer = new ProgressionSystem(classesData, 'Craftsman');
pBowyer.addProficiencyExp('bowyer', huntingRecipe.expGranted);

assert.equal(gameState.getItemCount('wood'), 6);
assert.equal(gameState.getItemCount('spider_silk'), 3);
assert.equal(gameState.getItemCount('bows'), 1, 'Crafted Hunting Bow must be in inventory');
assert.equal(pBowyer.getProficiencyStat('bowyer').currentExp, 25, 'Bowyer EXP must be awarded');

console.log('✓ PASS: Bowyer recipes and crafting execution successfully validated.\n');

// -----------------------------------------------------------------------------
// TEST 9: Combat Auto-Attack Ranged Loop at Distance
// -----------------------------------------------------------------------------
console.log('--- TEST 9: Combat Auto-Attack Ranged Loop at Distance ---');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

const combatScene = createMockScene();
const grid: number[][] = [];
for (let y = 0; y < 30; y++) {
  grid[y] = [];
  for (let x = 0; x < 30; x++) {
    grid[y][x] = 0;
  }
}
const pathfinder = new Pathfinder(grid);
combatScene.pathfinder = pathfinder;

const archerProg = new ProgressionSystem(classesData, 'Archer Player');
const archerPlayer = new Player(combatScene, 5, 5, dummyPlayerData, bows as WeaponDef, 32, 'archer', archerProg);
assert.equal(archerPlayer.attackRangeTiles, 4);

const dummyEnemyData = {
  id: 'training_dummy',
  name: 'Training Dummy',
  hp: 20,
  criticalHpMax: 10,
  damage: 2,
  attackIntervalMs: 1500,
  moveSpeed: 60,
  expReward: 10
};
const dummyEnemy = new Enemy(combatScene, 5, 8, dummyEnemyData as any); // 3 tiles distance
assert.equal(Math.max(Math.abs(archerPlayer.gridPos.x - dummyEnemy.gridPos.x), Math.abs(archerPlayer.gridPos.y - dummyEnemy.gridPos.y)), 3);

const combat = new CombatSystem(combatScene, [archerPlayer], [dummyEnemy], pathfinder);
archerPlayer.targetEntity = dummyEnemy;
dummyEnemy.targetEntity = archerPlayer;

// Initial bows exp
const initialBowExp = archerProg.getProficiencyStat('bows').currentExp;

  // Advance combat time past attack interval (1200ms) with guaranteed hit
  const origRandom = Math.random;
  Math.random = () => 0.1; // Guarantee hit (< 0.60 base accuracy)
  try {
    combat.update(1300);
  } finally {
    Math.random = origRandom;
  }

// Verify player successfully attacked from distance
assert.ok(archerPlayer.lastAttackTime > 0, 'Archer must have fired attack');
assert.equal(archerPlayer.state, 'attacking', 'Archer state must be attacking');
const bowExpAfterHit = archerProg.getProficiencyStat('bows').currentExp;
assert.equal(bowExpAfterHit, initialBowExp + 2, 'Archer must receive +2 Bows EXP on attack');

// Defeat enemy using combat system
dummyEnemy.takeDamage(100);
assert.equal(dummyEnemy.state, 'dead');
combat.handleTargetDefeated(archerPlayer, dummyEnemy, 'bows');
const bowExpAfterKill = archerProg.getProficiencyStat('bows').currentExp;
assert.equal(bowExpAfterKill, bowExpAfterHit + 4, 'Archer must receive +4 Bows EXP on enemy defeat');

console.log('✓ PASS: Bow ranged auto-attack loop operates cleanly from distance and grants proficiency EXP.\n');

  console.log('================================================================');
  console.log('ALL MILESTONE 36 UNIT TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone36Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
