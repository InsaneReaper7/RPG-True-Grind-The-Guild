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

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { StatusEffectDef, WeaponDef, EnemyDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 30, gridHeight: number = 30, initialTime = 1000): any {
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
      lineStyle: () => obj,
      strokeCircle: () => obj,
      fillStyle: () => obj,
      fillCircle: () => obj,
      fillRect: () => obj,
      strokeRect: () => obj,
      lineBetween: () => obj,
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
      line: () => createMockObj(),
      text: (_x: number, _y: number, text: string, style: any) => {
        const t = createMockObj();
        t.text = text;
        t.style = style;
        return t;
      }
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    },
    textures: {
      exists: () => true
    }
  };
}

async function runMilestone42Tests() {
  console.log('================================================================');
  console.log('🧪 RUNNING MILESTONE 42: PERSISTENT POISON & ANTIDOTE TEST SUITE');
  console.log('================================================================\n');

  const { Entity } = await import('../src/entities/Entity.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  class ConcreteTestEntity extends Entity {
    constructor(scene: any, name: string, hp: number = 100, critMax: number = 25) {
      super(scene, 100, 100, 'test-avatar', name, hp, critMax, 32);
    }

    // Expose protected updateStatusEffects for deterministic simulation
    public testUpdateStatusEffects(deltaMs: number): void {
      this.updateStatusEffects(deltaMs);
    }
  }

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const scene = createMockScene();

  // ---------------------------------------------------------------------------
  // TEST 1: Schema Validation & Property Verification
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Schema Validation & Property Verification ---');
  {
    const poisonDef = dataLoader.getStatusEffect('poison');
    assert.ok(poisonDef, 'Poison must be registered in data/statusEffects.json');
    assert.equal(poisonDef.id, 'poison');
    assert.equal(poisonDef.name, 'Poison');
    assert.equal(poisonDef.persistent, true, 'Poison must have persistent: true');
    assert.equal(poisonDef.isHarmful, true, 'Poison must have isHarmful: true');
    assert.equal(poisonDef.damagePerTick, 2, 'Poison damagePerTick must be 2');
    assert.equal(poisonDef.tickIntervalMs, 2000, 'Poison tickIntervalMs must be 2000 (distinct from Burn 1000ms)');
    assert.equal(poisonDef.color, '#16a34a');

    const spiderDef = dataLoader.getEnemy('spider');
    assert.ok(spiderDef, 'Giant Spider must be registered in data/enemies.json');
    assert.equal(spiderDef.poisonChance, 0.35, 'Giant Spider must have poisonChance: 0.35');

    const antidoteRecipe = dataLoader.getAlchemyRecipe('antidote');
    assert.ok(antidoteRecipe, 'Antidote recipe must be registered in data/alchemyRecipes.json');
    assert.deepEqual(antidoteRecipe.cures, ['poison'], 'Antidote must specifically cure ["poison"]');
    assert.equal(antidoteRecipe.ingredients?.wild_herbs, 1, 'Antidote must cost 1 wild_herbs (cheap/accessible)');
    assert.equal(antidoteRecipe.expGranted, 25, 'Antidote grants 25 Alchemy EXP');

    assert.ok(
      gameState.isAlchemyRecipeDiscovered('antidote'),
      'Antidote must be in default discoveredAlchemyRecipes in GameState'
    );

    console.log('✔ Test 1 passed: Schema, persistent flag, Spider poisonChance, and Antidote recipe verified.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Indefinite Persistence (No Auto-Expiry After 30,000ms+)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Indefinite Persistence (No Auto-Expiry After 30,000ms+) ---');
  {
    const entity = new ConcreteTestEntity(scene, 'PoisonVictim', 200, 50);
    const poisonDef = dataLoader.getStatusEffect('poison')!;

    entity.applyStatusEffect(poisonDef);
    assert.equal(entity.hasStatusEffect('poison'), true, 'Poison initially applied');

    const activePoison = entity.getStatusEffect('poison')!;
    assert.equal(activePoison.remainingMs, Infinity, 'Persistent effect remainingMs must be Infinity');

    // Simulate 30,000ms in 1000ms steps (far exceeding old 4000ms / 8000ms windows)
    const initialHp = entity.hp; // 200
    for (let step = 0; step < 30; step++) {
      entity.testUpdateStatusEffects(1000);
    }

    assert.equal(
      entity.hasStatusEffect('poison'),
      true,
      'CRITICAL: Poison must NOT auto-expire after 30,000ms (persists indefinitely)!'
    );

    // 30,000ms with tickInterval 2000ms -> 15 ticks * 2 dmg = 30 damage taken
    const expectedHp = initialHp - (15 * 2);
    assert.equal(entity.hp, expectedHp, `HP should have dropped by exactly 30 (got ${entity.hp}, expected ${expectedHp})`);

    console.log('✔ Test 2 passed: Poison persists past 30,000ms and continually ticks damage indefinitely.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Downed Transition Automatically Clears Persistent Status Effects
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Downed Transition Automatically Clears Persistent Status Effects ---');
  {
    const entity = new ConcreteTestEntity(scene, 'DoomedFighter', 10, 5);
    const poisonDef = dataLoader.getStatusEffect('poison')!;
    entity.applyStatusEffect(poisonDef);

    assert.equal(entity.hasStatusEffect('poison'), true);
    assert.equal(entity.state, 'idle');

    // Inflict lethal damage to trigger onDowned()
    const enteredDowned = entity.takeDamage(20);
    assert.equal(enteredDowned, true, 'Entity should enter Downed state');
    assert.equal(entity.state, 'downed');

    // Poison must be completely cleared automatically upon Downed transition!
    assert.equal(
      entity.hasStatusEffect('poison'),
      false,
      'CRITICAL: Persistent Poison must be cleared automatically the moment entity enters Downed!'
    );

    // Further status effect updates should do 0 damage while downed
    const hpAtDowned = entity.hp;
    const critAtDowned = entity.criticalHp;
    entity.testUpdateStatusEffects(5000);
    assert.equal(entity.hp, hpAtDowned, 'HP must not change while downed');
    assert.equal(entity.criticalHp, critAtDowned, 'Critical HP must not change while downed');

    console.log('✔ Test 3 passed: Downed transition immediately and safely purges persistent effects.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Generic Engine Support Proof (Synthetic Dummy Effect with persistent: true)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Generic Engine Support Proof (Synthetic Dummy Effect) ---');
  {
    const syntheticCurse: StatusEffectDef = {
      id: 'synthetic_curse_of_entropy_99',
      name: 'Curse of Entropy',
      tickIntervalMs: 1500,
      damagePerTick: 4,
      persistent: true,
      isHarmful: true,
      color: '#c084fc'
    };

    const dummyEntity = new ConcreteTestEntity(scene, 'CurseTester', 150, 30);
    dummyEntity.applyStatusEffect(syntheticCurse);

    assert.equal(dummyEntity.hasStatusEffect('synthetic_curse_of_entropy_99'), true);
    assert.equal(dummyEntity.getStatusEffect('synthetic_curse_of_entropy_99')?.remainingMs, Infinity);

    // Simulate 20,000ms
    for (let t = 0; t < 20; t++) {
      dummyEntity.testUpdateStatusEffects(1000);
    }

    assert.equal(
      dummyEntity.hasStatusEffect('synthetic_curse_of_entropy_99'),
      true,
      'Generic check: Synthetic non-poison effect with persistent: true must never auto-expire!'
    );

    // Verify clearPersistentStatusEffects() removes it generically
    const cleared = dummyEntity.clearPersistentStatusEffects();
    assert.deepEqual(cleared, ['synthetic_curse_of_entropy_99']);
    assert.equal(dummyEntity.hasStatusEffect('synthetic_curse_of_entropy_99'), false);

    console.log('✔ Test 4 passed: Proven engine genericism — synthetic dummy effect with persistent: true behaves identically.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Antidote Specificity Scope Test (Poison + Bleed + Burn + Slow)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Antidote Specificity Scope Test (4 Simultaneous Debuffs) ---');
  {
    const playerData = dataLoader.getPlayer();
    const weapon = dataLoader.getWeapon('short_swords')!;
    const prog = new ProgressionSystem(undefined, 'AfflictedHero');
    const hero = new Player(scene, 100, 100, playerData, weapon, 32, 'player-avatar', prog);

    const poisonDef = dataLoader.getStatusEffect('poison')!;
    const bleedDef = dataLoader.getStatusEffect('bleed')!;
    const burnDef = dataLoader.getStatusEffect('burn')!;
    const slowDef = dataLoader.getStatusEffect('slow')!;

    // Afflict with all 4 status effects at once
    hero.applyStatusEffect(poisonDef);
    hero.applyStatusEffect(bleedDef);
    hero.applyStatusEffect(burnDef);
    hero.applyStatusEffect(slowDef);

    assert.equal(hero.hasStatusEffect('poison'), true);
    assert.equal(hero.hasStatusEffect('bleed'), true);
    assert.equal(hero.hasStatusEffect('burn'), true);
    assert.equal(hero.hasStatusEffect('slow'), true);

    // Without antidote in stockpile, applying fails
    gameState.consumeItem('antidote', gameState.getItemCount('antidote')); // clear inventory
    assert.equal(hero.applyAntidote(), false, 'applyAntidote fails with 0 stockpile');

    // Add 1 Antidote to stockpile
    gameState.addItem('antidote', 1);
    assert.equal(gameState.getItemCount('antidote'), 1);

    // Apply Antidote
    const cured = hero.applyAntidote();
    assert.equal(cured, true, 'applyAntidote succeeds with antidote in stockpile');
    assert.equal(gameState.getItemCount('antidote'), 0, '1 Antidote consumed');

    // CRITICAL: Poison must be cured, BUT Bleed, Burn, and Slow must remain intact!
    assert.equal(hero.hasStatusEffect('poison'), false, 'Poison MUST be removed by Antidote');
    assert.equal(hero.hasStatusEffect('bleed'), true, 'Bleed MUST remain untouched by Antidote');
    assert.equal(hero.hasStatusEffect('burn'), true, 'Burn MUST remain untouched by Antidote');
    assert.equal(hero.hasStatusEffect('slow'), true, 'Slow MUST remain untouched by Antidote');

    console.log('✔ Test 5 passed: Antidote specifically purges Poison and leaves Bleed, Burn, and Slow active.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Generic Cleanse Verification (Purges Poison with Zero Cleanse Code Changes)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Generic Cleanse Verification (Cleanse Purges Poison) ---');
  {
    const playerData = dataLoader.getPlayer();
    const weapon = dataLoader.getWeapon('short_swords')!;
    const prog = new ProgressionSystem(undefined, 'CleansePatient');
    const patient = new Player(scene, 100, 100, playerData, weapon, 32, 'player-avatar', prog);

    const poisonDef = dataLoader.getStatusEffect('poison')!;
    const bleedDef = dataLoader.getStatusEffect('bleed')!;
    const stunDef = dataLoader.getStatusEffect('stun')!;
    const guardUpDef = dataLoader.getStatusEffect('guard_up')!; // Beneficial buff (isHarmful !== true)

    patient.applyStatusEffect(poisonDef);
    patient.applyStatusEffect(bleedDef);
    patient.applyStatusEffect(stunDef);
    patient.applyStatusEffect(guardUpDef);

    assert.equal(patient.hasStatusEffect('poison'), true);
    assert.equal(patient.hasStatusEffect('bleed'), true);
    assert.equal(patient.hasStatusEffect('stun'), true);
    assert.equal(patient.hasStatusEffect('guard_up'), true);

    // Call generic removeHarmfulStatusEffects() which Combat Medic's Cleanse executes
    const removed = patient.removeHarmfulStatusEffects();

    assert.ok(removed.includes('poison'), 'Cleanse must purge Poison');
    assert.ok(removed.includes('bleed'), 'Cleanse must purge Bleed');
    assert.ok(removed.includes('stun'), 'Cleanse must purge Stun');
    assert.equal(patient.hasStatusEffect('poison'), false);
    assert.equal(patient.hasStatusEffect('bleed'), false);
    assert.equal(patient.hasStatusEffect('stun'), false);

    // Beneficial buffs must NOT be cleansed
    assert.equal(patient.hasStatusEffect('guard_up'), true, 'Beneficial buffs must not be purged by Cleanse');

    console.log('✔ Test 6 passed: Cleanse purges Poison via generic isHarmful without Cleanse modification.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Spider Poison Proc On Attack in CombatSystem
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Spider Poison Proc On Attack in CombatSystem ---');
  {
    const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
    const spiderDef = dataLoader.getEnemy('spider')!;
    const spider = new Enemy(scene, 1, 1, spiderDef, 'spider-avatar', 32);

    const playerData = dataLoader.getPlayer();
    const weapon = dataLoader.getWeapon('short_swords')!;
    const prog = new ProgressionSystem(undefined, 'TargetHero');
    const targetHero = new Player(scene, 2, 1, playerData, weapon, 32, 'player-avatar', prog);

    const bigGrid: number[][] = [];
    for (let r = 0; r < 10; r++) bigGrid.push(new Array(10).fill(0));
    const pathfinder = new Pathfinder(bigGrid);

    const combat = new CombatSystem(scene, [targetHero], [spider], pathfinder);

    const { HiddenSkillSystem } = await import('../src/systems/HiddenSkillSystem.ts');
    const origResolve = HiddenSkillSystem.getInstance().resolveIncomingAttack;
    HiddenSkillSystem.getInstance().resolveIncomingAttack = () => ({ type: 'connected' });

    // Force random to 0.1: attack connects and poison proc (chance 0.35) succeeds
    const originalRandom = Math.random;
    Math.random = () => 0.1;

    try {
      assert.equal(targetHero.hasStatusEffect('poison'), false, 'Target starts unpoisoned');

      // Update combat with enough elapsed time for spider attack
      spider.lastAttackTime = 0;
      combat.update(1500);

      assert.equal(
        targetHero.hasStatusEffect('poison'),
        true,
        'Spider attack with poisonChance must inflict persistent Poison on player!'
      );
      assert.equal(
        targetHero.getStatusEffect('poison')?.def.persistent,
        true,
        'Inflicted Poison must be persistent'
      );
    } finally {
      Math.random = originalRandom;
      HiddenSkillSystem.getInstance().resolveIncomingAttack = origResolve;
    }

    console.log('✔ Test 7 passed: Giant Spider successfully procs persistent Poison on attack in CombatSystem.\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Timed Effects Retain Existing Expiry Behavior (No Regressions)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Timed Effects Retain Existing Expiry Behavior ---');
  {
    const entity = new ConcreteTestEntity(scene, 'TimedVictim', 200, 50);
    const burnDef = dataLoader.getStatusEffect('burn')!;   // 4000ms duration
    const bleedDef = dataLoader.getStatusEffect('bleed')!; // 6000ms duration
    const poisonDef = dataLoader.getStatusEffect('poison')!; // persistent

    entity.applyStatusEffect(burnDef);
    entity.applyStatusEffect(bleedDef);
    entity.applyStatusEffect(poisonDef);

    assert.equal(entity.hasStatusEffect('burn'), true);
    assert.equal(entity.hasStatusEffect('bleed'), true);
    assert.equal(entity.hasStatusEffect('poison'), true);

    // Advance 4500ms: Burn (4000ms) should expire; Bleed and Poison remain
    entity.testUpdateStatusEffects(4500);
    assert.equal(entity.hasStatusEffect('burn'), false, 'Burn must expire after its 4000ms duration');
    assert.equal(entity.hasStatusEffect('bleed'), true, 'Bleed must still be active at 4500ms (duration 6000ms)');
    assert.equal(entity.hasStatusEffect('poison'), true, 'Poison must remain active');

    // Advance another 2000ms (total 6500ms): Bleed (6000ms) should expire; Poison remains
    entity.testUpdateStatusEffects(2000);
    assert.equal(entity.hasStatusEffect('bleed'), false, 'Bleed must expire after its 6000ms duration');
    assert.equal(entity.hasStatusEffect('poison'), true, 'Poison must STILL remain active indefinitely');

    console.log('✔ Test 8 passed: Existing timed DoTs (Burn, Bleed) expire on schedule without regression.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 42 TESTS PASSED CLEANLY & SUCCESSFULLY!');
  console.log('================================================================\n');
}

runMilestone42Tests().catch((err) => {
  console.error('Milestone 42 Test Failure:', err);
  process.exit(1);
});
