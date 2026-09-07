import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Entity } from '../entities/Entity';
import { CombatSystem } from '../systems/CombatSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { GridPos } from '../types/game';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem';

export class MainScene extends Phaser.Scene {
  private mapWidth: number = 20;
  private mapHeight: number = 20;
  private tileSize: number = 32;

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

  private portalSprite!: Phaser.GameObjects.Sprite;
  private portalPos: GridPos = { x: 2, y: 2 };
  private isTransitioning: boolean = false;

  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private rKey!: Phaser.Input.Keyboard.Key;
  private kKey!: Phaser.Input.Keyboard.Key;
  private xKey!: Phaser.Input.Keyboard.Key;
  private zKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;
  private tKey!: Phaser.Input.Keyboard.Key;
  private hKey!: Phaser.Input.Keyboard.Key;

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

    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId);
    const wolfData = dataLoader.getEnemy('wolf');
    const classesData = dataLoader.getClassesData();

    if (!startingWeapon) {
      throw new Error(`Starting weapon '${playerData.startingWeaponId}' not found in data/weapons.json`);
    }
    if (!wolfData) {
      throw new Error(`Wolf enemy data not found in data/enemies.json`);
    }

    // 1. Build 20x20 Grid Matrix (0 = Walkable, 1 = Obstacle)
    this.gridMatrix = [];
    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        // Border walls & center rock cluster
        if (
          x === 0 ||
          x === this.mapWidth - 1 ||
          y === 0 ||
          y === this.mapHeight - 1 ||
          (x >= 8 && x <= 10 && y >= 8 && y <= 9)
        ) {
          row.push(1);
        } else {
          row.push(0);
        }
      }
      this.gridMatrix.push(row);
    }

    // 2. Tilemap Creation using Phaser Tilemap API
    this.tilemap = this.make.tilemap({
      data: this.gridMatrix,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tilesetWalkable = this.tilemap.addTilesetImage('tile-walkable', 'tile-walkable');
    const tilesetObstacle = this.tilemap.addTilesetImage('tile-obstacle', 'tile-obstacle');

    if (tilesetWalkable && tilesetObstacle) {
      this.tilemap.createLayer(0, [tilesetWalkable, tilesetObstacle], 0, 0);
    }

    // 3. Initialize Pathfinder
    this.pathfinder = new Pathfinder(this.gridMatrix);

    // 4. Initialize Systems & HUD
    this.progressionSystem = new ProgressionSystem(classesData);
    this.hud = new HUD();
    this.hud.setLocation('Dungeon Floor 1', false);
    GameState.getInstance().setSafeZone(false);

    // Progression Unlock Notification
    this.progressionSystem.onClassUnlocked((event) => {
      console.log(`%c[UNLOCK] ${event.classDef.name} Class Unlocked!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef);
    });

    // Hidden Skill Discovery Notification
    this.progressionSystem.onSkillDiscovered((event) => {
      const skillDef = DataLoader.getInstance().getHiddenSkill(event.skillId);
      if (skillDef) {
        console.log(`%c[DISCOVERY] ${skillDef.name} Skill Discovered!`, 'color: #34d399; font-weight: bold; font-size: 14px;');
        this.hud.showSkillDiscoveredModal(skillDef);
      }
    });

    // 5. Spawn Party (Hero & Companions)
    const partySnapshots = GameState.getInstance().getPartySnapshots();
    this.party = [];

    if (partySnapshots.length === 0) {
      const hero = new Player(this, 3, 3, playerData, startingWeapon, this.tileSize, 'player-avatar', this.progressionSystem);
      hero.id = 'hero';
      hero.entityName = playerData.name || 'Hero';
      this.party.push(hero);
      GameState.getInstance().restoreTo(hero, this.progressionSystem, this.time.now);
    } else {
      const claimedSpawn = new Set<string>();
      for (let i = 0; i < partySnapshots.length; i++) {
        const snap = partySnapshots[i];
        const snapWeapon = dataLoader.getWeapon(snap.equippedWeaponId) || startingWeapon;
        const memberProg = (i === 0) ? this.progressionSystem : new ProgressionSystem(classesData);
        const snapAvatar = snap.avatarTextureKey || (i === 0 ? 'player-avatar' : 'companion-avatar');
        const spawnTile = this.findOpenAdjacentTile(this.portalPos, undefined, claimedSpawn);
        claimedSpawn.add(`${spawnTile.x},${spawnTile.y}`);

        const member = new Player(this, spawnTile.x, spawnTile.y, playerData, snapWeapon, this.tileSize, snapAvatar, memberProg);
        member.restoreFromSnapshot(snap, this.time.now);
        this.party.push(member);
      }
    }

    // Spawn Portal to Outpost at (2, 2)
    this.portalSprite = this.add.sprite(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize + this.tileSize / 2,
      'portal-to-outpost'
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
      'Portal to Outpost',
      {
        fontSize: '11px',
        color: '#d8b4fe',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { x: 4, y: 2 }
      }
    ).setOrigin(0.5).setDepth(5000);

    this.portalSprite.on('pointerdown', () => {
      this.triggerPortalTransition();
    });

    const wolf = new Enemy(this, 14, 14, wolfData, 'wolf-avatar', this.tileSize);
    this.enemies.push(wolf);

    // Direct pointer click on Enemy sprite triggers engagement
    wolf.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.engageEnemy(wolf);
    });

    // Spawn second test enemy (Wolf 2) at (14, 6)
    const wolf2 = new Enemy(this, 14, 6, wolfData, 'wolf-avatar', this.tileSize);
    wolf2.entityName = 'Wolf 2';
    this.enemies.push(wolf2);

    wolf2.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.engageEnemy(wolf2);
    });

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
        this.targetReticle.setVisible(false);
        console.log(`[Combat] ${deadEnemy.entityName} defeated. Automatic respawn scheduled in 3 seconds.`);
        this.time.delayedCall(3000, () => {
          deadEnemy.respawn();
        });
      }
    );

    // 7. Setup Camera Controls
    this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Input Controls: WASD, Space, R, K, X, Z, C, P, T
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };
      this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.kKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
      this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
      this.hKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
      this.hKey.on('down', () => {
        this.hud.applyBandage();
      });
    }

    // Expose debug helpers on window for browser console testing
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
          this.party[memberIndex].revive();
          console.log(`[Debug] Revived ${this.party[memberIndex].entityName}`);
        }
      } else {
        for (const member of this.party) {
          if (member.state === 'downed') {
            member.revive();
            console.log(`[Debug] Revived ${member.entityName}`);
          }
        }
      }
    };
    (window as any).__respawnEnemies = () => {
      for (const e of this.enemies) {
        e.respawn();
      }
      console.log('[Debug] All test enemies respawned and reset to spawn positions.');
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
    console.log('[Debug Tools] Hotkeys: [X] +25 Wpn Exp, [Z] +100 Wpn Exp, [C] +25 Const Exp, [P] +680 Wpn Exp (Lv10 Fencer), [T] Respawn Enemies. Console: __grantExp(id, amt, [idx]), __grantHiddenExp(id, amt, [idx]), __setLevel(id, lv, [idx]), __spawnTestCompanion(), __reviveParty([idx]).');

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

    // Pointer Click Interactions (Click-to-Move / Click-to-Engage / Portal)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isTransitioning) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clickedTileX = Math.floor(worldPoint.x / this.tileSize);
      const clickedTileY = Math.floor(worldPoint.y / this.tileSize);

      // Check if portal clicked
      if (clickedTileX === this.portalPos.x && clickedTileY === this.portalPos.y) {
        this.triggerPortalTransition();
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
        this.engageEnemy(clickedEnemy);
      } else if (this.gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        // Click-to-Move to empty walkable tile
        console.log(`[Input] Clicked Tile: (${clickedTileX}, ${clickedTileY})`);
        for (const member of this.party) {
          member.clearTarget();
        }
        this.targetReticle.setVisible(false);

        const claimed = new Set<string>();

        const isTileBlockedForMove = (tx: number, ty: number, forEntity: Entity): boolean => {
          if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return true;
          if (this.gridMatrix[ty]?.[tx] !== 0) return true;
          if (claimed.has(`${tx},${ty}`)) return true;
          if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return true;
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

        if (this.player.state !== 'downed') {
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
        }

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

    const companionProgression = new ProgressionSystem(dataLoader.getClassesData());
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
    this.party.push(companion);
    GameState.getInstance().addCompanionToParty(companion, this.time.now);
    this.combatSystem.party = this.party;
    this.hud.showToast(`👥 ${companionName} joined the party!`, 'success', 3000);
    console.log(`[MainScene] Spawned companion ${companionName} at (${spawnX}, ${spawnY}) with ${daggerWeapon.name}`);
    return true;
  }

  private triggerPortalTransition(): void {
    if (this.isTransitioning) return;

    for (const member of this.party) {
      member.clearTarget();
    }
    this.targetReticle.setVisible(false);

    const dx = Math.abs(this.player.gridPos.x - this.portalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.portalPos.y);

    if (Math.max(dx, dy) <= 1 && (dx > 0 || dy > 0)) {
      // Already adjacent
      this.executeTransitionToOutpost();
      return;
    }

    console.log('[MainScene] Party moving to Outpost Portal...');
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
          this.executeTransitionToOutpost();
        });
      } else {
        this.executeTransitionToOutpost();
      }
    });
  }

  private executeTransitionToOutpost(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[MainScene] Entering Outpost Portal -> Transitioning to OutpostScene');
    // Save live party snapshot and legacy player snapshot
    GameState.getInstance().savePartySnapshot(this.party, this.time.now);
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);

    // Switch active scene to OutpostScene
    this.scene.start('OutpostScene');
  }

  private engageEnemy(enemy: Enemy): void {
    if (enemy.state === 'dead' || enemy.state === 'downed') return;

    console.log(`[Input] Engaged Enemy: ${enemy.entityName} at (${enemy.gridPos.x}, ${enemy.gridPos.y})`);
    
    // Explicit 1-to-1 mapping of tile key "x,y" to owning player
    const tileOwner = new Map<string, Player>();
    const memberDest = new Map<Player, GridPos>();

    const livingMembers = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');

    // First pass: Members already adjacent or already en route to an exclusive adjacent tile
    for (const member of livingMembers) {
      member.setTarget(enemy);
      const dx = Math.abs(member.gridPos.x - enemy.gridPos.x);
      const dy = Math.abs(member.gridPos.y - enemy.gridPos.y);

      // If already adjacent to the enemy
      if (Math.max(dx, dy) <= 1 && (dx > 0 || dy > 0)) {
        const key = `${member.gridPos.x},${member.gridPos.y}`;
        if (!tileOwner.has(key)) {
          tileOwner.set(key, member);
          memberDest.set(member, { ...member.gridPos });
          member.claimedDestination = null;
          continue;
        }
      }

      // If already traveling to a valid adjacent tile
      if (member.claimedDestination) {
        const cdx = Math.abs(member.claimedDestination.x - enemy.gridPos.x);
        const cdy = Math.abs(member.claimedDestination.y - enemy.gridPos.y);
        const claimKey = `${member.claimedDestination.x},${member.claimedDestination.y}`;
        if (Math.max(cdx, cdy) <= 1 && (cdx > 0 || cdy > 0) && !tileOwner.has(claimKey)) {
          tileOwner.set(claimKey, member);
          memberDest.set(member, { ...member.claimedDestination });
          continue;
        }
      }
    }

    // Second pass: Assign distinct surrounding adjacent tiles to all unassigned members
    const claimedKeys = new Set<string>(tileOwner.keys());
    for (const member of livingMembers) {
      if (memberDest.has(member)) continue;

      const targetTile = this.findOpenAdjacentTile(enemy.gridPos, member.gridPos, claimedKeys, member);
      const key = `${targetTile.x},${targetTile.y}`;
      claimedKeys.add(key);
      tileOwner.set(key, member);
      memberDest.set(member, targetTile);
    }

    // Third pass: Execute movement for members that need to travel
    const now = this.time.now;
    for (const member of livingMembers) {
      const dest = memberDest.get(member);
      if (!dest) continue;

      // Already on the tile
      if (member.gridPos.x === dest.x && member.gridPos.y === dest.y && !member.isMoving()) {
        member.claimedDestination = null;
        continue;
      }

      // If already moving toward this exact tile, keep current path
      if (member.isMoving() && member.claimedDestination && member.claimedDestination.x === dest.x && member.claimedDestination.y === dest.y) {
        continue;
      }

      member.claimedDestination = { ...dest };
      member.lastCombatRepathTimeMs = now; // Lock against immediate repath in CombatSystem
      member.state = 'moving';

      // Party members path towards their designated adjacent tile; enemies are avoided
      const enemyObstacles = this.enemies
        .filter(e => e !== enemy && e.state !== 'dead' && e.state !== 'downed')
        .map(e => e.gridPos);

      this.pathfinder.findPath(member.gridPos, dest, enemyObstacles).then((path) => {
        if (path.length > 0 && member.state !== 'downed' && member.state !== 'dead' && member.targetEntity === enemy) {
          member.followPath(path);
        } else {
          if (!member.isMoving()) {
            member.claimedDestination = null;
          }
        }
      });
    }

    this.targetReticle.setPosition(
      enemy.gridPos.x * this.tileSize + this.tileSize / 2,
      enemy.gridPos.y * this.tileSize + this.tileSize / 2
    );
    this.targetReticle.setVisible(true);
  }

  public update(time: number, delta: number): void {
    // Debug Revive key listener [R]
    if (this.rKey && Phaser.Input.Keyboard.JustDown(this.rKey)) {
      for (const member of this.party) {
        if (member.state === 'downed') {
          member.revive();
        }
      }
    }

    // Debug Damage key listener [K]
    if (this.kKey && Phaser.Input.Keyboard.JustDown(this.kKey)) {
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
        console.log(`[Debug K Key] Dealing 5 damage to ${targetEnemy.entityName} from distance!`);
        const wasDowned = targetEnemy.takeDamage(5);
        if (wasDowned) {
          console.log(`[Debug K Key] ${targetEnemy.entityName} was downed by debug hit!`);
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

    // Debug Grant +680 Weapon EXP [P] (Exact boundary test for Level 10 / Fencer unlock)
    if (this.pKey && Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 680);
    }

    // Debug Respawn / Reset all test enemies [T]
    if (this.tKey && Phaser.Input.Keyboard.JustDown(this.tKey)) {
      for (const enemy of this.enemies) {
        enemy.respawn();
      }
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

      if (panned && this.isCameraLocked) {
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

    // Update Entities
    for (const member of this.party) {
      member.update(time, delta);
    }
    for (const enemy of this.enemies) {
      enemy.update(time, delta);
    }

    // Update Combat System
    this.combatSystem.update(time, delta);

    // Update HUD Overlay
    this.hud.update(this.player, this.progressionSystem, time, this.party);
  }
}
