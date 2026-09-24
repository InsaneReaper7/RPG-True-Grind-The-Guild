import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { DungeonGenerator } from '../utils/DungeonGenerator';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Entity } from '../entities/Entity';
import { CombatSystem } from '../systems/CombatSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { ResearchSystem } from '../systems/ResearchSystem';
import { GridPos, EnemyDef, GeneratedDungeon, DungeonRoom, GatheringNodeDef, CharacterSnapshot, TrainableStat } from '../types/game';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem';
import { TileClaimDebugOverlay } from '../ui/TileClaimDebugOverlay';
import { TutorialSystem } from '../systems/TutorialSystem';

export interface GatheringNode {
  x: number;
  y: number;
  nodeDef: GatheringNodeDef;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  isHarvested: boolean;
  respawnTimer?: Phaser.Time.TimerEvent;
  corpseEnemy?: Enemy;
  isSkinned?: boolean;
  isButchered?: boolean;
}

export type ForagingBush = GatheringNode;

export interface ActiveGatherChannel {
  character: Player;
  node: GatheringNode;
  durationMs: number;
  elapsedMs: number;
  barContainer: Phaser.GameObjects.Container;
  barBg: Phaser.GameObjects.Graphics;
  barFill: Phaser.GameObjects.Graphics;
  labelText: Phaser.GameObjects.Text;
}

// Milestone 31: Item-Based Revive Channel
export interface ActiveReviveChannel {
  character: Player; // reviver
  targetAlly: Player; // downed ally being revived
  durationMs: number; // 3000ms
  elapsedMs: number;
  barContainer: Phaser.GameObjects.Container;
  barBg: Phaser.GameObjects.Graphics;
  barFill: Phaser.GameObjects.Graphics;
  labelText: Phaser.GameObjects.Text;
}

export interface ActiveMoveHighlight {
  dest: GridPos;
  unit?: Player;
  isLeader: boolean;
}

export class MainScene extends Phaser.Scene {
  private mapWidth: number = 48;
  private mapHeight: number = 48;
  private tileSize: number = 32;

  private dungeon!: GeneratedDungeon;
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  public party: Player[] = [];
  public get player(): Player {
    return this.party[0];
  }
  private gridMatrix: number[][] = [];
  private enemies: Enemy[] = [];
  private combatSystem!: CombatSystem;
  private progressionSystem!: ProgressionSystem;
  private hud!: HUD;
  private tileClaimOverlay!: TileClaimDebugOverlay;

  // Milestone 16: Floor Timer & Respawn Overhaul
  public debugAutoRespawnEnabled: boolean = false;
  private floorTimerDurationMs: number = 300000;
  private floorTimerRemainingMs: number = 300000;

  // Milestone 34: Boss Encounter
  public bossEncounterAnnounced: boolean = false;

  // Milestone 17: Gathering Channel & Debug Respawn
  public debugGatheringRespawnEnabled: boolean = false;
  public gatheringNodes: GatheringNode[] = [];
  public get foragingBushes(): GatheringNode[] {
    return this.gatheringNodes;
  }
  public set foragingBushes(nodes: GatheringNode[]) {
    this.gatheringNodes = nodes;
  }
  private activeGatherChannels: Map<Player, ActiveGatherChannel> = new Map();
  private activeReviveChannels: Map<Player, ActiveReviveChannel> = new Map();

  private portalSprite!: Phaser.GameObjects.Sprite;
  private portalPos: GridPos = { x: 2, y: 2 };
  private crystalSprite!: Phaser.GameObjects.Sprite;
  private crystalPos: GridPos = { x: 0, y: 0 };
  private isTransitioning: boolean = false;
  private isWiping: boolean = false;

  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private xKey!: Phaser.Input.Keyboard.Key;
  private zKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private hKey!: Phaser.Input.Keyboard.Key;
  private gKey!: Phaser.Input.Keyboard.Key;
  private numKeys: Phaser.Input.Keyboard.Key[] = [];
  public selectedMembers: Set<Player> = new Set();
  private selectionReticleGraphics!: Phaser.GameObjects.Graphics;

  // Milestone 26: Gathering Mode
  public isGatheringMode: boolean = false;
  private isGatheringDrag: boolean = false;
  private gatherDragStart: { x: number; y: number } | null = null;
  private gatheringMarqueeGraphics!: Phaser.GameObjects.Graphics;
  public currentGatherSelectionHighlights: GatheringNode[] = [];
  public gatheringQueue: GatheringNode[] = [];
  public gatheringQueueWorkers: Set<Player> = new Set();
  public gatheringWorkerNodeAssignments: Map<Player, GatheringNode> = new Map();
  private gatheringArrivalTimers: Map<Player, Phaser.Time.TimerEvent> = new Map();

  // Move Destination Highlights
  public lastMoveDestinationHighlights: GridPos[] = [];
  public activeMoveHighlights: ActiveMoveHighlight[] = [];
  private moveHighlightGraphics!: Phaser.GameObjects.Graphics;
  private moveHighlightTween: Phaser.Tweens.Tween | null = null;
  private moveHighlightTimer: Phaser.Time.TimerEvent | null = null;

  private isCameraLocked: boolean = true;
  private targetReticle!: Phaser.GameObjects.Sprite;

  constructor() {
    super({ key: 'MainScene' });
  }

  public preload(): void {
    // Generate procedural placeholder textures
    TextureGenerator.generatePlaceholderTextures(this, this.tileSize);
  }

