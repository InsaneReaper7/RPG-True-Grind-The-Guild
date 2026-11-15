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
  console.log('BUGFIX TG-MJP93X: butcher an animal corpse without Skinning researched');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(mockPlayerData);
  const researchSystem = ResearchSystem.getInstance();
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const wolfDef = dataLoader.getEnemy('wolf')!;
  gameState.addResearchPoints(100);

  // 1. Neither researched: no node (unchanged)
  const scene0 = createMockScene(MainScene);
  const wolf0 = new Enemy(scene0, 10, 10, wolfDef); wolf0.markDead();
  assert.equal(scene0.checkAndCreateCorpseGatheringNode(wolf0), null, 'No node with neither research');

  // 2. Butchering only (the reported case): wolf corpse is a butchering node at once
  assert.ok(researchSystem.unlockNode(dataLoader.getResearchNode('research_butchering')).success);
  assert.equal(gameState.isSkinningUnlocked(), false);
  const scene = createMockScene(MainScene);
  const wolf = new Enemy(scene, 10, 10, wolfDef); wolf.markDead();
  const node = scene.checkAndCreateCorpseGatheringNode(wolf);
  assert.ok(node, 'Wolf corpse becomes a node with Butchering only');
  assert.equal(node.nodeDef.skillId, 'butchering');
  assert.equal(node.nodeDef.resourceId, 'crypt_meat');
  assert.equal(scene.canButcherCorpse(wolf).canHarvest, true, 'No skin-first gate without Skinning');
  assert.equal(typeof node.sprite.on, 'function', 'Corpse sprite is clickable (pointerdown wired)');
  const hero = new Player(scene, 10, 10, mockPlayerData, dataLoader.getWeapon('short_swords')!);
  const meatAll = () => hero.getItemCount('crypt_meat') + hero.getItemCount('prime_crypt_meat');
  const meat0 = meatAll(), pelt0 = hero.getItemCount('wolf_pelt');
  scene.harvestGatheringNode(node, hero);
  assert.equal(meatAll(), meat0 + 1, 'Butchering granted meat (regular or prime cut)');
  assert.equal(hero.getItemCount('wolf_pelt'), pelt0, 'No pelt without Skinning');
  assert.equal(node.isHarvested, true, 'Corpse spent after butchering');
  assert.equal(scene.canButcherCorpse(wolf).canHarvest, false, 'Cannot butcher twice');
  console.log('✔ Butchering-only: wolf butchered directly');

  // 3. Both researched: skin-first order is unchanged
  assert.ok(researchSystem.unlockNode(dataLoader.getResearchNode('research_skinning')).success);
  const scene2 = createMockScene(MainScene);
  const wolf2 = new Enemy(scene2, 10, 10, wolfDef); wolf2.markDead();
  const node2 = scene2.checkAndCreateCorpseGatheringNode(wolf2);
  assert.equal(node2.nodeDef.skillId, 'skinning', 'With both researched, skin first');
  assert.equal(scene2.canButcherCorpse(wolf2).reason, 'Must skin corpse before butchering');
  scene2.harvestGatheringNode(node2, hero);
  assert.equal(node2.nodeDef.skillId, 'butchering', 'Then butcher');
  console.log('✔ Both researched: skin then butcher (unchanged)');
  console.log('ALL TG-MJP93X TESTS PASSED');
}

runTests().catch((err) => { console.error(err); process.exit(1); });
