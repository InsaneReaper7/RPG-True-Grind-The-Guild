import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
const statusEffectsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statusEffects.json'), 'utf8'));
const playerData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/player.json'), 'utf8'));
const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const statGainsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statGains.json'), 'utf8'));

console.log('=== DATA LINT GLOBAL GUARD TEST ===\n');

// 1. Skill and class IDs are unique
console.log('1. Checking ID uniqueness...');
const classIds = new Set<string>();
for (const c of classesData.classes) {
  assert.ok(!classIds.has(c.id), `Duplicate class ID found: "${c.id}"`);
  classIds.add(c.id);
}
assert.strictEqual(classIds.size, classesData.classes.length, 'All class IDs must be unique');

const skillIds = new Set<string>();
for (const s of skillsData.skills) {
  assert.ok(!skillIds.has(s.id), `Duplicate skill ID found: "${s.id}"`);
  skillIds.add(s.id);
}
assert.strictEqual(skillIds.size, skillsData.skills.length, 'All skill IDs must be unique');
console.log(`✓ PASS: ${classIds.size} class IDs and ${skillIds.size} skill IDs are unique.\n`);

// 2. Every combat (non-crafting) class has exactly 5 skills
console.log('2. Checking combat class skill counts...');
const combatClasses = classesData.classes.filter(
  (c: any) => c.category !== 'crafting' && c.tier !== 'crafting' && !c.isCrafting
);
assert.strictEqual(combatClasses.length, 86, 'There must be exactly 86 combat classes');

const classSkillsMap = new Map<string, string[]>();
for (const c of combatClasses) {
  classSkillsMap.set(c.id, []);
}

for (const s of skillsData.skills) {
  const req = (s.requirements || []).find((r: any) => r.type === 'classLevel');
  if (req && classSkillsMap.has(req.target)) {
    classSkillsMap.get(req.target)!.push(s.id);
  }
}

for (const c of combatClasses) {
  const skillsForClass = classSkillsMap.get(c.id) || [];
  assert.strictEqual(
    skillsForClass.length,
    5,
    `Combat class "${c.id}" must have exactly 5 skills (found ${skillsForClass.length}: ${skillsForClass.join(', ')})`
  );
}
console.log(`✓ PASS: All ${combatClasses.length} combat classes have exactly 5 skills.\n`);

// 3. Every applyStatus / requiresTargetStatus / requiresSelfStatus status exists in statusEffects.json
console.log('3. Checking status effect references...');
const validStatusIds = new Set<string>(statusEffectsData.statusEffects.map((s: any) => s.id));

for (const s of skillsData.skills) {
  for (const eff of s.effects || []) {
    if (eff.type === 'applyStatus') {
      assert.ok(
        validStatusIds.has(eff.status),
        `Skill "${s.id}" applyStatus references unknown status "${eff.status}"`
      );
    }
    if (eff.requiresTargetStatus) {
      assert.ok(
        validStatusIds.has(eff.requiresTargetStatus.status),
        `Skill "${s.id}" requiresTargetStatus references unknown status "${eff.requiresTargetStatus.status}"`
      );
    }
    if (eff.requiresSelfStatus) {
      assert.ok(
        validStatusIds.has(eff.requiresSelfStatus.status),
        `Skill "${s.id}" requiresSelfStatus references unknown status "${eff.requiresSelfStatus.status}"`
      );
    }
  }
}
console.log(`✓ PASS: All status references exist in statusEffects.json (${validStatusIds.size} valid statuses).\n`);

// 4. Every requirement target exists, recursing into anyOf/oneOf
console.log('4. Checking requirement targets (recursing into anyOf/oneOf)...');
const validProficiencies = new Set<string>([
  ...Object.keys(playerData.proficiencies || {}),
  'short_swords', 'longswords', 'greatswords', 'daggers', 'katana', 'spears',
  'mace', 'bows', 'crossbows', 'throwing_weapons', 'fist', 'staff', 'druid_staff',
  'shields', 'light_armor', 'medium_armor', 'heavy_armor',
  'arcane_magic', 'fire_magic', 'water_magic', 'ice_magic', 'earth_magic',
  'nature_magic', 'lightning_magic', 'wind_magic', 'holy_magic', 'dark_magic', 'healing_magic',
  'blacksmithing', 'armorsmithing', 'alchemy', 'bowyer', 'enchanting',
  'mining', 'woodcutting', 'foraging', 'digging', 'fishing', 'gardening',
  'skinning', 'butchering', 'lockpicking', 'perception', 'construction', 'cooking',
  'evasion', 'parry', 'block', 'counterattack', 'resilience',
  'health_regen', 'mana_regen', 'energy_regen', 'dual_wielding'
]);

// Include weapons categories and IDs
for (const w of weaponsData.weapons) {
  if (w.id) validProficiencies.add(w.id);
  if (w.category) validProficiencies.add(w.category);
  if (w.proficiencyId) validProficiencies.add(w.proficiencyId);
}

function checkRequirement(req: any, context: string): void {
  if (!req) return;
  if (req.type === 'classLevel') {
    assert.ok(
      classIds.has(req.target),
      `In ${context}: classLevel target "${req.target}" does not exist in classes.json`
    );
  } else if (req.type === 'proficiency') {
    assert.ok(
      validProficiencies.has(req.target),
      `In ${context}: proficiency target "${req.target}" is not a recognized proficiency`
    );
  }
  const children = req.of || req.anyOf || req.oneOf || req.requirements;
  if (Array.isArray(children)) {
    for (const child of children) {
      checkRequirement(child, context);
    }
  }
}

