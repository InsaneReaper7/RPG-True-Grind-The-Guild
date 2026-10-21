import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
export const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
export const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));

export const classMap = new Map<string, any>(classesData.classes.map((c: any) => [c.id, c]));
export const combatClasses = classesData.classes.filter(
  (c: any) => c.category !== 'crafting' && c.tier !== 'crafting' && !c.isCrafting
);

export const weaponProfList = [
  'short_swords', 'longswords', 'greatswords', 'daggers', 'katana',
  'spears', 'mace', 'bows', 'crossbows', 'throwing_weapons', 'fist',
  'staff', 'druid_staff'
];

export const magicProfList = [
  'arcane_magic', 'fire_magic', 'water_magic', 'ice_magic', 'earth_magic',
  'nature_magic', 'lightning_magic', 'wind_magic', 'healing_magic',
  'holy_magic', 'dark_magic'
];

export const profToWeapon: Record<string, string> = {
  short_swords: 'short_swords',
  longswords: 'longsword_1h',
  greatswords: 'greatswords',
  daggers: 'daggers',
  katana: 'katana',
  spears: 'spears',
  mace: 'mace',
  bows: 'bows',
  crossbows: 'crossbows',
  throwing_weapons: 'throwing_weapons',
  fist: 'fist',
  staff: 'staff',
  druid_staff: 'druid_staff'
};

export const magicToStaff: Record<string, string> = {
  arcane_magic: 'arcane_staff',
  fire_magic: 'fire_staff',
  water_magic: 'water_staff',
  ice_magic: 'ice_staff',
  earth_magic: 'earth_staff',
  nature_magic: 'nature_staff',
  lightning_magic: 'lightning_staff',
  wind_magic: 'wind_staff',
  healing_magic: 'healing_staff',
  holy_magic: 'holy_staff',
  dark_magic: 'dark_staff'
};

export const weaponToProf: Record<string, string> = {};
for (const [prof, wpn] of Object.entries(profToWeapon)) {
  weaponToProf[wpn] = prof;
}

/**
 * Resolves a weapon definition to its associated proficiency ID:
 * 1. weaponDef.proficiencyId
 * 2. reverse of profToWeapon (e.g. longsword_1h -> longswords)
 * 3. weaponDef.spellWeaponId (e.g. fire_staff -> fire_magic)
 * Returns undefined if unmapped.
 */
export function weaponProficiencyId(weaponDef: any): string | undefined {
  if (!weaponDef) return undefined;
  if (weaponDef.proficiencyId) {
    return weaponDef.proficiencyId;
  }
  if (weaponToProf[weaponDef.id]) {
    return weaponToProf[weaponDef.id];
  }
  if (weaponDef.spellWeaponId) {
    return weaponDef.spellWeaponId;
  }
  return undefined;
}

/**
 * Walks a class requirement chain.
 * - minimal: true
 *   - anyOf with count: N -> follow first N options in data order;
 *   - anyOf without count -> follow all;
 *   - oneOf -> follow first option only;
 *   - recurse only into class-level requirements that were followed.
 * - minimal: false
 *   - follows all options of anyOf and oneOf (legacy sim behavior).
 * Keeps first-seen order of profs.
 */
export function getRequirementChain(
  classDef: any,
  classMap: Map<string, any>,
  options: { minimal: boolean }
): { profs: string[]; prereqClasses: string[] } {
  const visitedClasses = new Set<string>();
  const profs: string[] = [];
  const prereqClasses: string[] = [];

  function recurse(c: any) {
    if (!c || visitedClasses.has(c.id)) return;
    visitedClasses.add(c.id);

    function handleReq(r: any) {
      if (!r) return;
      if (r.type === 'proficiency') {
        if (!profs.includes(r.target)) profs.push(r.target);
      } else if (r.type === 'classLevel') {
        if (!prereqClasses.includes(r.target)) prereqClasses.push(r.target);
        recurse(classMap.get(r.target));
      }

      let children: any[] | undefined;
      if (options.minimal) {
        if (r.type === 'anyOf' || r.anyOf) {
          const list = r.of || r.anyOf || r.requirements;
          if (Array.isArray(list)) {
            const count = typeof r.count === 'number' ? r.count : list.length;
            children = list.slice(0, count);
          }
        } else if (r.type === 'oneOf' || r.oneOf) {
          const list = r.of || r.oneOf || r.requirements;
          if (Array.isArray(list)) {
            children = list.slice(0, 1);
          }
        } else {
          children = r.of || r.requirements;
        }
      } else {
        children = r.of || r.anyOf || r.oneOf || r.requirements;
      }

      if (Array.isArray(children)) {
        children.forEach(handleReq);
      }
    }

    (c.requirements || []).forEach(handleReq);
  }

  recurse(classDef);
  return { profs, prereqClasses };
}

/**
 * Chooses the weapon ID based on class definition, proficiency chain, and class skills.
 */
export function chooseWeaponId(classDef: any, profs: string[], classSkills: any[]): string {
  const hasWeaponScaling = classSkills.some((s: any) =>
    (s.effects || []).some((e: any) => e.type === 'damage' && e.scaling === 'weapon')
  );

  let chosenWeaponId = '';
  if (classDef.id === 'brawler') {
    chosenWeaponId = 'fist';
  } else if (classDef.id === 'battlesmith') {
    chosenWeaponId = 'mace';
  } else if (classDef.id === 'runeblade') {
    chosenWeaponId = 'longsword_1h';
  } else if (classDef.id === 'necromancer') {
    chosenWeaponId = 'dark_staff';
  } else if (['grove_walker', 'herbalist', 'druid', 'natures_avatar', 'archdruid'].includes(classDef.id)) {
    chosenWeaponId = 'druid_staff';
  } else if (classDef.id === 'guardian') {
    chosenWeaponId = 'short_swords';
  } else if (hasWeaponScaling) {
    const firstWpnProf = profs.find(p => weaponProfList.includes(p) && p !== 'shields');
    if (firstWpnProf && profToWeapon[firstWpnProf]) {
      chosenWeaponId = profToWeapon[firstWpnProf];
    } else {
      chosenWeaponId = 'katana';
    }
  } else {
    const firstMagicProf = profs.find(p => magicProfList.includes(p));
    if (firstMagicProf && magicToStaff[firstMagicProf]) {
      chosenWeaponId = magicToStaff[firstMagicProf];
    } else {
      chosenWeaponId = 'arcane_staff';
    }
  }

  return chosenWeaponId;
}
