import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pathfinder } from '../utils/Pathfinder';
import { ProgressionSystem } from './ProgressionSystem';

export class CombatSystem {
  private scene: Phaser.Scene;
  private player: Player;
  private enemies: Enemy[];
  private pathfinder: Pathfinder;
  private progressionSystem: ProgressionSystem;
  private onEnemyDeathCallback?: (enemy: Enemy) => void;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    enemies: Enemy[],
    pathfinder: Pathfinder,
    progressionSystem: ProgressionSystem,
    onEnemyDeath?: (enemy: Enemy) => void
  ) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.pathfinder = pathfinder;
    this.progressionSystem = progressionSystem;
    this.onEnemyDeathCallback = onEnemyDeath;
  }

  public update(time: number, _delta: number): void {
    if (this.player.state === 'dead') return;

    // 1. Enemy AI: Aggro detection, Pursuit & Auto-Attack
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.state === 'dead') continue;

      const dx = Math.abs(enemy.gridPos.x - this.player.gridPos.x);
      const dy = Math.abs(enemy.gridPos.y - this.player.gridPos.y);
      const distanceTiles = Math.max(dx, dy); // Chebyshev distance

      // Aggro radius check (5 tiles)
      if (!enemy.isAggroed && distanceTiles <= enemy.enemyData.aggroRadius) {
        enemy.isAggroed = true;
        console.log(`[Combat] Wolf aggroed on Player! (Distance: ${distanceTiles} tiles)`);
      }

      if (enemy.isAggroed) {
        if (distanceTiles <= 1) {
          // Melee range -> Auto-attack player
          if (time - enemy.lastAttackTime >= enemy.enemyData.attackIntervalMs) {
            enemy.lastAttackTime = time;
            enemy.state = 'attacking';
            const damage = enemy.enemyData.meleeDamage;
            console.log(`[Combat] Wolf attacks Player for ${damage} damage!`);
            this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0xef4444);
            const playerDied = this.player.takeDamage(damage);
            if (playerDied) {
              console.log('[Combat] Player has been slain!');
            }
          }
        } else if (enemy.state === 'idle') {
          // Path towards player's position
          this.pathfinder.findPath(enemy.gridPos, this.player.gridPos).then((path) => {
            if (path.length > 1 && enemy.state === 'idle') {
              // Path to tile adjacent to player
              path.pop();
              enemy.followPath(path);
            }
          });
        }
      }
    }

    // 2. Player Auto-Attack Loop against Target Entity
    if (this.player.targetEntity && this.player.targetEntity.state !== 'dead') {
      const target = this.player.targetEntity;
      const dx = Math.abs(this.player.gridPos.x - target.gridPos.x);
      const dy = Math.abs(this.player.gridPos.y - target.gridPos.y);
      const distanceTiles = Math.max(dx, dy);

      if (distanceTiles <= this.player.attackRangeTiles) {
        // Player is within attack range -> Attack on cooldown
        if (time - this.player.lastAttackTime >= this.player.equippedWeapon.attackIntervalMs) {
          this.player.lastAttackTime = time;
          this.player.state = 'attacking';

          const damage = this.player.equippedWeapon.baseDamage;
          console.log(`[Combat] Player attacks ${target.entityName} with ${this.player.equippedWeapon.name} for ${damage} damage!`);
          this.createAttackEffect(this.player.x, this.player.y, target.x, target.y, 0x3b82f6);

          // Grant proficiency EXP on hit
          const weaponId = this.player.equippedWeapon.id;
          this.progressionSystem.addProficiencyExp(weaponId, 2);

          const targetDied = target.takeDamage(damage);
          if (targetDied) {
            console.log(`[Combat] ${target.entityName} defeated!`);
            // Bonus EXP on kill
            this.progressionSystem.addProficiencyExp(weaponId, 4);

            this.player.clearTarget();

            if (target instanceof Enemy) {
              const index = this.enemies.indexOf(target);
              if (index !== -1) {
                this.enemies.splice(index, 1);
              }
              if (this.onEnemyDeathCallback) {
                this.onEnemyDeathCallback(target);
              }
            }
          }
        }
      }
    }
  }

  private createAttackEffect(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(2, color, 1);
    graphics.lineBetween(fromX, fromY, toX, toY);

    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        graphics.destroy();
      }
    });
  }
}
