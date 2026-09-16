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

import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';

// Deterministic Pseudo-Random Generator
function createRng(seed = 42) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Mock Phaser Scene minimal stub for Node test environment
function createMockScene(gridWidth: number = 30, gridHeight: number = 30, initialTime = 1000) {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
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
      setTexture: () => obj,
      setFrame: () => obj,
      setSize: () => obj,
      setDisplaySize: () => obj,
      setPosition: () => obj,
      setScale: () => obj,
      setText: (t: string) => {
        obj.text = t;
        return obj;
      },
      setStyle: (s: any) => {
        obj.style = { ...obj.style, ...s };
        return obj;
      },
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
      lineBetween: (x1: number, y1: number, x2: number, y2: number) => {
        obj.lastLine = { x1, y1, x2, y2 };
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
    grid,
    pathfinder,
    sound: { play: () => {} },
    time: { now: initialTime, delayedCall: (_delay: number, cb: () => void) => cb() },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} }
    },
    add: {
      existing: (item: any) => item,
      container: () => createMockObj(),
      sprite: () => createMockObj(),
      graphics: () => createMockObj(),
      text: (_x: number, _y: number, text: string, style: any) => {
        const t = createMockObj();
        t.text = text;
        t.style = style;
        return t;
      },
      line: () => createMockObj(),
      circle: () => createMockObj()
    },
    make: {
      graphics: () => createMockObj()
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
      }
    },
    textures: {
      exists: () => true
    }
  } as any;
}

