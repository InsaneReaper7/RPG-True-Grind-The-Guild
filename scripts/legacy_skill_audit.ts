import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const combatSystemCode = fs.readFileSync(path.join(rootDir, 'src/systems/CombatSystem.ts'), 'utf8');
const combatLines = combatSystemCode.split('\n');

const legacyKits: Record<string, string[]> = {
  'Fencer': ['riposte', 'fleche', 'blade_dance'],
  'Combat Medic': ['first_aid', 'smite', 'cleanse', 'guardian_ward', 'holy_nova'],
  'Vanguard': ['shield_bash', 'guard_up', 'taunt', 'retaliate', 'unbreakable'],
  'Restoration Mage': ['heal', 'regenerate', 'barrier', 'blessed_weapons', 'mass_revive'],
  'Brawler': ['normal_punch'],
  'Scout': ['quickshot', 'mark_target', 'evasive_roll', 'trap_snare', 'kill_shot'],
  'Dark Knight': ['rending_cut', 'dark_pact', 'umbral_step', 'soul_drain', 'oblivion_strike'],
  'Swordsman': ['blade_strike', 'quick_cut', 'defensive_posture', 'severing_slice', 'cross_cut'],
  'Ronin': ['iaido_quickdraw', 'crimson_slash', 'flowing_step', 'bloodseeker_riposte', 'dragons_flurry'],
  'Samurai': ['overhead_cleave', 'iron_posture', 'sweeping_hilt', 'kenjutsu_deflection', 'heavenly_decapitation'],
  'Javelin': ['piercing_throw', 'impaling_thrust', 'vaulting_leap', 'pinning_spear', 'heartseeker_hurl'],
  'Loader': ['primed_shot', 'rapid_crank', 'arbalest_brace', 'pinning_bolt', 'kinetic_overdraw'],
  'Arcane Initiate': ['arcane_bolt', 'mana_shield', 'overcharge', 'blink', 'arcane_nova'],
  'Spellsword': ['arcane_strike', 'runic_infusion', 'spell_ward', 'dimensional_lunge', 'blade_beam'],
  'Thrower': ['quick_toss', 'skirmish_step', 'fan_of_knives', 'crippling_volley', 'blade_barrage']
};

interface SkillAuditRow {
  kit: string;
  skillId: string;
  branches: string;
  whatItDoes: string;
  expressible: 'YES' | 'NEW-FIELD' | 'NEW-MECHANIC';
  newDetail?: string;
  sideEffects: string;
}

