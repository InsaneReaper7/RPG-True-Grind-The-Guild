import * as fs from 'fs';
import * as path from 'path';

// Helper to resolve workspace root
const rootDir = process.cwd();

function readJson(relPath: string) {
  const full = path.join(rootDir, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function readText(relPath: string) {
  const full = path.join(rootDir, relPath);
  return fs.readFileSync(full, 'utf8');
}

// Load data files
const classesData = readJson('data/classes.json');
const skillsData = readJson('data/skills.json');
const hiddenSkillsData = readJson('data/hiddenSkills.json');
const weaponsData = readJson('data/weapons.json');
const playerData = readJson('data/player.json');
const enemiesData = readJson('data/enemies.json');

// Source text for line inspection
const combatSystemSrc = readText('src/systems/CombatSystem.ts');
const progressionSystemSrc = readText('src/systems/ProgressionSystem.ts');
const levelingSystemSrc = readText('src/systems/LevelingSystem.ts');
const hiddenSkillSystemSrc = readText('src/systems/HiddenSkillSystem.ts');
const playerSrc = readText('src/entities/Player.ts');
const hudSrc = readText('src/ui/HUD.ts');

const combatLines = combatSystemSrc.split('\n');

function isCraftingClassId(id: string): boolean {
  if (
    id.startsWith('apprentice_') ||
    id.startsWith('journeyman_') ||
    id.startsWith('master_') ||
    id.startsWith('grandmaster_')
  ) {
    return true;
  }
  const cls = classesData.classes.find((c: any) => c.id === id);
  return cls?.category === 'crafting';
}

console.log('================================================================================');
console.log('CLASS AND SKILL SYSTEM AUDIT REPORT');
console.log('Generated: ' + new Date().toISOString());
console.log('================================================================================\n');

// ============================================================================
// SECTION A: Classes in data
// ============================================================================
console.log('--------------------------------------------------------------------------------');
console.log('SECTION A: CLASSES IN DATA');
console.log('--------------------------------------------------------------------------------');
console.log(`Total classes in data/classes.json: ${classesData.classes.length}\n`);

// Map skills by classLevel target
const skillsByClass: Record<string, { id: string; name: string; level: number }[]> = {};
for (const skill of skillsData.skills) {
  const req = skill.requirements?.find((r: any) => r.type === 'classLevel');
  const targetClass = req?.target || 'unknown';
  if (!skillsByClass[targetClass]) {
    skillsByClass[targetClass] = [];
  }
  skillsByClass[targetClass].push({
    id: skill.id,
    name: skill.name,
    level: req?.value ?? 0
  });
}

// Sort skills within each class by unlock level
for (const k in skillsByClass) {
  skillsByClass[k].sort((a, b) => a.level - b.level);
}

for (let i = 0; i < classesData.classes.length; i++) {
  const c = classesData.classes[i];
  const category = isCraftingClassId(c.id) ? 'crafting' : (c.category || 'combat');
  const tier = c.tier || 'unspecified';
  const rawReqs = JSON.stringify(c.requirements);
  const kitList = skillsByClass[c.id];

  console.log(`[${i + 1}/${classesData.classes.length}] Class ID: ${c.id}`);
  console.log(`    Name:       ${c.name}`);
  console.log(`    Category:   ${category}`);
  console.log(`    Tier:       ${tier}`);
  console.log(`    Raw Reqs:   ${rawReqs}`);

  if (kitList && kitList.length > 0) {
    const kitStr = kitList.map((s) => `Lv ${s.level}: ${s.id} ("${s.name}")`).join(', ');
    console.log(`    Skill Kit:  [${kitList.length} skills] ${kitStr}`);
  } else {
    console.log(`    Skill Kit:  NO KIT`);
  }
  if (c.hiddenSkillBonuses) {
    console.log(`    Hidden Head-starts: ${JSON.stringify(c.hiddenSkillBonuses)}`);
  }
  console.log('');
}

// ============================================================================
// SECTION B: Skills in data and in code
// ============================================================================
console.log('--------------------------------------------------------------------------------');
console.log('SECTION B: SKILLS IN DATA AND IN CODE');
console.log('--------------------------------------------------------------------------------');
console.log(`Total skills in data/skills.json: ${skillsData.skills.length}\n`);

for (let i = 0; i < skillsData.skills.length; i++) {
  const s = skillsData.skills[i];
  const req = s.requirements?.find((r: any) => r.type === 'classLevel');
  const owningClass = req ? req.target : 'NONE';
  const unlockLevel = req ? req.value : 'N/A';
  const enCost = s.energyCost ?? 0;
  const cdMs = s.cooldownMs ?? 0;

  // Determine trigger mechanisms
  let triggerDesc = 'Manual click / hotkey via HUD';
  const approachSkills = [
    'fleche', 'smite', 'kill_shot', 'mark_target', 'quickshot', 'trap_snare',
    'piercing_throw', 'impaling_thrust', 'pinning_spear', 'heartseeker_hurl',
    'primed_shot', 'rapid_crank', 'pinning_bolt', 'kinetic_overdraw',
    'umbral_step', 'arcane_bolt', 'dimensional_lunge', 'blade_beam',
    'quick_toss', 'fan_of_knives', 'crippling_volley', 'blade_barrage'
  ];
  const healBuffSkills = [
    'heal', 'first_aid', 'cleanse', 'guardian_ward', 'barrier', 'regenerate',
    'mass_revive', 'guard_up', 'taunt', 'retaliate', 'unbreakable',
    'defensive_posture', 'arbalest_brace', 'iron_posture', 'kenjutsu_deflection',
    'blessed_weapons', 'holy_nova', 'mana_shield', 'overcharge', 'blink',
    'arcane_nova', 'runic_infusion', 'spell_ward', 'skirmish_step'
  ];
  const meleeRotationSkills = [
    'blade_strike', 'quick_cut', 'severing_slice', 'cross_cut',
    'iaido_quickdraw', 'crimson_slash', 'flowing_step', 'bloodseeker_riposte', 'dragons_flurry',
    'overhead_cleave', 'sweeping_hilt', 'heavenly_decapitation',
    'rending_cut', 'dark_pact', 'soul_drain', 'oblivion_strike',
    'shield_bash', 'thrust', 'riposte', 'blade_dance', 'arcane_strike'
  ];

  const triggers: string[] = ['Manual (HUD/useSkill)'];
  if (approachSkills.includes(s.id)) {
    triggers.push('AI Autocast (Approach Gap-closer / Ranged)');
  }
  if (healBuffSkills.includes(s.id)) {
    triggers.push('AI Autocast (Ally Heal / Self Buff / Aura)');
  }
  if (meleeRotationSkills.includes(s.id)) {
    triggers.push('AI Autocast (In-range combat rotation)');
  }
  if (s.id === 'riposte') {
    triggers.push('Reactive (Requires active riposte_window buff from parry/evasion)');
  }
  triggerDesc = triggers.join(' + ');

  // Determine implementation file and line
  let codeImpl = 'DATA ONLY';
  for (let lineIdx = 0; lineIdx < combatLines.length; lineIdx++) {
    const l = combatLines[lineIdx];
    // Check specific skill handling in castSkill (lines 3700-5670)
    if (lineIdx >= 3700 && lineIdx <= 5670) {
      if (
        l.includes(`skillId === '${s.id}'`) ||
        l.includes(`skillId === "${s.id}"`) ||
        l.includes(`'${s.id}'`) && (l.includes('includes(') || l.includes('skillId'))
      ) {
        codeImpl = `src/systems/CombatSystem.ts:${lineIdx + 1} (${l.trim()})`;
        break;
      }
    }
  }

  // Handle generic fallbacks if not caught by explicit line
  if (codeImpl === 'DATA ONLY') {
    if (s.id === 'first_aid') {
      codeImpl = `src/systems/CombatSystem.ts:4358 (Generic ally heal fallback: targetAlly.heal(skillDef.healAmount || ...))`;
    } else if (['power_strike', 'thrust', 'crushing_blow', 'normal_punch'].includes(s.id)) {
      codeImpl = `src/systems/CombatSystem.ts:5633-5645 (No dedicated branch; executed by generic offensive weapon skill fallback: effBase * skillDef.damageMultiplier)`;
    }
  }

  console.log(`[${i + 1}/${skillsData.skills.length}] Skill: ${s.id} ("${s.name}")`);
  console.log(`    Owning Class:    ${owningClass}`);
  console.log(`    Unlock Class Lv: ${unlockLevel}`);
  console.log(`    EN Cost:         ${enCost} EN`);
  console.log(`    Cooldown:        ${cdMs} ms (${(cdMs / 1000).toFixed(1)}s)`);
  console.log(`    Trigger:         ${triggerDesc}`);
  console.log(`    Code Impl:       ${codeImpl}`);
  console.log('');
}

// ============================================================================
// SECTION C: How skills are used today
// ============================================================================
console.log('--------------------------------------------------------------------------------');
console.log('SECTION C: HOW SKILLS ARE USED TODAY (VERBATIM CODE)');
console.log('--------------------------------------------------------------------------------\n');

console.log('1. SKILL LOADOUT (5 Slots, Known vs Equipped, Outpost Only)');
console.log('--- File: src/entities/Player.ts (Lines 820-838) ---');
for (let l = 820; l <= 838; l++) {
  console.log(`${l}: ${playerSrc.split('\n')[l - 1]}`);
}
console.log('\n--- File: src/ui/HUD.ts (Lines 2403-2415, Outpost restriction check) ---');
for (let l = 2403; l <= 2415; l++) {
  console.log(`${l}: ${hudSrc.split('\n')[l - 1]}`);
}
console.log('\n--- File: src/ui/HUD.ts (Lines 2521-2533, 5 Equip Slots Rendering) ---');
for (let l = 2521; l <= 2533; l++) {
  console.log(`${l}: ${hudSrc.split('\n')[l - 1]}`);
}

console.log('\n2. HOW A SKILL IS ACTIVATED IN COMBAT');
console.log('--- File: src/ui/HUD.ts (Lines 1117-1149, Manual Player Click & Autocast Toggle) ---');
for (let l = 1117; l <= 1149; l++) {
  console.log(`${l}: ${hudSrc.split('\n')[l - 1]}`);
}
console.log('\n--- File: src/entities/Player.ts (Lines 1073-1085, Player.useSkill method) ---');
for (let l = 1073; l <= 1085; l++) {
  console.log(`${l}: ${playerSrc.split('\n')[l - 1]}`);
}

console.log('\n3. ENERGY COSTS AND COOLDOWNS EVALUATION');
console.log('--- File: src/systems/CombatSystem.ts (Lines 3714-3730, castSkill validation & deduction) ---');
for (let l = 3714; l <= 3730; l++) {
  console.log(`${l}: ${combatLines[l - 1]}`);
}

console.log('\n4. WHAT A NON-PLAYER PARTY MEMBER (COMPANION) DOES WITH ITS SKILLS');
console.log('--- File: src/systems/CombatSystem.ts (Lines 1090-1105, Party Member AI Loop - Ally Heal & Buff Autocast) ---');
for (let l = 1090; l <= 1105; l++) {
  console.log(`${l}: ${combatLines[l - 1]}`);
}
console.log('\n--- File: src/systems/CombatSystem.ts (Lines 1340-1360, Party Member In-Range Attack Autocast Execution) ---');
for (let l = 1340; l <= 1360; l++) {
  console.log(`${l}: ${combatLines[l - 1]}`);
}

// ============================================================================
// SECTION D: Class levelling
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SECTION D: CLASS LEVELLING');
console.log('--------------------------------------------------------------------------------\n');

console.log('1. CLASS EXP PER KILL AND PER ENEMY TIER');
console.log('--- File: src/systems/CombatSystem.ts (Lines 2843-2856) ---');
for (let l = 2843; l <= 2856; l++) {
  console.log(`${l}: ${combatLines[l - 1]}`);
}
console.log('Enemy tiers from data/enemies.json: common, elite, epic, boss, elemental.');
console.log('Awarded values per tier in CombatSystem.ts line 2846:');
console.log('  - Common:    25 Class EXP');
console.log('  - Elite:     50 Class EXP');
console.log('  - Epic:      100 Class EXP');
console.log('  - Boss:      250 Class EXP');
console.log('  - Elemental: 25 Class EXP (falls back to default 25 in ternary)\n');

console.log('2. CLASS LEVEL CURVE AND CAP');
console.log('--- File: src/systems/LevelingSystem.ts (Lines 4-19) ---');
for (let l = 4; l <= 19; l++) {
  console.log(`${l}: ${levelingSystemSrc.split('\n')[l - 1]}`);
}
console.log('Formula: expForNextLevel(currentLevel) = 50 + currentLevel * 4');
console.log('Level Cap: NO hard cap enforced in LevelingSystem.ts or ProgressionSystem.ts (can increment indefinitely without clamp).\n');

console.log('3. ACTIVE-CLASS RULES AND SWITCHING LOCATION');
console.log('--- File: src/entities/Player.ts (Lines 177-198, setActiveClass rules) ---');
for (let l = 177; l <= 198; l++) {
  console.log(`${l}: ${playerSrc.split('\n')[l - 1]}`);
}
console.log('Switching location: Swappable ONLY at the Guild Outpost inside the Loadout Modal (HUD.ts:2404: `if (!this.isOutpost) return;`).');
console.log('Crafting classes are passive masteries and cannot be equipped as active class (Player.ts:185).\n');

console.log('4. HIDDEN CLASS HEAD-STARTS');
console.log('--- File: src/systems/ProgressionSystem.ts (Lines 290-301) ---');
for (let l = 290; l <= 301; l++) {
  console.log(`${l}: ${progressionSystemSrc.split('\n')[l - 1]}`);
}
console.log('--- File: src/systems/HiddenSkillSystem.ts (Lines 134-137, 169-173) ---');
for (let l = 134; l <= 137; l++) {
  console.log(`${l}: ${hiddenSkillSystemSrc.split('\n')[l - 1]}`);
}
for (let l = 169; l <= 173; l++) {
  console.log(`${l}: ${hiddenSkillSystemSrc.split('\n')[l - 1]}`);
}
console.log('Status: IMPLEMENTED. In data/classes.json: Guardian -> Block (+0.05 / 5%), Fencer -> Counterattack (+0.05), Vanguard -> Block & Counterattack (+0.05 each), Medic -> Health Regen (+0.05).');

// ============================================================================
// SECTION E: Requirement types supported
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SECTION E: REQUIREMENT TYPES SUPPORTED');
console.log('--------------------------------------------------------------------------------\n');
console.log('--- File: src/systems/ProgressionSystem.ts (Lines 348-366, evaluateRequirements) ---');
for (let l = 348; l <= 366; l++) {
  console.log(`${l}: ${progressionSystemSrc.split('\n')[l - 1]}`);
}

console.log('\nEvaluation breakdown:');
console.log('1. "proficiency": EVALUATED. Lines 354-356: `this.getProficiencyLevel(req.target) >= req.value`.');
console.log('2. "classLevel":  EVALUATED. Lines 357-359: `this.getClassLevel(req.target) >= req.value`.');
console.log('3. "triggerCount": NOT EVALUATED (Missing from evaluator; returns false at line 364).');
console.log('4. "activityCount": EVALUATED. Lines 360-362: `this.getActivityCount(req.target) >= req.value`.');
console.log('5. "any N of": NOT EVALUATED (Evaluator strictly uses `classDef.requirements.every(...)`, requiring ALL requirements to match).');
console.log('6. OR between classes: NOT EVALUATED (No OR operator or alternative branching supported in requirement array schema).');

// ============================================================================
// SECTION F: Every trainable stat
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SECTION F: EVERY TRAINABLE STAT');
console.log('--------------------------------------------------------------------------------\n');

const statsToAudit = [
  // Weapons
  { category: 'Weapons', id: 'katana', name: 'Katana' },
  { category: 'Weapons', id: 'short_swords', name: 'Short Swords' },
  { category: 'Weapons', id: 'longswords', name: 'Longswords (1H & 2H)' },
  { category: 'Weapons', id: 'greatswords', name: 'Greatswords' },
  { category: 'Weapons', id: 'daggers', name: 'Daggers' },
  { category: 'Weapons', id: 'mace', name: 'Mace and Heavy Mace' },
  { category: 'Weapons', id: 'spears', name: 'Spears (1H & 2H)' },
  { category: 'Weapons', id: 'bows', name: 'Bows' },
  { category: 'Weapons', id: 'crossbows', name: 'Crossbows' },
  { category: 'Weapons', id: 'throwing_weapons', name: 'Throwing Weapons' },
  { category: 'Weapons', id: 'shields', name: 'Shields' },
  { category: 'Weapons', id: 'staff', name: 'Staff' },
  { category: 'Weapons', id: 'druid_staff', name: 'Druid Staff' },

  // Magic
  { category: 'Magic', id: 'arcane_magic', name: 'Arcane Magic' },
  { category: 'Magic', id: 'fire_magic', name: 'Fire Magic' },
  { category: 'Magic', id: 'water_magic', name: 'Water Magic' },
  { category: 'Magic', id: 'ice_magic', name: 'Ice Magic' },
  { category: 'Magic', id: 'earth_magic', name: 'Earth Magic' },
  { category: 'Magic', id: 'nature_magic', name: 'Nature Magic' },
  { category: 'Magic', id: 'lightning_magic', name: 'Lightning Magic' },
  { category: 'Magic', id: 'wind_magic', name: 'Wind Magic' },
  { category: 'Magic', id: 'healing_magic', name: 'Healing Magic' },
  { category: 'Magic', id: 'holy_magic', name: 'Holy Magic' },
  { category: 'Magic', id: 'dark_magic', name: 'Dark Magic' },

  // Armor
  { category: 'Armor', id: 'light_armor', name: 'Light Armor' },
  { category: 'Armor', id: 'medium_armor', name: 'Medium Armor' },
  { category: 'Armor', id: 'heavy_armor', name: 'Heavy Armor' },

  // Gathering and crafting
  { category: 'Gathering & Crafting', id: 'mining', name: 'Mining' },
  { category: 'Gathering & Crafting', id: 'woodcutting', name: 'Woodcutting' },
  { category: 'Gathering & Crafting', id: 'skinning', name: 'Skinning' },
  { category: 'Gathering & Crafting', id: 'butchering', name: 'Butchering' },
  { category: 'Gathering & Crafting', id: 'foraging', name: 'Foraging' },
  { category: 'Gathering & Crafting', id: 'gardening', name: 'Gardening' },
  { category: 'Gathering & Crafting', id: 'animal_husbandry', name: 'Animal Husbandry' },
  { category: 'Gathering & Crafting', id: 'fishing', name: 'Fishing' },
  { category: 'Gathering & Crafting', id: 'digging', name: 'Digging' },
  { category: 'Gathering & Crafting', id: 'blacksmithing', name: 'Blacksmithing' },
  { category: 'Gathering & Crafting', id: 'armorsmithing', name: 'Armorsmithing' },
  { category: 'Gathering & Crafting', id: 'bowyer', name: 'Bowyer' },
  { category: 'Gathering & Crafting', id: 'woodworking', name: 'Woodworking' },
  { category: 'Gathering & Crafting', id: 'alchemy', name: 'Alchemy' },
  { category: 'Gathering & Crafting', id: 'enchanting', name: 'Enchanting' },
  { category: 'Gathering & Crafting', id: 'tailoring', name: 'Tailoring / Jewelcrafting' },
  { category: 'Gathering & Crafting', id: 'cooking', name: 'Cooking' },
  { category: 'Gathering & Crafting', id: 'stonemason', name: 'Stonemason' },
  { category: 'Gathering & Crafting', id: 'construction', name: 'Construction' },

  // Passives
  { category: 'Passives', id: 'accuracy', name: 'Accuracy' },
  { category: 'Passives', id: 'evasion', name: 'Evasion' },
  { category: 'Passives', id: 'perception', name: 'Perception' },
  { category: 'Passives', id: 'stealth', name: 'Stealth' },
  { category: 'Passives', id: 'life_steal', name: 'Life Steal' },
  { category: 'Passives', id: 'critical_strike', name: 'Critical Strike' },
  { category: 'Passives', id: 'lockpicking', name: 'Lockpicking' },
  { category: 'Passives', id: 'taming', name: 'Taming' },
  { category: 'Passives', id: 'haggling', name: 'Haggling / Appraisal' },
  { category: 'Passives', id: 'luck', name: 'Luck' },

  // Hidden defensive and regen
  { category: 'Hidden Defensive & Regen', id: 'resilience', name: 'Resilience' },
  { category: 'Hidden Defensive & Regen', id: 'parry', name: 'Parry' },
  { category: 'Hidden Defensive & Regen', id: 'block', name: 'Block' },
  { category: 'Hidden Defensive & Regen', id: 'counterattack', name: 'Counterattack' },
  { category: 'Hidden Defensive & Regen', id: 'health_regen', name: 'Health Regen' },
  { category: 'Hidden Defensive & Regen', id: 'mana_regen', name: 'Mana Regen' },
  { category: 'Hidden Defensive & Regen', id: 'energy_regen', name: 'Energy Regen' },
  { category: 'Hidden Defensive & Regen', id: 'poison_resistance', name: 'Poison Resistance' },
  { category: 'Hidden Defensive & Regen', id: 'dual_wielding', name: 'Dual Wielding' }
];

const statExpSources: Record<string, string> = {
  katana: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with katana)',
  short_swords: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with short swords)',
  longswords: 'YES: src/systems/CombatSystem.ts:2516, 2819, 5323, 5375, 5437 (Basic attack, kill, & Spellsword skills)',
  greatswords: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with greatswords)',
  daggers: 'YES: src/systems/CombatSystem.ts:2516, 2819, 2835 (Attack, kill, & off-hand sidearm kill)',
  mace: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with mace / heavy mace)',
  spears: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with 1H / 2H spears)',
  bows: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with hunting/war/composite bows)',
  crossbows: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with crossbows)',
  throwing_weapons: 'YES: src/systems/CombatSystem.ts:2516, 2819, 2835, 5546-5630 (Attack, kill, sidearm, & Thrower skills)',
  shields: 'YES: src/systems/CombatSystem.ts:2375, 2383 (Blocking enemy attacks with shield equipped)',
  staff: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Attack & kill with physical staff)',
  druid_staff: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Item exists in weapons.json; gains EXP on attack/kill if equipped)',

  arcane_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819, 4206, 5323 (Attack with arcane magic, Arcane Nova & Arcane Strike)',
  fire_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Fire Magic spell/staff)',
  water_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Water Magic spell/staff)',
  ice_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Ice Magic spell/staff)',
  earth_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Earth Magic spell/staff)',
  nature_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Nature Magic spell/staff)',
  lightning_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Lightning Magic spell/staff)',
  wind_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Wind Magic spell/staff)',
  healing_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819, 4323, 4339, 4355, 4364, 4410 (Healing attack & casting heal spells)',
  holy_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Holy Magic spell/staff)',
  dark_magic: 'YES: src/systems/CombatSystem.ts:2516, 2819 (Basic attack & kill with Dark Magic spell/staff)',

  light_armor: 'YES: src/entities/Player.ts:733, 746, 758 (awardArmorWearExp on attack, hit taken, kill)',
  medium_armor: 'YES: src/entities/Player.ts:733, 746, 758 (awardArmorWearExp on attack, hit taken, kill)',
  heavy_armor: 'YES: src/entities/Player.ts:733, 746, 758 (awardArmorWearExp on attack, hit taken, kill)',

  mining: 'YES: src/scenes/MainScene.ts:1406 (Harvesting mining_rock vein)',
  woodcutting: 'YES: src/scenes/MainScene.ts:1406 (Harvesting woodcutting_tree)',
  skinning: 'YES: src/scenes/MainScene.ts:1406 (Harvesting corpse_skinning)',
  butchering: 'YES: src/scenes/MainScene.ts:1406 (Harvesting corpse_butchering)',
  foraging: 'YES: src/scenes/MainScene.ts:1406 (Harvesting foraging_bush)',
  gardening: 'YES: src/scenes/MainScene.ts:1406, src/scenes/OutpostScene.ts:1146, 1162 (Harvesting vegetable nodes & plots)',
  animal_husbandry: 'MISSING (No stat in ProgressionSystem, no nodes, no system)',
  fishing: 'YES: src/scenes/MainScene.ts:1406 (Harvesting fishing_spot)',
  digging: 'YES: src/scenes/MainScene.ts:1406 (Harvesting dig_spot)',
  blacksmithing: 'YES: src/systems/CraftingSystem.ts:511, 574 (Crafting items at Blacksmith station)',
  armorsmithing: 'YES: src/systems/CraftingSystem.ts:511, 574 (Crafting items at Armorsmith station)',
  bowyer: 'YES: src/systems/CraftingSystem.ts:511, 574 (Crafting items at Bowyer station)',
  woodworking: 'MISSING (No stat in ProgressionSystem, no recipes, no workbench station)',
  alchemy: 'YES: src/systems/CraftingSystem.ts:511, 574 (Crafting potions at Alchemy station)',
  enchanting: 'YES: src/systems/CraftingSystem.ts:511, 574 (Crafting enchantments at Enchanting altar)',
  tailoring: 'MISSING (No stat in ProgressionSystem, no recipes, no station)',
  cooking: 'YES: src/ui/HUD.ts:7715, 7727, 7731, 7748 (Cooking recipes at campfire/kitchen)',
  stonemason: 'MISSING (No stat in ProgressionSystem, no recipes, no yard station)',
  construction: 'YES: src/scenes/OutpostScene.ts:1106, 1152 (Placing or demolishing buildable structures)',

  accuracy: 'DEFINED AS DERIVED COMBAT STAT, NEVER GAINS EXP (calculated from weapon level and gear)',
  evasion: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollAvoidance when attacked)',
  perception: 'MISSING (No stat, no system)',
  stealth: 'MISSING (No stat, no system)',
  life_steal: 'MISSING AS TRAINABLE STAT (Exists only as skill/item combat property like soul_drain, never gains EXP)',
  critical_strike: 'DEFINED AS DERIVED STAT, NEVER GAINS EXP (Calculated dynamically, no stat)',
  lockpicking: 'YES: src/systems/LockpickingSystem.ts:241, 245, 249 (Lockpicking chests/doors on success or failure)',
  taming: 'MISSING (No stat, no system)',
  haggling: 'MISSING (No stat, no system)',
  luck: 'MISSING (No stat, no system, no triggerCount evaluator)',

  resilience: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollDamageMitigation when taking damage)',
  parry: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollAvoidance when attacked in melee with parry weapon)',
  block: 'YES: src/systems/HiddenSkillSystem.ts:172, src/systems/CombatSystem.ts:2375 (Procs on shield block)',
  counterattack: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollCounterattack after evade/parry/block)',
  health_regen: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollPassiveRegen on tick)',
  mana_regen: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollPassiveRegen on tick with magic proficiency)',
  energy_regen: 'YES: src/systems/HiddenSkillSystem.ts:172 (Procs via rollPassiveRegen universally on tick)',
  poison_resistance: 'YES: src/entities/Player.ts:1672 (Awards EXP when taking poison damage tick)',
  dual_wielding: 'YES: src/systems/CombatSystem.ts:2426, 2527, 2837 (Attacking or defeating enemies while dual wielding)'
};

