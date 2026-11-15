import { DataLoader } from '../utils/DataLoader.ts';
import { GameState } from './GameState.ts';
import { EventLog } from './EventLog.ts';
import { HiddenSkillSystem } from './HiddenSkillSystem.ts';
import type {
  MerchantStockItem,
  MerchantStockEntry,
  FoodQuality,
  FoodItemInstance,
  SellableItemEntry
} from '../types/game.ts';
import type { Player } from '../entities/Player.ts';
import { createPassiveRng } from '../utils/rng.ts';

export class MerchantSystem {
  private static instance: MerchantSystem | null = null;

  // Dedicated seeded RNG streams
  private hagglingRng: () => number = createPassiveRng(0x68616767);
  private customRngFactory?: (visitNumber: number) => (() => number);

  private constructor() {}

  public static getInstance(): MerchantSystem {
    if (!MerchantSystem.instance) {
      MerchantSystem.instance = new MerchantSystem();
    }
    return MerchantSystem.instance;
  }

  public setHagglingRng(rng: () => number): void {
    this.hagglingRng = rng;
  }

  public getHagglingRng(): () => number {
    return this.hagglingRng;
  }

  public setMerchantRngFactory(fn: (visitNumber: number) => (() => number)): void {
    this.customRngFactory = fn;
  }

  private getStockRng(visitNumber: number): () => number {
    if (this.customRngFactory) {
      return this.customRngFactory(visitNumber);
    }
    // Seeded stream dedicated per visit number using project's seeded stream helper
    return createPassiveRng((0x6d657263 + visitNumber * 1013) >>> 0);
  }

  /**
   * Called when GameState.advanceGameDay progresses the clock.
   */
  public onGameDayAdvanced(currentDay: number): void {
    const gameState = GameState.getInstance();
    const isStallPlaced = gameState.hasPlacedBuildable('merchant_stall');
    if (!isStallPlaced) {
      return;
    }

    const config = DataLoader.getInstance().getMerchantConfig();
    const state = gameState.getMerchantState();

    // First placement initialization
    if (!state.placed) {
      state.placed = true;
      state.nextArrivalDay = currentDay + config.firstVisitDelayDays;
      gameState.setMerchantState(state);
    }

    // Departure check: if merchant was present and reached departureDay
    if (state.present && state.departureDay !== undefined && currentDay >= state.departureDay) {
      state.present = false;
      state.departureDay = undefined;
      gameState.setMerchantState(state);
      EventLog.getInstance().add('session', 'The travelling merchant has departed from the guild hall.');
      const outpostScene = this.getOutpostScene();
      if (outpostScene && typeof outpostScene.updateMerchantVisuals === 'function') {
        outpostScene.updateMerchantVisuals();
      }
    }

    // Arrival check: if merchant is away and reached nextArrivalDay
    if (!state.present && currentDay >= state.nextArrivalDay) {
      state.present = true;
      state.visitNumber = (state.visitNumber || 0) + 1;
      state.departureDay = currentDay + config.visitLengthDays;
      state.nextArrivalDay = currentDay + config.visitIntervalDays;
      state.stock = this.rollStock(state.visitNumber);
      gameState.setMerchantState(state);

      const arrivalMsg = 'A travelling merchant has set up in the guild hall.';
      EventLog.getInstance().add('session', arrivalMsg);

      const hud = this.getHUD();
      if (hud && typeof hud.showToast === 'function') {
        hud.showToast(`🪙 ${arrivalMsg}`, 'info', 4000);
      }

      const outpostScene = this.getOutpostScene();
      if (outpostScene && typeof outpostScene.updateMerchantVisuals === 'function') {
        outpostScene.updateMerchantVisuals();
      }
    }
  }

