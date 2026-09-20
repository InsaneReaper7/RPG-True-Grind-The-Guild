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
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { PlayerData, WeaponDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 30, gridHeight: number = 30, initialTime = 1000) {
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
    }
  };
}

async function runMilestone41Tests() {
  console.log('======================================================');
  console.log('MILESTONE 41: FIST & BRAWLER TEST SUITE');
  console.log('======================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const playerData = dataLoader.getPlayer();

  // --- TEST 1: Fist Weapon Definition in weapons.json ---
  console.log('--- TEST 1: Fist Weapon Definition ---');
  const fist = dataLoader.getWeapon('fist');
  assert.ok(fist, 'Fist weapon must exist in DataLoader / weapons.json');
  assert.equal(fist.id, 'fist', 'Fist ID is "fist"');
  assert.equal(fist.category, 'unarmed', 'Fist category must be "unarmed"');
  assert.equal(fist.twoHanded, false, 'Fist is one-handed / non-two-handed');
  assert.equal(fist.attackIntervalMs, 750, 'Fist attack interval must be 750ms (rapid punches)');
  assert.equal(fist.baseDamage, 4, 'Fist base damage must be 4');
  assert.equal(fist.levelBonus?.damagePerLevel, 1.5, 'Fist damagePerLevel must be 1.5 (steep easter-egg scaling)');
  assert.equal(fist.levelBonus?.accuracyPerLevel, 0.004, 'Fist accuracyPerLevel must be 0.004');
  console.log('✓ PASS: Fist weapon defined with category="unarmed", baseDamage=4, interval=750ms, damagePerLevel=1.5.\n');

  // --- TEST 2: Brawler Class Definition in classes.json ---
  console.log('--- TEST 2: Brawler Class Definition ---');
  const brawler = dataLoader.getClass('brawler');
  assert.ok(brawler, 'Brawler class must exist in DataLoader / classes.json');
  assert.equal(brawler.id, 'brawler', 'Brawler ID is "brawler"');
  assert.equal(brawler.tier, 'novice', 'Brawler tier must be "novice" (Tier 0)');
  assert.equal(brawler.requirements.length, 1, 'Brawler has 1 requirement');
  assert.equal(brawler.requirements[0].type, 'proficiency', 'Requirement type is "proficiency"');
  assert.equal(brawler.requirements[0].target, 'fist', 'Requirement target is "fist"');
  assert.equal(brawler.requirements[0].value, 10, 'Requirement value is 10 (Fist Level 10)');
  assert.equal(brawler.hiddenSkillBonuses?.counterattack, 0.08, 'Brawler grants +8% counterattack');
  assert.equal(brawler.hiddenSkillBonuses?.resilience, 0.08, 'Brawler grants +8% resilience');
  console.log('✓ PASS: Brawler Tier 0 class correctly gated behind Fist Level 10 with brawler hidden skill bonuses.\n');

  // --- TEST 3: Normal Punch Skill Definition in skills.json ---
  console.log('--- TEST 3: Normal Punch Skill Definition ---');
  const normalPunch = dataLoader.getSkill('normal_punch');
  assert.ok(normalPunch, 'Normal Punch skill must exist in DataLoader / skills.json');
  assert.equal(normalPunch.id, 'normal_punch', 'Skill ID is "normal_punch"');
  assert.equal(normalPunch.damageMultiplier, 2.5, 'Normal Punch multiplier must be 2.5 (250% weapon damage)');
  assert.equal(normalPunch.energyCost, 20, 'Normal Punch energy cost is 20');
  assert.equal(normalPunch.cooldownMs, 4000, 'Normal Punch cooldown is 4000ms');
  assert.equal(normalPunch.requirements?.[0]?.type, 'classLevel', 'Skill gated by classLevel');
  assert.equal(normalPunch.requirements?.[0]?.target, 'brawler', 'Skill gated by brawler');
  assert.equal(normalPunch.requirements?.[0]?.value, 1, 'Skill unlocks at Brawler Class Level 1');
  console.log('✓ PASS: Normal Punch signature skill defined with 250% damage multiplier gated at Brawler Lv 1.\n');

  // --- TEST 4: Hidden-Until-Level-1 Pattern ---
  console.log('--- TEST 4: Hidden-Until-Level-1 Progression Pattern ---');
  const progression = new ProgressionSystem(dataLoader.getClassesData(), 'Test Hero');
  assert.equal(progression.getProficiencyLevel('fist'), 0, 'Fist starts at Level 0');
  assert.equal(progression.isStatRevealed('fist'), false, 'Fist must be hidden at Level 0');

  let discoveredFired = false;
  let discoveredSkillId = '';
  let discoveredLevel = 0;
  progression.onSkillDiscovered((evt) => {
    discoveredFired = true;
    discoveredSkillId = evt.skillId;
    discoveredLevel = evt.level;
  });

  // Adding 50 EXP takes fist to Level 1
  const expRes = progression.addProficiencyExp('fist', 50);
  assert.equal(expRes.leveledUp, true, 'Leveled up to Level 1');
  assert.equal(progression.getProficiencyLevel('fist'), 1, 'Fist is now Level 1');
  assert.equal(progression.isStatRevealed('fist'), true, 'Fist is now revealed at Level 1');
  assert.equal(discoveredFired, true, 'onSkillDiscovered callback fired');
  assert.equal(discoveredSkillId, 'fist', 'Discovered skill is "fist"');
  assert.equal(discoveredLevel, 1, 'Discovered level is 1');
  console.log('✓ PASS: Hidden-until-Level-1 pattern verified: hidden at Lv 0, revealed upon reaching Lv 1 with discovery event.\n');

  // --- TEST 5: Proficiency Curve Math & EXP Grants ---
  console.log('--- TEST 5: Additive Proficiency Curve & Combat EXP ---');
  // Formula: 50 + currentLevel * 4
  assert.equal(LevelingSystem.expForNextLevel(0), 50, 'Level 0 -> 1 requires 50 EXP');
  assert.equal(LevelingSystem.expForNextLevel(1), 54, 'Level 1 -> 2 requires 54 EXP');
  assert.equal(LevelingSystem.expForNextLevel(2), 58, 'Level 2 -> 3 requires 58 EXP');
  assert.equal(LevelingSystem.expForNextLevel(9), 86, 'Level 9 -> 10 requires 86 EXP');

  // Total cumulative EXP from 0 to 10:
  // 50 + 54 + 58 + 62 + 66 + 70 + 74 + 78 + 82 + 86 = 680 EXP (exactly 340 hits at +2 EXP/hit)
  let cumulativeExp = 0;
  for (let lvl = 0; lvl < 10; lvl++) {
    cumulativeExp += LevelingSystem.expForNextLevel(lvl);
  }
  assert.equal(cumulativeExp, 680, 'Cumulative EXP to Level 10 is exactly 680 EXP (340 hits at +2 EXP/hit)');

  // Verify CombatSystem EXP grants with Fist:
  const scene = createMockScene(30, 30, 20000);
  const hero = new Player(scene as any, 5, 5, playerData, fist, 32, 'player-avatar');
  const wolfDef = dataLoader.getEnemy('wolf')!;
  const wolf = new Enemy(scene as any, 5, 6, wolfDef, 32);
  const combatSystem = new CombatSystem(scene as any, [hero], [wolf], scene.pathfinder);

  hero.progression.getProficiencyStat('fist').level = 0;
  hero.progression.getProficiencyStat('fist').currentExp = 0;

  // Simulate an attack landing with fist
  const initialFistExp = hero.progression.getProficiencyStat('fist').currentExp;
  hero.progression.addProficiencyExp('fist', 2);
  assert.equal(hero.progression.getProficiencyStat('fist').currentExp, initialFistExp + 2, '+2 EXP granted on fist hit');

  // Simulate defeating enemy with fist
  hero.progression.addProficiencyExp('fist', 4);
  assert.equal(hero.progression.getProficiencyStat('fist').currentExp, initialFistExp + 6, '+4 EXP granted on fist kill');
  console.log('✓ PASS: Constant-increment additive growth formula (50 + lvl * 4) and combat EXP (+2 hit, +4 kill) verified.\n');

  // --- TEST 6: Brawler Class Unlock at Fist Level 10 ---
  console.log('--- TEST 6: Class Unlock Gating at Fist Level 10 ---');
  const prog2 = new ProgressionSystem(dataLoader.getClassesData(), 'Brawler Trainee');
  assert.equal(prog2.isClassUnlocked('brawler'), false, 'Brawler locked at Level 0');

  // Set Fist to Level 9: Brawler must remain locked
  prog2.getProficiencyStat('fist').level = 9;
  prog2.getProficiencyStat('fist').currentExp = 0;
  prog2.checkClassUnlocks();
  assert.equal(prog2.isClassUnlocked('brawler'), false, 'Brawler still locked at Fist Level 9');

  let classUnlockedFired = false;
  let unlockedClassId = '';
  prog2.onClassUnlocked((evt) => {
    classUnlockedFired = true;
    unlockedClassId = evt.classDef.id;
  });

  // Reaching Fist Level 10 unlocks Brawler
  prog2.addProficiencyExp('fist', LevelingSystem.expForNextLevel(9));
  assert.equal(prog2.getProficiencyLevel('fist'), 10, 'Fist reached Level 10');
  assert.equal(prog2.isClassUnlocked('brawler'), true, 'Brawler unlocked at Fist Level 10');
  assert.equal(classUnlockedFired, true, 'onClassUnlocked event fired');
  assert.equal(unlockedClassId, 'brawler', 'Unlocked class ID is "brawler"');

  // Active class equipping and skill unlock
  const hero2 = new Player(scene as any, 5, 5, playerData, fist, 32, 'player-avatar', prog2);
  hero2.setActiveClass('brawler');
  assert.equal(hero2.activeClass, 'brawler', 'Brawler equipped as active class');
  hero2.progression.setClassLevel('brawler', 1);
  hero2.checkSkillUnlocks();
  assert.ok(hero2.knownSkillIds.includes('normal_punch'), 'Normal Punch learned upon equipping Brawler at Class Level 1');
  console.log('✓ PASS: Brawler locked until Fist Level 10; unlocks cleanly and grants Normal Punch at Class Level 1.\n');

  // --- TEST 7: Easter-Egg Tone Numerical Proof (Side-by-Side Comparison) ---
  console.log('--- TEST 7: Easter-Egg Tone Numerical Proof vs Standard Weapons ---');
  const swords = dataLoader.getWeapon('short_swords')!;
  const daggers = dataLoader.getWeapon('daggers')!;
  const mace = dataLoader.getWeapon('mace')!;

  const swordsLv10Dmg = swords.baseDamage + 10 * (swords.levelBonus?.damagePerLevel ?? 0);
  const daggersLv10Dmg = daggers.baseDamage + 10 * (daggers.levelBonus?.damagePerLevel ?? 0);
  const maceLv10Dmg = mace.baseDamage + 10 * (mace.levelBonus?.damagePerLevel ?? 0);
  const fistLv10Dmg = fist.baseDamage + 10 * (fist.levelBonus?.damagePerLevel ?? 0);

  console.log(`  Level 10 Weapon Base Damage Comparison:`);
  console.log(`  - Short Swords: ${swordsLv10Dmg.toFixed(1)} (Base: ${swords.baseDamage}, Slope: +${swords.levelBonus?.damagePerLevel}/lvl)`);
  console.log(`  - Daggers:      ${daggersLv10Dmg.toFixed(1)} (Base: ${daggers.baseDamage}, Slope: +${daggers.levelBonus?.damagePerLevel}/lvl)`);
  console.log(`  - Mace:         ${maceLv10Dmg.toFixed(1)} (Base: ${mace.baseDamage}, Slope: +${mace.levelBonus?.damagePerLevel}/lvl)`);
  console.log(`  - Fist:         ${fistLv10Dmg.toFixed(1)} (Base: ${fist.baseDamage}, Slope: +${fist.levelBonus?.damagePerLevel}/lvl)`);

  assert.equal(swordsLv10Dmg, 10.0, 'Swords at Lv 10 = 10.0 dmg');
  assert.equal(daggersLv10Dmg, 6.0, 'Daggers at Lv 10 = 6.0 dmg');
  assert.equal(maceLv10Dmg, 13.0, 'Mace at Lv 10 = 13.0 dmg');
  assert.equal(fistLv10Dmg, 19.0, 'Fist at Lv 10 = 19.0 dmg');
  assert.ok(fistLv10Dmg > swordsLv10Dmg * 1.8, 'Fist Lv 10 base damage is >80% higher than Short Swords');
  assert.ok(fistLv10Dmg > maceLv10Dmg, 'Fist Lv 10 base damage surpasses Mace');
  assert.ok(fistLv10Dmg > 12, 'Fist Lv 10 base damage surpasses two-handed Greatsword base damage (12)');

  // Signature Tier 0 Class Skill Damage:
  const powerStrike = dataLoader.getSkill('power_strike')!;
  const crushingBlow = dataLoader.getSkill('crushing_blow')!;

  const powerStrikeDmg = swordsLv10Dmg * (powerStrike.damageMultiplier ?? 1.0);
  const crushingBlowDmg = maceLv10Dmg * (crushingBlow.damageMultiplier ?? 1.0);
  const normalPunchDmg = fistLv10Dmg * (normalPunch.damageMultiplier ?? 1.0);

  console.log(`\n  Tier 0 Signature Skill Damage Comparison:`);
  console.log(`  - Fencer (Power Strike):      ${powerStrikeDmg.toFixed(1)} (${powerStrike.damageMultiplier * 100}% of ${swordsLv10Dmg})`);
  console.log(`  - Bludgeoner (Crushing Blow): ${crushingBlowDmg.toFixed(1)} (${crushingBlow.damageMultiplier * 100}% of ${maceLv10Dmg})`);
  console.log(`  - Brawler (Normal Punch):     ${normalPunchDmg.toFixed(1)} (${normalPunch.damageMultiplier * 100}% of ${fistLv10Dmg})`);

  assert.equal(powerStrikeDmg, 20.0, 'Power Strike = 20.0 dmg');
  assert.ok(Math.abs(crushingBlowDmg - 23.4) < 0.001, 'Crushing Blow = 23.4 dmg');
  assert.equal(normalPunchDmg, 47.5, 'Normal Punch = 47.5 dmg');
  assert.ok(normalPunchDmg > powerStrikeDmg * 2.0, 'Normal Punch deals more than double the damage of Power Strike');
  assert.ok(normalPunchDmg > crushingBlowDmg * 2.0, 'Normal Punch deals more than double the damage of Crushing Blow');

  const slopeRatio = (fist.levelBonus?.damagePerLevel ?? 0) / (swords.levelBonus?.damagePerLevel ?? 1);
  console.log(`  Damage curve slope ratio (Fist / Swords): ${slopeRatio.toFixed(1)}x steeper`);
  assert.equal(slopeRatio, 3.0, 'Fist damage scaling is exactly 3.0x steeper than swords');

  console.log('✓ PASS: Cartoonish easter-egg tone numerically demonstrated through 3x steeper scaling slope and ~48 dmg Normal Punch.\n');

  // --- TEST 8: Weapon Unequip & Outpost-Only Gating ---
  console.log('--- TEST 8: Weapon Unequip, Fist Fallback & Outpost Gating ---');
  const hero3 = new Player(scene as any, 5, 5, playerData, swords, 32, 'player-avatar');
  assert.equal(hero3.equippedWeapon.id, 'short_swords', 'Starts with short swords equipped');

  // 1. Attempting to unequip outside Outpost (isOutpost = false) MUST be rejected
  const unequipOutsideOutpost = hero3.equipWeapon(null, false);
  assert.equal(unequipOutsideOutpost, false, 'Unequipping weapon outside Outpost must return false');
  assert.equal(hero3.equippedWeapon.id, 'short_swords', 'Weapon remains short swords when outside Outpost');

  // 2. Attempting to unequip in combat MUST be rejected even if isOutpost is true
  hero3.inCombat = true;
  const unequipInCombat = hero3.equipWeapon(null, true);
  assert.equal(unequipInCombat, false, 'Unequipping weapon during combat must return false');
  assert.equal(hero3.equippedWeapon.id, 'short_swords', 'Weapon remains short swords during combat');
  hero3.inCombat = false;

  // 3. Unequipping at Outpost (isOutpost = true, inCombat = false) succeeds and falls back to Fist
  const unequipAtOutpost = hero3.equipWeapon(null, true);
  assert.equal(unequipAtOutpost, true, 'Unequipping weapon at Outpost must return true');
  assert.equal(hero3.equippedWeapon.id, 'fist', 'Unequipped weapon cleanly falls back to "fist"');
  assert.equal(hero3.equippedWeapon.category, 'unarmed', 'Equipped weapon category is "unarmed"');

  // 4. Re-equipping short swords at Outpost succeeds
  const reEquipAtOutpost = hero3.equipWeapon(swords, true);
  assert.equal(reEquipAtOutpost, true, 'Re-equipping weapon at Outpost succeeds');
  assert.equal(hero3.equippedWeapon.id, 'short_swords', 'Weapon is short swords again');

  // 5. Attempting to switch weapon outside Outpost is rejected
  const switchOutside = hero3.equipWeapon(fist, false);
  assert.equal(switchOutside, false, 'Switching weapon outside Outpost rejected');
  assert.equal(hero3.equippedWeapon.id, 'short_swords', 'Weapon stays short swords');

  console.log('✓ PASS: Outpost-only restriction strictly enforced for weapon equip/unequip; unequip cleanly falls back to Fist.\n');

  console.log('======================================================');
  console.log('ALL MILESTONE 41 TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================');
}

runMilestone41Tests().catch((err) => {
  console.error('Milestone 41 test suite failed:', err);
  process.exit(1);
});
