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
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';

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
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {},
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {}
    }, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => obj;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      }
    });
    return obj;
  };

  return {
    time: { now: 1000 },
    pathfinder,
    events: { emit: () => {}, on: () => {}, off: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      existing: (item: any) => item
    },
    tweens: {
      add: () => ({ remove: () => {} })
    }
  };
}

async function run() {
  console.log('=== TEST: PER-LEVEL STAT GAINS & CLASS LEVELS TO 100 ===\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const playerData = dl.getPlayer();
  const classesData = dl.getClassesData();
  const { Player } = await import('../src/entities/Player.ts');

  // Verify real base values from player.json
  assert.equal(playerData.maxHp, 50, 'player.json base maxHp must be 50');
  assert.equal(playerData.criticalHpMax, 25, 'player.json base criticalHpMax must be 25');
  assert.equal(playerData.maxEnergy, 100, 'player.json base maxEnergy must be 100');
  assert.equal(playerData.energyRegenPerSecond, 0.5, 'player.json base energyRegenPerSecond must be 0.5');

  // --------------------------------------------------------------------------
  // Test 1: Training sword proficiency from 0 to 10
  // --------------------------------------------------------------------------
  console.log('1. Testing weapon proficiency training 0 -> 10...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);

    assert.equal(hero.maxHp, 50);
    assert.equal(hero.criticalHp, 25);
    assert.equal(hero.maxCriticalHp, 25);
    assert.equal(hero.energyRegenPerSecond, 0.5);

    // Cumulative EXP 0 -> 10 is 680 EXP
    const res = hero.progression.addProficiencyExp('short_swords', 680);
    assert.equal(res.leveledUp, true);
    assert.equal(hero.progression.getProficiencyLevel('short_swords'), 10);

    // +0.5 HP per level => +5.0 Max HP (50 -> 55)
    assert.equal(hero.maxHp, 55.0, 'Max HP must rise by +5.0 (50 -> 55)');
    // Critical HP: half of Max HP gain => +2.5 Critical HP (25 -> 27.5)
    assert.equal(hero.maxCriticalHp, 27.5, 'Max Critical HP must rise by +2.5 (25 -> 27.5)');
    // +0.005 EN/s per level => +0.05 EN/s (0.50 -> 0.55)
    assert.ok(Math.abs(hero.energyRegenPerSecond - 0.55) < 0.0001, `EN/s must rise by +0.05 (got ${hero.energyRegenPerSecond})`);

    // Mid-run current HP and critical HP rise by the same amount
    assert.equal(hero.hp, 55.0, 'Current HP must rise by exactly 5 mid-run');
    assert.equal(hero.criticalHp, 27.5, 'Current Critical HP must rise by exactly 2.5 mid-run');
    console.log('✓ PASS: Weapon 0 -> 10 gives +5 Max HP, +2.5 Crit HP, +0.05 EN/s, and current HP rises by 5.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Training a magic school to 50
  // --------------------------------------------------------------------------
  console.log('2. Testing magic school training 0 -> 50...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('fire_staff')!, 32);

    let expFor50 = 0;
    for (let l = 0; l < 50; l++) {
      expFor50 += LevelingSystem.expForNextLevel(l);
    }
    hero.progression.addProficiencyExp('fire_magic', expFor50);
    assert.equal(hero.progression.getProficiencyLevel('fire_magic'), 50);

    // +0.5 Max Energy per level => +25.0 Max Energy (100 -> 125)
    assert.equal(hero.maxEnergy, 125.0, 'Max Energy must rise by +25.0 (100 -> 125)');
    // +0.02 EN/s per level => +1.0 EN/s (0.50 -> 1.50)
    assert.ok(Math.abs(hero.energyRegenPerSecond - 1.50) < 0.0001, `In-combat EN/s must rise by +1.0 (got ${hero.energyRegenPerSecond})`);
    // Current energy rises mid-run
    assert.equal(hero.energy, 125.0, 'Current Energy must rise by +25 mid-run');
    console.log('✓ PASS: Magic 0 -> 50 gives +25 Max Energy, +1.0 EN/s, and current energy rises by 25.');
  }

  // --------------------------------------------------------------------------
  // Test 3: No-ceiling tests (replacing caps tests per owner directive)
  // --------------------------------------------------------------------------
  console.log('3. Testing no-ceiling linear scaling (uncapped stat gains)...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);

    // Over-train weapons across 10 weapon proficiencies to 100 levels each = 1,000 total levels
    const weapons10 = [
      'short_swords', 'longswords', 'greatswords', 'katana', 'daggers',
      'mace', 'spears', 'bows', 'crossbows', 'throwing_weapons'
    ];
    let exp100 = 0;
    for (let l = 0; l < 100; l++) {
      exp100 += LevelingSystem.expForNextLevel(l);
    }
    for (const w of weapons10) {
      hero.progression.addProficiencyExp(w, exp100);
      assert.equal(hero.progression.getProficiencyLevel(w), 100);
    }

    // 1,000 weapon levels * 0.5 = exactly +500 Max HP, +250 Critical HP
    assert.equal(hero.maxHp, 550.0, 'Max HP must be exactly 50 + 500 = 550 (no cap)');
    assert.equal(hero.maxCriticalHp, 275.0, 'Max Critical HP must be exactly 25 + 250 = 275 (no cap)');

    // Over-train magic schools: 3 magic schools to 100 levels each = 300 levels
    // 300 magic levels * 0.02 = exactly +6.0 EN/s
    const magic3 = ['fire_magic', 'ice_magic', 'lightning_magic'];
    for (const m of magic3) {
      hero.progression.addProficiencyExp(m, exp100);
      assert.equal(hero.progression.getProficiencyLevel(m), 100);
    }
    assert.ok(
      Math.abs(hero.energyRegenPerSecond - (0.5 + (1000 * 0.005) + (300 * 0.02))) < 0.0001,
      `EN/s must scale linearly with no ceiling: expected ${0.5 + 5.0 + 6.0} = 11.5 EN/s (got ${hero.energyRegenPerSecond})`
    );
    console.log('✓ PASS: Over-training weapons to 1,000 levels yields exactly +500 HP & +250 Crit HP; magic to 300 levels yields +6.0 EN/s.');
  }

  // --------------------------------------------------------------------------
  // Test 4: Class EXP carries a class from Lv 40 to Lv 41 and beyond
  // --------------------------------------------------------------------------
  console.log('4. Testing class leveling beyond Lv 40 (40 -> 41+)...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);

    hero.progression.setClassLevel('vanguard', 40);
    assert.equal(hero.progression.getClassLevel('vanguard'), 40);

    const hpAt40 = hero.maxHp;
    const regenAt40 = hero.energyRegenPerSecond;

    // Level 40 -> 41 requires 50 + 40 * 4 = 210 EXP
    const expNeeded40to41 = LevelingSystem.expForNextLevel(40);
    assert.equal(expNeeded40to41, 210);

    const res = hero.progression.addClassExp('vanguard', 210);
    assert.equal(res.leveledUp, true);
    assert.equal(hero.progression.getClassLevel('vanguard'), 41);

    // Class level gains: +0.2 HP, +0.002 EN/s per class level
    assert.ok(Math.abs((hero.maxHp - hpAt40) - 0.2) < 0.0001, 'Max HP must increase by +0.2 for reaching Lv 41');
    assert.ok(Math.abs((hero.energyRegenPerSecond - regenAt40) - 0.002) < 0.0001, 'EN/s must increase by +0.002 for reaching Lv 41');
    console.log('✓ PASS: Class level advances from 40 to 41 via addClassExp and receives class stat gains.');
  }

  // --------------------------------------------------------------------------
  // Test 5: Save round-trip, old save loading, and Fix 1 (no magic 25 on damaged load)
  // --------------------------------------------------------------------------
  console.log('5. Testing save round-trip, old save loading, and damaged character critical HP clamp...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);

    // Train swords to 20 (+10 HP, +5 Crit HP => Max Crit HP = 30)
    let expFor20 = 0;
    for (let l = 0; l < 20; l++) expFor20 += LevelingSystem.expForNextLevel(l);
    hero.progression.addProficiencyExp('short_swords', expFor20);
    assert.equal(hero.maxCriticalHp, 30);

    // Damage the character: Main HP = 0, Critical HP = 10 of 30
    hero.hp = 0;
    hero.criticalHp = 10;
    hero.energy = 40;

    // Snapshot state
    const snapshot = hero.getSnapshot();
    assert.equal(snapshot.criticalHp, 10, 'Snapshot must record 10 Critical HP');
    assert.equal(snapshot.hp, 0);
    assert.equal(snapshot.energy, 40);

    // Restore into a new Player
    const restoredHero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);
    restoredHero.restoreFromSnapshot(snapshot, 2000);

    // Fix 1 verification: Must NOT grant free critical HP on load!
    assert.equal(restoredHero.maxCriticalHp, 30, 'Derived maxCriticalHp must be 30');
    assert.equal(restoredHero.criticalHp, 10, 'Damaged character must load with critical HP still 10 (no magic 25)');
    assert.equal(restoredHero.hp, 0, 'HP must remain 0');
    assert.equal(restoredHero.energy, 40, 'Energy must remain 40');
    assert.equal(restoredHero.maxHp, hero.maxHp, 'Max HP must match exactly');
    assert.equal(restoredHero.energyRegenPerSecond, hero.energyRegenPerSecond, 'EN/s must match exactly');

    // Round-trip again: verify zero double-application
    const snapshot2 = restoredHero.getSnapshot();
    const restoredAgain = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);
    restoredAgain.restoreFromSnapshot(snapshot2, 3000);
    assert.equal(restoredAgain.maxHp, hero.maxHp);
    assert.equal(restoredAgain.maxCriticalHp, hero.maxCriticalHp);
    assert.equal(restoredAgain.energyRegenPerSecond, hero.energyRegenPerSecond);
    assert.equal(restoredAgain.criticalHp, 10);

    // Old legacy snapshot without statGains metadata
    const legacySnap: any = {
      id: 'legacy-char',
      name: 'Old Adventurer',
      hp: 50,
      criticalHp: 20,
      energy: 80,
      equippedWeaponId: 'short_swords',
      proficiencies: {
        short_swords: { level: 10, currentExp: 0 }
      },
      classLevels: {},
      unlockedClasses: []
    };
    const legacyHero = new Player(scene, 5, 5, playerData, dl.getWeapon('short_swords')!, 32);
    legacyHero.restoreFromSnapshot(legacySnap, 4000);
    assert.equal(legacyHero.maxHp, 55, 'Legacy character must recompute +5 HP from 10 sword levels');
    assert.equal(legacyHero.maxCriticalHp, 27.5, 'Legacy character must recompute +2.5 Crit HP');
    assert.equal(legacyHero.criticalHp, 20, 'Legacy character critical HP (20) must be preserved without magic 25');
    console.log('✓ PASS: Save round-trip keeps values identical with zero double-application; damaged load preserves critical HP.');
  }

  // --------------------------------------------------------------------------
  // Test 6: Companions receive the stat gains
  // --------------------------------------------------------------------------
  console.log('6. Testing companion stat gains...');
  {
    const scene = createMockScene();
    const compProg = new ProgressionSystem(classesData, 'Companion Lyra');
    const companion = new Player(scene, 6, 6, playerData, dl.getWeapon('daggers')!, 32, 'companion-avatar', compProg);
    companion.entityName = 'Companion Lyra';

    assert.equal(companion.maxHp, 50);
    assert.equal(companion.maxCriticalHp, 25);

    // Train companion daggers 0 -> 10 (+5 HP, +2.5 Crit HP, +0.05 EN/s)
    companion.progression.addProficiencyExp('daggers', 680);
    assert.equal(companion.maxHp, 55.0, 'Companion maxHp must increase to 55');
    assert.equal(companion.maxCriticalHp, 27.5, 'Companion maxCriticalHp must increase to 27.5');
    assert.ok(Math.abs(companion.energyRegenPerSecond - 0.55) < 0.0001, 'Companion energy regen must increase to 0.55');
    assert.equal(companion.hp, 55.0, 'Companion current HP must rise mid-run');
    console.log('✓ PASS: Companion receives derived stat gains identically to leader.');
  }

  // --------------------------------------------------------------------------
  // Test 7: In-combat regen with Magic 100
  // --------------------------------------------------------------------------
  console.log('7. Testing in-combat regen with Magic 100 (2.5 EN/s over 10 s)...');
  {
    const scene = createMockScene();
    const hero = new Player(scene, 5, 5, playerData, dl.getWeapon('arcane_staff')!, 32);

    let expFor100 = 0;
    for (let l = 0; l < 100; l++) expFor100 += LevelingSystem.expForNextLevel(l);
    hero.progression.addProficiencyExp('arcane_magic', expFor100);
    assert.equal(hero.progression.getProficiencyLevel('arcane_magic'), 100);

    // Base: 0.5 EN/s + (100 * 0.02) = 2.5 EN/s
    assert.ok(Math.abs(hero.energyRegenPerSecond - 2.5) < 0.0001, `In-combat EN/s must be 2.5 (got ${hero.energyRegenPerSecond})`);

    // In combat: regen rate = 2.5 * 1.0 = 2.5 EN/s
    hero.inCombat = true;
    hero.energy = 10; // Start at 10 energy (well below maxEnergy 150)

    // Simulate 10 seconds in 1000ms steps
    for (let s = 1; s <= 10; s++) {
      hero.update(1000 + s * 1000, 1000);
    }

    // Energy should have increased by 2.5 * 10 = 25 EN (10 -> 35)
    assert.ok(
      Math.abs(hero.energy - 35.0) < 0.01,
      `Hero should regenerate exactly 25.0 energy over 10s of combat (got ${hero.energy - 10})`
    );
    console.log('✓ PASS: Magic 100 regenerates exactly 25.0 EN over 10s in combat (2.5 EN/s).');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL STAT GAINS & CLASS LEVELS TO 100 TESTS PASSED PERFECTLY!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('[FAILED] Test error:', err);
  process.exit(1);
});
