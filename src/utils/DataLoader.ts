import type {
  PlayerData,
  WeaponsData,
  ClassesData,
  EnemiesData,
  SkillsData,
  StatusEffectsData,
  WeaponDef,
  EnemyDef,
  SkillDef,
  StatusEffectDef,
  BuildableDef,
  BuildablesData,
  RoomRuleDef,
  RoomsData,
  HiddenSkillDef,
  HiddenSkillsData,
  SkillBookDef,
  SkillBooksData,
  ResearchNodeDef,
  ResearchTreeData,
  AlchemyRecipeDef,
  AlchemyRecipesData,
  CookingRecipeDef,
  CookingRecipesData,
  BlacksmithRecipeDef,
  BlacksmithRecipesData,
  ArmorDef,
  ArmorsData,
  ArmorSlot,
  ArmorsmithRecipeDef,
  ArmorsmithRecipesData,
  BowyerRecipeDef,
  BowyerRecipesData,
  FoodDef,
  FoodsData,
  MoodTierDef,
  MoodEffectsData,
  DungeonConfig,
  GatheringNodesConfig,
  GatheringNodeDef,
  StartingKitDef,
  DungeonRegionDef,
  ItemDef,
  ItemsData
} from '../types/game.ts';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem.ts';

export class DataLoader {
  private static instance: DataLoader;
  private playerData!: PlayerData;
  private weaponsData!: WeaponsData;
  private classesData!: ClassesData;
  private enemiesData!: EnemiesData;
  private skillsData!: SkillsData;
  private statusEffectsData!: StatusEffectsData;
  private buildablesData!: BuildablesData;
  private roomsData!: RoomsData;
  private hiddenSkillsData!: HiddenSkillsData;
  private skillBooksData!: SkillBooksData;
  private researchTreeData!: ResearchTreeData;
  private alchemyRecipesData!: AlchemyRecipesData;
  private cookingRecipesData!: CookingRecipesData;
  private blacksmithRecipesData!: BlacksmithRecipesData;
  private bowyerRecipesData!: BowyerRecipesData;
  private armorsData!: ArmorsData;
  private armorsmithRecipesData!: ArmorsmithRecipesData;
  private foodsData!: FoodsData;
  private moodEffectsData!: MoodEffectsData;
  private dungeonConfig!: DungeonConfig;
  private gatheringNodesConfig!: GatheringNodesConfig;
  private itemsData!: ItemsData;

  private constructor() {}

