import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
const statusEffectsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statusEffects.json'), 'utf8'));

const burnDef = statusEffectsData.statusEffects.find((s: any) => s.id === 'burn');
const burnDamagePerTick = burnDef?.damagePerTick ?? 4;
const burnTickIntervalMs = burnDef?.tickIntervalMs ?? 1000;

const bleedDef = statusEffectsData.statusEffects.find((s: any) => s.id === 'bleed');
const bleedDamagePerTick = bleedDef?.damagePerTick ?? 3;
const bleedTickIntervalMs = bleedDef?.tickIntervalMs ?? 1000;

const basePower = 10; // standardized base spell/weapon power

// ---------------------------------------------------------------------------
// SECTION 1: Ember Adept & Spell References Baseline
// ---------------------------------------------------------------------------
const basicFireEnergy = 22;
const basicFireDirect = basePower;
const basicFireBurnEV = 0.35 * (4 * burnDamagePerTick);
const basicFireTotalEV = basicFireDirect + basicFireBurnEV; // 15.6
const basicFirePer22 = basicFireTotalEV; // exactly 15.6

interface SpellRow {
  skillId: string;
  name: string;
  role: string;
  energyCost: number;
  directDamage: number;
  burnInfo: string;
  burnEV: number;
  totalDamage: number;
  damagePer22: number;
  vsBasic: string;
}

const targetSpells = [
  { id: 'scorch', variant: 'single' },
  { id: 'firebolt', variant: 'single' },
  { id: 'flame_wave', variant: 'single' },
  { id: 'flame_wave', variant: '2_targets' },
  { id: 'ignite', variant: 'single' },
  { id: 'firestorm', variant: 'single' },
  { id: 'firestorm', variant: '3_targets' },
  { id: 'arcane_bolt', variant: 'single' },
  { id: 'blade_strike', variant: 'single' }
];

const spellRows: SpellRow[] = [];

for (const item of targetSpells) {
  const skill = skillsData.skills.find((s: any) => s.id === item.id);
  if (!skill) continue;

  const energyCost = skill.energyCost;
  const role = skill.ai?.role ? `${skill.ai.role}${item.variant === '2_targets' ? ' (2 targets)' : item.variant === '3_targets' ? ' (3 targets)' : ''}` : 'reference';

  let mult = skill.damageMultiplier ?? 1.0;
  if (skill.effects) {
    const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
    if (dmgEff) mult = dmgEff.multiplier;
  }

  let targets = 1;
  if (item.variant === '2_targets') targets = 2;
  if (item.variant === '3_targets') targets = 3;

  const directDamage = mult * basePower * targets;

  let burnChance = 0;
  let burnDurationMs = 0;
  if (skill.effects) {
    const statusEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');
    if (statusEff) {
      burnChance = statusEff.chance ?? 1.0;
      burnDurationMs = statusEff.durationMs ?? burnDef?.durationMs ?? 4000;
    }
  }

  let burnInfo = 'None';
  let burnEV = 0;
  if (burnChance > 0) {
    const ticks = burnDurationMs / burnTickIntervalMs;
    const totalBurnDmg = ticks * burnDamagePerTick;
    burnEV = burnChance * totalBurnDmg * targets;
    burnInfo = `${(burnChance * 100).toFixed(0)}% (${burnDurationMs / 1000}s = ${totalBurnDmg} dmg)`;
  }

  const totalDamage = directDamage + burnEV;
  const damagePer22 = (totalDamage / energyCost) * 22;
  const vsBasicPct = ((damagePer22 - basicFirePer22) / basicFirePer22) * 100;
  const vsBasic = `${vsBasicPct >= 0 ? '+' : ''}${vsBasicPct.toFixed(1)}%`;

  let displayName = skill.name;
  if (item.variant === 'single' && (item.id === 'flame_wave' || item.id === 'firestorm')) displayName += ' (1 target)';
  if (item.variant === '2_targets') displayName += ' (2 targets)';
  if (item.variant === '3_targets') displayName += ' (3 targets)';

  spellRows.push({
    skillId: skill.id,
    name: displayName,
    role,
    energyCost,
    directDamage,
    burnInfo,
    burnEV,
    totalDamage,
    damagePer22,
    vsBasic
  });
}

console.log('### Baseline Spell Efficiency (Ember Adept)');
console.log('| Skill | Role | Energy Cost | Direct Damage | Burn Proc Chance & Duration | Burn Expected Damage | Total Expected Damage | Damage per 22 EN | vs. Basic Cast |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of spellRows) {
  const isRef = r.skillId === 'arcane_bolt' || r.skillId === 'blade_strike';
  const nameCol = isRef ? `*${r.name}* (ref)` : `**${r.name}**`;
  console.log(
    `| ${nameCol} | ${r.role} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.burnInfo} | ${r.burnEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${r.damagePer22.toFixed(1)} | ${r.vsBasic} |`
  );
}

// ---------------------------------------------------------------------------
// SECTION 2: Class Program Wave 1: Tier 0 Weapon Classes (10 Kits)
// ---------------------------------------------------------------------------
console.log('\n### Class Program Wave 1: Tier 0 Weapon Classes Efficiency Check');

