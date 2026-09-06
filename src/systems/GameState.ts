import type { Player } from '../entities/Player.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import type { PlayerData, PlayerSnapshot, PlacedBuildable, TrainableStat, FoodItemInstance } from '../types/game.ts';
import { DataLoader } from '../utils/DataLoader.ts';

export class GameState {
  private static instance: GameState;
  private snapshot: PlayerSnapshot | null = null;
  private isInitialized: boolean = false;
  private resources: { wood: number; [key: string]: number } = { wood: 100 };
  private placedBuildables: PlacedBuildable[] = [];
  private researchPoints: number = 0;
  private unlockedBuildables: Set<string> = new Set(['floor', 'wall', 'door', 'bed', 'research_station']);
  private inventory: Map<string, number> = new Map();
  private bookLearnedSkills: Set<string> = new Set();

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

  /**
   * One-time boot initialization from player.json data.
   * Never called again after initial game start.
   */
  public initFromPlayerData(playerData: PlayerData): void {
    if (this.isInitialized) return;

    const known = playerData.knownSkillIds ? [...playerData.knownSkillIds] : ['power_strike'];
    const equipped = playerData.equippedSkillIds ? [...playerData.equippedSkillIds] : ['power_strike'];
    const autocastObj: Record<string, boolean> = {};
    for (const s of equipped) {
      autocastObj[s] = true;
    }

    this.resources = {
      wood: playerData.resources?.wood ?? 0,
      ...(playerData.resources ?? {})
    };

    const seedProficiencies: Record<string, TrainableStat> = {
      [playerData.startingWeaponId]: { level: 0, currentExp: 0 },
      construction: { level: 0, currentExp: 0 }
    };

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
      foodItems: []
    };

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

  public addFoodItem(foodId: string, count: number = 1): void {
    for (let i = 0; i < count; i++) {
      this.foodItems.push({
        id: foodId,
        acquiredDay: this.currentGameDay,
        instanceId: `${foodId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      });
    }
    this.syncFoodInventory();
    if (this.snapshot) {
      this.snapshot.foodItems = [...this.foodItems];
    }
    console.log(`[Food] Added ${count}x '${foodId}' on Day ${this.currentGameDay}. Total: ${this.getFoodItemCount(foodId)}`);
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
      resources: { ...this.resources },
      placedBuildables: [...this.placedBuildables],
      researchPoints: this.researchPoints,
      unlockedBuildables: Array.from(this.unlockedBuildables),
      inventory: Object.fromEntries(this.inventory),
      bookLearnedSkills: Array.from(player.bookLearnedSkills),
      hunger: player.hunger,
      mood: player.mood,
      currentGameDay: this.currentGameDay,
      foodItems: [...this.foodItems]
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
      this.resources = { ...snap.resources };
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

    player.autocastMap.clear();
    for (const [k, v] of Object.entries(snap.autocastMap)) {
      player.autocastMap.set(k, v);
    }

    progression.loadSnapshotData({
      proficiencies: snap.proficiencies,
      classLevels: snap.classLevels,
      unlockedClasses: snap.unlockedClasses
    });

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
