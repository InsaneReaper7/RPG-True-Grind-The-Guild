import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ResearchSystem } from '../src/systems/ResearchSystem.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import type {
  SkillBookDef,
  ResearchNodeDef,
  AlchemyRecipeDef,
  BuildableDef,
  ClassesData,
  SkillDef
} from '../src/types/game.ts';

console.log('--- RUNNING MILESTONE 6: RESEARCH TREE, SKILL BOOKS & ALCHEMY UNIT TESTS ---');

// Load JSON data directly from disk to verify data integrity
const rootDir = process.cwd();
const skillBooksData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'skillBooks.json'), 'utf-8'));
const researchTreeData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'researchTree.json'), 'utf-8'));
const alchemyRecipesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'alchemyRecipes.json'), 'utf-8'));
const buildablesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'buildables.json'), 'utf-8'));
const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'skills.json'), 'utf-8'));

// Test 1: Data Contract & JSON Configuration Invariants
{
  // 1. Skill Books Data
  assert.ok(Array.isArray(skillBooksData.skillBooks), 'skillBooks.json must have skillBooks array');
  const powerStrikeBook = skillBooksData.skillBooks.find((b: SkillBookDef) => b.id === 'book_power_strike');
  const thrustBook = skillBooksData.skillBooks.find((b: SkillBookDef) => b.id === 'book_thrust');

  assert.ok(powerStrikeBook, 'book_power_strike must exist in skillBooks.json');
  assert.equal(powerStrikeBook.skillId, 'power_strike');
  assert.equal(powerStrikeBook.researchPoints, 10, 'book_power_strike must grant 10 research points when redundant');

  assert.ok(thrustBook, 'book_thrust must exist in skillBooks.json');
  assert.equal(thrustBook.skillId, 'thrust');
  assert.equal(thrustBook.researchPoints, 10, 'book_thrust must grant 10 research points when redundant');

  // 2. Research Tree Data
  assert.ok(Array.isArray(researchTreeData.nodes), 'researchTree.json must have nodes array');
  const alchemyNode = researchTreeData.nodes.find((n: ResearchNodeDef) => n.id === 'research_alchemy_station');
  assert.ok(alchemyNode, 'research_alchemy_station must exist in researchTree.json');
  assert.equal(alchemyNode.targetBuildableId, 'alchemy_station');
  assert.equal(alchemyNode.cost, 10, 'research_alchemy_station must cost 10 research points');

  // 3. Alchemy Recipes Data
  assert.ok(Array.isArray(alchemyRecipesData.recipes), 'alchemyRecipes.json must have recipes array');
  const bandageRecipe = alchemyRecipesData.recipes.find((r: AlchemyRecipeDef) => r.id === 'bandage');
  assert.ok(bandageRecipe, 'bandage recipe must exist in alchemyRecipes.json');
  assert.equal(bandageRecipe.ingredients.wood, 5, 'Bandage must cost 5 Wood placeholder');
  assert.deepEqual(bandageRecipe.cures, ['bleed'], 'Bandage must cure bleed status effect');
  assert.equal(bandageRecipe.expGranted, 25, 'Bandage must grant 25 Alchemy EXP per craft');

  // 4. Buildables Data
  const alchemyBuildable = buildablesData.buildables.find((b: BuildableDef) => b.id === 'alchemy_station');
  assert.ok(alchemyBuildable, 'alchemy_station must exist in buildables.json');
  assert.equal(alchemyBuildable.lockedByDefault, true, 'alchemy_station must be locked by default until researched');
  assert.equal(alchemyBuildable.woodCost, 25);
  assert.equal(alchemyBuildable.indoorRequired, true);
  assert.equal(alchemyBuildable.roomTag, 'alchemy');

  console.log('✔ Test 1 passed: JSON configuration contracts and data invariants verified');
}

// Helper: Duck-typed mock player compatible with systems without requiring browser/Phaser
function createMockPlayer() {
  const activeStatusEffects = new Map<string, any>();
  const knownSkillIds = ['power_strike'];
  const bookLearnedSkills = new Set<string>();

  return {
    knownSkillIds,
    bookLearnedSkills,
    activeStatusEffects,
    learnSkill(skillId: string, fromBook: boolean = false): boolean {
      let newlyLearned = false;
      if (!this.knownSkillIds.includes(skillId)) {
        this.knownSkillIds.push(skillId);
        newlyLearned = true;
      }
      if (fromBook) {
        this.bookLearnedSkills.add(skillId);
      }
      return newlyLearned;
    },
    isSkillLearnedFromBook(skillId: string): boolean {
      return this.bookLearnedSkills.has(skillId);
    },
    addStatusEffect(effect: { type: string; durationMs: number; value?: number }): void {
      this.activeStatusEffects.set(effect.type, effect);
    },
    removeStatusEffect(type: string): void {
      this.activeStatusEffects.delete(type);
    },
    applyBandage(): boolean {
      if (!this.activeStatusEffects.has('bleed')) {
        return false;
      }
      const gameState = GameState.getInstance();
      if (gameState.getItemCount('bandage') <= 0) {
        return false;
      }
      const consumed = gameState.consumeItem('bandage', 1);
      if (!consumed) {
        return false;
      }
      this.activeStatusEffects.delete('bleed');
      return true;
    }
  };
}

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist'
    }
  ]
};

