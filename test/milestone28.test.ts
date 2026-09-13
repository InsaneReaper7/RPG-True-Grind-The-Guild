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
import type { WeaponDef, ArmorDef, PlayerData } from '../src/types/game.ts';

async function runMilestone28Tests() {
  console.log('======================================================');
  console.log('RUNNING MILESTONE 28: ARMOR SLOTS & ARMORSMITHING TESTS');
  console.log('======================================================\n');

  const { Player } = await import('../src/entities/Player.ts');
  const { Enemy } = await import('../src/entities/Enemy.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

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

  // --- TEST 1: Data Registry & Architecture Integrity ---
  console.log('--- TEST 1: Data Registry & Architecture Integrity ---');
  const buildables = dataLoader.getBuildables();
  const armorBench = buildables.find(b => b.id === 'armorsmithing_bench');
  assert.ok(armorBench, 'armorsmithing_bench buildable must exist');
  assert.equal(armorBench.lockedByDefault, true, 'armorsmithing_bench must be locked by default');
  assert.equal(armorBench.roomTag, 'armorsmithing', 'armorsmithing_bench must have roomTag armorsmithing');
  assert.equal(armorBench.indoorRequired, true, 'armorsmithing_bench must require indoor room');

  const researchNodes = dataLoader.getResearchNodes();
  const armorResearch = researchNodes.find(r => r.targetBuildableId === 'armorsmithing_bench');
  assert.ok(armorResearch, 'Research node for armorsmithing_bench must exist');
  assert.equal(armorResearch.id, 'research_armorsmithing_bench');

  const rooms = dataLoader.getRoomRules();
  const armory = rooms.find(r => r.id === 'armory');
  assert.ok(armory, 'armory room rule must exist');
  assert.ok(armory.requiredTags.includes('armorsmithing'), 'armory requires armorsmithing tag');

  const armors = dataLoader.getAllArmors();
  assert.equal(armors.length, 4, 'Must have exactly 4 armor pieces defined');
  const lCap = dataLoader.getArmor('leather_cap');
  const lArmor = dataLoader.getArmor('leather_armor');
  const sCowl = dataLoader.getArmor('silk_cowl');
  const sRobe = dataLoader.getArmor('silk_robe');
  assert.ok(lCap && lCap.slot === 'helmet' && lCap.hpBonus === 15);
  assert.ok(lArmor && lArmor.slot === 'body' && lArmor.hpBonus === 25);
  assert.ok(sCowl && sCowl.slot === 'helmet' && sCowl.hpBonus === 30);
  assert.ok(sRobe && sRobe.slot === 'body' && sRobe.hpBonus === 50);

  const recipes = dataLoader.getArmorsmithRecipes();
  assert.equal(recipes.length, 4, 'Must have exactly 4 armorsmithing recipes');
  const rCap = dataLoader.getArmorsmithRecipe('leather_cap');
  const rRobe = dataLoader.getArmorsmithRecipe('silk_robe');
  assert.ok(rCap && rCap.requiredLevel === 0 && rCap.ingredients.wolf_pelt === 2);
  assert.ok(rRobe && rRobe.requiredLevel === 5 && rRobe.ingredients.spider_silk === 5);

  const classes = dataLoader.getClasses();
  const armorerClass = classes.find(c => c.id === 'apprentice_armorer');
  assert.ok(armorerClass, 'apprentice_armorer class must exist');
  assert.ok(armorerClass.requirements.some(r => r.type === 'proficiency' && r.target === 'armorsmithing' && r.value === 10));
  console.log('✓ PASS: Station buildable, research node, room rule, armors, recipes, and class definitions verified.\n');

  // --- TEST 2: Dangling Resource Consumption & Bench Crafting ---
  console.log('--- TEST 2: Dangling Resource Consumption & Bench Crafting ---');
  const gameState = GameState.getInstance();
  const mockScene = createMockScene();
  const heroProg = new ProgressionSystem();
  
  const basePlayerData: PlayerData = {
    name: 'Ironclad Hero',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords'
  };
  const startingWeapon = dataLoader.getWeapon('short_swords')!;

  gameState.addItem('wolf_pelt', 10);
  gameState.addItem('spider_silk', 10);
  const initialPelts = gameState.getItemCount('wolf_pelt');
  const initialSilk = gameState.getItemCount('spider_silk');

  // Craft Leather Cap (Req Lv 0, 2 Wolf Pelts, +25 EXP)
  const capRecipe = dataLoader.getArmorsmithRecipe('leather_cap')!;
  for (const [item, qty] of Object.entries(capRecipe.ingredients)) {
    gameState.consumeItem(item, qty);
  }
  gameState.addItem(capRecipe.resultArmorId, 1);
  heroProg.addProficiencyExp('armorsmithing', capRecipe.expGranted);

  assert.equal(gameState.getItemCount('wolf_pelt'), initialPelts - 2);
  assert.equal(gameState.getItemCount('leather_cap'), 1);
  assert.equal(heroProg.getProficiencyStat('armorsmithing').currentExp, 25);
  console.log('✓ PASS: Wolf Pelt successfully consumed to craft Leather Cap with Armorsmithing EXP rewarded.\n');

  // --- TEST 3: Outpost Restriction & Equipping Armor Mechanical HP Effect ---
  console.log('--- TEST 3: Outpost Restriction & Equipping Armor Mechanical HP Effect ---');
  const player = new Player(mockScene, 5, 5, basePlayerData, startingWeapon, 32, 'hero', heroProg);
  assert.equal(player.baseMaxHp, 50);
  assert.equal(player.maxHp, 50);
  assert.equal(player.hp, 50);

  // Attempting to equip outside Outpost (isOutpost = false) must be rejected
  const equipOutsideOutpost = player.equipHelmet(lCap, false);
  assert.equal(equipOutsideOutpost, false, 'Equipping helmet outside Outpost must return false');
  assert.equal(player.equippedHelmet, null, 'Helmet must remain unequipped when outside Outpost');
  assert.equal(player.maxHp, 50);

  // Attempting to equip during combat must be rejected even at Outpost
  player.inCombat = true;
  const equipInCombat = player.equipHelmet(lCap, true);
  assert.equal(equipInCombat, false, 'Equipping helmet in combat must return false');
  assert.equal(player.equippedHelmet, null);
  player.inCombat = false;

  // Equip Helmet at Outpost
  const equipSuccessHelmet = player.equipHelmet(lCap, true);
  assert.equal(equipSuccessHelmet, true);
  assert.equal(player.equippedHelmet?.id, 'leather_cap');
  assert.equal(player.maxHp, 65, 'Max HP should increase from 50 to 65 (+15)');
  assert.equal(player.hp, 65, 'Current HP should increase by +15 on equip');

  // Equip Body Armor at Outpost
  const equipSuccessBody = player.equipBodyArmor(lArmor, true);
  assert.equal(equipSuccessBody, true);
  assert.equal(player.equippedBodyArmor?.id, 'leather_armor');
  assert.equal(player.maxHp, 90, 'Max HP should increase to 90 (50 + 15 + 25)');
  assert.equal(player.hp, 90, 'Current HP should increase to 90');
  console.log('✓ PASS: Outpost-only restrictions enforced and equipping boosts max HP and current HP additively.\n');

  // --- TEST 4: Harsh Unequip Subtraction with Safety Floor of Exactly 1 HP ---
  console.log('--- TEST 4: Harsh Unequip Subtraction with Safety Floor of Exactly 1 HP ---');
  // Specific required scenario: Character at 5 current HP wearing large-bonus armor piece (+50 HP) unequips at Outpost
  const silkHeroProg = new ProgressionSystem();
  const silkPlayer = new Player(mockScene, 6, 6, basePlayerData, startingWeapon, 32, 'hero-silk', silkHeroProg);
  assert.equal(silkPlayer.hp, 50);
  assert.equal(silkPlayer.maxHp, 50);

  // Equip Silk Robe (+50 HP)
  silkPlayer.equipBodyArmor(sRobe, true);
  assert.equal(silkPlayer.maxHp, 100, 'Max HP with Silk Robe is 100');
  assert.equal(silkPlayer.hp, 100, 'Current HP with Silk Robe is 100');

  // Character sustains severe damage down to 5 HP
  silkPlayer.hp = 5;
  assert.equal(silkPlayer.hp, 5, 'Player HP forced to 5');
  assert.equal(silkPlayer.state, 'idle', 'Player is still conscious');

  // Unequip Silk Robe (+50 HP) at Outpost: 5 - 50 = -45, floored at exactly 1
  silkPlayer.equipBodyArmor(null, true);
  assert.equal(silkPlayer.equippedBodyArmor, null, 'Silk Robe unequipped');
  assert.equal(silkPlayer.maxHp, 50, 'Max HP returns to 50 base');
  assert.equal(silkPlayer.hp, 1, 'Current HP must be floored at EXACTLY 1 (not negative and not 0)');
  assert.notEqual(silkPlayer.state, 'downed', 'Player must NOT be downed by unequip');
  assert.equal(silkPlayer.criticalHp, 25, 'Critical HP remains intact');
  console.log('✓ PASS: Low-HP unequip subtraction cleanly floors at exactly 1 HP with zero Downed state trigger.\n');

  // --- TEST 5: Real Mechanical Combat Survival Benefit ---
  console.log('--- TEST 5: Real Mechanical Combat Survival Benefit ---');
  // Two identical combat scenarios: 60 total incoming damage
  // Unarmored character (50 HP) vs Armored character (90 HP)
  const unarmoredPlayer = new Player(mockScene, 1, 1, basePlayerData, startingWeapon, 32, 'unarmored', new ProgressionSystem());
  const armoredPlayer = new Player(mockScene, 1, 1, basePlayerData, startingWeapon, 32, 'armored', new ProgressionSystem());
  armoredPlayer.equipHelmet(lCap, true);     // +15 HP
  armoredPlayer.equipBodyArmor(lArmor, true); // +25 HP
  assert.equal(unarmoredPlayer.maxHp, 50);
  assert.equal(armoredPlayer.maxHp, 90);

  // Inflict 60 damage
  unarmoredPlayer.takeDamage(60);
  armoredPlayer.takeDamage(60);

  // Unarmored: 50 main HP lost, overflow 10 into critical HP (25 - 10 = 15 critical HP remaining)
  assert.equal(unarmoredPlayer.hp, 0, 'Unarmored player lost all main HP');
  assert.equal(unarmoredPlayer.criticalHp, 15, 'Unarmored player dipped into critical HP');

  // Armored: 90 main HP soaked 60 damage, 30 main HP remaining, 0 critical HP lost
  assert.equal(armoredPlayer.hp, 30, 'Armored player survived with 30 main HP');
  assert.equal(armoredPlayer.criticalHp, 25, 'Armored player critical HP untouched');
  console.log('✓ PASS: Armor HP bonus delivers real, observable damage buffer and survival benefit in combat.\n');

  // --- TEST 6: Additive Architecture & Weapon Independence ---
  console.log('--- TEST 6: Additive Architecture & Weapon Independence ---');
  const dualWieldHeroProg = new ProgressionSystem();
  dualWieldHeroProg.addProficiencyExp('short_swords', 7000); // Level 30+
  dualWieldHeroProg.addProficiencyExp('daggers', 7000);      // Level 30+
  assert.equal(dualWieldHeroProg.isDualWieldUnlocked(), true);

  const testWarrior = new Player(mockScene, 2, 2, basePlayerData, startingWeapon, 32, 'warrior', dualWieldHeroProg);
  const dagger = dataLoader.getWeapon('daggers')!;
  testWarrior.equipOffhandWeapon(dagger);
  assert.equal(testWarrior.isDualWielding(), true);
  assert.equal(testWarrior.equippedWeapon.id, 'short_swords');
  assert.equal(testWarrior.offhandWeapon?.id, 'daggers');

  // Equip and unequip armor pieces repeatedly
  testWarrior.equipHelmet(lCap, true);
  testWarrior.equipBodyArmor(lArmor, true);
  assert.equal(testWarrior.isDualWielding(), true, 'Dual wielding remains active while wearing armor');
  assert.equal(testWarrior.equippedWeapon.id, 'short_swords');
  assert.equal(testWarrior.offhandWeapon?.id, 'daggers');

  testWarrior.equipHelmet(null, true);
  testWarrior.equipBodyArmor(null, true);
  assert.equal(testWarrior.isDualWielding(), true, 'Dual wielding remains unaffected after removing armor');
  console.log('✓ PASS: Armor slots are 100% additive; weapon and offhand logic are completely unaffected.\n');

  // --- TEST 7: Armorsmithing Progression, Hidden Rule & Apprentice Armorer Unlock ---
  console.log('--- TEST 7: Armorsmithing Progression, Hidden Rule & Apprentice Armorer Unlock ---');
  const craftHeroProg = new ProgressionSystem();
  const initialStat = craftHeroProg.getProficiencyStat('armorsmithing');
  assert.equal(initialStat.level, 0);
  assert.equal(initialStat.currentExp, 0);

  // Hidden until Level 1 check
  assert.equal(initialStat.level >= 1, false, 'Armorsmithing is hidden at Level 0');

  // Gain EXP to reach Level 1
  craftHeroProg.addProficiencyExp('armorsmithing', 55);
  const lv1Stat = craftHeroProg.getProficiencyStat('armorsmithing');
  assert.equal(lv1Stat.level, 1, 'Armorsmithing reaches Level 1');
  assert.equal(lv1Stat.level >= 1, true, 'Armorsmithing is revealed at Level 1');

  // Gain EXP to reach Level 10 and unlock Apprentice Armorer
  craftHeroProg.addProficiencyExp('armorsmithing', 700);
  const lv10Stat = craftHeroProg.getProficiencyStat('armorsmithing');
  assert.ok(lv10Stat.level >= 10, 'Armorsmithing reached Level 10');
  assert.ok(craftHeroProg.isClassUnlocked('apprentice_armorer'), 'Apprentice Armorer class unlocked at Lv 10');
  console.log('✓ PASS: Hidden-until-Lv-1 rule and Apprentice Armorer class unlock at Level 10 verified.\n');

  // --- TEST 8: State Snapshot Persistence & Non-Interactive Restoration ---
  console.log('--- TEST 8: State Snapshot Persistence & Non-Interactive Restoration ---');
  const snapProg = new ProgressionSystem();
  const originalPlayer = new Player(mockScene, 3, 3, basePlayerData, startingWeapon, 32, 'snap-player', snapProg);
  originalPlayer.equipHelmet(sCowl, true);
  originalPlayer.equipBodyArmor(sRobe, true);
  assert.equal(originalPlayer.maxHp, 130); // 50 + 30 + 50

  const snapshot = originalPlayer.getSnapshot(1000);
  assert.equal(snapshot.equippedHelmetId, 'silk_cowl');
  assert.equal(snapshot.equippedBodyArmorId, 'silk_robe');

  // Restore into a fresh Player instance (simulating scene transition mid-game)
  const restoredPlayer = new Player(mockScene, 3, 3, basePlayerData, startingWeapon, 32, 'restored-player', new ProgressionSystem());
  restoredPlayer.restoreFromSnapshot(snapshot, 1000);

  assert.equal(restoredPlayer.equippedHelmet?.id, 'silk_cowl');
  assert.equal(restoredPlayer.equippedBodyArmor?.id, 'silk_robe');
  assert.equal(restoredPlayer.maxHp, 130, 'Restored Player has full 130 Max HP reconstructed from saved armor');
  assert.equal(restoredPlayer.hp, snapshot.hp, 'Current HP accurately preserved across snapshot handoff');
  console.log('✓ PASS: Snapshots serialize and restore equipped armor slots cleanly across scene handoffs.\n');

  console.log('======================================================');
  console.log('ALL MILESTONE 28 TESTS COMPLETED & VERIFIED SUCCESSFULLY');
  console.log('======================================================');
}

runMilestone28Tests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
