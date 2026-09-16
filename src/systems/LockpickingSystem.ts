import { GameState } from './GameState.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { ResearchSystem } from './ResearchSystem.ts';
import type { LockedBoxReward, LockpickAttemptResult } from '../types/game.ts';

export class LockpickingSystem {
  private static instance: LockpickingSystem;

  public static readonly BASE_SUCCESS_RATE = 0.25; // 25% at Level 0
  public static readonly SUCCESS_RATE_PER_LEVEL = 0.0075; // +0.75% per Level (100% at Level 100)
  public static readonly MAX_SUCCESS_RATE = 1.0; // 100% cap
  public static readonly FAIL_EXP = 5; // Token failure EXP
  public static readonly FULL_BREAK_EXP = 30; // Doubled total EXP on full 3-fail box break gamble
  public static readonly SUCCESS_EXP = 35;

  private constructor() {}

  public static getInstance(): LockpickingSystem {
    if (!LockpickingSystem.instance) {
      LockpickingSystem.instance = new LockpickingSystem();
    }
    return LockpickingSystem.instance;
  }

  /**
   * Calculates success rate given a character's Lockpicking proficiency level.
   * Scales linearly from 25% at Level 0 to 100% at Level 100 (+0.75% per level).
   */
  public calculateSuccessRate(level: number): number {
    const raw = LockpickingSystem.BASE_SUCCESS_RATE + level * LockpickingSystem.SUCCESS_RATE_PER_LEVEL;
    return Math.min(LockpickingSystem.MAX_SUCCESS_RATE, Math.max(LockpickingSystem.BASE_SUCCESS_RATE, raw));
  }

  /**
   * Generates loot for a successfully picked Locked Box.
   * Strictly uses established assets: Research Points, existing crafting reagents,
   * existing potions, and existing jewelry / skill books. No dead currencies or items.
   */
  public rollLockedBoxLoot(rng: () => number = Math.random): LockedBoxReward[] {
    const rewards: LockedBoxReward[] = [];

    // 1. Currency: Guaranteed Research Points (10-20 RP)
    const rpCount = 10 + Math.floor(rng() * 11);
    rewards.push({
      type: 'research_points',
      id: 'research_points',
      name: 'Research Points',
      count: rpCount
    });

    // 2. Material Bundle 1: Mining / Smithing
    if (rng() < 0.55) {
      const oreCount = 5 + Math.floor(rng() * 8); // 5-12 Ore
      rewards.push({
        type: 'resource',
        id: 'ore',
        name: 'Ore',
        count: oreCount
      });
    } else {
      const scrapCount = 2 + Math.floor(rng() * 3); // 2-4 Steel Scrap
      rewards.push({
        type: 'item',
        id: 'steel_scrap',
        name: 'Steel Scrap',
        count: scrapCount
      });
    }

    // 3. Material Bundle 2: Tailoring / Bowyer / Salvage
    const matRoll = rng();
    if (matRoll < 0.30) {
      const silkCount = 2 + Math.floor(rng() * 4); // 2-5 Spider Silk
      rewards.push({
        type: 'item',
        id: 'spider_silk',
        name: 'Spider Silk',
        count: silkCount
      });
    } else if (matRoll < 0.60) {
      const peltCount = 2 + Math.floor(rng() * 4); // 2-5 Wolf Pelt
      rewards.push({
        type: 'item',
        id: 'wolf_pelt',
        name: 'Wolf Pelt',
        count: peltCount
      });
    } else if (matRoll < 0.85) {
      const boneCount = 3 + Math.floor(rng() * 4); // 3-6 Bone
      rewards.push({
        type: 'item',
        id: 'bone',
        name: 'Bone',
        count: boneCount
      });
    } else {
      const hideCount = 1 + Math.floor(rng() * 2); // 1-2 Orc Heavy Hide
      rewards.push({
        type: 'item',
        id: 'orc_heavy_hide',
        name: 'Orc Heavy Hide',
        count: hideCount
      });
    }

    // 4. Consumable Aid: Bandage / Energy Potion / Mana Potion
    const potRoll = rng();
    if (potRoll < 0.40) {
      const bandageCount = 2 + Math.floor(rng() * 3); // 2-4 Bandages
      rewards.push({
        type: 'item',
        id: 'bandage',
        name: 'Bandage',
        count: bandageCount
      });
    } else if (potRoll < 0.70) {
      const energyCount = 1 + Math.floor(rng() * 2); // 1-2 Energy Potions
      rewards.push({
        type: 'item',
        id: 'energy_potion',
        name: 'Energy Potion',
        count: energyCount
      });
    } else {
      const manaCount = 1 + Math.floor(rng() * 2); // 1-2 Mana Potions
      rewards.push({
        type: 'item',
        id: 'mana_potion',
        name: 'Mana Potion',
        count: manaCount
      });
    }

    // Bonus 20% roll for a life-saving Revive Potion
    if (rng() < 0.20) {
      rewards.push({
        type: 'item',
        id: 'revive_potion',
        name: 'Revive Potion',
        count: 1
      });
    }

    // 5. Rare Item Drop (35% chance)
    if (rng() < 0.35) {
      const rareCategory = rng();
      if (rareCategory < 0.50) {
        // Established Tier-1 Jewelry
        const jewelryPool = [
          { id: 'bone_necklace', name: 'Bone Necklace' },
          { id: 'wolf_claw_ring', name: 'Wolf Claw Ring' },
          { id: 'venom_charm', name: 'Venom Charm' }
        ];
        const selectedJewelry = jewelryPool[Math.floor(rng() * jewelryPool.length)];
        rewards.push({
          type: 'item',
          id: selectedJewelry.id,
          name: selectedJewelry.name,
          count: 1,
          isRare: true
        });
      } else {
        // Established Skill Books
        const bookPool = [
          { id: 'book_power_strike', name: 'Tome of Power Strike' },
          { id: 'book_thrust', name: 'Tome of Thrust' }
        ];
        const selectedBook = bookPool[Math.floor(rng() * bookPool.length)];
        rewards.push({
          type: 'item',
          id: selectedBook.id,
          name: selectedBook.name,
          count: 1,
          isRare: true
        });
      }
    }

    return rewards;
  }

