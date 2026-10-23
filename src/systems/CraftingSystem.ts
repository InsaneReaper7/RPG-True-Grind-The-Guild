import type {
  BlacksmithRecipeDef,
  ArmorsmithRecipeDef,
  BowyerRecipeDef,
  AlchemyRecipeDef,
  CookingRecipeDef,
  EnchantingRecipeDef,
  GearItemInstance
} from '../types/game.ts';
import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import { GameState } from './GameState.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { getBaseItemId } from '../utils/gearResolver.ts';
import { TutorialSystem } from './TutorialSystem.ts';
import { EventLog } from './EventLog.ts';

export type AnyRecipeDef =
  | BlacksmithRecipeDef
  | ArmorsmithRecipeDef
  | BowyerRecipeDef
  | AlchemyRecipeDef
  | CookingRecipeDef
  | EnchantingRecipeDef;

export interface CraftResult {
  success: boolean;
  recipeId: string;
  resultId: string;
  instanceId?: string;
  isGear: boolean;
  quantity: number;
  bonusProc: boolean;
  bonusPercent: number;
  isExceptional?: boolean;
  thriftyRefund?: { item: string; quantity: number };
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
  public static readonly PROFESSION_RANKS: Record<string, { apprentice: string; journeyman?: string; master?: string; grandmaster?: string }> = {
    blacksmithing: { apprentice: 'apprentice_smith', journeyman: 'journeyman_smith', master: 'master_smith', grandmaster: 'grandmaster_smith' },
    armorsmithing: { apprentice: 'apprentice_armorer', journeyman: 'journeyman_armorer', master: 'master_armorer', grandmaster: 'grandmaster_armorer' },
    bowyer: { apprentice: 'apprentice_bowyer', journeyman: 'journeyman_bowyer', master: 'master_bowyer', grandmaster: 'grandmaster_bowyer' },
    alchemy: { apprentice: 'apprentice_alchemist', journeyman: 'journeyman_alchemist', master: 'master_alchemist', grandmaster: 'archalchemist' },
    enchanting: { apprentice: 'apprentice_enchanter', journeyman: 'journeyman_enchanter', master: 'master_enchanter', grandmaster: 'runeweaver' }
  };
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
      case 'enchanting':
        return 'apprentice_enchanter';
      case 'digging':
        return 'excavator';
      case 'fishing':
        return 'angler';
      case 'lockpicking':
        return 'locksmith';
      case 'perception':
        return 'explorer';
      default:
        return null;
    }
  }

  public static getCrafterPerks(
    crafter: Player | ProgressionSystem | { progression: ProgressionSystem },
    professionId: string
  ): {
    classId: string | null;
    className: string;
    classLevel: number;
    perkPercent: number; // 0 to 15 (%)
    bonusYieldChance: number; // 0 to 15 (%)
    secondBonusYieldChance?: number;
    gearStatBonusPercent: number; // 0 to 30 (%)
    thriftyChance?: number;
    exceptionalChance?: number;
    savePickChance: number; // 0 to 15 (%)
    perkDescription?: string;
    detectionBonusChance?: number;
    detectionRadius?: number;
    cacheBonusRollChance?: number;
  } {
    const progression: ProgressionSystem | undefined =
      crafter instanceof ProgressionSystem
        ? crafter
        : (crafter && 'progression' in crafter && (crafter as any).progression instanceof ProgressionSystem)
        ? (crafter as any).progression
        : (crafter as any)?.progression;

    const ranks = DataLoader.getInstance().getCraftingRanks()?.professions?.[professionId] || CraftingSystem.PROFESSION_RANKS?.[professionId];
    if (ranks && progression) {
      const appUnlocked = !!(ranks.apprentice && progression.isClassUnlocked(ranks.apprentice));
      const jnyUnlocked = !!(ranks.journeyman && progression.isClassUnlocked(ranks.journeyman));
      const mtrUnlocked = !!(ranks.master && progression.isClassUnlocked(ranks.master));
      const gmrUnlocked = !!(ranks.grandmaster && progression.isClassUnlocked(ranks.grandmaster));

      const appLvl = (appUnlocked && ranks.apprentice) ? progression.getClassLevel(ranks.apprentice) : 0;
      const jnyLvl = (jnyUnlocked && ranks.journeyman) ? progression.getClassLevel(ranks.journeyman) : 0;
      const mtrLvl = (mtrUnlocked && ranks.master) ? progression.getClassLevel(ranks.master) : 0;
      const gmrLvl = (gmrUnlocked && ranks.grandmaster) ? progression.getClassLevel(ranks.grandmaster) : 0;

      const appBonus = Math.min(15, Math.max(0, appLvl));
      const jnyBonus = Math.min(15, Math.max(0, jnyLvl));
      const mtrBonus = Math.min(15, Math.max(0, mtrLvl));
      const gmrBonus = Math.min(15, Math.max(0, gmrLvl));

      const gearStatBonusPercent = appBonus + mtrBonus;
      const bonusYieldChance = appBonus;
      const secondBonusYieldChance = mtrBonus;
      const thriftyChance = jnyBonus;
      const exceptionalChance = gmrBonus;

      const hasAnyUnlocked = appUnlocked || jnyUnlocked || mtrUnlocked || gmrUnlocked;
      const activeClsId = (gmrUnlocked ? ranks.grandmaster : mtrUnlocked ? ranks.master : jnyUnlocked ? ranks.journeyman : ranks.apprentice) || ranks.apprentice;
      const activeLvl = gmrUnlocked ? gmrLvl : mtrUnlocked ? mtrLvl : jnyUnlocked ? jnyLvl : appUnlocked ? appLvl : 0;
      const clsDef = DataLoader.getInstance().getClass(activeClsId);

      const perkParts: string[] = [];
      if (appBonus > 0) perkParts.push(`Apprentice: +${appBonus}%`);
      if (jnyBonus > 0) perkParts.push(`Thrifty: ${jnyBonus}%`);
      if (mtrBonus > 0) perkParts.push(`Masterwork: +${mtrBonus}%`);
      if (gmrBonus > 0) perkParts.push(`Exceptional: ${gmrBonus}%`);
      const perkDescription = perkParts.length > 0 ? perkParts.join(' | ') : undefined;

      return {
        classId: hasAnyUnlocked ? activeClsId : ranks.apprentice,
        className: hasAnyUnlocked ? (clsDef?.name ?? activeClsId) : 'None',
        classLevel: hasAnyUnlocked ? activeLvl : 0,
        perkPercent: appBonus,
        bonusYieldChance,
        secondBonusYieldChance,
        gearStatBonusPercent,
        thriftyChance,
        exceptionalChance,
        savePickChance: 0,
        perkDescription,
        detectionBonusChance: 0,
        detectionRadius: 3,
        cacheBonusRollChance: 0
      };
    }

    const classId = CraftingSystem.getMatchingClassId(professionId) || (DataLoader.getInstance().getClass(professionId) ? professionId : null);

    if (!classId || !progression || !progression.isClassUnlocked(classId)) {
      return {
        classId,
        className: 'None',
        classLevel: 0,
        perkPercent: 0,
        bonusYieldChance: 0,
        secondBonusYieldChance: 0,
        gearStatBonusPercent: 0,
        thriftyChance: 0,
        exceptionalChance: 0,
        savePickChance: 0,
        detectionBonusChance: 0,
        detectionRadius: 3,
        cacheBonusRollChance: 0
      };
    }

    const classLevel = progression.getClassLevel(classId);
    const clsDef = DataLoader.getInstance().getClass(classId);
    const cappedBonus = Math.min(15, Math.max(0, classLevel));

    let perkType = 'gear stats';
    let perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: +${cappedBonus}% ${perkType}`;

    if (professionId === 'alchemy' || professionId === 'digging' || professionId === 'fishing' || classId === 'excavator' || classId === 'angler') {
      perkType = 'bonus yield';
      perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: +${cappedBonus}% ${perkType}`;
    } else if (professionId === 'enchanting') {
      perkType = 'bonus yield & gear stats';
      perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: +${cappedBonus}% ${perkType}`;
    } else if (professionId === 'lockpicking' || classId === 'locksmith') {
      perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: ${cappedBonus}% chance to save a lockpick on a failed roll`;
    } else if (professionId === 'perception' || classId === 'explorer') {
      const wideSearch = cappedBonus >= 10;
      perkDescription = `${clsDef?.name ?? classId} Lv ${classLevel}: +${cappedBonus}% detection chance${wideSearch ? ', 4-tile search radius' : ''}, +${cappedBonus}% cache loot roll`;
    }

    return {
      classId,
      className: clsDef?.name ?? classId,
      classLevel,
      perkPercent: cappedBonus,
      bonusYieldChance: cappedBonus,
      secondBonusYieldChance: 0,
      gearStatBonusPercent: cappedBonus,
      thriftyChance: 0,
      exceptionalChance: 0,
      savePickChance: cappedBonus,
      perkDescription,
      detectionBonusChance: cappedBonus / 100,
      detectionRadius: cappedBonus >= 10 ? 4 : 3,
      cacheBonusRollChance: cappedBonus
    };
  }

  public static getSurvivalistPerks(
    party: any[],
    inRadiusCheck?: (member: any) => boolean
  ): {
    highestSurvivalistLevel: number;
    highestTrailblazerLevel: number;
    highestWildernessWardenLevel: number;
    highestGrandSurvivalistLevel: number;
    quickCampDiscountPercent: number;
    wellRestedDurationBonusPercent: number;
    trailblazerSenseDetectionPp: number;
    trailblazerSenseRadiusBonus: number;
    emergencyShelterUnlocked: boolean;
  } {
    let sLv = 0;
    let tLv = 0;
    let wLv = 0;
    let gLv = 0;

    for (const member of party) {
      if (inRadiusCheck && !inRadiusCheck(member)) continue;
      const prog = member.progression || member;
      if (!prog || typeof prog.isClassUnlocked !== 'function') continue;

      if (prog.isClassUnlocked('survivalist')) {
        sLv = Math.max(sLv, prog.getClassLevel('survivalist'));
      }
      if (prog.isClassUnlocked('trailblazer')) {
        tLv = Math.max(tLv, prog.getClassLevel('trailblazer'));
      }
      if (prog.isClassUnlocked('wilderness_warden')) {
        wLv = Math.max(wLv, prog.getClassLevel('wilderness_warden'));
      }
      if (prog.isClassUnlocked('grand_survivalist')) {
        gLv = Math.max(gLv, prog.getClassLevel('grand_survivalist'));
      }
    }

    const campConfig = DataLoader.getInstance().getCampConfig();
    const maxEff = campConfig?.perks?.perkMaxEffectiveLevel ?? 15;
    const costRedRate = campConfig?.perks?.survivalistCostReductionPerLevel ?? 0.02;
    const durBonusRate = campConfig?.perks?.trailblazerDurationBonusPerLevel ?? 0.04;
    const detPpRate = campConfig?.perks?.wildernessWardenDetectionPpPerLevel ?? 1.0;
    const radBonus = campConfig?.perks?.wildernessWardenRadiusBonus ?? 1;

    return {
      highestSurvivalistLevel: sLv,
      highestTrailblazerLevel: tLv,
      highestWildernessWardenLevel: wLv,
      highestGrandSurvivalistLevel: gLv,
      quickCampDiscountPercent: Math.min(maxEff, sLv) * costRedRate,
      wellRestedDurationBonusPercent: Math.min(maxEff, tLv) * durBonusRate,
      trailblazerSenseDetectionPp: Math.min(maxEff, wLv) * detPpRate,
      trailblazerSenseRadiusBonus: wLv >= 1 ? radBonus : 0,
      emergencyShelterUnlocked: gLv >= 1
    };
  }

  public static getGatherPerks(
    member: Player | ProgressionSystem | { progression: ProgressionSystem },
    skillId: string
  ) {
    return CraftingSystem.getCrafterPerks(member, skillId);
  }

  public static canAfford(recipe: AnyRecipeDef, crafter?: Player): boolean {
    const gameState = GameState.getInstance();
    if (!recipe || !recipe.ingredients) return false;
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

    // 2. Consume materials: stockpile first, then crafter's own bag
    for (const [item, qty] of Object.entries(recipe.ingredients)) {
      let remaining = qty;

      // 2a. Stockpile first
      const stockpileCount = item === 'wood' ? gameState.getWood() : gameState.getItemCount(item);
      const fromStockpile = Math.min(stockpileCount, remaining);
      if (fromStockpile > 0) {
        if (item === 'wood') {
          gameState.addWood(-fromStockpile);
        } else {
          gameState.consumeItem(item, fromStockpile);
        }
        remaining -= fromStockpile;
      }

      // 2b. Crafter's own bag second (not other party members)
      if (remaining > 0 && crafter && typeof crafter.getItemCount === 'function' && typeof crafter.removeItem === 'function') {
        const carried = crafter.getItemCount(item);
        const fromCarried = Math.min(carried, remaining);
        if (fromCarried > 0) {
          crafter.removeItem(item, fromCarried);
          remaining -= fromCarried;
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
    const perks = CraftingSystem.getCrafterPerks(crafter, professionId) as any;
    let quantity = 1;
    let bonusProc = false;
    let isExceptional = false;
    let instanceId: string | undefined = undefined;

    // 4a. Thrifty perk (Journeyman): perk% chance to refund one random ingredient unit to stockpile
    let thriftyRefund: { item: string; quantity: number } | undefined = undefined;
    if (perks.thriftyChance > 0) {
      const roll = Math.random() * 100;
      if (roll < perks.thriftyChance) {
        const ingEntries = Object.entries(recipe.ingredients).filter(([_, qty]) => (qty as number) > 0);
        if (ingEntries.length > 0) {
          const [refundItem] = ingEntries[Math.floor(Math.random() * ingEntries.length)];
          if (refundItem === 'wood') {
            gameState.addWood(1);
          } else {
            gameState.addItem(refundItem, 1);
          }
          thriftyRefund = { item: refundItem, quantity: 1 };
        }
      }
    }

    if (isGear) {
      // Duplicate-gear rule: gear ALWAYS crafts exactly 1 copy (never gets bonus yield)
      quantity = 1;
      let totalBonusPercent = perks.gearStatBonusPercent || 0;

      // Grandmaster Exceptional roll for gear: +25% instance bonus
      if (perks.exceptionalChance > 0) {
        const roll = Math.random() * 100;
        if (roll < perks.exceptionalChance) {
          isExceptional = true;
          totalBonusPercent += 25;
        }
      }

      if (totalBonusPercent > 0) {
        instanceId = `gear_${baseResultId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const gearInst: GearItemInstance = {
          instanceId,
          baseItemId: baseResultId,
          crafterId: crafter.id,
          crafterName: crafter.entityName,
          bonusPercent: totalBonusPercent,
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

      // 1st bonus yield roll (Apprentice): +1 extra item on proc
      if (perks.bonusYieldChance > 0) {
        const roll = Math.random() * 100;
        if (roll < perks.bonusYieldChance) {
          bonusProc = true;
          totalYield += 1;
        }
      }

      // 2nd bonus yield roll (Master): +1 extra item on proc
      if (perks.secondBonusYieldChance > 0) {
        const roll = Math.random() * 100;
        if (roll < perks.secondBonusYieldChance) {
          bonusProc = true;
          totalYield += 1;
        }
      }

      // Grandmaster Exceptional roll for stackables: yield x 2
      if (perks.exceptionalChance > 0) {
        const roll = Math.random() * 100;
        if (roll < perks.exceptionalChance) {
          isExceptional = true;
          totalYield *= 2;
        }
      }

      quantity = totalYield;
      crafter.addItem(resultId, totalYield);
      TutorialSystem.getInstance().onItemCrafted(resultId, totalYield, crafter);
    }

    // 5. Award profession proficiency EXP
    const expGranted = recipe.expGranted;
    crafter.progression.addProficiencyExp(professionId, expGranted);

    // 6. Award class EXP (equal to profession EXP) to EVERY unlocked rank of that profession (Chef-line rule)
    let classExpGranted = 0;
    const profRanks = DataLoader.getInstance().getCraftingRanks()?.professions?.[professionId] || CraftingSystem.PROFESSION_RANKS?.[professionId];
    if (profRanks) {
      for (const rankClassId of Object.values(profRanks)) {
        if (crafter.progression.isClassUnlocked(rankClassId)) {
          crafter.progression.addClassExp(rankClassId, expGranted);
          classExpGranted = expGranted;
        }
      }
    } else if (perks.classId && crafter.progression.isClassUnlocked(perks.classId)) {
      crafter.progression.addClassExp(perks.classId, expGranted);
      classExpGranted = expGranted;
    }

    if (isExceptional) {
      const hud = (window as any).game?.scene?.getScene?.("MainScene")?.hud || (window as any).game?.scene?.getScene?.("OutpostScene")?.hud;
      if (hud && typeof hud.showToast === 'function') {
        hud.showToast('Exceptional craft!', 'success', 3000);
      }
    }

    EventLog.getInstance().add('craft', `${crafter?.entityName || 'Hero'}: Crafted ${quantity}x ${recipe.name}`, { recipeId: recipe.id, quantity, isGear });

    return {
      success: true,
      recipeId: recipe.id,
      resultId,
      instanceId,
      isGear,
      quantity,
      bonusProc,
      isExceptional,
      bonusPercent: isGear ? (instanceId ? GameState.getInstance().getGearInstance(instanceId)?.bonusPercent ?? 0 : 0) : 0,
      thriftyRefund,
      expGranted,
      classExpGranted,
      message: `Crafted ${quantity}x ${recipe.name}!${isExceptional ? ' (Exceptional!)' : ''}`
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

    // 4. Enchanting
    const encRecipes = dataLoader.getEnchantingRecipes?.() || [];
    for (const r of encRecipes) {
      const outputItemId = (r as any).resultWeaponId || (r as any).resultArmorId || (r as any).resultItemId;
      if (outputItemId === baseId) {
        return { recipe: r, station: 'enchanting' };
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
    if (options?.station) {
      const isStationMatch = options.station === recipeInfo.station ||
        (options.station === 'magical_weapon_station' && recipeInfo.station === 'enchanting') ||
        (options.station === 'enchanting' && recipeInfo.station === 'magical_weapon_station');
      if (!isStationMatch) {
        return { canSalvage: false, reason: `Must be salvaged at the ${recipeInfo.station} station.` };
      }
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
      : (station === 'armorsmithing' ? 'Armorsmithing' : (station === 'bowyer' ? 'Bowyer' : 'Enchanting'));

    const prefix = qtyToSalvage > 1 ? `${qtyToSalvage}x ` : '';
    const message = `Salvaged ${prefix}${displayName} → ${refundParts}, +${expGranted} ${stationLabel} EXP`;
    EventLog.getInstance().add('craft', `${member?.entityName || 'Hero'}: ${message}`, { itemIdOrInstanceId, baseItemId: baseId, quantity: qtyToSalvage, refunds });

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