const referenceSkillIds = ['blade_strike', 'quick_cut', 'primed_shot'];

const wave1SkillIds = [
  // Guardian
  'shield_slam', 'brace', 'challenge', 'bulwark', 'last_stand',
  // Squire
  'measured_cut', 'sunder', 'wide_swing', 'second_wind', 'valiant_strike',
  // Brute
  'heavy_swing', 'cleaving_arc', 'skull_crack', 'reckless_fury', 'earthshaker',
  // Cutthroat
  'quick_stab', 'lacerate', 'shadowstep', 'dirty_trick', 'eviscerate',
  // Marksman
  'aimed_shot', 'hobbling_shot', 'volley', 'steady_aim', 'deadeye',
  // Bludgeoner
  'crushing_blow', 'concuss', 'armor_crack', 'bonebreaker', 'judgment_hammer',
  // Lancer
  'jab', 'charge', 'sweep', 'hold_the_line', 'skewer',
  // Skirmisher
  'hurl', 'barbed_throw', 'hit_and_run', 'scatter_throw', 'opening_volley',
  // Staff Adept
  'staff_strike', 'rap_the_knuckles', 'whirling_staff', 'focused_breath', 'pressure_point',
  // Brawler
  'normal_punch', 'jab_cross', 'haymaker', 'bob_and_weave', 'consecutive_normal_punches'
];

interface Wave1Row {
  skillId: string;
  name: string;
  req: string;
  cd: number;
  energyCost: number;
  directDamage: number;
  dotInfo: string;
  dotEV: number;
  totalDamage: number;
  damagePerEn: number;
  vsBladeStrike: string;
  flag: string;
}

// Reference: Blade Strike
const bladeStrikeSkill = skillsData.skills.find((s: any) => s.id === 'blade_strike')!;
const bladeStrikeMult = bladeStrikeSkill.effects?.find((e: any) => e.type === 'damage')?.multiplier ?? bladeStrikeSkill.damageMultiplier ?? 1.4;
const bladeStrikeTotalDmg = bladeStrikeMult * basePower;
const bladeStrikeDmgPerEn = bladeStrikeTotalDmg / bladeStrikeSkill.energyCost; // 14 / 15 = 0.9333

const wave1Rows: Wave1Row[] = [];

const allIdsToEvaluate = [...referenceSkillIds, ...wave1SkillIds];

for (const id of allIdsToEvaluate) {
  const skill = skillsData.skills.find((s: any) => s.id === id);
  if (!skill) continue;

  const req = skill.requirements?.map((r: any) => `${r.target} ${r.value}`).join(', ') || 'none';
  const cdSec = (skill.cooldownMs ?? 0) / 1000;
  const energyCost = skill.energyCost ?? 0;

  // Direct multiplier
  let mult = 0;
  if (skill.effects) {
    const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
    if (dmgEff) mult = dmgEff.multiplier;
  } else if (skill.damageMultiplier) {
    mult = skill.damageMultiplier;
  }

  const directDamage = mult * basePower;

  // Dot expected value (bleed or burn)
  let dotInfo = 'None';
  let dotEV = 0;

  if (skill.effects) {
    const bleedEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'bleed');
    const burnEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');

    if (bleedEff) {
      const chance = bleedEff.chance ?? 1.0;
      const dur = bleedEff.durationMs ?? bleedDef?.durationMs ?? 6000;
      const ticks = dur / bleedTickIntervalMs;
      const totalBleedDmg = ticks * bleedDamagePerTick;
      dotEV = chance * totalBleedDmg;
      dotInfo = `Bleed ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBleedDmg} dmg)`;
    } else if (burnEff) {
      const chance = burnEff.chance ?? 1.0;
      const dur = burnEff.durationMs ?? burnDef?.durationMs ?? 4000;
      const ticks = dur / burnTickIntervalMs;
      const totalBurnDmg = ticks * burnDamagePerTick;
      dotEV = chance * totalBurnDmg;
      dotInfo = `Burn ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBurnDmg} dmg)`;
    }
  }

  const totalDamage = directDamage + dotEV;
  const damagePerEn = energyCost > 0 ? totalDamage / energyCost : 0;

  let vsBladeStrike = 'N/A';
  if (totalDamage > 0 && energyCost > 0) {
    const diffPct = ((damagePerEn - bladeStrikeDmgPerEn) / bladeStrikeDmgPerEn) * 100;
    vsBladeStrike = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;
  }

  // Flag any filler (CD <= 3 s) more than 25% above blade_strike
  let flag = '-';
  const isFiller = cdSec <= 3 && skill.id !== 'normal_punch';
  if (isFiller && energyCost > 0 && damagePerEn > bladeStrikeDmgPerEn * 1.25) {
    flag = '⚠️ FILLER > +25%';
  }

  wave1Rows.push({
    skillId: skill.id,
    name: skill.name,
    req,
    cd: cdSec,
    energyCost,
    directDamage,
    dotInfo,
    dotEV,
    totalDamage,
    damagePerEn,
    vsBladeStrike,
    flag
  });
}

