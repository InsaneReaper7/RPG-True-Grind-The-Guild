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
  FoodDef,
  FoodsData,
  MoodTierDef,
  MoodEffectsData
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
  private foodsData!: FoodsData;
  private moodEffectsData!: MoodEffectsData;

  private constructor() {}

  public static getInstance(): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader();
    }
    return DataLoader.instance;
  }

  public async loadAll(): Promise<void> {
    const [player, weapons, classes, enemies, skills, statusEffects, buildables, rooms, hiddenSkills, skillBooks, researchTree, alchemyRecipes, foods, moodEffects] = await Promise.all([
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
      fetch('/data/food.json').then((res) => res.json()),
      fetch('/data/moodEffects.json').then((res) => res.json())
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
    this.foodsData = foods as FoodsData;
    this.moodEffectsData = moodEffects as MoodEffectsData;

    if (this.hiddenSkillsData?.hiddenSkills) {
      HiddenSkillSystem.getInstance().registerSkillDefs(this.hiddenSkillsData.hiddenSkills);
    }
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
    return this.weaponsData.weapons.find((w) => w.id === id);
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

  public getClassesData(): ClassesData {
    return this.classesData;
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
}