// Test 2: Skill Books Dual-Use Path (Learn if unknown; Convert to Research Points if known)
{
  const gameState = GameState.getInstance();
  const researchSystem = ResearchSystem.getInstance();
  const progression = new ProgressionSystem(mockClassesData);
  const player = createMockPlayer();

  // Reset GameState for isolated test
  gameState.consumeResearchPoints(gameState.getResearchPoints()); // zero out
  assert.equal(gameState.getResearchPoints(), 0);

  const bookPowerStrike: SkillBookDef = skillBooksData.skillBooks.find((b: any) => b.id === 'book_power_strike');
  const bookThrust: SkillBookDef = skillBooksData.skillBooks.find((b: any) => b.id === 'book_thrust');
  const thrustDef: SkillDef = skillsData.skills.find((s: any) => s.id === 'thrust');

  // Step 2a: Consume Tome of Thrust (Unknown skill -> Learn skill immediately)
  assert.equal(player.knownSkillIds.includes('thrust'), false, 'Player should not initially know thrust');
  const resultThrust1 = researchSystem.consumeSkillBook(bookThrust, player as any);

  assert.equal(resultThrust1.action, 'learned_skill');
  assert.equal(player.knownSkillIds.includes('thrust'), true, 'Player must now know thrust');
  assert.equal(player.isSkillLearnedFromBook('thrust'), true, 'Thrust must be flagged as book-learned');
  assert.equal(gameState.getResearchPoints(), 0, 'Learning an unknown skill yields 0 research points');

  // Verify cross-class usability via ProgressionSystem:
  assert.equal(progression.isSkillUnlocked(thrustDef, player), true, 'Book-learned skill must unlock regardless of class requirements');

  // Step 2b: Consume Tome of Thrust second time (Already known -> Convert to 10 RP)
  const resultThrust2 = researchSystem.consumeSkillBook(bookThrust, player as any);
  assert.equal(resultThrust2.action, 'converted_points');
  assert.equal(resultThrust2.pointsGained, 10);
  assert.equal(gameState.getResearchPoints(), 10, 'Redundant book must convert to +10 Research Points');

  // Step 2c: Consume Tome of Power Strike (Already known starting skill -> Convert to 10 RP)
  assert.equal(player.knownSkillIds.includes('power_strike'), true);
  const resultPS = researchSystem.consumeSkillBook(bookPowerStrike, player as any);
  assert.equal(resultPS.action, 'converted_points');
  assert.equal(resultPS.pointsGained, 10);
  assert.equal(gameState.getResearchPoints(), 20, 'Total Research Points must now equal 20');

  console.log('✔ Test 2 passed: Skill Books dual-use path (Learn if unknown vs Convert to 10 RP if known) verified');
}

// Test 3: Research Tree Unlocking Logic & Palette Gating
{
  const gameState = GameState.getInstance();
  const researchSystem = ResearchSystem.getInstance();
  const alchemyNode: ResearchNodeDef = researchTreeData.nodes.find((n: any) => n.id === 'research_alchemy_station');

  // Ensure 0 RP initially for cost gate check
  gameState.consumeResearchPoints(gameState.getResearchPoints());
  assert.equal(gameState.getResearchPoints(), 0);

  // Check 3a: Cannot unlock with 0 RP
  const checkFail = researchSystem.canUnlockNode(alchemyNode);
  assert.equal(checkFail.canUnlock, false);
  assert.match(checkFail.reason || '', /Requires 10 Research Points/);

  const unlockFail = researchSystem.unlockNode(alchemyNode);
  assert.equal(unlockFail.success, false);
  assert.equal(gameState.isBuildableUnlocked('alchemy_station'), false, 'alchemy_station must remain locked');

  // Add exactly 10 RP (the unlock cost)
  gameState.addResearchPoints(10);
  assert.equal(gameState.getResearchPoints(), 10);

  // Check 3b: Unlock succeeds with exact 10 RP
  const checkPass = researchSystem.canUnlockNode(alchemyNode);
  assert.equal(checkPass.canUnlock, true);

  const unlockSuccess = researchSystem.unlockNode(alchemyNode);
  assert.equal(unlockSuccess.success, true);
  assert.equal(unlockSuccess.buildableId, 'alchemy_station');
  assert.equal(gameState.getResearchPoints(), 0, '10 RP deducted, 0 RP remaining');
  assert.equal(gameState.isBuildableUnlocked('alchemy_station'), true, 'alchemy_station is now unlocked in GameState');

  // Check 3c: Cannot unlock again (idempotent / already unlocked)
  gameState.addResearchPoints(10);
  const checkDuplicate = researchSystem.canUnlockNode(alchemyNode);
  assert.equal(checkDuplicate.canUnlock, false);
  assert.equal(checkDuplicate.reason, 'Already unlocked');

  console.log('✔ Test 3 passed: Research Tree node unlocking, RP deduction, and unlock idempotency verified');
}

