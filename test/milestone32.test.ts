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
import type { PlayerData } from '../src/types/game.ts';

const mockPlayerData: PlayerData = {
  hp: 50,
  criticalHp: 25,
  energy: 100,
  knownSkillIds: [],
  equippedSkillIds: [],
  autocastMap: {},
  skillCooldownsRemainingMs: {},
  proficiencies: {
    short_swords: { level: 0, currentExp: 0 },
    construction: { level: 0, currentExp: 0 },
    daggers: { level: 0, currentExp: 0 },
    shields: { level: 0, currentExp: 0 },
    dual_wielding: { level: 0, currentExp: 0 },
    alchemy: { level: 0, currentExp: 0 },
    evasion: { level: 0, currentExp: 0 },
    parry: { level: 0, currentExp: 0 },
    block: { level: 0, currentExp: 0 },
    counterattack: { level: 0, currentExp: 0 },
    resilience: { level: 0, currentExp: 0 },
    health_regen: { level: 0, currentExp: 0 },
    mana_regen: { level: 0, currentExp: 0 },
    energy_regen: { level: 0, currentExp: 0 },
    staff: { level: 0, currentExp: 0 },
    healing_magic: { level: 0, currentExp: 0 },
    fire_magic: { level: 0, currentExp: 0 },
    foraging: { level: 0, currentExp: 0 },
    woodcutting: { level: 0, currentExp: 0 },
    mining: { level: 0, currentExp: 0 },
    mace: { level: 0, currentExp: 0 },
    blacksmithing: { level: 0, currentExp: 0 },
    armorsmithing: { level: 0, currentExp: 0 },
    digging: { level: 0, currentExp: 0 },
    skinning: { level: 0, currentExp: 0 },
    butchering: { level: 0, currentExp: 0 }
  },
  classLevels: {},
  unlockedClasses: [],
  resources: { wood: 1000, ore: 0 }
};

function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    removedFromScene: function () { return this; },
    on: function (evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
      return this;
    },
    once: function (evt: string, fn: Function) {
      const wrapper = (...args: any[]) => {
        this.off(evt, wrapper);
        fn(...args);
      };
      return this.on(evt, wrapper);
    },
    off: function (evt: string, fn: Function) {
      const list = listeners.get(evt);
      if (list) {
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      }
      return this;
    },
    emit: function (evt: string, ...args: any[]) {
      const fns = (listeners.get(evt) || []).slice();
      for (const fn of fns) fn(...args);
      return true;
    }
  };
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    depth: 0,
    angle: 0,
    alpha: 1,
    texture: { key: 'wolf-avatar' },
    setOrigin: function () { return this; },
    setVisible: function () { return this; },
    setAlpha: function () { return this; },
    setAngle: function () { return this; },
    setTint: function () { return this; },
    clearTint: function () { return this; },
    setTexture: function () { return this; },
    setPosition: function () { return this; },
    setDepth: function () { return this; },
    setInteractive: function () { return this; },
    disableInteractive: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    setVisible: function () { return this; },
    fillStyle: function () { return this; },
    fillRect: function () { return this; },
    lineStyle: function () { return this; },
    strokeRect: function () { return this; },
    fillCircle: function () { return this; },
    strokeCircle: function () { return this; },
    fillEllipse: function () { return this; },
    strokeEllipse: function () { return this; },
    generateTexture: function () {},
    clear: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    text: '',
    color: '#ffffff',
    setText: function (t: string) { this.text = t; return this; },
    setColor: function (c: string) { this.color = c; return this; },
    setOrigin: function () { return this; },
    setDepth: function () { return this; },
    setVisible: function () { return this; },
    destroy: function () {}
  } as any;
}

