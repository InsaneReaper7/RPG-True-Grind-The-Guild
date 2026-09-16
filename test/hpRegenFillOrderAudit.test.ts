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
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef, PlayerData } from '../src/types/game.ts';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING HP REGEN FILL-ORDER AUDIT: CRITICAL HP BEFORE MAIN HP');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { Entity } = await import('../src/entities/Entity.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

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
      sound: { play: () => {} },
      time: {
        now: 1000,
        addEvent: () => ({ remove: () => {} })
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

  const basePlayerData: PlayerData = {
    ...dataLoader.getPlayer(),
    hpMax: 50,
    criticalHpMax: 25
  };
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
  // TEST 1: Single Shared heal() Method - Critical-First & Overflow Logic
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Single Shared heal() Core Fill-Order Logic ---');
  {
    const player = createTestPlayer(mockScene, 'Test Hero', 0, 0, 50, 25);
    // Artificially place character at 0 Main HP and 15 Critical HP (10 missing Critical HP)
    player.hp = 0;
    player.criticalHp = 15;

    // Small heal: 6 HP -> should only fill Critical HP (15 -> 21), Main HP stays 0
    const restoredSmall = player.heal(6);
    assert.equal(restoredSmall, 6, 'Should report 6 HP restored');
    assert.equal(player.criticalHp, 21, 'Critical HP should increase to 21');
    assert.equal(player.hp, 0, 'Main HP should remain 0 when Critical HP is not yet full');

    // Boundary-crossing heal: 10 HP -> 4 to fill Critical HP (21 -> 25), 6 overflows into Main HP (0 -> 6)
    const restoredBoundary = player.heal(10);
    assert.equal(restoredBoundary, 10, 'Should report 10 HP restored');
    assert.equal(player.criticalHp, 25, 'Critical HP should be completely full at 25');
    assert.equal(player.hp, 6, 'Remaining 6 HP should have overflowed into Main HP');

    // Straight to Main HP when Critical is already full: 20 HP -> 6 + 20 = 26 Main HP
    const restoredMain = player.heal(20);
    assert.equal(restoredMain, 20, 'Should report 20 HP restored');
    assert.equal(player.criticalHp, 25, 'Critical HP should remain at 25');
    assert.equal(player.hp, 26, 'Main HP should increase to 26');

    // Overflow beyond max Main HP: 40 HP -> only 24 needed to reach 50 max Main HP
    const restoredCap = player.heal(40);
    assert.equal(restoredCap, 24, 'Should cap at max Main HP (24 restored)');
    assert.equal(player.hp, 50, 'Main HP should be at max 50');
    assert.equal(player.criticalHp, 25, 'Critical HP should remain at 25');

    // Healing when already full: 10 HP -> 0 restored
    const restoredFull = player.heal(10);
    assert.equal(restoredFull, 0, 'Healing when full should restore 0');

    // Downed state: healing should return 0
    player.hp = 0;
    player.criticalHp = 0;
    player.state = 'downed';
    const restoredDowned = player.heal(20);
    assert.equal(restoredDowned, 0, 'Downed entity cannot be healed via heal()');
    assert.equal(player.hp, 0, 'HP must remain 0');
    assert.equal(player.criticalHp, 0, 'Critical HP must remain 0');

    // Dead state: healing should return 0
    player.state = 'dead';
    const restoredDead = player.heal(20);
    assert.equal(restoredDead, 0, 'Dead entity cannot be healed');

    // Negative / zero amount: returns 0
    player.state = 'idle';
    player.hp = 10;
    player.criticalHp = 10;
    assert.equal(player.heal(0), 0, '0 heal returns 0');
    assert.equal(player.heal(-5), 0, 'Negative heal returns 0');
  }
  console.log('✓ PASS: Core heal() correctly prioritizes Critical HP, overflows to Main HP, and handles boundaries/states.\n');

  // ----------------------------------------------------------------
  // TEST 2: Generic Entity Base Class Routing
  // ----------------------------------------------------------------
  console.log('--- TEST 2: Generic Entity Base Class Routing ---');
  {
    // Ensure base Entity also executes the exact same Critical-first fill logic
    const baseEntity = new Entity(mockScene, 0, 0, 'hero', 'Generic Entity', 40, 20, 32);
    baseEntity.hp = 0;
    baseEntity.criticalHp = 10; // 10 missing Critical HP

    const restored = baseEntity.heal(15);
    assert.equal(restored, 15, 'Base Entity heal should restore 15');
    assert.equal(baseEntity.criticalHp, 20, 'Critical HP should be full at 20');
    assert.equal(baseEntity.hp, 5, 'Remaining 5 should overflow into Main HP');
  }
  console.log('✓ PASS: Base Entity shares the exact same Critical-first fill order.\n');

  // ----------------------------------------------------------------
  // TEST 3: Bed Rest - Full Recovery Confirmation
  // ----------------------------------------------------------------
  console.log('--- TEST 3: Bed Rest Recovery Confirmation ---');
  {
    const player = createTestPlayer(mockScene, 'Bed Rest Hero', 0, 0, 60, 30);
    player.hp = 0;
    player.criticalHp = 12;
    player.energy = 10;

    const restResult = player.rest();
    assert.equal(restResult, true, 'rest() should return true when stats were restored');
    assert.equal(player.criticalHp, 30, 'Bed rest must fully restore Critical HP');
    assert.equal(player.hp, 60, 'Bed rest must fully restore Main HP');
    assert.equal(player.energy, player.maxEnergy, 'Bed rest must fully restore Energy');

    // Calling rest() when already full returns false
    const restAgain = player.rest();
    assert.equal(restAgain, false, 'rest() should return false when already fully rested');
  }
  console.log('✓ PASS: Bed rest confirms 100% full recovery of both Critical HP and Main HP.\n');

  // ----------------------------------------------------------------
  // TEST 4: Natural Passive Health Regen (Hidden Skill)
  // ----------------------------------------------------------------
  console.log('--- TEST 4: Natural Passive Health Regen ---');
  {
    const hero = createTestPlayer(mockScene, 'Regen Hero', 0, 0, 50, 25);
    hero.progression.addProficiencyExp('health_regen', 500); // Unlock Level 1+ health regen
    assert.ok(hero.progression.getProficiencyLevel('health_regen') >= 1);

    const combatSystem = new CombatSystem(mockScene, [hero], [], mockScene.pathfinder);
    hero.hp = 0;
    hero.criticalHp = 15; // 10 missing Critical HP

    // Simulate passive tick at 5000ms with deterministic proc (time >= 4000ms ensures out-of-combat)
    const originalRandom = Math.random;
    Math.random = () => 0; // Guarantee proc
    try {
      combatSystem.update(5000, 100);
    } finally {
      Math.random = originalRandom;
    }

    // Passive regen should have healed Critical HP, leaving Main HP at 0
    assert.ok(hero.criticalHp > 15, 'Critical HP should have increased from passive regen');
    assert.equal(hero.hp, 0, 'Main HP should remain at 0 while Critical HP is not full');
  }
  console.log('✓ PASS: Natural passive Health Regen fills Critical HP first.\n');

  // ----------------------------------------------------------------
  // TEST 5: First Aid (Combat Medic Starting Skill)
  // ----------------------------------------------------------------
  console.log('--- TEST 5: First Aid (Combat Medic) ---');
  {
    const medic = createTestPlayer(mockScene, 'Medic', 0, 0, 50, 25);
    const injuredAlly = createTestPlayer(mockScene, 'Injured Ally', 1, 0, 50, 25);
    medic.progression.setClassLevel('combat_medic', 5);
    medic.energy = 50;

    const combatSystem = new CombatSystem(mockScene, [medic, injuredAlly], [], mockScene.pathfinder);

    // Set injured ally to 0 Main HP and 15 Critical HP (missing 10 Crit)
    injuredAlly.hp = 0;
    injuredAlly.criticalHp = 15;

    // First Aid heals 20 HP
    const firstAidDef = dataLoader.getSkill('first_aid');
    assert.ok(firstAidDef, 'First Aid skill must exist');
    const success = combatSystem.castSkill(medic, 'first_aid', injuredAlly, 1000);
    assert.equal(success, true, 'First Aid cast must succeed');

    // 10 HP fills Critical HP (15 -> 25), 10 HP overflows into Main HP (0 -> 10)
    assert.equal(injuredAlly.criticalHp, 25, 'Critical HP must be topped off to 25');
    assert.equal(injuredAlly.hp, 10, 'Main HP must receive the 10 overflow HP');
  }
  console.log('✓ PASS: First Aid fills Critical HP first and overflows into Main HP.\n');

  // ----------------------------------------------------------------
  // TEST 6: Restoration Mage Heal & Regenerate (HoT)
  // ----------------------------------------------------------------
  console.log('--- TEST 6: Restoration Mage Heal & Regenerate ---');
  {
    const mage = createTestPlayer(mockScene, 'Resto Mage', 0, 0, 50, 25);
    const injuredAlly = createTestPlayer(mockScene, 'Injured Fighter', 1, 0, 60, 25);
    mage.progression.setClassLevel('restoration_mage', 10);
    mage.energy = 60;

    const combatSystem = new CombatSystem(mockScene, [mage, injuredAlly], [], mockScene.pathfinder);

    // 6A: Active Heal (35 HP)
    injuredAlly.hp = 0;
    injuredAlly.criticalHp = 10; // 15 missing Crit HP
    const healSuccess = combatSystem.castSkill(mage, 'heal', injuredAlly, 1000);
    assert.equal(healSuccess, true, 'Heal cast must succeed');
    // 15 to Critical HP (10 -> 25), 20 overflow to Main HP (0 -> 20)
    assert.equal(injuredAlly.criticalHp, 25, 'Critical HP must be topped off to 25');
    assert.equal(injuredAlly.hp, 20, 'Main HP must receive the 20 overflow HP');

    // 6B: Regenerate HoT (6 HP/tick)
    injuredAlly.hp = 0;
    injuredAlly.criticalHp = 15; // 10 missing Crit HP
    mage.energy = 60;
    const regenSuccess = combatSystem.castSkill(mage, 'regenerate', injuredAlly, 2000);
    assert.equal(regenSuccess, true, 'Regenerate cast must succeed');

    // Tick the status effect (1000ms interval)
    injuredAlly.update(3000, 1100);
    // Tick 1: 6 HP -> Critical HP goes 15 -> 21, Main HP stays 0
    assert.equal(injuredAlly.criticalHp, 21, 'Tick 1 must heal Critical HP to 21');
    assert.equal(injuredAlly.hp, 0, 'Tick 1 must leave Main HP at 0');

    // Tick 2: 6 HP -> Critical HP goes 21 -> 25 (4 HP), Main HP gets 2 HP overflow
    injuredAlly.update(4100, 1100);
    assert.equal(injuredAlly.criticalHp, 25, 'Tick 2 must top off Critical HP to 25');
    assert.equal(injuredAlly.hp, 2, 'Tick 2 must overflow 2 HP into Main HP');
  }
  console.log('✓ PASS: Restoration Mage Heal and Regenerate HoT ticks fill Critical HP first.\n');

  // ----------------------------------------------------------------
  // TEST 7: Combat Medic Holy Nova
  // ----------------------------------------------------------------
  console.log('--- TEST 7: Combat Medic Holy Nova ---');
  {
    const medic = createTestPlayer(mockScene, 'Holy Medic', 2, 2, 50, 25);
    const ally1 = createTestPlayer(mockScene, 'Crit Drained Ally', 2, 3, 50, 25);
    const ally2 = createTestPlayer(mockScene, 'Main Drained Ally', 3, 2, 50, 25);
    medic.progression.setClassLevel('combat_medic', 40);
    medic.energy = 50;

    const combatSystem = new CombatSystem(mockScene, [medic, ally1, ally2], [], mockScene.pathfinder);

    // ally1: 0 Main HP, 10 Critical HP (needs 15 Crit to fill)
    ally1.hp = 0;
    ally1.criticalHp = 10;

    // ally2: 20 Main HP, 25 Critical HP (Critical HP is already full)
    ally2.hp = 20;
    ally2.criticalHp = 25;

    // Holy Nova heals 30 HP to allies
    const novaSuccess = combatSystem.castSkill(medic, 'holy_nova', undefined, 1000);
    assert.equal(novaSuccess, true, 'Holy Nova cast must succeed');

    // ally1: 15 fills Critical HP to 25, remaining 15 spills into Main HP
    assert.equal(ally1.criticalHp, 25, 'ally1 Critical HP must be filled to 25');
    assert.equal(ally1.hp, 15, 'ally1 Main HP must receive 15 overflow HP');

    // ally2: Critical HP was already full, all 30 HP goes to Main HP (20 + 30 = 50 max)
    assert.equal(ally2.criticalHp, 25, 'ally2 Critical HP must remain full at 25');
    assert.equal(ally2.hp, 50, 'ally2 Main HP must receive full 30 HP without waste');
  }
  console.log('✓ PASS: Combat Medic Holy Nova correctly fills Critical HP first for all allies in blast.\n');

  // ----------------------------------------------------------------
  // TEST 8: Paladin Holy Radiance Pulse Heal
  // ----------------------------------------------------------------
  console.log('--- TEST 8: Paladin Holy Radiance Pulse Heal ---');
  {
    const paladin = createTestPlayer(mockScene, 'Paladin', 0, 0, 50, 25);
    const wounded = createTestPlayer(mockScene, 'Wounded Knight', 1, 0, 50, 25);
    const enemyDef = dataLoader.getEnemy('goblin') || dataLoader.getEnemiesData().enemies[0];
    const enemy = new Enemy(mockScene, 0, 1, enemyDef);

    const holyMagic = dataLoader.getWeapon('holy_magic')!;
    paladin.equippedWeapon = holyMagic;
    const combatSystem = new CombatSystem(mockScene, [paladin, wounded], [enemy], mockScene.pathfinder);

    wounded.hp = 0;
    wounded.criticalHp = 15; // 10 missing Crit HP

    // Trigger Holy Radiance on hit
    combatSystem.applyHolyRadiance(paladin, enemy, holyMagic, 2);

    // Radiance base heal (around 6 HP) fills Critical HP
    assert.ok(wounded.criticalHp > 15, 'Wounded knight Critical HP must increase from Radiance pulse');
    assert.equal(wounded.hp, 0, 'Main HP must remain 0 since Critical HP was not yet capped');
  }
  console.log('✓ PASS: Holy Radiance pulse prioritizes and heals Critical HP first.\n');

  // ----------------------------------------------------------------
  // TEST 9: Well Fed Food Buff
  // ----------------------------------------------------------------
  console.log('--- TEST 9: Well Fed Food Buff ---');
  {
    const player = createTestPlayer(mockScene, 'Foodie Hero', 0, 0, 50, 25);
    player.hp = 0;
    player.criticalHp = 20; // 5 missing Crit HP
    player.wellFedRemainingMs = 10000;
    player.wellFedHpPerSec = 4;

    // Simulate 1 second update
    player.update(1000, 1000);

    assert.equal(player.criticalHp, 24, 'Well Fed buff tick must heal Critical HP first');
    assert.equal(player.hp, 0, 'Main HP must remain 0 when Critical HP is not full');
  }
  console.log('✓ PASS: Well Fed food buff fills Critical HP first.\n');

  // ----------------------------------------------------------------
  // TEST 10: AI Healing Target Selection with Drained Critical HP
  // ----------------------------------------------------------------
  console.log('--- TEST 10: AI Healing Target Selection with Drained Critical HP ---');
  {
    const healer = createTestPlayer(mockScene, 'Healer', 0, 0, 50, 25);
    // Ally A has FULL Main HP (50/50), but drained Critical HP (5/25) -> severely endangered!
    const allyA = createTestPlayer(mockScene, 'Ally A (Crit Drained)', 1, 0, 50, 25);
    allyA.hp = 50;
    allyA.criticalHp = 5;

    // Ally B has partial Main HP (40/50) and full Critical HP (25/25)
    const allyB = createTestPlayer(mockScene, 'Ally B (Main Light Dmg)', 2, 0, 50, 25);
    allyB.hp = 40;
    allyB.criticalHp = 25;

    healer.equippedWeapon = dataLoader.getWeapon('healing_staff');
    healer.energy = 50;

    const combatSystem = new CombatSystem(mockScene, [healer, allyA, allyB], [], mockScene.pathfinder);

    // Autocast healing magic should detect Ally A as damaged and prioritize Ally A
    const castResult = combatSystem.checkAndAutocastHealingMagic(healer, 1000);
    assert.equal(castResult, true, 'Autocast healing magic must succeed');
    // Ally A had 5/25 Critical HP, so heal goes to Ally A's Critical HP
    assert.ok(allyA.criticalHp > 5, 'Ally A must be selected and healed on Critical HP');
  }
  console.log('✓ PASS: AI healer detects and prioritizes ally with drained Critical HP even with full Main HP.\n');

  console.log('================================================================');
  console.log('ALL HP REGEN FILL-ORDER AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
