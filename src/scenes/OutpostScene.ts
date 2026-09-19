import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { Player } from '../entities/Player';
import { Entity } from '../entities/Entity';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { GridPos, PlacedBuildable } from '../types/game';
import { BuildingSystem } from '../systems/BuildingSystem';
import { RoomClassifier, ClassifiedRoom } from '../systems/RoomClassifier';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem';
import { ActiveReviveChannel, ActiveMoveHighlight } from './MainScene';

export class OutpostScene extends Phaser.Scene {
  private mapWidth: number = 20;
  private mapHeight: number = 20;
  private tileSize: number = 32;

  private tilemap!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  public party: Player[] = [];
  public get player(): Player {
    return this.party[0];
  }
  private activeReviveChannels: Map<Player, ActiveReviveChannel> = new Map();
  private progressionSystem!: ProgressionSystem;
  private hud!: HUD;
  private buildingSystem!: BuildingSystem;
  private roomClassifier!: RoomClassifier;
  private cachedRoomMap: Map<string, ClassifiedRoom> = new Map();
  private lastKnownMemberTiles: Map<Player, string> = new Map();
  private lastClassifiedMemberRooms: Map<Player, string | null> = new Map();

  private portalSprite!: Phaser.GameObjects.Sprite;
  private portalPos: GridPos = { x: 3, y: 3 };

  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private isCameraLocked: boolean = true;
  private isTransitioning: boolean = false;

  // Build Mode State
  private isBuildMode: boolean = false;
  private selectedBuildableId: string = 'floor';
  private currentRotation: number = 0; // 0, 90, 180, 270
  private gridMatrix: number[][] = [];
  private baseWallSet: Set<string> = new Set();
  private placedSprites: Map<string, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image> = new Map();
  private harvestIcons: Map<string, { sprite: Phaser.GameObjects.Sprite; tween?: Phaser.Tweens.Tween; type: 'plot' | 'seed_maker' }> = new Map();

  // Cursor Hover Reticle & Ghost Preview
  private hoverHighlightSprite!: Phaser.GameObjects.Sprite;
  private hoverGhostSprite!: Phaser.GameObjects.Sprite;
  private hoverReasonText!: Phaser.GameObjects.Text;
  private lastLoggedHoverKey: string = '';

