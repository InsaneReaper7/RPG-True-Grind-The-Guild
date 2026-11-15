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
  console.log('SKILL LEVEL-UP FLOAT TEXT (owner request 2026-11-15)');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  gameState.initFromPlayerData(mockPlayerData);
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');

  const scene = createMockScene(MainScene);
  const texts: any[] = [];
  const tweens: any[] = [];
  const baseText = scene.add.text;
  scene.add.text = (x: number, y: number, label: string, style: any) => {
    const t = baseText();
    Object.assign(t, { x, y, text: label, style, active: true, alpha: 1 });
    t.destroy = function () { this.active = false; };
    texts.push(t);
    return t;
  };
  scene.tweens.add = (cfg: any) => { tweens.push(cfg); return { stop: () => {} }; };

  const makeMember = (name: string) => {
    const prog = new ProgressionSystem(dataLoader.getClassesData ? dataLoader.getClassesData() : undefined, name);
    const p = new Player(scene, 10, 10, { ...mockPlayerData, name } as any, dataLoader.getWeapon('katana')!, 32, 'hero', prog);
    p.entityName = name;
    p.bindProgression(prog);
    return p;
  };
  const leader = makeMember('Kaelen');
  const ally = makeMember('Valerie');
  const before = texts.length;

  // 1. A proficiency level-up on the leader shows "Katanas has reached Lv N!" above the leader
  const katanaName = dataLoader.getTrainableStatDef('katana')!.name;
  const r = leader.progression!.addProficiencyExp('katana', 2000);
  assert.ok(r.leveledUp, 'katana leveled up');
  const lvl = leader.progression!.getProficiencyLevel('katana');
  const t1 = texts.slice(before).find((t) => t.text === `${katanaName} has reached Lv ${lvl}!`);
  assert.ok(t1, `Leader shows "${katanaName} has reached Lv ${lvl}!" (got: ${texts.slice(before).map((t) => t.text).join(' | ')})`);
  assert.equal(t1.parentContainer, leader, 'Text is a child of the leader, so it follows the leader');
  console.log(`✔ Leader: "${t1.text}"`);

  // 2. It fades after a couple of seconds and is destroyed
  const tw = tweens.find((c) => c.targets === t1);
  assert.ok(tw, 'A fade tween exists');
  assert.equal(tw.alpha, 0, 'Fades to alpha 0');
  assert.ok(tw.delay + tw.duration >= 2000 && tw.delay + tw.duration <= 3500, 'Visible for a couple of seconds before fading out');
  tw.onComplete();
  assert.equal(t1.active, false, 'Destroyed after the fade');
  console.log('✔ Holds, fades and is destroyed');

  // 3. Every party member gets their own text (the ally, not the leader)
  const n2 = texts.length;
  ally.progression!.addProficiencyExp('katana', 500);
  const allyLvl = ally.progression!.getProficiencyLevel('katana');
  const t2 = texts.slice(n2).find((t) => t.text === `${katanaName} has reached Lv ${allyLvl}!`);
  assert.ok(t2 && t2.parentContainer === ally, 'Ally shows its own level-up text above the ally');
  console.log(`✔ Ally: "${t2.text}"`);

  // 4. Simultaneous level-ups stack instead of overlapping
  const n3 = texts.length;
  ally.progression!.addProficiencyExp('daggers', 500);
  const t3 = texts.slice(n3).find((t) => / has reached Lv /.test(t.text));
  assert.ok(t3 && t3.y < t2.y, 'A second simultaneous text sits above the first');
  console.log('✔ Stacks while the earlier text is still showing');

  // 5. Class level-ups are announced too; restores / debug sets (0 levels gained) are not
  const n4 = texts.length;
  leader.showLevelUpFloatText({ type: 'class', id: 'ronin', level: 5, levelsGained: 1 });
  const roninName = dataLoader.getClass('ronin')?.name || 'Ronin';
  assert.ok(texts.slice(n4).some((t) => t.text === `${roninName} (class) has reached Lv 5!`), 'Class level-up text');
  const n5 = texts.length;
  leader.progression!.setClassLevel('ronin', 9);
  assert.equal(texts.length, n5, 'setClassLevel (0 levels gained) shows nothing');
  console.log('✔ Class level-ups shown; level restores are silent');

  console.log('ALL LEVEL-UP FLOAT TEXT TESTS PASSED');
}

runTests().catch((err) => { console.error(err); process.exit(1); });
