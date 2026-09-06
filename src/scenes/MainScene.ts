import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { CombatSystem } from '../systems/CombatSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { GridPos } from '../types/game';

export class MainScene extends Phaser.Scene {
  private mapWidth: number = 20;
  private mapHeight: number = 20;
  private tileSize: number = 32;

  private tilemap!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  private player!: Player;
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
    const gridMatrix: number[][] = [];
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
      gridMatrix.push(row);
    }

    // 2. Tilemap Creation using Phaser Tilemap API
    this.tilemap = this.make.tilemap({
      data: gridMatrix,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tilesetWalkable = this.tilemap.addTilesetImage('tile-walkable', 'tile-walkable');
    const tilesetObstacle = this.tilemap.addTilesetImage('tile-obstacle', 'tile-obstacle');

    if (tilesetWalkable && tilesetObstacle) {
      this.tilemap.createLayer(0, [tilesetWalkable, tilesetObstacle], 0, 0);
    }

    // 3. Initialize Pathfinder
    this.pathfinder = new Pathfinder(gridMatrix);

    // 4. Initialize Systems & HUD
    this.progressionSystem = new ProgressionSystem(classesData);
    this.hud = new HUD();
    this.hud.setLocation('Dungeon Floor 1', false);

    // Progression Unlock Notification
    this.progressionSystem.onClassUnlocked((event) => {
      console.log(`%c[UNLOCK] ${event.classDef.name} Class Unlocked!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef);
    });

    // 5. Spawn Player & Enemy (Wolf)
    this.player = new Player(this, 3, 3, playerData, startingWeapon, this.tileSize);

    // Restore state from snapshot (HP, Energy, Cooldowns, Skills, Proficiencies)
    GameState.getInstance().restoreTo(this.player, this.progressionSystem, this.time.now);

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
    wolf.on('pointerdown', (_pointer: Phaser.Input.Pointer) => {
      this.engageEnemy(wolf);
    });

    // Spawn second test enemy (Wolf 2) at (14, 6)
    const wolf2 = new Enemy(this, 14, 6, wolfData, 'wolf-avatar', this.tileSize);
    wolf2.entityName = 'Wolf 2';
    this.enemies.push(wolf2);

    wolf2.on('pointerdown', (_pointer: Phaser.Input.Pointer) => {
      this.engageEnemy(wolf2);
    });

    // Target Selection Reticle
    this.targetReticle = this.add.sprite(-100, -100, 'target-reticle').setDepth(10000);
    this.targetReticle.setVisible(false);

    // 6. Initialize Combat System
    this.combatSystem = new CombatSystem(
      this,
      this.player,
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
    }

    // Expose debug helpers on window for browser console testing
    (window as any).__grantExp = (statId: string = 'short_swords', amount: number = 25) => {
      return this.progressionSystem.addProficiencyExp(statId, amount);
    };
    (window as any).__setLevel = (statId: string = 'short_swords', targetLevel: number = 10) => {
      const stat = this.progressionSystem.getProficiencyStat(statId);
      stat.level = targetLevel;
      stat.currentExp = 0;
      this.progressionSystem.checkClassUnlocks();
      console.log(`[Debug] Set '${statId}' to Level ${targetLevel} (0 EXP)`);
    };
    (window as any).__respawnEnemies = () => {
      for (const e of this.enemies) {
        e.respawn();
      }
      console.log('[Debug] All test enemies respawned and reset to spawn positions.');
    };
    console.log('[Debug Tools] Hotkeys: [X] +25 Wpn Exp, [Z] +100 Wpn Exp, [C] +25 Const Exp, [P] +680 Wpn Exp (Lv10 Fencer), [T] Respawn Enemies. Console: __grantExp(id, amt), __setLevel(id, lv), __respawnEnemies().');

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
      if (this.player.state === 'downed' || this.isTransitioning) return;

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
      } else if (gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        // Click-to-Move to empty walkable tile
        console.log(`[Input] Clicked Tile: (${clickedTileX}, ${clickedTileY})`);
        this.player.clearTarget();
        this.targetReticle.setVisible(false);

        const targetPos: GridPos = { x: clickedTileX, y: clickedTileY };
        this.pathfinder.findPath(this.player.gridPos, targetPos).then((path) => {
          if (path.length > 0) {
            this.player.followPath(path);
          }
        });
      }
    });
  }

  private triggerPortalTransition(): void {
    if (this.isTransitioning) return;

    this.player.clearTarget();
    this.targetReticle.setVisible(false);

    const dx = Math.abs(this.player.gridPos.x - this.portalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.portalPos.y);

    if (Math.max(dx, dy) <= 1) {
      // Already adjacent
      this.executeTransitionToOutpost();
    } else {
      console.log('[MainScene] Moving to Outpost Portal...');
      this.pathfinder.findPath(this.player.gridPos, this.portalPos).then((path) => {
        if (path.length > 1) {
          path.pop(); // stop adjacent to portal
          this.player.followPath(path, () => {
            this.executeTransitionToOutpost();
          });
        } else {
          this.executeTransitionToOutpost();
        }
      });
    }
  }

  private executeTransitionToOutpost(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[MainScene] Entering Outpost Portal -> Transitioning to OutpostScene');
    // Save live player & progression snapshot
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);

    // Switch active scene to OutpostScene
    this.scene.start('OutpostScene');
  }

  private engageEnemy(enemy: Enemy): void {
    if (this.player.state === 'downed' || enemy.state === 'dead' || enemy.state === 'downed') return;

    console.log(`[Input] Engaged Enemy: ${enemy.entityName} at (${enemy.gridPos.x}, ${enemy.gridPos.y})`);
    this.player.setTarget(enemy);
    this.targetReticle.setPosition(
      enemy.gridPos.x * this.tileSize + this.tileSize / 2,
      enemy.gridPos.y * this.tileSize + this.tileSize / 2
    );
    this.targetReticle.setVisible(true);

    // Pathfind player to tile adjacent to enemy
    this.pathfindPlayerToAdjacent(enemy.gridPos);
  }

  private pathfindPlayerToAdjacent(targetPos: GridPos): void {
    const playerPos = this.player.gridPos;
    const dx = Math.abs(playerPos.x - targetPos.x);
    const dy = Math.abs(playerPos.y - targetPos.y);

    if (Math.max(dx, dy) <= 1) {
      // Already adjacent
      return;
    }

    this.pathfinder.findPath(playerPos, targetPos).then((path) => {
      if (path.length > 1) {
        // Remove the target's own tile so player stops adjacent to target
        path.pop();
        this.player.followPath(path);
      }
    });
  }

  public update(time: number, delta: number): void {
    // Debug Revive key listener [R]
    if (this.rKey && Phaser.Input.Keyboard.JustDown(this.rKey)) {
      if (this.player.state === 'downed') {
        this.player.revive();
      }
    }

    // Debug Damage key listener [K]
    if (this.kKey && Phaser.Input.Keyboard.JustDown(this.kKey)) {
      // Target player's selected enemy if valid, or default to the first active enemy in scene (Wolf)
      let targetEnemy: Enemy | null = null;
      if (this.player.targetEntity instanceof Enemy && this.player.targetEntity.state !== 'dead' && this.player.targetEntity.state !== 'downed') {
        targetEnemy = this.player.targetEntity;
      } else {
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

    // Update Entities
    this.player.update(time, delta);
    for (const enemy of this.enemies) {
      enemy.update(time, delta);
    }

    // Update Combat System
    this.combatSystem.update(time, delta);

    // Update HUD Overlay
    this.hud.update(this.player, this.progressionSystem, time);
  }
}
