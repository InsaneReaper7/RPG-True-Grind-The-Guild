import Phaser from 'phaser';
import { GridPos, EntityState, StatusEffectDef, ActiveStatusEffect } from '../types/game';

export class Entity extends Phaser.GameObjects.Container {
  public gridPos: GridPos;
  public tileSize: number;
  public hp: number;
  public maxHp: number;
  public criticalHp: number;
  public maxCriticalHp: number;
  public entityName: string;
  public state: EntityState = 'idle';
  public moveSpeed: number = 100; // pixels per second

  public activeStatusEffects: Map<string, ActiveStatusEffect> = new Map();

  protected avatarSprite: Phaser.GameObjects.Sprite;
  protected statusIconSprite?: Phaser.GameObjects.Sprite;
  protected hpBarBg: Phaser.GameObjects.Graphics;
  protected hpBarFill: Phaser.GameObjects.Graphics;
  protected critBarFill: Phaser.GameObjects.Graphics;

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
    criticalHpMax: number = 25,
    tileSize: number = 32
  ) {
    super(scene, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2);

    this.gridPos = { x, y };
    this.tileSize = tileSize;
    this.hp = hp;
    this.maxHp = hp;
    this.criticalHp = criticalHpMax;
    this.maxCriticalHp = criticalHpMax;
    this.entityName = name;

    // Avatar Sprite
    this.avatarSprite = scene.add.sprite(0, 0, textureKey);
    this.add(this.avatarSprite);

    // Bleed / Status Icon Sprite
    this.statusIconSprite = scene.add.sprite(0, -this.tileSize / 2 - 16, 'bleed-icon');
    this.statusIconSprite.setVisible(false);
    this.add(this.statusIconSprite);

    // HP Bar Graphics (Main + Critical)
    this.hpBarBg = scene.add.graphics();
    this.hpBarFill = scene.add.graphics();
    this.critBarFill = scene.add.graphics();
    this.add(this.hpBarBg);
    this.add(this.hpBarFill);
    this.add(this.critBarFill);

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

  public stopMovement(): void {
    this.path = [];
    this.targetWorldPos = null;
    if (this.state === 'moving') {
      this.state = 'idle';
    }
  }

  public isMoving(): boolean {
    return this.state === 'moving' && (this.path.length > 0 || this.targetWorldPos !== null);
  }

  public followPath(path: GridPos[], onComplete?: () => void): void {
    if (this.state === 'downed' || this.state === 'dead') return;

    if (!path || path.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    let remainingPath = [...path];
    if (remainingPath[0].x === this.gridPos.x && remainingPath[0].y === this.gridPos.y) {
      remainingPath.shift();
    }

    this.path = remainingPath;
    this.onPathCompleteCallback = onComplete;

    if (this.path.length > 0) {
      this.state = 'moving';
      if (!this.targetWorldPos) {
        this.advanceToNextTileInPath();
      }
    } else {
      if (!this.targetWorldPos) {
        this.state = 'idle';
        if (this.onPathCompleteCallback) {
          this.onPathCompleteCallback();
        }
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

  /**
   * Two-bar Damage System:
   * Damage comes off Main HP first. Once Main HP reaches 0, overflow damage reduces Critical HP.
   * Both HP bars reaching 0 triggers Downed state.
   */
  public takeDamage(amount: number): boolean {
    if (this.state === 'downed' || this.state === 'dead') return false;

    if (this.hp > 0) {
      if (this.hp >= amount) {
        this.hp -= amount;
      } else {
        const overflow = amount - this.hp;
        this.hp = 0;
        this.criticalHp = Math.max(0, this.criticalHp - overflow);
      }
    } else {
      this.criticalHp = Math.max(0, this.criticalHp - amount);
    }

    this.drawHpBar();

    if (this.hp <= 0 && this.criticalHp <= 0) {
      this.onDowned();
      return true; // Entity entered Downed state
    }
    return false;
  }

  protected onDowned(): void {
    this.state = 'downed';
    this.path = [];
    this.targetWorldPos = null;
    this.avatarSprite.setAngle(90);
    this.avatarSprite.setAlpha(0.6);
    this.drawHpBar();
  }

  public applyStatusEffect(effectDef: StatusEffectDef): void {
    if (this.state === 'downed' || this.state === 'dead') return;

    this.activeStatusEffects.set(effectDef.id, {
      def: effectDef,
      remainingMs: effectDef.durationMs,
      nextTickMs: effectDef.tickIntervalMs
    });

    this.updateStatusVisuals();
  }

  public removeStatusEffect(effectId: string): void {
    this.activeStatusEffects.delete(effectId);
    this.updateStatusVisuals();
  }

  private updateStatusVisuals(): void {
    if (this.activeStatusEffects.has('bleed')) {
      this.avatarSprite.setTint(0xff6666);
      if (this.statusIconSprite) this.statusIconSprite.setVisible(true);
    } else {
      this.avatarSprite.clearTint();
      if (this.statusIconSprite) this.statusIconSprite.setVisible(false);
    }
  }

  protected updateStatusEffects(deltaMs: number): void {
    if (this.state === 'dead') return;

    const toRemove: string[] = [];

    this.activeStatusEffects.forEach((activeEffect, effectId) => {
      activeEffect.remainingMs -= deltaMs;
      activeEffect.nextTickMs -= deltaMs;

      if (activeEffect.nextTickMs <= 0 && activeEffect.remainingMs > 0) {
        // DoT Tick occurs independent of combat loop!
        const damage = activeEffect.def.damagePerTick;
        console.log(`[DoT] ${this.entityName} takes ${damage} damage from ${activeEffect.def.name}!`);
        this.createFloatingDamageText(damage, 0xef4444);
        this.takeDamage(damage);
        activeEffect.nextTickMs += activeEffect.def.tickIntervalMs;
      }

      if (activeEffect.remainingMs <= 0) {
        toRemove.push(effectId);
      }
    });

    for (const effectId of toRemove) {
      this.removeStatusEffect(effectId);
    }
  }

  protected createFloatingDamageText(amount: number, color: number): void {
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const text = this.scene.add.text(this.x, this.y - 20, `-${amount}`, {
      fontSize: '12px',
      color: colorHex,
      fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 20,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy()
    });
  }

  protected drawHpBar(): void {
    this.hpBarBg.clear();
    this.hpBarFill.clear();
    this.critBarFill.clear();

    const barWidth = 32;
    const barHeight = 3;
    const barX = -barWidth / 2;
    const barY = -this.tileSize / 2 - 10;

    // 1. Backgrounds
    this.hpBarBg.fillStyle(0x1f2937, 1);
    this.hpBarBg.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight * 2 + 3);

    if (this.state === 'downed') {
      // Downed styling (Gray bar)
      this.hpBarFill.fillStyle(0x6b7280, 1);
      this.hpBarFill.fillRect(barX, barY, barWidth, barHeight * 2 + 1);
      return;
    }

    // 2. Main HP Bar (Top)
    const mainRatio = Math.max(0, this.hp / this.maxHp);
    const mainColor = mainRatio > 0.3 ? 0x22c55e : 0xef4444; // Green or Red
    this.hpBarFill.fillStyle(mainColor, 1);
    this.hpBarFill.fillRect(barX, barY, barWidth * mainRatio, barHeight);

    // 3. Critical HP Bar (Bottom)
    const critRatio = Math.max(0, this.criticalHp / this.maxCriticalHp);
    // Highlight Critical HP Bar in Orange/Magenta when Main HP is 0 (Critical warning state)
    const critColor = this.hp === 0 ? 0xf97316 : 0xa855f7; // Warning Orange or Purple
    this.critBarFill.fillStyle(critColor, 1);
    this.critBarFill.fillRect(barX, barY + barHeight + 1, barWidth * critRatio, barHeight);
  }

  public update(_time: number, delta: number): void {
    // Process DoT ticks continuously in entity update loop regardless of combat state
    this.updateStatusEffects(delta);

    if (this.state === 'downed' || this.state === 'dead') return;

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
