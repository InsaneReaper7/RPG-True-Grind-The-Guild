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

const basePower = 10; // standardized base spell/weapon power

// Basic Fire cast baseline: 10 direct, 35% burn (4s duration = 4 ticks @ 4 dmg = 16 dmg), 22 EN
const basicFireEnergy = 22;
const basicFireDirect = basePower;
const basicFireBurnEV = 0.35 * (4 * burnDamagePerTick);
const basicFireTotalEV = basicFireDirect + basicFireBurnEV; // 15.6
const basicFirePer22 = basicFireTotalEV; // exactly 15.6

interface SkillRow {
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

const targetSkills = [
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

const rows: SkillRow[] = [];

for (const item of targetSkills) {
  const skill = skillsData.skills.find((s: any) => s.id === item.id);
  if (!skill) continue;

  const energyCost = skill.energyCost;
  const role = skill.ai?.role ? `${skill.ai.role}${item.variant === '2_targets' ? ' (2 targets)' : item.variant === '3_targets' ? ' (3 targets)' : ''}` : 'reference';

  // Direct multiplier
  let mult = skill.damageMultiplier ?? 1.0;
  if (skill.effects) {
    const dmgEff = skill.effects.find((e: any) => e.type === 'damage');
    if (dmgEff) mult = dmgEff.multiplier;
  }

  let targets = 1;
  if (item.variant === '2_targets') targets = 2;
  if (item.variant === '3_targets') targets = 3;

  const directDamage = mult * basePower * targets;

  // Status effects (burn)
  let burnChance = 0;
  let burnDurationMs = 0;

  if (skill.effects) {
    const statusEff = skill.effects.find((e: any) => e.type === 'applyStatus' && e.status === 'burn');
    if (statusEff) {
      burnChance = statusEff.chance ?? 1.0;
      burnDurationMs = statusEff.durationMs ?? burnDef.durationMs ?? 4000;
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

  rows.push({
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

console.log('| Skill | Role | Energy Cost | Direct Damage | Burn Proc Chance & Duration | Burn Expected Damage | Total Expected Damage | Damage per 22 EN | vs. Basic Cast |');
console.log('|---|---|---|---|---|---|---|---|---|');

for (const r of rows) {
  const isRef = r.skillId === 'arcane_bolt' || r.skillId === 'blade_strike';
  const nameCol = isRef ? `*${r.name}* (ref)` : `**${r.name}**`;
  console.log(
    `| ${nameCol} | ${r.role} | ${r.energyCost} | ${r.directDamage.toFixed(1)} | ${r.burnInfo} | ${r.burnEV.toFixed(1)} | ${r.totalDamage.toFixed(1)} | ${r.damagePer22.toFixed(1)} | ${r.vsBasic} |`
  );
}