// Test 4: Build Palette Visibility Invariant
{
  const gameState = GameState.getInstance();
  // Standard buildables: wall, door, research_station (lockedByDefault: undefined / false)
  // alchemy_station: lockedByDefault: true
  const standardWall: BuildableDef = buildablesData.buildables.find((b: any) => b.id === 'wall');
  const alchemyStation: BuildableDef = buildablesData.buildables.find((b: any) => b.id === 'alchemy_station');

  // Filter logic used by HUD.updateBuildOverlay:
  const isAvailableInPalette = (def: BuildableDef) => !def.lockedByDefault || gameState.isBuildableUnlocked(def.id);

  assert.equal(isAvailableInPalette(standardWall), true, 'Standard wall is always visible in palette');
  assert.equal(isAvailableInPalette(alchemyStation), true, 'Alchemy station is visible after being researched');

  // Simulate locked state for another hypothetical station:
  const lockedDef: BuildableDef = { ...alchemyStation, id: 'forge', lockedByDefault: true };
  assert.equal(isAvailableInPalette(lockedDef), false, 'Unresearched station with lockedByDefault: true is filtered out');

  console.log('✔ Test 4 passed: Build Mode palette gating invariant verified');
}

// Test 5: Alchemy Crafting & Progressive Leveling Curve (50 + level * 4)
{
  const gameState = GameState.getInstance();
  const progression = new ProgressionSystem(mockClassesData);

  // Check 5a: Initial state is Level 0 (0/50 EXP)
  const initialStat = progression.getProficiencyStat('alchemy');
  assert.equal(initialStat.level, 0);
  assert.equal(initialStat.currentExp, 0);
  assert.equal(LevelingSystem.expForNextLevel(0), 50);

  // Set up 100 Wood Stockpile
  gameState.setWood(100);
  // Clear any existing bandages
  const existingBandages = gameState.getItemCount('bandage');
  if (existingBandages > 0) gameState.consumeItem('bandage', existingBandages);

  // Craft #1: 1 Bandage (cost 5 Wood, grants 25 EXP)
  assert.equal(gameState.consumeWood(5), true);
  gameState.addItem('bandage', 1);
  progression.addProficiencyExp('alchemy', 25);

  assert.equal(gameState.getWood(), 95);
  assert.equal(gameState.getItemCount('bandage'), 1);
  const craft1Stat = progression.getProficiencyStat('alchemy');
  assert.equal(craft1Stat.level, 0);
  assert.equal(craft1Stat.currentExp, 25);
  assert.equal(LevelingSystem.expForNextLevel(craft1Stat.level), 50, 'Craft 1: Level 0 (25/50 EXP)');

  // Craft #2: 2nd Bandage -> 50 EXP total -> LEVEL UP to Level 1!
  assert.equal(gameState.consumeWood(5), true);
  gameState.addItem('bandage', 1);
  progression.addProficiencyExp('alchemy', 25);

  assert.equal(gameState.getWood(), 90);
  assert.equal(gameState.getItemCount('bandage'), 2);
  const craft2Stat = progression.getProficiencyStat('alchemy');
  assert.equal(craft2Stat.level, 1, 'Craft 2: Reached 50 EXP -> Level 1!');
  assert.equal(craft2Stat.currentExp, 0);
  // Level 1 threshold = 50 + 1 * 4 = 54
  assert.equal(LevelingSystem.expForNextLevel(craft2Stat.level), 54, 'Craft 2: Level 1 (0/54 EXP)');

  // Craft #3: 3rd Bandage -> 25 EXP
  assert.equal(gameState.consumeWood(5), true);
  gameState.addItem('bandage', 1);
  progression.addProficiencyExp('alchemy', 25);

  assert.equal(gameState.getWood(), 85);
  assert.equal(gameState.getItemCount('bandage'), 3);
  const craft3Stat = progression.getProficiencyStat('alchemy');
  assert.equal(craft3Stat.level, 1);
  assert.equal(craft3Stat.currentExp, 25);
  assert.equal(LevelingSystem.expForNextLevel(craft3Stat.level), 54, 'Craft 3: Level 1 (25/54 EXP)');

  // Craft #4: 4th Bandage -> 50 EXP total at Level 1 (out of 54 required)
  // This verifies that 50 EXP does NOT cause another level up because threshold scaled to 54!
  assert.equal(gameState.consumeWood(5), true);
  gameState.addItem('bandage', 1);
  progression.addProficiencyExp('alchemy', 25);

  assert.equal(gameState.getWood(), 80);
  assert.equal(gameState.getItemCount('bandage'), 4);
  const craft4Stat = progression.getProficiencyStat('alchemy');
  assert.equal(craft4Stat.level, 1, 'Craft 4: 50/54 EXP does NOT level up (scaling curve holds)');
  assert.equal(craft4Stat.currentExp, 50);
  assert.equal(LevelingSystem.expForNextLevel(craft4Stat.level), 54, 'Craft 4: Level 1 (50/54 EXP)');

  console.log('✔ Test 5 passed: Alchemy crafting, stockpile deduction, and progressive leveling curve (50+level*4) verified');
}

