import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser import under Node
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
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: noop,
      removeChild: noop,
      addEventListener: noop,
      querySelectorAll: () => []
    }),
    getElementById: () => null,
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
  (globalThis as any).window = (global as any).window;
  (globalThis as any).document = (global as any).document;
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function createMockMainScene(MainSceneClass: any, seed: number = 42) {
  const scene = new MainSceneClass();
  const noop = () => {};
  (scene as any).sys = {
    settings: { data: {} },
    queueDepthSort: noop,
    events: { once: noop, on: noop, off: noop, emit: noop },
    input: { enable: noop, disable: noop }
  };
  (scene as any).make = {
    tilemap: () => ({
      addTilesetImage: () => ({}),
      createLayer: () => ({ setDepth: () => {} })
    }),
    graphics: () => ({
      fillStyle: noop,
      fillRect: noop,
      fillCircle: noop,
      lineStyle: noop,
      strokeRect: noop,
      strokeCircle: noop,
      lineBetween: noop,
      generateTexture: noop,
      destroy: noop,
      clear: noop
    })
  };
  (scene as any).textures = {
    exists: () => true
  };
  (scene as any).time = {
    now: 1000,
    addEvent: (cfg: any) => {
      let cancelled = false;
      return {
        remove: () => { cancelled = true; }
      };
    },
    delayedCall: (ms: number, fn: any) => {
      if (typeof fn === 'function') fn();
      return { remove: noop };
    }
  };
  (scene as any).events = { once: noop, on: noop, off: noop, emit: noop };
  (scene as any).tweens = { add: () => ({ remove: noop }) };

  const createMockDisplayObj = () => {
    const obj: any = {
      x: 0,
      y: 0,
      text: '',
      color: '',
      visible: true,
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setScrollFactor: () => obj,
      setPadding: () => obj,
      setWordWrapWidth: () => obj,
      setShadow: () => obj,
      setStroke: () => obj,
      setLineWidth: () => obj,
      setVisible: (v: boolean) => { obj.visible = v; return obj; },
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setTexture: (key: string) => { obj.texture = key; return obj; },
      setFrame: () => obj,
      setSize: () => obj,
      setDisplaySize: () => obj,
      setPosition: (x: number, y: number) => { obj.x = x; obj.y = y; return obj; },
      setScale: () => obj,
      setText: (t: string) => { obj.text = t; return obj; },
      setColor: (c: string) => { obj.color = c; return obj; },
      setStyle: (s: any) => { obj.style = { ...obj.style, ...s }; return obj; },
      clear: () => obj,
      removeFromDisplayList: () => obj,
      addedToScene: () => obj,
      removedFromScene: () => obj,
      addedToContainer: () => obj,
      removedFromContainer: () => obj,
      parentContainer: null,
      lineStyle: () => obj,
      strokeCircle: () => obj,
      fillStyle: () => obj,
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: () => obj,
      lineBetween: () => obj,
      add: (items: any[]) => { obj.children = items; return obj; }
    };
    return obj;
  };

  (scene as any).hud = {
    showToast: noop,
    setGatheringModeActive: noop,
    updatePartyMembers: noop,
    updateLeaderPortrait: noop,
    updateBuildOverlay: noop,
    renderStockpileModal: noop,
    renderResearchTreeModal: noop,
    renderBlacksmithingModal: noop
  };

  (scene as any).pathfinder = {
    findPath: async () => []
  };
  (scene as any).gridMatrix = Array.from({ length: 40 }, () => Array(40).fill(0));
  (scene as any).mapWidth = 40;
  (scene as any).mapHeight = 40;
  (scene as any).tileSize = 16;

  (scene as any).add = {
    existing: (obj: any) => obj,
    sprite: () => createMockDisplayObj(),
    image: () => createMockDisplayObj(),
    graphics: () => createMockDisplayObj(),
    text: () => createMockDisplayObj(),
    container: () => createMockDisplayObj(),
    circle: () => createMockDisplayObj(),
    rectangle: () => createMockDisplayObj()
  };

  (scene as any).sound = {
    play: noop,
    stopByKey: noop
  };

  (scene as any).cameras = {
    main: {
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      width: 800,
      height: 600,
      setBounds: noop,
      startFollow: noop,
      setZoom: noop,
      stopFollow: noop
    }
  };

  (scene as any).physics = {
    add: {
      group: () => ({ add: noop, remove: noop })
    }
  };

  (scene as any).input = {
    on: noop,
    keyboard: {
      on: noop,
      addKey: () => ({ on: noop, isDown: false }),
      createCursorKeys: () => ({ up: {}, down: {}, left: {}, right: {} })
    }
  };

  return { scene };
}

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { MainScene } = await import('../src/scenes/MainScene.ts');
const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');

