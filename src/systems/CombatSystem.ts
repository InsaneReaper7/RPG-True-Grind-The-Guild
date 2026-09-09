import type Phaser from 'phaser';
import { Entity } from '../entities/Entity.ts';
import { Player } from '../entities/Player.ts';
import { Enemy } from '../entities/Enemy.ts';
import { Pathfinder } from '../utils/Pathfinder.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import type { GridPos, WeaponDef } from '../types/game.ts';
import { HiddenSkillSystem, type CombatContext, type CounterattackResult } from './HiddenSkillSystem.ts';
import { GameState } from './GameState.ts';

export class CombatSystem {
  public static readonly DEBUG_AI: boolean = false;

  private scene: Phaser.Scene;
  public party: Player[];
  private enemies: Enemy[];
  private pathfinder: Pathfinder;
  private onEnemyDeathCallback?: (enemy: Enemy) => void;
  private lastCombatTimeMs: number = 0;
  private lastPassiveTickTimeMs: number = 0;
  private enemyTargets: Map<Enemy, Player> = new Map();

  constructor(
    scene: Phaser.Scene,
    playerOrParty: Player | Player[],
    enemies: Enemy[],
    pathfinder: Pathfinder,
    _progressionSystem?: ProgressionSystem,
    onEnemyDeath?: (enemy: Enemy) => void
  ) {
    this.scene = scene;
    this.party = Array.isArray(playerOrParty) ? playerOrParty : [playerOrParty];
    this.enemies = enemies;
    this.pathfinder = pathfinder;
    this.onEnemyDeathCallback = onEnemyDeath;
  }

  public get player(): Player {
    return this.party[0];
  }

  public get progressionSystem(): ProgressionSystem {
    return this.party[0]?.progression;
  }

  public setParty(party: Player[]): void {
    this.party = party;
  }

  public setEnemies(enemies: Enemy[]): void {
    this.enemies = enemies;
  }

  public addPartyMember(member: Player): void {
    if (!this.party.includes(member)) {
      this.party.push(member);
    }
  }

  public getParty(): Player[] {
    return [...this.party];
  }

  /**
   * Finds the closest valid, living party member within enemy's aggro radius and LOS.
   */
  public findBestTargetInParty(enemy: Enemy): Player | null {
    const enemyTile = {
      x: Math.floor(enemy.x / enemy.tileSize),
      y: Math.floor(enemy.y / enemy.tileSize)
    };
    const distFromSpawn = Math.max(
      Math.abs(enemyTile.x - enemy.spawnPos.x),
      Math.abs(enemyTile.y - enemy.spawnPos.y)
    );
    if (distFromSpawn > enemy.maxLeashDistance) return null;

    const validCandidates: { member: Player; dist: number }[] = [];

    for (const member of this.party) {
      if (member.state === 'downed' || member.state === 'dead') continue;
      const memberTile = {
        x: Math.floor(member.x / member.tileSize),
        y: Math.floor(member.y / member.tileSize)
      };
      const dist = Math.max(Math.abs(enemyTile.x - memberTile.x), Math.abs(enemyTile.y - memberTile.y));
      if (dist <= enemy.enemyData.aggroRadius) {
        if (this.pathfinder.hasLineOfSight(enemyTile, memberTile)) {
          validCandidates.push({ member, dist });
        }
      }
    }

    if (validCandidates.length === 0) return null;
    validCandidates.sort((a, b) => a.dist - b.dist);
    return validCandidates[0].member;
  }

  private getOtherUnitPositions(currentUnit?: Entity): GridPos[] {
    const positions: GridPos[] = [];
    for (const e of this.enemies) {
      if (e !== currentUnit && e.state !== 'dead' && e.state !== 'downed') {
        positions.push(e.gridPos);
      }
    }
    for (const m of this.party) {
      if (m !== currentUnit && m.state !== 'dead' && m.state !== 'downed') {
        positions.push(m.gridPos);
      }
    }
    return positions;
  }

  private getBestAdjacentTile(enemyTile: GridPos, playerTile: GridPos, currentEnemy?: Enemy): GridPos | null {
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

    // Filter out tiles occupied or claimed by other units (other enemies or party members)
    const isOccupiedByOther = (tile: GridPos) => {
      return this.isTileClaimedOrOccupiedByOther(tile.x, tile.y, currentEnemy as any);
    };

    // If enemy is already on one of the walkable adjacent tiles and it's not occupied by another unit, keep that tile!
    if (!isOccupiedByOther(enemyTile)) {
      const currentIsAdjacent = walkableNeighbors.find(
        (n) => n.x === enemyTile.x && n.y === enemyTile.y
      );
      if (currentIsAdjacent) {
        return currentIsAdjacent;
      }
    }

    const unoccupiedNeighbors = walkableNeighbors.filter((n) => !isOccupiedByOther(n));
    const candidateList = unoccupiedNeighbors.length > 0 ? unoccupiedNeighbors : walkableNeighbors;

    // Sort candidate neighbors by Chebyshev distance to enemyTile to pick the closest adjacent tile
    candidateList.sort((a, b) => {
      const distA = Math.max(Math.abs(a.x - enemyTile.x), Math.abs(a.y - enemyTile.y));
      const distB = Math.max(Math.abs(b.x - enemyTile.x), Math.abs(b.y - enemyTile.y));
      return distA - distB;
    });

    return candidateList[0];
  }