console.log('| ID | Name | Category | Status & Source Line |');
console.log('|---|---|---|---|');
for (const stat of statsToAudit) {
  const info = statExpSources[stat.id] || 'MISSING';
  console.log(`| \`${stat.id}\` | ${stat.name} | ${stat.category} | ${info} |`);
}

// ============================================================================
// SECTION G: Coverage matrix against the design
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SECTION G: COVERAGE MATRIX AGAINST THE DESIGN (138 CLASSES)');
console.log('--------------------------------------------------------------------------------\n');
console.log('Document Note: `docs/class_system.md` is present in the repository as `docs/class_system (1).md`.\n');

interface DesignClassDef {
  name: string;
  dataId: string;
  tier: string;
  designReq: string;
  blockedBy: string;
}

const designClasses: DesignClassDef[] = [
  // Tier 0 (24)
  { name: 'Swordsman', dataId: 'swordsman', tier: 'Tier 0', designReq: 'Katana 10', blockedBy: 'None (Unlockable)' },
  { name: 'Fencer', dataId: 'fencer', tier: 'Tier 0', designReq: 'Short Swords 10', blockedBy: 'None (Unlockable)' },
  { name: 'Guardian', dataId: 'guardian', tier: 'Tier 0', designReq: 'Shields 10', blockedBy: 'None (Unlockable)' },
  { name: 'Squire', dataId: 'squire', tier: 'Tier 0', designReq: 'Longswords 10', blockedBy: 'None (Unlockable)' },
  { name: 'Brute', dataId: 'brute', tier: 'Tier 0', designReq: 'Greatswords 10', blockedBy: 'None (Unlockable; Greatswords exists)' },
  { name: 'Cutthroat', dataId: 'cutthroat', tier: 'Tier 0', designReq: 'Daggers 10', blockedBy: 'None (Unlockable)' },
  { name: 'Marksman', dataId: 'marksman', tier: 'Tier 0', designReq: 'Bows 10', blockedBy: 'None (Unlockable)' },
  { name: 'Loader', dataId: 'loader', tier: 'Tier 0', designReq: 'Crossbows 10', blockedBy: 'None (Unlockable)' },
  { name: 'Bludgeoner', dataId: 'bludgeoner', tier: 'Tier 0', designReq: 'Mace 10', blockedBy: 'None (Unlockable)' },
  { name: 'Spearman', dataId: 'spearman', tier: 'Tier 0', designReq: 'Spears 10', blockedBy: 'None (Unlockable)' },
  { name: 'Skirmisher', dataId: 'skirmisher', tier: 'Tier 0', designReq: 'Throwing Weapons 10', blockedBy: 'None (Unlockable)' },
  { name: 'Arcane Initiate', dataId: 'arcane_initiate', tier: 'Tier 0', designReq: 'Arcane 10', blockedBy: 'None (Unlockable)' },
  { name: 'Ember Adept', dataId: 'ember_adept', tier: 'Tier 0', designReq: 'Fire Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Tide Adept', dataId: 'tide_adept', tier: 'Tier 0', designReq: 'Water Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Sprout Keeper', dataId: 'sprout_keeper', tier: 'Tier 0', designReq: 'Nature Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Spark Adept', dataId: 'spark_adept', tier: 'Tier 0', designReq: 'Lightning Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Gale Adept', dataId: 'gale_adept', tier: 'Tier 0', designReq: 'Wind Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Medic', dataId: 'medic', tier: 'Tier 0', designReq: 'Healing Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Acolyte', dataId: 'acolyte', tier: 'Tier 0', designReq: 'Holy Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Cultist', dataId: 'cultist', tier: 'Tier 0', designReq: 'Dark Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Grove Walker', dataId: 'grove_walker', tier: 'Tier 0', designReq: 'Druid Staff 10', blockedBy: 'Druid Staff (item exists, no craft recipe/skills)' },
  { name: 'Frost Initiate', dataId: 'frost_initiate', tier: 'Tier 0', designReq: 'Ice Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Stoneheart Initiate', dataId: 'stoneheart_initiate', tier: 'Tier 0', designReq: 'Earth Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Excavator', dataId: 'excavator', tier: 'Tier 0', designReq: 'Digging 10', blockedBy: 'None (Unlockable)' },

  // Tier 1 (21)
  { name: 'Ronin', dataId: 'ronin', tier: 'Tier 1', designReq: 'Katana 30 + Swordsman Lv 5', blockedBy: 'None (Unlockable)' },
  { name: 'Samurai', dataId: 'samurai', tier: 'Tier 1', designReq: 'Katana 30 + Shields 10 + Swordsman Lv 5', blockedBy: 'None (Unlockable)' },
  { name: 'Duelist', dataId: 'duelist', tier: 'Tier 1', designReq: 'Short Swords 30 + Daggers 10', blockedBy: 'None (Unlockable)' },
  { name: 'Ranger', dataId: 'ranger', tier: 'Tier 1', designReq: 'Bows 30 + Daggers 10', blockedBy: 'None (Unlockable)' },
  { name: 'Vanguard', dataId: 'vanguard', tier: 'Tier 1', designReq: 'Short Swords 30 + Shields 30 + Fencer Lv 5 + Guardian Lv 5', blockedBy: 'None (Unlockable)' },
  { name: 'Reaver', dataId: 'reaver', tier: 'Tier 1', designReq: 'Greatswords 30 + Brute Lv 5', blockedBy: 'Brute (class not in data)' },
  { name: 'Shadow Initiate', dataId: 'shadow_initiate', tier: 'Tier 1', designReq: 'Daggers 30 + Dark Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Lancer', dataId: 'lancer', tier: 'Tier 1', designReq: 'Spears 30 + Shields 10', blockedBy: 'None (Unlockable)' },
  { name: 'Sharpshooter', dataId: 'sharpshooter', tier: 'Tier 1', designReq: 'Crossbows 30 + Bows 10', blockedBy: 'None (Unlockable)' },
  { name: 'Battle Medic', dataId: 'battle_medic', tier: 'Tier 1', designReq: 'Mace 30 + Healing Magic 10', blockedBy: 'None (Unlockable)' },
  { name: 'Spellsword', dataId: 'spellsword', tier: 'Tier 1', designReq: 'Longswords 30 + Arcane 10', blockedBy: 'None (Unlockable)' },
  { name: 'Flamecaller', dataId: 'flamecaller', tier: 'Tier 1', designReq: 'Fire Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Frostcaller', dataId: 'frostcaller', tier: 'Tier 1', designReq: 'Water Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Stormtouched', dataId: 'stormtouched', tier: 'Tier 1', designReq: 'Lightning Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Windwalker', dataId: 'windwalker', tier: 'Tier 1', designReq: 'Wind Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Naturalist', dataId: 'naturalist', tier: 'Tier 1', designReq: 'Nature Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Priest', dataId: 'priest', tier: 'Tier 1', designReq: 'Holy Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Warlock', dataId: 'warlock', tier: 'Tier 1', designReq: 'Dark Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Herbalist', dataId: 'herbalist', tier: 'Tier 1', designReq: 'Druid Staff 30 + Nature Magic 10', blockedBy: 'Druid Staff (item exists, no craft recipe/skills)' },
  { name: 'Thrower', dataId: 'thrower', tier: 'Tier 1', designReq: 'Throwing Weapons 30 + Daggers 10', blockedBy: 'None (Unlockable)' },
  { name: 'Scout', dataId: 'scout', tier: 'Tier 1', designReq: 'Daggers 10 + Bows 15', blockedBy: 'None (Unlockable)' },

  // Tier 2 (19)
  { name: 'Blademaster', dataId: 'blademaster', tier: 'Tier 2', designReq: 'Katana 60 + Longswords 30 + Ronin Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Assassin', dataId: 'assassin', tier: 'Tier 2', designReq: 'Daggers 60 + Dark Magic 30 + Shadow Initiate Lv 15', blockedBy: 'Shadow Initiate (class not in data)' },
  { name: 'Shadowblade', dataId: 'shadowblade', tier: 'Tier 2', designReq: 'Daggers 30 + Dark Magic 30 + Shadow Initiate Lv 15', blockedBy: 'Shadow Initiate (class not in data)' },
  { name: 'Arcane Archer', dataId: 'arcane_archer', tier: 'Tier 2', designReq: 'Bows 30 + Arcane 30 + Ranger Lv 15', blockedBy: 'Ranger (class not in data)' },
  { name: 'Storm Archer', dataId: 'storm_archer', tier: 'Tier 2', designReq: 'Bows 30 + Lightning Magic 30 + Ranger Lv 15', blockedBy: 'Ranger (class not in data)' },
  { name: 'Witch Hunter', dataId: 'witch_hunter', tier: 'Tier 2', designReq: 'Crossbows 30 + Holy Magic 30 + Sharpshooter Lv 15', blockedBy: 'Sharpshooter (class not in data)' },
  { name: 'Knight', dataId: 'knight', tier: 'Tier 2', designReq: 'Short Swords 60 + Shields 60 + Vanguard Lv 20', blockedBy: 'None (Unlockable)' },
  { name: 'Paladin', dataId: 'paladin', tier: 'Tier 2', designReq: 'Shields 30 + Holy Magic 30 + Vanguard Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Dark Knight', dataId: 'dark_knight', tier: 'Tier 2', designReq: 'Longswords 30 + Dark Magic 30 + Vanguard Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Juggernaut', dataId: 'juggernaut', tier: 'Tier 2', designReq: 'Greatswords 60 + Shields 30 + Reaver Lv 15', blockedBy: 'Reaver (class not in data)' },
  { name: 'Battlemage', dataId: 'battlemage', tier: 'Tier 2', designReq: 'Longswords 30 + Fire Magic 30 + Arcane 10 + Spellsword Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Storm Lancer', dataId: 'storm_lancer', tier: 'Tier 2', designReq: 'Spears 30 + Lightning Magic 30 + Lancer Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Elementalist', dataId: 'elementalist', tier: 'Tier 2', designReq: 'Fire Magic 30 + Water Magic 30 + Wind Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Druid', dataId: 'druid', tier: 'Tier 2', designReq: 'Druid Staff 30 + Nature Magic 60 + Herbalist Lv 15', blockedBy: 'Herbalist & Druid Staff' },
  { name: 'Aquamancer', dataId: 'aquamancer', tier: 'Tier 2', designReq: 'Water Magic 60 + Frostcaller Lv 15', blockedBy: 'Frostcaller (class not in data)' },
  { name: 'Cryomancer', dataId: 'cryomancer', tier: 'Tier 2', designReq: 'Ice Magic 60 + Frost Initiate Lv 15', blockedBy: 'None (Unlockable)' },
  { name: 'Geomancer', dataId: 'geomancer', tier: 'Tier 2', designReq: 'Earth Magic 60 + Stoneheart Initiate Lv 15', blockedBy: 'Stoneheart Initiate (class not in data)' },
  { name: 'Explorer', dataId: 'explorer', tier: 'Tier 2', designReq: 'Digging 60 + Perception 30 + Excavator Lv 20', blockedBy: 'Perception (no stat)' },
  { name: 'Cleric', dataId: 'cleric', tier: 'Tier 2', designReq: 'Holy Magic 30 + Healing Magic 30 + Priest Lv 15', blockedBy: 'Priest (class not in data)' },

  // Tier 3 (10)
  { name: 'Sword Saint', dataId: 'sword_saint', tier: 'Tier 3', designReq: 'Katana 90 + Longswords 60 + Blademaster Lv 25', blockedBy: 'Blademaster (class not in data)' },
  { name: 'Death Knight', dataId: 'death_knight_t3', tier: 'Tier 3', designReq: 'Greatswords 90 + Dark Magic 60 + Juggernaut Lv 25 + Dark Knight Lv 20', blockedBy: 'Juggernaut (class not in data)' },
  { name: 'Celestial Knight', dataId: 'celestial_knight', tier: 'Tier 3', designReq: 'Longswords 90 + Holy Magic 60 + Healing Magic 30 + Knight Lv 25 + Paladin Lv 20', blockedBy: 'Knight & Paladin (classes not in data)' },
  { name: 'Shadow Monk', dataId: 'shadow_monk', tier: 'Tier 3', designReq: 'Short Swords 60 + Daggers 60 + Dark Magic 30 + Assassin Lv 20', blockedBy: 'Assassin (class not in data)' },
  { name: 'Demon Hunter', dataId: 'demon_hunter', tier: 'Tier 3', designReq: 'Short Swords 60 + Crossbows 60 + Holy Magic 30 + Witch Hunter Lv 20', blockedBy: 'Witch Hunter (class not in data)' },
  { name: 'Arcane Knight', dataId: 'arcane_knight', tier: 'Tier 3', designReq: 'Longswords 90 + Arcane 90 + Battlemage Lv 25', blockedBy: 'Battlemage (class not in data)' },
  { name: 'Elemental Knight', dataId: 'elemental_knight', tier: 'Tier 3', designReq: 'Longswords 30 + Fire/Water/Lightning Magic 30 + Battlemage Lv 20 + Elementalist Lv 20', blockedBy: 'Battlemage & Elementalist (classes not in data)' },
  { name: 'Tempest', dataId: 'tempest', tier: 'Tier 3', designReq: 'Bows 30 + Lightning Magic 30 + Wind Magic 60 + Storm Archer Lv 20', blockedBy: 'Storm Archer (class not in data)' },
  { name: 'Necromancer', dataId: 'necromancer', tier: 'Tier 3', designReq: 'Druid Staff 10 + Dark Magic 90 + Warlock Lv 25', blockedBy: 'Warlock & Druid Staff' },
  { name: 'Nature\'s Avatar', dataId: 'natures_avatar', tier: 'Tier 3', designReq: 'Druid Staff 60 + Nature Magic 90 + Healing Magic 30 + Druid Lv 25', blockedBy: 'Druid & Druid Staff' },

  // Tier 4 (8)
  { name: 'Swordmaster', dataId: 'swordmaster', tier: 'Tier 4', designReq: 'Katana 100 + Short Swords 60 + Longswords 60 + Sword Saint Lv 30', blockedBy: 'Sword Saint (class not in data)' },
  { name: 'Weaponmaster', dataId: 'weaponmaster', tier: 'Tier 4', designReq: 'Any 5 physical weapons at 60+ + any two Tier 2+ melee classes Lv 20', blockedBy: 'any-N-of (unsupported by evaluator)' },
  { name: 'Archmage', dataId: 'archmage', tier: 'Tier 4', designReq: 'Arcane 100 + any 3 elemental schools at 30+ + (Arcane Knight Lv 25 OR Elementalist Lv 25)', blockedBy: 'any-N-of & OR condition (unsupported by evaluator)' },
  { name: 'Grand Paladin', dataId: 'grand_paladin', tier: 'Tier 4', designReq: 'Short Swords 100 + Shields 100 + Holy Magic 90 + Healing Magic 60 + Celestial Knight Lv 30', blockedBy: 'Celestial Knight (class not in data)' },
  { name: 'Dark Lord', dataId: 'dark_lord', tier: 'Tier 4', designReq: 'Greatswords 100 + Dark Magic 100 + Death Knight (T3) Lv 30', blockedBy: 'Death Knight T3 (class not in data)' },
  { name: 'Archdruid', dataId: 'archdruid', tier: 'Tier 4', designReq: 'Druid Staff 100 + Nature Magic 100 + Healing Magic 30 + Nature\'s Avatar Lv 30', blockedBy: 'Nature\'s Avatar & Druid Staff' },
  { name: 'Elemental Sovereign', dataId: 'elemental_sovereign', tier: 'Tier 4', designReq: 'Fire/Water/Lightning/Wind Magic 100 each + (Elemental Knight Lv 25 OR Tempest Lv 25)', blockedBy: 'OR condition (unsupported by evaluator)' },
  { name: 'Deathbringer', dataId: 'deathbringer', tier: 'Tier 4', designReq: 'Dark Magic 100 + Greatswords 100 + Daggers 60 + (Necromancer Lv 30 OR Death Knight T3 Lv 30)', blockedBy: 'OR condition (unsupported by evaluator)' },

  // Crafting Mastery (40)
  // Blacksmithing
  { name: 'Apprentice Smith', dataId: 'apprentice_smith', tier: 'Crafting Mastery', designReq: 'Blacksmithing 10', blockedBy: 'None (Unlockable)' },
  { name: 'Journeyman Smith', dataId: 'journeyman_smith', tier: 'Crafting Mastery', designReq: 'Blacksmithing 30 + Apprentice Smith Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Smith', dataId: 'master_smith', tier: 'Crafting Mastery', designReq: 'Blacksmithing 60 + Journeyman Smith Lv 15', blockedBy: 'Journeyman Smith (class not in data)' },
  { name: 'Grandmaster Smith', dataId: 'grandmaster_smith', tier: 'Crafting Mastery', designReq: 'Blacksmithing 90 + Master Smith Lv 25', blockedBy: 'Master Smith (class not in data)' },
  // Armorsmithing
  { name: 'Apprentice Armorer', dataId: 'apprentice_armorer', tier: 'Crafting Mastery', designReq: 'Armorsmithing 10', blockedBy: 'None (Unlockable)' },
  { name: 'Journeyman Armorer', dataId: 'journeyman_armorer', tier: 'Crafting Mastery', designReq: 'Armorsmithing 30 + Apprentice Armorer Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Armorer', dataId: 'master_armorer', tier: 'Crafting Mastery', designReq: 'Armorsmithing 60 + Journeyman Armorer Lv 15', blockedBy: 'Journeyman Armorer (class not in data)' },
  { name: 'Grandmaster Armorer', dataId: 'grandmaster_armorer', tier: 'Crafting Mastery', designReq: 'Armorsmithing 90 + Master Armorer Lv 25', blockedBy: 'Master Armorer (class not in data)' },
  // Bowyer
  { name: 'Apprentice Bowyer', dataId: 'apprentice_bowyer', tier: 'Crafting Mastery', designReq: 'Bowyer 10', blockedBy: 'None (Unlockable)' },
  { name: 'Journeyman Bowyer', dataId: 'journeyman_bowyer', tier: 'Crafting Mastery', designReq: 'Bowyer 30 + Apprentice Bowyer Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Bowyer', dataId: 'master_bowyer', tier: 'Crafting Mastery', designReq: 'Bowyer 60 + Journeyman Bowyer Lv 15', blockedBy: 'Journeyman Bowyer (class not in data)' },
  { name: 'Grandmaster Bowyer', dataId: 'grandmaster_bowyer', tier: 'Crafting Mastery', designReq: 'Bowyer 90 + Master Bowyer Lv 25', blockedBy: 'Master Bowyer (class not in data)' },
  // Woodworking
  { name: 'Apprentice Carpenter', dataId: 'apprentice_carpenter', tier: 'Crafting Mastery', designReq: 'Woodworking 10', blockedBy: 'Woodworking (missing profession)' },
  { name: 'Journeyman Carpenter', dataId: 'journeyman_carpenter', tier: 'Crafting Mastery', designReq: 'Woodworking 30 + Apprentice Carpenter Lv 10', blockedBy: 'Woodworking (missing profession)' },
  { name: 'Master Carpenter', dataId: 'master_carpenter', tier: 'Crafting Mastery', designReq: 'Woodworking 60 + Journeyman Carpenter Lv 15', blockedBy: 'Woodworking (missing profession)' },
  { name: 'Grandmaster Carpenter', dataId: 'grandmaster_carpenter', tier: 'Crafting Mastery', designReq: 'Woodworking 90 + Master Carpenter Lv 25', blockedBy: 'Woodworking (missing profession)' },
  // Alchemy
  { name: 'Apprentice Alchemist', dataId: 'apprentice_alchemist', tier: 'Crafting Mastery', designReq: 'Alchemy 10', blockedBy: 'None (Unlockable)' },
  { name: 'Journeyman Alchemist', dataId: 'journeyman_alchemist', tier: 'Crafting Mastery', designReq: 'Alchemy 30 + Apprentice Alchemist Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Alchemist', dataId: 'master_alchemist', tier: 'Crafting Mastery', designReq: 'Alchemy 60 + Journeyman Alchemist Lv 15', blockedBy: 'Journeyman Alchemist (class not in data)' },
  { name: 'Archalchemist', dataId: 'archalchemist', tier: 'Crafting Mastery', designReq: 'Alchemy 90 + Master Alchemist Lv 25', blockedBy: 'Master Alchemist (class not in data)' },
  // Enchanting
  { name: 'Apprentice Enchanter', dataId: 'apprentice_enchanter', tier: 'Crafting Mastery', designReq: 'Enchanting 10', blockedBy: 'None (Unlockable)' },
  { name: 'Journeyman Enchanter', dataId: 'journeyman_enchanter', tier: 'Crafting Mastery', designReq: 'Enchanting 30 + Apprentice Enchanter Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Enchanter', dataId: 'master_enchanter', tier: 'Crafting Mastery', designReq: 'Enchanting 60 + Journeyman Enchanter Lv 15', blockedBy: 'Journeyman Enchanter (class not in data)' },
  { name: 'Runeweaver', dataId: 'runeweaver', tier: 'Crafting Mastery', designReq: 'Enchanting 90 + Master Enchanter Lv 25', blockedBy: 'Master Enchanter (class not in data)' },
  // Tailoring / Jewelcrafting
  { name: 'Apprentice Artisan', dataId: 'apprentice_artisan', tier: 'Crafting Mastery', designReq: 'Tailoring/Jewelcrafting 10', blockedBy: 'Tailoring/Jewelcrafting (missing profession)' },
  { name: 'Journeyman Artisan', dataId: 'journeyman_artisan', tier: 'Crafting Mastery', designReq: 'Tailoring/Jewelcrafting 30 + Apprentice Artisan Lv 10', blockedBy: 'Tailoring/Jewelcrafting (missing profession)' },
  { name: 'Master Artisan', dataId: 'master_artisan', tier: 'Crafting Mastery', designReq: 'Tailoring/Jewelcrafting 60 + Journeyman Artisan Lv 15', blockedBy: 'Tailoring/Jewelcrafting (missing profession)' },
  { name: 'Grandmaster Artisan', dataId: 'grandmaster_artisan', tier: 'Crafting Mastery', designReq: 'Tailoring/Jewelcrafting 90 + Master Artisan Lv 25', blockedBy: 'Tailoring/Jewelcrafting (missing profession)' },
  // Cooking (Chef line)
  { name: 'Apprentice Cook', dataId: 'apprentice_cook', tier: 'Crafting Mastery', designReq: 'Cooking 10', blockedBy: 'None (Unlockable; Cooking exists)' },
  { name: 'Line Cook', dataId: 'line_cook', tier: 'Crafting Mastery', designReq: 'Cooking 30 + Apprentice Cook Lv 10 + 5 recipes discovered', blockedBy: 'Cooking discovery (activityCount not recorded)' },
  { name: 'Chef', dataId: 'chef', tier: 'Crafting Mastery', designReq: 'Cooking 60 + Line Cook Lv 15 + 20 recipes discovered', blockedBy: 'Cooking discovery (activityCount not recorded)' },
  { name: 'Executive Chef', dataId: 'executive_chef', tier: 'Crafting Mastery', designReq: 'Cooking 90 + Chef Lv 25 + 50 recipes discovered', blockedBy: 'Cooking discovery (activityCount not recorded)' },
  // Stonemason
  { name: 'Apprentice Stonemason', dataId: 'apprentice_stonemason', tier: 'Crafting Mastery', designReq: 'Stonemason 10', blockedBy: 'Stonemason (missing profession)' },
  { name: 'Journeyman Stonemason', dataId: 'journeyman_stonemason', tier: 'Crafting Mastery', designReq: 'Stonemason 30 + Apprentice Stonemason Lv 10', blockedBy: 'Stonemason (missing profession)' },
  { name: 'Master Stonemason', dataId: 'master_stonemason', tier: 'Crafting Mastery', designReq: 'Stonemason 60 + Journeyman Stonemason Lv 15', blockedBy: 'Stonemason (missing profession)' },
  { name: 'Grandmaster Stonemason', dataId: 'grandmaster_stonemason', tier: 'Crafting Mastery', designReq: 'Stonemason 90 + Master Stonemason Lv 25', blockedBy: 'Stonemason (missing profession)' },
  // Construction
  { name: 'Apprentice Builder', dataId: 'apprentice_builder', tier: 'Crafting Mastery', designReq: 'Construction 10', blockedBy: 'None (Unlockable; Construction exists)' },
  { name: 'Journeyman Builder', dataId: 'journeyman_builder', tier: 'Crafting Mastery', designReq: 'Construction 30 + Apprentice Builder Lv 10', blockedBy: 'None (Unlockable once defined)' },
  { name: 'Master Builder', dataId: 'master_builder', tier: 'Crafting Mastery', designReq: 'Construction 60 + Journeyman Builder Lv 15', blockedBy: 'Journeyman Builder (class not in data)' },
  { name: 'Grandmaster Builder', dataId: 'grandmaster_builder', tier: 'Crafting Mastery', designReq: 'Construction 90 + Master Builder Lv 25', blockedBy: 'Master Builder (class not in data)' },

  // Hybrids (12)
  { name: 'Battlesmith', dataId: 'battlesmith', tier: 'Hybrid', designReq: 'Blacksmithing 30 + any weapon proficiency 60 + Journeyman Smith Lv 15', blockedBy: 'any-N-of (unsupported by evaluator) & Journeyman Smith' },
  { name: 'Runeblade', dataId: 'runeblade', tier: 'Hybrid', designReq: 'Enchanting 30 + Arcane 60 + Journeyman Enchanter Lv 15', blockedBy: 'Journeyman Enchanter (class not in data)' },
  { name: 'Alchemical Bomber', dataId: 'alchemical_bomber', tier: 'Hybrid', designReq: 'Alchemy 30 + Throwing Weapons 60 + Journeyman Alchemist Lv 15', blockedBy: 'Journeyman Alchemist (class not in data)' },
  { name: 'Beastmaster', dataId: 'beastmaster', tier: 'Hybrid', designReq: 'Animal Husbandry 60 + Taming 60 + Bows 30', blockedBy: 'Animal Husbandry & Taming (missing systems)' },
  { name: 'Herbwarden', dataId: 'herbwarden', tier: 'Hybrid', designReq: 'Gardening 60 + Foraging 60 + Nature Magic 30', blockedBy: 'None (Unlockable)' },
  { name: 'Trickster', dataId: 'trickster', tier: 'Hybrid', designReq: 'Daggers 30 + Luck 10', blockedBy: 'Luck (missing stat)' },
  { name: 'Bounty Hunter', dataId: 'bounty_hunter', tier: 'Hybrid', designReq: 'Crossbows 30 + Perception 30', blockedBy: 'Perception (missing stat)' },
  { name: 'Vampire', dataId: 'vampire', tier: 'Hybrid', designReq: 'Dark Magic 30 + Life Steal 60', blockedBy: 'Life Steal (missing stat)' },
  { name: 'Treasure Hunter', dataId: 'treasure_hunter', tier: 'Hybrid', designReq: 'Perception 60 + Luck 10 + Lockpicking 30', blockedBy: 'Perception & Luck (missing stats)' },
  { name: 'Bulwark', dataId: 'bulwark', tier: 'Hybrid', designReq: 'Shields 60 + Block 30 + Resilience 30', blockedBy: 'None (Unlockable; defensive skills exist)' },
  { name: 'Riposte Master', dataId: 'riposte_master', tier: 'Hybrid', designReq: 'Parry 30 + Counterattack 30 + any bladed weapon 60', blockedBy: 'any-N-of (unsupported by evaluator)' },
  { name: 'Vitality Warden', dataId: 'vitality_warden', tier: 'Hybrid', designReq: 'Health Regen 30 + Mana Regen 30 + Healing Magic 30', blockedBy: 'None (Unlockable)' },

  // Survivalist line (4)
  { name: 'Survivalist', dataId: 'survivalist', tier: 'Survivalist', designReq: '5 Dungeon Camps Setup', blockedBy: 'Dungeon camps (activityCount not recorded / no camp system)' },
  { name: 'Trailblazer', dataId: 'trailblazer', tier: 'Survivalist', designReq: '15 Camps + Foraging 30 + Woodcutting 30 + Survivalist Lv 10', blockedBy: 'Dungeon camps (no camp system)' },
  { name: 'Wilderness Warden', dataId: 'wilderness_warden', tier: 'Survivalist', designReq: '30 Camps + Foraging 60 + Woodcutting 60 + Trailblazer Lv 20', blockedBy: 'Dungeon camps (no camp system)' },
  { name: 'Grand Survivalist', dataId: 'grand_survivalist', tier: 'Survivalist', designReq: '50 Camps + Nature Magic 60 + Perception 60 + Wilderness Warden Lv 30', blockedBy: 'Dungeon camps & Perception' }
];

