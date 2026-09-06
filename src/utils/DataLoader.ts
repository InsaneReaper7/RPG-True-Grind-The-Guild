import {
  PlayerData,
  WeaponsData,
  ClassesData,
  EnemiesData,
  SkillsData,
  StatusEffectsData,
  WeaponDef,
  EnemyDef,
  SkillDef,
  StatusEffectDef
} from '../types/game';

export class DataLoader {
  private static instance: DataLoader;
  private playerData!: PlayerData;
  private weaponsData!: WeaponsData;
  private classesData!: ClassesData;
  private enemiesData!: EnemiesData;
  private skillsData!: SkillsData;
  private statusEffectsData!: StatusEffectsData;

  private constructor() {}

  public static getInstance(): DataLoader {
    if (!DataLoader.instance) {
      DataLoader.instance = new DataLoader();
    }
    return DataLoader.instance;
  }

  public async loadAll(): Promise<void> {
    const [player, weapons, classes, enemies, skills, statusEffects] = await Promise.all([
      fetch('/data/player.json').then((res) => res.json()),
      fetch('/data/weapons.json').then((res) => res.json()),
      fetch('/data/classes.json').then((res) => res.json()),
      fetch('/data/enemies.json').then((res) => res.json()),
      fetch('/data/skills.json').then((res) => res.json()),
      fetch('/data/statusEffects.json').then((res) => res.json())
    ]);

    this.playerData = player as PlayerData;
    this.weaponsData = weapons as WeaponsData;
    this.classesData = classes as ClassesData;
    this.enemiesData = enemies as EnemiesData;
    this.skillsData = skills as SkillsData;
    this.statusEffectsData = statusEffects as StatusEffectsData;
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
}