function resetSilent(gs: any) {
  gs.clearSave();
  gs.resetToDefault();
}

async function runDiggingDeterminismTest() {
  console.log('================================================================');
  console.log('🔍 DIGGING-GATE SEED DETERMINISM AUDIT (MainScene.create())     ');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const dungeonConfig = dataLoader.getDungeonConfig();

  const testedSeeds: number[] = [1, 2, 3, 4, 5, 6, 7, 8];
  const auditResults: any[] = [];

  for (const seed of testedSeeds) {
    // -------------------------------------------------------------
    // Scenario A: Digging Research is LOCKED
    // -------------------------------------------------------------
    const gameState = GameState.getInstance();
    resetSilent(gameState);
    (gameState as any).completedResearchIds.delete('research_digging');
    assert.strictEqual(gameState.isDiggingUnlocked(), false, 'Digging must be locked initially');

    const makeRngA = () => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const dungeonA = DungeonGenerator.generate(dungeonConfig, makeRngA(), { floorNumber: 1, currentFloorSeed: seed });
    const { scene: sceneA } = createMockMainScene(MainScene, seed);
    sceneA.dungeon = dungeonA;

    const origLog = console.log;
    console.log = (...args: any[]) => {
      if (typeof args[0] === 'string' && (args[0].includes('[Debug Tools]') || args[0].includes('[Player'))) return;
      origLog(...args);
    };
    try {
      sceneA.create();
    } finally {
      console.log = origLog;
    }

    const enemiesA = sceneA.enemies.map((e: any) => ({
      id: e.enemyData.id,
      gridX: e.gridPos.x,
      gridY: e.gridPos.y,
      hp: e.hp
    }));
    const nonDigNodesA = sceneA.gatheringNodes
      .filter((n: any) => n.nodeDef.skillId !== 'digging')
      .map((n: any) => ({ id: n.nodeDef.id, x: n.x, y: n.y }));
    const digNodesA = sceneA.gatheringNodes.filter((n: any) => n.nodeDef.skillId === 'digging');
    const portalA = sceneA.dungeonPortal ? { x: sceneA.dungeonPortal.x, y: sceneA.dungeonPortal.y } : null;
    const crystalA = sceneA.teleporterCrystal ? { x: sceneA.teleporterCrystal.x, y: sceneA.teleporterCrystal.y } : null;

    // -------------------------------------------------------------
    // Scenario B: Digging Research is UNLOCKED
    // -------------------------------------------------------------
    resetSilent(gameState);
    gameState.completeResearch('research_digging');
    assert.strictEqual(gameState.isDiggingUnlocked(), true, 'Digging must be unlocked');

    const makeRngB = () => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const dungeonB = DungeonGenerator.generate(dungeonConfig, makeRngB(), { floorNumber: 1, currentFloorSeed: seed });
    const { scene: sceneB } = createMockMainScene(MainScene, seed);
    sceneB.dungeon = dungeonB;

    console.log = (...args: any[]) => {
      if (typeof args[0] === 'string' && (args[0].includes('[Debug Tools]') || args[0].includes('[Player'))) return;
      origLog(...args);
    };
    try {
      sceneB.create();
    } finally {
      console.log = origLog;
    }

    const enemiesB = sceneB.enemies.map((e: any) => ({
      id: e.enemyData.id,
      gridX: e.gridPos.x,
      gridY: e.gridPos.y,
      hp: e.hp
    }));
    const nonDigNodesB = sceneB.gatheringNodes
      .filter((n: any) => n.nodeDef.skillId !== 'digging')
      .map((n: any) => ({ id: n.nodeDef.id, x: n.x, y: n.y }));
    const digNodesB = sceneB.gatheringNodes.filter((n: any) => n.nodeDef.skillId === 'digging');
    const portalB = sceneB.dungeonPortal ? { x: sceneB.dungeonPortal.x, y: sceneB.dungeonPortal.y } : null;
    const crystalB = sceneB.teleporterCrystal ? { x: sceneB.teleporterCrystal.x, y: sceneB.teleporterCrystal.y } : null;

    // Dig spot coordinates and room resolution for unlocked scenario
    const digSpotCoords = digNodesB.map((n: any) => {
      const room = dungeonB.rooms.find((r: any) =>
        n.x >= r.x && n.x < r.x + r.width && n.y >= r.y && n.y < r.y + r.height
      );
      return {
        x: n.x,
        y: n.y,
        roomIndex: room ? room.id : -1,
        roomType: room ? room.type : 'corridor',
        roomBounds: room ? `[${room.x},${room.y} ${room.width}x${room.height}]` : 'outside'
      };
    });

    // Comparisons
    const roomsMatch = JSON.stringify(dungeonA.rooms) === JSON.stringify(dungeonB.rooms);
    const waterMatch = JSON.stringify(dungeonA.waterTiles) === JSON.stringify(dungeonB.waterTiles);
    const portalMatch = JSON.stringify(portalA) === JSON.stringify(portalB);
    const crystalMatch = JSON.stringify(crystalA) === JSON.stringify(crystalB);
    const enemiesMatch = JSON.stringify(enemiesA) === JSON.stringify(enemiesB);
    const nonDigNodesMatch = JSON.stringify(nonDigNodesA) === JSON.stringify(nonDigNodesB);

    let firstMismatch: string | null = null;
    if (!roomsMatch) firstMismatch = 'rooms';
    else if (!waterMatch) firstMismatch = 'waterTiles';
    else if (!portalMatch) firstMismatch = 'portal';
    else if (!crystalMatch) firstMismatch = 'crystal';
    else if (!enemiesMatch) firstMismatch = 'enemies';
    else if (!nonDigNodesMatch) {
      const maxLen = Math.max(nonDigNodesA.length, nonDigNodesB.length);
      for (let i = 0; i < maxLen; i++) {
        const a = nonDigNodesA[i];
        const b = nonDigNodesB[i];
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          firstMismatch = `nonDigNode[${i}]: Locked=${JSON.stringify(a)} vs Unlocked=${JSON.stringify(b)}`;
          break;
        }
      }
      if (!firstMismatch) firstMismatch = 'nonDigNodes count mismatch';
    }

    const isIdentical = roomsMatch && waterMatch && portalMatch && crystalMatch && enemiesMatch && nonDigNodesMatch;

    // Strict validation assertions per seed
    assert.strictEqual(digNodesA.length, 0, `Seed ${seed}: Must have 0 dig spots when locked`);
    assert.ok(digNodesB.length >= 2 && digNodesB.length <= 3, `Seed ${seed}: Dig spots count must be 2-3 when unlocked (got ${digNodesB.length})`);
    assert.strictEqual(isIdentical, true, `Seed ${seed}: Full scene must be identical between locked and unlocked! Mismatch: ${firstMismatch}`);
    for (const spot of digSpotCoords) {
      assert.notStrictEqual(spot.roomType, 'corridor', `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) must be inside a room, not in corridor`);
      assert.notStrictEqual(spot.roomType, 'entrance', `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) cannot spawn in entrance room`);
      assert.notStrictEqual(spot.roomType, 'boss', `Seed ${seed}: Dig spot at (${spot.x}, ${spot.y}) cannot spawn in boss room`);
    }

    const result = {
      seed,
      digNodesLocked: digNodesA.length,
      digNodesUnlocked: digNodesB.length,
      digSpotCoords,
      roomsMatch,
      waterMatch,
      portalMatch,
      crystalMatch,
      enemiesMatch,
      nonDigNodesMatch,
      nonDigCountLocked: nonDigNodesA.length,
      nonDigCountUnlocked: nonDigNodesB.length,
      isIdentical,
      firstMismatch
    };
    auditResults.push(result);

    console.log(`Seed ${seed}: Dig spots = ${digNodesB.length} (unlocked) vs ${digNodesA.length} (locked)`);
    console.log(`        Coordinates: ${digSpotCoords.map(c => `(${c.x},${c.y}) in Room ${c.roomIndex} [${c.roomType} ${c.roomBounds}]`).join(', ')}`);
    console.log(`        Rooms match: ${roomsMatch} | Water match: ${waterMatch} | Portal match: ${portalMatch} | Crystal match: ${crystalMatch}`);
    console.log(`        Enemies match: ${enemiesMatch} (Count: ${enemiesA.length} vs ${enemiesB.length})`);
    console.log(`        Non-dig nodes match: ${nonDigNodesMatch} (Count: ${nonDigNodesA.length} vs ${nonDigNodesB.length})`);
    if (!isIdentical) {
      console.log(`        ⚠️ FIRST MISMATCH: ${firstMismatch}`);
    } else {
      console.log(`        ✓ Invariance: 100% EXACT MATCH`);
    }
  }

  console.log('\n================================================================');
  console.log('📊 DIGGING DETERMINISM AUDIT SUMMARY:');
  console.log('================================================================');
  console.log(JSON.stringify(auditResults, null, 2));

  // Save report to disk
  fs.writeFileSync('scripts/digging_determinism_audit.json', JSON.stringify(auditResults, null, 2));
}

runDiggingDeterminismTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
