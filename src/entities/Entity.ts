import Phaser from 'phaser';
import { GridPos, EntityState } from '../types/game';

export class Entity extends Phaser.GameObjects.Container {
  public gridPos: GridPos;
  public tileSize: number;
  public hp: number;
  public maxHp: number;
  public entityName: string;
  public state: EntityState = 'idle';
  public moveSpeed: number = 100; // pixels per second

  protected avatarSprite: Phaser.GameObjects.Sprite;
  protected hpBarBg: Phaser.GameObjects.Graphics;
  protected hpBarFill: Phaser.GameObjects.Graphics;
  protected path: GridPos[] = [];
  protected targetWorldPos: { x: number; y: number } | null = null;
  protected onPathCompleteCallback?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: string,
    name: string,
    hp: number,
    tileSize: number = 32
  ) {
    super(scene, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2);

    this.gridPos = { x, y };
    this.tileSize = tileSize;
    this.hp = hp;
    this.maxHp = hp;
    this.entityName = name;

    // Avatar Sprite
    this.avatarSprite = scene.add.sprite(0, 0, textureKey);
    this.add(this.avatarSprite);

    // HP Bar Graphics
    this.hpBarBg = scene.add.graphics();
    this.hpBarFill = scene.add.graphics();
    this.add(this.hpBarBg);
    this.add(this.hpBarFill);

    this.drawHpBar();

    scene.add.existing(this);
  }

  public setGridPosition(x: number, y: number): void {
    this.gridPos = { x, y };
    this.x = x * this.tileSize + this.tileSize / 2;
    this.y = y * this.tileSize + this.tileSize / 2;
    this.targetWorldPos = null;
    this.path = [];
  }

  public followPath(path: GridPos[], onComplete?: () => void): void {
    if (!path || path.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    // Skip current tile if path starts at current position
    let remainingPath = [...path];
    if (remainingPath[0].x === this.gridPos.x && remainingPath[0].y === this.gridPos.y) {
      remainingPath.shift();
    }

    this.path = remainingPath;
    this.onPathCompleteCallback = onComplete;

    if (this.path.length > 0) {
      this.state = 'moving';
      this.advanceToNextTileInPath();
    } else {
      this.state = 'idle';
      if (this.onPathCompleteCallback) {
        this.onPathCompleteCallback();
      }
    }
  }

  private advanceToNextTileInPath(): void {
    if (this.path.length === 0) {
      this.targetWorldPos = null;
      this.state = 'idle';
      if (this.onPathCompleteCallback) {
        const cb = this.onPathCompleteCallback;
        this.onPathCompleteCallback = undefined;
        cb();
      }
      return;
    }

    const nextGridPos = this.path.shift()!;
    this.gridPos = nextGridPos;
    this.targetWorldPos = {
      x: nextGridPos.x * this.tileSize + this.tileSize / 2,
      y: nextGridPos.y * this.tileSize + this.tileSize / 2
    };
  }

  public takeDamage(amount: number): boolean {
    if (this.state === 'dead') return true;

    this.hp = Math.max(0, this.hp - amount);
    this.drawHpBar();

    if (this.hp <= 0) {
      this.state = 'dead';
      this.destroy();
      return true; // Entity died
    }
    return false;
  }

  protected drawHpBar(): void {
    this.hpBarBg.clear();
    this.hpBarFill.clear();

    if (this.hp <= 0) return;

    const barWidth = 32;
    const barHeight = 4;
    const barX = -barWidth / 2;
    const barY = -this.tileSize / 2 - 8;

    // Background (Dark Red)
    this.hpBarBg.fillStyle(0x7f1d1d, 1);
    this.hpBarBg.fillRect(barX, barY, barWidth, barHeight);

    // Fill (Green or Amber)
    const ratio = Math.max(0, this.hp / this.maxHp);
    const fillColor = ratio > 0.4 ? 0x22c55e : 0xef4444;
    this.hpBarFill.fillStyle(fillColor, 1);
    this.hpBarFill.fillRect(barX, barY, barWidth * ratio, barHeight);
  }

  public update(_time: number, delta: number): void {
    if (this.state === 'moving' && this.targetWorldPos) {
      const distance = Phaser.Math.Distance.Between(this.x, this.y, this.targetWorldPos.x, this.targetWorldPos.y);
      const step = (this.moveSpeed * delta) / 1000;

      if (distance <= step) {
        this.x = this.targetWorldPos.x;
        this.y = this.targetWorldPos.y;
        this.advanceToNextTileInPath();
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.targetWorldPos.x, this.targetWorldPos.y);
        this.x += Math.cos(angle) * step;
        this.y += Math.sin(angle) * step;
      }
    }
  }
}
