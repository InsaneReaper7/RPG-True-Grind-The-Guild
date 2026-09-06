import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { Player } from '../entities/Player';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { GridPos, PlacedBuildable } from '../types/game';
import { BuildingSystem } from '../systems/BuildingSystem';

export class OutpostScene extends Phaser.Scene {
  private mapWidth: number = 20;
  private mapHeight: number = 20;
  private tileSize: number = 32;

  private tilemap!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  private player!: Player;
  private progressionSystem!: ProgressionSystem;
  private hud!: HUD;
  private buildingSystem!: BuildingSystem;

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
    this.progressionSystem = new ProgressionSystem(classesData);
    this.hud = new HUD();
    this.hud.setLocation('Guild Outpost (Safe Zone)', true);

    // Wire up HUD Build callbacks
    this.hud.setBuildCallbacks(
      () => this.toggleBuildMode(),
      (id: string) => this.selectBuildable(id)
    );

    // 5. Spawn Player & Restore State Snapshot
    this.player = new Player(this, 4, 4, playerData, startingWeapon, this.tileSize);
    GameState.getInstance().restoreTo(this.player, this.progressionSystem, this.time.now);

    // Restore any previously placed structures from GameState
    this.restorePlacedBuildables();

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
        }
      });
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
      // Check if clicking a placed Research Station
      if (this.isPlacedStation(clickedTileX, clickedTileY)) {
        this.hud.showToast('🔬 Research Station: Research Tree coming in a future update! (Milestone 5)', 'info', 4500);
        console.log('[ResearchStation] Interacted: Research Tree coming in Milestone 5.');
        return;
      }

      // Check if portal clicked
      if (clickedTileX === this.portalPos.x && clickedTileY === this.portalPos.y) {
        this.triggerPortalTransition();
        return;
      }

      // Normal Click-to-Move
      if (this.gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        const targetPos: GridPos = { x: clickedTileX, y: clickedTileY };
        this.pathfinder.findPath(this.player.gridPos, targetPos).then((path) => {
          if (path.length > 0) {
            this.player.followPath(path);
          }
        });
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

  // --- BUILD MODE METHODS ---

  public toggleBuildMode(): void {
    this.isBuildMode = !this.isBuildMode;
    this.hud.setBuildOverlayVisible(this.isBuildMode);

    if (this.isBuildMode) {
      this.selectedBuildableId = 'floor';
      this.currentRotation = 0;
      this.hud.updateBuildOverlay(GameState.getInstance().getWood(), this.currentRotation, this.selectedBuildableId);
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
    this.hud.updateBuildOverlay(GameState.getInstance().getWood(), this.currentRotation, this.selectedBuildableId);
    this.updateGhostSprite();
  }

  public rotateBlueprint(): void {
    if (this.selectedBuildableId === 'wall') {
      this.hud.showToast('Walls cannot be rotated — they infer orientation automatically from adjacent walls/doors.', 'warn', 2500);
      return;
    }
    this.currentRotation = (this.currentRotation + 90) % 360;
    this.hud.updateBuildOverlay(GameState.getInstance().getWood(), this.currentRotation, this.selectedBuildableId);
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
    else if (def.id === 'research_station') texture = 'buildable-research-station';

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

    if (this.selectedBuildableId === 'demolish') {
      const placed = this.getPlacedBuildableAt(tileX, tileY);
      const path = placed ? 'valid-highlight' : 'invalid-highlight-with-reason (Nothing to demolish)';
      if (this.lastLoggedHoverKey !== hoverKey) {
        console.log(`[BuildMode:Hover] Tile: (${tileX}, ${tileY}) | InBounds: true | ExistingBuildable: ${placed?.id ?? 'none'} | Path: ${path}`);
        this.lastLoggedHoverKey = hoverKey;
      }
      if (placed) {
        this.hoverHighlightSprite.setTexture('tile-highlight-valid');
        this.hoverGhostSprite.setTint(0xffffff);
        this.hoverReasonText.setText(`Demolish ${placed.id} (Refund Wood)`).setVisible(true);
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

    const validation = this.buildingSystem.canPlace(
      blueprint,
      tileX,
      tileY,
      this.player.gridPos,
      [this.portalPos],
      (x, y) => this.isWall(x, y),
      (x, y) => this.isPlacedDoor(x, y),
      (x, y) => this.isPlacedStation(x, y),
      GameState.getInstance().getWood()
    );

    const path = validation.valid ? 'valid-highlight' : `invalid-highlight-with-reason (${validation.reason})`;
    if (this.lastLoggedHoverKey !== hoverKey) {
      console.log(`[BuildMode:Hover] Tile: (${tileX}, ${tileY}) | InBounds: true | ExistingBuildable: ${placedBuildable?.id ?? 'none'} | Path: ${path}`);
      this.lastLoggedHoverKey = hoverKey;
    }

    if (validation.valid) {
      this.hoverHighlightSprite.setTexture('tile-highlight-valid');
      this.hoverGhostSprite.setTint(0xffffff);
      this.hoverReasonText.setVisible(false);
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

    const validation = this.buildingSystem.canPlace(
      blueprint,
      x,
      y,
      this.player.gridPos,
      [this.portalPos],
      (tx, ty) => this.isWall(tx, ty),
      (tx, ty) => this.isPlacedDoor(tx, ty),
      (tx, ty) => this.isPlacedStation(tx, ty),
      GameState.getInstance().getWood()
    );

    if (!validation.valid) {
      console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: ${validation.reason}`);
      this.hud.showToast(validation.reason || 'Placement blocked!', 'error');
      // Visual feedback: camera shake
      this.cameras.main.shake(120, 0.005);
      return;
    }

    // Deduct wood
    const success = GameState.getInstance().consumeWood(blueprint.woodCost);
    if (!success) {
      console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: REJECTED | Reason: Not enough wood`);
      this.hud.showToast(`Not enough Wood! Requires ${blueprint.woodCost} Wood.`, 'error');
      return;
    }

    console.log(`[BuildMode:Place] Tile: (${x}, ${y}) | Result: PLACED ${blueprint.name}`);

    // Save to GameState
    const placedItem: PlacedBuildable = {
      id: blueprint.id,
      x,
      y,
      rotation: blueprint.rotatable ? this.currentRotation : 0
    };
    GameState.getInstance().addPlacedBuildable(placedItem);

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

    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId
    );
    this.hud.showToast(`Placed ${blueprint.name} (-${blueprint.woodCost} Wood).`, 'success');
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
    const refund = def?.woodCost || 0;

    // Remove from GameState and refund wood
    GameState.getInstance().removePlacedBuildable(x, y);
    GameState.getInstance().addWood(refund);

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

    this.hud.updateBuildOverlay(
      GameState.getInstance().getWood(),
      this.currentRotation,
      this.selectedBuildableId
    );
    console.log(`[BuildMode:Demolish] Tile: (${x}, ${y}) | Result: DEMOLISHED ${placed.id} (+${refund} Wood refunded)`);
    this.hud.showToast(`Demolished ${def?.name || placed.id} (+${refund} Wood refunded).`, 'success');
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
    } else if (item.id === 'research_station') {
      sprite = this.add.sprite(posX, posY, 'buildable-research-station')
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

  private isPlacedStation(x: number, y: number): boolean {
    const placed = this.getPlacedBuildableAt(x, y);
    return placed?.id === 'research_station';
  }

  private isWallOrDoor(x: number, y: number): boolean {
    return this.isWall(x, y) || this.isPlacedDoor(x, y);
  }

  private getPlacedBuildableAt(x: number, y: number): PlacedBuildable | undefined {
    return GameState.getInstance().getPlacedBuildables().find((b) => b.x === x && b.y === y);
  }

  // --- SCENE TRANSITION & CAMERA ---

  private triggerPortalTransition(): void {
    if (this.isTransitioning) return;

    const dx = Math.abs(this.player.gridPos.x - this.portalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.portalPos.y);

    if (Math.max(dx, dy) <= 1) {
      this.executeTransitionToDungeon();
    } else {
      console.log('[OutpostScene] Moving to portal...');
      this.pathfinder.findPath(this.player.gridPos, this.portalPos).then((path) => {
        if (path.length > 1) {
          path.pop(); // stop adjacent
          this.player.followPath(path, () => {
            this.executeTransitionToDungeon();
          });
        } else {
          this.executeTransitionToDungeon();
        }
      });
    }
  }

  private executeTransitionToDungeon(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[OutpostScene] Entering Dungeon Portal -> Transitioning to MainScene');
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

    this.player.update(time, delta);
    this.hud.update(this.player, this.progressionSystem, time);
  }
}
