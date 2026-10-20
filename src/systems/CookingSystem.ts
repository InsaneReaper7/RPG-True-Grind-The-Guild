import { DataLoader } from '../utils/DataLoader.ts';
import { GameState } from './GameState.ts';
import { Player } from '../entities/Player.ts';
import { CookingRecipeDef, CookingSlotDef, FoodQuality } from '../types/game.ts';

export interface ComputedDishBuffs {
  hpRegenPerSec?: number;
  energyRegenPerSec?: number;
  bonusDamagePercent?: number;
  damageTakenMultiplier?: number;
  evasionBonus?: number;
  durationMs: number;
}

export interface ComputedDish {
  recipeId: string;
  name: string;
  foodId: string;
  quality: FoodQuality;
  tier: number;
  hungerRestored: number;
  expGranted: number;
  buffs: ComputedDishBuffs;
  rarity?: 'common' | 'epic' | 'legendary';
}

export interface CookingResult {
  success: boolean;
  dish?: ComputedDish;
  count: number;
  isNewDiscovery: boolean;
  refusedLostRecipe?: boolean;
  isBurntMush?: boolean;
  message: string;
  expAwarded: number;
}

export class CookingSystem {
  public static readonly CHEF_CLASSES = [
    'apprentice_cook',
    'line_cook',
    'chef',
    'executive_chef'
  ];

  public static readonly BASE_BUFFS_BY_SLOTS: Record<number, {
    durationSec: number;
    H: number;
    E: number;
    D: number;
    TBonus: number;
    V: number;
    hunger: number;
    exp: number;
  }> = {
    2: { durationSec: 120, H: 1.0, E: 0.25, D: 0.04, TBonus: 0.04, V: 0.03, hunger: 25, exp: 20 },
    3: { durationSec: 150, H: 1.5, E: 0.40, D: 0.06, TBonus: 0.06, V: 0.04, hunger: 35, exp: 35 },
    4: { durationSec: 180, H: 2.0, E: 0.50, D: 0.08, TBonus: 0.08, V: 0.05, hunger: 45, exp: 50 },
    5: { durationSec: 240, H: 2.5, E: 0.60, D: 0.10, TBonus: 0.10, V: 0.06, hunger: 60, exp: 70 }
  };

  public static readonly QUALITY_POTENCY: Record<FoodQuality, number> = {
    common: 1.0,
    good: 1.25,
    excellent: 1.5,
    perfect: 2.0
  };

  public static readonly TIER_MULTIPLIER: Record<number, number> = {
    1: 1.0,
    2: 1.2,
    3: 1.4,
    4: 1.6
  };

  public static getSlotCount(cookingLevel: number): number {
    return Math.min(5, Math.max(2, 2 + Math.floor(cookingLevel / 15)));
  }

  public static getItemTags(itemId: string): string[] {
    const item = DataLoader.getInstance().getItem(itemId);
    if (!item) return [];
    const tags = new Set<string>(item.cookingTags || []);
    // Derive hierarchical tags
    if (tags.has('shellfish')) {
      tags.add('fish');
    }
    if (tags.has('herb') || tags.has('spice')) {
      tags.add('seasoning');
    }
    return Array.from(tags);
  }

  public static getSlotSpecificity(slot: CookingSlotDef): number {
    if (slot.item) return 3;
    if (slot.tag) {
      if (['shellfish', 'herb', 'spice'].includes(slot.tag)) return 2;
      return 1;
    }
    return 0;
  }

  public static itemMatchesSlot(itemId: string, slot: CookingSlotDef): boolean {
    if (slot.item) {
      return slot.item === itemId;
    }
    if (slot.tag) {
      const tags = CookingSystem.getItemTags(itemId);
      return tags.includes(slot.tag);
    }
    return false;
  }

