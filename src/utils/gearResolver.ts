import type { WeaponDef, ArmorDef, ItemDef, GearItemInstance, ClassDef, ArmorSlot } from '../types/game.ts';
import type { Player } from '../entities/Player.ts';
import { DataLoader } from './DataLoader.ts';
import { GameState } from '../systems/GameState.ts';

export function isCraftingClass(classDefOrId: string | ClassDef | null | undefined): boolean {
  if (!classDefOrId) return false;
  if (typeof classDefOrId === 'string') {
    const id = classDefOrId;
    if (id.startsWith('apprentice_') || id.startsWith('journeyman_') || id.startsWith('master_') || id.startsWith('grandmaster_')) {
      return true;
    }
    const def = DataLoader.getInstance().getClass(id);
    return def?.category === 'crafting';
  }
  return classDefOrId.category === 'crafting' ||
    classDefOrId.id.startsWith('apprentice_') ||
    classDefOrId.id.startsWith('journeyman_') ||
    classDefOrId.id.startsWith('master_') ||
    classDefOrId.id.startsWith('grandmaster_');
}

export function getBaseItemId(idOrInstanceId: string): string {
  if (!idOrInstanceId) return idOrInstanceId;
  const instance = GameState.getInstance().getGearInstance(idOrInstanceId);
  if (instance) return instance.baseItemId;
  return idOrInstanceId;
}

export function resolveGearStats(idOrInstanceId: string): {
  weapon?: WeaponDef;
  armor?: ArmorDef;
  item?: ItemDef;
  instance?: GearItemInstance;
  baseItemId: string;
} {
  const dataLoader = DataLoader.getInstance();
  const gameState = GameState.getInstance();
  const instance = gameState.getGearInstance(idOrInstanceId);
  const baseId = instance ? instance.baseItemId : idOrInstanceId;

  const rawWeapon = dataLoader.getRawWeapon(baseId);
  if (rawWeapon) {
    if (!instance || instance.bonusPercent <= 0) {
      return { weapon: rawWeapon, instance, baseItemId: baseId };
    }
    const bonusMult = 1 + (instance.bonusPercent / 100);
    const scaledWeapon: WeaponDef = {
      ...rawWeapon,
      id: instance.instanceId,
      baseItemId: baseId,
      instanceId: instance.instanceId,
      crafterName: instance.crafterName,
      bonusPercent: instance.bonusPercent,
      baseDamage: rawWeapon.baseDamage ? (rawWeapon.baseDamage * bonusMult) : 0,
      baseBlock: rawWeapon.baseBlock !== undefined ? Math.min(1.0, rawWeapon.baseBlock * bonusMult) : undefined
    };
    return { weapon: scaledWeapon, instance, baseItemId: baseId };
  }

  const rawArmor = dataLoader.getRawArmor(baseId);
  if (rawArmor) {
    if (!instance || instance.bonusPercent <= 0) {
      return { armor: rawArmor, instance, baseItemId: baseId };
    }
    const bonusMult = 1 + (instance.bonusPercent / 100);
    const scaledArmor: ArmorDef = {
      ...rawArmor,
      id: instance.instanceId,
      baseItemId: baseId,
      instanceId: instance.instanceId,
      crafterName: instance.crafterName,
      bonusPercent: instance.bonusPercent,
      hpBonus: rawArmor.hpBonus ? Math.round(rawArmor.hpBonus * bonusMult) : 0
    };
    return { armor: scaledArmor, instance, baseItemId: baseId };
  }

  const rawItem = dataLoader.getItem(baseId);
  return { item: rawItem, instance, baseItemId: baseId };
}

export function canEquipBowDaggerSidearm(
  character: { activeClass?: string | null; equippedWeapon?: WeaponDef | null },
  offhandWeapon?: WeaponDef | null
): boolean {
  if (character.activeClass !== 'scout') return false;
  const isBow = character.equippedWeapon?.category === 'ranged' || character.equippedWeapon?.proficiencyId === 'bows' || (character.equippedWeapon && getBaseItemId(character.equippedWeapon.id) === 'bows');
  if (!isBow) return false;
  if (!offhandWeapon) return true;
  const isDagger = getBaseItemId(offhandWeapon.id) === 'daggers' || offhandWeapon.proficiencyId === 'daggers';
  return isDagger;
}

export interface GearSourceLocation {
  type: 'personal_bag' | 'party_bag' | 'stockpile' | 'equipped';
  member?: Player;
  slot?: 'main' | 'offhand' | ArmorSlot;
  exactItemId: string;
  isInstance: boolean;
  bonusPercent?: number;
}

export interface PartyGearOwnership {
  totalOwned: number;
  availableCount: number;
  wornCount: number;
  wornDetails: { memberName: string; count: number }[];
}

/**
 * Searches an inventory map for the best item matching baseId.
 * Prioritizes instances with highest bonusPercent, then instances with 0%, then plain base item.
 */
