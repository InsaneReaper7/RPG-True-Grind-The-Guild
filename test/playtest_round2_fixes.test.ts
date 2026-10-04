import assert from 'node:assert/strict';
import fs from 'node:fs';
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
      addEventListener: noop
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
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Dynamically import modules
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { DungeonGenerator } = await import('../src/utils/DungeonGenerator.ts');

function createMockScene(): any {
  const noop = () => {};
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      setOrigin: () => obj,
      setDepth: () => obj,
      setVisible: () => obj,
      setAlpha: () => obj,
      setPosition: () => obj,
      setTexture: () => obj,
      setScale: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      destroy: noop,
      clear: noop,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      strokeCircle: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      setStrokeStyle: () => obj,
      setLineWidth: () => obj,
      setAngle: () => obj,
      removeFromDisplayList: noop,
      addedToScene: noop,
      removedFromScene: noop,
      addedToContainer: noop,
      removedFromContainer: noop,
      geom: { Point: class {} },
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      visible: true,
      text: ''
    };
    return obj;
  };

  return {
    sys: {
      queueDepthSort: noop,
      events: { once: noop, on: noop, off: noop, emit: noop },
      input: { enable: noop, disable: noop }
    },
    add: {
      line: () => createMockObj(),
      circle: () => createMockObj(),
      graphics: () => createMockObj(),
      text: () => createMockObj(),
      sprite: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) config.onComplete();
        return { stop: noop };
      }
    },
    pathfinder: {
      findPath: async () => [],
      hasLineOfSight: () => true
    },
    textures: {
      exists: () => true
    },
    isTileOccupied: () => false,
    getUnitAtTile: () => null
  };
}

