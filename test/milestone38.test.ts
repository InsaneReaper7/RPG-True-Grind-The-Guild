import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs if Phaser probes for it
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load JSON data files
const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
const playerData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/player.json'), 'utf8'));
const armorsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armors.json'), 'utf8'));
const skillBooksData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skillBooks.json'), 'utf8'));
const blacksmithRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/blacksmithRecipes.json'), 'utf8'));

import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LockpickingSystem } from '../src/systems/LockpickingSystem.ts';
import { GameState } from '../src/systems/GameState.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';

async function runMilestone38Tests() {
  console.log('================================================================');
  console.log('RUNNING MILESTONE 38: LOCKPICKING & LOCKED BOX TESTS');
  console.log('================================================================\n');

  // -----------------------------------------------------------------------------
  // TEST 1: Lockpicking Proficiency Setup, Hidden-until-Level-1 & Curve
  // -----------------------------------------------------------------------------
  console.log('--- TEST 1: Lockpicking Proficiency Setup, Hidden-until-Level-1 & Curve ---');
  const prog = new ProgressionSystem(classesData, 'Tester');

  // Initialized at Level 0, 0 EXP
  const initialStat = prog.getProficiencyStat('lockpicking');
  assert.equal(initialStat.level, 0, 'Lockpicking should start at Level 0');
  assert.equal(initialStat.currentExp, 0, 'Lockpicking should start with 0 EXP');
  assert.equal(prog.isStatRevealed('lockpicking'), false, 'Lockpicking must be hidden at Level 0');

  // Follows standard constant-increment Level/EXP curve (50 + level * 4)
  assert.equal(LevelingSystem.expForNextLevel(0), 50, 'Level 0 -> 1 requires 50 EXP');
  assert.equal(LevelingSystem.expForNextLevel(1), 54, 'Level 1 -> 2 requires 54 EXP');
  assert.equal(LevelingSystem.expForNextLevel(9), 86, 'Level 9 -> 10 requires 86 EXP');

  // Test Skill Discovered event when crossing to Level 1
  let discoveredSkillId = '';
  prog.onSkillDiscovered((evt) => {
    discoveredSkillId = evt.skillId;
  });

  prog.addProficiencyExp('lockpicking', 50); // Exact EXP to reach Level 1
  assert.equal(prog.getProficiencyLevel('lockpicking'), 1, 'Lockpicking should now be Level 1');
  assert.equal(prog.isStatRevealed('lockpicking'), true, 'Lockpicking must be revealed at Level 1');
  assert.equal(discoveredSkillId, 'lockpicking', 'Skill Discovered event must fire for lockpicking');
  console.log('✓ PASS: Lockpicking proficiency initialized, curve verified, and hidden-until-Level-1 confirmed.');

  // -----------------------------------------------------------------------------
  // TEST 2: Success Rate Calculation & Long-Term Mastery Curve
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 2: Success Rate Calculation & Long-Term Mastery Curve ---');
  const lockSystem = LockpickingSystem.getInstance();

  const rateLv0 = lockSystem.calculateSuccessRate(0);
  assert.equal(rateLv0, 0.25, 'Level 0 success rate should be exactly 25%');

  const rateLv1 = lockSystem.calculateSuccessRate(1);
  assert.equal(Math.round(rateLv1 * 10000) / 10000, 0.2575, 'Level 1 success rate should be 25.75% (+0.75%)');

  const rateLv10 = lockSystem.calculateSuccessRate(10);
  assert.equal(Math.round(rateLv10 * 1000) / 1000, 0.325, 'Level 10 success rate should be 32.5% (retroactive reduction from old 60%)');

  const rateLv50 = lockSystem.calculateSuccessRate(50);
  assert.equal(rateLv50, 0.625, 'Level 50 success rate should be 62.5%');

  const rateLv100 = lockSystem.calculateSuccessRate(100);
  assert.equal(rateLv100, 1.0, 'Level 100 success rate should be 100% (full mastery)');

  const rateLv150 = lockSystem.calculateSuccessRate(150);
  assert.equal(rateLv150, 1.0, 'Level > 100 success rate should remain capped at 100%');
  console.log('✓ PASS: Lockpicking success rates scale linearly from 25% to 100% (+0.75%/level).');

  // -----------------------------------------------------------------------------
  // TEST 3: Attempt Without Locked Box in Inventory
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 3: Attempt Without Locked Box in Inventory ---');
  const gameState = GameState.getInstance();
  // Clear locked_box, lockpick, and broken_lockbox
  while (gameState.getItemCount('locked_box') > 0) gameState.consumeItem('locked_box', 1);
  while (gameState.getItemCount('lockpick') > 0) gameState.consumeItem('lockpick', 1);
  while (gameState.getItemCount('broken_lockbox') > 0) gameState.consumeItem('broken_lockbox', 1);

  const noBoxResult = lockSystem.attemptUnlock(prog, 'Tester');
  assert.equal(noBoxResult.success, false, 'Unlock should fail when no box is in inventory');
  assert.equal(noBoxResult.expGained, 0, 'No EXP should be gained when no box is present');
  console.log('✓ PASS: Safely blocks attempts with 0 boxes.');

  // -----------------------------------------------------------------------------
  // TEST 4: Attempt With Zero Lockpicks in Inventory
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 4: Attempt With Zero Lockpicks in Inventory ---');
  gameState.addItem('locked_box', 1);
  assert.equal(gameState.getItemCount('lockpick'), 0, 'Must have 0 lockpicks');
  assert.equal(gameState.getItemCount('locked_box'), 1, 'Must have 1 box');

  const noPickResult = lockSystem.attemptUnlock(prog, 'Tester');
  assert.equal(noPickResult.success, false, 'Attempt must fail when 0 lockpicks');
  assert.equal(noPickResult.expGained, 0, 'No EXP awarded when blocked by 0 lockpicks');
  assert.equal(gameState.getItemCount('locked_box'), 1, 'Locked Box must not be consumed when 0 lockpicks');
  assert.equal(noPickResult.message.includes('No Lockpicks in inventory'), true);
  console.log('✓ PASS: Safely blocks attempt with zero lockpicks without consuming box or granting EXP.');

  // -----------------------------------------------------------------------------
  // TEST 5: Single Lockpick Attempt (1 Lockpick on Hand)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 5: Single Lockpick Attempt (1 Lockpick on Hand) ---');
  // 5A: Failure with 1 lockpick: consumes 1 lockpick, preserves box, grants +5 token EXP
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  prog.getProficiencyStat('lockpicking').level = 1;
  gameState.addItem('lockpick', 1);

  const singleFailResult = lockSystem.attemptUnlock(prog, 'Tester', () => 0.999); // Force failure
  assert.equal(singleFailResult.success, false, 'Result must be false on failure roll');
  assert.equal(singleFailResult.rollsAttempted, 1, 'Must run exactly 1 roll');
  assert.equal(singleFailResult.lockpicksConsumed, 1, 'Must consume exactly 1 lockpick');
  assert.equal(gameState.getItemCount('lockpick'), 0, 'Lockpick must be consumed on failure');
  assert.equal(gameState.getItemCount('locked_box'), 1, 'Locked Box MUST remain intact and untouched on < 3 fails');
  assert.equal(gameState.getItemCount('broken_lockbox'), 0, 'No broken lockbox created on < 3 fails');
  assert.equal(singleFailResult.boxPreserved, true, 'boxPreserved must be true');
  assert.equal(singleFailResult.boxBroken, false, 'boxBroken must be false');
  assert.equal(singleFailResult.expGained, 5, 'Failure must grant exactly +5 token EXP');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 5, 'Proficiency EXP incremented by +5');
  console.log('  ✓ 5A PASS: 1-lockpick failure consumed lockpick, preserved box untouched, and granted +5 token EXP.');

  // 5B: Success with 1 lockpick: lockpick survives (0 consumed), box consumed, grants +35 EXP
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('lockpick', 1);

  const singleSuccessResult = lockSystem.attemptUnlock(prog, 'Tester', () => 0.001); // Force success
  assert.equal(singleSuccessResult.success, true, 'Result must be true on success roll');
  assert.equal(singleSuccessResult.rollsAttempted, 1, 'Must run 1 roll');
  assert.equal(singleSuccessResult.lockpicksConsumed, 0, 'Lockpick must survive (0 consumed) on success');
  assert.equal(gameState.getItemCount('lockpick'), 1, 'Lockpick is still in inventory (survived)');
  assert.equal(gameState.getItemCount('locked_box'), 0, 'Locked Box consumed on success');
  assert.equal(singleSuccessResult.expGained, 35, 'Success must grant +35 EXP');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 35, 'Proficiency EXP incremented by +35');
  assert.ok(singleSuccessResult.rewards.length >= 3, 'Must grant loot rewards');
  // Clean up survived lockpick
  gameState.consumeItem('lockpick', 1);
  console.log('  ✓ 5B PASS: 1-lockpick success kept lockpick unconsumed, consumed box, and granted +35 EXP.');

  // -----------------------------------------------------------------------------
  // TEST 6: Two Lockpicks Attempt (2 Lockpicks on Hand)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 6: Two Lockpicks Attempt (2 Lockpicks on Hand) ---');
  // 6A: Two consecutive failures: consumes 2 lockpicks, box remains untouched, awards +10 EXP (2 * 5)
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('locked_box', 1);
  gameState.addItem('lockpick', 2);

  const twoFailResult = lockSystem.attemptUnlock(prog, 'Tester', () => 0.999); // Force failures
  assert.equal(twoFailResult.success, false, 'Result must be false when both rolls fail');
  assert.equal(twoFailResult.rollsAttempted, 2, 'Must execute exactly 2 rolls bounded by available lockpicks');
  assert.equal(twoFailResult.lockpicksConsumed, 2, 'Both lockpicks consumed');
  assert.equal(gameState.getItemCount('lockpick'), 0, '0 lockpicks remaining');
  assert.equal(gameState.getItemCount('locked_box'), 1, 'Locked Box MUST remain intact and untouched after 2 fails');
  assert.equal(gameState.getItemCount('broken_lockbox'), 0, 'No broken lockbox created after 2 fails');
  assert.equal(twoFailResult.boxPreserved, true, 'boxPreserved must be true');
  assert.equal(twoFailResult.expGained, 10, 'Must grant exactly 10 EXP (2 rolls * 5 EXP)');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 10, 'Proficiency EXP incremented by +10');
  console.log('  ✓ 6A PASS: 2-lockpick failure sequence consumed 2 picks, preserved box untouched, and granted +10 EXP.');

  // 6B: Fail on roll 1, Success on roll 2: consumes 1 lockpick, roll 2 survives, box opened, awards +40 EXP (5 + 35)
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('lockpick', 2);
  let callCount6 = 0;
  // Roll 1: fail (0.999), Roll 2: success (0.001)
  const mixed2Result = lockSystem.attemptUnlock(prog, 'Tester', () => {
    callCount6++;
    return callCount6 === 1 ? 0.999 : 0.001;
  });
  assert.equal(mixed2Result.success, true, 'Result must be true on roll 2 success');
  assert.equal(mixed2Result.rollsAttempted, 2, 'Attempted 2 rolls');
  assert.equal(mixed2Result.lockpicksConsumed, 1, 'Only 1 lockpick consumed (roll 1 broke; roll 2 survived)');
  assert.equal(gameState.getItemCount('lockpick'), 1, '1 lockpick still in inventory (survived)');
  assert.equal(gameState.getItemCount('locked_box'), 0, 'Locked Box consumed on success');
  assert.equal(mixed2Result.expGained, 40, 'Must grant 40 EXP (5 fail + 35 success)');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 40, 'Proficiency EXP incremented by +40');
  gameState.consumeItem('lockpick', 1);
  console.log('  ✓ 6B PASS: 2-lockpick mixed sequence consumed 1 pick, kept winning pick, opened box, and granted 40 EXP.');

  // -----------------------------------------------------------------------------
  // TEST 7: Committed 3-Lockpick Attempt & Box Break Gamble
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 7: Committed 3-Lockpick Attempt & Box Break Gamble ---');
  // 7A: Full 3 Fails: consumes 3 lockpicks, converts box to Broken Lockbox, grants DOUBLED 30 EXP gamble bonus
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('locked_box', 1);
  gameState.addItem('lockpick', 3);

  const threeFailResult = lockSystem.attemptUnlock(prog, 'Tester', () => 0.999); // Force all 3 to fail
  assert.equal(threeFailResult.success, false, 'Result must be false on 3 fails');
  assert.equal(threeFailResult.rollsAttempted, 3, 'Must attempt all 3 rolls');
  assert.equal(threeFailResult.lockpicksConsumed, 3, 'Must consume all 3 lockpicks');
  assert.equal(gameState.getItemCount('lockpick'), 0, '0 lockpicks remaining');
  assert.equal(gameState.getItemCount('locked_box'), 0, 'Locked Box MUST be consumed on 3 strikes');
  assert.equal(gameState.getItemCount('broken_lockbox'), 1, 'Broken Lockbox MUST be added on 3 strikes');
  assert.equal(threeFailResult.boxBroken, true, 'boxBroken must be true');
  assert.equal(threeFailResult.boxPreserved, false, 'boxPreserved must be false');
  // CRITICAL CHECK: Doubled EXP gamble reward (30 EXP vs 3 separate fails of 5 = 15 EXP)
  assert.equal(threeFailResult.expGained, 30, 'Full 3-fail break MUST grant doubled gamble reward of exactly 30 EXP');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 30, 'Proficiency EXP incremented by +30');
  console.log('  ✓ 7A PASS: Full 3-fail sequence broke box, consumed 3 picks, and awarded doubled gamble bonus of 30 EXP.');

  // 7B: Mixed Sequence (Fail, Fail, Success): awards plain sum 45 EXP (5 + 5 + 35), NO doubled break bonus
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('locked_box', 1);
  gameState.addItem('lockpick', 3);
  let callCount7 = 0;
  // Roll 1: fail, Roll 2: fail, Roll 3: success
  const mixed3Result = lockSystem.attemptUnlock(prog, 'Tester', () => {
    callCount7++;
    return callCount7 <= 2 ? 0.999 : 0.001;
  });
  assert.equal(mixed3Result.success, true, 'Result must be true on roll 3 success');
  assert.equal(mixed3Result.rollsAttempted, 3, 'Attempted 3 rolls');
  assert.equal(mixed3Result.lockpicksConsumed, 2, '2 lockpicks broke; 3rd lockpick survived');
  assert.equal(gameState.getItemCount('lockpick'), 1, 'Winning lockpick survived in inventory');
  assert.equal(gameState.getItemCount('locked_box'), 0, 'Locked Box consumed on success');
  assert.equal(gameState.getItemCount('broken_lockbox'), 1, 'Broken Lockbox count unchanged (1 from test 7A)');
  assert.equal(mixed3Result.boxBroken, false, 'boxBroken must be false');
  // CRITICAL CHECK: Plain sum 45 EXP, explicitly confirming no doubled break bonus applies
  assert.equal(mixed3Result.expGained, 45, 'Mixed sequence (Fail, Fail, Success) must award exactly 45 EXP (5 + 5 + 35), confirming no doubled break bonus applies');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 45, 'Proficiency EXP incremented by +45');
  gameState.consumeItem('lockpick', 1);
  console.log('  ✓ 7B PASS: Mixed sequence (Fail, Fail, Success) awarded exactly 45 EXP with NO doubled break bonus.');

  // 7C: First Roll Success with 3 lockpicks available: 0 lockpicks consumed, 3 remain, +35 EXP
  prog.getProficiencyStat('lockpicking').currentExp = 0;
  gameState.addItem('locked_box', 1);
  gameState.addItem('lockpick', 3);

  const firstSuccessResult = lockSystem.attemptUnlock(prog, 'Tester', () => 0.001);
  assert.equal(firstSuccessResult.success, true);
  assert.equal(firstSuccessResult.rollsAttempted, 1);
  assert.equal(firstSuccessResult.lockpicksConsumed, 0, 'Lockpick must survive (0 consumed)');
  assert.equal(gameState.getItemCount('lockpick'), 3, 'All 3 lockpicks remain intact');
  assert.equal(gameState.getItemCount('locked_box'), 0, 'Box opened and consumed');
  assert.equal(firstSuccessResult.expGained, 35, 'First roll success awards +35 EXP');
  assert.equal(prog.getProficiencyStat('lockpicking').currentExp, 35);
  // Clear lockpicks
  while (gameState.getItemCount('lockpick') > 0) gameState.consumeItem('lockpick', 1);
  console.log('  ✓ 7C PASS: First roll success kept all 3 lockpicks intact and awarded +35 EXP.');

  // -----------------------------------------------------------------------------
  // TEST 8: Blacksmithing Bench Recipes & Net Scrap Loss
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 8: Blacksmithing Bench Recipes & Net Scrap Loss ---');
  // 8A: Lockpick recipe exists, costs 1 Steel Scrap, yields 1 Lockpick, no level requirement
  const lockpickRecipe = blacksmithRecipesData.recipes.find((r: any) => r.id === 'lockpick');
  assert.ok(lockpickRecipe, 'Lockpick recipe must exist in blacksmithRecipes.json');
  assert.equal(lockpickRecipe.requiredLevel, 0, 'Lockpick recipe requires Level 0 (always unlocked)');
  assert.equal(lockpickRecipe.ingredients.steel_scrap, 1, 'Lockpick must cost exactly 1 Steel Scrap');
  assert.equal(lockpickRecipe.resultItemId, 'lockpick', 'Lockpick recipe produces lockpick item');
  assert.equal(lockpickRecipe.resultCount ?? 1, 1, 'Lockpick recipe produces 1 lockpick');
  console.log('  ✓ 8A PASS: Lockpick recipe verified (1 Steel Scrap, Level 0 requirement, yields 1 Lockpick).');

  // 8B: Smelt Broken Lockbox recipe exists, costs 1 Broken Lockbox, yields 2 Steel Scrap, Level 0
  const smeltRecipe = blacksmithRecipesData.recipes.find((r: any) => r.id === 'smelt_broken_lockbox');
  assert.ok(smeltRecipe, 'Smelt Broken Lockbox recipe must exist in blacksmithRecipes.json');
  assert.equal(smeltRecipe.requiredLevel, 0, 'Smelting requires Level 0');
  assert.equal(smeltRecipe.ingredients.broken_lockbox, 1, 'Smelting requires 1 Broken Lockbox');
  assert.equal(smeltRecipe.resultItemId, 'steel_scrap', 'Smelting produces steel_scrap');
  assert.equal(smeltRecipe.resultCount, 2, 'Smelting yields exactly 2 Steel Scrap');
  console.log('  ✓ 8B PASS: Smelt recipe verified (1 Broken Lockbox, Level 0 requirement, yields exactly 2 Steel Scrap).');

  // 8C: Confirm net loss relative to worst-case 3-lockpick cost
  const scrapCostFor3Picks = 3 * lockpickRecipe.ingredients.steel_scrap; // 3 Scrap
  const scrapYieldFromSmelt = smeltRecipe.resultCount; // 2 Scrap
  const netScrapChange = scrapYieldFromSmelt - scrapCostFor3Picks; // -1 Scrap
  assert.equal(scrapCostFor3Picks, 3, '3 lockpicks cost 3 Steel Scrap');
  assert.equal(scrapYieldFromSmelt, 2, 'Smelting Broken Lockbox recovers 2 Steel Scrap');
  assert.equal(netScrapChange, -1, 'Worst-case full failure MUST result in a net loss of 1 Steel Scrap');
  console.log(`  ✓ 8C PASS: Genuine economic risk confirmed: 3 picks cost ${scrapCostFor3Picks} Scrap, recovery yields ${scrapYieldFromSmelt} Scrap, Net Loss: ${Math.abs(netScrapChange)} Scrap.`);

  // -----------------------------------------------------------------------------
  // TEST 9: Failed-roll EXP Token Analysis
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 9: Failed-roll EXP Token Analysis ---');
  assert.equal(LockpickingSystem.FAIL_EXP, 5, 'Standard FAIL_EXP must be 5');
  assert.equal(LockpickingSystem.SUCCESS_EXP, 35, 'Standard SUCCESS_EXP must be 35');
  const failToSuccessRatio = LockpickingSystem.FAIL_EXP / LockpickingSystem.SUCCESS_EXP;
  assert.ok(failToSuccessRatio < 0.20, 'Failed EXP must be small token (< 20% of success)');
  console.log(`  ✓ 9 PASS: Standard failure EXP is 5 (~${Math.round(failToSuccessRatio * 100)}% of success), confirming it is non-viable for deliberate failure grinding.`);

  // -----------------------------------------------------------------------------
  // TEST 10: 20 Simulated Openings — Strict Verification of Zero Dead Assets
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 10: 20 Simulated Openings — Reward Table & Asset Integrity ---');
  const validArmorIds = new Set(armorsData.armors.map((a: any) => a.id));
  const validSkillBookIds = new Set(skillBooksData.skillBooks.map((b: any) => b.id));
  const validResourceIds = new Set(['ore', 'wood']);
  const validReagentIds = new Set(['steel_scrap', 'spider_silk', 'wolf_pelt', 'bone', 'orc_heavy_hide', 'bandage', 'energy_potion', 'mana_potion', 'revive_potion']);

  let totalRP = 0;
  let totalMaterials = 0;
  let totalConsumables = 0;
  let rareItemCount = 0;

  for (let i = 0; i < 20; i++) {
    const loot = lockSystem.rollLockedBoxLoot();
    assert.ok(loot.length >= 3, `Opening ${i + 1} must have at least 3 loot entries`);

    for (const entry of loot) {
      assert.notEqual(entry.id, 'gold_coin', 'FORBIDDEN: gold_coin cannot exist');
      assert.notEqual(entry.id, 'ruby_gem', 'FORBIDDEN: ruby_gem cannot exist');
      assert.notEqual(entry.id, 'ancient_relic', 'FORBIDDEN: ancient_relic cannot exist');

      if (entry.type === 'research_points') {
        assert.equal(entry.id, 'research_points');
        assert.ok(entry.count >= 10 && entry.count <= 20, 'RP count must be between 10 and 20');
        totalRP += entry.count;
      } else if (entry.type === 'resource') {
        assert.ok(validResourceIds.has(entry.id), `Resource ID ${entry.id} must be valid`);
        totalMaterials += entry.count;
      } else if (entry.type === 'item') {
        if (entry.isRare) {
          rareItemCount++;
          const isValidRare = validArmorIds.has(entry.id) || validSkillBookIds.has(entry.id);
          assert.ok(isValidRare, `Rare drop ${entry.id} must be in armors or skillBooks`);
        } else {
          assert.ok(validReagentIds.has(entry.id), `Item ID ${entry.id} must be an established reagent`);
          if (entry.id === 'bandage' || entry.id.includes('potion')) {
            totalConsumables += entry.count;
          } else {
            totalMaterials += entry.count;
          }
        }
      }
    }
  }

  console.log(`  Simulated 20 Boxes: Total RP: ${totalRP}, Materials: ${totalMaterials}, Consumables: ${totalConsumables}, Rare Drops: ${rareItemCount}`);
  assert.ok(totalRP >= 200, '20 boxes should yield >= 200 Research Points');
  assert.ok(totalMaterials > 0, 'Materials must drop');
  assert.ok(totalConsumables > 0, 'Consumables must drop');
  assert.ok(rareItemCount > 0, 'Rare items (jewelry/skill books) should drop across 20 boxes');
  console.log('✓ PASS: All 20 simulated boxes produced strictly established, functional game assets with zero dead currencies.');

  // -----------------------------------------------------------------------------
  // TEST 11: Tier 0 Locksmith Class Definition & Unlock at Level 10
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST 11: Tier 0 Locksmith Class Definition & Unlock at Level 10 ---');
  const locksmithDef = classesData.classes.find((c: any) => c.id === 'locksmith');
  assert.ok(locksmithDef, 'Locksmith class must exist in classes.json');
  assert.equal(locksmithDef.name, 'Locksmith');
  assert.equal(locksmithDef.tier, 'novice', 'Locksmith must be Tier 0 (novice)');

  const req = locksmithDef.requirements.find((r: any) => r.type === 'proficiency' && r.target === 'lockpicking');
  assert.ok(req, 'Locksmith must require lockpicking proficiency');
  assert.equal(req.value, 10, 'Locksmith must require Lockpicking Level 10');

  // Check class_system.md includes Locksmith
  const classSystemMd = fs.readFileSync(path.join(rootDir, 'docs/class_system (1).md'), 'utf8');
  assert.ok(
    classSystemMd.includes('Locksmith') && classSystemMd.includes('Lockpicking 10'),
    'docs/class_system (1).md must document Locksmith at Lockpicking 10'
  );

  // Test progression evaluation
  const freshProg = new ProgressionSystem(classesData, 'Rogue');
  assert.equal(freshProg.isClassUnlocked('locksmith'), false, 'Locksmith must be locked at Level 0');

  // Set Lockpicking to Level 9
  const lockStat = freshProg.getProficiencyStat('lockpicking');
  lockStat.level = 9;
  lockStat.currentExp = 0;
  freshProg.checkClassUnlocks();
  assert.equal(freshProg.isClassUnlocked('locksmith'), false, 'Locksmith must still be locked at Level 9');

  // Level up to 10
  let classUnlockedEvent: any = null;
  freshProg.onClassUnlocked((evt) => {
    if (evt.classDef.id === 'locksmith') {
      classUnlockedEvent = evt;
    }
  });

  freshProg.addProficiencyExp('lockpicking', LevelingSystem.expForNextLevel(9));
  assert.equal(freshProg.getProficiencyLevel('lockpicking'), 10, 'Lockpicking should be Level 10');
  assert.equal(freshProg.isClassUnlocked('locksmith'), true, 'Locksmith must unlock at Lockpicking Level 10');
  assert.ok(classUnlockedEvent, 'Unlock event must fire for Locksmith');
  console.log('✓ PASS: Locksmith class correctly unlocks upon reaching Lockpicking Level 10.');

  console.log('\n================================================================');
  console.log('ALL REVISED MILESTONE 38 UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================');
}

runMilestone38Tests().catch((err) => {
  console.error('Milestone 38 test failed:', err);
  process.exit(1);
});