  /**
   * Evaluates if itemIds can satisfy recipe.slots using bipartite / permutation matching.
   * Returns total specificity score if match succeeds, or -1 if no match.
   */
  public static evaluateRecipeMatch(recipe: CookingRecipeDef, itemIds: string[]): number {
    const slots = recipe.slots;
    if (!slots || slots.length !== itemIds.length) return -1;
    const validSlots = slots;
    const n = itemIds.length;

    // We search for a maximal bipartite matching between item indices and slot indices
    const usedSlots = new Array(n).fill(false);

    function findMatch(itemIdx: number): boolean {
      if (itemIdx === n) return true;
      const itemId = itemIds[itemIdx];
      for (let s = 0; s < n; s++) {
        if (!usedSlots[s] && CookingSystem.itemMatchesSlot(itemId, validSlots[s])) {
          usedSlots[s] = true;
          if (findMatch(itemIdx + 1)) return true;
          usedSlots[s] = false;
        }
      }
      return false;
    }

    if (findMatch(0)) {
      return validSlots.reduce((sum: number, slot: CookingSlotDef) => sum + CookingSystem.getSlotSpecificity(slot), 0);
    }
    return -1;
  }

  public static matchRecipe(itemIds: string[]): { recipe: CookingRecipeDef | null; score: number } {
    const allRecipes = DataLoader.getInstance().getCookingRecipes();
    let bestRecipe: CookingRecipeDef | null = null;
    let bestScore = -1;

    for (const recipe of allRecipes) {
      if (recipe.id === 'burnt_mush') continue;
      const score = CookingSystem.evaluateRecipeMatch(recipe, itemIds);
      if (score > bestScore) {
        bestScore = score;
        bestRecipe = recipe;
      }
    }

    return { recipe: bestRecipe, score: bestScore };
  }

  public static calculateDishQuality(
    cookingLevel: number,
    seasoningsCount: number = 0,
    hasPremium: boolean = false,
    lineCookLevel: number = 0,
    rollOverride?: number
  ): FoodQuality {
    const roll = rollOverride !== undefined ? rollOverride : Math.random();
    const effectiveSeasonings = Math.min(2, seasoningsCount);
    const lineCookBonus = Math.min(15, lineCookLevel);
    const effectiveLevel = cookingLevel + (effectiveSeasonings * 5) + lineCookBonus;

    const pPerfect = Math.min(0.35, effectiveLevel * 0.006);
    const pExcellent = Math.min(0.45, 0.05 + effectiveLevel * 0.009);
    const pGood = Math.min(0.35, 0.25 + effectiveLevel * 0.003);

    let determined: FoodQuality = 'common';
    if (roll < pPerfect) {
      determined = 'perfect';
    } else if (roll < pPerfect + pExcellent) {
      determined = 'excellent';
    } else if (roll < pPerfect + pExcellent + pGood) {
      determined = 'good';
    } else {
      determined = 'common';
    }

    // Ceiling rule: hard-capped at Excellent unless any ingredient is premium
    if (!hasPremium && determined === 'perfect') {
      determined = 'excellent';
    }

    return determined;
  }

