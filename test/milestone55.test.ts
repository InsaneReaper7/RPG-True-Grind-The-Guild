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

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { HiddenSkillSystem } from '../src/systems/HiddenSkillSystem.ts';
import type { WeaponDef, EnemyDef, SkillDef, GridPos, CombatContext } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };
import weaponsData from '../data/weapons.json' with { type: 'json' };
import skillsData from '../data/skills.json' with { type: 'json' };
import statusEffectsData from '../data/statusEffects.json' with { type: 'json' };
import blacksmithRecipesData from '../data/blacksmithRecipes.json' with { type: 'json' };

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
      destroy: () => {}
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
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      text: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    }
  };
}

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem,
  activeClass: string = 'loader'
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const lastSkillUseTimes = new Map<string, number>();
  const autocastMap = new Map<string, boolean>();

  const player: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp: 150,
    maxHp: 150,
    criticalHp: 30,
    maxCriticalHp: 30,
    energy: 100,
    maxEnergy: 100,
    mood: 80,
    state: 'idle',
    activeClass,
    equippedWeapon: weapon,
    offhandWeapon: null as WeaponDef | null,
    targetEntity: null as any,
    lastAttackTime: 0,
    attackRangeTiles: weapon.attackRangeTiles ?? 4,
    progression,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    autocastMap,
    lastSkillUseTimes,
    activeStatusEffects: statusEffects,
    bookLearnedSkills: new Set<string>(),

    isDualWielding: () => player.offhandWeapon !== null && player.offhandWeapon.category !== 'offhand',
    hasShield: () => player.offhandWeapon !== null && (player.offhandWeapon.category === 'offhand' || player.offhandWeapon.id === 'shields'),
    isSkillLearnedFromBook: (skillId: string) => player.bookLearnedSkills.has(skillId),
    isAutocastEnabled: (skillId: string) => {
      if (!player.autocastMap.has(skillId)) return true;
      return player.autocastMap.get(skillId) === true;
    },
    hasStatusEffect: (effId: string) => player.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      player.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000,
        shieldHp: effDef.shieldAmount
      });
    },
    removeStatusEffect: (effId: string) => player.activeStatusEffects.delete(effId),
    setGridPosition: (gx: number, gy: number) => {
      player.gridPos = { x: gx, y: gy };
      player.x = gx * tileSize + tileSize / 2;
      player.y = gy * tileSize + tileSize / 2;
    },
    heal: (amt: number) => {
      const missing = player.maxHp - player.hp;
      const healed = Math.min(amt, missing);
      player.hp += healed;
      return healed;
    },
    clearTarget: () => {
      player.targetEntity = null;
    }
  };

  return player;
}

function createMockEnemy(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number = 1000
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const enemy: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 0,
    maxCriticalHp: 0,
    state: 'idle',
    activeStatusEffects: statusEffects,
    lastAttackTime: 0,

    hasStatusEffect: (effId: string) => enemy.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      enemy.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000
      });
    },
    removeStatusEffect: (effId: string) => enemy.activeStatusEffects.delete(effId),
    isStunned: () => enemy.activeStatusEffects.has('stun'),
    isMoving: () => false,
    stopMovement: () => {},
    followPath: () => {},
    setGridPosition: (gx: number, gy: number) => {
      enemy.gridPos = { x: gx, y: gy };
      enemy.x = gx * tileSize + tileSize / 2;
      enemy.y = gy * tileSize + tileSize / 2;
    },
    takeDamage: (amount: number) => {
      enemy.hp = Math.max(0, enemy.hp - amount);
      if (enemy.hp <= 0) {
        enemy.state = 'dead';
        return true;
      }
      return false;
    }
  };

  return enemy;
}

