import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals for Phaser / DOM under Node
const noop = () => {};
const mockClassList = (classes: Set<string> = new Set()) => ({
  contains: (cls: string) => classes.has(cls),
  add: (...cls: string[]) => cls.forEach((c) => classes.add(c)),
  remove: (...cls: string[]) => cls.forEach((c) => classes.delete(c)),
  toggle: (cls: string) => {
    if (classes.has(cls)) {
      classes.delete(cls);
      return false;
    }
    classes.add(cls);
    return true;
  }
});

const domElements: Map<string, any> = new Map();
const storageMap = new Map<string, string>();

const createMockElement = (id: string = '') => {
  const classes = new Set<string>();
  const listeners: Map<string, Function[]> = new Map();
  const el = {
    id,
    className: '',
    classList: mockClassList(classes),
    style: {} as any,
    innerText: '',
    innerHTML: '',
    children: [] as any[],
    dataset: {} as any,
    disabled: false,
    appendChild: (child: any) => {
      el.children.push(child);
      return child;
    },
    removeChild: (child: any) => {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      return child;
    },
    addEventListener: (evt: string, fn: Function) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
    },
    dispatchEvent: (evt: { type: string; shiftKey?: boolean; stopPropagation?: Function }) => {
      const fns = listeners.get(evt.type) || [];
      for (const fn of fns) fn(evt);
      return true;
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return el;
};

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
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      return {
        getContext: () => dummyCtx,
        style: {},
        width: 32,
        height: 32
      };
    }
    return createMockElement();
  },
  getElementById: (id: string) => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement(id));
    }
    return domElements.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: {},
  body: {}
};

(global as any).Image = class Image {};
(global as any).HTMLCanvasElement = class HTMLCanvasElement {};
(global as any).HTMLVideoElement = class HTMLVideoElement {};

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

(global as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i: number) => Array.from(storageMap.keys())[i] || null
};

// Helper mock graphics and sprite builders
function createMockEventEmitter() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    removeFromDisplayList: function () { return this; },
    addToDisplayList: function () { return this; },
    addedToScene: function () { return this; },
    setInteractive: function () { return this; },
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

function createMockGraphics() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    fillStyle: () => {},
    fillRect: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    fillCircle: () => {},
    strokeCircle: () => {},
    fillEllipse: () => {},
    lineBetween: () => {},
    beginPath: () => {},
    arc: () => {},
    strokePath: () => {},
    fillPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fillTriangle: () => {},
    generateTexture: () => {},
    destroy: () => {},
    clear: () => {}
  } as any;
}

function createMockSprite() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    setOrigin: () => {},
    setScale: () => {},
    setVisible: () => {},
    setAlpha: () => {},
    setAngle: () => {},
    setTint: () => {},
    clearTint: () => {},
    setTexture: () => {},
    setPosition: () => {},
    setDepth: () => {},
    setInteractive: function () { return this; },
    destroy: () => {}
  } as any;
}

function createMockText() {
  const emitter = createMockEventEmitter();
  return {
    ...emitter,
    x: 0,
    y: 0,
    setOrigin: function () { return this; },
    setText: function () { return this; },
    setColor: function () { return this; },
    destroy: () => {}
  } as any;
}

function createMockContainer(x: number = 0, y: number = 0) {
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
    add: function (items: any[]) {
      children.push(...items);
      return this;
    },
    destroy: function () {
      children.length = 0;
    }
  } as any;
}

function createMockScene() {
  const scene: any = {
    sys: {
      queueDepthSort: () => {},
      displayList: { queueDepthSort: () => {} },
      events: { once: () => {}, on: () => {}, emit: () => {} }
    },
    add: {
      graphics: createMockGraphics,
      sprite: createMockSprite,
      text: createMockText,
      container: createMockContainer,
      existing: () => {}
    },
    make: {
      graphics: createMockGraphics
    },
    textures: {
      exists: () => true,
      get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) })
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    time: {
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (_ms: number, cb: Function) => cb(),
      now: 1000
    },
    party: [] as any[],
    player: null as any
  };
  return scene;
}

async function runWipeAndReviveAuditTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING WIPE HANDLER & R KEY REMOVAL AUDIT SUITE');
  console.log('================================================================\n');

  // Dynamic imports after browser / Phaser environment is initialized
  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  await DataLoader.getInstance().loadAll();

  // ---------------------------------------------------------------------------
  // TEST 1: Source & AST Audit for R Key & Party Overview Revive Button
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Source Code Audit for R Key and Party Overview Revive Button ---');
  {
    const srcDir = path.resolve(process.cwd(), 'src');
    const mainSceneCode = fs.readFileSync(path.join(srcDir, 'scenes', 'MainScene.ts'), 'utf8');
    const outpostSceneCode = fs.readFileSync(path.join(srcDir, 'scenes', 'OutpostScene.ts'), 'utf8');
    const hudCode = fs.readFileSync(path.join(srcDir, 'ui', 'HUD.ts'), 'utf8');
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    // 1a. MainScene has NO rKey field and NO KeyCodes.R binding
    assert.equal(mainSceneCode.includes('private rKey'), false, 'MainScene must not have rKey field');
    assert.equal(mainSceneCode.includes('this.rKey ='), false, 'MainScene must not assign this.rKey');
    assert.equal(mainSceneCode.includes('Phaser.Input.Keyboard.KeyCodes.R'), false, 'MainScene must not bind KeyCodes.R');

    // 1b. OutpostScene uses KeyCodes.R exclusively for build rotation, not revive
    assert.equal(outpostSceneCode.includes('Phaser.Input.Keyboard.KeyCodes.R'), true, 'OutpostScene binds KeyCodes.R for build mode');
    const rKeyBlockMatch = outpostSceneCode.match(/const rKey = [^;]+;[\s\S]*?rKey\.on\('down',[\s\S]*?\}\);/);
    assert.ok(rKeyBlockMatch, 'OutpostScene must have rKey binding block');
    assert.equal(rKeyBlockMatch[0].includes('member.revive'), false, 'rKey listener in OutpostScene must not contain member.revive');
    assert.equal(rKeyBlockMatch[0].includes('rotateBlueprint'), true, 'rKey listener must call rotateBlueprint in build mode');

    // 1c. HUD party overview roster has NO free party-revive-btn
    assert.equal(hudCode.includes('party-revive-btn'), false, 'HUD.ts must not contain party-revive-btn markup or click handler');
    assert.equal(hudCode.includes('Revive [R]'), false, 'HUD.ts must not mention "Revive [R]"');

    // 1d. Debug Panel in index.html contains instant revive button
    assert.equal(indexHtml.includes('id="debug-btn-instant-revive"'), true, 'index.html must include debug-btn-instant-revive');
    assert.equal(hudCode.includes('debugBtnInstantRevive'), true, 'HUD.ts must wire debugBtnInstantRevive element and click handler');

    console.log('✔ Test 1 passed: Source audit confirms R key is decoupled from live revive and party-revive-btn is removed.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Debug Panel Instant Revive Button Functionality
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Debug Panel Instant Revive Wiring & Execution ---');
  {
    const dataLoader = DataLoader.getInstance();
    const weaponDef = dataLoader.getWeapon('short_swords')!;
    const heroData = dataLoader.getPlayer();
    const gameState = GameState.getInstance();
    gameState.clearSave();
    gameState.resetToDefault(heroData);
    const prog = new ProgressionSystem(undefined, 'TestHero');

    const mockScene = createMockScene();
    const hero = new Player(mockScene, 2, 2, heroData, weaponDef, 32, 'player-avatar', prog);
    hero.entityName = 'Hero';
    const companion = new Player(mockScene, 3, 2, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Companion'));
    companion.entityName = 'Companion';
    mockScene.party = [hero, companion];
    mockScene.player = hero;

    // Down companion
    companion.takeDamage(9999);
    assert.equal(companion.state, 'downed', 'Companion should be downed after taking lethal damage');

    // Attach __instantReviveParty
    (global as any).window.__instantReviveParty = () => {
      let anyRevived = false;
      for (const member of mockScene.party) {
        if (member.state === 'downed') {
          member.revive(hero);
          anyRevived = true;
        }
      }
      return anyRevived;
    };

    const hud = new HUD();
    hud.update(hero, prog, 0, mockScene.party);

    // Click the debug button
    const debugReviveBtn = (global as any).document.getElementById('debug-btn-instant-revive');
    assert.ok(debugReviveBtn.onclick, 'debug-btn-instant-revive must have an onclick handler');
    debugReviveBtn.onclick();

    assert.equal(companion.state, 'idle', 'Companion must be revived by the debug button');
    assert.ok(companion.hp > 0, 'Companion must have recovered HP');

    console.log('✔ Test 2 passed: Debug Panel instant revive button properly revives downed allies in test environment.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Partial Party Downed vs Full Party Wipe Detection
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Party Downed State & Wipe Detection Logic ---');
  {
    const dataLoader = DataLoader.getInstance();
    const weaponDef = dataLoader.getWeapon('short_swords')!;
    const heroData = dataLoader.getPlayer();

    const mockScene = createMockScene();
    const members: any[] = [];
    for (let i = 0; i < 4; i++) {
      const p = new Player(mockScene, i, 0, heroData, weaponDef, 32, 'player-avatar', new ProgressionSystem(undefined, `Member ${i}`));
      p.entityName = `Member ${i}`;
      members.push(p);
    }
    mockScene.party = members;

    // Condition function matching MainScene.ts update()
    const checkWipe = (party: any[]) => party.length > 0 && party.every(m => m.state === 'downed');

    // 3a. Zero downed
    assert.equal(checkWipe(members), false, '0 downed must not trigger wipe');

    // 3b. 1 of 4 downed
    members[0].takeDamage(9999);
    assert.equal(members[0].state, 'downed');
    assert.equal(checkWipe(members), false, '1 of 4 downed must not trigger wipe');

    // 3c. 2 of 4 downed
    members[1].takeDamage(9999);
    assert.equal(members[1].state, 'downed');
    assert.equal(checkWipe(members), false, '2 of 4 downed must not trigger wipe');

    // 3d. 3 of 4 downed
    members[2].takeDamage(9999);
    assert.equal(members[2].state, 'downed');
    assert.equal(checkWipe(members), false, '3 of 4 downed must not trigger wipe');

    // 3e. 4 of 4 downed (full wipe)
    members[3].takeDamage(9999);
    assert.equal(members[3].state, 'downed');
    assert.equal(checkWipe(members), true, 'All 4 downed must trigger wipe!');

    console.log('✔ Test 3 passed: Wipe condition accurately triggers ONLY when every party member is downed.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Full Party Wipe Resolution & Zero-Punishment Outpost Return
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Full Party Wipe Execution, Outpost Transition & Save Checkpoint ---');
  {
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    gameState.clearSave();
    gameState.resetToDefault(dataLoader.getPlayer());

    // Give party initial resources, food, and items to verify ZERO loss on wipe
    gameState.addWood(150);
    gameState.addOre(75);
    gameState.addItem('raw_meat', 5);
    gameState.addItem('iron_ore', 10);
    gameState.addItem('revive_potion', 2);
    gameState.addResearchPoints(40);
    gameState.incrementDungeonFloorCount();
    gameState.incrementDungeonFloorCount();
    assert.equal(gameState.getDungeonFloorCount(), 2, 'Dungeon floor count should be 2 before wipe');

    const preWood = gameState.getWood();
    const preOre = gameState.getOre();
    const preMeat = gameState.getItemCount('raw_meat');
    const preIron = gameState.getItemCount('iron_ore');
    const preRevive = gameState.getItemCount('revive_potion');
    const preRP = gameState.getResearchPoints();

    const weaponDef = dataLoader.getWeapon('short_swords')!;
    const heroData = dataLoader.getPlayer();
    const prog = new ProgressionSystem(undefined, 'LeaderHero');

    let transitionDestination: string | null = null;
    const mockScene = createMockScene();
    mockScene.scene = {
      start: (sceneKey: string) => { transitionDestination = sceneKey; }
    };
    mockScene.enemies = [
      { targetEntity: null, isAggroed: true },
      { targetEntity: null, isAggroed: true }
    ];
    mockScene.clearMoveDestinationHighlights = () => {};
    mockScene.hud = { showToast: () => {} };

    const hero = new Player(mockScene, 1, 1, heroData, weaponDef, 32, 'player-avatar', prog);
    hero.entityName = 'LeaderHero';
    const comp1 = new Player(mockScene, 2, 1, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Comp1'));
    comp1.entityName = 'Comp1';
    const comp2 = new Player(mockScene, 1, 2, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Comp2'));
    comp2.entityName = 'Comp2';
    const comp3 = new Player(mockScene, 2, 2, heroData, weaponDef, 32, 'companion-avatar', new ProgressionSystem(undefined, 'Comp3'));
    comp3.entityName = 'Comp3';

    mockScene.player = hero;
    mockScene.progressionSystem = prog;
    mockScene.party = [hero, comp1, comp2, comp3];

    // Down all 4 members
    for (const m of mockScene.party) {
      m.takeDamage(9999);
      assert.equal(m.state, 'downed');
    }

    // Bind handlePartyWipe method from MainScene prototype
    mockScene.isWiping = false;
    mockScene.isTransitioning = false;
    mockScene.handlePartyWipe = MainScene.prototype.handlePartyWipe.bind(mockScene);

    // Execute wipe handler
    mockScene.handlePartyWipe();

    // Verify enemies disengaged
    assert.equal(mockScene.enemies[0].isAggroed, false, 'Enemies must disengage aggro on wipe');
    assert.equal(mockScene.enemies[1].isAggroed, false, 'Enemies must disengage aggro on wipe');

    // Verify scene transition called
    assert.equal(transitionDestination, 'OutpostScene', 'Wipe must transition scene to OutpostScene');

    // Verify all party members are restored to conscious / idle state
    for (const m of mockScene.party) {
      assert.equal(m.state, 'idle', `${m.entityName} must be restored to 'idle' state`);
      assert.ok(m.hp > 0, `${m.entityName} must have recovered HP`);
      assert.equal(m.criticalHp, m.maxCriticalHp, `${m.entityName} must have full Critical HP`);
    }

    // Verify ZERO resource loss / ZERO penalty
    assert.equal(gameState.getWood(), preWood, 'Wood stockpile must NOT be penalized on wipe');
    assert.equal(gameState.getOre(), preOre, 'Ore stockpile must NOT be penalized on wipe');
    assert.equal(gameState.getItemCount('raw_meat'), preMeat, 'Inventory raw_meat must NOT be lost');
    assert.equal(gameState.getItemCount('iron_ore'), preIron, 'Inventory iron_ore must NOT be lost');
    assert.equal(gameState.getItemCount('revive_potion'), preRevive, 'Inventory revive_potion must NOT be lost');
    assert.equal(gameState.getResearchPoints(), preRP, 'Research points must NOT be penalized');

    // Verify dungeon floor count reset to 0
    assert.equal(gameState.getDungeonFloorCount(), 0, 'Dungeon floor count must be reset to 0 upon return to Outpost');

    // Verify storage checkpoint was persisted
    assert.equal(gameState.hasSave(), true, 'Save checkpoint must exist on disk after wipe return');
    const meta = gameState.getSaveMetadata();
    assert.ok(meta, 'Save metadata must exist');
    assert.equal(meta.partySize, 4, 'Saved party size must be 4');
    assert.equal(meta.leaderName, 'LeaderHero', 'Leader name must match');

    // Verify loaded save has living, conscious party
    const snapshots = gameState.getPartySnapshots();
    assert.equal(snapshots.length, 4);
    for (const snap of snapshots) {
      assert.equal(snap.state, 'idle', 'Persisted snapshot must record party in conscious idle state');
      assert.ok(snap.hp > 0, 'Persisted snapshot must record positive HP');
    }

    console.log('✔ Test 4 passed: Wipe resolution cleanly teleports to Outpost, restores party, preserves all items/resources with 0 penalty, and checkpoints save.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL WIPE HANDLER & R KEY AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runWipeAndReviveAuditTests().catch((err) => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
