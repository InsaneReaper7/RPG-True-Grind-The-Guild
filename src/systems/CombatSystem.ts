import Phaser from 'phaser';
import { Entity } from '../entities/Entity';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Pathfinder } from '../utils/Pathfinder';
import { ProgressionSystem } from './ProgressionSystem';
import { DataLoader } from '../utils/DataLoader';
import { GridPos } from '../types/game';
import { HiddenSkillSystem, CombatContext, CounterattackResult } from './HiddenSkillSystem';

export class CombatSystem {
  public static readonly DEBUG_AI: boolean = false;

  private scene: Phaser.Scene;
  private player: Player;
  private enemies: Enemy[];
  private pathfinder: Pathfinder;
  private progressionSystem: ProgressionSystem;
  private onEnemyDeathCallback?: (enemy: Enemy) => void;
  private lastCombatTimeMs: number = 0;
  private lastPassiveTickTimeMs: number = 0;

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
              this.lastCombatTimeMs = time;
              const rawDamage = enemy.enemyData.meleeDamage;

              // Context for HiddenSkillSystem
              const hiddenSystem = HiddenSkillSystem.getInstance();
              const context: CombatContext = {
                equippedWeapon: this.player.equippedWeapon,
                hasShield: false, // Strict: no shield item exists in game yet
                hasMagicProficiency: false, // Strict: no magic weapon exists in game yet
                inCombat: true,
                attackerDistanceTiles: distanceTiles,
                isMeleeAttack: true
              };

              // 1. STRICT SHORT-CIRCUITING AVOIDANCE CHAIN (Evasion -> Parry -> Block)
              const avoidance = hiddenSystem.resolveIncomingAttack(context, this.progressionSystem);

              if (avoidance.type === 'evaded') {
                console.log(`[Combat] 💨 Player EVADED attack from ${enemy.entityName}! (0 damage)`);
                this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0x60a5fa);
                this.createFloatingText(this.player.x, this.player.y - 12, 'EVADED!', '#60a5fa');

