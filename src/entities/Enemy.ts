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
  public nameLabel?: Phaser.GameObjects.Text;
  public tierAura?: Phaser.GameObjects.Graphics;
  public tierLabel?: Phaser.GameObjects.Text;
  public isSkinned: boolean = false;
  public isButchered: boolean = false;
  public corpseNode?: any = null;

  public isEnraged: boolean = false;
  public isGlaciated: boolean = false;
  public iceBarrierHp: number = 0;
  public maxIceBarrierHp: number = 100;
  public attackRangeTiles: number = 1;
  public initialAttackIntervalMs: number;
  public enragedAttackIntervalMs: number;
  public initialMoveSpeed: number;
  public enragedMoveSpeed: number;

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
    this.attackRangeTiles = enemyData.attackRangeTiles ?? 1;
    this.spawnPos = { x, y };
    this.initialAttackIntervalMs = enemyData.attackIntervalMs;
    this.enragedAttackIntervalMs = Math.round(enemyData.attackIntervalMs * 0.68);
    this.initialMoveSpeed = enemyData.moveSpeed;
    this.enragedMoveSpeed = Math.round(enemyData.moveSpeed * 1.31);

    // Milestone 20, 29 & 34: Elite, Epic & Boss Tier Visual Distinction
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
        this.eliteLabel = scene.add.text(0, -this.tileSize / 2 - 29, '★ ELITE ★', {
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
        this.eliteLabel = scene.add.text(0, -this.tileSize / 2 - 29, '✦ EPIC ✦', {
          fontSize: '9px',
          color: '#c084fc',
          fontStyle: 'bold',
          backgroundColor: 'rgba(0,0,0,0.85)',
          padding: { x: 3, y: 1 }
        }).setOrigin(0.5);
        this.add(this.eliteLabel);
        this.tierLabel = this.eliteLabel;
      }
    } else if (this.enemyData.tier === 'boss') {
      if (scene.add && typeof scene.add.graphics === 'function') {
        this.eliteAura = scene.add.graphics();
        if (this.enemyData.id === 'glacial_sovereign') {
          // Glacial Sovereign: Sub-zero crystalline cyan aura with 8-point snowflake spikes
          this.eliteAura.lineStyle(3, 0x06b6d4, 0.95);
          this.eliteAura.strokeCircle(0, 0, 24);
          this.eliteAura.fillStyle(0x0891b2, 0.28);
          this.eliteAura.fillCircle(0, 0, 24);
          this.eliteAura.lineStyle(2, 0x38bdf8, 0.9);
          if (typeof (this.eliteAura as any).lineBetween === 'function') {
            (this.eliteAura as any).lineBetween(0, -28, 0, -22);
            (this.eliteAura as any).lineBetween(0, 22, 0, 28);
            (this.eliteAura as any).lineBetween(-28, 0, -22, 0);
            (this.eliteAura as any).lineBetween(22, 0, 28, 0);
            (this.eliteAura as any).lineBetween(-20, -20, -15, -15);
            (this.eliteAura as any).lineBetween(15, 15, 20, 20);
            (this.eliteAura as any).lineBetween(-20, 20, -15, 15);
            (this.eliteAura as any).lineBetween(15, -15, 20, -20);
          }
          this.eliteAura.lineStyle(1.5, 0xa5f3fc, 0.85);
          this.eliteAura.strokeCircle(0, 0, 16);
        } else {
          // Abyssal Colossus: Outer crimson blazing circle
          this.eliteAura.lineStyle(3, 0xdc2626, 0.95);
          this.eliteAura.strokeCircle(0, 0, 24);
          this.eliteAura.fillStyle(0xef4444, 0.28);
          this.eliteAura.fillCircle(0, 0, 24);
          // Four cardinal crest spikes
          this.eliteAura.lineStyle(2, 0xdc2626, 0.9);
          if (typeof (this.eliteAura as any).lineBetween === 'function') {
            (this.eliteAura as any).lineBetween(0, -28, 0, -22);
            (this.eliteAura as any).lineBetween(0, 22, 0, 28);
            (this.eliteAura as any).lineBetween(-28, 0, -22, 0);
            (this.eliteAura as any).lineBetween(22, 0, 28, 0);
          }
          // Inner fiery amber core ring
          this.eliteAura.lineStyle(1.5, 0xf59e0b, 0.85);
          this.eliteAura.strokeCircle(0, 0, 16);
        }
        this.addAt(this.eliteAura, 0); // Behind avatar
        this.tierAura = this.eliteAura;
      }
      if (scene.add && typeof scene.add.text === 'function') {
        const isGlacial = this.enemyData.id === 'glacial_sovereign';
        this.eliteLabel = scene.add.text(0, -this.tileSize / 2 - 30, '👑 BOSS 👑', {
          fontSize: '10px',
          color: isGlacial ? '#06b6d4' : '#ef4444',
          fontStyle: 'bold',
          backgroundColor: isGlacial ? 'rgba(0,30,50,0.85)' : 'rgba(50,0,0,0.85)',
          padding: { x: 4, y: 1 }
        }).setOrigin(0.5);
        this.add(this.eliteLabel);
        this.tierLabel = this.eliteLabel;
      }
    }

    // Name label displayed for all enemies across all tiers, positioned cleanly above the HP bar
    if (scene.add && typeof scene.add.text === 'function') {
      this.nameLabel = scene.add.text(0, -this.tileSize / 2 - 18, this.entityName, {
        fontSize: '9px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.65)',
        padding: { x: 3, y: 1 }
      }).setOrigin(0.5);
      this.add(this.nameLabel);
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

    let effectiveDamage = amount;
    // Glacial Sovereign: Crystalline Ice Barrier absorbs incoming damage
    if (this.iceBarrierHp > 0 && effectiveDamage > 0) {
      const absorbed = Math.min(this.iceBarrierHp, effectiveDamage);
      this.iceBarrierHp -= absorbed;
      effectiveDamage -= absorbed;
      console.log(`[Combat:Barrier] ❄️ ${this.entityName}'s Crystalline Ice Barrier absorbed ${absorbed} damage! Remaining: ${this.iceBarrierHp}`);
      if (this.scene && typeof (this.scene as any).createFloatingText === 'function') {
        (this.scene as any).createFloatingText(this.x, this.y - 20, `ABSORBED ${absorbed.toFixed(0)}!`, '#38bdf8');
      }
      if (this.iceBarrierHp <= 0) {
        console.log(`[Combat:Barrier] ❄️ ${this.entityName}'s Crystalline Ice Barrier SHATTERED!`);
        if (this.scene && typeof (this.scene as any).createFloatingText === 'function') {
          (this.scene as any).createFloatingText(this.x, this.y - 28, 'BARRIER SHATTERED!', '#67e8f9');
        }
      }
    }

    const isDowned = super.takeDamage(effectiveDamage);

    // Boss Tier Critical HP Phase Trigger (<= 50% HP)
    if (this.enemyData.tier === 'boss' && this.state !== 'dead' && this.state !== 'downed') {
      if (this.hp <= this.criticalHp) {
        if (this.enemyData.id === 'glacial_sovereign' && !this.isGlaciated) {
          this.triggerGlaciation();
        } else if (this.enemyData.id !== 'glacial_sovereign' && !this.isEnraged) {
          this.triggerEnrage();
        }
      }
    }

    return isDowned;
  }

  /**
   * Enters Glacial Sovereign Permafrost Glaciation phase:
   * Conjures a 100 HP Crystalline Ice Barrier, shifts aura into a radiant sub-zero blizzard vortex,
   * activates Frost Thorns damage reflection, and updates visuals.
   */
  public triggerGlaciation(): void {
    this.isGlaciated = true;
    this.iceBarrierHp = this.maxIceBarrierHp;
    console.log(`%c[Combat:Glaciation] ❄️ ${this.entityName} has entered PERMAFROST GLACIATION! Conjured 100 HP Crystalline Ice Barrier and active Frost Thorns!`, 'color: #06b6d4; font-weight: bold;');

    // Avatar cyan frost tint
    if (this.avatarSprite && typeof this.avatarSprite.setTint === 'function') {
      this.avatarSprite.setTint(0xbae6fd);
    }

    // Intensified glacial crystalline aura
    if (this.eliteAura) {
      this.eliteAura.clear();
      // Outer radiant cyan crystalline vortex
      this.eliteAura.lineStyle(3.5, 0x06b6d4, 1.0);
      this.eliteAura.strokeCircle(0, 0, 26);
      this.eliteAura.fillStyle(0x0891b2, 0.40);
      this.eliteAura.fillCircle(0, 0, 26);
      // 8-point snowflake frost spikes
      if (typeof (this.eliteAura as any).lineBetween === 'function') {
        // Cardinal spikes
        (this.eliteAura as any).lineBetween(0, -32, 0, -24);
        (this.eliteAura as any).lineBetween(0, 24, 0, 32);
        (this.eliteAura as any).lineBetween(-32, 0, -24, 0);
        (this.eliteAura as any).lineBetween(24, 0, 32, 0);
        // Diagonal spikes
        (this.eliteAura as any).lineBetween(-22, -22, -16, -16);
        (this.eliteAura as any).lineBetween(16, 16, 22, 22);
        (this.eliteAura as any).lineBetween(-22, 22, -16, 16);
        (this.eliteAura as any).lineBetween(16, -16, 22, -22);
      }
      // Inner diamond frost core ring
      this.eliteAura.lineStyle(2, 0xa5f3fc, 0.95);
      this.eliteAura.strokeCircle(0, 0, 18);
    }

    if (this.eliteLabel) {
      this.eliteLabel.setText('❄️ CRYO SOVEREIGN ❄️');
      this.eliteLabel.setStyle({ color: '#22d3ee' });
    }

    if (this.scene && typeof (this.scene as any).createFloatingText === 'function') {
      (this.scene as any).createFloatingText(this.x, this.y - 24, 'PERMAFROST AWAKENING!', '#06b6d4');
    }
  }

  /**
   * Enters Boss Enrage phase: dramatically speeds up attack rate and move speed with intensified visuals.
   */
  public triggerEnrage(): void {
    this.isEnraged = true;
    this.enemyData.attackIntervalMs = this.enragedAttackIntervalMs;
    this.moveSpeed = this.enragedMoveSpeed;
    console.log(`%c[Combat:Enrage] 🔥 ${this.entityName} has ENRAGED! Attack interval dropped to ${this.enemyData.attackIntervalMs}ms, Move speed increased to ${this.moveSpeed}!`, 'color: #ef4444; font-weight: bold;');
    
    // Avatar red tint
    if (this.avatarSprite && typeof this.avatarSprite.setTint === 'function') {
      this.avatarSprite.setTint(0xff8888);
    }
    // Intensified enrage aura
    if (this.eliteAura) {
      this.eliteAura.clear();
      this.eliteAura.lineStyle(3.5, 0xff0000, 1.0);
      this.eliteAura.strokeCircle(0, 0, 26);
      this.eliteAura.fillStyle(0xdc2626, 0.38);
      this.eliteAura.fillCircle(0, 0, 26);
      if (typeof (this.eliteAura as any).lineBetween === 'function') {
        (this.eliteAura as any).lineBetween(0, -32, 0, -24);
        (this.eliteAura as any).lineBetween(0, 24, 0, 32);
        (this.eliteAura as any).lineBetween(-32, 0, -24, 0);
        (this.eliteAura as any).lineBetween(24, 0, 32, 0);
      }
      this.eliteAura.lineStyle(2, 0xf59e0b, 0.9);
      this.eliteAura.strokeCircle(0, 0, 18);
    }
    if (this.eliteLabel) {
      this.eliteLabel.setText('🔥 ENRAGED BOSS 🔥');
      this.eliteLabel.setStyle({ color: '#ff2222' });
    }
  }

  public override onDowned(): void {
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
    if (this.nameLabel) {
      this.nameLabel.setVisible(false);
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
    this.isSkinned = false;
    this.isButchered = false;
    this.corpseNode = null;
    this.isEnraged = false;
    this.isGlaciated = false;
    this.iceBarrierHp = 0;
    this.enemyData.attackIntervalMs = this.initialAttackIntervalMs;
    this.moveSpeed = this.initialMoveSpeed;
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
      if (this.enemyData.tier === 'boss') {
        this.eliteAura.clear();
        if (this.enemyData.id === 'glacial_sovereign') {
          this.eliteAura.lineStyle(3, 0x06b6d4, 0.95);
          this.eliteAura.strokeCircle(0, 0, 24);
          this.eliteAura.fillStyle(0x0891b2, 0.28);
          this.eliteAura.fillCircle(0, 0, 24);
          this.eliteAura.lineStyle(2, 0x38bdf8, 0.9);
          if (typeof (this.eliteAura as any).lineBetween === 'function') {
            (this.eliteAura as any).lineBetween(0, -28, 0, -22);
            (this.eliteAura as any).lineBetween(0, 22, 0, 28);
            (this.eliteAura as any).lineBetween(-28, 0, -22, 0);
            (this.eliteAura as any).lineBetween(22, 0, 28, 0);
            (this.eliteAura as any).lineBetween(-20, -20, -15, -15);
            (this.eliteAura as any).lineBetween(15, 15, 20, 20);
            (this.eliteAura as any).lineBetween(-20, 20, -15, 15);
            (this.eliteAura as any).lineBetween(15, -15, 20, -20);
          }
          this.eliteAura.lineStyle(1.5, 0xa5f3fc, 0.85);
          this.eliteAura.strokeCircle(0, 0, 16);
        } else {
          this.eliteAura.lineStyle(3, 0xdc2626, 0.95);
          this.eliteAura.strokeCircle(0, 0, 24);
          this.eliteAura.fillStyle(0xef4444, 0.28);
          this.eliteAura.fillCircle(0, 0, 24);
          this.eliteAura.lineStyle(2, 0xdc2626, 0.9);
          if (typeof (this.eliteAura as any).lineBetween === 'function') {
            (this.eliteAura as any).lineBetween(0, -28, 0, -22);
            (this.eliteAura as any).lineBetween(0, 22, 0, 28);
            (this.eliteAura as any).lineBetween(-28, 0, -22, 0);
            (this.eliteAura as any).lineBetween(22, 0, 28, 0);
          }
          this.eliteAura.lineStyle(1.5, 0xf59e0b, 0.85);
          this.eliteAura.strokeCircle(0, 0, 16);
        }
      }
    }
    if (this.eliteLabel) {
      this.eliteLabel.setVisible(true);
      if (this.enemyData.id === 'glacial_sovereign') {
        this.eliteLabel.setText('👑 BOSS 👑');
        this.eliteLabel.setStyle({ color: '#06b6d4', backgroundColor: 'rgba(0,30,50,0.85)' });
      } else if (this.enemyData.tier === 'boss') {
        this.eliteLabel.setText('👑 BOSS 👑');
        this.eliteLabel.setStyle({ color: '#ef4444', backgroundColor: 'rgba(50,0,0,0.85)' });
      }
    }
    if (this.nameLabel) {
      this.nameLabel.setVisible(true);
    }
    this.drawHpBar();
    console.log(`[Respawn] ${this.entityName} completely reset and respawned at (${this.spawnPos.x}, ${this.spawnPos.y}) with full HP!`);
  }

  public override drawHpBar(): void {
    super.drawHpBar();
    // Milestone 20: Gold border around HP bar for Elite enemies
    // Milestone 29: Purple border around HP bar for Epic enemies
    // Milestone 34: Crimson border around HP bar for Boss enemies
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
      } else if (this.enemyData?.tier === 'boss') {
        const barWidth = 36;
        const barHeight = 4;
        const barX = -barWidth / 2;
        const barY = -this.tileSize / 2 - 12;
        this.hpBarBg.lineStyle(2, 0xdc2626, 1.0);
        this.hpBarBg.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight * 2 + 3);
      }
    }
  }
}
