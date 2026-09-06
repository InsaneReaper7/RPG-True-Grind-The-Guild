import Phaser from 'phaser';
import { Entity } from './Entity';
import { EnemyDef, GridPos } from '../types/game';

export class Enemy extends Entity {
  public enemyData: EnemyDef;
  public lastAttackTime: number = 0;
  public isAggroed: boolean = false;
  public targetEntity: Entity | null = null;

  public spawnPos: GridPos;
  public maxLeashDistance: number = 10;
  public outOfAggroTimerMs: number = 0;
  public leashTimeoutMs: number = 4000;
  public lastRepathTimeMs: number = 0;
  public repathIntervalMs: number = 400;

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

    // Enable direct sprite/container click interactive hit area
    this.setInteractive(new Phaser.Geom.Rectangle(-16, -16, 32, 32), Phaser.Geom.Rectangle.Contains);
    this.avatarSprite.setInteractive();
  }

  public override takeDamage(amount: number): boolean {
    // Immediate aggro on taking damage regardless of attacker distance
    if (!this.isAggroed) {
      this.isAggroed = true;
      console.log(`[Combat] ${this.entityName} aggroed immediately due to damage!`);
    }

    // Fresh hit resets out-of-aggro timer
    this.outOfAggroTimerMs = 0;

    // Reset state out of 'attacking', 'idle', or 'returning' into 'chasing' so pursuit can resume
    if (this.state !== 'downed' && this.state !== 'dead') {
      if (this.state === 'attacking' || this.state === 'idle' || this.state === 'returning') {
        this.state = 'chasing';
      }
    }

    return super.takeDamage(amount);
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
    this.activeStatusEffects.clear();
    this.stopMovement();
    this.setGridPosition(this.spawnPos.x, this.spawnPos.y);

    this.avatarSprite.setAngle(0);
    this.avatarSprite.setAlpha(1);
    this.avatarSprite.clearTint();
    if (this.statusIconSprite) {
      this.statusIconSprite.setVisible(false);
    }
    this.drawHpBar();
    console.log(`[Respawn] ${this.entityName} completely reset and respawned at (${this.spawnPos.x}, ${this.spawnPos.y}) with full HP!`);
  }
}