console.log('| Skill | Requirement | CD (s) | EN | Direct Dmg | DoT Info | DoT EV | Total EV | Dmg / EN | vs. Blade Strike | Flag |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');

for (const r of wave1Rows) {
  const isRef = referenceSkillIds.includes(r.skillId);
  const nameCol = isRef ? `*${r.name}* (ref)` : `**${r.name}**`;
  const dmgEnStr = r.damagePerEn > 0 ? r.damagePerEn.toFixed(3) : '-';
  console.log(
    `| ${nameCol} | ${r.req} | ${r.cd} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.dotInfo} | ${r.dotEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${dmgEnStr} | ${r.vsBladeStrike} | ${r.flag} |`
  );
}

// Summary of flags
const flagged = wave1Rows.filter(r => r.flag.includes('FILLER'));
console.log(`\n**Filler Audit Result:** ${flagged.length} filler skill(s) exceeded +25% above blade_strike.`);
if (flagged.length > 0) {
  for (const f of flagged) {
    console.log(`  - ⚠️ Flagged: ${f.name} (${f.skillId}): ${f.damagePerEn.toFixed(3)} Dmg/EN (${f.vsBladeStrike})`);
  }
}

// ---------------------------------------------------------------------------
// SECTION 3: Class Program Wave 2: Tier 0 Magic Classes (9 Kits)
// ---------------------------------------------------------------------------
console.log('\n### Class Program Wave 2: Tier 0 Magic Classes Efficiency Check');

const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));

const frostbiteDef = statusEffectsData.statusEffects.find((s: any) => s.id === 'frostbite');
const frostbiteDamagePerTick = frostbiteDef?.damagePerTick ?? 3;
const frostbiteTickIntervalMs = frostbiteDef?.tickIntervalMs ?? 1500;

const poisonDef = statusEffectsData.statusEffects.find((s: any) => s.id === 'poison');
const poisonDamagePerTick = poisonDef?.damagePerTick ?? 2;
const poisonTickIntervalMs = poisonDef?.tickIntervalMs ?? 2000;

// School basic cast baselines
// baseDamage, energyCostPerCast, and expected value of its own proc (including DoTs over 6s or default duration)
interface SchoolBaseline {
  schoolId: string;
  name: string;
  baseDamage: number;
  energyCost: number;
  procEV: number;
  procInfo: string;
  totalEV: number;
  dmgPerEn: number;
}

const magicSchools = [
  'fire_magic',
  'healing_magic',
  'holy_magic',
  'dark_magic',
  'lightning_magic',
  'ice_magic',
  'water_magic',
  'nature_magic',
  'wind_magic',
  'earth_magic'
];

const schoolBaselines: Record<string, SchoolBaseline> = {};

for (const mid of magicSchools) {
  const w = weaponsData.weapons.find((item: any) => item.id === mid);
  if (!w) continue;

  const baseDmg = w.baseDamage ?? 0;
  const enCost = w.energyCostPerCast ?? 20;
  let procEV = 0;
  let procInfo = 'None';

  if (w.burnChance) {
    const ticks = (w.burnDurationMs ?? 4000) / burnTickIntervalMs;
    const dotDmg = ticks * burnDamagePerTick;
    procEV = w.burnChance * dotDmg;
    procInfo = `Burn ${(w.burnChance * 100).toFixed(0)}% (${dotDmg} dmg)`;
  } else if (w.poisonChance) {
    // Over 6 s (3 ticks of 2 = 6 dmg)
    const ticks = 6000 / poisonTickIntervalMs;
    const dotDmg = ticks * poisonDamagePerTick;
    procEV = w.poisonChance * dotDmg;
    procInfo = `Poison ${(w.poisonChance * 100).toFixed(0)}% (6s = ${dotDmg} dmg)`;
  } else if (w.bleedChance) {
    const ticks = (w.bleedDurationMs ?? 6000) / bleedTickIntervalMs;
    const dotDmg = ticks * bleedDamagePerTick;
    procEV = w.bleedChance * dotDmg;
    procInfo = `Bleed ${(w.bleedChance * 100).toFixed(0)}% (${dotDmg} dmg)`;
  } else if (w.frostbiteChance) {
    const ticks = (w.frostbiteDurationMs ?? 4500) / frostbiteTickIntervalMs;
    const dotDmg = ticks * frostbiteDamagePerTick;
    procEV = w.frostbiteChance * dotDmg;
    procInfo = `Frostbite ${(w.frostbiteChance * 100).toFixed(0)}% (${dotDmg} dmg)`;
  }

  const totalEV = baseDmg + procEV;
  const dmgPerEn = enCost > 0 ? totalEV / enCost : 0;

  schoolBaselines[mid] = {
    schoolId: mid,
    name: w.name,
    baseDamage: baseDmg,
    energyCost: enCost,
    procEV,
    procInfo,
    totalEV,
    dmgPerEn
  };
}

