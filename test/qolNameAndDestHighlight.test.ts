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

// Setup browser globals before Phaser modules are loaded
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

// Expose window directly on globalThis
(globalThis as any).window = (global as any).window;

function createMockScene(pathfinder?: any, gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const mockObjects: any[] = [];
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
      setVisible: (v: boolean) => {
        obj.visible = v;
        return obj;
      },
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setPosition: () => obj,
      setScale: () => obj,
      clear: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      lineStyle: (w: number, color: number, alpha: number) => {
        obj.lastLineStyle = { width: w, color, alpha };
        return obj;
      },
      lineBetween: () => obj,
      strokeCircle: (x: number, y: number, r: number) => {
        obj.lastCircle = { x, y, r };
        return obj;
      },
      fillStyle: (color: number, alpha: number) => {
        obj.lastFillStyle = { color, alpha };
        return obj;
      },
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: (x: number, y: number, w: number, h: number) => {
        obj.lastStrokeRect = { x, y, w, h };
        return obj;
      },
      visible: true,
      text: ''
    };
    mockObjects.push(obj);
    return obj;
  };

  return {
    tileSize: 32,
    gridWidth,
    gridHeight,
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { queueDepthSort: () => {}, add: () => {}, remove: () => {} }
    },
    add: {
      existing: (obj: any) => obj,
      sprite: () => createMockObj(),
      graphics: () => createMockObj(),
      text: (x: number, y: number, text: string, style: any) => {
        const obj = createMockObj();
        obj.x = x;
        obj.y = y;
        obj.text = text;
        obj.style = style;
        return obj;
      },
      container: () => createMockObj()
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    time: {
      delayedCall: () => ({ remove: () => {} }),
      now: 1000
    },
    textures: {
      exists: () => true
    }
  };
}

