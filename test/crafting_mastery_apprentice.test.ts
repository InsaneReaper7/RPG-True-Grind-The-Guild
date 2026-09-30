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
  const mockStorage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    localStorage: (global as any).localStorage
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
    getElementById: () => null,
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
import { GameState } from '../src/systems/GameState.ts';
import { isCraftingClass, getBaseItemId, resolveGearStats } from '../src/utils/gearResolver.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { PlayerData, WeaponDef, ArmorDef } from '../src/types/game.ts';

const mockPlayerData: PlayerData = {
  id: 'test_crafter',
  name: 'Valerie',
  maxHp: 60,
  criticalHpMax: 30,
  maxEnergy: 50,
  moveSpeed: 100,
  attackRangeTiles: 1,
  energyRegenPerSecond: 1,
  hpRegenPerSecond: 0.5,
  baseCarryCapacity: 50,
  knownSkillIds: [],
  equippedSkillIds: []
};

async function runTests() {
  const { Player } = await import('../src/entities/Player.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');

  function createMockScene(): any {
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
      sound: { play: () => {} },
      time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
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
          if (config && config.onComplete) config.onComplete();
          return { stop: () => {} };
        }
      }
    };
  }

  const mockScene = createMockScene();
  const fistWeapon: WeaponDef = {
    id: 'fist',
    name: 'Fist',
    category: 'unarmed',
    twoHanded: false,
    attackIntervalMs: 750,
    baseDamage: 4,
    baseAccuracy: 0.65
  };

  function createTestPlayer(data: PlayerData = mockPlayerData, prog?: ProgressionSystem): Player {
    return new Player(mockScene, 0, 0, data, fistWeapon, 32, 'avatar_hero', prog);
  }

  console.log('=== Running Crafting Mastery Apprentice Tests ===\n');

  // 1. Load Data
  const dl = DataLoader.getInstance();
  await dl.loadAll();
  const gameState = GameState.getInstance();
  gameState.resetToDefault();

  console.log('✔ DataLoader initialized.');

  // ------------------------------------------------------------------------
  // Test 1: Recipe tiers & starter band verification
  // ------------------------------------------------------------------------
  console.log('\n--- Test 1: Recipe Tiers & Starter Band Verification ---');
  const bsRecipes = dl.getBlacksmithRecipes();
  const maceRecipe = bsRecipes.find(r => r.id === 'mace');
  assert.equal(maceRecipe?.requiredLevel, 0, 'Mace recipe must be requiredLevel 0 (Band 1)');
  for (const r of bsRecipes) {
    assert.ok((r.requiredLevel ?? 0) <= 10, `Blacksmith recipe ${r.id} must be in starter band (0-10)`);
  }

  const armRecipes = dl.getArmorsmithRecipes();
  for (const r of armRecipes) {
    assert.ok((r.requiredLevel ?? 0) <= 10, `Armorsmith recipe ${r.id} must be in starter band (0-10)`);
  }

  const bowRecipes = dl.getBowyerRecipes();
  for (const r of bowRecipes) {
    assert.ok((r.requiredLevel ?? 0) <= 10, `Bowyer recipe ${r.id} must be in starter band (0-10)`);
  }

  const alcRecipes = dl.getAlchemyRecipes();
  for (const r of alcRecipes) {
    assert.equal(r.requiredLevel, 0, `Alchemy recipe ${r.id} must be requiredLevel 0`);
  }
  console.log('✔ Recipe levels adhere strictly to starter bands (0-10) and Alchemy at 0.');

  // ------------------------------------------------------------------------
  // Test 2: Decoupled Crafting Classes & Proficiency 10 Unlock
  // ------------------------------------------------------------------------
  console.log('\n--- Test 2: Decoupled Crafting Classes & Proficiency 10 Unlock ---');
  const craftingClasses = ['apprentice_smith', 'apprentice_armorer', 'apprentice_bowyer', 'apprentice_alchemist'];
  for (const cid of craftingClasses) {
    const cDef = dl.getClass(cid);
    assert.ok(cDef, `Class definition ${cid} must exist in classes.json`);
    assert.equal(cDef?.category, 'crafting', `${cid} must have category "crafting"`);
    assert.ok(isCraftingClass(cid), `isCraftingClass(${cid}) must be true`);
  }
  assert.equal(isCraftingClass('fencer'), false, 'isCraftingClass(fencer) must be false');
  assert.equal(isCraftingClass('guardian'), false, 'isCraftingClass(guardian) must be false');

  const player = createTestPlayer();
  // Set combat class
  (player.progression as any).unlockedClasses.add('fencer');
  player.setActiveClass('fencer');
  assert.equal(player.activeClass, 'fencer', 'Combat class should be fencer');

  // Attempt to set activeClass directly to a crafting class
  const setRes = player.setActiveClass('apprentice_smith');
  assert.equal(setRes, false, 'setActiveClass(apprentice_smith) must fail');
  assert.equal(player.activeClass, 'fencer', 'activeClass must remain combat class fencer');

  // Train Blacksmithing to Level 10
  // Level 10 requires sum of expForNextLevel(1..9)
  for (let i = 0; i < 20; i++) {
    player.progression.addProficiencyExp('blacksmithing', 100);
  }
  const bsLevel = player.progression.getProficiencyLevel('blacksmithing');
  assert.ok(bsLevel >= 10, `Blacksmithing level should be >= 10, got ${bsLevel}`);
  assert.ok(player.progression.isClassUnlocked('apprentice_smith'), 'Apprentice Smith must unlock at Blacksmithing 10');
  assert.equal(player.activeClass, 'fencer', 'activeClass must still be fencer after apprentice_smith unlock');

  // Train Armorsmithing, Bowyer, Alchemy to 10 as well
  for (let i = 0; i < 20; i++) {
    player.progression.addProficiencyExp('armorsmithing', 100);
    player.progression.addProficiencyExp('bowyer', 100);
    player.progression.addProficiencyExp('alchemy', 100);
  }
  assert.ok(player.progression.isClassUnlocked('apprentice_armorer'), 'Apprentice Armorer must unlock at Armorsmithing 10');
  assert.ok(player.progression.isClassUnlocked('apprentice_bowyer'), 'Apprentice Bowyer must unlock at Bowyer 10');
  assert.ok(player.progression.isClassUnlocked('apprentice_alchemist'), 'Apprentice Alchemist must unlock at Alchemy 10');
  assert.equal(player.activeClass, 'fencer', 'activeClass must remain fencer after all 4 crafting classes unlock');
  console.log('✔ All 4 Apprentice classes unlocked automatically without displacing active combat class.');

  // ------------------------------------------------------------------------
  // Test 3: Crafting Class EXP Awards
  // ------------------------------------------------------------------------
  console.log('\n--- Test 3: Crafting Class EXP Awards ---');
  // Stockpile materials for crafting
  gameState.addItem('ore', 100);
  gameState.addItem('wood', 100);
  const initialClassExp = player.progression.getClassStat('apprentice_smith').currentExp;

  const craftResult = CraftingSystem.applyCraft(player, maceRecipe!, 'blacksmithing');
  assert.ok(craftResult.success, 'Craft should succeed');
  assert.equal(craftResult.expGranted, maceRecipe!.expGranted, 'Profession EXP granted matches recipe');
  assert.equal(craftResult.classExpGranted, maceRecipe!.expGranted, 'Class EXP granted must equal recipe profession EXP');

  const afterClassExp = player.progression.getClassStat('apprentice_smith').currentExp;
  assert.equal(afterClassExp - initialClassExp, maceRecipe!.expGranted, 'Class stat EXP increased by recipe expGranted');
  console.log('✔ Crafting awards class EXP equal to profession EXP.');

  // ------------------------------------------------------------------------
  // Test 4: Bonus Yield Simulation (1,000 runs at Lv 5 and Lv 20)
  // ------------------------------------------------------------------------
  console.log('\n--- Test 4: Bonus Yield Simulation (1,000 runs) ---');
  const antidoteRecipe = dl.getAlchemyRecipes().find(r => r.id === 'antidote')!;
  assert.ok(antidoteRecipe, 'Antidote recipe exists');

  // Setup player with Apprentice Alchemist at Lv 5
  const alchemistPlayer5 = createTestPlayer({ ...mockPlayerData, id: 'alchemist5', name: 'Alchemist5' });
  (alchemistPlayer5.progression as any).unlockedClasses.add('apprentice_alchemist');
  alchemistPlayer5.progression.getClassStat('apprentice_alchemist').level = 5;
  const perks5 = CraftingSystem.getCrafterPerks(alchemistPlayer5, 'alchemy');
  assert.equal(perks5.bonusYieldChance, 5, 'Apprentice Alchemist Lv 5 must have 5% bonus yield chance');

  gameState.addItem('wild_herbs', 10000);
  let procsAt5 = 0;
  for (let i = 0; i < 1000; i++) {
    alchemistPlayer5.progression.getClassStat('apprentice_alchemist').level = 5;
    alchemistPlayer5.progression.getClassStat('apprentice_alchemist').currentExp = 0;
    const res = CraftingSystem.applyCraft(alchemistPlayer5, antidoteRecipe, 'alchemy');
    if (res.bonusProc) {
      procsAt5++;
      assert.equal(res.quantity, 2, 'Bonus proc must award exactly +1 extra item (total 2)');
    } else {
      assert.equal(res.quantity, 1, 'Non-proc yields base 1');
    }
  }
  console.log(`Simulation @ Lv 5 (expected ~50 procs): actual = ${procsAt5} procs (${(procsAt5 / 10).toFixed(1)}%)`);
  assert.ok(procsAt5 >= 25 && procsAt5 <= 80, `Lv 5 procs (${procsAt5}) should be around 50`);

  // Setup player with Apprentice Alchemist at Lv 20 (cap is 15%)
  const alchemistPlayer20 = createTestPlayer({ ...mockPlayerData, id: 'alchemist20', name: 'Alchemist20' });
  (alchemistPlayer20.progression as any).unlockedClasses.add('apprentice_alchemist');
  alchemistPlayer20.progression.getClassStat('apprentice_alchemist').level = 20;
  const perks20 = CraftingSystem.getCrafterPerks(alchemistPlayer20, 'alchemy');
  assert.equal(perks20.bonusYieldChance, 15, 'Apprentice Alchemist Lv 20 must be capped at 15% bonus yield chance');

  let procsAt20 = 0;
  for (let i = 0; i < 1000; i++) {
    alchemistPlayer20.progression.getClassStat('apprentice_alchemist').level = 20;
    alchemistPlayer20.progression.getClassStat('apprentice_alchemist').currentExp = 0;
    const res = CraftingSystem.applyCraft(alchemistPlayer20, antidoteRecipe, 'alchemy');
    if (res.bonusProc) {
      procsAt20++;
      assert.equal(res.quantity, 2, 'Bonus proc must award exactly +1 extra item (total 2)');
    } else {
      assert.equal(res.quantity, 1, 'Non-proc yields base 1');
    }
  }
  console.log(`Simulation @ Lv 20 (expected ~150 procs): actual = ${procsAt20} procs (${(procsAt20 / 10).toFixed(1)}%)`);
  assert.ok(procsAt20 >= 110 && procsAt20 <= 195, `Lv 20 procs (${procsAt20}) should be around 150 (15% cap)`);
  console.log('✔ Bonus yield chance matches class level (+1%/lvl, capped at 15%) and grants +1 extra item on proc.');

  // ------------------------------------------------------------------------
  // Test 5: Gear Stat Bonus and Instance Creation
  // ------------------------------------------------------------------------
  console.log('\n--- Test 5: Gear Stat Bonus and Instance Creation ---');
  // Crafter without class (Lv 0)
  const noviceCrafter = createTestPlayer({ ...mockPlayerData, id: 'novice', name: 'Novice' });
  gameState.addItem('ore', 50);
  gameState.addItem('wood', 50);
  const noviceCraft = CraftingSystem.applyCraft(noviceCrafter, maceRecipe!, 'blacksmithing');
  assert.ok(noviceCraft.success, 'Novice craft succeeded');
  assert.equal(noviceCraft.bonusPercent, 0, 'Novice bonus percent is 0');
  assert.equal(noviceCraft.instanceId, undefined, 'No instance created when bonus is 0');
  assert.equal(noviceCrafter.getItemCount('mace'), 1, 'Novice inventory contains base mace');

  // Crafter with Apprentice Smith Lv 8
  const masterCrafter = createTestPlayer({ ...mockPlayerData, id: 'master', name: 'Aria' });
  (masterCrafter.progression as any).unlockedClasses.add('apprentice_smith');
  masterCrafter.progression.getClassStat('apprentice_smith').level = 8;
  const ariaPerks = CraftingSystem.getCrafterPerks(masterCrafter, 'blacksmithing');
  assert.equal(ariaPerks.gearStatBonusPercent, 8, 'Aria has +8% gear stat bonus');

  const ariaCraft = CraftingSystem.applyCraft(masterCrafter, maceRecipe!, 'blacksmithing');
  assert.ok(ariaCraft.success, 'Aria craft succeeded');
  assert.equal(ariaCraft.bonusPercent, 8, 'Bonus percent is 8%');
  assert.ok(ariaCraft.instanceId, 'Instance ID created');
  assert.equal(ariaCraft.quantity, 1, 'Duplicate-gear rule: gear crafts exactly 1 copy');

  // Verify gear stats through resolver
  const instanceDef = gameState.getGearInstance(ariaCraft.instanceId!);
  assert.ok(instanceDef, 'Instance registered in GameState');
  assert.equal(instanceDef?.crafterName, 'Aria', 'Crafter is Aria');
  assert.equal(instanceDef?.bonusPercent, 8, 'Bonus percent is 8');

  const resolvedMace = dl.getWeapon(ariaCraft.instanceId!);
  assert.ok(resolvedMace, 'Weapon resolved from instanceId');
  // Base damage of mace is 7. +8% = 7 * 1.08 = 7.56
  assert.ok(Math.abs(resolvedMace!.baseDamage - 7.56) < 0.001, `Scaled baseDamage should be 7.56, got ${resolvedMace!.baseDamage}`);
  assert.equal(resolvedMace?.crafterName, 'Aria');
  assert.equal(resolvedMace?.bonusPercent, 8);

  // Non-crafted mace retains base 7.0
  const plainMace = dl.getWeapon('mace');
  assert.equal(plainMace!.baseDamage, 7, 'Base mace retains original baseDamage 7');
  console.log('✔ Gear stat bonus correctly scales primary stat (+8% on Mace: 7 -> 7.56), plain gear untouched.');

  // ------------------------------------------------------------------------
  // Test 6: Save / Load Persistence
  // ------------------------------------------------------------------------
  console.log('\n--- Test 6: Save / Load Round-Trip Persistence ---');
  // Equip the crafted mace on Aria
  masterCrafter.equipWeapon(resolvedMace, true);
  assert.equal(masterCrafter.equippedWeapon.id, ariaCraft.instanceId);
  assert.ok(Math.abs(masterCrafter.equippedWeapon.baseDamage - 7.56) < 0.001);

  // Save GameState snapshot
  gameState.savePartySnapshot([masterCrafter], 1000);
  const snapshot = gameState.getSnapshot()!;
  assert.ok(snapshot.gearInstances, 'Snapshot contains gearInstances');
  assert.ok(snapshot.gearInstances![ariaCraft.instanceId!], 'Snapshot contains crafted mace instance');

  // Reset GameState and restore from snapshot
  gameState.resetToDefault();
  assert.equal(gameState.getGearInstance(ariaCraft.instanceId!), undefined, 'Cleared after reset');

  gameState.restoreFromLoadedSnapshot(snapshot);
  const restoredInstance = gameState.getGearInstance(ariaCraft.instanceId!);
  assert.ok(restoredInstance, 'Instance restored in GameState');
  assert.equal(restoredInstance?.crafterName, 'Aria');
  assert.equal(restoredInstance?.bonusPercent, 8);

  // Restore player from snapshot
  const restoredPartySnapshots = gameState.getPartySnapshots();
  assert.equal(restoredPartySnapshots.length, 1);
  const restoredAria = createTestPlayer();
  restoredAria.restoreFromSnapshot(restoredPartySnapshots[0], 1000);
  assert.equal(restoredAria.equippedWeapon.id, ariaCraft.instanceId);
  assert.ok(Math.abs(restoredAria.equippedWeapon.baseDamage - 7.56) < 0.001, 'Restored equipped weapon retains 7.56 baseDamage');
  assert.equal(restoredAria.equippedWeapon.crafterName, 'Aria');
  assert.equal(restoredAria.equippedWeapon.bonusPercent, 8);
  console.log('✔ GearItemInstance persisted perfectly through save/load round-trip.');

  // ------------------------------------------------------------------------
  // Test 7: Systems Integration & Audit Safety
  // ------------------------------------------------------------------------
  console.log('\n--- Test 7: Systems Integration & Audit Safety ---');
  // 7a. Stash ownership counts instances toward base item
  assert.equal(gameState.getItemCount('mace'), 0, 'No mace in stockpile');
  // Add another crafted mace to stockpile
  const maceInst2Id = 'gear_mace_stockpile_test';
  gameState.registerGearInstance({
    instanceId: maceInst2Id,
    baseItemId: 'mace',
    crafterName: 'Aria',
    bonusPercent: 8,
    craftedAt: Date.now()
  });
  gameState.addItem(maceInst2Id, 1);
  assert.equal(gameState.getItemCount('mace'), 1, 'GameState.getItemCount("mace") must count mace instance');

  // 7b. Auto-deposit does not deposit gear instances
  assert.equal(GameState.isDepositedMaterial(ariaCraft.instanceId!), false, 'isDepositedMaterial must be false for gear instance');
  assert.equal(GameState.isDepositedMaterial(maceInst2Id), false, 'isDepositedMaterial must be false for gear instance 2');

  // 7c. auditSavedDuplicateGear leaves two distinct instances alone
  const saveSnapshotForAudit = gameState.getSnapshot()!;
  (global as any).localStorage.setItem(GameState.SAVE_STORAGE_KEY, JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    snapshot: saveSnapshotForAudit
  }));
  const auditRes = GameState.auditSavedDuplicateGear();
  assert.ok(auditRes.hasSave, 'Audit found save');
  const maceDup = auditRes.duplicateGear.find(d => d.itemId === 'mace');
  assert.equal(maceDup, undefined, 'Distinct gear instances must NEVER be counted as duplicate copies of each other');

  // 7d. Save migration: activeClass crafting class gets cleared to null
  const snapshotWithCraftingActive = JSON.parse(JSON.stringify(saveSnapshotForAudit));
  snapshotWithCraftingActive.party[0].activeClass = 'apprentice_armorer';
  gameState.resetToDefault();
  gameState.restoreFromLoadedSnapshot(snapshotWithCraftingActive);
  const migratedPartySnapshots = gameState.getPartySnapshots();
  assert.equal(migratedPartySnapshots[0].activeClass, null, 'Party snapshot activeClass migrated to null');
  const migratedPlayer = createTestPlayer();
  migratedPlayer.restoreFromSnapshot(migratedPartySnapshots[0], 1000);
  assert.equal(migratedPlayer.activeClass, null, 'Active class must be migrated from apprentice_armorer to null');

  console.log('✔ All systems integration and audit invariants verified.');
  console.log('\n=== ALL CRAFTING MASTERY APPRENTICE TESTS PASSED ===\n');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