const auditMetadata: Record<string, {
  whatItDoes: string;
  expressible: 'YES' | 'NEW-FIELD' | 'NEW-MECHANIC';
  newDetail?: string;
  sideEffects: string;
}> = {
  // Fencer
  riposte: {
    whatItDoes: 'Reactive counter-strike usable within 3s riposte window; deals 180% weapon damage, can crit',
    expressible: 'NEW-MECHANIC',
    newDetail: 'needs reactive counterattack execution primitive (requires window, executes counterattack with crit)',
    sideEffects: 'Removes riposte_window status; executePlayerCounterattack visual & damage; weapon procs'
  },
  fleche: {
    whatItDoes: 'Gap-closer dash within 5 tiles; deals 160% weapon damage and applies Bleed',
    expressible: 'YES',
    sideEffects: 'Repositions caster to open adjacent tile; blue dash line attack visual; weapon procs'
  },
  blade_dance: {
    whatItDoes: '4-strike melee combo dealing 4x 80% (320% total) weapon damage; checks Bleed per strike',
    expressible: 'YES',
    sideEffects: 'Multi-hit loop with staggered floating numbers; checks Bleed on each hit; weapon procs'
  },

  // Combat Medic
  first_aid: {
    whatItDoes: 'Direct ally or self heal for 20 HP within range',
    expressible: 'YES',
    sideEffects: 'Runs through ally heal fallback branch (L3923); green heal visual; +2 healing_magic EXP'
  },
  smite: {
    whatItDoes: 'Ranged holy spell strike within 5 tiles dealing 180% damage (min 8)',
    expressible: 'YES',
    sideEffects: 'createHolySmiteEffect visual; +5 holy damage if blessed_weapons active; +2 healing_magic EXP'
  },
  cleanse: {
    whatItDoes: 'Target ally or self cleanse, removing all harmful status effects (Bleed, Burn, Shock, etc.)',
    expressible: 'YES',
    sideEffects: 'targetAlly.removeHarmfulStatusEffects(); cleanse visual effect; +2 healing_magic EXP'
  },
  guardian_ward: {
    whatItDoes: 'Target ally or self shield absorbing 35 damage for 8s',
    expressible: 'YES',
    sideEffects: 'Cleanse visual on target; applies guardian_ward status effect; +2 healing_magic EXP'
  },
  holy_nova: {
    whatItDoes: 'PBAoE 4-tile holy explosion: heals living allies in LoS for 30 HP, damages enemies in LoS for 200% (min 12)',
    expressible: 'YES',
    sideEffects: 'Dual heal/damage loop; createHolyNovaEffect; +5 damage if blessed_weapons; +3 healing_magic EXP'
  },

  // Vanguard
  shield_bash: {
    whatItDoes: 'Melee shield strike dealing 120% weapon damage and stunning target for 2s',
    expressible: 'YES',
    sideEffects: 'Runs via fallback weapon attack (L5250, L5260); stops enemy movement; +1 shields EXP on-hit'
  },
  guard_up: {
    whatItDoes: 'Self buff granting 50% damage reduction for 5s',
    expressible: 'NEW-FIELD',
    newDetail: 'buff damageReductionPercent on self (needs damageReductionPercent handled for incoming damage)',
    sideEffects: 'Applies guard_up status; floating text; intercepted in CombatSystem damage resolution (L792)'
  },
  taunt: {
    whatItDoes: 'Forces all living enemies within 5 tiles with LoS to target caster for 6s',
    expressible: 'YES',
    sideEffects: 'Iterates enemies, sets tauntSource, targetEntity, isAggroed=true, state=chasing'
  },
  retaliate: {
    whatItDoes: 'Prepares stance for 15s; the next incoming attack triggers a guaranteed free counterattack',
    expressible: 'NEW-MECHANIC',
    newDetail: 'reactive on-hit counterattack trigger status',
    sideEffects: 'Applies retaliate status; consumed on taking hit (L733, L834) to trigger counterattack'
  },
  unbreakable: {
    whatItDoes: 'Hardens defenses granting complete damage immunity for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'damageImmunity: true status primitive',
    sideEffects: 'Applies unbreakable status; overrides damage to 0 in CombatSystem (L784)'
  },

  // Restoration Mage
  heal: {
    whatItDoes: 'Direct ally or self heal for 35 HP within 5 tiles',
    expressible: 'YES',
    sideEffects: 'Runs through ally heal fallback branch (L3923); createHealEffect; +2 healing_magic EXP'
  },
  regenerate: {
    whatItDoes: 'Applies HoT to damaged ally or self, restoring 6 HP/s for 8s (48 HP total)',
    expressible: 'YES',
    sideEffects: 'Applies regenerate status; createHealEffect; +2 healing_magic EXP'
  },
  barrier: {
    whatItDoes: 'Places magical barrier on ally or self, absorbing up to 50 incoming damage for 10s',
    expressible: 'YES',
    sideEffects: 'Applies barrier status; cleanse visual effect; +2 healing_magic EXP'
  },
  blessed_weapons: {
    whatItDoes: 'Party-wide weapon infusion for 60s, granting all living allies +5 Holy bonus damage on attacks',
    expressible: 'NEW-FIELD',
    newDetail: 'holyBonusDamage status primitive or buff flat damage',
    sideEffects: 'Iterates all party members, applies blessed_weapons status; adds +5 damage in combat & smite'
  },
  mass_revive: {
    whatItDoes: 'Resurrects all downed party members within a 6-tile radius at once',
    expressible: 'NEW-MECHANIC',
    newDetail: 'revive effect type in SkillEffect ({ type: "revive", target: "radius", radiusTiles: 6 })',
    sideEffects: 'Iterates downed allies, calls ally.revive(caster); createHolyNovaEffect; +4 healing_magic EXP'
  },

  // Brawler
  normal_punch: {
    whatItDoes: 'Basic punch dealing 250% weapon damage',
    expressible: 'YES',
    sideEffects: 'Runs via executeWeaponSkillAttack fallback; has custom floating text name branch at L1744'
  },

  // Scout
  quickshot: {
    whatItDoes: 'Fast ranged shot dealing 140% weapon damage plus hybrid bonus (+0.15 * daggers/bows level)',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling: { partnerProf: "daggers"|"bows", scaling: 0.15 }',
    sideEffects: 'Custom hybrid scaling computation; checks Bleed; weapon procs'
  },
  mark_target: {
    whatItDoes: 'Ranged mark applying Expose (+25% damage taken) to target for 6s',
    expressible: 'YES',
    sideEffects: 'Applies expose status; createSkillAttackEffect visual'
  },
  evasive_roll: {
    whatItDoes: 'Self buff granting +50% Evasion for 2s and repositions 2 tiles away from closest enemy',
    expressible: 'NEW-FIELD',
    newDetail: 'move retreat/backstep behavior combined with buff',
    sideEffects: 'Calculates opposite direction vector and repositions caster; applies evasive_roll status'
  },
  trap_snare: {
    whatItDoes: 'Ground snare dealing 120% weapon damage and slowing target by 50% for 4s',
    expressible: 'YES',
    sideEffects: 'Applies slow status; deals single-target weapon damage'
  },
  kill_shot: {
    whatItDoes: 'Ranged execute: 200% weapon damage, doubled to 400% against targets <= 40% HP (+ hybrid bonus)',
    expressible: 'NEW-FIELD',
    newDetail: 'execute / lowHealthBonus on weapon scaling + hybridPartnerScaling',
    sideEffects: 'Checks HP ratio; applies EXECUTE floating text; checks Bleed; weapon procs'
  },

  // Dark Knight
  rending_cut: {
    whatItDoes: 'Infuses dark power into blade dealing 150% weapon damage + hybrid bonus, applying Bleed for 6s',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field (+0.15 * dark_magic/longswords)',
    sideEffects: 'Applies bleed status; custom hybrid calculation; weapon procs'
  },
  dark_pact: {
    whatItDoes: 'Sacrifices 10 HP to unleash 240% weapon damage + hybrid bonus',
    expressible: 'NEW-FIELD',
    newDetail: 'hpCost on SkillEffectDamage or hybridPartnerScaling',
    sideEffects: 'Deducts 10 HP across two-bar HP model (Main HP then Critical HP); red HP float text'
  },
  umbral_step: {
    whatItDoes: 'Gap-closer dash within 5 tiles; deals 140% weapon damage + hybrid bonus and applies Blind for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field',
    sideEffects: 'Repositions caster adjacent to target; applies blind status (-35% accuracy)'
  },
  soul_drain: {
    whatItDoes: 'Strikes for 180% weapon damage + hybrid bonus and siphons 50% of damage dealt back as HP',
    expressible: 'NEW-MECHANIC',
    newDetail: 'lifeStealPercent on damage effect',
    sideEffects: 'Calls caster.heal(damage * 0.5); createHealEffect; green floating text'
  },
  oblivion_strike: {
    whatItDoes: 'Capstone hit: 300% weapon damage, consumes up to 25 surplus energy for +4% damage per point (+ hybrid bonus)',
    expressible: 'NEW-MECHANIC',
    newDetail: 'resourceDump / bonusEnergy mechanism on SkillEffectDamage',
    sideEffects: 'Deducts variable surplus energy; scales multiplier dynamically; weapon procs'
  },

  // Swordsman
  blade_strike: {
    whatItDoes: 'Baseline katana cut dealing 140% weapon damage',
    expressible: 'YES',
    sideEffects: 'Runs in katanaSkillIds block (L4522); single weapon strike; floating text'
  },
  quick_cut: {
    whatItDoes: 'Swift katana slash with +20% accuracy dealing 150% weapon damage',
    expressible: 'YES',
    sideEffects: 'accuracyBonus in SkillDef is supported by executeWeaponSkillAttack; floating text'
  },
  defensive_posture: {
    whatItDoes: 'Self stance reducing damage taken by 20% for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'self damageReductionPercent status handling in damage resolution',
    sideEffects: 'Applies defensive_posture status; intercepted in CombatSystem incoming damage (L800)'
  },
  severing_slice: {
    whatItDoes: 'Deep incision dealing 170% weapon damage and applying Bleed for 6s',
    expressible: 'YES',
    sideEffects: 'Applies bleed status; single weapon strike; floating text'
  },
  cross_cut: {
    whatItDoes: 'Dual-diagonal katana cross cut dealing 260% weapon damage',
    expressible: 'YES',
    sideEffects: 'Single high-multiplier weapon strike; floating text'
  },

  // Ronin
  iaido_quickdraw: {
    whatItDoes: 'Lightning-fast draw dealing 150% weapon damage with +20% accuracy',
    expressible: 'YES',
    sideEffects: 'Runs in katanaSkillIds block; accuracyBonus supported in engine'
  },
  crimson_slash: {
    whatItDoes: 'Wide arterial slash dealing 170% weapon damage and applying Bleed for 6s',
    expressible: 'YES',
    sideEffects: 'Applies bleed status; single weapon strike'
  },
  flowing_step: {
    whatItDoes: 'Agile dash-strike closing up to 4 tiles, dealing 140% weapon damage and granting +25% Evasion for 4s',
    expressible: 'YES',
    sideEffects: 'Repositions caster to open attack tile; applies flowing_step status (+25% evasion)'
  },
  bloodseeker_riposte: {
    whatItDoes: 'Lethal strike dealing 200% weapon damage, amplified by +50% (300% total) if target is Bleeding',
    expressible: 'YES',
    sideEffects: 'Checks target hasStatusEffect("bleed"); multiplies damage; crits floating text'
  },
  dragons_flurry: {
    whatItDoes: '4 rapid katana cuts dealing 4x 80% (320% total) weapon damage and applying Bleed for 6s',
    expressible: 'YES',
    sideEffects: 'Multi-hit strike loop; applies bleed status upon completion'
  },

  // Samurai
  overhead_cleave: {
    whatItDoes: 'Heavy downward cut dealing 170% weapon damage',
    expressible: 'YES',
    sideEffects: 'Single weapon strike; floating text'
  },
  iron_posture: {
    whatItDoes: 'Self stance granting 35% damage reduction for 5s',
    expressible: 'NEW-FIELD',
    newDetail: 'self damageReductionPercent status handling in damage resolution',
    sideEffects: 'Applies iron_posture status; intercepted in CombatSystem damage resolution (L796)'
  },
  sweeping_hilt: {
    whatItDoes: 'Pommel and blade strike dealing 180% weapon damage with a 30% chance to Stun for 2s',
    expressible: 'YES',
    sideEffects: 'Rolls 30% chance; applies stun status; stops enemy movement'
  },
  kenjutsu_deflection: {
    whatItDoes: 'Defensive stance granting 40 shield and reflecting 50% of absorbed damage back to attacker for 6s',
    expressible: 'NEW-MECHANIC',
    newDetail: 'reflect / thorns on damage absorption shield status',
    sideEffects: 'Applies kenjutsu_deflection status; absorbs damage and damages enemy (L818-831)'
  },
  heavenly_decapitation: {
    whatItDoes: 'Martial execution strike dealing 320% weapon damage, consuming up to 25 bonus energy (+4% per point)',
    expressible: 'NEW-MECHANIC',
    newDetail: 'resourceDump / bonusEnergy mechanism on SkillEffectDamage',
    sideEffects: 'Deducts variable bonus energy; scales multiplier dynamically'
  },

  // Javelin
  piercing_throw: {
    whatItDoes: 'Ranged piercing strike up to 4 tiles dealing 150% weapon damage + hybrid bonus (spears/throw)',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field (+0.15 * spears/throwing_weapons)',
    sideEffects: 'Custom partner level calculation; checks Bleed; weapon procs'
  },
  impaling_thrust: {
    whatItDoes: 'Close-range strike up to 2 tiles dealing 170% weapon damage + hybrid bonus and applying Bleed for 6s',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field',
    sideEffects: 'Applies bleed status; custom hybrid calculation'
  },
  vaulting_leap: {
    whatItDoes: 'Tactical spear-vault repositioning 2-3 tiles away from nearest threat and granting +40% Evasion for 3s',
    expressible: 'NEW-FIELD',
    newDetail: 'retreat/backstep move primitive combined with buff',
    sideEffects: 'Finds candidate tiles away from closest enemy; sets position; applies vaulting_leap status'
  },
  pinning_spear: {
    whatItDoes: 'Barbed throw up to 4 tiles dealing 180% weapon damage + hybrid bonus and Slowing target by 50% for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field',
    sideEffects: 'Applies slow status; custom hybrid calculation'
  },
  heartseeker_hurl: {
    whatItDoes: 'Maximum momentum throw up to 5 tiles dealing 280% weapon damage (+10% per tile of distance) + hybrid bonus',
    expressible: 'NEW-MECHANIC',
    newDetail: 'distanceBonusMultiplier on damage effect (multiplier * (1 + dist * rate))',
    sideEffects: 'Calculates tile distance between caster and target; scales damage; checks Bleed'
  },

  // Loader
  primed_shot: {
    whatItDoes: 'Heavy primed crossbow bolt up to 4 tiles dealing 140% weapon damage',
    expressible: 'YES',
    sideEffects: 'Single ranged weapon strike; floating text'
  },
  rapid_crank: {
    whatItDoes: 'Swift follow-up shot up to 4 tiles with +20% accuracy dealing 150% weapon damage',
    expressible: 'YES',
    sideEffects: 'accuracyBonus supported in engine; floating text'
  },
  arbalest_brace: {
    whatItDoes: 'Braces stock to ground, reducing damage taken by 20% for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'self damageReductionPercent status handling in damage resolution',
    sideEffects: 'Applies arbalest_brace status; intercepted in CombatSystem damage resolution (L804)'
  },
  pinning_bolt: {
    whatItDoes: 'Brutal kinetic bolt up to 4 tiles dealing 180% weapon damage and Slowing target by 50% for 3s',
    expressible: 'YES',
    sideEffects: 'Applies slow status; single ranged weapon strike'
  },
  kinetic_overdraw: {
    whatItDoes: 'Releases spring tension dealing 260% weapon damage up to 4 tiles away (spec intended resource dump)',
    expressible: 'YES',
    sideEffects: 'Single high-damage crossbow shot; currently implemented as flat 260% weapon damage'
  },

  // Arcane Initiate
  arcane_bolt: {
    whatItDoes: 'Primary arcane projectile up to 5 tiles dealing 140% magic damage (min 8), consumed by Overcharge',
    expressible: 'YES',
    sideEffects: 'createArcaneBoltEffect; consumes Overcharge if active (+75% damage, +50% cost); +2 arcane_magic EXP'
  },
  mana_shield: {
    whatItDoes: 'Converts 50% of incoming damage to energy for 6s',
    expressible: 'NEW-MECHANIC',
    newDetail: 'damageToEnergyPercent on status effect',
    sideEffects: 'Applies mana_shield status; intercepted in Entity.takeDamage (L292-303)'
  },
  overcharge: {
    whatItDoes: 'Buffs caster for 10s: next spell consumes 50% more energy and deals +75% damage',
    expressible: 'NEW-MECHANIC',
    newDetail: 'spell overcharge consumption hook / status primitive',
    sideEffects: 'Applies overcharge status; consumed in next spell cast via consumeOverchargeIfActive'
  },
  blink: {
    whatItDoes: 'Instantly teleports caster 3 tiles away from nearest enemy threat',
    expressible: 'NEW-FIELD',
    newDetail: 'move retreat/blink primitive targeting open tile away from threat',
    sideEffects: 'Repositions caster; createArcaneBoltEffect; +2 arcane_magic EXP'
  },
  arcane_nova: {
    whatItDoes: 'PBAoE 4-tile arcane explosion dealing 260% magic damage to all enemies in range & LoS',
    expressible: 'YES',
    sideEffects: 'Consumes Overcharge; createArcaneNovaEffect; damages all enemies in radius; +4 arcane_magic EXP'
  },

  // Spellsword
  arcane_strike: {
    whatItDoes: 'Hybrid strike dealing 150% weapon damage + unconditional Arcane Magic scaling (+0.15 * arcane_magic level)',
    expressible: 'NEW-FIELD',
    newDetail: 'unconditionalProficiencyBonus: { prof: "arcane_magic", scaling: 0.15 }',
    sideEffects: 'Triggers runic_infusion siphon (+4 EN) if active; +2 longswords, +1 arcane_magic EXP'
  },
  runic_infusion: {
    whatItDoes: 'Weapon enchant for 8s: attacks deal +25% magic damage and siphon 4 energy on-hit',
    expressible: 'NEW-MECHANIC',
    newDetail: 'on-hit energy siphon status effect property',
    sideEffects: 'Applies runic_infusion status; procs +4 energy on arcane_strike, dimensional_lunge, blade_beam, & normal attacks (L2104); +2 longswords, +1 arcane_magic EXP'
  },
  spell_ward: {
    whatItDoes: 'Kinetic ward for 6s absorbing 40 damage and granting +20% Parry chance',
    expressible: 'NEW-FIELD',
    newDetail: 'parryBonus property on shield/buff status',
    sideEffects: 'Applies spell_ward status (40 shield, 0.20 parry); +2 longswords, +1 arcane_magic EXP'
  },
  dimensional_lunge: {
    whatItDoes: 'Gap-closer teleport up to 4 tiles and longsword thrust for 190% weapon damage + Arcane Magic scaling',
    expressible: 'NEW-FIELD',
    newDetail: 'unconditionalProficiencyBonus field',
    sideEffects: 'Repositions caster adjacent to target; triggers runic siphon if active; +2 longswords, +1 arcane_magic EXP'
  },
  blade_beam: {
    whatItDoes: 'Crescent wave up to 4 tiles for 260% weapon damage + Arcane Magic scaling; if Runic Infusion active, refunds 10 EN and cleaves for 60%',
    expressible: 'NEW-MECHANIC',
    newDetail: 'statusConditionalSynergy (if status active -> cleave adjacent + refund energy)',
    sideEffects: 'Runic Infusion synergy (+10 EN, +20% dmg, cleaves adjacent for 60%); +2 longswords, +2 arcane_magic EXP'
  },

  // Thrower
  quick_toss: {
    whatItDoes: 'Rapid flick up to 3 tiles dealing 140% weapon damage + hybrid partner scaling (daggers/throwing_weapons)',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field (+0.15 * partner level)',
    sideEffects: 'Checks Bleed; awards EXP to primary and partner prof (L5213-5214)'
  },
  skirmish_step: {
    whatItDoes: 'Tactical maneuver granting +35% Evasion for 4s',
    expressible: 'YES',
    sideEffects: 'Applies skirmish_step status; awards 1 EXP to throwing_weapons and daggers'
  },
  fan_of_knives: {
    whatItDoes: 'Throws blades up to 3 tiles dealing 160% weapon damage + hybrid bonus, and cleaves adjacent enemies for 50%',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field',
    sideEffects: 'Cleaves other enemies within 1 tile of target for 50% damage; awards partner EXP'
  },
  crippling_volley: {
    whatItDoes: 'Targeted projectile up to 4 tiles dealing 185% weapon damage + hybrid bonus, applying 50% Slow and Bleed for 4s',
    expressible: 'NEW-FIELD',
    newDetail: 'hybridPartnerScaling field',
    sideEffects: 'Applies slow and bleed statuses; awards partner EXP'
  },
  blade_barrage: {
    whatItDoes: 'Deadly barrage up to 4 tiles dealing 260% weapon damage + +0.25*partner level; if Skirmish Step active, +10 EN and +25% damage',
    expressible: 'NEW-MECHANIC',
    newDetail: 'hybridPartnerScaling (0.25) + statusConditionalSynergy (if skirmish_step active -> +10 EN & +25% dmg)',
    sideEffects: 'Skirmish Step momentum check; checks Bleed; awards 2 EXP to partner prof'
  }
};

