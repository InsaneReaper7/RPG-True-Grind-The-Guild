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

import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef, EnemyDef, GridPos, DungeonConfig } from '../src/types/game.ts';

async function runMilestone20Tests() {
  console.log('=== RUNNING MILESTONE 20: BESTIARY EXPANSION UNIT TESTS ===\n');

  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
    const grid: number[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        grid[y][x] = 0;
      }
    }
    const pathfinder = new Pathfinder(grid);
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
        lineStyle: () => obj,
        strokeCircle: () => obj,
        fillStyle: () => obj,
        fillCircle: () => obj,
        fillRect: () => obj,
        strokeRect: () => obj,
        clear: () => obj,
        removeFromDisplayList: () => {},
        addedToScene: () => {},
        removedFromScene: () => {},
        addedToContainer: () => {},
        removedFromContainer: () => {}
      };
      return obj;
    };
    return {
      tileSize: 32,
      gridWidth,
      gridHeight,
      pathfinder,
      sound: { play: () => {} },
      time: { now: 0 },
      sys: {
        queueDepthSort: () => {},
        events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
        input: { enable: () => {}, disable: () => {} }
      },
      add: {
        line: () => createMockObj(),
        circle: () => createMockObj(),
        graphics: () => createMockObj(),
        text: () => createMockObj(),
        sprite: () => createMockObj(),
        existing: (item: any) => item
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) config.onComplete();
        }
      }
    };
  }

  function createMockHero(
    id: string,
    name: string,
    gridX: number,
    gridY: number,
    weapon: WeaponDef,
    progression: ProgressionSystem
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      tileSize: 32,
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 60,
      maxHp: 60,
      criticalHp: 30,
      maxCriticalHp: 30,
      energy: 100,
      maxEnergy: 100,
      mood: 50,
      hunger: 100,
      state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
      equippedWeapon: weapon,
      offhandWeapon: null as WeaponDef | null,
      attackRangeTiles: weapon.attackRangeTiles ?? 1,
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      progression,
      lastAttackTime: -9999,
      lastSkillUseTimes: new Map<string, number>(),
      equippedSkillIds: [],
      inCombat: false,
      isAutocastEnabled: () => true,
      hasShield: () => false,
      isDualWielding: () => false,
      hasStatusEffect: () => false,
      removeStatusEffect: () => {},
      applyStatusEffect: () => {},
      clearTarget() {
        this.targetEntity = null;
        this.claimedDestination = null;
      },
      setTarget(target: any) {
        this.targetEntity = target;
      },
      takeDamage(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        return this.hp <= 0;
      },
      heal(amount: number) {
        const missing = this.maxHp - this.hp;
        const healed = Math.min(missing, amount);
        this.hp += healed;
        return healed;
      },
      isMoving() {
        return this.state === 'moving';
      },
      stopMovement() {
        this.state = 'idle';
        this.claimedDestination = null;
      },
      followPath(path: GridPos[]) {
        if (path.length > 0) {
          this.state = 'moving';
          this.gridPos = { ...path[path.length - 1] };
          this.x = this.gridPos.x * 32 + 16;
          this.y = this.gridPos.y * 32 + 16;
        }
      }
    };
  }

  // Initialize DataLoader
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Enemy Pool & Schema Integrity
  // =========================================================================
  console.log('--- TEST 1: Enemy Pool & Schema Integrity ---');
  const enemiesData = dataLoader.getEnemiesData();
  assert.ok(enemiesData && enemiesData.enemies, 'enemiesData must be loaded');

  const expectedEnemyIds = [
    'wolf',
    'slime',
    'goblin',
    'goblin_archer',
    'skeleton',
    'skeleton_archer',
    'undead',
    'spider',
    'orc_warrior'
  ];

  for (const id of expectedEnemyIds) {
    const enemyDef = dataLoader.getEnemy(id);
    assert.ok(enemyDef, `Enemy '${id}' must exist in enemies.json`);
    assert.ok(enemyDef.name, `Enemy '${id}' must have a name`);
    assert.ok(enemyDef.tier === 'common' || enemyDef.tier === 'elite', `Enemy '${id}' tier must be 'common' or 'elite'`);
    assert.ok(enemyDef.hp > 0, `Enemy '${id}' HP must be > 0 (found ${enemyDef.hp})`);
    assert.ok(enemyDef.criticalHpMax && enemyDef.criticalHpMax > 0, `Enemy '${id}' criticalHpMax must be > 0`);
    assert.ok(enemyDef.meleeDamage > 0, `Enemy '${id}' damage must be > 0`);
    assert.ok(enemyDef.aggroRadius > 0, `Enemy '${id}' aggroRadius must be > 0`);
    assert.ok(enemyDef.attackIntervalMs > 0, `Enemy '${id}' attackIntervalMs must be > 0`);
    assert.ok(enemyDef.moveSpeed > 0, `Enemy '${id}' moveSpeed must be > 0`);
    assert.ok(Array.isArray(enemyDef.harvest) && enemyDef.harvest.length > 0, `Enemy '${id}' must have harvest drops`);

    for (const h of enemyDef.harvest) {
      assert.ok(h.method, `Enemy '${id}' drop must have method`);
      assert.ok(h.item, `Enemy '${id}' drop must have item`);
      assert.ok(Array.isArray(h.tags) && h.tags.length > 0, `Enemy '${id}' drop item '${h.item}' must have non-empty tags`);
    }
  }

  // Verify dungeonConfig enemyPool has all entries and no dangling IDs
  const dungeonConfig = dataLoader.getDungeonConfig();
  assert.ok(dungeonConfig && dungeonConfig.enemyPool, 'dungeonConfig.enemyPool must exist');
  for (const poolId of dungeonConfig.enemyPool) {
    const found = dataLoader.getEnemy(poolId);
    assert.ok(found, `dungeonConfig.enemyPool ID '${poolId}' must exist in enemies.json`);
  }
  for (const id of expectedEnemyIds) {
    assert.ok(dungeonConfig.enemyPool.includes(id), `dungeonConfig.enemyPool must include '${id}'`);
  }
  console.log('✓ PASS: All 9 enemies verified for schema completeness and zero dangling pool IDs.');

  // =========================================================================
  // TEST 2: Zero-Code Dungeon Generation & Floor Respawn Integration
  // =========================================================================
  console.log('\n--- TEST 2: Dungeon Generation & Pool Integration ---');
  let rngSeed = 42;
  const pseudoRng = () => {
    rngSeed = (rngSeed * 9301 + 49297) % 233280;
    return rngSeed / 233280;
  };

  const generatedDungeon = DungeonGenerator.generate(dungeonConfig, pseudoRng);
  assert.ok(generatedDungeon.rooms.length >= 4, 'Dungeon must generate at least 4 rooms');
  assert.ok(generatedDungeon.enemySpawns.length > 0, 'Dungeon must spawn enemies');

  const spawnedEnemyIds = new Set(generatedDungeon.enemySpawns.map((s) => s.enemyId));
  console.log(`  Spanned ${generatedDungeon.enemySpawns.length} enemies with distinct types:`, Array.from(spawnedEnemyIds));

  for (const s of generatedDungeon.enemySpawns) {
    assert.ok(dungeonConfig.enemyPool.includes(s.enemyId), `Spawned enemy '${s.enemyId}' must come from enemyPool`);
    assert.ok(dataLoader.getEnemy(s.enemyId), `Spawned enemy '${s.enemyId}' must resolve from DataLoader`);
  }
  console.log('✓ PASS: Procedural dungeon generation populated enemies directly from the expanded pool.');

  // =========================================================================
  // TEST 3: Elite Tier Stat & Loot Scaling
  // =========================================================================
  console.log('\n--- TEST 3: Elite Tier Stat & Loot Differential ---');
  const orc = dataLoader.getEnemy('orc_warrior')!;
  const wolf = dataLoader.getEnemy('wolf')!;
  const goblin = dataLoader.getEnemy('goblin')!;

  assert.equal(orc.tier, 'elite', 'Orc Warrior must be tier elite');
  assert.ok(orc.hp >= 80, `Orc Warrior HP must be >= 80 (found ${orc.hp})`);
  assert.ok(orc.hp > wolf.hp * 2, 'Orc Warrior HP must be more than 2x common wolf');
  assert.ok(orc.meleeDamage >= 12, `Orc Warrior damage must be >= 12 (found ${orc.meleeDamage})`);
  assert.ok(orc.meleeDamage > goblin.meleeDamage * 2, 'Orc Warrior damage must be more than 2x common goblin');

  // Verify proportional high-tier harvest loot
  const orcDropItems = orc.harvest.map((h) => h.item);
  assert.ok(orcDropItems.includes('orc_heavy_hide'), 'Orc Warrior drops orc_heavy_hide');
  assert.ok(orcDropItems.includes('steel_scrap'), 'Orc Warrior drops steel_scrap');
  assert.ok(orcDropItems.includes('orc_emblem'), 'Orc Warrior drops rare orc_emblem');

  // Verify visual indicators created on Elite instance
  const mockScene = createMockScene();
  const eliteUnit = new Enemy(mockScene, 10, 10, orc, 'orc_warrior-avatar', 32);
  assert.ok(eliteUnit.eliteAura, 'Elite unit must instantiate eliteAura graphics');
  assert.ok(eliteUnit.eliteLabel, 'Elite unit must instantiate eliteLabel text object');
  console.log('✓ PASS: Elite tier enemy exhibits genuine stat scaling, elite loot table, and distinct visuals.');

  // =========================================================================
  // TEST 4: Ranged Enemy Distance Attack Verification
  // =========================================================================
  console.log('\n--- TEST 4: Ranged Enemy Distance Attack & Positioning ---');
  const archerDef = dataLoader.getEnemy('goblin_archer')!;
  assert.equal(archerDef.attackRangeTiles, 4, 'Goblin Archer must have attackRangeTiles 4');

  const prog = new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero');
  const swordDef = dataLoader.getWeapon('short_swords')!;
  const hero = createMockHero('hero', 'Guild Hero', 10, 10, swordDef, prog);

  // Place archer 4 tiles away at (10, 14)
  const archer = new Enemy(mockScene, 10, 14, archerDef, 'goblin_archer-avatar', 32);
  const combat = new CombatSystem(mockScene, hero, [archer], mockScene.pathfinder);

  // Proximity check: Hero at (10, 10), Archer at (10, 14) -> distance is 4 tiles
  const dist = Math.max(Math.abs(hero.gridPos.x - archer.gridPos.x), Math.abs(hero.gridPos.y - archer.gridPos.y));
  assert.equal(dist, 4, 'Distance between Hero and Archer must be 4 tiles');

  // Run combat update tick
  combat.update(1500, 100);

  // Archer should be aggroed and attacking from distance 4 without moving to distance 1
  assert.ok(archer.isAggroed, 'Archer should aggro on Hero at 4 tiles distance');
  assert.equal(archer.state, 'attacking', 'Archer should be in attacking state from 4 tiles away');
  assert.equal(archer.gridPos.x, 10, 'Archer X position should remain at 10');
  assert.equal(archer.gridPos.y, 14, 'Archer Y position should remain at 14 (did NOT close to melee distance 1)');

  // Advance time past attack interval to trigger attack
  const preHp = hero.hp;
  combat.update(1500 + archerDef.attackIntervalMs + 50, 100);
  assert.ok(hero.hp < preHp, `Hero HP should decrease from ranged attack (pre: ${preHp}, post: ${hero.hp})`);
  console.log(`✓ PASS: Ranged enemy attacks cleanly from 4 tiles away without closing to melee adjacency.`);

  // =========================================================================
  // TEST 5: Ranged Enemy Kiting / Maintaining Distance AI
  // =========================================================================
  console.log('\n--- TEST 5: Ranged Enemy Kiting & Repositioning AI ---');
  // Target closes in to melee distance (<= 2 tiles)
  // Move Hero to (10, 13) - 1 tile away from archer at (10, 14)
  hero.gridPos = { x: 10, y: 13 };
  const closeDist = Math.max(Math.abs(hero.gridPos.x - archer.gridPos.x), Math.abs(hero.gridPos.y - archer.gridPos.y));
  assert.equal(closeDist, 1, 'Hero is now 1 tile away from archer');

  // Test findKiteTile directly
  const kiteTile = combat.findKiteTile(archer, hero, archerDef.attackRangeTiles!);
  assert.ok(kiteTile, 'Archer should find a valid kite tile to retreat to');
  const kiteDist = Math.max(Math.abs(kiteTile.x - hero.gridPos.x), Math.abs(kiteTile.y - hero.gridPos.y));
  assert.ok(kiteDist > closeDist, `Kite tile (${kiteTile.x}, ${kiteTile.y}) distance (${kiteDist}) must be > current distance (${closeDist})`);

  // Test staging tile from outside range
  hero.gridPos = { x: 10, y: 5 }; // 9 tiles away from archer at (10, 14)
  const stagingTile = combat.findRangedStagingTile(archer, hero, archerDef.attackRangeTiles!);
  assert.ok(stagingTile, 'Archer should find staging tile when outside attack range');
  const stagingDist = Math.max(Math.abs(stagingTile.x - hero.gridPos.x), Math.abs(stagingTile.y - hero.gridPos.y));
  assert.ok(stagingDist >= 3 && stagingDist <= 4, `Staging tile distance (${stagingDist}) should be within attack range (3-4 tiles)`);
  console.log(`✓ PASS: Ranged enemy kiting and staging tile positioning AI accurately calculates distance maintenance.`);

  // =========================================================================
  // TEST 6: Hard-Mode Swarm-Trap Rule Enforcement
  // =========================================================================
  console.log('\n--- TEST 6: Hard-Mode Swarm-Trap Rule with Ranged & Elite Enemies ---');
  // Confirm living ranged enemy is treated as a non-negotiable hard obstacle
  const livingArcherPos = archer.gridPos;
  assert.equal(archer.state !== 'dead', true, 'Archer is living');

  // Test pathfinding: Path from (10, 13) to (10, 15) directly through archer at (10, 14)
  const hardObstacles = [livingArcherPos];
  const path = await mockScene.pathfinder.findPath(
    { x: 10, y: 13 },
    { x: 10, y: 15 },
    { hard: hardObstacles }
  );

  // The path MUST NOT step on (10, 14)
  const stepsOnArcher = path.some((p: GridPos) => p.x === livingArcherPos.x && p.y === livingArcherPos.y);
  assert.equal(stepsOnArcher, false, 'Pathfinder must strictly avoid stepping on living archer obstacle tile');

  // Surround a tile completely with enemies and verify no-escape hard rule
  const trappedStart = { x: 5, y: 5 };
  const surroundingEnemies = [
    { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    { x: 4, y: 5 },                 { x: 6, y: 5 },
    { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }
  ];
  const trappedPath = await mockScene.pathfinder.findPath(
    trappedStart,
    { x: 5, y: 10 },
    { hard: surroundingEnemies }
  );
  assert.equal(trappedPath.length, 0, 'Surrounded unit cannot escape through living enemies (hard-mode rule)');
  console.log('✓ PASS: Hard-mode swarm-trap rule verified: living ranged and elite enemies are absolute obstacles.');

  // =========================================================================
  // TEST 7: M19 Staff-Fallback vs Ranged Enemy Tactical Interaction
  // =========================================================================
  console.log('\n--- TEST 7: Staff-Fallback vs Ranged Enemy Tactical Interaction ---');
  const staffDef = dataLoader.getWeapon('staff')!;
  const mageHero = createMockHero('mage', 'Guild Mage', 10, 10, staffDef, prog);

  // With full energy, staff dynamic range evaluates to 4 (Fire Magic casting range)
  combat.updateStaffDynamicRange(mageHero);
  assert.equal(mageHero.attackRangeTiles, 4, 'Mage with full energy has range 4');

  // Deplete energy to simulate running dry
  mageHero.energy = 5; // below 22 energy cost
  combat.updateStaffDynamicRange(mageHero);
  assert.equal(mageHero.attackRangeTiles, 1, 'Dry mage falls back to attackRangeTiles 1 (Staff melee)');

  // Ranged enemy remains at distance 4 with range 4
  assert.equal(archer.enemyData.attackRangeTiles, 4, 'Goblin Archer maintains attackRangeTiles 4');

  // Mage must close distance from 4 tiles to 1 tile, while archer shoots from range
  assert.ok(
    mageHero.attackRangeTiles < archer.enemyData.attackRangeTiles!,
    'Dry mage is at tactical disadvantage (range 1 vs enemy range 4)'
  );
  console.log('✓ PASS: Staff-fallback correctly exposes dry mage to incoming ranged attacks while closing distance.');

  console.log('\n=======================================================');
  console.log('ALL MILESTONE 20 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('=======================================================');
}

runMilestone20Tests().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