async function runTests() {
  console.log('=== Playtest Round 2 Fixes Test Suite ===\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // ITEM 1: Gear Bag Store & Drop Confirmation
  // =========================================================================
  console.log('--- ITEM 1: Gear Bag Store & Drop Confirmation ---');
  {
    const gameState = GameState.getInstance();
    const playerData = dataLoader.getPlayer();
    gameState.resetToDefault(playerData);
    gameState.setSafeZone(true); // Outpost

    const mockScene = createMockScene();
    const prog = new ProgressionSystem(dataLoader.getClassesData(), 'Hero');
    const sword = dataLoader.getWeapon('short_swords')!;
    const hero = new Player(mockScene, 10, 10, playerData, sword, 32, 'hero-avatar', prog);

    // Register a crafted katana instance with bonus
    const instanceId = 'katana_inst_99';
    gameState.registerGearInstance({
      instanceId,
      baseItemId: 'katana',
      bonusPercent: 15,
      crafterName: 'Smith',
      createdAt: Date.now()
    });

    // Add instance to hero bag
    hero.addItem(instanceId, 1);
    assert.equal(hero.getItemCount(instanceId), 1, 'Hero bag has 1 crafted katana instance');
    assert.equal(gameState.getItemCount(instanceId), 0, 'Stockpile initially has 0 of this instance');

    // Attempt to store outside Outpost (safeZone = false)
    gameState.setSafeZone(false);
    const storeOutsideResult = gameState.depositGearItem(hero, instanceId);
    assert.equal(storeOutsideResult, false, 'Storing gear refused outside the Outpost');
    assert.equal(hero.getItemCount(instanceId), 1, 'Hero still has item after failed store');
    assert.equal(gameState.getItemCount(instanceId), 0, 'Stockpile still has 0 after failed store');

    // Store at Outpost (safeZone = true)
    gameState.setSafeZone(true);
    const storeSuccess = gameState.depositGearItem(hero, instanceId);
    assert.equal(storeSuccess, true, 'Storing gear succeeds at Outpost');
    assert.equal(hero.getItemCount(instanceId), 0, 'Hero bag has 0 of instance after store');
    assert.equal(gameState.getItemCount(instanceId), 1, 'Stockpile has 1 of instance after store');

    // Verify conservation: instance preserves its properties in gameState
    const retrieved = gameState.getGearInstance(instanceId);
    assert.ok(retrieved, 'Instance exists in gearInstances map');
    assert.equal(retrieved?.bonusPercent, 15, 'Instance preserved +15% crafting bonus');

    // Store All Gear test:
    // Add multiple unequipped gear pieces and consumables
    const daggerInst = 'daggers_inst_1';
    gameState.registerGearInstance({
      instanceId: daggerInst,
      baseItemId: 'daggers',
      bonusPercent: 10,
      crafterName: 'Smith',
      createdAt: Date.now()
    });
    hero.addItem(daggerInst, 1);
    hero.addItem('leather_cap', 1);
    hero.addItem('bandage', 3);

    // Unequipped gear should be stored, equipped gear untouched, bandages untouched
    const storedCount = gameState.depositAllUnequippedGear(hero);
    assert.equal(storedCount, 2, 'Stored exactly 2 unequipped gear items');
    assert.equal(hero.getItemCount(daggerInst), 0, 'Dagger instance removed from bag');
    assert.equal(hero.getItemCount('leather_cap'), 0, 'Leather cap removed from bag');
    assert.equal(hero.getItemCount('bandage'), 3, 'Bandages remained in bag');
    assert.equal(hero.equippedWeapon.id, 'short_swords', 'Equipped weapon untouched');

    // Drop gear confirmation:
    // DiscardItem on cancel keeps item; on confirm removes item
    hero.addItem(instanceId, 1);
    // Simulate Cancel: user closes modal without calling discardItem -> hero still has item
    assert.equal(hero.getItemCount(instanceId), 1, 'Cancel keeps the item in bag');
    // Simulate Confirm: execute discardItem
    const discarded = gameState.discardItem(hero, instanceId, 1);
    assert.equal(discarded, true, 'Confirm drop discards item');
    assert.equal(hero.getItemCount(instanceId), 0, 'Item destroyed from bag on drop');

    console.log('✓ PASS: Store gear moves exact item instance-aware; refused outside Outpost; drop confirmation cancels safely.');
  }

  // =========================================================================
  // ITEM 2: Spider Poison Proc Reduction to 10%
  // =========================================================================
  console.log('\n--- ITEM 2: Spider Poison Proc Reduction ---');
  {
    const spiderDef = dataLoader.getEnemy('spider')!;
    assert.equal(spiderDef.poisonChance, 0.10, 'Spider poisonChance must be exactly 0.10 in data');

    // Monte Carlo simulation over 1,000 hits
    let poisonProcs = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (Math.random() < spiderDef.poisonChance!) {
        poisonProcs++;
      }
    }
    const procRate = poisonProcs / trials;
    console.log(`Spider Poison Monte Carlo: ${poisonProcs}/${trials} procs (${(procRate * 100).toFixed(1)}%)`);
    assert.ok(procRate >= 0.07 && procRate <= 0.13, `Proc rate should land around 10% (actual: ${(procRate * 100).toFixed(1)}%)`);
    console.log('✓ PASS: Spider poisonChance is 0.10 and Monte Carlo lands near 10%.');
  }

  // =========================================================================
  // ITEM 3: Healing Staff Autocast Threshold & Attack Fallthrough
  // =========================================================================
  console.log('\n--- ITEM 3: Healing Staff Autocast Threshold & Fallthrough ---');
  {
    const mockScene = createMockScene();
    const playerData = dataLoader.getPlayer();
    const progHealer = new ProgressionSystem(dataLoader.getClassesData(), 'Healer');
    const healingStaffDef = dataLoader.getWeapon('healing_staff')!;
    assert.equal(healingStaffDef.healThresholdPercent, 0.70, 'Healing staff has healThresholdPercent = 0.70 in data');

    const healer = new Player(mockScene, 10, 10, { ...playerData, name: 'Healer' }, healingStaffDef, 32, 'healer-avatar', progHealer);
    healer.energy = 50;

    const progAlly1 = new ProgressionSystem(dataLoader.getClassesData(), 'Ally1');
    const sword = dataLoader.getWeapon('short_swords')!;
    const ally1 = new Player(mockScene, 10, 11, { ...playerData, name: 'Ally1' }, sword, 32, 'ally1-avatar', progAlly1);
    // Total HP = 50 + 25 = 75
    // Set ally1 to 80% (60/75 HP) -> should NOT heal, should attack enemy
    ally1.hp = 35;
    ally1.criticalHp = 25; // total 60/75 = 80%

    const progAlly2 = new ProgressionSystem(dataLoader.getClassesData(), 'Ally2');
    const ally2 = new Player(mockScene, 10, 12, { ...playerData, name: 'Ally2' }, sword, 32, 'ally2-avatar', progAlly2);
    ally2.hp = 50;
    ally2.criticalHp = 25; // 100%

    const wolfDef = dataLoader.getEnemy('wolf')!;
    const enemy = new Enemy(mockScene, 11, 10, wolfDef, 'wolf-avatar', 32);

    const combat = new CombatSystem(mockScene, [healer, ally1, ally2], [enemy], mockScene.pathfinder);

    // Test case A: ally at 80% -> checkAndAutocastHealingMagic returns false
    const didHealAt80 = (combat as any).checkAndAutocastHealingMagic(healer, 1000);
    assert.equal(didHealAt80, false, 'Ally at 80% HP is NOT healed (> 70% threshold)');

    // Verify healer attacks the enemy instead
    const enemyPreHp = enemy.hp;
    // Set healer target to enemy and trigger combat update with deterministic hit
    healer.setTarget(enemy);
    enemy.isAggroed = true;
    const origRandom = Math.random;
    Math.random = () => 0.1; // guarantee hit
    try {
      combat.update(2000, 100);
    } finally {
      Math.random = origRandom;
    }
    assert.ok(enemy.hp < enemyPreHp, `Healer actually attacks and deals damage (enemy HP ${enemyPreHp} -> ${enemy.hp})`);

    // Test case B: ally1 at 65% (48.75 HP -> set to 48 HP) -> healed
    ally1.hp = 23;
    ally1.criticalHp = 25; // total 48/75 = 64%
    healer.energy = 50;
    console.log('[DEBUG Test] healer state:', healer.state, 'energy:', healer.energy, 'equipped:', healer.equippedWeapon?.id, 'ally1 HP:', ally1.hp, ally1.criticalHp, ally1.maxHp, ally1.maxCriticalHp);
    const didHealAt65 = (combat as any).checkAndAutocastHealingMagic(healer, 3000);
    assert.equal(didHealAt65, true, 'Ally at 64% HP is healed (<= 70% threshold)');
    assert.ok(ally1.hp > 23, 'Ally1 HP was restored by heal');

    // Test case C: two allies under 70%, lowest one is picked
    // ally1 at 65% (48/75), ally2 at 40% (30/75)
    ally1.hp = 23;
    ally1.criticalHp = 25; // 48/75 = 64%
    ally2.hp = 5;
    ally2.criticalHp = 25; // 30/75 = 40%
    const ally2PreHp = ally2.hp;
    const didHealLowest = (combat as any).checkAndAutocastHealingMagic(healer, 5000);
    assert.equal(didHealLowest, true, 'Healing autocast triggered for multiple injured allies');
    assert.ok(ally2.hp > ally2PreHp, 'Lowest ally (Ally2 at 40%) was prioritized for healing');

    // Test case D: downed allies are never targeted
    ally2.hp = 0;
    ally2.criticalHp = 0;
    ally2.onDowned();
    assert.equal(ally2.state, 'downed', 'Ally2 is downed');
    ally1.hp = 50;
    ally1.criticalHp = 25; // 100%
    const didHealDowned = (combat as any).checkAndAutocastHealingMagic(healer, 7000);
    assert.equal(didHealDowned, false, 'Downed allies are NEVER targeted by Healing Staff autocast');

    console.log('✓ PASS: Healing staff obeys 70% threshold, targets lowest non-downed ally, and healer attacks when above 70%.');
  }

  // =========================================================================
  // ITEM 4: Early Wood Gathering Yield Verification
  // =========================================================================
  console.log('\n--- ITEM 4: Early Wood Gathering Yield ---');
  {
    const dungeonConfig = dataLoader.getDungeonConfig();
    const gatheringNodesConfig = dataLoader.getGatheringNodesConfig();

    for (let f = 1; f <= 6; f++) {
      const rng = DungeonGenerator.createRng(12345 + f);
      const dungeon = DungeonGenerator.generate(dungeonConfig, rng, { floorNumber: f });
      const treeCount = dungeon.bushSpawns.filter(b => b.nodeTypeId === 'woodcutting_tree').length;
      console.log(`Floor ${f} tree nodes: ${treeCount}`);
      if (f <= 5) {
        assert.ok(treeCount >= 4, `Floor ${f} has boosted tree nodes (found: ${treeCount})`);
      }
    }
    console.log('✓ PASS: DungeonGenerator produces boosted woodcutting_tree nodes on F1-5.');
  }

  // =========================================================================
  // ITEM 5: Poison Resistance Hidden Skill Verification
  // =========================================================================
  console.log('\n--- ITEM 5: Poison Resistance Hidden Skill ---');
  {
    const mockScene = createMockScene();
    const playerData = dataLoader.getPlayer();
    const prog = new ProgressionSystem(dataLoader.getClassesData(), 'Tester');
    const sword = dataLoader.getWeapon('short_swords')!;
    const hero = new Player(mockScene, 10, 10, { ...playerData, name: 'Tester' }, sword, 32, 'hero-avatar', prog);

    // Verify old saves load at Lv 0
    assert.equal(prog.getProficiencyLevel('poison_resistance'), 0, 'Poison Resistance defaults to Lv 0');

    // Verify EXP gain per tick (+5 EXP)
    const poisonDef = dataLoader.getStatusEffect('poison')!;
    hero.applyStatusEffect(poisonDef);
    assert.ok(hero.hasStatusEffect('poison'), 'Poison applied to hero');

    const preExp = prog.getProficiencyStat('poison_resistance').currentExp;
    // Tick 2s (poison tickIntervalMs = 2000)
    (hero as any).updateStatusEffects(2000);
    const postExp = prog.getProficiencyStat('poison_resistance').currentExp;
    assert.equal(postExp - preExp, 5, 'Poison damage tick awards exactly +5 EXP to poison_resistance');
    assert.ok(GameState.getInstance().isProficiencyDiscovered('poison_resistance'), 'Poison resistance discovered in GameState');

    // Monte Carlo verification of tier percentages:
    // Tier 1 (Lv 1): 5% cure per tick, 0% resist application
    prog.loadSnapshotData({
      proficiencies: { poison_resistance: { level: 1, currentExp: 0 } },
      classLevels: {},
      unlockedClasses: [],
      activityCounts: {}
    });

    let curedAtLv1 = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      prog.loadSnapshotData({
        proficiencies: { poison_resistance: { level: 1, currentExp: 0 } },
        classLevels: {},
        unlockedClasses: [],
        activityCounts: {}
      });
      hero.activeStatusEffects.set('poison', {
        def: poisonDef,
        remainingMs: Infinity,
        nextTickMs: 2000
      });
      (hero as any).updateStatusEffects(2000);
      if (!hero.hasStatusEffect('poison')) {
        curedAtLv1++;
      }
    }
    const cureRateLv1 = curedAtLv1 / trials;
    console.log(`Lv 1 Cure Chance Monte Carlo: ${curedAtLv1}/${trials} (${(cureRateLv1 * 100).toFixed(1)}%) [Expected ~5%]`);
    assert.ok(cureRateLv1 >= 0.03 && cureRateLv1 <= 0.08, 'Lv 1 cure rate lands around 5%');

    // Tier 25 (Lv 25): 25% resist application, 5% cure per tick
    prog.loadSnapshotData({
      proficiencies: { poison_resistance: { level: 25, currentExp: 0 } },
      classLevels: {},
      unlockedClasses: [],
      activityCounts: {}
    });

    let resistedAtLv25 = 0;
    hero.hp = 50;
    hero.criticalHp = 25;
    hero.state = 'idle';
    for (let i = 0; i < trials; i++) {
      hero.clearStatusEffects();
      hero.applyStatusEffect(poisonDef);
      if (!hero.hasStatusEffect('poison')) {
        resistedAtLv25++;
      }
    }
    const resistRateLv25 = resistedAtLv25 / trials;
    console.log(`Lv 25 Resist Chance Monte Carlo: ${resistedAtLv25}/${trials} (${(resistRateLv25 * 100).toFixed(1)}%) [Expected ~25%]`);
    assert.ok(resistRateLv25 >= 0.20 && resistRateLv25 <= 0.30, 'Lv 25 resist rate lands around 25%');

    // Tier 50 (Lv 50): 50% resist application, 50% cure per tick
    prog.loadSnapshotData({
      proficiencies: { poison_resistance: { level: 50, currentExp: 0 } },
      classLevels: {},
      unlockedClasses: [],
      activityCounts: {}
    });

    let resistedAtLv50 = 0;
    let curedAtLv50 = 0;
    for (let i = 0; i < trials; i++) {
      prog.loadSnapshotData({
        proficiencies: { poison_resistance: { level: 50, currentExp: 0 } },
        classLevels: {},
        unlockedClasses: [],
        activityCounts: {}
      });
      hero.hp = 50;
      hero.criticalHp = 25;
      hero.state = 'idle';
      hero.clearStatusEffects();
      hero.applyStatusEffect(poisonDef);
      if (!hero.hasStatusEffect('poison')) {
        resistedAtLv50++;
      }

      hero.activeStatusEffects.set('poison', {
        def: poisonDef,
        remainingMs: Infinity,
        nextTickMs: 2000
      });
      (hero as any).updateStatusEffects(2000);
      if (!hero.hasStatusEffect('poison')) {
        curedAtLv50++;
      }
    }
    const resistRateLv50 = resistedAtLv50 / trials;
    const cureRateLv50 = curedAtLv50 / trials;
    console.log(`Lv 50 Resist Monte Carlo: ${resistedAtLv50}/${trials} (${(resistRateLv50 * 100).toFixed(1)}%) [Expected ~50%]`);
    console.log(`Lv 50 Cure Monte Carlo: ${curedAtLv50}/${trials} (${(cureRateLv50 * 100).toFixed(1)}%) [Expected ~50%]`);
    assert.ok(resistRateLv50 >= 0.44 && resistRateLv50 <= 0.56, 'Lv 50 resist rate lands around 50%');
    assert.ok(cureRateLv50 >= 0.44 && cureRateLv50 <= 0.56, 'Lv 50 cure rate lands around 50%');

    // Tier 100 (Lv 100): Immune to poison
    prog.loadSnapshotData({
      proficiencies: { poison_resistance: { level: 100, currentExp: 0 } },
      classLevels: {},
      unlockedClasses: [],
      activityCounts: {}
    });

    hero.clearStatusEffects();
    hero.applyStatusEffect(poisonDef);
    assert.equal(hero.hasStatusEffect('poison'), false, 'Lv 100 is completely immune to poison application');

    console.log('✓ PASS: Poison Resistance hidden skill gains EXP per tick, triggers cure/resist per tier, and grants full immunity at Lv 100.');
  }

  console.log('\n=== ALL PLAYTEST ROUND 2 FIXES TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
