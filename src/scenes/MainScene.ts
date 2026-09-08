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
import { GridPos, EnemyDef } from '../types/game';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem';
import { TileClaimDebugOverlay } from '../ui/TileClaimDebugOverlay';

export interface ForagingBush {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  isHarvested: boolean;
  respawnTimer?: Phaser.Time.TimerEvent;
}

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
  private tileClaimOverlay!: TileClaimDebugOverlay;

  private portalSprite!: Phaser.GameObjects.Sprite;
  private portalPos: GridPos = { x: 2, y: 2 };
  private isTransitioning: boolean = false;
  private foragingBushes: ForagingBush[] = [];

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
    const goblinData = dataLoader.getEnemy('goblin');
    const skeletonData = dataLoader.getEnemy('skeleton');
    const undeadData = dataLoader.getEnemy('undead');
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

    // Progression & Skill Discovery Notifications
    this.bindProgressionEvents(this.progressionSystem);

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

    this.spawnEnemyUnit(wolfData, 14, 14, 'wolf-avatar');
    if (goblinData) this.spawnEnemyUnit(goblinData, 14, 5, 'goblin-avatar');
    if (skeletonData) this.spawnEnemyUnit(skeletonData, 5, 14, 'skeleton-avatar');
    if (undeadData) this.spawnEnemyUnit(undeadData, 15, 10, 'undead-avatar');

    // 5b. Spawn Dungeon Foraging Nodes (Milestone 10)
    this.foragingBushes = [];
    this.spawnForagingBush(4, 8);
    this.spawnForagingBush(11, 4);
    this.spawnForagingBush(8, 15);

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

    // 8. Initialize Tile-Claim Debug Overlay (Key [V] to toggle)
    this.tileClaimOverlay = new TileClaimDebugOverlay(this, this.party, this.enemies, this.tileSize);
    (window as any).__tileClaimOverlay = this.tileClaimOverlay;
    (window as any).__toggleTileClaimOverlay = () => this.tileClaimOverlay.toggle();

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
    console.log('[Debug Tools] Hotkeys: [X] +25 Wpn Exp, [Z] +100 Wpn Exp, [C] +25 Const Exp, [P] +680 Wpn Exp (Lv10 Fencer), [T] Respawn Enemies. Console: __grantExp(id, amt, [idx]), __grantHiddenExp(id, amt, [idx]), __setLevel(id, lv, [idx]), __spawnTestCompanion(), __reviveParty([idx]), __spawnEnemy(id, x, y), __spawnSwarmAround(idx).');

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

      // Check if clicking a foraging bush node (Milestone 10)
      const clickedBush = this.foragingBushes.find((b) => {
        const isGridMatch = b.x === clickedTileX && b.y === clickedTileY;
        const dx = Math.abs(b.sprite.x - worldPoint.x);
        const dy = Math.abs(b.sprite.y - worldPoint.y);
        const isPosMatch = dx <= this.tileSize / 2 + 4 && dy <= this.tileSize / 2 + 4;
        return isGridMatch || isPosMatch;
      });

      if (clickedBush) {
        this.interactWithBush(clickedBush);
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
    this.party.push(companion);
    GameState.getInstance().addCompanionToParty(companion, this.time.now);
    this.combatSystem.party = this.party;
    this.hud.showToast(`👥 ${companionName} joined the party!`, 'success', 3000);
    console.log(`[MainScene] Spawned companion ${companionName} at (${spawnX}, ${spawnY}) with ${daggerWeapon.name}`);
    return true;
  }

  private bindProgressionEvents(prog: ProgressionSystem, memberName?: string): void {
    prog.onClassUnlocked((event) => {
      console.log(`%c[UNLOCK] ${event.classDef.name} Class Unlocked${memberName ? ' for ' + memberName : ''}!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef);
    });

    prog.onSkillDiscovered((event) => {
      const skillDef = DataLoader.getInstance().getTrainableStatDef(event.skillId);
      if (skillDef) {
        console.log(`%c[DISCOVERY] ${skillDef.name} Skill Discovered${memberName ? ' by ' + memberName : ''}!`, 'color: #34d399; font-weight: bold; font-size: 14px;');
        this.hud.showSkillDiscoveredModal(skillDef);
      }
    });
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

    const livingMembers = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');

    // Pass 0: Purge any stale targets and lingering destinations across all party members
    for (const member of livingMembers) {
      if (member.targetEntity !== enemy) {
        member.clearTarget();
      }
    }

    // Explicit 1-to-1 mapping of tile key "x,y" to owning player
    const tileOwner = new Map<string, Player>();
    const memberDest = new Map<Player, GridPos>();
    const claimedKeys = new Set<string>();

    // First pass: Strictly evaluate members that can CURRENTLY land an attack from their exact current tile
    for (const member of livingMembers) {
      member.setTarget(enemy);
      const dx = Math.abs(member.gridPos.x - enemy.gridPos.x);
      const dy = Math.abs(member.gridPos.y - enemy.gridPos.y);
      const currentDist = Math.max(dx, dy);

      // Can this member attack from their current tile right now?
      const canAttackNow = currentDist <= member.attackRangeTiles && currentDist > 0;
      const key = `${member.gridPos.x},${member.gridPos.y}`;

      if (canAttackNow && !claimedKeys.has(key)) {
        claimedKeys.add(key);
        tileOwner.set(key, member);
        memberDest.set(member, { ...member.gridPos });
        member.claimedDestination = null;
        if (member.isMoving()) {
          member.stopMovement();
        }
      }
    }

    // Second pass: Assign distinct reachable tiles within attackRangeTiles to all unassigned members
    // Sort unassigned members by distance to enemy so closer members claim closer attack slots
    const unassigned = livingMembers.filter(m => !memberDest.has(m));
    unassigned.sort((a, b) => {
      const distA = Math.hypot(a.gridPos.x - enemy.gridPos.x, a.gridPos.y - enemy.gridPos.y);
      const distB = Math.hypot(b.gridPos.x - enemy.gridPos.x, b.gridPos.y - enemy.gridPos.y);
      return distA - distB;
    });

    for (const member of unassigned) {
      const targetTile = this.findOpenAttackTileForMember(enemy, member, claimedKeys);
      if (targetTile) {
        const key = `${targetTile.x},${targetTile.y}`;
        claimedKeys.add(key);
        tileOwner.set(key, member);
        memberDest.set(member, targetTile);
      }
    }

    // Third pass: Execute movement for members that need to travel to attack range
    const now = this.time.now;
    for (const member of livingMembers) {
      const dest = memberDest.get(member);
      if (!dest) {
        member.claimedDestination = null;
        if (member.isMoving()) {
          member.stopMovement();
        }
        continue;
      }

      // Already on the tile
      if (member.gridPos.x === dest.x && member.gridPos.y === dest.y) {
        if (member.isMoving()) {
          member.stopMovement();
        }
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

      // Party members path towards their designated adjacent tile; avoid enemies and stationary companions
      const dynamicObstacles = this.getDynamicObstacles(member);

      this.pathfinder.findPath(member.gridPos, dest, dynamicObstacles).then((path) => {
        if (path.length > 0 && member.state !== 'downed' && member.state !== 'dead' && member.targetEntity === enemy) {
          member.followPath(path);
        } else {
          // No reachable path found to assigned tile: clean up destination claim
          member.claimedDestination = null;
          if (member.isMoving()) {
            member.stopMovement();
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
    // Standing Tile-Claim Debug Overlay update loop
    if (this.tileClaimOverlay) {
      this.tileClaimOverlay.update(time);
    }
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

  public spawnEnemyUnit(enemyData: EnemyDef, x: number, y: number, textureKey: string, customName?: string): Enemy {
    const enemy = new Enemy(this, x, y, enemyData, textureKey, this.tileSize);
    if (customName) enemy.entityName = customName;
    this.enemies.push(enemy);
    enemy.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.engageEnemy(enemy);
    });
    return enemy;
  }

  // --- FORAGING & DUNGEON GATHERING NODES (Milestone 10) ---

  public spawnForagingBush(x: number, y: number): ForagingBush {
    const posX = x * this.tileSize + this.tileSize / 2;
    const posY = y * this.tileSize + this.tileSize / 2;

    const sprite = this.add.sprite(posX, posY, 'foraging-bush')
      .setDepth(posY - 2)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(posX, posY - 16, 'Wild Herbs', {
      fontSize: '10px',
      color: '#34d399',
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(5000);

    const bush: ForagingBush = {
      x,
      y,
      sprite,
      label,
      isHarvested: false
    };

    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.interactWithBush(bush);
    });

    this.foragingBushes.push(bush);
    return bush;
  }

  public interactWithBush(bush: ForagingBush): void {
    if (bush.isHarvested) {
      this.hud.showToast('🌿 This bush has been stripped and is regrowing...', 'info', 2000);
      return;
    }

    if (this.player.state === 'downed' || this.player.state === 'dead') return;

    const dist = Math.hypot(this.player.gridPos.x - bush.x, this.player.gridPos.y - bush.y);

    if (dist <= 1.5) {
      // Adjacent: harvest immediately
      this.harvestBush(bush);
    } else {
      // Find open adjacent tile to bush and move there, then harvest
      const adjTiles = [
        { x: bush.x + 1, y: bush.y },
        { x: bush.x - 1, y: bush.y },
        { x: bush.x, y: bush.y + 1 },
        { x: bush.x, y: bush.y - 1 }
      ].filter(t => t.x > 0 && t.x < this.mapWidth - 1 && t.y > 0 && t.y < this.mapHeight - 1 && this.gridMatrix[t.y]?.[t.x] === 0);

      adjTiles.sort((a, b) => Math.hypot(a.x - this.player.gridPos.x, a.y - this.player.gridPos.y) - Math.hypot(b.x - this.player.gridPos.x, b.y - this.player.gridPos.y));

      const targetTile = adjTiles[0];
      if (targetTile) {
        for (const member of this.party) {
          member.clearTarget();
        }
        const dynamicObs = this.getDynamicObstacles(this.player).filter(
          obs => !this.party.some(m => m.gridPos.x === obs.x && m.gridPos.y === obs.y)
        );
        this.pathfinder.findPath(this.player.gridPos, targetTile, dynamicObs).then((path) => {
          if (path.length > 0) {
            this.player.followPath(path);
            const checkArrival = this.time.addEvent({
              delay: 150,
              repeat: 40,
              callback: () => {
                if (Math.hypot(this.player.gridPos.x - bush.x, this.player.gridPos.y - bush.y) <= 1.5) {
                  checkArrival.remove();
                  this.harvestBush(bush);
                } else if (this.player.state !== 'moving') {
                  checkArrival.remove();
                }
              }
            });
          }
        });
      }
    }
  }

  public harvestBush(bush: ForagingBush): void {
    if (bush.isHarvested) return;

    bush.isHarvested = true;
    bush.sprite.setTexture('foraging-bush-depleted');
    bush.label.setText('Stripped');
    bush.label.setColor('#9ca3af');

    const yieldCount = 1;
    const expGranted = 15;

    GameState.getInstance().addItem('wild_herbs', yieldCount);
    this.progressionSystem.addProficiencyExp('foraging', expGranted);

    // Floating combat/gathering text
    const posX = bush.x * this.tileSize + this.tileSize / 2;
    const posY = bush.y * this.tileSize + this.tileSize / 2;
    this.createFloatingText(posX, posY - 10, `+${yieldCount} Wild Herbs`, '#34d399');
    this.createFloatingText(posX, posY - 24, `+${expGranted} Foraging EXP`, '#60a5fa');

    // Bounce animation
    this.tweens.add({
      targets: bush.sprite,
      scaleY: 0.8,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeInOut'
    });

    console.log(`[Foraging] 🌿 Harvested ${yieldCount}x Wild Herbs! (+${expGranted} Foraging EXP)`);
    this.hud.showToast(`🌿 Harvested Wild Herbs (+${expGranted} Foraging EXP)`, 'success', 2500);

    // Independent timer per bush instance (15 seconds)
    bush.respawnTimer = this.time.delayedCall(15000, () => {
      bush.isHarvested = false;
      bush.sprite.setTexture('foraging-bush');
      bush.label.setText('Wild Herbs');
      bush.label.setColor('#34d399');

      this.tweens.add({
        targets: bush.sprite,
        scale: 1.15,
        duration: 200,
        yoyo: true,
        ease: 'Back.easeOut'
      });
      console.log(`[Foraging] 🌿 Wild Herbs regrew at (${bush.x}, ${bush.y})!`);
    });
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