console.log('\n#### Magic Schools Basic Cast Baselines');
console.log('| School | Base Dmg | EN Cost | Proc Info | Proc EV | Total Cast EV | Dmg / EN |');
console.log('|---|---|---|---|---|---|---|');
for (const [sid, b] of Object.entries(schoolBaselines)) {
  console.log(`| **${b.name}** (\`${sid}\`) | ${b.baseDamage} | ${b.energyCost} | ${b.procInfo} | ${b.procEV.toFixed(1)} | ${b.totalEV.toFixed(1)} | ${b.dmgPerEn.toFixed(3)} |`);
}

const wave2Classes = [
  { classId: 'medic', school: 'healing_magic', skills: ['mend', 'soothing_touch', 'purify', 'protective_ward', 'healing_circle'] },
  { classId: 'acolyte', school: 'holy_magic', skills: ['sacred_spark', 'consecrate', 'prayer_of_mending', 'judgment', 'radiant_burst'] },
  { classId: 'cultist', school: 'dark_magic', skills: ['shadow_bolt', 'hex', 'siphon_life', 'shroud', 'doom'] },
  { classId: 'spark_adept', school: 'lightning_magic', skills: ['zap', 'chain_lightning', 'overload', 'thunderclap', 'storm_call'] },
  { classId: 'frost_initiate', school: 'ice_magic', skills: ['frost_shard', 'ice_lance', 'frost_nova', 'ice_armor', 'glacial_spike'] },
  { classId: 'tide_adept', school: 'water_magic', skills: ['water_jet', 'riptide', 'tidal_wave', 'healing_rain', 'maelstrom'] },
  { classId: 'sprout_keeper', school: 'nature_magic', skills: ['thorn_dart', 'entangle', 'bloom', 'bramble_patch', 'wild_growth'] },
  { classId: 'gale_adept', school: 'wind_magic', skills: ['gust', 'updraft', 'razor_wind', 'crosswind', 'tempest_lance'] },
  { classId: 'stoneheart_initiate', school: 'earth_magic', skills: ['pebble_shot', 'granite_skin', 'tremor', 'earthen_ward', 'landslide'] }
];

interface Wave2Row {
  classId: string;
  skillId: string;
  name: string;
  req: string;
  cd: number;
  energyCost: number;
  directDamage: number;
  dotInfo: string;
  dotEV: number;
  totalDamage: number;
  damagePerEn: number;
  vsBasic: string;
  flag: string;
}

const wave2Rows: Wave2Row[] = [];

for (const kit of wave2Classes) {
  const baseline = schoolBaselines[kit.school];

  for (const sid of kit.skills) {
    const skill = skillsData.skills.find((s: any) => s.id === sid);
    if (!skill) continue;

    const req = skill.requirements?.map((r: any) => `${r.target} ${r.value}`).join(', ') || 'none';
    const cdSec = (skill.cooldownMs ?? 0) / 1000;
    const energyCost = skill.energyCost ?? 0;

    let mult = 0;
    if (skill.effects) {
      const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
      if (dmgEff) mult = dmgEff.multiplier;
    }

    // Direct damage evaluated against school's real baseDamage
    const directDamage = mult * (baseline?.baseDamage ?? basePower);

    let dotInfo = 'None';
    let dotEV = 0;

    if (skill.effects) {
      const bleedEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'bleed');
      const burnEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');
      const frostbiteEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'frostbite');
      const poisonEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'poison');

      if (bleedEff) {
        const chance = bleedEff.chance ?? 1.0;
        const dur = bleedEff.durationMs ?? 6000;
        const ticks = dur / bleedTickIntervalMs;
        const totalBleedDmg = ticks * bleedDamagePerTick;
        dotEV = chance * totalBleedDmg;
        dotInfo = `Bleed ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBleedDmg} dmg)`;
      } else if (burnEff) {
        const chance = burnEff.chance ?? 1.0;
        const dur = burnEff.durationMs ?? 4000;
        const ticks = dur / burnTickIntervalMs;
        const totalBurnDmg = ticks * burnDamagePerTick;
        dotEV = chance * totalBurnDmg;
        dotInfo = `Burn ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBurnDmg} dmg)`;
      } else if (frostbiteEff) {
        const chance = frostbiteEff.chance ?? 1.0;
        const dur = frostbiteEff.durationMs ?? 4500;
        const ticks = dur / frostbiteTickIntervalMs;
        const totalFbDmg = ticks * frostbiteDamagePerTick;
        dotEV = chance * totalFbDmg;
        dotInfo = `Frostbite ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalFbDmg} dmg)`;
      } else if (poisonEff) {
        const chance = poisonEff.chance ?? 1.0;
        const dur = poisonEff.durationMs ?? 6000;
        const ticks = dur / poisonTickIntervalMs;
        const totalPoisonDmg = ticks * poisonDamagePerTick;
        dotEV = chance * totalPoisonDmg;
        dotInfo = `Poison ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalPoisonDmg} dmg)`;
      }
    }

    const totalDamage = directDamage + dotEV;
    const damagePerEn = energyCost > 0 ? totalDamage / energyCost : 0;

    let vsBasic = 'N/A';
    let flag = '-';

    // Baseline comparison for damaging skills
    if (baseline && baseline.totalEV > 0 && energyCost > 0 && totalDamage > 0) {
      const basicDmgPerEn = baseline.dmgPerEn;
      const diffPct = ((damagePerEn - basicDmgPerEn) / basicDmgPerEn) * 100;
      vsBasic = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;

      const isFiller = cdSec <= 3;
      if (isFiller && damagePerEn > basicDmgPerEn * 1.25) {
        flag = '⚠️ FILLER > +25%';
      }
    }

    wave2Rows.push({
      classId: kit.classId,
      skillId: skill.id,
      name: skill.name,
      req,
      cd: cdSec,
      energyCost,
      directDamage,
      dotInfo,
      dotEV,
      totalDamage,
      damagePerEn,
      vsBasic,
      flag
    });
  }
}

