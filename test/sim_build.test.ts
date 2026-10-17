import assert from 'node:assert/strict';
import {
  getRequirementChain,
  chooseWeaponId,
  weaponProficiencyId,
  classMap,
  combatClasses,
  weaponsData,
  skillsData
} from '../scripts/sim_build.ts';

console.log('Running test/sim_build.test.ts...');

// 1. Assert exact minimal build arrays in data order for the 4 classes
const weaponmasterBuild = getRequirementChain(classMap.get('weaponmaster'), classMap, { minimal: true });
assert.deepStrictEqual(
  weaponmasterBuild.profs,
  ['katana', 'short_swords', 'longswords', 'greatswords', 'daggers', 'dark_magic'],
  'weaponmaster minimal profs mismatch'
);
assert.deepStrictEqual(
  weaponmasterBuild.prereqClasses,
  ['blademaster', 'ronin', 'swordsman', 'assassin', 'shadow_initiate'],
  'weaponmaster minimal prereqClasses mismatch'
);

const archmageBuild = getRequirementChain(classMap.get('archmage'), classMap, { minimal: true });
assert.deepStrictEqual(
  archmageBuild.profs,
  ['arcane_magic', 'fire_magic', 'water_magic', 'ice_magic', 'longswords'],
  'archmage minimal profs mismatch'
);
assert.deepStrictEqual(
  archmageBuild.prereqClasses,
  ['arcane_knight', 'battlemage', 'spellsword'],
  'archmage minimal prereqClasses mismatch'
);

const sovereignBuild = getRequirementChain(classMap.get('elemental_sovereign'), classMap, { minimal: true });
assert.deepStrictEqual(
  sovereignBuild.profs,
  ['fire_magic', 'water_magic', 'lightning_magic', 'wind_magic', 'longswords', 'arcane_magic'],
  'elemental_sovereign minimal profs mismatch'
);
assert.deepStrictEqual(
  sovereignBuild.prereqClasses,
  ['elemental_knight', 'battlemage', 'spellsword', 'elementalist'],
  'elemental_sovereign minimal prereqClasses mismatch'
);

const deathbringerBuild = getRequirementChain(classMap.get('deathbringer'), classMap, { minimal: true });
assert.deepStrictEqual(
  deathbringerBuild.profs,
  ['dark_magic', 'greatswords', 'daggers', 'druid_staff'],
  'deathbringer minimal profs mismatch'
);
assert.deepStrictEqual(
  deathbringerBuild.prereqClasses,
  ['necromancer', 'warlock'],
  'deathbringer minimal prereqClasses mismatch'
);

// 2. Across all combat classes, classes whose chain differs between minimal: true and minimal: false are exactly these 4
const diffClasses: string[] = [];
for (const c of combatClasses) {
  const minChain = getRequirementChain(c, classMap, { minimal: true });
  const fullChain = getRequirementChain(c, classMap, { minimal: false });
  const profDiff = JSON.stringify(minChain.profs) !== JSON.stringify(fullChain.profs);
  const classDiff = JSON.stringify(minChain.prereqClasses) !== JSON.stringify(fullChain.prereqClasses);
  if (profDiff || classDiff) {
    diffClasses.push(c.id);
  }
}

assert.deepStrictEqual(
  diffClasses.sort(),
  ['archmage', 'deathbringer', 'elemental_sovereign', 'weaponmaster'].sort(),
  'Diff between minimal and full chains must be exactly the 4 classes'
);

// 3. weaponProficiencyId checks
const weaponMap = new Map<string, any>(weaponsData.weapons.map((w: any) => [w.id, w]));

assert.strictEqual(weaponProficiencyId(weaponMap.get('short_swords')), 'short_swords');
assert.strictEqual(weaponProficiencyId(weaponMap.get('longsword_1h')), 'longswords');
assert.strictEqual(weaponProficiencyId(weaponMap.get('katana')), 'katana');
assert.strictEqual(weaponProficiencyId(weaponMap.get('spears')), 'spears');
assert.strictEqual(weaponProficiencyId(weaponMap.get('druid_staff')), 'druid_staff');
assert.strictEqual(weaponProficiencyId(weaponMap.get('fire_staff')), 'fire_magic');
assert.strictEqual(weaponProficiencyId(weaponMap.get('reinforced_staff')), 'staff');
assert.strictEqual(weaponProficiencyId(weaponMap.get('healing_staff')), 'healing_magic');
assert.strictEqual(weaponProficiencyId(undefined), undefined);

// 4. chooseWeaponId on the minimal chain
function getSkillsForClass(classId: string): any[] {
  return skillsData.skills.filter((s: any) =>
    (s.requirements || []).some((r: any) => r.type === 'classLevel' && r.target === classId)
  );
}

const guardianDef = classMap.get('guardian');
const guardianChain = getRequirementChain(guardianDef, classMap, { minimal: true });
assert.strictEqual(
  chooseWeaponId(guardianDef, guardianChain.profs, getSkillsForClass('guardian')),
  'short_swords'
);

const wmDef = classMap.get('weaponmaster');
assert.strictEqual(
  chooseWeaponId(wmDef, weaponmasterBuild.profs, getSkillsForClass('weaponmaster')),
  'katana'
);

const amDef = classMap.get('archmage');
assert.strictEqual(
  chooseWeaponId(amDef, archmageBuild.profs, getSkillsForClass('archmage')),
  'arcane_staff'
);

const dbDef = classMap.get('deathbringer');
assert.strictEqual(
  chooseWeaponId(dbDef, deathbringerBuild.profs, getSkillsForClass('deathbringer')),
  'greatswords'
);

console.log('All tests passed in test/sim_build.test.ts.');
