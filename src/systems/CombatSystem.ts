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

  /**
   * Milestone 22: Opens the Riposte window (3s) following a successful Evade or Parry proc.
   */
  public openRiposteWindow(target: Player, enemy: Entity): void {
    const dataLoader = DataLoader.getInstance();
    const riposteDef = dataLoader.getSkill('riposte');
    if (!riposteDef || !target.progression.isSkillUnlocked(riposteDef, target)) {
      return;
    }
    const effDef = dataLoader.getStatusEffect('riposte_window') || {
      id: 'riposte_window',
      name: 'Riposte Ready',
      durationMs: 3000,
      tickIntervalMs: 3000,
      damagePerTick: 0,
      color: '#eab308'
    };
    target.applyStatusEffect(effDef);
    (target as any).lastRiposteTarget = enemy;
    this.createFloatingText(target.x, target.y - 12, 'RIPOSTE READY!', '#eab308');
    console.log(`[Combat] ⚡ Riposte window opened for ${target.entityName} against ${enemy.entityName}!`);
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

      // Disable check: disabled enemy (stunned, shocked, etc.) halts movement and cannot act
      if (typeof enemy.isDisabled === 'function' ? enemy.isDisabled() : (enemy.hasStatusEffect('stun') || enemy.hasStatusEffect('shock'))) {
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
                  this.openRiposteWindow(target, enemy);
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
                  this.openRiposteWindow(target, enemy);
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
                  if (actualDamage > 0 && this.scene) {
                    if (typeof (this.scene as any).interruptGatherChannel === 'function') {
                      (this.scene as any).interruptGatherChannel(target, enemy);
                    }
                    if (typeof (this.scene as any).interruptReviveChannel === 'function') {
                      (this.scene as any).interruptReviveChannel(target, enemy);
                    }
                  }

                  // Milestone 34: Boss Unique Mechanic — Titanic Cleave Shockwave
                  if (enemy.enemyData.tier === 'boss' && actualDamage > 0) {
                    const splashDamage = Math.max(1, Math.round(actualDamage * 0.5));
                    for (const member of this.party) {
                      if (member !== target && member.state !== 'downed' && member.state !== 'dead') {
                        const dist = Math.hypot(member.gridPos.x - enemy.gridPos.x, member.gridPos.y - enemy.gridPos.y);
                        if (dist <= 1.5) {
                          const memDowned = member.takeDamage(splashDamage);
                          this.createAttackEffect(enemy.x, enemy.y, member.x, member.y, 0xdc2626);
                          this.createFloatingText(member.x, member.y - 18, `-${splashDamage} (CLEAVE!)`, '#f87171');
                          console.log(`[Combat:Boss Cleave] 💥 ${enemy.entityName} cleave hits ${member.entityName} for ${splashDamage} damage!`);
                          if (this.scene) {
                            if (typeof (this.scene as any).interruptGatherChannel === 'function') {
                              (this.scene as any).interruptGatherChannel(member, enemy);
                            }
                            if (typeof (this.scene as any).interruptReviveChannel === 'function') {
                              (this.scene as any).interruptReviveChannel(member, enemy);
                            }
                          }
                          if (memDowned) {
                            console.log(`[Combat] ${member.entityName} was downed by Boss cleave shockwave!`);
                            member.clearTarget();
                          }
                        }
                      }
                    }
                  }

                  // Milestone 34: Boss Unique Mechanic — Earthshaker Tremor (30% stun chance on hit)
                  if (enemy.enemyData.tier === 'boss' && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < 0.30) {
                      const stunEffect = {
                        id: 'stun',
                        name: 'Stun',
                        durationMs: 2000,
                        tickIntervalMs: 2000,
                        damagePerTick: 0,
                        disablesActions: true,
                        disablesMovement: true,
                        isHarmful: true,
                        color: '#facc15'
                      };
                      target.applyStatusEffect(stunEffect);
                      this.createFloatingText(target.x, target.y - 28, 'EARTHSHAKER! STUNNED!', '#facc15');
                      console.log(`[Combat:Boss Tremor] ⚡ ${enemy.entityName} strikes with Earthshaker Tremor! ${target.entityName} is STUNNED (2s)!`);
                    }
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

      if (typeof member.isDisabled === 'function' ? member.isDisabled() : (member.hasStatusEffect('stun') || member.hasStatusEffect('shock'))) {
        member.stopMovement();
        continue;
      }

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
      const dataLoader = DataLoader.getInstance();

      // Milestone 22: Fleche approach gap-closer autocast (when outside melee range up to rangeTiles)
      if (distanceTiles > member.attackRangeTiles && member.targetEntity) {
        if (member.equippedSkillIds.includes('fleche') && member.isAutocastEnabled('fleche')) {
          const flecheDef = dataLoader.getSkill('fleche');
          if (flecheDef && member.progression.isSkillUnlocked(flecheDef, member)) {
            const isOffCd = !member.lastSkillUseTimes.has('fleche') || (time - member.lastSkillUseTimes.get('fleche')! >= flecheDef.cooldownMs);
            const isAffordable = member.energy >= flecheDef.energyCost;
            const maxRange = flecheDef.rangeTiles ?? 5;
            if (isOffCd && isAffordable && distanceTiles <= maxRange) {
              const castSuccess = this.castSkill(member, 'fleche', target, time);
              if (castSuccess) {
                continue;
              }
            }
          }
        }
        // Milestone 24: Smite ranged holy strike autocast (when outside melee range up to rangeTiles)
        if (member.equippedSkillIds.includes('smite') && member.isAutocastEnabled('smite')) {
          const smiteDef = dataLoader.getSkill('smite');
          if (smiteDef && member.progression.isSkillUnlocked(smiteDef, member)) {
            const isOffCd = !member.lastSkillUseTimes.has('smite') || (time - member.lastSkillUseTimes.get('smite')! >= smiteDef.cooldownMs);
            const isAffordable = member.energy >= smiteDef.energyCost;
            const maxRange = smiteDef.rangeTiles ?? 5;
            if (isOffCd && isAffordable && distanceTiles <= maxRange) {
              const castSuccess = this.castSkill(member, 'smite', target, time);
              if (castSuccess) {
                continue;
              }
            }
          }
        }
      }

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
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = member.progression.getProficiencyLevel(weaponId);
        const damageBonusPerLevel = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const accuracyBonusPerLevel = effectiveWeapon.levelBonus?.accuracyPerLevel ?? 0;
        const rawBaseDamage = effectiveWeapon.baseDamage + weaponLevel * damageBonusPerLevel;
        const baseAccuracy = effectiveWeapon.baseAccuracy ?? 0.60;

        const moodTier = dataLoader.getMoodTier(member.mood);
        const effectiveBaseDamage = rawBaseDamage * moodTier.combatDamageMultiplier;

        const speedBonus = (effectiveWeapon.levelBonus?.attackSpeedPerLevel ?? 0) * weaponLevel;
        const effectiveAttackInterval = Math.max(300, effectiveWeapon.attackIntervalMs / (1 + speedBonus));

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

          // Milestone 22: Riposte requires active riposte_window
          if (skillId === 'riposte' && !member.hasStatusEffect('riposte_window')) continue;

          const isOffCooldown = !member.lastSkillUseTimes.has(skillId) || (time - member.lastSkillUseTimes.get(skillId)! >= skillDef.cooldownMs);
          const isAffordable = member.energy >= skillDef.energyCost;
          const isWeaponReady = time - member.lastAttackTime >= effectiveAttackInterval;

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

            // Milestone 22: Riposte reactive counter-strike
            if (skillId === 'riposte') {
              member.removeStatusEffect('riposte_window');
              this.executePlayerCounterattack(member, target as Enemy, {
                procced: true,
                damageMultiplier: skillDef.damageMultiplier ?? 1.8,
                canCrit: true,
                chainAttack: false
              });
              this.createFloatingText(member.x, member.y - 12, 'RIPOSTE!', '#eab308');
              this.lastCombatTimeMs = time;
              break;
            }

            // Milestone 22: Blade Dance rapid multi-hit combo
            if (skillId === 'blade_dance') {
              const strikeCount = skillDef.strikeCount ?? 4;
              const damagePerHit = skillDef.damagePerHitMultiplier ?? 0.8;
              const strikeDamage = effectiveBaseDamage * damagePerHit;
              console.log(
                `[Skill] ${member.entityName} unleashes Blade Dance! (${strikeCount} strikes for ${strikeDamage.toFixed(1)} each)`
              );
              for (let i = 1; i <= strikeCount; i++) {
                if (target.state === 'dead' || target.state === 'downed') break;
                this.createSkillAttackEffect(member.x, member.y, target.x, target.y);
                this.createFloatingText(target.x, target.y - 10 - (i * 6), `BLADE DANCE! -${strikeDamage.toFixed(1)}`, '#f59e0b');
                this.checkAndApplyBleed(member, target);
                const targetDowned = target.takeDamage(strikeDamage);
                if (targetDowned) {
                  this.handleTargetDefeated(member, target, weaponId);
                  break;
                }
              }
              const result = member.progression.addProficiencyExp(weaponId, 2);
              if (result.leveledUp) {
                const newLevel = member.progression.getProficiencyLevel(weaponId);
                this.createFloatingText(member.x, member.y - 20, `${effectiveWeapon.name} Level ${newLevel}!`, '#22c55e');
              }
              this.lastCombatTimeMs = time;
              break;
            }

            this.createSkillAttackEffect(member.x, member.y, target.x, target.y);

            // Milestone 22: Reconcile accuracyBonus (e.g. Thrust +30%)
            const skillAccBonus = skillDef.accuracyBonus ?? 0;
            const effectiveSkillAccuracy = Math.min(1.0, effectiveAccuracy + skillAccBonus);
            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveSkillAccuracy;

            if (!isHit) {
              console.log(
                `[Skill] ${member.entityName} casts ${skillDef.name} but MISSED! (Hit Chance: ${(effectiveSkillAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(hitRoll * 100).toFixed(1)}%)`
              );
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              const mult = skillDef.damageMultiplier ?? 1.0;
              let skillDamage = effectiveBaseDamage * mult;
              if (member.hasStatusEffect('blessed_weapons')) {
                skillDamage += 5;
                this.createFloatingText(target.x, target.y - 24, '+5 HOLY!', '#facc15');
              }
              console.log(
                `[Skill] ${member.entityName} casts ${skillDef.name}! Dealt ${skillDamage.toFixed(1)} damage (${mult * 100}% of ${effectiveBaseDamage.toFixed(2)})${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''}`
              );
              this.createFloatingText(target.x, target.y - 10, `${skillDef.name.toUpperCase()}! -${skillDamage.toFixed(1)}`, '#f59e0b');

              if (skillDef.id === 'smite') {
                this.createHolySmiteEffect(member.x, member.y, target.x, target.y);
                member.progression.addProficiencyExp('healing_magic', 2);
              }

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
              this.checkAndApplyStun(member, target);

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
          if (time - member.lastAttackTime >= effectiveAttackInterval) {
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
              `[DIAG:Combat] ⚔️ ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name}! inCombat: ${member.inCombat}, Pre-EN: ${((member.energy ?? 0) + energyCost).toFixed(1)}, Post-EN: ${(member.energy ?? 0).toFixed(1)}, Range: ${member.attackRangeTiles}, Dist: ${distanceTiles}`
            );

            const isFire = effectiveWeapon.id === 'fire_magic';
            const isLightning = effectiveWeapon.id === 'lightning_magic';
            const isIce = effectiveWeapon.id === 'ice_magic';
            const isHoly = effectiveWeapon.id === 'holy_magic';
            const isRangedBow = effectiveWeapon.category === 'ranged' || effectiveWeapon.proficiencyId === 'bows' || effectiveWeapon.id === 'bows';
            const attackColor = isFire ? 0xf97316 : isLightning ? 0x38bdf8 : isIce ? 0x67e8f9 : isHoly ? 0xfacc15 : isRangedBow ? 0xf59e0b : 0x3b82f6;
            if (isLightning) {
              this.createLightningBoltEffect(member.x, member.y, target.x, target.y);
            } else if (isHoly) {
              this.createHolySmiteEffect(member.x, member.y, target.x, target.y);
            } else {
              this.createAttackEffect(member.x, member.y, target.x, target.y, attackColor);
            }
            if (isFire) {
              this.createFireExplosionEffect(target.x, target.y);
            } else if (isIce) {
              this.createFrostEffect(target.x, target.y);
            } else if (isHoly) {
              this.createHolyImpactEffect(target.x, target.y);
            }

            const hitRoll = Math.random();
            const isHit = hitRoll < effectiveAccuracy;

            if (!isHit) {
              console.log(
                `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty: -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(hitRoll * 100).toFixed(1)}%)`
              );
              this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
            } else {
              let damage = effectiveBaseDamage;
              if (member.hasStatusEffect('blessed_weapons')) {
                damage += 5;
                this.createFloatingText(target.x, target.y - 24, '+5 HOLY!', '#facc15');
              }
              console.log(
                `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} for ${damage.toFixed(1)} damage! (Base: ${effectiveWeapon.baseDamage}, Lv ${weaponLevel} Bonus: +${(weaponLevel * damageBonusPerLevel).toFixed(1)}, Accuracy: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''})`
              );
              const dmgColor = isFire ? '#f97316' : isLightning ? '#38bdf8' : isIce ? '#67e8f9' : isHoly ? '#facc15' : isRangedBow ? '#f59e0b' : '#38bdf8';
              this.createFloatingText(target.x, target.y - 10, `-${damage.toFixed(1)}`, dmgColor);

              this.checkAndApplyBleed(member, target, effectiveWeapon);
              this.checkAndApplyBurn(member, target, effectiveWeapon);
              this.checkAndApplyStun(member, target, effectiveWeapon);
              this.checkAndApplyShock(member, target, effectiveWeapon);
              this.checkAndApplySlow(member, target, effectiveWeapon);
              if (isHoly) {
                this.applyHolyRadiance(member, target, effectiveWeapon, weaponLevel);
              }

              // Chain targeting for weapons with chainTargets (e.g. Lightning Magic)
              if (effectiveWeapon.chainTargets && effectiveWeapon.chainTargets > 0) {
                const maxHops = effectiveWeapon.chainTargets;
                const hopRange = effectiveWeapon.chainHopRangeTiles ?? 3;
                const falloff = effectiveWeapon.chainDamageFalloff ?? 0.30;
                const chainedEnemies = new Set<Entity>([target]);
                let currentSource: Entity = target;
                let currentDmg = damage;

                for (let hop = 1; hop <= maxHops; hop++) {
                  let closestEnemy: Enemy | null = null;
                  let closestDist = Infinity;

                  for (const candidate of this.enemies) {
                    if (candidate.state === 'dead' || candidate.state === 'downed') continue;
                    if (chainedEnemies.has(candidate)) continue;

                    const cdx = Math.abs(candidate.gridPos.x - currentSource.gridPos.x);
                    const cdy = Math.abs(candidate.gridPos.y - currentSource.gridPos.y);
                    const dist = Math.max(cdx, cdy);
                    if (dist > 0 && dist <= hopRange && dist < closestDist) {
                      closestDist = dist;
                      closestEnemy = candidate;
                    }
                  }

                  if (!closestEnemy) {
                    // Gracefully terminate chain if no eligible unchained enemies in hop range
                    break;
                  }

                  chainedEnemies.add(closestEnemy);
                  currentDmg = currentDmg * (1 - falloff);
                  console.log(`[Combat:Chain] ⚡ Chain hop ${hop} arcs to ${closestEnemy.entityName} for ${currentDmg.toFixed(1)} damage!`);
                  this.createLightningChainEffect(currentSource.x, currentSource.y, closestEnemy.x, closestEnemy.y);
                  this.createFloatingText(closestEnemy.x, closestEnemy.y - 10, `-${currentDmg.toFixed(1)} (Chain)`, '#38bdf8');
                  this.checkAndApplyShock(member, closestEnemy, effectiveWeapon);
                  this.lastCombatTimeMs = time;
                  closestEnemy.isAggroed = true;
                  const chainDowned = closestEnemy.takeDamage(currentDmg);
                  if (chainDowned) {
                    this.handleTargetDefeated(member, closestEnemy, weaponId);
                  }
                  currentSource = closestEnemy;
                }
              }

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
                    this.checkAndApplyBurn(member, enemy, effectiveWeapon);
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
              const offProfId = offWpn.proficiencyId ?? offWpn.id;
              const offLevel = member.progression.getProficiencyLevel(offProfId);
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
                let offDmg = offEffectiveDamage;
                if (member.hasStatusEffect('blessed_weapons')) {
                  offDmg += 5;
                  this.createFloatingText(target.x, target.y - 30, '+5 HOLY!', '#facc15');
                }
                console.log(
                  `[Dual Wield] ⚔️ ${member.entityName} offhand strike with ${offWpn.name} hits ${target.entityName} for ${offDmg.toFixed(1)} damage! (DW Penalty: -${(dwPenalty * 100).toFixed(0)}%, Hit Chance: ${(offEffectiveAccuracy * 100).toFixed(1)}%)`
                );
                this.createFloatingText(target.x, target.y - 22, `-${offDmg.toFixed(1)} (DW)`, '#c084fc');

                member.progression.addProficiencyExp(offProfId, 2);
                const dwResult = member.progression.addProficiencyExp('dual_wielding', 2);
                if (dwResult.leveledUp) {
                  const dwLv = member.progression.getProficiencyLevel('dual_wielding');
                  this.createFloatingText(member.x, member.y - 20, `Dual Wield Level ${dwLv}!`, '#a855f7');
                }

                this.checkAndApplyStun(member, target, offWpn);

                this.lastCombatTimeMs = time;
                if ((target.state as string) !== 'dead' && (target.state as string) !== 'downed') (target as any).isAggroed = true;
                const offTargetDowned = target.takeDamage(offDmg);
                if (offTargetDowned) {
                  this.handleTargetDefeated(member, target, offProfId);
                }
              }
            }
          }
        }
      } else {
        // Target is outside attack range: Party Member Pursuit & Surround Maintenance
        if (member.attackRangeTiles === 1 && (member.equippedWeapon?.category === 'magic' || member.equippedWeapon?.id.endsWith('_staff') || member.equippedWeapon?.spellWeaponId)) {
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
          hasShield: typeof member.hasShield === 'function' ? member.hasShield() : (member.offhandWeapon?.category === 'offhand'),
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

  private checkAndApplyBleed(attacker: Player, target: Entity, weaponOverride?: WeaponDef): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (weapon.bleedChance && Math.random() < weapon.bleedChance) {
      const bleedDef = DataLoader.getInstance().getStatusEffect('bleed');
      if (bleedDef) {
        console.log(`[StatusEffect] Applied Bleed to ${target.entityName}!`);
        target.applyStatusEffect(bleedDef);
        this.createFloatingText(target.x, target.y - 25, 'BLEED!', '#ef4444');
      }
    }
  }

  private checkAndApplyBurn(attacker: Player, target: Entity, weaponOverride?: WeaponDef): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (!weapon.burnChance) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
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

  private checkAndApplyStun(attacker: Player, target: Entity, weaponOverride?: WeaponDef): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (!weapon.stunChance) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
    const stunBonusPerLevel = weapon.levelBonus?.stunChancePerLevel ?? 0;
    const effectiveStunChance = weapon.stunChance + weaponLevel * stunBonusPerLevel;

    if (Math.random() < effectiveStunChance) {
      const stunDef = DataLoader.getInstance().getStatusEffect('stun') || {
        id: 'stun',
        name: 'Stun',
        durationMs: 2000,
        tickIntervalMs: 2000,
        damagePerTick: 0,
        disablesActions: true,
        disablesMovement: true,
        color: '#facc15'
      };
      console.log(
        `[StatusEffect] Stun proc on ${target.entityName}! (Proc Chance: ${(effectiveStunChance * 100).toFixed(1)}%)`
      );
      target.applyStatusEffect(stunDef);
      target.stopMovement();
      this.createFloatingText(target.x, target.y - 25, 'STUNNED!', '#facc15');
    }
  }

  private checkAndApplyShock(attacker: Player, target: Entity, weaponOverride?: WeaponDef): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (!weapon.shockChance) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
    const shockBonusPerLevel = weapon.levelBonus?.shockChancePerLevel ?? 0;
    const effectiveShockChance = weapon.shockChance + weaponLevel * shockBonusPerLevel;

    if (Math.random() < effectiveShockChance) {
      const shockDef = DataLoader.getInstance().getStatusEffect('shock') || {
        id: 'shock',
        name: 'Shock',
        durationMs: 1000,
        tickIntervalMs: 1000,
        damagePerTick: 0,
        disablesActions: true,
        disablesMovement: true,
        interruptsAttack: true,
        color: '#06b6d4'
      };
      console.log(
        `[StatusEffect] ⚡ Shock proc on ${target.entityName}! (Proc Chance: ${(effectiveShockChance * 100).toFixed(1)}%)`
      );
      target.applyStatusEffect(shockDef);
      if (shockDef.disablesMovement) {
        target.stopMovement();
      }
      if (shockDef.interruptsAttack) {
        if ('lastAttackTimeMs' in target) {
          (target as any).lastAttackTimeMs = Date.now();
        }
        if ('state' in target && (target as any).state === 'attacking') {
          (target as any).state = 'chasing';
        }
      }
      this.createFloatingText(target.x, target.y - 25, 'SHOCKED!', '#06b6d4');
      this.createShockSparksEffect(target.x, target.y);
    }
  }

  private checkAndApplySlow(attacker: Player, target: Entity, weaponOverride?: WeaponDef): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (!weapon.slowChance) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
    const slowBonusPerLevel = weapon.levelBonus?.slowChancePerLevel ?? 0;
    const effectiveSlowChance = weapon.slowChance + weaponLevel * slowBonusPerLevel;

    if (Math.random() < effectiveSlowChance) {
      const slowDef = DataLoader.getInstance().getStatusEffect('slow') || {
        id: 'slow',
        name: 'Slow',
        durationMs: 3000,
        tickIntervalMs: 1000,
        damagePerTick: 0,
        moveSpeedMultiplier: 0.5,
        isHarmful: true,
        color: '#67e8f9'
      };
      console.log(
        `[StatusEffect] ❄️ Slow proc on ${target.entityName}! (Proc Chance: ${(effectiveSlowChance * 100).toFixed(1)}%)`
      );
      target.applyStatusEffect(slowDef);
      this.createFloatingText(target.x, target.y - 25, 'SLOWED!', '#67e8f9');
      this.createFrostEffect(target.x, target.y);
    }
  }

  public applyHolyRadiance(
    caster: Player,
    _target: Entity,
    weaponDef: WeaponDef,
    weaponLevel: number
  ): void {
    const baseHeal = weaponDef.radianceHealAmount ?? 3;
    const healBonusPerLevel = weaponDef.levelBonus?.radianceHealPerLevel ?? 0.1;
    const healAmount = Math.max(1, Math.round(baseHeal + weaponLevel * healBonusPerLevel));

    const radiusTiles = weaponDef.attackRangeTiles ?? 4;
    const casterTile = {
      x: Math.floor(caster.x / caster.tileSize),
      y: Math.floor(caster.y / caster.tileSize)
    };

    const candidates = this.party && this.party.length > 0 ? this.party : [caster];
    let bestCandidate: Player | null = null;
    let lowestHpRatio = 1.0;

    for (const ally of candidates) {
      if (ally.state === 'dead' || ally.state === 'downed') continue;
      const aTile = {
        x: Math.floor(ally.x / ally.tileSize),
        y: Math.floor(ally.y / ally.tileSize)
      };
      const dist = Math.max(Math.abs(casterTile.x - aTile.x), Math.abs(casterTile.y - aTile.y));
      if (dist <= radiusTiles && (ally.hp < ally.maxHp || ally.criticalHp < ally.maxCriticalHp)) {
        const hpRatio = (ally.hp + ally.criticalHp) / (ally.maxHp + ally.maxCriticalHp);
        if (hpRatio < lowestHpRatio) {
          lowestHpRatio = hpRatio;
          bestCandidate = ally;
        }
      }
    }

    if (bestCandidate) {
      const restored = bestCandidate.heal(healAmount);
      if (restored > 0) {
        this.createHealEffect(bestCandidate.x, bestCandidate.y);
        this.createFloatingText(bestCandidate.x, bestCandidate.y - 14, `+${restored} HP (Radiance)`, '#22c55e');
        console.log(
          `[Combat:Holy] ☀️ Radiance pulse healed ${bestCandidate.entityName} for ${restored} HP! (HP: ${bestCandidate.hp}/${bestCandidate.maxHp})`
        );
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
      killer.progression.addProficiencyExp(killer.offhandWeapon.proficiencyId ?? killer.offhandWeapon.id, 2);
      killer.progression.addProficiencyExp('dual_wielding', 2);
    }

    // Milestone 14 & 34: Class EXP kill hook (scaled by enemy tier: Common +25, Elite +50, Epic +100, Boss +250)
    if (killer.activeClass) {
      const tier = (target instanceof Enemy) ? target.enemyData.tier : 'common';
      const classExpAmount = tier === 'boss' ? 250 : tier === 'epic' ? 100 : tier === 'elite' ? 50 : 25;
      const classResult = killer.progression.addClassExp(killer.activeClass, classExpAmount);
      const activeName = killer.activeClass.toUpperCase();
      const expColor = tier === 'boss' ? '#ef4444' : tier === 'epic' ? '#c084fc' : '#f59e0b';
      this.createFloatingText(killer.x, killer.y - 12, `+${classExpAmount} ${activeName} EXP`, expColor);
      if (classResult.leveledUp) {
        const newClassLvl = killer.progression.getClassLevel(killer.activeClass);
        this.createFloatingText(killer.x, killer.y - 30, `Class Level Up! ${activeName} Lv ${newClassLvl}!`, expColor);
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
      // Roll and award harvest drops (excluding Skinning and Butchering items moved to manual corpse interaction)
      if (target.enemyData.harvest && target.enemyData.harvest.length > 0) {
        const gameState = GameState.getInstance();
        const isBoss = target.enemyData.tier === 'boss';
        for (const h of target.enemyData.harvest) {
          if (h.method === 'skinning' || h.method === 'butchering') continue;
          if (['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)) continue;
          const isRare = h.method === 'rare_drop';
          const roll = Math.random();
          const rareThreshold = isBoss ? 0.60 : 0.35;
          if (!isRare || roll < rareThreshold) {
            gameState.addItem(h.item, 1);
            const itemName = h.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const floatColor = isBoss ? '#ef4444' : target.enemyData.tier === 'epic' && isRare ? '#c084fc' : isRare ? '#f59e0b' : '#34d399';
            this.createFloatingText(target.x, target.y - 35, `+1 ${itemName}`, floatColor);
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

    this.scene.tweens?.add({
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

  public createLightningBoltEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(2, 0x38bdf8, 0.9);

    const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * 16;
    const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 16;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(midX, midY);
    g.lineTo(x2, y2);
    g.strokePath();

    this.scene.tweens?.add({
      targets: g,
      alpha: 0,
      duration: 180,
      onComplete: () => g.destroy()
    });
  }

  public createLightningChainEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(2, 0x06b6d4, 0.9);

    const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * 12;
    const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 12;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(midX, midY);
    g.lineTo(x2, y2);
    g.strokePath();

    this.scene.tweens?.add({
      targets: g,
      alpha: 0,
      duration: 160,
      onComplete: () => g.destroy()
    });
  }

  public createShockSparksEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const spark = this.scene.add.circle(x, y, 12, 0x06b6d4, 0.7).setDepth(2001);
    this.scene.tweens?.add({
      targets: spark,
      scaleX: 1.6,
      scaleY: 1.6,
      alpha: 0,
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy()
    });
  }

  public createFrostEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const frost = this.scene.add.circle(x, y, 14, 0x67e8f9, 0.7).setDepth(2001);
    this.scene.tweens?.add({
      targets: frost,
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => frost.destroy()
    });
  }

  public createHolyImpactEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const impact = this.scene.add.circle(x, y, 14, 0xfacc15, 0.7).setDepth(2001);
    this.scene.tweens?.add({
      targets: impact,
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => impact.destroy()
    });
  }

  public createHolySmiteEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(3, 0xfacc15, 0.9);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    const burst = this.scene.add.circle(x2, y2, 16, 0xfacc15, 0.8).setDepth(2001);
    this.scene.tweens?.add({
      targets: [g, burst],
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 250,
      onComplete: () => {
        g.destroy();
        burst.destroy();
      }
    });
  }

  public createHolyNovaEffect(x: number, y: number, radiusPx: number): void {
    if (!this.scene?.add) return;
    const ring = this.scene.add.circle(x, y, 10, 0xfef08a, 0.8).setDepth(2000);
    this.scene.tweens?.add({
      targets: ring,
      radius: Math.max(30, radiusPx),
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  public createCleanseEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const flash = this.scene.add.circle(x, y, 20, 0x38bdf8, 0.75).setDepth(2000);
    this.scene.tweens?.add({
      targets: flash,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 350,
      onComplete: () => flash.destroy()
    });
  }

  public checkAndAutocastHealingMagic(member: Player, time: number): boolean {
    if (member.state === 'dead' || member.state === 'downed') return false;

    // Healing Magic requires a Healing Staff equipped as conduit (or legacy healing_magic)
    const isHealingStaff = member.equippedWeapon?.id === 'healing_staff' || member.equippedWeapon?.id === 'healing_magic';
    if (!isHealingStaff) return false;

    // Scan for living damaged party members (prioritize other allies, then self)
    const damagedMembers = this.party.filter(
      (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp)
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
      const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
      const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
      return aRatio - bRatio;
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

      const lastUsed = member.lastSkillUseTimes.get(skillId) || 0;
      const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
      const isAffordable = member.energy >= skillDef.energyCost;
      if (!isOffCooldown || !isAffordable) continue;

      // Milestone 24: Mass Revive autocast when downed allies in range
      if (skillId === 'mass_revive') {
        const radius = skillDef.radiusTiles ?? 6;
        const cTile = { x: Math.floor(member.x / member.tileSize), y: Math.floor(member.y / member.tileSize) };
        const downedInRadius = this.party.filter((m) => {
          if (m === member || m.state !== 'downed') return false;
          const mTile = { x: Math.floor(m.x / m.tileSize), y: Math.floor(m.y / m.tileSize) };
          return Math.max(Math.abs(cTile.x - mTile.x), Math.abs(cTile.y - mTile.y)) <= radius;
        });
        if (downedInRadius.length > 0) {
          return this.castSkill(member, skillId, member, time);
        }
        continue;
      }

      // Milestone 24: Cleanse autocast when any living ally has a harmful status effect (isHarmful === true)
      if (skillId === 'cleanse') {
        const debuffedMember = this.party.find(
          (m) => m.state !== 'dead' && m.state !== 'downed' &&
            Array.from(m.activeStatusEffects.values()).some((e) => e.def?.isHarmful === true)
        );
        if (debuffedMember) {
          return this.castSkill(member, skillId, debuffedMember, time);
        }
        continue;
      }

      // Milestone 24: Guardian's Ward or Barrier damage absorption shields
      if (skillId === 'guardian_ward' || skillId === 'barrier') {
        const shieldTargets = this.party.filter(
          (m) => m.state !== 'dead' && m.state !== 'downed' && !m.hasStatusEffect(skillId)
        );
        if (shieldTargets.length > 0) {
          shieldTargets.sort((a, b) => {
            const aInCombat = a.inCombat ? 1 : 0;
            const bInCombat = b.inCombat ? 1 : 0;
            if (aInCombat !== bInCombat) return bInCombat - aInCombat;
            return (a.hp / a.maxHp) - (b.hp / b.maxHp);
          });
          return this.castSkill(member, skillId, shieldTargets[0], time);
        }
        continue;
      }

      // Milestone 24: Regenerate HoT autocast on damaged ally lacking HoT
      if (skillId === 'regenerate') {
        const hotCandidates = this.party.filter(
          (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp) && !m.hasStatusEffect('regenerate')
        );
        if (hotCandidates.length > 0) {
          hotCandidates.sort((a, b) => {
            const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
            const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
            return aRatio - bRatio;
          });
          return this.castSkill(member, skillId, hotCandidates[0], time);
        }
        continue;
      }

      if (skillDef.targetType !== 'ally' && (!skillDef.healAmount || skillDef.healAmount <= 0)) continue;

      // Find living damaged party members (prioritize other allies, then self)
      const damagedMembers = this.party.filter(
        (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp)
      );
      if (damagedMembers.length === 0) continue;

      damagedMembers.sort((a, b) => {
        const aSelf = a === member ? 1 : 0;
        const bSelf = b === member ? 1 : 0;
        if (aSelf !== bSelf) return aSelf - bSelf;
        const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
        const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
        return aRatio - bRatio;
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

      // Milestone 24: Holy Nova autocast when threat/damaged allies nearby
      if (skillId === 'holy_nova') {
        const lastUsed = member.lastSkillUseTimes.get(skillId) || 0;
        const isOffCooldown = time - lastUsed >= skillDef.cooldownMs;
        const isAffordable = member.energy >= skillDef.energyCost;
        if (!isOffCooldown || !isAffordable) continue;

        const radius = skillDef.radiusTiles ?? 4;
        const cTile = { x: Math.floor(member.x / member.tileSize), y: Math.floor(member.y / member.tileSize) };
        const enemiesNearby = this.enemies.some((e) => {
          if (e.state === 'dead' || e.state === 'downed') return false;
          const eTile = { x: Math.floor(e.x / e.tileSize), y: Math.floor(e.y / e.tileSize) };
          return Math.max(Math.abs(cTile.x - eTile.x), Math.abs(cTile.y - eTile.y)) <= radius;
        });
        const damagedAlliesNearby = this.party.some((a) => {
          if (a.state === 'dead' || a.state === 'downed' || a.hp >= a.maxHp) return false;
          const aTile = { x: Math.floor(a.x / a.tileSize), y: Math.floor(a.y / a.tileSize) };
          return Math.max(Math.abs(cTile.x - aTile.x), Math.abs(cTile.y - aTile.y)) <= radius;
        });
        if (enemiesNearby || damagedAlliesNearby) {
          return this.castSkill(member, skillId, member, time);
        }
        continue;
      }

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
      } else if (skillId === 'blessed_weapons') {
        const effDef = dataLoader.getStatusEffect('blessed_weapons') || {
          id: 'blessed_weapons',
          name: 'Blessed Weapons',
          durationMs: skillDef.durationMs ?? 60000,
          tickIntervalMs: 60000,
          damagePerTick: 0,
          holyBonusDamage: 5,
          color: '#facc15'
        };
        for (const ally of this.party) {
          if (ally.state !== 'dead' && ally.state !== 'downed') {
            ally.applyStatusEffect(effDef);
            this.createFloatingText(ally.x, ally.y - 12, 'BLESSED WEAPONS!', '#facc15');
          }
        }
        caster.progression.addProficiencyExp('healing_magic', 2);
        console.log(`[Skill] ${caster.entityName} casts Blessed Weapons! All living allies' weapons infused with Holy power.`);
        return true;
      } else if (skillId === 'holy_nova') {
        const radius = skillDef.radiusTiles ?? 4;
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        let alliesHealed = 0;
        const healAmt = skillDef.healAmount ?? 30;
        for (const ally of this.party) {
          if (ally.state === 'dead' || ally.state === 'downed') continue;
          const aTile = {
            x: Math.floor(ally.x / ally.tileSize),
            y: Math.floor(ally.y / ally.tileSize)
          };
          if (Math.max(Math.abs(casterTile.x - aTile.x), Math.abs(casterTile.y - aTile.y)) <= radius) {
            const restored = ally.heal(healAmt);
            this.createHealEffect(ally.x, ally.y);
            this.createFloatingText(ally.x, ally.y - 12, `+${restored} HP`, '#22c55e');
            alliesHealed++;
          }
        }

        let enemiesDamaged = 0;
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const mult = skillDef.damageMultiplier ?? 2.0;
        let holyDamage = Math.max(12, effBase * mult);
        if (caster.hasStatusEffect('blessed_weapons')) {
          holyDamage += 5;
        }

        for (const enemy of this.enemies) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          const eTile = {
            x: Math.floor(enemy.x / enemy.tileSize),
            y: Math.floor(enemy.y / enemy.tileSize)
          };
          if (Math.max(Math.abs(casterTile.x - eTile.x), Math.abs(casterTile.y - eTile.y)) <= radius &&
              this.pathfinder.hasLineOfSight(casterTile, eTile)) {
            this.createSkillAttackEffect(caster.x, caster.y, enemy.x, enemy.y);
            this.createFloatingText(enemy.x, enemy.y - 10, `HOLY NOVA! -${holyDamage.toFixed(1)}`, '#facc15');
            const downed = enemy.takeDamage(holyDamage);
            if (downed) {
              this.handleTargetDefeated(caster, enemy, weaponId);
            }
            enemiesDamaged++;
          }
        }

        this.createHolyNovaEffect(caster.x, caster.y, radius * caster.tileSize);
        this.createFloatingText(caster.x, caster.y - 15, 'HOLY NOVA!', '#facc15');
        caster.progression.addProficiencyExp('healing_magic', 3);
        console.log(`[Skill] ${caster.entityName} casts Holy Nova! Simultaneously healed ${alliesHealed} allies and damaged ${enemiesDamaged} enemies.`);
        return true;
      } else if (skillId === 'mass_revive') {
        const radius = skillDef.radiusTiles ?? 6;
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        const downedAllies = this.party.filter((m) => {
          if (m === caster || m.state !== 'downed') return false;
          const mTile = {
            x: Math.floor(m.x / m.tileSize),
            y: Math.floor(m.y / m.tileSize)
          };
          return Math.max(Math.abs(casterTile.x - mTile.x), Math.abs(casterTile.y - mTile.y)) <= radius;
        });

        if (downedAllies.length === 0) {
          console.warn(`[Skill] Cannot cast Mass Revive: no downed allies within ${radius} tiles!`);
          return false;
        }

        for (const downedAlly of downedAllies) {
          downedAlly.revive(caster);
          this.createHealEffect(downedAlly.x, downedAlly.y);
          this.createFloatingText(downedAlly.x, downedAlly.y - 12, 'MASS REVIVED!', '#facc15');
        }

        this.createHolyNovaEffect(caster.x, caster.y, radius * caster.tileSize);
        this.createFloatingText(caster.x, caster.y - 15, `MASS REVIVE! (${downedAllies.length})`, '#facc15');
        caster.progression.addProficiencyExp('healing_magic', 4);
        console.log(`[Skill] ${caster.entityName} casts Mass Revive! Revived ${downedAllies.length} downed allies at once.`);
        return true;
      }
      return true;
    } else if (skillDef.targetType === 'ally' || (skillDef.healAmount && skillDef.healAmount > 0)) {
      let targetAlly = target as Player | undefined;
      if (!targetAlly || targetAlly.state === 'dead' || targetAlly.state === 'downed') {
        if (skillId === 'cleanse') {
          targetAlly = this.party.find(
            (m) => m.state !== 'dead' && m.state !== 'downed' &&
              Array.from(m.activeStatusEffects.values()).some((e) => e.def?.isHarmful === true)
          ) || caster;
        } else if (skillId === 'guardian_ward' || skillId === 'barrier') {
          const candidates = this.party.filter(
            (m) => m.state !== 'dead' && m.state !== 'downed' && !m.hasStatusEffect(skillId)
          );
          candidates.sort((a, b) => {
            const aInCombat = a.inCombat ? 1 : 0;
            const bInCombat = b.inCombat ? 1 : 0;
            if (aInCombat !== bInCombat) return bInCombat - aInCombat;
            const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
            const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
            return aRatio - bRatio;
          });
          targetAlly = candidates[0] || caster;
        } else if (skillId === 'regenerate') {
          const candidates = this.party.filter(
            (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp) && !m.hasStatusEffect('regenerate')
          );
          candidates.sort((a, b) => {
            const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
            const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
            return aRatio - bRatio;
          });
          targetAlly = candidates[0] || caster;
        } else {
          const candidates = this.party.filter(
            (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp)
          );
          candidates.sort((a, b) => {
            const aSelf = a === caster ? 1 : 0;
            const bSelf = b === caster ? 1 : 0;
            if (aSelf !== bSelf) return aSelf - bSelf;
            const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
            const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
            return aRatio - bRatio;
          });
          targetAlly = candidates[0] || caster;
        }
      }

      caster.energy -= skillDef.energyCost;
      caster.lastSkillUseTimes.set(skillId, time);
      caster.lastAttackTime = time;

      if (skillId === 'cleanse') {
        const removed = targetAlly.removeHarmfulStatusEffects();
        this.createCleanseEffect(targetAlly.x, targetAlly.y);
        this.createFloatingText(targetAlly.x, targetAlly.y - 12, 'CLEANSED!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts Cleanse on ${targetAlly.entityName}! Removed: ${removed.join(', ') || 'None'}`);
        caster.progression.addProficiencyExp('healing_magic', 2);
        return true;
      } else if (skillId === 'guardian_ward' || skillId === 'barrier') {
        const effDef = dataLoader.getStatusEffect(skillId) || {
          id: skillId,
          name: skillDef.name,
          durationMs: skillDef.durationMs ?? (skillId === 'barrier' ? 10000 : 8000),
          tickIntervalMs: skillDef.durationMs ?? (skillId === 'barrier' ? 10000 : 8000),
          damagePerTick: 0,
          shieldAmount: skillDef.shieldAmount ?? (skillId === 'barrier' ? 50 : 35),
          color: skillId === 'barrier' ? '#818cf8' : '#38bdf8'
        };
        targetAlly.applyStatusEffect(effDef);
        this.createCleanseEffect(targetAlly.x, targetAlly.y);
        this.createFloatingText(targetAlly.x, targetAlly.y - 12, `${skillDef.name.toUpperCase()}!`, effDef.color || '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts ${skillDef.name} on ${targetAlly.entityName}! Absorbs up to ${effDef.shieldAmount} damage.`);
        caster.progression.addProficiencyExp('healing_magic', 2);
        return true;
      } else if (skillId === 'regenerate') {
        const effDef = dataLoader.getStatusEffect('regenerate') || {
          id: 'regenerate',
          name: 'Regenerate',
          durationMs: skillDef.durationMs ?? 8000,
          tickIntervalMs: skillDef.tickIntervalMs ?? 1000,
          damagePerTick: 0,
          healPerTick: skillDef.healPerTick ?? 6,
          color: '#22c55e'
        };
        targetAlly.applyStatusEffect(effDef);
        this.createHealEffect(targetAlly.x, targetAlly.y);
        this.createFloatingText(targetAlly.x, targetAlly.y - 12, 'REGENERATE!', '#22c55e');
        console.log(`[Skill] ${caster.entityName} casts Regenerate on ${targetAlly.entityName}! Ticking ${effDef.healPerTick} HP/s.`);
        caster.progression.addProficiencyExp('healing_magic', 2);
        return true;
      } else {
        const restored = targetAlly.heal(skillDef.healAmount || (skillId === 'heal' ? 35 : 20));
        this.createHealEffect(targetAlly.x, targetAlly.y);
        this.createFloatingText(targetAlly.x, targetAlly.y - 12, `+${restored} HP`, '#22c55e');
        console.log(
          `[Skill] ${caster.entityName} casts ${skillDef.name} on ${targetAlly.entityName}! Restored ${restored} HP. (Energy: ${caster.energy}/${caster.maxEnergy})`
        );
        caster.progression.addProficiencyExp('healing_magic', 2);
        return true;
      }
    } else {
      const enemyTarget = (target as Enemy) || (caster.targetEntity instanceof Enemy ? caster.targetEntity : null);
      if (!enemyTarget || enemyTarget.state === 'dead' || enemyTarget.state === 'downed') {
        return false;
      }

      if (skillId === 'smite') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Smite: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createHolySmiteEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const mult = skillDef.damageMultiplier ?? 1.8;
        let skillDamage = Math.max(8, effBase * mult);

        if (caster.hasStatusEffect('blessed_weapons')) {
          skillDamage += 5;
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 24, '+5 HOLY!', '#facc15');
        }

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `SMITE! -${skillDamage.toFixed(1)}`, '#facc15');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        caster.progression.addProficiencyExp('healing_magic', 2);
        return true;
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

      // Milestone 22: Riposte reactive counter-strike
      if (skillId === 'riposte') {
        if (!caster.hasStatusEffect('riposte_window')) {
          console.warn(`[Skill] Cannot cast Riposte: must immediately follow an evasion or parry proc!`);
          return false;
        }
        caster.removeStatusEffect('riposte_window');
        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.executePlayerCounterattack(caster, enemyTarget, {
          procced: true,
          damageMultiplier: skillDef.damageMultiplier ?? 1.8,
          canCrit: true,
          chainAttack: false
        });
        this.createFloatingText(caster.x, caster.y - 12, 'RIPOSTE!', '#eab308');
        return true;
      }

      // Milestone 22: Fleche gap-closing dash-strike
      if (skillId === 'fleche') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Fleche: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        if (curDist > 1) {
          const openTile = this.findOpenAttackTileForMember(enemyTarget, caster);
          if (openTile) {
            const oldX = caster.x;
            const oldY = caster.y;
            caster.setGridPosition(openTile.x, openTile.y);
            this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x60a5fa);
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
        const skillDamage = effBase * (skillDef.damageMultiplier ?? 1.6);

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `FLECHE! -${skillDamage.toFixed(1)}`, '#38bdf8');
        this.checkAndApplyBleed(caster, enemyTarget);
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weapon.id);
        }
        return true;
      }

      // Milestone 22: Blade Dance multi-hit capstone combo
      if (skillId === 'blade_dance') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        if (curDist > 1) {
          console.warn(`[Skill] Cannot cast Blade Dance: target is outside melee range (${curDist} > 1)`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        const strikeCount = skillDef.strikeCount ?? 4;
        const damagePerHit = skillDef.damagePerHitMultiplier ?? 0.8;
        const weapon = caster.equippedWeapon;
        const weaponLevel = caster.progression.getProficiencyLevel(weapon.id);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const strikeDamage = effBase * damagePerHit;

        for (let i = 1; i <= strikeCount; i++) {
          if ((enemyTarget.state as string) === 'dead' || (enemyTarget.state as string) === 'downed') {
            break;
          }
          this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
          this.createFloatingText(
            enemyTarget.x,
            enemyTarget.y - 10 - (i * 6),
            `BLADE DANCE! -${strikeDamage.toFixed(1)}`,
            '#f59e0b'
          );
          this.checkAndApplyBleed(caster, enemyTarget);
          const downed = enemyTarget.takeDamage(strikeDamage);
          if (downed) {
            this.handleTargetDefeated(caster, enemyTarget, weapon.id);
            break;
          }
        }
        return true;
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
    const dataLoader = DataLoader.getInstance();
    const equipped = member.equippedWeapon;
    if (!equipped) return;

    // Check if equipped weapon is a spell directly or a conduit item
    const spellDef = equipped.category === 'magic'
      ? equipped
      : dataLoader.getSpellForConduit(equipped);

    if (spellDef) {
      if (spellDef.id === 'healing_magic' || (spellDef.baseDamage === 0 && !spellDef.attackRangeTiles)) {
        member.attackRangeTiles = 1;
        return;
      }
      const spellProfLevel = member.progression.getProficiencyLevel(spellDef.proficiencyId ?? spellDef.id);
      const costReduction = (spellDef.levelBonus?.energyCostReductionPerLevel ?? 0.1) * spellProfLevel;
      const energyCost = Math.max(1, Math.round((spellDef.energyCostPerCast ?? 20) - costReduction));
      const canCast = member.energy >= energyCost;
      member.attackRangeTiles = canCast ? (spellDef.attackRangeTiles ?? 4) : 1;
      return;
    }

    if (equipped.category === 'ranged') {
      member.attackRangeTiles = equipped.attackRangeTiles ?? 4;
      return;
    }

    if (equipped.id === 'staff' || equipped.category === 'staff' || equipped.id.endsWith('_staff')) {
      member.attackRangeTiles = 1;
      return;
    }
  }

  public getEffectiveWeaponForAttack(member: Player): WeaponDef {
    const dataLoader = DataLoader.getInstance();
    const equipped = member.equippedWeapon;
    if (!equipped) return member.equippedWeapon;

    // Check if equipped weapon is a spell directly or a conduit item
    const spellDef = equipped.category === 'magic'
      ? equipped
      : dataLoader.getSpellForConduit(equipped);

    if (spellDef) {
      if (spellDef.id === 'healing_magic' || (spellDef.baseDamage === 0 && !spellDef.attackRangeTiles)) {
        const staffDef = dataLoader.getWeapon('staff') || member.equippedWeapon;
        return staffDef;
      }
      const spellProfLevel = member.progression.getProficiencyLevel(spellDef.proficiencyId ?? spellDef.id);
      const costReduction = (spellDef.levelBonus?.energyCostReductionPerLevel ?? 0.1) * spellProfLevel;
      const energyCost = Math.max(1, Math.round((spellDef.energyCostPerCast ?? 20) - costReduction));
      const canCast = member.energy >= energyCost;
      if (canCast) {
        return spellDef;
      }
      const staffDef = dataLoader.getWeapon('staff') || member.equippedWeapon;
      return staffDef;
    }

    if (equipped.id === 'staff' || equipped.category === 'staff' || equipped.id.endsWith('_staff')) {
      const staffDef = dataLoader.getWeapon('staff') || member.equippedWeapon;
      return staffDef;
    }

    return member.equippedWeapon;
  }
}