  public static computeDish(
    recipe: CookingRecipeDef,
    quality: FoodQuality,
    ingredientsOrTier: string[] | number,
    cook?: Player
  ): ComputedDish {
    const dataLoader = DataLoader.getInstance();
    const isLostRecipe = recipe.rarity === 'epic' || recipe.rarity === 'legendary';

    // 1. Calculate Dish Tier
    let finalTier = 1;
    if (typeof ingredientsOrTier === 'number') {
      finalTier = Math.max(1, Math.min(4, ingredientsOrTier));
    } else {
      let highestNonSeasoningTier = 1;
      for (const id of ingredientsOrTier) {
        const item = dataLoader.getItem(id);
        if (!item) continue;
        const tags = CookingSystem.getItemTags(id);
        const isSeasoningOnly = tags.includes('seasoning') && !tags.includes('meat') && !tags.includes('fish') && !tags.includes('vegetable');
        if (!isSeasoningOnly && item.ingredientTier) {
          if (item.ingredientTier > highestNonSeasoningTier) {
            highestNonSeasoningTier = item.ingredientTier;
          }
        }
      }

      finalTier = highestNonSeasoningTier;
      if (!isLostRecipe && cook?.progression?.isClassUnlocked('executive_chef')) {
        finalTier = Math.min(4, finalTier + 1);
      }
    }

    const tierMult = CookingSystem.TIER_MULTIPLIER[finalTier] || 1.0;
    const qualityPotency = CookingSystem.QUALITY_POTENCY[quality] || 1.0;

    const slotCount = Math.max(2, Math.min(5, (recipe.slots?.length || (Array.isArray(ingredientsOrTier) ? ingredientsOrTier.length : 2))));
    const base = CookingSystem.BASE_BUFFS_BY_SLOTS[slotCount] || CookingSystem.BASE_BUFFS_BY_SLOTS[2];

    let baseDuration = base.durationSec;
    let baseExp = base.exp;
    let baseHunger = base.hunger;
    let generalMultiplier = recipe.multiplier || 1.0;

    if (recipe.rarity === 'epic') {
      baseDuration = 300;
      baseExp = 120;
      generalMultiplier = 1.25;
    } else if (recipe.rarity === 'legendary') {
      baseDuration = 420;
      baseExp = 120;
      generalMultiplier = 1.5;
    }

    if (recipe.durationMultiplier) {
      baseDuration *= recipe.durationMultiplier;
    }

    // Chef perk: Dish buff duration +2 * min(15, Lv)%
    if (cook?.progression?.isClassUnlocked('chef')) {
      const chefLvl = cook.progression.getClassLevel('chef');
      const chefBonusPercent = 2 * Math.min(15, chefLvl);
      baseDuration *= (1 + chefBonusPercent / 100);
    }

    const durationMs = Math.round(baseDuration * 1000);
    const computedBuffs: ComputedDishBuffs = { durationMs };

    const activeBuffs = recipe.buffs || [];
    for (const buffCode of activeBuffs) {
      let buffMult = generalMultiplier;
      if (recipe.buffMultipliers && recipe.buffMultipliers[buffCode]) {
        buffMult = recipe.buffMultipliers[buffCode];
      }

      if (buffCode === 'H') {
        computedBuffs.hpRegenPerSec = Math.round((base.H * buffMult * qualityPotency * tierMult) * 100) / 100;
      } else if (buffCode === 'E') {
        computedBuffs.energyRegenPerSec = Math.round((base.E * buffMult * qualityPotency * tierMult) * 100) / 100;
      } else if (buffCode === 'D') {
        computedBuffs.bonusDamagePercent = Math.round((base.D * buffMult * qualityPotency * tierMult) * 10000) / 10000;
      } else if (buffCode === 'T') {
        const bonusPart = base.TBonus * buffMult * qualityPotency * tierMult;
        computedBuffs.damageTakenMultiplier = Math.round((1.0 - bonusPart) * 10000) / 10000;
      } else if (buffCode === 'V') {
        computedBuffs.evasionBonus = Math.round((base.V * buffMult * qualityPotency * tierMult) * 10000) / 10000;
      }
    }

    return {
      recipeId: recipe.id,
      name: recipe.name,
      foodId: recipe.id,
      quality,
      tier: finalTier,
      hungerRestored: baseHunger,
      expGranted: baseExp,
      buffs: computedBuffs,
      rarity: recipe.rarity || 'common'
    };
  }

  public static getTriedSignatureKey(itemIds: string[]): string {
    const tags = itemIds.map(id => {
      const itemTags = CookingSystem.getItemTags(id);
      return itemTags.sort().join('+') || id;
    }).sort().join('|');
    return tags;
  }

