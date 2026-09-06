import { Player } from '../entities/Player';
import { ProgressionSystem } from './ProgressionSystem';
import { PlayerData, PlayerSnapshot, PlacedBuildable } from '../types/game';
import { DataLoader } from '../utils/DataLoader';

export class GameState {
  private static instance: GameState;
  private snapshot: PlayerSnapshot | null = null;
  private isInitialized: boolean = false;
  private resources: { wood: number; [key: string]: number } = { wood: 100 };
  private placedBuildables: PlacedBuildable[] = [];

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
      wood: playerData.resources?.wood ?? 100,
      ...(playerData.resources ?? {})
    };

    this.snapshot = {
      hp: playerData.maxHp,
      criticalHp: playerData.criticalHpMax,
      energy: playerData.maxEnergy,
      knownSkillIds: known,
      equippedSkillIds: equipped,
      autocastMap: autocastObj,
      skillCooldownsRemainingMs: {},
      proficiencies: { [playerData.startingWeaponId]: 0 },
      classLevels: {},
      unlockedClasses: [],
      resources: { ...this.resources },
      placedBuildables: []
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
      placedBuildables: [...this.placedBuildables]
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
      `  Placed Buildables: ${this.placedBuildables.length}`,
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
      `  Unlocked Classes: [${progression.getSnapshotData().unlockedClasses.join(', ')}]`,
      'color: #4ade80; font-weight: bold;'
    );
  }
}
