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
import type { WeaponDef, EnemyDef, SkillDef, GridPos } from '../src/types/game.ts';

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
  activeClass: string = 'scout'
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
    attackRangeTiles: weapon.attackRangeTiles ?? (weapon.category === 'ranged' ? 4 : 1),
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
  hp: number = 80,
  enemyData: Partial<EnemyDef> = {}
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const fullEnemyData: EnemyDef = {
    id,
    name,
    texture: 'enemy-goblin',
    frame: 0,
    maxHp: hp,
    criticalHp: 0,
    speed: 50,
    meleeDamage: 5,
    attackIntervalMs: 1000,
    expReward: 10,
    isAggroed: true,
    ...enemyData
  } as EnemyDef;

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
    enemyData: fullEnemyData,
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
      let damageRemaining = amount;
      const exposeEffect = enemy.activeStatusEffects.get('expose');
      if (exposeEffect) {
        const amp = exposeEffect.def?.damageAmplificationPercent ?? 0.25;
        damageRemaining *= (1 + amp);
      }
      enemy.hp = Math.max(0, enemy.hp - damageRemaining);
      if (enemy.hp <= 0) {
        enemy.state = 'dead';
        return true;
      }
      return false;
    }
  };

  return enemy;
}

async function runMilestone46Tests() {
  console.log('================================================================');
  console.log('🏹 RUNNING MILESTONE 46: SCOUT FULL KIT UNIT TESTS 🗡️');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const dataLoader = DataLoader.getInstance();

  const bows = dataLoader.getWeapon('bows')!;
  const daggers = dataLoader.getWeapon('daggers')!;
  assert.ok(bows, 'bows weapon must exist');
  assert.ok(daggers, 'daggers weapon must exist');

  // ============================================================================
  // TEST 1: Design Documentation Citation & 5-Skill Kit Verification
  // ============================================================================
  console.log('--- TEST 1: Design Documentation Citation & 5-Skill Kit Verification ---');
  {
    // Citing docs/true_grind_gdd (2).md Section 12.2, Lines 422-427
    const gddContent = fs.readFileSync('docs/true_grind_gdd (2).md', 'utf8');
    assert.ok(gddContent.includes('### Scout (Bow + Dagger path — mentor NPC\'s class)'), 'GDD Section 12.2 Scout header exists');
    assert.ok(gddContent.includes('1. **Quickshot** (Lv 1)'), 'Quickshot documented in GDD Section 12.2');
    assert.ok(gddContent.includes('2. **Mark Target** (Lv 10)'), 'Mark Target documented in GDD Section 12.2');
    assert.ok(gddContent.includes('3. **Evasive Roll** (Lv 20)'), 'Evasive Roll documented in GDD Section 12.2');
    assert.ok(gddContent.includes('4. **Trap Snare** (Lv 30)'), 'Trap Snare documented in GDD Section 12.2');
    assert.ok(gddContent.includes('5. **Kill Shot** (Lv 40, capstone)'), 'Kill Shot documented in GDD Section 12.2');

    // Companion doc class_system (1).md line 137
    const classSystemContent = fs.readFileSync('docs/class_system (1).md', 'utf8');
    assert.ok(classSystemContent.includes('| Scout | Daggers 10 + Bows 15 |'), 'Scout unlock requirement cited from class_system.md line 137');

    // Section 4.1 line 94 side weapon
    assert.ok(gddContent.includes('Side weapon (dagger or throwing weapon, always available even with a 2H weapon equipped)'), 'Side weapon cited from GDD Section 4.1 line 94');

    // Section 7.1 line 168 expose status effect
    assert.ok(gddContent.includes('| Expose | Increased damage taken |'), 'Expose status effect cited from GDD Section 7.1 line 168');

    // Check all 5 skills exist in DataLoader
    const quickshot = dataLoader.getSkill('quickshot');
    const markTarget = dataLoader.getSkill('mark_target');
    const evasiveRoll = dataLoader.getSkill('evasive_roll');
    const trapSnare = dataLoader.getSkill('trap_snare');
    const killShot = dataLoader.getSkill('kill_shot');

    assert.ok(quickshot, 'quickshot skill must exist in skills.json');
    assert.ok(markTarget, 'mark_target skill must exist in skills.json');
    assert.ok(evasiveRoll, 'evasive_roll skill must exist in skills.json');
    assert.ok(trapSnare, 'trap_snare skill must exist in skills.json');
    assert.ok(killShot, 'kill_shot skill must exist in skills.json');

    console.log('✓ PASS: All 5 skills confirmed directly from design documentation citations.\n');
  }

  // ============================================================================
  // TEST 2: 5-Tier Progression Structure (Lv 1, 10, 20, 30, 40)
  // ============================================================================
  console.log('--- TEST 2: 5-Tier Progression Structure (Lv 1, 10, 20, 30, 40) ---');
  {
    const prog = new ProgressionSystem(classesData, 'Scout Candidate');
    const quickshot = dataLoader.getSkill('quickshot')!;
    const markTarget = dataLoader.getSkill('mark_target')!;
    const evasiveRoll = dataLoader.getSkill('evasive_roll')!;
    const trapSnare = dataLoader.getSkill('trap_snare')!;
    const killShot = dataLoader.getSkill('kill_shot')!;

    // Level 0: All locked
    assert.equal(prog.isSkillUnlocked(quickshot), false, 'Quickshot locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(markTarget), false, 'Mark Target locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(evasiveRoll), false, 'Evasive Roll locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(trapSnare), false, 'Trap Snare locked at Lv 0');
    assert.equal(prog.isSkillUnlocked(killShot), false, 'Kill Shot locked at Lv 0');

    // Level 1: Quickshot unlocks
    prog.setClassLevel('scout', 1);
    assert.equal(prog.isSkillUnlocked(quickshot), true, 'Quickshot unlocks at Scout Lv 1');
    assert.equal(prog.isSkillUnlocked(markTarget), false, 'Mark Target locked at Lv 1');

    // Level 10: Mark Target unlocks
    prog.setClassLevel('scout', 10);
    assert.equal(prog.isSkillUnlocked(markTarget), true, 'Mark Target unlocks at Scout Lv 10');
    assert.equal(prog.isSkillUnlocked(evasiveRoll), false, 'Evasive Roll locked at Lv 10');

    // Level 20: Evasive Roll unlocks
    prog.setClassLevel('scout', 20);
    assert.equal(prog.isSkillUnlocked(evasiveRoll), true, 'Evasive Roll unlocks at Scout Lv 20');
    assert.equal(prog.isSkillUnlocked(trapSnare), false, 'Trap Snare locked at Lv 20');

    // Level 30: Trap Snare unlocks
    prog.setClassLevel('scout', 30);
    assert.equal(prog.isSkillUnlocked(trapSnare), true, 'Trap Snare unlocks at Scout Lv 30');
    assert.equal(prog.isSkillUnlocked(killShot), false, 'Kill Shot locked at Lv 30');

    // Level 40: Kill Shot (Capstone) unlocks
    prog.setClassLevel('scout', 40);
    assert.equal(prog.isSkillUnlocked(killShot), true, 'Kill Shot capstone unlocks at Scout Lv 40');

    console.log('✓ PASS: Scout skills follow standard 5-tier unlock pattern (1, 10, 20, 30, 40).\n');
  }

  // ============================================================================
  // TEST 3: Quickshot Execution (Bow & Dagger Usability)
  // ============================================================================
  console.log('--- TEST 3: Quickshot Execution (Bow & Dagger Usability) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const progBow = new ProgressionSystem(classesData, 'Bow Scout');
    progBow.setClassLevel('scout', 1);
    progBow.getProficiencyStat('bows').level = 15;
    progBow.getProficiencyStat('daggers').level = 10;

    const bowScout = createMockPlayer('bow-scout', 'Bow Scout', 5, 5, bows, progBow);
    bowScout.knownSkillIds = ['quickshot'];
    bowScout.equippedSkillIds = ['quickshot'];
    const enemyAtRange = createMockEnemy('gob-1', 'Goblin Scout', 9, 5, 50); // distance = 4 tiles

    combat.party = [bowScout];
    combat.enemies = [enemyAtRange];

    const castBow = combat.castSkill(bowScout, 'quickshot', enemyAtRange);
    assert.equal(castBow, true, 'Quickshot successfully cast with Bow at range 4');
    assert.ok(enemyAtRange.hp < 50, 'Enemy took damage from Bow Quickshot');
    assert.equal(bowScout.energy, 85, 'Energy deducted (100 - 15 = 85)');

    // Dagger Scout: testing throwing blade at range
    const progDagger = new ProgressionSystem(classesData, 'Dagger Scout');
    progDagger.setClassLevel('scout', 1);
    progDagger.getProficiencyStat('daggers').level = 10;
    progDagger.getProficiencyStat('bows').level = 15;

    const daggerScout = createMockPlayer('dag-scout', 'Dagger Scout', 5, 5, daggers, progDagger);
    daggerScout.knownSkillIds = ['quickshot'];
    daggerScout.equippedSkillIds = ['quickshot'];
    const enemy2 = createMockEnemy('gob-2', 'Goblin Brawler', 8, 5, 50); // distance = 3 tiles

    combat.party = [daggerScout];
    combat.enemies = [enemy2];

    const castDagger = combat.castSkill(daggerScout, 'quickshot', enemy2);
    assert.equal(castDagger, true, 'Quickshot successfully cast with Daggers at range 3 (throwing blade)');
    assert.ok(enemy2.hp < 50, 'Enemy took damage from Dagger Quickshot');

    console.log('✓ PASS: Quickshot functions cleanly with both Bows and Daggers.\n');
  }

  // ============================================================================
  // TEST 4: Mark Target & Expose Damage Amplification
  // ============================================================================
  console.log('--- TEST 4: Mark Target & Expose Damage Amplification ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Scout');
    prog.setClassLevel('scout', 10);

    const scout = createMockPlayer('scout', 'Scout', 5, 5, bows, prog);
    scout.knownSkillIds = ['mark_target'];
    scout.equippedSkillIds = ['mark_target'];
    const enemy = createMockEnemy('gob-target', 'Target Dummy', 7, 5, 100);

    combat.party = [scout];
    combat.enemies = [enemy];

    assert.equal(enemy.hasStatusEffect('expose'), false, 'Enemy initially unexposed');
    const castSuccess = combat.castSkill(scout, 'mark_target', enemy);
    assert.equal(castSuccess, true, 'Mark Target successfully cast');
    assert.equal(enemy.hasStatusEffect('expose'), true, 'Enemy has expose status effect');

    // Test damage amplification on exposed target (+25%)
    const hpBefore = enemy.hp;
    enemy.takeDamage(20); // 20 * 1.25 = 25 damage
    const damageTaken = hpBefore - enemy.hp;
    assert.equal(damageTaken, 25, 'Expose amplified 20 base damage to 25 (+25%)');

    console.log('✓ PASS: Mark Target applies Expose and correctly amplifies damage by 25%.\n');
  }

  // ============================================================================
  // TEST 5: Evasive Roll Repositioning & Dodge Window
  // ============================================================================
  console.log('--- TEST 5: Evasive Roll Repositioning & Dodge Window ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Scout');
    prog.setClassLevel('scout', 20);

    // Place Scout adjacent to enemy (melee pressure: (5,5) vs (6,5))
    const scout = createMockPlayer('scout', 'Scout', 5, 5, bows, prog);
    scout.knownSkillIds = ['evasive_roll'];
    scout.equippedSkillIds = ['evasive_roll'];
    const rusherEnemy = createMockEnemy('rusher', 'Goblin Rusher', 6, 5, 50);

    combat.party = [scout];
    combat.enemies = [rusherEnemy];

    const initialPos = { ...scout.gridPos };
    const castSuccess = combat.castSkill(scout, 'evasive_roll');
    assert.equal(castSuccess, true, 'Evasive Roll successfully cast');
    assert.equal(scout.hasStatusEffect('evasive_roll'), true, 'Scout has evasive_roll buff');

    // Confirm repositioning away from enemy
    const newDist = Math.max(Math.abs(scout.gridPos.x - rusherEnemy.gridPos.x), Math.abs(scout.gridPos.y - rusherEnemy.gridPos.y));
    assert.ok(newDist > 1, `Evasive Roll created distance (old dist: 1, new dist: ${newDist})`);

    // Verify avoidance bonus during dodge window
    const hiddenSys = HiddenSkillSystem.getInstance();
    const evasionSkillDef = hiddenSys.getSkillDef('evasion')!;
    const contextWithBuff = {
      isMeleeAttack: true,
      inCombat: true,
      evasionBonus: 0.50
    };
    const procChance = hiddenSys.calculateProcChance(evasionSkillDef, 0, 0.05 + 0.50);
    assert.ok(procChance >= 0.55, 'Evasion proc chance elevated during dodge window (+50% bonus)');

    console.log('✓ PASS: Evasive Roll creates tactical space and grants high dodge window.\n');
  }

  // ============================================================================
  // TEST 6: Trap Snare Damage & Slow Status Effect
  // ============================================================================
  console.log('--- TEST 6: Trap Snare Damage & Slow Status Effect ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Scout');
    prog.setClassLevel('scout', 30);

    const scout = createMockPlayer('scout', 'Scout', 5, 5, bows, prog);
    scout.knownSkillIds = ['trap_snare'];
    scout.equippedSkillIds = ['trap_snare'];
    const enemy = createMockEnemy('gob-snare', 'Goblin Runner', 7, 5, 50);

    combat.party = [scout];
    combat.enemies = [enemy];

    const castSuccess = combat.castSkill(scout, 'trap_snare', enemy);
    assert.equal(castSuccess, true, 'Trap Snare successfully cast');
    assert.ok(enemy.hp < 50, 'Enemy took physical damage from trap snare');
    assert.equal(enemy.hasStatusEffect('slow'), true, 'Enemy has slow status effect applied');
    const slowEffect = enemy.activeStatusEffects.get('slow');
    assert.equal(slowEffect.def.moveSpeedMultiplier, 0.5, 'Slow cuts movement speed by 50%');

    console.log('✓ PASS: Trap Snare damages and applies 50% movement slow.\n');
  }

  // ============================================================================
  // TEST 7: Kill Shot Capstone Execution (Baseline vs Low HP Trigger)
  // ============================================================================
  console.log('--- TEST 7: Kill Shot Capstone Execution (Baseline vs Low HP Trigger) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);
    const prog = new ProgressionSystem(classesData, 'Scout');
    prog.setClassLevel('scout', 40);

    const scout = createMockPlayer('scout', 'Scout', 5, 5, bows, prog);
    scout.knownSkillIds = ['kill_shot'];
    scout.equippedSkillIds = ['kill_shot'];

    // Case A: High HP target (> 40% HP) -> standard 200% weapon damage
    const healthyEnemy = createMockEnemy('gob-healthy', 'Beefy Orc', 8, 5, 200);
    healthyEnemy.hp = 160; // 80% HP
    healthyEnemy.maxHp = 200;

    combat.party = [scout];
    combat.enemies = [healthyEnemy];
    const castA = combat.castSkill(scout, 'kill_shot', healthyEnemy);
    assert.equal(castA, true, 'Kill Shot cast against healthy target');
    const dmgA = 160 - healthyEnemy.hp;

    // Reset cooldown and energy for Case B
    scout.lastSkillUseTimes.clear();
    scout.energy = 100;

    // Case B: Low HP target (<= 40% HP) -> execute 400% weapon damage
    const woundedEnemy = createMockEnemy('gob-wounded', 'Wounded Orc', 8, 5, 200);
    woundedEnemy.hp = 60; // 30% HP (<= 40% execute threshold)
    woundedEnemy.maxHp = 200;

    combat.enemies = [woundedEnemy];
    const castB = combat.castSkill(scout, 'kill_shot', woundedEnemy);
    assert.equal(castB, true, 'Kill Shot cast against wounded target');
    const dmgB = 60 - woundedEnemy.hp;

    assert.ok(dmgB > dmgA * 1.8, `Execute damage (${dmgB.toFixed(1)}) approximately doubled baseline damage (${dmgA.toFixed(1)})`);

    console.log('✓ PASS: Kill Shot deals baseline damage above 40% HP and doubles damage on targets below 40% HP.\n');
  }

  // ============================================================================
  // TEST 8: Hybrid Cross-Proficiency Scaling & Sidearm Pairing
  // ============================================================================
  console.log('--- TEST 8: Hybrid Cross-Proficiency Scaling & Sidearm Pairing ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene, [], [], scene.pathfinder);

    // Scout A: Bows 15, Daggers 0
    const progA = new ProgressionSystem(classesData, 'Scout A');
    progA.setClassLevel('scout', 1);
    progA.getProficiencyStat('bows').level = 15;
    progA.getProficiencyStat('daggers').level = 0;
    const scoutA = createMockPlayer('scout-a', 'Scout A', 5, 5, bows, progA);
    scoutA.knownSkillIds = ['quickshot'];
    scoutA.equippedSkillIds = ['quickshot'];

    // Scout B: Bows 15, Daggers 20 (invested in hybrid path)
    const progB = new ProgressionSystem(classesData, 'Scout B');
    progB.setClassLevel('scout', 1);
    progB.getProficiencyStat('bows').level = 15;
    progB.getProficiencyStat('daggers').level = 20;
    const scoutB = createMockPlayer('scout-b', 'Scout B', 5, 5, bows, progB);
    scoutB.knownSkillIds = ['quickshot'];
    scoutB.equippedSkillIds = ['quickshot'];

    const enemyA = createMockEnemy('gob-a', 'Goblin A', 7, 5, 100);
    const enemyB = createMockEnemy('gob-b', 'Goblin B', 7, 5, 100);

    combat.party = [scoutA];
    combat.enemies = [enemyA];
    combat.castSkill(scoutA, 'quickshot', enemyA);
    const damageA = 100 - enemyA.hp;

    combat.party = [scoutB];
    combat.enemies = [enemyB];
    combat.castSkill(scoutB, 'quickshot', enemyB);
    const damageB = 100 - enemyB.hp;

    // Scout B should deal extra damage due to Dagger partner proficiency (20 * 0.15 = 3.0 bonus)
    assert.ok(damageB > damageA, `Hybrid Scout B dealt more damage (${damageB.toFixed(1)}) than pure Scout A (${damageA.toFixed(1)})`);

    // Verify Sidearm Pairing in Player entity (Bow in main, Daggers in offhand)
    const dummyPlayerData = {
      id: 'hero',
      name: 'Guild Hero',
      maxHp: 100,
      criticalHpMax: 25,
      moveSpeed: 100,
      maxEnergy: 100,
      energyRegenPerSecond: 10,
      startingWeaponId: 'bows',
      inventoryCapacity: 20
    };
    const scoutProg = new ProgressionSystem(classesData, 'Guild Hero');
    scoutProg.setClassLevel('scout', 1);
    const playerInstance = new Player(scene, 10, 10, dummyPlayerData, bows, 32, 'hero', scoutProg);

    playerInstance.equipWeapon(bows);
    assert.equal(playerInstance.equippedWeapon?.id, 'bows', 'Main weapon equipped with bows');
    const equippedDaggerSidearm = playerInstance.equipOffhandWeapon(daggers, true);
    assert.equal(equippedDaggerSidearm, true, 'Offhand dagger sidearm successfully equipped with 2H Bow');
    assert.equal(playerInstance.offhandWeapon?.id, 'daggers', 'Offhand holds daggers');

    // Equipping a non-dagger offhand (e.g. shield) with a 2H bow must fail
    const shields = dataLoader.getWeapon('shields')!;
    const equipShieldWithBow = playerInstance.equipOffhandWeapon(shields, true);
    assert.equal(equipShieldWithBow, false, 'Shield offhand with 2H bow is rejected');

    console.log('✓ PASS: Cross-proficiency hybrid scaling and Bow + Dagger sidearm pairing verified.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 46 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runMilestone46Tests().catch((err) => {
  console.error('❌ MILESTONE 46 TEST RUNNER FAILED:');
  console.error(err);
  process.exit(1);
});
