import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Setup minimal browser globals for Phaser import under Node
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

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');
const { MainScene } = await import('../src/scenes/MainScene.ts');

function makeSeededRng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMockScene(): any {
  const noop = () => {};
  const createMockObj = () => {
    const obj: any = {
      x: 0,
      y: 0,
      visible: true,
      text: '',
      list: [] as any[],
      parentContainer: null,
      destroy: noop,
      removeFromDisplayList: noop,
      addedToScene: noop,
      removedFromScene: noop,
      addedToContainer: noop,
      removedFromContainer: noop,
      setOrigin: () => obj,
      setDepth: () => obj,
      setVisible: () => obj,
      setPosition: () => obj,
      setText: () => obj,
      setStyle: () => obj,
      setTexture: () => obj,
      setColor: () => obj,
      setLineWidth: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      disableInteractive: () => obj,
      setScale: () => obj,
      clear: () => obj,
      lineStyle: () => obj,
      strokeCircle: () => obj,
      fillStyle: () => obj,
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: () => obj,
      lineBetween: () => obj,
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      add: (item: any) => { obj.list.push(item); return obj; },
      remove: (item: any) => {
        const idx = obj.list.indexOf(item);
        if (idx > -1) obj.list.splice(idx, 1);
        return obj;
      },
      removeAll: () => { obj.list = []; return obj; }
    };
    return obj;
  };

  const scene: any = {
    tileSize: 32,
    gatheringNodes: [],
    enemies: [],
    createFloatingText: noop,
    time: { now: 1000, delayedCall: (_d: number, cb: () => void) => cb() },
    tweens: { add: () => ({ stop: noop }) },
    textures: { exists: () => true },
    sys: {
      queueDepthSort: noop,
      events: { once: noop, on: noop, off: noop, emit: noop },
      input: { enable: noop, disable: noop },
      displayList: { queueDepthSort: noop }
    },
    add: {
      existing: (item: any) => item,
      container: createMockObj,
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      line: createMockObj,
      circle: createMockObj
    },
    make: {
      graphics: createMockObj
    }
  };

  // Bind MainScene corpse methods
  scene.isEnemyAnimalType = MainScene.prototype.isEnemyAnimalType.bind(scene);
  scene.isEnemyUndeadOrSkeleton = MainScene.prototype.isEnemyUndeadOrSkeleton.bind(scene);
  scene.isEnemyButcherEligible = MainScene.prototype.isEnemyButcherEligible.bind(scene);
  scene.checkAndCreateCorpseGatheringNode = MainScene.prototype.checkAndCreateCorpseGatheringNode.bind(scene);
  scene.spawnCorpseGatheringNode = MainScene.prototype.spawnCorpseGatheringNode.bind(scene);
  scene.canSkinCorpse = MainScene.prototype.canSkinCorpse.bind(scene);
  scene.canButcherCorpse = MainScene.prototype.canButcherCorpse.bind(scene);
  scene.attemptSkinCorpse = MainScene.prototype.attemptSkinCorpse.bind(scene);
  scene.attemptButcherCorpse = MainScene.prototype.attemptButcherCorpse.bind(scene);
  scene.harvestGatheringNode = MainScene.prototype.harvestGatheringNode.bind(scene);

  return scene;
}

function createTestPlayer(mockScene: any, name: string = 'Hero'): InstanceType<typeof Player> {
  const progression = new ProgressionSystem();
  return new Player(mockScene, 10, 10, {
    hp: 100,
    criticalHp: 50,
    energy: 100,
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: {},
    classLevels: {},
    unlockedClasses: [],
    resources: { wood: 0 }
  }, null, 32, 'player-avatar', progression);
}