console.log('\n#### Wave 2 Magic Skills Efficiency (vs. School Basic Cast)');
console.log('| Class | Skill | Requirement | CD (s) | EN | Direct Dmg | DoT Info | DoT EV | Total EV | Dmg / EN | vs. Basic Cast | Flag |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

for (const r of wave2Rows) {
  const dmgEnStr = r.damagePerEn > 0 ? r.damagePerEn.toFixed(3) : '-';
  console.log(
    `| ${r.classId} | **${r.name}** (\`${r.skillId}\`) | ${r.req} | ${r.cd} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.dotInfo} | ${r.dotEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${dmgEnStr} | ${r.vsBasic} | ${r.flag} |`
  );
}

// Summary of Wave 2 flags
const flaggedWave2 = wave2Rows.filter(r => r.flag.includes('FILLER'));
console.log(`\n**Wave 2 Filler Audit Result:** ${flaggedWave2.length} filler skill(s) exceeded +25% above its school's basic cast.`);
if (flaggedWave2.length > 0) {
  for (const f of flaggedWave2) {
    console.log(`  - ⚠️ Flagged: ${f.name} (${f.skillId}): ${f.damagePerEn.toFixed(3)} Dmg/EN (${f.vsBasic})`);
  }
}

// ---------------------------------------------------------------------------
// SECTION 4: Heal Efficiency (HP per EN)
// ---------------------------------------------------------------------------
console.log('\n### Heal Efficiency Comparison (HP per EN)');
console.log('| Skill | Type | HP Restored | Energy Cost | HP / EN | Reference Comparison |');
console.log('|---|---|---|---|---|---|');

interface HealEntry {
  id: string;
  name: string;
  type: string;
  hp: number;
  en: number;
}

const healSkillsToAudit: HealEntry[] = [
  // Benchmarks
  { id: 'first_aid', name: 'First Aid', type: 'Single Ally (Ref)', hp: 20, en: 25 },
  { id: 'heal', name: 'Heal', type: 'Single Ally (Ref)', hp: 35, en: 22 },
  // Wave 2 Heals & HoTs
  { id: 'mend', name: 'Mend', type: 'Single Ally (Medic Lv 1)', hp: 18, en: 18 },
  { id: 'soothing_touch', name: 'Soothing Touch', type: 'HoT 4/s × 6s (Medic Lv 10)', hp: 24, en: 18 },
  { id: 'healing_circle', name: 'Healing Circle', type: 'Party 15 (Medic Lv 40, 3 allies)', hp: 45, en: 35 },
  { id: 'sacred_spark', name: 'Sacred Spark', type: 'Heal Ally component (Acolyte Lv 1)', hp: 3, en: 20 },
  { id: 'prayer_of_mending', name: 'Prayer of Mending', type: 'Single Ally (Acolyte Lv 20)', hp: 15, en: 20 },
  { id: 'radiant_burst', name: 'Radiant Burst', type: 'Party 10 (Acolyte Lv 40, 3 allies)', hp: 30, en: 40 },
  { id: 'water_jet', name: 'Water Jet', type: 'Heal Ally component (Tide Adept Lv 1)', hp: 3, en: 20 },
  { id: 'healing_rain', name: 'Healing Rain', type: 'HoT 3/s × 6s (Tide Adept Lv 30)', hp: 18, en: 20 },
  { id: 'bloom', name: 'Bloom', type: 'HoT 3/s × 6s (Sprout Keeper Lv 20)', hp: 18, en: 18 },
  { id: 'wild_growth', name: 'Wild Growth', type: 'Party 12 (Sprout Keeper Lv 40, 3 allies)', hp: 36, en: 36 }
];

for (const h of healSkillsToAudit) {
  const hpPerEn = h.hp / h.en;
  let refComp = '';
  if (h.id === 'first_aid') {
    refComp = 'Baseline (0.800 HP/EN)';
  } else if (h.id === 'heal') {
    refComp = 'Baseline (1.591 HP/EN)';
  } else {
    const vsFirstAid = ((hpPerEn - (20 / 25)) / (20 / 25) * 100);
    const vsHeal = ((hpPerEn - (35 / 22)) / (35 / 22) * 100);
    refComp = `${vsFirstAid >= 0 ? '+' : ''}${vsFirstAid.toFixed(1)}% vs first_aid | ${vsHeal >= 0 ? '+' : ''}${vsHeal.toFixed(1)}% vs heal`;
  }
  console.log(`| **${h.name}** (\`${h.id}\`) | ${h.type} | ${h.hp} | ${h.en} | ${hpPerEn.toFixed(3)} | ${refComp} |`);
}

// ---------------------------------------------------------------------------
// SECTION 5: Class Program Tier 1 Wave A: Weapon Classes (7 Kits)
// ---------------------------------------------------------------------------
console.log('\n### Class Program Tier 1 Wave A: Weapon Classes Efficiency Check');

const t1WaveAClasses = [
  {
    classId: 'hoplite',
    primaryWeapon: 'spears',
    skills: ['phalanx_thrust', 'shield_wall', 'spear_wall', 'rallying_cry', 'impaling_charge']
  },
  {
    classId: 'duelist',
    primaryWeapon: 'short_swords',
    skills: ['flurry_cut', 'sidestep', 'disarming_strike', 'exploit_opening', 'thousand_cuts']
  },
  {
    classId: 'ranger',
    primaryWeapon: 'bows',
    skills: ['swift_shot', 'hunters_mark', 'multishot', 'tumble', 'barbed_arrow']
  },
  {
    classId: 'reaver',
    primaryWeapon: 'greatswords',
    skills: ['rending_swing', 'bloodlust', 'whirlwind', 'savage_cleave', 'executioner']
  },
  {
    classId: 'shadow_initiate',
    primaryWeapon: 'daggers',
    skills: ['shade_stab', 'veil', 'shadow_strike', 'cursed_blade', 'assassinate']
  },
  {
    classId: 'sharpshooter',
    primaryWeapon: 'crossbows',
    skills: ['piercing_bolt', 'steady_breath', 'crippling_bolt', 'armor_piercer', 'headshot']
  },
  {
    classId: 'battle_medic',
    primaryWeapon: 'mace',
    skills: ['mending_strike', 'field_dressing', 'concussive_blow', 'battle_triage', 'rallying_hammer']
  }
];

interface T1WaveARow {
  classId: string;
  skillId: string;
  name: string;
  req: string;
  cd: number;
  energyCost: number;
  directDamage: number;
  dotInfo: string;
  dotEV: number;
  totalDamage: number;
  damagePerEn: number;
  vsBladeStrike: string;
  flag: string;
}

const t1WaveARows: T1WaveARow[] = [];

for (const kit of t1WaveAClasses) {
  const primaryWp = weaponsData.weapons.find((w: any) => w.id === kit.primaryWeapon);
  const weaponBaseDmg = primaryWp?.baseDamage ?? basePower;

  for (const sid of kit.skills) {
    const skill = skillsData.skills.find((s: any) => s.id === sid);
    if (!skill) continue;

    const req = skill.requirements?.map((r: any) => `${r.target} ${r.value}`).join(', ') || 'none';
    const cdSec = (skill.cooldownMs ?? 0) / 1000;
    const energyCost = skill.energyCost ?? 0;

    let mult = 0;
    if (skill.effects) {
      const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
      if (dmgEff) mult = dmgEff.multiplier;
    } else if (skill.damageMultiplier) {
      mult = skill.damageMultiplier;
    }

    const directDamage = mult * weaponBaseDmg;

    let dotInfo = 'None';
    let dotEV = 0;

    if (skill.effects) {
      const bleedEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'bleed');
      const burnEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');

      if (bleedEff) {
        const chance = bleedEff.chance ?? 1.0;
        const dur = bleedEff.durationMs ?? bleedDef?.durationMs ?? 6000;
        const ticks = dur / bleedTickIntervalMs;
        const totalBleedDmg = ticks * bleedDamagePerTick;
        dotEV = chance * totalBleedDmg;
        dotInfo = `Bleed ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBleedDmg} dmg)`;
      } else if (burnEff) {
        const chance = burnEff.chance ?? 1.0;
        const dur = burnEff.durationMs ?? burnDef?.durationMs ?? 4000;
        const ticks = dur / burnTickIntervalMs;
        const totalBurnDmg = ticks * burnDamagePerTick;
        dotEV = chance * totalBurnDmg;
        dotInfo = `Burn ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBurnDmg} dmg)`;
      }
    }

    const totalDamage = directDamage + dotEV;
    const damagePerEn = energyCost > 0 ? totalDamage / energyCost : 0;

    let vsBladeStrike = 'N/A';
    if (totalDamage > 0 && energyCost > 0) {
      const diffPct = ((damagePerEn - bladeStrikeDmgPerEn) / bladeStrikeDmgPerEn) * 100;
      vsBladeStrike = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;
    }

    let flag = '-';
    const isFiller = cdSec <= 3;
    if (isFiller && energyCost > 0 && damagePerEn > bladeStrikeDmgPerEn * 1.25) {
      flag = '⚠️ FILLER > +25%';
    }

    t1WaveARows.push({
      classId: kit.classId,
      skillId: skill.id,
      name: skill.name,
      req,
      cd: cdSec,
      energyCost,
      directDamage,
      dotInfo,
      dotEV,
      totalDamage,
      damagePerEn,
      vsBladeStrike,
      flag
    });
  }
}

