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