                // Counterattack trigger: fires at most once per avoided attack
                const counterRes = hiddenSystem.resolveCounterattack(context, this.progressionSystem);
                if (counterRes.procced) {
                  this.executePlayerCounterattack(enemy, counterRes);
                }
              } else if (avoidance.type === 'parried') {
                console.log(`[Combat] ⚔️ Player PARRIED attack from ${enemy.entityName}! (0 damage)`);
                this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0xfacc15);
                this.createFloatingText(this.player.x, this.player.y - 12, 'PARRIED!', '#facc15');

                // Counterattack trigger: fires at most once per avoided attack
                const counterRes = hiddenSystem.resolveCounterattack(context, this.progressionSystem);
                if (counterRes.procced) {
                  this.executePlayerCounterattack(enemy, counterRes);
                }
              } else if (avoidance.type === 'blocked') {
                console.log(`[Combat] 🛡️ Player BLOCKED attack from ${enemy.entityName}! (0 damage)`);
                this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0x38bdf8);
                this.createFloatingText(this.player.x, this.player.y - 12, 'BLOCKED!', '#38bdf8');

                // Counterattack trigger: fires at most once per avoided attack
                const counterRes = hiddenSystem.resolveCounterattack(context, this.progressionSystem);
                if (counterRes.procced) {
                  this.executePlayerCounterattack(enemy, counterRes);
                }
              } else {
                // 2. Attack Connected: deals damage, then rolls Resilience
                this.createAttackEffect(enemy.x, enemy.y, this.player.x, this.player.y, 0xef4444);

                const mitigation = hiddenSystem.resolveDamageTaken(context, this.progressionSystem, rawDamage);
                const actualDamage = mitigation.finalDamage;

                if (mitigation.mitigatedAmount > 0) {
                  console.log(`[Combat] ${enemy.entityName} hits Player for ${actualDamage} damage! (Resilience mitigated ${mitigation.mitigatedAmount} dmg)`);
                  this.createFloatingText(this.player.x, this.player.y - 20, `-${actualDamage} (${mitigation.mitigatedAmount} RESIST)`, '#a78bfa');
                } else if (mitigation.procced) {
                  console.log(`[Combat] ${enemy.entityName} hits Player for ${actualDamage} damage! (Resilience proc: +1 EXP)`);
                  this.createFloatingText(this.player.x, this.player.y - 20, `RESILIENCE! -${actualDamage}`, '#a78bfa');
                } else {
                  console.log(`[Combat] ${enemy.entityName} hits Player for ${actualDamage} damage!`);
                }

                const playerDowned = this.player.takeDamage(actualDamage);
                if (playerDowned) {
                  console.log('[Combat] Player has been downed by enemy attack!');
                  this.player.clearTarget();
                }
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

        // Calculate weapon effective damage and uncapped accuracy with Mood tier modifiers
        const weapon = this.player.equippedWeapon;
        const weaponLevel = this.progressionSystem.getProficiencyLevel(weaponId);
        const damageBonusPerLevel = weapon.levelBonus?.damagePerLevel ?? 0;
        const accuracyBonusPerLevel = weapon.levelBonus?.accuracyPerLevel ?? 0;
        const rawBaseDamage = weapon.baseDamage + (weaponLevel * damageBonusPerLevel);
        const baseAccuracy = weapon.baseAccuracy ?? 0.60;

        const moodTier = dataLoader.getMoodTier(this.player.mood);
        const effectiveBaseDamage = rawBaseDamage * moodTier.combatDamageMultiplier;
        // Strictly uncapped: accuracy must be allowed to exceed 1.0 / 100% to offset future enemy Evasion
        const effectiveAccuracy = baseAccuracy + (weaponLevel * accuracyBonusPerLevel) + moodTier.combatAccuracyBonus;

        // Check if any equipped skill auto-cast conditions are met
        let usedSkill = false;

        for (const skillId of this.player.equippedSkillIds) {
          // Autocast switch check: if OFF, this skill never auto-fires
          if (!this.player.isAutocastEnabled(skillId)) {
            continue;
          }

          const skillDef = dataLoader.getSkill(skillId);
          if (!skillDef || !this.progressionSystem.isSkillUnlocked(skillDef, this.player)) {
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

            this.createSkillAttackEffect(this.player.x, this.player.y, target.x, target.y);

            // Power Strike rolls against the exact same weapon accuracy check
            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveAccuracy;

            if (!isHit) {
              console.log(`[Skill] Player casts ${skillDef.name} with ${weapon.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%, Roll: ${(hitRoll * 100).toFixed(1)}%)`);
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              const skillDamage = effectiveBaseDamage * skillDef.damageMultiplier;
              console.log(`[Skill] Player casts ${skillDef.name}! Dealt ${skillDamage.toFixed(1)} damage (${skillDef.damageMultiplier * 100}% of ${effectiveBaseDamage.toFixed(2)} Mood-adjusted base [Mood: ${moodTier.name} x${moodTier.combatDamageMultiplier}]) [Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%]`);
              this.createFloatingText(target.x, target.y - 10, `${skillDef.name.toUpperCase()}! -${skillDamage.toFixed(1)}`, '#f59e0b');

              // Roll Bleed status effect chance
              this.checkAndApplyBleed(target);

              // Grant proficiency EXP on skill hit
              const result = this.progressionSystem.addProficiencyExp(weaponId, 2);
              if (result.leveledUp) {
                const newLevel = this.progressionSystem.getProficiencyLevel(weaponId);
                this.createFloatingText(this.player.x, this.player.y - 20, `${weapon.name} Level ${newLevel}!`, '#22c55e');
              }

              const targetDowned = target.takeDamage(skillDamage);
              if (targetDowned) {
                this.handleTargetDefeated(target, weaponId);
              }
            }
            break;
          }
        }

        // Standard weapon attack if no skill was used
        if (!usedSkill) {
          if (time - this.player.lastAttackTime >= this.player.equippedWeapon.attackIntervalMs) {
            this.player.lastAttackTime = time;
            this.player.state = 'attacking';

            this.createAttackEffect(this.player.x, this.player.y, target.x, target.y, 0x3b82f6);

            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveAccuracy;

            if (!isHit) {
              console.log(`[Combat] Player attacks ${target.entityName} with ${weapon.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%, Roll: ${(hitRoll * 100).toFixed(1)}%)`);
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              const damage = effectiveBaseDamage;
              console.log(`[Combat] Player attacks ${target.entityName} with ${weapon.name} for ${damage.toFixed(1)} damage! (Base: ${weapon.baseDamage}, Lv ${weaponLevel} Bonus: +${(weaponLevel * damageBonusPerLevel).toFixed(1)}, Mood: ${moodTier.name} x${moodTier.combatDamageMultiplier}, Accuracy: ${(effectiveAccuracy * 100).toFixed(1)}%)`);
              this.createFloatingText(target.x, target.y - 10, `-${damage.toFixed(1)}`, '#38bdf8');

              // Roll Bleed status effect chance
              this.checkAndApplyBleed(target);

              // Grant proficiency EXP on hit
              const result = this.progressionSystem.addProficiencyExp(weaponId, 2);
              if (result.leveledUp) {
                const newLevel = this.progressionSystem.getProficiencyLevel(weaponId);
                this.createFloatingText(this.player.x, this.player.y - 20, `${weapon.name} Level ${newLevel}!`, '#22c55e');
              }

              const targetDowned = target.takeDamage(damage);
              if (targetDowned) {
                this.handleTargetDefeated(target, weaponId);
              }
            }
          }
        }
      }
    }

    // 3. Passive Regen Ticks (Out of Combat Health Regen & Mana Regen)
    const anyEnemyAggroed = this.enemies.some((e) => e.isAggroed && e.state !== 'dead' && e.state !== 'downed');
    const inCombat = anyEnemyAggroed || (time - this.lastCombatTimeMs < 4000);

    if (time - this.lastPassiveTickTimeMs >= 3000) {
      this.lastPassiveTickTimeMs = time;
        const hiddenSystem = HiddenSkillSystem.getInstance();
        const context: CombatContext = {
          equippedWeapon: this.player.equippedWeapon,
          hasShield: false,
          hasMagicProficiency: false,
          inCombat
        };

        const regenResult = hiddenSystem.resolvePassiveRegen(context, this.progressionSystem);
        if (regenResult.healthRestored > 0) {
          const restored = this.player.heal(regenResult.healthRestored);
          if (restored > 0) {
            console.log(`[Regen] Health Regen tick! Restored +${restored} HP`);
            this.createFloatingText(this.player.x, this.player.y - 15, `+${restored} HP`, '#22c55e');
          }
        }
        if (regenResult.energyRestored > 0) {
          const oldEnergy = this.player.energy;
          this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + regenResult.energyRestored);
          const restored = Math.floor(this.player.energy - oldEnergy);
          if (restored > 0) {
            console.log(`[Regen] Mana Regen tick! Restored +${restored} Energy`);
            this.createFloatingText(this.player.x, this.player.y - 15, `+${restored} EN`, '#3b82f6');
          }
        }
      }
    }

  private executePlayerCounterattack(enemy: Enemy, counterResult: CounterattackResult): void {
    if (enemy.state === 'downed' || enemy.state === 'dead') return;
    const weapon = this.player.equippedWeapon;
    const weaponLevel = this.progressionSystem.getProficiencyLevel(weapon.id);
    const damageBonusPerLevel = weapon.levelBonus?.damagePerLevel ?? 0;
    const baseDamage = weapon.baseDamage + (weaponLevel * damageBonusPerLevel);

    let counterDmg = Math.max(1, Math.round(baseDamage * counterResult.damageMultiplier));
    let isCrit = false;
    if (counterResult.canCrit && Math.random() < 0.25) {
      counterDmg = Math.round(counterDmg * 1.5);
      isCrit = true;
    }

    console.log(`[Combat] ⚡ COUNTERATTACK! Player retaliates against ${enemy.entityName} for ${counterDmg} damage!`);
    this.createSkillAttackEffect(this.player.x, this.player.y, enemy.x, enemy.y);
    this.createFloatingText(
      enemy.x,
      enemy.y - 15,
      isCrit ? `CRIT COUNTER! -${counterDmg}` : `COUNTER! -${counterDmg}`,
      '#f59e0b'
    );

    const enemyDowned = enemy.takeDamage(counterDmg);
    if (enemyDowned) {
      this.handleTargetDefeated(enemy, weapon.id);
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
    const result = this.progressionSystem.addProficiencyExp(weaponId, 4);
    if (result.leveledUp) {
      const newLevel = this.progressionSystem.getProficiencyLevel(weaponId);
      this.createFloatingText(this.player.x, this.player.y - 20, `Level Up! Level ${newLevel}`, '#22c55e');
    }

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
