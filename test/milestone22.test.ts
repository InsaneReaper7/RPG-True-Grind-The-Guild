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

// Setup mock fetch for node testing
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
import type { WeaponDef, EnemyDef, SkillDef } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };
import weaponsData from '../data/weapons.json' with { type: 'json' };
import skillsData from '../data/skills.json' with { type: 'json' };
import statusEffectsData from '../data/statusEffects.json' with { type: 'json' };

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem,
  activeClass: string = 'fencer'
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const lastSkillUseTimes = new Map<string, number>();
  const autocastMap = new Map<string, boolean>();

  const player = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp: 100,
    maxHp: 100,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    mood: 80,
    state: 'idle',
    activeClass,
    equippedWeapon: weapon,
    offhandWeapon: null as WeaponDef | null,
    targetEntity: null as any,
    lastAttackTime: 0,
    attackRangeTiles: 1,
    progression,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    autocastMap,
    lastSkillUseTimes,
    activeStatusEffects: statusEffects,
    bookLearnedSkills: new Set<string>(),

    isDualWielding: () => false,
    hasShield: () => false,
    isSkillLearnedFromBook: (skillId: string) => player.bookLearnedSkills.has(skillId),
    isAutocastEnabled: (skillId: string) => {
      if (!player.autocastMap.has(skillId)) return true;
      return player.autocastMap.get(skillId) === true;
    },
    hasStatusEffect: (id: string) => player.activeStatusEffects.has(id),
    getStatusEffect: (id: string) => player.activeStatusEffects.get(id),
    applyStatusEffect: (effect: any) => {
      player.activeStatusEffects.set(effect.id, {
        effect,
        remainingMs: effect.durationMs,
        appliedAt: Date.now()
      });
    },
    removeStatusEffect: (id: string) => player.activeStatusEffects.delete(id),
    setGridPosition: (gx: number, gy: number) => {
      player.gridPos = { x: gx, y: gy };
      player.x = gx * tileSize + tileSize / 2;
      player.y = gy * tileSize + tileSize / 2;
    },
    isMoving: () => false,
    stopMovement: () => {},
    clearTarget: () => { player.targetEntity = null; },
    takeDamage: (amount: number) => {
      player.hp = Math.max(0, player.hp - amount);
      return player.hp <= 0;
    },
    heal: (amount: number) => {
      const old = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + amount);
      return player.hp - old;
    }
  };

  return player;
}

