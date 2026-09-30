import type {
  BlacksmithRecipeDef,
  ArmorsmithRecipeDef,
  BowyerRecipeDef,
  AlchemyRecipeDef,
  CookingRecipeDef,
  GearItemInstance
} from '../types/game.ts';
import { Player } from '../entities/Player.ts';
import { GameState } from './GameState.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { getBaseItemId } from '../utils/gearResolver.ts';

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

  public static canAfford(recipe: AnyRecipeDef): boolean {
    const gameState = GameState.getInstance();
    for (const [item, qty] of Object.entries(recipe.ingredients)) {
      if (gameState.getItemCount(item) < qty) {
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
    if (!CraftingSystem.canAfford(recipe)) {
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

    // 2. Consume materials
    for (const [item, qty] of Object.entries(recipe.ingredients)) {
      gameState.consumeItem(item, qty);
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
}
