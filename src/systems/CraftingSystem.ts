import type {
  BlacksmithRecipeDef,
  ArmorsmithRecipeDef,
  BowyerRecipeDef,
  AlchemyRecipeDef,
  CookingRecipeDef,
  GearItemInstance
} from '../types/game.ts';
import type { Player } from '../entities/Player.ts';
import { GameState } from './GameState.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { getBaseItemId } from '../utils/gearResolver.ts';
import { TutorialSystem } from './TutorialSystem.ts';

export type AnyRecipeDef =
  | BlacksmithRecipeDef
  | ArmorsmithRecipeDef
  | BowyerRecipeDef
  | AlchemyRecipeDef
  | CookingRecipeDef;

export interface CraftResult {
  success: boolean;
  recipeId: string;
  resultId: string;
  instanceId?: string;
  isGear: boolean;
  quantity: number;
  bonusProc: boolean;
  bonusPercent: number;
  expGranted: number;
  classExpGranted: number;
  message: string;
}

export interface SalvageResult {
  success: boolean;
  itemIdOrInstanceId: string;
  baseItemId: string;
  recipeId?: string;
  recipeName?: string;
  station?: string;
  quantity: number;
  refunds: Record<string, number>;
  expGranted: number;
  classExpGranted: number;
  message: string;
}

export interface SalvageItemInfo {
  id: string;
  baseItemId: string;
  name: string;
  isBonusGear: boolean;
  bonusPercent: number;
  bonusText?: string;
  crafterName?: string;
  recipe?: AnyRecipeDef;
  station?: string;
  canSalvage: boolean;
  reason?: string;
  expectedRefund: Record<string, number>;
  expectedRefundFormatted: string;
  expGranted: number;
}

export class CraftingSystem {
  public static getMatchingClassId(professionId: string): string | null {
    switch (professionId) {
      case 'blacksmithing':
        return 'apprentice_smith';
      case 'armorsmithing':
        return 'apprentice_armorer';
      case 'bowyer':
        return 'apprentice_bowyer';
      case 'alchemy':
        return 'apprentice_alchemist';
      case 'cooking':
        return 'apprentice_cook';
      default:
        return null;
    }
  }

