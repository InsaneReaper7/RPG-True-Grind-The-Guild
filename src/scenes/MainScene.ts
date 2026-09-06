import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { CombatSystem } from '../systems/CombatSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
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

  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

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

    // Progression Unlock Notification
    this.progressionSystem.onClassUnlocked((event) => {
      console.log(`%c[UNLOCK] ${event.classDef.name} Class Unlocked!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef);
    });

    // 5. Spawn Player & Enemy (Wolf)
    this.player = new Player(this, 3, 3, playerData, startingWeapon, this.tileSize);

    const wolf = new Enemy(this, 14, 14, wolfData, 'wolf-avatar', this.tileSize);
    this.enemies.push(wolf);

    // Target Selection Reticle
    this.targetReticle = this.add.sprite(-100, -100, 'target-reticle');
    this.targetReticle.setVisible(false);

    // 6. Initialize Combat System
    this.combatSystem = new CombatSystem(
      this,
      this.player,
      this.enemies,
      this.pathfinder,
      this.progressionSystem,
      (_deadEnemy) => {
        this.targetReticle.setVisible(false);
      }
    );

    // 7. Setup Camera Controls
    this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Input Controls: WASD & Space
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };
    }

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

    // Pointer Click Interactions (Click-to-Move / Click-to-Engage)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clickedTileX = Math.floor(worldPoint.x / this.tileSize);
      const clickedTileY = Math.floor(worldPoint.y / this.tileSize);

      // Check if an enemy was clicked
      const clickedEnemy = this.enemies.find(
        (e) => e.gridPos.x === clickedTileX && e.gridPos.y === clickedTileY && e.state !== 'dead'
      );

      if (clickedEnemy) {
        // Click-to-Engage Wolf
        console.log(`[Input] Clicked Enemy: ${clickedEnemy.entityName} at (${clickedTileX}, ${clickedTileY})`);
        this.player.setTarget(clickedEnemy);
        this.targetReticle.setPosition(
          clickedTileX * this.tileSize + this.tileSize / 2,
          clickedTileY * this.tileSize + this.tileSize / 2
        );
        this.targetReticle.setVisible(true);

        // Pathfind player to tile adjacent to enemy
        this.pathfindPlayerToAdjacent(clickedEnemy.gridPos);
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
    this.hud.update(this.player, this.progressionSystem);
  }
}
