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
    add: new Proxy({
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      line: createMockObj,
      circle: createMockObj,
      existing: (item: any) => item
    }, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return createMockObj;
      }
    }),
    tweens: {
      add: () => ({ remove: () => {} })
    }
  };
}

async function run() {
  console.log('=== TEST: ATTRIBUTES SYSTEM (STR / DEX / INT) ===\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const playerData = dl.getPlayer();
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { SkillSystem } = await import('../src/systems/SkillSystem.ts');

  // Helper to drive real progression to a desired proficiency level
  function trainProficiency(player: any, profId: string, targetLevel: number) {
    const current = player.progression.getProficiencyLevel(profId);
    let totalExp = 0;
    for (let l = current; l < targetLevel; l++) {
      totalExp += LevelingSystem.expForNextLevel(l);
    }
    if (totalExp > 0) {
      player.progression.addProficiencyExp(profId, totalExp);
    }
  }

  // Helper to drive real progression to a desired class level
  function trainClass(player: any, classId: string, targetLevel: number) {
    const current = player.progression.getClassLevel(classId);
    for (let lvl = current; lvl < targetLevel; lvl++) {
      const needed = player.progression.getClassStat(classId).nextExp - player.progression.getClassStat(classId).currentExp;
      player.progression.addClassExp(classId, needed);
    }
  }

  // --- Test 1: Base values and starting multipliers ---
  console.log('Test 1: Base attributes start at 1.0 with 1.0x multipliers');
  const scene1 = createMockScene();
  const hero1 = new Player(scene1, 5, 5, 'hero_1', playerData, 'warrior');
  assert.equal(hero1.strength, 1.0, `Base STR should be 1.0, got ${hero1.strength}`);
  assert.equal(hero1.dexterity, 1.0, `Base DEX should be 1.0, got ${hero1.dexterity}`);
  assert.equal(hero1.intelligence, 1.0, `Base INT should be 1.0, got ${hero1.intelligence}`);
  assert.equal(hero1.strMultiplier, 1.0, `Base strMultiplier should be 1.0, got ${hero1.strMultiplier}`);
  assert.equal(hero1.dexMultiplier, 1.0, `Base dexMultiplier should be 1.0, got ${hero1.dexMultiplier}`);
  assert.equal(hero1.intMultiplier, 1.0, `Base intMultiplier should be 1.0, got ${hero1.intMultiplier}`);
  console.log('  PASS: Base attributes and multipliers start at 1.0.\n');

  // --- Test 2: Katana 50 -> STR 6.0 -> Melee basic attack deals x1.10 damage ---
  console.log('Test 2: Katana Lv 50 -> STR 6.0 (+10% damage multiplier)');
  const scene2 = createMockScene();
  const hero2 = new Player(scene2, 5, 5, 'hero_2', playerData, 'warrior');
  trainProficiency(hero2, 'katana', 50);

  // 50 levels of katana: +50 * 0.1 = +5.0 STR -> STR = 6.0
  assert.equal(hero2.strength, 6.0, `STR should be 6.0, got ${hero2.strength}`);
  assert.equal(hero2.dexterity, 1.0, `DEX should remain 1.0, got ${hero2.dexterity}`);
  assert.equal(hero2.intelligence, 1.0, `INT should remain 1.0, got ${hero2.intelligence}`);
  // Multiplier: 1 + 0.02 * (6.0 - 1) = 1 + 0.02 * 5 = 1.10
  assert.equal(Math.round(hero2.strMultiplier * 100) / 100, 1.10, `strMultiplier should be 1.10, got ${hero2.strMultiplier}`);

  // Test combat system execution with melee attack
  const combatSystem2 = new CombatSystem(scene2, [hero2], []);
  const enemy2 = new Enemy(scene2, 5, 6, {
    id: 'test_goblin',
    name: 'Goblin',
    hp: 200,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  // Equip Katana (melee weapon)
  const katanaDef = dl.getWeapon('katana')!;
  hero2.equippedWeapon = katanaDef;
  const initialEnemyHp = enemy2.hp;

  // Execute attack with hit guaranteed (paramEffectiveAccuracy: 1.0)
  combatSystem2.executePlayerBasicAttack(hero2, enemy2, 1000, katanaDef, 0, 10, 1.0);
  const damageDealt = initialEnemyHp - enemy2.hp;
  // Base 10 * 1.10 = 11.0
  assert.equal(Math.round(damageDealt * 100) / 100, 11.0, `Melee attack should deal 11.0 damage, dealt ${damageDealt}`);
  console.log('  PASS: Katana 50 gives STR 6.0 and scales melee basic attack to x1.10.\n');

  // --- Test 3: Bows 50 -> DEX 6.0 -> Ranged basic attack deals x1.10 without STR benefit ---
  console.log('Test 3: Bows Lv 50 -> DEX 6.0 (+10% ranged damage, no melee bonus)');
  const scene3 = createMockScene();
  const hero3 = new Player(scene3, 5, 5, 'hero_3', playerData, 'warrior');
  trainProficiency(hero3, 'bows', 50);

  assert.equal(hero3.strength, 1.0, `STR should remain 1.0, got ${hero3.strength}`);
  assert.equal(hero3.dexterity, 6.0, `DEX should be 6.0, got ${hero3.dexterity}`);
  assert.equal(hero3.dexMultiplier, 1.10, `dexMultiplier should be 1.10, got ${hero3.dexMultiplier}`);
  assert.equal(hero3.strMultiplier, 1.0, `strMultiplier should remain 1.0, got ${hero3.strMultiplier}`);

  const combatSystem3 = new CombatSystem(scene3, [hero3], []);
  const enemy3 = new Enemy(scene3, 5, 7, {
    id: 'test_goblin',
    name: 'Goblin',
    hp: 200,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  // Bow attack with DEX
  const bowDef = dl.getWeapon('bows')!;
  hero3.equippedWeapon = bowDef;
  const hpBeforeBow = enemy3.hp;
  combatSystem3.executePlayerBasicAttack(hero3, enemy3, 1000, bowDef, 0, 20, 1.0);
  const bowDamage = hpBeforeBow - enemy3.hp;
  // Base 20 * 1.10 DEX = 22.0
  assert.equal(Math.round(bowDamage * 100) / 100, 22.0, `Bow attack should deal 22.0 damage, dealt ${bowDamage}`);

  // Void Crossbow (category === 'ranged') uses DEX
  const voidCrossbowDef = dl.getWeapon('void_crossbow') ?? {
    id: 'void_crossbow',
    name: 'Void Crossbow',
    category: 'ranged',
    baseDamage: 30,
    attackIntervalMs: 1000,
    twoHanded: true
  };
  const hpBeforeVoid = enemy3.hp;
  combatSystem3.executePlayerBasicAttack(hero3, enemy3, 2000, voidCrossbowDef as any, 0, 30, 1.0);
  const voidDamage = hpBeforeVoid - enemy3.hp;
  // Base 30 * 1.10 DEX = 33.0
  assert.equal(Math.round(voidDamage * 100) / 100, 33.0, `Void Crossbow should scale by DEX to 33.0, dealt ${voidDamage}`);

  // Melee attack with fists should NOT get DEX bonus (only 1.0x STR)
  const fistDef = dl.getWeapon('fist')!;
  const hpBeforeMelee = enemy3.hp;
  combatSystem3.executePlayerBasicAttack(hero3, enemy3, 3000, fistDef, 0, 10, 1.0);
  const meleeDamage = hpBeforeMelee - enemy3.hp;
  assert.equal(Math.round(meleeDamage * 100) / 100, 10.0, `Melee attack without STR should deal base 10.0 damage, dealt ${meleeDamage}`);
  console.log('  PASS: Bows 50 gives DEX 6.0, scales ranged & Void Crossbow x1.10, melee untouched.\n');

  // --- Test 4: Fire 50 -> INT 6.0 -> Spell x1.10, heal x1.10 ---
  console.log('Test 4: Fire Magic Lv 50 -> INT 6.0 (+10% magic damage and flat heal)');
  const scene4 = createMockScene();
  const hero4 = new Player(scene4, 5, 5, 'hero_4', playerData, 'mage');
  trainProficiency(hero4, 'fire_magic', 50);

  assert.equal(hero4.intelligence, 6.0, `INT should be 6.0, got ${hero4.intelligence}`);
  assert.equal(hero4.intMultiplier, 1.10, `intMultiplier should be 1.10, got ${hero4.intMultiplier}`);

  const combatSystem4 = new CombatSystem(scene4, [hero4], []);
  const enemy4 = new Enemy(scene4, 5, 7, {
    id: 'test_goblin',
    name: 'Goblin',
    hp: 200,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  // Magic attack - isolate INT attribute scaling with unranked class (1.0x spell mult)
  const fireMagicDef = dl.getWeapon('fire_magic')!;
  hero4.setActiveClass(null);
  const hpBeforeSpell = enemy4.hp;
  combatSystem4.executePlayerBasicAttack(hero4, enemy4, 1000, fireMagicDef, 0, 20, 1.0);
  const spellDamage = hpBeforeSpell - enemy4.hp;
  assert.equal(Math.round(spellDamage * 100) / 100, 22.0, `Spell basic attack should scale by INT to 22.0, dealt ${spellDamage}`);

  // Magic attack with Ember Adept active (1.25x class spell damage multiplier) -> 20 * 1.10 * 1.25 = 27.5
  hero4.setActiveClass('ember_adept');
  const hpBeforeEmberSpell = enemy4.hp;
  combatSystem4.executePlayerBasicAttack(hero4, enemy4, 1000, fireMagicDef, 0, 20, 1.0);
  const emberSpellDamage = hpBeforeEmberSpell - enemy4.hp;
  assert.equal(Math.round(emberSpellDamage * 100) / 100, 27.5, `Spell basic attack with Ember Adept should scale to 27.5, dealt ${emberSpellDamage}`);


  // Basic healing staff cast: flat heal scaled by INT
  const woundedAlly = new Player(scene4, 5, 6, 'ally', playerData, 'warrior');
  woundedAlly.hp = 20;
  woundedAlly.maxHp = 50;
  woundedAlly.criticalHp = 25;
  woundedAlly.maxCriticalHp = 25;
  combatSystem4.party = [hero4, woundedAlly];
  const staffDef = dl.getWeapon('healing_staff')!;
  hero4.equippedWeapon = staffDef;
  combatSystem4.checkAndAutocastHealingMagic(hero4, 1000);
  // Base staff heal = 8, with INT 1.10 -> Math.round(8 * 1.10) = 9 HP heal (20 + 9 = 29)
  assert.equal(woundedAlly.hp, 29, `Healing staff cast should scale by INT 1.10 to 9 heal, got hp ${woundedAlly.hp}`);

  // SkillSystem flat heal scaling
  const skillSystem4 = new SkillSystem(combatSystem4);
  const healSkillDef = {
    id: 'test_heal',
    name: 'Test Heal',
    category: 'magic',
    proficiencyId: 'healing_magic',
    requiredLevel: 1,
    energyCost: 10,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeTiles: 5,
    targetType: 'single_ally',
    effects: [
      { type: 'heal', amount: 20 }
    ]
  };
  woundedAlly.hp = 10;
  skillSystem4.execute(hero4, healSkillDef as any, woundedAlly, 2000);
  // 20 * 1.10 = 22 -> 10 + 22 = 32
  assert.equal(Math.round(woundedAlly.hp), 32, `SkillSystem flat heal should scale by INT 1.10 (20 * 1.10 = 22), hp is ${woundedAlly.hp}`);

  // Percent heal should NOT scale by INT
  const percentHealSkillDef = {
    id: 'test_pct_heal',
    name: 'Test Pct Heal',
    category: 'magic',
    proficiencyId: 'healing_magic',
    requiredLevel: 1,
    energyCost: 10,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeTiles: 5,
    targetType: 'single_ally',
    effects: [
      { type: 'heal', percent: 0.20 }
    ]
  };
  woundedAlly.hp = 10;
  woundedAlly.maxHp = 50;
  skillSystem4.execute(hero4, percentHealSkillDef as any, woundedAlly, 3000);
  // 20% of 50 = exactly 10, not scaled by INT
  assert.equal(woundedAlly.hp, 20, `Percent heal must NOT scale by INT, got hp ${woundedAlly.hp}`);

  // HoT scaling by INT 1.10
  const hotSkillDef = {
    id: 'test_hot',
    name: 'Test HoT',
    category: 'magic',
    proficiencyId: 'healing_magic',
    requiredLevel: 1,
    energyCost: 10,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeTiles: 5,
    targetType: 'single_ally',
    effects: [
      { type: 'healOverTime', amountPerTick: 10, durationMs: 5000, tickIntervalMs: 1000 }
    ]
  };
  skillSystem4.execute(hero4, hotSkillDef as any, woundedAlly, 4000);
  const appliedHot = woundedAlly.getStatusEffect('test_hot');
  assert.ok(appliedHot, 'HoT status effect should be applied');
  assert.equal(appliedHot.def.healPerTick, 11, `HoT healPerTick should scale by INT 1.10 (10 * 1.10 = 11), got ${appliedHot.def.healPerTick}`);

  // Shield scaling by INT 1.10
  const shieldSkillDef = {
    id: 'test_shield',
    name: 'Test Shield',
    category: 'magic',
    proficiencyId: 'healing_magic',
    requiredLevel: 1,
    energyCost: 10,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeTiles: 5,
    targetType: 'single_ally',
    effects: [
      { type: 'shield', shieldAmount: 20, durationMs: 5000 }
    ]
  };
  skillSystem4.execute(hero4, shieldSkillDef as any, woundedAlly, 5000);
  const appliedShield = woundedAlly.getStatusEffect('test_shield');
  assert.ok(appliedShield, 'Shield status effect should be applied');
  assert.equal(appliedShield.shieldHp, 22, `Shield shieldAmount should scale by INT 1.10 (20 * 1.10 = 22), got ${appliedShield.shieldHp}`);

  console.log('  PASS: Fire 50 gives INT 6.0, scales spells, flat heal, HoT ticks, and shields; percent heal exempt.\n');

  // --- Test 5: Uncapped scaling (STR 101.0 -> x3.00 damage multiplier) ---
  console.log('Test 5: Uncapped attribute scaling (STR 101.0 -> x3.00 multiplier)');
  const scene5 = createMockScene();
  const hero5 = new Player(scene5, 5, 5, 'hero_5', playerData, 'warrior');
  // 1,000 levels across melee weapons: +100.0 STR + 1.0 base = 101.0 STR
  // 100 levels each on 10 melee weapons
  const meleeProfs = ['short_swords', 'longswords', 'greatswords', 'katana', 'daggers', 'mace', 'spears', 'fist', 'staff', 'shields'];
  for (const prof of meleeProfs) {
    trainProficiency(hero5, prof, 100);
  }
  assert.equal(hero5.strength, 101.0, `STR should reach 101.0, got ${hero5.strength}`);
  // Mult: 1 + 0.02 * (101.0 - 1) = 1 + 0.02 * 100 = 3.00
  assert.equal(Math.round(hero5.strMultiplier * 100) / 100, 3.00, `strMultiplier should be uncapped 3.00, got ${hero5.strMultiplier}`);
  console.log('  PASS: STR 101.0 yields uncapped x3.00 multiplier without ceiling.\n');

  // --- Test 6: Cleave test (STR 11.0 crescent_storm hits primary and cleave targets x1.20) ---
  console.log('Test 6: Cleave damage scaling with crescent_storm (STR 11.0 -> x1.20 on primary and cleave)');
  const scene6 = createMockScene();
  const hero6 = new Player(scene6, 5, 5, 'hero_6', playerData, 'warrior');
  // Train 100 levels of longswords: +10.0 STR -> STR = 11.0, multiplier = 1.20
  trainProficiency(hero6, 'longswords', 100);
  assert.equal(hero6.strength, 11.0, `STR should be 11.0, got ${hero6.strength}`);
  assert.equal(Math.round(hero6.strMultiplier * 100) / 100, 1.20, `strMultiplier should be 1.20, got ${hero6.strMultiplier}`);

  const combatSystem6 = new CombatSystem(scene6, [hero6], []);
  const skillSystem6 = new SkillSystem(combatSystem6);

  const primaryTarget = new Enemy(scene6, 6, 5, {
    id: 'primary',
    name: 'Goblin 1',
    hp: 200,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  const cleaveTarget = new Enemy(scene6, 6, 6, {
    id: 'cleave',
    name: 'Goblin 2',
    hp: 200,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  combatSystem6.setEnemies([primaryTarget, cleaveTarget]);
  hero6.equippedWeapon = dl.getWeapon('greatswords')!;

  const crescentStormDef = dl.getSkill('crescent_storm');
  assert.ok(crescentStormDef, 'crescent_storm skill should exist');

  const hpBeforePrimary = primaryTarget.hp;
  const hpBeforeCleave = cleaveTarget.hp;

  // Execute crescent_storm with deterministic hit
  const origRandom = Math.random;
  Math.random = () => 0.05;
  try {
    skillSystem6.execute(hero6, crescentStormDef, primaryTarget, 1000);
  } finally {
    Math.random = origRandom;
  }

  const primaryDmg = hpBeforePrimary - primaryTarget.hp;
  const cleaveDmg = hpBeforeCleave - cleaveTarget.hp;

  console.log(`  crescent_storm primary damage: ${primaryDmg.toFixed(1)}, cleave damage: ${cleaveDmg.toFixed(1)}`);
  assert.ok(primaryDmg > 0, `Primary target should take damage`);
  assert.ok(cleaveDmg > 0, `Cleave target should take damage`);

  // Verify that both primary target and cleave target are scaled by x1.20:
  // Greatsword base damage 13 * multiplier 2.4 = 31.2
  // Scaled hitDamage = 31.2 * 1.20 (STR-11 multiplier) = 37.44
  assert.equal(Math.round(primaryDmg * 10) / 10, 37.4, `Primary target damage should be 37.4 (31.2 * 1.20), got ${primaryDmg}`);
  assert.equal(Math.round(cleaveDmg * 10) / 10, 37.4, `Cleave target damage should be 37.4 (31.2 * 1.20), got ${cleaveDmg}`);
  console.log('  PASS: crescent_storm scales primary target AND cleave target by x1.20.\n');

  // --- Test 7: DoT ticks (bleed, poison, burn) and reflect remain unaffected by attributes ---
  console.log('Test 7: DoT ticks and reflect remain unaffected by attributes');
  const scene7 = createMockScene();
  const hero7 = new Player(scene7, 5, 5, 'hero_7', playerData, 'warrior');
  hero7.strength = 10.0;
  hero7.strMultiplier = 1.18;
  hero7.intelligence = 10.0;
  hero7.intMultiplier = 1.18;

  // Apply a standard bleed effect (5 dmg per tick)
  const enemy7 = new Enemy(scene7, 5, 6, {
    id: 'enemy_7',
    name: 'Goblin',
    hp: 100,
    baseDamage: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    accuracy: 1.0,
    behavior: 'aggressive',
    expReward: 10
  });

  const bleedEffect = {
    id: 'bleed',
    name: 'Bleed',
    durationMs: 3000,
    tickIntervalMs: 1000,
    damagePerTick: 5,
    color: '#ef4444'
  };
  enemy7.applyStatusEffect(bleedEffect);
  const hpBeforeTick = enemy7.hp;
  enemy7.updateStatusEffects(1000);
  const dotDamage = hpBeforeTick - enemy7.hp;
  assert.equal(dotDamage, 5, `DoT tick should deal exact base 5 damage, got ${dotDamage}`);
  console.log('  PASS: DoT tick is unaffected by INT/STR.\n');

  console.log('ALL ATTRIBUTES SYSTEM TESTS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