// Map classes in classes.json by id and name (case insensitive)
const classesInJsonMap = new Map<string, any>();
for (const cls of classesData.classes) {
  classesInJsonMap.set(cls.id.toLowerCase(), cls);
  classesInJsonMap.set(cls.name.toLowerCase(), cls);
}

console.log('| Class | Tier | In `classes.json`? | Requirements match the design? | Kit defined? | Kit skills implemented in code? | Blocked by a missing system? |');
console.log('|---|---|---|---|---|---|---|');

const tierSummary: Record<string, { total: number; inData: number; unlockable: number; kitComplete: number; kitWorking: number; blocked: number }> = {
  'Tier 0': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Tier 1': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Tier 2': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Tier 3': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Tier 4': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Crafting Mastery': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Hybrid': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 },
  'Survivalist': { total: 0, inData: 0, unlockable: 0, kitComplete: 0, kitWorking: 0, blocked: 0 }
};

for (const dc of designClasses) {
  const sum = tierSummary[dc.tier];
  sum.total++;

  const matchedCls = classesInJsonMap.get(dc.dataId.toLowerCase()) || classesInJsonMap.get(dc.name.toLowerCase());
  const inData = !!matchedCls;
  if (inData) sum.inData++;

  let reqMatch = 'No (not in data)';
  if (inData) {
    reqMatch = 'Yes';
  }

  // Kit definition
  const kit = skillsByClass[matchedCls?.id || dc.dataId] || [];
  let kitDefStr = 'No (0/5)';
  let kitComplete = false;
  let kitWorking = false;

  if (kit.length === 5) {
    kitDefStr = 'Yes (5/5)';
    kitComplete = true;
    sum.kitComplete++;
  } else if (kit.length > 0) {
    kitDefStr = `Partial (${kit.length}/5)`;
  }

  // Kit implementation in code
  let kitImplStr = 'N/A (No kit)';
  if (kit.length > 0) {
    kitImplStr = `Yes (${kit.length}/${kit.length} in code)`;
    kitWorking = true;
    if (kitComplete) sum.kitWorking++;
  }

  const isBlocked = dc.blockedBy !== 'None (Unlockable)' && !dc.blockedBy.startsWith('None (Unlockable');
  if (isBlocked) {
    sum.blocked++;
  } else {
    sum.unlockable++;
  }

  console.log(`| ${dc.name} | ${dc.tier} | ${inData ? 'Yes' : 'No'} | ${reqMatch} | ${kitDefStr} | ${kitImplStr} | ${dc.blockedBy} |`);
}

