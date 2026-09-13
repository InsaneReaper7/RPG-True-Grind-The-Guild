import Phaser from 'phaser';
import { Entity } from './Entity.ts';
import type { Player } from './Player.ts';
import type { EnemyDef, GridPos } from '../types/game.ts';

export class Enemy extends Entity {
  public enemyData: EnemyDef;
  public lastAttackTime: number = 0;
  public isAggroed: boolean = false;
  public targetEntity: Entity | null = null;
  public tauntSource: Player | null = null;

  public spawnPos: GridPos;
  public maxLeashDistance: number = 10;
  public outOfAggroTimerMs: number = 0;
  public leashTimeoutMs: number = 4000;
  public lastRepathTimeMs: number = 0;
  public repathIntervalMs: number = 400;
  public roomIndex?: number;

  public eliteAura?: Phaser.GameObjects.Graphics;
  public eliteLabel?: Phaser.GameObjects.Text;
  public tierAura?: Phaser.GameObjects.Graphics;
  public tierLabel?: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    enemyData: EnemyDef,
    textureKey: string = 'wolf-avatar',
    tileSize: number = 32
  ) {
    const critMax = enemyData.criticalHpMax ?? Math.floor(enemyData.hp * 0.5);
    super(scene, x, y, textureKey, enemyData.name, enemyData.hp, critMax, tileSize);

    this.enemyData = enemyData;
    this.moveSpeed = enemyData.moveSpeed;
    this.spawnPos = { x, y };

    // Milestone 20 & 29: Elite & Epic Tier Visual Distinction
    if (this.enemyData.tier === 'elite') {
      if (scene.add && typeof scene.add.graphics === 'function') {
        this.eliteAura = scene.add.graphics();
        this.eliteAura.lineStyle(2, 0xf59e0b, 0.85);
        this.eliteAura.strokeCircle(0, 0, 18);
        this.eliteAura.fillStyle(0xf59e0b, 0.18);
        this.eliteAura.fillCircle(0, 0, 18);
        this.addAt(this.eliteAura, 0); // Behind avatar
        this.tierAura = this.eliteAura;
      }
      if (scene.add && typeof scene.add.text === 'function') {
        this.eliteLabel = scene.add.text(0, -this.tileSize / 2 - 17, '★ ELITE ★', {
          fontSize: '9px',
          color: '#f59e0b',
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.75)',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5);
        this.add(this.eliteLabel);
        this.tierLabel = this.eliteLabel;
      }
    } else if (this.enemyData.tier === 'epic') {
      if (scene.add && typeof scene.add.graphics === 'function') {
        this.eliteAura = scene.add.graphics();
        this.eliteAura.lineStyle(2.5, 0xa855f7, 0.9);
        this.eliteAura.strokeCircle(0, 0, 20);
        this.eliteAura.fillStyle(0xa855f7, 0.22);
        this.eliteAura.fillCircle(0, 0, 20);
        // Inner violet glow ring
        this.eliteAura.lineStyle(1, 0xd8b4fe, 0.7);
        this.eliteAura.strokeCircle(0, 0, 14);
        this.addAt(this.eliteAura, 0); // Behind avatar
        this.tierAura = this.eliteAura;
      }
      if (scene.add && typeof scene.add.text === 'function') {
        this.eliteLabel = scene.add.text(0, -this.tileSize / 2 - 17, '✦ EPIC ✦', {
          fontSize: '9px',
          color: '#c084fc',
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5);
        this.add(this.eliteLabel);
        this.tierLabel = this.eliteLabel;
      }
    }

    // Enable direct sprite/container click interactive hit area
    this.setInteractive(new Phaser.Geom.Rectangle(-16, -16, 32, 32), Phaser.Geom.Rectangle.Contains);
    this.avatarSprite.setInteractive();
    this.drawHpBar();
  }

  public override takeDamage(amount: number): boolean {
    // Immediate aggro on taking damage regardless of attacker distance
    if (!this.isAggroed) {
      this.isAggroed = true;
      console.log(`[Combat] ${this.entityName} aggroed immediately due to damage!`);
    }

    // Fresh hit resets out-of-aggro timer
    this.outOfAggroTimerMs = 0;

    // If disabled (stunned, shocked, etc.), maintain disable state and do not resume pursuit until cleared
    if (this.isDisabled()) {
      return super.takeDamage(amount);
    }

    // Reset state out of 'attacking', 'idle', or 'returning' into 'chasing' so pursuit can resume
    if (this.state !== 'downed' && this.state !== 'dead') {
      if (this.state === 'attacking' || this.state === 'idle' || this.state === 'returning') {
        this.state = 'chasing';
      }
    }

    return super.takeDamage(amount);
  }

  protected override onDowned(): void {
    super.onDowned();
    this.markDead();
  }

  /**
   * Transitions enemy to a dead state, disabling clickability and clearing HP bars.
   */
  public markDead(): void {
    this.state = 'dead';
    this.path = [];
    this.targetWorldPos = null;
    this.claimedDestination = null;
    this.targetEntity = null;
    this.tauntSource = null;
    this.isAggroed = false;
    this.activeStatusEffects.clear();
    this.stopMovement();
    this.disableInteractive();
    this.avatarSprite.disableInteractive();
    this.avatarSprite.setAngle(90);
    this.avatarSprite.setAlpha(0.4);
    if (this.statusIconSprite) {
      this.statusIconSprite.setVisible(false);
    }
    if (this.eliteAura) {
      this.eliteAura.setVisible(false);
    }
    if (this.eliteLabel) {
      this.eliteLabel.setVisible(false);
    }
    this.drawHpBar();
  }

  /**
   * Performs a complete state wipe and resets enemy back to its initial spawn configuration.
   */
  public respawn(): void {
    this.hp = this.maxHp;
    this.criticalHp = this.maxCriticalHp;
    this.state = 'idle';
    this.isAggroed = false;
    this.outOfAggroTimerMs = 0;
    this.lastAttackTime = 0;
    this.targetEntity = null;
    this.tauntSource = null;
    this.activeStatusEffects.clear();
    this.stopMovement();
    this.setGridPosition(this.spawnPos.x, this.spawnPos.y);

    this.setInteractive(new Phaser.Geom.Rectangle(-16, -16, 32, 32), Phaser.Geom.Rectangle.Contains);
    this.avatarSprite.setInteractive();

    this.avatarSprite.setAngle(0);
    this.avatarSprite.setAlpha(1);
    this.avatarSprite.clearTint();
    if (this.statusIconSprite) {
      this.statusIconSprite.setVisible(false);
    }
    if (this.eliteAura) {
      this.eliteAura.setVisible(true);
    }
    if (this.eliteLabel) {
      this.eliteLabel.setVisible(true);
    }
    this.drawHpBar();
    console.log(`[Respawn] ${this.entityName} completely reset and respawned at (${this.spawnPos.x}, ${this.spawnPos.y}) with full HP!`);
  }

  public override drawHpBar(): void {
    super.drawHpBar();
    // Milestone 20: Gold border around HP bar for Elite enemies
    // Milestone 29: Purple border around HP bar for Epic enemies
    if (this.state !== 'dead' && this.hpBarBg) {
      if (this.enemyData?.tier === 'elite') {
        const barWidth = 32;
        const barHeight = 3;
        const barX = -barWidth / 2;
        const barY = -this.tileSize / 2 - 10;
        this.hpBarBg.lineStyle(1.5, 0xf59e0b, 0.95);
        this.hpBarBg.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight * 2 + 3);
      } else if (this.enemyData?.tier === 'epic') {
        const barWidth = 32;
        const barHeight = 3;
        const barX = -barWidth / 2;
        const barY = -this.tileSize / 2 - 10;
        this.hpBarBg.lineStyle(1.5, 0xa855f7, 0.95);
        this.hpBarBg.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight * 2 + 3);
      }
    }
  }
}
