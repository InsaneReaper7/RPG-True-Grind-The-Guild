export interface GridPos {
  x: number;
  y: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  category: string;
  twoHanded: boolean;
  attackIntervalMs: number;
  baseDamage: number;
  bleedChance?: number;
}

export interface ProficiencyTiers {
  novice: number;
  adept: number;
  expert: number;
  master: number;
}

export interface WeaponsData {
  weapons: WeaponDef[];
  proficiencyTiers: ProficiencyTiers;
}

export interface Requirement {
  type: 'proficiency' | 'classLevel';
  target: string;
  value: number;
}

export interface ClassDef {
  id: string;
  name: string;
  tier: string;
  requirements: Requirement[];
  fantasy: string;
}

export interface ClassesData {
  classes: ClassDef[];
}

export interface HarvestItem {
  method: string;
  item: string;
  tags: string[];
  note?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: string;
  hp: number;
  criticalHpMax?: number;
  meleeDamage: number;
  aggroRadius: number;
  attackIntervalMs: number;
  moveSpeed: number;
  attackRangeTiles?: number;
  harvest: HarvestItem[];
}

export interface EnemiesData {
  enemies: EnemyDef[];
}

export interface PlayerData {
  id: string;
  name: string;
  maxHp: number;
  criticalHpMax: number;
  maxEnergy: number;
  energyRegenPerSecond: number;
  moveSpeed: number;
  attackRangeTiles: number;
  startingWeaponId: string;
}

export interface SkillDef {
  id: string;
  name: string;
  energyCost: number;
  cooldownMs: number;
  damageMultiplier: number;
  requirements: Requirement[];
  description?: string;
}

export interface SkillsData {
  skills: SkillDef[];
}

export interface StatusEffectDef {
  id: string;
  name: string;
  durationMs: number;
  tickIntervalMs: number;
  damagePerTick: number;
  color?: string;
}

export interface StatusEffectsData {
  statusEffects: StatusEffectDef[];
}

export interface ActiveStatusEffect {
  def: StatusEffectDef;
  remainingMs: number;
  nextTickMs: number;
}

export type EntityState = 'idle' | 'moving' | 'chasing' | 'attacking' | 'returning' | 'downed' | 'dead';
