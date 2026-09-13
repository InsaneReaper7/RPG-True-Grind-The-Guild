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
import type { WeaponDef, EnemyDef, GridPos } from '../src/types/game.ts';

async function runMilestone21Tests() {
  console.log('=== RUNNING MILESTONE 21: BLACKSMITHING & MACE EXPANSION UNIT TESTS ===\n');

  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');

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
        circle: () => createMockObj(),
        sprite: () => createMockObj(),
        line: () => createMockObj(),
        existing: (item: any) => item
      },
      tweens: {
        add: (config: any) => {
          if (config && config.onComplete) {
            config.onComplete();
          }
          return { stop: () => {} };
        }
      }
    };
  }

  // Ensure data loader is ready
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // Test 1: Blacksmithing Station Data & Research Node Unlocks
  console.log('Test 1: Blacksmithing Station & Research Unlock Definition...');
  const buildables = dataLoader.getBuildables();
  const bsStation = buildables.find(b => b.id === 'blacksmithing_station');
  assert.ok(bsStation, 'blacksmithing_station buildable must exist');
  assert.equal(bsStation.lockedByDefault, true, 'blacksmithing_station must be lockedByDefault');
  assert.equal(bsStation.roomTag, 'blacksmithing', 'blacksmithing_station must have roomTag blacksmithing');
  assert.equal(bsStation.indoorRequired, true, 'blacksmithing_station must require indoor');

  const researchTree = dataLoader.getResearchNodes();
  const bsResearch = researchTree.find(r => r.targetBuildableId === 'blacksmithing_station');
  assert.ok(bsResearch, 'Research node unlocking blacksmithing_station must exist');
  assert.equal(bsResearch.id, 'research_blacksmithing_station', 'Research node id matches');

  const rooms = dataLoader.getRoomRules();
  const smithyRoom = rooms.find(r => r.id === 'smithy');
  assert.ok(smithyRoom, 'smithy room classification rule must exist');
  assert.ok(smithyRoom.requiredTags.includes('blacksmithing'), 'smithy must require blacksmithing tag');
  console.log('✓ Test 1 Passed: Blacksmithing station buildable, research unlock, and smithy room verified.\n');

  // Test 2: Mace Weapon Family & Shared Proficiency Mapping
  console.log('Test 2: Mace Weapon Family & Shared Proficiency Mapping...');
  const mace = dataLoader.getWeapon('mace');
  assert.ok(mace, 'mace weapon must exist');
  assert.equal(mace.baseDamage, 7);
  assert.equal(mace.category, 'melee_1h');
  assert.equal(mace.twoHanded, false);
  assert.equal(mace.stunChance, 0.15);
  assert.ok(mace.levelBonus?.stunChancePerLevel !== undefined);

  const heavyMace = dataLoader.getWeapon('heavy_mace');
  assert.ok(heavyMace, 'heavy_mace weapon must exist');
  assert.equal(heavyMace.baseDamage, 10);
  assert.equal(heavyMace.stunChance, 0.20);
  assert.equal(heavyMace.proficiencyId, 'mace', 'heavy_mace must map to mace proficiencyId');

  const morningstar = dataLoader.getWeapon('spiked_morningstar');
  assert.ok(morningstar, 'spiked_morningstar weapon must exist');
  assert.equal(morningstar.baseDamage, 13);
  assert.equal(morningstar.stunChance, 0.25);
  assert.equal(morningstar.proficiencyId, 'mace', 'spiked_morningstar must map to mace proficiencyId');
  console.log('✓ Test 2 Passed: Mace family stats and shared proficiencyId verified.\n');

  // Test 3: Tier-Unlocked Blacksmith Recipes & Crafting Consumption
  console.log('Test 3: Tier-Unlocked Blacksmith Recipes & Crafting Consumption...');
  const recipes = dataLoader.getBlacksmithRecipes();
  assert.equal(recipes.length, 3, 'Must have exactly 3 blacksmith recipes');
  
  const rMace = dataLoader.getBlacksmithRecipe('mace');
  assert.ok(rMace);
  assert.equal(rMace.requiredLevel, 0);
  assert.equal(rMace.ingredients.ore, 4);
  assert.equal(rMace.ingredients.wood, 2);

  const rHeavy = dataLoader.getBlacksmithRecipe('heavy_mace');
  assert.ok(rHeavy);
  assert.equal(rHeavy.requiredLevel, 5);
  assert.equal(rHeavy.ingredients.ore, 6);
  assert.equal(rHeavy.ingredients.steel_scrap, 3);
  assert.equal(rHeavy.ingredients.orc_heavy_hide, 1);

  const rStar = dataLoader.getBlacksmithRecipe('spiked_morningstar');
  assert.ok(rStar);
  assert.equal(rStar.requiredLevel, 10);
  assert.equal(rStar.ingredients.ore, 8);
  assert.equal(rStar.ingredients.steel_scrap, 5);
  assert.equal(rStar.ingredients.orc_heavy_hide, 2);

  // Test crafting consumption & EXP
  const gameState = GameState.getInstance();
  const playerProg = new ProgressionSystem();
  gameState.addItem('ore', 20);
  gameState.addItem('wood', 10);
  gameState.addItem('steel_scrap', 10);
  gameState.addItem('orc_heavy_hide', 5);

  const initialOre = gameState.getItemCount('ore');
  const initialHide = gameState.getItemCount('orc_heavy_hide');
  const initialSteel = gameState.getItemCount('steel_scrap');

  // Craft heavy mace
  for (const [item, qty] of Object.entries(rHeavy.ingredients)) {
    gameState.consumeItem(item, qty);
  }
  gameState.addItem(rHeavy.resultWeaponId, 1);
  playerProg.addProficiencyExp('blacksmithing', rHeavy.expGranted);

  assert.equal(gameState.getItemCount('ore'), initialOre - 6);
  assert.equal(gameState.getItemCount('steel_scrap'), initialSteel - 3);
  assert.equal(gameState.getItemCount('orc_heavy_hide'), initialHide - 1);
  assert.equal(gameState.getItemCount('heavy_mace'), 1);
  assert.equal(playerProg.getProficiencyStat('blacksmithing').level, 1);
  console.log('✓ Test 3 Passed: Blacksmith recipes consume elite drops and award EXP.\n');

  // Test 4: Bludgeoner Novice Class & Crushing Blow Skill
  console.log('Test 4: Bludgeoner Novice Class & Crushing Blow Skill...');
  const bludgeonerClass = dataLoader.getClass('bludgeoner');
  assert.ok(bludgeonerClass, 'bludgeoner class must exist in classes.json');
  assert.equal(bludgeonerClass.name, 'Bludgeoner');
  assert.equal(bludgeonerClass.tier, 'novice');
  assert.equal(bludgeonerClass.requirements[0].type, 'proficiency');
  assert.equal(bludgeonerClass.requirements[0].target, 'mace');
  assert.equal(bludgeonerClass.requirements[0].value, 10);
  assert.equal(bludgeonerClass.hiddenSkillBonuses?.resilience, 0.05);

  // Test unlock evaluation
  const progClass = new ProgressionSystem();
  assert.equal(progClass.isClassUnlocked('bludgeoner'), false, 'Bludgeoner should be locked at mace Lv 0');
  
  // Set mace level to 10
  for (let i = 0; i < 10; i++) {
    progClass.addProficiencyExp('mace', 1000);
  }
  assert.ok(progClass.getProficiencyLevel('mace') >= 10, 'Mace level should now be >= 10');
  assert.equal(progClass.isClassUnlocked('bludgeoner'), true, 'Bludgeoner class must unlock at Mace Level 10');

  const crushingBlow = dataLoader.getSkill('crushing_blow');
  assert.ok(crushingBlow, 'crushing_blow skill must exist');
  assert.equal(crushingBlow.requirements[0].target, 'bludgeoner');
  assert.equal(crushingBlow.damageMultiplier, 1.8);
  assert.equal(crushingBlow.stunDurationMs, 2000);
  console.log('✓ Test 4 Passed: Bludgeoner class unlock and Crushing Blow skill verified.\n');

  // Test 5: Dual Wielding Level 30 Unlock Deduplication with Mace Variants
  console.log('Test 5: Dual Wielding Unlock Deduplication...');
  const progDW = new ProgressionSystem();
  // Level up mace to 30
  for (let i = 0; i < 30; i++) {
    progDW.addProficiencyExp('mace', 2000);
  }
  assert.equal(progDW.getProficiencyLevel('mace') >= 30, true);
  // Mace alone (despite heavy_mace / spiked_morningstar existing) must NOT trigger DW unlock!
  assert.equal(progDW.isDualWieldUnlocked(), false, 'Single mace proficiency must not trigger dual wield unlock');

  // Now level up short_swords to 30
  for (let i = 0; i < 30; i++) {
    progDW.addProficiencyExp('short_swords', 2000);
  }
  assert.equal(progDW.getProficiencyLevel('short_swords') >= 30, true);
  // Now we have two distinct 1H melee proficiencies (mace + short_swords) at Lv 30
  assert.equal(progDW.isDualWieldUnlocked(), true, 'Two distinct 1H melee weapon proficiencies at Lv 30 must unlock DW');
  console.log('✓ Test 5 Passed: Dual Wielding unlock deduplication verified.\n');

  // Test 6: Mixed Dual-Wield Proficiency Isolation Test
  console.log('Test 6: Mixed Dual-Wield Proficiency Isolation Test...');
  const scene = createMockScene();
  const heroProg = new ProgressionSystem();
  
  // Create hero and dummy enemy
  const playerData = dataLoader.getPlayer();
  const ssDef = dataLoader.getWeapon('short_swords')!;
  const heavyMaceDef = dataLoader.getWeapon('heavy_mace')!;
  const hero = new Player(scene, 5, 5, playerData, ssDef, 32, 'player-avatar', heroProg);
  
  // Level up two 1H melee weapons to 30 to unlock DW cleanly
  for (let i = 0; i < 30; i++) {
    heroProg.addProficiencyExp('short_swords', 2000);
    heroProg.addProficiencyExp('mace', 2000);
  }
  assert.equal(heroProg.isDualWieldUnlocked(), true);
  hero.equipOffhandWeapon(heavyMaceDef); // Uses heavy_mace which maps to mace proficiencyId!

  const enemyDef: EnemyDef = {
    id: 'test_golem',
    name: 'Test Golem',
    hp: 500,
    damage: 1,
    attackIntervalMs: 5000,
    movementIntervalMs: 5000,
    aggroRangeTiles: 1,
    expReward: 10,
    spriteSheet: 'enemy-orc'
  };
  const dummyTarget = new Enemy(scene, 6, 5, enemyDef);
  hero.setTarget(dummyTarget);

  const combat = new CombatSystem(scene, [hero], [dummyTarget]);

  const initialSSExp = heroProg.getProficiencyStat('short_swords').currentExp;
  const initialMaceExp = heroProg.getProficiencyStat('mace').currentExp;
  const initialDWExp = heroProg.getProficiencyStat('dual_wielding').currentExp;

  // Simulate combat tick with 100% accuracy mock
  const originalRandom = Math.random;
  Math.random = () => 0.01; // Always hits, no random misses
  try {
    // Advance combat timer to trigger auto-attack
    combat.update(hero.equippedWeapon.attackIntervalMs + 100);

    const postSSExp = heroProg.getProficiencyStat('short_swords').currentExp;
    const postMaceExp = heroProg.getProficiencyStat('mace').currentExp;
    const postDWExp = heroProg.getProficiencyStat('dual_wielding').currentExp;

    assert.ok(postSSExp > initialSSExp, 'short_swords EXP must increase from main-hand attack');
    assert.ok(postMaceExp > initialMaceExp, 'mace EXP must increase from offhand attack (via heavy_mace.proficiencyId)');
    assert.ok(postDWExp > initialDWExp, 'dual_wielding EXP must increase from offhand attack');
    
    // Check clean isolation: exactly 2 EXP to each weapon proficiency
    assert.equal(postSSExp - initialSSExp, 2, 'Main-hand hit credits exactly 2 EXP to short_swords');
    assert.equal(postMaceExp - initialMaceExp, 2, 'Offhand hit credits exactly 2 EXP to mace (resolved from heavy_mace)');
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ Test 6 Passed: Main-hand and offhand independently and cleanly credit their own proficiencies.\n');

  // Test 7: Stun Status Effect Application from Mace Hit
  console.log('Test 7: Stun Status Effect Proc from Mace Hit...');
  const morningstarDef = dataLoader.getWeapon('spiked_morningstar')!;
  const maceHero = new Player(scene, 5, 5, playerData, morningstarDef, 32, 'player-avatar', new ProgressionSystem());
  const targetEnemy = new Enemy(scene, 6, 5, enemyDef);
  maceHero.setTarget(targetEnemy);
  const combatStun = new CombatSystem(scene, [maceHero], [targetEnemy]);

  // Force stun roll to succeed
  Math.random = () => 0.01; // Roll is 0.01 < 0.25 -> Stun procs
  try {
    combatStun.update(maceHero.equippedWeapon.attackIntervalMs + 100);
    assert.equal(targetEnemy.activeStatusEffects.has('stun'), true, 'Enemy must have stun status effect applied on mace hit');
  } finally {
    Math.random = originalRandom;
  }
  console.log('✓ Test 7 Passed: Stun status effect procs and applies to target on mace attack.\n');

  console.log('=== ALL MILESTONE 21 UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runMilestone21Tests().catch((err) => {
  console.error('Milestone 21 Unit Test Failure:', err);
  process.exit(1);
});
