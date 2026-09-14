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
import type { WeaponDef, ArmorDef, PlayerData, CharacterSnapshot } from '../src/types/game.ts';
import { getArmorHpSplit } from '../src/types/game.ts';

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

async function runMilestone33Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 33: SECOND ARMOR WAVE (NECKLACE, RING, ACCESSORY)');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');

  // Load game registries
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const mockScene = createMockScene();
  const basePlayerData: PlayerData = {
    name: 'Guild Guardian',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords'
  };
  const startingWeapon = dataLoader.getWeapon('short_swords')!;

  // ----------------------------------------------------------------
  // TEST 1: Data Registry Integrity & Dangling Resource Recipes
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Data Registry Integrity & Dangling Resource Recipes ---');
  const allArmors = dataLoader.getAllArmors();
  assert.ok(allArmors.length >= 7, 'Must have at least 7 armor pieces defined');

  // Verify all 5 slots exist in the armors list
  const helmets = dataLoader.getArmorsBySlot('helmet');
  const bodies = dataLoader.getArmorsBySlot('body');
  const necklaces = dataLoader.getArmorsBySlot('necklace');
  const rings = dataLoader.getArmorsBySlot('ring');
  const accessories = dataLoader.getArmorsBySlot('accessory');

  assert.ok(helmets.length >= 2, 'Must have at least 2 helmets (leather_cap, silk_cowl)');
  assert.ok(bodies.length >= 2, 'Must have at least 2 body armors (leather_armor, silk_robe)');
  assert.ok(necklaces.length >= 1, 'Must have at least 1 necklace (bone_necklace)');
  assert.ok(rings.length >= 1, 'Must have at least 1 ring (wolf_claw_ring)');
  assert.ok(accessories.length >= 1, 'Must have at least 1 accessory (venom_charm)');

  // Verify specific items and 50/50 split ratios
  const boneNecklace = dataLoader.getArmor('bone_necklace');
  const wolfRing = dataLoader.getArmor('wolf_claw_ring');
  const venomCharm = dataLoader.getArmor('venom_charm');

  assert.ok(boneNecklace && boneNecklace.slot === 'necklace' && boneNecklace.hpBonus === 20 && boneNecklace.splitRatio === '50/50');
  assert.ok(wolfRing && wolfRing.slot === 'ring' && wolfRing.hpBonus === 14 && wolfRing.splitRatio === '50/50');
  assert.ok(venomCharm && venomCharm.slot === 'accessory' && venomCharm.hpBonus === 26 && venomCharm.splitRatio === '50/50');

  // Verify Armorsmithing recipes consume dangling materials (bone, wolf_claw, spider_venom)
  const neckRecipe = dataLoader.getArmorsmithRecipe('bone_necklace');
  const ringRecipe = dataLoader.getArmorsmithRecipe('wolf_claw_ring');
  const charmRecipe = dataLoader.getArmorsmithRecipe('venom_charm');

  assert.ok(neckRecipe, 'Recipe for bone_necklace must exist');
  assert.equal(neckRecipe.ingredients.bone, 3, 'Bone necklace requires 3 bone');
  assert.equal(neckRecipe.ingredients.spider_silk, 1, 'Bone necklace requires 1 spider silk');

  assert.ok(ringRecipe, 'Recipe for wolf_claw_ring must exist');
  assert.equal(ringRecipe.ingredients.wolf_claw, 2, 'Wolf ring requires 2 wolf claw');
  assert.equal(ringRecipe.ingredients.bone, 1, 'Wolf ring requires 1 bone');

  assert.ok(charmRecipe, 'Recipe for venom_charm must exist');
  assert.equal(charmRecipe.ingredients.spider_venom, 2, 'Venom charm requires 2 spider venom');
  assert.equal(charmRecipe.ingredients.spider_silk, 2, 'Venom charm requires 2 spider silk');

  // Test crafting consumption of dangling resources
  const gameState = GameState.getInstance();
  gameState.addItem('bone', 10);
  gameState.addItem('wolf_claw', 10);
  gameState.addItem('spider_venom', 10);
  gameState.addItem('spider_silk', 10);

  const initialBone = gameState.getItemCount('bone');
  const initialClaw = gameState.getItemCount('wolf_claw');
  const initialVenom = gameState.getItemCount('spider_venom');

  // Craft Ring
  for (const [item, qty] of Object.entries(ringRecipe.ingredients)) {
    gameState.consumeItem(item, qty);
  }
  gameState.addItem(ringRecipe.resultArmorId, 1);
  assert.equal(gameState.getItemCount('wolf_claw'), initialClaw - 2, 'Consumed 2 wolf claws');
  assert.equal(gameState.getItemCount('bone'), initialBone - 1, 'Consumed 1 bone');
  assert.equal(gameState.getItemCount('wolf_claw_ring'), 1, 'Crafted 1 wolf claw ring');

  console.log('✓ PASS: Data registries, 5 slots, and dangling material recipes verified.\n');

  // ----------------------------------------------------------------
  // TEST 2: Outpost Restriction & In-Combat Lockout for New Slots
  // ----------------------------------------------------------------
  console.log('--- TEST 2: Outpost Restriction & In-Combat Lockout for New Slots ---');
  const testPlayer = new Player(mockScene, 5, 5, basePlayerData, startingWeapon, 32, 'test-player', new ProgressionSystem());

  // Attempting to equip when isOutpost is false must fail
  assert.equal(testPlayer.equipNecklace(boneNecklace!, false), false, 'Equipping necklace outside Outpost must return false');
  assert.equal(testPlayer.equipRing(wolfRing!, false), false, 'Equipping ring outside Outpost must return false');
  assert.equal(testPlayer.equipAccessory(venomCharm!, false), false, 'Equipping accessory outside Outpost must return false');
  assert.equal(testPlayer.equippedNecklace, null);
  assert.equal(testPlayer.equippedRing, null);
  assert.equal(testPlayer.equippedAccessory, null);

  // In-combat lockout even at Outpost
  testPlayer.inCombat = true;
  assert.equal(testPlayer.equipNecklace(boneNecklace!, true), false, 'Equipping necklace in combat must return false');
  assert.equal(testPlayer.equipRing(wolfRing!, true), false, 'Equipping ring in combat must return false');
  assert.equal(testPlayer.equipAccessory(venomCharm!, true), false, 'Equipping accessory in combat must return false');
  testPlayer.inCombat = false;

  // Cross-slot validation: cannot equip necklace in ring slot, etc.
  assert.equal(testPlayer.equipArmorSlot('ring', boneNecklace!, true), false, 'Cannot equip necklace into ring slot');
  assert.equal(testPlayer.equipArmorSlot('accessory', wolfRing!, true), false, 'Cannot equip ring into accessory slot');
  assert.equal(testPlayer.equipArmorSlot('helmet', venomCharm!, true), false, 'Cannot equip accessory into helmet slot');

  console.log('✓ PASS: Outpost restriction, in-combat lock, and slot type validation strictly enforced.\n');

  // ----------------------------------------------------------------
  // TEST 3: Two-Bar HP Split on Equip (Both Bars Visibly Increase)
  // ----------------------------------------------------------------
  console.log('--- TEST 3: Two-Bar HP Split on Equip (Both Bars Visibly Increase) ---');
  const heroProg = new ProgressionSystem();
  const hero = new Player(mockScene, 2, 2, basePlayerData, startingWeapon, 32, 'hero', heroProg);
  assert.equal(hero.baseMaxHp, 50);
  assert.equal(hero.baseMaxCriticalHp, 25);
  assert.equal(hero.hp, 50);
  assert.equal(hero.criticalHp, 25);

  // 1. Equip retrofitted piece: Silk Cowl (+30 HP, 50/50 split -> +15 Main HP, +15 Crit HP)
  const silkCowl = dataLoader.getArmor('silk_cowl')!;
  hero.equipHelmet(silkCowl, true);
  assert.equal(hero.maxHp, 65, 'Main Max HP should increase 50 -> 65 (+15)');
  assert.equal(hero.hp, 65, 'Main current HP should increase by +15');
  assert.equal(hero.maxCriticalHp, 40, 'Critical Max HP should increase 25 -> 40 (+15)');
  assert.equal(hero.criticalHp, 40, 'Critical current HP should increase by +15');

  // 2. Equip new piece: Bone Necklace (+20 HP, 50/50 split -> +10 Main HP, +10 Crit HP)
  hero.equipNecklace(boneNecklace!, true);
  assert.equal(hero.maxHp, 75, 'Main Max HP should increase 65 -> 75 (+10)');
  assert.equal(hero.hp, 75, 'Main current HP should increase by +10');
  assert.equal(hero.maxCriticalHp, 50, 'Critical Max HP should increase 40 -> 50 (+10)');
  assert.equal(hero.criticalHp, 50, 'Critical current HP should increase by +10');

  console.log('✓ PASS: Both Main HP and Critical HP visibly boost on equipping retrofitted and new armor pieces.\n');

  // ----------------------------------------------------------------
  // TEST 4: Floor-of-1 Safety Rule Specifically Protects Critical HP
  // ----------------------------------------------------------------
  console.log('--- TEST 4: Floor-of-1 Safety Rule Specifically Protects Critical HP ---');
  // Character equips Venom Charm (+26 HP -> +13 Main HP, +13 Crit HP)
  const wardPlayer = new Player(mockScene, 3, 3, basePlayerData, startingWeapon, 32, 'ward-player', new ProgressionSystem());
  wardPlayer.equipAccessory(venomCharm!, true);
  assert.equal(wardPlayer.maxHp, 63);        // 50 + 13
  assert.equal(wardPlayer.maxCriticalHp, 38); // 25 + 13
  assert.equal(wardPlayer.hp, 63);
  assert.equal(wardPlayer.criticalHp, 38);

  // Character takes heavy damage down to 3 Main HP and 2 Critical HP
  wardPlayer.hp = 3;
  wardPlayer.criticalHp = 2;
  assert.equal(wardPlayer.state, 'idle', 'Conscious in critical state');

  // Unequip Venom Charm (+26 HP):
  // Main HP: 3 - 13 = -10, floored at 0!
  // Critical HP: 2 - 13 = -11, floored at EXACTLY 1!
  wardPlayer.equipAccessory(null, true);
  assert.equal(wardPlayer.equippedAccessory, null);
  assert.equal(wardPlayer.maxHp, 50);
  assert.equal(wardPlayer.maxCriticalHp, 25);
  assert.equal(wardPlayer.hp, 0, 'Main HP can freely drop to 0 without Downed trigger');
  assert.equal(wardPlayer.criticalHp, 1, 'Critical HP must be floored at EXACTLY 1');
  assert.notEqual(wardPlayer.state, 'downed', 'Character must NOT be downed by unequip subtraction');
  console.log('✓ PASS: Floor-of-1 safety rule correctly targets Critical HP; Main HP safely drops to 0 without downing.\n');

  // ----------------------------------------------------------------
  // TEST 5: Full 5-Slot Additive Coexistence & Independence
  // ----------------------------------------------------------------
  console.log('--- TEST 5: Full 5-Slot Additive Coexistence & Independence ---');
  const fullHeroProg = new ProgressionSystem();
  fullHeroProg.addProficiencyExp('short_swords', 7000);
  fullHeroProg.addProficiencyExp('daggers', 7000);
  assert.equal(fullHeroProg.isDualWieldUnlocked(), true);

  const fullHero = new Player(mockScene, 4, 4, basePlayerData, startingWeapon, 32, 'full-hero', fullHeroProg);
  const dagger = dataLoader.getWeapon('daggers')!;
  fullHero.equipOffhandWeapon(dagger);
  assert.equal(fullHero.isDualWielding(), true);

  const lCap = dataLoader.getArmor('leather_cap')!;       // +15 HP -> 8 Main, 7 Crit
  const lArmor = dataLoader.getArmor('leather_armor')!;   // +25 HP -> 13 Main, 12 Crit
  // boneNecklace: +20 HP -> 10 Main, 10 Crit
  // wolfRing: +14 HP -> 7 Main, 7 Crit
  // venomCharm: +26 HP -> 13 Main, 13 Crit
  // Total HP bonus = 15 + 25 + 20 + 14 + 26 = 100 HP (51 Main HP + 49 Crit HP)

  // Equip all 5 simultaneously
  fullHero.equipHelmet(lCap, true);
  fullHero.equipBodyArmor(lArmor, true);
  fullHero.equipNecklace(boneNecklace!, true);
  fullHero.equipRing(wolfRing!, true);
  fullHero.equipAccessory(venomCharm!, true);

  assert.equal(fullHero.maxHp, 101, '50 base + 8 + 13 + 10 + 7 + 13 = 101');
  assert.equal(fullHero.maxCriticalHp, 74, '25 base + 7 + 12 + 10 + 7 + 13 = 74');
  assert.equal(fullHero.hp, 101);
  assert.equal(fullHero.criticalHp, 74);
  assert.equal(fullHero.isDualWielding(), true, 'Dual wielding unaffected by armor slots');

  // Unequip only Ring (-14 HP -> -7 Main, -7 Crit)
  fullHero.equipRing(null, true);
  assert.equal(fullHero.equippedRing, null);
  assert.equal(fullHero.equippedHelmet?.id, 'leather_cap');
  assert.equal(fullHero.equippedBodyArmor?.id, 'leather_armor');
  assert.equal(fullHero.equippedNecklace?.id, 'bone_necklace');
  assert.equal(fullHero.equippedAccessory?.id, 'venom_charm');
  assert.equal(fullHero.maxHp, 94, '101 - 7 = 94');
  assert.equal(fullHero.maxCriticalHp, 67, '74 - 7 = 67');
  assert.equal(fullHero.hp, 94);
  assert.equal(fullHero.criticalHp, 67);

  // Re-equip Ring
  fullHero.equipRing(wolfRing!, true);
  assert.equal(fullHero.maxHp, 101);
  assert.equal(fullHero.maxCriticalHp, 74);
  console.log('✓ PASS: All 5 slots coexist simultaneously with full additive independence from weapons.\n');

  // ----------------------------------------------------------------
  // TEST 6: Real Observable Combat Survival Benefit (Full 5-Piece Set)
  // ----------------------------------------------------------------
  console.log('--- TEST 6: Real Observable Combat Survival Benefit (Full 5-Piece Set) ---');
  const nakedPlayer = new Player(mockScene, 1, 1, basePlayerData, startingWeapon, 32, 'naked', new ProgressionSystem());
  const tankPlayer = new Player(mockScene, 1, 1, basePlayerData, startingWeapon, 32, 'tank', new ProgressionSystem());

  tankPlayer.equipHelmet(lCap, true);
  tankPlayer.equipBodyArmor(lArmor, true);
  tankPlayer.equipNecklace(boneNecklace!, true);
  tankPlayer.equipRing(wolfRing!, true);
  tankPlayer.equipAccessory(venomCharm!, true);

  // Naked has 50 Main HP, 25 Crit HP (Total pool: 75 HP)
  // Tank has 101 Main HP, 74 Crit HP (Total pool: 175 HP)
  assert.equal(nakedPlayer.maxHp, 50);
  assert.equal(tankPlayer.maxHp, 101);

  // Inflict 80 damage to both
  nakedPlayer.takeDamage(80);
  tankPlayer.takeDamage(80);

  // Naked: 50 Main HP wiped out, remaining 30 exceeds 25 Crit HP -> Downed!
  assert.equal(nakedPlayer.hp, 0);
  assert.equal(nakedPlayer.criticalHp, 0);
  assert.equal(nakedPlayer.state, 'downed', 'Naked player is downed by 80 damage');

  // Tank: 101 Main HP soaks 80 damage -> survives with 21 Main HP and 100% Critical HP untouched!
  assert.equal(tankPlayer.hp, 21, 'Tank survives with 21 Main HP');
  assert.equal(tankPlayer.criticalHp, 74, 'Tank Critical HP is 100% untouched');
  assert.equal(tankPlayer.state, 'idle', 'Tank remains conscious and fighting');
  console.log('✓ PASS: Full 5-piece armor loadout prevents downed state and delivers observable combat survivability.\n');

  // ----------------------------------------------------------------
  // TEST 7: State Persistence & Mid-Game Save Retrofit
  // ----------------------------------------------------------------
  console.log('--- TEST 7: State Persistence & Mid-Game Save Retrofit ---');
  // Scenario A: Simulating a legacy pre-Milestone-33 snapshot with Leather Cap and Silk Robe
  // In the legacy system, bonuses were 100% Main HP (15 + 50 = 65 bonus Main HP), Critical HP untouched at 25.
  const legacySnapshot: CharacterSnapshot = {
    id: 'legacy-hero',
    name: 'Veteran Defender',
    hp: 65,
    criticalHp: 25,
    energy: 100,
    equippedWeaponId: 'short_swords',
    equippedHelmetId: 'leather_cap',  // +15 HP (split: 8 Main, 7 Crit)
    equippedBodyArmorId: 'silk_robe', // +50 HP (split: 25 Main, 25 Crit)
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    proficiencies: {},
    classLevels: {},
    unlockedClasses: []
  };

  const migratedPlayer = new Player(mockScene, 7, 7, basePlayerData, startingWeapon, 32, 'migrated', new ProgressionSystem());
  migratedPlayer.restoreFromSnapshot(legacySnapshot, 1000);

  // Assert that upon restore, recalculateMaxHp() was immediately called without requiring manual re-equip:
  // Expected maxHp: 50 base + 8 (Cap) + 25 (Robe) = 83 Max HP
  // Expected maxCriticalHp: 25 base + 7 (Cap) + 25 (Robe) = 57 Max Critical HP
  assert.equal(migratedPlayer.maxHp, 83, 'Migrated legacy player immediately gains recalculated 83 Max HP');
  assert.equal(migratedPlayer.maxCriticalHp, 57, 'Migrated legacy player immediately gains recalculated 57 Max Critical HP');
  assert.equal(migratedPlayer.hp, 65, 'Current HP clamped safely to maxHp');
  assert.equal(migratedPlayer.criticalHp, 57, 'Full health legacy critical HP topped up to newly expanded Max Critical HP');

  // Scenario B: Full 5-slot snapshot save and restore across GameState handoff
  const originalFull = new Player(mockScene, 8, 8, basePlayerData, startingWeapon, 32, 'orig-full', new ProgressionSystem());
  originalFull.equipHelmet(lCap, true);
  originalFull.equipBodyArmor(lArmor, true);
  originalFull.equipNecklace(boneNecklace!, true);
  originalFull.equipRing(wolfRing!, true);
  originalFull.equipAccessory(venomCharm!, true);

  const fullSnap = originalFull.getSnapshot(1000);
  assert.equal(fullSnap.equippedHelmetId, 'leather_cap');
  assert.equal(fullSnap.equippedBodyArmorId, 'leather_armor');
  assert.equal(fullSnap.equippedNecklaceId, 'bone_necklace');
  assert.equal(fullSnap.equippedRingId, 'wolf_claw_ring');
  assert.equal(fullSnap.equippedAccessoryId, 'venom_charm');

  const restoredFull = new Player(mockScene, 9, 9, basePlayerData, startingWeapon, 32, 'restored-full', new ProgressionSystem());
  restoredFull.restoreFromSnapshot(fullSnap, 1000);

  assert.equal(restoredFull.equippedHelmet?.id, 'leather_cap');
  assert.equal(restoredFull.equippedBodyArmor?.id, 'leather_armor');
  assert.equal(restoredFull.equippedNecklace?.id, 'bone_necklace');
  assert.equal(restoredFull.equippedRing?.id, 'wolf_claw_ring');
  assert.equal(restoredFull.equippedAccessory?.id, 'venom_charm');
  assert.equal(restoredFull.maxHp, 101);
  assert.equal(restoredFull.maxCriticalHp, 74);
  console.log('✓ PASS: Mid-game save retrofit recalculation on load and full 5-slot snapshot persistence verified.\n');

  // ----------------------------------------------------------------
  // TEST 8: Odd-Numbered Split & Rounding Conservation Sweep
  // ----------------------------------------------------------------
  console.log('--- TEST 8: Odd-Numbered Split & Rounding Conservation Sweep ---');
  // Sweep across multiple odd values and split ratios to confirm zero HP creation or loss
  const testOddValues = [1, 3, 7, 15, 25, 33, 99, 101];
  const testRatios: Array<string | [number, number]> = [
    '50/50',
    [0.5, 0.5],
    '60/40',
    '70/30',
    '20/80',
    '100/0',
    '0/100'
  ];

  for (const oddVal of testOddValues) {
    for (const ratio of testRatios) {
      const syntheticArmor: ArmorDef = {
        id: `synth_test_${oddVal}`,
        name: `Synthetic Armor ${oddVal}`,
        slot: 'accessory',
        hpBonus: oddVal,
        splitRatio: ratio,
        description: 'Synthetic test item'
      };

      const { mainHpBonus, criticalHpBonus } = getArmorHpSplit(syntheticArmor);
      const sum = mainHpBonus + criticalHpBonus;
      assert.equal(
        sum,
        oddVal,
        `hpBonus of ${oddVal} with ratio ${JSON.stringify(ratio)} must strictly conserve total HP (got ${mainHpBonus} + ${criticalHpBonus} = ${sum})`
      );
      assert.ok(Number.isInteger(mainHpBonus), `mainHpBonus must be an integer, got ${mainHpBonus}`);
      assert.ok(Number.isInteger(criticalHpBonus), `criticalHpBonus must be an integer, got ${criticalHpBonus}`);
    }
  }

  // Specifically check odd values in existing game data:
  // Leather Cap (+15 HP, 50/50): 8 Main HP + 7 Crit HP = 15 HP
  const capSplit = getArmorHpSplit(lCap);
  assert.equal(capSplit.mainHpBonus, 8);
  assert.equal(capSplit.criticalHpBonus, 7);
  assert.equal(capSplit.mainHpBonus + capSplit.criticalHpBonus, 15);

  // Leather Armor (+25 HP, 50/50): 13 Main HP + 12 Crit HP = 25 HP
  const armorSplit = getArmorHpSplit(lArmor);
  assert.equal(armorSplit.mainHpBonus, 13);
  assert.equal(armorSplit.criticalHpBonus, 12);
  assert.equal(armorSplit.mainHpBonus + armorSplit.criticalHpBonus, 25);

  console.log('✓ PASS: Odd-numbered split sweep verified: 100% conservation of total HP with integer values.\n');

  console.log('================================================================');
  console.log('ALL MILESTONE 33 UNIT TESTS COMPLETED & VERIFIED SUCCESSFULLY');
  console.log('================================================================');
}

runMilestone33Tests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