  public static getInstance(): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader();
    }
    return DataLoader.instance;
  }

  public async loadAll(): Promise<void> {
    const [player, weapons, classes, enemies, skills, statusEffects, buildables, rooms, hiddenSkills, skillBooks, researchTree, alchemyRecipes, cookingRecipes, blacksmithRecipes, bowyerRecipes, armors, armorsmithRecipes, foods, moodEffects, dungeon, gathering, items] = await Promise.all([
      fetch('/data/player.json').then((res) => res.json()),
      fetch('/data/weapons.json').then((res) => res.json()),
      fetch('/data/classes.json').then((res) => res.json()),
      fetch('/data/enemies.json').then((res) => res.json()),
      fetch('/data/skills.json').then((res) => res.json()),
      fetch('/data/statusEffects.json').then((res) => res.json()),
      fetch('/data/buildables.json').then((res) => res.json()),
      fetch('/data/rooms.json').then((res) => res.json()),
      fetch('/data/hiddenSkills.json').then((res) => res.json()),
      fetch('/data/skillBooks.json').then((res) => res.json()),
      fetch('/data/researchTree.json').then((res) => res.json()),
      fetch('/data/alchemyRecipes.json').then((res) => res.json()),
      fetch('/data/cookingRecipes.json').then((res) => res.json()),
      fetch('/data/blacksmithRecipes.json').then((res) => res.json()),
      fetch('/data/bowyerRecipes.json').then((res) => res.json()),
      fetch('/data/armors.json').then((res) => res.json()),
      fetch('/data/armorsmithRecipes.json').then((res) => res.json()),
      fetch('/data/food.json').then((res) => res.json()),
      fetch('/data/moodEffects.json').then((res) => res.json()),
      fetch('/data/dungeonConfig.json').then((res) => res.json()).catch(() => null),
      fetch('/data/gatheringNodes.json').then((res) => res.json()).catch(() => null),
      fetch('/data/items.json').then((res) => res.json()).catch(() => null)
    ]);

    this.playerData = player as PlayerData;
    this.weaponsData = weapons as WeaponsData;
    this.classesData = classes as ClassesData;
    this.enemiesData = enemies as EnemiesData;
    this.skillsData = skills as SkillsData;
    this.statusEffectsData = statusEffects as StatusEffectsData;
    this.buildablesData = buildables as BuildablesData;
    this.roomsData = rooms as RoomsData;
    this.hiddenSkillsData = hiddenSkills as HiddenSkillsData;
    this.skillBooksData = skillBooks as SkillBooksData;
    this.researchTreeData = researchTree as ResearchTreeData;
    this.alchemyRecipesData = alchemyRecipes as AlchemyRecipesData;
    this.cookingRecipesData = cookingRecipes as CookingRecipesData;
    this.blacksmithRecipesData = blacksmithRecipes as BlacksmithRecipesData;
    this.bowyerRecipesData = bowyerRecipes as BowyerRecipesData;
    this.armorsData = armors as ArmorsData;
    this.armorsmithRecipesData = armorsmithRecipes as ArmorsmithRecipesData;
    this.foodsData = foods as FoodsData;
    this.moodEffectsData = moodEffects as MoodEffectsData;
    this.itemsData = (items as ItemsData) || { items: [] };
    if (dungeon) {
      this.dungeonConfig = dungeon as DungeonConfig;
    }
    if (gathering) {
      this.gatheringNodesConfig = gathering as GatheringNodesConfig;
    } else {
      this.gatheringNodesConfig = {
        defaultChannelDurationMs: 2500,
        interruptOnDamage: true,
        debugRespawnTimeMs: 15000,
        nodes: {
          foraging_bush: {
            id: 'foraging_bush',
            name: 'Wild Herbs',
            skillId: 'foraging',
            resourceId: 'wild_herbs',
            yieldCount: 1,
            expGranted: 15,
            channelDurationMs: 2500,
            respawnTimeMs: 15000,
            textureKey: 'foraging-bush',
            textureDepletedKey: 'foraging-bush-depleted',
            label: 'Wild Herbs',
            depletedLabel: 'Stripped',
            color: '#34d399',
            actionVerb: 'Foraging'
          },
          woodcutting_tree: {
            id: 'woodcutting_tree',
            name: 'Tree',
            skillId: 'woodcutting',
            resourceId: 'wood',
            yieldCount: 2,
            expGranted: 15,
            channelDurationMs: 2500,
            respawnTimeMs: 15000,
            textureKey: 'woodcutting-tree',
            textureDepletedKey: 'woodcutting-tree-depleted',
            label: 'Tree',
            depletedLabel: 'Stump',
            color: '#f59e0b',
            actionVerb: 'Logging'
          },
          mining_rock: {
            id: 'mining_rock',
            name: 'Rock Vein',
            skillId: 'mining',
            resourceId: 'ore',
            yieldCount: 1,
            expGranted: 15,
            channelDurationMs: 2500,
            respawnTimeMs: 15000,
            textureKey: 'mining-rock',
            textureDepletedKey: 'mining-rock-depleted',
            label: 'Rock Vein',
            depletedLabel: 'Depleted',
            color: '#94a3b8',
            actionVerb: 'Mining'
          },
          dig_spot: {
            id: 'dig_spot',
            name: 'Dig Spot',
            skillId: 'digging',
            resourceId: 'dirt',
            yieldCount: 1,
            expGranted: 15,
            channelDurationMs: 2500,
            respawnTimeMs: 15000,
            textureKey: 'dig-spot',
            textureDepletedKey: 'dig-spot-depleted',
            label: 'Dig Spot',
            depletedLabel: 'Excavated',
            color: '#b45309',
            actionVerb: 'Digging',
            lootTable: [
              { itemId: 'dirt', name: 'Dirt', weight: 35, count: 1 },
              { itemId: 'clay', name: 'Clay', weight: 30, count: 1 },
              { itemId: 'seeds', name: 'Seeds', weight: 20, count: 1 },
              { itemId: 'locked_box', name: 'Locked Box', weight: 15, count: 1 }
            ]
          }
        }
      };
    }

    if (this.hiddenSkillsData?.hiddenSkills) {
      HiddenSkillSystem.getInstance().registerSkillDefs(this.hiddenSkillsData.hiddenSkills);
    }
  }

  public static readonly DEFAULT_REGIONS: DungeonRegionDef[] = [
    {
      id: 'ancient_crypts',
      name: 'Ancient Crypts',
      minFloor: 1,
      maxFloor: 2,
      walkableTexture: 'tile-walkable',
      obstacleTexture: 'tile-obstacle',
      accentColor: '#a78bfa',
      tagline: 'The Upper Stone Chambers'
    },
    {
      id: 'abyssal_depths',
      name: 'Abyssal Depths',
      minFloor: 3,
      maxFloor: 5,
      walkableTexture: 'tile-abyssal-walkable',
      obstacleTexture: 'tile-abyssal-obstacle',
      accentColor: '#c084fc',
      tagline: 'The Deep Void Stratum'
    },
    {
      id: 'infernal_caldera',
      name: 'Infernal Caldera',
      minFloor: 6,
      walkableTexture: 'tile-caldera-walkable',
      obstacleTexture: 'tile-caldera-obstacle',
      accentColor: '#f97316',
      tagline: 'The Scorched Subterranean Core'
    }
  ];

  public getRegionForFloor(floorNumber: number): DungeonRegionDef {
    const config = this.getDungeonConfig();
    const regions = config.regions && config.regions.length > 0 ? config.regions : DataLoader.DEFAULT_REGIONS;
    const match = regions.find((r) => {
      const min = r.minFloor ?? 1;
      const max = r.maxFloor ?? Infinity;
      return floorNumber >= min && floorNumber <= max;
    });
    return match || regions[0] || DataLoader.DEFAULT_REGIONS[0];
  }

  public getDungeonConfig(): DungeonConfig {
    return (
      this.dungeonConfig || {
        mapWidth: 48,
        mapHeight: 48,
        tileSize: 32,
        roomCount: { min: 5, max: 7 },
        roomSize: { minWidth: 7, maxWidth: 12, minHeight: 7, maxHeight: 12 },
        corridorWidth: 2,
        roomTypes: {
          gathering: { weight: 25, bushesRange: [2, 4], enemiesRange: [0, 0] },
          light_combat: { weight: 45, bushesRange: [1, 3], enemiesRange: [1, 2] },
          heavy_combat: { weight: 30, bushesRange: [2, 5], enemiesRange: [3, 5] }
        },
        enemyPool: ['wolf', 'goblin', 'skeleton', 'undead']
      }
    );
  }

  public setDungeonConfig(config: DungeonConfig): void {
    this.dungeonConfig = config;
  }

  public getRoomsData(): RoomsData {
    return this.roomsData;
  }

  public getRoomRules(): RoomRuleDef[] {
    return this.roomsData?.rules ?? [];
  }

  public getBuildablesData(): BuildablesData {
    return this.buildablesData;
  }

  public getBuildables(): BuildableDef[] {
    return this.buildablesData.buildables;
  }

  public getBuildable(id: string): BuildableDef | undefined {
    return this.buildablesData.buildables.find((b) => b.id === id);
  }

  public getPlayer(): PlayerData {
    return this.playerData;
  }

  public getWeaponsData(): WeaponsData {
    return this.weaponsData;
  }

  public getWeapon(id: string): WeaponDef | undefined {
    const found = this.weaponsData?.weapons?.find((w) => w.id === id);
    if (found) return found;
    // Backward-compatibility fallback for legacy references to 'longswords'
    if (id === 'longswords') {
      return this.weaponsData?.weapons?.find((w) => w.id === 'longsword_2h');
    }
    if (id === 'spear' || id === 'spear_1h') {
      return this.weaponsData?.weapons?.find((w) => w.id === 'spears');
    }
    if (id === 'spear_2h') {
      return this.weaponsData?.weapons?.find((w) => w.id === 'spears_2h');
    }
    return undefined;
  }

  public getAllWeapons(): WeaponDef[] {
    return this.weaponsData?.weapons ?? [];
  }

  public getOneHandedMeleeWeaponIds(): string[] {
    if (!this.weaponsData?.weapons) {
      return ['short_swords', 'daggers', 'katana', 'mace', 'spears'];
    }
    return this.weaponsData.weapons
      .filter((w) => w.category === 'melee_1h' && !w.twoHanded)
      .map((w) => w.id);
  }

  public getMagicSchoolIds(): string[] {
    if (!this.weaponsData?.weapons) {
      return [
        'arcane_magic',
        'fire_magic',
        'water_magic',
        'ice_magic',
        'earth_magic',
        'nature_magic',
        'lightning_magic',
        'wind_magic',
        'healing_magic',
        'holy_magic',
        'dark_magic',
        'druid_staff'
      ];
    }
    return this.weaponsData.weapons
      .filter((w) => w.category === 'magic')
      .map((w) => w.id);
  }

  public getClassesData(): ClassesData {
    return this.classesData;
  }

  public getClasses(): any[] {
    return this.classesData?.classes ?? [];
  }

  public getClass(id: string): any | undefined {
    return this.classesData?.classes?.find((c) => c.id === id);
  }

  public getEnemiesData(): EnemiesData {
    return this.enemiesData;
  }

  public getEnemy(id: string): EnemyDef | undefined {
    return this.enemiesData.enemies.find((e) => e.id === id);
  }

  public getSkillsData(): SkillsData {
    return this.skillsData;
  }

  public getSkills(): SkillDef[] {
    return this.skillsData?.skills ?? [];
  }

  public getSkill(id: string): SkillDef | undefined {
    return this.skillsData.skills.find((s) => s.id === id);
  }

  public getStatusEffectsData(): StatusEffectsData {
    return this.statusEffectsData;
  }

  public getStatusEffect(id: string): StatusEffectDef | undefined {
    return this.statusEffectsData.statusEffects.find((e) => e.id === id);
  }

  public getHiddenSkillsData(): HiddenSkillsData {
    return this.hiddenSkillsData;
  }

  public getHiddenSkills(): HiddenSkillDef[] {
    return this.hiddenSkillsData?.hiddenSkills ?? [];
  }

  public getHiddenSkill(id: string): HiddenSkillDef | undefined {
    return this.hiddenSkillsData?.hiddenSkills.find((s) => s.id === id);
  }

  public getTrainableStatDef(id: string): { id: string; name: string; description: string; tierEffects?: any[] } | undefined {
    const hidden = this.getHiddenSkill(id);
    if (hidden) return hidden;

    const weapon = this.getWeapon(id);
    if (weapon) {
      let description = `Proficiency with ${weapon.name.toLowerCase()} in melee and combat.`;
      if (weapon.category === 'offhand') {
        description = 'Proficiency with shields to block and deflect incoming attacks.';
      } else if (weapon.id === 'healing_magic') {
        description = 'Proficiency with healing magic to restore health to injured allies.';
      } else if (weapon.id === 'fire_magic') {
        description = 'Proficiency with fire magic to incinerate enemies with ranged flames.';
      } else if (weapon.id === 'lightning_magic') {
        description = 'Proficiency with lightning magic to shock and chain arcs between enemies.';
      } else if (weapon.id === 'ice_magic') {
        description = 'Proficiency with ice magic to chill enemies and slow their movement.';
      } else if (weapon.id === 'holy_magic') {
        description = 'Proficiency with holy magic to punish the wicked and mend allies with radiant light.';
      } else if (weapon.id === 'dark_magic') {
        description = 'Proficiency with dark magic to enfeeble foes with weakening curses and destructive shadow.';
      } else if (weapon.id === 'arcane_magic') {
        description = 'Proficiency with arcane magic to siphon raw mana and unleash pure magical energy.';
      } else if (weapon.id === 'staff' || weapon.id.endsWith('_staff')) {
        description = 'Proficiency with two-handed staves in melee combat.';
      } else if (weapon.id === 'fist') {
        description = 'Unarmed combat technique. Deceptively humble beginnings that scale toward absurd punch power.';
      } else if (weapon.id === 'spears' || weapon.id === 'spears_2h' || id === 'spears') {
        description = 'Proficiency with spears and lances in melee combat.';
        return {
          id: 'spears',
          name: 'Spears',
          description
        };
      } else if (weapon.id === 'throwing_weapons' || id === 'throwing_weapons') {
        description = 'Proficiency with throwing weapons in ranged skirmish combat.';
        return {
          id: 'throwing_weapons',
          name: 'Throwing Weapons',
          description
        };
      } else if (weapon.id === 'crossbows' || id === 'crossbows') {
        description = 'Proficiency with mechanical crossbows and heavy arbalests in ranged combat.';
        return {
          id: 'crossbows',
          name: 'Crossbows',
          description
        };
      }
      return {
        id: weapon.id,
        name: weapon.name,
        description
      };
    }

    if (id === 'construction') {
      return {
        id: 'construction',
        name: 'Construction',
        description: 'Building, repairing, and upgrading outpost structures.'
      };
    }

    if (id === 'alchemy') {
      return {
        id: 'alchemy',
        name: 'Alchemy',
        description: 'Brewing remedies, potions, and crafting medicine.'
      };
    }

    if (id === 'dual_wielding') {
      return {
        id: 'dual_wielding',
        name: 'Dual Wielding',
        description: 'Wielding two one-handed melee weapons simultaneously in combat.'
      };
    }

    if (id === 'foraging') {
      return {
        id: 'foraging',
        name: 'Foraging',
        description: 'Gathering wild plants, herbs, and natural resources from dungeons and wilderness.'
      };
    }

    if (id === 'woodcutting') {
      return {
        id: 'woodcutting',
        name: 'Woodcutting',
        description: 'Felling trees and harvesting logs and timber in dungeons and wilderness.'
      };
    }

    if (id === 'mining') {
      return {
        id: 'mining',
        name: 'Mining',
        description: 'Quarrying stone, rock veins, and extracting raw ore from dungeons and caverns.'
      };
    }

    if (id === 'cooking') {
      return {
        id: 'cooking',
        name: 'Cooking',
        description: 'Preparing meals, discovering recipes, and crafting quality dishes at cooking stations.'
      };
    }

    if (id === 'blacksmithing') {
      return {
        id: 'blacksmithing',
        name: 'Blacksmithing',
        description: 'Smelting ore and forging weapons at the blacksmithing station.'
      };
    }

    if (id === 'armorsmithing') {
      return {
        id: 'armorsmithing',
        name: 'Armorsmithing',
        description: 'Tailoring hides and weaving silk into protective armor at the armorsmithing bench.'
      };
    }

    if (id === 'digging') {
      return {
        id: 'digging',
        name: 'Digging',
        description: 'Excavating earth and uncovering buried resources, soil, and curiosities in dungeons.'
      };
    }

    if (id === 'skinning') {
      return {
        id: 'skinning',
        name: 'Skinning',
        description: 'Harvesting pelts, hides, and fine silk from defeated animal creatures.'
      };
    }

    if (id === 'butchering') {
      return {
        id: 'butchering',
        name: 'Butchering',
        description: 'Carving usable meat and cuts from eligible defeated monster corpses.'
      };
    }

    if (id === 'bows') {
      return {
        id: 'bows',
        name: 'Bows',
        description: 'Archery proficiency, bow handling, and ranged accuracy.'
      };
    }

    if (id === 'bowyer') {
      return {
        id: 'bowyer',
        name: 'Bowyer',
        description: 'Guild bowcrafting, shaping seasoned staves, and crafting ranged weapons.'
      };
    }

    if (id === 'lockpicking') {
      return {
        id: 'lockpicking',
        name: 'Lockpicking',
        description: 'Bypassing locks, manipulating mechanical tumblers, and opening sealed containers.'
      };
    }

    if (id === 'gardening') {
      return {
        id: 'gardening',
        name: 'Gardening',
        description: 'Cultivating crops, tending planting plots, and extracting seeds at the outpost.'
      };
    }

    if (id === 'throwing_weapons') {
      return {
        id: 'throwing_weapons',
        name: 'Throwing Weapons',
        description: 'Proficiency with throwing weapons in ranged skirmish combat.'
      };
    }

    if (id === 'crossbows') {
      return {
        id: 'crossbows',
        name: 'Crossbows',
        description: 'Proficiency with mechanical crossbows and heavy arbalests in ranged combat.'
      };
    }

    return {
      id,
      name: id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: `Proficiency in ${id}.`
    };
  }

  public getGatheringNodesConfig(): GatheringNodesConfig {
    return this.gatheringNodesConfig;
  }

  public getGatheringNode(id: string): GatheringNodeDef | undefined {
    return this.gatheringNodesConfig?.nodes?.[id];
  }

  public getSkillBooksData(): SkillBooksData {
    return this.skillBooksData;
  }

  public getSkillBooks(): SkillBookDef[] {
    return this.skillBooksData?.skillBooks ?? [];
  }

  public getSkillBook(id: string): SkillBookDef | undefined {
    return this.skillBooksData?.skillBooks.find((b) => b.id === id);
  }

  public getSkillBookBySkillId(skillId: string): SkillBookDef | undefined {
    return this.skillBooksData?.skillBooks.find((b) => b.skillId === skillId);
  }

  public getResearchTreeData(): ResearchTreeData {
    return this.researchTreeData;
  }

  public getResearchNodes(): ResearchNodeDef[] {
    return this.researchTreeData?.nodes ?? [];
  }

  public getResearchNode(id: string): ResearchNodeDef | undefined {
    return this.researchTreeData?.nodes.find((n) => n.id === id);
  }

  public getAlchemyRecipesData(): AlchemyRecipesData {
    return this.alchemyRecipesData;
  }

  public getAlchemyRecipes(): AlchemyRecipeDef[] {
    return this.alchemyRecipesData?.recipes ?? [];
  }

  public getAlchemyRecipe(id: string): AlchemyRecipeDef | undefined {
    return this.alchemyRecipesData?.recipes.find((r) => r.id === id);
  }

  public getCookingRecipesData(): CookingRecipesData {
    return this.cookingRecipesData;
  }

  public getCookingRecipes(): CookingRecipeDef[] {
    return this.cookingRecipesData?.recipes ?? [];
  }

  public getCookingRecipe(id: string): CookingRecipeDef | undefined {
    return this.cookingRecipesData?.recipes.find((r) => r.id === id);
  }

  public getBlacksmithRecipesData(): BlacksmithRecipesData {
    return this.blacksmithRecipesData;
  }

  public getBlacksmithRecipes(): BlacksmithRecipeDef[] {
    return this.blacksmithRecipesData?.recipes ?? [];
  }

  public getBlacksmithRecipe(id: string): BlacksmithRecipeDef | undefined {
    return this.blacksmithRecipesData?.recipes.find((r) => r.id === id);
  }

  public getBowyerRecipesData(): BowyerRecipesData {
    return this.bowyerRecipesData;
  }

  public getBowyerRecipes(): BowyerRecipeDef[] {
    return this.bowyerRecipesData?.recipes ?? [];
  }

  public getBowyerRecipe(id: string): BowyerRecipeDef | undefined {
    return this.bowyerRecipesData?.recipes.find((r) => r.id === id);
  }

  public getArmorsData(): ArmorsData {
    return this.armorsData;
  }

  public getAllArmors(): ArmorDef[] {
    return this.armorsData?.armors ?? [];
  }

  public getArmor(id: string): ArmorDef | undefined {
    return this.armorsData?.armors.find((a) => a.id === id);
  }

  public getArmorsBySlot(slot: ArmorSlot): ArmorDef[] {
    return (this.armorsData?.armors ?? []).filter((a) => a.slot === slot);
  }

  public getArmorsmithRecipesData(): ArmorsmithRecipesData {
    return this.armorsmithRecipesData;
  }

  public getArmorsmithRecipes(): ArmorsmithRecipeDef[] {
    return this.armorsmithRecipesData?.recipes ?? [];
  }

  public getArmorsmithRecipe(id: string): ArmorsmithRecipeDef | undefined {
    return this.armorsmithRecipesData?.recipes.find((r) => r.id === id);
  }

  public getFoodsData(): FoodsData {
    return this.foodsData;
  }

  public getFoods(): FoodDef[] {
    return this.foodsData?.foods ?? [];
  }

  public getFood(id: string): FoodDef | undefined {
    return this.foodsData?.foods.find((f) => f.id === id);
  }

  public getMoodEffectsData(): MoodEffectsData {
    return this.moodEffectsData;
  }

  public getMoodTiers(): MoodTierDef[] {
    return this.moodEffectsData?.moodTiers ?? [];
  }

  public getMoodTier(mood: number): MoodTierDef {
    const tiers = this.getMoodTiers();
    // High to low check
    for (const t of tiers) {
      if (mood >= t.minMood) {
        return t;
      }
    }
    return (
      tiers[tiers.length - 1] || {
        tier: 'content',
        name: 'Content',
        minMood: 25,
        combatDamageMultiplier: 1.0,
        combatAccuracyBonus: 0.0,
        alchemyYieldBonus: 0,
        description: 'Standard performance.'
      }
    );
  }

  public getOffensiveMagicSchools(): WeaponDef[] {
    if (!this.weaponsData?.weapons) {
      return [];
    }
    return this.weaponsData.weapons.filter(
      (w) => w.category === 'magic' && w.id !== 'healing_magic' && w.baseDamage > 0 && w.energyCostPerCast !== undefined
    );
  }

  public getConduitForSpell(spellDef: WeaponDef): WeaponDef {
    if (spellDef.conduitWeaponId) {
      const conduit = this.getWeapon(spellDef.conduitWeaponId);
      if (conduit) return conduit;
    }
    const fallbackId = spellDef.id.endsWith('_magic')
      ? spellDef.id.replace(/_magic$/, '_staff')
      : `${spellDef.id}_staff`;
    const fallbackConduit = this.getWeapon(fallbackId);
    if (fallbackConduit) return fallbackConduit;
    return spellDef;
  }

  public getSpellForConduit(conduitDef: WeaponDef): WeaponDef | null {
    if (conduitDef.spellWeaponId) {
      return this.getWeapon(conduitDef.spellWeaponId) ?? null;
    }
    if (conduitDef.id.endsWith('_staff')) {
      const fallbackSpellId = conduitDef.id.replace(/_staff$/, '_magic');
      return this.getWeapon(fallbackSpellId) ?? null;
    }
    return null;
  }

  public getStartingKits(): StartingKitDef[] {
    return [
      {
        id: 'sword_and_shield',
        name: 'Sword and Shield',
        description: 'Short Swords + Shields — feeds toward the Vanguard/Knight line.',
        mainWeaponId: 'short_swords',
        offhandWeaponId: 'shields'
      },
      {
        id: '2h_longsword',
        name: '2H Longsword',
        description: 'Longswords — feeds toward the Dark Knight/Sword Saint line.',
        mainWeaponId: 'longsword_2h',
        offhandWeaponId: null
      },
      {
        id: 'bow_and_dagger',
        name: 'Bow and Dagger',
        description: 'Bows + Daggers — same kit as the Scout mentor NPC.',
        mainWeaponId: 'bows',
        offhandWeaponId: 'daggers'
      },
      {
        id: 'random_magic_staff',
        name: 'Random Magic Staff',
        description: 'A randomly assigned starting magic school — feeds toward that school’s Tier 0/1 line.',
        mainWeaponId: 'fire_staff',
        offhandWeaponId: null,
        isRandomMagic: true
      }
    ];
  }

  public getStartingKit(id: string): StartingKitDef | undefined {
    return this.getStartingKits().find((k) => k.id === id);
  }

  public getItemsData(): ItemsData {
    return this.itemsData || { items: [] };
  }

  public getItem(id: string): ItemDef | undefined {
    return this.getItemsData().items.find((i) => i.id === id);
  }

  public getItemWeight(id: string): number {
    if (id === 'research_points') return 0;
    const item = this.getItem(id);
    if (item && item.weight !== undefined) return item.weight;
    const weapon = this.getWeapon(id);
    if (weapon && weapon.weight !== undefined) return weapon.weight;
    const armor = this.getArmor(id);
    if (armor && armor.weight !== undefined) return armor.weight;
    const food = this.getFood(id);
    if (food && food.weight !== undefined) return food.weight;
    return 0.5; // sensible fallback default for unlisted items
  }
}

