import Phaser from 'phaser';
import { Entity } from '../entities/Entity';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pathfinder } from '../utils/Pathfinder';
import { ProgressionSystem } from './ProgressionSystem';
import { DataLoader } from '../utils/DataLoader';
import { GridPos } from '../types/game';

export class CombatSystem {
  public static readonly DEBUG_AI: boolean = false;

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

  private getBestAdjacentTile(enemyTile: GridPos, playerTile: GridPos): GridPos | null {
    // 8 Chebyshev surrounding tiles (4 orthogonal + 4 diagonal)
    const neighbors: GridPos[] = [
      { x: playerTile.x + 1, y: playerTile.y },
      { x: playerTile.x - 1, y: playerTile.y },
      { x: playerTile.x, y: playerTile.y + 1 },
      { x: playerTile.x, y: playerTile.y - 1 },
      { x: playerTile.x + 1, y: playerTile.y + 1 },
      { x: playerTile.x - 1, y: playerTile.y + 1 },
      { x: playerTile.x + 1, y: playerTile.y - 1 },
      { x: playerTile.x - 1, y: playerTile.y - 1 }
    ];

    // Filter walkable tiles
    const walkableNeighbors = neighbors.filter((n) => !this.pathfinder.isObstacle(n.x, n.y));
    if (walkableNeighbors.length === 0) return null;

    // If enemy is already on one of the walkable adjacent tiles, keep that tile!
    const currentIsAdjacent = walkableNeighbors.find(
      (n) => n.x === enemyTile.x && n.y === enemyTile.y
    );
    if (currentIsAdjacent) {
      return currentIsAdjacent;
    }

    // Sort walkable neighbors by Chebyshev distance to enemyTile to pick the closest adjacent tile
    walkableNeighbors.sort((a, b) => {
      const distA = Math.max(Math.abs(a.x - enemyTile.x), Math.abs(a.y - enemyTile.y));
      const distB = Math.max(Math.abs(b.x - enemyTile.x), Math.abs(b.y - enemyTile.y));
      return distA - distB;
    });

    return walkableNeighbors[0];
  }

  public update(time: number, delta: number): void {
    // If player is downed or dead, player cannot act and enemies stop attacking
    if (this.player.state === 'downed' || this.player.state === 'dead') {
      this.player.clearTarget();
      return;
    }

    // 1. Enemy AI: Aggro detection, Leashing, Pursuit ('chasing') & Auto-Attack ('attacking')
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.state === 'downed' || enemy.state === 'dead') continue;

      // Use physical tile positions from sprite x, y for accurate distance calculations
      const enemyTileX = Math.floor(enemy.x / enemy.tileSize);
      const enemyTileY = Math.floor(enemy.y / enemy.tileSize);
      const playerTileX = Math.floor(this.player.x / this.player.tileSize);
      const playerTileY = Math.floor(this.player.y / this.player.tileSize);

      const dx = Math.abs(enemyTileX - playerTileX);
      const dy = Math.abs(enemyTileY - playerTileY);
      const distanceTiles = Math.max(dx, dy); // Chebyshev distance

      const distFromSpawn = Math.max(
        Math.abs(enemyTileX - enemy.spawnPos.x),
        Math.abs(enemyTileY - enemy.spawnPos.y)
      );

      // Proximity Aggro check:
      // Only aggro from proximity if not currently aggroed, not returning, and within max leash distance from spawn
      if (!enemy.isAggroed && enemy.state !== 'returning' && distFromSpawn <= enemy.maxLeashDistance) {
        if (distanceTiles <= enemy.enemyData.aggroRadius) {
          enemy.isAggroed = true;
          enemy.outOfAggroTimerMs = 0;
          enemy.state = 'chasing';
          console.log(`[Combat] ${enemy.entityName} aggroed on Player! (Distance: ${distanceTiles} tiles)`);
        }
      }