  public create(): void {
    this.isTransitioning = false;
    this.enemies = [];
    this.isCameraLocked = true;

    // Clean up previous overlay, gathering channels, or timers if restarting scene
    if (this.tileClaimOverlay) {
      this.tileClaimOverlay.destroy();
    }
    for (const channel of this.activeGatherChannels.values()) {
      channel.barContainer.destroy();
    }
    this.activeGatherChannels.clear();
    for (const channel of this.activeReviveChannels.values()) {
      channel.barContainer.destroy();
    }
    this.activeReviveChannels.clear();
    for (const timer of this.gatheringArrivalTimers.values()) {
      timer.remove();
    }
    this.gatheringArrivalTimers.clear();
    for (const node of this.gatheringNodes) {
      if (node.respawnTimer) {
        node.respawnTimer.remove();
      }
    }
    this.gatheringNodes = [];

    // Milestone 26: Initialize Gathering Mode Graphics and State
    if (this.gatheringMarqueeGraphics) {
      this.gatheringMarqueeGraphics.destroy();
    }
    this.gatheringMarqueeGraphics = this.add.graphics().setDepth(10002);
    this.isGatheringMode = false;
    this.isGatheringDrag = false;
    this.gatherDragStart = null;
    this.currentGatherSelectionHighlights = [];
    this.gatheringQueue = [];
    this.gatheringQueueWorkers.clear();
    this.gatheringWorkerNodeAssignments.clear();

    // Initialize Move Destination Highlight Graphics
    if (this.moveHighlightGraphics) {
      this.moveHighlightGraphics.destroy();
    }
    this.moveHighlightGraphics = this.add.graphics().setDepth(10002);
    this.lastMoveDestinationHighlights = [];
    this.activeMoveHighlights = [];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cameras?.main?.stopFollow();
      this.isCameraLocked = true;
      for (const timer of this.gatheringArrivalTimers.values()) {
        timer.remove();
      }
      this.gatheringArrivalTimers.clear();
      this.clearMoveDestinationHighlights();
      if (this.tileClaimOverlay) {
        this.tileClaimOverlay.destroy();
      }
      for (const channel of this.activeGatherChannels.values()) {
        channel.barContainer.destroy();
      }
      this.activeGatherChannels.clear();
      for (const channel of this.activeReviveChannels.values()) {
        channel.barContainer.destroy();
      }
      this.activeReviveChannels.clear();
      for (const node of this.gatheringNodes) {
        if (node.respawnTimer) {
          node.respawnTimer.remove();
        }
      }
      this.gatheringNodes = [];
      if (this.hud) {
        this.hud.destroy();
      }
      if (this.selectionReticleGraphics) {
        this.selectionReticleGraphics.destroy();
      }
      if (this.gatheringMarqueeGraphics) {
        this.gatheringMarqueeGraphics.destroy();
      }
    });

    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId);
    const classesData = dataLoader.getClassesData();

    if (!startingWeapon) {
      throw new Error(`Starting weapon '${playerData.startingWeaponId}' not found in data/weapons.json`);
    }

    // 1. Procedural Dungeon Generation (Milestone 13 / 34)
    const dungeonConfig = dataLoader.getDungeonConfig();
    const floorNumber = GameState.getInstance().incrementDungeonFloorCount();
    this.dungeon = DungeonGenerator.generate(dungeonConfig, Math.random, { floorNumber });
    this.mapWidth = this.dungeon.width;
    this.mapHeight = this.dungeon.height;
    this.gridMatrix = this.dungeon.gridMatrix;
    this.portalPos = this.dungeon.portalPos;
    this.crystalPos = this.dungeon.crystalPos;

    // Expose generated dungeon for debug and verification inspection
    (window as any).__lastGeneratedDungeon = this.dungeon;

    // Milestone 44: Dynamically resolve active region for this floor
    const activeRegion = dataLoader.getRegionForFloor(floorNumber);
    (window as any).__lastActiveRegion = activeRegion;

    // 2. Tilemap Creation using Phaser Tilemap API with region textures
    this.tilemap = this.make.tilemap({
      data: this.gridMatrix,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tilesetWalkable = this.tilemap.addTilesetImage('tile-walkable', activeRegion.walkableTexture);
    const tilesetObstacle = this.tilemap.addTilesetImage('tile-obstacle', activeRegion.obstacleTexture);

    if (tilesetWalkable && tilesetObstacle) {
      this.tilemap.createLayer(0, [tilesetWalkable, tilesetObstacle], 0, 0);
    }

    // 3. Initialize Pathfinder with fresh grid
    this.pathfinder = new Pathfinder(this.gridMatrix);

    // 4. Initialize Systems & HUD
    const partySnapshots = GameState.getInstance().getPartySnapshots();
    const leaderSnap = partySnapshots[0];
    const leaderName = leaderSnap?.name || playerData.name || 'Hero';
    this.progressionSystem = new ProgressionSystem(classesData, leaderName);
    this.hud = new HUD();
    this.hud.setGatheringModeActive(false);
    const hasBossRoom = this.dungeon.rooms.some((r) => r.type === 'boss');
    this.hud.setLocation(`${activeRegion.name} — Floor ${floorNumber}${hasBossRoom ? ' (Boss Chamber)' : ''}`, false, activeRegion.accentColor);
    GameState.getInstance().setSafeZone(false);

    // Announce region entry toast when crossing into a region
    const prevFloor = floorNumber - 1;
    const prevRegion = prevFloor >= 1 ? dataLoader.getRegionForFloor(prevFloor) : null;
    if (!prevRegion || prevRegion.id !== activeRegion.id) {
      this.hud.showToast(`🌌 Entering ${activeRegion.name} (Floor ${floorNumber}) — ${activeRegion.tagline || 'New Biome'}`, 'info', 4000);
    }

    // Milestone: Tutorial & Onboarding
    const tut = TutorialSystem.getInstance();
    const tutState = GameState.getInstance().getTutorialState();
    tut.loadFromState(tutState.step, tutState.completed, tutState.dismissed);
    this.hud?.renderGuildGuide(tut.getCurrentStep());

    if (tut.getCurrentStep()?.id === 'first_expedition') {
      tut.completeStepId('first_expedition');
    }
    if (tut.getCurrentStep()?.id === 'basic_combat') {
      this.time.delayedCall(1200, () => {
        this.hud?.showToast('🏹 Valerie: "We are in Dungeon Floor 1. Stay in formation! Left-click an enemy to attack. Skills autocast on cooldown. Downed allies carry zero wipe penalty."', 'info', 7500);
      });
    }

    // Milestone 25: Wire HUD party portrait selection handler
    this.hud.setPartySelectionHandler(
      (index: number, multiSelect: boolean) => {
        this.selectMemberByIndex(index, multiSelect);
      },
      () => {
        this.selectAllMembers();
      }
    );

    // Progression & Skill Discovery Notifications
    this.bindProgressionEvents(this.progressionSystem, leaderName);

    // 5. Spawn Party (Hero & Companions) around dynamic entrance portal
    this.party = [];

    if (partySnapshots.length === 0) {
      const spawnTile = this.findOpenAdjacentTile(this.portalPos);
      const hero = new Player(this, spawnTile.x, spawnTile.y, playerData, startingWeapon, this.tileSize, 'player-avatar', this.progressionSystem);
      hero.id = 'hero';
      hero.entityName = playerData.name || 'Hero';
      this.party.push(hero);
      GameState.getInstance().restoreTo(hero, this.progressionSystem, this.time.now);
    } else {
      const spawnOffsets = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ];
      const spawnAnchor = this.findBest2x2Anchor(this.portalPos, this.portalPos);
      const claimedSpawn = new Set<string>();

      for (let i = 0; i < partySnapshots.length; i++) {
        const snap = partySnapshots[i];
        const snapWeapon = dataLoader.getWeapon(snap.equippedWeaponId) || startingWeapon;
        const memberProg = (i === 0) ? this.progressionSystem : new ProgressionSystem(classesData, snap.name || `Companion ${i}`);
        if (i > 0) {
          this.bindProgressionEvents(memberProg, snap.name || `Companion ${i}`);
        }
        const snapAvatar = snap.avatarTextureKey || (i === 0 ? 'player-avatar' : 'companion-avatar');
        const off = spawnOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
        let spawnTile = { x: spawnAnchor.x + off.x, y: spawnAnchor.y + off.y };
        if (this.gridMatrix[spawnTile.y]?.[spawnTile.x] !== 0 || claimedSpawn.has(`${spawnTile.x},${spawnTile.y}`)) {
          spawnTile = this.findOpenAdjacentTile(this.portalPos, undefined, claimedSpawn);
        }
        claimedSpawn.add(`${spawnTile.x},${spawnTile.y}`);

        const member = new Player(this, spawnTile.x, spawnTile.y, playerData, snapWeapon, this.tileSize, snapAvatar, memberProg);
        member.restoreFromSnapshot(snap, this.time.now);
        this.party.push(member);
      }
    }

    // Milestone 25: Selection reticle graphics and default full-party selection
    this.selectionReticleGraphics = this.add.graphics().setDepth(15);
    this.selectAllMembers();

    // Spawn Dungeon Entrance Portal (One-Way Arrival Gate from Outpost, Milestone 40)
    this.portalSprite = this.add.sprite(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize + this.tileSize / 2,
      'portal-entrance-one-way'
    ).setDepth(2);
    this.portalSprite.setInteractive({ cursor: 'pointer' });

    this.tweens.add({
      targets: this.portalSprite,
      scale: 1.15,
      alpha: 0.85,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize - 10,
      'Dungeon Entrance (One-Way)',
      {
        fontSize: '11px',
        color: '#94a3b8',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: { x: 4, y: 2 }
      }
    ).setOrigin(0.5).setDepth(5000);

    this.portalSprite.on('pointerdown', () => {
      this.interactEntrancePortal();
    });

    // Spawn Teleporter Crystal (Milestone 40: Descent & Return Nexus)
    this.crystalSprite = this.add.sprite(
      this.crystalPos.x * this.tileSize + this.tileSize / 2,
      this.crystalPos.y * this.tileSize + this.tileSize / 2,
      'teleporter-crystal'
    ).setDepth(2);
    this.crystalSprite.setInteractive({ cursor: 'pointer' });

    this.tweens.add({
      targets: this.crystalSprite,
      scale: 1.2,
      alpha: 0.9,
      y: this.crystalPos.y * this.tileSize + this.tileSize / 2 - 3,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(
      this.crystalPos.x * this.tileSize + this.tileSize / 2,
      this.crystalPos.y * this.tileSize - 10,
      '🔮 Teleporter Crystal',
      {
        fontSize: '11px',
        color: '#38bdf8',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: { x: 4, y: 2 }
      }
    ).setOrigin(0.5).setDepth(5000);

    this.crystalSprite.on('pointerdown', () => {
      this.triggerCrystalInteraction();
    });

    // Expose debug helpers for verification
    (window as any).debugUseEscapeStone = () => this.useEscapeStone();
    (window as any).debugContinueDescent = () => this.executeContinueDescent();
    (window as any).debugReturnToOutpost = () => this.executeTransitionToOutpost();
    (window as any).debugOpenCrystalModal = () => this.openCrystalModal();

    // 5b. Spawn Procedural Enemies
    this.enemies = [];
    for (const espawn of this.dungeon.enemySpawns) {
      const enemyDef = dataLoader.getEnemy(espawn.enemyId);
      if (enemyDef) {
        const texKey = `${enemyDef.id}-avatar`;
        const tex = this.textures.exists(texKey) ? texKey : 'wolf-avatar';
        const enemy = this.spawnEnemyUnit(enemyDef, espawn.x, espawn.y, tex);
        enemy.roomIndex = espawn.roomIndex;
      }
    }

    // 5c. Spawn Procedural Gathering Nodes (Foraging Bushes, Woodcutting Trees, Mining Rocks)
    this.gatheringNodes = [];
    for (const bspawn of this.dungeon.bushSpawns) {
      const typeId = (bspawn as any).nodeTypeId || 'foraging_bush';
      this.spawnGatheringNode(bspawn.x, bspawn.y, typeId);
    }

    // Target Selection Reticle
    this.targetReticle = this.add.sprite(-100, -100, 'target-reticle').setDepth(10000);
    this.targetReticle.setVisible(false);

    // 6. Initialize Combat System
    this.combatSystem = new CombatSystem(
      this,
      this.party,
      this.enemies,
      this.pathfinder,
      this.progressionSystem,
      (deadEnemy) => {
        this.onEnemyDefeated(deadEnemy);
      }
    );

    // Milestone 16: Continuous Floor Timer initialization
    this.debugAutoRespawnEnabled = false;
    this.floorTimerDurationMs = (dungeonConfig.floorRespawnTimerSec ?? 300) * 1000;
    this.floorTimerRemainingMs = this.floorTimerDurationMs;

    // 7. Setup Camera Controls
    this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 8. Initialize Tile-Claim Debug Overlay (Key [V] to toggle)
    this.tileClaimOverlay = new TileClaimDebugOverlay(this, this.party, this.enemies, this.tileSize);
    (window as any).__tileClaimOverlay = this.tileClaimOverlay;
    (window as any).__toggleTileClaimOverlay = () => this.tileClaimOverlay.toggle();
    (window as any).__scene = this;

    // Input Controls: WASD, Space, X, Z, C, H, G, 1-4
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };
      this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.hKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
      this.hKey.on('down', () => {
        this.hud.applyBandage();
      });
      this.gKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
      this.numKeys = [
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR)
      ];
    }

    // Expose debug helpers on window for browser console testing
    (window as any).GameState = GameState;
    (window as any).__dealDebugDamage = (amount: number = 5) => this.dealDebugDamageToEnemy(amount);
    (window as any).__instantReviveParty = () => this.debugInstantReviveParty();
    (window as any).__triggerPartyWipe = () => this.handlePartyWipe();
    (window as any).__toggleGatheringMode = (force?: boolean) => this.toggleGatheringMode(force);
    (window as any).__startGatheringQueue = (nodes: GatheringNode[]) => this.startGatheringQueue(nodes);
    (window as any).__getGatheringQueue = () => ({
      queue: this.gatheringQueue,
      workers: Array.from(this.gatheringQueueWorkers).map(w => w.entityName),
      assignments: Array.from(this.gatheringWorkerNodeAssignments.entries()).map(([w, n]) => ({
        worker: w.entityName,
        node: n.nodeDef.name,
        nodePos: { x: n.x, y: n.y }
      })),
      isModeActive: this.isGatheringMode
    });
    (window as any).__selectMember = (index: number, multiSelect?: boolean) => this.selectMemberByIndex(index, multiSelect);
    (window as any).__selectAllMembers = () => this.selectAllMembers();
    (window as any).__getSelectedMembers = () => this.getSelectedMembers();
    (window as any).__getPartyLeader = () => this.player;
    (window as any).__setPartyLeader = () => {
      this.hud?.showToast('⚠️ Leadership can only be changed at the Outpost!', 'warn', 3000);
      return false;
    };
    (window as any).__getLastMoveDestinationHighlights = () => this.lastMoveDestinationHighlights;
    (window as any).__getCurrentGatherSelectionHighlights = () => this.currentGatherSelectionHighlights;
    (window as any).__grantExp = (statId: string = 'short_swords', amount: number = 25, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      return targetMember.progression.addProficiencyExp(statId, amount);
    };
    (window as any).__grantHiddenExp = (skillId: string, amount: number = 25, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      return targetMember.progression.addProficiencyExp(skillId, amount);
    };
    (window as any).__setLevel = (statId: string = 'short_swords', targetLevel: number = 10, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      const stat = targetMember.progression.getProficiencyStat(statId);
      stat.level = targetLevel;
      stat.currentExp = 0;
      targetMember.progression.checkClassUnlocks();
      targetMember.progression.checkDualWieldUnlock();
      console.log(`[Debug] Set '${statId}' to Level ${targetLevel} (0 EXP) on ${targetMember.entityName}`);
    };
    (window as any).__spawnTestCompanion = () => {
      return this.spawnTestCompanion();
    };
    (window as any).__reviveParty = (memberIndex?: number) => {
      if (memberIndex !== undefined) {
        if (this.party[memberIndex]) {
          this.party[memberIndex].revive(this.player);
          console.log(`[Debug] Revived ${this.party[memberIndex].entityName}`);
        }
      } else {
        for (const member of this.party) {
          if (member.state === 'downed') {
            member.revive(this.player);
            console.log(`[Debug] Revived ${member.entityName}`);
          }
        }
      }
    };
    (window as any).__castSkill = (skillId: string, casterIdx: number = 0, targetIdx?: number) => {
      const caster = this.party[casterIdx];
      if (!caster) return false;
      const target = targetIdx !== undefined ? this.party[targetIdx] : undefined;
      return this.combatSystem.castSkill(caster, skillId, target);
    };
    (window as any).__recordActivity = (target: string, count: number = 1, memberIdx: number = 0) => {
      const member = this.party[memberIdx];
      if (!member) return 0;
      return member.progression.recordActivity(target, count);
    };
    (window as any).__triggerRetaliation = (enemyIdx: number = 0, victimIdx: number = 0) => {
      const enemy = this.enemies[enemyIdx];
      const victim = this.party[victimIdx];
      if (enemy && victim) {
        this.combatSystem.triggerRetaliation(enemy, victim);
      }
    };
    (window as any).__respawnEnemies = () => {
      for (const e of this.enemies) {
        e.respawn();
      }
      console.log('[Debug] All test enemies respawned and reset to spawn positions.');
    };
    (window as any).__getFloorTimerState = () => ({
      durationMs: this.floorTimerDurationMs,
      remainingMs: this.floorTimerRemainingMs,
      debugAutoRespawnEnabled: this.debugAutoRespawnEnabled,
      totalEnemies: this.enemies.length,
      livingEnemies: this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed').length
    });
    (window as any).__fastForwardFloorTimer = (seconds: number = 60) => this.fastForwardFloorTimer(seconds);
    (window as any).__triggerFloorRespawn = () => this.triggerFloorRespawn();
    (window as any).__toggleAutoRespawn = () => this.toggleDebugAutoRespawn();
    (window as any).__toggleDebugGatheringRespawn = () => this.toggleDebugGatheringRespawn();
    (window as any).GameState = GameState;
    (window as any).DataLoader = DataLoader;
    (window as any).ResearchSystem = ResearchSystem;
    (window as any).DungeonGenerator = DungeonGenerator;
    (window as any).__getGatheringNodes = () => this.gatheringNodes;
    (window as any).__startGatherChannel = (nodeIdx: number = 0, charIdx: number = 0) => {
      const node = this.gatheringNodes[nodeIdx];
      const char = this.party[charIdx];
      if (node && char) {
        return this.startGatherChannel(char, node);
      }
      return false;
    };
    (window as any).__interruptGatherChannel = (charIdx: number = 0, enemyIdx: number = 0) => {
      const char = this.party[charIdx];
      const enemy = this.enemies[enemyIdx];
      if (char) {
        return this.interruptGatherChannel(char, enemy);
      }
      return false;
    };
    // Milestone 31: Revive Channel Window Helpers
    (window as any).__startReviveChannel = (targetIdx: number = 0, reviverIdx: number = 0) => {
      const target = this.party[targetIdx];
      const reviver = this.party[reviverIdx];
      if (target && reviver) {
        return this.startReviveChannel(reviver, target);
      }
      return false;
    };
    (window as any).__interruptReviveChannel = (charIdx: number = 0, enemyIdx: number = 0) => {
      const char = this.party[charIdx];
      const enemy = this.enemies[enemyIdx];
      if (char) {
        return this.interruptReviveChannel(char, enemy);
      }
      return false;
    };
    (window as any).__getActiveReviveChannels = () => this.activeReviveChannels;
    (window as any).__grantItem = (itemId: string, count: number = 1) => GameState.getInstance().addItem(itemId, count);
    (window as any).__getGatheringState = () => ({
      debugGatheringRespawnEnabled: this.debugGatheringRespawnEnabled,
      totalNodes: this.gatheringNodes.length,
      harvestedNodes: this.gatheringNodes.filter((n) => n.isHarvested).length,
      activeChannels: this.activeGatherChannels.size
    });
    (window as any).__defeatEnemy = (enemy: Enemy) => this.defeatEnemy(enemy);
    (window as any).__getRoomEnemies = (roomId?: number) => {
      if (roomId !== undefined) {
        return this.enemies.filter((e) => e.roomIndex === roomId);
      }
      return this.dungeon.rooms.map((r) => ({
        id: r.id,
        type: r.type,
        enemies: this.enemies.filter((e) => e.roomIndex === r.id)
      }));
    };
    (window as any).__testHiddenProc = (skillId: string) => {
      const hiddenDef = DataLoader.getInstance().getHiddenSkill(skillId);
      if (!hiddenDef) {
        console.warn(`[Debug] Unknown hidden skill: ${skillId}`);
        return null;
      }
      const context = {
        equippedWeapon: this.player.equippedWeapon,
        hasShield: true,
        hasMagicProficiency: true,
        inCombat: false,
        isMeleeAttack: true
      };
      const result = HiddenSkillSystem.getInstance().rollProc(hiddenDef, context, this.progressionSystem);
      console.log(`[Debug] Tested proc for '${skillId}':`, result);
      return result;
    };
    (window as any).__spawnEnemy = (enemyId: string, x?: number, y?: number) => {
      const def = DataLoader.getInstance().getEnemy(enemyId);
      if (!def) {
        console.warn(`[Debug] Unknown enemy id: ${enemyId}`);
        return null;
      }
      const spawnX = x ?? 10;
      const spawnY = y ?? 10;
      const textureKey = `${def.id}-avatar`;
      return this.spawnEnemyUnit(def, spawnX, spawnY, this.textures.exists(textureKey) ? textureKey : 'wolf-avatar');
    };

    // Milestone 14 Debug Helpers
    (window as any).__setActiveClass = (classId: string | null = 'vanguard', memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.setActiveClass(classId);
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Active class set to '${classId}' on ${targetMember.entityName}`);
      }
    };
    (window as any).__grantClassExp = (amount: number = 25, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember && targetMember.activeClass) {
        const res = targetMember.progression.addClassExp(targetMember.activeClass, amount);
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Granted ${amount} Class EXP to active class '${targetMember.activeClass}' on ${targetMember.entityName}`);
        return res;
      }
      console.warn(`[Debug] No active class equipped on ${targetMember?.entityName}`);
      return false;
    };
    (window as any).__setClassLevel = (classId: string, level: number, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.progression.setClassLevel(classId, level);
        targetMember.progression.checkClassUnlocks();
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Set class '${classId}' to Level ${level} on ${targetMember.entityName}`);
      }
    };
    (window as any).__setupVanguardTestState = (memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        const p = targetMember.progression;
        p.getProficiencyStat('short_swords').level = 30;
        p.getProficiencyStat('short_swords').currentExp = 0;
        p.getProficiencyStat('shields').level = 30;
        p.getProficiencyStat('shields').currentExp = 0;
        p.setClassLevel('fencer', 5);
        p.setClassLevel('guardian', 5);
        p.checkClassUnlocks();
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Setup Vanguard requirements on ${targetMember.entityName}`);
      }
    };
    (window as any).__setVanguardLevel = (level: number = 40, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.progression.setClassLevel('vanguard', level);
        targetMember.setActiveClass('vanguard');
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Set Vanguard to Level ${level} and active on ${targetMember.entityName}`);
      }
    };
    (window as any).__spawnSwarmAround = (memberIdx: number = 0) => {
      const member = this.party[memberIdx] || this.player;
      const mx = member.gridPos.x;
      const my = member.gridPos.y;
      const offsets = [
        { ox: -1, oy: 0, type: 'goblin', tex: 'goblin-avatar' },
        { ox: 1, oy: 0, type: 'skeleton', tex: 'skeleton-avatar' },
        { ox: 0, oy: -1, type: 'undead', tex: 'undead-avatar' },
        { ox: 0, oy: 1, type: 'wolf', tex: 'wolf-avatar' },
        { ox: -1, oy: -1, type: 'goblin', tex: 'goblin-avatar' },
        { ox: 1, oy: -1, type: 'skeleton', tex: 'skeleton-avatar' },
        { ox: -1, oy: 1, type: 'undead', tex: 'undead-avatar' },
        { ox: 1, oy: 1, type: 'wolf', tex: 'wolf-avatar' }
      ];
      const spawned: Enemy[] = [];
      for (const off of offsets) {
        const tx = mx + off.ox;
        const ty = my + off.oy;
        if (tx > 0 && tx < this.mapWidth - 1 && ty > 0 && ty < this.mapHeight - 1 && this.gridMatrix[ty]?.[tx] === 0) {
          const def = DataLoader.getInstance().getEnemy(off.type);
          if (def) {
            const e = this.spawnEnemyUnit(def, tx, ty, off.tex, `${def.name} (Swarm)`);
            spawned.push(e);
          }
        }
      }
      console.log(`[Debug] Spawned ${spawned.length} swarm enemies surrounding ${member.entityName} at (${mx}, ${my})`);
      return spawned;
    };
    console.log('[Debug Tools] Hotkeys: [X] +25 Wpn Exp, [Z] +100 Wpn Exp, [C] +25 Const Exp. Debug Panel (`): +680 Wpn Exp (Lv10 Fencer Gate), Respawn Enemies. Console: __grantExp(id, amt, [idx]), __grantHiddenExp(id, amt, [idx]), __setLevel(id, lv, [idx]), __spawnTestCompanion(), __reviveParty([idx]), __spawnEnemy(id, x, y), __spawnSwarmAround(idx), __respawnEnemies().');

    // Scroll Wheel Zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      const currentZoom = this.cameras.main.zoom;
      let newZoom = currentZoom;
      if (deltaY > 0) {
        newZoom = Math.max(0.7, currentZoom - 0.1);
      } else if (deltaY < 0) {
        newZoom = Math.min(2.0, currentZoom + 0.1);
      }
      this.cameras.main.setZoom(newZoom);
    });

    // Pointer Click Interactions (Click-to-Move / Click-to-Engage / Portal / Gathering Mode Drag)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isTransitioning) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

      // Milestone 26: Gathering Mode Drag Marquee Selection
      if (this.isGatheringMode) {
        this.gatherDragStart = { x: worldPoint.x, y: worldPoint.y };
        this.isGatheringDrag = true;
        const initialNodes = this.getGatheringNodesInSelection(worldPoint.x, worldPoint.x, worldPoint.y, worldPoint.y);
        this.renderGatheringMarqueeAndHighlights(worldPoint.x, worldPoint.y, 0, 0, initialNodes);
        return;
      }

      const clickedTileX = Math.floor(worldPoint.x / this.tileSize);
      const clickedTileY = Math.floor(worldPoint.y / this.tileSize);

      // Check if entrance portal clicked
      if (clickedTileX === this.portalPos.x && clickedTileY === this.portalPos.y) {
        this.interactEntrancePortal();
        return;
      }

      // Milestone 40: Check if Teleporter Crystal clicked
      if (clickedTileX === this.crystalPos.x && clickedTileY === this.crystalPos.y) {
        this.triggerCrystalInteraction();
        return;
      }

      // Milestone 31: Check if a downed ally's clickable revive icon was clicked
      const clickedDownedAlly = this.party.find((m) => {
        if (m.state !== 'downed') return false;
        const isGridMatch = m.gridPos.x === clickedTileX && m.gridPos.y === clickedTileY;
        const isIconMatch = Math.hypot(m.x - worldPoint.x, (m.y - 24) - worldPoint.y) <= 18;
        const isBodyMatch = Math.abs(m.x - worldPoint.x) <= this.tileSize / 2 + 4 && Math.abs(m.y - worldPoint.y) <= this.tileSize / 2 + 4;
        return isIconMatch || isGridMatch || isBodyMatch;
      });

      if (clickedDownedAlly) {
        this.interactReviveAlly(clickedDownedAlly);
        return;
      }

      // Check if clicking a gathering node (Milestone 10, 13 & 17)
      const clickedNode = this.gatheringNodes.find((n) => {
        const isGridMatch = n.x === clickedTileX && n.y === clickedTileY;
        const dx = Math.abs(n.sprite.x - worldPoint.x);
        const dy = Math.abs(n.sprite.y - worldPoint.y);
        const isPosMatch = dx <= this.tileSize / 2 + 4 && dy <= this.tileSize / 2 + 4;
        return isGridMatch || isPosMatch;
      });

      if (clickedNode) {
        const activeSelected = this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead');
        if (activeSelected.length === 0) return;
        this.interactWithGatheringNode(clickedNode, activeSelected);
        return;
      }

      // Check if an enemy was clicked (via tile grid OR world position bounding box)
      const clickedEnemy = this.enemies.find((e) => {
        if (e.state === 'dead' || e.state === 'downed') return false;
        const isGridMatch = e.gridPos.x === clickedTileX && e.gridPos.y === clickedTileY;
        const dx = Math.abs(e.x - worldPoint.x);
        const dy = Math.abs(e.y - worldPoint.y);
        const isPosMatch = dx <= this.tileSize / 2 + 4 && dy <= this.tileSize / 2 + 4;
        return isGridMatch || isPosMatch;
      });

      if (clickedEnemy) {
        const activeSelected = this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead');
        if (activeSelected.length > 0) {
          for (const m of activeSelected) {
            this.cancelGatherChannel(m);
            this.cancelReviveChannel(m);
          }
          this.engageEnemy(clickedEnemy, activeSelected);
        }
      } else if (this.gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        // Click-to-Move to empty walkable tile
        const activeSelected = this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead');
        if (activeSelected.length === 0) {
          console.log('[Input] No living members currently selected to move');
          return;
        }

        console.log(`[Input] Clicked Tile: (${clickedTileX}, ${clickedTileY}) for ${activeSelected.length} selected member(s)`);
        for (const member of activeSelected) {
          this.cancelGatherChannel(member);
          this.cancelReviveChannel(member);
          member.clearTarget();
        }

        if (!this.party.some(m => m.targetEntity !== null)) {
          this.targetReticle.setVisible(false);
        }

        const claimed = new Set<string>();

        // Pre-reserve unselected living members' current tiles and claimed destinations so moving members do not collide
        for (const other of this.party) {
          if (!activeSelected.includes(other) && other.state !== 'dead') {
            claimed.add(`${other.gridPos.x},${other.gridPos.y}`);
            if (other.claimedDestination) {
              claimed.add(`${other.claimedDestination.x},${other.claimedDestination.y}`);
            }
          }
        }

        this.executePartyConvoyMovement(activeSelected, clickedTileX, clickedTileY, claimed);
      }
    });

    // Milestone 26: Gathering Mode Drag Marquee PointerMove with Live Node Selection Highlights
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isGatheringDrag && this.gatherDragStart) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const minX = Math.min(this.gatherDragStart.x, worldPoint.x);
        const maxX = Math.max(this.gatherDragStart.x, worldPoint.x);
        const minY = Math.min(this.gatherDragStart.y, worldPoint.y);
        const maxY = Math.max(this.gatherDragStart.y, worldPoint.y);
        const width = maxX - minX;
        const height = maxY - minY;

        const capturedNodes = this.getGatheringNodesInSelection(minX, maxX, minY, maxY);
        this.renderGatheringMarqueeAndHighlights(minX, minY, width, height, capturedNodes);
      }
    });

    // Milestone 26: Gathering Mode Drag Marquee PointerUp
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isGatheringDrag && this.gatherDragStart) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const minX = Math.min(this.gatherDragStart.x, worldPoint.x);
        const maxX = Math.max(this.gatherDragStart.x, worldPoint.x);
        const minY = Math.min(this.gatherDragStart.y, worldPoint.y);
        const maxY = Math.max(this.gatherDragStart.y, worldPoint.y);

        const selectedNodes = this.getGatheringNodesInSelection(minX, maxX, minY, maxY);

        this.isGatheringDrag = false;
        this.gatherDragStart = null;
        this.currentGatherSelectionHighlights = [];
        this.gatheringMarqueeGraphics.clear();

        if (selectedNodes.length === 0) {
          this.hud?.showToast('No gathering nodes in selected area.', 'info', 2000);
        } else {
          this.startGatheringQueue(selectedNodes);
        }
      }
    });
  }

  public findBest2x2Anchor(
    targetPos: GridPos,
    preferredNear?: GridPos,
    claimedTiles?: Set<string>,
    excludeUnits?: Player[]
  ): GridPos {
    const isAnchorCandidateValid = (ax: number, ay: number): boolean => {
      if (ax <= 0 || ax + 1 >= this.mapWidth - 1 || ay <= 0 || ay + 1 >= this.mapHeight - 1) return false;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const tx = ax + dx;
          const ty = ay + dy;
          if (this.gridMatrix[ty]?.[tx] !== 0) return false;
          if (claimedTiles?.has(`${tx},${ty}`)) return false;
          if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return false;
          if (this.party.some(m => (!excludeUnits || !excludeUnits.includes(m)) && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return false;
        }
      }
      return true;
    };

    const directCandidates: GridPos[] = [
      { x: targetPos.x, y: targetPos.y },
      { x: targetPos.x - 1, y: targetPos.y },
      { x: targetPos.x, y: targetPos.y - 1 },
      { x: targetPos.x - 1, y: targetPos.y - 1 }
    ].filter(a => isAnchorCandidateValid(a.x, a.y));

    const near = preferredNear || targetPos;

    if (directCandidates.length > 0) {
      directCandidates.sort((a, b) => {
        const distA = Math.hypot(a.x - near.x, a.y - near.y);
        const distB = Math.hypot(b.x - near.x, b.y - near.y);
        return distA - distB;
      });
      return directCandidates[0];
    }

    const radialCandidates: GridPos[] = [];
    for (let r = 1; r <= 8; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ax = targetPos.x + dx;
          const ay = targetPos.y + dy;
          if (isAnchorCandidateValid(ax, ay)) {
            radialCandidates.push({ x: ax, y: ay });
          }
        }
      }
      if (radialCandidates.length > 0) break;
    }

    if (radialCandidates.length > 0) {
      radialCandidates.sort((a, b) => {
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - near.x, a.y - near.y);
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - near.x, b.y - near.y);
        return distA - distB;
      });
      return radialCandidates[0];
    }

    return targetPos;
  }

  public executePartyBlockMovement(
    activeSelected: Player[],
    clickedTileX: number,
    clickedTileY: number,
    claimed: Set<string>
  ): void {
    if (activeSelected.length === 0) return;

    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    if (activeSelected.length === 1) {
      const leader = activeSelected[0];
      let leaderDest: GridPos = { x: clickedTileX, y: clickedTileY };
      if (this.gridMatrix[leaderDest.y]?.[leaderDest.x] !== 0 || claimed.has(`${leaderDest.x},${leaderDest.y}`)) {
        leaderDest = this.findNearestOpenTileForPartyMove({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, leader);
      }
      claimed.add(`${leaderDest.x},${leaderDest.y}`);
      leader.claimedDestination = { ...leaderDest };
      this.showMoveDestinationHighlights([leaderDest], [leader]);

      const unitObs = {
        soft: this.party.filter(m => m !== leader && m.state !== 'dead' && m.state !== 'downed').map(m => m.gridPos),
        hard: this.getEnemyObstacles()
      };
      this.pathfinder.findPath(leader.gridPos, leaderDest, unitObs).then((path) => {
        if (path.length === 0) {
          leader.claimedDestination = null;
          this.clearMoveDestinationHighlights();
          return;
        }
        leader.followPath(path, undefined, leaderDest);
      });
      return;
    }

    const leader = activeSelected[0];

    // 1. Determine destination 2x2 anchor
    const destAnchor = this.findBest2x2Anchor({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, activeSelected);

    // Compute exact destination tiles for each member
    const destTiles: GridPos[] = [];
    for (let i = 0; i < activeSelected.length; i++) {
      const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const tile = { x: destAnchor.x + off.x, y: destAnchor.y + off.y };
      destTiles.push(tile);
      claimed.add(`${tile.x},${tile.y}`);
      activeSelected[i].claimedDestination = { ...tile };
    }

    // Destination highlights match actual final positions EXACTLY
    this.showMoveDestinationHighlights(destTiles, activeSelected);

    // 2. Obstacles for 2x2 movement:
    const friendlyObstacles = this.party
      .filter(m => !activeSelected.includes(m) && m.state !== 'dead' && m.state !== 'downed')
      .map(m => m.gridPos);
    const unitObs = {
      soft: friendlyObstacles,
      hard: this.getEnemyObstacles()
    };

    // 3. Determine start 2x2 anchor
    let startAnchor: GridPos = { x: leader.gridPos.x, y: leader.gridPos.y };
    if (!this.pathfinder.is2x2Walkable(startAnchor.x, startAnchor.y)) {
      startAnchor = this.findBest2x2Anchor(leader.gridPos, leader.gridPos, undefined, activeSelected);
    }

    // 4. Compute single shared 2x2 path for the group
    this.pathfinder.find2x2Path(startAnchor, destAnchor, unitObs).then((anchorPath) => {
      if (anchorPath.length === 0) {
        // Fallback: if 2x2 path is blocked (e.g. 1-tile doorway in player outpost), fall back to 1x1
        this.pathfinder.findPath(leader.gridPos, destTiles[0], unitObs).then((fallbackPath) => {
          if (fallbackPath.length === 0) {
            for (const m of activeSelected) {
              m.claimedDestination = null;
            }
            this.clearMoveDestinationHighlights();
            return;
          }
          // Fallback single-file compression through pinch point
          for (let i = 0; i < activeSelected.length; i++) {
            const unit = activeSelected[i];
            const targetTile = destTiles[i];
            this.pathfinder.findPath(unit.gridPos, targetTile, unitObs).then((uPath) => {
              if (uPath.length > 0) {
                unit.followPath(uPath, undefined, targetTile);
              } else {
                unit.claimedDestination = null;
              }
            });
          }
        });
        return;
      }

      // 5. All positions advance together as a rigid 2x2 block
      // Launch leading-edge units first to vacate tiles before trailing units step into them
      const dirX = anchorPath.length > 1 ? anchorPath[1].x - anchorPath[0].x : 0;
      const dirY = anchorPath.length > 1 ? anchorPath[1].y - anchorPath[0].y : 0;
      const launchOrder = activeSelected.map((_, idx) => idx);
      launchOrder.sort((a, b) => {
        const offA = formationOffsets[a] || { x: a % 2, y: Math.floor(a / 2) };
        const offB = formationOffsets[b] || { x: b % 2, y: Math.floor(b / 2) };
        const scoreA = offA.x * dirX + offA.y * dirY;
        const scoreB = offB.x * dirX + offB.y * dirY;
        return scoreB - scoreA;
      });

      for (const i of launchOrder) {
        const unit = activeSelected[i];
        const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
        const unitPath: GridPos[] = anchorPath.map(p => ({ x: p.x + off.x, y: p.y + off.y }));

        if (unit.gridPos.x === unitPath[0].x && unit.gridPos.y === unitPath[0].y) {
          unit.followPath(unitPath, undefined, destTiles[i]);
        } else {
          // Out of formation (split party / rejoin): route through authentic tile-by-tile pathfinder
          const outOfFormationObs = {
            soft: [
              ...unitObs.soft,
              ...destTiles.filter((_, idx) => idx !== i)
            ],
            hard: unitObs.hard
          };
          this.pathfinder.findPath(unit.gridPos, destTiles[i], outOfFormationObs).then((uPath) => {
            if (uPath.length > 0) {
              unit.followPath(uPath, undefined, destTiles[i]);
            } else {
              // Bottleneck/fallback: try pathfinding to rejoin formation slot at startAnchor
              this.pathfinder.findPath(unit.gridPos, unitPath[0], outOfFormationObs).then((alignPath) => {
                if (alignPath.length > 0) {
                  unit.followPath([...alignPath, ...unitPath.slice(1)], undefined, destTiles[i]);
                } else {
                  unit.claimedDestination = null;
                }
              });
            }
          });
        }
      }
    });
  }

  public executePartyConvoyMovement(
    activeSelected: Player[],
    clickedTileX: number,
    clickedTileY: number,
    claimed: Set<string>
  ): void {
    this.executePartyBlockMovement(activeSelected, clickedTileX, clickedTileY, claimed);
  }

  public getLivingUnits(excludeEntity?: Entity): Entity[] {
    const units: Entity[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') {
        units.push(m);
      }
    }
    for (const e of this.enemies) {
      if (e !== excludeEntity && e.state !== 'dead' && e.state !== 'downed') {
        units.push(e);
      }
    }
    return units;
  }

  public getFriendlyObstacles(excludeEntity?: Entity): GridPos[] {
    const positions: GridPos[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') {
        positions.push(m.gridPos);
      }
    }
    return positions;
  }

  public getEnemyObstacles(): GridPos[] {
    const positions: GridPos[] = [];
    for (const e of this.enemies) {
      if (e.state !== 'dead' && e.state !== 'downed') {
        positions.push(e.gridPos);
      }
    }
    return positions;
  }

  public getPartyUnitObstacles(unit: Entity): { soft: GridPos[]; hard: GridPos[] } {
    return {
      soft: this.getFriendlyObstacles(unit),
      hard: this.getEnemyObstacles()
    };
  }

  public getDynamicObstacles(excludeEntity?: Entity): GridPos[] {
    return this.getLivingUnits(excludeEntity).map((u) => u.gridPos);
  }

  public isTileOccupied(x: number, y: number, excludeEntity?: Entity): boolean {
    const living = this.getLivingUnits(excludeEntity);
    return living.some((u) => u.gridPos.x === x && u.gridPos.y === y);
  }

  public getUnitAtTile(x: number, y: number, excludeEntity?: Entity): Entity | undefined {
    const living = this.getLivingUnits(excludeEntity);
    return living.find((u) => u.gridPos.x === x && u.gridPos.y === y);
  }

  public isTileClaimed(x: number, y: number, excludeEntity?: Entity): boolean {
    const living = this.getLivingUnits(excludeEntity);
    return living.some((u) => u.claimedDestination !== null && u.claimedDestination.x === x && u.claimedDestination.y === y);
  }

  public findOpenAdjacentTile(center: GridPos, preferredNear?: GridPos, claimedTiles?: Set<string>, excludeEntity?: Entity): GridPos {
    const r1Offsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
    ];

    const isCandidateOpen = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      const key = `${tx},${ty}`;
      if (claimedTiles?.has(key)) return false;
      if (this.isTileOccupied(tx, ty, excludeEntity)) return false;
      if (this.isTileClaimed(tx, ty, excludeEntity)) return false;
      return true;
    };

    // 1. Prioritize true adjacent tiles (radius 1)
    const r1Candidates: GridPos[] = [];
    for (const off of r1Offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (isCandidateOpen(tx, ty)) {
        r1Candidates.push({ x: tx, y: ty });
      }
    }

    if (r1Candidates.length > 0) {
      if (preferredNear) {
        r1Candidates.sort((a, b) => {
          const distA = Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y);
          const distB = Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y);
          return distA - distB;
        });
      }
      return r1Candidates[0];
    }

    // 2. Fallback: Radius 2 only if all 8 adjacent tiles are blocked/occupied
    const r2Offsets = [
      { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
      { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
      { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 }
    ];
    const r2Candidates: GridPos[] = [];
    for (const off of r2Offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (isCandidateOpen(tx, ty)) {
        r2Candidates.push({ x: tx, y: ty });
      }
    }

    if (r2Candidates.length > 0) {
      if (preferredNear) {
        r2Candidates.sort((a, b) => {
          const distA = Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y);
          const distB = Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y);
          return distA - distB;
        });
      }
      return r2Candidates[0];
    }

    return center;
  }

  /**
   * Dedicated combat attack positioning: delegates to the unified authoritative
   * CombatSystem claim and positioning calculator to prevent duplicate logic or double-booking.
   */
  public findOpenAttackTileForMember(
    enemy: Enemy,
    member: Player,
    claimedKeys?: Set<string>
  ): GridPos | null {
    if (this.combatSystem) {
      return this.combatSystem.findOpenAttackTileForMember(enemy, member, claimedKeys);
    }
    return null;
  }

  public findNearestOpenTile(targetPos: GridPos, preferredNear?: GridPos, claimedTiles?: Set<string>, excludeEntity?: Entity): GridPos {
    // Check if ideal targetPos is completely open
    if (
      targetPos.x > 0 && targetPos.x < this.mapWidth - 1 &&
      targetPos.y > 0 && targetPos.y < this.mapHeight - 1 &&
      this.gridMatrix[targetPos.y]?.[targetPos.x] === 0
    ) {
      const key = `${targetPos.x},${targetPos.y}`;
      if (!claimedTiles?.has(key) && !this.isTileOccupied(targetPos.x, targetPos.y, excludeEntity) && !this.isTileClaimed(targetPos.x, targetPos.y, excludeEntity)) {
        return { x: targetPos.x, y: targetPos.y };
      }
    }

    // Concentric search around targetPos up to radius 3
    const candidates: GridPos[] = [];
    for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetPos.x + dx;
          const ty = targetPos.y + dy;
          if (
            tx > 0 && tx < this.mapWidth - 1 &&
            ty > 0 && ty < this.mapHeight - 1 &&
            this.gridMatrix[ty]?.[tx] === 0
          ) {
            const key = `${tx},${ty}`;
            if (!claimedTiles?.has(key) && !this.isTileOccupied(tx, ty, excludeEntity) && !this.isTileClaimed(tx, ty, excludeEntity)) {
              candidates.push({ x: tx, y: ty });
            }
          }
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length > 0) {
      const refPoint = preferredNear || targetPos;
      candidates.sort((a, b) => {
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - refPoint.x, a.y - refPoint.y);
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - refPoint.x, b.y - refPoint.y);
        return distA - distB;
      });
      return candidates[0];
    }

    return this.findOpenAdjacentTile(targetPos, preferredNear, claimedTiles, excludeEntity);
  }

  public findNearestOpenTileForPartyMove(
    targetPos: GridPos,
    preferredNear: GridPos,
    claimedTiles: Set<string>,
    companion: Entity
  ): GridPos {
    const isCandidateValid = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      if (claimedTiles.has(`${tx},${ty}`)) return false;
      if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return false;
      if (this.party.some(m => m !== companion && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return false;
      return true;
    };

    if (isCandidateValid(targetPos.x, targetPos.y)) {
      return targetPos;
    }

    const candidates: GridPos[] = [];
    for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetPos.x + dx;
          const ty = targetPos.y + dy;
          if (isCandidateValid(tx, ty)) {
            candidates.push({ x: tx, y: ty });
          }
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const isSelfA = (a.x === companion.gridPos.x && a.y === companion.gridPos.y) ? 1000 : 0;
        const isSelfB = (b.x === companion.gridPos.x && b.y === companion.gridPos.y) ? 1000 : 0;
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y) + isSelfA;
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y) + isSelfB;
        return distA - distB;
      });
      return candidates[0];
    }

    return targetPos;
  }

  public spawnTestCompanion(startingKitId?: string): boolean {
    if (this.party.length >= 4) {
      this.hud.showToast('Party is full (maximum 4 members)', 'warn', 3000);
      return false;
    }
    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const classesData = dataLoader.getClassesData();
    const companionIndex = this.party.length;
    const companionId = `companion_${companionIndex}`;
    const companionName = companionIndex === 1 ? 'Valerie' : companionIndex === 2 ? 'Kaelen' : 'Barris';

    // Find adjacent walkable unoccupied tile near leader in 2x2 formation
    const offsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];
    let spawnTile: GridPos;
    const off = offsets[companionIndex] || { x: companionIndex % 2, y: Math.floor(companionIndex / 2) };
    const candidateX = this.player.gridPos.x + off.x;
    const candidateY = this.player.gridPos.y + off.y;
    if (this.gridMatrix[candidateY]?.[candidateX] === 0 && !this.isTileOccupied(candidateX, candidateY)) {
      spawnTile = { x: candidateX, y: candidateY };
    } else {
      spawnTile = this.findOpenAdjacentTile(this.player.gridPos);
    }
    const spawnX = spawnTile.x;
    const spawnY = spawnTile.y;

    let snap: CharacterSnapshot;
    if (companionIndex === 1) {
      const valerieProficiencies: Record<string, TrainableStat> = {
        daggers: { level: 10, currentExp: 0 },
        bows: { level: 15, currentExp: 0 },
        construction: { level: 0, currentExp: 0 },
        fist: { level: 0, currentExp: 0 }
      };
      snap = {
        id: companionId,
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
    } else {
      const kit = startingKitId || (companionIndex === 2 ? 'sword_and_shield' : 'mace');
      snap = GameState.getInstance().createBlankRecruitSnapshot(companionName, companionId, kit);
    }

    const companionProgression = new ProgressionSystem(classesData, companionName);
    this.bindProgressionEvents(companionProgression, companionName);
    const mainWeapon = dataLoader.getWeapon(snap.equippedWeaponId) || dataLoader.getWeapon('daggers')!;
    const companion = new Player(
      this,
      spawnX,
      spawnY,
      playerData,
      mainWeapon,
      this.tileSize,
      'companion-avatar',
      companionProgression
    );
    companion.restoreFromSnapshot(snap, this.time.now);
    companion.id = companionId;
    companion.entityName = companionName;
    companionProgression.ownerName = companionName;
    this.party.push(companion);
    GameState.getInstance().addCompanionToParty(companion, this.time.now);
    this.combatSystem.party = this.party;
    this.tileClaimOverlay?.setParty(this.party);
    if (this.selectedMembers.size === this.party.length - 1) {
      this.selectedMembers.add(companion);
    }
    this.syncSelectionWithHud();
    this.hud.showToast(`👥 ${companionName} joined the party!`, 'success', 3000);
    console.log(`[MainScene] Spawned companion ${companionName} at (${spawnX}, ${spawnY}) with ${mainWeapon.name}`);
    return true;
  }

  public selectMember(member: Player, multiSelect: boolean = false): void {
    if (!this.party.includes(member)) return;

    if (!multiSelect) {
      this.selectedMembers.clear();
      this.selectedMembers.add(member);
    } else {
      if (this.selectedMembers.has(member)) {
        if (this.selectedMembers.size > 1) {
          this.selectedMembers.delete(member);
        }
      } else {
        this.selectedMembers.add(member);
      }
    }
    this.syncSelectionWithHud();
  }

  public selectMemberByIndex(index: number, multiSelect: boolean = false): void {
    const member = this.party[index];
    if (member) {
      this.selectMember(member, multiSelect);
    }
  }

  public selectAllMembers(): void {
    this.selectedMembers.clear();
    for (const m of this.party) {
      this.selectedMembers.add(m);
    }
    this.syncSelectionWithHud();
  }

  public getSelectedMembers(): Player[] {
    return this.party.filter(m => this.selectedMembers.has(m));
  }

  private syncSelectionWithHud(): void {
    const indices: number[] = [];
    for (let i = 0; i < this.party.length; i++) {
      if (this.selectedMembers.has(this.party[i])) {
        indices.push(i);
      }
    }
    this.hud?.setSelectedMemberIndices(indices);
  }

  private bindProgressionEvents(prog: ProgressionSystem, memberName?: string): void {
    const resolvedName = prog.ownerName || memberName || this.player?.entityName || 'Guild Hero';
    prog.ownerName = resolvedName;

    prog.onClassUnlocked((event) => {
      const name = prog.ownerName || event.memberName || memberName || 'Guild Hero';
      console.log(`%c[UNLOCK] ${name} unlocked ${event.classDef.name}!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef, name);
    });

    prog.onSkillDiscovered((event) => {
      const name = prog.ownerName || event.memberName || memberName || 'Guild Hero';
      GameState.getInstance().discoverProficiency(event.skillId);
      const skillDef = DataLoader.getInstance().getTrainableStatDef(event.skillId);
      if (skillDef) {
        console.log(`%c[DISCOVERY] ${name} discovered ${skillDef.name}!`, 'color: #34d399; font-weight: bold; font-size: 14px;');
        this.hud.showSkillDiscoveredModal(skillDef, name);
      }
    });
  }

  private interactEntrancePortal(): void {
    console.log('[MainScene] Interacted with Entrance Portal (One-Way)');
    this.hud.showToast('⚠️ The dungeon entrance portal is strictly one-way! Find a Teleporter Crystal or use an Escape Stone to return.', 'warn', 4500);
  }

  private triggerCrystalInteraction(): void {
    if (this.isTransitioning) return;

    for (const member of this.party) {
      member.clearTarget();
    }
    this.targetReticle.setVisible(false);

    const dx = Math.abs(this.player.gridPos.x - this.crystalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.crystalPos.y);

    if (Math.max(dx, dy) <= 1 && (dx > 0 || dy > 0)) {
      // Already adjacent
      this.openCrystalModal();
      return;
    }

    console.log('[MainScene] Party moving to Teleporter Crystal...');
    const claimed = new Set<string>();

    // Assign leader an open adjacent tile to the crystal
    const leaderDest = this.findOpenAdjacentTile(this.crystalPos, this.player.gridPos, claimed, this.player);
    claimed.add(`${leaderDest.x},${leaderDest.y}`);
    this.player.claimedDestination = { ...leaderDest };

    // Command all living companions to also move towards the crystal
    for (let i = 1; i < this.party.length; i++) {
      const companion = this.party[i];
      if (companion.state === 'downed' || companion.state === 'dead') continue;
      const compDest = this.findOpenAdjacentTile(this.crystalPos, companion.gridPos, claimed, companion);
      claimed.add(`${compDest.x},${compDest.y}`);
      companion.claimedDestination = { ...compDest };

      const compUnitObs = this.getPartyUnitObstacles(companion);
      this.pathfinder.findPath(companion.gridPos, compDest, compUnitObs).then((path) => {
        if (path.length > 0) {
          companion.followPath(path);
        } else {
          companion.claimedDestination = null;
        }
      });
    }

    // Leader movement with crystal interaction on arrival
    const leaderUnitObs = this.getPartyUnitObstacles(this.player);
    this.pathfinder.findPath(this.player.gridPos, leaderDest, leaderUnitObs).then((path) => {
      if (path.length > 0) {
        this.player.followPath(path, () => {
          this.openCrystalModal();
        });
      } else {
        this.openCrystalModal();
      }
    });
  }

  public openCrystalModal(): void {
    if (this.isTransitioning) return;
    const currentFloor = GameState.getInstance().getDungeonFloorCount();
    const currentRegion = DataLoader.getInstance().getRegionForFloor(currentFloor);
    const nextRegion = DataLoader.getInstance().getRegionForFloor(currentFloor + 1);
    this.hud.showTeleporterCrystalModal(
      currentFloor,
      () => this.executeContinueDescent(),
      () => this.executeTransitionToOutpost(),
      currentRegion.name,
      nextRegion.name !== currentRegion.name ? nextRegion.name : undefined
    );
  }

  public executeContinueDescent(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[MainScene] Continuing descent deeper into dungeon...');
    // Save live party snapshot and player snapshot
    GameState.getInstance().savePartySnapshot(this.party, this.time.now);
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);

    // Restart MainScene to generate the next floor
    this.scene.restart();
  }

  public executeTransitionToOutpost(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[MainScene] Returning from Dungeon -> Transitioning to OutpostScene');
    GameState.getInstance().savePartySnapshot(this.party, this.time.now);
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);
    GameState.getInstance().resetDungeonFloorCount();
    GameState.getInstance().saveToDisk();
    TutorialSystem.getInstance().completeStepId('return_outpost');

    // Switch active scene to OutpostScene
    this.scene.start('OutpostScene');
  }

  public handlePartyWipe(): void {
    if (this.isWiping || this.isTransitioning) return;
    this.isWiping = true;
    this.isTransitioning = true;

    console.log('%c[Party Wipe] ☠️ FULL PARTY WIPED! Teleporting back to Guild Outpost...', 'color: #ef4444; font-weight: bold; font-size: 14px;');
    if (this.hud) {
      this.hud.showToast('☠️ Party wiped! Returning to Outpost...', 'error', 3500);
    }

    // Disengage enemies and clear highlights
    if (this.enemies) {
      for (const enemy of this.enemies) {
        enemy.targetEntity = null;
        enemy.isAggroed = false;
      }
    }
    this.clearMoveDestinationHighlights();

    const finishWipe = () => {
      // Clean, no-punishment recovery: restore all party members to conscious, working state
      for (const member of this.party) {
        if (member.state === 'downed') {
          member.hp = Math.max(1, Math.floor(member.maxHp * 0.5));
          member.criticalHp = member.maxCriticalHp;
          member.state = 'idle';
          member.claimedDestination = null;
          member.clearTarget();
          if (member.avatarSprite) {
            member.avatarSprite.setAngle(0);
            member.avatarSprite.setAlpha(1);
          }
          member.hideReviveIcon();
        }
      }

      const sceneTime = this.time ? this.time.now : 0;
      // Checkpoint and save state to disk
      GameState.getInstance().savePartySnapshot(this.party, sceneTime);
      GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, sceneTime);
      GameState.getInstance().resetDungeonFloorCount();
      GameState.getInstance().saveToDisk();
      TutorialSystem.getInstance().completeStepId('return_outpost');

      // Transition back to Guild Outpost safe zone
      if (this.scene && typeof this.scene.start === 'function') {
        this.scene.start('OutpostScene');
      }
    };

    if (this.time && typeof this.time.delayedCall === 'function') {
      this.time.delayedCall(1200, finishWipe);
    } else {
      finishWipe();
    }
  }

  public debugInstantReviveParty(): boolean {
    let anyRevived = false;
    for (const member of this.party) {
      if (member.state === 'downed') {
        member.revive(this.player);
        anyRevived = true;
      }
    }
    return anyRevived;
  }

  public useEscapeStone(): boolean {
    if (this.isTransitioning) return false;
    const gameState = GameState.getInstance();
    if (gameState.getItemCount('escape_stone') < 1) {
      this.hud.showToast('No Escape Stone in inventory/stockpile! Craft one at the Alchemy Station.', 'warn', 3000);
      return false;
    }

    // Strict in-combat and lingering combat tail check (Milestone 40)
    const partyInCombat = this.party.some((m) => m.inCombat);
    const combatActive = partyInCombat || (this.combatSystem ? this.combatSystem.isInCombat(this.time.now) : false);
    if (combatActive) {
      this.hud.showToast('⚠️ Cannot use Escape Stone while any party member is in combat!', 'warn', 3500);
      return false;
    }

    gameState.consumeItem('escape_stone', 1);
    this.hud.showToast('🌀 Using Escape Stone! Teleporting party to Outpost...', 'success', 3000);
    this.executeTransitionToOutpost();
    return true;
  }

  public engageEnemy(enemy: Enemy, membersToEngage?: Player[]): void {
    if (enemy.state === 'dead' || enemy.state === 'downed') return;

    console.log(`[Input] Engaged Enemy: ${enemy.entityName} at (${enemy.gridPos.x}, ${enemy.gridPos.y})`);

    const allLivingMembers = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');
    const selectedLiving = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
    const livingMembers = membersToEngage
      ? membersToEngage.filter(m => m.state !== 'downed' && m.state !== 'dead')
      : (selectedLiving.length > 0 ? selectedLiving : allLivingMembers);

    if (livingMembers.length === 0) return;

    this.combatSystem.engageMembers(enemy, livingMembers);

    if (!membersToEngage || livingMembers.includes(this.player)) {
      this.targetReticle.setPosition(
        enemy.gridPos.x * this.tileSize + this.tileSize / 2,
        enemy.gridPos.y * this.tileSize + this.tileSize / 2
      );
      this.targetReticle.setVisible(true);
    }
  }

  public update(time: number, delta: number): void {
    // Party Wipe Check: Full party downed -> teleport back to Outpost with no punishment
    if (!this.isWiping && !this.isTransitioning && this.party.length > 0) {
      const isPartyWiped = this.party.every((m) => m.state === 'downed');
      if (isPartyWiped) {
        this.handlePartyWipe();
        return;
      }
    }

    // Milestone 34: Boss Encounter Room Trigger
    if (!this.bossEncounterAnnounced && this.dungeon && this.dungeon.rooms) {
      const bossRoom = this.dungeon.rooms.find((r) => r.type === 'boss');
      if (bossRoom) {
        const inBossRoom = this.party.some((m) => {
          return m.gridPos.x >= bossRoom.x &&
                 m.gridPos.x < bossRoom.x + bossRoom.width &&
                 m.gridPos.y >= bossRoom.y &&
                 m.gridPos.y < bossRoom.y + bossRoom.height;
        });
        if (inBossRoom) {
          this.bossEncounterAnnounced = true;
          const boss = this.enemies.find((e) => e.enemyData?.tier === 'boss');
          const bossName = boss ? boss.entityName : 'Abyssal Colossus';
          console.log(`%c[Boss Encounter] ☠️ ENTERED BOSS CHAMBER! ${bossName} has awakened!`, 'color: #ef4444; font-size: 14px; font-weight: bold;');
          if (this.hud) {
            this.hud.showToast(`☠️ BOSS ENCOUNTER: ${bossName} has awakened!`, 'warn', 5000);
          }
        }
      }
    }

    // Milestone 25: Reselect All Party Members [G]
    if (this.gKey && Phaser.Input.Keyboard.JustDown(this.gKey)) {
      this.selectAllMembers();
    }


    // Milestone 25: Number Keys [1]..[4]
    for (let i = 0; i < this.numKeys.length; i++) {
      const key = this.numKeys[i];
      if (key && Phaser.Input.Keyboard.JustDown(key)) {
        const isShift = this.input.keyboard?.checkDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0) ?? false;
        this.selectMemberByIndex(i, isShift);
      }
    }

    // Milestone 25: Render in-world selection circles under selected party members
    if (this.selectionReticleGraphics) {
      this.selectionReticleGraphics.clear();
      for (const member of this.party) {
        if (this.selectedMembers.has(member) && member.state !== 'dead') {
          this.selectionReticleGraphics.lineStyle(2, 0x38bdf8, 0.85);
          this.selectionReticleGraphics.strokeCircle(member.x, member.y + 10, 14);
          this.selectionReticleGraphics.lineStyle(1, 0x60a5fa, 0.4);
          this.selectionReticleGraphics.strokeCircle(member.x, member.y + 10, 17);
        }
      }
    }


    // Debug Grant +25 Weapon EXP [X]
    if (this.xKey && Phaser.Input.Keyboard.JustDown(this.xKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 25);
    }

    // Debug Grant +100 Weapon EXP [Z]
    if (this.zKey && Phaser.Input.Keyboard.JustDown(this.zKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 100);
    }

    // Debug Grant +25 Construction EXP [C]
    if (this.cKey && Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.progressionSystem.addProficiencyExp('construction', 25);
    }

    // WASD Camera Panning
    const panSpeed = 8;
    let panned = false;

    if (this.wasdKeys) {
      if (this.wasdKeys.W.isDown) {
        this.cameras.main.scrollY -= panSpeed;
        panned = true;
      }
      if (this.wasdKeys.S.isDown) {
        this.cameras.main.scrollY += panSpeed;
        panned = true;
      }
      if (this.wasdKeys.A.isDown) {
        this.cameras.main.scrollX -= panSpeed;
        panned = true;
      }
      if (this.wasdKeys.D.isDown) {
        this.cameras.main.scrollX += panSpeed;
        panned = true;
      }

      // Note: Reaching into Phaser's private `_follow` property via (this.cameras.main as any)._follow
      // is an unstable internal API fallback. It is kept as a defensive belt-and-suspenders guard in case
      // isCameraLocked ever gets desynchronized, but may need maintenance if Phaser changes internal follow properties.
      const hasFollowTarget = !!(this.cameras.main as any)._follow;
      if (panned && (this.isCameraLocked || hasFollowTarget)) {
        this.isCameraLocked = false;
        this.cameras.main.stopFollow();
      }

      // Space key re-locks camera onto player
      if (Phaser.Input.Keyboard.JustDown(this.wasdKeys.SPACE)) {
        this.isCameraLocked = true;
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      }
    }

    // Update Clock & Game Day Progress
    GameState.getInstance().updateClock(delta);

    // Update Entities (leading edge units updated first when moving to prevent temporary claim/pos collisions)
    let partyUpdateList = this.party;
    const movingLeader = this.party.find(p => p.isMoving());
    if (movingLeader) {
      const nextTile = movingLeader.getNextPathTile();
      if (nextTile) {
        const dirX = nextTile.x - movingLeader.gridPos.x;
        const dirY = nextTile.y - movingLeader.gridPos.y;
        if (dirX !== 0 || dirY !== 0) {
          partyUpdateList = [...this.party].sort((a, b) => {
            const scoreA = a.gridPos.x * dirX + a.gridPos.y * dirY;
            const scoreB = b.gridPos.x * dirX + b.gridPos.y * dirY;
            return scoreB - scoreA;
          });
        }
      }
    }
    for (const member of partyUpdateList) {
      member.update(time, delta);
    }
    for (const enemy of this.enemies) {
      enemy.update(time, delta);
    }

    this.updateMoveDestinationHighlights();

    // Standing Tile-Claim Debug Overlay update loop (runs after entity updates so state is clean and consistent)
    if (this.tileClaimOverlay) {
      this.tileClaimOverlay.update(time);
    }

    // Milestone 17: Update Active Gathering Channels
    for (const [character, channel] of Array.from(this.activeGatherChannels.entries())) {
      if (character.state !== 'channeling' || character.hp <= 0 || (character.state as any) === 'downed' || (character.state as any) === 'dead') {
        this.cancelGatherChannel(character);
        continue;
      }

      channel.elapsedMs += delta;
      const pct = Math.min(1, channel.elapsedMs / channel.durationMs);

      // Keep progress bar aligned above character
      channel.barContainer.setPosition(character.x, character.y - 28);

      // Redraw fill
      channel.barFill.clear();
      const fillColorHex = channel.node.nodeDef.color || '#34d399';
      const fillColor = Phaser.Display.Color.HexStringToColor(fillColorHex).color;
      channel.barFill.fillStyle(fillColor, 1);
      const fillW = Math.max(0, Math.floor(34 * pct));
      if (fillW > 0) {
        channel.barFill.fillRect(-17, -2, fillW, 4);
      }
      channel.labelText.setText(`${channel.node.nodeDef.actionVerb}... ${Math.floor(pct * 100)}%`);

      if (channel.elapsedMs >= channel.durationMs) {
        this.completeGatherChannel(character, channel);
      }
    }

    // Milestone 31: Update Active Revive Channels
    for (const [character, channel] of Array.from(this.activeReviveChannels.entries())) {
      if (
        character.state !== 'channeling' ||
        character.hp <= 0 ||
        (character.state as any) === 'downed' ||
        (character.state as any) === 'dead' ||
        channel.targetAlly.state !== 'downed'
      ) {
        this.cancelReviveChannel(character);
        continue;
      }

      channel.elapsedMs += delta;
      const pct = Math.min(1, channel.elapsedMs / channel.durationMs);

      // Keep progress bar aligned above reviver
      channel.barContainer.setPosition(character.x, character.y - 28);

      // Redraw fill in golden amber
      channel.barFill.clear();
      channel.barFill.fillStyle(0xfacc15, 1);
      const fillW = Math.max(0, Math.floor(34 * pct));
      if (fillW > 0) {
        channel.barFill.fillRect(-17, -2, fillW, 4);
      }
      channel.labelText.setText(`Reviving... ${Math.floor(pct * 100)}%`);

      if (channel.elapsedMs >= channel.durationMs) {
        this.completeReviveChannel(character, channel);
      }
    }

    // Update Combat System
    this.combatSystem.update(time, delta);

    // Milestone 16: Continuous Floor Timer Countdown
    this.floorTimerRemainingMs -= delta;
    if (this.floorTimerRemainingMs <= 0) {
      this.repopulateRandomRoom();
      this.floorTimerRemainingMs = this.floorTimerDurationMs;
    }
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }

    // Update HUD Overlay
    this.hud.update(this.player, this.progressionSystem, time, this.party);
  }

  /**
   * Milestone 16: Repopulates exactly one random combat-designated room with a fresh set of enemies
   * using Milestone 13 room-population logic (pool & room-type-appropriate enemy counts).
   */
  public repopulateRandomRoom(): DungeonRoom | null {
    if (!this.dungeon || !this.dungeon.rooms || this.dungeon.rooms.length === 0) {
      return null;
    }

    // Restrict repopulation candidates strictly to combat rooms (excluding entrance and pure gathering)
    const combatRooms = this.dungeon.rooms.filter(
      (r) => r.type === 'light_combat' || r.type === 'heavy_combat'
    );
    if (combatRooms.length === 0) {
      console.warn('[Floor Timer] No eligible combat rooms found for repopulation.');
      return null;
    }

    // Pick exactly one random combat room
    const targetRoom = combatRooms[Math.floor(Math.random() * combatRooms.length)];
    const dataLoader = DataLoader.getInstance();
    const dungeonConfig = dataLoader.getDungeonConfig();

    // Strict scoped cleanup: Destroy and remove leftover corpses/units belonging only to this specific room
    const inRoom = this.enemies.filter((e) => e.roomIndex === targetRoom.id);
    for (const enemy of inRoom) {
      if (enemy.corpseNode) {
        const cIdx = this.gatheringNodes.indexOf(enemy.corpseNode);
        if (cIdx !== -1) this.gatheringNodes.splice(cIdx, 1);
        enemy.corpseNode.sprite?.destroy();
        enemy.corpseNode.label?.destroy();
        enemy.corpseNode = null;
      }
      enemy.destroy();
    }

    // Remove from this.enemies in-place
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].roomIndex === targetRoom.id) {
        this.enemies.splice(i, 1);
      }
    }

    // Reconstruct interior walkable tiles in targetRoom (leaving 1 tile border from walls where possible)
    const interiorTiles: GridPos[] = [];
    const xStart = targetRoom.width > 3 ? targetRoom.x + 1 : targetRoom.x;
    const xEnd = targetRoom.width > 3 ? targetRoom.x + targetRoom.width - 2 : targetRoom.x + targetRoom.width - 1;
    const yStart = targetRoom.height > 3 ? targetRoom.y + 1 : targetRoom.y;
    const yEnd = targetRoom.height > 3 ? targetRoom.y + targetRoom.height - 2 : targetRoom.y + targetRoom.height - 1;

    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        if (this.gridMatrix[y]?.[x] === 0) {
          // Do not spawn on entrance portal or occupied party member tiles
          const onPortal = x === this.portalPos.x && y === this.portalPos.y;
          const onParty = this.party.some((m) => m.gridPos.x === x && m.gridPos.y === y);
          if (!onPortal && !onParty) {
            interiorTiles.push({ x, y });
          }
        }
      }
    }

    // Shuffle interior tiles
    for (let i = interiorTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = interiorTiles[i];
      interiorTiles[i] = interiorTiles[j];
      interiorTiles[j] = temp;
    }

    const roomConfig = dungeonConfig.roomTypes?.[targetRoom.type as keyof typeof dungeonConfig.roomTypes];
    const [minE, maxE] = roomConfig?.enemiesRange ?? (
      targetRoom.type === 'light_combat' ? [1, 2] : targetRoom.type === 'heavy_combat' ? [3, 5] : [1, 2]
    );
    const randCount = Math.floor(Math.random() * (maxE - minE + 1)) + minE;
    const enemyCount = Math.min(interiorTiles.length, randCount);

    const enemyPool = dungeonConfig.enemyPool && dungeonConfig.enemyPool.length > 0
      ? dungeonConfig.enemyPool
      : ['wolf', 'goblin', 'skeleton', 'undead'];

    // In Heavy Combat rooms, evaluate rare Epic or Elite champion roll (NEVER Boss)
    let specialEnemyId: string | null = null;
    if (targetRoom.type === 'heavy_combat') {
      const epicChance = dungeonConfig.epicChance ?? 0.05;
      const eliteChance = dungeonConfig.eliteChance ?? 0.12;
      if (Math.random() < epicChance) {
        specialEnemyId = dungeonConfig.epicEnemyId || 'void_knight';
      } else if (Math.random() < eliteChance) {
        specialEnemyId = dungeonConfig.eliteEnemyId || 'orc_warrior';
      }
    }

    const spawnedEnemies: Enemy[] = [];
    for (let i = 0; i < enemyCount; i++) {
      const enemyId = (i === 0 && specialEnemyId)
        ? specialEnemyId
        : enemyPool[Math.floor(Math.random() * enemyPool.length)];
      const enemyDef = dataLoader.getEnemy(enemyId);
      if (enemyDef) {
        const texKey = `${enemyDef.id}-avatar`;
        const tex = this.textures.exists(texKey) ? texKey : 'wolf-avatar';
        const tile = interiorTiles[i];
        const newEnemy = this.spawnEnemyUnit(enemyDef, tile.x, tile.y, tex);
        newEnemy.roomIndex = targetRoom.id;
        spawnedEnemies.push(newEnemy);
      }
    }

    this.combatSystem.setEnemies(this.enemies);

    console.log(
      `%c[Floor Timer] ⏳ Floor timer expired! Repopulated Room #${targetRoom.id} (${targetRoom.type}) with ${spawnedEnemies.length} fresh enemies: [${spawnedEnemies.map((e) => e.entityName).join(', ')}]`,
      'color: #ef4444; font-weight: bold;'
    );

    if (this.hud) {
      this.hud.showToast(
        `⚠️ The dungeon stirs... Room ${targetRoom.id} (${targetRoom.type.replace('_', ' ')}) has been repopulated!`,
        'warn',
        4000
      );
    }

    return targetRoom;
  }

  public fastForwardFloorTimer(seconds: number = 60): void {
    this.floorTimerRemainingMs -= seconds * 1000;
    console.log(
      `[Debug] Fast-forwarded floor timer by ${seconds}s. Remaining: ${(Math.max(0, this.floorTimerRemainingMs) / 1000).toFixed(1)}s`
    );
    if (this.floorTimerRemainingMs <= 0) {
      this.repopulateRandomRoom();
      this.floorTimerRemainingMs = this.floorTimerDurationMs;
    }
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }
  }

  public triggerFloorRespawn(): void {
    console.log('[Debug] Manually triggered floor respawn.');
    this.repopulateRandomRoom();
    this.floorTimerRemainingMs = this.floorTimerDurationMs;
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }
  }

  public toggleDebugAutoRespawn(): boolean {
    this.debugAutoRespawnEnabled = !this.debugAutoRespawnEnabled;
    const label = this.debugAutoRespawnEnabled ? 'ON (3s Respawn)' : 'OFF (Stay Dead)';
    console.log(`%c[Debug Respawn] Per-enemy auto-respawn is now: ${label}`, 'color: #38bdf8; font-weight: bold;');
    if (this.hud) {
      this.hud.showToast(`🔄 Debug Auto-Respawn: ${label}`, this.debugAutoRespawnEnabled ? 'warn' : 'info', 2500);
      this.hud.updateDebugAutoRespawnBtn(this.debugAutoRespawnEnabled);
    }
    return this.debugAutoRespawnEnabled;
  }

  public dealDebugDamageToEnemy(amount: number = 5): boolean {
    let targetEnemy: Enemy | null = null;
    for (const member of this.party) {
      if (member.targetEntity instanceof Enemy && member.targetEntity.state !== 'dead' && member.targetEntity.state !== 'downed') {
        targetEnemy = member.targetEntity;
        break;
      }
    }
    if (!targetEnemy) {
      targetEnemy = this.enemies.find((e) => e.state !== 'dead' && e.state !== 'downed') || null;
    }

    if (targetEnemy) {
      console.log(`[Debug Damage] Dealing ${amount} debug damage to ${targetEnemy.entityName}!`);
      const wasDowned = targetEnemy.takeDamage(amount);
      if (wasDowned) {
        console.log(`[Debug Damage] ${targetEnemy.entityName} was downed by debug hit!`);
        this.onEnemyDefeated(targetEnemy);
      }
      return true;
    }
    return false;
  }

  public onEnemyDefeated(deadEnemy: Enemy): void {
    this.targetReticle.setVisible(false);
    deadEnemy.markDead();
    this.checkAndCreateCorpseGatheringNode(deadEnemy);

    if (TutorialSystem.getInstance().getCurrentStep()?.id === 'basic_combat') {
      TutorialSystem.getInstance().completeStepId('basic_combat');
      this.time.delayedCall(1000, () => {
        this.hud?.showToast('🏹 Valerie: "Enemy defeated! Genuinely cleared rooms are completely safe. Approach an Ore node or Tree and left-click to harvest."', 'info', 7000);
      });
    }

    if (this.debugAutoRespawnEnabled) {
      console.log(`[Combat] ${deadEnemy.entityName} defeated. [DEBUG AUTO-RESPAWN ACTIVE] Respawn scheduled in 3 seconds.`);
      this.time.delayedCall(3000, () => {
        if (this.debugAutoRespawnEnabled && deadEnemy.state === 'dead') {
          deadEnemy.respawn();
        }
      });
    } else {
      console.log(`[Combat] ${deadEnemy.entityName} defeated. Enemy stays dead (floor timer repopulation active).`);
    }
  }

  public defeatEnemy(enemy: Enemy): void {
    enemy.takeDamage(99999);
    this.onEnemyDefeated(enemy);
  }

  public isEnemyAnimalType(enemyId: string): boolean {
    const id = enemyId.toLowerCase();
    return id === 'wolf' || id === 'spider';
  }

  public isEnemyUndeadOrSkeleton(enemyId: string): boolean {
    const id = enemyId.toLowerCase();
    return id.includes('skeleton') || id.includes('undead');
  }

  public isEnemyButcherEligible(enemyId: string): boolean {
    return !this.isEnemyUndeadOrSkeleton(enemyId);
  }

  public checkAndCreateCorpseGatheringNode(deadEnemy: Enemy): GatheringNode | null {
    const gameState = GameState.getInstance();
    const enemyId = deadEnemy.enemyData.id.toLowerCase();
    const isAnimal = this.isEnemyAnimalType(enemyId);
    const isButcherEligible = this.isEnemyButcherEligible(enemyId);
    const skinningUnlocked = gameState.isSkinningUnlocked();
    const butcheringUnlocked = gameState.isButcheringUnlocked();

    // Animal type corpses (Wolf, Spider): strictly requires Skinning unlocked
    if (isAnimal) {
      if (!skinningUnlocked) {
        console.log(`[Corpse Gathering] Animal corpse (${deadEnemy.entityName}) not harvestable: Skinning research not unlocked.`);
        return null;
      }
      return this.spawnCorpseGatheringNode(deadEnemy, 'skinning');
    }

    // Non-animal butcher-eligible corpses (Goblin, Goblin Archer, etc.)
    if (isButcherEligible) {
      const hasMeat = !!deadEnemy.enemyData.corpseHarvest?.butchering?.item;
      if (!hasMeat) {
        console.log(`[Corpse Gathering] Corpse (${deadEnemy.entityName}) is eligible but has no meat yield defined.`);
        return null;
      }
      if (!butcheringUnlocked) {
        console.log(`[Corpse Gathering] Corpse (${deadEnemy.entityName}) not harvestable: Butchering research not unlocked.`);
        return null;
      }
      return this.spawnCorpseGatheringNode(deadEnemy, 'butchering');
    }

    return null;
  }

  public spawnCorpseGatheringNode(deadEnemy: Enemy, actionType: 'skinning' | 'butchering'): GatheringNode {
    const isSkinning = actionType === 'skinning';
    const corpseHarvest = deadEnemy.enemyData.corpseHarvest;
    const harvestDef = isSkinning ? corpseHarvest?.skinning : corpseHarvest?.butchering;

    const defaultResource = isSkinning
      ? (deadEnemy.enemyData.id === 'wolf' ? 'wolf_pelt' : 'spider_silk')
      : (deadEnemy.enemyData.id === 'wolf' ? 'wolf_meat' : 'monster_meat');

    const resourceId = harvestDef?.item || defaultResource;
    const actionVerb = isSkinning ? 'Skinning' : 'Butchering';
    const skillId = isSkinning ? 'skinning' : 'butchering';
    const color = isSkinning ? '#eab308' : '#ef4444';
    const labelText = `${deadEnemy.entityName} Corpse (${actionVerb})`;

    const nodeDef: GatheringNodeDef = {
      id: `corpse_${skillId}_${deadEnemy.enemyData.id}_${Date.now()}_${Math.random()}`,
      name: `${deadEnemy.entityName} Corpse`,
      skillId,
      resourceId,
      yieldCount: harvestDef?.count || 1,
      expGranted: harvestDef?.exp || 15,
      channelDurationMs: 2500,
      respawnTimeMs: 0,
      textureKey: deadEnemy.avatarSprite?.texture?.key || (deadEnemy.enemyData.id === 'spider' ? 'spider-avatar' : 'wolf-avatar'),
      textureDepletedKey: deadEnemy.avatarSprite?.texture?.key || (deadEnemy.enemyData.id === 'spider' ? 'spider-avatar' : 'wolf-avatar'),
      label: labelText,
      depletedLabel: 'Spent Corpse',
      color,
      actionVerb
    };

    const posX = deadEnemy.x;
    const posY = deadEnemy.y;

    const sprite = this.add.sprite(posX, posY, nodeDef.textureKey)
      .setDepth(posY - 1)
      .setAngle(90)
      .setAlpha(0.6)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(posX, posY - 18, labelText, {
      fontSize: '9px',
      color,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(5001);

    const node: GatheringNode = {
      x: deadEnemy.gridPos.x,
      y: deadEnemy.gridPos.y,
      nodeDef,
      sprite,
      label,
      isHarvested: false,
      corpseEnemy: deadEnemy,
      isSkinned: isSkinning ? false : true,
      isButchered: false
    };

    deadEnemy.corpseNode = node;

    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (this.isGatheringMode) return;
      if (event && event.stopPropagation) event.stopPropagation();
      const activeSelected = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
      this.interactWithGatheringNode(node, activeSelected.length > 0 ? activeSelected : undefined);
    });

    this.gatheringNodes.push(node);
    console.log(`[Corpse Gathering] Spawned ${nodeDef.label} at (${node.x}, ${node.y}).`);
    return node;
  }

  public canSkinCorpse(enemy: Enemy): { canHarvest: boolean; reason?: string } {
    if (enemy.state !== 'dead') {
      return { canHarvest: false, reason: 'Enemy is still alive' };
    }
    if (!GameState.getInstance().isSkinningUnlocked()) {
      return { canHarvest: false, reason: 'Skinning research not unlocked' };
    }
    if (!this.isEnemyAnimalType(enemy.enemyData.id)) {
      return { canHarvest: false, reason: 'Enemy is not an animal (only Wolf and Spider can be skinned)' };
    }
    if (enemy.isSkinned || (enemy.corpseNode && enemy.corpseNode.isSkinned)) {
      return { canHarvest: false, reason: 'Corpse has already been skinned' };
    }
    return { canHarvest: true };
  }

  public canButcherCorpse(enemy: Enemy): { canHarvest: boolean; reason?: string } {
    if (enemy.state !== 'dead') {
      return { canHarvest: false, reason: 'Enemy is still alive' };
    }
    if (!GameState.getInstance().isButcheringUnlocked()) {
      return { canHarvest: false, reason: 'Butchering research not unlocked' };
    }
    if (this.isEnemyUndeadOrSkeleton(enemy.enemyData.id)) {
      return { canHarvest: false, reason: 'Cannot butcher undead or skeletal remains' };
    }
    // Check ordering gate: if animal-type, skinning MUST be completed first!
    if (this.isEnemyAnimalType(enemy.enemyData.id) && !enemy.isSkinned && (!enemy.corpseNode || !enemy.corpseNode.isSkinned)) {
      return { canHarvest: false, reason: 'Must skin corpse before butchering' };
    }
    if (enemy.isButchered || (enemy.corpseNode && enemy.corpseNode.isButchered)) {
      return { canHarvest: false, reason: 'Corpse has already been butchered' };
    }
    return { canHarvest: true };
  }

  public attemptSkinCorpse(enemy: Enemy, actor?: Player): { success: boolean; reason?: string } {
    const check = this.canSkinCorpse(enemy);
    if (!check.canHarvest) {
      if (this.hud) {
        this.hud.showToast(`⚠️ Cannot skin: ${check.reason}`, 'warn', 2500);
      }
      return { success: false, reason: check.reason };
    }

    let node = enemy.corpseNode;
    if (!node || node.isHarvested) {
      node = this.spawnCorpseGatheringNode(enemy, 'skinning');
    }

    const resolvedActor = actor || (this.getSelectedMembers ? this.getSelectedMembers().find(m => m.state !== 'downed' && m.state !== 'dead') : undefined) || this.player;
    this.interactWithGatheringNode(node, resolvedActor);
    return { success: true };
  }

  public attemptButcherCorpse(enemy: Enemy, actor?: Player): { success: boolean; reason?: string } {
    const check = this.canButcherCorpse(enemy);
    if (!check.canHarvest) {
      if (this.hud) {
        this.hud.showToast(`⚠️ Cannot butcher: ${check.reason}`, 'warn', 2500);
      }
      return { success: false, reason: check.reason };
    }

    let node = enemy.corpseNode;
    if (!node || node.nodeDef.skillId !== 'butchering' || node.isHarvested) {
      node = this.spawnCorpseGatheringNode(enemy, 'butchering');
    }

    const resolvedActor = actor || (this.getSelectedMembers ? this.getSelectedMembers().find(m => m.state !== 'downed' && m.state !== 'dead') : undefined) || this.player;
    this.interactWithGatheringNode(node, resolvedActor);
    return { success: true };
  }

  public spawnEnemyUnit(enemyData: EnemyDef, x: number, y: number, textureKey: string, customName?: string): Enemy {
    const enemy = new Enemy(this, x, y, enemyData, textureKey, this.tileSize);
    if (customName) enemy.entityName = customName;
    this.enemies.push(enemy);
    enemy.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (this.isGatheringMode) return;
      if (event && event.stopPropagation) event.stopPropagation();
      if (enemy.state === 'dead') {
        if (enemy.corpseNode && !enemy.corpseNode.isHarvested) {
          const activeSelected = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
          this.interactWithGatheringNode(enemy.corpseNode, activeSelected.length > 0 ? activeSelected : undefined);
        }
        return;
      }
      const activeSelected = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
      if (activeSelected.length > 0) {
        for (const m of activeSelected) {
          this.cancelGatherChannel(m);
        }
        this.engageEnemy(enemy, activeSelected);
      } else {
        this.engageEnemy(enemy);
      }
    });
    return enemy;
  }

  // --- UNIVERSAL GATHERING SYSTEM: FORAGING, WOODCUTTING & MINING (Milestone 17) ---

  public spawnGatheringNode(x: number, y: number, nodeTypeId: string = 'foraging_bush'): GatheringNode {
    const dataLoader = DataLoader.getInstance();
    const config = dataLoader.getGatheringNodesConfig();
    const nodeDef: GatheringNodeDef = config?.nodes?.[nodeTypeId] || dataLoader.getGatheringNode(nodeTypeId) || {
      id: nodeTypeId,
      name: nodeTypeId.includes('tree') ? 'Tree' : nodeTypeId.includes('rock') ? 'Rock Vein' : nodeTypeId.includes('dig') ? 'Dig Spot' : nodeTypeId.includes('vegetable') ? 'Wild Vegetable' : 'Wild Herbs',
      skillId: nodeTypeId.includes('tree') ? 'woodcutting' : nodeTypeId.includes('rock') ? 'mining' : nodeTypeId.includes('dig') ? 'digging' : nodeTypeId.includes('vegetable') ? 'gardening' : 'foraging',
      resourceId: nodeTypeId.includes('tree') ? 'wood' : nodeTypeId.includes('rock') ? 'ore' : nodeTypeId.includes('dig') ? 'dirt' : nodeTypeId.includes('vegetable') ? 'vegetable' : 'wild_herbs',
      yieldCount: nodeTypeId.includes('tree') ? 2 : 1,
      expGranted: 15,
      channelDurationMs: 2500,
      respawnTimeMs: 15000,
      textureKey: nodeTypeId.includes('tree') ? 'woodcutting-tree' : nodeTypeId.includes('rock') ? 'mining-rock' : nodeTypeId.includes('dig') ? 'dig-spot' : nodeTypeId.includes('vegetable') ? 'vegetable-node' : 'foraging-bush',
      textureDepletedKey: nodeTypeId.includes('tree') ? 'woodcutting-tree-depleted' : nodeTypeId.includes('rock') ? 'mining-rock-depleted' : nodeTypeId.includes('dig') ? 'dig-spot-depleted' : nodeTypeId.includes('vegetable') ? 'vegetable-node-depleted' : 'foraging-bush-depleted',
      label: nodeTypeId.includes('tree') ? 'Tree' : nodeTypeId.includes('rock') ? 'Rock Vein' : nodeTypeId.includes('dig') ? 'Dig Spot' : nodeTypeId.includes('vegetable') ? 'Wild Vegetable' : 'Wild Herbs',
      depletedLabel: nodeTypeId.includes('tree') ? 'Stump' : nodeTypeId.includes('rock') ? 'Depleted' : nodeTypeId.includes('dig') ? 'Excavated' : 'Stripped',
      color: nodeTypeId.includes('tree') ? '#f59e0b' : nodeTypeId.includes('rock') ? '#94a3b8' : nodeTypeId.includes('dig') ? '#b45309' : nodeTypeId.includes('vegetable') ? '#22c55e' : '#34d399',
      actionVerb: nodeTypeId.includes('tree') ? 'Logging' : nodeTypeId.includes('rock') ? 'Mining' : nodeTypeId.includes('dig') ? 'Digging' : nodeTypeId.includes('vegetable') ? 'Gardening' : 'Foraging'
    };

    const posX = x * this.tileSize + this.tileSize / 2;
    const posY = y * this.tileSize + this.tileSize / 2;

    const sprite = this.add.sprite(posX, posY, nodeDef.textureKey)
      .setDepth(posY - 2)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(posX, posY - 16, nodeDef.label, {
      fontSize: '10px',
      color: nodeDef.color,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(5000);

    const node: GatheringNode = {
      x,
      y,
      nodeDef,
      sprite,
      label,
      isHarvested: false
    };

    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (this.isGatheringMode) return;
      if (event && event.stopPropagation) event.stopPropagation();
      const activeSelected = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
      this.interactWithGatheringNode(node, activeSelected.length > 0 ? activeSelected : undefined);
    });

    this.gatheringNodes.push(node);
    return node;
  }

  public spawnForagingBush(x: number, y: number): GatheringNode {
    return this.spawnGatheringNode(x, y, 'foraging_bush');
  }

  public interactWithGatheringNode(node: GatheringNode, character?: Player | Player[]): void {
    if (node.isHarvested) {
      this.hud?.showToast(`🌿 ${node.nodeDef.name} is depleted. Stays depleted for remainder of visit.`, 'info', 2000);
      return;
    }

    const resolvedActors: Player[] = character
      ? (Array.isArray(character)
          ? character.filter(m => m.state !== 'downed' && m.state !== 'dead')
          : (character.state !== 'downed' && character.state !== 'dead' ? [character] : []))
      : (this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : []);

    if (resolvedActors.length === 0) {
      if (this.player && this.player.state !== 'downed' && this.player.state !== 'dead') {
        resolvedActors.push(this.player);
      } else {
        return;
      }
    }

    // Cancel existing gather channels and clear targets ONLY for resolvedActors
    for (const actor of resolvedActors) {
      this.cancelGatherChannel(actor);
      actor.clearTarget();
    }
    if (!this.party.some(m => m.targetEntity !== null)) {
      this.targetReticle?.setVisible(false);
    }

    // Manual single-click override: Release node from background gathering queue and conflicting worker assignments
    const qIdx = this.gatheringQueue.indexOf(node);
    if (qIdx !== -1) {
      this.gatheringQueue.splice(qIdx, 1);
    }
    for (const [worker, assignedNode] of Array.from(this.gatheringWorkerNodeAssignments.entries())) {
      if (assignedNode === node && !resolvedActors.includes(worker)) {
        this.gatheringWorkerNodeAssignments.delete(worker);
        worker.claimedDestination = null;
        if (worker.state === 'moving') {
          worker.stopMovement();
        }
        if (this.activeGatherChannels.has(worker)) {
          this.cancelGatherChannel(worker);
        }
      }
    }

    const claimed = new Set<string>();

    // Pre-reserve unselected living members' current tiles and claimed destinations so moving members do not collide
    for (const other of this.party) {
      if (!resolvedActors.includes(other) && other.state !== 'dead') {
        claimed.add(`${other.gridPos.x},${other.gridPos.y}`);
        if (other.claimedDestination) {
          claimed.add(`${other.claimedDestination.x},${other.claimedDestination.y}`);
        }
      }
    }

    const primaryGatherer = resolvedActors[0];
    const dist = Math.hypot(primaryGatherer.gridPos.x - node.x, primaryGatherer.gridPos.y - node.y);

    if (dist <= 1.5) {
      // Adjacent: start universal channel immediately
      this.startGatherChannel(primaryGatherer, node);
    } else {
      // Find open adjacent tile to node and move there, then channel
      const adjTiles = [
        { x: node.x + 1, y: node.y },
        { x: node.x - 1, y: node.y },
        { x: node.x, y: node.y + 1 },
        { x: node.x, y: node.y - 1 },
        { x: node.x + 1, y: node.y + 1 },
        { x: node.x - 1, y: node.y + 1 },
        { x: node.x + 1, y: node.y - 1 },
        { x: node.x - 1, y: node.y - 1 }
      ].filter(t => t.x > 0 && t.x < this.mapWidth - 1 && t.y > 0 && t.y < this.mapHeight - 1 && this.gridMatrix[t.y]?.[t.x] === 0 && !claimed.has(`${t.x},${t.y}`) && !this.gatheringNodes.some(other => !other.isHarvested && other !== node && other.x === t.x && other.y === t.y));

      adjTiles.sort((a, b) => Math.hypot(a.x - primaryGatherer.gridPos.x, a.y - primaryGatherer.gridPos.y) - Math.hypot(b.x - primaryGatherer.gridPos.x, b.y - primaryGatherer.gridPos.y));

      let targetTile = adjTiles[0];
      if (!targetTile) {
        targetTile = this.findNearestOpenTileForPartyMove({ x: node.x, y: node.y }, primaryGatherer.gridPos, claimed, primaryGatherer);
      }

      if (targetTile) {
        claimed.add(`${targetTile.x},${targetTile.y}`);
        primaryGatherer.claimedDestination = { ...targetTile };

        const unitObs = this.getPartyUnitObstacles(primaryGatherer);
        this.pathfinder.findPath(primaryGatherer.gridPos, targetTile, unitObs).then(async (path) => {
          let resolvedPath = path;
          if (resolvedPath.length === 0) {
            // Bottleneck fallback: living enemies in distant rooms/corridors should not prevent gathering movement
            resolvedPath = await this.pathfinder.findPath(primaryGatherer.gridPos, targetTile, { soft: unitObs.soft, hard: [] });
            if (resolvedPath.length === 0) {
              resolvedPath = await this.pathfinder.findPath(primaryGatherer.gridPos, targetTile);
            }
          }
          if (resolvedPath.length > 0) {
            primaryGatherer.followPath(resolvedPath, () => {
              if (Math.hypot(primaryGatherer.gridPos.x - node.x, primaryGatherer.gridPos.y - node.y) <= 1.5) {
                this.startGatherChannel(primaryGatherer, node);
              }
            });
            const oldTimer = this.gatheringArrivalTimers.get(primaryGatherer);
            if (oldTimer) {
              oldTimer.remove();
              this.gatheringArrivalTimers.delete(primaryGatherer);
            }
            const checkArrival = this.time.addEvent({
              delay: 150,
              loop: true,
              callback: () => {
                if (Math.hypot(primaryGatherer.gridPos.x - node.x, primaryGatherer.gridPos.y - node.y) <= 1.5) {
                  checkArrival.remove();
                  this.gatheringArrivalTimers.delete(primaryGatherer);
                  this.startGatherChannel(primaryGatherer, node);
                } else if (!primaryGatherer.isMoving() && primaryGatherer.state !== 'moving') {
                  checkArrival.remove();
                  this.gatheringArrivalTimers.delete(primaryGatherer);
                }
              }
            });
            this.gatheringArrivalTimers.set(primaryGatherer, checkArrival);

            // Escort companions follow the gatherer's shared path in convoy and spread into formation around the node upon arrival
            if (resolvedActors.length > 1) {
              const formationOffsets = [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
                { x: 1, y: 1 }
              ];
              const anchorTile = targetTile;
              for (let i = 1; i < resolvedActors.length; i++) {
                const companion = resolvedActors[i];
                const offset = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
                const idealPos: GridPos = { x: anchorTile.x + offset.x, y: anchorTile.y + offset.y };
                const compDest = this.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
                claimed.add(`${compDest.x},${compDest.y}`);
                companion.claimedDestination = { ...compDest };
                this.pathfinder.findPath(companion.gridPos, compDest, unitObs).then((cPath) => {
                  if (cPath.length > 0) {
                    companion.followPath(cPath, undefined, compDest);
                  } else {
                    companion.claimedDestination = null;
                  }
                });
              }
            }
          } else {
            primaryGatherer.claimedDestination = null;
            for (let i = 1; i < resolvedActors.length; i++) {
              resolvedActors[i].claimedDestination = null;
            }
            this.hud?.showToast(`⚠️ Cannot reach ${node.nodeDef.name} - path is blocked.`, 'warn', 2500);
          }
        });
      }
    }
  }

  public interactWithBush(bush: ForagingBush): void {
    this.interactWithGatheringNode(bush);
  }

  public startGatherChannel(character: Player, node: GatheringNode): boolean {
    if (node.isHarvested || character.state === 'downed' || character.state === 'dead') {
      return false;
    }

    // Cancel any existing channel container
    const existingChannel = this.activeGatherChannels.get(character);
    if (existingChannel) {
      existingChannel.barContainer.destroy();
      this.activeGatherChannels.delete(character);
    }

    // Halt movement and combat targets
    character.state = 'channeling';
    character.claimedDestination = null;
    character.clearTarget();

    const durationMs = node.nodeDef.channelDurationMs || 2500;

    // Visual Progress Bar Container positioned above character
    const posX = character.x;
    const posY = character.y - 28;
    const barContainer = this.add.container(posX, posY).setDepth(10001);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x111827, 0.85);
    barBg.fillRect(-18, -3, 36, 6);
    barBg.lineStyle(1, 0x374151, 1);
    barBg.strokeRect(-18, -3, 36, 6);

    const barFill = this.add.graphics();

    const labelText = this.add.text(0, -12, `${node.nodeDef.actionVerb}... 0%`, {
      fontSize: '9px',
      fontStyle: 'bold',
      color: node.nodeDef.color || '#34d399',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5);

    barContainer.add([barBg, barFill, labelText]);

    const channel: ActiveGatherChannel = {
      character,
      node,
      durationMs,
      elapsedMs: 0,
      barContainer,
      barBg,
      barFill,
      labelText
    };

    this.activeGatherChannels.set(character, channel);
    console.log(`[Gathering] ⛏️ ${character.entityName} started channeling ${node.nodeDef.name} (${durationMs}ms)...`);
    return true;
  }

  public completeGatherChannel(character: Player, channel: ActiveGatherChannel): void {
    const timer = this.gatheringArrivalTimers.get(character);
    if (timer) {
      timer.remove();
      this.gatheringArrivalTimers.delete(character);
    }
    channel.barContainer.destroy();
    this.activeGatherChannels.delete(character);

    if (character.state === 'channeling') {
      character.state = 'idle';
    }

    this.harvestGatheringNode(channel.node, character);

    // Milestone 26: Advance Gathering Queue
    if (this.gatheringWorkerNodeAssignments.has(character)) {
      this.gatheringWorkerNodeAssignments.delete(character);

      // Filter remaining unharvested nodes in queue
      const remainingUnclaimed = this.gatheringQueue.filter(n => !n.isHarvested);
      if (remainingUnclaimed.length > 0) {
        this.processGatheringQueue();
      } else if (this.gatheringWorkerNodeAssignments.size === 0) {
        console.log('[Gathering Queue] All nodes harvested! Workers hold position.');
        this.hud?.showToast('🌿 Gathering queue complete!', 'success', 2500);
        if (this.isGatheringMode) {
          this.toggleGatheringMode(false);
        }
      }
      // Section 11.2a: Once the queue is exhausted, members remain wherever they last gathered
      // rather than auto-returning to formation. (character remains idle at current position)
    }
  }

  public harvestGatheringNode(node: GatheringNode, character: Player = this.player, lootRollFn?: () => number): void {
    if (node.isHarvested) return;

    node.isHarvested = true;
    node.sprite.setTexture(node.nodeDef.textureDepletedKey);
    node.label.setText(node.nodeDef.depletedLabel);
    node.label.setColor('#9ca3af');

    const yieldCount = node.nodeDef.yieldCount || 1;
    const expGranted = node.nodeDef.expGranted || 15;

    let awardedResourceId = node.nodeDef.resourceId;
    let awardedItemName = node.nodeDef.name;
    let awardedCount = yieldCount;

    if (node.nodeDef.lootTable && node.nodeDef.lootTable.length > 0) {
      const totalWeight = node.nodeDef.lootTable.reduce((sum, e) => sum + (e.weight ?? 1), 0);
      const rollVal = (lootRollFn ? lootRollFn() : Math.random()) * totalWeight;
      let acc = 0;
      let selected = node.nodeDef.lootTable[0];
      for (const entry of node.nodeDef.lootTable) {
        acc += (entry.weight ?? 1);
        if (rollVal <= acc) {
          selected = entry;
          break;
        }
      }
      awardedResourceId = selected.itemId || selected.resourceId || node.nodeDef.resourceId;
      awardedItemName = selected.name || awardedResourceId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      awardedCount = selected.count ?? (selected.yieldCount ?? yieldCount);
    }

    // Grant resources to character personal inventory (Milestone 51) and GameState economy
    if (awardedResourceId && awardedResourceId !== '') {
      const wasEncumbered = character.isEncumbered;
      character.addItem(awardedResourceId, awardedCount);
      if (!wasEncumbered && character.isEncumbered) {
        this.hud?.showToast(`⚠️ ${character.entityName} is ENCUMBERED (-80% Movement Speed)!`, 'warn', 3000);
      }
      if (awardedResourceId === 'wood') {
        GameState.getInstance().addWood(awardedCount);
        GameState.getInstance().addItem('wood', awardedCount);
      } else if (awardedResourceId === 'ore') {
        GameState.getInstance().addOre(awardedCount);
        GameState.getInstance().addItem('ore', awardedCount);
      } else {
        GameState.getInstance().addItem(awardedResourceId, awardedCount);
      }

      if (TutorialSystem.getInstance().getCurrentStep()?.id === 'safe_gathering') {
        TutorialSystem.getInstance().completeStepId('safe_gathering');
        this.time.delayedCall(1000, () => {
          this.hud?.showToast('🏹 Valerie: "Great harvest! Monster kills and discoveries earn Research Points (RP), while nodes yield crafting materials. When you are ready, use the portal or Escape Stone [T] to return to base."', 'info', 7500);
        });
      }
    }

    // Milestone 39: Rare Dungeon Vegetable Node Seed Bonus Gated at Gardening Level 1
    let bonusSeeds = 0;
    if (node.nodeDef.id === 'vegetable_node' || node.nodeDef.resourceId === 'vegetable') {
      const gardeningLevel = character.progression.getProficiencyLevel('gardening');
      if (gardeningLevel >= 1) {
        const seedRoll = lootRollFn ? lootRollFn() : Math.random();
        if (seedRoll < 0.5) {
          bonusSeeds = 1;
          character.addItem('seeds', 1);
          GameState.getInstance().addItem('seeds', 1);
        }
      }
    }

    // Grant gathering EXP
    character.progression.addProficiencyExp(node.nodeDef.skillId, expGranted);

    // Floating combat/gathering text
    const posX = node.x * this.tileSize + this.tileSize / 2;
    const posY = node.y * this.tileSize + this.tileSize / 2;
    if (awardedResourceId && awardedResourceId !== '') {
      this.createFloatingText(posX, posY - 10, `+${awardedCount} ${awardedItemName}`, node.nodeDef.color);
    }
    if (bonusSeeds > 0) {
      this.createFloatingText(posX, posY - 20, `+${bonusSeeds} Seeds`, '#22c55e');
    }
    const skillName = DataLoader.getInstance().getTrainableStatDef(node.nodeDef.skillId)?.name || node.nodeDef.skillId;
    this.createFloatingText(posX, posY - 32, `+${expGranted} ${skillName} EXP`, '#60a5fa');

    GameState.getInstance().discoverGatheringNode(node.nodeDef.id);
    GameState.getInstance().discoverProficiency(node.nodeDef.skillId);

    // Bounce animation
    this.tweens.add({
      targets: node.sprite,
      scaleY: 0.8,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeInOut'
    });

    const actionToast = node.nodeDef.actionVerb === 'Digging'
      ? '⛏️ Dug up'
      : node.nodeDef.actionVerb === 'Skinning'
      ? '🔪 Skinned'
      : node.nodeDef.actionVerb === 'Butchering'
      ? '🥩 Butchered'
      : node.nodeDef.actionVerb === 'Gardening'
      ? '🥕 Harvested'
      : '🌿 Harvested';

    const seedBonusText = bonusSeeds > 0 ? ' & Seeds' : '';
    if (awardedResourceId && awardedResourceId !== '') {
      console.log(`[Gathering] ${actionToast} ${awardedCount}x ${awardedItemName}${seedBonusText}! (+${expGranted} ${skillName} EXP)`);
      this.hud?.showToast(`${actionToast} ${awardedItemName}${seedBonusText} (+${expGranted} ${skillName} EXP)`, 'success', 2500);
    } else {
      console.log(`[Gathering] ${actionToast} (+${expGranted} ${skillName} EXP)`);
      this.hud?.showToast(`${actionToast} (+${expGranted} ${skillName} EXP)`, 'info', 2500);
    }

    // Milestone 32: Sequential Order & Dual-Action Handling on Corpses
    if (node.corpseEnemy) {
      const corpseEnemy = node.corpseEnemy;
      if (node.nodeDef.skillId === 'skinning') {
        node.isSkinned = true;
        corpseEnemy.isSkinned = true;

        // Check if eligible for Phase 2: Butchering (e.g. Wolf)
        const isButcherEligible = this.isEnemyButcherEligible(corpseEnemy.enemyData.id);
        const hasMeat = !!corpseEnemy.enemyData.corpseHarvest?.butchering?.item;
        const butcheringUnlocked = GameState.getInstance().isButcheringUnlocked();

        if (isButcherEligible && hasMeat && butcheringUnlocked && !node.isButchered) {
          // Wolf remains active and transitions to Phase 2 (Butchering)!
          node.isHarvested = false;
          const meatDef = corpseEnemy.enemyData.corpseHarvest?.butchering;
          const meatResource = meatDef?.item || (corpseEnemy.enemyData.id === 'wolf' ? 'wolf_meat' : 'monster_meat');
          node.nodeDef.skillId = 'butchering';
          node.nodeDef.resourceId = meatResource;
          node.nodeDef.actionVerb = 'Butchering';
          node.nodeDef.color = '#ef4444';
          node.nodeDef.name = `${corpseEnemy.entityName} Corpse`;
          node.nodeDef.label = `${corpseEnemy.entityName} Corpse (Butchering)`;
          node.nodeDef.expGranted = meatDef?.exp || 15;
          node.nodeDef.yieldCount = meatDef?.count || 1;
          node.label.setText(node.nodeDef.label);
          node.label.setColor('#ef4444');
          console.log(`[Corpse Gathering] ${corpseEnemy.entityName} skinned! Corpse transitioned to Butchering.`);
          this.hud?.showToast(`🐺 ${corpseEnemy.entityName} skinned! Meat can now be butchered.`, 'info', 2500);
          return;
        } else {
          node.isHarvested = true;
          node.label.setText(node.nodeDef.depletedLabel);
          node.label.setColor('#9ca3af');
          node.sprite.setAlpha(0.25);
          return;
        }
      } else if (node.nodeDef.skillId === 'butchering') {
        node.isButchered = true;
        corpseEnemy.isButchered = true;
        node.isHarvested = true;
        node.label.setText(node.nodeDef.depletedLabel);
        node.label.setColor('#9ca3af');
        node.sprite.setAlpha(0.25);
        console.log(`[Corpse Gathering] ${corpseEnemy.entityName} butchered! Corpse fully spent.`);
        return;
      }
    }

    // REAL GAMEPLAY LIFESPAN: Node stays depleted for remainder of floor visit!
    // DEBUG ONLY: If debugGatheringRespawnEnabled is active, respawn after 15s (non-corpse nodes only)
    if (this.debugGatheringRespawnEnabled && !node.corpseEnemy) {
      console.log(`[Debug Respawn] Gathering node respawn scheduled in 15s for (${node.x}, ${node.y}).`);
      node.respawnTimer = this.time.delayedCall(node.nodeDef.respawnTimeMs || 15000, () => {
        if (this.debugGatheringRespawnEnabled && node.isHarvested) {
          node.isHarvested = false;
          node.sprite.setTexture(node.nodeDef.textureKey);
          node.label.setText(node.nodeDef.label);
          node.label.setColor(node.nodeDef.color);

          this.tweens.add({
            targets: node.sprite,
            scale: 1.15,
            duration: 200,
            yoyo: true,
            ease: 'Back.easeOut'
          });
          console.log(`[Gathering] 🌿 ${node.nodeDef.name} regrew at (${node.x}, ${node.y}) via debug auto-respawn!`);
        }
      });
    } else {
      console.log(`[Gathering] ${node.nodeDef.name} at (${node.x}, ${node.y}) stays depleted for remainder of floor visit.`);
    }
  }

  public harvestBush(bush: ForagingBush): void {
    this.harvestGatheringNode(bush, this.player);
  }

  public interruptGatherChannel(character: Player, attacker?: Enemy): boolean {
    const channel = this.activeGatherChannels.get(character);
    if (!channel) return false;

    console.log(`%c[Gather Interrupt] 💥 ${character.entityName}'s channel on ${channel.node.nodeDef.name} was INTERRUPTED by enemy attack!`, 'color: #ef4444; font-weight: bold;');

    // 1. Immediately cancel: zero rewards, zero EXP
    // 2. Bar resets to zero and is destroyed
    channel.barContainer.destroy();
    this.activeGatherChannels.delete(character);

    // 3. Node remains unharvested (intact, ready for subsequent attempts)
    channel.node.isHarvested = false;
    channel.node.sprite.setTexture(channel.node.nodeDef.textureKey);
    channel.node.label.setText(channel.node.nodeDef.label);
    channel.node.label.setColor(channel.node.nodeDef.color);

    // Milestone 26: Release worker assignment and return unharvested node back to gatheringQueue
    if (this.gatheringWorkerNodeAssignments.has(character)) {
      const assignedNode = this.gatheringWorkerNodeAssignments.get(character);
      this.gatheringWorkerNodeAssignments.delete(character);
      if (assignedNode && !assignedNode.isHarvested && !this.gatheringQueue.includes(assignedNode)) {
        this.gatheringQueue.unshift(assignedNode);
      }
    }

    // 4. Reset character state
    character.state = 'idle';

    // 5. Floating text & toast
    this.createFloatingText(character.x, character.y - 20, 'INTERRUPTED!', '#ef4444');
    this.hud.showToast(`⚠️ Channel interrupted! Entering combat!`, 'warn', 2500);

    // 6. Immediate combat engagement with attacker
    if (attacker && attacker.state !== 'dead' && attacker.state !== 'downed') {
      this.engageEnemy(attacker, [character]);
    }

    // Milestone 26: Re-process queue so remaining workers continue working without stalling
    this.processGatheringQueue();

    return true;
  }

  public cancelGatherChannel(character: Player): boolean {
    let hadActivity = false;

    const timer = this.gatheringArrivalTimers.get(character);
    if (timer) {
      hadActivity = true;
      timer.remove();
      this.gatheringArrivalTimers.delete(character);
    }

    const channel = this.activeGatherChannels.get(character);
    if (channel) {
      hadActivity = true;
      channel.barContainer.destroy();
      this.activeGatherChannels.delete(character);
      if (character.state === 'channeling') {
        character.state = 'idle';
      }
    }

    // Milestone 26: Release worker assignment and clear claimed destination
    if (this.gatheringWorkerNodeAssignments.has(character)) {
      hadActivity = true;
      const assignedNode = this.gatheringWorkerNodeAssignments.get(character);
      this.gatheringWorkerNodeAssignments.delete(character);
      character.claimedDestination = null;
      if (assignedNode && !assignedNode.isHarvested && !this.gatheringQueue.includes(assignedNode)) {
        this.gatheringQueue.push(assignedNode);
      }
    }
    return hadActivity;
  }

  // =========================================================================
  // Milestone 31: Item-Based Revive Channel Methods
  // =========================================================================

  public findReviveChannelByParticipant(participant: Player): ActiveReviveChannel | undefined {
    for (const channel of this.activeReviveChannels.values()) {
      if (channel.character === participant || channel.targetAlly === participant) {
        return channel;
      }
    }
    return undefined;
  }

  public interactReviveAlly(downedAlly: Player): boolean {
    if (downedAlly.state !== 'downed') {
      return false;
    }

    const gameState = GameState.getInstance();
    if (gameState.getItemCount('revive_potion') < 1) {
      this.createFloatingText(downedAlly.x, downedAlly.y - 12, 'NEED REVIVE POTION!', '#f59e0b');
      this.hud?.showToast('⚠️ Requires a Revive Potion! Craft one at the Alchemy Station.', 'warn', 2500);
      return false;
    }

    // Pick living reviver: active selected member or closest living ally
    const livingSelected = this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead' && m !== downedAlly);
    let reviver: Player | undefined = livingSelected[0];

    if (!reviver) {
      const livingParty = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead' && m !== downedAlly);
      if (livingParty.length === 0) {
        this.hud?.showToast('⚠️ No conscious party members available to revive!', 'error', 2500);
        return false;
      }
      livingParty.sort((a, b) => Math.hypot(a.gridPos.x - downedAlly.gridPos.x, a.gridPos.y - downedAlly.gridPos.y) - Math.hypot(b.gridPos.x - downedAlly.gridPos.x, b.gridPos.y - downedAlly.gridPos.y));
      reviver = livingParty[0];
    }

    const dist = Math.hypot(reviver.gridPos.x - downedAlly.gridPos.x, reviver.gridPos.y - downedAlly.gridPos.y);
    if (dist <= 1.5) {
      return this.startReviveChannel(reviver, downedAlly);
    }

    // Path to open adjacent tile to downedAlly
    const claimed = new Set<string>();
    for (const other of this.party) {
      if (other !== reviver && other.state !== 'dead') {
        claimed.add(`${other.gridPos.x},${other.gridPos.y}`);
        if (other.claimedDestination) {
          claimed.add(`${other.claimedDestination.x},${other.claimedDestination.y}`);
        }
      }
    }

    const adjTiles = [
      { x: downedAlly.gridPos.x + 1, y: downedAlly.gridPos.y },
      { x: downedAlly.gridPos.x - 1, y: downedAlly.gridPos.y },
      { x: downedAlly.gridPos.x, y: downedAlly.gridPos.y + 1 },
      { x: downedAlly.gridPos.x, y: downedAlly.gridPos.y - 1 }
    ].filter(t => t.x > 0 && t.x < this.mapWidth - 1 && t.y > 0 && t.y < this.mapHeight - 1 && this.gridMatrix[t.y]?.[t.x] === 0 && !claimed.has(`${t.x},${t.y}`));

    adjTiles.sort((a, b) => Math.hypot(a.x - reviver!.gridPos.x, a.y - reviver!.gridPos.y) - Math.hypot(b.x - reviver!.gridPos.x, b.y - reviver!.gridPos.y));

    let targetTile = adjTiles[0];
    if (!targetTile) {
      targetTile = this.findNearestOpenTileForPartyMove(downedAlly.gridPos, reviver.gridPos, claimed, reviver);
    }

    if (targetTile) {
      this.cancelGatherChannel(reviver);
      this.cancelReviveChannel(reviver);
      reviver.clearTarget();
      claimed.add(`${targetTile.x},${targetTile.y}`);
      reviver.claimedDestination = { ...targetTile };

      const unitObs = this.getPartyUnitObstacles(reviver);
      this.pathfinder.findPath(reviver.gridPos, targetTile, unitObs).then((path) => {
        if (path.length > 0) {
          reviver!.followPath(path, () => {
            if (downedAlly.state === 'downed' && Math.hypot(reviver!.gridPos.x - downedAlly.gridPos.x, reviver!.gridPos.y - downedAlly.gridPos.y) <= 1.5) {
              this.startReviveChannel(reviver!, downedAlly);
            }
          });

          const checkArrival = this.time.addEvent({
            delay: 150,
            repeat: 40,
            callback: () => {
              if (downedAlly.state !== 'downed') {
                checkArrival.remove();
              } else if (Math.hypot(reviver!.gridPos.x - downedAlly.gridPos.x, reviver!.gridPos.y - downedAlly.gridPos.y) <= 1.5) {
                checkArrival.remove();
                this.startReviveChannel(reviver!, downedAlly);
              } else if (reviver!.state !== 'moving') {
                checkArrival.remove();
              }
            }
          });
        } else {
          reviver!.claimedDestination = null;
        }
      });
      return true;
    }

    return false;
  }

  public startReviveChannel(character: Player, targetAlly: Player): boolean {
    if (targetAlly.state !== 'downed' || character.state === 'downed' || character.state === 'dead') {
      return false;
    }

    if (GameState.getInstance().getItemCount('revive_potion') < 1) {
      this.createFloatingText(targetAlly.x, targetAlly.y - 12, 'NEED REVIVE POTION!', '#f59e0b');
      this.hud?.showToast('⚠️ Requires a Revive Potion! Craft one at the Alchemy Station.', 'warn', 2500);
      return false;
    }

    const existing = this.activeReviveChannels.get(character);
    if (existing) {
      existing.barContainer.destroy();
      this.activeReviveChannels.delete(character);
    }
    this.cancelGatherChannel(character);

    character.state = 'channeling';
    character.claimedDestination = null;
    character.clearTarget();
    character.stopMovement();

    const durationMs = 3000;

    // Visual Progress Bar Container positioned above reviver
    const posX = character.x;
    const posY = character.y - 28;
    const barContainer = this.add.container(posX, posY).setDepth(10001);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x111827, 0.85);
    barBg.fillRect(-18, -3, 36, 6);
    barBg.lineStyle(1, 0x374151, 1);
    barBg.strokeRect(-18, -3, 36, 6);

    const barFill = this.add.graphics();

    const labelText = this.add.text(0, -12, 'Reviving... 0%', {
      fontSize: '9px',
      fontStyle: 'bold',
      color: '#facc15',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5);

    barContainer.add([barBg, barFill, labelText]);

    const channel: ActiveReviveChannel = {
      character,
      targetAlly,
      durationMs,
      elapsedMs: 0,
      barContainer,
      barBg,
      barFill,
      labelText
    };

    this.activeReviveChannels.set(character, channel);
    console.log(`[Revive] 💛 ${character.entityName} started reviving ${targetAlly.entityName} (3000ms)...`);
    this.hud?.showToast(`💛 Reviving ${targetAlly.entityName}... (3s)`, 'info', 2000);
    return true;
  }

  public completeReviveChannel(character: Player, channel: ActiveReviveChannel): void {
    channel.barContainer.destroy();
    this.activeReviveChannels.delete(character);

    if (character.state === 'channeling') {
      character.state = 'idle';
    }

    // Guard: ensure target ally is still downed (did not die / was not externally revived)
    if (channel.targetAlly.state !== 'downed') {
      console.warn(`[Revive] Target ally ${channel.targetAlly.entityName} is no longer downed (state: ${channel.targetAlly.state}). Aborting completion without consuming potion.`);
      return;
    }

    const gameState = GameState.getInstance();
    if (gameState.getItemCount('revive_potion') < 1) {
      console.warn('[Revive] No Revive Potion in inventory at completion time!');
      this.hud?.showToast('⚠️ Revive failed: No Revive Potion in inventory!', 'error');
      return;
    }

    // 1. Consume 1 Revive Potion
    gameState.consumeItem('revive_potion', 1);

    // 2. Revive target ally (increments 'Ally Revived' activity count on character)
    channel.targetAlly.revive(character);

    // 3. Grant +5 Healing Magic EXP to reviver
    if (character.progression) {
      character.progression.addProficiencyExp('healing_magic', 5);
    }

    // 4. Visual & toast feedback
    this.createFloatingText(channel.targetAlly.x, channel.targetAlly.y - 12, 'REVIVED!', '#facc15');
    this.createFloatingText(character.x, character.y - 15, '+5 Healing Magic EXP', '#4ade80');
    this.hud?.showToast(`✨ ${character.entityName} revived ${channel.targetAlly.entityName}! (+5 Healing Magic EXP)`, 'success', 2500);

    // 5. Update HUD
    this.hud?.update(this.player, this.progressionSystem, this.time.now, this.party);
  }

  public interruptReviveChannel(participant: Player, attacker?: Enemy): boolean {
    const channel = this.findReviveChannelByParticipant(participant);
    if (!channel) return false;

    console.log(`%c[Revive Interrupt] 💥 Revive channel on ${channel.targetAlly.entityName} by ${channel.character.entityName} was INTERRUPTED!`, 'color: #ef4444; font-weight: bold;');

    // 1. Destroy progress bar and remove channel
    channel.barContainer.destroy();
    this.activeReviveChannels.delete(channel.character);

    // 2. Reset reviver state
    if (channel.character.state === 'channeling') {
      channel.character.state = 'idle';
    }

    // 3. Revive Potion is NOT consumed!
    // 4. Target ally stays downed (or dead if lethal damage landed)

    // 5. Floating text & toast
    this.createFloatingText(channel.character.x, channel.character.y - 20, 'INTERRUPTED!', '#ef4444');
    this.hud?.showToast('⚠️ Revive interrupted! Entering combat!', 'warn', 2500);

    // 6. Immediate combat engagement with attacker (reusing existing hardened engageEnemy)
    if (attacker && attacker.state !== 'dead' && attacker.state !== 'downed') {
      this.engageEnemy(attacker, [channel.character]);
    }

    return true;
  }

  public cancelReviveChannel(character: Player): boolean {
    const channel = this.activeReviveChannels.get(character);
    if (channel) {
      channel.barContainer.destroy();
      this.activeReviveChannels.delete(character);
      if (character.state === 'channeling') {
        character.state = 'idle';
      }
      return true;
    }
    return false;
  }

  public clearGatheringQueue(cancelActiveChannels: boolean = true): void {
    console.log(`[Gathering Queue] Clearing queue (${this.gatheringQueue.length} nodes, ${this.gatheringWorkerNodeAssignments.size} assignments, ${this.activeGatherChannels.size} active channels)`);
    this.gatheringQueue = [];

    // Clear any moving / assigned worker in gatheringQueueWorkers
    for (const worker of Array.from(this.gatheringQueueWorkers)) {
      worker.claimedDestination = null;
      if (worker.state === 'moving') {
        worker.stopMovement();
      }
    }
    this.gatheringQueueWorkers.clear();

    for (const [worker] of Array.from(this.gatheringWorkerNodeAssignments.entries())) {
      this.gatheringWorkerNodeAssignments.delete(worker);
      worker.claimedDestination = null;
      if (worker.state === 'moving') {
        worker.stopMovement();
      }
      if (cancelActiveChannels && this.activeGatherChannels.has(worker)) {
        this.cancelGatherChannel(worker);
      }
    }
    this.gatheringWorkerNodeAssignments.clear();

    if (cancelActiveChannels) {
      for (const worker of Array.from(this.activeGatherChannels.keys())) {
        this.cancelGatherChannel(worker);
      }
    }
  }

  // --- MOVE DESTINATION HIGHLIGHTS ---

  public showMoveDestinationHighlights(destinations: GridPos[], units?: Player[]): void {
    this.lastMoveDestinationHighlights = destinations.map(d => ({ x: d.x, y: d.y }));
    this.clearMoveHighlightTimers();

    this.activeMoveHighlights = destinations.map((d, i) => {
      const unit = units ? units[i] : (this.party[i] ?? undefined);
      return {
        dest: { x: d.x, y: d.y },
        unit,
        isLeader: unit ? unit === this.player : i === 0
      };
    });

    this.drawMoveHighlights();
  }

  public drawMoveHighlights(): void {
    if (!this.moveHighlightGraphics) return;

    this.moveHighlightGraphics.clear();
    this.moveHighlightGraphics.setAlpha(1);

    if (this.activeMoveHighlights.length === 0) return;

    const ts = this.tileSize;
    for (const h of this.activeMoveHighlights) {
      const dest = h.dest;
      const px = dest.x * ts;
      const py = dest.y * ts;
      const isLeader = h.isLeader;

      // Color palette:
      // Leader: Bright Sky Blue / Cyan (0x38bdf8), fill 0x0284c7
      // Companions: Emerald / Mint (0x34d399), fill 0x059669
      const strokeColor = isLeader ? 0x38bdf8 : 0x34d399;
      const fillColor = isLeader ? 0x0284c7 : 0x059669;

      // 1. Soft glowing fill
      this.moveHighlightGraphics.fillStyle(fillColor, 0.25);
      this.moveHighlightGraphics.fillRect(px + 2, py + 2, ts - 4, ts - 4);

      // 2. Full tile border
      this.moveHighlightGraphics.lineStyle(2, strokeColor, 0.95);
      this.moveHighlightGraphics.strokeRect(px + 2, py + 2, ts - 4, ts - 4);

      // 3. High-contrast corner brackets (white)
      this.moveHighlightGraphics.lineStyle(2, 0xffffff, 0.95);
      const bLen = 5;
      // Top-left
      this.moveHighlightGraphics.lineBetween(px + 2, py + 2, px + 2 + bLen, py + 2);
      this.moveHighlightGraphics.lineBetween(px + 2, py + 2, px + 2, py + 2 + bLen);
      // Top-right
      this.moveHighlightGraphics.lineBetween(px + ts - 2, py + 2, px + ts - 2 - bLen, py + 2);
      this.moveHighlightGraphics.lineBetween(px + ts - 2, py + 2, px + ts - 2, py + 2 + bLen);
      // Bottom-left
      this.moveHighlightGraphics.lineBetween(px + 2, py + ts - 2, px + 2 + bLen, py + ts - 2);
      this.moveHighlightGraphics.lineBetween(px + 2, py + ts - 2, px + 2, py + ts - 2 - bLen);
      // Bottom-right
      this.moveHighlightGraphics.lineBetween(px + ts - 2, py + ts - 2, px + ts - 2 - bLen, py + ts - 2);
      this.moveHighlightGraphics.lineBetween(px + ts - 2, py + ts - 2, px + ts - 2, py + ts - 2 - bLen);

      // 4. Center pip
      this.moveHighlightGraphics.fillStyle(0xffffff, 0.9);
      this.moveHighlightGraphics.fillCircle(px + ts / 2, py + ts / 2, 2.5);
    }
  }

  public updateMoveDestinationHighlights(): void {
    if (this.activeMoveHighlights.length === 0) return;

    let changed = false;
    for (let i = this.activeMoveHighlights.length - 1; i >= 0; i--) {
      const h = this.activeMoveHighlights[i];
      let arrived = false;

      if (h.unit) {
        const u = h.unit;
        const hasActivePath = (typeof u.hasActivePath === 'function' ? u.hasActivePath() : false) || u.isMoving();
        const isInterruptedByCombat = u.inCombat || u.targetEntity !== null || u.state === 'attacking' || u.state === 'chasing';
        const isRetargeted = u.claimedDestination !== null && (u.claimedDestination.x !== h.dest.x || u.claimedDestination.y !== h.dest.y);
        const isStoppedWithoutArriving = !hasActivePath && (u.gridPos.x !== h.dest.x || u.gridPos.y !== h.dest.y);
        const hasArrived = u.gridPos.x === h.dest.x && u.gridPos.y === h.dest.y && !u.isMoving();
        const isDeadOrDowned = u.state === 'downed' || u.state === 'dead';

        if (isDeadOrDowned || hasArrived || isInterruptedByCombat || isRetargeted || isStoppedWithoutArriving) {
          arrived = true;
        }
      } else {
        const unitAtTile = this.party.find(p => p.gridPos.x === h.dest.x && p.gridPos.y === h.dest.y && !p.isMoving());
        const anyPartyMoving = this.party.some(p => {
          const hasPath = (typeof p.hasActivePath === 'function' ? p.hasActivePath() : false) || p.isMoving() || p.claimedDestination !== null;
          return hasPath && !p.inCombat && !p.targetEntity && p.state !== 'attacking' && p.state !== 'chasing';
        });
        if (unitAtTile || !anyPartyMoving) {
          arrived = true;
        }
      }

      if (arrived) {
        this.activeMoveHighlights.splice(i, 1);
        changed = true;
      }
    }

    if (changed) {
      this.drawMoveHighlights();
    }
  }

  public clearMoveDestinationHighlights(): void {
    this.activeMoveHighlights = [];
    this.clearMoveHighlightTimers();
    if (this.moveHighlightGraphics) {
      this.moveHighlightGraphics.clear();
      this.moveHighlightGraphics.setAlpha(1);
    }
  }

  private clearMoveHighlightTimers(): void {
    if (this.moveHighlightTween) {
      this.moveHighlightTween.stop();
      this.moveHighlightTween = null;
    }
    if (this.moveHighlightTimer) {
      this.moveHighlightTimer.remove();
      this.moveHighlightTimer = null;
    }
  }

  // --- MILESTONE 26: GATHERING MODE & PARALLEL QUEUE PROCESSING ---

  /**
   * Fast, zero-drift query for all gathering nodes within selection bounds.
   * Matches the exact criteria used when enqueuing (ignoring harvested and actively channeled nodes).
   */
  public getGatheringNodesInSelection(
    rawMinX: number,
    rawMaxX: number,
    rawMinY: number,
    rawMaxY: number
  ): GatheringNode[] {
    let minX = rawMinX;
    let maxX = rawMaxX;
    let minY = rawMinY;
    let maxY = rawMaxY;

    // If drag was very small (single click or micro-drag), expand by half a tile for forgiving selection
    if (maxX - minX < 6 && maxY - minY < 6) {
      minX -= this.tileSize / 2;
      maxX += this.tileSize / 2;
      minY -= this.tileSize / 2;
      maxY += this.tileSize / 2;
    }

    const tileMinX = Math.floor(minX / this.tileSize);
    const tileMaxX = Math.floor(maxX / this.tileSize);
    const tileMinY = Math.floor(minY / this.tileSize);
    const tileMaxY = Math.floor(maxY / this.tileSize);

    const hasActiveChannels = this.activeGatherChannels.size > 0;
    let activeChanneledNodes: Set<GatheringNode> | null = null;

    const matched: GatheringNode[] = [];
    const nodes = this.gatheringNodes;
    const len = nodes.length;

    for (let i = 0; i < len; i++) {
      const node = nodes[i];
      if (node.isHarvested) continue;

      // Fast integer bounding-box check first (rejects out-of-bounds nodes instantly without heap alloc)
      if (node.x < tileMinX - 1 || node.x > tileMaxX + 1 || node.y < tileMinY - 1 || node.y > tileMaxY + 1) {
        continue;
      }

      const inTile = node.x >= tileMinX && node.x <= tileMaxX && node.y >= tileMinY && node.y <= tileMaxY;
      let inBounds = inTile;
      if (!inBounds) {
        const nodeCenterX = node.x * this.tileSize + this.tileSize / 2;
        const nodeCenterY = node.y * this.tileSize + this.tileSize / 2;
        inBounds = nodeCenterX >= minX && nodeCenterX <= maxX && nodeCenterY >= minY && nodeCenterY <= maxY;
      }

      if (!inBounds) continue;

      if (hasActiveChannels) {
        if (!activeChanneledNodes) {
          activeChanneledNodes = new Set(Array.from(this.activeGatherChannels.values()).map(c => c.node));
        }
        if (activeChanneledNodes.has(node)) continue;
      }

      matched.push(node);
    }

    return matched;
  }

  public renderGatheringMarqueeAndHighlights(
    minX: number,
    minY: number,
    width: number,
    height: number,
    capturedNodes: GatheringNode[]
  ): void {
    this.currentGatherSelectionHighlights = capturedNodes;
    if (!this.gatheringMarqueeGraphics) return;

    this.gatheringMarqueeGraphics.clear();

    // 1. Marquee selection rectangle
    if (width > 0 || height > 0) {
      this.gatheringMarqueeGraphics.fillStyle(0x34d399, 0.2);
      this.gatheringMarqueeGraphics.fillRect(minX, minY, width, height);
      this.gatheringMarqueeGraphics.lineStyle(2, 0x10b981, 0.95);
      this.gatheringMarqueeGraphics.strokeRect(minX, minY, width, height);
    }

    // 2. Highlight each captured node with glowing tile outline, brackets, and sprite ring
    const ts = this.tileSize;
    for (const node of capturedNodes) {
      const nx = node.x * ts;
      const ny = node.y * ts;
      const cx = nx + ts / 2;
      const cy = ny + ts / 2;

      // Soft luminous emerald fill
      this.gatheringMarqueeGraphics.fillStyle(0x10b981, 0.32);
      this.gatheringMarqueeGraphics.fillRect(nx + 1, ny + 1, ts - 2, ts - 2);

      // Bright mint tile border
      this.gatheringMarqueeGraphics.lineStyle(2, 0x6ee7b7, 1);
      this.gatheringMarqueeGraphics.strokeRect(nx + 1, ny + 1, ts - 2, ts - 2);

      // White corner brackets
      this.gatheringMarqueeGraphics.lineStyle(2.5, 0xffffff, 1);
      const bLen = 6;
      // Top-left
      this.gatheringMarqueeGraphics.lineBetween(nx + 1, ny + 1, nx + 1 + bLen, ny + 1);
      this.gatheringMarqueeGraphics.lineBetween(nx + 1, ny + 1, nx + 1, ny + 1 + bLen);
      // Top-right
      this.gatheringMarqueeGraphics.lineBetween(nx + ts - 1, ny + 1, nx + ts - 1 - bLen, ny + 1);
      this.gatheringMarqueeGraphics.lineBetween(nx + ts - 1, ny + 1, nx + ts - 1, ny + ts - 1 + bLen);
      // Bottom-left
      this.gatheringMarqueeGraphics.lineBetween(nx + 1, ny + ts - 1, nx + 1 + bLen, ny + ts - 1);
      this.gatheringMarqueeGraphics.lineBetween(nx + 1, ny + ts - 1, nx + 1, ny + ts - 1 - bLen);
      // Bottom-right
      this.gatheringMarqueeGraphics.lineBetween(nx + ts - 1, ny + ts - 1, nx + ts - 1 - bLen, ny + ts - 1);
      this.gatheringMarqueeGraphics.lineBetween(nx + ts - 1, ny + ts - 1, nx + ts - 1, ny + ts - 1 - bLen);

      // Selection ring around node sprite
      this.gatheringMarqueeGraphics.lineStyle(1.5, 0xa7f3d0, 0.95);
      this.gatheringMarqueeGraphics.strokeCircle(cx, cy, ts / 2 + 2);
    }
  }

  public toggleGatheringMode(forceState?: boolean): boolean {
    this.isGatheringMode = forceState !== undefined ? forceState : !this.isGatheringMode;
    if (!this.isGatheringMode) {
      this.isGatheringDrag = false;
      this.gatherDragStart = null;
      this.currentGatherSelectionHighlights = [];
      this.gatheringMarqueeGraphics?.clear();
      this.clearGatheringQueue(true);
      this.hud?.showToast('🌿 Gathering Mode: OFF', 'info', 1500);
      this.hud?.setGatheringModeActive(false);
      console.log('[Gathering Mode] Deactivated');
    } else {
      this.hud?.showToast('🌿 Gathering Mode: ACTIVE — Drag area to queue nodes', 'success', 2500);
      this.hud?.setGatheringModeActive(true);
      console.log('[Gathering Mode] Activated');
    }
    // CRITICAL: selectedMembers is NOT modified or reset!
    return this.isGatheringMode;
  }

  public startGatheringQueue(nodes: GatheringNode[]): void {
    const activeChanneledNodes = new Set(Array.from(this.activeGatherChannels.values()).map(c => c.node));
    const validNodes = Array.from(new Set(nodes)).filter(n => !n.isHarvested && !activeChanneledNodes.has(n));
    if (validNodes.length === 0) return;

    // Respect current Portrait Selection state!
    const activeSelected = this.getSelectedMembers ? this.getSelectedMembers().filter(m => m.state !== 'downed' && m.state !== 'dead') : [];
    const workers = activeSelected.length > 0
      ? activeSelected
      : this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');

    if (workers.length === 0) {
      console.log('[Gathering Queue] No living workers available to gather');
      return;
    }

    // Cancel existing pending arrival timers and clear moving worker claimed destinations for workers taking on the new queue
    for (const worker of workers) {
      const pendingTimer = this.gatheringArrivalTimers.get(worker);
      if (pendingTimer) {
        pendingTimer.remove();
        this.gatheringArrivalTimers.delete(worker);
      }
      if (!this.activeGatherChannels.has(worker) && worker.claimedDestination) {
        worker.claimedDestination = null;
      }
      worker.clearTarget();
    }

    this.gatheringQueue = [...validNodes];
    this.gatheringQueueWorkers = new Set(workers);
    this.gatheringWorkerNodeAssignments.clear();

    console.log(`[Gathering Queue] Started queue with ${this.gatheringQueue.length} nodes for ${workers.length} worker(s): ${workers.map(w => w.entityName).join(', ')}`);
    this.hud?.showToast(`🌿 Queued ${this.gatheringQueue.length} gathering node(s) for ${workers.length} member(s)!`, 'success', 2500);

    this.processGatheringQueue();
  }

  public processGatheringQueue(): void {
    if (this.gatheringQueueWorkers.size === 0) return;

    const claimed = new Set<string>();
    for (const member of this.party) {
      if (member.state !== 'dead') {
        claimed.add(`${member.gridPos.x},${member.gridPos.y}`);
        if (member.claimedDestination) {
          claimed.add(`${member.claimedDestination.x},${member.claimedDestination.y}`);
        }
      }
    }

    for (const worker of Array.from(this.gatheringQueueWorkers)) {
      if (worker.state === 'downed' || worker.state === 'dead' || worker.targetEntity !== null) {
        continue;
      }
      if (this.gatheringWorkerNodeAssignments.has(worker) || this.activeGatherChannels.has(worker)) {
        continue;
      }

      const assignedNodes = new Set(this.gatheringWorkerNodeAssignments.values());
      for (const ch of this.activeGatherChannels.values()) {
        assignedNodes.add(ch.node);
      }
      const availableNodes = this.gatheringQueue.filter(n => !n.isHarvested && !assignedNodes.has(n));

      if (availableNodes.length === 0) {
        continue;
      }

      availableNodes.sort((a, b) => {
        const distA = Math.hypot(a.x - worker.gridPos.x, a.y - worker.gridPos.y);
        const distB = Math.hypot(b.x - worker.gridPos.x, b.y - worker.gridPos.y);
        return distA - distB;
      });

      const targetNode = availableNodes[0];
      const qIdx = this.gatheringQueue.indexOf(targetNode);
      if (qIdx !== -1) {
        this.gatheringQueue.splice(qIdx, 1);
      }
      this.gatheringWorkerNodeAssignments.set(worker, targetNode);

      this.dispatchWorkerToNode(worker, targetNode, claimed);
    }
  }

  public dispatchWorkerToNode(worker: Player, node: GatheringNode, claimed?: Set<string>): void {
    const oldArrivalTimer = this.gatheringArrivalTimers.get(worker);
    if (oldArrivalTimer) {
      oldArrivalTimer.remove();
      this.gatheringArrivalTimers.delete(worker);
    }

    const existingChannel = this.activeGatherChannels.get(worker);
    if (existingChannel) {
      existingChannel.barContainer.destroy();
      this.activeGatherChannels.delete(worker);
      if (worker.state === 'channeling') {
        worker.state = 'idle';
      }
    }
    worker.clearTarget();

    const dist = Math.hypot(worker.gridPos.x - node.x, worker.gridPos.y - node.y);
    if (dist <= 1.5) {
      this.startGatherChannel(worker, node);
      return;
    }

    const claimedTiles = claimed || new Set<string>();
    if (!claimed) {
      for (const member of this.party) {
        if (member !== worker && member.state !== 'dead') {
          claimedTiles.add(`${member.gridPos.x},${member.gridPos.y}`);
          if (member.claimedDestination) {
            claimedTiles.add(`${member.claimedDestination.x},${member.claimedDestination.y}`);
          }
        }
      }
    }

    const adjTiles = [
      { x: node.x + 1, y: node.y },
      { x: node.x - 1, y: node.y },
      { x: node.x, y: node.y + 1 },
      { x: node.x, y: node.y - 1 },
      { x: node.x + 1, y: node.y + 1 },
      { x: node.x - 1, y: node.y + 1 },
      { x: node.x + 1, y: node.y - 1 },
      { x: node.x - 1, y: node.y - 1 }
    ].filter(t => 
      t.x > 0 && t.x < this.mapWidth - 1 && 
      t.y > 0 && t.y < this.mapHeight - 1 && 
      this.gridMatrix[t.y]?.[t.x] === 0 && 
      !claimedTiles.has(`${t.x},${t.y}`) &&
      !this.gatheringNodes.some(other => !other.isHarvested && other !== node && other.x === t.x && other.y === t.y)
    );

    adjTiles.sort((a, b) => Math.hypot(a.x - worker.gridPos.x, a.y - worker.gridPos.y) - Math.hypot(b.x - worker.gridPos.x, b.y - worker.gridPos.y));

    let targetTile = adjTiles[0];
    if (!targetTile) {
      targetTile = this.findNearestOpenTileForPartyMove({ x: node.x, y: node.y }, worker.gridPos, claimedTiles, worker);
    }

    if (targetTile) {
      claimedTiles.add(`${targetTile.x},${targetTile.y}`);
      worker.claimedDestination = { ...targetTile };

      const unitObs = this.getPartyUnitObstacles(worker);
      this.pathfinder.findPath(worker.gridPos, targetTile, unitObs).then(async (path) => {
        let resolvedPath = path;
        if (resolvedPath.length === 0) {
          // Corridor / enemy bottleneck fallback: living enemies in distant corridors
          // should not freeze queue workers from walking toward gather targets
          resolvedPath = await this.pathfinder.findPath(worker.gridPos, targetTile, { soft: unitObs.soft, hard: [] });
          if (resolvedPath.length === 0) {
            resolvedPath = await this.pathfinder.findPath(worker.gridPos, targetTile);
          }
        }
        if (resolvedPath.length > 0) {
          worker.followPath(resolvedPath, () => {
            if (Math.hypot(worker.gridPos.x - node.x, worker.gridPos.y - node.y) <= 1.5) {
              this.startGatherChannel(worker, node);
            } else {
              this.cancelGatherChannel(worker);
            }
          });
          const checkArrival = this.time.addEvent({
            delay: 150,
            loop: true,
            callback: () => {
              if (Math.hypot(worker.gridPos.x - node.x, worker.gridPos.y - node.y) <= 1.5) {
                checkArrival.remove();
                this.gatheringArrivalTimers.delete(worker);
                this.startGatherChannel(worker, node);
              } else if (!worker.isMoving() && worker.state !== 'moving') {
                checkArrival.remove();
                this.gatheringArrivalTimers.delete(worker);
                if (Math.hypot(worker.gridPos.x - node.x, worker.gridPos.y - node.y) > 1.5) {
                  this.cancelGatherChannel(worker);
                }
              }
            }
          });
          this.gatheringArrivalTimers.set(worker, checkArrival);
        } else {
          worker.claimedDestination = null;
          this.gatheringWorkerNodeAssignments.delete(worker);
          if (!node.isHarvested && !this.gatheringQueue.includes(node)) {
            this.gatheringQueue.push(node);
          }
          this.time.delayedCall(500, () => {
            if (this.gatheringQueue.length > 0) {
              this.processGatheringQueue();
            }
          });
        }
      });
    } else {
      worker.claimedDestination = null;
      this.gatheringWorkerNodeAssignments.delete(worker);
      if (!node.isHarvested && !this.gatheringQueue.includes(node)) {
        this.gatheringQueue.push(node);
      }
      this.time.delayedCall(100, () => {
        if (this.gatheringQueue.length > 0) {
          this.processGatheringQueue();
        }
      });
    }
  }

  public toggleDebugGatheringRespawn(): boolean {
    this.debugGatheringRespawnEnabled = !this.debugGatheringRespawnEnabled;
    const label = this.debugGatheringRespawnEnabled ? 'ON (15s Respawn)' : 'OFF (Stay Depleted)';
    console.log(`%c[Debug Respawn] Gathering node auto-respawn is now: ${label}`, 'color: #38bdf8; font-weight: bold;');
    if (this.hud) {
      this.hud.showToast(`🔄 Debug Gathering Respawn: ${label}`, this.debugGatheringRespawnEnabled ? 'warn' : 'info', 2500);
    }
    return this.debugGatheringRespawnEnabled;
  }

  public createFloatingText(x: number, y: number, textString: string, colorHex: string): void {
    const text = this.add.text(x, y, textString, {
      fontSize: '11px',
      color: colorHex,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    });
    text.setOrigin(0.5);
    text.setDepth(y + 1000);

    this.tweens.add({
      targets: text,
      y: y - 20,
      alpha: 0,
      duration: 1200,
      onComplete: () => text.destroy()
    });
  }
}