async function runMilestone55Tests() {
  console.log('================================================================');
  console.log('🏹 RUNNING MILESTONE 55: CROSSBOWS & LOADER (TIER 0) TESTS 🏹');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const dataLoader = DataLoader.getInstance();

  // ============================================================================
  // TEST 1: Direct Audit of Design Documentation & Class Lineage Framing
  // ============================================================================
  console.log('--- TEST 1: Direct Audit of Design Documentation & Class Lineage Framing ---');
  {
    const classSystemDoc = fs.readFileSync('docs/class_system (1).md', 'utf8');
    const deferredDoc = fs.readFileSync('docs/deferred_features.md', 'utf8');

    // Verify Loader is cited from class_system (1).md Line 86
    assert.ok(
      classSystemDoc.includes('| Loader | Crossbows 10 | Mechanically minded shooter |'),
      'class_system (1).md must contain Loader (Crossbows 10)'
    );

    // Verify Sharpshooter is cited from Line 125
    assert.ok(
      classSystemDoc.includes('| Sharpshooter | Crossbows 30 + Bows 10 | Precision trainee |'),
      'class_system (1).md must contain Sharpshooter (Crossbows 30 + Bows 10)'
    );

    // Verify Witch Hunter is cited from Line 152
    assert.ok(
      classSystemDoc.includes('| Witch Hunter | Crossbows 30 + Holy Magic 30 + Sharpshooter Lv 15 | Monster and magic hunter |'),
      'class_system (1).md must contain Witch Hunter'
    );

    // Verify Demon Hunter is cited from Line 180
    assert.ok(
      classSystemDoc.includes('| Demon Hunter | Short Swords 60 + Crossbows 60 + Holy Magic 30 + Witch Hunter Lv 20 | Specialist in hunting supernatural creatures |'),
      'class_system (1).md must contain Demon Hunter'
    );

    // Verify Bounty Hunter is cited from Line 328
    assert.ok(
      classSystemDoc.includes('| Bounty Hunter | Crossbows 30 + Perception 30 | Tracks marks others can\'t find |'),
      'class_system (1).md must contain Bounty Hunter'
    );

    // Verify deferred_features.md Section 7 explains Loader shipped and deeper tiers deferred
    assert.ok(
      deferredDoc.includes('## 7. Crossbow Class Lineage: Loader Implemented, Deeper Tiers Deferred (Milestone 55)'),
      'deferred_features.md must document Milestone 55 Crossbow class lineage'
    );
    assert.ok(
      deferredDoc.includes('Sharpshooter (Tier 1 Adept)'),
      'deferred_features.md must document Sharpshooter deferral'
    );
    assert.ok(
      deferredDoc.includes('Witch Hunter (Tier 2 Expert)'),
      'deferred_features.md must document Witch Hunter deferral'
    );
    assert.ok(
      deferredDoc.includes('Demon Hunter (Tier 3 Master / Exotic)'),
      'deferred_features.md must document Demon Hunter deferral'
    );
    assert.ok(
      deferredDoc.includes('Bounty Hunter (Hybrid / Utility)'),
      'deferred_features.md must document Bounty Hunter deferral'
    );

    console.log('✓ PASS: Direct documentation audit verified Loader citation and honest deferral rationale for deeper tiers.\n');
  }

  // ============================================================================
  // TEST 2: Crossbows Weapon Registry, Handedness & Stats Verification
  // ============================================================================
  console.log('--- TEST 2: Crossbows Weapon Registry, Handedness & Stats Verification ---');
  {
    const crossbow = dataLoader.getWeapon('crossbows');
    assert.ok(crossbow, 'Crossbow weapon definition must exist in weapons.json');
    assert.equal(crossbow.name, 'Crossbows');
    assert.equal(crossbow.category, 'ranged', 'Crossbows must be category ranged');
    assert.equal(crossbow.twoHanded, true, 'Crossbows must be two-handed (twoHanded: true)');
    assert.equal(crossbow.weight, 5.0, 'Crossbows weight must be 5.0');
    assert.equal(crossbow.attackIntervalMs, 1500, 'Crossbows attackIntervalMs must be 1500ms');
    assert.equal(crossbow.baseDamage, 9, 'Crossbows baseDamage must be 9');
    assert.equal(crossbow.baseAccuracy, 0.60, 'Crossbows baseAccuracy must be 0.60');
    assert.equal(crossbow.attackRangeTiles, 4, 'Crossbows attackRangeTiles must be 4');
    assert.ok(crossbow.levelBonus, 'Crossbows levelBonus must be defined');
    assert.equal(crossbow.levelBonus.accuracyPerLevel, 0.004, 'accuracyPerLevel must be 0.004');
    assert.equal(crossbow.levelBonus.damagePerLevel, 0.5, 'damagePerLevel must be 0.5');
    assert.equal(crossbow.levelBonus.attackSpeedPerLevel, 0.005, 'attackSpeedPerLevel must be 0.005');

    const prof = dataLoader.getTrainableStatDef('crossbows');
    assert.ok(prof, 'crossbows proficiency must exist');
    assert.equal(prof.name, 'Crossbows');
    assert.ok(prof.description.includes('crossbows') || prof.description.includes('arbalests'));

    console.log('✓ PASS: Crossbows weapon stats, two-handed handedness, and proficiency metadata verified.\n');
  }

  // ============================================================================
  // TEST 3: Blacksmithing Crafting Recipe Verification
  // ============================================================================
  console.log('--- TEST 3: Blacksmithing Crafting Recipe Verification ---');
  {
    const recipes = dataLoader.getBlacksmithRecipes();
    const recipe = recipes.find((r) => r.id === 'crossbow' || r.resultWeaponId === 'crossbows');
    assert.ok(recipe, 'Crossbow crafting recipe must exist in blacksmithRecipes.json');
    assert.equal(recipe.resultWeaponId, 'crossbows');
    assert.equal(recipe.requiredLevel, 0, 'Crossbow must be craftable at Tier 0 Blacksmithing');
    assert.deepEqual(recipe.ingredients, { ore: 5, wood: 3 }, 'Recipe must require 5 ore and 3 wood');
    assert.equal(recipe.expGranted, 25, 'Recipe must grant 25 Blacksmithing EXP');

    console.log('✓ PASS: Blacksmithing recipe for Crossbows is valid and matches crafting requirements.\n');
  }

  // ============================================================================
  // TEST 4: Player Equip, Handedness & Two-Handed Offhand Restriction
  // ============================================================================
  console.log('--- TEST 4: Player Equip, Handedness & Two-Handed Offhand Restriction ---');
  {
    const scene = createMockScene();
    const crossbow = dataLoader.getWeapon('crossbows')!;
    const shield = dataLoader.getWeapon('shields')!;
    const dagger = dataLoader.getWeapon('daggers')!;

    const dummyPlayerData = {
      id: 'crossbow-hero',
      name: 'Crossbowman',
      maxHp: 100,
      criticalHpMax: 25,
      moveSpeed: 100,
      maxEnergy: 100,
      energyRegenPerSecond: 10,
      startingWeaponId: 'crossbows',
      inventoryCapacity: 20
    };
    const prog = new ProgressionSystem(classesData as any, 'Crossbowman');
    const player = new Player(scene, 10, 10, dummyPlayerData, crossbow, 32, 'crossbow-hero', prog);

    // Equip Crossbow as main weapon
    player.equipWeapon(crossbow);
    assert.equal(player.equippedWeapon?.id, 'crossbows');
    assert.equal(player.attackRangeTiles, 4, 'Crossbow equip must set attackRangeTiles to 4');

    // Attempt to equip offhand shield while wielding two-handed Crossbow
    const shieldEquipped = player.equipOffhandWeapon(shield, true);
    assert.equal(shieldEquipped, false, 'Shield must NOT be equippable while wielding two-handed Crossbow');
    assert.equal(player.offhandWeapon, null, 'Offhand must remain null');

    // Attempt to equip offhand dagger while wielding two-handed Crossbow
    const daggerEquipped = player.equipOffhandWeapon(dagger, true);
    assert.equal(daggerEquipped, false, 'Dagger must NOT be equippable while wielding two-handed Crossbow');
    assert.equal(player.offhandWeapon, null, 'Offhand must remain null');

    console.log('✓ PASS: Two-handed weapon restriction blocks offhand equipment cleanly on Player entity.\n');
  }

  // ============================================================================
  // TEST 5: Live Combat Loop & Crossbows Proficiency EXP Gain
  // ============================================================================
  console.log('--- TEST 5: Live Combat Loop & Crossbows Proficiency EXP Gain ---');
  {
    const scene = createMockScene();
    const crossbow = dataLoader.getWeapon('crossbows')!;
    const prog = new ProgressionSystem(classesData as any, 'Guild Crossbow Hero');
    const player = createMockPlayer('hero', 'Guild Crossbow Hero', 1, 1, crossbow, prog);

    const enemy = createMockEnemy('wolf', 'Forest Wolf', 5, 1, 500); // 4 tiles away
    const combatSystem = new CombatSystem(scene, [player], [enemy], scene.pathfinder);

    const initialCrossbowExp = player.progression.getProficiencyStat('crossbows').currentExp;
    assert.equal(initialCrossbowExp, 0, 'Crossbow EXP starts at 0');

    // Attack enemy with Crossbows (guarantee hit for deterministic damage verification)
    const preHp = enemy.hp;
    const origRandom = Math.random;
    Math.random = () => 0.1;
    combatSystem.executePlayerBasicAttack(player, enemy, 1000);
    Math.random = origRandom;

    assert.ok(enemy.hp < preHp, 'Enemy must take damage from Crossbow shot');
    const postCrossbowExp = player.progression.getProficiencyStat('crossbows').currentExp;
    assert.equal(postCrossbowExp, 2, 'Crossbow attack must grant +2 proficiency EXP');

    console.log('✓ PASS: Live combat loop resolves Crossbow attack at 4 tiles and awards +2 Crossbows EXP.\n');
  }

  // ============================================================================
  // TEST 6: Loader Class Unlock Boundary (Crossbows 9 vs 10)
  // ============================================================================
  console.log('--- TEST 6: Loader Class Unlock Boundary (Crossbows 9 vs 10) ---');
  {
    const loaderDef = dataLoader.getClass('loader')!;
    assert.ok(loaderDef, 'Loader class definition must exist in classes.json');
    assert.equal(loaderDef.tier, 'novice');
    assert.equal(loaderDef.name, 'Loader');
    assert.deepEqual(loaderDef.hiddenSkillBonuses, { energy_regen: 0.05 });

    const candidate = new ProgressionSystem(classesData as any, 'Loader Candidate');

    // Boundary check 1: Crossbows 9 -> Locked
    candidate.getProficiencyStat('crossbows').level = 9;
    assert.equal(candidate.evaluateRequirements(loaderDef), false, 'Loader must be LOCKED at Crossbows 9');

    // Boundary check 2: Crossbows 10 -> Unlocked
    candidate.getProficiencyStat('crossbows').level = 10;
    assert.equal(candidate.evaluateRequirements(loaderDef), true, 'Loader must UNLOCK at Crossbows 10');

    console.log('✓ PASS: Loader class boundary strictly enforced (locked at Crossbows 9, unlocked at 10).\n');
  }

  // ============================================================================
  // TEST 7: Loader 5-Tier Skill Unlock Progression (Lv 1, 10, 20, 30, 40)
  // ============================================================================
  console.log('--- TEST 7: Loader 5-Tier Skill Unlock Progression (Lv 1, 10, 20, 30, 40) ---');
  {
    const primedShot = dataLoader.getSkill('primed_shot')!;
    const rapidCrank = dataLoader.getSkill('rapid_crank')!;
    const arbalestBrace = dataLoader.getSkill('arbalest_brace')!;
    const pinningBolt = dataLoader.getSkill('pinning_bolt')!;
    const kineticOverdraw = dataLoader.getSkill('kinetic_overdraw')!;

    assert.ok(primedShot && rapidCrank && arbalestBrace && pinningBolt && kineticOverdraw, 'All 5 Loader skills must exist in skills.json');

    const prog = new ProgressionSystem(classesData as any, 'Loader Trainee');

    // Lv 0: All locked
    prog.setClassLevel('loader', 0);
    assert.equal(prog.isSkillUnlocked(primedShot), false);
    assert.equal(prog.isSkillUnlocked(rapidCrank), false);
    assert.equal(prog.isSkillUnlocked(arbalestBrace), false);
    assert.equal(prog.isSkillUnlocked(pinningBolt), false);
    assert.equal(prog.isSkillUnlocked(kineticOverdraw), false);

    // Lv 1: Primed Shot unlocks
    prog.setClassLevel('loader', 1);
    assert.equal(prog.isSkillUnlocked(primedShot), true, 'Primed Shot unlocks at Loader Lv 1');
    assert.equal(prog.isSkillUnlocked(rapidCrank), false);

    // Lv 10: Rapid Crank unlocks
    prog.setClassLevel('loader', 10);
    assert.equal(prog.isSkillUnlocked(rapidCrank), true, 'Rapid Crank unlocks at Loader Lv 10');
    assert.equal(prog.isSkillUnlocked(arbalestBrace), false);

    // Lv 20: Arbalest Brace unlocks
    prog.setClassLevel('loader', 20);
    assert.equal(prog.isSkillUnlocked(arbalestBrace), true, 'Arbalest Brace unlocks at Loader Lv 20');
    assert.equal(prog.isSkillUnlocked(pinningBolt), false);

    // Lv 30: Pinning Bolt unlocks
    prog.setClassLevel('loader', 30);
    assert.equal(prog.isSkillUnlocked(pinningBolt), true, 'Pinning Bolt unlocks at Loader Lv 30');
    assert.equal(prog.isSkillUnlocked(kineticOverdraw), false);

    // Lv 40: Kinetic Overdraw capstone unlocks
    prog.setClassLevel('loader', 40);
    assert.equal(prog.isSkillUnlocked(kineticOverdraw), true, 'Kinetic Overdraw capstone unlocks at Loader Lv 40');

    console.log('✓ PASS: All 5 Loader skills strictly adhere to the 1, 10, 20, 30, 40 unlock cadence.\n');
  }

  // ============================================================================
  // TEST 8: Combat Execution — Loader 5-Skill Kit
  // ============================================================================
  console.log('--- TEST 8: Combat Execution — Loader 5-Skill Kit ---');
  {
    const scene = createMockScene();
    const crossbow = dataLoader.getWeapon('crossbows')!;
    const prog = new ProgressionSystem(classesData as any, 'Master Loader');
    prog.setClassLevel('loader', 40);
    const player = createMockPlayer('hero', 'Master Loader', 1, 1, crossbow, prog);

    const enemy = createMockEnemy('wolf', 'Forest Wolf', 5, 1, 1000); // 4 tiles away
    const combatSystem = new CombatSystem(scene, [player], [enemy], scene.pathfinder);

    // 1. Primed Shot (140% damage at range)
    player.energy = 100;
    const hpBeforePrimed = enemy.hp;
    const primedSuccess = combatSystem.castSkill(player, 'primed_shot', enemy, 1000);
    assert.equal(primedSuccess, true, 'Primed Shot cast succeeded');
    const primedDamage = hpBeforePrimed - enemy.hp;
    assert.ok(primedDamage > 0, 'Primed Shot dealt damage');
    assert.equal(player.energy, 85, 'Primed Shot deducted 15 energy');

    // 2. Rapid Crank (150% damage at range)
    player.energy = 100;
    const hpBeforeCrank = enemy.hp;
    const crankSuccess = combatSystem.castSkill(player, 'rapid_crank', enemy, 5000);
    assert.equal(crankSuccess, true, 'Rapid Crank cast succeeded');
    assert.ok(enemy.hp < hpBeforeCrank, 'Rapid Crank dealt damage');
    assert.equal(player.energy, 84, 'Rapid Crank deducted 16 energy');

    // 3. Arbalest Brace (Self stance buff, -20% incoming damage)
    player.energy = 100;
    const braceSuccess = combatSystem.castSkill(player, 'arbalest_brace', null, 10000);
    assert.equal(braceSuccess, true, 'Arbalest Brace cast succeeded');
    assert.ok(player.hasStatusEffect('arbalest_brace'), 'Player has arbalest_brace status effect');
    assert.equal(player.energy, 80, 'Arbalest Brace deducted 20 energy');

    // 4. Pinning Bolt (180% damage at range + 50% Slow)
    player.energy = 100;
    const hpBeforePin = enemy.hp;
    const pinSuccess = combatSystem.castSkill(player, 'pinning_bolt', enemy, 15000);
    assert.equal(pinSuccess, true, 'Pinning Bolt cast succeeded');
    assert.ok(enemy.hp < hpBeforePin, 'Pinning Bolt dealt damage');
    assert.ok(enemy.hasStatusEffect('slow'), 'Target enemy has slow status effect from Pinning Bolt');
    assert.equal(player.energy, 76, 'Pinning Bolt deducted 24 energy');

    // 5. Kinetic Overdraw (260% capstone damage at range)
    player.energy = 100;
    const hpBeforeOverdraw = enemy.hp;
    const overdrawSuccess = combatSystem.castSkill(player, 'kinetic_overdraw', enemy, 25000);
    assert.equal(overdrawSuccess, true, 'Kinetic Overdraw cast succeeded');
    const overdrawDamage = hpBeforeOverdraw - enemy.hp;
    assert.ok(overdrawDamage > primedDamage, 'Kinetic Overdraw deals devastating capstone damage exceeding baseline');
    assert.equal(player.energy, 70, 'Kinetic Overdraw deducted 30 energy');

    console.log('✓ PASS: All 5 Loader skills cast successfully with authentic mechanical effects, damage, and statuses.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 55 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone55Tests().catch((err) => {
  console.error('❌ MILESTONE 55 TEST RUNNER FAILED:');
  console.error(err);
  process.exit(1);
});