  /**
   * Milestone 20: Finds an open staging tile within attackRangeTiles with direct Line of Sight
   * for ranged enemies so they do not close to melee distance during pursuit.
   */
  public findRangedStagingTile(enemy: Enemy, target: Entity, attackRange: number): GridPos | null {
    const enemyTile = enemy.gridPos;
    const targetTile = target.gridPos;
    const candidates: { tile: GridPos; distToEnemy: number; distToTarget: number }[] = [];

    // Search concentric rings from attackRange down to Math.max(2, attackRange - 1)
    for (let r = attackRange; r >= Math.max(2, attackRange - 1); r--) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetTile.x + dx;
          const ty = targetTile.y + dy;

          if (this.pathfinder.isObstacle(tx, ty)) continue;
          if (this.isTileClaimedOrOccupiedByOther(tx, ty, enemy)) continue;

          const distFromSpawn = Math.max(Math.abs(tx - enemy.spawnPos.x), Math.abs(ty - enemy.spawnPos.y));
          if (distFromSpawn > enemy.maxLeashDistance) continue;

          if (!this.pathfinder.hasLineOfSight({ x: tx, y: ty }, targetTile)) continue;

          const distToEnemy = Math.max(Math.abs(tx - enemyTile.x), Math.abs(ty - enemyTile.y));
          candidates.push({ tile: { x: tx, y: ty }, distToEnemy, distToTarget: r });
        }
      }
      if (candidates.length > 0) break; // Found open staging tiles in outermost ring
    }

    if (candidates.length === 0) {
      // Fallback: getBestAdjacentTile if no ring tiles open
      return this.getBestAdjacentTile(enemyTile, targetTile, enemy);
    }

    // Sort by distance to enemy (pick the nearest staging tile to current enemy position)
    candidates.sort((a, b) => a.distToEnemy - b.distToEnemy);
    return candidates[0].tile;
  }

  /**
   * Milestone 20: Evaluates retreat tiles when a target closes in on a ranged enemy (distance <= 2)
   * to backpedal and maintain spacing while preserving line of sight and staying within leash distance.
   */
  public findKiteTile(enemy: Enemy, target: Entity, attackRange: number): GridPos | null {
    const enemyTile = enemy.gridPos;
    const targetTile = target.gridPos;
    const currentDist = Math.max(Math.abs(enemyTile.x - targetTile.x), Math.abs(enemyTile.y - targetTile.y));

    const candidates: { tile: GridPos; distToTarget: number; distToEnemy: number }[] = [];

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;
        const tx = enemyTile.x + dx;
        const ty = enemyTile.y + dy;

        if (this.pathfinder.isObstacle(tx, ty)) continue;
        if (this.isTileClaimedOrOccupiedByOther(tx, ty, enemy)) continue;

        const distFromSpawn = Math.max(Math.abs(tx - enemy.spawnPos.x), Math.abs(ty - enemy.spawnPos.y));
        if (distFromSpawn > enemy.maxLeashDistance) continue;

        const distToTarget = Math.max(Math.abs(tx - targetTile.x), Math.abs(ty - targetTile.y));
        // Must strictly increase distance from target and not exceed attackRange
        if (distToTarget <= currentDist) continue;
        if (distToTarget > attackRange) continue;

        if (!this.pathfinder.hasLineOfSight({ x: tx, y: ty }, targetTile)) continue;

        const distToEnemy = Math.max(Math.abs(dx), Math.abs(dy));
        candidates.push({ tile: { x: tx, y: ty }, distToTarget, distToEnemy });
      }
    }

    if (candidates.length === 0) return null;

    // Prioritize tiles that maximize distance to target up to attackRange, while minimizing move distance from enemy
    candidates.sort((a, b) => {
      const scoreA = (attackRange - a.distToTarget) * 2 + a.distToEnemy;
      const scoreB = (attackRange - b.distToTarget) * 2 + b.distToEnemy;
      return scoreA - scoreB;
    });

    return candidates[0].tile;
  }

  public isTileClaimedOrOccupiedByOther(
    tx: number,
    ty: number,
    currentUnit?: Entity,
    reservedKeys?: Set<string>
  ): boolean {
    if (this.pathfinder.isObstacle(tx, ty)) return true;
    const key = `${tx},${ty}`;
    if (reservedKeys && reservedKeys.has(key)) return true;

    for (const m of this.party) {
      if (m !== currentUnit && m.state !== 'dead' && m.state !== 'downed') {
        if (m.gridPos.x === tx && m.gridPos.y === ty) return true;
        if (m.claimedDestination && m.claimedDestination.x === tx && m.claimedDestination.y === ty) return true;
      }
    }
    for (const e of this.enemies) {
      if (e !== currentUnit && e.state !== 'dead' && e.state !== 'downed') {
        if (e.gridPos.x === tx && e.gridPos.y === ty) return true;
        if (e.claimedDestination && e.claimedDestination.x === tx && e.claimedDestination.y === ty) return true;
      }
    }
    return false;
  }

  public findOpenAttackTileForMember(
    enemy: Entity,
    member: Player,
    reservedKeys?: Set<string>
  ): GridPos | null {
    const range = member.attackRangeTiles || 1;
    const candidates: GridPos[] = [];

    // Collect candidate offsets strictly within attackRangeTiles
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
        const tx = enemy.gridPos.x + dx;
        const ty = enemy.gridPos.y + dy;
        if (!this.isTileClaimedOrOccupiedByOther(tx, ty, member, reservedKeys)) {
          candidates.push({ x: tx, y: ty });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const distA = Math.hypot(a.x - member.gridPos.x, a.y - member.gridPos.y);
        const distB = Math.hypot(b.x - member.gridPos.x, b.y - member.gridPos.y);
        return distA - distB;
      });
      return candidates[0];
    }

    // Concentric ring fallback: If all attack-range tiles are occupied/claimed,
    // search rings (range + 1) to (range + 3) for the nearest open staging tile to the enemy.
    for (let r = range + 1; r <= range + 3; r++) {
      const fallbackCandidates: GridPos[] = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = enemy.gridPos.x + dx;
          const ty = enemy.gridPos.y + dy;
          if (!this.isTileClaimedOrOccupiedByOther(tx, ty, member, reservedKeys)) {
            fallbackCandidates.push({ x: tx, y: ty });
          }
        }
      }
      if (fallbackCandidates.length > 0) {
        fallbackCandidates.sort((a, b) => {
          const distA = Math.hypot(a.x - member.gridPos.x, a.y - member.gridPos.y);
          const distB = Math.hypot(b.x - member.gridPos.x, b.y - member.gridPos.y);
          return distA - distB;
        });
        return fallbackCandidates[0];
      }
    }

    // Zero valid tiles found: return null so unit holds position rather than stacking
    return null;
  }

  public findOpenAdjacentForMember(center: GridPos, _preferredNear?: GridPos, currentMember?: Player): GridPos | null {
    if (!currentMember) return null;
    const dummyEnemy = { gridPos: center } as Entity;
    return this.findOpenAttackTileForMember(dummyEnemy, currentMember);
  }

  public update(time: number, delta: number): void {
    const anyEnemyAggroed = this.enemies.some((e) => e.isAggroed && e.state !== 'dead' && e.state !== 'downed');
    const anyPartyEngaged = this.party.some((m) => m.state !== 'dead' && m.state !== 'downed' && m.targetEntity !== null && m.targetEntity.state !== 'dead' && m.targetEntity.state !== 'downed');
    const anyEnemyTargetingParty = this.enemies.some((e) => e.state !== 'dead' && e.state !== 'downed' && e.targetEntity !== null && e.targetEntity.state !== 'dead' && e.targetEntity.state !== 'downed');
    const inCombat = anyEnemyAggroed || anyPartyEngaged || anyEnemyTargetingParty || (time - this.lastCombatTimeMs < 4000);

    // Clear targets for any downed or dead party members
    for (const member of this.party) {
      if (member.state === 'downed' || member.state === 'dead') {
        member.clearTarget();
      }
    }

    // 1. Enemy AI: Aggro detection, Leashing, Retargeting Machine, Pursuit & Auto-Attack
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.state === 'downed' || enemy.state === 'dead') continue;

      // Stun check: stunned enemy halts movement and cannot act
      if (enemy.hasStatusEffect('stun')) {
        enemy.stopMovement();
        continue;
      }

      let target = this.enemyTargets.get(enemy) || null;

      // Taunt handling & forced targeting
      const isTaunted = enemy.hasStatusEffect('taunted');
      if (isTaunted) {
        if (!enemy.tauntSource || enemy.tauntSource.state === 'downed' || enemy.tauntSource.state === 'dead') {
          // Early break: taunter is dead or downed!
          console.log(`[Combat] 💔 Taunt broke early on ${enemy.entityName}: taunter is downed/dead!`);
          enemy.removeStatusEffect('taunted');
          enemy.tauntSource = null;
          const nextTarget = this.findBestTargetInParty(enemy);
          if (nextTarget) {
            target = nextTarget;
            this.enemyTargets.set(enemy, target);
            enemy.isAggroed = true;
            enemy.outOfAggroTimerMs = 0;
            enemy.state = 'chasing';
          }
        } else if (enemy.tauntSource) {
          // Force locked target to tauntSource
          target = enemy.tauntSource;
          this.enemyTargets.set(enemy, target);
          enemy.isAggroed = true;
          enemy.outOfAggroTimerMs = 0;
        }
      } else if (enemy.tauntSource) {
        // Taunt expired naturally
        console.log(`[Combat] ⏰ Taunt on ${enemy.entityName} expired cleanly. Re-evaluating targeting from scratch.`);
        enemy.tauntSource = null;
        const nextTarget = this.findBestTargetInParty(enemy);
        if (nextTarget) {
          target = nextTarget;
          this.enemyTargets.set(enemy, target);
          enemy.isAggroed = true;
          enemy.outOfAggroTimerMs = 0;
          enemy.state = 'chasing';
        }
      }

      const enemyTile = {
        x: Math.floor(enemy.x / enemy.tileSize),
        y: Math.floor(enemy.y / enemy.tileSize)
      };
      const distFromSpawn = Math.max(
        Math.abs(enemyTile.x - enemy.spawnPos.x),
        Math.abs(enemyTile.y - enemy.spawnPos.y)
      );

      // Proximity Aggro check: if not currently aggroed, evaluate closest party member
      if (!enemy.isAggroed && enemy.state !== 'returning' && distFromSpawn <= enemy.maxLeashDistance) {
        const potentialTarget = this.findBestTargetInParty(enemy);
        if (potentialTarget) {
          target = potentialTarget;
          this.enemyTargets.set(enemy, target);
          enemy.targetEntity = target;
          enemy.isAggroed = true;
          enemy.outOfAggroTimerMs = 0;
          enemy.state = 'chasing';
          const tDist = Math.max(
            Math.abs(enemyTile.x - Math.floor(target.x / target.tileSize)),
            Math.abs(enemyTile.y - Math.floor(target.y / target.tileSize))
          );
          console.log(`[Combat] ${enemy.entityName} aggroed on ${target.entityName}! (Distance: ${tDist} tiles)`);
        }
      }

      if (enemy.isAggroed) {
        const targetTile = target
          ? { x: Math.floor(target.x / target.tileSize), y: Math.floor(target.y / target.tileSize) }
          : { x: 0, y: 0 };
        const distanceTiles = target
          ? Math.max(Math.abs(enemyTile.x - targetTile.x), Math.abs(enemyTile.y - targetTile.y))
          : 999;

        const isTargetDowned = !target || target.state === 'downed' || target.state === 'dead';
        const exceededLeash = distFromSpawn > enemy.maxLeashDistance;

        if (distanceTiles > enemy.enemyData.aggroRadius) {
          enemy.outOfAggroTimerMs += delta;
        } else {
          enemy.outOfAggroTimerMs = 0;
        }
        const timedOut = enemy.outOfAggroTimerMs >= enemy.leashTimeoutMs;
        const hasLOS = target ? this.pathfinder.hasLineOfSight(enemyTile, targetTile) : false;

        let isTargetInvalid = isTargetDowned || exceededLeash || timedOut || !hasLOS;
        if (isTaunted && !isTargetDowned && !exceededLeash) {
          isTargetInvalid = false;
        }

        if (isTargetInvalid) {
          // RETARGETING MACHINE: Immediate frame re-evaluation across party
          const altTarget = this.findBestTargetInParty(enemy);
          if (altTarget && altTarget !== target) {
            console.log(
              `%c[Combat Retarget] 🎯 ${enemy.entityName} retargeted from ${target?.entityName ?? 'none'} (invalid: downed=${isTargetDowned}, leash=${exceededLeash}, timeout=${timedOut}, los=${!hasLOS}) to ${altTarget.entityName}!`,
              'color: #f59e0b; font-weight: bold;'
            );
            target = altTarget;
            this.enemyTargets.set(enemy, target);
            enemy.outOfAggroTimerMs = 0;
            enemy.state = 'chasing';
          } else {
            // No valid living party members in range/LOS -> Return to spawn
            const reason = isTargetDowned
              ? `target was downed`
              : exceededLeash
              ? `pursued beyond max leash distance (${distFromSpawn} > ${enemy.maxLeashDistance} tiles)`
              : timedOut
              ? `target outside aggro radius for ${(enemy.outOfAggroTimerMs / 1000).toFixed(1)}s`
              : `line of sight blocked by obstacle`;

            console.log(`[Combat] ${enemy.entityName} gave up chase (${reason}). Returning to spawn (${enemy.spawnPos.x}, ${enemy.spawnPos.y}).`);
            this.enemyTargets.delete(enemy);
            enemy.isAggroed = false;
            enemy.outOfAggroTimerMs = 0;
            enemy.state = 'returning';
            enemy.claimedDestination = { ...enemy.spawnPos };

            const dynamicObstacles = this.getOtherUnitPositions(enemy);
            this.pathfinder.findPath(enemyTile, enemy.spawnPos, dynamicObstacles).then((path) => {
              if (path.length > 0 && enemy.state === 'returning') {
                enemy.followPath(path, () => {
                  if (enemy.state === 'returning') {
                    enemy.state = 'idle';
                    enemy.claimedDestination = null;
                    console.log(`[Combat] ${enemy.entityName} arrived at spawnPos. State set to 'idle'. Proximity aggro restored.`);
                  }
                });
              } else {
                enemy.state = 'idle';
                enemy.claimedDestination = null;
                console.log(`[Combat] ${enemy.entityName} already at spawnPos. State set to 'idle'. Proximity aggro restored.`);
              }
            });
            continue;
          }
        }

        // Target is valid and living: Proceed with Melee Attack vs Pursuit
        if (target) {
          const currentTargetTile = {
            x: Math.floor(target.x / target.tileSize),
            y: Math.floor(target.y / target.tileSize)
          };
          const curDistTiles = Math.max(
            Math.abs(enemyTile.x - currentTargetTile.x),
            Math.abs(enemyTile.y - currentTargetTile.y)
          );
          const attackRange = enemy.enemyData.attackRangeTiles ?? 1;
          const isRanged = attackRange > 1;

          if (curDistTiles <= attackRange) {
            // Milestone 20: Ranged Enemy Kiting AI
            // If target closes into melee distance (<= 2 tiles), attempt to backpedal to maintain spacing
            let isKiting = false;
            if (isRanged && curDistTiles <= 2) {
              const timeForKite = time - enemy.lastRepathTimeMs >= enemy.repathIntervalMs;
              if (!enemy.isMoving() || timeForKite) {
                const kiteTile = this.findKiteTile(enemy, target, attackRange);
                if (kiteTile && (kiteTile.x !== enemyTile.x || kiteTile.y !== enemyTile.y)) {
                  enemy.lastRepathTimeMs = time;
                  enemy.claimedDestination = { ...kiteTile };
                  const dynamicObstacles = this.getOtherUnitPositions(enemy);
                  this.pathfinder.findPath(enemyTile, kiteTile, dynamicObstacles).then((path) => {
                    if (path.length > 0 && enemy.state !== 'downed' && enemy.state !== 'dead' && enemy.isAggroed) {
                      enemy.followPath(path);
                      console.log(`[Combat:Kite] 🏹 ${enemy.entityName} kiting back from ${target?.entityName ?? 'target'} to (${kiteTile.x}, ${kiteTile.y})!`);
                    }
                  });
                  isKiting = true;
                }
              }
            }

            if (!isKiting) {
              if (enemy.isMoving()) {
                enemy.stopMovement();
              }
              enemy.claimedDestination = null;
              enemy.state = 'attacking';
            }

            if (time - enemy.lastAttackTime >= enemy.enemyData.attackIntervalMs) {
              if (curDistTiles <= attackRange) {
                enemy.lastAttackTime = time;
                this.lastCombatTimeMs = time;
                const rawDamage = enemy.enemyData.meleeDamage;

                const hiddenSystem = HiddenSkillSystem.getInstance();
                const hasShield = target.hasShield();
                const shieldDef = hasShield ? target.offhandWeapon : null;
                const shieldLevel = hasShield ? target.progression.getProficiencyLevel('shields') : 0;
                const shieldBlockBonus = hasShield ? shieldLevel * (shieldDef?.levelBonus?.blockPerLevel ?? 0.005) : 0;
                const shieldMitigationBonus = hasShield
                  ? (shieldDef?.baseMitigation ?? 1) + Math.floor(shieldLevel * (shieldDef?.levelBonus?.mitigationPerLevel ?? 0.2))
                  : 0;

                const context: CombatContext = {
                  equippedWeapon: target.equippedWeapon,
                  equippedOffhand: target.offhandWeapon,
                  hasShield,
                  shieldBlockBonus,
                  shieldMitigationBonus,
                  hasMagicProficiency: false,
                  inCombat: true,
                  attackerDistanceTiles: curDistTiles,
                  isMeleeAttack: !isRanged
                };

                // Avoidance chain evaluated against target's own progression
                const avoidance = hiddenSystem.resolveIncomingAttack(context, target.progression);

                if (avoidance.type === 'evaded') {
                  console.log(`[Combat] 💨 ${target.entityName} EVADED attack from ${enemy.entityName}! (0 damage)`);
                  this.createAttackEffect(enemy.x, enemy.y, target.x, target.y, 0x60a5fa);
                  this.createFloatingText(target.x, target.y - 12, 'EVADED!', '#60a5fa');
                  if (target.hasStatusEffect('retaliate')) {
                    target.removeStatusEffect('retaliate');
                    this.executePlayerCounterattack(target, enemy, { procced: true, damageMultiplier: 1.0, canCrit: true, chainAttack: false });
                    this.createFloatingText(target.x, target.y - 12, 'RETALIATE!', '#eab308');
                  } else {
                    const counterRes = hiddenSystem.resolveCounterattack(context, target.progression);
                    if (counterRes.procced) {
                      this.executePlayerCounterattack(target, enemy, counterRes);
                    }
                  }
                } else if (avoidance.type === 'parried') {
                  console.log(`[Combat] ⚔️ ${target.entityName} PARRIED attack from ${enemy.entityName}! (0 damage)`);
                  this.createAttackEffect(enemy.x, enemy.y, target.x, target.y, 0xfacc15);
                  this.createFloatingText(target.x, target.y - 12, 'PARRIED!', '#facc15');
                  if (target.hasStatusEffect('retaliate')) {
                    target.removeStatusEffect('retaliate');
                    this.executePlayerCounterattack(target, enemy, { procced: true, damageMultiplier: 1.0, canCrit: true, chainAttack: false });
                    this.createFloatingText(target.x, target.y - 12, 'RETALIATE!', '#eab308');
                  } else {
                    const counterRes = hiddenSystem.resolveCounterattack(context, target.progression);
                    if (counterRes.procced) {
                      this.executePlayerCounterattack(target, enemy, counterRes);
                    }
                  }
                } else if (avoidance.type === 'blocked') {
                  console.log(`[Combat] 🛡️ ${target.entityName} BLOCKED attack from ${enemy.entityName}! (0 damage)`);
                  this.createAttackEffect(enemy.x, enemy.y, target.x, target.y, 0x38bdf8);
                  this.createFloatingText(target.x, target.y - 12, 'BLOCKED!', '#38bdf8');
                  target.progression.addProficiencyExp('shields', 2);
                  if (target.hasStatusEffect('retaliate')) {
                    target.removeStatusEffect('retaliate');
                    this.executePlayerCounterattack(target, enemy, { procced: true, damageMultiplier: 1.0, canCrit: true, chainAttack: false });
                    this.createFloatingText(target.x, target.y - 12, 'RETALIATE!', '#eab308');
                  } else {
                    const counterRes = hiddenSystem.resolveCounterattack(context, target.progression);
                    if (counterRes.procced) {
                      this.executePlayerCounterattack(target, enemy, counterRes);
                    }
                  }
                } else {
                  const attackColor = isRanged ? 0xf59e0b : 0xef4444;
                  this.createAttackEffect(enemy.x, enemy.y, target.x, target.y, attackColor);
                  if (context.hasShield) {
                    target.progression.addProficiencyExp('shields', 1);
                  }

                  let actualDamage = rawDamage;

                  if (target.hasStatusEffect('unbreakable')) {
                    actualDamage = 0;
                    this.createFloatingText(target.x, target.y - 20, 'IMMUNE!', '#f59e0b');
                    console.log(`[Combat] ${target.entityName} is UNBREAKABLE! Immune to all damage.`);
                  } else {
                    const mitigation = hiddenSystem.resolveDamageTaken(context, target.progression, rawDamage);
                    actualDamage = mitigation.finalDamage;

                    if (target.hasStatusEffect('guard_up')) {
                      actualDamage = Math.max(1, Math.round(actualDamage * 0.5));
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (GUARD UP!)`, '#38bdf8');
                      console.log(`[Combat] Guard Up mitigated 50% damage! ${actualDamage} taken.`);
                    } else if (mitigation.mitigatedAmount > 0) {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage! (Resilience mitigated ${mitigation.mitigatedAmount} dmg)`);
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (${mitigation.mitigatedAmount} RESIST)`, '#a78bfa');
                    } else if (mitigation.procced) {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage! (Resilience proc: +1 EXP)`);
                      this.createFloatingText(target.x, target.y - 20, `RESILIENCE! -${actualDamage}`, '#a78bfa');
                    } else {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage!`);
                    }
                  }

                  if (target.hasStatusEffect('retaliate')) {
                    target.removeStatusEffect('retaliate');
                    this.executePlayerCounterattack(target, enemy, { procced: true, damageMultiplier: 1.0, canCrit: true, chainAttack: false });
                    this.createFloatingText(target.x, target.y - 12, 'RETALIATE!', '#eab308');
                  }

                  const wasUnengaged = target.targetEntity === null;
                  const targetDowned = target.takeDamage(actualDamage);
                  if (actualDamage > 0 && this.scene && typeof (this.scene as any).interruptGatherChannel === 'function') {
                    (this.scene as any).interruptGatherChannel(target, enemy);
                  }
                  if (targetDowned) {
                    console.log(`[Combat] ${target.entityName} has been downed by enemy attack!`);
                    target.clearTarget();
                    this.enemyTargets.delete(enemy);
                    // Immediate Retarget on same frame
                    const nextTarget = this.findBestTargetInParty(enemy);
                    if (nextTarget) {
                      this.enemyTargets.set(enemy, nextTarget);
                      enemy.state = 'chasing';
                      console.log(`%c[Combat Retarget] 🎯 ${enemy.entityName} immediately switched target to ${nextTarget.entityName}!`, 'color: #f59e0b; font-weight: bold;');
                    }
                  }

                  // Milestone 11: Full-Group Retaliation
                  // When an unengaged party member takes damage, trigger full-group retaliation
                  // for all idle/unengaged members against the attacker
                  if (actualDamage > 0 && wasUnengaged) {
                    this.triggerRetaliation(enemy, target);
                  }
                }
              } else {
                enemy.state = 'chasing';
              }
            }
          } else {
            if (enemy.state === 'attacking' || enemy.state === 'idle') {
              enemy.state = 'chasing';
            }
            if (enemy.state === 'chasing' || enemy.state === 'moving') {
              const startTile = enemy.gridPos;
              const targetDestTile = isRanged
                ? this.findRangedStagingTile(enemy, target, attackRange) || currentTargetTile
                : this.getBestAdjacentTile(startTile, currentTargetTile, enemy) || currentTargetTile;
              const isStopped = !enemy.isMoving();
              const timeForRepath = time - enemy.lastRepathTimeMs >= enemy.repathIntervalMs;

              if (isStopped || timeForRepath) {
                const alreadyHeading =
                  enemy.isMoving() && enemy.gridPos.x === targetDestTile.x && enemy.gridPos.y === targetDestTile.y;
                if (!alreadyHeading) {
                  enemy.lastRepathTimeMs = time;
                  enemy.claimedDestination = { ...targetDestTile };
                  const dynamicObstacles = this.getOtherUnitPositions(enemy);
                  this.pathfinder.findPath(startTile, targetDestTile, dynamicObstacles).then((path) => {
                    if (
                      path.length > 0 &&
                      (enemy.state as string) !== 'downed' &&
                      (enemy.state as string) !== 'dead' &&
                      enemy.isAggroed &&
                      target?.state !== 'downed'
                    ) {
                      enemy.followPath(path);
                    } else {
                      if (!enemy.isMoving()) {
                        enemy.claimedDestination = null;
                      }
                    }
                  });
                }
              }
            }
          }
        }
      }
    }

    // 2. Party Auto-Attack & Auto-Skill Loop against Target Entities
    for (const member of this.party) {
      if (member.state === 'downed' || member.state === 'dead') continue;
      member.inCombat = inCombat;

      // Unconditionally prioritize ally healing via Healing Magic if equipped with Staff
      const castHeal = this.checkAndAutocastHealingMagic(member, time);
      if (castHeal) {
        continue;
      }

      // Check if member has an ally heal or self buff skill that can be autocast
      this.checkAndAutocastAllyHeal(member, time);
      this.checkAndAutocastSelfBuffs(member, time);

      if (!member.targetEntity || member.targetEntity.state === 'downed' || member.targetEntity.state === 'dead') {
        member.clearTarget();
        continue;
      }

      this.updateStaffDynamicRange(member);

      const target = member.targetEntity;
      const dx = Math.abs(member.gridPos.x - target.gridPos.x);
      const dy = Math.abs(member.gridPos.y - target.gridPos.y);
      const distanceTiles = Math.max(dx, dy);

      if (distanceTiles <= member.attackRangeTiles) {
        const hasUnreachedDest = member.claimedDestination &&
          (member.gridPos.x !== member.claimedDestination.x || member.gridPos.y !== member.claimedDestination.y);
        const tileOccupiedByOther = this.party.some(
          (other) => other !== member && other.state !== 'dead' && other.state !== 'downed' &&
            other.gridPos.x === member.gridPos.x && other.gridPos.y === member.gridPos.y
        );

        if (member.isMoving()) {
          if (hasUnreachedDest || tileOccupiedByOther) {
            // Keep moving along path to designated unshared attack tile; do not stop on intermediate occupied tiles
            continue;
          }
          member.stopMovement();
        }
        const dataLoader = DataLoader.getInstance();
        const effectiveWeapon = this.getEffectiveWeaponForAttack(member);
        const weaponId = effectiveWeapon.id;
        const weaponLevel = member.progression.getProficiencyLevel(weaponId);
        const damageBonusPerLevel = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const accuracyBonusPerLevel = effectiveWeapon.levelBonus?.accuracyPerLevel ?? 0;
        const rawBaseDamage = effectiveWeapon.baseDamage + weaponLevel * damageBonusPerLevel;
        const baseAccuracy = effectiveWeapon.baseAccuracy ?? 0.60;

        const moodTier = dataLoader.getMoodTier(member.mood);
        const effectiveBaseDamage = rawBaseDamage * moodTier.combatDamageMultiplier;

        // Dual Wielding accuracy penalty calculation
        const isDW = member.isDualWielding();
        const dwPenalty = isDW ? member.progression.getDualWieldPenalty() : 0;
        const effectiveAccuracy = baseAccuracy + weaponLevel * accuracyBonusPerLevel + moodTier.combatAccuracyBonus - dwPenalty;

        let usedSkill = false;

        // Check equipped skills
        for (const skillId of member.equippedSkillIds) {
          if (!member.isAutocastEnabled(skillId)) continue;

          const skillDef = dataLoader.getSkill(skillId);
          if (!skillDef || !member.progression.isSkillUnlocked(skillDef, member)) continue;

          const lastUsed = member.lastSkillUseTimes.get(skillId) || 0;
          const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
          const isAffordable = member.energy >= skillDef.energyCost;
          const isWeaponReady = time - member.lastAttackTime >= effectiveWeapon.attackIntervalMs;

          if (isOffCooldown && isAffordable && isWeaponReady) {
            usedSkill = true;
            const preSkillEnergy = member.energy;
            member.energy -= skillDef.energyCost;
            member.lastSkillUseTimes.set(skillId, time);
            member.lastAttackTime = time;
            member.state = 'attacking';

            console.log(
              `[DIAG:Combat] ⚡ ${member.entityName} casts skill ${skillDef.name}! inCombat: ${member.inCombat}, Pre-EN: ${preSkillEnergy.toFixed(1)}, Post-EN: ${member.energy.toFixed(1)} (cost: ${skillDef.energyCost})`
            );

            this.createSkillAttackEffect(member.x, member.y, target.x, target.y);

            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveAccuracy;

            if (!isHit) {
              console.log(
                `[Skill] ${member.entityName} casts ${skillDef.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(hitRoll * 100).toFixed(1)}%)`
              );
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              const mult = skillDef.damageMultiplier ?? 1.0;
              const skillDamage = effectiveBaseDamage * mult;
              console.log(
                `[Skill] ${member.entityName} casts ${skillDef.name}! Dealt ${skillDamage.toFixed(1)} damage (${mult * 100}% of ${effectiveBaseDamage.toFixed(2)})${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''}`
              );
              this.createFloatingText(target.x, target.y - 10, `${skillDef.name.toUpperCase()}! -${skillDamage.toFixed(1)}`, '#f59e0b');

              if (skillDef.id === 'shield_bash') {
                const stunDef = dataLoader.getStatusEffect('stun') || {
                  id: 'stun',
                  name: 'Stun',
                  durationMs: skillDef.stunDurationMs ?? 2000,
                  tickIntervalMs: 2000,
                  damagePerTick: 0,
                  color: '#facc15'
                };
                target.applyStatusEffect(stunDef);
                target.stopMovement();
                this.createFloatingText(target.x, target.y - 25, 'STUNNED!', '#facc15');
                console.log(`[Skill] Shield Bash STUNNED ${target.entityName} for 2s!`);
              }

              this.checkAndApplyBleed(member, target);
              this.checkAndApplyBurn(member, target);

              const result = member.progression.addProficiencyExp(weaponId, 2);
              if (result.leveledUp) {
                const newLevel = member.progression.getProficiencyLevel(weaponId);
                this.createFloatingText(member.x, member.y - 20, `${effectiveWeapon.name} Level ${newLevel}!`, '#22c55e');
              }

              if (isDW) {
                member.progression.addProficiencyExp('dual_wielding', 2);
              }

              this.lastCombatTimeMs = time;
              if (target.state !== 'dead' && target.state !== 'downed') (target as any).isAggroed = true;
              const targetDowned = target.takeDamage(skillDamage);
              if (targetDowned) {
                this.handleTargetDefeated(member, target, weaponId);
              }
            }
            break;
          }
        }

        // Standard weapon attack if no skill fired
        if (!usedSkill) {
          if (time - member.lastAttackTime >= effectiveWeapon.attackIntervalMs) {
            // Energy check for weapons that cost energy per cast (e.g. Magic Schools)
            let energyCost = 0;
            if (effectiveWeapon.energyCostPerCast && effectiveWeapon.energyCostPerCast > 0) {
              const costReduction = (effectiveWeapon.levelBonus?.energyCostReductionPerLevel ?? 0.1) * weaponLevel;
              energyCost = Math.max(1, Math.round(effectiveWeapon.energyCostPerCast - costReduction));
              if (member.energy < energyCost) {
                this.updateStaffDynamicRange(member);
                continue;
              }
              member.energy -= energyCost;
            }

            member.lastAttackTime = time;
            member.state = 'attacking';

            console.log(
              `[DIAG:Combat] ⚔️ ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name}! inCombat: ${member.inCombat}, Pre-EN: ${(member.energy + energyCost).toFixed(1)}, Post-EN: ${member.energy.toFixed(1)}, Range: ${member.attackRangeTiles}, Dist: ${distanceTiles}`
            );

            const isFire = effectiveWeapon.id === 'fire_magic' || effectiveWeapon.category === 'magic';
            const attackColor = isFire ? 0xf97316 : 0x3b82f6;
            this.createAttackEffect(member.x, member.y, target.x, target.y, attackColor);
            if (isFire) {
              this.createFireExplosionEffect(target.x, target.y);
            }

            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveAccuracy;

            if (!isHit) {
              console.log(
                `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty: -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(hitRoll * 100).toFixed(1)}%)`
              );
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              const damage = effectiveBaseDamage;
              console.log(
                `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} for ${damage.toFixed(1)} damage! (Base: ${effectiveWeapon.baseDamage}, Lv ${weaponLevel} Bonus: +${(weaponLevel * damageBonusPerLevel).toFixed(1)}, Accuracy: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''})`
              );
              const dmgColor = isFire ? '#f97316' : '#38bdf8';
              this.createFloatingText(target.x, target.y - 10, `-${damage.toFixed(1)}`, dmgColor);

              this.checkAndApplyBleed(member, target);
              this.checkAndApplyBurn(member, target);

              // Ranged AoE splash if weapon has aoeRadiusTiles
              if (effectiveWeapon.aoeRadiusTiles && effectiveWeapon.aoeRadiusTiles > 0) {
                const aoeRadius = effectiveWeapon.aoeRadiusTiles;
                const splashPercent = effectiveWeapon.aoeSplashPercent ?? 0.50;
                const splashDmg = damage * splashPercent;
                for (const enemy of this.enemies) {
                  if (enemy === target || enemy.state === 'dead' || enemy.state === 'downed') continue;
                  const edx = Math.abs(enemy.gridPos.x - target.gridPos.x);
                  const edy = Math.abs(enemy.gridPos.y - target.gridPos.y);
                  if (Math.max(edx, edy) <= aoeRadius) {
                    console.log(`[Combat:AoE] ${enemy.entityName} caught in fire splash for ${splashDmg.toFixed(1)} damage!`);
                    this.createFloatingText(enemy.x, enemy.y - 10, `-${splashDmg.toFixed(1)} (Splash)`, '#f97316');
                    this.checkAndApplyBurn(member, enemy);
                    this.lastCombatTimeMs = time;
                    enemy.isAggroed = true;
                    const splashDowned = enemy.takeDamage(splashDmg);
                    if (splashDowned) {
                      this.handleTargetDefeated(member, enemy, weaponId);
                    }
                  }
                }
              }

              const result = member.progression.addProficiencyExp(weaponId, 2);
              if (result.leveledUp) {
                const newLevel = member.progression.getProficiencyLevel(weaponId);
                this.createFloatingText(member.x, member.y - 20, `${effectiveWeapon.name} Level ${newLevel}!`, '#22c55e');
              }

              this.lastCombatTimeMs = time;
              if (target.state !== 'dead' && target.state !== 'downed') (target as any).isAggroed = true;
              let targetDowned = target.takeDamage(damage);
              if (targetDowned) {
                this.handleTargetDefeated(member, target, weaponId);
              }
            }

            // DUAL WIELDING: Offhand weapon attack strike
            if (isDW && member.offhandWeapon && target.state !== 'downed' && target.state !== 'dead') {
              const offWpn = member.offhandWeapon;
              const offLevel = member.progression.getProficiencyLevel(offWpn.id);
              const offBonusDmg = offWpn.levelBonus?.damagePerLevel ?? 0;
              const offBonusAcc = offWpn.levelBonus?.accuracyPerLevel ?? 0;
              const offRawDamage = offWpn.baseDamage + offLevel * offBonusDmg;
              const offEffectiveDamage = offRawDamage * moodTier.combatDamageMultiplier;
              const offEffectiveAccuracy =
                (offWpn.baseAccuracy ?? 0.65) + offLevel * offBonusAcc + moodTier.combatAccuracyBonus - dwPenalty;

              this.createAttackEffect(member.x, member.y, target.x, target.y, 0xa855f7);

              const offHitRoll = Math.random();
              const isOffHit = offHitRoll < offEffectiveAccuracy;

              if (!isOffHit) {
                console.log(
                  `[Dual Wield] ${member.entityName} offhand strike with ${offWpn.name} MISSED! (Hit Chance: ${(offEffectiveAccuracy * 100).toFixed(1)}% [DW Penalty: -${(dwPenalty * 100).toFixed(0)}%], Roll: ${(offHitRoll * 100).toFixed(1)}%)`
                );
                this.createFloatingText(target.x, target.y - 22, 'DW MISS', '#9ca3af');
              } else {
                console.log(
                  `[Dual Wield] ⚔️ ${member.entityName} offhand strike with ${offWpn.name} hits ${target.entityName} for ${offEffectiveDamage.toFixed(1)} damage! (DW Penalty: -${(dwPenalty * 100).toFixed(0)}%, Hit Chance: ${(offEffectiveAccuracy * 100).toFixed(1)}%)`
                );
                this.createFloatingText(target.x, target.y - 22, `-${offEffectiveDamage.toFixed(1)} (DW)`, '#c084fc');

                member.progression.addProficiencyExp(offWpn.id, 2);
                const dwResult = member.progression.addProficiencyExp('dual_wielding', 2);
                if (dwResult.leveledUp) {
                  const dwLv = member.progression.getProficiencyLevel('dual_wielding');
                  this.createFloatingText(member.x, member.y - 20, `Dual Wield Level ${dwLv}!`, '#a855f7');
                }

                this.lastCombatTimeMs = time;
                if ((target.state as string) !== 'dead' && (target.state as string) !== 'downed') (target as any).isAggroed = true;
                const offTargetDowned = target.takeDamage(offEffectiveDamage);
                if (offTargetDowned) {
                  this.handleTargetDefeated(member, target, offWpn.id);
                }
              }
            }
          }
        }
      } else {
        // Target is outside attack range: Party Member Pursuit & Surround Maintenance
        if (member.attackRangeTiles === 1 && (member.equippedWeapon?.id === 'staff' || member.equippedWeapon?.id === 'fire_magic' || member.equippedWeapon?.category === 'staff' || member.equippedWeapon?.category === 'magic')) {
          console.log(
            `[DIAG:Combat] 🏃 ${member.entityName} DRY FALLBACK: Range is 1 (${member.energy.toFixed(1)} EN). Pursuing ${target.entityName} to melee distance (currently ${distanceTiles} tiles)...`
          );
        }
        const isStopped = !member.isMoving();
        const timeForRepath = time - member.lastCombatRepathTimeMs >= member.combatRepathIntervalMs;

        if (isStopped || timeForRepath) {
          let needsRepath = true;
          if (member.claimedDestination && (member.isMoving() || !isStopped)) {
            const dest = member.claimedDestination;
            const cdx = Math.abs(dest.x - target.gridPos.x);
            const cdy = Math.abs(dest.y - target.gridPos.y);
            const isAdjacent = Math.max(cdx, cdy) <= member.attackRangeTiles && (cdx > 0 || cdy > 0);

            // Exclusive ownership check: no other party member has claimed this destination AND no other party member is occupying it
            const anotherMemberClaimedOrOccupies = this.party.some(
              (other) => other !== member && other.state !== 'dead' && other.state !== 'downed' && (
                (other.claimedDestination !== null && other.claimedDestination.x === dest.x && other.claimedDestination.y === dest.y) ||
                (other.gridPos.x === dest.x && other.gridPos.y === dest.y)
              )
            );
            const blockedByStaticOrEnemy = this.pathfinder.isObstacle(dest.x, dest.y) ||
              this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && (
                (e.gridPos.x === dest.x && e.gridPos.y === dest.y) ||
                (e.claimedDestination !== null && e.claimedDestination.x === dest.x && e.claimedDestination.y === dest.y)
              ));

            if (isAdjacent && !anotherMemberClaimedOrOccupies && !blockedByStaticOrEnemy) {
              needsRepath = false; // already en route to a valid exclusive adjacent tile!
            }
          }

          if (needsRepath) {
            member.lastCombatRepathTimeMs = time;
            const targetTile = this.findOpenAttackTileForMember(target, member);
            if (targetTile) {
              member.claimedDestination = { ...targetTile };
              const hardObs: GridPos[] = [];
              const softObs: GridPos[] = [];
              for (const e of this.enemies) {
                if (e !== target && e.state !== 'dead' && e.state !== 'downed') {
                  hardObs.push(e.gridPos);
                }
              }
              for (const m of this.party) {
                if (m !== member && m.state !== 'dead' && m.state !== 'downed') {
                  softObs.push(m.gridPos);
                }
              }
              this.pathfinder.findPath(member.gridPos, targetTile, { soft: softObs, hard: hardObs }).then((path) => {
                if (
                  path.length > 0 &&
                  member.state !== 'downed' &&
                  member.state !== 'dead' &&
                  member.targetEntity === target
                ) {
                  member.followPath(path);
                } else {
                  // No reachable path to targetTile: cancel claim so unit does not hold ghost claims
                  member.claimedDestination = null;
                  if (member.isMoving()) {
                    member.stopMovement();
                  }
                }
              });
            } else {
              // No open tile available (all surround and fallback tiles full): hold current position
              member.claimedDestination = null;
              if (member.isMoving()) {
                member.stopMovement();
              }
            }
          }
        }
      }
    }

    // 3. Passive Regen Ticks (Out of Combat Health & Mana Regen) per Party Member
    if (time - this.lastPassiveTickTimeMs >= 3000) {
      this.lastPassiveTickTimeMs = time;
      const hiddenSystem = HiddenSkillSystem.getInstance();

      for (const member of this.party) {
        if (member.state === 'downed' || member.state === 'dead') continue;
        const dataLoader = DataLoader.getInstance();
        const magicSchoolIds = dataLoader.getMagicSchoolIds();
        const hasMagicProficiency = magicSchoolIds.some(
          (id) => member.progression.getProficiencyLevel(id) >= 1
        );
        const context: CombatContext = {
          equippedWeapon: member.equippedWeapon,
          equippedOffhand: member.offhandWeapon,
          hasShield: member.hasShield(),
          hasMagicProficiency,
          inCombat,
          hasEnergyPotionBuff: member.energyPotionRemainingMs > 0,
          hasManaPotionBuff: member.manaPotionRemainingMs > 0
        };

        const regenResult = hiddenSystem.resolvePassiveRegen(context, member.progression);
        if (regenResult.healthRestored > 0) {
          const restored = member.heal(regenResult.healthRestored);
          if (restored > 0) {
            console.log(`[Regen] ${member.entityName} Health Regen tick! Restored +${restored} HP`);
            this.createFloatingText(member.x, member.y - 15, `+${restored} HP`, '#22c55e');
          }
        }
        if (regenResult.energyRestored > 0) {
          const oldEnergy = member.energy;
          member.energy = Math.min(member.maxEnergy, member.energy + regenResult.energyRestored);
          const restored = Math.floor(member.energy - oldEnergy);
          if (restored > 0) {
            const label = regenResult.manaProcced && regenResult.energyRegenProcced
              ? 'Energy & Mana Regen'
              : regenResult.manaProcced
              ? 'Mana Regen'
              : 'Energy Regen';
            console.log(`[Regen] ${member.entityName} ${label} tick! Restored +${restored} Energy`);
            this.createFloatingText(member.x, member.y - 15, `+${restored} EN`, '#3b82f6');
          }
        }
      }
    }
  }

  private executePlayerCounterattack(
    counterAttacker: Player,
    enemy: Enemy,
    counterResult: CounterattackResult
  ): void {
    if (enemy.state === 'downed' || enemy.state === 'dead') return;
    const weapon = counterAttacker.equippedWeapon;
    const weaponLevel = counterAttacker.progression.getProficiencyLevel(weapon.id);
    const damageBonusPerLevel = weapon.levelBonus?.damagePerLevel ?? 0;
    const baseDamage = weapon.baseDamage + weaponLevel * damageBonusPerLevel;

    let counterDmg = Math.max(1, Math.round(baseDamage * counterResult.damageMultiplier));
    let isCrit = false;
    if (counterResult.canCrit && Math.random() < 0.25) {
      counterDmg = Math.round(counterDmg * 1.5);
      isCrit = true;
    }

    console.log(
      `[Combat] ⚡ COUNTERATTACK! ${counterAttacker.entityName} retaliates against ${enemy.entityName} for ${counterDmg} damage!`
    );
    this.createSkillAttackEffect(counterAttacker.x, counterAttacker.y, enemy.x, enemy.y);
    this.createFloatingText(
      enemy.x,
      enemy.y - 15,
      isCrit ? `CRIT COUNTER! -${counterDmg}` : `COUNTER! -${counterDmg}`,
      '#f59e0b'
    );

    const enemyDowned = enemy.takeDamage(counterDmg);
    if (enemyDowned) {
      this.handleTargetDefeated(counterAttacker, enemy, weapon.id);
    }
  }

  private checkAndApplyBleed(attacker: Player, target: Entity): void {
    const weapon = attacker.equippedWeapon;
    if (weapon.bleedChance && Math.random() < weapon.bleedChance) {
      const bleedDef = DataLoader.getInstance().getStatusEffect('bleed');
      if (bleedDef) {
        console.log(`[StatusEffect] Applied Bleed to ${target.entityName}!`);
        target.applyStatusEffect(bleedDef);
        this.createFloatingText(target.x, target.y - 25, 'BLEED!', '#ef4444');
      }
    }
  }

  private checkAndApplyBurn(attacker: Player, target: Entity): void {
    const weapon = attacker.equippedWeapon;
    if (!weapon.burnChance) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.id);
    const burnBonusPerLevel = weapon.levelBonus?.burnChancePerLevel ?? 0;
    const effectiveBurnChance = weapon.burnChance + weaponLevel * burnBonusPerLevel;

    if (Math.random() < effectiveBurnChance) {
      const burnDef = DataLoader.getInstance().getStatusEffect('burn');
      if (burnDef) {
        console.log(
          `[StatusEffect] Applied Burn to ${target.entityName}! (Proc Chance: ${(effectiveBurnChance * 100).toFixed(1)}%)`
        );
        target.applyStatusEffect(burnDef);
        this.createFloatingText(target.x, target.y - 25, 'BURN!', '#f97316');
      }
    }
  }

  private handleTargetDefeated(killer: Player, target: Entity, weaponId: string): void {
    console.log(`[Combat] ${target.entityName} defeated/downed by ${killer.entityName}!`);
    const result = killer.progression.addProficiencyExp(weaponId, 4);
    if (result.leveledUp) {
      const newLevel = killer.progression.getProficiencyLevel(weaponId);
      this.createFloatingText(killer.x, killer.y - 20, `Level Up! Level ${newLevel}`, '#22c55e');
    }

    if (killer.isDualWielding() && killer.offhandWeapon) {
      killer.progression.addProficiencyExp(killer.offhandWeapon.id, 2);
      killer.progression.addProficiencyExp('dual_wielding', 2);
    }

    // Milestone 14: Class EXP kill hook (flat +25 Class EXP specifically to active class only)
    if (killer.activeClass) {
      const classResult = killer.progression.addClassExp(killer.activeClass, 25);
      const activeName = killer.activeClass.toUpperCase();
      this.createFloatingText(killer.x, killer.y - 12, `+25 ${activeName} EXP`, '#f59e0b');
      if (classResult.leveledUp) {
        const newClassLvl = killer.progression.getClassLevel(killer.activeClass);
        this.createFloatingText(killer.x, killer.y - 30, `Class Level Up! ${activeName} Lv ${newClassLvl}!`, '#f59e0b');
        killer.checkSkillUnlocks();
      }
    }

    // Clear target for all party members who had targeted this enemy.
    // INVARIANT: On enemy defeat, members call clearTarget() -> stopMovement().
    // They hold their exact combat positions without automatic re-formation.
    // Formation resumes only when the player issues the next manual movement command.
    for (const member of this.party) {
      if (member.targetEntity === target) {
        member.clearTarget();
      }
    }

    if (target instanceof Enemy) {
      this.enemyTargets.delete(target);
      // Roll and award harvest drops
      if (target.enemyData.harvest && target.enemyData.harvest.length > 0) {
        const gameState = GameState.getInstance();
        for (const h of target.enemyData.harvest) {
          const isRare = h.method === 'rare_drop';
          const roll = Math.random();
          if (!isRare || roll < 0.35) {
            gameState.addItem(h.item, 1);
            const itemName = h.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            console.log(`[Loot] Harvested 1x ${itemName} from ${target.entityName}!`);
            this.createFloatingText(target.x, target.y - 35, `+1 ${itemName}`, isRare ? '#f59e0b' : '#34d399');
          }
        }
      }
      if (this.onEnemyDeathCallback) {
        this.onEnemyDeathCallback(target);
      }
    }
  }

  public createSkillAttackEffect(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.scene?.add) return;
    const line = this.scene.add.line(0, 0, fromX, fromY, toX, toY, 0xf59e0b).setOrigin(0).setLineWidth(3).setDepth(2000);
    this.scene.tweens?.add({
      targets: line,
      alpha: 0,
      duration: 250,
      onComplete: () => line.destroy()
    });
  }

  public createAttackEffect(fromX: number, fromY: number, toX: number, toY: number, color: number = 0xffffff): void {
    if (!this.scene?.add) return;
    const line = this.scene.add.line(0, 0, fromX, fromY, toX, toY, color).setOrigin(0).setLineWidth(2).setDepth(2000);
    this.scene.tweens?.add({
      targets: line,
      alpha: 0,
      duration: 200,
      onComplete: () => line.destroy()
    });
  }

  public createFloatingText(x: number, y: number, textString: string, colorHex: string = '#ffffff'): void {
    if (!this.scene?.add) return;
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

  public createHealEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const circle = this.scene.add.circle(x, y, 16, 0x22c55e, 0.6).setDepth(2000);
    this.scene.tweens?.add({
      targets: circle,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => circle.destroy()
    });
  }

  public createFireExplosionEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const burst = this.scene.add.circle(x, y, 18, 0xf97316, 0.7).setDepth(2000);
    const core = this.scene.add.circle(x, y, 9, 0xfef08a, 0.9).setDepth(2001);
    this.scene.tweens?.add({
      targets: [burst, core],
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        burst.destroy();
        core.destroy();
      }
    });
  }

  public checkAndAutocastHealingMagic(member: Player, time: number): boolean {
    if (member.state === 'dead' || member.state === 'downed') return false;

    // Healing Magic requires a Staff equipped as conduit
    const isStaffEquipped = member.equippedWeapon?.id === 'staff' || member.equippedWeapon?.category === 'staff';
    if (!isStaffEquipped) return false;

    // Scan for living damaged party members (prioritize other allies, then self)
    const damagedMembers = this.party.filter(
      (m) => m.state !== 'dead' && m.state !== 'downed' && m.hp < m.maxHp
    );

    // Branch 2: Nobody needs healing -> proceed to standard combat actions
    if (damagedMembers.length === 0) return false;

    const dataLoader = DataLoader.getInstance();
    const healDef = dataLoader.getWeapon('healing_magic');
    const healInterval = healDef?.attackIntervalMs ?? 1500;

    const lastHeal = member.lastSkillUseTimes.get('healing_magic');
    if (lastHeal !== undefined && time - lastHeal < healInterval) return false;

    const healLevel = member.progression.getProficiencyLevel('healing_magic');
    const costReduction = (healDef?.levelBonus?.energyCostReductionPerLevel ?? 0.1) * healLevel;
    const energyCost = Math.max(1, Math.round((healDef?.energyCostPerCast ?? 22) - costReduction));

    // Branch 3: Damaged ally exists, but healer is out of energy (< energyCost)
    if (member.energy < energyCost) {
      // Throttle warning log to once per heal interval to avoid console spamming
      if (lastHeal === undefined || time - lastHeal >= healInterval) {
        console.log(
          `[Healing Magic] ⚠️ Out of Energy to cast Heal (${member.energy.toFixed(0)}/${energyCost})! ${member.entityName} falling back to Staff melee attack.`
        );
        member.lastSkillUseTimes.set('healing_magic', time);
      }
      // If healer does not have an active combat target, acquire one from the party or nearest living enemy
      if (!member.targetEntity || member.targetEntity.state === 'dead' || member.targetEntity.state === 'downed') {
        const potentialTarget = this.party.find(m => m !== member && m.targetEntity && m.targetEntity.state !== 'dead' && m.targetEntity.state !== 'downed')?.targetEntity
          || this.enemies.find(e => e.state !== 'dead' && e.state !== 'downed') || null;
        if (potentialTarget) {
          member.setTarget(potentialTarget);
          console.log(`[DIAG:Combat] 🎯 ${member.entityName} acquired fallback enemy target: ${potentialTarget.entityName}`);
        }
      }
      return false; // Fall back to melee target attack
    }

    // Branch 1: Damaged ally exists and healer has sufficient energy -> cast Heal
    damagedMembers.sort((a, b) => {
      const aSelf = a === member ? 1 : 0;
      const bSelf = b === member ? 1 : 0;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return (a.hp / a.maxHp) - (b.hp / b.maxHp);
    });

    const targetAlly = damagedMembers[0];

    // Deduct energy and record cast times
    const preHealEnergy = member.energy;
    member.energy -= energyCost;
    member.lastSkillUseTimes.set('healing_magic', time);
    member.lastAttackTime = time;
    member.state = 'attacking';

    const healBonus = (healDef?.levelBonus?.healPerLevel ?? 0.5) * healLevel;
    const healAmount = Math.max(1, Math.round((healDef?.baseHealAmount ?? 8) + healBonus));

    const restored = targetAlly.heal(healAmount);
    console.log(
      `[DIAG:Combat] ✨ ${member.entityName} casts Heal on ${targetAlly.entityName}! inCombat: ${member.inCombat}, Pre-EN: ${preHealEnergy.toFixed(1)}, Post-EN: ${member.energy.toFixed(1)} (cost: ${energyCost})`
    );
    console.log(
      `[Healing Magic] ✨ ${member.entityName} casts Heal on ${targetAlly.entityName}! Restored ${restored} HP. (Energy: ${member.energy}/${member.maxEnergy})`
    );

    this.createFloatingText(targetAlly.x, targetAlly.y - 15, `+${restored} HP`, '#22c55e');
    this.createSkillAttackEffect(member.x, member.y, targetAlly.x, targetAlly.y);

    // Flat proficiency EXP grant for Healing Magic (+2)
    const result = member.progression.addProficiencyExp('healing_magic', 2);
    if (result.leveledUp) {
      const newLevel = member.progression.getProficiencyLevel('healing_magic');
      this.createFloatingText(member.x, member.y - 20, `Healing Magic Level ${newLevel}!`, '#22c55e');
    }

    return true;
  }

  public checkAndAutocastAllyHeal(member: Player, time: number): boolean {
    const dataLoader = DataLoader.getInstance();
    for (const skillId of member.equippedSkillIds) {
      if (!member.isAutocastEnabled(skillId)) continue;
      const skillDef = dataLoader.getSkill(skillId);
      if (!skillDef || !member.progression.isSkillUnlocked(skillDef, member)) continue;
      if (skillDef.targetType !== 'ally' && (!skillDef.healAmount || skillDef.healAmount <= 0)) continue;

      const lastUsed = member.lastSkillUseTimes.get(skillId) || 0;
      const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
      const isAffordable = member.energy >= skillDef.energyCost;
      if (!isOffCooldown || !isAffordable) continue;

      // Find living damaged party members (prioritize other allies, then self)
      const damagedMembers = this.party.filter(
        (m) => m.state !== 'dead' && m.state !== 'downed' && m.hp < m.maxHp
      );
      if (damagedMembers.length === 0) continue;

      damagedMembers.sort((a, b) => {
        const aSelf = a === member ? 1 : 0;
        const bSelf = b === member ? 1 : 0;
        if (aSelf !== bSelf) return aSelf - bSelf;
        return (a.hp / a.maxHp) - (b.hp / b.maxHp);
      });

      const targetAlly = damagedMembers[0];
      return this.castSkill(member, skillId, targetAlly, time);
    }
    return false;
  }

  public checkAndAutocastSelfBuffs(member: Player, time: number): boolean {
    if (member.state === 'dead' || member.state === 'downed') return false;
    const hasActiveThreat = member.targetEntity !== null || this.enemies.some((e) => e.isAggroed && e.state !== 'downed' && e.state !== 'dead');
    if (!hasActiveThreat) return false;

    const dataLoader = DataLoader.getInstance();
    for (const skillId of member.equippedSkillIds) {
      if (!member.isAutocastEnabled(skillId)) continue;
      const skillDef = dataLoader.getSkill(skillId);
      if (!skillDef || !member.progression.isSkillUnlocked(skillDef, member)) continue;
      if (skillDef.targetType !== 'self') continue;

      // Don't recast if buff is already active
      if (member.hasStatusEffect(skillId)) continue;

      const lastUsed = member.lastSkillUseTimes.get(skillId) || 0;
      const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
      const isAffordable = member.energy >= skillDef.energyCost;
      if (isOffCooldown && isAffordable) {
        return this.castSkill(member, skillId, member, time);
      }
    }
    return false;
  }

  public castSkill(
    caster: Player,
    skillId: string,
    target?: Entity | Player,
    currentTime?: number
  ): boolean {
    const dataLoader = DataLoader.getInstance();
    const skillDef = dataLoader.getSkill(skillId);
    if (!skillDef || !caster.progression.isSkillUnlocked(skillDef, caster)) {
      console.warn(`[Skill] Cannot cast ${skillId}: not unlocked or not found.`);
      return false;
    }

    const time = currentTime ?? (this.scene as any)?.time?.now ?? Date.now();
    if (caster.lastSkillUseTimes.has(skillId)) {
      const lastUsed = caster.lastSkillUseTimes.get(skillId)!;
      if (time - lastUsed < skillDef.cooldownMs) {
        console.warn(`[Skill] ${skillDef.name} is on cooldown! (${((skillDef.cooldownMs - (time - lastUsed)) / 1000).toFixed(1)}s remaining)`);
        return false;
      }
    }

    if (caster.energy < skillDef.energyCost) {
      console.warn(`[Skill] Not enough energy to cast ${skillDef.name}! (${caster.energy}/${skillDef.energyCost})`);
      return false;
    }

    if (skillDef.targetType === 'self') {
      caster.energy -= skillDef.energyCost;
      caster.lastSkillUseTimes.set(skillId, time);
      caster.lastAttackTime = time;

      if (skillId === 'guard_up') {
        const effDef = dataLoader.getStatusEffect('guard_up') || {
          id: 'guard_up',
          name: 'Guard Up',
          durationMs: skillDef.durationMs ?? 5000,
          tickIntervalMs: 5000,
          damagePerTick: 0,
          color: '#38bdf8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'GUARD UP!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts Guard Up! (50% damage reduction for 5s)`);
        return true;
      } else if (skillId === 'taunt') {
        const effDef = dataLoader.getStatusEffect('taunted') || {
          id: 'taunted',
          name: 'Taunted',
          durationMs: skillDef.durationMs ?? 6000,
          tickIntervalMs: 6000,
          damagePerTick: 0,
          color: '#f97316'
        };
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        const radius = skillDef.radiusTiles ?? 5;
        let affectedCount = 0;
        for (const enemy of this.enemies) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          const enemyTile = {
            x: Math.floor(enemy.x / enemy.tileSize),
            y: Math.floor(enemy.y / enemy.tileSize)
          };
          const dist = Math.max(Math.abs(casterTile.x - enemyTile.x), Math.abs(casterTile.y - enemyTile.y));
          if (dist <= radius && this.pathfinder.hasLineOfSight(casterTile, enemyTile)) {
            enemy.applyStatusEffect(effDef);
            enemy.tauntSource = caster;
            this.enemyTargets.set(enemy, caster);
            enemy.targetEntity = caster;
            enemy.isAggroed = true;
            enemy.outOfAggroTimerMs = 0;
            enemy.state = 'chasing';
            this.createFloatingText(enemy.x, enemy.y - 20, 'TAUNTED!', '#f97316');
            affectedCount++;
          }
        }
        this.createFloatingText(caster.x, caster.y - 12, 'TAUNT!', '#f97316');
        console.log(`[Skill] ${caster.entityName} casts Taunt! Forced ${affectedCount} enemies within ${radius} tiles to target them.`);
        return true;
      } else if (skillId === 'retaliate') {
        const effDef = dataLoader.getStatusEffect('retaliate') || {
          id: 'retaliate',
          name: 'Retaliate',
          durationMs: skillDef.durationMs ?? 15000,
          tickIntervalMs: 15000,
          damagePerTick: 0,
          color: '#eab308'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'RETALIATE READY!', '#eab308');
        console.log(`[Skill] ${caster.entityName} casts Retaliate! Next hit taken triggers free counterattack.`);
        return true;
      } else if (skillId === 'unbreakable') {
        const effDef = dataLoader.getStatusEffect('unbreakable') || {
          id: 'unbreakable',
          name: 'Unbreakable',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 4000,
          damagePerTick: 0,
          color: '#f59e0b'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'UNBREAKABLE!', '#f59e0b');
        console.log(`[Skill] ${caster.entityName} casts Unbreakable! Full damage immunity for 4s.`);
        return true;
      }
      return true;
    } else if (skillDef.targetType === 'ally' || (skillDef.healAmount && skillDef.healAmount > 0)) {
      let targetAlly = target as Player | undefined;
      if (!targetAlly || targetAlly.state === 'dead' || targetAlly.state === 'downed') {
        const candidates = this.party.filter(
          (m) => m.state !== 'dead' && m.state !== 'downed' && m.hp < m.maxHp
        );
        candidates.sort((a, b) => {
          const aSelf = a === caster ? 1 : 0;
          const bSelf = b === caster ? 1 : 0;
          if (aSelf !== bSelf) return aSelf - bSelf;
          return (a.hp / a.maxHp) - (b.hp / b.maxHp);
        });
        targetAlly = candidates[0] || caster;
      }

      caster.energy -= skillDef.energyCost;
      caster.lastSkillUseTimes.set(skillId, time);
      caster.lastAttackTime = time;

      const restored = targetAlly.heal(skillDef.healAmount || 20);
      this.createHealEffect(targetAlly.x, targetAlly.y);
      this.createFloatingText(targetAlly.x, targetAlly.y - 12, `+${restored} HP`, '#22c55e');

      console.log(
        `[Skill] ${caster.entityName} casts ${skillDef.name} on ${targetAlly.entityName}! Restored ${restored} HP. (Energy: ${caster.energy}/${caster.maxEnergy})`
      );
      return true;
    } else {
      const enemyTarget = (target as Enemy) || (caster.targetEntity instanceof Enemy ? caster.targetEntity : null);
      if (!enemyTarget || enemyTarget.state === 'dead' || enemyTarget.state === 'downed') {
        return false;
      }

      if (skillId === 'shield_bash') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        if (curDist > 1) {
          console.warn(`[Skill] Cannot cast Shield Bash: target is outside melee range (${curDist} > 1)`);
          return false;
        }
      }

      caster.energy -= skillDef.energyCost;
      caster.lastSkillUseTimes.set(skillId, time);
      caster.lastAttackTime = time;
      caster.state = 'attacking';

      this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
      const weapon = caster.equippedWeapon;
      const weaponLevel = caster.progression.getProficiencyLevel(weapon.id);
      const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
      const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
      const moodTier = dataLoader.getMoodTier(caster.mood);
      const effBase = rawBase * moodTier.combatDamageMultiplier;
      const skillDamage = effBase * (skillDef.damageMultiplier ?? 1.0);

      this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `${skillDef.name.toUpperCase()}! -${skillDamage.toFixed(1)}`, '#f59e0b');
      
      if (skillId === 'shield_bash') {
        const stunDef = dataLoader.getStatusEffect('stun') || {
          id: 'stun',
          name: 'Stun',
          durationMs: skillDef.stunDurationMs ?? 2000,
          tickIntervalMs: 2000,
          damagePerTick: 0,
          color: '#facc15'
        };
        enemyTarget.applyStatusEffect(stunDef);
        enemyTarget.stopMovement();
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'STUNNED!', '#facc15');
        console.log(`[Skill] Shield Bash STUNNED ${enemyTarget.entityName} for 2s!`);
      }

      const downed = enemyTarget.takeDamage(skillDamage);
      if (downed) {
        this.handleTargetDefeated(caster, enemyTarget, weapon.id);
      }
      return true;
    }
  }

  public triggerRetaliation(attacker: Enemy, victim: Player): void {
    if (attacker.state === 'dead' || attacker.state === 'downed') return;

    // Milestone 11: Non-interference rule - only genuinely idle / unengaged living members join retaliation
    const idleLivingMembers = this.party.filter(
      (m) => m.state !== 'downed' && m.state !== 'dead' && m.targetEntity === null
    );

    if (idleLivingMembers.length === 0) return;

    console.log(
      `%c[Combat Retaliation] ⚔️ ${victim.entityName} was attacked by ${attacker.entityName} while unengaged! Commanding ${idleLivingMembers.length} idle party member(s) to retaliate!`,
      'color: #f87171; font-weight: bold;'
    );

    if (this.scene && typeof (this.scene as any).engageEnemy === 'function') {
      (this.scene as any).engageEnemy(attacker, idleLivingMembers);
    } else {
      this.engageMembers(attacker, idleLivingMembers);
    }
  }

  public engageMembers(enemy: Enemy, livingMembers: Player[]): void {
    if (enemy.state === 'dead' || enemy.state === 'downed') return;
    if (livingMembers.length === 0) return;

    const now = (this.scene as any)?.time?.now ?? Date.now();
    this.lastCombatTimeMs = now;
    enemy.isAggroed = true;
    if (!enemy.targetEntity || enemy.targetEntity.state === 'downed' || enemy.targetEntity.state === 'dead') {
      enemy.targetEntity = livingMembers[0];
      this.enemyTargets.set(enemy, livingMembers[0]);
      const curDist = Math.max(
        Math.abs(enemy.gridPos.x - livingMembers[0].gridPos.x),
        Math.abs(enemy.gridPos.y - livingMembers[0].gridPos.y)
      );
      if (curDist > (enemy.enemyData.attackRangeTiles ?? 1)) {
        enemy.state = 'chasing';
      }
    }

    // Pass 0: Purge stale targets ONLY for members being commanded
    for (const member of livingMembers) {
      if (member.targetEntity !== enemy) {
        member.clearTarget();
      }
    }

    const tileOwner = new Map<string, Player>();
    const memberDest = new Map<Player, GridPos>();
    const claimedKeys = new Set<string>();

    // Reserve tiles/destinations of non-participating living members (e.g. fighting a different enemy)
    for (const other of this.party) {
      if (other.state !== 'dead' && other.state !== 'downed' && !livingMembers.includes(other)) {
        claimedKeys.add(`${other.gridPos.x},${other.gridPos.y}`);
        if (other.claimedDestination) {
          claimedKeys.add(`${other.claimedDestination.x},${other.claimedDestination.y}`);
        }
      }
    }

    // Pass 1: Members that can currently land an attack from their exact current tile hold position
    for (const member of livingMembers) {
      member.setTarget(enemy);
      const dx = Math.abs(member.gridPos.x - enemy.gridPos.x);
      const dy = Math.abs(member.gridPos.y - enemy.gridPos.y);
      const currentDist = Math.max(dx, dy);

      const canAttackNow = currentDist <= member.attackRangeTiles && currentDist > 0;
      const key = `${member.gridPos.x},${member.gridPos.y}`;

      if (canAttackNow && !claimedKeys.has(key)) {
        claimedKeys.add(key);
        tileOwner.set(key, member);
        memberDest.set(member, { ...member.gridPos });
        member.claimedDestination = null;
        if (member.isMoving()) {
          member.stopMovement();
        }
      }
    }

    // Pass 2: Assign distinct reachable tiles within attackRangeTiles to unassigned members
    const unassigned = livingMembers.filter((m) => !memberDest.has(m));
    unassigned.sort((a, b) => {
      const distA = Math.hypot(a.gridPos.x - enemy.gridPos.x, a.gridPos.y - enemy.gridPos.y);
      const distB = Math.hypot(b.gridPos.x - enemy.gridPos.x, b.gridPos.y - enemy.gridPos.y);
      return distA - distB;
    });

    for (const member of unassigned) {
      const targetTile = this.findOpenAttackTileForMember(enemy, member, claimedKeys);
      if (targetTile) {
        const key = `${targetTile.x},${targetTile.y}`;
        claimedKeys.add(key);
        tileOwner.set(key, member);
        memberDest.set(member, targetTile);
      }
    }

    // Pass 3: Execute movement for members that need to travel
    for (const member of livingMembers) {
      const dest = memberDest.get(member);
      if (!dest) {
        member.claimedDestination = null;
        if (member.isMoving()) {
          member.stopMovement();
        }
        continue;
      }

      if (member.gridPos.x === dest.x && member.gridPos.y === dest.y) {
        if (member.isMoving()) {
          member.stopMovement();
        }
        member.claimedDestination = null;
        continue;
      }

      if (member.isMoving() && member.claimedDestination && member.claimedDestination.x === dest.x && member.claimedDestination.y === dest.y) {
        continue;
      }

      member.claimedDestination = { ...dest };
      member.lastCombatRepathTimeMs = now;
      member.state = 'moving';

      const softObs: GridPos[] = [];
      const hardObs: GridPos[] = [];
      for (const m of this.party) {
        if (m !== member && m.state !== 'dead' && m.state !== 'downed') {
          softObs.push(m.gridPos);
        }
      }
      for (const e of this.enemies) {
        if (e.state !== 'dead' && e.state !== 'downed') {
          hardObs.push(e.gridPos);
        }
      }

      this.pathfinder.findPath(member.gridPos, dest, { soft: softObs, hard: hardObs }).then((path) => {
        if (path.length > 0 && member.state !== 'downed' && member.state !== 'dead' && member.targetEntity === enemy) {
          member.followPath(path);
        } else {
          member.claimedDestination = null;
          if (member.isMoving()) {
            member.stopMovement();
          }
        }
      });
    }
  }

  public updateStaffDynamicRange(member: Player): void {
    const isStaffOrFire = member.equippedWeapon?.id === 'staff' ||
      member.equippedWeapon?.category === 'staff' ||
      member.equippedWeapon?.id === 'fire_magic' ||
      member.equippedWeapon?.category === 'magic';
    if (!isStaffOrFire) return;

    const fireDef = DataLoader.getInstance().getWeapon('fire_magic');
    const fireProfLevel = member.progression.getProficiencyLevel('fire_magic');
    const fireCostReduction = (fireDef?.levelBonus?.energyCostReductionPerLevel ?? 0.1) * fireProfLevel;
    const fireEnergyCost = fireDef ? Math.max(1, Math.round((fireDef.energyCostPerCast ?? 22) - fireCostReduction)) : 22;
    const canCastFire = fireDef !== null && member.energy >= fireEnergyCost;
    member.attackRangeTiles = canCastFire ? (fireDef?.attackRangeTiles ?? 4) : 1;
  }

  public getEffectiveWeaponForAttack(member: Player): WeaponDef {
    const isStaffOrFire = member.equippedWeapon?.id === 'staff' ||
      member.equippedWeapon?.category === 'staff' ||
      member.equippedWeapon?.id === 'fire_magic' ||
      member.equippedWeapon?.category === 'magic';
    if (!isStaffOrFire) return member.equippedWeapon;

    const dataLoader = DataLoader.getInstance();
    const fireDefFromData = dataLoader.getWeapon('fire_magic');
    const staffDef = dataLoader.getWeapon('staff') || member.equippedWeapon;
    const fireLevel = member.progression.getProficiencyLevel('fire_magic');
    const fireCostReduction = (fireDefFromData?.levelBonus?.energyCostReductionPerLevel ?? 0.1) * fireLevel;
    const staffFireCost = fireDefFromData ? Math.max(1, Math.round((fireDefFromData.energyCostPerCast ?? 22) - fireCostReduction)) : 22;
    const isCastingFire = fireDefFromData !== null && member.energy >= staffFireCost;
    return isCastingFire ? fireDefFromData! : staffDef;
  }
}