  /**
   * Performs an attempt to pick a Locked Box using the specified character.
   * Runs a continuous sequence bounded by available lockpicks (up to 3 rolls).
   * - Consumes 1 lockpick per failed roll; lockpick survives on success.
   * - If player has < 3 lockpicks and fails, the Locked Box is preserved untouched.
   * - If player had 3 lockpicks and all 3 fail, the box breaks into a Broken Lockbox
   *   and awards a doubled consolation bonus of 30 EXP (vs 15 for 3 separate 1-pick fails).
   * - Mixed sequences with a success do NOT receive the doubled break bonus.
   */
  public attemptUnlock(
    memberProgression: ProgressionSystem,
    memberName: string = 'Guild Hero',
    rng: () => number = Math.random,
    playerEntity?: any
  ): LockpickAttemptResult {
    const gameState = GameState.getInstance();

    if (gameState.getItemCount('locked_box') <= 0) {
      return {
        success: false,
        expGained: 0,
        rewards: [],
        message: 'No Locked Box in inventory to pick!',
        memberName,
        rollsAttempted: 0,
        lockpicksConsumed: 0,
        boxBroken: false,
        boxPreserved: false
      };
    }

    const availableLockpicks = gameState.getItemCount('lockpick');
    if (availableLockpicks <= 0) {
      return {
        success: false,
        expGained: 0,
        rewards: [],
        message: 'No Lockpicks in inventory! Craft Lockpicks at the Blacksmithing Bench.',
        memberName,
        rollsAttempted: 0,
        lockpicksConsumed: 0,
        boxBroken: false,
        boxPreserved: false
      };
    }

    const maxRolls = Math.min(3, availableLockpicks);
    let rollsAttempted = 0;
    let lockpicksConsumed = 0;
    let totalExpGained = 0;
    let leveledUp = false;

    for (let rollIndex = 1; rollIndex <= maxRolls; rollIndex++) {
      rollsAttempted = rollIndex;
      const currentLevel = memberProgression.getProficiencyLevel('lockpicking');
      const successRate = this.calculateSuccessRate(currentLevel);
      const roll = rng();

      if (roll < successRate) {
        // SUCCESS! Winning lockpick survives (is not consumed).
        // Consume 1 Locked Box
        gameState.consumeItem('locked_box', 1);

        // Award Success EXP (+35)
        const expResult = memberProgression.addProficiencyExp('lockpicking', LockpickingSystem.SUCCESS_EXP);
        totalExpGained += LockpickingSystem.SUCCESS_EXP;
        if (expResult.leveledUp) leveledUp = true;

        // Roll & dispense loot
        const rewards = this.rollLockedBoxLoot(rng);
        const dataLoader = DataLoader.getInstance();
        const researchSystem = ResearchSystem.getInstance();

        for (const reward of rewards) {
          if (reward.type === 'research_points') {
            gameState.addResearchPoints(reward.count);
          } else if (reward.type === 'resource') {
            if (reward.id === 'ore') {
              gameState.addOre(reward.count);
            } else if (reward.id === 'wood') {
              gameState.addWood(reward.count);
            }
          } else if (reward.type === 'item') {
            if (reward.id.startsWith('book_') && playerEntity) {
              const bookDef = dataLoader.getSkillBook(reward.id);
              if (bookDef) {
                researchSystem.consumeSkillBook(bookDef, playerEntity);
              } else {
                gameState.addItem(reward.id, reward.count);
              }
            } else {
              gameState.addItem(reward.id, reward.count);
            }
          }
        }

        const newLvl = memberProgression.getProficiencyLevel('lockpicking');
        const rewardSummary = rewards.map((r) => `${r.name} x${r.count}`).join(', ');
        const pickMsg = lockpicksConsumed > 0
          ? ` (${lockpicksConsumed} lockpick${lockpicksConsumed === 1 ? '' : 's'} broke)`
          : ' (Lockpick survived intact)';
        const msg = `✨ Success! ${memberName} picked the lock on roll ${rollsAttempted} (+${totalExpGained} Lockpicking EXP)! Found: ${rewardSummary}.${pickMsg}`;
        console.log(`[Lockpicking] ${msg}`);

        return {
          success: true,
          expGained: totalExpGained,
          rewards,
          message: msg,
          memberName,
          newLevel: newLvl,
          leveledUp,
          rollsAttempted,
          lockpicksConsumed,
          boxBroken: false,
          boxPreserved: false
        };
      } else {
        // Failed roll: consume 1 lockpick immediately
        gameState.consumeItem('lockpick', 1);
        lockpicksConsumed++;

        // Award standard token fail EXP (+5)
        const expResult = memberProgression.addProficiencyExp('lockpicking', LockpickingSystem.FAIL_EXP);
        totalExpGained += LockpickingSystem.FAIL_EXP;
        if (expResult.leveledUp) leveledUp = true;
      }
    }

    // All committed rolls in this attempt failed
    if (maxRolls === 3) {
      // Full 3-strike committed attempt failed: Box breaks!
      gameState.consumeItem('locked_box', 1);
      gameState.addItem('broken_lockbox', 1);

      // Doubled bonus for full box-break gamble: total EXP for this attempt is 30.
      // 15 EXP (3 * 5) was already awarded during the 3 rolls, so award the remaining 15 bonus EXP to reach 30.
      const bonusExp = LockpickingSystem.FULL_BREAK_EXP - totalExpGained;
      if (bonusExp > 0) {
        const bonusResult = memberProgression.addProficiencyExp('lockpicking', bonusExp);
        totalExpGained += bonusExp;
        if (bonusResult.leveledUp) leveledUp = true;
      }

      const newLvl = memberProgression.getProficiencyLevel('lockpicking');
      const msg = `💥 Lockpicking failed! All 3 lockpicks broke and the lock jammed. Converted to Broken Lockbox. ${memberName} gained +${totalExpGained} Lockpicking EXP (doubled gamble bonus)!`;
      console.log(`[Lockpicking] ${msg}`);

      return {
        success: false,
        expGained: totalExpGained,
        rewards: [],
        message: msg,
        memberName,
        newLevel: newLvl,
        leveledUp,
        rollsAttempted,
        lockpicksConsumed,
        boxBroken: true,
        boxPreserved: false
      };
    } else {
      // Player had fewer than 3 lockpicks (1 or 2): Box remains untouched in inventory!
      const newLvl = memberProgression.getProficiencyLevel('lockpicking');
      const msg = `⚠️ Lockpicking attempt stopped! Spent ${lockpicksConsumed} lockpick${lockpicksConsumed === 1 ? '' : 's'} without opening the box. The Locked Box remains intact. ${memberName} gained +${totalExpGained} Lockpicking EXP.`;
      console.log(`[Lockpicking] ${msg}`);

      return {
        success: false,
        expGained: totalExpGained,
        rewards: [],
        message: msg,
        memberName,
        newLevel: newLvl,
        leveledUp,
        rollsAttempted,
        lockpicksConsumed,
        boxBroken: false,
        boxPreserved: true
      };
    }
  }
}
