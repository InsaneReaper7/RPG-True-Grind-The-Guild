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
  blockPerLevel?: number;
  mitigationPerLevel?: number;
  healPerLevel?: number;
  energyCostReductionPerLevel?: number;
  burnChancePerLevel?: number;
  stunChancePerLevel?: number;
  shockChancePerLevel?: number;
  slowChancePerLevel?: number;
  radianceHealPerLevel?: number;
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
  burnChance?: number;
  shockChance?: number;
  slowChance?: number;
  radianceHealAmount?: number;
  chainTargets?: number;
  chainHopRangeTiles?: number;
  chainDamageFalloff?: number;
  attackRangeTiles?: number;
  aoeRadiusTiles?: number;
  aoeSplashPercent?: number;
  baseBlock?: number;
  baseMitigation?: number;
  baseHealAmount?: number;
  energyCostPerCast?: number;
  stunChance?: number;
  proficiencyId?: string;
  conduitWeaponId?: string;
  spellWeaponId?: string;
  levelBonus?: WeaponLevelBonus;
}

export interface StartingKitDef {
  id: string;
  name: string;
  description: string;
  mainWeaponId: string;
  offhandWeaponId: string | null;
  isRandomMagic?: boolean;
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
  type: 'proficiency' | 'classLevel' | 'activityCount';
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

export interface CorpseHarvestEntry {
  item: string;
  name: string;
  count: number;
  exp: number;
  tags?: string[];
  note?: string;
}

export interface CorpseHarvestDef {
  skinning?: CorpseHarvestEntry;
  butchering?: CorpseHarvestEntry;
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
  corpseHarvest?: CorpseHarvestDef;
}

export interface EnemiesData {
  enemies: EnemyDef[];
}

export interface FootprintDef {
  width: number;
  height: number;
}

export interface PlantingPlotData {
  state: 'empty' | 'growing' | 'ready';
  plantedCropId?: string;
  plantedAtDay: number;
  plantedAtDayProgress: number;
  growthDays: number;
}

export interface SeedMakerData {
  state: 'idle' | 'processing' | 'ready';
  inputItem?: string;
  outputItem?: string;
  outputCount?: number;
  startedTimeMs?: number;
  durationMs?: number;
}

export interface BuildableDef {
  id: string;
  name: string;
  woodCost: number;
  clayCost?: number;
  requiredProficiency?: { proficiency: string; level: number };
  footprint: FootprintDef;
  rotatable: boolean;
  indoorRequired: boolean;
  walkable: boolean;
  roomTag?: string;
  roomTags?: string[];
  description: string;
  lockedByDefault?: boolean;
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
  gardeningData?: PlantingPlotData;
  seedMakerData?: SeedMakerData;
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

export interface CharacterSnapshot {
  id: string;
  name: string;
  avatarKey?: string;
  avatarTextureKey?: string;
  x?: number;
  y?: number;
  hp: number;
  criticalHp: number;
  energy: number;
  equippedWeaponId: string;
  offhandWeaponId?: string | null;
  equippedHelmetId?: string | null;
  equippedBodyArmorId?: string | null;
  equippedNecklaceId?: string | null;
  equippedRingId?: string | null;
  equippedAccessoryId?: string | null;
  knownSkillIds: string[];
  equippedSkillIds: string[];
  autocastMap: Record<string, boolean>;
  skillCooldownsRemainingMs?: Record<string, number>;
  proficiencies: Record<string, TrainableStat>;
  classLevels: Record<string, number>;
  classStats?: Record<string, TrainableStat>;
  activeClass?: string | null;
  unlockedClasses: string[];
  activityCounts?: Record<string, number>;
  bookLearnedSkills?: string[];
  hunger?: number;
  mood?: number;
  state?: EntityState;
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
  classStats?: Record<string, TrainableStat>;
  activeClass?: string | null;
  unlockedClasses: string[];
  activityCounts?: Record<string, number>;
  resources: {
    wood: number;
    ore?: number;
    [key: string]: number | undefined;
  };
  placedBuildables?: PlacedBuildable[];
  researchPoints?: number;
  unlockedBuildables?: string[];
  completedResearchIds?: string[];
  inventory?: Record<string, number>;
  bookLearnedSkills?: string[];
  hunger?: number;
  mood?: number;
  currentGameDay?: number;
  foodItems?: FoodItemInstance[];
  equippedWeaponId?: string;
  offhandWeaponId?: string | null;
  equippedHelmetId?: string | null;
  equippedBodyArmorId?: string | null;
  equippedNecklaceId?: string | null;
  equippedRingId?: string | null;
  equippedAccessoryId?: string | null;
  party?: CharacterSnapshot[];
  discoveredCookingRecipes?: string[];
  discoveredAlchemyRecipes?: string[];
  dungeonFloorCount?: number;
}

export interface SkillBookDef {
  id: string;
  name: string;
  skillId: string;
  researchPoints: number;
  description: string;
}

export interface SkillBooksData {
  skillBooks: SkillBookDef[];
}

export interface ResearchNodeDef {
  id: string;
  name: string;
  targetBuildableId?: string;
  cost: number;
  prerequisites: string[];
  description: string;
}

export interface ResearchTreeData {
  nodes: ResearchNodeDef[];
}

export interface AlchemyRecipeDef {
  id: string;
  name: string;
  cures?: string[];
  ingredients: Record<string, number>;
  expGranted: number;
  energyRestored?: number;
  buffDurationMs?: number;
  buffRegenPerSec?: number;
  targetRegenSkill?: string;
  description: string;
}

export interface AlchemyRecipesData {
  recipes: AlchemyRecipeDef[];
}

export interface CookingRecipeDef {
  id: string;
  name: string;
  ingredients: Record<string, number>;
  resultFoodId: string;
  expGranted: number;
  maxQuality?: FoodQuality;
  description: string;
}

export interface CookingRecipesData {
  recipes: CookingRecipeDef[];
}

export interface BlacksmithRecipeDef {
  id: string;
  name: string;
  resultWeaponId?: string;
  resultItemId?: string;
  resultCount?: number;
  requiredLevel: number;
  ingredients: Record<string, number>;
  expGranted: number;
  description: string;
}

export interface BlacksmithRecipesData {
  recipes: BlacksmithRecipeDef[];
}

export interface BowyerRecipeDef {
  id: string;
  name: string;
  resultWeaponId: string;
  requiredLevel: number;
  ingredients: Record<string, number>;
  expGranted: number;
  description: string;
}

export interface BowyerRecipesData {
  recipes: BowyerRecipeDef[];
}

export type ArmorSlot = 'helmet' | 'body' | 'necklace' | 'ring' | 'accessory';

export interface ArmorDef {
  id: string;
  name: string;
  slot: ArmorSlot;
  hpBonus: number;
  splitRatio?: string | [number, number];
  hpSplitRatio?: string | [number, number];
  description: string;
}

export function getArmorHpSplit(armor: ArmorDef): { mainHpBonus: number; criticalHpBonus: number } {
  const raw = armor.splitRatio ?? armor.hpSplitRatio;
  let mainRatio = 0.5;

  if (typeof raw === 'string') {
    const parts = raw.split('/').map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && (parts[0] + parts[1] > 0)) {
      const sum = parts[0] + parts[1];
      mainRatio = parts[0] / sum;
    }
  } else if (Array.isArray(raw) && raw.length === 2) {
    const sum = raw[0] + raw[1];
    if (sum > 0) {
      mainRatio = raw[0] / sum;
    }
  }