  public static getCrafterPerks(
    crafter: Player,
    professionId: string
  ): {
    classId: string | null;
    className: string;
    classLevel: number;
    bonusYieldChance: number; // 0 to 15 (%)
    gearStatBonusPercent: number; // 0 to 15 (%)
    perkDescription?: string;
  } {
    const classId = CraftingSystem.getMatchingClassId(professionId);
    if (!classId || !crafter.progression.isClassUnlocked(classId)) {
      return {
        classId,
        className: 'None',
        classLevel: 0,
        bonusYieldChance: 0,
        gearStatBonusPercent: 0
      };
    }

    const classLevel = crafter.progression.getClassLevel(classId);
    const clsDef = DataLoader.getInstance().getClass(classId);
    const cappedBonus = Math.min(15, Math.max(0, classLevel));
    const perkType = professionId === 'alchemy' ? 'bonus yield' : 'gear stats';
    const perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: +${cappedBonus}% ${perkType}`;

    return {
      classId,
      className: clsDef?.name ?? classId,
      classLevel,
      bonusYieldChance: cappedBonus,
      gearStatBonusPercent: cappedBonus,
      perkDescription
    };
  }

  public static canAfford(recipe: AnyRecipeDef, crafter?: Player): boolean {
    const gameState = GameState.getInstance();
    for (const [item, qty] of Object.entries(recipe.ingredients)) {
      const stockpileCount = item === 'wood' ? gameState.getWood() : gameState.getItemCount(item);
      const carriedCount = (crafter && typeof crafter.getItemCount === 'function') ? crafter.getItemCount(item) : 0;
      if (stockpileCount + carriedCount < qty) {
        return false;
      }
    }
    return true;
  }

  public static applyCraft(
    crafter: Player,
    recipe: AnyRecipeDef,
    professionId: string
  ): CraftResult {
    const gameState = GameState.getInstance();
    const dataLoader = DataLoader.getInstance();

    // 1. Validate materials
    if (!CraftingSystem.canAfford(recipe, crafter)) {
      return {
        success: false,
        recipeId: recipe.id,
        resultId: '',
        isGear: false,
        quantity: 0,
        bonusProc: false,
        bonusPercent: 0,
        expGranted: 0,
        classExpGranted: 0,
        message: 'Insufficient materials to craft!'
      };
    }

    // 2. Consume materials (carried first, then stockpile)
    for (const [item, qty] of Object.entries(recipe.ingredients)) {
      let remaining = qty;
      if (crafter && typeof crafter.getItemCount === 'function' && typeof crafter.removeItem === 'function') {
        const carried = crafter.getItemCount(item);
        if (carried > 0) {
          const fromCarried = Math.min(carried, remaining);
          crafter.removeItem(item, fromCarried);
          remaining -= fromCarried;
        }
      }
      if (remaining > 0) {
        if (item === 'wood') {
          gameState.addWood(-remaining);
        } else {
          gameState.consumeItem(item, remaining);
        }
      }
    }

    // 3. Determine result ID and whether it is gear
    const anyRec = recipe as any;
    const resultId =
      anyRec.resultItemId ||
      anyRec.resultWeaponId ||
      anyRec.resultArmorId ||
      anyRec.resultFoodId ||
      recipe.id;

    const baseResultId = getBaseItemId(resultId);
    const isGear = Boolean(
      dataLoader.getRawWeapon?.(baseResultId) ||
      dataLoader.getRawArmor?.(baseResultId) ||
      dataLoader.getWeapon(baseResultId) ||
      dataLoader.getArmor(baseResultId)
    );

    // 4. Crafter perks
    const perks = CraftingSystem.getCrafterPerks(crafter, professionId);
    let quantity = 1;
    let bonusProc = false;
    let instanceId: string | undefined = undefined;

    if (isGear) {
      // Duplicate-gear rule: gear ALWAYS crafts exactly 1 copy (never gets bonus yield)
      quantity = 1;
      if (perks.gearStatBonusPercent > 0) {
        instanceId = `gear_${baseResultId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const gearInst: GearItemInstance = {
          instanceId,
          baseItemId: baseResultId,
          crafterName: crafter.entityName,
          bonusPercent: perks.gearStatBonusPercent,
          craftedAt: Date.now()
        };
        gameState.registerGearInstance(gearInst);
        crafter.addItem(instanceId, 1);
      } else {
        crafter.addItem(baseResultId, 1);
      }
    } else {
      // Stackables (potions, bone meal, lockpicks, fishing rod, materials)
      const baseYield = anyRec.resultCount ?? 1;
      let moodMult = 1;
      if (professionId === 'alchemy') {
        const moodTier = dataLoader.getMoodTier(crafter.mood);
        moodMult = 1 + (moodTier?.alchemyYieldBonus || 0);
      }
      let totalYield = Math.max(1, Math.floor(baseYield * moodMult));

      // Bonus yield chance: +1% per level, capped at 15% -> +1 extra item on proc
      if (perks.bonusYieldChance > 0) {
        const roll = Math.random() * 100;
        if (roll < perks.bonusYieldChance) {
          bonusProc = true;
          totalYield += 1;
        }
      }
      quantity = totalYield;
      crafter.addItem(resultId, totalYield);
      TutorialSystem.getInstance().onItemCrafted(resultId, totalYield, crafter);
    }

    // 5. Award profession proficiency EXP
    const expGranted = recipe.expGranted;
    crafter.progression.addProficiencyExp(professionId, expGranted);

    // 6. Award class EXP (equal to profession EXP) if matching Apprentice class is unlocked
    let classExpGranted = 0;
    if (perks.classId && crafter.progression.isClassUnlocked(perks.classId)) {
      classExpGranted = expGranted;
      crafter.progression.addClassExp(perks.classId, classExpGranted);
    }

