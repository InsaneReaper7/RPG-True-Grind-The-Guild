import * as fs from 'fs';
import * as path from 'path';

interface Requirement {
  type: string;
  target?: string;
  value?: number;
  count?: number;
  of?: Requirement[];
}

interface ClassDef {
  id: string;
  name: string;
  tier: string;
  category?: string;
  requirements?: Requirement[];
  primaryAttribute?: 'str' | 'dex' | 'int';
  [key: string]: any;
}

interface SkillDef {
  id: string;
  name: string;
  requirements?: Requirement[];
  effects?: Array<{
    type: string;
    scaling?: string;
    [key: string]: any;
  }>;
}

interface WeaponDef {
  id: string;
  category: string;
  proficiencyId?: string;
}

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const classesPath = path.join(rootDir, 'data', 'classes.json');
const skillsPath = path.join(rootDir, 'data', 'skills.json');
const weaponsPath = path.join(rootDir, 'data', 'weapons.json');

const classesData = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
const weaponsData = JSON.parse(fs.readFileSync(weaponsPath, 'utf8'));

const classes: ClassDef[] = classesData.classes;
const skills: SkillDef[] = skillsData.skills;
const weapons: WeaponDef[] = weaponsData.weapons;

// Map classId -> skills
const classSkillsMap = new Map<string, SkillDef[]>();
for (const s of skills) {
  for (const r of s.requirements || []) {
    if (r.type === 'classLevel' && r.target) {
      if (!classSkillsMap.has(r.target)) classSkillsMap.set(r.target, []);
      classSkillsMap.get(r.target)!.push(s);
    }
  }
}

// Map weapon/proficiency -> category
const weaponCategoryMap = new Map<string, string>();
for (const w of weapons) {
  weaponCategoryMap.set(w.id, w.category);
  if (w.proficiencyId) weaponCategoryMap.set(w.proficiencyId, w.category);
}

function getDirectProficiencies(c: ClassDef): string[] {
  const profs: string[] = [];
  for (const r of c.requirements || []) {
    if (r.type === 'proficiency' && r.target) profs.push(r.target);
  }
  return profs;
}

console.log('========================================================================');
console.log('ASSIGNING PRIMARY ATTRIBUTES TO COMBAT CLASSES');
console.log('========================================================================\n');

const results: Array<{ id: string; name: string; attr: 'str' | 'dex' | 'int' | null; reason: string }> = [];

for (const c of classes) {
  // Crafting classes get none
  if (c.category === 'crafting' || c.tier === 'crafting' || c.tier === 'crafting_profession') {
    delete c.primaryAttribute;
    results.push({ id: c.id, name: c.name, attr: null, reason: 'Crafting class (none)' });
    continue;
  }

  // Explicit directive: Brawler is str
  if (c.id === 'brawler') {
    c.primaryAttribute = 'str';
    results.push({ id: c.id, name: c.name, attr: 'str', reason: 'Explicit directive (Brawler is str)' });
    continue;
  }

  // Director override: battle_medic -> int
  if (c.id === 'battle_medic') {
    c.primaryAttribute = 'int';
    results.push({ id: c.id, name: c.name, attr: 'int', reason: 'Director override: battle_medic -> int (healing role)' });
    continue;
  }

  const cSkills = classSkillsMap.get(c.id) || [];
  const hasSpellScaling = cSkills.some(s => (s.effects || []).some(e => e.scaling === 'spell'));
  const hasDamageEffect = cSkills.some(s => (s.effects || []).some(e => e.type === 'damage'));

  const directProfs = getDirectProficiencies(c);
  const isMagicGate = directProfs.some(p => p.endsWith('_magic') || p === 'druid_staff');

  // Rule 1: Kit has spell-scaling damage -> int
  if (hasSpellScaling) {
    c.primaryAttribute = 'int';
    results.push({ id: c.id, name: c.name, attr: 'int', reason: 'Kit has spell-scaling damage' });
    continue;
  }

  // Rule 2: No damage and magic-school gate (healers) -> int
  if (!hasDamageEffect && isMagicGate) {
    c.primaryAttribute = 'int';
    results.push({ id: c.id, name: c.name, attr: 'int', reason: 'No damage & magic-school gate (healer)' });
    continue;
  }

  // Rule 3: Ranged weapon chain via category === 'ranged' -> dex
  const hasRangedProf = directProfs.some(p => weaponCategoryMap.get(p) === 'ranged');
  const reqStr = JSON.stringify(c.requirements || {});
  const isRangedChain = hasRangedProf || (c.id !== 'weaponmaster' && /ranger|marksman|scout|sharpshooter|skirmisher|javelin|loader|thrower|storm_archer|witch_hunter|demon_hunter|tempest/.test(reqStr));

  if (isRangedChain && c.id !== 'weaponmaster') {
    c.primaryAttribute = 'dex';
    const rangedProfs = directProfs.filter(p => weaponCategoryMap.get(p) === 'ranged');
    results.push({
      id: c.id,
      name: c.name,
      attr: 'dex',
      reason: `Weapon chain: ranged (${rangedProfs.length > 0 ? rangedProfs.join(', ') : 'prerequisite class chain'})`
    });
    continue;
  }

  // Rule 4: Otherwise -> str
  c.primaryAttribute = 'str';
  const meleeProfs = directProfs.filter(p => weaponCategoryMap.get(p) !== 'magic');
  results.push({
    id: c.id,
    name: c.name,
    attr: 'str',
    reason: `Physical weapon chain (${meleeProfs.length > 0 ? meleeProfs.join(', ') : 'melee warrior'})`
  });
}

// Write back updated classes.json
fs.writeFileSync(classesPath, JSON.stringify(classesData, null, 2) + '\n', 'utf8');

// Print raw results table
console.log('Class ID'.padEnd(25) + ' | ' + 'Class Name'.padEnd(25) + ' | ' + 'Attr'.padEnd(6) + ' | Reason');
console.log('--------------------------+---------------------------+--------+----------------------------------------------');
for (const r of results) {
  console.log(r.id.padEnd(25) + ' | ' + r.name.padEnd(25) + ' | ' + (r.attr ? r.attr.toUpperCase() : 'NONE').padEnd(6) + ' | ' + r.reason);
}

const counts = { str: 0, dex: 0, int: 0, none: 0 };
for (const r of results) {
  if (r.attr) counts[r.attr]++;
  else counts.none++;
}

console.log('\n------------------------------------------------------------------------');
console.log(`TOTAL CLASSES: ${results.length}`);
console.log(`COMBAT CLASSES: ${results.length - counts.none} (STR: ${counts.str}, DEX: ${counts.dex}, INT: ${counts.int})`);
console.log(`CRAFTING CLASSES (NONE): ${counts.none}`);
console.log('------------------------------------------------------------------------\n');
