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
import type { EnemyDef } from '../src/types/game.ts';

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

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Fiend', hp: number = 100): Enemy {
  const def: EnemyDef = {
    id: `enemy_${x}_${y}`,
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

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING SKILL ENGINE FIXES TARGETED TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();
  const staff = dataLoader.getWeapon('arcane_staff')!;

  // -------------------------------------------------------------------------------------------------
  // 1. Fix 1: enemiesInRadius check in rotation selector
  // -------------------------------------------------------------------------------------------------
  console.log('--- TEST 1: Rotation enemiesInRadius check (Single Target vs 3 Clustered) ---');
  {
    const caster = new Player(scene, 10, 10, playerData, staff, 32);
    caster.progression.setClassLevel('ember_adept', 40);
    caster.energy = 100;
    // Equip Firestorm (priority 80, enemiesInRadius 2), Flame Wave (priority 50, enemiesInRadius 2), Scorch (priority 25)
    caster.equippedSkillIds = ['firestorm', 'flame_wave', 'scorch'];

    // Case 1A: Only 1 enemy present
    const singleEnemy = createDummyEnemy(scene, 10, 11, 'Solo Enemy', 100);
    combat.party = [caster];
    combat.enemies = [singleEnemy];

    const pickSingle = combat.skillSystem.selectSkillForCompanion(caster, 'rotation', 1000, singleEnemy, 1);
    assert.ok(pickSingle, 'Should pick an available skill for solo enemy');
    assert.notStrictEqual(pickSingle.skillDef.id, 'firestorm', 'Firestorm must NOT be selected for 1 enemy (requires 2)');
    assert.notStrictEqual(pickSingle.skillDef.id, 'flame_wave', 'Flame Wave must NOT be selected for 1 enemy (requires 2)');
    assert.strictEqual(pickSingle.skillDef.id, 'scorch', 'Scorch must be selected when only 1 enemy is present');
    console.log('  ✓ 1 enemy: Firestorm and Flame Wave skipped, Scorch picked.');

    // Case 1B: 3 clustered enemies present around primary target
    const enemy2 = createDummyEnemy(scene, 10, 12, 'Cluster Enemy 2', 100);
    const enemy3 = createDummyEnemy(scene, 11, 11, 'Cluster Enemy 3', 100);
    combat.enemies = [singleEnemy, enemy2, enemy3];

    const pickClustered = combat.skillSystem.selectSkillForCompanion(caster, 'rotation', 1000, singleEnemy, 1);
    assert.ok(pickClustered, 'Should pick a skill for clustered enemies');
    assert.strictEqual(pickClustered.skillDef.id, 'firestorm', 'Firestorm (priority 80) must be selected for 3 clustered enemies');
    console.log('  ✓ 3 clustered enemies: Firestorm selected successfully.');
  }

  // -------------------------------------------------------------------------------------------------
  // 2. Fix 2: Rotation range check (4 tiles distance)
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 2: Rotation Range Check (Distance 4 tiles: Flame Wave vs Scorch) ---');
  {
    const caster = new Player(scene, 10, 10, playerData, staff, 32);
    caster.progression.setClassLevel('ember_adept', 40);
    caster.energy = 100;
    // Equip Flame Wave (range 2, priority 50) and Scorch (range 4, priority 25)
    caster.equippedSkillIds = ['flame_wave', 'scorch'];

    // Target is 4 tiles away (e.g. at (10, 14))
    const distantEnemy = createDummyEnemy(scene, 10, 14, 'Distant Enemy', 100);
    combat.party = [caster];
    combat.enemies = [distantEnemy];

    const selected = combat.skillSystem.selectSkillForCompanion(caster, 'rotation', 1000, distantEnemy, 4);
    assert.ok(selected, 'A skill must be selected');
    assert.strictEqual(selected.skillDef.id, 'scorch', 'At distance 4, Flame Wave (range 2) must be skipped and Scorch (range 4) picked');
    console.log('  ✓ Caster at 4 tiles with Flame Wave ready picks Scorch, not out-of-range Flame Wave.');
  }

  // -------------------------------------------------------------------------------------------------
  // 3. Fix 3: HoT 70% Rule
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 3: HoT (Regenerate) 70% Combined-HP Rule ---');
  {
    const healer = new Player(scene, 10, 10, playerData, staff, 32);
    healer.progression.setClassLevel('restoration_mage', 40);
    healer.energy = 100;
    healer.equippedSkillIds = ['regenerate'];

    const ally = new Player(scene, 10, 11, playerData, staff, 32);
    ally.maxHp = 100;
    ally.criticalHp = 0;
    ally.maxCriticalHp = 0;
    combat.party = [healer, ally];
    combat.enemies = [createDummyEnemy(scene, 15, 15, 'Dummy', 100)];

    // Case 3A: Ally at 85% HP (85/100) -> above 70% threshold
    ally.hp = 85;
    const selectAt85 = combat.skillSystem.selectSkillForCompanion(healer, 'support', 1000);
    assert.strictEqual(selectAt85, null, 'Ally at 85% HP must receive NO Regenerate (threshold is 70%)');
    console.log('  ✓ Ally at 85% HP gets NO Regenerate.');

    // Case 3B: Ally at 65% HP (65/100) -> below 70% threshold
    ally.hp = 65;
    const selectAt65 = combat.skillSystem.selectSkillForCompanion(healer, 'support', 1000);
    assert.ok(selectAt65, 'Ally at 65% HP must receive Regenerate');
    assert.strictEqual(selectAt65.skillDef.id, 'regenerate', 'Selected skill must be regenerate');
    assert.strictEqual(selectAt65.target, ally, 'Target must be the damaged ally');
    console.log('  ✓ Ally at 65% HP DOES receive Regenerate.');
  }

  // -------------------------------------------------------------------------------------------------
  // 4. Fix 4: Scorch Burn Chance 0.40
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 4: Scorch Burn Chance in Data ---');
  {
    const scorchDef = dataLoader.getSkill('scorch');
    assert.ok(scorchDef, 'scorch definition must exist');
    const burnEffect = scorchDef.effects?.find(e => e.type === 'applyStatus' && e.status === 'burn');
    assert.ok(burnEffect, 'scorch must have applyStatus burn effect');
    assert.strictEqual(burnEffect.chance, 0.40, 'scorch burn chance must be 0.40');
    console.log(`  ✓ Scorch burn chance is verified at ${burnEffect.chance} (expected 0.40).`);
  }

  // -------------------------------------------------------------------------------------------------
  // 5. Follow-up 2 Fix 2: Guard Up and Unbreakable trigger on active threat without HP check,
  // while selfHpBelow engine support is preserved in selector.
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 5: Defensive Stances on Threat (Unbreakable / Guard Up trigger without HP gating) ---');
  {
    const tank = new Player(scene, 10, 10, playerData, staff, 32);
    tank.progression.setClassLevel('vanguard', 40);
    tank.energy = 100;
    tank.maxHp = 100;
    tank.hp = 100;
    tank.criticalHp = 0;
    tank.maxCriticalHp = 0;
    tank.equippedSkillIds = ['guard_up', 'unbreakable'];

    combat.party = [tank];
    const threat = createDummyEnemy(scene, 10, 11, 'Threat', 100);
    threat.isAggroed = true;
    combat.enemies = [threat];

    // Case 5A: Full HP (100%) with active threat -> Unbreakable (priority 90 > guard_up 70) triggers
    const atFull = combat.skillSystem.selectSkillForCompanion(tank, 'defensive', 1000);
    assert.ok(atFull, 'At 100% HP with active threat, defensive stance must trigger');
    assert.strictEqual(atFull.skillDef.id, 'unbreakable', 'Unbreakable (priority 90) triggers at full HP');

    // Case 5B: When unbreakable is already active buff, Guard Up triggers next
    const unbEff = dataLoader.getStatusEffect('unbreakable') || { id: 'unbreakable', name: 'Unbreakable', durationMs: 5000, color: '#fff' };
    tank.applyStatusEffect(unbEff as any);
    const nextStance = combat.skillSystem.selectSkillForCompanion(tank, 'defensive', 1000);
    assert.ok(nextStance, 'Guard Up triggers when unbreakable is already active');
    assert.strictEqual(nextStance.skillDef.id, 'guard_up', 'Guard Up triggers at full HP');

    // Case 5C: Verify selfHpBelow engine support in selector with custom condition
    const customHpGatedSkill: any = {
      id: 'custom_last_stand',
      name: 'Custom Last Stand',
      energyCost: 10,
      cooldownMs: 5000,
      targetType: 'self',
      ai: {
        role: 'defensive',
        priority: 95,
        condition: { selfHpBelow: 0.3 }
      },
      requirements: []
    };
    (dataLoader as any).skillsData.skills.push(customHpGatedSkill);
    tank.equippedSkillIds = ['custom_last_stand'];
    tank.hp = 100;
    const gatedAtFull = combat.skillSystem.selectSkillForCompanion(tank, 'defensive', 1000);
    assert.strictEqual(gatedAtFull, null, 'selfHpBelow condition prevents cast at 100% HP');

    tank.hp = 25;
    const gatedAt25 = combat.skillSystem.selectSkillForCompanion(tank, 'defensive', 1000);
    assert.ok(gatedAt25, 'selfHpBelow condition allows cast at 25% HP');
    assert.strictEqual(gatedAt25.skillDef.id, 'custom_last_stand', 'selfHpBelow skill selected when below threshold');
    console.log('  ✓ Stances on threat at full HP and selfHpBelow engine condition support verified.');
  }

  // -------------------------------------------------------------------------------------------------
  // 6. Fix 6: Carry-Over Fix - Generic fallback hit check, stun gating, and hit-gated EXP
  // -------------------------------------------------------------------------------------------------
  console.log('\n--- TEST 6: Generic Fallback & Hit-Gated Proficiency EXP ---');
  {
    const originalRandom = Math.random;

    const testSword: any = {
      id: 'test_fixed_sword',
      proficiencyId: 'short_swords',
      name: 'Test Fixed Sword',
      type: 'melee',
      tier: 'common',
      baseDamage: 10,
      baseAccuracy: 0.60,
      attackSpeed: 1.0,
      attackRangeTiles: 1,
      energyCostPerAttack: 10,
      levelBonus: { damagePerLevel: 0, accuracyPerLevel: 0 }
    };

    // 6A. Shield Bash via castSkill generic fallback on forced MISS (Math.random = 0.99)
    {
      const tank = new Player(scene, 10, 10, playerData, testSword, 32);
      tank.progression.setClassLevel('vanguard', 40);
      tank.mood = 50; // 1.0 combat damage multiplier
      tank.energy = 100;
      tank.equippedSkillIds = ['shield_bash'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tank];
      combat.enemies = [enemy];

      Math.random = () => 0.99; // Forced miss

      const expBefore = tank.progression.getProficiencyStat('short_swords').currentExp;
      const ok = combat.castSkill(tank, 'shield_bash', enemy, 1000);
      assert.strictEqual(ok, true, 'castSkill returns true');
      assert.strictEqual(enemy.hp, 100, 'Enemy takes 0 damage on MISS');
      assert.strictEqual(enemy.hasStatusEffect('stun'), false, 'Shield Bash stun does NOT land on a miss');
      const expAfter = tank.progression.getProficiencyStat('short_swords').currentExp;
      assert.strictEqual(expAfter, expBefore, 'No weapon EXP awarded on a miss');
      console.log('  ✓ Shield Bash miss: 0 damage, no stun, 0 EXP awarded.');
    }

    // 6B. Shield Bash via castSkill generic fallback on forced HIT (Math.random = 0.1)
    {
      const tank = new Player(scene, 10, 10, playerData, testSword, 32);
      tank.progression.setClassLevel('vanguard', 40);
      tank.mood = 50; // 1.0 combat damage multiplier
      tank.energy = 100;
      tank.equippedSkillIds = ['shield_bash'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [tank];
      combat.enemies = [enemy];

      Math.random = () => 0.1; // Forced hit

      const expBefore = tank.progression.getProficiencyStat('short_swords').currentExp;
      const ok = combat.castSkill(tank, 'shield_bash', enemy, 1000);
      assert.strictEqual(ok, true, 'castSkill returns true');
      assert.strictEqual(enemy.hp, 88, 'Enemy takes exact damage (12.0 = 10 * 1.2) on HIT');
      assert.strictEqual(enemy.hasStatusEffect('stun'), true, 'Shield Bash stun lands on a hit');
      const expAfter = tank.progression.getProficiencyStat('short_swords').currentExp;
      assert.strictEqual(expAfter - expBefore, 2, 'Exactly +2 weapon EXP awarded on hit (not +4)');
      console.log('  ✓ Shield Bash hit: exact damage (88 HP), stun applied, exactly +2 EXP awarded.');
    }

    // 6C. Thrust via SkillSystem on forced MISS (Math.random = 0.99)
    {
      const fencer = new Player(scene, 10, 10, playerData, testSword, 32);
      fencer.progression.setClassLevel('fencer', 40);
      fencer.mood = 50;
      fencer.energy = 100;
      fencer.equippedSkillIds = ['thrust'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [fencer];
      combat.enemies = [enemy];

      Math.random = () => 0.99; // Forced miss

      const expBefore = fencer.progression.getProficiencyStat('short_swords').currentExp;
      const ok = combat.castSkill(fencer, 'thrust', enemy, 1000);
      assert.strictEqual(ok, true, 'Thrust cast succeeds');
      assert.strictEqual(enemy.hp, 100, 'Enemy takes 0 damage on miss');
      const expAfter = fencer.progression.getProficiencyStat('short_swords').currentExp;
      assert.strictEqual(expAfter, expBefore, 'SkillSystem weapon skill gives 0 EXP on a miss');
      console.log('  ✓ Thrust miss: 0 damage, 0 weapon EXP awarded.');
    }

    // 6D. Thrust via SkillSystem on forced HIT (Math.random = 0.1)
    {
      const fencer = new Player(scene, 10, 10, playerData, testSword, 32);
      fencer.progression.setClassLevel('fencer', 40);
      fencer.mood = 50;
      fencer.energy = 100;
      fencer.equippedSkillIds = ['thrust'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [fencer];
      combat.enemies = [enemy];

      Math.random = () => 0.1; // Forced hit

      const expBefore = fencer.progression.getProficiencyStat('short_swords').currentExp;
      const ok = combat.castSkill(fencer, 'thrust', enemy, 1000);
      assert.strictEqual(ok, true, 'Thrust cast succeeds');
      assert.strictEqual(enemy.hp, 85, 'Thrust deals exact damage (15)');
      const expAfter = fencer.progression.getProficiencyStat('short_swords').currentExp;
      assert.strictEqual(expAfter - expBefore, 2, 'SkillSystem weapon skill gives exactly +2 EXP on hit (not +4)');
      console.log('  ✓ Thrust hit: exact damage (85 HP), exactly +2 EXP awarded.');
    }

    // 6E. Scorch (spell damage via SkillSystem) on forced roll 0.99 still gives +2 EXP
    {
      const mage = new Player(scene, 10, 10, playerData, staff, 32);
      mage.progression.setClassLevel('ember_adept', 40);
      mage.mood = 50;
      mage.energy = 100;
      mage.equippedSkillIds = ['scorch'];

      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 100);
      combat.party = [mage];
      combat.enemies = [enemy];

      Math.random = () => 0.99; // High roll

      const effectiveWpn = combat.getEffectiveWeaponForAttack(mage);
      const staffProf = effectiveWpn.proficiencyId ?? effectiveWpn.id;
      const expBefore = mage.progression.getProficiencyStat(staffProf).currentExp;
      const ok = combat.castSkill(mage, 'scorch', enemy, 1000);
      assert.strictEqual(ok, true, 'Scorch cast succeeds');
      assert.ok(enemy.hp < 100, 'Spell damage always lands');
      const expAfter = mage.progression.getProficiencyStat(staffProf).currentExp;
      assert.strictEqual(expAfter - expBefore, 2, 'Spell skills retain +2 EXP award even at roll 0.99');
      console.log('  ✓ Scorch spell: guaranteed hit and retains +2 EXP at roll 0.99.');
    }

    Math.random = originalRandom;
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL SKILL ENGINE FIX TESTS PASSED SUCCESSFULLY');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