console.log('| Class | Skill | Requirement | CD (s) | EN | Direct Dmg | DoT Info | DoT EV | Total EV | Dmg / EN | vs. Blade Strike | Flag |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

for (const r of t1WaveARows) {
  const dmgEnStr = r.damagePerEn > 0 ? r.damagePerEn.toFixed(3) : '-';
  console.log(
    `| ${r.classId} | **${r.name}** (\`${r.skillId}\`) | ${r.req} | ${r.cd} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.dotInfo} | ${r.dotEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${dmgEnStr} | ${r.vsBladeStrike} | ${r.flag} |`
  );
}

const flaggedT1 = t1WaveARows.filter(r => r.flag.includes('FILLER'));
console.log(`\n**Tier 1 Wave A Filler Audit Result:** ${flaggedT1.length} filler skill(s) exceeded +25% above blade_strike.`);
if (flaggedT1.length > 0) {
  for (const f of flaggedT1) {
    console.log(`  - ⚠️ Flagged: ${f.name} (${f.skillId}): ${f.damagePerEn.toFixed(3)} Dmg/EN (${f.vsBladeStrike})`);
  }
}

// ---------------------------------------------------------------------------
// SECTION 6: Class Program Tier 1 Wave B: Magic Classes (7 Kits)
// ---------------------------------------------------------------------------
console.log('\n### Class Program Tier 1 Wave B: Magic Classes Efficiency Check');

const t1WaveBClasses = [
  { classId: 'flamecaller', school: 'fire_magic', skills: ['fireball', 'combust', 'heat_wave', 'kindle', 'inferno'] },
  { classId: 'frostcaller', school: 'water_magic', skills: ['frost_tide', 'undertow', 'tidal_surge', 'renewing_mist', 'deluge'] },
  { classId: 'stormtouched', school: 'lightning_magic', skills: ['arc_bolt', 'static_charge', 'forked_lightning', 'thunder_strike', 'tempest'] },
  { classId: 'windwalker', school: 'wind_magic', skills: ['cutting_gale', 'slipstream', 'vacuum_blade', 'squall', 'hurricane'] },
  { classId: 'naturalist', school: 'nature_magic', skills: ['venom_thorn', 'rejuvenate', 'strangling_vines', 'toxic_bloom', 'natures_wrath'] },
  { classId: 'priest', school: 'holy_magic', skills: ['holy_light', 'chastise', 'sanctuary', 'divine_grace', 'holy_fire'] },
  { classId: 'warlock', school: 'dark_magic', skills: ['eldritch_bolt', 'drain_life', 'agony', 'shadow_ward', 'soul_rend'] }
];

interface T1WaveBRow {
  classId: string;
  skillId: string;
  name: string;
  req: string;
  cd: number;
  energyCost: number;
  directDamage: number;
  dotInfo: string;
  dotEV: number;
  totalDamage: number;
  damagePerEn: number;
  vsBasic: string;
  flag: string;
}

const t1WaveBRows: T1WaveBRow[] = [];

for (const kit of t1WaveBClasses) {
  const baseline = schoolBaselines[kit.school];

  for (const sid of kit.skills) {
    const skill = skillsData.skills.find((s: any) => s.id === sid);
    if (!skill) continue;

    const req = skill.requirements?.map((r: any) => `${r.target} ${r.value}`).join(', ') || 'none';
    const cdSec = (skill.cooldownMs ?? 0) / 1000;
    const energyCost = skill.energyCost ?? 0;

    let mult = 0;
    if (skill.effects) {
      const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
      if (dmgEff) mult = dmgEff.multiplier;
    }

    const directDamage = mult * (baseline?.baseDamage ?? basePower);

    let dotInfo = 'None';
    let dotEV = 0;

    if (skill.effects) {
      const bleedEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'bleed');
      const burnEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');
      const poisonEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'poison');

      if (bleedEff) {
        const chance = bleedEff.chance ?? 1.0;
        const dur = bleedEff.durationMs ?? 6000;
        const ticks = dur / bleedTickIntervalMs;
        const totalBleedDmg = ticks * bleedDamagePerTick;
        dotEV = chance * totalBleedDmg;
        dotInfo = `Bleed ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBleedDmg} dmg)`;
      } else if (burnEff) {
        const chance = burnEff.chance ?? 1.0;
        const dur = burnEff.durationMs ?? 4000;
        const ticks = dur / burnTickIntervalMs;
        const totalBurnDmg = ticks * burnDamagePerTick;
        dotEV = chance * totalBurnDmg;
        dotInfo = `Burn ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalBurnDmg} dmg)`;
      } else if (poisonEff) {
        const chance = poisonEff.chance ?? 1.0;
        const dur = poisonEff.durationMs ?? 6000;
        const ticks = dur / poisonTickIntervalMs;
        const totalPoisonDmg = ticks * poisonDamagePerTick;
        dotEV = chance * totalPoisonDmg;
        dotInfo = `Poison ${(chance * 100).toFixed(0)}% (${dur / 1000}s = ${totalPoisonDmg} dmg)`;
      }
    }

    const totalDamage = directDamage + dotEV;
    const damagePerEn = energyCost > 0 ? totalDamage / energyCost : 0;

    let vsBasic = 'N/A';
    let flag = '-';

    if (baseline && baseline.totalEV > 0 && energyCost > 0 && totalDamage > 0) {
      const basicDmgPerEn = baseline.dmgPerEn;
      const diffPct = ((damagePerEn - basicDmgPerEn) / basicDmgPerEn) * 100;
      vsBasic = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;

      const isFiller = cdSec <= 3;
      if (isFiller && damagePerEn > basicDmgPerEn * 1.25) {
        flag = '⚠️ FILLER > +25%';
      }
    }

    t1WaveBRows.push({
      classId: kit.classId,
      skillId: skill.id,
      name: skill.name,
      req,
      cd: cdSec,
      energyCost,
      directDamage,
      dotInfo,
      dotEV,
      totalDamage,
      damagePerEn,
      vsBasic,
      flag
    });
  }
}

