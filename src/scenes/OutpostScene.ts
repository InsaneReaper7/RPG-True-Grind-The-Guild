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

  // Cursor Hover Reticle & Ghost Preview
  private hoverHighlightSprite!: Phaser.GameObjects.Sprite;
  private hoverGhostSprite!: Phaser.GameObjects.Sprite;
  private hoverReasonText!: Phaser.GameObjects.Text;
  private lastLoggedHoverKey: string = '';

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
      const claimedSpawn = new Set<string>();
      for (let i = 0; i < partySnapshots.length; i++) {
        const snap = partySnapshots[i];
        const snapWeapon = dataLoader.getWeapon(snap.equippedWeaponId) || startingWeapon;
        const memberProg = (i === 0) ? this.progressionSystem : new ProgressionSystem(classesData, snap.name || `Companion ${i}`);
        if (i > 0) {
          this.bindProgressionEvents(memberProg, snap.name || `Companion ${i}`);
        }
        const snapAvatar = snap.avatarTextureKey || (i === 0 ? 'player-avatar' : 'companion-avatar');
        const spawnTile = this.findOpenAdjacentTile(this.portalPos, undefined, claimedSpawn);
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

    // 9. Input Controls: WASD, Space, B (Build Mode), R (Rotate)
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };

      const bKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
      bKey.on('down', () => {
        this.toggleBuildMode();
      });

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
      // Downed state blocks Normal Mode actions
      if (this.player.state === 'downed') {
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

        const isTileBlockedForMove = (tx: number, ty: number, forEntity: Entity): boolean => {
          if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return true;
          if (this.gridMatrix[ty]?.[tx] !== 0) return true;
          if (claimed.has(`${tx},${ty}`)) return true;
          if (this.party.some(m => m !== forEntity && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return true;
          return false;
        };

        // Leader movement
        let leaderDest: GridPos = { x: clickedTileX, y: clickedTileY };
        if (isTileBlockedForMove(clickedTileX, clickedTileY, this.player)) {
          leaderDest = this.findNearestOpenTileForPartyMove({ x: clickedTileX, y: clickedTileY }, this.player.gridPos, claimed, this.player);
        }
        claimed.add(`${leaderDest.x},${leaderDest.y}`);
        this.player.claimedDestination = { ...leaderDest };

        const dynamicObs = this.getDynamicObstacles(this.player).filter(
          obs => !this.party.some(m => m.gridPos.x === obs.x && m.gridPos.y === obs.y)
        );
        this.pathfinder.findPath(this.player.gridPos, leaderDest, dynamicObs).then((path) => {
          if (path.length > 0) {
            this.player.followPath(path);
          } else {
            this.player.claimedDestination = null;
          }
        });

        // 2x2 Box Formation for Companions:
        // Slot 0 (Leader): (0, 0)
        // Slot 1 (Front-Right): (1, 0)
        // Slot 2 (Back-Left): (0, 1)
        // Slot 3 (Back-Right): (1, 1)
        const formationOffsets = [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 }
        ];

        for (let i = 1; i < this.party.length; i++) {
          const companion = this.party[i];
          if (companion.state === 'downed' || companion.state === 'dead') continue;

          const offset = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
          const idealPos: GridPos = { x: leaderDest.x + offset.x, y: leaderDest.y + offset.y };
          const compDest = this.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
          claimed.add(`${compDest.x},${compDest.y}`);
          companion.claimedDestination = { ...compDest };

          const compDynamicObs = this.getDynamicObstacles(companion).filter(
            obs => !this.party.some(m => m.gridPos.x === obs.x && m.gridPos.y === obs.y)
          );
          this.pathfinder.findPath(companion.gridPos, compDest, compDynamicObs).then((path) => {
            if (path.length > 0) {
              companion.followPath(path);
            } else {
              companion.claimedDestination = null;
            }
          });
        }
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

    // Find adjacent walkable unoccupied tile near leader
    const spawnTile = this.findOpenAdjacentTile(this.player.gridPos);
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
      constLevel
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
      constLevel
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

    // Deduct wood using effective cost
    const success = GameState.getInstance().consumeWood(effectiveCost);
    if (!success) {
      console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Not enough wood`);
      this.hud.showToast(`Not enough Wood! Requires ${effectiveCost} Wood.`, 'error');
      return;
    }

    console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: PLACED ${blueprint.name} (-${effectiveCost} Wood)`);

    // Save to GameState with costPaid
    const placedItem: PlacedBuildable = {
      id: blueprint.id,
      x,
      y,
      rotation: blueprint.rotatable ? this.currentRotation : 0,
      costPaid: effectiveCost
    };
    GameState.getInstance().addPlacedBuildable(placedItem);

    // Award +1 Construction EXP
    this.progressionSystem.addProficiencyExp('construction', 1);
    this.createFloatingText(x * this.tileSize + this.tileSize / 2, y * this.tileSize, '+1 Construction Exp', '#f59e0b');

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
    const roomSuffix = currentRoom ? ` in ${currentRoom.name}` : '';

    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId,
      this.progressionSystem.getProficiencyLevel('construction')
    );
    this.hud.showToast(`Placed ${blueprint.name} (-${effectiveCost} Wood)${roomSuffix}. +1 Construction Exp`, 'success');
  }

  private demolishAt(x: number, y: number): void {
    const placed = this.getPlacedBuildableAt(x, y);
    if (!placed) {
      console.log(`[BuildMode:Demolish] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Cannot demolish (no player-built structure)`);
      this.hud.showToast('Cannot demolish: Only player-built structures can be removed.', 'warn');
      return;
    }

    const dataLoader = DataLoader.getInstance();
    const def = dataLoader.getBuildable(placed.id);
    const constLevel = this.progressionSystem.getProficiencyLevel('construction');
    const costPaid = placed.costPaid ?? (def?.woodCost || 0);
    const refund = BuildingSystem.getEffectiveDemolishRefund(costPaid, constLevel);

    // Remove from GameState and refund wood
    GameState.getInstance().removePlacedBuildable(x, y);
    GameState.getInstance().addWood(refund);

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

  private isPlacedBed(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'bed';
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

    console.log('[OutpostScene] Entering Dungeon Portal -> Transitioning to MainScene');
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

      if (panned && this.isCameraLocked) {
        this.isCameraLocked = false;
        this.cameras.main.stopFollow();
      }

      if (Phaser.Input.Keyboard.JustDown(this.wasdKeys.SPACE)) {
        this.isCameraLocked = true;
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      }
    }

    GameState.getInstance().updateClock(delta);
    for (const member of this.party) {
      member.update(time, delta);
    }
    this.updatePlayerRoomLookup(false);
    this.hud.update(this.player, this.progressionSystem, time, this.party);
  }
}