  /**
   * Rolls stockSlots distinct items deterministically for the given visit number.
   * Excludes recipe scrolls that the guild already knows.
   */
  public rollStock(visitNumber: number): MerchantStockItem[] {
    const dataLoader = DataLoader.getInstance();
    const config = dataLoader.getMerchantConfig();
    const stockPool = dataLoader.getMerchantStock();
    const gameState = GameState.getInstance();

    // Filter out known recipe scrolls
    const eligiblePool: MerchantStockEntry[] = stockPool.filter((entry) => {
      if (entry.kind === 'recipeScroll') {
        const itemDef = dataLoader.getItem(entry.refId);
        const recipeId = itemDef?.teachesRecipeId || entry.refId.replace(/^merchant_recipe_/, '').replace(/^gear_recipe_/, '');
        if (gameState.isGearRecipeKnown(recipeId) || gameState.isAlchemyRecipeDiscovered(recipeId)) {
          return false;
        }
      }
      return true;
    });

    const slots = config.stockSlots ?? 6;
    const selected: MerchantStockItem[] = [];
    const remaining = [...eligiblePool];
    const rng = this.getStockRng(visitNumber);

    while (selected.length < slots && remaining.length > 0) {
      const totalWeight = remaining.reduce((sum, item) => sum + (item.weight ?? 1), 0);
      if (totalWeight <= 0) break;

      let roll = rng() * totalWeight;
      let chosenIdx = 0;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i].weight ?? 1;
        if (roll < w) {
          chosenIdx = i;
          break;
        }
        roll -= w;
      }

