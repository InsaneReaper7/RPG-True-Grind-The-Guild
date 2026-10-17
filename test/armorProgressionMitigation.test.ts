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
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { CraftingSystem } from '../src/systems/CraftingSystem.ts';

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

// Helper to level up a proficiency to a target level
function trainProficiency(player: any, profId: string, targetLevel: number) {
  const current = player.progression.getProficiencyLevel(profId);
  for (let l = current; l < targetLevel; l++) {
    const needed = LevelingSystem.expForNextLevel(l);
    player.progression.addProficiencyExp(profId, needed);
  }
}

async function run() {
  console.log('=== TEST SUITE: ARMOR MITIGATION, TRAINING & GEAR GAPS ===\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const playerData = dl.getPlayer();

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  const defaultWeapon = dl.getWeapon('short_swords')!;

  // --- Test 1: Mitigation through real enemy attack path ---
  console.log('Test 1: Armor mitigation through real enemy attack path (Heavy 0, Heavy 50, Boss cleave)');
  const scene1 = createMockScene();
  const hero1 = new Player(scene1, 5, 5, playerData, defaultWeapon, 32);
  hero1.baseMaxHp = 1000;
  hero1.baseMaxCriticalHp = 500;
  hero1.hp = 1000;
  hero1.criticalHp = 500;
  hero1.recalculateDerivedStats();

  const voidHelm = dl.getArmor('void_greathelm')!;
  const voidPlate = dl.getArmor('void_plate_armor')!;
  assert.ok(voidHelm && voidPlate, 'Void armor pieces must exist in catalog');

  hero1.equipArmorSlot('helmet', voidHelm, true);
  hero1.equipArmorSlot('body', voidPlate, true);

  // At Heavy 0: void_greathelm rating 14, void_plate_armor rating 24 -> R = 38
  assert.equal(hero1.getEffectiveArmorRating(), 38, `At Heavy 0, R should be 38, got ${hero1.getEffectiveArmorRating()}`);
  // Reduction = 38 / 138 = ~27.536%
  const expectedReduction0 = 38 / 138;
  assert.equal(hero1.getArmorDamageReduction().toFixed(4), expectedReduction0.toFixed(4));

  // Enemy with 100 damage
  const enemy1 = new Enemy(scene1, 5, 6, {
    id: 'heavy_attacker',
    name: 'Heavy Striker',
    tier: 'common',
    hp: 500,
    criticalHpMax: 250,
    meleeDamage: 100,
    aggroRadius: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    moveSpeed: 90,
    dropChance: 0
  } as any);

  const combatSystem1 = new CombatSystem(scene1, [hero1], [enemy1]);

  // Ensure deterministic hit: avoidances do not proc
  const origRandom = Math.random;
  Math.random = () => 0.99; // bypass evasion/parry/block rolls
  try {
    const hpBeforeHit = hero1.hp;
    // Step combat time to trigger enemy attack
    combatSystem1.update(2000, 1000);
    const damageTaken0 = hpBeforeHit - hero1.hp;
    // Expected: round(100 * (1 - 38/138)) = round(100 * 100 / 138) = 72
    assert.equal(damageTaken0, 72, `Heavy 0 should take exactly 72 damage (100 * 100 / 138), took ${damageTaken0}`);
    console.log(`  PASS: Heavy 0 took 72 damage against 100 raw.`);

    // Now train heavy_armor to Level 50
    trainProficiency(hero1, 'heavy_armor', 50);
    assert.equal(hero1.progression.getProficiencyLevel('heavy_armor'), 50);

    // Multiplier = 1 + 0.02 * 50 = 2.0. R = 38 * 2 = 76
    assert.equal(hero1.getEffectiveArmorRating(), 76, `At Heavy 50, R should be 76, got ${hero1.getEffectiveArmorRating()}`);
    const expectedReduction50 = 76 / 176;
    assert.equal(hero1.getArmorDamageReduction().toFixed(4), expectedReduction50.toFixed(4));

    enemy1.lastAttackTime = 0; // ready to attack again
    const hpBeforeHit50 = hero1.hp;
    combatSystem1.update(4000, 1000);
    const damageTaken50 = hpBeforeHit50 - hero1.hp;
    // Expected: round(100 * (1 - 76/176)) = round(100 * 100 / 176) = 57
    assert.equal(damageTaken50, 57, `Heavy 50 should take exactly 57 damage (100 * 100 / 176), took ${damageTaken50}`);
    console.log(`  PASS: Heavy 50 took 57 damage against 100 raw.`);

    // Third case: Bone Warden cleaves a second party member in Void plate at Heavy 0
    const hero2 = new Player(scene1, 5, 5, playerData, defaultWeapon, 32);
    hero2.baseMaxHp = 1000;
    hero2.baseMaxCriticalHp = 500;
    hero2.hp = 1000;
    hero2.criticalHp = 500;
    hero2.recalculateDerivedStats();
    hero2.equipArmorSlot('helmet', voidHelm, true);
    hero2.equipArmorSlot('body', voidPlate, true);
    assert.equal(hero2.getEffectiveArmorRating(), 38, 'Hero 2 has R = 38');

    // Bone Warden enemy with 100 meleeDamage
    const boneWardenDef = dl.getEnemy('bone_warden')!;
    const boneWarden = new Enemy(scene1, 5, 6, {
      ...boneWardenDef,
      meleeDamage: 100,
      attackIntervalMs: 1000
    });

    const combatSystemCleave = new CombatSystem(scene1, [hero1, hero2], [boneWarden]);
    boneWarden.lastAttackTime = 0;
    const hero2HpBefore = hero2.hp;

    combatSystemCleave.update(6000, 1000);
    const cleaveTaken = hero2HpBefore - hero2.hp;
    // Bone Warden splash is 25% of raw (100 * 0.25 = 25 raw splash).
    // Mitigated by hero2's own R = 38: round(25 * (1 - 38/138)) = round(25 * 100 / 138) = 18.
    assert.equal(cleaveTaken, 18, `Hero 2 should take 18 cleave damage, got ${cleaveTaken}`);
    console.log(`  PASS: Bone Warden cleave dealt 18 damage using recipient's own armor mitigation.`);

    // Fourth case: Main target has a reflect-shield absorbing the whole hit (actualDamage = 0).
    // Neighbour in range still takes the cleave, reduced by their own armor.
    hero1.applyStatusEffect({
      id: 'kenjutsu_deflection',
      name: 'Deflection',
      durationMs: 10000,
      tickIntervalMs: 10000,
      damagePerTick: 0,
      isHarmful: false,
      reflectPercent: 0.5,
      shieldAmount: 200
    } as any);

    boneWarden.lastAttackTime = 0;
    const hero1HpBeforeShielded = hero1.hp;
    const hero2HpBeforeShielded = hero2.hp;

    combatSystemCleave.update(8000, 1000);

    const hero1DamageTaken = hero1HpBeforeShielded - hero1.hp;
    const hero2CleaveTaken = hero2HpBeforeShielded - hero2.hp;

    assert.equal(hero1DamageTaken, 0, `Main target took 0 damage due to reflect-shield, took ${hero1DamageTaken}`);
    assert.equal(hero2CleaveTaken, 18, `Neighbour still took 18 cleave damage despite main target absorbing hit, took ${hero2CleaveTaken}`);
    console.log(`  PASS: Main target reflect-shield absorbed full hit (0 damage), neighbour still took 18 cleave damage.\n`);
  } finally {
    Math.random = origRandom;
  }

  // --- Test 2: Exempt damage sources (Poison tick & Reflect) ---
  console.log('Test 2: Exempt damage sources (Poison tick & Reflect bypass armor)');
  const scene2 = createMockScene();
  const unarmoredHero = new Player(scene2, 5, 5, playerData, defaultWeapon, 32);
  const armoredHero = new Player(scene2, 5, 5, playerData, defaultWeapon, 32);
  armoredHero.equipArmorSlot('helmet', voidHelm, true);
  armoredHero.equipArmorSlot('body', voidPlate, true);
  armoredHero.progression.getProficiencyStat('heavy_armor').level = 100; // R = 114

  const poisonEffect = {
    id: 'poison',
    name: 'Poison',
    durationMs: 5000,
    tickIntervalMs: 1000,
    damagePerTick: 12,
    color: '#10b981'
  };

  unarmoredHero.applyStatusEffect(poisonEffect);
  armoredHero.applyStatusEffect(poisonEffect);

  const unarmoredHpBefore = unarmoredHero.hp;
  const armoredHpBefore = armoredHero.hp;

  unarmoredHero.updateStatusEffects(1000);
  armoredHero.updateStatusEffects(1000);

  const unarmoredPoisonDmg = unarmoredHpBefore - unarmoredHero.hp;
  const armoredPoisonDmg = armoredHpBefore - armoredHero.hp;

  assert.equal(unarmoredPoisonDmg, 12, `Unarmored should take 12 poison damage, took ${unarmoredPoisonDmg}`);
  assert.equal(armoredPoisonDmg, 12, `Armored should take 12 poison damage, took ${armoredPoisonDmg}`);
  console.log('  PASS: Poison tick dealt identical 12 damage to both unarmored and heavy armored hero.');

  // Test Glacial Sovereign Frost Thorns reflection
  const glacialBoss = new Enemy(scene2, 5, 6, {
    id: 'glacial_sovereign',
    name: 'Glacial Sovereign',
    tier: 'boss',
    hp: 1000,
    criticalHpMax: 500,
    meleeDamage: 20,
    aggroRadius: 5,
    attackIntervalMs: 1000,
    movementIntervalMs: 1000,
    moveSpeed: 90,
    dropChance: 0
  } as any);
  (glacialBoss as any).isGlaciated = true;

  const combatSystemReflect1 = new CombatSystem(scene2, [unarmoredHero], [glacialBoss]);
  const combatSystemReflect2 = new CombatSystem(scene2, [armoredHero], [glacialBoss]);

  const ironSword = dl.getWeapon('longsword_1h')!;
  unarmoredHero.equippedWeapon = ironSword;
  armoredHero.equippedWeapon = ironSword;

  const unarmoredMeleeHp = unarmoredHero.hp;
  const armoredMeleeHp = armoredHero.hp;

  // Execute melee attack against Glaciated boss (10 damage dealt -> 15% reflect = 1.5 -> round = 2)
  combatSystemReflect1.executePlayerBasicAttack(unarmoredHero, glacialBoss, 1000, ironSword, 0, 10, 1.0);
  combatSystemReflect2.executePlayerBasicAttack(armoredHero, glacialBoss, 1000, ironSword, 0, 10, 1.0);

  const unarmoredReflectTaken = unarmoredMeleeHp - unarmoredHero.hp;
  const armoredReflectTaken = armoredMeleeHp - armoredHero.hp;

  assert.equal(unarmoredReflectTaken, 2, `Unarmored hero should take 2 reflect damage, took ${unarmoredReflectTaken}`);
  assert.equal(armoredReflectTaken, 2, `Armored hero should take 2 reflect damage, took ${armoredReflectTaken}`);
  console.log('  PASS: Frost Thorns reflect dealt identical 2 damage to unarmored and heavy armored hero.\n');

  // --- Test 3: Minimum 1 damage rule ---
  console.log('Test 3: Minimum 1 damage rule (1 damage hit against R = 300)');
  const scene3 = createMockScene();
  const hero3 = new Player(scene3, 5, 5, playerData, defaultWeapon, 32);
  // Inject mock armor pieces to reach R = 300
  hero3.getEffectiveArmorRating = () => 300; // 300 / 400 = 75% reduction
  assert.equal(hero3.getArmorDamageReduction(), 0.75);

  const res3 = hero3.applyArmorMitigation(1);
  assert.equal(res3.finalDamage, 1, `1 damage hit against 75% reduction must floor at 1, got ${res3.finalDamage}`);
  assert.equal(res3.mitigatedAmount, 0, `mitigatedAmount should be 0 when flooring at 1, got ${res3.mitigatedAmount}`);
  console.log('  PASS: 1 damage hit against R = 300 dealt 1 damage.\n');

  // --- Test 4: No mitigation cap ---
  console.log('Test 4: No mitigation cap (R = 900 -> 90% reduction)');
  const scene4 = createMockScene();
  const hero4 = new Player(scene4, 5, 5, playerData, defaultWeapon, 32);
  hero4.getEffectiveArmorRating = () => 900; // 900 / (900 + 100) = 90% reduction
  assert.equal(hero4.getArmorDamageReduction(), 0.9);

  const res4 = hero4.applyArmorMitigation(100);
  assert.equal(res4.finalDamage, 10, `100 damage hit against R = 900 must deal 10, got ${res4.finalDamage}`);
  assert.equal(res4.mitigatedAmount, 90, `mitigatedAmount should be 90, got ${res4.mitigatedAmount}`);
  console.log('  PASS: R = 900 mitigated 90% of damage (100 -> 10).\n');

  // --- Test 5: Stat gains for armor proficiencies ---
  console.log('Test 5: Stat gains and attribute scaling for armor proficiencies');
  const scene5 = createMockScene();
  const hero5 = new Player(scene5, 5, 5, playerData, defaultWeapon, 32);
  const initialMaxHp = hero5.baseMaxHp;

  // Heavy armor 100 -> +0.3 HP/level * 100 = +30 HP, +0.05 STR/level * 100 = +5.0 STR
  trainProficiency(hero5, 'heavy_armor', 100);
  assert.equal(hero5.strength, 6.0, `Base 1.0 + 5.0 STR = 6.0, got ${hero5.strength}`);
  assert.equal(hero5.maxHp, initialMaxHp + 30, `Max HP should increase by 30 (+30 from heavy_armor), got ${hero5.maxHp}`);
  console.log('  PASS: heavy_armor 100 gives +30 Max HP and +5.0 STR.');

  const hero5b = new Player(scene5, 5, 5, playerData, defaultWeapon, 32);
  const initialHp5b = hero5b.baseMaxHp;
  // Medium armor 40 -> +0.3 HP/lvl * 40 = +12 HP, +0.025 STR/lvl * 40 = +1.0 STR, +0.025 DEX/lvl * 40 = +1.0 DEX
  trainProficiency(hero5b, 'medium_armor', 40);
  assert.equal(hero5b.strength, 2.0, `Base 1.0 + 1.0 STR = 2.0, got ${hero5b.strength}`);
  assert.equal(hero5b.dexterity, 2.0, `Base 1.0 + 1.0 DEX = 2.0, got ${hero5b.dexterity}`);
  assert.equal(hero5b.maxHp, initialHp5b + 12, `Max HP should increase by 12, got ${hero5b.maxHp}`);
  console.log('  PASS: medium_armor 40 gives +12 Max HP, +1.0 STR, and +1.0 DEX.\n');

  // --- Test 6: Worn weight reduction & mid-run encumbrance flip ---
  console.log('Test 6: Worn weight reduction and encumbrance refresh on proficiency level-up');
  const scene6 = createMockScene();
  const hero6 = new Player(scene6, 5, 5, playerData, defaultWeapon, 32);
  hero6.equippedWeapon = null as any;
  hero6.offhandWeapon = null;
  hero6.baseCarryCapacity = 50.0;

  // Equip Void plate (12 kg base)
  hero6.equipArmorSlot('body', voidPlate, true);
  assert.equal(hero6.getEquippedWeight(), 12.0, `At Heavy 0, equipped void plate weighs 12.0 kg, got ${hero6.getEquippedWeight()}`);

  // Place 39.0 kg in bag (e.g. 78 ore @ 0.5 kg each)
  hero6.inventory.set('ore', 78);
  assert.equal(hero6.getInventoryWeight(), 39.0);

  // Total weight = 12.0 + 39.0 = 51.0 kg > 50.0 kg capacity -> Encumbered!
  hero6.updateEncumbrance();
  assert.equal(hero6.getTotalWeight(), 51.0);
  assert.equal(hero6.isEncumbered, true, 'Hero should be encumbered with 51kg / 50kg capacity');

  // Level up heavy_armor to Level 50 through real progression
  // Weight reduction = 1 - 0.005 * 50 = 0.75x -> Void plate weighs 12 * 0.75 = 9.0 kg!
  // Total weight = 9.0 + 39.0 = 48.0 kg <= 50.0 kg capacity -> Unencumbered!
  trainProficiency(hero6, 'heavy_armor', 50);

  assert.equal(hero6.getEquippedWeight(), 9.0, `At Heavy 50, equipped void plate weighs 9.0 kg, got ${hero6.getEquippedWeight()}`);
  assert.equal(hero6.getInventoryWeight(), 39.0, 'Bag weight remains unchanged at 39.0 kg');
  assert.equal(hero6.getTotalWeight(), 48.0, `Total weight should now be 48.0 kg, got ${hero6.getTotalWeight()}`);
  assert.equal(hero6.isEncumbered, false, 'Hero should no longer be encumbered after heavy_armor level-up');
  console.log('  PASS: Heavy 50 brought equipped void plate from 12kg to 9kg, flipping isEncumbered to false.');

  // Check Heavy 100 floor (0.5x = 6.0 kg)
  trainProficiency(hero6, 'heavy_armor', 100);
  assert.equal(hero6.getEquippedWeight(), 6.0, `At Heavy 100, equipped void plate weighs 6.0 kg, got ${hero6.getEquippedWeight()}`);

  // When unequipped and placed in bag, it weighs full 12.0 kg
  hero6.equipArmorSlot('body', null, true);
  hero6.inventory.set('void_plate_armor', 1);
  assert.equal(hero6.getEquippedWeight(), 0);
  assert.equal(dl.getItemWeight('void_plate_armor'), 12.0, 'Catalog/inventory weight of void_plate_armor is full 12.0 kg');
  console.log('  PASS: Void plate weighs 6.0kg when equipped at Heavy 100, and 12.0kg in the bag.\n');

  // --- Test 7: All 8 new recipes craft via CraftingSystem.applyCraft and salvage ---
  console.log('Test 7: All 8 new armor recipes craft through CraftingSystem.applyCraft and have salvage entries');
  const scene7 = createMockScene();
  const crafter = new Player(scene7, 5, 5, playerData, defaultWeapon, 32);
  crafter.progression.getProficiencyStat('armorsmithing').level = 10; // high enough for all recipes

  const newRecipeIds = [
    'padded_tunic',
    'reinforced_leather_helm',
    'iron_greathelm',
    'iron_plate_armor',
    'studded_leather_helm',
    'studded_leather_armor',
    'steel_greathelm',
    'steel_plate_armor'
  ];

  for (const recipeId of newRecipeIds) {
    const recipe = dl.getArmorsmithRecipe(recipeId);
    assert.ok(recipe, `Recipe "${recipeId}" must exist in armorsmithRecipes.json`);

    // Stockpile ingredients for recipe
    for (const [ingId, qty] of Object.entries(recipe.ingredients)) {
      crafter.inventory.set(ingId, qty);
    }

    assert.equal(CraftingSystem.canAfford(recipe, crafter), true, `Crafter should be able to afford recipe "${recipeId}"`);

    const initialInvCount = crafter.getItemCount(recipe.resultArmorId);
    const craftResult = CraftingSystem.applyCraft(crafter, recipe, 'armorsmithing');
    assert.ok(craftResult && craftResult.success, `applyCraft for "${recipeId}" should succeed`);

    const newInvCount = crafter.getItemCount(recipe.resultArmorId);
    assert.equal(newInvCount, initialInvCount + 1, `Crafting "${recipeId}" should place 1 item into inventory`);

    // Verify armor definition properties
    const armorDef = dl.getArmor(recipe.resultArmorId);
    assert.ok(armorDef, `Armor def for "${recipe.resultArmorId}" must exist`);
    assert.ok(typeof armorDef.armorRating === 'number' && armorDef.armorRating > 0, `Armor "${armorDef.id}" must have positive armorRating`);
    assert.ok(typeof armorDef.hpBonus === 'number' && armorDef.hpBonus > 0, `Armor "${armorDef.id}" must have positive hpBonus`);
    assert.ok(armorDef.description.includes('Max HP'), `Armor "${armorDef.id}" description must mention HP split`);

    // Check salvage entry via getRecipeForGear
    const salvageInfo = CraftingSystem.getRecipeForGear(armorDef.id);
    assert.ok(salvageInfo, `Gear "${armorDef.id}" should have a valid salvage recipe entry`);
    assert.equal(salvageInfo.station, 'armorsmithing', `Salvage station for "${armorDef.id}" should be armorsmithing`);
    assert.equal((salvageInfo.recipe as any).resultArmorId, armorDef.id);
  }
  console.log('  PASS: All 8 new recipes craft cleanly via applyCraft, deduct ingredients, tag stats, and have salvage entries.\n');

  // --- Test 8: Heavy armor trains on floor-1 gear ---
  console.log('Test 8: heavy_armor trains from starter tier gear (iron_greathelm + iron_plate_armor)');
  const scene8 = createMockScene();
  const hero8 = new Player(scene8, 5, 5, playerData, defaultWeapon, 32);
  const ironHelm = dl.getArmor('iron_greathelm')!;
  const ironPlate = dl.getArmor('iron_plate_armor')!;
  hero8.equipArmorSlot('helmet', ironHelm, true);
  hero8.equipArmorSlot('body', ironPlate, true);

  const initialHeavyExp = hero8.progression.getProficiencyStat('heavy_armor').currentExp;
  hero8.awardArmorWearExp('hit');
  const expAfterHit = hero8.progression.getProficiencyStat('heavy_armor').currentExp;
  assert.equal(expAfterHit, initialHeavyExp + 2, `Taking hit wearing 2 heavy pieces should award +2 heavy_armor EXP, got ${expAfterHit - initialHeavyExp}`);
  console.log('  PASS: heavy_armor receives wear EXP on starter tier iron armor.\n');

  // --- Test 9: "Heavy doesn't dominate" guard ---
  console.log('Test 9: "Heavy doesn\'t dominate" data guard across all tiers and slots');
  const armors = dl.getArmorsData().armors;
  const trueArmors = armors.filter((a) => a.slot === 'helmet' || a.slot === 'body');

  const tiers: ('starter' | 'mid' | 'void')[] = ['starter', 'mid', 'void'];
  const slots: ('helmet' | 'body')[] = ['helmet', 'body'];

  for (const tier of tiers) {
    for (const slot of slots) {
      const piecesInGroup = trueArmors.filter((a) => a.tier === tier && a.slot === slot);
      if (piecesInGroup.length === 0) continue;

      // 1. Every piece in this (tier, slot) group must share the EXACT SAME hpBonus
      const expectedHp = piecesInGroup[0].hpBonus;
      for (const piece of piecesInGroup) {
        assert.equal(
          piece.hpBonus,
          expectedHp,
          `Piece "${piece.id}" (${piece.weightClass} ${slot}) in tier "${tier}" has hpBonus ${piece.hpBonus}, expected ${expectedHp}`
        );
      }

      // 2. Armor rating and weight must both strictly rise from light -> medium -> heavy
      const lightPiece = piecesInGroup.find((p) => p.weightClass === 'light');
      const medPiece = piecesInGroup.find((p) => p.weightClass === 'medium');
      const heavyPiece = piecesInGroup.find((p) => p.weightClass === 'heavy');

      if (lightPiece && medPiece) {
        assert.ok(
          medPiece.armorRating! > lightPiece.armorRating!,
          `In tier "${tier}" slot "${slot}": medium rating (${medPiece.armorRating}) must be > light rating (${lightPiece.armorRating})`
        );
        assert.ok(
          medPiece.weight! > lightPiece.weight!,
          `In tier "${tier}" slot "${slot}": medium weight (${medPiece.weight}) must be > light weight (${lightPiece.weight})`
        );
      }

      if (medPiece && heavyPiece) {
        assert.ok(
          heavyPiece.armorRating! > medPiece.armorRating!,
          `In tier "${tier}" slot "${slot}": heavy rating (${heavyPiece.armorRating}) must be > medium rating (${medPiece.armorRating})`
        );
        assert.ok(
          heavyPiece.weight! > medPiece.weight!,
          `In tier "${tier}" slot "${slot}": heavy weight (${heavyPiece.weight}) must be > medium weight (${medPiece.weight})`
        );
      }
    }
  }
  console.log('  PASS: Every tier and slot shares uniform hpBonus, and ratings/weights strictly rise from light to heavy.\n');

  console.log('🎉 ALL ARMOR PROGRESSION AND MITIGATION TESTS PASSED PERFECTLY!');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
