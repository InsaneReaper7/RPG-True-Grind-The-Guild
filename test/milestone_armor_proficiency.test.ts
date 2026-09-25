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
    getElementById: (id: string) => ({
      id,
      style: {},
      classList: {
        add: noop,
        remove: noop,
        toggle: noop,
        contains: () => false
      },
      innerText: '',
      innerHTML: '',
      appendChild: noop,
      removeChild: noop,
      addEventListener: noop
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
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
import { getArmorProficiencyId, getArmorHpSplit } from '../src/types/game.ts';

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
      setPosition: () => obj,
      setTexture: () => obj,
      setAlpha: () => obj,
      setScale: () => obj,
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
      fillCircle: () => obj,
      strokeCircle: () => obj,
      lineBetween: () => obj,
      setText: () => obj,
      setColor: () => obj,
      setFontSize: () => obj,
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
      addEvent: () => ({ remove: () => {} }),
      delayedCall: (delay: number, cb: () => void) => {
        cb();
        return {};
      }
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
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    },
    events: {
      on: () => {},
      off: () => {},
      emit: () => {}
    },
    cameras: {
      main: {
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600
      }
    }
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ RUNNING TEST SUITE: ARMOR PROFICIENCY (LIGHT/MEDIUM/HEAVY) 🛡️');
  console.log('================================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ----------------------------------------------------------------
  // TEST 1: Open Design Resolution & System Architecture
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Design Question Resolution & Distinct Weight Class Proficiencies ---');

  const prog = new ProgressionSystem();
  assert.equal(prog.getProficiencyLevel('light_armor'), 0, 'light_armor must be initialized to 0');
  assert.equal(prog.getProficiencyLevel('medium_armor'), 0, 'medium_armor must be initialized to 0');
  assert.equal(prog.getProficiencyLevel('heavy_armor'), 0, 'heavy_armor must be initialized to 0');

  // Confirm generic 'armor' is NOT the proficiency
  assert.equal((prog as any).getProficiencyLevel('armor'), 0, 'Generic armor proficiency must not exist as primary stat');

  // Check DataLoader trainable stat definitions
  const lightDef = dataLoader.getTrainableStatDef('light_armor');
  const mediumDef = dataLoader.getTrainableStatDef('medium_armor');
  const heavyDef = dataLoader.getTrainableStatDef('heavy_armor');

  assert.ok(lightDef && lightDef.name === 'Light Armor', 'Light Armor definition must exist');
  assert.ok(mediumDef && mediumDef.name === 'Medium Armor', 'Medium Armor definition must exist');
  assert.ok(heavyDef && heavyDef.name === 'Heavy Armor', 'Heavy Armor definition must exist');

  // Verify getArmorProficiencyId helper
  assert.equal(getArmorProficiencyId('light'), 'light_armor');
  assert.equal(getArmorProficiencyId('medium'), 'medium_armor');
  assert.equal(getArmorProficiencyId('heavy'), 'heavy_armor');
  assert.equal(getArmorProficiencyId('light_armor'), 'light_armor');

  console.log('✓ PASS: Specific weight class proficiencies (light_armor, medium_armor, heavy_armor) confirmed over generic stat.\n');

  // ----------------------------------------------------------------
  // TEST 2: True Armor Weight Class Tagging & Jewelry Stat-Only Exclusion
  // ----------------------------------------------------------------
  console.log('--- TEST 2: True Armor Weight Class Tagging & Jewelry Stat-Only Exclusion ---');

  const allArmors = dataLoader.getAllArmors();
  assert.ok(allArmors.length >= 7, 'Must have at least 7 armor pieces registered');

  // True armor pieces (Helmet, Body) must be explicitly tagged with their weightClass
  const expectedTrueArmors: Record<string, { slot: string; weightClass: string }> = {
    leather_cap: { slot: 'helmet', weightClass: 'light' },
    leather_armor: { slot: 'body', weightClass: 'medium' },
    silk_cowl: { slot: 'helmet', weightClass: 'light' },
    silk_robe: { slot: 'body', weightClass: 'light' }
  };

  for (const [id, expected] of Object.entries(expectedTrueArmors)) {
    const armor = dataLoader.getArmor(id);
    assert.ok(armor, `Armor '${id}' must exist in registry`);
    assert.equal(armor.slot, expected.slot, `Armor '${id}' must be slot '${expected.slot}'`);
    assert.equal(armor.weightClass, expected.weightClass, `Armor '${id}' must be tagged weightClass '${expected.weightClass}'`);
    console.log(`  ✓ True Armor: ${armor.name} (${armor.id}): Slot = ${armor.slot}, WeightClass = ${armor.weightClass}, Weight = ${armor.weight}kg`);
  }

  // Jewelry pieces (Necklace, Ring, Accessory) must have NO weightClass tag (pure stat items)
  const jewelryPieces = ['bone_necklace', 'wolf_claw_ring', 'venom_charm'];
  for (const id of jewelryPieces) {
    const item = dataLoader.getArmor(id);
    assert.ok(item, `Jewelry '${id}' must exist in registry`);
    assert.equal(item.weightClass, undefined, `Jewelry '${id}' must have NO weightClass tag`);
    console.log(`  ✓ Pure Jewelry: ${item.name} (${item.id}): Slot = ${item.slot}, WeightClass = undefined (pure stat item), HP = +${item.hpBonus}`);
  }

  console.log('✓ PASS: True armor pieces are tagged; jewelry pieces are confirmed pure stat items with no weightClass.\n');

  // ----------------------------------------------------------------
  // TEST 3: Player Equipment Slot & Weight Class Introspection
  // ----------------------------------------------------------------
  console.log('--- TEST 3: Player Equipment Slot & Weight Class Introspection ---');

  const mockScene = createMockScene();
  const basePlayerData: PlayerData = {
    name: 'Armor Vanguard',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords'
  };
  const startingWeapon = dataLoader.getWeapon('short_swords')!;
  const player = new Player(mockScene, 0, 0, basePlayerData, startingWeapon, 32, 'player-avatar');

  assert.equal(player.getEquippedArmors().length, 0, 'Unarmored player has 0 equipped armors');
  assert.equal(player.getEquippedArmorWeightClasses().length, 0, 'Unarmored player has 0 armor weight classes');

  // Equip Leather Cap (light) and Leather Armor (medium) in Outpost
  player.equipHelmet(dataLoader.getArmor('leather_cap')!, true);
  player.equipBodyArmor(dataLoader.getArmor('leather_armor')!, true);

  const equipped = player.getEquippedArmors();
  assert.equal(equipped.length, 2, 'Must have 2 equipped armor pieces');
  const weightClasses = player.getEquippedArmorWeightClasses();
  assert.equal(weightClasses.length, 2, 'Must report both light and medium weight classes');
  assert.ok(weightClasses.includes('light'), 'Includes light');
  assert.ok(weightClasses.includes('medium'), 'Includes medium');

  console.log('✓ PASS: Player correctly tracks equipped armors and resolves distinct active weight classes.\n');

  // ----------------------------------------------------------------
  // TEST 4: Real Proficiency Leveling Through Wear in Combat
  // ----------------------------------------------------------------
  console.log('--- TEST 4: Real Proficiency Leveling Through Wear (Hit, Attack, Kill) ---');

  // Fresh player with ProgressionSystem
  const heroProg = new ProgressionSystem();
  const hero = new Player(mockScene, 0, 0, basePlayerData, startingWeapon, 32, 'player-avatar', heroProg);

  // Equip Silk Cowl (light) and Silk Robe (light) -> Pure Light loadout
  hero.equipHelmet(dataLoader.getArmor('silk_cowl')!, true);
  hero.equipBodyArmor(dataLoader.getArmor('silk_robe')!, true);

  assert.equal(heroProg.getProficiencyLevel('light_armor'), 0);
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 0);

  // Simulate taking hits in combat (enduring attacks)
  // 2 pieces of light armor equipped -> each piece absorbs the hit: +2 EXP total to light_armor per hit
  hero.awardArmorWearExp('hit');
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 2, 'Taking 1 hit with 2 light pieces awards +2 light_armor EXP');
  assert.equal(heroProg.getProficiencyStat('medium_armor').currentExp, 0, 'medium_armor unaffected');
  assert.equal(heroProg.getProficiencyStat('heavy_armor').currentExp, 0, 'heavy_armor unaffected');

  // Simulate performing an attack in armor -> +1 EXP toward unique light weight class
  hero.awardArmorWearExp('attack');
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 3, 'Attacking awards +1 EXP to light_armor');

  // Simulate defeating an enemy while wearing light armor -> +2 EXP toward unique light weight class
  hero.awardArmorWearExp('kill');
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 5, 'Kill awards +2 EXP to light_armor');

  // Simulate leveling up light_armor past Level 1 (BASE_EXP is 50)
  for (let i = 0; i < 22; i++) {
    hero.awardArmorWearExp('hit'); // +2 each hit = 44 EXP -> total 49 EXP
  }
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 49);
  assert.equal(heroProg.getProficiencyLevel('light_armor'), 0);

  // One more hit pushes to 51 EXP -> level up to Level 1!
  hero.awardArmorWearExp('hit'); // +2 EXP -> 51 EXP (50 consumed, 1 overflow)
  assert.equal(heroProg.getProficiencyLevel('light_armor'), 1, 'light_armor reached Level 1!');
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, 1, '1 overflow EXP retained');
  assert.ok(GameState.getInstance().isProficiencyDiscovered('light_armor'), 'light_armor is marked discovered in GameState');

  console.log('✓ PASS: Light armor proficiency advances through hits, attacks, and kills, reaching Level 1.\n');

  // ----------------------------------------------------------------
  // TEST 5: Medium and Heavy Armor Independent Leveling
  // ----------------------------------------------------------------
  console.log('--- TEST 5: Medium and Heavy Armor Independent Leveling ---');

  // Equip Leather Armor (medium) on hero body slot
  hero.equipBodyArmor(dataLoader.getArmor('leather_armor')!, true);

  // Now hero wears: Silk Cowl (light) + Leather Armor (medium)
  assert.equal(heroProg.getProficiencyLevel('medium_armor'), 0);
  assert.equal(heroProg.getProficiencyStat('medium_armor').currentExp, 0);

  // Taking a hit: Silk Cowl awards +1 to light_armor, Leather Armor awards +1 to medium_armor
  const lightBefore = heroProg.getProficiencyStat('light_armor').currentExp;
  hero.awardArmorWearExp('hit');
  assert.equal(heroProg.getProficiencyStat('light_armor').currentExp, lightBefore + 1, 'light_armor +1 from helmet');
  assert.equal(heroProg.getProficiencyStat('medium_armor').currentExp, 1, 'medium_armor +1 from body armor');

  // Test Heavy Armor item support
  const customHeavyArmor: ArmorDef = {
    id: 'iron_plate',
    name: 'Iron Plate',
    slot: 'body',
    weightClass: 'heavy',
    hpBonus: 60,
    weight: 12.0,
    splitRatio: '50/50',
    description: 'Heavy forged iron plate.'
  };
  hero.equipBodyArmor(customHeavyArmor, true);

  // Taking a hit with Iron Plate (heavy) + Silk Cowl (light)
  hero.awardArmorWearExp('hit');
  assert.equal(heroProg.getProficiencyStat('heavy_armor').currentExp, 1, 'heavy_armor gained 1 EXP from taking hit in heavy plate');

  // Level heavy armor to Level 1
  for (let i = 0; i < 49; i++) {
    hero.awardArmorWearExp('hit');
  }
  assert.equal(heroProg.getProficiencyLevel('heavy_armor'), 1, 'heavy_armor leveled up to Level 1!');
  assert.ok(GameState.getInstance().isProficiencyDiscovered('heavy_armor'), 'heavy_armor discovered');

  console.log('✓ PASS: Medium and Heavy armor level up completely independently with zero cross-contamination.\n');

  // ----------------------------------------------------------------
  // TEST 5B: Simultaneous Mixed-Weight-Class Credit & Jewelry Zero-EXP Invariant
  // ----------------------------------------------------------------
  console.log('--- TEST 5B: Simultaneous Mixed-Weight-Class Credit & Jewelry Zero-EXP Invariant (Hit, Attack, Kill) ---');

  const mixedProg = new ProgressionSystem();
  const mixedHero = new Player(mockScene, 0, 0, basePlayerData, startingWeapon, 32, 'mixed-hero', mixedProg);

  // Equip Leather Cap (light helmet) + Leather Armor (medium body)
  const capPiece = dataLoader.getArmor('leather_cap')!; // light
  const armorPiece = dataLoader.getArmor('leather_armor')!; // medium
  mixedHero.equipHelmet(capPiece, true);
  mixedHero.equipBodyArmor(armorPiece, true);

  const activeClasses = mixedHero.getEquippedArmorWeightClasses();
  assert.equal(activeClasses.length, 2, 'Must have 2 active weight classes');
  assert.ok(activeClasses.includes('light'), 'Includes light weight class');
  assert.ok(activeClasses.includes('medium'), 'Includes medium weight class');

  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 0);
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 0);
  assert.equal(mixedProg.getProficiencyStat('heavy_armor').currentExp, 0);

  // 1. Single HIT action on a mixed-armor wearer
  // Both true armor pieces endure the blow: +1 to light_armor (from cap) and +1 to medium_armor (from body)
  mixedHero.awardArmorWearExp('hit');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 1, 'Hit credits light_armor +1');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 1, 'Hit credits medium_armor +1');
  assert.equal(mixedProg.getProficiencyStat('heavy_armor').currentExp, 0, 'heavy_armor remains uncredited');

  // 2. Single ATTACK action on a mixed-armor wearer
  // Distinct active classes are ['light', 'medium']: +1 to light_armor and +1 to medium_armor
  mixedHero.awardArmorWearExp('attack');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 2, 'Attack credits light_armor +1 (total 2)');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 2, 'Attack credits medium_armor +1 (total 2)');
  assert.equal(mixedProg.getProficiencyStat('heavy_armor').currentExp, 0, 'heavy_armor remains uncredited');

  // 3. Single KILL action on a mixed-armor wearer
  // Distinct active classes are ['light', 'medium']: +2 to light_armor and +2 to medium_armor
  mixedHero.awardArmorWearExp('kill');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 4, 'Kill credits light_armor +2 (total 4)');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 4, 'Kill credits medium_armor +2 (total 4)');
  assert.equal(mixedProg.getProficiencyStat('heavy_armor').currentExp, 0, 'heavy_armor remains uncredited');

  // 4. Jewelry Zero-EXP Invariant: Equip ALL THREE jewelry slots (Necklace, Ring, Accessory)
  const neckPiece = dataLoader.getArmor('bone_necklace')!;
  const ringPiece = dataLoader.getArmor('wolf_claw_ring')!;
  const accPiece = dataLoader.getArmor('venom_charm')!;
  mixedHero.equipNecklace(neckPiece, true);
  mixedHero.equipRing(ringPiece, true);
  mixedHero.equipAccessory(accPiece, true);

  // Even with 3 jewelry pieces equipped, weight classes are strictly determined by true armor slots (helmet + body)
  const classesWithJewelry = mixedHero.getEquippedArmorWeightClasses();
  assert.equal(classesWithJewelry.length, 2, 'Still exactly 2 active weight classes');
  assert.ok(classesWithJewelry.includes('light'));
  assert.ok(classesWithJewelry.includes('medium'));

  // Combat actions with full jewelry loadout: jewelry must contribute ZERO additional EXP!
  mixedHero.awardArmorWearExp('hit');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 5, 'Hit with full jewelry awards only +1 to light_armor (from helmet)');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 5, 'Hit with full jewelry awards only +1 to medium_armor (from body)');

  mixedHero.awardArmorWearExp('attack');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 6, 'Attack with full jewelry awards only +1 to light_armor');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 6, 'Attack with full jewelry awards only +1 to medium_armor');

  mixedHero.awardArmorWearExp('kill');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 8, 'Kill with full jewelry awards only +2 to light_armor');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 8, 'Kill with full jewelry awards only +2 to medium_armor');

  // 5. Pure Jewelry Loadout: Unequip Helmet and Body Armor completely
  mixedHero.equipHelmet(null, true);
  mixedHero.equipBodyArmor(null, true);
  assert.equal(mixedHero.getEquippedArmorWeightClasses().length, 0, 'Player with only jewelry has 0 armor weight classes');

  // Combat actions when wearing ONLY jewelry: awards exactly 0 EXP across the board
  mixedHero.awardArmorWearExp('hit');
  mixedHero.awardArmorWearExp('attack');
  mixedHero.awardArmorWearExp('kill');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 8, 'light_armor EXP unchanged (0 awarded from jewelry)');
  assert.equal(mixedProg.getProficiencyStat('medium_armor').currentExp, 8, 'medium_armor EXP unchanged (0 awarded from jewelry)');
  assert.equal(mixedProg.getProficiencyStat('heavy_armor').currentExp, 0, 'heavy_armor EXP unchanged');

  // 6. Multiple Genuine Armor Pieces of Same Weight Class: Uniform Light Loadout
  // Equip Silk Cowl (light helmet) + Silk Robe (light body)
  mixedHero.equipHelmet(dataLoader.getArmor('silk_cowl')!, true);
  mixedHero.equipBodyArmor(dataLoader.getArmor('silk_robe')!, true);
  assert.deepEqual(mixedHero.getEquippedArmorWeightClasses(), ['light']);

  // Single HIT with 2 true light armor pieces: each piece absorbs blow -> +2 to light_armor
  mixedHero.awardArmorWearExp('hit');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 10, 'Hit with 2 genuine light armor pieces awards +2 EXP (total 10)');

  // Single ATTACK with 2 true light armor pieces: deduplicated unique class -> +1 to light_armor
  mixedHero.awardArmorWearExp('attack');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 11, 'Attack with 2 genuine light armor pieces is deduplicated: +1 EXP (total 11)');

  // Single KILL with 2 true light armor pieces: deduplicated unique class -> +2 to light_armor
  mixedHero.awardArmorWearExp('kill');
  assert.equal(mixedProg.getProficiencyStat('light_armor').currentExp, 13, 'Kill with 2 genuine light armor pieces is deduplicated: +2 EXP (total 13)');

  console.log('✓ PASS: Mixed-weight-class character credits both proficiencies, jewelry awards zero EXP, and true multi-piece loadouts function correctly.\n');

  // ----------------------------------------------------------------
  // TEST 6: Preservation of Existing Mechanics (HP Splits, Floor-of-1, Outpost Gating)
  // ----------------------------------------------------------------
  console.log('--- TEST 6: Preservation of Existing Armor Mechanics ---');

  const testHero = new Player(mockScene, 0, 0, basePlayerData, startingWeapon, 32, 'test-hero');
  const cap = dataLoader.getArmor('leather_cap')!;
  const { mainHpBonus, criticalHpBonus } = getArmorHpSplit(cap);
  assert.equal(mainHpBonus + criticalHpBonus, cap.hpBonus, 'HP split must conserve total bonus');

  // In-combat equip lockout
  assert.equal(testHero.equipHelmet(cap, false), false, 'Equipping during dungeon/combat must be rejected');

  // Outpost equip
  assert.equal(testHero.equipHelmet(cap, true), true, 'Equipping in outpost succeeds');
  assert.equal(testHero.maxHp, 50 + mainHpBonus);
  assert.equal(testHero.maxCriticalHp, 25 + criticalHpBonus);

  // Floor-of-1 on unequip when near death
  testHero.hp = 0;
  testHero.criticalHp = 5;
  testHero.equipHelmet(null, true);
  assert.equal(testHero.criticalHp, 1, 'Critical HP safely floored at exactly 1 on harsh unequip');
  assert.notEqual(testHero.state, 'downed', 'Character is not downed');

  console.log('✓ PASS: All HP splits, combat lockouts, and floor-of-1 safety rules preserved flawlessly.\n');

  // ----------------------------------------------------------------
  // TEST 7: Save & Snapshot State Persistence
  // ----------------------------------------------------------------
  console.log('--- TEST 7: Save & Snapshot State Persistence ---');

  const snap = heroProg.getSnapshotData();
  assert.ok(snap.proficiencies['light_armor'], 'light_armor exists in snapshot');
  assert.ok(snap.proficiencies['medium_armor'], 'medium_armor exists in snapshot');
  assert.ok(snap.proficiencies['heavy_armor'], 'heavy_armor exists in snapshot');
  assert.equal(snap.proficiencies['light_armor'].level, 1);
  assert.equal(snap.proficiencies['heavy_armor'].level, 1);

  const restoredProg = new ProgressionSystem();
  restoredProg.loadSnapshotData(snap);

  assert.equal(restoredProg.getProficiencyLevel('light_armor'), 1, 'Restored light_armor level is 1');
  assert.equal(restoredProg.getProficiencyLevel('heavy_armor'), 1, 'Restored heavy_armor level is 1');
  assert.equal(restoredProg.getProficiencyStat('heavy_armor').currentExp, heroProg.getProficiencyStat('heavy_armor').currentExp, 'Restored currentExp matches');

  console.log('✓ PASS: Armor proficiencies serialize and restore cleanly across storage checkpoints.\n');

  console.log('================================================================');
  console.log('🎉 ALL ARMOR PROFICIENCY (LIGHT/MEDIUM/HEAVY) TESTS PASSED! 🎉');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
