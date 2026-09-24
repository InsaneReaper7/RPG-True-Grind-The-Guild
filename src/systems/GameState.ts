import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import type {
  PlayerData,
  PlayerSnapshot,
  CharacterSnapshot,
  PlacedBuildable,
  TrainableStat,
  FoodItemInstance,
  FoodQuality,
  LockpickAttemptResult,
  PlantingPlotData,
  SeedMakerData,
  SaveMetadata,
  GameSaveFile
} from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { LockpickingSystem } from './LockpickingSystem.ts';

export class GameState {
  public static readonly SAVE_STORAGE_KEY = 'RPG_TRUE_GRIND_SAVE_V1';
  public static readonly SAVE_VERSION = 1;

  private static instance: GameState;
  private snapshot: PlayerSnapshot | null = null;
  private partySnapshots: CharacterSnapshot[] = [];
  private isInitialized: boolean = false;
  private resources: { wood: number; ore: number; [key: string]: number } = { wood: 100, ore: 0 };
  private placedBuildables: PlacedBuildable[] = [];
  private researchPoints: number = 0;
  private unlockedBuildables: Set<string> = new Set(['floor', 'wall', 'door', 'bed', 'research_station']);
  private completedResearchIds: Set<string> = new Set();
  private inventory: Map<string, number> = new Map();
  private bookLearnedSkills: Set<string> = new Set();
  private discoveredCookingRecipes: Set<string> = new Set();
  private discoveredAlchemyRecipes: Set<string> = new Set(['bandage', 'antidote', 'energy_potion', 'escape_stone']);
  private encounteredEnemies: Set<string> = new Set();
  private discoveredProficiencies: Set<string> = new Set();
  private discoveredStatusEffects: Set<string> = new Set();
  private discoveredGatheringNodes: Set<string> = new Set();

  // Milestone 7: Day/Clock, Food & Mood Systems
  private currentGameDay: number = 1;
  private dayProgressMs: number = 0;
  private dayDurationMs: number = 60000; // 60s real-time per game day
  private foodItems: FoodItemInstance[] = [];
  private isSafeZone: boolean = false;
  public static readonly DISCOVERY_RP_BONUS: number = 1;
  public onSpoilageCallback?: (spoiledCount: number) => void;
  public onResearchPointsChanged?: (newPoints: number, delta: number) => void;
  public onSaveFailedCallback?: (errorMessage: string) => void;
  private lastSaveError: string | null = null;
  private dungeonFloorCount: number = 0;
  private lifetimeDungeonFloorCount: number = 0;

  // Milestone: Tutorial & Onboarding
  private tutorialStep: number = 0;
  private tutorialCompleted: boolean = false;
  private tutorialDismissed: boolean = false;

  private constructor() {}

  public static getInstance(): GameState {
    if (!GameState.instance) {
      GameState.instance = new GameState();
    }
    return GameState.instance;
  }

  public resolveStartingKit(
    kitId: string,
    rng: () => number = Math.random
  ): { mainWeaponId: string; offhandWeaponId: string | null } {
    if (kitId === 'random_magic_staff') {
      const dataLoader = DataLoader.getInstance();
      const pool = dataLoader.getOffensiveMagicSchools();
      if (pool.length === 0) {
        throw new Error('Cannot resolve Random Magic Staff: No offensive magic schools available.');
      }
      const selected = pool[Math.floor(rng() * pool.length)];
      const conduit = dataLoader.getConduitForSpell(selected);
      return {
        mainWeaponId: conduit.id,
        offhandWeaponId: null
      };
    } else if (kitId === 'sword_and_shield') {
      return { mainWeaponId: 'short_swords', offhandWeaponId: 'shields' };
    } else if (kitId === '2h_longsword') {
      return { mainWeaponId: 'longsword_2h', offhandWeaponId: null };
    } else if (kitId === 'bow_and_dagger') {
      return { mainWeaponId: 'bows', offhandWeaponId: 'daggers' };
    } else if (kitId === 'unarmed' || kitId === 'bare_hands' || kitId === 'fist') {
      return { mainWeaponId: 'fist', offhandWeaponId: null };
    }
    return { mainWeaponId: kitId, offhandWeaponId: null };
  }

  /**
   * One-time boot initialization from player.json data.
   * Never called again after initial game start.
   */
  public initFromPlayerData(playerData: PlayerData, startingKitId?: string): void {
    if (this.isInitialized) return;

    const resolvedKit = startingKitId ? this.resolveStartingKit(startingKitId) : null;
    const initialMainWeapon = resolvedKit ? resolvedKit.mainWeaponId : playerData.startingWeaponId;
    const initialOffhandWeapon = resolvedKit ? resolvedKit.offhandWeaponId : null;

    const known = playerData.knownSkillIds ? [...playerData.knownSkillIds] : [];
    const equipped = playerData.equippedSkillIds ? [...playerData.equippedSkillIds] : [];
    const autocastObj: Record<string, boolean> = {};
    for (const s of equipped) {
      autocastObj[s] = true;
    }

    this.resources = {
      wood: playerData.resources?.wood ?? 0,
      ore: (playerData.resources as any)?.ore ?? 0,
      ...(playerData.resources ?? {})
    };
    if (this.resources.wood > 0) {
      this.inventory.set('wood', this.resources.wood);
    }
    if (this.resources.ore > 0) {
      this.inventory.set('ore', this.resources.ore);
    }

    const seedProficiencies: Record<string, TrainableStat> = {
      [initialMainWeapon]: { level: 0, currentExp: 0 },
      construction: { level: 0, currentExp: 0 },
      fist: { level: 0, currentExp: 0 }
    };
    if (initialOffhandWeapon) {
      seedProficiencies[initialOffhandWeapon] = { level: 0, currentExp: 0 };
    }

    if (playerData.proficiencies) {
      for (const [k, v] of Object.entries(playerData.proficiencies)) {
        if (typeof v === 'number') {
          seedProficiencies[k] = { level: v, currentExp: 0 };
        } else if (v && typeof v === 'object') {
          seedProficiencies[k] = { level: v.level ?? 0, currentExp: v.currentExp ?? 0 };
        }
      }
    }

    if (initialMainWeapon) {
      this.discoveredProficiencies.add(initialMainWeapon);
    }
    if (initialOffhandWeapon) {
      this.discoveredProficiencies.add(initialOffhandWeapon);
    }

    this.snapshot = {
      hp: playerData.maxHp,
      criticalHp: playerData.criticalHpMax,
      energy: playerData.maxEnergy,
      knownSkillIds: known,
      equippedSkillIds: equipped,
      autocastMap: autocastObj,
      skillCooldownsRemainingMs: {},
      proficiencies: seedProficiencies,
      classLevels: {},
      unlockedClasses: [],
      resources: { ...this.resources },
      placedBuildables: [],
      hunger: 100,
      mood: 80,
      currentGameDay: 1,
      foodItems: [],
      equippedWeaponId: initialMainWeapon,
      offhandWeaponId: initialOffhandWeapon,
      dungeonFloorCount: 0,
      encounteredEnemies: Array.from(this.encounteredEnemies),
      discoveredProficiencies: Array.from(this.discoveredProficiencies),
      discoveredStatusEffects: Array.from(this.discoveredStatusEffects),
      discoveredGatheringNodes: Array.from(this.discoveredGatheringNodes)
    };

    const heroSnapshot: CharacterSnapshot = {
      id: playerData.id || 'hero',
      name: playerData.name,
      avatarKey: 'player-avatar',
      hp: playerData.maxHp,
      criticalHp: playerData.criticalHpMax,
      energy: playerData.maxEnergy,
      equippedWeaponId: initialMainWeapon,
      offhandWeaponId: initialOffhandWeapon,
      knownSkillIds: known,
      equippedSkillIds: equipped,
      autocastMap: autocastObj,
      skillCooldownsRemainingMs: {},
      proficiencies: seedProficiencies,
      classLevels: {},
      classStats: {},
      unlockedClasses: [],
      activeClass: null,
      bookLearnedSkills: [],
      hunger: 100,
      mood: 80,
      state: 'idle'
    };

    const valerieProficiencies: Record<string, TrainableStat> = {
      daggers: { level: 10, currentExp: 0 },
      bows: { level: 15, currentExp: 0 },
      construction: { level: 0, currentExp: 0 },
      fist: { level: 0, currentExp: 0 }
    };
    this.discoveredProficiencies.add('daggers');
    this.discoveredProficiencies.add('bows');

    const valerieSnapshot: CharacterSnapshot = {
      id: 'companion_1',
      name: 'Valerie',
      avatarKey: 'companion-avatar',
      avatarTextureKey: 'companion-avatar',
      hp: 50,
      criticalHp: 25,
      energy: 100,
      equippedWeaponId: 'bows',
      offhandWeaponId: 'daggers',
      knownSkillIds: ['quickshot', 'mark_target'],
      equippedSkillIds: ['quickshot', 'mark_target'],
      autocastMap: { quickshot: true, mark_target: true },
      skillCooldownsRemainingMs: {},
      proficiencies: valerieProficiencies,
      classLevels: { scout: 10 },
      classStats: { scout: { level: 10, currentExp: 0 } },
      unlockedClasses: ['scout'],
      activeClass: 'scout',
      bookLearnedSkills: [],
      hunger: 100,
      mood: 80,
      state: 'idle'
    };

    this.partySnapshots = [heroSnapshot, valerieSnapshot];
    this.snapshot.party = [heroSnapshot, valerieSnapshot];

    this.isInitialized = true;
    console.log('[GameState] Initialized from player.json boot seed with Hero & Valerie:', this.snapshot);
  }