console.log('| Class | Skill | Requirement | CD (s) | EN | Direct Dmg | DoT Info | DoT EV | Total EV | Dmg / EN | vs. Basic Cast | Flag |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

for (const r of t1WaveBRows) {
  const dmgEnStr = r.damagePerEn > 0 ? r.damagePerEn.toFixed(3) : '-';
  console.log(
    `| ${r.classId} | **${r.name}** (\`${r.skillId}\`) | ${r.req} | ${r.cd} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.dotInfo} | ${r.dotEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${dmgEnStr} | ${r.vsBasic} | ${r.flag} |`
  );
}

const flaggedT1B = t1WaveBRows.filter(r => r.flag.includes('FILLER'));
console.log(`\n**Tier 1 Wave B Filler Audit Result:** ${flaggedT1B.length} filler skill(s) exceeded +25% above its school's basic cast.`);
if (flaggedT1B.length > 0) {
  for (const f of flaggedT1B) {
    console.log(`  - ⚠️ Flagged: ${f.name} (${f.skillId}): ${f.damagePerEn.toFixed(3)} Dmg/EN (${f.vsBasic})`);
  }
}

// Also audit Wave B heals
const t1WaveBHeals: HealEntry[] = [
  { id: 'frost_tide', name: 'Frost Tide', type: 'Heal Ally component (Frostcaller Lv 1)', hp: 4, en: 20 },
  { id: 'renewing_mist', name: 'Renewing Mist', type: 'HoT 5/s × 6s (Frostcaller Lv 30)', hp: 30, en: 22 },
  { id: 'deluge', name: 'Deluge', type: 'Party 12 (Frostcaller Lv 40, 3 allies)', hp: 36, en: 44 },
  { id: 'rejuvenate', name: 'Rejuvenate', type: 'HoT 5/s × 6s (Naturalist Lv 10)', hp: 30, en: 20 },
  { id: 'natures_wrath', name: 'Nature\'s Wrath', type: 'Party 10 (Naturalist Lv 40, 3 allies)', hp: 30, en: 40 },
  { id: 'holy_light', name: 'Holy Light', type: 'Single Ally (Priest Lv 1)', hp: 22, en: 20 },
  { id: 'divine_grace', name: 'Divine Grace', type: 'Party 18 (Priest Lv 30, 3 allies)', hp: 54, en: 36 },
  { id: 'drain_life', name: 'Drain Life', type: 'Self 12% max HP (Warlock Lv 10, ~12 HP)', hp: 12, en: 24 },
  { id: 'soul_rend', name: 'Soul Rend', type: 'Self 10% max HP (Warlock Lv 40, ~10 HP)', hp: 10, en: 42 }
];

console.log('\n### Tier 1 Wave B Heal Efficiency Comparison (HP per EN)');
console.log('| Skill | Type | HP Restored | Energy Cost | HP / EN | Reference Comparison |');
console.log('|---|---|---|---|---|---|');

for (const h of t1WaveBHeals) {
  const hpPerEn = h.hp / h.en;
  const vsFirstAid = ((hpPerEn - (20 / 25)) / (20 / 25) * 100);
  const vsHeal = ((hpPerEn - (35 / 22)) / (35 / 22) * 100);
  const refComp = `${vsFirstAid >= 0 ? '+' : ''}${vsFirstAid.toFixed(1)}% vs first_aid | ${vsHeal >= 0 ? '+' : ''}${vsHeal.toFixed(1)}% vs heal`;
  console.log(`| **${h.name}** (\`${h.id}\`) | ${h.type} | ${h.hp} | ${h.en} | ${hpPerEn.toFixed(3)} | ${refComp} |`);
}



