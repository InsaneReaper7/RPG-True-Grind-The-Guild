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
  meleeDamage: number;
  aggroRadius: number;
  attackIntervalMs: number;
  moveSpeed: number;
  harvest: HarvestItem[];
}

export interface EnemiesData {
  enemies: EnemyDef[];
}

export interface PlayerData {
  id: string;
  name: string;
  maxHp: number;
  moveSpeed: number;
  attackRangeTiles: number;
  startingWeaponId: string;
}

export type EntityState = 'idle' | 'moving' | 'attacking' | 'dead';
