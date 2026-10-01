import type { WeaponDef, ArmorDef, ItemDef, GearItemInstance, ClassDef } from '../types/game.ts';
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