  // Move Destination Highlights
  public lastMoveDestinationHighlights: GridPos[] = [];
  public activeMoveHighlights: ActiveMoveHighlight[] = [];
  private moveHighlightGraphics!: Phaser.GameObjects.Graphics;
  private moveHighlightTween: Phaser.Tweens.Tween | null = null;
  private moveHighlightTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'OutpostScene' });
  }

  public preload(): void {
    TextureGenerator.generatePlaceholderTextures(this, this.tileSize);
  }

  public create(): void {
    this.isTransitioning = false;
    this.buildingSystem = new BuildingSystem(this.mapWidth, this.mapHeight);

    // Disable browser right-click context menu so right-click demolish works smoothly
    this.input.mouse?.disableContextMenu();

    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId);
    const classesData = dataLoader.getClassesData();

    if (!startingWeapon) {
      throw new Error(`Starting weapon '${playerData.startingWeaponId}' not found in data/weapons.json`);
    }

    // 1. Build 20x20 Grid Matrix for Outpost (0 = Walkable, 1 = Wall)
    this.gridMatrix = [];
    this.baseWallSet.clear();

    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        // Outer boundaries
        if (x === 0 || x === this.mapWidth - 1 || y === 0 || y === this.mapHeight - 1) {
          row.push(1);
          this.baseWallSet.add(`${x},${y}`);
        }
        // Guild hall walls (x: 7..13, y: 7..13), with a doorway at (10, 13)
        else if (
          (y === 7 && x >= 7 && x <= 13) ||
          (y === 13 && x >= 7 && x <= 13 && x !== 10) ||
          (x === 7 && y >= 7 && y <= 13) ||
          (x === 13 && y >= 7 && y <= 13)
        ) {
          row.push(1);
          this.baseWallSet.add(`${x},${y}`);
        } else {
          row.push(0);
        }
      }
      this.gridMatrix.push(row);
    }

    // 2. Tilemap Creation using Outpost textures
    this.tilemap = this.make.tilemap({
      data: this.gridMatrix,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tilesetGrass = this.tilemap.addTilesetImage('tile-outpost-grass', 'tile-outpost-grass');
    const tilesetWall = this.tilemap.addTilesetImage('tile-outpost-wall', 'tile-outpost-wall');

    if (tilesetGrass && tilesetWall) {
      this.tilemap.createLayer(0, [tilesetGrass, tilesetWall], 0, 0);
    }

    // Interior guild wood floor decal tiles
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 12; x++) {
        this.add.image(
          x * this.tileSize + this.tileSize / 2,
          y * this.tileSize + this.tileSize / 2,
          'tile-outpost-wood'
        );
      }
    }

    // Guild Hall Label Banner
    this.add.text(10 * this.tileSize + 16, 7 * this.tileSize - 10, 'GUILD HALL', {
      fontSize: '11px',
      color: '#fef08a',
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(5000);

    // 3. Initialize Pathfinder
    this.pathfinder = new Pathfinder(this.gridMatrix);

    // 4. Initialize ProgressionSystem & HUD
    this.progressionSystem = new ProgressionSystem(classesData, playerData.name || 'Hero');
    this.roomClassifier = new RoomClassifier(dataLoader.getRoomRules());
    this.hud = new HUD();
    this.hud.setLocation('Guild Outpost (Safe Zone)', true);
    GameState.getInstance().setSafeZone(true);
    GameState.getInstance().resetDungeonFloorCount();

    this.isCameraLocked = true;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cameras?.main?.stopFollow();
      this.isCameraLocked = true;
      if (this.hud) {
        this.hud.destroy();
      }
    });

    // Wire up HUD Build callbacks
    this.hud.setBuildCallbacks(
      () => this.toggleBuildMode(),
      (id: string) => this.selectBuildable(id)
    );

    // Progression & Skill Discovery Notifications
    this.bindProgressionEvents(this.progressionSystem, playerData.name || 'Hero');

    // Restore any previously placed structures from GameState
    this.restorePlacedBuildables();

    // 5. Spawn Party & Restore State Snapshot
    const partySnapshots = GameState.getInstance().getPartySnapshots();
    this.party = [];

    if (partySnapshots.length === 0) {
      const hero = new Player(this, 4, 4, playerData, startingWeapon, this.tileSize, 'player-avatar', this.progressionSystem);
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

    // Initial room classification scan (runs after party members are instantiated and placed)
    this.recalculateEnclosedRooms();

    // 6. Spawn Portal to Dungeon at (3, 3)
    this.portalSprite = this.add.sprite(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize + this.tileSize / 2,
      'portal-to-dungeon'
    ).setDepth(2);
    this.portalSprite.setInteractive({ cursor: 'pointer' });

    this.tweens.add({
      targets: this.portalSprite,
      scale: 1.15,
      alpha: 0.85,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize - 10,
      'Portal to Dungeon',
      {
        fontSize: '11px',
        color: '#67e8f9',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { x: 4, y: 2 }
      }
    ).setOrigin(0.5).setDepth(5000);

    this.portalSprite.on('pointerdown', () => {
      if (!this.isBuildMode) {
        this.triggerPortalTransition();
      }
    });

    // 7. Setup Camera
    this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 8. Setup Build Mode Cursor Highlight & Ghost Preview Sprites
    this.hoverHighlightSprite = this.add.sprite(0, 0, 'tile-highlight-valid')
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(10000);

    this.hoverGhostSprite = this.add.sprite(0, 0, 'buildable-wood-floor')
      .setOrigin(0.5, 0.5)
      .setAlpha(0.65)
      .setVisible(false)
      .setDepth(10001);

    this.hoverReasonText = this.add.text(0, 0, '', {
      fontSize: '11px',
      color: '#f87171',
      backgroundColor: 'rgba(17, 24, 39, 0.9)',
      padding: { x: 6, y: 3 }
    })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(10010);

    // Initialize Move Destination Highlight Graphics
    if (this.moveHighlightGraphics) {
      this.moveHighlightGraphics.destroy();
    }
    this.moveHighlightGraphics = this.add.graphics().setDepth(10002);
    this.lastMoveDestinationHighlights = [];
    this.activeMoveHighlights = [];

    (window as any).__getLastOutpostMoveDestinationHighlights = () => this.lastMoveDestinationHighlights;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearMoveDestinationHighlights();
    });

    // 9. Input Controls: WASD, Space, B (Build Mode), R (Rotate)
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };

      const rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      rKey.on('down', () => {
        if (this.isBuildMode) {
          this.rotateBlueprint();
        } else {
          for (const member of this.party) {
            if (member.state === 'downed') {
              member.revive(this.player);
            }
          }
        }
      });

      const cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      cKey.on('down', () => {
        this.progressionSystem.addProficiencyExp('construction', 25);
        this.hud.updateBuildOverlay(
          GameState.getInstance().getWood(),
          this.currentRotation,
          this.selectedBuildableId,
          this.progressionSystem.getProficiencyLevel('construction')
        );
        this.hud.showToast('+25 Construction EXP', 'success', 2000);
      });

      const xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      xKey.on('down', () => {
        this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 25);
        this.hud.showToast(`+25 ${this.player.equippedWeapon.name} EXP`, 'success', 2000);
      });

      const zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      zKey.on('down', () => {
        this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 100);
        this.hud.showToast(`+100 ${this.player.equippedWeapon.name} EXP`, 'success', 2000);
      });

      const pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      pKey.on('down', () => {
        this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 680);
        this.hud.showToast(`+680 ${this.player.equippedWeapon.name} EXP (Level 10 Fencer Gate)`, 'success', 3000);
      });

      const hKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
      hKey.on('down', () => {
        this.hud.applyBandage();
      });
    }

    // Expose debug helpers on window in Outpost
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
    (window as any).__spawnTestCompanion = () => {
      return this.spawnTestCompanion();
    };
    (window as any).__recordActivity = (target: string, count: number = 1, memberIdx: number = 0) => {
      const member = this.party[memberIdx];
      if (!member) return 0;
      return member.progression.recordActivity(target, count);
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

    // Pointer Move Handler (Hover reticle and validity feedback in Build Mode)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isBuildMode) return;
      this.updateBuildHover(pointer);
    });

    // Pointer Down Handler (Placement / Demolition in Build Mode, Move / Interact in Normal Mode)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isTransitioning) return;
      if (this.hud.isLoadoutModalOpen()) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clickedTileX = Math.floor(worldPoint.x / this.tileSize);
      const clickedTileY = Math.floor(worldPoint.y / this.tileSize);

      if (this.isBuildMode) {
        const inBounds = clickedTileX >= 0 && clickedTileX < this.mapWidth && clickedTileY >= 0 && clickedTileY < this.mapHeight;
        const placed = inBounds ? this.getPlacedBuildableAt(clickedTileX, clickedTileY) : undefined;
        console.log(`[BuildMode:Click] Tile: (${clickedTileX}, ${clickedTileY}) | InBounds: ${inBounds} | ExistingBuildable: ${placed?.id ?? 'none'} | Tool: ${pointer.rightButtonDown() || this.selectedBuildableId === 'demolish' ? 'Demolish' : `Place(${this.selectedBuildableId})`}`);

        // Right click or Demolish palette selection -> Demolish
        if (pointer.rightButtonDown() || this.selectedBuildableId === 'demolish') {
          this.demolishAt(clickedTileX, clickedTileY);
        } else {
          this.placeAt(clickedTileX, clickedTileY);
        }
        this.updateBuildHover(pointer);
        return;
      }

      // Normal Play Mode
      // Downed state blocks Normal Mode actions unless clicking revive
      if (this.player.state === 'downed') {
        const isIconMatch = Math.hypot(this.player.x - worldPoint.x, (this.player.y - 24) - worldPoint.y) <= 18;
        if (isIconMatch) {
          this.interactReviveAlly(this.player);
        }
        return;
      }

      // Milestone 31: Check if any downed ally's clickable revive icon was clicked
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

      // Check if clicking a placed Bed
      if (this.isPlacedBed(clickedTileX, clickedTileY)) {
        const currentRoom = this.cachedRoomMap.get(`${clickedTileX},${clickedTileY}`);
        const roomName = currentRoom ? currentRoom.name : 'Bedroom';
        let anyRestored = false;
        for (const member of this.party) {
          if (member.rest()) {
            anyRestored = true;
          }
        }
        this.hud.update(this.player, this.progressionSystem, this.time.now, this.party);

        if (anyRestored) {
          this.createFloatingText(this.player.x, this.player.y - 20, '+PARTY RESTORED', '#22c55e');
          this.hud.showToast(`🛏️ You rest in the ${roomName} and feel fully recovered! Party HP & Energy restored.`, 'success', 3500);
          console.log(`[Bed] Rested in ${roomName}: Party HP & Energy restored.`);
        } else {
          this.hud.showToast(`🛏️ Guild Bed (${roomName}): Party is already fully rested!`, 'info', 3000);
          console.log(`[Bed] Interacted in ${roomName}: Already at full HP & Energy.`);
        }
        return;
      }

      // Check if clicking an interactive Harvest Icon (Milestone 39)
      for (const [key, iconData] of Array.from(this.harvestIcons.entries())) {
        const [ix, iy] = key.split(',').map(Number);
        const iconDist = Math.hypot((ix * this.tileSize + this.tileSize / 2) - worldPoint.x, (iy * this.tileSize - 12) - worldPoint.y);
        if (iconDist <= 18) {
          if (iconData.type === 'plot') {
            const plot = this.getPlacedBuildableAt(ix, iy);
            if (plot) { this.interactPlantingPlot(plot); return; }
          } else {
            const sm = this.getPlacedBuildableAt(ix, iy);
            if (sm) { this.interactSeedMaker(sm); return; }
          }
        }
      }

      // Check if clicking a placed Planting Plot
      const clickedPlacedItem = this.getPlacedBuildableAt(clickedTileX, clickedTileY);
      if (clickedPlacedItem?.id === 'planting_plot') {
        this.interactPlantingPlot(clickedPlacedItem);
        return;
      }

      // Check if clicking a placed Seed Maker
      if (clickedPlacedItem?.id === 'seed_maker') {
        this.interactSeedMaker(clickedPlacedItem);
        return;
      }

      // Check if clicking a placed Research Station
      if (this.isPlacedStation(clickedTileX, clickedTileY)) {
        this.hud.openResearchTreeModal();
        return;
      }

      // Check if clicking a placed Alchemy Station
      if (this.isPlacedAlchemyStation(clickedTileX, clickedTileY)) {
        this.hud.openAlchemyModal(this.player, this.progressionSystem);
        return;
      }

      // Check if clicking a placed Cooking Station
      if (this.isPlacedCookingStation(clickedTileX, clickedTileY)) {
        this.hud.openCookingModal(this.player, this.progressionSystem);
        return;
      }

      // Check if clicking a placed Blacksmithing Station
      if (this.isPlacedBlacksmithingStation(clickedTileX, clickedTileY)) {
        this.hud.openBlacksmithingModal(this.player, this.progressionSystem);
        return;
      }

      // Check if clicking a placed Armorsmithing Bench
      if (this.isPlacedArmorsmithingBench(clickedTileX, clickedTileY)) {
        this.hud.openArmorsmithingModal(this.player, this.progressionSystem);
        return;
      }

      // Check if clicking a placed Bowyer Station
      if (this.isPlacedBowyerStation(clickedTileX, clickedTileY)) {
        this.hud.openBowyerModal(this.player, this.progressionSystem);
        return;
      }

      // Check if portal clicked
      if (clickedTileX === this.portalPos.x && clickedTileY === this.portalPos.y) {
        this.triggerPortalTransition();
        return;
      }

      // Normal Click-to-Move
      if (this.gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        for (const member of this.party) {
          member.clearTarget();
        }

        const claimed = new Set<string>();
        this.executePartyConvoyMovement(clickedTileX, clickedTileY, claimed);
      }
    });

    // Document-level diagnostics for pointer events to detect DOM element occlusion over canvas
    document.addEventListener('pointermove', (e: MouseEvent) => {
      if (!this.isBuildMode) return;
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (target && target.tagName !== 'CANVAS') {
        console.log(`[BuildMode:DOM-Occlusion] Pointer over non-canvas DOM element: <${target.tagName.toLowerCase()} id="${target.id}" class="${target.className}"> at client (${e.clientX}, ${e.clientY})`);
      }
    });

    console.log('[OutpostScene] Outpost created. Safe zone active. Build Mode enabled.');
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
    clickedTileX: number,
    clickedTileY: number,
    claimed: Set<string>
  ): void {
    const leader = this.player;
    if (!leader || leader.state === 'dead' || leader.state === 'downed') return;

    const movingUnits = this.party.filter(m => m.state !== 'dead' && m.state !== 'downed');
    if (movingUnits.length === 0) return;

    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    if (movingUnits.length === 1) {
      let leaderDest: GridPos = { x: clickedTileX, y: clickedTileY };
      if (this.gridMatrix[leaderDest.y]?.[leaderDest.x] !== 0 || claimed.has(`${leaderDest.x},${leaderDest.y}`)) {
        leaderDest = this.findNearestOpenTileForPartyMove({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, leader);
      }
      claimed.add(`${leaderDest.x},${leaderDest.y}`);
      leader.claimedDestination = { ...leaderDest };
      this.showMoveDestinationHighlights([leaderDest], [leader]);

      const dynamicObs = this.getDynamicObstacles(leader);
      this.pathfinder.findPath(leader.gridPos, leaderDest, dynamicObs).then((path) => {
        if (path.length === 0) {
          leader.claimedDestination = null;
          this.clearMoveDestinationHighlights();
          return;
        }
        leader.followPath(path, undefined, leaderDest);
      });
      return;
    }

    // 1. Determine destination 2x2 anchor
    const destAnchor = this.findBest2x2Anchor({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, movingUnits);

    const destTiles: GridPos[] = [];
    for (let i = 0; i < movingUnits.length; i++) {
      const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const tile = { x: destAnchor.x + off.x, y: destAnchor.y + off.y };
      destTiles.push(tile);
      claimed.add(`${tile.x},${tile.y}`);
      movingUnits[i].claimedDestination = { ...tile };
    }

    this.showMoveDestinationHighlights(destTiles, movingUnits);

    const dynamicObs = this.getDynamicObstacles().filter(
      obs => !movingUnits.some(m => m.gridPos.x === obs.x && m.gridPos.y === obs.y)
    );

    let startAnchor: GridPos = { x: leader.gridPos.x, y: leader.gridPos.y };
    if (!this.pathfinder.is2x2Walkable(startAnchor.x, startAnchor.y)) {
      startAnchor = this.findBest2x2Anchor(leader.gridPos, leader.gridPos, undefined, movingUnits);
    }

    this.pathfinder.find2x2Path(startAnchor, destAnchor, dynamicObs).then((anchorPath) => {
      if (anchorPath.length === 0) {
        // Fallback: single-file compression through 1-tile pinch point (e.g. outpost doors)
        this.pathfinder.findPath(leader.gridPos, destTiles[0], dynamicObs).then((fallbackPath) => {
          if (fallbackPath.length === 0) {
            for (const m of movingUnits) {
              m.claimedDestination = null;
            }
            this.clearMoveDestinationHighlights();
            return;
          }
          for (let i = 0; i < movingUnits.length; i++) {
            const unit = movingUnits[i];
            const targetTile = destTiles[i];
            this.pathfinder.findPath(unit.gridPos, targetTile, dynamicObs).then((uPath) => {
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

      // Lockstep 2x2 movement
      const dirX = anchorPath.length > 1 ? anchorPath[1].x - anchorPath[0].x : 0;
      const dirY = anchorPath.length > 1 ? anchorPath[1].y - anchorPath[0].y : 0;
      const launchOrder = movingUnits.map((_, idx) => idx);
      launchOrder.sort((a, b) => {
        const offA = formationOffsets[a] || { x: a % 2, y: Math.floor(a / 2) };
        const offB = formationOffsets[b] || { x: b % 2, y: Math.floor(b / 2) };
        const scoreA = offA.x * dirX + offA.y * dirY;
        const scoreB = offB.x * dirX + offB.y * dirY;
        return scoreB - scoreA;
      });

      for (const i of launchOrder) {
        const unit = movingUnits[i];
        const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
        const unitPath: GridPos[] = anchorPath.map(p => ({ x: p.x + off.x, y: p.y + off.y }));

        if (unit.gridPos.x === unitPath[0].x && unit.gridPos.y === unitPath[0].y) {
          unit.followPath(unitPath, undefined, destTiles[i]);
        } else {
          // Out of formation (split party / rejoin): route through authentic tile-by-tile pathfinder
          const outOfFormationObs = [
            ...dynamicObs,
            ...destTiles.filter((_, idx) => idx !== i)
          ];
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
    clickedTileX: number,
    clickedTileY: number,
    claimed: Set<string>
  ): void {
    this.executePartyBlockMovement(clickedTileX, clickedTileY, claimed);
  }

  public getLivingUnits(excludeEntity?: Entity): Entity[] {
    const units: Entity[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') {
        units.push(m);
      }
    }
    return units;
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
    const offsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
      { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
      { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
      { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 }
    ];

    const candidates: GridPos[] = [];
    for (const off of offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
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

    if (candidates.length > 0) {
      if (preferredNear) {
        candidates.sort((a, b) => {
          const distA = Math.max(Math.abs(a.x - preferredNear.x), Math.abs(a.y - preferredNear.y));
          const distB = Math.max(Math.abs(b.x - preferredNear.x), Math.abs(b.y - preferredNear.y));
          return distA - distB;
        });
      }
      return candidates[0];
    }

    // Fallback: first walkable unclaimed tile
    for (const off of offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (
        tx > 0 && tx < this.mapWidth - 1 &&
        ty > 0 && ty < this.mapHeight - 1 &&
        this.gridMatrix[ty]?.[tx] === 0
      ) {
        const key = `${tx},${ty}`;
        if (!claimedTiles?.has(key) && !this.isTileClaimed(tx, ty, excludeEntity)) {
          return { x: tx, y: ty };
        }
      }
    }

    return center;
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

  public spawnTestCompanion(): boolean {
    if (this.party.length >= 4) {
      this.hud.showToast('Party is full (maximum 4 members)', 'warn', 3000);
      return false;
    }
    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const daggerWeapon = dataLoader.getWeapon('daggers') || dataLoader.getWeapon(playerData.startingWeaponId)!;
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

    const companionProgression = new ProgressionSystem(dataLoader.getClassesData(), companionName);
    this.bindProgressionEvents(companionProgression, companionName);
    const companion = new Player(
      this,
      spawnX,
      spawnY,
      playerData,
      daggerWeapon,
      this.tileSize,
      'companion-avatar',
      companionProgression
    );
    companion.id = companionId;
    companion.entityName = companionName;
    companionProgression.ownerName = companionName;
    this.party.push(companion);
    GameState.getInstance().addCompanionToParty(companion, this.time.now);
    this.updatePlayerRoomLookup(true);
    this.hud.showToast(`👥 ${companionName} joined the party!`, 'success', 3000);
    console.log(`[OutpostScene] Spawned companion ${companionName} at (${spawnX}, ${spawnY}) with ${daggerWeapon.name}`);
    return true;
  }

  private bindProgressionEvents(prog: ProgressionSystem, memberName?: string): void {
    const resolvedName = memberName || prog.ownerName || this.player?.entityName || 'Guild Hero';
    prog.ownerName = resolvedName;

    prog.onClassUnlocked((event) => {
      const name = event.memberName || memberName || prog.ownerName || 'Guild Hero';
      console.log(`%c[UNLOCK] ${name} unlocked ${event.classDef.name}!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef, name);
    });

    prog.onSkillDiscovered((event) => {
      const name = event.memberName || memberName || prog.ownerName || 'Guild Hero';
      const skillDef = DataLoader.getInstance().getTrainableStatDef(event.skillId);
      if (skillDef) {
        console.log(`%c[DISCOVERY] ${name} discovered ${skillDef.name}!`, 'color: #34d399; font-weight: bold; font-size: 14px;');
        this.hud.showSkillDiscoveredModal(skillDef, name);
      }
    });
  }

  // --- BUILD MODE METHODS ---

  public toggleBuildMode(): void {
    this.isBuildMode = !this.isBuildMode;
    this.hud.setBuildOverlayVisible(this.isBuildMode);

    if (this.isBuildMode) {
      this.selectedBuildableId = 'floor';
      this.currentRotation = 0;
      this.hud.updateBuildOverlay(
        GameState.getInstance().getWood(),
        this.currentRotation,
        this.selectedBuildableId,
        this.progressionSystem.getProficiency('construction')
      );
      this.hoverHighlightSprite.setVisible(true);
      this.hoverGhostSprite.setVisible(true);
      this.updateGhostSprite();
      this.hud.showToast('🔨 Entered Build Mode! Select a blueprint and click tiles to place.', 'info', 3000);
      console.log('[BuildMode] Activated');
    } else {
      this.hoverHighlightSprite.setVisible(false);
      this.hoverGhostSprite.setVisible(false);
      this.hoverReasonText.setVisible(false);
      this.hud.showToast('Exited Build Mode.', 'info', 2000);
      console.log('[BuildMode] Deactivated');
    }
  }

  public selectBuildable(id: string): void {
    this.selectedBuildableId = id;
    this.currentRotation = 0;
    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId,
      this.progressionSystem.getProficiency('construction')
    );
    this.updateGhostSprite();
  }

  public rotateBlueprint(): void {
    if (this.selectedBuildableId === 'wall') {
      this.hud.showToast('Walls cannot be rotated — they infer orientation automatically from adjacent walls/doors.', 'warn', 2500);
      return;
    }
    this.currentRotation = (this.currentRotation + 90) % 360;
    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId,
      this.progressionSystem.getProficiency('construction')
    );
    this.hoverGhostSprite.setAngle(this.currentRotation);
  }

  private updateGhostSprite(): void {
    if (this.selectedBuildableId === 'demolish') {
      this.hoverGhostSprite.setTexture('tile-highlight-invalid');
      this.hoverGhostSprite.setAngle(0);
      return;
    }

    const dataLoader = DataLoader.getInstance();
    const def = dataLoader.getBuildable(this.selectedBuildableId);
    if (!def) return;

    let texture = 'buildable-wood-floor';
    if (def.id === 'floor') texture = 'buildable-wood-floor';
    else if (def.id === 'wall') texture = 'buildable-wood-wall-h';
    else if (def.id === 'door') texture = this.currentRotation === 90 || this.currentRotation === 270 ? 'buildable-wood-door-v' : 'buildable-wood-door-h';
    else if (def.id === 'bed') texture = 'buildable-bed';
    else if (def.id === 'research_station') texture = 'buildable-research-station';
    else if (def.id === 'alchemy_station') texture = 'buildable-alchemy-station';
    else if (def.id === 'cooking_station') texture = 'buildable-cooking-station';
    else if (def.id === 'blacksmithing_station') texture = 'buildable-blacksmithing-station';
    else if (def.id === 'armorsmithing_bench') texture = 'buildable-armorsmithing-bench';
    else if (def.id === 'bowyer_station') texture = 'buildable-bowyer-station';
    else if (def.id === 'planting_plot') texture = 'buildable-planting-plot';
    else if (def.id === 'seed_maker') texture = 'buildable-seed-maker';

    this.hoverGhostSprite.setTexture(texture);
    this.hoverGhostSprite.setAngle(def.rotatable ? this.currentRotation : 0);
  }

  private updateBuildHover(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(worldPoint.x / this.tileSize);
    const tileY = Math.floor(worldPoint.y / this.tileSize);
    const inBounds = tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight;
    const placedBuildable = inBounds ? this.getPlacedBuildableAt(tileX, tileY) : undefined;
    const hoverKey = `${tileX},${tileY}`;

    if (!inBounds) {
      if (this.lastLoggedHoverKey !== hoverKey) {
        console.log(`[BuildMode:Hover] Tile: (${tileX}, ${tileY}) | InBounds: false | ExistingBuildable: none | Path: silently-ignored (out of map bounds)`);
        this.lastLoggedHoverKey = hoverKey;
      }
      this.hoverHighlightSprite.setVisible(false);
      this.hoverGhostSprite.setVisible(false);
      this.hoverReasonText.setVisible(false);
      return;
    }

    this.hoverHighlightSprite.setVisible(true);
    this.hoverHighlightSprite.setPosition(tileX * this.tileSize, tileY * this.tileSize);

    this.hoverGhostSprite.setVisible(true);
    this.hoverGhostSprite.setPosition(
      tileX * this.tileSize + this.tileSize / 2,
      tileY * this.tileSize + this.tileSize / 2
    );

    const constLevel = this.progressionSystem.getProficiencyLevel('construction');

    if (this.selectedBuildableId === 'demolish') {
      const placed = this.getPlacedBuildableAt(tileX, tileY);
      const path = placed ? 'valid-highlight' : 'invalid-highlight-with-reason (Nothing to demolish)';
      if (this.lastLoggedHoverKey !== hoverKey) {
        console.log(`[BuildMode:Hover] Tile: (${tileX}, ${tileY}) | InBounds: true | ExistingBuildable: ${placed?.id ?? 'none'} | Path: ${path}`);
        this.lastLoggedHoverKey = hoverKey;
      }
      if (placed) {
        const dataLoader = DataLoader.getInstance();
        const def = dataLoader.getBuildable(placed.id);
        const costPaid = placed.costPaid ?? (def?.woodCost || 0);
        const refund = BuildingSystem.getEffectiveDemolishRefund(costPaid, constLevel);

        this.hoverHighlightSprite.setTexture('tile-highlight-valid');
        this.hoverGhostSprite.setTint(0xffffff);
        this.hoverReasonText.setText(`Demolish ${def?.name || placed.id} (Refund +${refund} Wood)`).setVisible(true);
      } else {
        this.hoverHighlightSprite.setTexture('tile-highlight-invalid');
        this.hoverGhostSprite.setTint(0xff6666);
        this.hoverReasonText.setText('Nothing to demolish').setVisible(true);
      }
      this.hoverReasonText.setPosition(
        tileX * this.tileSize + this.tileSize / 2,
        tileY * this.tileSize - 4
      );
      return;
    }

    const dataLoader = DataLoader.getInstance();
    const blueprint = dataLoader.getBuildable(this.selectedBuildableId);
    if (!blueprint) return;

    const playerPos = this.player?.gridPos ?? { x: -1, y: -1 };
    const gardeningLevel = this.progressionSystem.getProficiencyLevel('gardening');
    const currentClay = GameState.getInstance().getItemCount('clay');
    let validation = this.buildingSystem.canPlace(
      blueprint,
      tileX,
      tileY,
      playerPos,
      [this.portalPos],
      (x, y) => this.isWall(x, y),
      (x, y) => this.isPlacedDoor(x, y),
      (x, y) => this.isSolidFurnitureOrStation(x, y),
      GameState.getInstance().getWood(),
      constLevel,
      currentClay,
      gardeningLevel
    );

    if (validation.valid && !blueprint.walkable && this.party.some((m) => m.gridPos.x === tileX && m.gridPos.y === tileY)) {
      validation = { valid: false, reason: 'Cannot place solid object on party member position.' };
    }

    const path = validation.valid ? 'valid-highlight' : `invalid-highlight-with-reason (${validation.reason})`;
    if (this.lastLoggedHoverKey !== hoverKey) {
      console.log(`[BuildMode:Hover] Tile: (${tileX}, ${tileY}) | InBounds: true | ExistingBuildable: ${placedBuildable?.id ?? 'none'} | Path: ${path}`);
      this.lastLoggedHoverKey = hoverKey;
    }

    if (validation.valid) {
      this.hoverHighlightSprite.setTexture('tile-highlight-valid');
      this.hoverGhostSprite.setTint(0xffffff);
      const room = this.cachedRoomMap.get(hoverKey);
      if (room) {
        this.hoverReasonText.setText(`[${room.name}]`).setVisible(true);
      } else {
        this.hoverReasonText.setVisible(false);
      }
    } else {
      this.hoverHighlightSprite.setTexture('tile-highlight-invalid');
      this.hoverGhostSprite.setTint(0xff6666);
      this.hoverReasonText.setText(validation.reason || 'Cannot place here');
      this.hoverReasonText.setPosition(
        tileX * this.tileSize + this.tileSize / 2,
        tileY * this.tileSize - 4
      );
      this.hoverReasonText.setVisible(true);
    }
  }

  private placeAt(x: number, y: number): void {
    const dataLoader = DataLoader.getInstance();
    const blueprint = dataLoader.getBuildable(this.selectedBuildableId);
    if (!blueprint) return;

    const constLevel = this.progressionSystem.getProficiencyLevel('construction');
    const gardeningLevel = this.progressionSystem.getProficiencyLevel('gardening');
    const currentClay = GameState.getInstance().getItemCount('clay');
    const effectiveCost = BuildingSystem.getEffectiveBuildCost(blueprint.woodCost, constLevel);

    const playerPos = this.player?.gridPos ?? { x: -1, y: -1 };
    let validation = this.buildingSystem.canPlace(
      blueprint,
      x,
      y,
      playerPos,
      [this.portalPos],
      (tx, ty) => this.isWall(tx, ty),
      (tx, ty) => this.isPlacedDoor(tx, ty),
      (tx, ty) => this.isSolidFurnitureOrStation(tx, ty),
      GameState.getInstance().getWood(),
      constLevel,
      currentClay,
      gardeningLevel
    );

    if (validation.valid && !blueprint.walkable && this.party.some((m) => m.gridPos.x === x && m.gridPos.y === y)) {
      validation = { valid: false, reason: 'Cannot place solid object on party member position.' };
    }

    if (!validation.valid) {
      console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: ${validation.reason}`);
      this.hud.showToast(validation.reason || 'Placement blocked!', 'error');
      // Visual feedback: camera shake
      this.cameras.main.shake(120, 0.005);
      return;
    }

    // Deduct wood using effective cost if woodCost > 0
    if (blueprint.woodCost > 0) {
      const success = GameState.getInstance().consumeWood(effectiveCost);
      if (!success) {
        console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Not enough wood`);
        this.hud.showToast(`Not enough Wood! Requires ${effectiveCost} Wood.`, 'error');
        return;
      }
    }

    // Deduct clay if clayCost > 0
    if (blueprint.clayCost && blueprint.clayCost > 0) {
      const success = GameState.getInstance().consumeItem('clay', blueprint.clayCost);
      if (!success) {
        console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Not enough clay`);
        this.hud.showToast(`Not enough Clay! Requires ${blueprint.clayCost} Clay.`, 'error');
        return;
      }
    }

    const costLabel = (blueprint.clayCost && blueprint.clayCost > 0) ? `-${blueprint.clayCost} Clay` : `-${effectiveCost} Wood`;
    console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: PLACED ${blueprint.name} (${costLabel})`);

    // Save to GameState with costPaid
    const placedItem: PlacedBuildable = {
      id: blueprint.id,
      x,
      y,
      rotation: blueprint.rotatable ? this.currentRotation : 0,
      costPaid: blueprint.woodCost > 0 ? effectiveCost : (blueprint.clayCost ?? 0)
    };
    GameState.getInstance().addPlacedBuildable(placedItem);

    // Award +1 Construction EXP
    this.progressionSystem.addProficiencyExp('construction', 1);
    this.createFloatingText(x * this.tileSize + this.tileSize / 2, y * this.tileSize, '+1 Construction Exp', '#f59e0b');

    // Milestone 39: Award +13 Gardening EXP on Planting Plot construction (bootstrapping sequence)
    if (blueprint.id === 'planting_plot') {
      this.progressionSystem.addProficiencyExp('gardening', 13);
      this.createFloatingText(x * this.tileSize + this.tileSize / 2, y * this.tileSize - 14, '+13 Gardening EXP', '#22c55e');
    }

    // Render sprite
    this.createPlacedSprite(placedItem);

    // Update collision if solid
    if (!blueprint.walkable) {
      this.gridMatrix[y][x] = 1;
      this.pathfinder.updateGrid(this.gridMatrix);
    }

    // Update wall auto-orientations
    if (blueprint.id === 'wall' || blueprint.id === 'door') {
      this.updateAllWallTextures();
    }

    // Recalculate room classification cache
    this.recalculateEnclosedRooms();

    const currentRoom = this.cachedRoomMap.get(`${x},${y}`);
    const roomSuffix = currentRoom ? ` inside ${currentRoom.name}` : '';

    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId,
      this.progressionSystem.getProficiencyLevel('construction')
    );
    this.hud.showToast(`Placed ${blueprint.name} (${costLabel})${roomSuffix}. +1 Construction Exp`, 'success');
  }

  private demolishAt(x: number, y: number): void {
    const placed = this.getPlacedBuildableAt(x, y);
    if (!placed) {
      console.log(`[BuildMode:Demolish] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Cannot demolish (no player-built structure)`);
      this.hud.showToast('Cannot demolish: Only player-built structures can be removed.', 'warn');
      return;
    }

    // Hide any active harvest icon at this tile
    this.hideHarvestIcon(x, y);

    const dataLoader = DataLoader.getInstance();
    const def = dataLoader.getBuildable(placed.id);
    const constLevel = this.progressionSystem.getProficiencyLevel('construction');
    const costPaid = placed.costPaid ?? (def?.woodCost || 0);
    const refund = BuildingSystem.getEffectiveDemolishRefund(costPaid, constLevel);

    // Remove from GameState and refund
    GameState.getInstance().removePlacedBuildable(x, y);
    if (def?.clayCost && def.clayCost > 0) {
      GameState.getInstance().addItem('clay', 2);
    } else {
      GameState.getInstance().addWood(refund);
    }

    // Award +1 Construction EXP
    this.progressionSystem.addProficiencyExp('construction', 1);
    this.createFloatingText(x * this.tileSize + this.tileSize / 2, y * this.tileSize, '+1 Construction Exp', '#f59e0b');

    // Remove visual sprite
    const sprite = this.placedSprites.get(`${x},${y}`);
    if (sprite) {
      sprite.destroy();
      this.placedSprites.delete(`${x},${y}`);
    }

    // Restore walkable status if it was solid
    if (def && !def.walkable) {
      this.gridMatrix[y][x] = 0;
      this.pathfinder.updateGrid(this.gridMatrix);
    }

    // Update adjacent wall auto-orientations
    if (placed.id === 'wall' || placed.id === 'door') {
      this.updateAllWallTextures();
    }

    // Recalculate room classification cache
    this.recalculateEnclosedRooms();

    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId,
      this.progressionSystem.getProficiencyLevel('construction')
    );
    console.log(`[BuildMode:Demolish] Tile: (${x}, ${y}) | Result: DEMOLISHED ${placed.id} (+${refund} Wood refunded from ${costPaid} paid)`);
    this.hud.showToast(`Demolished ${def?.name || placed.id} (+${refund} Wood refunded). +1 Construction Exp`, 'success');
  }

  private createPlacedSprite(item: PlacedBuildable): void {
    // Remove existing sprite at coordinate if replacing floor
    const existing = this.placedSprites.get(`${item.x},${item.y}`);
    if (existing) {
      existing.destroy();
      this.placedSprites.delete(`${item.x},${item.y}`);
    }

    const posX = item.x * this.tileSize + this.tileSize / 2;
    const posY = item.y * this.tileSize + this.tileSize / 2;

    let sprite: Phaser.GameObjects.Sprite;

    if (item.id === 'floor') {
      sprite = this.add.sprite(posX, posY, 'buildable-wood-floor')
        .setAngle(item.rotation)
        .setDepth(1);
    } else if (item.id === 'wall') {
      const textureKey = this.buildingSystem.getWallTextureKey(
        item.x,
        item.y,
        (tx, ty) => this.isWallOrDoor(tx, ty)
      );
      sprite = this.add.sprite(posX, posY, textureKey).setDepth(posY);
    } else if (item.id === 'door') {
      const isVert = item.rotation === 90 || item.rotation === 270;
      sprite = this.add.sprite(posX, posY, isVert ? 'buildable-wood-door-v' : 'buildable-wood-door-h').setDepth(posY);
    } else if (item.id === 'bed') {
      sprite = this.add.sprite(posX, posY, 'buildable-bed')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'research_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-research-station')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'alchemy_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-alchemy-station')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'cooking_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-cooking-station')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'blacksmithing_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-blacksmithing-station')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'armorsmithing_bench') {
      sprite = this.add.sprite(posX, posY, 'buildable-armorsmithing-bench')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'bowyer_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-bowyer-station')
        .setAngle(item.rotation)
        .setDepth(posY);
    } else if (item.id === 'planting_plot') {
      const state = GameState.getInstance().getPlotState(item.x, item.y);
      const tex = state?.state === 'ready'
        ? 'buildable-planting-plot-ready'
        : state?.state === 'growing'
        ? 'buildable-planting-plot-sprout'
        : 'buildable-planting-plot';
      sprite = this.add.sprite(posX, posY, tex).setDepth(2);
      if (state?.state === 'ready') {
        this.showHarvestIcon(item.x, item.y, 'plot');
      }
    } else if (item.id === 'seed_maker') {
      sprite = this.add.sprite(posX, posY, 'buildable-seed-maker')
        .setAngle(item.rotation)
        .setDepth(posY);
      const smState = GameState.getInstance().getSeedMakerState(item.x, item.y);
      if (smState?.state === 'ready') {
        this.showHarvestIcon(item.x, item.y, 'seed_maker');
      }
    } else {
      sprite = this.add.sprite(posX, posY, 'buildable-wood-floor').setDepth(1);
    }

    this.placedSprites.set(`${item.x},${item.y}`, sprite);
  }

  private restorePlacedBuildables(): void {
    const placed = GameState.getInstance().getPlacedBuildables();
    const dataLoader = DataLoader.getInstance();

    for (const item of placed) {
      this.createPlacedSprite(item);
      const def = dataLoader.getBuildable(item.id);
      if (def && !def.walkable) {
        this.gridMatrix[item.y][item.x] = 1;
      }
    }

    this.pathfinder.updateGrid(this.gridMatrix);
    this.updateAllWallTextures();
  }

  private updateAllWallTextures(): void {
    const placed = GameState.getInstance().getPlacedBuildables();
    for (const item of placed) {
      if (item.id === 'wall') {
        const sprite = this.placedSprites.get(`${item.x},${item.y}`);
        if (sprite) {
          const textureKey = this.buildingSystem.getWallTextureKey(
            item.x,
            item.y,
            (tx, ty) => this.isWallOrDoor(tx, ty)
          );
          sprite.setTexture(textureKey);
        }
      }
    }
  }

  // Helper checks for building queries
  private isWall(x: number, y: number): boolean {
    if (this.baseWallSet.has(`${x},${y}`)) return true;
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'wall';
  }

  private isPlacedDoor(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'door';
  }

  private isSolidFurnitureOrStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    if (!placed) return false;
    const def = DataLoader.getInstance().getBuildable(placed.id);
    return def ? !def.walkable && def.id !== 'wall' : false;
  }

  private isPlacedStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'research_station';
  }

  private isPlacedAlchemyStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'alchemy_station';
  }

  private isPlacedCookingStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'cooking_station';
  }

  private isPlacedBlacksmithingStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'blacksmithing_station';
  }

  private isPlacedArmorsmithingBench(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'armorsmithing_bench';
  }

  private isPlacedBowyerStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'bowyer_station';
  }

  private isPlacedBed(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'bed';
  }

  public isPlacedPlantingPlot(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'planting_plot';
  }

  public isPlacedSeedMaker(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'seed_maker';
  }

  // --- Milestone 39: Gardening & Seed Maker Interactions ---

  public showHarvestIcon(tileX: number, tileY: number, type: 'plot' | 'seed_maker'): void {
    const key = `${tileX},${tileY}`;
    if (this.harvestIcons.has(key)) return;

    const posX = tileX * this.tileSize + this.tileSize / 2;
    const posY = tileY * this.tileSize - 12;
    const sprite = this.add.sprite(posX, posY, 'harvest-icon')
      .setDepth(10002)
      .setInteractive({ useHandCursor: true });

    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event?: Phaser.Types.Input.EventData) => {
      event?.stopPropagation();
      if (type === 'plot') {
        const plot = this.getPlacedBuildableAt(tileX, tileY);
        if (plot) this.interactPlantingPlot(plot);
      } else {
        const sm = this.getPlacedBuildableAt(tileX, tileY);
        if (sm) this.interactSeedMaker(sm);
      }
    });

    let tween: Phaser.Tweens.Tween | undefined;
    if (this.tweens) {
      tween = this.tweens.add({
        targets: sprite,
        y: posY - 4,
        scale: 1.1,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    this.harvestIcons.set(key, { sprite, tween, type });
  }

  public hideHarvestIcon(tileX: number, tileY: number): void {
    const key = `${tileX},${tileY}`;
    const entry = this.harvestIcons.get(key);
    if (entry) {
      if (entry.tween) entry.tween.stop();
      entry.sprite.destroy();
      this.harvestIcons.delete(key);
    }
  }

  public interactPlantingPlot(plot: PlacedBuildable): void {
    const gs = GameState.getInstance();
    const plotState = gs.getPlotState(plot.x, plot.y);
    if (!plotState) return;

    if (plotState.state === 'empty') {
      if (gs.getItemCount('seeds') < 1) {
        this.hud?.showToast('⚠️ You need Seeds to plant in this plot! Dig them up or harvest dungeon vegetable nodes.', 'warn', 3000);
        return;
      }
      const planted = gs.plantCrop(plot.x, plot.y, 'seeds');
      if (planted) {
        // Award +5 Gardening EXP
        this.progressionSystem.addProficiencyExp('gardening', 5);
        this.createFloatingText(plot.x * this.tileSize + this.tileSize / 2, plot.y * this.tileSize - 10, '🌱 Planted Seeds!', '#22c55e');
        this.createFloatingText(plot.x * this.tileSize + this.tileSize / 2, plot.y * this.tileSize - 24, '+5 Gardening EXP', '#60a5fa');
        this.hud?.showToast('🌱 Planted Seeds in the plot! (+5 Gardening EXP)', 'success', 2500);

        const sprite = this.placedSprites.get(`${plot.x},${plot.y}`);
        if (sprite) sprite.setTexture('buildable-planting-plot-sprout');
      }
    } else if (plotState.state === 'growing') {
      this.hud?.showToast('🌱 Seeds are growing in the plot... They mature as game days advance.', 'info', 2500);
    } else if (plotState.state === 'ready') {
      const res = gs.harvestCrop(plot.x, plot.y);
      if (res && res.success) {
        this.hideHarvestIcon(plot.x, plot.y);
        // Award +15 Gardening EXP
        this.progressionSystem.addProficiencyExp('gardening', 15);
        this.createFloatingText(plot.x * this.tileSize + this.tileSize / 2, plot.y * this.tileSize - 10, `+${res.count} Fresh Vegetables`, '#22c55e');
        this.createFloatingText(plot.x * this.tileSize + this.tileSize / 2, plot.y * this.tileSize - 24, '+15 Gardening EXP', '#60a5fa');
        this.hud?.showToast(`🌾 Harvested ${res.count}x Fresh Vegetables! (+15 Gardening EXP)`, 'success', 2500);

        const sprite = this.placedSprites.get(`${plot.x},${plot.y}`);
        if (sprite) sprite.setTexture('buildable-planting-plot');
      }
    }
  }

  public interactSeedMaker(sm: PlacedBuildable): void {
    const gs = GameState.getInstance();
    const smState = gs.getSeedMakerState(sm.x, sm.y);
    if (!smState) return;

    if (smState.state === 'idle') {
      if (gs.getItemCount('vegetable') < 1) {
        this.hud?.showToast('⚠️ You need 1 Fresh Vegetable to process in the Seed Maker!', 'warn', 3000);
        return;
      }
      const inserted = gs.insertSeedMakerProduce(sm.x, sm.y, 'vegetable', 10000);
      if (inserted) {
        this.createFloatingText(sm.x * this.tileSize + this.tileSize / 2, sm.y * this.tileSize - 10, '-1 Vegetable', '#f59e0b');
        this.hud?.showToast('🌰 Inserted 1 Vegetable into Seed Maker! Extracting seeds (10s)...', 'info', 2500);
      }
    } else if (smState.state === 'processing') {
      const remainingSec = Math.max(1, Math.ceil((smState.startedTimeMs! + smState.durationMs! - Date.now()) / 1000));
      this.hud?.showToast(`⏳ Seed Maker is extracting seeds... (${remainingSec}s remaining)`, 'info', 2000);
    } else if (smState.state === 'ready') {
      const res = gs.collectSeedMakerSeeds(sm.x, sm.y);
      if (res && res.success) {
        this.hideHarvestIcon(sm.x, sm.y);
        this.createFloatingText(sm.x * this.tileSize + this.tileSize / 2, sm.y * this.tileSize - 10, `+${res.count} Seeds`, '#22c55e');
        this.hud?.showToast(`✨ Collected ${res.count}x Seeds from the Seed Maker!`, 'success', 2500);
      }
    }
  }

  public updateAllGardeningVisuals(): void {
    const gs = GameState.getInstance();
    const placed = gs.getPlacedBuildables();

    for (const item of placed) {
      if (item.id === 'planting_plot') {
        const state = gs.getPlotState(item.x, item.y);
        const sprite = this.placedSprites.get(`${item.x},${item.y}`);
        if (state && sprite) {
          if (state.state === 'ready') {
            sprite.setTexture('buildable-planting-plot-ready');
            this.showHarvestIcon(item.x, item.y, 'plot');
          } else if (state.state === 'growing') {
            sprite.setTexture('buildable-planting-plot-sprout');
            this.hideHarvestIcon(item.x, item.y);
          } else {
            sprite.setTexture('buildable-planting-plot');
            this.hideHarvestIcon(item.x, item.y);
          }
        }
      } else if (item.id === 'seed_maker') {
        const smState = gs.getSeedMakerState(item.x, item.y);
        if (smState) {
          if (smState.state === 'ready') {
            this.showHarvestIcon(item.x, item.y, 'seed_maker');
          } else {
            this.hideHarvestIcon(item.x, item.y);
          }
        }
      }
    }
  }

  private isWallOrDoor(x: number, y: number): boolean {
    return this.isWall(x, y) || this.isPlacedDoor(x, y);
  }

  private getPlacedBuildableAt(x: number, y: number): PlacedBuildable | undefined {
    return GameState.getInstance().getPlacedBuildables().find((b) => b.x === x && b.y === y);
  }

  // --- AUTOMATIC ROOM CLASSIFICATION (Section 9.5) ---

  /**
   * Recalculate room classifications for all enclosed spaces.
   * Runs strictly on structural changes (placement, demolition, scene load).
   * Caches results into an O(1) map so player movement is instantaneous.
   */
  private recalculateEnclosedRooms(): void {
    this.cachedRoomMap.clear();
    const dataLoader = DataLoader.getInstance();
    const processedTiles = new Set<string>();

    for (let y = 1; y < this.mapHeight - 1; y++) {
      for (let x = 1; x < this.mapWidth - 1; x++) {
        const key = `${x},${y}`;
        if (processedTiles.has(key)) continue;
        if (this.isWallOrDoor(x, y)) continue;

        const enclosure = this.buildingSystem.checkEnclosure(
          x,
          y,
          (tx, ty) => this.isWall(tx, ty),
          (tx, ty) => this.isPlacedDoor(tx, ty)
        );

        if (enclosure.isIndoor && enclosure.enclosedTiles) {
          const tags: string[] = [];
          for (const tile of enclosure.enclosedTiles) {
            processedTiles.add(`${tile.x},${tile.y}`);
            const placed = this.getPlacedBuildableAt(tile.x, tile.y);
            if (placed) {
              const def = dataLoader.getBuildable(placed.id);
              if (def?.roomTag) tags.push(def.roomTag);
              if (def?.roomTags) tags.push(...def.roomTags);
            }
          }

          const classified = this.roomClassifier.classify(tags, enclosure.enclosedTiles);
          for (const tile of enclosure.enclosedTiles) {
            this.cachedRoomMap.set(`${tile.x},${tile.y}`, classified);
          }
        }
      }
    }

    this.updatePlayerRoomLookup(true);
  }

  /**
   * O(1) room lookup when party members move between tiles.
   * Zero flood fill. Iterates active party roster.
   */
  private updatePlayerRoomLookup(forceUpdate: boolean = false): void {
    if (!this.party || this.party.length === 0) return;

    // Clean up tracking for any dismissed/removed members
    if (this.lastKnownMemberTiles.size > this.party.length) {
      for (const trackedMember of this.lastKnownMemberTiles.keys()) {
        if (!this.party.includes(trackedMember)) {
          this.lastKnownMemberTiles.delete(trackedMember);
          this.lastClassifiedMemberRooms.delete(trackedMember);
        }
      }
    }

    for (let i = 0; i < this.party.length; i++) {
      const member = this.party[i];
      if (!member || !member.gridPos) continue;

      const tileKey = `${member.gridPos.x},${member.gridPos.y}`;
      const lastTile = this.lastKnownMemberTiles.get(member);
      if (!forceUpdate && tileKey === lastTile) continue;
      this.lastKnownMemberTiles.set(member, tileKey);

      const currentRoom = this.cachedRoomMap.get(tileKey) ?? null;
      const roomName = currentRoom?.name ?? null;
      const lastRoomName = this.lastClassifiedMemberRooms.get(member) ?? null;

      member.currentRoom = currentRoom;
      member.currentRoomName = roomName;

      if (roomName !== lastRoomName || forceUpdate) {
        this.lastClassifiedMemberRooms.set(member, roomName);

        // Update HUD room badge for active leader
        if (i === 0) {
          this.hud.setRoomName(roomName);
        }

        if (roomName && !forceUpdate) {
          const entityLabel = member.entityName || (i === 0 ? 'Player' : `Companion ${i}`);
          console.log(`[RoomClassification] ${entityLabel} entered: ${roomName} at (${tileKey})`);
          if (i === 0) {
            this.hud.showToast(`🏠 Entered ${roomName}`, 'info', 2500);
          } else {
            this.hud.showToast(`🏠 ${entityLabel} entered ${roomName}`, 'info', 2500);
          }
        }
      }
    }
  }

  public getRoomAt(x: number, y: number): ClassifiedRoom | null {
    return this.cachedRoomMap.get(`${x},${y}`) ?? null;
  }

  public getRoomForMember(member: Player): ClassifiedRoom | null {
    if (!member || !member.gridPos) return null;
    return this.cachedRoomMap.get(`${member.gridPos.x},${member.gridPos.y}`) ?? null;
  }

  private createFloatingText(x: number, y: number, textString: string, colorHex: string): void {
    const text = this.add.text(x, y, textString, {
      fontSize: '11px',
      color: colorHex,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(10020);

    this.tweens.add({
      targets: text,
      y: y - 20,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy()
    });
  }

  // --- SCENE TRANSITION & CAMERA ---

  private triggerPortalTransition(): void {
    if (this.isTransitioning) return;

    for (const member of this.party) {
      member.clearTarget();
    }

    const dx = Math.abs(this.player.gridPos.x - this.portalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.portalPos.y);

    if (Math.max(dx, dy) <= 1 && (dx > 0 || dy > 0)) {
      this.executeTransitionToDungeon();
      return;
    }

    console.log('[OutpostScene] Party moving to portal...');
    const claimed = new Set<string>();

    // Assign leader an open adjacent tile to the portal
    const leaderDest = this.findOpenAdjacentTile(this.portalPos, this.player.gridPos, claimed, this.player);
    claimed.add(`${leaderDest.x},${leaderDest.y}`);
    this.player.claimedDestination = { ...leaderDest };

    // Command all living companions to also move towards the portal
    for (let i = 1; i < this.party.length; i++) {
      const companion = this.party[i];
      if (companion.state === 'downed' || companion.state === 'dead') continue;
      const compDest = this.findOpenAdjacentTile(this.portalPos, companion.gridPos, claimed, companion);
      claimed.add(`${compDest.x},${compDest.y}`);
      companion.claimedDestination = { ...compDest };

      const compDynamicObs = this.getDynamicObstacles(companion);
      this.pathfinder.findPath(companion.gridPos, compDest, compDynamicObs).then((path) => {
        if (path.length > 0) {
          companion.followPath(path);
        } else {
          companion.claimedDestination = null;
        }
      });
    }

    // Leader movement with transition on arrival (Leader-Arrival Rule)
    const dynamicObs = this.getDynamicObstacles(this.player);
    this.pathfinder.findPath(this.player.gridPos, leaderDest, dynamicObs).then((path) => {
      if (path.length > 0) {
        this.player.followPath(path, () => {
          this.executeTransitionToDungeon();
        });
      } else {
        this.executeTransitionToDungeon();
      }
    });
  }

  private executeTransitionToDungeon(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[OutpostScene] Entering Dungeon Portal -> Transitioning to MainScene (Fresh Descent)');
    // Milestone 40: Boss and descent floor counter resets to 0 at the start of every new descent
    GameState.getInstance().resetDungeonFloorCount();
    GameState.getInstance().savePartySnapshot(this.party, this.time.now);
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);
    this.scene.start('MainScene');
  }

  public update(time: number, delta: number): void {
    // Camera Controls (WASD & Space lock-on)
    if (this.wasdKeys) {
      const panSpeed = 8;
      let panned = false;
      if (this.wasdKeys.W.isDown) { this.cameras.main.scrollY -= panSpeed; panned = true; }
      if (this.wasdKeys.S.isDown) { this.cameras.main.scrollY += panSpeed; panned = true; }
      if (this.wasdKeys.A.isDown) { this.cameras.main.scrollX -= panSpeed; panned = true; }
      if (this.wasdKeys.D.isDown) { this.cameras.main.scrollX += panSpeed; panned = true; }

      // Note: Reaching into Phaser's private `_follow` property via (this.cameras.main as any)._follow
      // is an unstable internal API fallback. It is kept as a defensive belt-and-suspenders guard in case
      // isCameraLocked ever gets desynchronized, but may need maintenance if Phaser changes internal follow properties.
      const hasFollowTarget = !!(this.cameras.main as any)._follow;
      if (panned && (this.isCameraLocked || hasFollowTarget)) {
        this.isCameraLocked = false;
        this.cameras.main.stopFollow();
      }

      if (Phaser.Input.Keyboard.JustDown(this.wasdKeys.SPACE)) {
        this.isCameraLocked = true;
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      }
    }

    GameState.getInstance().updateClock(delta);
    this.updateAllGardeningVisuals();
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
    this.updateMoveDestinationHighlights();

    // Milestone 31: Update Active Revive Channels in OutpostScene
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
      channel.barContainer.setPosition(character.x, character.y - 28);
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

    this.updatePlayerRoomLookup(false);
    this.hud.update(this.player, this.progressionSystem, time, this.party);
  }

  // =========================================================================
  // Milestone 31: Item-Based Revive Channel Methods (OutpostScene)
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
    if (downedAlly.state !== 'downed') return false;

    const gameState = GameState.getInstance();
    if (gameState.getItemCount('revive_potion') < 1) {
      this.createFloatingText(downedAlly.x, downedAlly.y - 12, 'NEED REVIVE POTION!', '#f59e0b');
      this.hud?.showToast('⚠️ Requires a Revive Potion! Craft one at the Alchemy Station.', 'warn', 2500);
      return false;
    }

    const livingParty = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead' && m !== downedAlly);
    if (livingParty.length === 0) {
      this.hud?.showToast('⚠️ No conscious party members available to revive!', 'error', 2500);
      return false;
    }
    livingParty.sort((a, b) => Math.hypot(a.gridPos.x - downedAlly.gridPos.x, a.gridPos.y - downedAlly.gridPos.y) - Math.hypot(b.gridPos.x - downedAlly.gridPos.x, b.gridPos.y - downedAlly.gridPos.y));
    const reviver = livingParty[0];

    const dist = Math.hypot(reviver.gridPos.x - downedAlly.gridPos.x, reviver.gridPos.y - downedAlly.gridPos.y);
    if (dist <= 1.5) {
      return this.startReviveChannel(reviver, downedAlly);
    }

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
    ].filter(t => t.x >= 0 && t.x < this.mapWidth && t.y >= 0 && t.y < this.mapHeight && !claimed.has(`${t.x},${t.y}`));

    adjTiles.sort((a, b) => Math.hypot(a.x - reviver.gridPos.x, a.y - reviver.gridPos.y) - Math.hypot(b.x - reviver.gridPos.x, b.y - reviver.gridPos.y));
    const targetTile = adjTiles[0];

    if (targetTile) {
      this.cancelReviveChannel(reviver);
      reviver.clearTarget();
      claimed.add(`${targetTile.x},${targetTile.y}`);
      reviver.claimedDestination = { ...targetTile };

      const dynamicObs = this.getDynamicObstacles(reviver);
      this.pathfinder.findPath(reviver.gridPos, targetTile, dynamicObs).then((path) => {
        if (path.length > 0) {
          reviver.followPath(path, () => {
            if (downedAlly.state === 'downed' && Math.hypot(reviver.gridPos.x - downedAlly.gridPos.x, reviver.gridPos.y - downedAlly.gridPos.y) <= 1.5) {
              this.startReviveChannel(reviver, downedAlly);
            }
          });
        } else {
          reviver.claimedDestination = null;
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

    character.state = 'channeling';
    character.claimedDestination = null;
    character.clearTarget();
    character.stopMovement();

    const durationMs = 3000;
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

    if (channel.targetAlly.state !== 'downed') {
      console.warn(`[Revive] Target ally ${channel.targetAlly.entityName} is no longer downed. Aborting completion.`);
      return;
    }

    const gameState = GameState.getInstance();
    if (gameState.getItemCount('revive_potion') < 1) {
      this.hud?.showToast('⚠️ Revive failed: No Revive Potion in inventory!', 'error');
      return;
    }

    gameState.consumeItem('revive_potion', 1);
    channel.targetAlly.revive(character);

    if (character.progression) {
      character.progression.addProficiencyExp('healing_magic', 5);
    }

    this.createFloatingText(channel.targetAlly.x, channel.targetAlly.y - 12, 'REVIVED!', '#facc15');
    this.createFloatingText(character.x, character.y - 15, '+5 Healing Magic EXP', '#4ade80');
    this.hud?.showToast(`✨ ${character.entityName} revived ${channel.targetAlly.entityName}! (+5 Healing Magic EXP)`, 'success', 2500);
    this.hud?.update(this.player, this.progressionSystem, this.time.now, this.party);
  }

  public interruptReviveChannel(participant: Player): boolean {
    const channel = this.findReviveChannelByParticipant(participant);
    if (!channel) return false;

    console.log(`%c[Revive Interrupt] 💥 Revive channel on ${channel.targetAlly.entityName} was INTERRUPTED!`, 'color: #ef4444; font-weight: bold;');
    channel.barContainer.destroy();
    this.activeReviveChannels.delete(channel.character);

    if (channel.character.state === 'channeling') {
      channel.character.state = 'idle';
    }

    this.createFloatingText(channel.character.x, channel.character.y - 20, 'INTERRUPTED!', '#ef4444');
    this.hud?.showToast('⚠️ Revive interrupted!', 'warn', 2500);
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

  // --- MOVE DESTINATION HIGHLIGHTS ---

  public showMoveDestinationHighlights(destinations: GridPos[], units?: Player[]): void {
    this.lastMoveDestinationHighlights = destinations.map(d => ({ x: d.x, y: d.y }));
    this.clearMoveHighlightTimers();

    this.activeMoveHighlights = destinations.map((d, i) => ({
      dest: { x: d.x, y: d.y },
      unit: units ? units[i] : (this.party[i] ?? undefined),
      isLeader: i === 0
    }));

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
}