async function runTests() {
  console.log('======================================================');
  console.log('RUNNING QOL: ENEMY NAME LABELS & DESTINATION HIGHLIGHT TESTS');
  console.log('======================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { MainScene } = await import('../src/scenes/MainScene.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const mockScene = createMockScene();

  // -------------------------------------------------------------------------
  // TEST 1: Enemy Name Labels across All Tiers
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Enemy Name Labels Across All Tiers ---');

  const wolfDef = dataLoader.getEnemy('wolf')!;
  const orcDef = dataLoader.getEnemy('orc_warrior')!;
  const voidDef = dataLoader.getEnemy('void_knight')!;
  const bossDef = dataLoader.getEnemy('abyssal_colossus')!;

  const commonWolf = new Enemy(mockScene, 1, 1, wolfDef, 'wolf-avatar', 32);
  const eliteOrc = new Enemy(mockScene, 2, 2, orcDef, 'orc_warrior-avatar', 32);
  const epicVoid = new Enemy(mockScene, 3, 3, voidDef, 'void_knight-avatar', 32);
  const bossColossus = new Enemy(mockScene, 4, 4, bossDef, 'abyssal_colossus-avatar', 32);

  // Common: Displays name label, but no tier badge
  assert.equal(commonWolf.eliteLabel, undefined, 'Common enemy must not have an elite badge');
  assert.ok(commonWolf.nameLabel, 'Common enemy MUST instantiate a nameLabel');
  assert.equal(commonWolf.nameLabel.text, 'Wolf', 'Common enemy nameLabel must display "Wolf"');
  assert.equal(commonWolf.nameLabel.y, -34, 'Common enemy nameLabel must be positioned at y = -34 above HP bar');

  // Elite: Displays both tier badge and name label
  assert.ok(eliteOrc.eliteLabel, 'Elite enemy must have an elite badge');
  assert.equal(eliteOrc.eliteLabel.text, '★ ELITE ★', 'Elite badge must say "★ ELITE ★"');
  assert.equal(eliteOrc.eliteLabel.y, -45, 'Elite badge must be positioned above name at y = -45');
  assert.ok(eliteOrc.nameLabel, 'Elite enemy MUST instantiate a nameLabel');
  assert.equal(eliteOrc.nameLabel.text, 'Orc Warrior', 'Elite enemy nameLabel must display "Orc Warrior"');
  assert.equal(eliteOrc.nameLabel.y, -34, 'Elite enemy nameLabel must be positioned at y = -34 above HP bar');

  // Epic: Displays both tier badge and name label
  assert.ok(epicVoid.eliteLabel, 'Epic enemy must have an epic badge');
  assert.equal(epicVoid.eliteLabel.text, '✦ EPIC ✦', 'Epic badge must say "✦ EPIC ✦"');
  assert.equal(epicVoid.eliteLabel.y, -45, 'Epic badge must be positioned above name at y = -45');
  assert.ok(epicVoid.nameLabel, 'Epic enemy MUST instantiate a nameLabel');
  assert.equal(epicVoid.nameLabel.text, 'Void Knight', 'Epic enemy nameLabel must display "Void Knight"');
  assert.equal(epicVoid.nameLabel.y, -34, 'Epic enemy nameLabel must be positioned at y = -34 above HP bar');

  // Boss: Displays both tier badge and name label
  assert.ok(bossColossus.eliteLabel, 'Boss enemy must have a boss badge');
  assert.equal(bossColossus.eliteLabel.text, '👑 BOSS 👑', 'Boss badge must say "👑 BOSS 👑"');
  assert.equal(bossColossus.eliteLabel.y, -46, 'Boss badge must be positioned above name at y = -46');
  assert.ok(bossColossus.nameLabel, 'Boss enemy MUST instantiate a nameLabel');
  assert.equal(bossColossus.nameLabel.text, 'Abyssal Colossus', 'Boss enemy nameLabel must display "Abyssal Colossus"');
  assert.equal(bossColossus.nameLabel.y, -34, 'Boss enemy nameLabel must be positioned at y = -34 above HP bar');

  // Death hides nameLabel
  commonWolf.markDead();
  assert.equal(commonWolf.nameLabel.visible, false, 'Name label must be hidden when enemy dies');
  eliteOrc.markDead();
  assert.equal(eliteOrc.nameLabel.visible, false, 'Elite name label must be hidden on death');
  assert.equal(eliteOrc.eliteLabel.visible, false, 'Elite badge must be hidden on death');

  // Respawn restores nameLabel
  commonWolf.respawn();
  assert.equal(commonWolf.nameLabel.visible, true, 'Name label must be restored when enemy respawns');
  eliteOrc.respawn();
  assert.equal(eliteOrc.nameLabel.visible, true, 'Elite name label must be restored on respawn');
  assert.equal(eliteOrc.eliteLabel.visible, true, 'Elite badge must be restored on respawn');

  console.log('✓ PASS: All enemies consistently display their name labels alongside tier badges without collision.');

  // -------------------------------------------------------------------------
  // TEST 2: Destination Highlight Persists Until Arrival, Not on a Timer
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Destination Highlight Persists Until Arrival ---');

  const heroData: any = {
    name: 'Guild Hero',
    maxHp: 100,
    criticalHpMax: 50,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1
  };
  const swordDef = dataLoader.getWeapon('iron_shortsword')!;
  const testPlayer = new Player(mockScene, 0, 0, heroData, swordDef, 32, 'player-avatar');

  // Setup mock MainScene
  const sceneInstance = new MainScene();
  (sceneInstance as any).party = [testPlayer];
  (sceneInstance as any).tileSize = 32;
  (sceneInstance as any).moveHighlightGraphics = mockScene.add.graphics();

  // 1. Show destination highlight for a 5-tile move to (5, 0)
  const destPos = { x: 5, y: 0 };
  sceneInstance.showMoveDestinationHighlights([destPos], [testPlayer]);

  assert.equal(sceneInstance.activeMoveHighlights.length, 1, 'activeMoveHighlights must contain 1 destination');
  assert.equal(sceneInstance.activeMoveHighlights[0].dest.x, 5, 'Destination X must be 5');
  assert.equal(sceneInstance.activeMoveHighlights[0].dest.y, 0, 'Destination Y must be 0');

  // Set unit traveling along path
  testPlayer.followPath([
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
    { x: 5, y: 0 }
  ]);

  assert.equal(testPlayer.isMoving(), true, 'Player should be actively moving');

  // Step 1: Simulate several updates while player is in mid-journey (at tile 2)
  for (let t = 0; t < 10; t++) {
    testPlayer.update(1000 + t * 50, 50);
    sceneInstance.updateMoveDestinationHighlights();
  }

  // Unit has not yet reached (5, 0) - still at an intermediate tile
  assert.ok(testPlayer.gridPos.x < 5, 'Player should still be on path');
  assert.equal(sceneInstance.activeMoveHighlights.length, 1, 'Highlight must NOT fade/clear while player is still traveling!');

  // Step 2: Continue simulating until player arrives at destination (5, 0)
  for (let t = 0; t < 50; t++) {
    testPlayer.update(1500 + t * 50, 50);
    sceneInstance.updateMoveDestinationHighlights();
    if (!testPlayer.isMoving()) break;
  }

  assert.equal(testPlayer.gridPos.x, 5, 'Player must have arrived at destination tile 5');
  assert.equal(testPlayer.isMoving(), false, 'Player must have stopped moving on arrival');
  assert.equal(sceneInstance.activeMoveHighlights.length, 0, 'Highlight must clear exactly upon arrival at destination!');

  console.log('✓ PASS: Destination highlight persisted throughout movement and cleared exactly upon arrival.');

  // -------------------------------------------------------------------------
  // TEST 2B: Destination Highlight Clears Immediately on Combat Interruption
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2B: Destination Highlight Clears on Combat Interruption ---');
  testPlayer.gridPos = { x: 0, y: 0 };
  testPlayer.x = 16;
  testPlayer.y = 16;
  testPlayer.inCombat = false;
  testPlayer.targetEntity = null;

  sceneInstance.showMoveDestinationHighlights([{ x: 8, y: 0 }], [testPlayer]);
  assert.equal(sceneInstance.activeMoveHighlights.length, 1, 'Highlight should be active for (8, 0)');

  testPlayer.followPath([
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 }
  ]);
  assert.equal(testPlayer.isMoving(), true, 'Player starts moving');

  // Player engages in combat mid-movement
  testPlayer.inCombat = true;
  testPlayer.targetEntity = { id: 'goblin_target', state: 'chasing' } as any;

  sceneInstance.updateMoveDestinationHighlights();
  assert.equal(
    sceneInstance.activeMoveHighlights.length,
    0,
    'Destination highlight MUST clear immediately when movement is interrupted by combat engagement!'
  );
  console.log('✓ PASS: Destination highlight cleared immediately upon combat engagement.');

  // -------------------------------------------------------------------------
  // TEST 2C: Destination Highlight Clears on Blocked Path / Stop Movement
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2C: Destination Highlight Clears on Path Abandonment / Stop Movement ---');
  testPlayer.inCombat = false;
  testPlayer.targetEntity = null;
  testPlayer.gridPos = { x: 2, y: 0 };
  testPlayer.x = 2 * 32 + 16;

  sceneInstance.showMoveDestinationHighlights([{ x: 10, y: 0 }], [testPlayer]);
  assert.equal(sceneInstance.activeMoveHighlights.length, 1, 'Highlight active for (10, 0)');

  testPlayer.followPath([
    { x: 3, y: 0 },
    { x: 4, y: 0 }
  ]);
  assert.equal(testPlayer.isMoving(), true, 'Player moving toward (10, 0)');

  // Path blocked: stopMovement() called halfway at tile (2, 0)
  testPlayer.stopMovement();
  assert.equal(testPlayer.isMoving(), false, 'Player movement halted');
  assert.notEqual(testPlayer.gridPos.x, 10, 'Player did NOT reach destination');

  sceneInstance.updateMoveDestinationHighlights();
  assert.equal(
    sceneInstance.activeMoveHighlights.length,
    0,
    'Destination highlight MUST clear when movement is abandoned/halted before arrival!'
  );
  console.log('✓ PASS: Destination highlight cleared immediately upon path abandonment/halt.');

  // -------------------------------------------------------------------------
  // TEST 2D: Destination Highlight Clears on Retargeting (New Destination Issued)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2D: Destination Highlight Clears on Retargeting ---');
  testPlayer.gridPos = { x: 0, y: 0 };
  sceneInstance.showMoveDestinationHighlights([{ x: 15, y: 0 }], [testPlayer]);
  assert.equal(sceneInstance.activeMoveHighlights[0].dest.x, 15, 'Initial destination is (15, 0)');

  testPlayer.followPath([{ x: 1, y: 0 }]);
  // User supersedes with a new move command before reaching (15, 0)
  testPlayer.claimedDestination = { x: 20, y: 5 };

  sceneInstance.updateMoveDestinationHighlights();
  assert.equal(
    sceneInstance.activeMoveHighlights.length,
    0,
    'Stale destination highlight MUST clear when claimedDestination is retargeted!'
  );
  console.log('✓ PASS: Stale destination highlight cleared immediately when retargeted.');

  console.log('\n======================================================');
  console.log('ALL QOL UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