      if (enemy.isAggroed) {
        // Leash Check 1: Max leash distance from spawn point
        const exceededLeashDistance = distFromSpawn > enemy.maxLeashDistance;

        // Leash Check 2: Player continuously outside aggro radius timeout
        if (distanceTiles > enemy.enemyData.aggroRadius) {
          enemy.outOfAggroTimerMs += delta;
        } else {
          enemy.outOfAggroTimerMs = 0;
        }
        const timedOut = enemy.outOfAggroTimerMs >= enemy.leashTimeoutMs;

        // Leash Check 3: Line of Sight check
        const enemyTilePos = { x: enemyTileX, y: enemyTileY };
        const playerTilePos = { x: playerTileX, y: playerTileY };
        const hasLOS = this.pathfinder.hasLineOfSight(enemyTilePos, playerTilePos);

        if (exceededLeashDistance || timedOut || !hasLOS) {
          const reason = exceededLeashDistance
            ? `pursued beyond max leash distance (${distFromSpawn} > ${enemy.maxLeashDistance} tiles)`
            : timedOut
            ? `player outside aggro radius for ${(enemy.outOfAggroTimerMs / 1000).toFixed(1)}s`
            : `line of sight blocked by obstacle`;
          console.log(`[Combat] ${enemy.entityName} gave up chase (${reason}). Returning to spawn (${enemy.spawnPos.x}, ${enemy.spawnPos.y}). (hasLOS: ${hasLOS}, exceededLeash: ${exceededLeashDistance}, timedOut: ${timedOut})`);

          enemy.isAggroed = false;
          enemy.outOfAggroTimerMs = 0;
          enemy.state = 'returning';

          this.pathfinder.findPath(enemyTilePos, enemy.spawnPos).then((path) => {
            if (path.length > 0 && enemy.state === 'returning') {
              enemy.followPath(path, () => {
                if (enemy.state === 'returning') {
                  enemy.state = 'idle';
                  console.log(`[Combat] ${enemy.entityName} arrived at spawnPos. State set to 'idle'. Proximity aggro restored.`);
                }
              });
            } else {
              enemy.state = 'idle';
              console.log(`[Combat] ${enemy.entityName} already at spawnPos. State set to 'idle'. Proximity aggro restored.`);
            }
          });

          continue; // Skip attack/chase logic for this tick
        }

        // Combat AI: Melee attack execution vs Pursuit
        const attackRange = enemy.enemyData.attackRangeTiles ?? 1;

        if (distanceTiles <= attackRange) {
          // 1. Arrival Transition: If not already attacking, halt movement and set state to 'attacking'
          if (enemy.state !== 'attacking') {
            const oldState = enemy.state;
            enemy.stopMovement();
            enemy.state = 'attacking';
            if (CombatSystem.DEBUG_AI) {
              console.log(
                `[Combat AI] ${enemy.entityName} reached attack range (distanceTiles: ${distanceTiles}). State transition: '${oldState}' -> 'attacking'`
              );
            }
          }

          // 2. Attack Execution on Cooldown
          if (time - enemy.lastAttackTime >= enemy.enemyData.attackIntervalMs) {
            // Re-verify range at exact moment attack lands
            if (distanceTiles <= attackRange) {
              enemy.lastAttackTime = time;
              const damage = enemy.enemyData.meleeDamage;
              console.log(
                `[Combat] ${enemy.entityName} attacks Player for ${damage} damage! (distance: ${distanceTiles})`
              );
              this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0xef4444);

              const playerDowned = this.player.takeDamage(damage);
              if (playerDowned) {
                console.log('[Combat] Player has been downed by enemy attack!');
                this.player.clearTarget();
              }
            } else {
              // Target moved out of range at exact moment of attack tick
              if (CombatSystem.DEBUG_AI) {
                console.log(
                  `[Combat AI] ${enemy.entityName} attack missed: player moved out of range (distanceTiles: ${distanceTiles}).`
                );
              }
              enemy.state = 'chasing';
            }
          }
        } else {
          // Target is out of melee range (distanceTiles > attackRange)
          if (enemy.state === 'attacking' || enemy.state === 'idle') {
            const oldState = enemy.state;
            enemy.state = 'chasing';
            if (CombatSystem.DEBUG_AI) {
              console.log(
                `[Combat AI] ${enemy.entityName} target out of range (distanceTiles: ${distanceTiles}). State transition: '${oldState}' -> 'chasing'`
              );
            }
          }

          if (enemy.state === 'chasing' || enemy.state === 'moving') {
            const startTile = enemy.gridPos;
            const targetTile = this.getBestAdjacentTile(startTile, playerTilePos) || playerTilePos;

            const isStopped = !enemy.isMoving();
            const timeForRepath = time - enemy.lastRepathTimeMs >= enemy.repathIntervalMs;

            if (isStopped || timeForRepath) {
              const alreadyHeadingToTarget =
                enemy.isMoving() && enemy.gridPos.x === targetTile.x && enemy.gridPos.y === targetTile.y;

              if (!alreadyHeadingToTarget) {
                enemy.lastRepathTimeMs = time;
                this.pathfinder.findPath(startTile, targetTile).then((path) => {
                  if (CombatSystem.DEBUG_AI) {
                    console.log(
                      `[Combat AI] Repath from (${startTile.x},${startTile.y}) to target (${targetTile.x},${targetTile.y}) -> path length: ${path.length}`
                    );
                  }
                  if (
                    path.length > 0 &&
                    (enemy.state as string) !== 'downed' &&
                    (enemy.state as string) !== 'dead' &&
                    enemy.isAggroed &&
                    this.player.state !== 'downed'
                  ) {
                    enemy.followPath(path);
                  }
                });
              }
            }
          }
        }
      }
    }

    // 2. Player Auto-Attack & Auto-Skill Loop against Target Entity
    if (
      this.player.targetEntity &&
      this.player.targetEntity.state !== 'downed' &&
      this.player.targetEntity.state !== 'dead'
    ) {
      const target = this.player.targetEntity;
      const dx = Math.abs(this.player.gridPos.x - target.gridPos.x);
      const dy = Math.abs(this.player.gridPos.y - target.gridPos.y);
      const distanceTiles = Math.max(dx, dy);

      if (distanceTiles <= this.player.attackRangeTiles) {
        const dataLoader = DataLoader.getInstance();
        const weaponId = this.player.equippedWeapon.id;

        // Check if any equipped skill auto-cast conditions are met
        let usedSkill = false;

        for (const skillId of this.player.equippedSkillIds) {
          // Autocast switch check: if OFF, this skill never auto-fires
          if (!this.player.isAutocastEnabled(skillId)) {
            continue;
          }

          const skillDef = dataLoader.getSkill(skillId);
          if (!skillDef || !this.progressionSystem.isSkillUnlocked(skillDef)) {
            continue;
          }

          const lastUsed = this.player.lastSkillUseTimes.get(skillId) || 0;
          const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
          const isAffordable = this.player.energy >= skillDef.energyCost;
          const isWeaponReady = time - this.player.lastAttackTime >= this.player.equippedWeapon.attackIntervalMs;

          if (isOffCooldown && isAffordable && isWeaponReady) {
            usedSkill = true;
            // Deduct Energy & trigger skill
            this.player.energy -= skillDef.energyCost;
            this.player.lastSkillUseTimes.set(skillId, time);
            this.player.lastAttackTime = time;
            this.player.state = 'attacking';

            const baseDamage = this.player.equippedWeapon.baseDamage;
            const skillDamage = Math.floor(baseDamage * skillDef.damageMultiplier);

            console.log(`[Skill] Player casts ${skillDef.name}! Dealt ${skillDamage} damage (${skillDef.damageMultiplier * 100}% base)`);
            this.createSkillAttackEffect(this.player.x, this.player.y, target.x, target.y);
            this.createFloatingText(target.x, target.y - 10, `${skillDef.name.toUpperCase()}!`, '#f59e0b');

            // Roll Bleed status effect chance
            this.checkAndApplyBleed(target);

            // Grant proficiency EXP on skill hit
            this.progressionSystem.addProficiencyExp(weaponId, 2);

            const targetDowned = target.takeDamage(skillDamage);
            if (targetDowned) {
              this.handleTargetDefeated(target, weaponId);
            }
            break;
          }
        }

        // Standard weapon attack if no skill was used
        if (!usedSkill) {
          if (time - this.player.lastAttackTime >= this.player.equippedWeapon.attackIntervalMs) {
            this.player.lastAttackTime = time;
            this.player.state = 'attacking';

            const damage = this.player.equippedWeapon.baseDamage;
            console.log(`[Combat] Player attacks ${target.entityName} with ${this.player.equippedWeapon.name} for ${damage} damage!`);
            this.createAttackEffect(this.player.x, this.player.y, target.x, target.y, 0x3b82f6);

            // Roll Bleed status effect chance
            this.checkAndApplyBleed(target);

            // Grant proficiency EXP on hit
            this.progressionSystem.addProficiencyExp(weaponId, 2);

            const targetDowned = target.takeDamage(damage);
            if (targetDowned) {
              this.handleTargetDefeated(target, weaponId);
            }
          }
        }
      }
    }
  }

  private checkAndApplyBleed(target: Entity): void {
    const weapon = this.player.equippedWeapon;
    if (weapon.bleedChance && Math.random() < weapon.bleedChance) {
      const bleedDef = DataLoader.getInstance().getStatusEffect('bleed');
      if (bleedDef) {
        console.log(`[StatusEffect] Applied Bleed to ${target.entityName}!`);
        target.applyStatusEffect(bleedDef);
        this.createFloatingText(target.x, target.y - 25, 'BLEED!', '#ef4444');
      }
    }
  }

  private handleTargetDefeated(target: Entity, weaponId: string): void {
    console.log(`[Combat] ${target.entityName} defeated/downed!`);
    // Bonus EXP on kill/downing target
    this.progressionSystem.addProficiencyExp(weaponId, 4);

    this.player.clearTarget();

    if (target instanceof Enemy) {
      if (this.onEnemyDeathCallback) {
        this.onEnemyDeathCallback(target);
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

  private createSkillAttackEffect(fromX: number, fromY: number, toX: number, toY: number): void {
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(4, 0xf59e0b, 1); // Gold stroke
    graphics.lineBetween(fromX, fromY, toX, toY);

    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 350,
      onComplete: () => {
        graphics.destroy();
      }
    });
  }

  private createFloatingText(x: number, y: number, textString: string, colorHex: string): void {
    const text = this.scene.add.text(x, y, textString, {
      fontSize: '11px',
      color: colorHex,
      fontStyle: 'bold'
    });
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: y - 18,
      alpha: 0,
      duration: 700,
      onComplete: () => text.destroy()
    });
  }
}