for (const c of classesData.classes) {
  for (const r of c.requirements || []) {
    checkRequirement(r, `class "${c.id}"`);
  }
}

for (const s of skillsData.skills) {
  for (const r of s.requirements || []) {
    checkRequirement(r, `skill "${s.id}"`);
  }
}
console.log('✓ PASS: Every requirement target exists across all classes and skills.\n');

// 5. applyStatus.durationMs appears only on poison, or with durationOverrideReason
console.log('5. Checking applyStatus.durationMs rule...');
let poisonCount = 0;
let overrideCount = 0;

for (const s of skillsData.skills) {
  for (const eff of s.effects || []) {
    if (eff.type === 'applyStatus' && eff.durationMs !== undefined) {
      const hasReason = eff.durationOverrideReason !== undefined || (s as any).durationOverrideReason !== undefined;
      const isPoison = eff.status === 'poison';
      assert.ok(
        isPoison || hasReason,
        `Skill "${s.id}" has applyStatus.durationMs (${eff.durationMs}ms) for "${eff.status}", but durationMs is only allowed for poison or with durationOverrideReason`
      );
      if (isPoison) poisonCount++;
      if (hasReason && !isPoison) overrideCount++;
    }
  }
}
assert.strictEqual(overrideCount, 4, 'Exactly 4 non-poison skills must have durationOverrideReason');
console.log(`✓ PASS: applyStatus.durationMs verified (${poisonCount} poison, ${overrideCount} durationOverrideReason overrides).\n`);

// 6. Every skill has effects, ai and a description
console.log('6. Checking skill definition completeness...');
for (const s of skillsData.skills) {
  assert.ok(Array.isArray(s.effects) && s.effects.length > 0, `Skill "${s.id}" must have non-empty effects array`);
  assert.ok(s.ai && typeof s.ai === 'object', `Skill "${s.id}" must have an ai definition object`);
  assert.ok(typeof s.ai.role === 'string' && s.ai.role.length > 0, `Skill "${s.id}" ai must have role`);
  assert.ok(typeof s.ai.priority === 'number', `Skill "${s.id}" ai must have numeric priority`);
  assert.ok(typeof s.description === 'string' && s.description.trim().length > 0, `Skill "${s.id}" must have a non-empty description`);
}
// 7. Weapon scaling completeness: every non-magic, non-offhand weapon has damagePerLevel > 0
console.log('7. Checking weapon levelBonus.damagePerLevel rule...');
for (const w of weaponsData.weapons) {
  if (w.category !== 'magic' && w.category !== 'offhand') {
    assert.ok(
      w.levelBonus && typeof w.levelBonus.damagePerLevel === 'number' && w.levelBonus.damagePerLevel > 0,
      `Weapon "${w.id}" (${w.category}) must have levelBonus.damagePerLevel > 0`
    );
  }
}
console.log('✓ PASS: All non-magic, non-offhand weapons have positive damagePerLevel.\n');

// 8. Stat gains proficiency coverage: every proficiency registered in ProgressionSystem defaults is assigned exactly once in statGains.json
console.log('8. Checking stat gains proficiency assignment rule...');
assert.ok(statGainsData && typeof statGainsData === 'object', 'statGains.json must exist and be valid JSON');
assert.ok(statGainsData.categories && typeof statGainsData.categories === 'object', 'statGains.json must have categories');
assert.ok(statGainsData.assignments && typeof statGainsData.assignments === 'object', 'statGains.json must have assignments');

const prog = new ProgressionSystem(classesData);
const defaultProficiencies = Array.from(prog.getAllProficiencyStats().keys());
const assignedProficiencies = Object.keys(statGainsData.assignments);

// Check 1: Every registered default proficiency is assigned exactly once
for (const profId of defaultProficiencies) {
  assert.ok(
    profId in statGainsData.assignments,
    `ProgressionSystem default proficiency "${profId}" is missing from statGains.json assignments`
  );
  const cat = statGainsData.assignments[profId];
  assert.ok(
    cat === 'excluded' || cat in statGainsData.categories,
    `Proficiency "${profId}" assigned to unknown category "${cat}" in statGains.json`
  );
}

// Check 2: Every assigned proficiency exists in default proficiencies (no phantom assignments)
for (const assignedId of assignedProficiencies) {
  assert.ok(
    defaultProficiencies.includes(assignedId),
    `statGains.json assigns unknown proficiency "${assignedId}" not found in ProgressionSystem defaults`
  );
}

assert.strictEqual(
  assignedProficiencies.length,
  defaultProficiencies.length,
  `Assigned proficiencies count (${assignedProficiencies.length}) must match ProgressionSystem defaults (${defaultProficiencies.length})`
);
console.log(`✓ PASS: All ${defaultProficiencies.length} proficiencies in ProgressionSystem defaults are assigned exactly once in statGains.json.\n`);

// 9. If spellDamageMultiplier is present on a class, it must be a number > 0 and <= 2
console.log('9. Checking class spellDamageMultiplier values...');
for (const c of classesData.classes) {
  if (c.spellDamageMultiplier !== undefined) {
    assert.strictEqual(
      typeof c.spellDamageMultiplier,
      'number',
      `Class "${c.id}" spellDamageMultiplier must be a number`
    );
    assert.ok(
      c.spellDamageMultiplier > 0 && c.spellDamageMultiplier <= 2,
      `Class "${c.id}" spellDamageMultiplier must be > 0 and <= 2 (found ${c.spellDamageMultiplier})`
    );
  }
}
console.log('✓ PASS: All spellDamageMultiplier values are numbers > 0 and <= 2.\n');

console.log('🎉 ALL DATA LINT CHECKS PASSED PERFECTLY!');

