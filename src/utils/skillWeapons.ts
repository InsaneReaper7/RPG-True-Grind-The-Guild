/**
 * Checklist 10: which weapons can use a skill. Kept free of Phaser/entity imports so UI code (HUD) and tests
 * can use it without loading the game engine. SkillSystem delegates to these functions.
 */
import { DataLoader } from './DataLoader.ts';
import type { SkillDef, WeaponDef } from '../types/game.ts';

/** The parts of a character the weapon rule reads. Player satisfies this. */
export interface SkillWeaponHolder {
  equippedWeapon: WeaponDef | null;
  offhandWeapon?: WeaponDef | null;
}

const skillWeaponSets: Map<string, Set<string>> = new Map();
const skillWeaponNames: Map<string, { short: string; full: string }> = new Map();

/** Test helper: drop cached sets (e.g. after data changes). */
export function clearSkillWeaponCaches(): void {
  skillWeaponSets.clear();
  skillWeaponNames.clear();
}

/**
 * Resolves the set of weapon proficiency IDs that can use the skill.
 * Walks the skill's class requirement and prerequisite classes recursively,
 * including anyOf/oneOf requirement groups.
 */
export function getSkillWeaponSet(skillId: string): Set<string> {
  if (skillWeaponSets.has(skillId)) {
    return skillWeaponSets.get(skillId)!;
  }

  const dataLoader = DataLoader.getInstance();
  const skillDef = dataLoader.getSkill(skillId);
  const result = new Set<string>();

  if (!skillDef || !skillDef.requirements) {
    skillWeaponSets.set(skillId, result);
    return result;
  }

  const weapons = dataLoader.getWeaponsData()?.weapons ?? [];
  const validWeaponIds = new Set<string>();
  for (const w of weapons) {
    validWeaponIds.add(w.id);
    if (w.proficiencyId) validWeaponIds.add(w.proficiencyId);
  }

  const visitedClasses = new Set<string>();
  let ownClassId: string | undefined;

  const walkRequirements = (reqList: any[]) => {
    if (!reqList) return;
    for (const r of reqList) {
      if (r.type === 'proficiency') {
        if (validWeaponIds.has(r.target)) {
          result.add(r.target);
        }
      } else if (r.type === 'classLevel' || r.type === 'class') {
        if (r.target) walkClass(r.target);
      } else if ((r.type === 'anyOf' || r.type === 'oneOf') && Array.isArray(r.of)) {
        walkRequirements(r.of);
      }
    }
  };

  const walkClass = (classId: string) => {
    if (visitedClasses.has(classId)) return;
    visitedClasses.add(classId);
    const cls = dataLoader.getClass(classId);
    if (!cls) return;
    // Classes whose weapon isn't in their requirements (e.g. Runeblade: arcane magic carved into a blade)
    // declare it explicitly. Only the skill's own class contributes these, not prerequisite classes.
    if (classId === ownClassId && Array.isArray((cls as any).extraSkillWeapons)) {
      for (const w of (cls as any).extraSkillWeapons) {
        if (validWeaponIds.has(w)) result.add(w);
      }
    }
    if (!cls.requirements) return;
    walkRequirements(cls.requirements);
  };

  const classReq = skillDef.requirements.find(
    (r: any) => (r.type === 'classLevel' || r.type === 'class') && r.target && dataLoader.getClass(r.target)
  );
  ownClassId = classReq?.target;
  if (classReq?.target && dataLoader.getClass(classReq.target)) {
    walkClass(classReq.target);
  }

  skillWeaponSets.set(skillId, result);
  return result;
}

/**
 * Returns human-readable short and full weapon requirement labels for tooltips and warnings.
 * For long sets (>3 weapons), short format returns first 3 weapons + "+N more".
 */
export function getSkillWeaponNames(skillId: string): { short: string; full: string } {
  if (skillWeaponNames.has(skillId)) {
    return skillWeaponNames.get(skillId)!;
  }
  const weaponSet = getSkillWeaponSet(skillId);
  if (weaponSet.size === 0) {
    const res = { short: 'Any Weapon', full: 'Any Weapon' };
    skillWeaponNames.set(skillId, res);
    return res;
  }
  const dataLoader = DataLoader.getInstance();
  const names: string[] = [];
  for (const id of weaponSet) {
    const w = dataLoader.getWeapon(id);
    let name = w?.name;
    if (!name) {
      name = id.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    }
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  const full = names.join(', ');
  let short = full;
  if (names.length > 3) {
    const first3 = names.slice(0, 3).join(', ');
    const remaining = names.length - 3;
    short = `${first3} +${remaining} more`;
  }
  const res = { short, full };
  skillWeaponNames.set(skillId, res);
  return res;
}

/**
 * Checks whether the caster can use the skill given currently equipped weapons.
 * 1. Empty set = usable with any weapon.
 * 2. Main hand (or fist if empty) or off hand matches skill's weapon set.
 * 3. Magic exception: Set contains >=1 category: "magic" weapon AND caster has any category: "magic" weapon equipped.
 */
export function canUseSkillWithCurrentWeapons(caster: SkillWeaponHolder, skillDef: SkillDef): boolean {
  const weaponSet = getSkillWeaponSet(skillDef.id);
  if (weaponSet.size === 0) {
    return true;
  }

  const dataLoader = DataLoader.getInstance();
  const mainWeapon = caster.equippedWeapon ?? dataLoader.getWeapon('fist');
  const offWeapon = caster.offhandWeapon;
  const equippedWeapons = [mainWeapon, offWeapon].filter(Boolean) as WeaponDef[];

  // Elemental staves (fire_staff, ice_staff, healing_staff, ...) are spell CONDUITS: the game casts their
  // school's spell through them (DataLoader.getSpellForConduit, CombatSystem.getEffectiveWeaponForAttack).
  // The *_magic spell weapons themselves cannot be crafted, so a conduit staff is how players cast.
  const conduitSpellOf = (w: WeaponDef): WeaponDef | null =>
    w.category === 'magic' ? null : dataLoader.getSpellForConduit(w);

  // Rule 2: direct match on proficiencyId ?? id or id (a conduit also matches its spell's school)
  for (const w of equippedWeapons) {
    const profId = w.proficiencyId ?? w.id;
    if (weaponSet.has(profId) || weaponSet.has(w.id)) {
      return true;
    }
    const spell = conduitSpellOf(w);
    if (spell && (weaponSet.has(spell.proficiencyId ?? spell.id) || weaponSet.has(spell.id))) {
      return true;
    }
  }

  // Rule 3: Magic exception (owner): any magic weapon OR spell-conduit staff casts any unlocked school
  const setHasMagicWeapon = Array.from(weaponSet).some((id) => {
    const w = dataLoader.getWeapon(id);
    return w?.category === 'magic';
  });

  if (setHasMagicWeapon) {
    const casterHasMagicWeapon = equippedWeapons.some((w) => w.category === 'magic' || !!conduitSpellOf(w));
    if (casterHasMagicWeapon) {
      return true;
    }
  }

  return false;
}