const rows: SkillAuditRow[] = [];

for (const [kit, skills] of Object.entries(legacyKits)) {
  for (const skillId of skills) {
    const branchLines: number[] = [];
    combatLines.forEach((line, idx) => {
      // Find branch checks
      if (
        line.includes(`skillId === '${skillId}'`) ||
        line.includes(`skillId === "${skillId}"`) ||
        line.includes(`'${skillId}'`) ||
        line.includes(`"${skillId}"`)
      ) {
        if (
          line.includes('if (') ||
          line.includes('else if (') ||
          line.includes('case ') ||
          line.includes('.includes(skillId)') ||
          line.includes('katanaSkillIds') ||
          line.includes('javelinSkillIds') ||
          line.includes('loaderSkillIds') ||
          line.includes('throwerSkillIds')
        ) {
          branchLines.push(idx + 1);
        }
      }
    });

    const meta = auditMetadata[skillId] || {
      whatItDoes: 'Legacy skill execution',
      expressible: 'YES',
      sideEffects: 'Standard combat side effects'
    };

    rows.push({
      kit,
      skillId,
      branches: branchLines.length > 0 ? `CombatSystem.ts:${branchLines.join(',')}` : 'CombatSystem.ts:3923',
      whatItDoes: meta.whatItDoes,
      expressible: meta.expressible,
      newDetail: meta.newDetail,
      sideEffects: meta.sideEffects
    });
  }
}

console.log('| Kit | Skill | Branch | What it does | Expressible? | Side effects |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  const exprCol = r.expressible === 'YES' ? '**YES**' : `**${r.expressible}**${r.newDetail ? ` (${r.newDetail})` : ''}`;
  console.log(`| **${r.kit}** | \`${r.skillId}\` | ${r.branches} | ${r.whatItDoes} | ${exprCol} | ${r.sideEffects} |`);
}