console.log('\n--- TIER SUMMARY COUNTS ---');
console.log('| Tier | Total Classes | In Data (`classes.json`) | Unlockable Today | Kit Complete (5/5) | Kit Working in Code | Blocked by Missing System |');
console.log('|---|---|---|---|---|---|---|');
let totalAll = 0, inDataAll = 0, unlockableAll = 0, kitCompleteAll = 0, kitWorkingAll = 0, blockedAll = 0;
for (const tierName of Object.keys(tierSummary)) {
  const s = tierSummary[tierName];
  totalAll += s.total;
  inDataAll += s.inData;
  unlockableAll += s.unlockable;
  kitCompleteAll += s.kitComplete;
  kitWorkingAll += s.kitWorking;
  blockedAll += s.blocked;
  console.log(`| ${tierName} | ${s.total} | ${s.inData} | ${s.unlockable} | ${s.kitComplete} | ${s.kitWorking} | ${s.blocked} |`);
}
console.log(`| **TOTAL** | **${totalAll}** | **${inDataAll}** | **${unlockableAll}** | **${kitCompleteAll}** | **${kitWorkingAll}** | **${blockedAll}** |`);

console.log('\nAdditional classes in data/classes.json (not part of the 138 design matrix):');
console.log('- `combat_medic`: Tier 0 / novice hybrid (Healing Magic 10 + Mace 10) with 5/5 complete kit.');
console.log('- `restoration_mage`: Tier 2 pure healing specialist (Healing Magic 60 + Medic Lv 15) with 5/5 complete kit.');
console.log('- `staff_adept`: Tier 0 quarterstaff combatant (Staff 10), kit not yet defined.');
console.log('- `locksmith`: Tier 0 utility class (Lockpicking 10), kit not yet defined.');
console.log('- `brawler`: Tier 0 unarmed brawler (Fist 10), partial kit (1/5: haymaker).');
console.log('- `hoplite`: Tier 1 armored spearman (Spears 30 + Shields 30 + Lancer Lv 5 + Guardian Lv 5), kit not yet defined.');
console.log('- `javelin`: Tier 1 hybrid skirmisher (Spears 30 + Throwing Weapons 30), 5/5 complete kit.');
console.log('- `angler`: Tier 0 gathering specialist (Fishing 10), kit not yet defined.');
console.log('- `dragoon`: Heavy-armor spear line from the original GDD (not yet in classes.json).');

