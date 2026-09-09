import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import type { PlayerData, PlayerSnapshot, CharacterSnapshot, PlacedBuildable, TrainableStat, FoodItemInstance, FoodQuality } from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';

export class GameState {
  private static instance: GameState;
  private snapshot: PlayerSnapshot | null = null;
  private partySnapshots: CharacterSnapshot[] = [];
  private isInitialized: boolean = false;
  private resources: { wood: number; ore: number; [key: string]: number } = { wood: 100, ore: 0 };
  private placedBuildables: PlacedBuildable[] = [];
  private researchPoints: number = 0;
  private unlockedBuildables: Set<string> = new Set(['floor', 'wall', 'door', 'bed', 'research_station']);
  private inventory: Map<string, number> = new Map();
  private bookLearnedSkills: Set<string> = new Set();
  private discoveredCookingRecipes: Set<string> = new Set();
  private discoveredAlchemyRecipes: Set<string> = new Set(['bandage', 'energy_potion']);

  // Milestone 7: Day/Clock, Food & Mood Systems
  private currentGameDay: number = 1;
  private dayProgressMs: number = 0;
  private dayDurationMs: number = 60000; // 60s real-time per game day
  private foodItems: FoodItemInstance[] = [];
  private isSafeZone: boolean = false;
  public onSpoilageCallback?: (spoiledCount: number) => void;

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
      const pool = DataLoader.getInstance().getOffensiveMagicSchools();
      if (pool.length === 0) {
        throw new Error('Cannot resolve Random Magic Staff: No offensive magic schools available.');
      }
      const selected = pool[Math.floor(rng() * pool.length)];
      return {
        mainWeaponId: selected.id,
        offhandWeaponId: null
      };
    } else if (kitId === 'sword_and_shield') {
      return { mainWeaponId: 'short_swords', offhandWeaponId: 'shields' };
    } else if (kitId === '2h_longsword') {
      return { mainWeaponId: 'longswords', offhandWeaponId: null };
    } else if (kitId === 'bow_and_dagger') {
      return { mainWeaponId: 'bows', offhandWeaponId: 'daggers' };
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

    const seedProficiencies: Record<string, TrainableStat> = {
      [initialMainWeapon]: { level: 0, currentExp: 0 },
      construction: { level: 0, currentExp: 0 }
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
      offhandWeaponId: initialOffhandWeapon
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
      unlockedClasses: [],
      bookLearnedSkills: [],
      hunger: 100,
      mood: 80,
      state: 'idle'
    };

    this.partySnapshots = [heroSnapshot];
    this.snapshot.party = [heroSnapshot];

    this.isInitialized = true;
    console.log('[GameState] Initialized from player.json boot seed:', this.snapshot);
  }

  public getWood(): number {
    return this.resources.wood ?? 0;
  }

  public consumeWood(amount: number): boolean {
    if ((this.resources.wood ?? 0) >= amount) {
      this.resources.wood -= amount;
      if (this.snapshot) {
        this.snapshot.resources.wood = this.resources.wood;
      }
      return true;
    }
    return false;
  }

  public addWood(amount: number): void {
    this.resources.wood = (this.resources.wood ?? 0) + amount;
    if (this.snapshot) {
      this.snapshot.resources.wood = this.resources.wood;
    }
  }

  public setWood(amount: number): void {
    this.resources.wood = Math.max(0, amount);
    if (this.snapshot) {
      this.snapshot.resources.wood = this.resources.wood;
    }
  }

  public getOre(): number {
    return this.resources.ore ?? 0;
  }

  public consumeOre(amount: number): boolean {
    if ((this.resources.ore ?? 0) >= amount) {
      this.resources.ore -= amount;
      if (this.snapshot) {
        this.snapshot.resources.ore = this.resources.ore;
      }
      return true;
    }
    return false;
  }

  public addOre(amount: number): void {
    this.resources.ore = (this.resources.ore ?? 0) + amount;
    if (this.snapshot) {
      this.snapshot.resources.ore = this.resources.ore;
    }
  }

  public setOre(amount: number): void {
    this.resources.ore = Math.max(0, amount);
    if (this.snapshot) {
      this.snapshot.resources.ore = this.resources.ore;
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
  }

  public consumeResearchPoints(amount: number): boolean {
    if (this.researchPoints >= amount) {
      this.researchPoints -= amount;
      if (this.snapshot) {
        this.snapshot.researchPoints = this.researchPoints;
      }
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
  }

  public getUnlockedBuildables(): string[] {
    return Array.from(this.unlockedBuildables);
  }

  // --- Clock & Game Day System (Milestone 7) ---
  public getCurrentGameDay(): number {
    return this.currentGameDay;
  }

  public getDayProgress(): number {
    return Math.min(1.0, this.dayProgressMs / this.dayDurationMs);
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
    const spoiled = this.checkFoodSpoilage();
    if (this.snapshot) {
      this.snapshot.currentGameDay = this.currentGameDay;
      this.snapshot.foodItems = [...this.foodItems];
    }
    return spoiled;
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
      console.log(`[Cooking] ✨ Recipe permanently discovered: '${recipeId}'!`);
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
      console.log(`[Alchemy] ✨ Recipe discovered: '${recipeId}'!`);
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
    const dataLoader = DataLoader.getInstance();
    if (dataLoader.getFood(itemId)) {
      return this.getFoodItemCount(itemId);
    }
    return this.inventory.get(itemId) || 0;
  }

  public addItem(itemId: string, count: number): void {
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
  }

  public removePlacedBuildable(x: number, y: number): PlacedBuildable | undefined {
    const idx = this.placedBuildables.findIndex((b) => b.x === x && b.y === y);
    if (idx !== -1) {
      const removed = this.placedBuildables.splice(idx, 1)[0];
      if (this.snapshot) {
        this.snapshot.placedBuildables = [...this.placedBuildables];
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
        inventory: Object.fromEntries(this.inventory),
        bookLearnedSkills: leader.bookLearnedSkills ? [...leader.bookLearnedSkills] : [],
        hunger: leader.hunger,
        mood: leader.mood,
        currentGameDay: this.currentGameDay,
        foodItems: [...this.foodItems],
        equippedWeaponId: leader.equippedWeaponId,
        offhandWeaponId: leader.offhandWeaponId,
        party: [...this.partySnapshots]
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
      inventory: Object.fromEntries(this.inventory),
      bookLearnedSkills: Array.from(player.bookLearnedSkills),
      hunger: player.hunger,
      mood: player.mood,
      currentGameDay: this.currentGameDay,
      foodItems: [...this.foodItems],
      equippedWeaponId: player.equippedWeapon.id,
      offhandWeaponId: player.offhandWeapon?.id ?? null,
      party: [...this.partySnapshots],
      discoveredCookingRecipes: Array.from(this.discoveredCookingRecipes),
      discoveredAlchemyRecipes: Array.from(this.discoveredAlchemyRecipes)
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
}