  const mainHpBonus = Math.round(armor.hpBonus * mainRatio);
  const criticalHpBonus = armor.hpBonus - mainHpBonus;
  return { mainHpBonus, criticalHpBonus };
}

export interface ArmorsData {
  armors: ArmorDef[];
}

export interface ArmorsmithRecipeDef {
  id: string;
  name: string;
  resultArmorId: string;
  requiredLevel: number;
  ingredients: Record<string, number>;
  expGranted: number;
  description: string;
}

export interface ArmorsmithRecipesData {
  recipes: ArmorsmithRecipeDef[];
}

export interface SkillDef {
  id: string;
  name: string;
  energyCost: number;
  cooldownMs: number;
  damageMultiplier?: number;
  healAmount?: number;
  targetType?: 'enemy' | 'ally' | 'self';
  requirements: Requirement[];
  description?: string;
  stunDurationMs?: number;
  mitigationPercent?: number;
  durationMs?: number;
  radiusTiles?: number;
  damageImmunity?: boolean;
  accuracyBonus?: number;
  rangeTiles?: number;
  strikeCount?: number;
  damagePerHitMultiplier?: number;
  shieldAmount?: number;
  tickIntervalMs?: number;
  healPerTick?: number;
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
  disablesActions?: boolean;
  disablesMovement?: boolean;
  interruptsAttack?: boolean;
  moveSpeedMultiplier?: number;
  isHarmful?: boolean;
  shieldAmount?: number;
  healPerTick?: number;
  holyBonusDamage?: number;
}

export interface StatusEffectsData {
  statusEffects: StatusEffectDef[];
}

export interface ActiveStatusEffect {
  def: StatusEffectDef;
  remainingMs: number;
  nextTickMs: number;
  shieldHp?: number;
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

export type EntityState = 'idle' | 'moving' | 'chasing' | 'attacking' | 'returning' | 'downed' | 'dead' | 'channeling';

export type FoodQuality = 'common' | 'good' | 'excellent' | 'perfect';

export interface FoodQualityModifier {
  hungerMultiplier: number;
  buffDurationMs: number;
  hpRegenPerSec: number;
}

export interface FoodBuffDef {
  id: string;
  name: string;
  durationMs: number;
  hpRegenPerSec: number;
  description: string;
}

export interface FoodDef {
  id: string;
  name: string;
  hungerRestored: number;
  spoilageDays: number;
  buff: FoodBuffDef;
  qualities?: Record<FoodQuality, FoodQualityModifier>;
  description: string;
}

export interface FoodsData {
  foods: FoodDef[];
}

export interface FoodItemInstance {
  id: string;
  acquiredDay: number;
  instanceId: string;
  quality?: FoodQuality;
}

export type MoodTierName = 'high' | 'content' | 'low';

export interface MoodTierDef {
  tier: MoodTierName;
  name: string;
  minMood: number;
  combatDamageMultiplier: number;
  combatAccuracyBonus: number;
  alchemyYieldBonus: number;
  description: string;
}

export interface MoodEffectsData {
  moodTiers: MoodTierDef[];
}

export interface ExpTransaction {
  id: string; // proficiency/stat ID (e.g. 'short_swords', 'foraging')
  amount: number; // e.g. 2, 15
  memberName: string; // e.g. 'Valerie', 'Guild Hero'
  timestamp: number;
  currentLevel: number;
  currentExp: number;
  nextExp: number;
}

// Milestone 13 & 34: Procedural Dungeon Generation Types
export type DungeonRoomType = 'entrance' | 'gathering' | 'light_combat' | 'heavy_combat' | 'boss';

export interface DungeonRoomConfig {
  weight?: number;
  bushesRange: [number, number];
  enemiesRange: [number, number];
}

export interface DungeonConfig {
  _comment?: string;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  roomCount: {
    min: number;
    max: number;
  };
  roomSize: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  };
  corridorWidth: number;
  roomTypes: {
    gathering: DungeonRoomConfig;
    light_combat: DungeonRoomConfig;
    heavy_combat: DungeonRoomConfig;
    boss?: DungeonRoomConfig;
  };
  enemyPool: string[];
  bossEnemyId?: string;
  bossRoom?: boolean;
  bossMilestoneInterval?: number;
  bossRandomChance?: number;
  eliteEnemyId?: string;
  eliteChance?: number;
  epicEnemyId?: string;
  epicChance?: number;
  crystalPlacement?: string;
  depthScaling?: DepthScalingConfig;
  floorRespawnTimerSec?: number;
}

export interface DepthScalingConfig {
  eliteChancePerFloor?: number;
  maxEliteChance?: number;
  epicChancePerFloor?: number;
  maxEpicChance?: number;
  bossRandomChancePerFloor?: number;
  maxBossRandomChance?: number;
}

export interface DungeonRoom {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  type: DungeonRoomType;
}

export interface EnemySpawnDef {
  enemyId: string;
  x: number;
  y: number;
  roomIndex: number;
}

export interface GatheringLootEntry {
  itemId?: string;
  resourceId?: string;
  name?: string;
  weight?: number;
  count?: number;
  yieldCount?: number;
}

export interface GatheringNodeDef {
  id: string;
  name: string;
  skillId: string;
  resourceId: string;
  yieldCount: number;
  expGranted: number;
  channelDurationMs: number;
  respawnTimeMs: number;
  textureKey: string;
  textureDepletedKey: string;
  label: string;
  depletedLabel: string;
  color: string;
  actionVerb: string;
  lootTable?: GatheringLootEntry[];
}

export interface GatheringNodesConfig {
  defaultChannelDurationMs: number;
  interruptOnDamage: boolean;
  debugRespawnTimeMs: number;
  nodes: Record<string, GatheringNodeDef>;
}

export interface GatheringNodeSpawnDef {
  x: number;
  y: number;
  roomIndex: number;
  nodeTypeId: string;
}

export interface BushSpawnDef {
  x: number;
  y: number;
  roomIndex: number;
  nodeTypeId?: string;
}

export interface GeneratedDungeon {
  width: number;
  height: number;
  gridMatrix: number[][]; // 0 = walkable, 1 = obstacle/wall
  rooms: DungeonRoom[];
  portalPos: GridPos;
  crystalPos: GridPos;
  enemySpawns: EnemySpawnDef[];
  bushSpawns: BushSpawnDef[];
}

export interface DynamicObstaclesConfig {
  soft?: GridPos[]; // eligible for corridor bottleneck fallback (friendly party members)
  hard?: GridPos[]; // hard non-negotiable obstacles (living enemies)
}

// Milestone 38: Lockpicking & Locked Box
export interface LockedBoxReward {
  type: 'research_points' | 'item' | 'resource';
  id: string;
  name: string;
  count: number;
  isRare?: boolean;
}

export interface LockpickAttemptResult {
  success: boolean;
  expGained: number;
  rewards: LockedBoxReward[];
  message: string;
  memberName: string;
  newLevel?: number;
  leveledUp?: boolean;
  rollsAttempted?: number;
  lockpicksConsumed?: number;
  boxBroken?: boolean;
  boxPreserved?: boolean;
}