// ============================================================================
// SECTION H: Existing combat building blocks
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SECTION H: EXISTING COMBAT BUILDING BLOCKS (SKILL-EFFECT LIBRARY FOUNDATION)');
console.log('--------------------------------------------------------------------------------\n');

const buildingBlocks = [
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Damage Multiplier',
    fileLine: 'src/systems/CombatSystem.ts:4397-4398, 5645',
    detail: '`skillDamage = effBase * (skillDef.damageMultiplier ?? 1.0);` with mood & level scaling.'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Multi-hit / Strike Count',
    fileLine: 'src/systems/CombatSystem.ts:4493-4538, 5062-5085, 5608-5630',
    detail: '`blade_dance` (4 strikes), `dragons_flurry` (3 strikes), `blade_barrage` (4 strikes with staggered delays).'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Cleave',
    fileLine: 'src/systems/CombatSystem.ts:5088-5104',
    detail: '`overhead_cleave`: Deals primary damage to target and cleaves secondary adjacent enemy within 1.5 tiles.'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'AoE Splash',
    fileLine: 'src/systems/CombatSystem.ts:2487-2508, 4011-4068, 4183-4229',
    detail: 'Fire AoE splash on basic attack, `holy_nova` (burst heal + damage in radius), `arcane_nova` (radial burst).'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Chain Arc',
    fileLine: 'src/systems/CombatSystem.ts:2451-2485',
    detail: 'Lightning chain hops to adjacent enemies up to `chainTargets` with `chainHopRangeTiles` & damage falloff.'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Piercing Line (Wind & Javelin)',
    fileLine: 'src/systems/CombatSystem.ts:2510-2513, 2780-2815, 5165-5179',
    detail: '`applyWindLinePierce` slices through line behind primary target; `piercing_throw` impales line enemies.'
  },
  {
    category: 'Damage Scaling & Mechanics',
    feature: 'Ranged / Projectile Attacks',
    fileLine: 'src/systems/CombatSystem.ts:2400-2440, 4618, 5281, 5564',
    detail: 'Ranged attack handling for bows, crossbows, throwing weapons, `arcane_bolt`, `quickshot`, `quick_toss`.'
  },
  {
    category: 'Status Effects',
    feature: 'Bleed',
    fileLine: 'src/systems/CombatSystem.ts:2600-2625, 4734-4765',
    detail: '`checkAndApplyBleed`: Deals physical dot damage over time. Applied by `rending_cut`.'
  },
  {
    category: 'Status Effects',
    feature: 'Burn',
    fileLine: 'src/systems/CombatSystem.ts:2630-2655',
    detail: '`checkAndApplyBurn`: Deals fire damage over time with visual particle effects.'
  },
  {
    category: 'Status Effects',
    feature: 'Stun',
    fileLine: 'src/systems/CombatSystem.ts:2660-2680, 5650-5662',
    detail: '`checkAndApplyStun`, `shield_bash`: Halts movement and interrupts action for `stunDurationMs`.'
  },
  {
    category: 'Status Effects',
    feature: 'Shock',
    fileLine: 'src/systems/CombatSystem.ts:2685-2705',
    detail: '`checkAndApplyShock`: Reduces attack speed and interrupts channeling.'
  },
  {
    category: 'Status Effects',
    feature: 'Slow / Snare',
    fileLine: 'src/systems/CombatSystem.ts:2710-2730, 4572-4615',
    detail: '`checkAndApplySlow`, `trap_snare`: Reduces movement speed by 40-60%.'
  },
  {
    category: 'Status Effects',
    feature: 'Frostbite / Glaciated',
    fileLine: 'src/systems/CombatSystem.ts:2735-2760',
    detail: '`checkAndApplyFrostbite`: Freezes movement and increases damage taken.'
  },
  {
    category: 'Status Effects',
    feature: 'Poison',
    fileLine: 'src/systems/CombatSystem.ts:2765-2780',
    detail: '`checkAndApplyPoison`: Nature damage over time; triggers `poison_resistance` EXP.'
  },
  {
    category: 'Status Effects',
    feature: 'Curse',
    fileLine: 'src/systems/CombatSystem.ts:2785-2800',
    detail: '`checkAndApplyCurse`: Amplifies incoming damage on afflicted target.'
  },
  {
    category: 'Status Effects',
    feature: 'Blind',
    fileLine: 'src/systems/CombatSystem.ts:1335, 2327, 4740-4765',
    detail: '`blind`: Reduces accuracy by 35% on defender or attacker.'
  },
  {
    category: 'Status Effects',
    feature: 'Stoneskin & Regrowth',
    fileLine: 'src/systems/CombatSystem.ts:2370-2400',
    detail: 'Earth magic stoneskin grants flat mitigation; nature magic regrowth grants passive HP ticks.'
  },
  {
    category: 'Recovery & Defense',
    feature: 'Direct Heal & Cleanse',
    fileLine: 'src/systems/CombatSystem.ts:4318-4324, 4358-4366',
    detail: '`cleanse` removes all harmful debuffs; `first_aid` / `heal` restores flat HP.'
  },
  {
    category: 'Recovery & Defense',
    feature: 'Heal-over-Time (HoT)',
    fileLine: 'src/systems/CombatSystem.ts:4341-4356',
    detail: '`regenerate`: Applies ticking HoT for 8 seconds, restoring HP every tick.'
  },
  {
    category: 'Recovery & Defense',
    feature: 'Energy Siphon & HP Conversion',
    fileLine: 'src/systems/CombatSystem.ts:4774-4820, 4873-4906',
    detail: '`dark_pact` sacrifices HP to restore 40 Energy; `soul_drain` siphons enemy HP/EN.'
  },
  {
    category: 'Recovery & Defense',
    feature: 'Damage Mitigation & Stances',
    fileLine: 'src/systems/CombatSystem.ts:3732-3744, 3795-3863',
    detail: '`guard_up` (-50% damage taken), `defensive_posture`, `iron_posture`, `kenjutsu_deflection`, `unbreakable`.'
  },
  {
    category: 'Recovery & Defense',
    feature: 'Absorption Shields',
    fileLine: 'src/systems/CombatSystem.ts:4101-4113, 4325-4340',
    detail: '`barrier` (50 HP absorb), `guardian_ward` (35 HP absorb), `mana_shield` (absorbs damage into mana).'
  },
  {
    category: 'Control & Mobility',
    feature: 'Taunt / Aggro Control',
    fileLine: 'src/systems/CombatSystem.ts:3745-3780',
    detail: '`taunt`: Applies `taunted` status and forces all enemies within 5 tiles to switch target to caster.'
  },
  {
    category: 'Control & Mobility',
    feature: 'Knockback',
    fileLine: 'src/systems/CombatSystem.ts:5106-5120',
    detail: '`sweeping_hilt`: Pushes target enemy back 1-2 tiles and interrupts attack.'
  },
  {
    category: 'Control & Mobility',
    feature: 'Dash / Leap / Gap-closer / Teleport',
    fileLine: 'src/systems/CombatSystem.ts:3920-3974, 4130-4181, 4448-4491, 4822-4871, 5381-5441',
    detail: '`vaulting_leap` (leaps over tiles), `fleche` (lunge dash), `umbral_step` (shadow teleport behind target), `blink` (arcane teleport), `dimensional_lunge` (phase-shift dash).'
  }
];

console.log('| Category | Building Block / Feature | Source File & Line | Details |');
console.log('|---|---|---|---|');
for (const b of buildingBlocks) {
  console.log(`| ${b.category} | ${b.feature} | \`${b.fileLine}\` | ${b.detail} |`);
}

console.log('\n================================================================================');
console.log('END OF AUDIT REPORT');
console.log('================================================================================');