  /**
   * Milestone: The Real Game Start
   * Creates a genuine blank-slate recruit (Level 0 in all proficiencies, unclassed, no skills)
   * with only a chosen starting weapon kit.
   */
  public createBlankRecruitSnapshot(
    name: string = 'Kaelen',
    id: string = 'companion_2',
    startingKitId: string = 'sword_and_shield',
    rng: () => number = Math.random
  ): CharacterSnapshot {
    const resolvedKit = this.resolveStartingKit(startingKitId, rng);
    const seedProficiencies: Record<string, TrainableStat> = {
      [resolvedKit.mainWeaponId]: { level: 0, currentExp: 0 },
      construction: { level: 0, currentExp: 0 },
      fist: { level: 0, currentExp: 0 }
    };
    if (resolvedKit.offhandWeaponId) {
      seedProficiencies[resolvedKit.offhandWeaponId] = { level: 0, currentExp: 0 };
    }
    if (resolvedKit.mainWeaponId) {
      this.discoveredProficiencies.add(resolvedKit.mainWeaponId);
    }
    if (resolvedKit.offhandWeaponId) {
      this.discoveredProficiencies.add(resolvedKit.offhandWeaponId);
    }

    const recruitSnapshot: CharacterSnapshot = {
      id,
      name,
      avatarKey: 'companion-avatar',
      avatarTextureKey: 'companion-avatar',
      hp: 50,
      criticalHp: 25,
      energy: 100,
      equippedWeaponId: resolvedKit.mainWeaponId,
      offhandWeaponId: resolvedKit.offhandWeaponId,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      skillCooldownsRemainingMs: {},
      proficiencies: seedProficiencies,
      classLevels: {},
      classStats: {},
      unlockedClasses: [],
      activeClass: null,
      bookLearnedSkills: [],
      hunger: 100,
      mood: 80,
      state: 'idle'
    };
    return recruitSnapshot;
  }

  public getWood(): number {
    return Math.max(this.resources.wood ?? 0, this.inventory.get('wood') ?? 0);
  }

  public consumeWood(amount: number): boolean {
    const current = this.getWood();
    if (current >= amount) {
      this.resources.wood = current - amount;
      if (this.resources.wood <= 0) {
        this.inventory.delete('wood');
      } else {
        this.inventory.set('wood', this.resources.wood);
      }
      if (this.snapshot) {
        this.snapshot.resources.wood = this.resources.wood;
        this.snapshot.inventory = Object.fromEntries(this.inventory);
      }
      return true;
    }
    return false;
  }