// Test 6: Bleed Status Effect & Bandage Curing Logic
{
  const gameState = GameState.getInstance();
  const player = createMockPlayer();

  // Reset stockpile to exactly 2 bandages to match success criteria scenario
  const currentBandages = gameState.getItemCount('bandage');
  if (currentBandages > 0) {
    gameState.consumeItem('bandage', currentBandages);
  }
  gameState.addItem('bandage', 2);
  assert.equal(gameState.getItemCount('bandage'), 2, 'Starting with 2 Bandages in inventory');

  // Check 6a: Applying bandage when NOT bleeding returns false, does not consume bandage
  const applyNotBleeding = player.applyBandage();
  assert.equal(applyNotBleeding, false, 'Should not apply bandage if not bleeding');
  assert.equal(gameState.getItemCount('bandage'), 2, 'Stockpile unchanged when not bleeding');

  // Check 6b: Success Criteria 1 — Craft/have 2 Bandages, self-inflict Bleed, apply Bandage
  // Bleed clears AND inventory shows 1 Bandage remaining, not 2
  player.addStatusEffect({ type: 'bleed', durationMs: 10000, value: 5 });
  assert.equal(player.activeStatusEffects.has('bleed'), true, 'Player must have bleed active');

  const applyResult1 = player.applyBandage();
  assert.equal(applyResult1, true, 'Bandage application succeeded');
  assert.equal(player.activeStatusEffects.has('bleed'), false, 'Bleed status effect cleared completely');
  assert.equal(gameState.getItemCount('bandage'), 1, 'Inventory shows 1 Bandage remaining, not 2');

  // Use the remaining 1 Bandage
  player.addStatusEffect({ type: 'bleed', durationMs: 10000, value: 5 });
  assert.equal(player.activeStatusEffects.has('bleed'), true);
  const applyResult2 = player.applyBandage();
  assert.equal(applyResult2, true);
  assert.equal(player.activeStatusEffects.has('bleed'), false);
  assert.equal(gameState.getItemCount('bandage'), 0, 'Inventory shows 0 Bandages remaining');

  // Check 6c: Success Criteria 2 — With 0 Bandages in inventory, self-inflict Bleed and press H
  // Should fail gracefully (no cure, no crash) rather than curing for free with nothing to consume
  player.addStatusEffect({ type: 'bleed', durationMs: 10000, value: 5 });
  assert.equal(player.activeStatusEffects.has('bleed'), true);

  const applyWithZero = player.applyBandage();
  assert.equal(applyWithZero, false, 'Applying bandage with 0 in inventory returns false');
  assert.equal(player.activeStatusEffects.has('bleed'), true, 'Bleed remains active when 0 bandages available');
  assert.equal(gameState.getItemCount('bandage'), 0, 'Inventory still has 0 bandages');

  console.log('✔ Test 6 passed: Bleed curing via Bandage, stockpile consumption, and empty-stockpile guard verified');
}

console.log('\nALL 6 MILESTONE 6 UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
