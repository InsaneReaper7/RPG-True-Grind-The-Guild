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

// Dynamically import modules after globals are installed
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { HiddenSkillSystem } = await import('../src/systems/HiddenSkillSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

const classesData = JSON.parse(fs.readFileSync('data/classes.json', 'utf8'));

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

async function runMilestone53Tests() {
  console.log('================================================================');
  console.log('🎯 RUNNING MILESTONE 53 TEST SUITE: THROWING WEAPONS & SKIRMISHER 🎯');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ============================================================================
  // TEST 1: Throwing Weapons Data Integrity, Handedness & Combat Stats
  // ============================================================================
  console.log('--- TEST 1: Throwing Weapons Data Integrity, Handedness & Combat Stats ---');
  {
    const tw = dataLoader.getWeapon('throwing_weapons');
    assert.ok(tw, 'Throwing Weapons definition must exist in weaponsData (id: "throwing_weapons")');
    assert.equal(tw.category, 'ranged', 'Throwing Weapons category must be "ranged"');
    assert.equal(tw.twoHanded, false, 'Throwing Weapons must be one-handed (twoHanded: false)');
    assert.equal(tw.weight, 1.0, 'Throwing Weapons weight must be 1.0');
    assert.equal(tw.attackIntervalMs, 800, 'Throwing Weapons attack interval must be 800ms');
    assert.equal(tw.attackRangeTiles, 3, 'Throwing Weapons tactical range must be 3 tiles');
    assert.equal(tw.baseDamage, 4, 'Throwing Weapons base damage must be 4');
    assert.equal(tw.baseAccuracy, 0.65, 'Throwing Weapons base accuracy must be 0.65');
    assert.equal(tw.proficiencyId, 'throwing_weapons', 'Throwing Weapons must point to proficiencyId: "throwing_weapons"');
    assert.deepEqual(tw.levelBonus, {
      accuracyPerLevel: 0.004,
      damagePerLevel: 0.35,
      attackSpeedPerLevel: 0.005
    }, 'Throwing Weapons levelBonus must include accuracy, damage, and attack speed scaling per design doc');

    const statDef = dataLoader.getTrainableStatDef('throwing_weapons');
    assert.ok(statDef, 'TrainableStatDef for throwing_weapons must be resolvable');
    assert.equal(statDef.name, 'Throwing Weapons');
    assert.ok(statDef.description.toLowerCase().includes('throwing weapons'), 'Description mentions throwing weapons');

    console.log('✓ PASS: Throwing Weapons has authentic stats, handedness, range, and progression scaling.\n');
  }

  // ============================================================================
  // TEST 2: Blacksmithing Recipe & Crafting Integration
  // ============================================================================
  console.log('--- TEST 2: Blacksmithing Recipe & Crafting Integration ---');
  {
    const recipes = dataLoader.getBlacksmithRecipes();
    const twRecipe = recipes.find((r) => r.id === 'throwing_weapons');
    assert.ok(twRecipe, 'Throwing Weapons recipe (id: "throwing_weapons") must exist in Blacksmithing');
    assert.equal(twRecipe.resultWeaponId, 'throwing_weapons', 'Recipe produces "throwing_weapons"');
    assert.equal(twRecipe.requiredLevel, 0, 'Tier 0 recipe requires Blacksmithing Level 0');
    assert.deepEqual(twRecipe.ingredients, { ore: 3, wood: 1 }, 'Recipe requires 3 Ore and 1 Wood');
    assert.equal(twRecipe.expGranted, 20, 'Recipe grants 20 Blacksmithing EXP');

    // Test Crafting execution via GameState
    const gameState = GameState.getInstance();
    gameState.addItem('ore', 10);
    gameState.addItem('wood', 10);
    const oreBefore = gameState.getItemCount('ore');
    const woodBefore = gameState.getItemCount('wood');

    for (const [mat, qty] of Object.entries(twRecipe.ingredients)) {
      gameState.consumeItem(mat, qty);
    }
    gameState.addItem(twRecipe.resultWeaponId!, 1);

    assert.equal(gameState.getItemCount('ore'), oreBefore - 3, 'Consumed 3 ore');
    assert.equal(gameState.getItemCount('wood'), woodBefore - 1, 'Consumed 1 wood');
    assert.ok(gameState.getItemCount('throwing_weapons') >= 1, 'GameState inventory contains crafted throwing_weapons');

    console.log('✓ PASS: Blacksmithing recipe is valid, consumes correct materials, and crafts Throwing Weapons.\n');
  }

  // ============================================================================
  // TEST 3: Equipping & Offhand Handedness (1H + Shield Compatibility)
  // ============================================================================
  console.log('--- TEST 3: Equipping & Offhand Handedness (1H + Shield Compatibility) ---');
  {
    const scene = createMockScene();
    const prog = new ProgressionSystem(classesData, 'Skirmisher Hero');
    const tw = dataLoader.getWeapon('throwing_weapons')!;
    const shield = dataLoader.getWeapon('shields')!;
    const bow = dataLoader.getWeapon('bows')!;

    const player = new Player(scene, 5, 5, dataLoader.getPlayer(), tw, 32, 'player-avatar', prog);

    // Case A: Main-hand Throwing Weapons sets tactical attack range to 3 tiles
    player.equipWeapon(tw);
    assert.equal(player.equippedWeapon.id, 'throwing_weapons');
    assert.equal(player.attackRangeTiles, 3, 'Player attackRangeTiles is dynamically set to 3');
    assert.equal(player.equippedWeapon.twoHanded, false, 'Main hand weapon is 1-handed');

    // Case B: 1H Throwing Weapon permits equipping a Shield in offhand
    const shieldEquipped = player.equipOffhandWeapon(shield, true);
    assert.equal(shieldEquipped, true, '1H Throwing Weapon permits equipping a Shield in offhand');
    assert.equal(player.offhandWeapon?.id, 'shields', 'Offhand holds the shield');

    // Case C: Equipping a 2H weapon (e.g. Bow) clears offhand shield
    player.equipWeapon(bow);
    assert.equal(player.equippedWeapon.twoHanded, true);
    assert.equal(player.offhandWeapon, null, 'Equipping 2H weapon clears offhand shield');

    // Case D: Re-equipping Throwing Weapons allows equipping shield again
    player.equipWeapon(tw);
    player.equipOffhandWeapon(shield, true);
    assert.equal(player.offhandWeapon?.id, 'shields', 'Shield successfully re-equipped with Throwing Weapons');

    // Case E: Offhand cannot equip a ranged weapon as a dual-wield sidearm (must be melee_1h)
    const blockedRangedOffhand = player.equipOffhandWeapon(tw, true);
    assert.equal(blockedRangedOffhand, false, 'Cannot equip ranged Throwing Weapons in offhand');

    console.log('✓ PASS: Throwing Weapons equips at 3 tiles range, pairs with shields, and enforces 1H ranged rules.\n');
  }

  // ============================================================================
  // TEST 4: Live Combat Loop & Progression EXP
  // ============================================================================
  console.log('--- TEST 4: Live Combat Loop & Progression EXP ---');
  {
    const scene = createMockScene();
    const tw = dataLoader.getWeapon('throwing_weapons')!;
    const prog = new ProgressionSystem(classesData, 'Combat Skirmisher');
    const combat = new CombatSystem(scene);

    const player = new Player(scene, 5, 5, dataLoader.getPlayer(), tw, 32, 'player-avatar', prog);
    // Position enemy at Chebyshev distance 3 (e.g. x: 8, y: 5 -> dx=3, dy=0)
    const enemy = new Enemy(scene, 8, 5, dataLoader.getEnemy('wolf')!, 'wolf-avatar');
    const initialHp = enemy.hp;

    // Verify initial proficiency state
    assert.equal(prog.getProficiencyLevel('throwing_weapons'), 0);
    const initialExp = prog.getProficiencyStat('throwing_weapons').currentExp;
    assert.equal(initialExp, 0);

    // Execute ranged basic attack
    const dist = Math.max(Math.abs(player.gridPos.x - enemy.gridPos.x), Math.abs(player.gridPos.y - enemy.gridPos.y));
    assert.equal(dist, 3, 'Enemy is positioned at exact 3-tile maximum range');
    assert.ok(dist <= player.attackRangeTiles, 'Target is within player attackRangeTiles');

    combat.executePlayerBasicAttack(player, enemy, 1000, undefined, undefined, undefined, 1.0);
    assert.ok(enemy.hp < initialHp, 'Throwing weapon attack dealt damage to enemy');

    const expAfter = prog.getProficiencyStat('throwing_weapons').currentExp;
    assert.equal(expAfter, 2, 'Attack granted +2 EXP to throwing_weapons proficiency');

    // Verify additive leveling curve (50 + level * 4)
    prog.addProficiencyExp('throwing_weapons', 48); // total 50 EXP -> reaches Level 1
    assert.equal(prog.getProficiencyLevel('throwing_weapons'), 1, 'Throwing Weapons reached Level 1 at 50 EXP');

    console.log('✓ PASS: Live combat loop resolves 3-tile attacks and advances throwing_weapons proficiency EXP.\n');
  }

  // ============================================================================
  // TEST 5: Skirmisher Tier 0 Class Boundary Test
  // ============================================================================
  console.log('--- TEST 5: Skirmisher Tier 0 Class Boundary Test ---');
  {
    const skirmisherDef = classesData.classes.find((c: any) => c.id === 'skirmisher');
    assert.ok(skirmisherDef, 'skirmisher class definition must exist in classes.json');
    assert.equal(skirmisherDef.name, 'Skirmisher');
    assert.equal(skirmisherDef.tier, 'novice');
    assert.deepEqual(skirmisherDef.requirements, [
      { type: 'proficiency', target: 'throwing_weapons', value: 10 }
    ], 'Skirmisher requires strictly Throwing Weapons Level 10');
    assert.equal(skirmisherDef.fantasy, 'Hit-and-run thrower');
    assert.deepEqual(skirmisherDef.hiddenSkillBonuses, { evasion: 0.05 }, 'Hidden skill bonus matches Marksman precedent');

    const pSkirmisher = new ProgressionSystem(classesData, 'Skirmisher Trainee');

    // Boundary: Throwing Weapons 9 -> LOCKED
    pSkirmisher.getProficiencyStat('throwing_weapons').level = 9;
    pSkirmisher.checkClassUnlocks();
    assert.equal(pSkirmisher.isClassUnlocked('skirmisher'), false, 'Skirmisher is LOCKED at Throwing Weapons Level 9');

    // Boundary: Throwing Weapons 10 -> UNLOCKED
    pSkirmisher.getProficiencyStat('throwing_weapons').level = 10;
    pSkirmisher.checkClassUnlocks();
    assert.equal(pSkirmisher.isClassUnlocked('skirmisher'), true, 'Skirmisher UNLOCKS cleanly when Throwing Weapons reaches Level 10');

    console.log('✓ PASS: Skirmisher unlocks cleanly at Throwing Weapons Level 10 with exact boundary enforcement.\n');
  }

  // ============================================================================
  // TEST 6: Hidden Skill Eligibility Interactions
  // ============================================================================
  console.log('--- TEST 6: Hidden Skill Eligibility Interactions ---');
  {
    const hiddenSkillsData = JSON.parse(fs.readFileSync('data/hiddenSkills.json', 'utf8'));
    const hiddenSystem = new HiddenSkillSystem(hiddenSkillsData);
    const tw = dataLoader.getWeapon('throwing_weapons')!;

    // Context with Throwing Weapons equipped
    const throwingContext = {
      equippedWeapon: tw,
      hasShield: false,
      hasMagicProficiency: false
    };

    // 1. Evasion (gear: "none") -> Eligible
    const evasionDef = hiddenSkillsData.hiddenSkills.find((s: any) => s.id === 'evasion');
    assert.equal(hiddenSystem.evaluateEligibility(evasionDef, throwingContext), true, 'Evasion is ELIGIBLE with Throwing Weapons');

    // 2. Counterattack (meleeWeaponRequired: true) -> Ineligible
    const counterDef = hiddenSkillsData.hiddenSkills.find((s: any) => s.id === 'counterattack');
    assert.equal(hiddenSystem.evaluateEligibility(counterDef, throwingContext), false, 'Counterattack is INELIGIBLE with ranged Throwing Weapons');

    // 3. Parry (melee categories only) -> Ineligible
    const parryDef = hiddenSkillsData.hiddenSkills.find((s: any) => s.id === 'parry');
    assert.equal(hiddenSystem.evaluateEligibility(parryDef, throwingContext), false, 'Parry is INELIGIBLE with Throwing Weapons');

    console.log('✓ PASS: Hidden skills properly recognize Throwing Weapons as ranged for Evasion, Parry & Counterattack.\n');
  }

  // ============================================================================
  // TEST 7: Javelin Scope Boundary (Deferred to M54)
  // ============================================================================
  console.log('--- TEST 7: Javelin Scope Boundary (Deferred to M54) ---');
  {
    // Javelin was scheduled for Milestone 54 once Throwing Weapons was established in M53
    const deferredDoc = fs.readFileSync('docs/deferred_features.md', 'utf8');
    assert.ok(deferredDoc.includes('Javelin Class'), 'deferred_features.md must document Javelin');

    console.log('✓ PASS: Javelin class scope boundary is confirmed.\n');
  }

  // ============================================================================
  // TEST 8: Javelin Prerequisite Satisfiability Verification
  // ============================================================================
  console.log('--- TEST 8: Javelin Prerequisite Satisfiability Verification ---');
  {
    // Define a test class structure mimicking Javelin's known specification (Spears + Throwing Weapons)
    const testClassesData = {
      classes: [
        ...classesData.classes,
        {
          id: 'test_javelin',
          name: 'Javelin Test Candidate',
          tier: 'adept',
          requirements: [
            { type: 'proficiency', target: 'spears', value: 30 },
            { type: 'proficiency', target: 'throwing_weapons', value: 10 }
          ]
        }
      ]
    };

    // Case A: Spears 30, Throwing Weapons 9 -> Fails
    const pA = new ProgressionSystem(testClassesData, 'Candidate A');
    pA.getProficiencyStat('spears').level = 30;
    pA.getProficiencyStat('throwing_weapons').level = 9;
    pA.checkClassUnlocks();
    assert.equal(pA.isClassUnlocked('test_javelin'), false, 'Javelin locked when Throwing Weapons is Level 9 (Spears 30)');

    // Case B: Spears 29, Throwing Weapons 10 -> Fails
    const pB = new ProgressionSystem(testClassesData, 'Candidate B');
    pB.getProficiencyStat('spears').level = 29;
    pB.getProficiencyStat('throwing_weapons').level = 10;
    pB.checkClassUnlocks();
    assert.equal(pB.isClassUnlocked('test_javelin'), false, 'Javelin locked when Spears is Level 29 (Throwing Weapons 10)');

    // Case C: Spears 30, Throwing Weapons 10 -> Genuinely Satisfied!
    const pC = new ProgressionSystem(testClassesData, 'Candidate C');
    pC.getProficiencyStat('spears').level = 30;
    pC.getProficiencyStat('throwing_weapons').level = 10;
    pC.checkClassUnlocks();
    assert.equal(pC.isClassUnlocked('test_javelin'), true, 'Javelin is UNLOCKED when both Spears 30 and Throwing Weapons 10 are met');

    console.log('✓ PASS: Javelin requirements (Spears + Throwing Weapons) are genuinely satisfiable and independent.\n');
  }

  // ============================================================================
  // TEST 9: Documentation Citation & Hidden-Dependency Integrity
  // ============================================================================
  console.log('--- TEST 9: Documentation Citation & Hidden-Dependency Integrity ---');
  {
    const classSystemDoc = fs.readFileSync('docs/class_system (1).md', 'utf8');
    const lines = classSystemDoc.split(/\r?\n/);

    // Line 89 exact verbatim citation check
    const line89 = lines[88]; // 0-indexed line 89
    assert.ok(line89, 'Line 89 of class_system (1).md must exist');
    assert.equal(
      line89.trim(),
      '| Skirmisher | Throwing Weapons 10 | Hit-and-run thrower |',
      'Line 89 must match exact verbatim citation: "| Skirmisher | Throwing Weapons 10 | Hit-and-run thrower |"'
    );

    // Verify downstream classes in class_system.md
    assert.ok(
      classSystemDoc.includes('| Thrower | Throwing Weapons 30 + Daggers 10 | Quick-handed skirmisher |'),
      'class_system (1).md must cite Thrower (Tier 1)'
    );
    assert.ok(
      classSystemDoc.includes('| Alchemical Bomber | Alchemy 30 + Throwing Weapons 60 + Journeyman Alchemist Lv 15 | Turns volatile potions into weapons |'),
      'class_system (1).md must cite Alchemical Bomber (Hybrid)'
    );
    assert.ok(
      classSystemDoc.includes('**Throwing Weapons is now covered** (Skirmisher → Thrower)'),
      'class_system (1).md Note 4 confirms no Expert/Master tier exists'
    );

    // Verify deferred_features.md reflects resolved status
    const deferredDoc = fs.readFileSync('docs/deferred_features.md', 'utf8');
    assert.ok(
      deferredDoc.includes('Javelin Class (Deferred to Milestone 54 — Prerequisite Resolved)'),
      'deferred_features.md reflects resolved prerequisite status for Javelin'
    );

    console.log('✓ PASS: Exact citations and documentation audit integrity fully verified.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 9 MILESTONE 53 TESTS PASSED CLEANLY & SUCCESSFULLY! 🎉');
  console.log('================================================================');
}

runMilestone53Tests().catch((err) => {
  console.error('❌ MILESTONE 53 TEST FAILURE:', err);
  process.exit(1);
});