    return {
      success: true,
      recipeId: recipe.id,
      resultId,
      instanceId,
      isGear,
      quantity,
      bonusProc,
      bonusPercent: isGear ? perks.gearStatBonusPercent : 0,
      expGranted,
      classExpGranted,
      message: `Crafted ${quantity}x ${recipe.name}!`
    };
  }

  // --- Gear Salvage Methods (Milestone: Gear Salvage) ---

  public static getRecipeForGear(itemIdOrInstanceId: string): { recipe: AnyRecipeDef; station: string } | null {
    const baseId = getBaseItemId(itemIdOrInstanceId);
    const dataLoader = DataLoader.getInstance();

    // Must be weapon/shield or armor/accessory
    const rawWeapon = dataLoader.getRawWeapon?.(baseId) || dataLoader.getWeapon?.(baseId);
    const rawArmor = dataLoader.getRawArmor?.(baseId) || dataLoader.getArmor?.(baseId);
    if (!rawWeapon && !rawArmor) {
      return null;
    }

    // Exclude protected tools / non-gear
    const itemDef = dataLoader.getItem(baseId);
    if (itemDef?.keepOnReturn) {
      return null;
    }

    // 1. Blacksmithing
    const bsRecipes = dataLoader.getBlacksmithRecipes() || [];
    for (const r of bsRecipes) {
      const outputItemId = (r as any).resultWeaponId || (r as any).resultArmorId || (r as any).resultItemId;
      if (outputItemId === baseId) {
        if (outputItemId === 'lockpick' || outputItemId === 'fishing_rod' || outputItemId === 'steel_scrap') return null;
        return { recipe: r, station: 'blacksmithing' };
      }
    }

    // 2. Armorsmithing
    const asRecipes = dataLoader.getArmorsmithRecipes() || [];
    for (const r of asRecipes) {
      const outputItemId = (r as any).resultArmorId || (r as any).resultWeaponId || (r as any).resultItemId;
      if (outputItemId === baseId) {
        return { recipe: r, station: 'armorsmithing' };
      }
    }

    // 3. Bowyer
    const bwRecipes = dataLoader.getBowyerRecipes() || [];
    for (const r of bwRecipes) {
      const outputItemId = (r as any).resultWeaponId || (r as any).resultArmorId || (r as any).resultItemId;
      if (outputItemId === baseId) {
        return { recipe: r, station: 'bowyer' };
      }
    }

    return null;
  }

  public static isItemEquipped(
    itemIdOrInstanceId: string,
    party?: Player[]
  ): { isEquipped: boolean; memberName?: string } {
    let partyMembers = party;
    if (!partyMembers || partyMembers.length === 0) {
      const gs = GameState.getInstance();
      const snap = gs.getSnapshot();
      if (snap?.party && snap.party.length > 0) {
        for (const m of snap.party) {
          if (
            m.equippedWeaponId === itemIdOrInstanceId ||
            m.offhandWeaponId === itemIdOrInstanceId ||
            m.equippedHelmetId === itemIdOrInstanceId ||
            m.equippedBodyArmorId === itemIdOrInstanceId ||
            m.equippedNecklaceId === itemIdOrInstanceId ||
            m.equippedRingId === itemIdOrInstanceId ||
            m.equippedAccessoryId === itemIdOrInstanceId
          ) {
            return { isEquipped: true, memberName: m.name || m.id };
          }
        }
      }
    }
    if (partyMembers && partyMembers.length > 0) {
      for (const m of partyMembers) {
        if (
          (m.equippedWeapon && m.equippedWeapon.id === itemIdOrInstanceId && m.equippedWeapon.id !== 'fist') ||
          (m.offhandWeapon && m.offhandWeapon.id === itemIdOrInstanceId) ||
          (m.equippedHelmet && m.equippedHelmet.id === itemIdOrInstanceId) ||
          (m.equippedBodyArmor && m.equippedBodyArmor.id === itemIdOrInstanceId) ||
          (m.equippedNecklace && m.equippedNecklace.id === itemIdOrInstanceId) ||
          (m.equippedRing && m.equippedRing.id === itemIdOrInstanceId) ||
          (m.equippedAccessory && m.equippedAccessory.id === itemIdOrInstanceId)
        ) {
          return { isEquipped: true, memberName: m.entityName };
        }
      }
    }
    return { isEquipped: false };
  }

  public static canSalvage(
    itemIdOrInstanceId: string,
    options?: { station?: string; party?: Player[]; crafter?: Player }
  ): { canSalvage: boolean; reason?: string; recipe?: AnyRecipeDef; station?: string } {
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const baseId = getBaseItemId(itemIdOrInstanceId);

    // 1. Check if tool with keepOnReturn
    const itemDef = dataLoader.getItem(baseId);
    if (itemDef?.keepOnReturn) {
      if (baseId === 'lockpick') {
        return { canSalvage: false, reason: 'Lockpicks cannot be salvaged.' };
      }
      if (baseId === 'fishing_rod') {
        return { canSalvage: false, reason: 'The Fishing Rod cannot be salvaged.' };
      }
      return { canSalvage: false, reason: 'Tools cannot be salvaged.' };
    }

    // 2. Check if consumable, stackable, reagent (potions, bone meal, materials)
    const rawWeapon = dataLoader.getRawWeapon?.(baseId) || dataLoader.getWeapon?.(baseId);
    const rawArmor = dataLoader.getRawArmor?.(baseId) || dataLoader.getArmor?.(baseId);
    if (!rawWeapon && !rawArmor) {
      if (itemDef?.category === 'consumables') {
        return { canSalvage: false, reason: 'Consumables cannot be salvaged.' };
      }
      return { canSalvage: false, reason: 'Materials and stackables cannot be salvaged.' };
    }

    // 3. Check if crafting recipe exists
    const recipeInfo = CraftingSystem.getRecipeForGear(itemIdOrInstanceId);
    if (!recipeInfo) {
      return { canSalvage: false, reason: 'Gear has no crafting recipe and cannot be salvaged.' };
    }

    // 4. Check station match if station specified
    if (options?.station && options.station !== recipeInfo.station) {
      return { canSalvage: false, reason: `Must be salvaged at the ${recipeInfo.station} station.` };
    }

    // 5. Check if equipped
    const party = options?.party || (options?.crafter?.getPartyMembers ? options.crafter.getPartyMembers() : undefined);
    const eqCheck = CraftingSystem.isItemEquipped(itemIdOrInstanceId, party);
    if (eqCheck.isEquipped) {
      const isInstance = Boolean(gameState.getGearInstance(itemIdOrInstanceId));
      if (isInstance) {
        return { canSalvage: false, reason: 'Equipped gear cannot be salvaged; unequip first.' };
      }
      let availableUnequipped = gameState.getItemCount(baseId);
      if (party) {
        for (const p of party) {
          availableUnequipped += p.inventory.get(baseId) || 0;
        }
      }
      if (availableUnequipped <= 0) {
        return { canSalvage: false, reason: 'Equipped gear cannot be salvaged; unequip first.' };
      }
    }

    return {
      canSalvage: true,
      recipe: recipeInfo.recipe,
      station: recipeInfo.station
    };
  }

  public static getSalvageInfo(
    itemIdOrInstanceId: string,
    options?: { station?: string; party?: Player[]; crafter?: Player }
  ): SalvageItemInfo {
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const baseId = getBaseItemId(itemIdOrInstanceId);
    const instance = gameState.getGearInstance(itemIdOrInstanceId);

    const rawWeapon = dataLoader.getWeapon(baseId);
    const rawArmor = dataLoader.getArmor(baseId);
    const baseName = rawWeapon?.name || rawArmor?.name || dataLoader.getItem(baseId)?.name || baseId;

    let isBonusGear = false;
    let bonusPercent = 0;
    let bonusText: string | undefined = undefined;
    let crafterName: string | undefined = undefined;

    if (instance && instance.bonusPercent > 0) {
      isBonusGear = true;
      bonusPercent = instance.bonusPercent;
      crafterName = instance.crafterName;
      bonusText = `Crafted by ${instance.crafterName}, +${instance.bonusPercent}%`;
    }

    const check = CraftingSystem.canSalvage(itemIdOrInstanceId, options);
    const expectedRefund: Record<string, number> = {};
    let expectedRefundFormatted = 'No refund';
    let expGranted = 0;

    if (check.canSalvage && check.recipe) {
      const refundRate = dataLoader.getSalvageRefundRate();
      const expRate = dataLoader.getSalvageExpRate();
      const parts: string[] = [];

      for (const [ing, qty] of Object.entries(check.recipe.ingredients)) {
        const expQty = qty * refundRate;
        expectedRefund[ing] = expQty;
        const ingName = dataLoader.getItem(ing)?.name || ing.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        parts.push(`${expQty} ${ingName}`);
      }
      expectedRefundFormatted = `≈ ${parts.join(', ')}`;
      expGranted = Math.ceil(check.recipe.expGranted * expRate);
    }

    return {
      id: itemIdOrInstanceId,
      baseItemId: baseId,
      name: isBonusGear ? `${baseName} (+${bonusPercent}%)` : baseName,
      isBonusGear,
      bonusPercent,
      bonusText,
      crafterName,
      recipe: check.recipe,
      station: check.station,
      canSalvage: check.canSalvage,
      reason: check.reason,
      expectedRefund,
      expectedRefundFormatted,
      expGranted
    };
  }

  public static applySalvage(
    member: Player,
    itemIdOrInstanceId: string,
    options?: {
      count?: number;
      source?: Player | 'stockpile';
      rng?: () => number;
      station?: string;
      party?: Player[];
      isOutpost?: boolean;
    }
  ): SalvageResult {
    const dataLoader = DataLoader.getInstance();
    const gameState = GameState.getInstance();
    const baseId = getBaseItemId(itemIdOrInstanceId);
    const rng = options?.rng || Math.random;

    if (options?.isOutpost !== undefined && !options.isOutpost) {
      return {
        success: false,
        itemIdOrInstanceId,
        baseItemId: baseId,
        quantity: 0,
        refunds: {},
        expGranted: 0,
        classExpGranted: 0,
        message: 'Salvaging can only be performed at the Outpost!'
      };
    }

    // Validate canSalvage
    const check = CraftingSystem.canSalvage(itemIdOrInstanceId, {
      station: options?.station,
      party: options?.party || (member.getPartyMembers ? member.getPartyMembers() : [member]),
      crafter: member
    });

    if (!check.canSalvage || !check.recipe || !check.station) {
      return {
        success: false,
        itemIdOrInstanceId,
        baseItemId: baseId,
        quantity: 0,
        refunds: {},
        expGranted: 0,
        classExpGranted: 0,
        message: check.reason || 'Item cannot be salvaged.'
      };
    }

    const recipe = check.recipe;
    const station = check.station;
    const instance = gameState.getGearInstance(itemIdOrInstanceId);
    const qtyToSalvage = instance ? 1 : Math.max(1, options?.count ?? 1);

    // Locate source
    let actualSource: Player | 'stockpile' | null = null;
    if (options?.source === 'stockpile') {
      const inStock = gameState.getItemCount(itemIdOrInstanceId);
      if (inStock >= qtyToSalvage) {
        actualSource = 'stockpile';
      }
    } else if (options?.source && typeof options.source !== 'string') {
      const inBag = options.source.inventory.get(itemIdOrInstanceId) || 0;
      if (inBag >= qtyToSalvage) {
        actualSource = options.source;
      }
    } else {
      // Auto-detect source: member bag -> other party bags -> stockpile
      if ((member.inventory.get(itemIdOrInstanceId) || 0) >= qtyToSalvage) {
        actualSource = member;
      } else {
        const party = options?.party || (member.getPartyMembers ? member.getPartyMembers() : [member]);
        for (const p of party) {
          if ((p.inventory.get(itemIdOrInstanceId) || 0) >= qtyToSalvage) {
            actualSource = p;
            break;
          }
        }
        if (!actualSource && gameState.getItemCount(itemIdOrInstanceId) >= qtyToSalvage) {
          actualSource = 'stockpile';
        }
      }
    }

    if (!actualSource) {
      return {
        success: false,
        itemIdOrInstanceId,
        baseItemId: baseId,
        quantity: 0,
        refunds: {},
        expGranted: 0,
        classExpGranted: 0,
        message: 'Item not found in bags or stockpile!'
      };
    }

    // Remove item from source
    if (actualSource === 'stockpile') {
      gameState.consumeItem(itemIdOrInstanceId, qtyToSalvage);
    } else {
      actualSource.removeItem(itemIdOrInstanceId, qtyToSalvage);
    }

    // If it was a registered gear instance, remove from registry
    if (instance) {
      gameState.unregisterGearInstance(itemIdOrInstanceId);
    }

    // Calculate probabilistic refunds: 50% of each recipe ingredient
    const refundRate = dataLoader.getSalvageRefundRate(); // 0.5
    const refunds: Record<string, number> = {};

    for (const [ing, ingQty] of Object.entries(recipe.ingredients)) {
      const exactPerUnit = ingQty * refundRate;
      const floorPerUnit = Math.floor(exactPerUnit);
      const fraction = exactPerUnit - floorPerUnit;
      let totalIngRefund = 0;

      for (let i = 0; i < qtyToSalvage; i++) {
        let unitRefund = floorPerUnit;
        if (fraction > 0 && rng() < fraction) {
          unitRefund += 1;
        }
        totalIngRefund += unitRefund;
      }
      refunds[ing] = totalIngRefund;
      if (totalIngRefund > 0) {
        gameState.addItem(ing, totalIngRefund);
      }
    }

    // Calculate EXP: half of recipe's profession EXP rounded up
    const expRate = dataLoader.getSalvageExpRate(); // 0.5
    const expPerUnit = Math.ceil(recipe.expGranted * expRate);
    const expGranted = expPerUnit * qtyToSalvage;

    member.progression.addProficiencyExp(station, expGranted);

    // Apprentice class EXP
    let classExpGranted = 0;
    const classId = CraftingSystem.getMatchingClassId(station);
    if (classId && member.progression.isClassUnlocked(classId)) {
      classExpGranted = expGranted;
      member.progression.addClassExp(classId, classExpGranted);
    }

    // Construct toast message
    const weaponDef = dataLoader.getWeapon(baseId);
    const armorDef = dataLoader.getArmor(baseId);
    const displayName = weaponDef?.name || armorDef?.name || recipe.name;

    const refundParts = Object.entries(refunds)
      .map(([ing, q]) => {
        const itemObj = dataLoader.getItem(ing);
        const name = itemObj?.name || ing.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `+${q} ${name}`;
      })
      .join(', ');

    const stationLabel = station === 'blacksmithing'
      ? 'Blacksmithing'
      : (station === 'armorsmithing' ? 'Armorsmithing' : 'Bowyer');

    const prefix = qtyToSalvage > 1 ? `${qtyToSalvage}x ` : '';
    const message = `Salvaged ${prefix}${displayName} → ${refundParts}, +${expGranted} ${stationLabel} EXP`;

    return {
      success: true,
      itemIdOrInstanceId,
      baseItemId: baseId,
      recipeId: recipe.id,
      recipeName: recipe.name,
      station,
      quantity: qtyToSalvage,
      refunds,
      expGranted,
      classExpGranted,
      message
    };
  }
}