async function runGlacialEnemiesTests() {
  console.log('================================================================');
  console.log('❄️ RUNNING GLACIAL CAVERNS ENEMIES & SOVEREIGN TEST SUITE ❄️');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const dungeonConfig = dl.getDungeonConfig();

  // Mute console.log during loops
  const origLog = console.log;
  const muteLogs = () => { console.log = () => {}; };
  const unmuteLogs = () => { console.log = origLog; };

  // ===========================================================================
  // TEST 1: Expected-table guards for sections 1, 3, and 4
  // ===========================================================================
  console.log('--- TEST 1: Schema & Stat Invariants for Glacial Commons, Elite & Boss ---');
  {
    // 1A. Frostfang Stalker
    const stalker = dl.getEnemy('frostfang_stalker');
    assert.ok(stalker, 'frostfang_stalker must exist in enemies.json');
    assert.strictEqual(stalker.tier, 'common');
    assert.strictEqual(stalker.hp, 40);
    assert.strictEqual(stalker.criticalHpMax, 20);
    assert.strictEqual(stalker.meleeDamage, 8);
    assert.strictEqual(stalker.attackIntervalMs, 900);
    assert.strictEqual(stalker.moveSpeed, 105);
    assert.strictEqual(stalker.attackRangeTiles, 1);
    assert.strictEqual(stalker.aggroRadius, 7);
    assert.strictEqual(stalker.dropChance, 0.4);
    assert.strictEqual(stalker.frostbiteChance, 0.15);
    assert.ok(stalker.harvest.some((h) => h.item === 'bone' && (h.weight === 2 || h.count === 2 || h.amount === 2)));
    assert.ok(stalker.harvest.some((h) => h.item === 'wolf_claw' && h.method === 'rare_drop'));
    assert.strictEqual(stalker.corpseHarvest?.skinning?.item, 'wolf_pelt');
    assert.strictEqual(stalker.corpseHarvest?.butchering?.item, 'glacial_meat');
    assert.strictEqual(stalker.corpseHarvest?.butchering?.premiumItem, 'prime_glacial_meat');
    assert.strictEqual(stalker.corpseHarvest?.butchering?.premiumChance, 0.10);
    assert.ok(stalker.ingredientDrops?.some((i) => i.item === 'black_pepper' && i.weight === 1));
    console.log('  ✔ Frostfang Stalker stats and drops verified.');

    // 1B. Glacier Yeti
    const yeti = dl.getEnemy('glacier_yeti');
    assert.ok(yeti, 'glacier_yeti must exist in enemies.json');
    assert.strictEqual(yeti.tier, 'common');
    assert.strictEqual(yeti.hp, 80);
    assert.strictEqual(yeti.criticalHpMax, 40);
    assert.strictEqual(yeti.meleeDamage, 16);
    assert.strictEqual(yeti.attackIntervalMs, 1700);
    assert.strictEqual(yeti.moveSpeed, 70);
    assert.strictEqual(yeti.attackRangeTiles, 1);
    assert.strictEqual(yeti.aggroRadius, 6);
    assert.strictEqual(yeti.dropChance, 0.4);
    assert.strictEqual(yeti.stunChance, 0.10);
    assert.ok(yeti.harvest.some((h) => h.item === 'bone' && (h.weight === 2 || h.count === 2 || h.amount === 2)));
    assert.ok(yeti.harvest.some((h) => h.item === 'steel_scrap' && (h.weight === 1 || h.count === 1 || h.amount === 1)));
    assert.strictEqual(yeti.corpseHarvest?.skinning, undefined);
    assert.strictEqual(yeti.corpseHarvest?.butchering?.item, 'glacial_meat');
    assert.strictEqual(yeti.corpseHarvest?.butchering?.premiumItem, 'prime_glacial_meat');
    assert.strictEqual(yeti.corpseHarvest?.butchering?.premiumChance, 0.10);
    assert.ok(yeti.ingredientDrops?.some((i) => i.item === 'salt' && i.weight === 2));
    console.log('  ✔ Glacier Yeti stats and drops verified.');

    // 1C. Ice Wraith
    const wraith = dl.getEnemy('ice_wraith');
    assert.ok(wraith, 'ice_wraith must exist in enemies.json');
    assert.strictEqual(wraith.tier, 'common');
    assert.strictEqual(wraith.hp, 34);
    assert.strictEqual(wraith.criticalHpMax, 17);
    assert.strictEqual(wraith.meleeDamage, 10);
    assert.strictEqual(wraith.attackIntervalMs, 1250);
    assert.strictEqual(wraith.moveSpeed, 80);
    assert.strictEqual(wraith.attackRangeTiles, 4);
    assert.strictEqual(wraith.aggroRadius, 8);
    assert.strictEqual(wraith.dropChance, 0.4);
    assert.strictEqual(wraith.frostbiteChance, 0.20);
    assert.ok(wraith.harvest.some((h) => h.item === 'ectoplasm' && (h.weight === 2 || h.count === 2 || h.amount === 2)));
    assert.ok(wraith.harvest.some((h) => h.item === 'glacial_essence' && (h.weight === 1 || h.count === 1 || h.amount === 1)));
    assert.ok(wraith.ingredientDrops?.some((i) => i.item === 'black_pepper' && i.weight === 2));
    console.log('  ✔ Ice Wraith stats and drops verified.');

    // 1D. Rime Golem
    const golem = dl.getEnemy('rime_golem');
    assert.ok(golem, 'rime_golem must exist in enemies.json');
    assert.strictEqual(golem.tier, 'common');
    assert.strictEqual(golem.hp, 95);
    assert.strictEqual(golem.criticalHpMax, 47);
    assert.strictEqual(golem.meleeDamage, 6);
    assert.strictEqual(golem.attackIntervalMs, 1600);
    assert.strictEqual(golem.moveSpeed, 60);
    assert.strictEqual(golem.attackRangeTiles, 1);
    assert.strictEqual(golem.aggroRadius, 6);
    assert.strictEqual(golem.dropChance, 0.4);
    assert.strictEqual(golem.slowChance, 0.25);
    assert.ok(golem.harvest.some((h) => h.item === 'ore' && (h.weight === 3 || h.count === 3 || h.amount === 3)));
    assert.ok(golem.harvest.some((h) => h.item === 'steel_scrap' && (h.weight === 1 || h.count === 1 || h.amount === 1)));
    assert.ok(golem.ingredientDrops?.some((i) => i.item === 'salt' && i.weight === 2));
    console.log('  ✔ Rime Golem stats and drops verified.');

    // 1E. Frost Troll (Elite)
    const troll = dl.getEnemy('frost_troll');
    assert.ok(troll, 'frost_troll must exist in enemies.json');
    assert.strictEqual(troll.tier, 'elite');
    assert.strictEqual(troll.hp, 110);
    assert.strictEqual(troll.criticalHpMax, 55);
    assert.strictEqual(troll.meleeDamage, 15);
    assert.strictEqual(troll.attackIntervalMs, 1300);
    assert.strictEqual(troll.moveSpeed, 85);
    assert.strictEqual(troll.attackRangeTiles, 1);
    assert.strictEqual(troll.slowChance, 0.20);
    assert.ok(troll.harvest.some((h) => h.item === 'steel_scrap'));
    assert.ok(troll.harvest.some((h) => h.item === 'glacial_essence'));
    assert.ok(troll.harvest.some((h) => h.item === 'orc_heavy_hide' && h.method === 'rare_drop'));
    assert.deepStrictEqual(troll.lostRecipeScrolls, ['lost_recipe_frostbite_broth']);
    console.log('  ✔ Frost Troll stats, drops, and lost recipe scroll verified.');

    // 1F. Glacial Caverns Dungeon Config
    const glacialRegion = dungeonConfig.regions?.find((r: any) => r.id === 'glacial_caverns');
    assert.ok(glacialRegion, 'glacial_caverns region must exist in dungeonConfig.json');
    assert.strictEqual(glacialRegion.eliteEnemyId, 'frost_troll');
    assert.strictEqual(glacialRegion.epicEnemyId, 'void_knight');
    assert.ok(dungeonConfig.bossPool?.includes('glacial_sovereign'));
    console.log('  ✔ glacial_caverns dungeon config verified (elite: frost_troll, epic: void_knight, boss: glacial_sovereign).');

    // 1G. Glacial Sovereign (Recalibrated Boss)
    const sovereign = dl.getEnemy('glacial_sovereign');
    assert.ok(sovereign, 'glacial_sovereign must exist in enemies.json');
    assert.strictEqual(sovereign.tier, 'boss');
    assert.strictEqual(sovereign.hp, 3400);
    assert.strictEqual(sovereign.criticalHpMax, 1700);
    assert.strictEqual(sovereign.meleeDamage, 32);
    assert.strictEqual(sovereign.attackIntervalMs, 1400);
    assert.strictEqual(sovereign.attackRangeTiles, 4);
    assert.strictEqual(sovereign.frostbiteChance, 0.25);
    console.log('  ✔ Glacial Sovereign stats verified (HP: 3400 + 1700, Damage: 32, Range: 4, Frostbite: 25%).');

    console.log('✔ PASS: Test 1 - All schema and stat invariants confirmed.\n');
  }

  // ===========================================================================
  // TEST 2: Pool weights within ±2% over 5,000 Glacial spawns (zero stand-ins)
  // ===========================================================================
  console.log('--- TEST 2: Glacial Caverns Enemy Pool Weights (5,000 Spawns) ---');
  {
    const glacialRegion = dungeonConfig.regions?.find((r: any) => r.id === 'glacial_caverns');
    const glacialPool = glacialRegion?.enemyPool;
    assert.ok(glacialPool, 'glacial_caverns must have enemyPool configured');

    const spawnCounts: Record<string, number> = {};
    const totalSpawnsTarget = 5000;
    let collectedSpawns = 0;

    const expectedWeights: Record<string, number> = {
      frostfang_stalker: 0.22,
      ice_wraith: 0.18,
      glacier_yeti: 0.16,
      rime_golem: 0.14,
      cinder_hound: 0.10,
      magma_brute: 0.10,
      ash_wraith: 0.10
    };

    let seed = 10000;
    while (collectedSpawns < totalSpawnsTarget) {
      const rng = DungeonGenerator.createRng(seed++);
      const dungeon = DungeonGenerator.generate(dungeonConfig, rng, {
        floorNumber: 17,
        forceBoss: false
      });
      for (const spawn of dungeon.enemySpawns) {
        if (expectedWeights[spawn.enemyId] !== undefined) {
          spawnCounts[spawn.enemyId] = (spawnCounts[spawn.enemyId] || 0) + 1;
          collectedSpawns++;
          if (collectedSpawns >= totalSpawnsTarget) break;
        } else {
          spawnCounts[spawn.enemyId] = (spawnCounts[spawn.enemyId] || 0) + 1;
        }
      }
    }

    console.log(`  Sampled ${collectedSpawns} pool spawns on Floor 17.`);

    let totalCore = 0;
    let totalCarry = 0;

    for (const [id, targetRate] of Object.entries(expectedWeights)) {
      const count = spawnCounts[id] || 0;
      const rate = count / collectedSpawns;
      console.log(`    ${id.padEnd(18)}: ${count} (${(rate * 100).toFixed(2)}%) [Target: ${(targetRate * 100).toFixed(1)}% ± 2%]`);
      assert.ok(
        Math.abs(rate - targetRate) <= 0.02,
        `Enemy ${id} rate ${(rate * 100).toFixed(2)}% must be within ±2% of target ${(targetRate * 100).toFixed(1)}%`
      );
      if (['frostfang_stalker', 'ice_wraith', 'glacier_yeti', 'rime_golem'].includes(id)) {
        totalCore += rate;
      } else {
        totalCarry += rate;
      }
    }

    console.log(`  Total Core: ${(totalCore * 100).toFixed(2)}% (Target: 70% ± 2%)`);
    console.log(`  Total Carry: ${(totalCarry * 100).toFixed(2)}% (Target: 30% ± 2%)`);
    assert.ok(Math.abs(totalCore - 0.70) <= 0.02, 'Total core must be 70% ± 2%');
    assert.ok(Math.abs(totalCarry - 0.30) <= 0.02, 'Total carry must be 30% ± 2%');

    // Stand-ins check: strictly ZERO
    const standIns = ['undead', 'skeleton_archer', 'spider', 'skeleton'];
    for (const standIn of standIns) {
      assert.strictEqual(spawnCounts[standIn] || 0, 0, `Stand-in '${standIn}' must have 0 spawns in Glacial Caverns`);
    }
    console.log('  ✔ Confirmed 0 spawns of undead, skeleton_archer, spider, or skeleton in Glacial Caverns.');

    console.log('✔ PASS: Test 2 - 70/30 pool weights and removal of stand-ins verified.\n');
  }

  // ===========================================================================
  // TEST 3: Frostbite proc rate within ±1% over 10,000 seeded hits (15% & 20%) & canonical def
  // ===========================================================================
  console.log('--- TEST 3: Frostbite Proc Rates & Canonical Status Effect Definition ---');
  {
    const mockScene = createMockScene();
    const hits = 10000;

    // Subtest 3A: 15% proc (frostfang_stalker)
    {
      const grid = Array.from({ length: 30 }, () => Array(30).fill(0));
      const player = createTestPlayer(mockScene, 'Hero');
      const stalkerDef = dl.getEnemy('frostfang_stalker')!;
      const stalker = new Enemy(mockScene, 10, 11, stalkerDef, 'frostfang_stalker-avatar', 32);
      const combat = new CombatSystem(mockScene, [player], [stalker], new Pathfinder(grid));

      player.setGridPosition(10, 10);
      stalker.setGridPosition(10, 11);
      stalker.spawnPos = { x: 10, y: 11 };

      combat.combatRng = makeSeededRng(7001);
      let frostbiteProcs = 0;
      combat.createFloatingText = (_x: number, _y: number, text: string) => {
        if (text === 'FROSTBITE!') frostbiteProcs++;
      };

      muteLogs();
      let stalkerHitsLanded = 0;
      let tick = 0;
      while (stalkerHitsLanded < hits) {
        player.hp = 100;
        player.criticalHp = 50;
        player.clearStatusEffects();
        player.clearTarget();
        stalker.hp = 40;
        stalker.criticalHp = 20;
        stalker.state = 'idle';
        stalker.isAggroed = false;
        stalker.targetEntity = player;
        stalker.lastAttackTime = 0;
        combat.update(1000 + (tick++) * 2000, 16);
        if (player.hp < 100) {
          stalkerHitsLanded++;
        }
      }
      unmuteLogs();

      const rate15 = frostbiteProcs / stalkerHitsLanded;
      console.log(`  Frostfang Stalker (15% chance): ${frostbiteProcs}/${stalkerHitsLanded} procs (${(rate15 * 100).toFixed(2)}%) [Target: 15% ± 1%]`);
      assert.ok(
        rate15 >= 0.14 && rate15 <= 0.16,
        `Frostbite proc rate must be 15% ± 1% (0.14 - 0.16), got ${(rate15 * 100).toFixed(2)}%`
      );
    }

    // Subtest 3B: 20% proc (ice_wraith)
    {
      const grid = Array.from({ length: 30 }, () => Array(30).fill(0));
      const player = createTestPlayer(mockScene, 'Hero');
      const wraithDef = dl.getEnemy('ice_wraith')!;
      const wraith = new Enemy(mockScene, 10, 14, wraithDef, 'ice_wraith-avatar', 32);
      const combat = new CombatSystem(mockScene, [player], [wraith], new Pathfinder(grid));

      player.setGridPosition(10, 10);
      wraith.setGridPosition(10, 14);
      wraith.spawnPos = { x: 10, y: 14 };

      combat.combatRng = makeSeededRng(7002);
      let frostbiteProcs = 0;
      combat.createFloatingText = (_x: number, _y: number, text: string) => {
        if (text === 'FROSTBITE!') frostbiteProcs++;
      };

      muteLogs();
      let wraithHitsLanded = 0;
      let tick = 0;
      while (wraithHitsLanded < hits) {
        player.hp = 100;
        player.criticalHp = 50;
        player.clearStatusEffects();
        player.clearTarget();
        wraith.hp = 34;
        wraith.criticalHp = 17;
        wraith.state = 'idle';
        wraith.isAggroed = false;
        wraith.targetEntity = player;
        wraith.lastAttackTime = 0;
        combat.update(1000 + (tick++) * 2000, 16);
        if (player.hp < 100) {
          wraithHitsLanded++;
        }
      }
      unmuteLogs();

      const rate20 = frostbiteProcs / wraithHitsLanded;
      console.log(`  Ice Wraith (20% chance): ${frostbiteProcs}/${wraithHitsLanded} procs (${(rate20 * 100).toFixed(2)}%) [Target: 20% ± 1%]`);
      assert.ok(
        rate20 >= 0.19 && rate20 <= 0.21,
        `Frostbite proc rate must be 20% ± 1% (0.19 - 0.21), got ${(rate20 * 100).toFixed(2)}%`
      );
    }

    // Subtest 3C: Status effect canonical definition check
    {
      const canonical = dl.getStatusEffect('frostbite');
      assert.ok(canonical, 'frostbite status effect must exist in statusEffects.json');
      assert.strictEqual(canonical.durationMs, 4500, 'durationMs must be 4500ms');
      assert.strictEqual(canonical.tickIntervalMs, 1500, 'tickIntervalMs must be 1500ms');
      assert.strictEqual(canonical.damagePerTick, 3, 'damagePerTick must be 3');
      assert.strictEqual(canonical.moveSpeedMultiplier, 0.5, 'moveSpeedMultiplier must be 0.5');

      // Verify effect applied on entity
      const player = createTestPlayer(mockScene, 'Hero');
      player.applyStatusEffect(canonical);
      assert.ok(player.hasStatusEffect('frostbite'), 'Player must have frostbite status effect applied');
      const active = (player as any).activeStatusEffects.get('frostbite');
      assert.strictEqual(active.def.durationMs, 4500);
      assert.strictEqual(active.def.damagePerTick, 3);
      assert.strictEqual(active.def.moveSpeedMultiplier, 0.5);
      console.log('  ✔ Applied frostbite def matches canonical statusEffects.json.');
    }

    console.log('✔ PASS: Test 3 - Frostbite proc rates and canonical status effect definition verified.\n');
  }

  // ===========================================================================
  // TEST 4: Butchering: stalker & yeti yield glacial_meat, prime at 10% ± 1%
  // ===========================================================================
  console.log('--- TEST 4: Butchering Yields & Prime Glacial Meat Rate ---');
  {
    const { GameState } = await import('../src/systems/GameState.ts');
    const gs = GameState.getInstance();
    gs.completeResearch('research_skinning');
    gs.completeResearch('research_butchering');

    const mockScene = createMockScene();
    const player = createTestPlayer(mockScene, 'Hero');
    const stalkerDef = dl.getEnemy('frostfang_stalker')!;
    const yetiDef = dl.getEnemy('glacier_yeti')!;

    // 4A. Sequential ordering on stalker: skinning wolf_pelt, then butchering glacial_meat
    const stalkerEnemy = new Enemy(mockScene, 10, 10, stalkerDef, 'frostfang_stalker-avatar', 32);
    stalkerEnemy.markDead();
    assert.strictEqual(mockScene.isEnemyAnimalType(stalkerDef.id), true, 'stalker is animal (skinning)');
    assert.strictEqual(mockScene.isEnemyButcherEligible(stalkerDef.id), true, 'stalker is butcher eligible');

    const canButcherBeforeSkin = mockScene.canButcherCorpse(stalkerEnemy);
    assert.strictEqual(canButcherBeforeSkin.canHarvest, false, 'Must skin before butchering');

    const stalkerCorpse = mockScene.spawnCorpseGatheringNode(stalkerEnemy, 'skinning');
    assert.ok(stalkerCorpse, 'Skinning corpse node must be spawned');
    mockScene.harvestGatheringNode(stalkerCorpse, player);
    assert.strictEqual(player.getItemCount('wolf_pelt'), 1, 'Skinning yields wolf_pelt');
    assert.strictEqual(stalkerCorpse.isHarvested, false, 'Corpse not spent yet (butchering available)');

    const canButcherAfterSkin = mockScene.canButcherCorpse(stalkerEnemy);
    assert.strictEqual(canButcherAfterSkin.canHarvest, true, 'Can butcher after skinning');
    mockScene.harvestGatheringNode(stalkerCorpse, player);
    assert.ok(player.getItemCount('glacial_meat') + player.getItemCount('prime_glacial_meat') >= 1, 'Butchering yields glacial_meat');
    assert.strictEqual(stalkerCorpse.isHarvested, true, 'Corpse now spent after butchering');
    console.log('  ✔ Stalker corpse skinning (wolf_pelt) -> butchering (glacial_meat) sequence verified.');

    // 4B. Yeti has NO skinning, only butchering directly
    const yetiEnemy = new Enemy(mockScene, 10, 10, yetiDef, 'glacier_yeti-avatar', 32);
    yetiEnemy.markDead();
    assert.strictEqual(mockScene.isEnemyAnimalType(yetiDef.id), false, 'yeti has no skinning');
    assert.strictEqual(mockScene.isEnemyButcherEligible(yetiDef.id), true, 'yeti is butcher eligible');
    const canButcherYeti = mockScene.canButcherCorpse(yetiEnemy);
    assert.strictEqual(canButcherYeti.canHarvest, true, 'Yeti corpse is immediately butcherable');

    // 4C. Monte Carlo: Prime Glacial Meat chance 10% ± 1% over 10,000 butchering harvests
    const butcherEnemy = new Enemy(mockScene, 5, 5, yetiDef, 'glacier_yeti-avatar', 32);
    butcherEnemy.markDead();
    const butcherNode = mockScene.spawnCorpseGatheringNode(butcherEnemy, 'butchering');
    assert.ok(butcherNode, 'Butchering corpse node must be spawned');

    const butcherRng = makeSeededRng(8001);
    let primeCount = 0;
    let standardCount = 0;

    const testHarvester = createTestPlayer(mockScene, 'Butcher');
    testHarvester.addItem = (item: string, count: number = 1) => {
      if (item === 'prime_glacial_meat') primeCount += count;
      if (item === 'glacial_meat') standardCount += count;
      return true as any;
    };

    const butcherIterations = 10000;
    muteLogs();
    for (let i = 0; i < butcherIterations; i++) {
      butcherNode.isHarvested = false;
      mockScene.harvestGatheringNode(butcherNode, testHarvester, butcherRng);
    }
    unmuteLogs();

    const primeRate = primeCount / butcherIterations;
    console.log(`  Butchering harvests: ${butcherIterations}`);
    console.log(`  Prime Glacial Meat: ${primeCount}/${butcherIterations} (${(primeRate * 100).toFixed(2)}%) [Target: 10% ± 1%]`);
    console.log(`  Standard Glacial Meat: ${standardCount}`);
    assert.ok(
      primeRate >= 0.09 && primeRate <= 0.11,
      `Prime meat rate must be 10% ± 1% (0.09 - 0.11), got ${(primeRate * 100).toFixed(2)}%`
    );

    console.log('✔ PASS: Test 4 - Butchering meat drops and prime premium rate verified.\n');
  }

  // ===========================================================================
  // TEST 5: Frost Troll is Glacial elite, E6 scroll drops at 5% ± 1%
  // ===========================================================================
  console.log('--- TEST 5: Frost Troll Elite Role & E6 Scroll Drop Rate ---');
  {
    const mockScene = createMockScene();
    const glacialRegion = dungeonConfig.regions?.find((r: any) => r.id === 'glacial_caverns');
    assert.strictEqual(glacialRegion?.eliteEnemyId, 'frost_troll');

    const trollDef = dl.getEnemy('frost_troll')!;
    const troll = new Enemy(mockScene, 10, 10, trollDef, 'frost_troll-avatar', 32);
    const player = createTestPlayer(mockScene, 'Hero');
    const combat = new CombatSystem(mockScene, [player], [troll], new Pathfinder([[0, 0], [0, 0]]));

    combat.enableCookingDrops = true;
    combat.cookingLootRng = makeSeededRng(9001);
    combat.materialLootRng = () => 1.0;

    let e6Count = 0;
    const origAddItem = player.addItem.bind(player);
    player.addItem = (item: string, count: number = 1) => {
      if (item === 'lost_recipe_frostbite_broth') e6Count += count;
      return origAddItem(item, count);
    };

    const iterations = 10000;
    muteLogs();
    for (let i = 0; i < iterations; i++) {
      combat.handleTargetDefeated(player, troll, 'iron_sword');
    }
    unmuteLogs();

    const rate = e6Count / iterations;
    console.log(`  Frost Troll kills: ${iterations}`);
    console.log(`  E6 (lost_recipe_frostbite_broth) drops: ${e6Count} (${(rate * 100).toFixed(2)}%) [Target: 5% ± 1%]`);
    assert.ok(
      rate >= 0.04 && rate <= 0.06,
      `Frost Troll E6 scroll drop rate must be 5% ± 1% (0.04 - 0.06), got ${(rate * 100).toFixed(2)}%`
    );

    console.log('✔ PASS: Test 5 - Frost Troll elite role and E6 scroll drop verified.\n');
  }

  // ===========================================================================
  // TEST 6: Sovereign Calibration Results Meet Targets
  // ===========================================================================
  console.log('--- TEST 6: Glacial Sovereign Combat Calibration Targets ---');
  {
    const sovereignDef = dl.getEnemy('glacial_sovereign')!;
    assert.strictEqual(sovereignDef.hp, 3400, 'Sovereign HP must be 3400');
    assert.strictEqual(sovereignDef.criticalHpMax, 1700, 'Sovereign Crit HP must be 1700');
    assert.strictEqual(sovereignDef.frostbiteChance, 0.25, 'Sovereign Frostbite must be 0.25');

    // Run calibration sim Step 3 to verify targets
    const { evaluateSovereign } = await import('../scripts/calibrate_combat_sim.ts');
    muteLogs();
    const results = evaluateSovereign(3400, 32, 100);
    unmuteLogs();

    console.log(`  Simulated 100 runs for Sovereign HP 3400 + 1700:`);
    console.log(`    Band 3 Win Rate: ${(results.band3Res.winRate * 100).toFixed(1)}% (Target: 85% - 100%)`);
    console.log(`    Band 3 Sloppy:   ${(results.band3SloppyRes.winRate * 100).toFixed(1)}%`);
    console.log(`    Band 2 Win Rate: ${(results.band2Res.winRate * 100).toFixed(1)}% (Target: < 25%)`);
    console.log(`    Mean Duration:   ${results.band3Res.avgDurationSec.toFixed(1)}s`);

    assert.ok(
      results.band3Res.winRate >= 0.85,
      `Band 3 win rate must be >= 85%, got ${(results.band3Res.winRate * 100).toFixed(1)}%`
    );
    assert.ok(
      results.band2Res.winRate < 0.25,
      `Band 2 win rate must be strictly under 25%, got ${(results.band2Res.winRate * 100).toFixed(1)}%`
    );

    console.log('✔ PASS: Test 6 - Glacial Sovereign calibration targets confirmed.\n');
  }

  // ===========================================================================
  // TEST 7: Determinism Check (F1–15 seeds 1–50 fixture matches 100%)
  // ===========================================================================
  console.log('--- TEST 7: Determinism Fixture Verification (Seeds 1–50) ---');
  {
    const fixturePath = path.resolve(rootDir, 'test/fixtures/dungeon_determinism_pre_cache_seeds_1_50.json');
    assert.ok(fs.existsSync(fixturePath), 'Determinism fixture file must exist');

    const fixtureRecords = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    for (let seed = 1; seed <= 50; seed++) {
      const d = DungeonGenerator.generate(dungeonConfig, DungeonGenerator.createRng(seed), {
        seed,
        currentFloorSeed: seed,
        floorNumber: 3,
        isTutorialComplete: true,
        isDiggingUnlocked: true,
        grove: { staffObtained: false, misses: 5 }
      });

      const floorData = {
        width: d.width,
        height: d.height,
        gridMatrix: d.gridMatrix,
        rooms: d.rooms,
        portalPos: d.portalPos,
        crystalPos: d.crystalPos,
        enemySpawns: d.enemySpawns,
        bushSpawns: d.bushSpawns,
        waterTiles: d.waterTiles || [],
        overgrownGrove: d.overgrownGrove,
        groveEligible: d.groveEligible
      };

      const sha256 = crypto.createHash('sha256').update(JSON.stringify(floorData)).digest('hex');
      const expectedHash = typeof fixtureRecords[seed] === 'string' ? fixtureRecords[seed] : fixtureRecords[seed].sha256;
      assert.strictEqual(
        sha256,
        expectedHash,
        `Seed ${seed} floor data SHA-256 mismatch against fixture`
      );
    }
    console.log('  ✔ All 50 floor layouts and enemy spawns match pre-cache fixture 100%.');
    console.log('✔ PASS: Test 7 - Determinism preserved across earlier regions.\n');
  }

  // ===========================================================================
  // TEST 8: Data Guard: Existing Regions and Enemies are Unchanged
  // ===========================================================================
  console.log('--- TEST 8: Data Guard: Existing Regions and Enemies Integrity ---');
  {
    // 8A. Ancient Crypts (F1-5)
    const crypts = dungeonConfig.regions?.find((r: any) => r.id === 'ancient_crypts');
    assert.ok(crypts, 'ancient_crypts must exist');
    assert.strictEqual(crypts.eliteEnemyId, null);
    assert.strictEqual(crypts.epicEnemyId, null);

    // 8B. Abyssal Depths (F6-10)
    const depths = dungeonConfig.regions?.find((r: any) => r.id === 'abyssal_depths');
    assert.ok(depths, 'abyssal_depths must exist');
    assert.strictEqual(depths.eliteEnemyId, 'orc_warrior');
    assert.strictEqual(depths.epicEnemyId, null);

    // 8C. Infernal Caldera (F11-15)
    const caldera = dungeonConfig.regions?.find((r: any) => r.id === 'infernal_caldera');
    assert.ok(caldera, 'infernal_caldera must exist');
    assert.strictEqual(caldera.eliteEnemyId, 'orc_warrior');
    assert.strictEqual(caldera.epicEnemyId, 'void_knight');

    // 8D. Existing bosses in bossPool and stats unchanged
    assert.deepStrictEqual(dungeonConfig.bossPool, ['bone_warden', 'abyssal_colossus', 'magma_tyrant', 'glacial_sovereign']);

    const boneWarden = dl.getEnemy('bone_warden')!;
    assert.strictEqual(boneWarden.hp, 240);
    assert.strictEqual(boneWarden.criticalHpMax, 120);

    const abyssalColossus = dl.getEnemy('abyssal_colossus')!;
    assert.strictEqual(abyssalColossus.hp, 450);
    assert.strictEqual(abyssalColossus.criticalHpMax, 225);

    const magmaTyrant = dl.getEnemy('magma_tyrant')!;
    assert.strictEqual(magmaTyrant.hp, 1200);
    assert.strictEqual(magmaTyrant.criticalHpMax, 600);

    console.log('  ✔ Crypts, Depths, and Caldera regions, pools, and bosses completely untouched.');
    console.log('✔ PASS: Test 8 - Existing regions data guard passed.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL GLACIAL CAVERNS ENEMIES & SOVEREIGN TESTS PASSED! 🎉');
  console.log('================================================================');
}

runGlacialEnemiesTests().catch((err) => {
  console.error('Glacial enemies test failed:', err);
  process.exit(1);
});
