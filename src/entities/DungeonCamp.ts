import Phaser from 'phaser';

export class DungeonCamp {
  public scene: Phaser.Scene;
  public x: number;
  public y: number;
  public roomIndex: number;
  public createdAtMs: number;
  public radiusTiles: number;
  public sprite: Phaser.GameObjects.Sprite | null = null;
  public lightGlow: Phaser.GameObjects.Graphics | null = null;
  public label: Phaser.GameObjects.Text | null = null;
  public isDestroyed: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    roomIndex: number,
    radiusTiles: number,
    createdAtMs: number
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.roomIndex = roomIndex;
    this.radiusTiles = radiusTiles;
    this.createdAtMs = createdAtMs;

    this.createVisuals();
  }

  private createVisuals(): void {
    if (!this.scene?.add) return;
    const tileSize = 32;
    const posX = this.x * tileSize + tileSize / 2;
    const posY = this.y * tileSize + tileSize / 2;

    // Subtle warm ambient circle/glow
    this.lightGlow = this.scene.add.graphics();
    this.lightGlow.fillStyle(0xf97316, 0.15);
    this.lightGlow.fillCircle(posX, posY, this.radiusTiles * tileSize);
    this.lightGlow.setDepth(posY - 10);

    // Campfire sprite
    const textureKey = this.scene.textures?.exists('campfire') ? 'campfire' : 'woodcutting-tree';
    this.sprite = this.scene.add.sprite(posX, posY, textureKey);
    this.sprite.setDepth(posY);

    // Label
    this.label = this.scene.add.text(posX, posY - 18, '🏕️ Camp', {
      fontSize: '10px',
      color: '#f97316',
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(posY + 1);
  }

  public isInRadius(targetX: number, targetY: number): boolean {
    return Math.max(Math.abs(this.x - targetX), Math.abs(this.y - targetY)) <= this.radiusTiles;
  }

  public getStandingDurationSeconds(nowMs: number): number {
    return Math.max(0, (nowMs - this.createdAtMs) / 1000);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.lightGlow) {
      this.lightGlow.destroy();
      this.lightGlow = null;
    }
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.label) {
      this.label.destroy();
      this.label = null;
    }
  }
}