  public static experiment(cook: Player, itemIds: string[]): CookingResult {
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    const allowedSlots = CookingSystem.getSlotCount(cook.progression?.getProficiencyLevel('cooking') || 0);
    if (itemIds.length > allowedSlots) {
      return {
        success: false,
        count: 0,
        isNewDiscovery: false,
        message: `Exceeds max unlocked slots (${allowedSlots})!`,
        expAwarded: 0
      };
    }

    // Verify materials available
    const counts: Record<string, number> = {};
    for (const id of itemIds) counts[id] = (counts[id] || 0) + 1;

    for (const [id, reqQty] of Object.entries(counts)) {
      const stock = gameState.getItemCount(id);
      const carried = cook.getItemCount(id);
      if (stock + carried < reqQty) {
        return {
          success: false,
          count: 0,
          isNewDiscovery: false,
          message: `Not enough ${id.replace(/_/g, ' ')}!`,
          expAwarded: 0
        };
      }
    }

    const { recipe } = CookingSystem.matchRecipe(itemIds);

    // Lost recipe refusal before learned
    if (recipe && (recipe.rarity === 'epic' || recipe.rarity === 'legendary')) {
      const isKnown = gameState.isCookingRecipeDiscovered(recipe.id);
      if (!isKnown) {
        return {
          success: false,
          count: 0,
          isNewDiscovery: false,
          refusedLostRecipe: true,
          message: 'This combination stirs a memory… a lost recipe. Find its scroll.',
          expAwarded: 0
        };
      }
    }

    // Consume materials: stockpile first, then cook bag
    for (const [id, reqQty] of Object.entries(counts)) {
      let remaining = reqQty;
      const stock = gameState.getItemCount(id);
      const fromStock = Math.min(stock, remaining);
      if (fromStock > 0) {
        gameState.consumeItem(id, fromStock);
        remaining -= fromStock;
      }
      if (remaining > 0) {
        cook.removeItem(id, remaining);
      }
    }

    const cookingLevel = cook.progression?.getProficiencyLevel('cooking') || 0;
    const lineCookLevel = cook.progression?.isClassUnlocked('line_cook') ? cook.progression.getClassLevel('line_cook') : 0;

    // Check seasonings and premium ingredients
    let seasoningsCount = 0;
    let hasPremium = false;
    for (const id of itemIds) {
      const tags = CookingSystem.getItemTags(id);
      if (tags.includes('seasoning')) seasoningsCount++;
      const item = dataLoader.getItem(id);
      if (item?.premium) hasPremium = true;
    }

    // If no match -> Burnt Mush
    if (!recipe) {
      const sigKey = CookingSystem.getTriedSignatureKey(itemIds);
      gameState.recordTriedCookingSignature(sigKey);
      cook.progression?.addProficiencyExp('cooking', 5);
      cook.addFoodItem('burnt_mush', 1, 'common', undefined, 1);
      return {
        success: true,
        count: 1,
        isNewDiscovery: false,
        isBurntMush: true,
        message: 'The ingredients burned into Burnt Mush (+5 Cooking EXP).',
        expAwarded: 5
      };
    }

    // Guaranteed discovery on match (Change 7)
    const isAlreadyKnown = gameState.isCookingRecipeDiscovered(recipe.id);
    const isNewDiscovery = !isAlreadyKnown;

    if (isNewDiscovery) {
      gameState.discoverCookingRecipe(recipe.id);
    }

    const quality = CookingSystem.calculateDishQuality(cookingLevel, seasoningsCount, hasPremium, lineCookLevel);
    const dish = CookingSystem.computeDish(recipe, quality, itemIds, cook);

    // Apprentice Cook extra portion roll
    let yieldCount = 1;
    if (cook.progression?.isClassUnlocked('apprentice_cook')) {
      const appLevel = cook.progression.getClassLevel('apprentice_cook');
      const extraChance = Math.min(15, appLevel);
      if (Math.random() < extraChance / 100) {
        yieldCount = 2;
      }
    }

    cook.addFoodItem(dish.foodId, yieldCount, quality, undefined, dish.tier);

    // EXP Grants:
    const expToAward = isNewDiscovery ? dish.expGranted + 20 : dish.expGranted;
    cook.progression?.addProficiencyExp('cooking', expToAward);

    // Class EXP to all unlocked Chef-line classes
    CookingSystem.grantChefClassExp(cook, expToAward);

    return {
      success: true,
      dish,
      count: yieldCount,
      isNewDiscovery,
      message: isNewDiscovery
        ? `✨ RECIPE DISCOVERED: ${dish.name} [${quality.toUpperCase()}]! (+${expToAward} Cooking EXP)`
        : `🍲 Cooked ${yieldCount}x ${dish.name} [${quality.toUpperCase()}]! (+${expToAward} Cooking EXP)`,
      expAwarded: expToAward
    };
  }

