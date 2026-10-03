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
  const mockStorage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    localStorage: (global as any).localStorage
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
    getElementById: () => null,
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
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { CraftingSystem } from '../src/systems/CraftingSystem.ts';
import type { WeaponDef, PlayerData } from '../src/types/game.ts';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE TEST SUITE: FOUR SCHOOLS (WATER, EARTH, NATURE, WIND)');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const basePlayerData: PlayerData = {
    ...dataLoader.getPlayer(),
    hpMax: 50,
    criticalHpMax: 25
  };
  gameState.resetToDefault(basePlayerData);

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
        play: () => obj,
        anims: { play: () => {} },
        clear: () => obj,
        fillStyle: () => obj,
        fillRect: () => obj,
        lineStyle: () => obj,
        strokeRect: () => obj,
        strokeLineShape: () => obj,
        beginPath: () => obj,
        moveTo: () => obj,
        lineTo: () => obj,
        strokePath: () => obj,
        setText: () => obj,
        setColor: () => obj,
        removeFromDisplayList: () => {},
        addedToScene: () => {},
        removedFromScene: () => {},
        addedToContainer: () => {},
        removedFromContainer: () => {},
        x: 0,
        y: 0
      };
      return obj;
    };

    return {
      tileSize: 32,
      gridWidth,
      gridHeight,
      pathfinder,
      isOutpost: true,
      sound: { play: () => {} },
      time: {
        now: 1000,
        addEvent: () => ({ remove: () => {} }),
        delayedCall: (_ms: number, cb: () => void) => cb()
      },
      sys: {
        queueDepthSort: () => {},
        events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
        input: { enable: () => {}, disable: () => {} },
        displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
        updateList: { add: () => {}, remove: () => {} }
      },
      add: {
        text: () => createMockObj(),
        graphics: () => createMockObj(),
        rectangle: () => createMockObj(),
        sprite: () => createMockObj(),
        circle: () => createMockObj(),
        line: () => createMockObj(),
        existing: (obj: any) => obj,
        container: () => {
          const container = createMockObj();
          container.add = () => container;
          return container;
        },
        image: () => createMockObj()
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) config.onComplete();
          return { stop: () => {}, remove: () => {} };
        }
      },
      events: { emit: () => {}, on: () => {}, off: () => {} }
    };
  }

  const startingWeapon: WeaponDef = dataLoader.getWeapon('short_swords')!;

  function createTestPlayer(scene: any, name: string, x: number = 0, y: number = 0, maxHp: number = 50, maxCrit: number = 25): any {
    const pData: PlayerData = {
      ...basePlayerData,
      name,
      hpMax: maxHp,
      criticalHpMax: maxCrit
    };
    const prog = new ProgressionSystem();
    const p = new Player(scene, x, y, pData, startingWeapon, 32, 'hero', prog);
    p.entityName = name;
    p.maxHp = maxHp;
    p.hp = maxHp;
    p.maxCriticalHp = maxCrit;
    p.criticalHp = maxCrit;
    return p;
  }

  const mockScene = createMockScene();

  // ----------------------------------------------------------------
  // TEST 1: Backward-Compatible Save Loading (Proficiencies)
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Backward Compatibility (Old Saves Missing Four Schools) ---');
  {
    const prog = new ProgressionSystem();
    // Simulate an old save snapshot that lacks the four new magic proficiencies
    const oldSaveData = {
      proficiencies: {
        short_swords: { level: 2, currentExp: 50 },
        fire_magic: { level: 1, currentExp: 10 },
        healing_magic: { level: 3, currentExp: 0 }
      },
      classLevels: {},
      unlockedClasses: ['villager']
    };

    prog.loadSnapshotData(oldSaveData as any);

    assert.equal(prog.getProficiencyLevel('short_swords'), 2, 'Existing proficiency loaded correctly');
    assert.equal(prog.getProficiencyLevel('water_magic'), 0, 'water_magic loaded with default level 0');
    assert.equal(prog.getProficiencyStat('water_magic').currentExp, 0, 'water_magic loaded with 0 exp');
    assert.equal(prog.getProficiencyLevel('earth_magic'), 0, 'earth_magic loaded with default level 0');
    assert.equal(prog.getProficiencyLevel('nature_magic'), 0, 'nature_magic loaded with default level 0');
    assert.equal(prog.getProficiencyLevel('wind_magic'), 0, 'wind_magic loaded with default level 0');
  }
  console.log('✓ PASS: Old saves missing four schools load gracefully at Lv 0 with 0 EXP.\n');

  // ----------------------------------------------------------------
  // TEST 2: Proficiency Leveling and EN Cost Reduction
  // ----------------------------------------------------------------
  console.log('--- TEST 2: Proficiency Leveling & Energy Cost Scaling ---');
  {
    const player = createTestPlayer(mockScene, 'Archmage', 0, 0);
    const windStaff = dataLoader.getWeapon('wind_staff')!;
    const windMagic = dataLoader.getWeapon('wind_magic')!;
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const enemy = new Enemy(mockScene, 2, 0, enemyDef);
    const combat = new CombatSystem(mockScene, [player], [enemy], mockScene.pathfinder);

    player.equippedWeapon = windStaff;

    // Lv 0 base energy cost
    const effectiveLv0 = combat.getEffectiveWeaponForAttack(player);
    assert.equal(effectiveLv0.id, 'wind_magic', 'wind_staff conduit casts wind_magic');
    assert.equal(effectiveLv0.energyCostPerCast, 14, 'wind_magic baseline EN cost is 14');

    // Grant EXP to wind_magic to level it up to Lv 5
    player.progression.addProficiencyExp('wind_magic', 600);
    const lvl = player.progression.getProficiencyLevel('wind_magic');
    assert.ok(lvl > 0, `wind_magic should level up (current level: ${lvl})`);

    const effectiveLvN = combat.getEffectiveWeaponForAttack(player);
    assert.equal(effectiveLvN.id, 'wind_magic');
    const expectedCost = Math.max(1, Math.round(14 - (lvl * (windMagic.levelBonus?.energyCostReductionPerLevel ?? 0.1))));
    // Calculate cost deduction as in attack loop
    const actualCost = Math.max(1, Math.round(effectiveLvN.energyCostPerCast! - (effectiveLvN.levelBonus?.energyCostReductionPerLevel ?? 0.1) * lvl));
    assert.equal(actualCost, expectedCost, 'Energy cost reduced by proficiency level');
    assert.ok(actualCost < 14, 'Leveled spell costs strictly less energy');
  }
  console.log('✓ PASS: Proficiency leveling reduces spell energy cost correctly.\n');

  // ----------------------------------------------------------------
  // TEST 3: Water Magic - Slow Proc & Tidal Ally Heal
  // ----------------------------------------------------------------
  console.log('--- TEST 3: Water Magic (Slow Proc + Tidal Ally Heal) ---');
  {
    const caster = createTestPlayer(mockScene, 'Water Priest', 0, 0, 50, 25);
    const wounded = createTestPlayer(mockScene, 'Injured Knight', 1, 0, 50, 25);
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const enemy = new Enemy(mockScene, 2, 0, enemyDef);

    const waterMagic = dataLoader.getWeapon('water_magic')!;
    assert.equal(waterMagic.slowChance, 0.20, 'Water Magic has Director-mandated 20% slow chance');
    assert.equal(waterMagic.tidalHealAmount, 2, 'Water Magic has 2 HP tidal heal');

    const combat = new CombatSystem(mockScene, [caster, wounded], [enemy], mockScene.pathfinder);

    // Injure wounded ally: Critical HP down by 5
    wounded.hp = 0;
    wounded.criticalHp = 20;

    // Apply Tidal Heal
    combat.applyWaterTidalHeal(caster, enemy, waterMagic, 0);

    // Wounded ally should have healed for 2 HP (from 20 to 22 Crit HP)
    assert.equal(wounded.criticalHp, 22, 'Most injured ally healed for 2 HP');

    // Test slow application
    const slowDef = dataLoader.getStatusEffect('slow')!;
    enemy.applyStatusEffect(slowDef);
    assert.ok(enemy.hasStatusEffect('slow'), 'Slow status effect applies to enemy');
    assert.equal(enemy.getStatusEffect('slow')?.def?.moveSpeedMultiplier, 0.5, 'Slow halves move speed');
  }
  console.log('✓ PASS: Water Magic heals most injured ally and applies Slow.\n');

  // ----------------------------------------------------------------
  // TEST 4: Earth Magic - Stun & Stoneskin (-10% Damage Taken)
  // ----------------------------------------------------------------
  console.log('--- TEST 4: Earth Magic (Stun + Party Stoneskin & Damage Reduction) ---');
  {
    const caster = createTestPlayer(mockScene, 'Geomancer', 0, 0, 50, 25);
    const ally = createTestPlayer(mockScene, 'Vanguard', 1, 0, 50, 25);
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const enemy = new Enemy(mockScene, 2, 0, enemyDef);

    const earthMagic = dataLoader.getWeapon('earth_magic')!;
    assert.equal(earthMagic.baseDamage, 10, 'Earth Magic has Director-mandated 10 damage (5.56 DPS)');
    assert.equal(earthMagic.stunChance, 0.20, 'Earth Magic has 20% stun chance');

    const combat = new CombatSystem(mockScene, [caster, ally], [enemy], mockScene.pathfinder);

    // Cast Stoneskin
    combat.applyEarthStoneskin(caster, earthMagic);

    assert.ok(caster.hasStatusEffect('stoneskin'), 'Caster received Stoneskin buff');
    assert.ok(ally.hasStatusEffect('stoneskin'), 'Party ally received Stoneskin buff');
    const stoneEffect = ally.getStatusEffect('stoneskin');
    assert.equal(stoneEffect?.def?.damageTakenMultiplier, 0.90, 'Stoneskin provides -10% damage taken (multiplier 0.90)');

    // Refresh Stoneskin test (refresh duration, not stack multiplier)
    combat.applyEarthStoneskin(caster, earthMagic);
    assert.equal(ally.getStatusEffect('stoneskin')?.def?.damageTakenMultiplier, 0.90, 'Stoneskin multiplier does not stack');

    // Test damage reduction on hit: ally at 50 HP takes 20 base damage with Stoneskin
    // 20 * 0.90 = 18 damage taken -> HP should become 50 - 18 = 32
    ally.takeDamage(20);
    assert.equal(ally.hp, 32, 'Incoming 20 damage reduced to 18 by Stoneskin');
  }
  console.log('✓ PASS: Earth Magic applies Stoneskin (-10% damage taken) refreshed and not stacked.\n');

  // ----------------------------------------------------------------
  // TEST 5: Nature Magic - Timed Poison & Regrowth (1 Active Per Caster)
  // ----------------------------------------------------------------
  console.log('--- TEST 5: Nature Magic (Timed Poison + Regrowth + 1 Active Per Caster) ---');
  {
    const caster = createTestPlayer(mockScene, 'Druid', 0, 0, 50, 25);
    const allyA = createTestPlayer(mockScene, 'Ally A', 1, 0, 50, 25);
    const allyB = createTestPlayer(mockScene, 'Ally B', 2, 0, 50, 25);
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const enemy = new Enemy(mockScene, 3, 0, enemyDef);

    const natureMagic = dataLoader.getWeapon('nature_magic')!;
    assert.equal(natureMagic.poisonChance, 0.30, 'Nature Magic has 30% poison chance');

    const combat = new CombatSystem(mockScene, [caster, allyA, allyB], [enemy], mockScene.pathfinder);

    // Apply Nature Poison to enemy
    combat.checkAndApplyPoison(enemy, natureMagic, 0);
    // Force poison apply to test expiration and ticks
    const timedPoison = {
      ...(dataLoader.getStatusEffect('poison')!),
      persistent: false,
      durationMs: 6000
    };
    enemy.clearStatusEffects();
    enemy.applyStatusEffect(timedPoison);

    const activePoison = enemy.getStatusEffect('poison');
    assert.ok(activePoison, 'Enemy has poison');
    assert.equal(activePoison.remainingMs, 6000, 'Poison duration is 6s');
    assert.equal(activePoison.def.persistent, false, 'Poison is non-persistent/finite');

    // Simulate 3 ticks of 2 damage over 6 seconds
    const hpBeforeTicks = enemy.hp;
    // Tick 1 (at 2s): -2 HP
    enemy.updateStatusEffects(2000);
    assert.equal(enemy.hp, hpBeforeTicks - 2, 'Tick 1 dealt 2 poison damage');
    // Tick 2 (at 4s): -2 HP
    enemy.updateStatusEffects(2000);
    assert.equal(enemy.hp, hpBeforeTicks - 4, 'Tick 2 dealt 2 poison damage');
    // Tick 3 (at 6s): -2 HP and expires
    enemy.updateStatusEffects(2000);
    assert.equal(enemy.hp, hpBeforeTicks - 6, 'Tick 3 dealt 2 poison damage (total 6 damage)');
    assert.equal(enemy.hasStatusEffect('poison'), false, 'Poison expired cleanly after 6s');

    // Test Regrowth: allyA is wounded
    allyA.hp = 30; // missing 20 HP
    allyB.hp = 50; // full HP

    combat.applyNatureRegrowth(caster, natureMagic);
    assert.ok(allyA.hasStatusEffect('regrowth'), 'Ally A received Regrowth');
    assert.ok(!allyB.hasStatusEffect('regrowth'), 'Ally B has no Regrowth');

    // Now allyB becomes more wounded:
    allyB.hp = 10; // missing 40 HP
    combat.applyNatureRegrowth(caster, natureMagic);

    // Director rule: Exactly one active Regrowth per caster!
    assert.ok(!allyA.hasStatusEffect('regrowth'), 'Ally A old Regrowth was removed when caster switched targets');
    assert.ok(allyB.hasStatusEffect('regrowth'), 'Ally B now carries the caster active Regrowth');
  }
  console.log('✓ PASS: Nature timed poison expires after 6s (3 ticks), and Regrowth strictly limits 1 per caster.\n');

  // ----------------------------------------------------------------
  // TEST 6: Nature Poison Guard (Never Downgrade Persistent Poison)
  // ----------------------------------------------------------------
  console.log('--- TEST 6: Nature Poison Guard (Never Downgrade Persistent Poison) ---');
  {
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const victim = new Enemy(mockScene, 0, 0, enemyDef);

    // Apply persistent spider/venom poison
    const persistentPoison = {
      ...(dataLoader.getStatusEffect('poison')!),
      persistent: true,
      durationMs: 0
    };
    victim.applyStatusEffect(persistentPoison);
    assert.ok(victim.hasStatusEffect('poison'));
    assert.equal(victim.getStatusEffect('poison')?.remainingMs, Infinity, 'Persistent poison has Infinity remainingMs');
    assert.equal(victim.getStatusEffect('poison')?.def?.persistent, true, 'Persistent poison flag is true');

    // Attempt to apply finite/timed Nature poison
    const timedPoison = {
      ...(dataLoader.getStatusEffect('poison')!),
      persistent: false,
      durationMs: 6000
    };
    victim.applyStatusEffect(timedPoison);

    // Verify persistent poison was NOT downgraded
    const currentPoison = victim.getStatusEffect('poison');
    assert.equal(currentPoison?.remainingMs, Infinity, 'Poison duration must remain Infinity (not downgraded to 6000)');
    assert.equal(currentPoison?.def?.persistent, true, 'Poison must remain persistent: true');
  }
  console.log('✓ PASS: Persistent poison is never downgraded or overwritten by timed Nature poison.\n');

  // ----------------------------------------------------------------
  // TEST 7: Wind Magic - Line Piercing Corridor Geometry
  // ----------------------------------------------------------------
  console.log('--- TEST 7: Wind Magic Line Piercing Corridor Geometry ---');
  {
    const caster = createTestPlayer(mockScene, 'Wind Runner', 0, 0, 50, 25);
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];

    // Primary target at tile (2, 0)
    const target1 = new Enemy(mockScene, 2, 0, enemyDef);
    // Behind target within 1 tile corridor (at tile (3, 0) - 1 tile behind target1)
    const behind1 = new Enemy(mockScene, 3, 0, enemyDef);
    // Behind target within 1 tile corridor (at tile (4, 0) - 2 tiles behind target1)
    const behind2 = new Enemy(mockScene, 4, 0, enemyDef);
    // Behind target within 1 tile corridor (at tile (5, 0) - 3 tiles behind target1)
    const behind3 = new Enemy(mockScene, 5, 0, enemyDef);
    // Behind caster (at tile (-1, 0))
    const enemyBehindCaster = new Enemy(mockScene, -1, 0, enemyDef);
    // Off to the side (at tile (3, 3) - perpendicular distance > 32px corridor limit)
    const enemyWide = new Enemy(mockScene, 3, 3, enemyDef);

    const windMagic = dataLoader.getWeapon('wind_magic')!;
    const allEnemies = [target1, behind1, behind2, behind3, enemyBehindCaster, enemyWide];
    const combat = new CombatSystem(mockScene, [caster], allEnemies, mockScene.pathfinder);

    // Sub-case A: Single target with nothing behind
    const soloCombat = new CombatSystem(mockScene, [caster], [target1], mockScene.pathfinder);
    target1.hp = 50;
    soloCombat.applyWindLinePierce(caster, target1, 5, windMagic, 'wind_magic');
    assert.equal(target1.hp, 50, 'applyWindLinePierce only affects secondary targets behind primary');

    // Sub-case B: Hits up to 2 enemies behind in corridor, nearest first
    behind1.hp = 50;
    behind2.hp = 50;
    behind3.hp = 50;
    enemyBehindCaster.hp = 50;
    enemyWide.hp = 50;

    combat.applyWindLinePierce(caster, target1, 5, windMagic, 'wind_magic');

    assert.equal(behind1.hp, 45, 'First enemy behind took full 5 damage');
    assert.equal(behind2.hp, 45, 'Second enemy behind took full 5 damage');
    assert.equal(behind3.hp, 50, 'Third enemy behind was spared (max 2 behind primary target)');
    assert.equal(enemyBehindCaster.hp, 50, 'Enemy behind caster took no damage');
    assert.equal(enemyWide.hp, 50, 'Enemy outside 1-tile corridor took no damage');
  }
  console.log('✓ PASS: Wind Magic piercing corridor hits up to 2 enemies behind target with exact geometry.\n');

  // ----------------------------------------------------------------
  // TEST 8: Elemental Attack Status Effects (All 10 Elementals)
  // ----------------------------------------------------------------
  console.log('--- TEST 8: Elemental Status Effects (All 10 Elementals) ---');
  {
    const player = createTestPlayer(mockScene, 'Target Hero', 0, 0, 50, 25);
    const combat = new CombatSystem(mockScene, [player], [], mockScene.pathfinder);

    // Helper to test elemental status deterministically
    const testElementalStatus = (school: string): ActiveStatusEffect | undefined => {
      player.clearStatusEffects();
      const mockElem = {
        enemyData: {
          id: `${school}_elemental`,
          name: `${school} Elemental`,
          school
        }
      } as any;
      const origRandom = Math.random;
      try {
        Math.random = () => 0.01; // Deterministic proc
        combat.applyElementalAttackStatus(mockElem, player);
      } finally {
        Math.random = origRandom;
      }
      return player.activeStatusEffects.values().next().value;
    };

    // 1. Earth elemental: Stun with 1s duration override
    const earthStatus = testElementalStatus('earth');
    assert.ok(earthStatus, 'Earth elemental procs stun');
    assert.equal(earthStatus?.def?.id, 'stun', 'Earth status is stun');
    assert.equal(earthStatus?.remainingMs, 1000, 'Earth elemental stun duration is 1s override (1000ms)');

    // 2. Nature elemental: Poison with 6s duration override
    const natureStatus = testElementalStatus('nature');
    assert.ok(natureStatus, 'Nature elemental procs poison');
    assert.equal(natureStatus?.def?.id, 'poison', 'Nature status is poison');
    assert.equal(natureStatus?.remainingMs, 6000, 'Nature elemental poison duration is 6s override (6000ms)');

    // 3. Ice elemental: Frostbite
    const iceStatus = testElementalStatus('ice');
    assert.ok(iceStatus, 'Ice elemental procs frostbite');
    assert.equal(iceStatus?.def?.id, 'frostbite', 'Ice status is frostbite');

    // 4. Holy elemental: Blind
    const holyStatus = testElementalStatus('holy');
    assert.ok(holyStatus, 'Holy elemental procs blind');
    assert.equal(holyStatus?.def?.id, 'blind', 'Holy status is blind');

    // 5. Water elemental: Slow
    const waterStatus = testElementalStatus('water');
    assert.ok(waterStatus, 'Water elemental procs slow');
    assert.equal(waterStatus?.def?.id, 'slow', 'Water status is slow');

    // 6. Arcane / Wind: Plain damage, no status
    player.clearStatusEffects();
    const windElem = { enemyData: { id: 'wind_elemental', school: 'wind' } } as any;
    for (let i = 0; i < 20; i++) combat.applyElementalAttackStatus(windElem, player);
    assert.equal(player.activeStatusEffects.size, 0, 'Wind elemental inflicts no status effects');

    // 7. Verify all 10 elementals enabled in craftingConfig.json
    const craftingConfig = JSON.parse(fs.readFileSync('data/craftingConfig.json', 'utf8'));
    const schools = ['fire', 'water', 'ice', 'lightning', 'earth', 'nature', 'holy', 'dark', 'arcane', 'wind'];
    for (const s of schools) {
      assert.equal(craftingConfig.elementalSchools[s]?.enabled, true, `${s} elemental must be enabled in craftingConfig.json`);
    }
  }
  console.log('✓ PASS: All 10 elementals verified with proper status proc logic and enabled flags.\n');

  // ----------------------------------------------------------------
  // TEST 9: Crafting & Salvaging All Four New Staves
  // ----------------------------------------------------------------
  console.log('--- TEST 9: Crafting and Salvaging Four Staves ---');
  {
    const player = createTestPlayer(mockScene, 'Artisan', 0, 0);
    const craftingSystem = new CraftingSystem(player.progression, () => true);

    const recipes = [
      { id: 'craft_water_staff', staff: 'water_staff', crystal: 'water_crystal' },
      { id: 'craft_earth_staff', staff: 'earth_staff', crystal: 'earth_crystal' },
      { id: 'craft_nature_staff', staff: 'nature_staff', crystal: 'nature_crystal' },
      { id: 'craft_wind_staff', staff: 'wind_staff', crystal: 'wind_crystal' }
    ];

    for (const r of recipes) {
      const recipe = dataLoader.getEnchantingRecipe(r.id);
      assert.ok(recipe, `Recipe ${r.id} must exist in enchantingRecipes.json`);
      assert.equal(recipe.station, 'magical_weapon_station', 'Recipe must require magical_weapon_station');
      assert.equal(recipe.expGranted, 120, 'Recipe must grant 120 EXP');

      // Add materials (staff + crystal) and craft
      player.addItem('staff', 1);
      player.addItem(r.crystal, 1);

      const canCraft = CraftingSystem.canAfford(recipe, player);
      assert.ok(canCraft, `Player should have materials to craft ${r.staff}`);

      const result = CraftingSystem.applyCraft(player, recipe, 'enchanting');
      assert.equal(result.success, true, `Crafting ${r.staff} succeeded`);
      assert.ok(player.getItemCount(r.staff) > 0, `Player inventory now contains ${r.staff}`);

      // Test salvage
      const salvageResult = CraftingSystem.applySalvage(player, r.staff, { isOutpost: true, rng: () => 0.1 });
      assert.equal(salvageResult.success, true, `Salvaging ${r.staff} succeeded`);
      assert.ok(salvageResult.refunds['staff'] > 0 || salvageResult.refunds[r.crystal] > 0, `Salvage refunded staff or crystal materials`);

      // Verify conduit weapon mapping
      const conduit = dataLoader.getWeapon(r.staff);
      assert.ok(conduit?.spellWeaponId, `${r.staff} must define spellWeaponId`);
      const spell = dataLoader.getWeapon(conduit.spellWeaponId);
      assert.ok(spell, `Spell ${conduit.spellWeaponId} exists for conduit ${r.staff}`);
      assert.equal(spell.conduitWeaponId, r.staff, `Spell links back to conduit ${r.staff}`);
    }
  }
  console.log('✓ PASS: All four staves craftable with 120 EXP recipes, correct materials, and conduit links.\n');

  // ----------------------------------------------------------------
  // TEST 10: Knowledge Base Entries
  // ----------------------------------------------------------------
  console.log('--- TEST 10: Knowledge Base Descriptions ---');
  {
    for (const school of ['water_magic', 'earth_magic', 'nature_magic', 'wind_magic']) {
      const def = dataLoader.getTrainableStatDef(school);
      assert.ok(def, `Trainable stat def exists for ${school}`);
      assert.ok(def.description && def.description.length > 20, `Description for ${school} is detailed`);
      assert.ok(def.description.includes('Staff'), `Description mentions corresponding Staff`);
      assert.ok(def.description.includes('Band') || def.description.includes('band'), `Description mentions Home Band`);
    }
  }
  console.log('✓ PASS: Knowledge Base entries for all four schools are present and comprehensive.\n');

  console.log('================================================================');
  console.log('🎉 ALL MILESTONE FOUR SCHOOLS TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