  public addWood(amount: number): void {
    this.resources.wood = this.getWood() + amount;
    this.inventory.set('wood', this.resources.wood);
    if (this.snapshot) {
      this.snapshot.resources.wood = this.resources.wood;
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  public setWood(amount: number): void {
    this.resources.wood = Math.max(0, amount);
    if (this.resources.wood <= 0) {
      this.inventory.delete('wood');
    } else {
      this.inventory.set('wood', this.resources.wood);
    }
    if (this.snapshot) {
      this.snapshot.resources.wood = this.resources.wood;
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  public getOre(): number {
    return Math.max(this.resources.ore ?? 0, this.inventory.get('ore') ?? 0);
  }

  public consumeOre(amount: number): boolean {
    const current = this.getOre();
    if (current >= amount) {
      this.resources.ore = current - amount;
      if (this.resources.ore <= 0) {
        this.inventory.delete('ore');
      } else {
        this.inventory.set('ore', this.resources.ore);
      }
      if (this.snapshot) {
        this.snapshot.resources.ore = this.resources.ore;
        this.snapshot.inventory = Object.fromEntries(this.inventory);
      }
      return true;
    }
    return false;
  }

  public addOre(amount: number): void {
    this.resources.ore = this.getOre() + amount;
    this.inventory.set('ore', this.resources.ore);
    if (this.snapshot) {
      this.snapshot.resources.ore = this.resources.ore;
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  public setOre(amount: number): void {
    this.resources.ore = Math.max(0, amount);
    if (this.resources.ore <= 0) {
      this.inventory.delete('ore');
    } else {
      this.inventory.set('ore', this.resources.ore);
    }
    if (this.snapshot) {
      this.snapshot.resources.ore = this.resources.ore;
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  // --- Research Points & Tree Unlocks ---
  public getResearchPoints(): number {
    return this.researchPoints;
  }

  public addResearchPoints(amount: number): void {
    this.researchPoints += amount;
    if (this.snapshot) {
      this.snapshot.researchPoints = this.researchPoints;
    }
    this.onResearchPointsChanged?.(this.researchPoints, amount);
  }

  public consumeResearchPoints(amount: number): boolean {
    if (this.researchPoints >= amount) {
      this.researchPoints -= amount;
      if (this.snapshot) {
        this.snapshot.researchPoints = this.researchPoints;
      }
      this.onResearchPointsChanged?.(this.researchPoints, -amount);
      return true;
    }
    return false;
  }

  public isBuildableUnlocked(buildableId: string): boolean {
    return this.unlockedBuildables.has(buildableId);
  }

  public unlockBuildable(buildableId: string): void {
    this.unlockedBuildables.add(buildableId);
    if (this.snapshot) {
      this.snapshot.unlockedBuildables = Array.from(this.unlockedBuildables);
    }
    if (this.isSafeZone && this.snapshot) {
      this.saveToDisk();
    }
  }

  public getUnlockedBuildables(): string[] {
    return Array.from(this.unlockedBuildables);
  }

  public isResearchCompleted(researchId: string): boolean {
    return this.completedResearchIds.has(researchId);
  }

  public completeResearch(researchId: string): void {
    this.completedResearchIds.add(researchId);
    if (this.snapshot) {
      this.snapshot.completedResearchIds = Array.from(this.completedResearchIds);
    }
    if (this.isSafeZone && this.snapshot) {
      this.saveToDisk();
    }
  }

  public getCompletedResearch(): string[] {
    return Array.from(this.completedResearchIds);
  }

  public isDiggingUnlocked(): boolean {
    return this.isResearchCompleted('research_digging') || this.isResearchCompleted('digging');
  }

  public isSkinningUnlocked(): boolean {
    return this.isResearchCompleted('research_skinning') || this.isResearchCompleted('skinning');
  }

  public isButcheringUnlocked(): boolean {
    return this.isResearchCompleted('research_butchering') || this.isResearchCompleted('butchering');
  }

  public isGardeningUnlocked(): boolean {
    return this.isResearchCompleted('research_gardening') || this.isResearchCompleted('gardening');
  }

  // --- Clock & Game Day System (Milestone 7 & 39) ---
  public getCurrentGameDay(): number {
    return this.currentGameDay;
  }

  public getDayProgress(): number {
    return Math.min(1.0, this.dayProgressMs / this.dayDurationMs);
  }

  public getDayProgressMs(): number {
    return this.dayProgressMs;
  }

  public setDayProgressMs(ms: number): void {
    this.dayProgressMs = Math.max(0, ms);
    if (this.snapshot) {
      this.snapshot.dayProgressMs = this.dayProgressMs;
    }
  }

  public getDayDurationMs(): number {
    return this.dayDurationMs;
  }

  public setSafeZone(safe: boolean): void {
    this.isSafeZone = safe;
  }

  public getIsSafeZone(): boolean {
    return this.isSafeZone;
  }

  /**
   * Advances clock progress. When 1 full game day elapses (60s),
   * advances the day counter and triggers food spoilage check.
   */
  public updateClock(deltaMs: number): boolean {
    this.dayProgressMs += deltaMs;
    this.updateGardeningPlots();
    this.updateSeedMakers();
    if (this.dayProgressMs >= this.dayDurationMs) {
      const daysToAdvance = Math.floor(this.dayProgressMs / this.dayDurationMs);
      this.dayProgressMs = this.dayProgressMs % this.dayDurationMs;
      this.advanceGameDay(daysToAdvance);
      return true;
    }
    return false;
  }

  /**
   * Advances the game day counter by N days.
   * Runs food spoilage check immediately.
   */
  public advanceGameDay(days: number = 1): number {
    this.currentGameDay += days;
    console.log(`%c[Clock] 🌅 Game Day advanced by +${days} -> Day ${this.currentGameDay}`, 'color: #f59e0b; font-weight: bold;');
    this.updateGardeningPlots();
    const spoiled = this.checkFoodSpoilage();
    if (this.snapshot) {
      this.snapshot.currentGameDay = this.currentGameDay;
      this.snapshot.foodItems = [...this.foodItems];
    }
    return spoiled;
  }

  // --- Gardening System (Milestone 39) ---
  public getPlot(x: number, y: number): PlacedBuildable | undefined {
    return this.placedBuildables.find((b) => b.id === 'planting_plot' && b.x === x && b.y === y);
  }

  public getPlotState(x: number, y: number): PlantingPlotData | undefined {
    const plot = this.getPlot(x, y);
    if (!plot) return undefined;
    if (!plot.gardeningData) {
      plot.gardeningData = {
        state: 'empty',
        plantedAtDay: 0,
        plantedAtDayProgress: 0,
        growthDays: 1
      };
    }
    return plot.gardeningData;
  }

  public plantCrop(x: number, y: number, seedItemId: string = 'seeds'): boolean {
    const plot = this.getPlot(x, y);
    if (!plot) return false;
    const state = this.getPlotState(x, y);
    if (!state || state.state !== 'empty') return false;

    if (this.getItemCount(seedItemId) < 1) return false;
    this.consumeItem(seedItemId, 1);

    state.state = 'growing';
    state.plantedCropId = seedItemId;
    state.plantedAtDay = this.currentGameDay;
    state.plantedAtDayProgress = this.getDayProgress();
    state.growthDays = 1;
    return true;
  }

  public harvestCrop(x: number, y: number): { success: boolean; produceId: string; count: number } | null {
    const plot = this.getPlot(x, y);
    if (!plot) return null;
    const state = this.getPlotState(x, y);
    if (!state || state.state !== 'ready') return null;

    state.state = 'empty';
    state.plantedCropId = undefined;
    const produceId = 'vegetable';
    const count = 2; // Confirmed +2 vegetables per harvest
    this.addItem(produceId, count);
    return { success: true, produceId, count };
  }

  public updateGardeningPlots(): void {
    const currentDay = this.currentGameDay;
    const currentProgress = this.getDayProgress();

    for (const b of this.placedBuildables) {
      if (b.id === 'planting_plot' && b.gardeningData && b.gardeningData.state === 'growing') {
        const elapsedDays = (currentDay - b.gardeningData.plantedAtDay) + (currentProgress - b.gardeningData.plantedAtDayProgress);
        if (elapsedDays >= b.gardeningData.growthDays) {
          b.gardeningData.state = 'ready';
          console.log(`[Gardening] 🥕 Crop at (${b.x}, ${b.y}) is fully grown and ready for harvest!`);
        }
      }
    }
  }

  // --- Seed Maker System (Milestone 39) ---
  public getSeedMaker(x: number, y: number): PlacedBuildable | undefined {
    return this.placedBuildables.find((b) => b.id === 'seed_maker' && b.x === x && b.y === y);
  }

  public getSeedMakerState(x: number, y: number): SeedMakerData | undefined {
    const sm = this.getSeedMaker(x, y);
    if (!sm) return undefined;
    if (!sm.seedMakerData) {
      sm.seedMakerData = {
        state: 'idle',
        startedTimeMs: 0,
        durationMs: 10000,
        inputItem: 'vegetable',
        outputItem: 'seeds',
        outputCount: 2
      };
    }
    return sm.seedMakerData;
  }

  public insertSeedMakerProduce(x: number, y: number, produceId: string = 'vegetable', durationMs: number = 10000): boolean {
    const sm = this.getSeedMaker(x, y);
    if (!sm) return false;
    const state = this.getSeedMakerState(x, y);
    if (!state || state.state !== 'idle') return false;

    if (this.getItemCount(produceId) < 1) return false;
    this.consumeItem(produceId, 1);

    state.state = 'processing';
    state.inputItem = produceId;
    state.outputItem = 'seeds';
    state.outputCount = 2;
    state.startedTimeMs = Date.now();
    state.durationMs = durationMs;
    return true;
  }

  public collectSeedMakerSeeds(x: number, y: number): { success: boolean; count: number } | null {
    const sm = this.getSeedMaker(x, y);
    if (!sm) return null;
    const state = this.getSeedMakerState(x, y);
    if (!state || state.state !== 'ready') return null;

    const count = state.outputCount || 2;
    const outputItem = state.outputItem || 'seeds';
    state.state = 'idle';
    this.addItem(outputItem, count);
    return { success: true, count };
  }

  public updateSeedMakers(nowMs: number = Date.now()): void {
    for (const b of this.placedBuildables) {
      if (b.id === 'seed_maker' && b.seedMakerData && b.seedMakerData.state === 'processing') {
        const start = b.seedMakerData.startedTimeMs ?? 0;
        const dur = b.seedMakerData.durationMs ?? 10000;
        if (nowMs - start >= dur) {
          b.seedMakerData.state = 'ready';
          console.log(`[SeedMaker] ✨ Seed Maker at (${b.x}, ${b.y}) finished processing! Seeds ready for collection.`);
        }
      }
    }
  }

  // --- Food & Spoilage System (Milestone 7) ---
  /**
   * Checks all food items in inventory for spoilage.
   * A food item spoils and is completely deleted when:
   * currentGameDay >= acquiredDay + threshold
   */
  public checkFoodSpoilage(): number {
    const dataLoader = DataLoader.getInstance();
    const fresh: FoodItemInstance[] = [];
    let spoiledCount = 0;

    for (const item of this.foodItems) {
      const foodDef = dataLoader.getFood(item.id);
      const threshold = foodDef ? foodDef.spoilageDays : 7;
      if (this.currentGameDay >= item.acquiredDay + threshold) {
        spoiledCount++;
        console.log(
          `%c[Spoilage] 🪰 1x ${foodDef?.name || item.id} (acquired Day ${item.acquiredDay}) exceeded ${threshold}-day shelf life on Day ${this.currentGameDay} and was deleted.`,
          'color: #ef4444; font-weight: bold;'
        );
      } else {
        fresh.push(item);
      }
    }

    if (spoiledCount > 0) {
      this.foodItems = fresh;
      this.syncFoodInventory();
      this.onSpoilageCallback?.(spoiledCount);
    }
    return spoiledCount;
  }

  public addFoodItem(foodId: string, count: number = 1, quality?: FoodQuality): void {
    for (let i = 0; i < count; i++) {
      this.foodItems.push({
        id: foodId,
        acquiredDay: this.currentGameDay,
        instanceId: `${foodId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        quality: quality ?? 'common'
      });
    }
    this.syncFoodInventory();
    if (this.snapshot) {
      this.snapshot.foodItems = [...this.foodItems];
    }
    console.log(`[Food] Added ${count}x '${foodId}' (${quality ?? 'common'}) on Day ${this.currentGameDay}. Total: ${this.getFoodItemCount(foodId)}`);
  }

  // --- Recipe Discovery (Cooking System - Milestone 10) ---
  public discoverCookingRecipe(recipeId: string): boolean {
    if (!this.discoveredCookingRecipes.has(recipeId)) {
      this.discoveredCookingRecipes.add(recipeId);
      if (this.snapshot) {
        this.snapshot.discoveredCookingRecipes = Array.from(this.discoveredCookingRecipes);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[Cooking] ✨ Recipe permanently discovered: '${recipeId}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isCookingRecipeDiscovered(recipeId: string): boolean {
    return this.discoveredCookingRecipes.has(recipeId);
  }

  public getDiscoveredCookingRecipes(): string[] {
    return Array.from(this.discoveredCookingRecipes);
  }

  // --- Recipe Discovery (Alchemy System - Milestone 19) ---
  public discoverAlchemyRecipe(recipeId: string): boolean {
    if (!this.discoveredAlchemyRecipes.has(recipeId)) {
      this.discoveredAlchemyRecipes.add(recipeId);
      if (this.snapshot) {
        this.snapshot.discoveredAlchemyRecipes = Array.from(this.discoveredAlchemyRecipes);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[Alchemy] ✨ Recipe discovered: '${recipeId}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isAlchemyRecipeDiscovered(recipeId: string): boolean {
    return this.discoveredAlchemyRecipes.has(recipeId);
  }

  public getDiscoveredAlchemyRecipes(): string[] {
    return Array.from(this.discoveredAlchemyRecipes);
  }

  // --- Knowledge Base Discoveries (Milestone 50) ---
  public recordEnemyEncountered(enemyId: string): boolean {
    if (!this.encounteredEnemies.has(enemyId)) {
      this.encounteredEnemies.add(enemyId);
      if (this.snapshot) {
        this.snapshot.encounteredEnemies = Array.from(this.encounteredEnemies);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[KnowledgeBase] 🐺 First encountered enemy: '${enemyId}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isEnemyEncountered(enemyId: string): boolean {
    return this.encounteredEnemies.has(enemyId);
  }

  public getEncounteredEnemies(): string[] {
    return Array.from(this.encounteredEnemies);
  }

  public discoverProficiency(id: string): boolean {
    if (!this.discoveredProficiencies.has(id)) {
      this.discoveredProficiencies.add(id);
      if (this.snapshot) {
        this.snapshot.discoveredProficiencies = Array.from(this.discoveredProficiencies);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[KnowledgeBase] ⚔️ Proficiency discovered: '${id}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isProficiencyDiscovered(id: string): boolean {
    return this.discoveredProficiencies.has(id);
  }

  public getDiscoveredProficiencies(): string[] {
    return Array.from(this.discoveredProficiencies);
  }

  public discoverStatusEffect(id: string): boolean {
    if (!this.discoveredStatusEffects.has(id)) {
      this.discoveredStatusEffects.add(id);
      if (this.snapshot) {
        this.snapshot.discoveredStatusEffects = Array.from(this.discoveredStatusEffects);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[KnowledgeBase] 🧪 Status effect discovered: '${id}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isStatusEffectDiscovered(id: string): boolean {
    return this.discoveredStatusEffects.has(id);
  }

  public getDiscoveredStatusEffects(): string[] {
    return Array.from(this.discoveredStatusEffects);
  }

  public discoverGatheringNode(id: string): boolean {
    if (!this.discoveredGatheringNodes.has(id)) {
      this.discoveredGatheringNodes.add(id);
      if (this.snapshot) {
        this.snapshot.discoveredGatheringNodes = Array.from(this.discoveredGatheringNodes);
      }
      this.addResearchPoints(GameState.DISCOVERY_RP_BONUS);
      console.log(`[KnowledgeBase] 🪵 Gathering node discovered: '${id}'! (+${GameState.DISCOVERY_RP_BONUS} RP)`);
      return true;
    }
    return false;
  }

  public isGatheringNodeDiscovered(id: string): boolean {
    return this.discoveredGatheringNodes.has(id);
  }

  public getDiscoveredGatheringNodes(): string[] {
    return Array.from(this.discoveredGatheringNodes);
  }

  public resetDiscoveries(clearSnapshot: boolean = false): void {
    this.encounteredEnemies.clear();
    this.discoveredProficiencies = new Set(['short_swords']);
    this.discoveredStatusEffects.clear();
    this.discoveredGatheringNodes.clear();
    this.discoveredCookingRecipes.clear();
    if (clearSnapshot && this.snapshot) {
      this.snapshot.encounteredEnemies = [];
      this.snapshot.discoveredProficiencies = ['short_swords'];
      this.snapshot.discoveredStatusEffects = [];
      this.snapshot.discoveredGatheringNodes = [];
      this.snapshot.discoveredCookingRecipes = [];
    }
  }

  public consumeOldestFood(foodId: string): FoodItemInstance | null {
    const idx = this.foodItems.findIndex((f) => f.id === foodId);
    if (idx !== -1) {
      const consumed = this.foodItems.splice(idx, 1)[0];
      this.syncFoodInventory();
      if (this.snapshot) {
        this.snapshot.foodItems = [...this.foodItems];
      }
      return consumed;
    }
    return null;
  }

  public getFoodItemCount(foodId: string): number {
    return this.foodItems.filter((f) => f.id === foodId).length;
  }

  public getFoodItems(): FoodItemInstance[] {
    return [...this.foodItems];
  }

  private syncFoodInventory(): void {
    const counts: Record<string, number> = {};
    for (const item of this.foodItems) {
      counts[item.id] = (counts[item.id] || 0) + 1;
    }
    const dataLoader = DataLoader.getInstance();
    for (const food of dataLoader.getFoods()) {
      const c = counts[food.id] || 0;
      if (c > 0) {
        this.inventory.set(food.id, c);
      } else {
        this.inventory.delete(food.id);
      }
    }
    if (this.snapshot) {
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  // --- Inventory System (Bandages, Rations, etc.) ---
  public getItemCount(itemId: string): number {
    if (itemId === 'wood') {
      return this.getWood();
    }
    if (itemId === 'ore') {
      return this.getOre();
    }
    if (itemId === 'research_points') {
      return this.getResearchPoints();
    }
    const dataLoader = DataLoader.getInstance();
    if (dataLoader.getFood(itemId)) {
      return this.getFoodItemCount(itemId);
    }
    return this.inventory.get(itemId) || 0;
  }

  public addItem(itemId: string, count: number): void {
    if (itemId === 'wood') {
      this.addWood(count);
      return;
    }
    if (itemId === 'ore') {
      this.addOre(count);
      return;
    }
    if (itemId === 'research_points') {
      this.addResearchPoints(count);
      return;
    }
    const dataLoader = DataLoader.getInstance();
    if (dataLoader.getFood(itemId)) {
      this.addFoodItem(itemId, count);
      return;
    }
    const current = this.getItemCount(itemId);
    this.inventory.set(itemId, current + count);
    if (this.snapshot) {
      this.snapshot.inventory = Object.fromEntries(this.inventory);
    }
  }

  public consumeItem(itemId: string, count: number = 1): boolean {
    if (itemId === 'wood') {
      return this.consumeWood(count);
    }
    if (itemId === 'ore') {
      return this.consumeOre(count);
    }
    if (itemId === 'research_points') {
      return this.consumeResearchPoints(count);
    }
    const dataLoader = DataLoader.getInstance();
    if (dataLoader.getFood(itemId)) {
      for (let i = 0; i < count; i++) {
        if (!this.consumeOldestFood(itemId)) {
          return false;
        }
      }
      return true;
    }
    const current = this.getItemCount(itemId);
    if (current >= count) {
      const remaining = current - count;
      if (remaining <= 0) {
        this.inventory.delete(itemId);
      } else {
        this.inventory.set(itemId, remaining);
      }
      if (this.snapshot) {
        this.snapshot.inventory = Object.fromEntries(this.inventory);
      }
      return true;
    }
    return false;
  }

  public getAllStockpileCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    counts['wood'] = this.getWood();
    counts['ore'] = this.getOre();
    counts['research_points'] = this.getResearchPoints();

    for (const [key, value] of this.inventory.entries()) {
      counts[key] = value;
    }

    const dataLoader = DataLoader.getInstance();
    const foods = dataLoader.getFoods ? dataLoader.getFoods() : [];
    for (const food of foods) {
      const c = this.getFoodItemCount(food.id);
      if (c > 0) {
        counts[food.id] = c;
      }
    }
    return counts;
  }

  public getInventoryMap(): Map<string, number> {
    const map = new Map(this.inventory);
    map.set('wood', this.getWood());
    map.set('ore', this.getOre());
    return map;
  }

  // --- Milestone 51: Item Transfer & Discarding between Party Members ---
  public transferItem(fromPlayer: Player, toPlayer: Player, itemId: string, count: number = 1): boolean {
    if (fromPlayer === toPlayer || count <= 0) return false;
    if (fromPlayer.getItemCount(itemId) < count) return false;
    const removed = fromPlayer.removeItem(itemId, count);
    if (removed) {
      toPlayer.addItem(itemId, count);
      return true;
    }
    return false;
  }

  public discardItem(player: Player, itemId: string, count: number = 1): boolean {
    if (count <= 0) return false;
    return player.removeItem(itemId, count);
  }

  // --- Lockpicking System (Milestone 38) ---
  public attemptLockpick(
    memberProgression: ProgressionSystem,
    memberName: string = 'Guild Hero',
    rng: () => number = Math.random,
    playerEntity?: any
  ): LockpickAttemptResult {
    const result = LockpickingSystem.getInstance().attemptUnlock(memberProgression, memberName, rng, playerEntity);
    if (this.snapshot) {
      this.snapshot.inventory = Object.fromEntries(this.inventory);
      this.snapshot.researchPoints = this.researchPoints;
      this.snapshot.resources = { ...this.resources };
    }
    return result;
  }

  // --- Book-Learned Skills (Cross-class usability) ---
  public recordBookLearnedSkill(skillId: string): void {
    this.bookLearnedSkills.add(skillId);
    if (this.snapshot) {
      this.snapshot.bookLearnedSkills = Array.from(this.bookLearnedSkills);
    }
  }

  public isSkillBookLearned(skillId: string): boolean {
    return this.bookLearnedSkills.has(skillId);
  }

  public getBookLearnedSkills(): string[] {
    return Array.from(this.bookLearnedSkills);
  }

  public getPlacedBuildables(): PlacedBuildable[] {
    return [...this.placedBuildables];
  }

  public addPlacedBuildable(item: PlacedBuildable): void {
    // Replace any existing buildable on the exact same tile (e.g. wall replacing floor) or append
    this.removePlacedBuildable(item.x, item.y);
    this.placedBuildables.push(item);
    if (this.snapshot) {
      this.snapshot.placedBuildables = [...this.placedBuildables];
    }
    if (this.isSafeZone && this.snapshot) {
      this.saveToDisk();
    }
  }

  public removePlacedBuildable(x: number, y: number): PlacedBuildable | undefined {
    const idx = this.placedBuildables.findIndex((b) => b.x === x && b.y === y);
    if (idx !== -1) {
      const removed = this.placedBuildables.splice(idx, 1)[0];
      if (this.snapshot) {
        this.snapshot.placedBuildables = [...this.placedBuildables];
      }
      if (this.isSafeZone && this.snapshot) {
        this.saveToDisk();
      }
      return removed;
    }
    return undefined;
  }

  public hasSnapshot(): boolean {
    return this.snapshot !== null;
  }

  public getSnapshot(): PlayerSnapshot | null {
    return this.snapshot;
  }

  public getPartySnapshots(): CharacterSnapshot[] {
    return [...this.partySnapshots];
  }

  public addCompanionToParty(companion: any, sceneTime: number = 0): void {
    const snap: CharacterSnapshot = ('getSnapshot' in companion)
      ? companion.getSnapshot(sceneTime)
      : companion;
    const existingIdx = this.partySnapshots.findIndex((m) => m.id === snap.id);
    if (existingIdx !== -1) {
      this.partySnapshots[existingIdx] = snap;
    } else {
      this.partySnapshots.push(snap);
    }
    if (this.snapshot) {
      this.snapshot.party = [...this.partySnapshots];
    }
    console.log(`[GameState] Added/Updated companion '${snap.name}' (id: ${snap.id}) in party. Total members: ${this.partySnapshots.length}`);
  }

  /**
   * Captures snapshots of all active party members at scene transition.
   */
  public savePartySnapshot(party: Player[], sceneTime: number): void {
    this.partySnapshots = party.map((p) => p.getSnapshot(sceneTime));
    if (this.partySnapshots.length > 0) {
      const leader = this.partySnapshots[0];
      this.snapshot = {
        hp: leader.hp,
        criticalHp: leader.criticalHp,
        energy: leader.energy,
        knownSkillIds: [...leader.knownSkillIds],
        equippedSkillIds: [...leader.equippedSkillIds],
        autocastMap: { ...leader.autocastMap },
        skillCooldownsRemainingMs: { ...leader.skillCooldownsRemainingMs },
        proficiencies: { ...leader.proficiencies },
        classLevels: { ...leader.classLevels },
        unlockedClasses: [...leader.unlockedClasses],
        classStats: leader.classStats ? { ...leader.classStats } : undefined,
        activeClass: leader.activeClass ?? null,
        resources: { ...this.resources },
        placedBuildables: [...this.placedBuildables],
        researchPoints: this.researchPoints,
        unlockedBuildables: Array.from(this.unlockedBuildables),
        completedResearchIds: Array.from(this.completedResearchIds),
        inventory: Object.fromEntries(this.inventory),
        bookLearnedSkills: leader.bookLearnedSkills ? [...leader.bookLearnedSkills] : [],
        hunger: leader.hunger,
        mood: leader.mood,
        currentGameDay: this.currentGameDay,
        dayProgressMs: this.dayProgressMs,
        foodItems: [...this.foodItems],
        equippedWeaponId: leader.equippedWeaponId,
        offhandWeaponId: leader.offhandWeaponId,
        equippedHelmetId: leader.equippedHelmetId,
        equippedBodyArmorId: leader.equippedBodyArmorId,
        equippedNecklaceId: leader.equippedNecklaceId,
        equippedRingId: leader.equippedRingId,
        equippedAccessoryId: leader.equippedAccessoryId,
        party: [...this.partySnapshots],
        discoveredCookingRecipes: Array.from(this.discoveredCookingRecipes),
        discoveredAlchemyRecipes: Array.from(this.discoveredAlchemyRecipes),
        dungeonFloorCount: this.dungeonFloorCount,
        lifetimeDungeonFloorCount: this.lifetimeDungeonFloorCount,
        encounteredEnemies: Array.from(this.encounteredEnemies),
        discoveredProficiencies: Array.from(this.discoveredProficiencies),
        discoveredStatusEffects: Array.from(this.discoveredStatusEffects),
        discoveredGatheringNodes: Array.from(this.discoveredGatheringNodes)
      };
    }
    console.log(
      `%c[SceneTransition Handoff-OUT] Saved party snapshot (${party.length} members) at sceneTime=${sceneTime.toFixed(0)}ms:`,
      'color: #38bdf8; font-weight: bold;',
      this.partySnapshots
    );
  }

  /**
   * Called strictly at scene exit / transition.
   * Captures snapshot of live Player entity and ProgressionSystem.
   */
  public saveSnapshot(player: Player, progression: ProgressionSystem, sceneTime: number): void {
    const dataLoader = DataLoader.getInstance();
    const autocastObj: Record<string, boolean> = {};
    for (const [k, v] of player.autocastMap.entries()) {
      autocastObj[k] = v;
    }

    // Cooldown conversion: scene-relative timestamp -> absolute remaining duration in ms
    const remainingCooldowns: Record<string, number> = {};
    for (const skillId of player.equippedSkillIds) {
      const skillDef = dataLoader.getSkill(skillId);
      if (skillDef) {
        const lastUsed = player.lastSkillUseTimes.get(skillId) || 0;
        if (lastUsed > 0) {
          const elapsed = sceneTime - lastUsed;
          const remaining = Math.max(0, skillDef.cooldownMs - elapsed);
          if (remaining > 0) {
            remainingCooldowns[skillId] = remaining;
          }
        }
      }
    }

    const progData = progression.getSnapshotData();
    const playerSnap = player.getSnapshot(sceneTime);

    const existingIdx = this.partySnapshots.findIndex((m) => m.id === player.id);
    if (existingIdx !== -1) {
      this.partySnapshots[existingIdx] = playerSnap;
    } else {
      this.partySnapshots.push(playerSnap);
    }

    this.snapshot = {
      hp: player.hp,
      criticalHp: player.criticalHp,
      energy: player.energy,
      knownSkillIds: [...player.knownSkillIds],
      equippedSkillIds: [...player.equippedSkillIds],
      autocastMap: autocastObj,
      skillCooldownsRemainingMs: remainingCooldowns,
      proficiencies: progData.proficiencies,
      classLevels: progData.classLevels,
      unlockedClasses: progData.unlockedClasses,
      classStats: progData.classStats,
      activeClass: player.activeClass,
      activityCounts: progData.activityCounts,
      resources: { ...this.resources },
      placedBuildables: [...this.placedBuildables],
      researchPoints: this.researchPoints,
      unlockedBuildables: Array.from(this.unlockedBuildables),
      completedResearchIds: Array.from(this.completedResearchIds),
      inventory: Object.fromEntries(this.inventory),
      bookLearnedSkills: Array.from(player.bookLearnedSkills),
      hunger: player.hunger,
      mood: player.mood,
      currentGameDay: this.currentGameDay,
      dayProgressMs: this.dayProgressMs,
      foodItems: [...this.foodItems],
      equippedWeaponId: player.equippedWeapon.id,
      offhandWeaponId: player.offhandWeapon?.id ?? null,
      equippedHelmetId: player.equippedHelmet?.id ?? null,
      equippedBodyArmorId: player.equippedBodyArmor?.id ?? null,
      equippedNecklaceId: player.equippedNecklace?.id ?? null,
      equippedRingId: player.equippedRing?.id ?? null,
      equippedAccessoryId: player.equippedAccessory?.id ?? null,
      party: [...this.partySnapshots],
      discoveredCookingRecipes: Array.from(this.discoveredCookingRecipes),
      discoveredAlchemyRecipes: Array.from(this.discoveredAlchemyRecipes),
      dungeonFloorCount: this.dungeonFloorCount,
      lifetimeDungeonFloorCount: this.lifetimeDungeonFloorCount,
      encounteredEnemies: Array.from(this.encounteredEnemies),
      discoveredProficiencies: Array.from(this.discoveredProficiencies),
      discoveredStatusEffects: Array.from(this.discoveredStatusEffects),
      discoveredGatheringNodes: Array.from(this.discoveredGatheringNodes)
    };

    console.log(
      `%c[SceneTransition Handoff-OUT] Saved state snapshot at sceneTime=${sceneTime.toFixed(0)}ms:\n` +
      `  HP: ${this.snapshot.hp.toFixed(1)} / ${player.maxHp}\n` +
      `  Critical HP: ${this.snapshot.criticalHp.toFixed(1)} / ${player.maxCriticalHp}\n` +
      `  Energy: ${this.snapshot.energy.toFixed(1)} / ${player.maxEnergy}\n` +
      `  Equipped Skills: [${this.snapshot.equippedSkillIds.join(', ')}]\n` +
      `  Autocast: ${JSON.stringify(this.snapshot.autocastMap)}\n` +
      `  Remaining Cooldowns (ms): ${JSON.stringify(this.snapshot.skillCooldownsRemainingMs)}\n` +
      `  Proficiencies: ${JSON.stringify(this.snapshot.proficiencies)}\n` +
      `  Unlocked Classes: [${this.snapshot.unlockedClasses.join(', ')}]\n` +
      `  Wood: ${this.resources.wood}\n` +
      `  Placed Buildables: ${this.placedBuildables.length}\n` +
      `  Day: ${this.currentGameDay}, Hunger: ${this.snapshot.hunger?.toFixed(1)}, Mood: ${this.snapshot.mood?.toFixed(1)}, Rations: ${this.getFoodItemCount('ration')}`,
      'color: #38bdf8; font-weight: bold;'
    );
  }

  /**
   * Called strictly at scene creation.
   * Restores state into newly instantiated Player and ProgressionSystem.
   */
  public restoreTo(player: Player, progression: ProgressionSystem, sceneTime: number): void {
    if (!this.snapshot) {
      console.warn('[GameState] No snapshot available to restore. Using defaults.');
      return;
    }

    const snap = this.snapshot;
    player.hp = snap.hp;
    player.criticalHp = snap.criticalHp;
    player.energy = snap.energy;
    player.knownSkillIds = [...snap.knownSkillIds];
    player.equippedSkillIds = [...snap.equippedSkillIds];

    if (snap.resources) {
      this.resources = { ...snap.resources, wood: snap.resources.wood ?? 0, ore: snap.resources.ore ?? 0 };
      if (this.resources.wood > 0) {
        this.inventory.set('wood', this.resources.wood);
      }
      if (this.resources.ore > 0) {
        this.inventory.set('ore', this.resources.ore);
      }
    }
    if (snap.placedBuildables) {
      this.placedBuildables = [...snap.placedBuildables];
    }

    if (snap.researchPoints !== undefined) {
      this.researchPoints = snap.researchPoints;
    }
    if (snap.unlockedBuildables) {
      this.unlockedBuildables = new Set(snap.unlockedBuildables);
    }
    if (snap.completedResearchIds) {
      this.completedResearchIds = new Set(snap.completedResearchIds);
    }
    if (snap.inventory) {
      this.inventory.clear();
      for (const [k, v] of Object.entries(snap.inventory)) {
        this.inventory.set(k, v);
      }
    }
    if (snap.bookLearnedSkills) {
      this.bookLearnedSkills = new Set(snap.bookLearnedSkills);
      player.bookLearnedSkills = new Set(snap.bookLearnedSkills);
    }
    if (snap.hunger !== undefined) {
      player.hunger = snap.hunger;
    }
    if (snap.mood !== undefined) {
      player.mood = snap.mood;
    }
    if (snap.currentGameDay !== undefined) {
      this.currentGameDay = snap.currentGameDay;
    }
    if (snap.dayProgressMs !== undefined) {
      this.dayProgressMs = snap.dayProgressMs;
    }
    if (snap.foodItems) {
      this.foodItems = [...snap.foodItems];
      this.syncFoodInventory();
    }
    if (snap.discoveredCookingRecipes) {
      this.discoveredCookingRecipes = new Set(snap.discoveredCookingRecipes);
    }
    if (snap.discoveredAlchemyRecipes) {
      this.discoveredAlchemyRecipes = new Set(snap.discoveredAlchemyRecipes);
    }
    if (snap.encounteredEnemies) {
      this.encounteredEnemies = new Set(snap.encounteredEnemies);
    }
    if (snap.discoveredProficiencies) {
      this.discoveredProficiencies = new Set(snap.discoveredProficiencies);
    }
    if (snap.discoveredStatusEffects) {
      this.discoveredStatusEffects = new Set(snap.discoveredStatusEffects);
    }
    if (snap.discoveredGatheringNodes) {
      this.discoveredGatheringNodes = new Set(snap.discoveredGatheringNodes);
    }
    if (snap.dungeonFloorCount !== undefined) {
      this.dungeonFloorCount = snap.dungeonFloorCount;
    }
    if (snap.lifetimeDungeonFloorCount !== undefined) {
      this.lifetimeDungeonFloorCount = snap.lifetimeDungeonFloorCount;
    }

    player.autocastMap.clear();
    for (const [k, v] of Object.entries(snap.autocastMap)) {
      player.autocastMap.set(k, v);
    }

    progression.loadSnapshotData({
      proficiencies: snap.proficiencies,
      classLevels: snap.classLevels,
      unlockedClasses: snap.unlockedClasses,
      activityCounts: snap.activityCounts,
      classStats: snap.classStats
    });

    if (snap.activeClass !== undefined) {
      player.activeClass = snap.activeClass;
    }

    // Re-anchor remaining cooldowns in the new scene's relative clock
    const dataLoader = DataLoader.getInstance();
    player.lastSkillUseTimes.clear();
    const verifiedRemaining: Record<string, number> = {};

    for (const [skillId, remainingMs] of Object.entries(snap.skillCooldownsRemainingMs)) {
      const skillDef = dataLoader.getSkill(skillId);
      if (skillDef && remainingMs > 0) {
        const reanchoredLastUsed = sceneTime - (skillDef.cooldownMs - remainingMs);
        player.lastSkillUseTimes.set(skillId, reanchoredLastUsed);
        verifiedRemaining[skillId] = Math.max(0, skillDef.cooldownMs - (sceneTime - reanchoredLastUsed));
      }
    }

    if (snap.equippedWeaponId) {
      const mainWpn = dataLoader.getWeapon(snap.equippedWeaponId);
      if (mainWpn) player.equippedWeapon = mainWpn;
    }
    if (snap.offhandWeaponId) {
      const offWpn = dataLoader.getWeapon(snap.offhandWeaponId);
      player.offhandWeapon = offWpn ?? null;
    } else {
      player.offhandWeapon = null;
    }

    if (snap.equippedHelmetId) {
      const helmet = dataLoader.getArmor(snap.equippedHelmetId);
      player.equippedHelmet = helmet ?? null;
    } else {
      player.equippedHelmet = null;
    }
    if (snap.equippedBodyArmorId) {
      const bodyArmor = dataLoader.getArmor(snap.equippedBodyArmorId);
      player.equippedBodyArmor = bodyArmor ?? null;
    } else {
      player.equippedBodyArmor = null;
    }
    if (snap.equippedNecklaceId) {
      const necklace = dataLoader.getArmor(snap.equippedNecklaceId);
      player.equippedNecklace = necklace ?? null;
    } else {
      player.equippedNecklace = null;
    }
    if (snap.equippedRingId) {
      const ring = dataLoader.getArmor(snap.equippedRingId);
      player.equippedRing = ring ?? null;
    } else {
      player.equippedRing = null;
    }
    if (snap.equippedAccessoryId) {
      const accessory = dataLoader.getArmor(snap.equippedAccessoryId);
      player.equippedAccessory = accessory ?? null;
    } else {
      player.equippedAccessory = null;
    }
    player.recalculateMaxHp();

    // Ensure HP and Critical HP are safely clamped to the recalculated maxes
    player.hp = Math.min(player.maxHp, snap.hp);
    if (snap.criticalHp >= 25 && player.maxCriticalHp > 25) {
      player.criticalHp = player.maxCriticalHp;
    } else {
      player.criticalHp = Math.min(player.maxCriticalHp, snap.criticalHp);
    }

    // Downed state restoration
    // Two-bar system: Downed only occurs when BOTH Main HP and Critical HP reach zero.
    // When Main HP <= 0 but Critical HP > 0, the character is in Critical state (conscious, warning-only), NOT downed.
    const leaderSnap = snap.party?.[0];
    const isLeaderDowned = (leaderSnap?.state === 'downed' || (player.hp <= 0 && player.criticalHp <= 0)) && player.hp <= 0 && player.criticalHp <= 0;
    if (isLeaderDowned) {
      player.state = 'downed';
      (player as any).avatarSprite?.setAngle(90);
      (player as any).avatarSprite?.setAlpha(0.6);
    } else {
      player.state = 'idle';
      (player as any).avatarSprite?.setAngle(0);
      (player as any).avatarSprite?.setAlpha(1);
    }

    if (leaderSnap?.inventory) {
      if (!player.inventory) player.inventory = new Map();
      player.inventory.clear();
      for (const [k, v] of Object.entries(leaderSnap.inventory)) {
        if (v > 0) player.inventory.set(k, v);
      }
    } else if (snap.inventory) {
      if (!player.inventory) player.inventory = new Map();
      player.inventory.clear();
      for (const [k, v] of Object.entries(snap.inventory)) {
        if (v > 0) player.inventory.set(k, v);
      }
    }
    if (typeof player.updateEncumbrance === 'function') {
      player.updateEncumbrance();
    }

    player.drawHpBar();

    console.log(
      `%c[SceneTransition Handoff-IN] Restored state into new scene at sceneTime=${sceneTime.toFixed(0)}ms:\n` +
      `  HP: ${player.hp.toFixed(1)} / ${player.maxHp}\n` +
      `  Critical HP: ${player.criticalHp.toFixed(1)} / ${player.maxCriticalHp}\n` +
      `  Energy: ${player.energy.toFixed(1)} / ${player.maxEnergy}\n` +
      `  Equipped Skills: [${player.equippedSkillIds.join(', ')}]\n` +
      `  Autocast: ${JSON.stringify(Object.fromEntries(player.autocastMap))}\n` +
      `  Remaining Cooldowns (ms): ${JSON.stringify(verifiedRemaining)}\n` +
      `  Proficiencies: ${JSON.stringify(progression.getSnapshotData().proficiencies)}\n` +
      `  Unlocked Classes: [${progression.getSnapshotData().unlockedClasses.join(', ')}]\n` +
      `  Day: ${this.currentGameDay}, Hunger: ${player.hunger.toFixed(1)}, Mood: ${player.mood.toFixed(1)}, Rations: ${this.getFoodItemCount('ration')}`,
      'color: #4ade80; font-weight: bold;'
    );
  }

  public getDungeonFloorCount(): number {
    return this.dungeonFloorCount;
  }

  public getLifetimeDungeonFloorCount(): number {
    return this.lifetimeDungeonFloorCount;
  }

  public resetDungeonFloorCount(): void {
    this.dungeonFloorCount = 0;
    if (this.snapshot) {
      this.snapshot.dungeonFloorCount = 0;
    }
  }

  public setDungeonFloorCount(count: number): void {
    this.dungeonFloorCount = count;
    if (count > this.lifetimeDungeonFloorCount) {
      this.lifetimeDungeonFloorCount = count;
    }
    if (this.snapshot) {
      this.snapshot.dungeonFloorCount = count;
    }
  }

  public setLifetimeDungeonFloorCount(count: number): void {
    this.lifetimeDungeonFloorCount = Math.max(0, count);
    if (this.snapshot) {
      this.snapshot.lifetimeDungeonFloorCount = this.lifetimeDungeonFloorCount;
    }
  }

  public incrementDungeonFloorCount(): number {
    this.dungeonFloorCount++;
    this.lifetimeDungeonFloorCount++;
    if (this.snapshot) {
      this.snapshot.dungeonFloorCount = this.dungeonFloorCount;
      this.snapshot.lifetimeDungeonFloorCount = this.lifetimeDungeonFloorCount;
    }
    return this.dungeonFloorCount;
  }

  // --- Client-Side Persistence System (Milestone: Persistent Saves) ---
  public getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage;
      }
    } catch {
      return null;
    }
    return null;
  }

  public isStorageAvailable(): boolean {
    try {
      const storage = this.getStorage();
      if (!storage) return false;
      const testKey = '__rpg_storage_probe__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  public getLastSaveError(): string | null {
    return this.lastSaveError;
  }

  public hasSave(): boolean {
    return this.getSaveMetadata() !== null;
  }

  public getSaveMetadata(): SaveMetadata | null {
    try {
      const storage = this.getStorage();
      if (!storage) return null;
      const raw = storage.getItem(GameState.SAVE_STORAGE_KEY);
      if (!raw) return null;
      const saveFile = JSON.parse(raw) as GameSaveFile;
      return saveFile?.metadata ?? null;
    } catch {
      return null;
    }
  }

  public getTutorialState(): { step: number; completed: boolean; dismissed: boolean } {
    return {
      step: this.tutorialStep,
      completed: this.tutorialCompleted,
      dismissed: this.tutorialDismissed
    };
  }

  public setTutorialState(state: { step?: number; completed?: boolean; dismissed?: boolean }): void {
    if (typeof state.step === 'number') this.tutorialStep = state.step;
    if (typeof state.completed === 'boolean') this.tutorialCompleted = state.completed;
    if (typeof state.dismissed === 'boolean') this.tutorialDismissed = state.dismissed;
  }

  public saveToDisk(): boolean {
    this.lastSaveError = null;
    try {
      const storage = this.getStorage();
      if (!storage) {
        throw new Error('Browser localStorage is not available or blocked.');
      }

      if (!this.snapshot) {
        throw new Error('No GameState snapshot available to persist.');
      }

      // Synchronize latest Outpost-state into snapshot before saving
      this.snapshot.resources = { ...this.resources };
      this.snapshot.placedBuildables = [...this.placedBuildables];
      this.snapshot.researchPoints = this.researchPoints;
      this.snapshot.unlockedBuildables = Array.from(this.unlockedBuildables);
      this.snapshot.completedResearchIds = Array.from(this.completedResearchIds);
      this.snapshot.inventory = Object.fromEntries(this.inventory);
      this.snapshot.bookLearnedSkills = Array.from(this.bookLearnedSkills);
      this.snapshot.currentGameDay = this.currentGameDay;
      this.snapshot.dayProgressMs = this.dayProgressMs;
      this.snapshot.foodItems = [...this.foodItems];
      this.snapshot.party = [...this.partySnapshots];
      this.snapshot.discoveredCookingRecipes = Array.from(this.discoveredCookingRecipes);
      this.snapshot.discoveredAlchemyRecipes = Array.from(this.discoveredAlchemyRecipes);
      this.snapshot.dungeonFloorCount = this.dungeonFloorCount;
      this.snapshot.lifetimeDungeonFloorCount = this.lifetimeDungeonFloorCount;
      this.snapshot.encounteredEnemies = Array.from(this.encounteredEnemies);
      this.snapshot.discoveredProficiencies = Array.from(this.discoveredProficiencies);
      this.snapshot.discoveredStatusEffects = Array.from(this.discoveredStatusEffects);
      this.snapshot.discoveredGatheringNodes = Array.from(this.discoveredGatheringNodes);
      this.snapshot.tutorialStep = this.tutorialStep;
      this.snapshot.tutorialCompleted = this.tutorialCompleted;
      this.snapshot.tutorialDismissed = this.tutorialDismissed;

      const leader = this.partySnapshots[0];
      const metadata: SaveMetadata = {
        leaderName: leader?.name || 'Hero',
        gameDay: this.currentGameDay,
        partySize: this.partySnapshots.length,
        researchPoints: this.researchPoints,
        wood: this.getWood(),
        ore: this.getOre(),
        saveTime: Date.now(),
        saveVersion: GameState.SAVE_VERSION
      };

      const saveFile: GameSaveFile = {
        version: GameState.SAVE_VERSION,
        savedAt: Date.now(),
        metadata,
        snapshot: this.snapshot
      };

      const serialized = JSON.stringify(saveFile);
      storage.setItem(GameState.SAVE_STORAGE_KEY, serialized);
      console.log(
        `%c[GameState] 💾 Checkpoint persisted to storage (Day ${metadata.gameDay}, ${metadata.partySize} members, ${serialized.length} bytes)`,
        'color: #10b981; font-weight: bold;'
      );
      return true;
    } catch (err: any) {
      const errMsg = err?.message || 'Storage quota exceeded or storage disabled';
      this.lastSaveError = errMsg;
      console.error('[GameState] ❌ Failed to persist save to disk:', err);
      this.onSaveFailedCallback?.(errMsg);
      return false;
    }
  }

  public loadFromDisk(): boolean {
    this.lastSaveError = null;
    try {
      const storage = this.getStorage();
      if (!storage) {
        throw new Error('Browser localStorage is not available or blocked.');
      }
      const raw = storage.getItem(GameState.SAVE_STORAGE_KEY);
      if (!raw) {
        console.warn('[GameState] No save data found in storage to load.');
        return false;
      }
      const saveFile = JSON.parse(raw) as GameSaveFile;
      if (!saveFile || !saveFile.snapshot) {
        throw new Error('Save file is malformed or missing snapshot.');
      }
      this.restoreFromLoadedSnapshot(saveFile.snapshot);
      console.log(
        `%c[GameState] 📂 Successfully loaded save from storage (Day ${saveFile.metadata?.gameDay ?? this.currentGameDay}, Leader: ${saveFile.metadata?.leaderName ?? 'Hero'})`,
        'color: #38bdf8; font-weight: bold;'
      );
      return true;
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to load save from storage';
      this.lastSaveError = errMsg;
      console.error('[GameState] ❌ Failed to load save from disk:', err);
      return false;
    }
  }

  public restoreFromLoadedSnapshot(snap: PlayerSnapshot): void {
    this.snapshot = snap;
    this.partySnapshots = snap.party ? [...snap.party] : [];

    this.resources = {
      ...(snap.resources ?? {}),
      wood: snap.resources?.wood ?? 0,
      ore: (snap.resources as any)?.ore ?? 0
    };

    this.placedBuildables = snap.placedBuildables ? JSON.parse(JSON.stringify(snap.placedBuildables)) : [];
    this.researchPoints = snap.researchPoints ?? 0;
    this.unlockedBuildables = new Set(snap.unlockedBuildables ?? ['floor', 'wall', 'door', 'bed', 'research_station']);
    this.completedResearchIds = new Set(snap.completedResearchIds ?? []);

    this.inventory.clear();
    if (snap.inventory) {
      for (const [k, v] of Object.entries(snap.inventory)) {
        this.inventory.set(k, v);
      }
    }
    if (this.resources.wood > 0) {
      this.inventory.set('wood', this.resources.wood);
    }
    if (this.resources.ore > 0) {
      this.inventory.set('ore', this.resources.ore);
    }

    this.bookLearnedSkills = new Set(snap.bookLearnedSkills ?? []);
    this.discoveredCookingRecipes = new Set(snap.discoveredCookingRecipes ?? []);
    this.discoveredAlchemyRecipes = new Set(snap.discoveredAlchemyRecipes ?? ['bandage', 'antidote', 'energy_potion', 'escape_stone']);
    this.encounteredEnemies = new Set(snap.encounteredEnemies ?? []);
    this.discoveredProficiencies = new Set(snap.discoveredProficiencies ?? []);
    this.discoveredStatusEffects = new Set(snap.discoveredStatusEffects ?? []);
    this.discoveredGatheringNodes = new Set(snap.discoveredGatheringNodes ?? []);

    this.tutorialStep = snap.tutorialStep ?? 0;
    this.tutorialCompleted = snap.tutorialCompleted ?? false;
    this.tutorialDismissed = snap.tutorialDismissed ?? false;

    this.currentGameDay = snap.currentGameDay ?? 1;
    this.dayProgressMs = snap.dayProgressMs ?? 0;
    this.foodItems = snap.foodItems ? [...snap.foodItems] : [];
    this.dungeonFloorCount = snap.dungeonFloorCount ?? 0;
    this.lifetimeDungeonFloorCount = snap.lifetimeDungeonFloorCount ?? 0;

    this.syncFoodInventory();
    this.isInitialized = true;
  }

  public clearSave(): boolean {
    try {
      const storage = this.getStorage();
      if (storage) {
        storage.removeItem(GameState.SAVE_STORAGE_KEY);
      }
      this.lastSaveError = null;
      console.log('%c[GameState] 🗑️ Saved game deleted from storage.', 'color: #f59e0b; font-weight: bold;');
      return true;
    } catch (err: any) {
      console.error('[GameState] ❌ Failed to clear save from disk:', err);
      return false;
    }
  }

  public resetToDefault(playerData?: PlayerData, startingKitId?: string): void {
    this.snapshot = null;
    this.partySnapshots = [];
    this.isInitialized = false;
    this.resources = { wood: 100, ore: 0 };
    this.placedBuildables = [];
    this.researchPoints = 0;
    this.unlockedBuildables = new Set(['floor', 'wall', 'door', 'bed', 'research_station']);
    this.completedResearchIds = new Set();
    this.inventory.clear();
    this.bookLearnedSkills = new Set();
    this.discoveredCookingRecipes = new Set();
    this.discoveredAlchemyRecipes = new Set(['bandage', 'antidote', 'energy_potion', 'escape_stone']);
    this.encounteredEnemies = new Set();
    this.discoveredProficiencies = new Set();
    this.discoveredStatusEffects = new Set();
    this.discoveredGatheringNodes = new Set();
    this.tutorialStep = 0;
    this.tutorialCompleted = false;
    this.tutorialDismissed = false;
    this.currentGameDay = 1;
    this.dayProgressMs = 0;
    this.foodItems = [];
    this.dungeonFloorCount = 0;
    this.lifetimeDungeonFloorCount = 0;
    this.lastSaveError = null;

    const data = playerData || DataLoader.getInstance().getPlayer();
    if (data) {
      this.initFromPlayerData(data, startingKitId);
    }
  }
}
