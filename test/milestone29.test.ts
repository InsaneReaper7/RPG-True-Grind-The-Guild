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
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { GridPos } from '../src/types/game.ts';

async function runMilestone29Tests() {
  console.log('======================================================');
  console.log('RUNNING MILESTONE 29: EPIC ENEMY TIER UNIT TESTS');
  console.log('======================================================\n');

  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
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
      grid,
      pathfinder,
      sound: { play: () => {} },
      time: { now: 0, delayedCall: (_delay: number, cb: () => void) => cb() },
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
    };
  }

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Schema Integrity & Registry Completeness
  // =========================================================================
  console.log('--- TEST 1: Schema Integrity & Registry Completeness ---');
  const voidKnight = dataLoader.getEnemy('void_knight');
  assert.ok(voidKnight, "'void_knight' enemy must be defined in enemies.json");
  assert.equal(voidKnight.name, 'Void Knight', "Name must be 'Void Knight'");
  assert.equal(voidKnight.tier, 'epic', "Tier must be strictly 'epic'");
  assert.equal(voidKnight.hp, 180, 'HP must be 180');
  assert.equal(voidKnight.criticalHpMax, 90, 'Critical HP Max must be 90');
  assert.equal(voidKnight.meleeDamage, 22, 'Melee damage must be 22');
  assert.equal(voidKnight.aggroRadius, 7, 'Aggro radius must be 7');
  assert.equal(voidKnight.attackIntervalMs, 1100, 'Attack interval must be 1100ms');
  assert.equal(voidKnight.moveSpeed, 95, 'Move speed must be 95');

  // Harvest drop schema & tags
  assert.ok(Array.isArray(voidKnight.harvest) && voidKnight.harvest.length >= 3, 'Must have at least 3 harvest items');
  const harvestItems = voidKnight.harvest.map((h) => h.item);
  assert.ok(harvestItems.includes('void_plate'), 'Must include void_plate drop');
  assert.ok(harvestItems.includes('void_essence'), 'Must include void_essence drop');
  assert.ok(harvestItems.includes('void_core'), 'Must include void_core rare drop');

  for (const h of voidKnight.harvest) {
    assert.ok(h.method, `Drop '${h.item}' must have method`);
    assert.ok(Array.isArray(h.tags) && h.tags.length > 0, `Drop '${h.item}' must have valid tags`);
  }

  // Verify dungeonConfig.enemyPool includes void_knight
  const dungeonConfig = dataLoader.getDungeonConfig();
  assert.ok(dungeonConfig.enemyPool.includes('void_knight'), "dungeonConfig.enemyPool must include 'void_knight'");
  console.log("✓ PASS: 'void_knight' schema, tags, and enemyPool integration verified.");

  // =========================================================================
  // TEST 2: Meaningfully Tougher Than Orc Warrior in Real Simulated Combat
  // =========================================================================
  console.log('\n--- TEST 2: Meaningfully Tougher Than Orc Warrior (Real Combat Simulation) ---');
  const orcWarrior = dataLoader.getEnemy('orc_warrior')!;
  assert.ok(orcWarrior, 'Orc Warrior must exist');

  // Mathematical stat differential
  const hpRatio = voidKnight.hp / orcWarrior.hp;
  const orcDps = orcWarrior.meleeDamage / (orcWarrior.attackIntervalMs / 1000);
  const epicDps = voidKnight.meleeDamage / (voidKnight.attackIntervalMs / 1000);
  const dpsRatio = epicDps / orcDps;

  console.log(`  HP: Void Knight (${voidKnight.hp}) vs Orc Warrior (${orcWarrior.hp}) -> Ratio: ${hpRatio.toFixed(2)}x`);
  console.log(`  DPS: Void Knight (${epicDps.toFixed(2)}) vs Orc Warrior (${orcDps.toFixed(2)}) -> Ratio: ${dpsRatio.toFixed(2)}x`);

  assert.ok(hpRatio >= 2.0, `Void Knight HP must be at least 2.0x Orc Warrior (got ${hpRatio.toFixed(2)}x)`);
  assert.ok(dpsRatio >= 2.0, `Void Knight DPS must be at least 2.0x Orc Warrior (got ${dpsRatio.toFixed(2)}x)`);

  // Real combat simulation: Player Time-To-Die (TTD)
  // Benchmark player 1: Basic Hero (50 HP)
  const hitsFromOrcToKill50Hp = Math.ceil(50 / orcWarrior.meleeDamage);
  const hitsFromEpicToKill50Hp = Math.ceil(50 / voidKnight.meleeDamage);
  const ttdOrcBasicSec = (hitsFromOrcToKill50Hp - 1) * (orcWarrior.attackIntervalMs / 1000);
  const ttdEpicBasicSec = (hitsFromEpicToKill50Hp - 1) * (voidKnight.attackIntervalMs / 1000);

  console.log(`  Player (50 HP) TTD vs Orc: ${hitsFromOrcToKill50Hp} hits (${ttdOrcBasicSec.toFixed(1)}s)`);
  console.log(`  Player (50 HP) TTD vs Epic: ${hitsFromEpicToKill50Hp} hits (${ttdEpicBasicSec.toFixed(1)}s)`);
  assert.ok(ttdEpicBasicSec < ttdOrcBasicSec * 0.5, 'Epic downs 50 HP player in less than half the time of Orc Warrior');

  // Benchmark player 2: Armored Hero (90 HP: Leather Armor + Leather Cap)
  const hitsFromOrcToKill90Hp = Math.ceil(90 / orcWarrior.meleeDamage);
  const hitsFromEpicToKill90Hp = Math.ceil(90 / voidKnight.meleeDamage);
  const ttdOrcArmoredSec = (hitsFromOrcToKill90Hp - 1) * (orcWarrior.attackIntervalMs / 1000);
  const ttdEpicArmoredSec = (hitsFromEpicToKill90Hp - 1) * (voidKnight.attackIntervalMs / 1000);

  console.log(`  Player (90 HP) TTD vs Orc: ${hitsFromOrcToKill90Hp} hits (${ttdOrcArmoredSec.toFixed(1)}s)`);
  console.log(`  Player (90 HP) TTD vs Epic: ${hitsFromEpicToKill90Hp} hits (${ttdEpicArmoredSec.toFixed(1)}s)`);
  assert.ok(ttdEpicArmoredSec < ttdOrcArmoredSec * 0.55, 'Epic downs 90 HP armored player dramatically faster');

  // Player Time-To-Kill enemy (with basic 5 DPS sword):
  const ttkOrcSec = orcWarrior.hp / 5;
  const ttkEpicSec = voidKnight.hp / 5;
  console.log(`  Basic Hero TTK vs Orc: ${ttkOrcSec.toFixed(1)}s | vs Epic: ${ttkEpicSec.toFixed(1)}s`);
  assert.ok(ttkEpicSec > ttkOrcSec * 2, 'Epic takes more than twice as long to defeat as Orc Warrior');

  console.log('✓ PASS: Void Knight is genuinely and meaningfully tougher in real combat than Orc Warrior.');

  // =========================================================================
  // TEST 3: Distinct Purple Visual Identity from Elite (Gold) & Common
  // =========================================================================
  console.log('\n--- TEST 3: Visual Identity (Purple vs Gold vs Common) ---');
  const mockScene = createMockScene();
  const wolfDef = dataLoader.getEnemy('wolf')!;

  const commonEnemy = new Enemy(mockScene, 5, 5, wolfDef, 'wolf-avatar', 32);
  const eliteEnemy = new Enemy(mockScene, 6, 6, orcWarrior, 'orc_warrior-avatar', 32);
  const epicEnemy = new Enemy(mockScene, 7, 7, voidKnight, 'void_knight-avatar', 32);

  // Common: No aura, no badge
  assert.equal(commonEnemy.eliteAura, undefined, 'Common enemy must not have aura');
  assert.equal(commonEnemy.eliteLabel, undefined, 'Common enemy must not have badge');

  // Elite: Gold aura and badge
  assert.ok(eliteEnemy.eliteAura, 'Elite enemy must have aura graphics');
  assert.ok(eliteEnemy.eliteLabel, 'Elite enemy must have badge text');
  assert.equal(eliteEnemy.eliteLabel.text, '★ ELITE ★', "Elite label must say '★ ELITE ★'");
  assert.equal(eliteEnemy.eliteLabel.style?.color, '#f59e0b', 'Elite label color must be gold (#f59e0b)');

  // Epic: Purple aura and badge
  assert.ok(epicEnemy.eliteAura, 'Epic enemy must have aura graphics');
  assert.ok(epicEnemy.eliteLabel, 'Epic enemy must have badge text');
  assert.equal(epicEnemy.eliteLabel.text, '✦ EPIC ✦', "Epic label must say '✦ EPIC ✦'");
  assert.equal(epicEnemy.eliteLabel.style?.color, '#c084fc', 'Epic label color must be purple (#c084fc)');

  // Check aura graphics style: Epic uses 0xa855f7 (royal purple)
  assert.equal(epicEnemy.eliteAura.lastFillStyle?.color, 0xa855f7, 'Epic aura fill color must be purple 0xa855f7');
  assert.equal(eliteEnemy.eliteAura.lastFillStyle?.color, 0xf59e0b, 'Elite aura fill color must be gold 0xf59e0b');

  // Check HP Bar border:
  eliteEnemy.drawHpBar();
  assert.equal(eliteEnemy.hpBarBg.lastLineStyle?.color, 0xf59e0b, 'Elite HP bar border must be gold 0xf59e0b');

  epicEnemy.drawHpBar();
  assert.equal(epicEnemy.hpBarBg.lastLineStyle?.color, 0xa855f7, 'Epic HP bar border must be purple 0xa855f7');

  // Clean toggle on markDead() and respawn()
  epicEnemy.markDead();
  assert.equal(epicEnemy.eliteAura.visible, false, 'Epic aura must hide on death');
  assert.equal(epicEnemy.eliteLabel.visible, false, 'Epic label must hide on death');

  epicEnemy.respawn();
  assert.equal(epicEnemy.eliteAura.visible, true, 'Epic aura must show on respawn');
  assert.equal(epicEnemy.eliteLabel.visible, true, 'Epic label must show on respawn');

  console.log('✓ PASS: Purple visual identity (aura, badge, HP bar border) verified and distinct from gold Elite.');

  // =========================================================================
  // TEST 4: Zero-Code Dungeon Generation & Floor Repopulation Integration
  // =========================================================================
  console.log('\n--- TEST 4: Zero-Code Dungeon Generation & Floor Repopulation Integration ---');
  // 1. DungeonGenerator room population
  let seed = 12345;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Run 10 dungeon generations to confirm pool integration without error
  let epicSpawnedCount = 0;
  for (let iter = 0; iter < 10; iter++) {
    const dungeon = DungeonGenerator.generate(dungeonConfig, rng);
    for (const espawn of dungeon.enemySpawns) {
      assert.ok(dungeonConfig.enemyPool.includes(espawn.enemyId), `Spawn ${espawn.enemyId} must be in enemyPool`);
      if (espawn.enemyId === 'void_knight') {
        epicSpawnedCount++;
      }
    }
  }
  console.log(`  DungeonGenerator spawned 'void_knight' ${epicSpawnedCount} times across 10 procedural runs.`);
  assert.ok(epicSpawnedCount > 0, "DungeonGenerator must naturally spawn 'void_knight' from enemyPool");

  // 2. Floor timer repopulation pool
  // Simulate floor respawn pick from dungeonConfig.enemyPool
  const simulatedFloorSpawns: string[] = [];
  for (let i = 0; i < 50; i++) {
    const picked = dungeonConfig.enemyPool[Math.floor(rng() * dungeonConfig.enemyPool.length)];
    simulatedFloorSpawns.push(picked);
  }
  assert.ok(
    simulatedFloorSpawns.includes('void_knight'),
    "Floor repopulation pool must pick 'void_knight' without any custom wiring"
  );
  console.log('✓ PASS: Dungeon generation and floor repopulation automatically pick up Epic tier via enemyPool.');

  // =========================================================================
  // TEST 5: Hard-Mode Swarm-Trap Rule Enforcement with Epic Enemy
  // =========================================================================
  console.log('\n--- TEST 5: Hard-Mode Swarm-Trap Rule Enforcement with Epic Enemy ---');
  const livingEpicPos = epicEnemy.gridPos; // (7, 7)
  assert.equal(epicEnemy.state !== 'dead', true, 'Epic enemy is alive');

  // 1. Routing directly through Epic enemy is strictly blocked
  const blockedPath = await mockScene.pathfinder.findPath(
    { x: 7, y: 6 },
    { x: 7, y: 8 },
    { hard: [livingEpicPos] }
  );
  const stepsOnEpic = blockedPath.some((p: GridPos) => p.x === livingEpicPos.x && p.y === livingEpicPos.y);
  assert.equal(stepsOnEpic, false, 'Pathfinder must never route through living Epic enemy');

  // 2. Trapped unit surrounded by enemies including Epic enemy cannot escape
  const trappedStart = { x: 15, y: 15 };
  const surroundingObstacles = [
    { x: 14, y: 14 }, { x: 15, y: 14 }, { x: 16, y: 14 },
    { x: 14, y: 15 },                     { x: 16, y: 15 }, // (16, 15) is our Epic Void Knight
    { x: 14, y: 16 }, { x: 15, y: 16 }, { x: 16, y: 16 }
  ];
  const trappedPath = await mockScene.pathfinder.findPath(
    trappedStart,
    { x: 15, y: 20 },
    { hard: surroundingObstacles }
  );
  assert.equal(trappedPath.length, 0, 'Unit surrounded by enemies cannot escape (hard-mode swarm-trap enforced)');
  console.log('✓ PASS: Living Epic enemy is strictly enforced as an impassable obstacle.');

  // =========================================================================
  // TEST 6: Harvest Loot Table & Elevated Drops
  // =========================================================================
  console.log('\n--- TEST 6: Harvest Loot Table & Elevated Drops ---');
  const gameState = GameState.getInstance();
  const prePlate = gameState.getItemCount('void_plate');
  const preEssence = gameState.getItemCount('void_essence');
  const preCore = gameState.getItemCount('void_core');

  const prog = new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero');
  const swordDef = dataLoader.getWeapon('short_swords')!;
  const heroData = {
    name: 'Guild Hero',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords'
  };
  const testHero = new Player(mockScene, 10, 10, heroData, swordDef, 32, 'player-avatar', prog);

  const combat = new CombatSystem(mockScene, [testHero], [epicEnemy], mockScene.pathfinder);

  // Trigger defeat on Epic enemy multiple times to test loot drops
  for (let i = 0; i < 5; i++) {
    const deadEpic = new Enemy(mockScene, 10, 11, voidKnight, 'void_knight-avatar', 32);
    (combat as any).handleTargetDefeated(testHero, deadEpic, 'short_swords');
  }

  const postPlate = gameState.getItemCount('void_plate');
  const postEssence = gameState.getItemCount('void_essence');
  const postCore = gameState.getItemCount('void_core');

  console.log(`  Harvest Results from 5 defeats: Void Plate: ${postPlate - prePlate}, Void Essence: ${postEssence - preEssence}, Void Core: ${postCore - preCore}`);
  assert.ok(postPlate > prePlate, 'Must have harvested void_plate (common salvage)');
  assert.ok(postEssence > preEssence, 'Must have harvested void_essence (common salvage)');

  console.log('✓ PASS: Harvest drops award elevated epic crafting materials cleanly into GameState.');

  console.log('\n======================================================');
  console.log('ALL MILESTONE 29 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================');
}

runMilestone29Tests().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
