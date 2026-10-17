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

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
import type { EnemyDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 40, gridHeight: number = 40): any {
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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Dummy Target', hp: number = 5000): any {
  const def: EnemyDef = {
    id: `dummy_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 5,
    aggroRadius: 10,
    attackIntervalMs: 1500,
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.isAggroed = true;
  return enemy;
}

async function runDragoonTests() {
  console.log('========================================================================');
  console.log('⚔️ RUNNING DRAGOON CLASS & SKILL KIT TEST SUITE ⚔️');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
  const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
  const statusEffectsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statusEffects.json'), 'utf8'));

  // ============================================================================
  // TEST 1: Data Validation & Expected-Table Guard for Dragoon
  // ============================================================================
  console.log('--- TEST 1: Data Validation & Expected-Table Guard ---');
  {
    const dragoonDef = classesData.classes.find((c: any) => c.id === 'dragoon');
    assert.ok(dragoonDef, 'dragoon class must exist in classes.json');
    assert.strictEqual(dragoonDef.name, 'Dragoon');
    assert.strictEqual(dragoonDef.tier, 'expert');
    assert.strictEqual(dragoonDef.fantasy, 'Armored dragon-knight who strikes from the sky');
    assert.deepStrictEqual(dragoonDef.hiddenSkillBonuses, { resilience: 0.05 });
    assert.strictEqual(dragoonDef.primaryAttribute, 'str');
    assert.deepStrictEqual(dragoonDef.requirements, [
      { type: 'proficiency', target: 'spears', value: 60 },
      { type: 'proficiency', target: 'heavy_armor', value: 30 },
      { type: 'classLevel', target: 'hoplite', value: 15 }
    ]);

    const expectedSkills: Record<string, any> = {
      drake_thrust: {
        energyCost: 16,
        cooldownMs: 3000,
        targetType: 'enemy',
        rangeTiles: 1,
        reqLevel: 1,
        ai: { role: 'rotation', priority: 30 },
        effects: [
          {
            type: 'damage',
            scaling: 'weapon',
            multiplier: 1.5,
            profBonus: { prof: 'heavy_armor', perLevel: 0.15 }
          }
        ]
      },
      iron_scales: {
        energyCost: 22,
        cooldownMs: 15000,
        targetType: 'self',
        reqLevel: 10,
        ai: { role: 'defensive', priority: 60 },
        effects: [
          {
            type: 'buff',
            stat: 'damageTakenMultiplier',
            value: 0.7,
            durationMs: 6000,
            target: 'self'
          }
        ]
      },
      dragon_dive: {
        energyCost: 28,
        cooldownMs: 10000,
        targetType: 'enemy',
        rangeTiles: 4,
        reqLevel: 20,
        ai: { role: 'gapCloser', priority: 60 },
        effects: [
          { type: 'move', moveType: 'leap' },
          {
            type: 'damage',
            scaling: 'weapon',
            multiplier: 2.2,
            profBonus: { prof: 'heavy_armor', perLevel: 0.15 },
            area: { shape: 'radius', radius: 1.5 }
          },
          { type: 'applyStatus', status: 'stun', chance: 0.3 }
        ]
      },
      wyrmpiercer: {
        energyCost: 30,
        cooldownMs: 9000,
        targetType: 'enemy',
        rangeTiles: 1,
        reqLevel: 30,
        ai: { role: 'rotation', priority: 60, condition: { enemiesInRadius: 2 } },
        effects: [
          {
            type: 'damage',
            scaling: 'weapon',
            multiplier: 2.6,
            area: { shape: 'line', maxTargets: 3 }
          },
          { type: 'applyStatus', status: 'expose', chance: 1 }
        ]
      },
      highwind: {
        energyCost: 44,
        cooldownMs: 18000,
        targetType: 'enemy',
        rangeTiles: 5,
        reqLevel: 40,
        ai: { role: 'finisher', priority: 85 },
        effects: [
          { type: 'move', moveType: 'leap' },
          {
            type: 'damage',
            scaling: 'weapon',
            multiplier: 3.6,
            profBonus: { prof: 'heavy_armor', perLevel: 0.15 },
            area: { shape: 'radius', radius: 2 },
            requiresTargetStatus: { status: 'expose', multiplier: 1.3 }
          }
        ]
      }
    };

    const validStatusIds = new Set<string>(statusEffectsData.statusEffects.map((s: any) => s.id));

    for (const [skillId, expected] of Object.entries(expectedSkills)) {
      const s = skillsData.skills.find((item: any) => item.id === skillId);
      assert.ok(s, `Skill "${skillId}" must exist in skills.json`);
      assert.strictEqual(s.energyCost, expected.energyCost, `${skillId} energyCost`);
      assert.strictEqual(s.cooldownMs, expected.cooldownMs, `${skillId} cooldownMs`);
      assert.strictEqual(s.targetType, expected.targetType, `${skillId} targetType`);
      if (expected.rangeTiles !== undefined) {
        assert.strictEqual(s.rangeTiles, expected.rangeTiles, `${skillId} rangeTiles`);
      }
      assert.deepStrictEqual(s.ai, expected.ai, `${skillId} ai`);
      assert.deepStrictEqual(s.effects, expected.effects, `${skillId} effects`);

      const classReq = (s.requirements || []).find((r: any) => r.type === 'classLevel' && r.target === 'dragoon');
      assert.ok(classReq, `${skillId} must require classLevel dragoon`);
      assert.strictEqual(classReq.value, expected.reqLevel, `${skillId} required level`);

      // Strict durationMs rule check on applyStatus
      for (const eff of s.effects || []) {
        if (eff.type === 'applyStatus') {
          assert.strictEqual(
            eff.durationMs,
            undefined,
            `Skill "${skillId}" applyStatus must NOT have durationMs`
          );
          assert.ok(
            validStatusIds.has(eff.status),
            `Skill "${skillId}" status "${eff.status}" must exist in statusEffects.json`
          );
        }
        if (eff.requiresTargetStatus) {
          assert.ok(
            validStatusIds.has(eff.requiresTargetStatus.status),
            `Skill "${skillId}" requiresTargetStatus "${eff.requiresTargetStatus.status}" must exist in statusEffects.json`
          );
        }
      }
    }
    console.log('✓ PASS: Dragoon class definition and all 5 skill table guards validated strictly.\n');
  }

  // ============================================================================
  // TEST 2: Unlock Boundaries (evaluateRequirements on real ProgressionSystem)
  // ============================================================================
  console.log('--- TEST 2: Unlock Boundaries (evaluateRequirements on real progression) ---');
  {
    // Case 1: Satisfies all requirements -> unlocks
    const pSuccess = new ProgressionSystem(classesData, 'Dragoon Candidate A');
    pSuccess.getProficiencyStat('spears').level = 60;
    pSuccess.getProficiencyStat('heavy_armor').level = 30;
    pSuccess.setClassLevel('hoplite', 15);
    pSuccess.checkClassUnlocks();
    assert.strictEqual(pSuccess.isClassUnlocked('dragoon'), true, 'Dragoon must unlock with Spears 60, Heavy Armor 30, Hoplite 15');

    // Case 2: Heavy Armor 29 -> doesn't unlock
    const pFailArmor = new ProgressionSystem(classesData, 'Dragoon Candidate B');
    pFailArmor.getProficiencyStat('spears').level = 60;
    pFailArmor.getProficiencyStat('heavy_armor').level = 29;
    pFailArmor.setClassLevel('hoplite', 15);
    pFailArmor.checkClassUnlocks();
    assert.strictEqual(pFailArmor.isClassUnlocked('dragoon'), false, 'Dragoon must NOT unlock at Heavy Armor 29');

    // Case 3: Spears 59 -> doesn't unlock
    const pFailSpears = new ProgressionSystem(classesData, 'Dragoon Candidate C');
    pFailSpears.getProficiencyStat('spears').level = 59;
    pFailSpears.getProficiencyStat('heavy_armor').level = 30;
    pFailSpears.setClassLevel('hoplite', 15);
    pFailSpears.checkClassUnlocks();
    assert.strictEqual(pFailSpears.isClassUnlocked('dragoon'), false, 'Dragoon must NOT unlock at Spears 59');

    // Case 4: Hoplite 14 -> doesn't unlock
    const pFailHoplite = new ProgressionSystem(classesData, 'Dragoon Candidate D');
    pFailHoplite.getProficiencyStat('spears').level = 60;
    pFailHoplite.getProficiencyStat('heavy_armor').level = 30;
    pFailHoplite.setClassLevel('hoplite', 14);
    pFailHoplite.checkClassUnlocks();
    assert.strictEqual(pFailHoplite.isClassUnlocked('dragoon'), false, 'Dragoon must NOT unlock at Hoplite Lv 14');

    // Case 5: Lancer 15 instead of Hoplite -> doesn't unlock
    const pFailLancer = new ProgressionSystem(classesData, 'Dragoon Candidate E');
    pFailLancer.getProficiencyStat('spears').level = 60;
    pFailLancer.getProficiencyStat('heavy_armor').level = 30;
    pFailLancer.setClassLevel('lancer', 15);
    pFailLancer.checkClassUnlocks();
    assert.strictEqual(pFailLancer.isClassUnlocked('dragoon'), false, 'Dragoon must NOT unlock with Lancer 15 instead of Hoplite');

    console.log('✓ PASS: All 5 unlock boundary cases strictly enforced.\n');
  }

  // ============================================================================
  // TEST 3: Heavy Armor Reached Through Real Wear (End-to-End Progression)
  // ============================================================================
  console.log('--- TEST 3: Heavy Armor Reached Through Real Wear ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Iron Knight');
    const hero = new Player(scene, 0, 0, dataLoader.getPlayer(), dataLoader.getWeapon('spears')!, 32, 'player-avatar', heroProg);

    // Equip Starter Iron Set (Iron Greathelm + Iron Plate Armor, both heavy armor)
    const helm = dataLoader.getArmor('iron_greathelm');
    const plate = dataLoader.getArmor('iron_plate_armor');
    assert.ok(helm && helm.weightClass === 'heavy', 'Iron Greathelm must be heavy weightClass');
    assert.ok(plate && plate.weightClass === 'heavy', 'Iron Plate Armor must be heavy weightClass');

    hero.equipHelmet(helm!, true);
    hero.equipBodyArmor(plate!, true);
    assert.deepStrictEqual(hero.getEquippedArmorWeightClasses(), ['heavy'], 'Hero must be wearing pure heavy armor');

    assert.strictEqual(heroProg.getProficiencyLevel('heavy_armor'), 0, 'Initial Heavy Armor level is 0');
    assert.strictEqual(heroProg.isClassUnlocked('dragoon'), false, 'Dragoon initially locked');

    // Award EXP through real combat hits taken
    let hitsTaken = 0;
    while (heroProg.getProficiencyLevel('heavy_armor') < 30) {
      hero.awardArmorWearExp('hit');
      hitsTaken++;
    }
    assert.strictEqual(heroProg.getProficiencyLevel('heavy_armor'), 30, 'Heavy Armor reached exactly Level 30 through real wear');
    console.log(`  Heavy Armor reached Level 30 after absorbing ${hitsTaken} direct combat hits.`);

    // Set other requirements: Spears 60 and Hoplite 15
    heroProg.getProficiencyStat('spears').level = 60;
    heroProg.setClassLevel('hoplite', 15);

    // Evaluate progression
    heroProg.checkClassUnlocks();
    assert.strictEqual(heroProg.isClassUnlocked('dragoon'), true, 'Dragoon unlocks end-to-end after real wear + prerequisites!');
    console.log('✓ PASS: Dragoon class is reachable end-to-end through real armor wear in combat.\n');
  }

  // ============================================================================
  // TEST 4: Proficiency Bonus (PB Heavy Armor) on Drake Thrust
  // ============================================================================
  console.log('--- TEST 4: PB Heavy Armor Scaling on Drake Thrust ---');
  {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Fixed RNG (no crits / fixed variance)

    try {
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const spearDef = dataLoader.getWeapon('spears')!;

      const dragoon = new Player(scene, 10, 10, dataLoader.getPlayer(), spearDef, 32);
      dragoon.progression.setClassLevel('dragoon', 40);
      dragoon.progression.getProficiencyStat('spears').level = 60;
      dragoon.progression.getProficiencyStat('heavy_armor').level = 10;
      dragoon.recalculateDerivedStats(false);
      const strMult10 = dragoon.strMultiplier;
      dragoon.energy = 100;

      const target = createDummyEnemy(scene, 11, 10, 'PB Dummy', 10000);
      combat.party = [dragoon];
      combat.enemies = [target];

      // Cast 1: at Heavy Armor 10
      const hpBefore10 = target.hp;
      const ok10 = combat.castSkill(dragoon, 'drake_thrust', target, 1000);
      assert.strictEqual(ok10, true, 'drake_thrust cast at Heavy Armor 10 must succeed');
      const dmgAt10 = hpBefore10 - target.hp;

      // Cast 2: at Heavy Armor 40
      dragoon.lastSkillUseTimes.clear();
      dragoon.energy = 100;
      dragoon.progression.getProficiencyStat('heavy_armor').level = 40;
      dragoon.recalculateDerivedStats(false);
      const strMult40 = dragoon.strMultiplier;

      const hpBefore40 = target.hp;
      const ok40 = combat.castSkill(dragoon, 'drake_thrust', target, 5000);
      assert.strictEqual(ok40, true, 'drake_thrust cast at Heavy Armor 40 must succeed');
      const dmgAt40 = hpBefore40 - target.hp;

      // Difference normalized by strMultiplier must be exactly (40 - 10) * 0.15 = 4.5
      const normalizedDiff = (dmgAt40 / strMult40) - (dmgAt10 / strMult10);
      assert.strictEqual(
        Number(normalizedDiff.toFixed(4)),
        4.5,
        `Normalized PB diff ((dmgAt40 / strMult40) - (dmgAt10 / strMult10)) must equal exactly 4.5, got ${normalizedDiff}`
      );
      console.log(`  drake_thrust PB verified: Heavy Armor 10 dealt ${dmgAt10.toFixed(2)} (strMult: ${strMult10.toFixed(4)}), Heavy Armor 40 dealt ${dmgAt40.toFixed(2)} (strMult: ${strMult40.toFixed(4)}), normalized diff = ${normalizedDiff.toFixed(4)}.`);
      console.log('✓ PASS: PB heavy scales exactly +0.15 per Heavy Armor level normalized by strMultiplier.\n');
    } finally {
      Math.random = originalRandom;
    }
  }

  // ============================================================================
  // TEST 5: Dragon Dive Mechanics (Leap, Splash Radius 1.5, Stun Chance)
  // ============================================================================
  console.log('--- TEST 5: Dragon Dive Mechanics (Leap + Radius 1.5 Splash) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const spearDef = dataLoader.getWeapon('spears')!;

    // Caster starts 4 tiles away from primary target (caster at 10, 10; target at 14, 10)
    const dragoon = new Player(scene, 10, 10, dataLoader.getPlayer(), spearDef, 32);
    dragoon.progression.setClassLevel('dragoon', 40);
    dragoon.progression.getProficiencyStat('spears').level = 60;
    dragoon.progression.getProficiencyStat('heavy_armor').level = 30;
    dragoon.recalculateDerivedStats(false);
    dragoon.energy = 100;

    const primaryTarget = createDummyEnemy(scene, 14, 10, 'Primary Target', 5000);
    // Second enemy at (14, 11): 1 tile away from primary target (<= 1.5 radius)
    const splashEnemy = createDummyEnemy(scene, 14, 11, 'Splash Target', 5000);
    // Third enemy at (17, 10): 3 tiles away from primary target (> 1.5 radius)
    const distantEnemy = createDummyEnemy(scene, 17, 10, 'Distant Target', 5000);

    combat.party = [dragoon];
    combat.enemies = [primaryTarget, splashEnemy, distantEnemy];

    const hpBeforePrimary = primaryTarget.hp;
    const hpBeforeSplash = splashEnemy.hp;
    const hpBeforeDistant = distantEnemy.hp;

    // Verify initial positions
    const initialCasterDist = Math.max(Math.abs(dragoon.gridPos.x - primaryTarget.gridPos.x), Math.abs(dragoon.gridPos.y - primaryTarget.gridPos.y));
    assert.strictEqual(initialCasterDist, 4, 'Caster must start 4 tiles away from primary target');

    const okDive = combat.castSkill(dragoon, 'dragon_dive', primaryTarget, 1000);
    assert.strictEqual(okDive, true, 'dragon_dive cast must succeed');

    // 1. Caster leaped to an adjacent tile next to primary target
    const finalCasterDist = Math.max(Math.abs(dragoon.gridPos.x - primaryTarget.gridPos.x), Math.abs(dragoon.gridPos.y - primaryTarget.gridPos.y));
    assert.strictEqual(finalCasterDist, 1, `Caster must land adjacent to primary target (distance 1), got distance ${finalCasterDist} at (${dragoon.gridPos.x}, ${dragoon.gridPos.y})`);

    // 2. Primary target took damage
    assert.ok(primaryTarget.hp < hpBeforePrimary, 'Primary target must take damage from dragon_dive');

    // 3. Second enemy within 1.5 tiles took splash damage
    assert.ok(splashEnemy.hp < hpBeforeSplash, 'Enemy within 1.5 tiles of target must take splash damage');

    // 4. Distant enemy 3 tiles away took NO damage
    assert.strictEqual(distantEnemy.hp, hpBeforeDistant, 'Distant enemy 3 tiles away must take zero damage');

    console.log(`  dragon_dive verified: Caster leaped from dist 4 to dist ${finalCasterDist}; primary took ${hpBeforePrimary - primaryTarget.hp} dmg; neighbor took ${hpBeforeSplash - splashEnemy.hp} dmg; distant took 0 dmg.`);
    console.log('✓ PASS: Dragon Dive leap movement and target-centered radius 1.5 AoE verified.\n');
  }

  // ============================================================================
  // TEST 6: Highwind (x1.3 vs Exposed Target)
  // ============================================================================
  console.log('--- TEST 6: Highwind Synergy Multiplier (x1.3 vs Expose) ---');
  {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // Fixed RNG

    try {
      const scene = createMockScene();
      const combat = new CombatSystem(scene);
      const spearDef = dataLoader.getWeapon('spears')!;

      const dragoon = new Player(scene, 10, 10, dataLoader.getPlayer(), spearDef, 32);
      dragoon.progression.setClassLevel('dragoon', 40);
      dragoon.progression.getProficiencyStat('spears').level = 60;
      // Set Heavy Armor to 0 to isolate base skill scaling without flat PB shift
      dragoon.progression.getProficiencyStat('heavy_armor').level = 0;
      dragoon.recalculateDerivedStats(false);
      dragoon.energy = 100;

      const cleanTarget = createDummyEnemy(scene, 15, 10, 'Clean Target', 10000);
      combat.party = [dragoon];
      combat.enemies = [cleanTarget];

      // Cast 1: on unexposed target
      const hpBeforeClean = cleanTarget.hp;
      const okClean = combat.castSkill(dragoon, 'highwind', cleanTarget, 1000);
      assert.strictEqual(okClean, true, 'highwind cast on clean target must succeed');
      const cleanDmg = hpBeforeClean - cleanTarget.hp;

      // Cast 2: on exposed target
      // Apply expose status marker (isolating the skill's x1.3 synergy multiplier)
      dragoon.setGridPosition(10, 10);
      dragoon.lastSkillUseTimes.clear();
      dragoon.energy = 100;

      const exposedTarget = createDummyEnemy(scene, 15, 10, 'Exposed Target', 10000);
      exposedTarget.activeStatusEffects.set('expose', {
        def: { id: 'expose' },
        remainingMs: 6000,
        durationMs: 6000
      } as any);
      combat.enemies = [exposedTarget];

      const hpBeforeExposed = exposedTarget.hp;
      const okExposed = combat.castSkill(dragoon, 'highwind', exposedTarget, 5000);
      assert.strictEqual(okExposed, true, 'highwind cast on exposed target must succeed');
      const exposedDmg = hpBeforeExposed - exposedTarget.hp;

      const ratio = exposedDmg / cleanDmg;
      assert.strictEqual(
        Number(ratio.toFixed(4)),
        1.3,
        `highwind on exposed target must deal exactly 1.3x unexposed damage, got ratio ${ratio} (${exposedDmg} vs ${cleanDmg})`
      );
      console.log(`  highwind verified: clean dealt ${cleanDmg.toFixed(2)}, exposed dealt ${exposedDmg.toFixed(2)}, ratio = ${ratio.toFixed(4)} (exactly 1.3x).`);
      console.log('✓ PASS: Highwind deals exactly x1.3 damage on exposed target.\n');
    } finally {
      Math.random = originalRandom;
    }
  }

  // ============================================================================
  // TEST 7: Smoke Test (60s Simulated 3-Enemy Fight)
  // ============================================================================
  console.log('--- TEST 7: Dragoon Smoke Test (60s 3-Enemy Fight) ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const spearDef = dataLoader.getWeapon('spears')!;

    const dragoon = new Player(scene, 10, 10, dataLoader.getPlayer(), spearDef, 32);
    dragoon.entityName = 'Dragoon Tester';
    dragoon.progression.setClassLevel('dragoon', 40);
    dragoon.progression.setClassLevel('hoplite', 20);
    dragoon.progression.setClassLevel('lancer', 20);
    dragoon.progression.getProficiencyStat('spears').level = 70;
    dragoon.progression.getProficiencyStat('heavy_armor').level = 70;
    dragoon.recalculateDerivedStats(false);

    const dragoonSkills = ['drake_thrust', 'iron_scales', 'dragon_dive', 'wyrmpiercer', 'highwind'];
    dragoon.equippedSkillIds = [...dragoonSkills];
    dragoon.knownSkillIds = [...dragoonSkills];
    for (const sid of dragoonSkills) {
      dragoon.autocastMap.set(sid, true);
    }

    dragoon.energy = 100;
    dragoon.maxEnergy = 100;
    dragoon.hp = 100;
    dragoon.maxHp = 100;

    const ally = new Player(scene, 9, 10, dataLoader.getPlayer(), spearDef, 32);
    ally.entityName = 'Party Ally';
    ally.hp = 60;
    ally.maxHp = 100;

    combat.party = [dragoon, ally];

    // 3 enemies: 2 clustered near dragoon to satisfy AoE conditions, 1 at range 3-4
    const enemy1 = createDummyEnemy(scene, 11, 10, 'Enemy A', 100000);
    const enemy2 = createDummyEnemy(scene, 11, 11, 'Enemy B', 100000);
    const enemy3 = createDummyEnemy(scene, 14, 10, 'Enemy C', 100000);
    combat.enemies = [enemy1, enemy2, enemy3];
    dragoon.targetEntity = enemy1;

    const skillCounts: Record<string, number> = {};
    for (const sid of dragoonSkills) skillCounts[sid] = 0;

    const originalCastSkill = combat.castSkill.bind(combat);
    combat.castSkill = (caster: any, skillId: string, target?: any, currentTime?: number) => {
      const res = originalCastSkill(caster, skillId, target, currentTime);
      if (res && caster === dragoon && skillCounts[skillId] !== undefined) {
        skillCounts[skillId]++;
      }
      return res;
    };

    // 60 seconds simulation (dt = 250ms = 240 steps)
    const simTotalMs = 60000;
    const dt = 250;
    let now = 1000;

    for (let t = 0; t < simTotalMs; t += dt) {
      now += dt;
      scene.time.now = now;

      // Keep dragoon energy refreshed to allow rotations
      if (dragoon.energy < 45) {
        dragoon.energy = Math.min(100, dragoon.energy + 20);
      }

      // Dragoon takes occasional small damage to trigger defensive AI check
      if (t % 15000 === 0) {
        dragoon.hp = 70;
      }

      combat.update(now, dt);
    }

    const castSkillCount = Object.values(skillCounts).filter(c => c > 0).length;
    const totalCasts = Object.values(skillCounts).reduce((a, b) => a + b, 0);

    console.log(`  Dragoon Cast Counts (60s Simulated Fight):`);
    for (const [sid, count] of Object.entries(skillCounts)) {
      console.log(`    - ${sid}: ${count} casts`);
    }
    console.log(`  Total: ${castSkillCount}/5 distinct skills cast (${totalCasts} total casts).`);

    assert.ok(
      castSkillCount >= 4,
      `Dragoon must cast at least 4 of 5 skills within 60s (cast ${castSkillCount}/5: ${JSON.stringify(skillCounts)})`
    );
    console.log('✓ PASS: Dragoon successfully cast at least 4 of 5 skills in 60s combat simulation.\n');
  }

  console.log('========================================================================');
  console.log('🎉 ALL 7 DRAGOON TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('========================================================================\n');
}

runDragoonTests().catch((err) => {
  console.error('❌ DRAGOON TEST SUITE FAILURE:', err);
  process.exit(1);
});