function createMockScene(MainSceneClass: any): any {
  const scene: any = {
    tileSize: 32,
    mapWidth: 50,
    mapHeight: 50,
    gridMatrix: Array.from({ length: 50 }, () => Array(50).fill(0)),
    gatheringNodes: [],
    enemies: [],
    party: [],
    time: {
      delayedCall: (delay: number, cb: Function) => cb()
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    textures: {
      exists: () => true,
      get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) })
    },
    input: {
      enable: () => {},
      disable: () => {},
      on: () => {},
      keyboard: { addKey: () => ({ on: () => {} }) }
    },
    sys: {
      input: { enable: () => {}, disable: () => {} },
      queueDepthSort: () => {},
      displayList: { queueDepthSort: () => {} },
      events: { once: () => {}, on: () => {}, emit: () => {} }
    },
    add: {
      sprite: createMockSprite,
      text: createMockText,
      graphics: createMockGraphics,
      container: (x: number = 0, y: number = 0) => {
        const emitter = createMockEventEmitter();
        const children: any[] = [];
        return {
          ...emitter,
          x,
          y,
          children,
          setDepth: function () { return this; },
          setPosition: function (newX: number, newY: number) {
            this.x = newX;
            this.y = newY;
            return this;
          },
          add: function (...items: any[]) {
            children.push(...items);
            return this;
          },
          destroy: function () {
            children.length = 0;
          }
        };
      },
      existing: () => {}
    },
    make: {
      graphics: createMockGraphics
    },
    createFloatingText: () => {},
    interactWithGatheringNode: function (node: any, character?: any) {
      this.harvestGatheringNode(node, character);
    }
  };

  // Bind methods from MainScene prototype
  scene.isEnemyAnimalType = MainSceneClass.prototype.isEnemyAnimalType.bind(scene);
  scene.isEnemyUndeadOrSkeleton = MainSceneClass.prototype.isEnemyUndeadOrSkeleton.bind(scene);
  scene.isEnemyButcherEligible = MainSceneClass.prototype.isEnemyButcherEligible.bind(scene);
  scene.checkAndCreateCorpseGatheringNode = MainSceneClass.prototype.checkAndCreateCorpseGatheringNode.bind(scene);
  scene.spawnCorpseGatheringNode = MainSceneClass.prototype.spawnCorpseGatheringNode.bind(scene);
  scene.canSkinCorpse = MainSceneClass.prototype.canSkinCorpse.bind(scene);
  scene.canButcherCorpse = MainSceneClass.prototype.canButcherCorpse.bind(scene);
  scene.attemptSkinCorpse = MainSceneClass.prototype.attemptSkinCorpse.bind(scene);
  scene.attemptButcherCorpse = MainSceneClass.prototype.attemptButcherCorpse.bind(scene);
  scene.harvestGatheringNode = MainSceneClass.prototype.harvestGatheringNode.bind(scene);

  return scene;
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 32: SKINNING & BUTCHERING UNIT TESTS');
  console.log('================================================================');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(mockPlayerData);

  const researchSystem = ResearchSystem.getInstance();

  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { Player } = await import('../src/entities/Player.ts');

  // -------------------------------------------------------------
  // TEST 1: Research Tree Nodes & Prerequisite Chains
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Research Tree Nodes & Prerequisite Chains ---');
  const skinningNode = dataLoader.getResearchNode('research_skinning');
  const butcheringNode = dataLoader.getResearchNode('research_butchering');
  const armorsmithNode = dataLoader.getResearchNode('research_armorsmithing_bench');
  const cookingNode = dataLoader.getResearchNode('research_cooking_station');
  const blacksmithNode = dataLoader.getResearchNode('research_blacksmithing_station');

  assert.ok(skinningNode, 'Skinning research node must exist');
  assert.equal(skinningNode.name, 'Harvest Enemy Skin');
  assert.deepEqual(skinningNode.prerequisites, [], 'Skinning must have 0 prerequisites');

  assert.ok(butcheringNode, 'Butchering research node must exist');
  assert.equal(butcheringNode.name, 'Harvest Enemy Meat');
  assert.deepEqual(butcheringNode.prerequisites, [], 'Butchering must have 0 prerequisites');

  assert.ok(armorsmithNode, 'Armorsmithing Bench research node must exist');
  assert.deepEqual(armorsmithNode.prerequisites, ['research_skinning'], 'Armorsmithing Bench must require Skinning first');

  assert.ok(cookingNode, 'Cooking Station research node must exist');
  assert.deepEqual(cookingNode.prerequisites, ['research_butchering'], 'Cooking Station must require Butchering first');

  assert.ok(blacksmithNode, 'Blacksmithing Station research node must exist');
  assert.deepEqual(blacksmithNode.prerequisites, [], 'Blacksmithing Station prerequisites must be completely untouched');

  // Verify canUnlockNode enforces prerequisite chains
  gameState.addResearchPoints(100);
  const armorsmithCheckBefore = researchSystem.canUnlockNode(armorsmithNode);
  assert.equal(armorsmithCheckBefore.canUnlock, false, 'Armorsmithing Bench cannot unlock before Skinning is researched');
  assert.ok(armorsmithCheckBefore.reason?.includes('research_skinning'));

  const cookingCheckBefore = researchSystem.canUnlockNode(cookingNode);
  assert.equal(cookingCheckBefore.canUnlock, false, 'Cooking Station cannot unlock before Butchering is researched');
  assert.ok(cookingCheckBefore.reason?.includes('research_butchering'));

  console.log('✔ Test 1 passed: Research nodes and prerequisite chains verified.');

  // -------------------------------------------------------------
  // TEST 2: On-Kill Harvest Drops Removed from Automatic Tables
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: On-Kill Harvest Drops Removed from Automatic Tables ---');
  const wolfDef = dataLoader.getEnemy('wolf')!;
  const spiderDef = dataLoader.getEnemy('spider')!;
  const goblinDef = dataLoader.getEnemy('goblin')!;

  assert.ok(!wolfDef.harvest.some(h => h.item === 'wolf_pelt'), 'wolf_pelt must NOT appear in Wolf on-kill harvest');
  assert.ok(!wolfDef.harvest.some(h => h.item === 'wolf_meat'), 'wolf_meat must NOT appear in Wolf on-kill harvest');
  assert.ok(wolfDef.harvest.some(h => h.item === 'wolf_claw'), 'wolf_claw rare drop preserved on Wolf');

  assert.ok(!spiderDef.harvest.some(h => h.item === 'spider_silk'), 'spider_silk must NOT appear in Spider on-kill harvest');
  assert.ok(spiderDef.harvest.some(h => h.item === 'spider_venom'), 'spider_venom rare drop preserved on Spider');

  assert.ok(!goblinDef.harvest.some(h => h.item === 'monster_meat'), 'monster_meat must NOT appear in Goblin on-kill harvest');
  assert.ok(goblinDef.harvest.some(h => h.item === 'goblin_ear'), 'goblin_ear rare drop preserved on Goblin');

  // Untouched armored/humanoid materials
  const orcDef = dataLoader.getEnemy('orc_warrior')!;
  const voidKnightDef = dataLoader.getEnemy('void_knight')!;
  assert.ok(orcDef.harvest.some(h => h.item === 'orc_heavy_hide'), 'Orc Heavy Hide automatic on-kill drop untouched');
  assert.ok(voidKnightDef.harvest.some(h => h.item === 'void_plate'), 'Void Plate automatic on-kill drop untouched');

  console.log('✔ Test 2 passed: On-kill drop removal confirmed; Orc & Void materials preserved.');

  // -------------------------------------------------------------
  // TEST 3: Moment-of-Death Gate & Corpse Node Creation
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Moment-of-Death Gate & Corpse Node Creation ---');
  const mockScene = createMockScene(MainScene);
  const wolfEnemy = new Enemy(mockScene, 10, 10, wolfDef);
  wolfEnemy.markDead();

  // Before research unlocked: checkAndCreateCorpseGatheringNode returns null
  assert.equal(gameState.isSkinningUnlocked(), false);
  assert.equal(gameState.isButcheringUnlocked(), false);
  const nodeBefore = mockScene.checkAndCreateCorpseGatheringNode(wolfEnemy);
  assert.equal(nodeBefore, null, 'Wolf corpse must NOT become a gatherable node before Skinning is researched');
  assert.equal(mockScene.gatheringNodes.length, 0);

  // Now unlock Skinning
  const unlockSkinRes = researchSystem.unlockNode(skinningNode);
  assert.ok(unlockSkinRes.success);
  assert.equal(gameState.isSkinningUnlocked(), true);

  // Moment of death with Skinning unlocked: becomes a lootable node
  const nodeAfter = mockScene.checkAndCreateCorpseGatheringNode(wolfEnemy);
  assert.ok(nodeAfter, 'Wolf corpse MUST become a gatherable node once Skinning is researched');
  assert.equal(nodeAfter.nodeDef.skillId, 'skinning');
  assert.equal(nodeAfter.nodeDef.resourceId, 'wolf_pelt');
  assert.equal(nodeAfter.nodeDef.actionVerb, 'Skinning');
  assert.equal(mockScene.gatheringNodes.length, 1);

  console.log('✔ Test 3 passed: Moment-of-death research gate verified.');

  // -------------------------------------------------------------
  // TEST 4: Eligibility Rules Across Bestiary
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Eligibility Rules Across Bestiary ---');
  const spiderEnemy = new Enemy(mockScene, 12, 10, spiderDef);
  spiderEnemy.markDead();
  const orcEnemy = new Enemy(mockScene, 14, 10, orcDef);
  orcEnemy.markDead();
  const voidKnightEnemy = new Enemy(mockScene, 16, 10, voidKnightDef);
  voidKnightEnemy.markDead();
  const skeletonDef = dataLoader.getEnemy('skeleton')!;
  const skeletonEnemy = new Enemy(mockScene, 18, 10, skeletonDef);
  skeletonEnemy.markDead();
  const undeadDef = dataLoader.getEnemy('undead')!;
  const undeadEnemy = new Enemy(mockScene, 20, 10, undeadDef);
  undeadEnemy.markDead();
  const goblinEnemy = new Enemy(mockScene, 22, 10, goblinDef);
  goblinEnemy.markDead();

  // Attempt to skin all four: Wolf, Spider, Orc Warrior, Void Knight
  const skinWolf = mockScene.canSkinCorpse(wolfEnemy);
  const skinSpider = mockScene.canSkinCorpse(spiderEnemy);
  const skinOrc = mockScene.canSkinCorpse(orcEnemy);
  const skinVoid = mockScene.canSkinCorpse(voidKnightEnemy);

  assert.equal(skinWolf.canHarvest, true, 'Wolf is Skinning-eligible');
  assert.equal(skinSpider.canHarvest, true, 'Spider is Skinning-eligible');
  assert.equal(skinOrc.canHarvest, false, 'Orc Warrior is NOT Skinning-eligible');
  assert.equal(skinVoid.canHarvest, false, 'Void Knight is NOT Skinning-eligible');

  // Butchering eligibility before unlock:
  assert.equal(mockScene.canButcherCorpse(goblinEnemy).canHarvest, false, 'Butchering research not unlocked yet');

  // Unlock Butchering
  const unlockButcherRes = researchSystem.unlockNode(butcheringNode);
  assert.ok(unlockButcherRes.success);
  assert.equal(gameState.isButcheringUnlocked(), true);

  // Skeleton and Undead correctly refuse Butchering
  const butcherSkeleton = mockScene.canButcherCorpse(skeletonEnemy);
  const butcherUndead = mockScene.canButcherCorpse(undeadEnemy);
  assert.equal(butcherSkeleton.canHarvest, false);
  assert.equal(butcherSkeleton.reason, 'Cannot butcher undead or skeletal remains');
  assert.equal(butcherUndead.canHarvest, false);
  assert.equal(butcherUndead.reason, 'Cannot butcher undead or skeletal remains');

  // Goblin: butcherable immediately without skinning
  const butcherGoblin = mockScene.canButcherCorpse(goblinEnemy);
  assert.equal(butcherGoblin.canHarvest, true, 'Goblin is Butcherable immediately with no skinning prerequisite');

  console.log('✔ Test 4 passed: Bestiary eligibility rules and refusals verified.');

  // -------------------------------------------------------------
  // TEST 5: Wolf Corpse Sequential Ordering Gate (Skinning -> Butchering)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Wolf Corpse Sequential Ordering Gate ---');
  // Wolf corpse is unskinned: Butchering MUST be refused
  const butcherWolfBeforeSkin = mockScene.canButcherCorpse(wolfEnemy);
  assert.equal(butcherWolfBeforeSkin.canHarvest, false);
  assert.equal(butcherWolfBeforeSkin.reason, 'Must skin corpse before butchering');

  // Attempt butcher on unskinned wolf returns false with reason
  const attemptRes = mockScene.attemptButcherCorpse(wolfEnemy);
  assert.equal(attemptRes.success, false);
  assert.equal(attemptRes.reason, 'Must skin corpse before butchering');

  // Perform Skinning on Wolf
  const initialPelts = gameState.getItemCount('wolf_pelt');
  const initialMeat = gameState.getItemCount('wolf_meat');
  const hero = new Player(mockScene, 10, 10, 'hero', mockPlayerData);

  mockScene.harvestGatheringNode(nodeAfter, hero);

  // Confirm pelt granted, meat NOT granted
  assert.equal(gameState.getItemCount('wolf_pelt'), initialPelts + 1, 'Skinning granted exactly 1 Wolf Pelt');
  assert.equal(gameState.getItemCount('wolf_meat'), initialMeat, 'Skinning did NOT grant meat');
  assert.equal(hero.progression.getProficiencyStat('skinning').currentExp, 15, 'Skinning awarded 15 Skinning EXP');
  assert.equal(nodeAfter.isSkinned, true);
  assert.equal(nodeAfter.isHarvested, false, 'Corpse is NOT spent because Butchering is now available!');
  assert.equal(nodeAfter.nodeDef.skillId, 'butchering');
  assert.equal(nodeAfter.nodeDef.actionVerb, 'Butchering');
  assert.equal(nodeAfter.nodeDef.resourceId, 'wolf_meat');

  // Now that Wolf is skinned, Butchering IS available!
  const butcherWolfAfterSkin = mockScene.canButcherCorpse(wolfEnemy);
  assert.equal(butcherWolfAfterSkin.canHarvest, true, 'Wolf corpse can now be butchered');

  // Perform Butchering on the Wolf corpse
  mockScene.harvestGatheringNode(nodeAfter, hero);

  // Confirm meat granted, corpse now spent
  assert.equal(gameState.getItemCount('wolf_meat'), initialMeat + 1, 'Butchering granted exactly 1 Wolf Meat');
  assert.equal(hero.progression.getProficiencyStat('butchering').currentExp, 15, 'Butchering awarded 15 Butchering EXP');
  assert.equal(nodeAfter.isButchered, true);
  assert.equal(nodeAfter.isHarvested, true, 'Corpse is now fully spent after both actions complete');

  // Subsequent harvest attempts refused
  assert.equal(mockScene.canSkinCorpse(wolfEnemy).canHarvest, false);
  assert.equal(mockScene.canButcherCorpse(wolfEnemy).canHarvest, false);

  console.log('✔ Test 5 passed: Sequential ordering gate strictly enforced (Skinning -> Butchering).');

  // -------------------------------------------------------------
  // TEST 6: Spider Silk Skinning & Goblin Meat Butchering
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Spider Silk Skinning & Goblin Meat Butchering ---');
  const initialSilk = gameState.getItemCount('spider_silk');
  const spiderNode = mockScene.spawnCorpseGatheringNode(spiderEnemy, 'skinning');
  mockScene.harvestGatheringNode(spiderNode, hero);
  assert.equal(gameState.getItemCount('spider_silk'), initialSilk + 1, 'Spider skinning awarded Spider Silk');
  assert.equal(spiderNode.isHarvested, true, 'Spider corpse spent after skinning (no meat yield)');

  const initialMonsterMeat = gameState.getItemCount('monster_meat');
  const goblinNode = mockScene.spawnCorpseGatheringNode(goblinEnemy, 'butchering');
  mockScene.harvestGatheringNode(goblinNode, hero);
  assert.equal(gameState.getItemCount('monster_meat'), initialMonsterMeat + 1, 'Goblin butchering awarded Monster Meat');
  assert.equal(goblinNode.isHarvested, true, 'Goblin corpse spent after butchering');

  console.log('✔ Test 6 passed: Spider silk and Goblin meat yields verified.');

  // -------------------------------------------------------------
  // TEST 7: Station Unlocks Now Possible After Prerequisites Researched
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Station Unlocks Now Possible After Prerequisites Researched ---');
  const armorsmithCheckAfter = researchSystem.canUnlockNode(armorsmithNode);
  assert.equal(armorsmithCheckAfter.canUnlock, true, 'Armorsmithing Bench can now unlock because Skinning is researched');

  const cookingCheckAfter = researchSystem.canUnlockNode(cookingNode);
  assert.equal(cookingCheckAfter.canUnlock, true, 'Cooking Station can now unlock because Butchering is researched');

  const unlockArmorRes = researchSystem.unlockNode(armorsmithNode);
  const unlockCookRes = researchSystem.unlockNode(cookingNode);
  assert.ok(unlockArmorRes.success);
  assert.ok(unlockCookRes.success);
  console.log('✔ Test 7 passed: Armorsmithing Bench and Cooking Station unlocked cleanly.');

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 32 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
