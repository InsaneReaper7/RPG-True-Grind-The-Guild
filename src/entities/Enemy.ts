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

    // If stunned, maintain stun and do not resume pursuit until stun clears
    if (this.hasStatusEffect('stun')) {
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
    this.drawHpBar();
    console.log(`[Respawn] ${this.entityName} completely reset and respawned at (${this.spawnPos.x}, ${this.spawnPos.y}) with full HP!`);
  }
}