      const chosen = remaining.splice(chosenIdx, 1)[0];
      selected.push({
        ...chosen,
        sold: false
      });
    }

    return selected;
  }

  /**
   * Sell price calculation (single function).
   */
  public static getSellPrice(itemOrInstance: any, trader?: Player): number {
    const dataLoader = DataLoader.getInstance();
    const config = dataLoader.getMerchantConfig();
    const gameState = GameState.getInstance();

    let id: string;
    let instance: any = null;
    let bonusPercent = 0;
    let foodQuality: FoodQuality = 'common';

    if (typeof itemOrInstance === 'string') {
      id = itemOrInstance;
      instance = gameState.getGearInstance(id);
      if (instance) {
        bonusPercent = instance.bonusPercent ?? 0;
      }
    } else if (itemOrInstance && typeof itemOrInstance === 'object') {
      id = itemOrInstance.baseItemId || itemOrInstance.id;
      instance = itemOrInstance;
      if (itemOrInstance.bonusPercent !== undefined) {
        bonusPercent = itemOrInstance.bonusPercent;
      }
      if (itemOrInstance.quality) {
        foodQuality = itemOrInstance.quality;
      }
    } else {
      return 0;
    }

    // Find recipe that created this item
    const recipe = MerchantSystem.findRecipeForResult(id);
    if (!recipe && !instance?.crafterName) {
      return 0; // Not crafted, not sellable
    }

    // Calculate sum of recipe ingredient quantities
    let ingredientSum = 0;
    if (recipe && recipe.ingredients) {
      for (const count of Object.values(recipe.ingredients)) {
        ingredientSum += (count as number);
      }
    }

    const resultCount = recipe?.resultCount ?? 1;
    const requiredLevel = recipe?.requiredLevel ?? 0;
    const itemDef = dataLoader.getItem(id) || dataLoader.getWeapon(id) || dataLoader.getArmor(id);
    const rarity = instance?.rarity || recipe?.rarity || itemDef?.rarity || 'common';
    const rarityMultiplier = config.rarityMultiplier[rarity] ?? 1.0;
    const bonusMultiplier = 1 + (bonusPercent / 100);

    let foodMultiplier = 1.0;
    const foodDef = dataLoader.getFood(id);
    if (foodDef) {
      foodMultiplier = config.foodQualityMultiplier[foodQuality] ?? 1.0;
    }

    const hagglingLevel = trader?.progression ? trader.progression.getProficiencyLevel('haggling') : 0;
    const hagglingMultiplier = 1 + (config.hagglingPerLevel * hagglingLevel);

    const base = (config.valuePerIngredientUnit * ingredientSum / resultCount)
      * (1 + (config.valuePerRequiredLevel * requiredLevel));

    const finalPrice = Math.floor(
      base * rarityMultiplier * bonusMultiplier * foodMultiplier * hagglingMultiplier
    );

    return Math.max(1, finalPrice);
  }

  /**
   * Buy price calculation.
   */
  public static getBuyPrice(price: number, trader?: Player): number {
    const config = DataLoader.getInstance().getMerchantConfig();
    const hagglingLevel = trader?.progression ? trader.progression.getProficiencyLevel('haggling') : 0;
    const hagglingMultiplier = 1 + (config.hagglingPerLevel * hagglingLevel);
    return Math.max(1, Math.floor(price / hagglingMultiplier));
  }

  /**
   * Identifies whether an item ID is the result of any recipe.
   */
  public static isCraftedRecipeResult(id: string): boolean {
    return MerchantSystem.findRecipeForResult(id) !== undefined;
  }

  /**
   * Identifies whether an item or gear instance is sellable.
   * Sellable = recipe result or crafted GearItemInstance.
   */
  public static isSellable(itemOrInstance: any): boolean {
    if (!itemOrInstance) return false;
    if (typeof itemOrInstance === 'object' && itemOrInstance.crafterName) {
      return true;
    }
    const id = typeof itemOrInstance === 'string' ? itemOrInstance : (itemOrInstance.id || itemOrInstance.baseItemId);
    return MerchantSystem.isCraftedRecipeResult(id);
  }

  /**
   * Searches all recipe lists for the recipe producing the given item, weapon, armor, or food ID.
   */
  public static findRecipeForResult(resultId: string): any | undefined {
    const dl = DataLoader.getInstance();
    const allLists = [
      dl.getAlchemyRecipes(),
      dl.getCookingRecipes(),
      dl.getBlacksmithRecipes(),
      dl.getBowyerRecipes(),
      dl.getArmorsmithRecipes(),
      dl.getTailoringRecipes(),
      dl.getJewelcraftingRecipes(),
      dl.getWoodworkingRecipes(),
      dl.getStonemasonRecipes(),
      dl.getEnchantingRecipes()
    ];

    for (const list of allLists) {
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const item = r as any;
        if (
          item.resultItemId === resultId ||
          item.resultWeaponId === resultId ||
          item.resultArmorId === resultId ||
          item.resultFoodId === resultId ||
          item.id === resultId
        ) {
          return r;
        }
      }
    }
    return undefined;
  }

  /**
   * Executes a purchase transaction.
   */
  public buyItem(stockEntryId: string, trader: Player): { success: boolean; reason?: string } {
    const gameState = GameState.getInstance();
    const state = gameState.getMerchantState();
    const entry = state.stock.find((s) => s.id === stockEntryId);

    if (!entry) {
      return { success: false, reason: 'Item not in stock.' };
    }
    if (entry.sold) {
      return { success: false, reason: 'Item is already sold.' };
    }

    const price = MerchantSystem.getBuyPrice(entry.price, trader);
    if (gameState.getGold() < price) {
      return { success: false, reason: 'Not enough gold.' };
    }

    // Deduct gold
    const goldDeducted = gameState.consumeGold(price);
    if (!goldDeducted) {
      return { success: false, reason: 'Could not deduct gold.' };
    }

    entry.sold = true;
    gameState.setMerchantState(state);

    // Deliver item: trader's bag, or outpost storage if over weight
    const dl = DataLoader.getInstance();
    const itemWeight = dl.getItemWeight(entry.refId);
    const traderWeight = trader.getTotalWeight();
    const traderCapacity = trader.getEffectiveCarryCapacity();

    if (traderWeight + itemWeight > traderCapacity) {
      // Goes to outpost storage
      gameState.addItem(entry.refId, 1);
      const hud = this.getHUD();
      if (hud && typeof hud.showToast === 'function') {
        hud.showToast(`Bag full! ${entry.refId} was sent to Outpost storage.`, 'info');
      }
    } else {
      trader.addItem(entry.refId, 1);
    }

    // Trigger Haggling proc on dedicated hagglingRng
    this.rollHagglingProc(trader);

    EventLog.getInstance().add('session', `${trader.entityName} bought ${entry.refId} for ${price} gold.`);
    return { success: true };
  }

  /**
   * Executes a sell transaction.
   */
  public sellItem(
    itemOrInstance: any,
    count: number,
    trader: Player,
    sourceHolder?: Player | 'stockpile'
  ): { success: boolean; goldGained: number } {
    if (count <= 0) {
      return { success: false, goldGained: 0 };
    }

    const unitPrice = MerchantSystem.getSellPrice(itemOrInstance, trader);
    if (unitPrice <= 0) {
      return { success: false, goldGained: 0 };
    }

    const id = typeof itemOrInstance === 'string' ? itemOrInstance : (itemOrInstance.instanceId || itemOrInstance.id || itemOrInstance.baseItemId);
    const gameState = GameState.getInstance();
    let removed = false;

    if (sourceHolder === 'stockpile') {
      removed = gameState.consumeItem(id, count);
    } else if (sourceHolder && typeof (sourceHolder as any).removeItem === 'function') {
      removed = (sourceHolder as Player).removeItem(id, count);
    } else {
      // Find where it exists
      if (trader.getItemCount(id) >= count) {
        removed = trader.removeItem(id, count);
      } else if (gameState.getItemCount(id) >= count) {
        removed = gameState.consumeItem(id, count);
      }
    }

    if (!removed) {
      return { success: false, goldGained: 0 };
    }

    const totalGold = unitPrice * count;
    gameState.addGold(totalGold);

    // Trigger Haggling proc on dedicated hagglingRng
    this.rollHagglingProc(trader);

    EventLog.getInstance().add('session', `${trader.entityName} sold ${count}x ${id} for ${totalGold} gold.`);
    return { success: true, goldGained: totalGold };
  }

  /**
   * Rolls Haggling hidden skill proc for the trader on transactions.
   */
  public rollHagglingProc(trader: Player): void {
    if (!trader || !trader.progression) return;
    const hagglingDef = DataLoader.getInstance().getHiddenSkill('haggling');
    if (!hagglingDef) return;

    HiddenSkillSystem.getInstance().rollProc(
      hagglingDef,
      { inCombat: false },
      trader.progression,
      this.hagglingRng
    );
  }

  /**
   * Collects all sellable crafted items held by party members and in outpost storage.
   */
  public getSellableItems(trader?: Player): SellableItemEntry[] {
    const list: SellableItemEntry[] = [];
    const gs = GameState.getInstance();
    const dl = DataLoader.getInstance();
    const activeTrader = trader || (this.getOutpostScene()?.player as Player);

    const scene = this.getOutpostScene();
    const party: Player[] = scene?.party || (trader ? [trader] : []);

    const equippedIds = new Set<string>();
    for (const m of party) {
      if (m.equippedWeapon?.id) equippedIds.add(m.equippedWeapon.id);
      if (m.offhandWeapon?.id) equippedIds.add(m.offhandWeapon.id);
      if (m.equippedHelmet?.id) equippedIds.add(m.equippedHelmet.id);
      if (m.equippedBodyArmor?.id) equippedIds.add(m.equippedBodyArmor.id);
      if (m.equippedNecklace?.id) equippedIds.add(m.equippedNecklace.id);
      if (m.equippedRing?.id) equippedIds.add(m.equippedRing.id);
      if (m.equippedAccessory?.id) equippedIds.add(m.equippedAccessory.id);
    }

    // Party members
    for (const member of party) {
      if (member.inventory) {
        for (const [itemId, count] of member.inventory.entries()) {
          if (count <= 0 || equippedIds.has(itemId)) continue;
          const instance = gs.getGearInstance(itemId);
          const itemOrInstance = instance || itemId;
          if (MerchantSystem.isSellable(itemOrInstance)) {
            const def = dl.getItem(itemId) || dl.getWeapon(itemId) || dl.getArmor(itemId);
            const name = instance?.crafterName ? `${instance.baseItemId} (Crafted)` : (def?.name || itemId);
            const unitPrice = MerchantSystem.getSellPrice(itemOrInstance, activeTrader);
            list.push({
              key: `${member.id}_${itemId}`,
              id: itemId,
              name,
              itemOrInstance,
              count,
              unitPrice,
              locationName: member.entityName,
              sourceHolder: member
            });
          }
        }
      }
      if (typeof member.getFoodItems === 'function') {
        const foods = member.getFoodItems();
        const foodGroups = new Map<string, { food: FoodItemInstance; count: number }>();
        for (const f of foods) {
          const gKey = `${f.id}_${f.quality || 'common'}`;
          const existing = foodGroups.get(gKey);
          if (existing) {
            existing.count += (f.count || 1);
          } else {
            foodGroups.set(gKey, { food: f, count: f.count || 1 });
          }
        }
        for (const { food, count } of foodGroups.values()) {
          if (MerchantSystem.isSellable(food)) {
            const fDef = dl.getFood(food.id);
            const name = fDef?.name || food.id;
            const unitPrice = MerchantSystem.getSellPrice(food, activeTrader);
            list.push({
              key: `${member.id}_${food.id}_${food.quality || 'common'}`,
              id: food.id,
              name: `${name} (${food.quality || 'common'})`,
              itemOrInstance: food,
              count,
              unitPrice,
              locationName: member.entityName,
              sourceHolder: member
            });
          }
        }
      }
    }

    // Outpost storage
    const stockMap = gs.getInventoryMap();
    for (const [itemId, count] of stockMap.entries()) {
      if (count <= 0 || equippedIds.has(itemId)) continue;
      const instance = gs.getGearInstance(itemId);
      const itemOrInstance = instance || itemId;
      if (MerchantSystem.isSellable(itemOrInstance)) {
        const def = dl.getItem(itemId) || dl.getWeapon(itemId) || dl.getArmor(itemId);
        const name = instance?.crafterName ? `${instance.baseItemId} (Crafted)` : (def?.name || itemId);
        const unitPrice = MerchantSystem.getSellPrice(itemOrInstance, activeTrader);
        list.push({
          key: `stockpile_${itemId}`,
          id: itemId,
          name,
          itemOrInstance,
          count,
          unitPrice,
          locationName: 'Stockpile',
          sourceHolder: 'stockpile'
        });
      }
    }
    const stockFoods = gs.getFoodItems();
    const stockFoodGroups = new Map<string, { food: FoodItemInstance; count: number }>();
    for (const f of stockFoods) {
      const gKey = `${f.id}_${f.quality || 'common'}`;
      const existing = stockFoodGroups.get(gKey);
      if (existing) {
        existing.count += (f.count || 1);
      } else {
        stockFoodGroups.set(gKey, { food: f, count: f.count || 1 });
      }
    }
    for (const { food, count } of stockFoodGroups.values()) {
      if (MerchantSystem.isSellable(food)) {
        const fDef = dl.getFood(food.id);
        const name = fDef?.name || food.id;
        const unitPrice = MerchantSystem.getSellPrice(food, activeTrader);
        list.push({
          key: `stockpile_${food.id}_${food.quality || 'common'}`,
          id: food.id,
          name: `${name} (${food.quality || 'common'})`,
          itemOrInstance: food,
          count,
          unitPrice,
          locationName: 'Stockpile',
          sourceHolder: 'stockpile'
        });
      }
    }

    return list;
  }

  private getOutpostScene(): any | null {
    if (typeof (globalThis as any).window !== 'undefined' && (globalThis as any).window.game) {
      return (globalThis as any).window.game.scene?.getScene('OutpostScene') || null;
    }
    return null;
  }

  private getHUD(): any | null {
    const scene = this.getOutpostScene();
    if (scene && scene.hud) return scene.hud;
    return (globalThis as any).activeHUD || null;
  }
}
