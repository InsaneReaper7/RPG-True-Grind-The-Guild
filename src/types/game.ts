export interface GridPos {
  x: number;
  y: number;
}

export interface TrainableStat {
  level: number;
  currentExp: number;
}

export interface WeaponLevelBonus {
  accuracyPerLevel?: number;
  damagePerLevel?: number;
  attackSpeedPerLevel?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  category: string;
  twoHanded: boolean;
  attackIntervalMs: number;
  baseDamage: number;
  baseAccuracy?: number;
  bleedChance?: number;
  levelBonus?: WeaponLevelBonus;
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
  hiddenSkillBonuses?: Record<string, number>;
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

export interface FootprintDef {
  width: number;
  height: number;
}

export interface BuildableDef {
  id: string;
  name: string;
  woodCost: number;
  footprint: FootprintDef;
  rotatable: boolean;
  indoorRequired: boolean;
  walkable: boolean;
  roomTag?: string;
  roomTags?: string[];
  description: string;
}

export interface BuildablesData {
  buildables: BuildableDef[];
}

export interface PlacedBuildable {
  id: string;
  x: number;
  y: number;
  rotation: number; // 0, 90, 180, 270
  costPaid?: number;
}

export interface RoomRuleDef {
  id: string;
  name: string;
  priority: number;
  requiredTags: string[];
  description?: string;
}

export interface RoomsData {
  rules: RoomRuleDef[];
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
  knownSkillIds?: string[];
  equippedSkillIds?: string[];
  proficiencies?: Record<string, number | TrainableStat>;
  resources?: {
    wood: number;
    [key: string]: number;
  };
}

export interface PlayerSnapshot {
  hp: number;
  criticalHp: number;
  energy: number;
  knownSkillIds: string[];
  equippedSkillIds: string[];
  autocastMap: Record<string, boolean>;
  skillCooldownsRemainingMs: Record<string, number>;
  proficiencies: Record<string, TrainableStat>;
  classLevels: Record<string, number>;
  unlockedClasses: string[];
  resources: {
    wood: number;
    [key: string]: number;
  };
  placedBuildables?: PlacedBuildable[];
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

export type HiddenSkillTriggerType =
  | 'onIncomingAttack'
  | 'onMeleeAttacked'
  | 'onShieldAttacked'
  | 'onDodgeParryBlock'
  | 'onDamageTaken'
  | 'onOutOfCombatTick'
  | 'onManaTick';

export interface HiddenSkillEligibility {
  gear?: string;
  weaponCategories?: string[];
  shieldRequired?: boolean;
  meleeWeaponRequired?: boolean;
  magicProficiencyRequired?: boolean;
}

export interface HiddenSkillTierEffect {
  level: number;
  description: string;
  dodgeChance?: number;
  deflectDamage?: boolean;
  reflectPercent?: number;
  stunOnParry?: boolean;
  blockDamageReduction?: number;
  negateCrits?: boolean;
  counterDamageMultiplier?: number;
  canCrit?: boolean;
  chainAttack?: boolean;
  damageReduction?: number;
  negationChance?: number;
  healAmount?: number;
  burstHeal?: boolean;
  energyAmount?: number;
  burstEnergy?: boolean;
  inCombat?: boolean;
}

export interface HiddenSkillDef {
  id: string;
  name: string;
  triggerType: HiddenSkillTriggerType;
  eligibility: HiddenSkillEligibility;
  baseProcChance: number;
  procChancePerLevel: number;
  expPerProc: number;
  description: string;
  tierEffects: HiddenSkillTierEffect[];
}

export interface HiddenSkillsData {
  hiddenSkills: HiddenSkillDef[];
}

export type EntityState = 'idle' | 'moving' | 'chasing' | 'attacking' | 'returning' | 'downed' | 'dead';
