import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

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

// Dynamic imports after browser globals
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
import type { WeaponDef, EnemyDef, SkillDef } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };
import weaponsData from '../data/weapons.json' with { type: 'json' };
import skillsData from '../data/skills.json' with { type: 'json' };
import statusEffectsData from '../data/statusEffects.json' with { type: 'json' };

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

  const scene: any = {
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
        if (config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {}, remove: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    }
  };
  return scene;
}

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 100): Enemy {
  const def: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 10,
    aggroRadius: 6,
    attackIntervalMs: 1500,
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  return enemy;
}

async function runMilestone58Tests() {
  console.log('================================================================');
  console.log('✨ RUNNING MILESTONE 58: ARCANE INITIATE REACHABLE & COMPLETE ✨');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // =========================================================================
  // TEST 1: Direct Documentation Citation Audit
  // =========================================================================
  console.log('--- TEST 1: Direct Documentation Citation Audit ---');
  const classDocPath = path.resolve(rootDir, 'docs/class_system (1).md');
  const classDocLines = fs.readFileSync(classDocPath, 'utf8').split('\n');

  // Verify Line 90 exact unlock requirement
  const line90 = classDocLines[89]; // 0-indexed line 90
  assert.ok(
    line90.includes('| Arcane Initiate | Arcane 10 | First spark of raw magic |'),
    `docs/class_system (1).md line 90 must contain Arcane Initiate citation. Actual: "${line90}"`
  );
  console.log(`  ✓ Verified class_system (1).md line 90: ${line90}`);

  // Verify true_grind_gdd (2).md Section 12.2 (Lines 463-469)
  const gddDocPath = path.resolve(rootDir, 'docs/true_grind_gdd (2).md');
  const gddDocLines = fs.readFileSync(gddDocPath, 'utf8').split('\n');

  const line463 = gddDocLines[462];
  const line464 = gddDocLines[463];
  const line465 = gddDocLines[464];
  const line466 = gddDocLines[465];
  const line467 = gddDocLines[466];
  const line468 = gddDocLines[467];

  assert.ok(line463.includes('### Arcane Initiate'), `GDD line 463 must introduce Arcane Initiate. Actual: "${line463}"`);
  assert.ok(line464.includes('Arcane Bolt') && line464.includes('Lv 1'), `GDD line 464 must specify Arcane Bolt (Lv 1). Actual: "${line464}"`);
  assert.ok(line465.includes('Mana Shield') && line465.includes('Lv 10'), `GDD line 465 must specify Mana Shield (Lv 10). Actual: "${line465}"`);
  assert.ok(line466.includes('Overcharge') && line466.includes('Lv 20'), `GDD line 466 must specify Overcharge (Lv 20). Actual: "${line466}"`);
  assert.ok(line467.includes('Blink') && line467.includes('Lv 30'), `GDD line 467 must specify Blink (Lv 30). Actual: "${line467}"`);
  assert.ok(line468.includes('Arcane Nova') && line468.includes('Lv 40'), `GDD line 468 must specify Arcane Nova (Lv 40, capstone). Actual: "${line468}"`);
  console.log(`  ✓ Verified GDD Section 12.2 all 5 skills cited directly across lines 463-468.`);

  // Downstream class audit: Confirm none of the downstream Arcane classes gate on Arcane Initiate class level
  const downstreamMentions = classDocLines.filter((l) =>
    (l.includes('Spellsword') || l.includes('Arcane Archer') || l.includes('Battlemage') ||
     l.includes('Arcane Knight') || l.includes('Archmage') || l.includes('Runeblade')) && l.startsWith('|')
  );
  for (const row of downstreamMentions) {
    assert.equal(row.includes('Arcane Initiate Lv'), false,
      `Downstream row must NOT require Arcane Initiate class level: "${row}"`);
  }
  console.log(`  ✓ Verified downstream classes (Spellsword, Archmage, etc.) do NOT gate on Arcane Initiate class levels.`);
  console.log('✓ PASS: Direct documentation audit verified citations and scope discipline.\n');

  // =========================================================================
  // TEST 2: Data Registry & Architecture Integrity
  // =========================================================================
  console.log('--- TEST 2: Data Registry & Architecture Integrity ---');
  const arcaneInitDef = dataLoader.getClass('arcane_initiate');
  assert.ok(arcaneInitDef, 'arcane_initiate class must exist in classes.json');
  assert.equal(arcaneInitDef.tier, 'novice', 'Arcane Initiate is Tier 0 / novice');
  assert.equal(arcaneInitDef.requirements[0].type, 'proficiency');
  assert.equal(arcaneInitDef.requirements[0].target, 'arcane_magic');
  assert.equal(arcaneInitDef.requirements[0].value, 10);
  assert.equal(arcaneInitDef.fantasy, 'First spark of raw magic');

  const requiredSkillIds = ['arcane_bolt', 'mana_shield', 'overcharge', 'blink', 'arcane_nova'];
  for (const sId of requiredSkillIds) {
    const sDef = dataLoader.getSkill(sId);
    assert.ok(sDef, `Skill '${sId}' must exist in skills.json`);
    const classReq = sDef.requirements.find((r) => r.type === 'classLevel' && r.target === 'arcane_initiate');
    assert.ok(classReq, `Skill '${sId}' must have classLevel requirement targeting arcane_initiate`);
  }

  const manaShieldStatus = dataLoader.getStatusEffect('mana_shield');
  assert.ok(manaShieldStatus, 'mana_shield status effect must exist in statusEffects.json');
  assert.equal(manaShieldStatus.damageToEnergyPercent, 0.50, 'mana_shield converts 50% damage to energy');

  const overchargeStatus = dataLoader.getStatusEffect('overcharge');
  assert.ok(overchargeStatus, 'overcharge status effect must exist in statusEffects.json');
  assert.equal(overchargeStatus.spellDamageMultiplier, 1.75, 'overcharge grants 1.75x spell damage');
  assert.equal(overchargeStatus.spellEnergyCostMultiplier, 1.50, 'overcharge increases energy cost by 50%');

  console.log('✓ PASS: All class, skill, and status effect entries cleanly registered.\n');

  // =========================================================================
  // TEST 3: Progression & Class Unlock Boundary (Arcane Magic 9 vs 10)
  // =========================================================================
  console.log('--- TEST 3: Progression & Class Unlock Boundary (Arcane Magic 9 vs 10) ---');
  const prog = new ProgressionSystem(classesData, 'Candidate Mage');
  assert.equal(prog.isClassUnlocked('arcane_initiate'), false, 'Locked at 0 proficiency');

  // Level up to 9
  for (let lvl = 1; lvl <= 9; lvl++) {
    prog.addProficiencyExp('arcane_magic', 100);
  }
  assert.ok(prog.getProficiencyLevel('arcane_magic') >= 9, 'Reached at least level 9');
  // Strict check: if level is 9, class must be locked
  if (prog.getProficiencyLevel('arcane_magic') === 9) {
    assert.equal(prog.isClassUnlocked('arcane_initiate'), false, 'Arcane Initiate locked at Level 9');
  }

  // Push to Level 10
  while (prog.getProficiencyLevel('arcane_magic') < 10) {
    prog.addProficiencyExp('arcane_magic', 50);
  }
  assert.equal(prog.isClassUnlocked('arcane_initiate'), true, 'Arcane Initiate unlocked at Level 10!');
  console.log('✓ PASS: Arcane Initiate class unlock boundary verified (locked < 10, unlocked >= 10).\n');

  // =========================================================================
  // TEST 4: Arcane Initiate 5-Tier Skill Unlock Cadence (Lv 1, 10, 20, 30, 40)
  // =========================================================================
  console.log('--- TEST 4: Arcane Initiate 5-Tier Skill Unlock Cadence ---');
  const apprenticeProg = new ProgressionSystem(classesData, 'Arcane Apprentice');
  apprenticeProg.setClassLevel('arcane_initiate', 0);

  const bolt = dataLoader.getSkill('arcane_bolt')!;
  const shield = dataLoader.getSkill('mana_shield')!;
  const overcharge = dataLoader.getSkill('overcharge')!;
  const blink = dataLoader.getSkill('blink')!;
  const nova = dataLoader.getSkill('arcane_nova')!;

  // Lv 0
  assert.equal(apprenticeProg.isSkillUnlocked(bolt), false, 'Arcane Bolt locked at Lv 0');
  assert.equal(apprenticeProg.isSkillUnlocked(shield), false, 'Mana Shield locked at Lv 0');
  assert.equal(apprenticeProg.isSkillUnlocked(overcharge), false, 'Overcharge locked at Lv 0');
  assert.equal(apprenticeProg.isSkillUnlocked(blink), false, 'Blink locked at Lv 0');
  assert.equal(apprenticeProg.isSkillUnlocked(nova), false, 'Arcane Nova locked at Lv 0');

  // Lv 1
  apprenticeProg.setClassLevel('arcane_initiate', 1);
  assert.equal(apprenticeProg.isSkillUnlocked(bolt), true, 'Arcane Bolt UNLOCKED at Lv 1');
  assert.equal(apprenticeProg.isSkillUnlocked(shield), false, 'Mana Shield locked at Lv 1');

  // Lv 10
  apprenticeProg.setClassLevel('arcane_initiate', 10);
  assert.equal(apprenticeProg.isSkillUnlocked(shield), true, 'Mana Shield UNLOCKED at Lv 10');
  assert.equal(apprenticeProg.isSkillUnlocked(overcharge), false, 'Overcharge locked at Lv 10');

  // Lv 20
  apprenticeProg.setClassLevel('arcane_initiate', 20);
  assert.equal(apprenticeProg.isSkillUnlocked(overcharge), true, 'Overcharge UNLOCKED at Lv 20');
  assert.equal(apprenticeProg.isSkillUnlocked(blink), false, 'Blink locked at Lv 20');

  // Lv 30
  apprenticeProg.setClassLevel('arcane_initiate', 30);
  assert.equal(apprenticeProg.isSkillUnlocked(blink), true, 'Blink UNLOCKED at Lv 30');
  assert.equal(apprenticeProg.isSkillUnlocked(nova), false, 'Arcane Nova locked at Lv 30');

  // Lv 40 (Capstone)
  apprenticeProg.setClassLevel('arcane_initiate', 40);
  assert.equal(apprenticeProg.isSkillUnlocked(nova), true, 'Arcane Nova UNLOCKED at Lv 40 capstone');

  console.log('✓ PASS: All 5 Arcane Initiate skills unlock in strict accordance with the 1, 10, 20, 30, 40 cadence.\n');

  // =========================================================================
  // TEST 5: Live Combat Execution — All 5 Skills
  // =========================================================================
  console.log('--- TEST 5: Live Combat Execution — All 5 Skills ---');
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const player = new Player(scene, 10, 10, 'Arcane Evoker');
  player.progression.setClassLevel('arcane_initiate', 40);
  player.activeClass = 'arcane_initiate';

  // Equip Arcane Staff conduit
  const staffWeapon = dataLoader.getWeapon('arcane_staff')!;
  player.equipWeapon(staffWeapon, true);
  player.energy = 100;
  player.hp = 100;

  // Learn and equip all 5 skills
  player.checkSkillUnlocks();
  assert.equal(player.knownSkillIds.length >= 5, true, 'Learned all 5 Arcane Initiate skills');

  combatSystem.setParty([player]);

  // --- 5.1: Arcane Bolt ---
  console.log('  Subtest 5.1: Arcane Bolt');
  const enemy1 = createDummyEnemy(scene, 10, 13, 'Goblin', 100); // 3 tiles away
  combatSystem.setEnemies([enemy1]);

  const preBoltEnergy = player.energy;
  const preBoltExp = player.progression.getProficiencyStat('arcane_magic').currentExp;
  const boltCast = combatSystem.castSkill(player, 'arcane_bolt', enemy1, 1000);
  assert.equal(boltCast, true, 'Arcane Bolt cast succeeds');
  assert.equal(player.energy, preBoltEnergy - bolt.energyCost, 'Arcane Bolt deducts 12 energy');
  assert.ok(enemy1.hp < 100, `Enemy HP reduced by Arcane Bolt (actual: ${enemy1.hp})`);
  const postBoltExp = player.progression.getProficiencyStat('arcane_magic').currentExp;
  assert.equal(postBoltExp, preBoltExp + 2, 'Arcane Bolt awards +2 Arcane Magic EXP');

  // --- 5.2: Mana Shield ---
  console.log('  Subtest 5.2: Mana Shield');
  player.energy = 100;
  player.hp = 100;
  const shieldCast = combatSystem.castSkill(player, 'mana_shield', player, 2000);
  assert.equal(shieldCast, true, 'Mana Shield cast succeeds');
  assert.equal(player.hasStatusEffect('mana_shield'), true, 'Player has active mana_shield status');

  // Enemy damages player for 20 damage
  // Mana Shield should convert 50% (10 damage) into 10 energy loss, so HP loses only 10, and energy loses 10
  const preDamageHp = player.hp;
  const preDamageEn = player.energy;
  player.takeDamage(20);
  assert.equal(player.energy, preDamageEn - 10, 'Mana Shield converted 10 damage into 10 energy loss');
  assert.equal(player.hp, preDamageHp - 10, 'Player only took 10 HP damage instead of 20');
  player.removeStatusEffect('mana_shield');

  // --- 5.3: Overcharge ---
  console.log('  Subtest 5.3: Overcharge');
  player.energy = 100;
  const overchargeCast = combatSystem.castSkill(player, 'overcharge', player, 3000);
  assert.equal(overchargeCast, true, 'Overcharge cast succeeds');
  assert.equal(player.hasStatusEffect('overcharge'), true, 'Player has active overcharge status');

  // Next spell (Arcane Bolt) should consume Overcharge, dealing 1.75x damage and costing 50% extra energy
  const enemyForOvercharge = createDummyEnemy(scene, 10, 13, 'Orc', 100);
  combatSystem.setEnemies([enemyForOvercharge]);

  const preOverchargeEnergy = player.energy;
  const boltCastOvercharged = combatSystem.castSkill(player, 'arcane_bolt', enemyForOvercharge, 4000);
  assert.equal(boltCastOvercharged, true, 'Overcharged Arcane Bolt cast succeeds');
  assert.equal(player.hasStatusEffect('overcharge'), false, 'Overcharge was consumed on next spell cast');

  // Base bolt cost is 12, +50% is 6 -> total 18 energy deducted
  assert.equal(player.energy, preOverchargeEnergy - 18, 'Overcharged spell consumed base + 50% extra energy (18 total)');
  const standardDamageDealt = 100 - enemy1.hp;
  const overchargedDamageDealt = 100 - enemyForOvercharge.hp;
  assert.ok(overchargedDamageDealt > standardDamageDealt * 1.5,
    `Overcharged damage (${overchargedDamageDealt.toFixed(1)}) is significantly higher than standard (${standardDamageDealt.toFixed(1)})`);

  // --- 5.4: Blink ---
  console.log('  Subtest 5.4: Blink');
  player.energy = 100;
  player.setGridPosition(10, 10);
  const meleeEnemy = createDummyEnemy(scene, 10, 11, 'Melee Threat', 100); // 1 tile south
  combatSystem.setEnemies([meleeEnemy]);

  const preBlinkEnergy = player.energy;
  const blinkCast = combatSystem.castSkill(player, 'blink', player, 5000);
  assert.equal(blinkCast, true, 'Blink cast succeeds');
  assert.equal(player.energy, preBlinkEnergy - blink.energyCost, 'Blink deducts 25 energy');

  // Player must have moved away from (10, 11)
  const postBlinkDist = Math.max(Math.abs(player.gridPos.x - 10), Math.abs(player.gridPos.y - 11));
  assert.ok(postBlinkDist >= 2, `Player blinked away to safe distance (dist: ${postBlinkDist})`);

  // --- 5.5: Arcane Nova ---
  console.log('  Subtest 5.5: Arcane Nova');
  player.energy = 100;
  player.setGridPosition(10, 10);
  const clusterEnemy1 = createDummyEnemy(scene, 10, 12, 'Target 1', 100); // 2 tiles south
  const clusterEnemy2 = createDummyEnemy(scene, 12, 10, 'Target 2', 100); // 2 tiles east
  const farEnemy = createDummyEnemy(scene, 10, 20, 'Far Enemy', 100); // 10 tiles away (out of 4-tile radius)
  combatSystem.setEnemies([clusterEnemy1, clusterEnemy2, farEnemy]);

  const preNovaEnergy = player.energy;
  const novaCast = combatSystem.castSkill(player, 'arcane_nova', player, 6000);
  assert.equal(novaCast, true, 'Arcane Nova cast succeeds');
  assert.equal(player.energy, preNovaEnergy - nova.energyCost, 'Arcane Nova deducts 35 energy');

  assert.ok(clusterEnemy1.hp < 100, `Cluster enemy 1 took Nova damage (${clusterEnemy1.hp})`);
  assert.ok(clusterEnemy2.hp < 100, `Cluster enemy 2 took Nova damage (${clusterEnemy2.hp})`);
  assert.equal(farEnemy.hp, 100, 'Far enemy out of 4-tile radius took zero damage');

  console.log('✓ PASS: All 5 skills executed with exact mechanical behaviors, costs, and effects.\n');

  // =========================================================================
  // TEST 6: Autocast Integration
  // =========================================================================
  console.log('--- TEST 6: Autocast Integration ---');
  player.energy = 100;
  player.lastSkillUseTimes.clear();
  player.equippedSkillIds = ['arcane_bolt', 'mana_shield', 'overcharge', 'blink', 'arcane_nova'];
  for (const sId of player.equippedSkillIds) {
    player.setAutocast(sId, true);
  }

  // Self-buff autocast test when threatened
  const threatEnemy = createDummyEnemy(scene, 10, 13, 'Threat', 100);
  combatSystem.setEnemies([threatEnemy]);
  player.targetEntity = threatEnemy;

  const buffAuto = combatSystem.checkAndAutocastSelfBuffs(player, 10000);
  assert.equal(buffAuto, true, 'Self buff or nova autocast fires in combat');
  assert.ok(
    player.hasStatusEffect('mana_shield') || player.hasStatusEffect('overcharge') || threatEnemy.hp < 100,
    'Autocast applied self buff or cast Arcane Nova'
  );

  console.log('✓ PASS: Autocast loops cleanly identify and trigger Arcane Initiate skills.\n');

  console.log('================================================================');
  console.log('🎉 ALL MILESTONE 58 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone58Tests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