function createMockEnemy(id: string, name: string, x: number, y: number, hp: number = 80): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const enemyDef: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'tier1',
    hp,
    criticalHpMax: 20,
    meleeDamage: 8,
    aggroRadius: 5,
    attackIntervalMs: 1500
  };

  const enemy = {
    id,
    entityName: name,
    enemyData: enemyDef,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 20,
    maxCriticalHp: 20,
    state: 'idle',
    isAggroed: true,
    targetEntity: null as any,
    lastAttackTime: 0,
    lastRepathTimeMs: 0,
    repathIntervalMs: 1000,
    maxLeashDistance: 10,
    spawnPos: { x, y },
    activeStatusEffects: statusEffects,

    hasStatusEffect: (effId: string) => enemy.activeStatusEffects.has(effId),
    getStatusEffect: (effId: string) => enemy.activeStatusEffects.get(effId),
    applyStatusEffect: (effect: any) => {
      enemy.activeStatusEffects.set(effect.id, {
        effect,
        remainingMs: effect.durationMs,
        appliedAt: Date.now()
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

function createMockScene(): any {
  return {
    time: { now: 1000 },
    events: { emit: () => {} },
    tweens: { add: () => {} },
    add: {
      graphics: () => ({ lineStyle: () => {}, lineBetween: () => {}, destroy: () => {} }),
      text: () => ({ setOrigin: () => ({ setDepth: () => ({ setAlpha: () => {} }) }), destroy: () => {} }),
      circle: () => ({ setDepth: () => ({ destroy: () => {} }) }),
      line: () => { const l: any = new Proxy({}, { get: () => () => l }); return l; }
    }
  };
}

async function runMilestone22Tests() {
  console.log('=== RUNNING MILESTONE 22: COMPLETE FENCER KIT TESTS ===\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const dataLoader = DataLoader.getInstance();
  const shortSwords = weaponsData.weapons.find((w: any) => w.id === 'short_swords') as WeaponDef;

  // ============================================================================
  // TEST 1: Schema & Unlock Requirement Verification
  // ============================================================================
  console.log('--- TEST 1: Fencer 5-Skill Kit Schema & Requirements ---');
  {
    const powerStrike = dataLoader.getSkill('power_strike')!;
    const thrust = dataLoader.getSkill('thrust')!;
    const riposte = dataLoader.getSkill('riposte')!;
    const fleche = dataLoader.getSkill('fleche')!;
    const bladeDance = dataLoader.getSkill('blade_dance')!;

    assert.ok(powerStrike, 'Power Strike must exist');
    assert.ok(thrust, 'Thrust must exist');
    assert.ok(riposte, 'Riposte must exist');
    assert.ok(fleche, 'Fleche must exist');
    assert.ok(bladeDance, 'Blade Dance must exist');

    // Requirements check: 1, 10, 20, 30, 40
    assert.equal(powerStrike.requirements[0].value, 1, 'Power Strike unlocks at Fencer Lv 1');
    assert.equal(thrust.requirements[0].value, 10, 'Thrust unlocks at Fencer Lv 10');
    assert.equal(riposte.requirements[0].value, 20, 'Riposte unlocks at Fencer Lv 20');
    assert.equal(fleche.requirements[0].value, 30, 'Fleche unlocks at Fencer Lv 30');
    assert.equal(bladeDance.requirements[0].value, 40, 'Blade Dance unlocks at Fencer Lv 40');

    // Specs verification
    assert.equal(thrust.energyCost, 20, 'Thrust costs 20 EN');
    assert.equal(thrust.cooldownMs, 3000, 'Thrust cooldown is 3000ms');
    assert.equal(thrust.accuracyBonus, 0.3, 'Thrust has +30% accuracy bonus');

    assert.equal(riposte.energyCost, 15, 'Riposte costs 15 EN');
    assert.equal(riposte.cooldownMs, 4000, 'Riposte cooldown is 4000ms');
    assert.equal(riposte.damageMultiplier, 1.8, 'Riposte deals 180% damage');

    assert.equal(fleche.energyCost, 25, 'Fleche costs 25 EN');
    assert.equal(fleche.cooldownMs, 8000, 'Fleche cooldown is 8000ms');
    assert.equal(fleche.rangeTiles, 5, 'Fleche range is 5 tiles');

    assert.equal(bladeDance.energyCost, 35, 'Blade Dance costs 35 EN');
    assert.equal(bladeDance.cooldownMs, 15000, 'Blade Dance cooldown is 15000ms');
    assert.equal(bladeDance.strikeCount, 4, 'Blade Dance delivers 4 strikes');
    assert.equal(bladeDance.damagePerHitMultiplier, 0.8, 'Blade Dance deals 80% damage per strike');

    const riposteEffect = dataLoader.getStatusEffect('riposte_window');
    assert.ok(riposteEffect, 'riposte_window status effect exists in statusEffects.json');
    assert.equal(riposteEffect?.durationMs, 3000, 'riposte_window duration is 3000ms');

    console.log('✓ PASS: All 5 Fencer skills correctly configured in skills.json with 1/10/20/30/40 unlocks.');
  }

  // ============================================================================
  // TEST 2: Grandfather Rule for Thrust vs Fresh Leveling Threshold
  // ============================================================================
  console.log('\n--- TEST 2: Thrust Grandfather Rule vs Fresh Leveling ---');
  {
    const thrustDef = dataLoader.getSkill('thrust')!;

    // Scenario A: Existing character sitting at Fencer Lv 3 who already knows Thrust
    const progA = new ProgressionSystem(classesData, 'HeroA');
    progA.setClassLevel('fencer', 3);
    const playerA = createMockPlayer('heroA', 'Hero A', 10, 10, shortSwords, progA);
    playerA.knownSkillIds = ['power_strike', 'thrust'];

    assert.equal(
      progA.isSkillUnlocked(thrustDef, playerA),
      true,
      'Grandfathered character (Fencer Lv 3 with Thrust already known) retains Thrust unlock'
    );

    // Scenario B: Character sitting at Fencer Lv 3 who does NOT already know Thrust
    const progB = new ProgressionSystem(classesData, 'HeroB');
    progB.setClassLevel('fencer', 3);
    const playerB = createMockPlayer('heroB', 'Hero B', 10, 10, shortSwords, progB);
    playerB.knownSkillIds = ['power_strike'];

    assert.equal(
      progB.isSkillUnlocked(thrustDef, playerB),
      false,
      'Fresh character sitting at Fencer Lv 3 without Thrust does NOT unlock Thrust'
    );

    // Scenario C: Leveling character B to Fencer Lv 10 unlocks Thrust fresh
    progB.setClassLevel('fencer', 10);
    assert.equal(
      progB.isSkillUnlocked(thrustDef, playerB),
      true,
      'Character B reaching Fencer Lv 10 successfully unlocks Thrust'
    );

    console.log('✓ PASS: Grandfather rule preserves Thrust for existing characters; fresh characters require Fencer Lv 10.');
  }

  // ============================================================================
  // TEST 3: Progressive Kit Unlocks at 1 / 10 / 20 / 30 / 40
  // ============================================================================
  console.log('\n--- TEST 3: Progressive Kit Unlocks at 1 / 10 / 20 / 30 / 40 ---');
  {
    const powerStrike = dataLoader.getSkill('power_strike')!;
    const thrust = dataLoader.getSkill('thrust')!;
    const riposte = dataLoader.getSkill('riposte')!;
    const fleche = dataLoader.getSkill('fleche')!;
    const bladeDance = dataLoader.getSkill('blade_dance')!;

    const prog = new ProgressionSystem(classesData, 'FencerTest');
    const player = createMockPlayer('fencer1', 'Fencer', 10, 10, shortSwords, prog);

    // At Lv 1
    prog.setClassLevel('fencer', 1);
    assert.equal(prog.isSkillUnlocked(powerStrike, player), true, 'Power Strike unlocked at Lv 1');
    assert.equal(prog.isSkillUnlocked(thrust, player), false, 'Thrust locked at Lv 1');
    assert.equal(prog.isSkillUnlocked(riposte, player), false, 'Riposte locked at Lv 1');
    assert.equal(prog.isSkillUnlocked(fleche, player), false, 'Fleche locked at Lv 1');
    assert.equal(prog.isSkillUnlocked(bladeDance, player), false, 'Blade Dance locked at Lv 1');

    // At Lv 10
    prog.setClassLevel('fencer', 10);
    assert.equal(prog.isSkillUnlocked(thrust, player), true, 'Thrust unlocked at Lv 10');
    assert.equal(prog.isSkillUnlocked(riposte, player), false, 'Riposte locked at Lv 10');

    // At Lv 20
    prog.setClassLevel('fencer', 20);
    assert.equal(prog.isSkillUnlocked(riposte, player), true, 'Riposte unlocked at Lv 20');
    assert.equal(prog.isSkillUnlocked(fleche, player), false, 'Fleche locked at Lv 20');

    // At Lv 30
    prog.setClassLevel('fencer', 30);
    assert.equal(prog.isSkillUnlocked(fleche, player), true, 'Fleche unlocked at Lv 30');
    assert.equal(prog.isSkillUnlocked(bladeDance, player), false, 'Blade Dance locked at Lv 30');

    // At Lv 40
    prog.setClassLevel('fencer', 40);
    assert.equal(prog.isSkillUnlocked(bladeDance, player), true, 'Blade Dance unlocked at Lv 40');

    console.log('✓ PASS: Fencer kit unlocks progressively at Lv 1, 10, 20, 30, 40.');
  }

  // ============================================================================
  // TEST 4: Riposte Evade/Parry Proc Window Gating & Execution
  // ============================================================================
  console.log('\n--- TEST 4: Riposte Evade/Parry Proc Window Gating & Execution ---');
  {
    const prog = new ProgressionSystem(classesData, 'Duelist');
    prog.setClassLevel('fencer', 20);
    const player = createMockPlayer('duelist', 'Duelist', 10, 10, shortSwords, prog);
    player.knownSkillIds = ['power_strike', 'thrust', 'riposte'];
    player.equippedSkillIds = ['power_strike', 'thrust', 'riposte'];

    const enemy = createMockEnemy('orc', 'Orc Warrior', 10, 11, 100);
    const scene = createMockScene();
    const bigGrid: number[][] = []; for(let r=0;r<25;r++) bigGrid.push(new Array(25).fill(0));
    const pathfinder = new Pathfinder(bigGrid);
    const combat = new CombatSystem(scene, [player], [enemy], pathfinder);

    // 1. Cast without prior evade/parry proc -> must fail
    const castWithoutWindow = combat.castSkill(player, 'riposte', enemy);
    assert.equal(castWithoutWindow, false, 'Riposte cast must fail when riposte window is not active');
    assert.equal(player.energy, 100, 'Energy not deducted on failed cast');

    // 2. Open riposte window via Evade/Parry hook
    combat.openRiposteWindow(player, enemy);
    assert.equal(player.hasStatusEffect('riposte_window'), true, 'Player has riposte_window status buff');

    // 3. Cast Riposte inside window -> succeeds, deals counterattack damage, consumes buff
    const enemyHpBefore = enemy.hp;
    const castWithWindow = combat.castSkill(player, 'riposte', enemy);
    assert.equal(castWithWindow, true, 'Riposte cast succeeds while riposte_window is active');
    assert.equal(player.energy, 85, 'Riposte consumed 15 Energy');
    assert.equal(player.hasStatusEffect('riposte_window'), false, 'riposte_window buff is consumed immediately upon cast');
    assert.ok(enemy.hp < enemyHpBefore, 'Enemy took counterattack damage from Riposte');

    // 4. Try casting Riposte again immediately -> must fail
    const castAfterConsumed = combat.castSkill(player, 'riposte', enemy);
    assert.equal(castAfterConsumed, false, 'Riposte cannot be cast again after window is consumed');

    console.log('✓ PASS: Riposte strictly requires active evade/parry window and consumes it on execution.');
  }

  // ============================================================================
  // TEST 5: Fleche Gap-Closing Dash-Strike
  // ============================================================================
  console.log('\n--- TEST 5: Fleche Gap-Closing Dash-Strike ---');
  {
    const prog = new ProgressionSystem(classesData, 'FencerFleche');
    prog.setClassLevel('fencer', 30);
    const player = createMockPlayer('fencer', 'Fencer', 10, 10, shortSwords, prog);
    player.knownSkillIds = ['fleche'];
    player.equippedSkillIds = ['fleche'];

    // Place enemy 4 tiles away (10, 14), well outside 1-tile melee range
    const enemy = createMockEnemy('goblin', 'Goblin', 10, 14, 100);
    const scene = createMockScene();
    const bigGrid: number[][] = []; for(let r=0;r<25;r++) bigGrid.push(new Array(25).fill(0));
    const pathfinder = new Pathfinder(bigGrid);
    const combat = new CombatSystem(scene, [player], [enemy], pathfinder);

    const enemyHpBefore = enemy.hp;

    // Cast Fleche from 4 tiles away
    const castSuccess = combat.castSkill(player, 'fleche', enemy);
    assert.equal(castSuccess, true, 'Fleche successfully cast from 4 tiles away');
    assert.equal(player.energy, 75, 'Fleche consumed 25 Energy');

    // Distance to enemy must now be 1 tile (adjacent on arrival)
    const distAfter = Math.max(
      Math.abs(player.gridPos.x - enemy.gridPos.x),
      Math.abs(player.gridPos.y - enemy.gridPos.y)
    );
    assert.equal(distAfter, 1, 'Player dashed adjacent to target (distance is now 1 tile)');
    assert.ok(enemy.hp < enemyHpBefore, 'Enemy took Fleche damage on arrival');

    // Reset position to test out-of-range (> 5 tiles)
    player.setGridPosition(5, 5);
    player.energy = 100;
    player.lastSkillUseTimes.clear();
    const distantEnemy = createMockEnemy('distant', 'Distant Goblin', 15, 15, 100); // 10 tiles away
    const outOfRangeCast = combat.castSkill(player, 'fleche', distantEnemy);
    assert.equal(outOfRangeCast, false, 'Fleche cast fails when enemy is beyond max range (5 tiles)');

    console.log('✓ PASS: Fleche instantly closes distance up to 5 tiles and deals damage on arrival.');
  }

  // ============================================================================
  // TEST 6: Blade Dance Multi-Hit & Early Termination Mid-Combo
  // ============================================================================
  console.log('\n--- TEST 6: Blade Dance Multi-Hit & Early Termination ---');
  {
    const prog = new ProgressionSystem(classesData, 'FencerMaster');
    prog.setClassLevel('fencer', 40);
    const player = createMockPlayer('master', 'Master Duelist', 10, 10, shortSwords, prog);
    player.knownSkillIds = ['blade_dance'];
    player.equippedSkillIds = ['blade_dance'];

    const scene = createMockScene();
    const bigGrid: number[][] = []; for(let r=0;r<25;r++) bigGrid.push(new Array(25).fill(0));
    const pathfinder = new Pathfinder(bigGrid);

    // Case A: High-HP enemy takes full 4 strikes
    const beefyEnemy = createMockEnemy('boss', 'Boss Golem', 10, 11, 500);
    const combatA = new CombatSystem(scene, [player], [beefyEnemy], pathfinder);

    let hitsReceived = 0;
    const origTakeDamage = beefyEnemy.takeDamage;
    beefyEnemy.takeDamage = (dmg: number) => {
      hitsReceived++;
      return origTakeDamage(dmg);
    };

    const castSuccessA = combatA.castSkill(player, 'blade_dance', beefyEnemy);
    assert.equal(castSuccessA, true, 'Blade Dance successfully cast on adjacent enemy');
    assert.equal(player.energy, 65, 'Blade Dance consumed 35 Energy');
    assert.equal(hitsReceived, 4, 'Blade Dance delivered exactly 4 distinct strikes to beefy target');

    // Case B: Low-HP enemy dies on hit 2 -> terminates early
    player.energy = 100;
    player.lastSkillUseTimes.clear();
    const frailEnemy = createMockEnemy('rat', 'Giant Rat', 10, 11, 6); // 4 dmg/hit -> dies on hit 2
    let frailHitsReceived = 0;
    frailEnemy.takeDamage = (dmg: number) => {
      frailHitsReceived++;
      frailEnemy.hp = Math.max(0, frailEnemy.hp - dmg);
      if (frailEnemy.hp <= 0) {
        frailEnemy.state = 'dead';
        return true;
      }
      return false;
    };

    const castSuccessB = combatA.castSkill(player, 'blade_dance', frailEnemy);
    assert.equal(castSuccessB, true, 'Blade Dance cast against frail enemy');
    assert.ok(frailHitsReceived < 4, `Combo cleanly terminated early upon death (received ${frailHitsReceived} hits instead of 4)`);
    assert.equal(frailEnemy.state, 'dead', 'Frail enemy was killed mid-combo');

    console.log('✓ PASS: Blade Dance delivers 4 distinct hits and cleanly terminates combo if target dies.');
  }

  // ============================================================================
  // TEST 7: Autocast Rotation Integration
  // ============================================================================
  console.log('\n--- TEST 7: Autocast Rotation Integration ---');
  {
    const prog = new ProgressionSystem(classesData, 'FencerRot');
    prog.setClassLevel('fencer', 40);
    const player = createMockPlayer('fencerRot', 'Rotation Fencer', 10, 10, shortSwords, prog);
    player.knownSkillIds = ['power_strike', 'thrust', 'riposte', 'fleche', 'blade_dance'];
    player.equippedSkillIds = ['power_strike', 'thrust', 'riposte', 'fleche', 'blade_dance'];

    const enemy = createMockEnemy('target', 'Training Dummy', 10, 13, 300); // 3 tiles away
    player.targetEntity = enemy;

    const scene = createMockScene();
    const bigGrid: number[][] = []; for(let r=0;r<25;r++) bigGrid.push(new Array(25).fill(0));
    const pathfinder = new Pathfinder(bigGrid);
    const combat = new CombatSystem(scene, [player], [enemy], pathfinder);

    // Step 1: At distance 3, autocast loop activates Fleche as approach gap-closer
    combat.update(1000, 16);
    const distAfterApproach = Math.max(
      Math.abs(player.gridPos.x - enemy.gridPos.x),
      Math.abs(player.gridPos.y - enemy.gridPos.y)
    );
    assert.equal(distAfterApproach, 1, 'Autocast successfully fired Fleche to close distance from 3 tiles to 1');

    console.log('✓ PASS: Autocast rotation correctly utilizes Fleche gap-closer on approach.');
  }

  console.log('\n=== ALL MILESTONE 22 TESTS PASSED SUCCESSFULLY! ===\n');
}

runMilestone22Tests().catch((err) => {
  console.error('UNIT TEST FAILED:', err);
  process.exit(1);
});