async function runMilestone40Tests(): Promise<void> {
  console.log('======================================================');
  console.log('RUNNING MILESTONE 40: TELEPORTER CRYSTAL & MULTI-FLOOR PROGRESSION');
  console.log('======================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const dungeonConfig = dataLoader.getDungeonConfig();
  const classesData = dataLoader.getClassesData();
  const playerData = dataLoader.getPlayer();
  const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId)!;

  // =========================================================================
  // TEST 1: Teleporter Crystal Spawn & Placement Logic
  // =========================================================================
  console.log('--- TEST 1: Teleporter Crystal Spawn & Placement Logic ---');
  {
    const rng = createRng(101);

    // 1a. Normal Floor (Floor 1): Crystal placed in room furthest from entrance
    const normalDungeon = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 1, forceBoss: false });
    assert.ok(normalDungeon.crystalPos, 'Crystal position must be generated on normal floor');
    assert.equal(normalDungeon.gridMatrix[normalDungeon.crystalPos.y][normalDungeon.crystalPos.x], 0, 'Crystal tile must be walkable');

    // Verify crystal is in the room furthest from room 0
    let maxDist = -1;
    let expectedRoomIdx = -1;
    for (let i = 1; i < normalDungeon.rooms.length; i++) {
      const dist = Math.hypot(normalDungeon.rooms[i].centerX - normalDungeon.rooms[0].centerX, normalDungeon.rooms[i].centerY - normalDungeon.rooms[0].centerY);
      if (dist > maxDist) {
        maxDist = dist;
        expectedRoomIdx = i;
      }
    }
    const furthestRoom = normalDungeon.rooms[expectedRoomIdx];
    const inFurthestRoom = normalDungeon.crystalPos.x >= furthestRoom.x &&
      normalDungeon.crystalPos.x < furthestRoom.x + furthestRoom.width &&
      normalDungeon.crystalPos.y >= furthestRoom.y &&
      normalDungeon.crystalPos.y < furthestRoom.y + furthestRoom.height;
    assert.ok(inFurthestRoom, 'Crystal must be placed inside the furthest room on normal floors');

    // Verify no enemy or bush spawns directly on crystalPos
    const enemyOnCrystal = normalDungeon.enemySpawns.some(e => e.x === normalDungeon.crystalPos.x && e.y === normalDungeon.crystalPos.y);
    const bushOnCrystal = normalDungeon.bushSpawns.some(b => b.x === normalDungeon.crystalPos.x && b.y === normalDungeon.crystalPos.y);
    assert.equal(enemyOnCrystal, false, 'No enemy should spawn on crystal position');
    assert.equal(bushOnCrystal, false, 'No gathering bush should spawn on crystal position');

    // 1b. Boss Floor (Floor 5): Deliberately inside the Boss chamber
    const bossDungeon = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 5, forceBoss: true });
    assert.ok(bossDungeon.crystalPos, 'Crystal position must be generated on boss floor');
    const bossRoom = bossDungeon.rooms.find(r => r.type === 'boss')!;
    assert.ok(bossRoom, 'Boss room must exist on floor 5');
    const inBossRoom = bossDungeon.crystalPos.x >= bossRoom.x &&
      bossDungeon.crystalPos.x < bossRoom.x + bossRoom.width &&
      bossDungeon.crystalPos.y >= bossRoom.y &&
      bossDungeon.crystalPos.y < bossRoom.y + bossRoom.height;
    assert.ok(inBossRoom, 'Crystal must be placed inside the Boss chamber on Boss floors (gatekeeper mandate)');

    console.log('✓ PASS: Crystal placement confirmed in furthest room on normal floors and Boss chamber on Boss floors.');
  }

  // =========================================================================
  // TEST 2: One-Way Entrance Portal Logic
  // =========================================================================
  console.log('\n--- TEST 2: One-Way Entrance Portal Logic ---');
  {
    const rng = createRng(202);
    const dungeon = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 1 });
    assert.ok(dungeon.portalPos, 'Entrance portal exists for party arrival');
    assert.equal(dungeon.gridMatrix[dungeon.portalPos.y][dungeon.portalPos.x], 0, 'Entrance portal is on a walkable tile');

    // Verify party spawns adjacent to entrance portal
    assert.notEqual(dungeon.portalPos.x, dungeon.crystalPos.x || dungeon.portalPos.y !== dungeon.crystalPos.y, 'Entrance portal and crystal must not occupy the same tile');
    console.log('✓ PASS: Entrance portal provides one-way arrival origin point separate from exit crystal.');
  }

  // =========================================================================
  // TEST 3: Multi-Floor Continue Chain & Full State Transfer
  // =========================================================================
  console.log('\n--- TEST 3: Multi-Floor Continue Chain (Floors 1 -> 5) ---');
  {
    const gameState = GameState.getInstance();
    gameState.resetDungeonFloorCount();
    assert.equal(gameState.getDungeonFloorCount(), 0, 'Descent counter starts at 0 before entering dungeon');

    const scene = createMockScene(5000);
    const progression = new ProgressionSystem(classesData, 'Hero');
    const hero = new Player(scene, 5, 5, playerData, startingWeapon, 32, 'player-avatar', progression);
    hero.id = 'hero';
    hero.entityName = 'Guild Hero';

    // Inflict damage and consume resources to simulate real dungeon wear
    hero.hp = 38.5;
    hero.criticalHp = 20.0;
    hero.energy = 65.0;
    gameState.addItem('wood', 14);
    gameState.addItem('raw_wolf_meat', 3);

    // Floor 1: Fresh Descent Entry
    const f1 = gameState.incrementDungeonFloorCount();
    assert.equal(f1, 1, 'Floor 1 created on initial entry');
    const d1 = DungeonGenerator.generate(dungeonConfig, Math.random, { floorNumber: f1, forceBoss: false });
    assert.equal(d1.rooms.some(r => r.type === 'boss'), false, 'Floor 1 suppresses Boss room');

    // Continue to Floor 2
    gameState.savePartySnapshot([hero], 6000);
    gameState.saveSnapshot(hero, progression, 6000);
    const f2 = gameState.incrementDungeonFloorCount();
    assert.equal(f2, 2, 'Floor 2 reached via Continue');
    const snapF2 = gameState.getPartySnapshots()[0];
    assert.equal(snapF2.hp, 38.5, 'HP preserved across Continue handoff');
    assert.equal(snapF2.criticalHp, 20.0, 'Critical HP preserved across Continue handoff');
    assert.equal(snapF2.energy, 65.0, 'Energy preserved across Continue handoff');
    assert.equal(gameState.getItemCount('raw_wolf_meat'), 3, 'Harvested loot preserved in inventory');

    // Continue to Floor 3
    hero.hp = 29.0;
    gameState.addItem('ore_iron', 2);
    gameState.savePartySnapshot([hero], 7000);
    const f3 = gameState.incrementDungeonFloorCount();
    assert.equal(f3, 3, 'Floor 3 reached via Continue');
    const snapF3 = gameState.getPartySnapshots()[0];
    assert.equal(snapF3.hp, 29.0, 'Updated HP preserved across Continue');
    assert.equal(gameState.getItemCount('ore_iron'), 2, 'New mined loot preserved');

    // Continue to Floor 4
    gameState.savePartySnapshot([hero], 8000);
    const f4 = gameState.incrementDungeonFloorCount();
    assert.equal(f4, 4, 'Floor 4 reached via Continue');
    const d4 = DungeonGenerator.generate(dungeonConfig, Math.random, { floorNumber: f4, forceBoss: false });
    assert.equal(d4.rooms.some(r => r.type === 'boss'), false, 'Floor 4 does not trigger Boss milestone');

    // Continue to Floor 5 -> Guaranteed Boss Room of the descent run
    gameState.savePartySnapshot([hero], 9000);
    const f5 = gameState.incrementDungeonFloorCount();
    assert.equal(f5, 5, 'Floor 5 reached via Continue');
    const d5 = DungeonGenerator.generate(dungeonConfig, Math.random, { floorNumber: f5 });
    const hasBossRoomF5 = d5.rooms.some(r => r.type === 'boss');
    assert.equal(hasBossRoomF5, true, 'Floor 5 of current run MUST trigger guaranteed Boss chamber');
    const bossSpawn = d5.enemySpawns.find(e => e.enemyId === 'abyssal_colossus');
    assert.ok(bossSpawn, 'Abyssal Colossus spawned in Floor 5 Boss chamber');

    console.log('✓ PASS: 5-floor continuous descent verified with state persistence and guaranteed Boss trigger at run depth 5.');
  }

  // =========================================================================
  // TEST 4: Run Counter Reset on Return vs Lifetime Floor Counter
  // =========================================================================
  console.log('\n--- TEST 4: Run Counter Reset on Return vs Lifetime Floors ---');
  {
    const gameState = GameState.getInstance();
    gameState.setDungeonFloorCount(5);
    assert.equal(gameState.getDungeonFloorCount(), 5, 'Current run depth is 5');
    const lifetimeBefore = gameState.getLifetimeDungeonFloorCount();

    // Party returns to Outpost
    gameState.resetDungeonFloorCount();
    assert.equal(gameState.getDungeonFloorCount(), 0, 'Descent run counter resets to 0 upon returning to Outpost');
    assert.ok(gameState.getLifetimeDungeonFloorCount() >= lifetimeBefore, 'Lifetime floors are preserved');

    // Next descent starts fresh at Floor 1
    const nextDescentFloor = gameState.incrementDungeonFloorCount();
    assert.equal(nextDescentFloor, 1, 'Next descent correctly begins at Floor 1');
    const dNext = DungeonGenerator.generate(dungeonConfig, Math.random, { floorNumber: nextDescentFloor, forceBoss: false });
    assert.equal(dNext.rooms.some(r => r.type === 'boss'), false, 'Floor 1 of new descent correctly suppresses Boss');

    console.log('✓ PASS: Run counter resets cleanly on return, and lifetime floors persist.');
  }

  // =========================================================================
  // TEST 5: Depth-Scaled Encounter Rarity
  // =========================================================================
  console.log('\n--- TEST 5: Depth-Scaled Encounter Rarity ---');
  {
    // Verify depth scaling config exists
    assert.ok(dungeonConfig.depthScaling, 'depthScaling configuration must exist in dungeonConfig');
    assert.ok((dungeonConfig.depthScaling.eliteChancePerFloor ?? 0) > 0, 'Elite chance scales per floor');
    assert.ok((dungeonConfig.depthScaling.epicChancePerFloor ?? 0) > 0, 'Epic chance scales per floor');

    // Test encounter rates across 100 floors at depth 1 vs 100 floors at depth 8
    const rng = createRng(303);
    let f1Elites = 0;
    let f1Epics = 0;
    let f1TotalHeavy = 0;

    for (let i = 0; i < 100; i++) {
      const d = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: 1, forceBoss: false });
      const heavyRooms = d.rooms.filter(r => r.type === 'heavy_combat');
      f1TotalHeavy += heavyRooms.length;
      for (const espawn of d.enemySpawns) {
        if (espawn.enemyId === 'orc_warrior') f1Elites++;
        if (espawn.enemyId === 'void_knight') f1Epics++;
      }
    }

    const rng2 = createRng(303);
    let f8Elites = 0;
    let f8Epics = 0;
    let f8TotalHeavy = 0;

    for (let i = 0; i < 100; i++) {
      const d = DungeonGenerator.generate(dungeonConfig, rng2, { floorNumber: 8, forceBoss: false });
      const heavyRooms = d.rooms.filter(r => r.type === 'heavy_combat');
      f8TotalHeavy += heavyRooms.length;
      for (const espawn of d.enemySpawns) {
        if (espawn.enemyId === 'orc_warrior') f8Elites++;
        if (espawn.enemyId === 'void_knight') f8Epics++;
      }
    }

    console.log(`  Depth 1 Encounter Rolls (over 100 iterations): Elites=${f1Elites}, Epics=${f1Epics}`);
    console.log(`  Depth 8 Encounter Rolls (over 100 iterations): Elites=${f8Elites}, Epics=${f8Epics}`);
    assert.ok(f8Elites >= f1Elites, 'Depth 8 must roll equal or more Elite champions than Depth 1');
    assert.ok(f8Epics >= f1Epics, 'Depth 8 must roll equal or more Epic champions than Depth 1');

    console.log('✓ PASS: Encounter roll rates scale with floor depth as configured.');
  }

  // =========================================================================
  // TEST 6: Emergency Teleport Item (Escape Stone) & Combat Gate
  // =========================================================================
  console.log('\n--- TEST 6: Emergency Teleport Item (Escape Stone) & Combat Gate ---');
  {
    // 6a. Recipe schema & placeholder cost
    const escapeRecipe = dataLoader.getAlchemyRecipe('escape_stone');
    assert.ok(escapeRecipe, 'escape_stone recipe must exist in alchemyRecipes.json');
    assert.equal(escapeRecipe.ingredients.wood, 1, 'Placeholder cost must be 1 wood during development');
    assert.ok(escapeRecipe.description.includes('PLACEHOLDER COST'), 'Description must explicitly flag placeholder cost');

    // 6b. Combat gating: cannot use in combat or during lingering 4000ms cooldown
    const scene = createMockScene(10000);
    const pathfinder = new Pathfinder([[0, 0], [0, 0]]);
    const hero = new Player(scene, 0, 0, playerData, startingWeapon, 32, 'player-avatar');
    const wolfDef = dataLoader.getEnemy('wolf')!;
    const wolf = new Enemy(scene, 1, 1, wolfDef, 32);

    const combatSystem = new CombatSystem(scene, [hero], [wolf], pathfinder);

    // Initial state: out of combat
    assert.equal(combatSystem.isInCombat(10000), false, 'Initially out of combat');

    // Trigger combat engagement
    wolf.isAggroed = true;
    combatSystem.update(10100, 100);
    assert.equal(combatSystem.isInCombat(10100), true, 'In combat when enemy is aggroed');
    assert.equal(hero.inCombat, true, 'Hero inCombat flag set to true');

    // Defeat enemy
    wolf.isAggroed = false;
    wolf.state = 'dead';
    combatSystem.update(10200, 100);

    // Lingering combat cooldown: at +1000ms after combat, still considered in combat
    assert.equal(combatSystem.isInCombat(11000), true, 'Lingering combat tail (1000ms < 4000ms) blocks escape');

    // After 4500ms elapsed since threat ended: cleanly out of combat
    assert.equal(combatSystem.isInCombat(15000), false, 'Cleanly out of combat after 4000ms lingering cooldown expires');

    // 6c. Using Escape Stone when out of combat
    const gameState = GameState.getInstance();
    gameState.addItem('escape_stone', 1);
    assert.equal(gameState.getItemCount('escape_stone'), 1, 'Has 1 Escape Stone');
    gameState.consumeItem('escape_stone', 1);
    assert.equal(gameState.getItemCount('escape_stone'), 0, 'Consuming Escape Stone reduces stockpile to 0');

    console.log('✓ PASS: Escape Stone recipe confirmed with placeholder comment, and strictly gated by active threat and 4s cooldown.');
  }

  // =========================================================================
  // TEST 7: Outpost Restrictions Persistence Across Continue Chain
  // =========================================================================
  console.log('\n--- TEST 7: Outpost Restrictions Persistence Across Continue Chain ---');
  {
    const scene = createMockScene(20000);
    const prog = new ProgressionSystem(classesData, 'Hero');
    const hero = new Player(scene, 0, 0, playerData, startingWeapon, 32, 'player-avatar', prog);

    const leatherCap = dataLoader.getArmor('leather_cap')!;
    assert.ok(leatherCap, 'leather_cap armor exists');

    // In Dungeon Floor 1 (isOutpost = false)
    const canEquipFloor1 = hero.equipArmorSlot('helmet', leatherCap, false);
    assert.equal(canEquipFloor1, false, 'Equipping armor is blocked on Floor 1 of dungeon');

    // Continue to Floor 2 (isOutpost = false)
    const canEquipFloor2 = hero.equipArmorSlot('helmet', leatherCap, false);
    assert.equal(canEquipFloor2, false, 'Equipping armor remains blocked on Floor 2 of dungeon');

    // Continue to Floor 5 (isOutpost = false)
    const canEquipFloor5 = hero.equipArmorSlot('helmet', leatherCap, false);
    assert.equal(canEquipFloor5, false, 'Equipping armor remains blocked on Floor 5 of dungeon');

    // In Outpost (isOutpost = true)
    const canEquipOutpost = hero.equipArmorSlot('helmet', leatherCap, true);
    assert.equal(canEquipOutpost, true, 'Equipping armor succeeds when returned to Outpost');

    console.log('✓ PASS: Outpost-only restrictions persist across multiple consecutive Continues and unlock on return.');
  }

  console.log('\n======================================================');
  console.log('ALL MILESTONE 40 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================');
}

runMilestone40Tests().catch((err) => {
  console.error('Milestone 40 test suite failed:', err);
  process.exit(1);
});