function findBestMatchingItem(inventory: Map<string, number>, baseId: string): string | null {
  let bestKey: string | null = null;
  let bestScore = -1;
  const gameState = GameState.getInstance();
  for (const [key, qty] of inventory.entries()) {
    if (qty > 0 && (key === baseId || getBaseItemId(key) === baseId)) {
      let score = 0;
      const inst = gameState.getGearInstance(key);
      if (inst) {
        score = (inst.bonusPercent ?? 0) > 0 ? inst.bonusPercent : 0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

/**
 * Resolves the location of a gear item to equip.
 * Priority:
 * - If payloadItemId is an exact instance ID: take EXACTLY that instance from wherever it is.
 * - If payloadItemId is a base ID:
 *   1. Target member's bag (highest bonus first)
 *   2. Another party member's bag (highest bonus first)
 *   3. The stockpile (Outpost only)
 *   4. Equipped on another party member (highest bonus first)
 */
export function resolvePartyGearSource(
  payloadItemId: string,
  targetMember: Player,
  party: Player[] = [],
  gameState: GameState = GameState.getInstance(),
  isOutpost: boolean = true
): GearSourceLocation | null {
  const baseId = getBaseItemId(payloadItemId);
  const isExactInstance = Boolean(gameState.getGearInstance(payloadItemId)) || payloadItemId.startsWith('gear_');

  if (isExactInstance) {
    // 1. Target's bag
    if ((targetMember.inventory?.get(payloadItemId) || 0) > 0) {
      const inst = gameState.getGearInstance(payloadItemId);
      return { type: 'personal_bag', member: targetMember, exactItemId: payloadItemId, isInstance: true, bonusPercent: inst?.bonusPercent };
    }
    // 2. Another party member's bag
    for (const other of party) {
      if (other !== targetMember && (other.inventory?.get(payloadItemId) || 0) > 0) {
        const inst = gameState.getGearInstance(payloadItemId);
        return { type: 'party_bag', member: other, exactItemId: payloadItemId, isInstance: true, bonusPercent: inst?.bonusPercent };
      }
    }
    // 3. Stockpile (Outpost only)
    if (isOutpost && (gameState.getInventoryMap().get(payloadItemId) || 0) > 0) {
      const inst = gameState.getGearInstance(payloadItemId);
      return { type: 'stockpile', exactItemId: payloadItemId, isInstance: true, bonusPercent: inst?.bonusPercent };
    }
    // 4. Equipped on another party member
    for (const other of party) {
      if (other === targetMember) continue;
      const slots: { slot: 'main' | 'offhand' | ArmorSlot; id?: string | null }[] = [
        { slot: 'main', id: other.equippedWeapon?.id },
        { slot: 'offhand', id: other.offhandWeapon?.id },
        { slot: 'helmet', id: other.equippedHelmet?.id },
        { slot: 'body', id: other.equippedBodyArmor?.id },
        { slot: 'necklace', id: other.equippedNecklace?.id },
        { slot: 'ring', id: other.equippedRing?.id },
        { slot: 'accessory', id: other.equippedAccessory?.id }
      ];
      for (const s of slots) {
        if (s.id === payloadItemId) {
          const inst = gameState.getGearInstance(payloadItemId);
          return { type: 'equipped', member: other, slot: s.slot, exactItemId: payloadItemId, isInstance: true, bonusPercent: inst?.bonusPercent };
        }
      }
    }
    return null;
  }

  // Payload is a base ID (e.g. 'katana')
  // 1. Target's bag
  const targetKey = findBestMatchingItem(targetMember.inventory, baseId);
  if (targetKey) {
    const inst = gameState.getGearInstance(targetKey);
    return { type: 'personal_bag', member: targetMember, exactItemId: targetKey, isInstance: targetKey !== baseId, bonusPercent: inst?.bonusPercent };
  }

  // 2. Another member's bag (prefer highest bonus across members)
  let bestOtherMember: Player | null = null;
  let bestOtherKey: string | null = null;
  let bestOtherScore = -1;
  for (const other of party) {
    if (other === targetMember) continue;
    const key = findBestMatchingItem(other.inventory, baseId);
    if (key) {
      const inst = gameState.getGearInstance(key);
      const score = inst ? ((inst.bonusPercent ?? 0) > 0 ? inst.bonusPercent : 0.5) : 0;
      if (score > bestOtherScore) {
        bestOtherScore = score;
        bestOtherKey = key;
        bestOtherMember = other;
      }
    }
  }
  if (bestOtherMember && bestOtherKey) {
    const inst = gameState.getGearInstance(bestOtherKey);
    return { type: 'party_bag', member: bestOtherMember, exactItemId: bestOtherKey, isInstance: bestOtherKey !== baseId, bonusPercent: inst?.bonusPercent };
  }

  // 3. Stockpile (Outpost only)
  if (isOutpost) {
    const stockKey = findBestMatchingItem(gameState.getInventoryMap(), baseId);
    if (stockKey) {
      const inst = gameState.getGearInstance(stockKey);
      return { type: 'stockpile', exactItemId: stockKey, isInstance: stockKey !== baseId, bonusPercent: inst?.bonusPercent };
    }
  }

  // 4. Equipped on another member (only if no free copy exists anywhere)
  let bestEquippedMember: Player | null = null;
  let bestEquippedSlot: 'main' | 'offhand' | ArmorSlot | null = null;
  let bestEquippedKey: string | null = null;
  let bestEquippedScore = -1;

  for (const other of party) {
    if (other === targetMember) continue;
    const slots: { slot: 'main' | 'offhand' | ArmorSlot; id?: string | null }[] = [
      { slot: 'main', id: other.equippedWeapon?.id !== 'fist' ? other.equippedWeapon?.id : null },
      { slot: 'offhand', id: other.offhandWeapon?.id },
      { slot: 'helmet', id: other.equippedHelmet?.id },
      { slot: 'body', id: other.equippedBodyArmor?.id },
      { slot: 'necklace', id: other.equippedNecklace?.id },
      { slot: 'ring', id: other.equippedRing?.id },
      { slot: 'accessory', id: other.equippedAccessory?.id }
    ];
    for (const s of slots) {
      if (s.id && (s.id === baseId || getBaseItemId(s.id) === baseId)) {
        const inst = gameState.getGearInstance(s.id);
        const score = inst ? ((inst.bonusPercent ?? 0) > 0 ? inst.bonusPercent : 0.5) : 0;
        if (score > bestEquippedScore) {
          bestEquippedScore = score;
          bestEquippedKey = s.id;
          bestEquippedMember = other;
          bestEquippedSlot = s.slot;
        }
      }
    }
  }

  if (bestEquippedMember && bestEquippedSlot && bestEquippedKey) {
    const inst = gameState.getGearInstance(bestEquippedKey);
    return { type: 'equipped', member: bestEquippedMember, slot: bestEquippedSlot, exactItemId: bestEquippedKey, isInstance: bestEquippedKey !== baseId, bonusPercent: inst?.bonusPercent };
  }

  return null;
}

/**
 * Computes party-wide gear ownership for Stash display and filter.
 * Includes party members' bags, shared stockpile, and items currently equipped on party members.
 */
export function getPartyGearOwnership(
  baseOrInstanceId: string,
  party: Player[] = [],
  gameState: GameState = GameState.getInstance(),
  isOutpost: boolean = true,
  excludeMember?: Player | null
): PartyGearOwnership {
  const baseId = getBaseItemId(baseOrInstanceId);
  const isExactInstance = Boolean(gameState.getGearInstance(baseOrInstanceId)) || baseOrInstanceId.startsWith('gear_');

  let bagCount = 0;
  for (const member of party) {
    if (isExactInstance) {
      bagCount += member.inventory?.get(baseOrInstanceId) || 0;
    } else {
      bagCount += member.getItemCount(baseId);
    }
  }

  let stockpileCount = 0;
  if (isOutpost) {
    if (isExactInstance) {
      stockpileCount += gameState.getInventoryMap().get(baseOrInstanceId) || 0;
    } else {
      stockpileCount += gameState.getItemCount(baseId);
    }
  }

  let wornCount = 0;
  const wornMap = new Map<string, number>();

  for (const member of party) {
    if (excludeMember && member === excludeMember) continue;

    const checkEquipped = (id?: string | null) => {
      if (!id || id === 'fist') return false;
      if (isExactInstance) return id === baseOrInstanceId;
      return id === baseId || getBaseItemId(id) === baseId;
    };

    let memberWorn = 0;
    if (checkEquipped(member.equippedWeapon?.id)) memberWorn++;
    if (checkEquipped(member.offhandWeapon?.id)) memberWorn++;
    if (checkEquipped(member.equippedHelmet?.id)) memberWorn++;
    if (checkEquipped(member.equippedBodyArmor?.id)) memberWorn++;
    if (checkEquipped(member.equippedNecklace?.id)) memberWorn++;
    if (checkEquipped(member.equippedRing?.id)) memberWorn++;
    if (checkEquipped(member.equippedAccessory?.id)) memberWorn++;

    if (memberWorn > 0) {
      wornCount += memberWorn;
      const name = member.entityName || (member as any).name || 'Party Member';
      wornMap.set(name, (wornMap.get(name) || 0) + memberWorn);
    }
  }

  const wornDetails: { memberName: string; count: number }[] = [];
  for (const [memberName, count] of wornMap.entries()) {
    wornDetails.push({ memberName, count });
  }

  const availableCount = bagCount + stockpileCount;
  const totalOwned = availableCount + wornCount;

  return {
    totalOwned,
    availableCount,
    wornCount,
    wornDetails
  };
}