  public static cookKnown(cook: Player, recipeId: string, itemIds?: string[]): CookingResult {
    const dataLoader = DataLoader.getInstance();
    const recipe = dataLoader.getCookingRecipe(recipeId);
    if (!recipe) {
      return { success: false, count: 0, isNewDiscovery: false, message: 'Unknown recipe', expAwarded: 0 };
    }

    const ingredientsToUse = itemIds || CookingSystem.findBestIngredientsForRecipe(cook, recipe);
    if (!ingredientsToUse || ingredientsToUse.length === 0) {
      return { success: false, count: 0, isNewDiscovery: false, message: 'Missing required ingredients', expAwarded: 0 };
    }

    return CookingSystem.experiment(cook, ingredientsToUse);
  }

  public static findBestIngredientsForRecipe(cook: Player, recipe: CookingRecipeDef): string[] | null {
    const slots = recipe.slots;
    if (!slots || slots.length === 0) return null;
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    // Pool all available ingredients in stockpile + cook bag
    const available = new Map<string, number>();
    for (const [id, count] of cook.inventory.entries()) {
      const item = dataLoader.getItem(id);
      if (item?.ingredient) {
        available.set(id, (available.get(id) || 0) + count);
      }
    }
    for (const [id, count] of gameState.getInventoryMap().entries()) {
      const item = dataLoader.getItem(id);
      if (item?.ingredient) {
        available.set(id, (available.get(id) || 0) + count);
      }
    }

    const chosen: string[] = [];
    for (const slot of slots) {
      let matchedId: string | null = null;
      for (const [id, count] of available.entries()) {
        if (count > 0 && CookingSystem.itemMatchesSlot(id, slot)) {
          matchedId = id;
          break;
        }
      }
      if (!matchedId) return null;
      chosen.push(matchedId);
      available.set(matchedId, available.get(matchedId)! - 1);
    }

    return chosen;
  }

  public static grantChefClassExp(player: Player, exp: number): void {
    if (!player.progression) return;
    for (const classId of CookingSystem.CHEF_CLASSES) {
      if (player.progression.isClassUnlocked(classId)) {
        player.progression.addClassExp(classId, exp);
      }
    }
  }

  public static learnLostRecipe(scrollId: string, player: Player): { success: boolean; message: string; expAwarded: number } {
    const recipeId = scrollId.replace(/^lost_recipe_/, '');
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();
    const recipe = dataLoader.getCookingRecipe(recipeId);

    if (!recipe) {
      return { success: false, message: 'Unknown lost recipe scroll.', expAwarded: 0 };
    }

    const isAlreadyKnown = gameState.isCookingRecipeDiscovered(recipeId);
    if (isAlreadyKnown) {
      player.progression?.addProficiencyExp('cooking', 100);
      CookingSystem.grantChefClassExp(player, 100);
      return {
        success: true,
        message: `You have already studied ${recipe.name}. Comprehending the duplicate scroll granted +100 Cooking EXP.`,
        expAwarded: 100
      };
    }

    gameState.discoverCookingRecipe(recipeId);
    return {
      success: true,
      message: `✨ Lost Recipe Learned: ${recipe.name}! Added to your Recipe Journal.`,
      expAwarded: 0
    };
  }

  public static getDroppingEnemiesForLostRecipe(recipeId: string): string[] {
    const dataLoader = DataLoader.getInstance();
    const enemiesData = dataLoader.getEnemiesData();
    if (!enemiesData?.enemies) return [];
    const scrollId = recipeId.startsWith('lost_recipe_') ? recipeId : `lost_recipe_${recipeId}`;
    const result: string[] = [];
    for (const enemy of enemiesData.enemies) {
      if (enemy.lostRecipeScrolls && enemy.lostRecipeScrolls.includes(scrollId)) {
        result.push(enemy.name || enemy.id);
      }
    }
    return result;
  }
}
