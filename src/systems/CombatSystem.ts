import type Phaser from 'phaser';
import { Entity } from '../entities/Entity.ts';
import { Player } from '../entities/Player.ts';
import { Enemy } from '../entities/Enemy.ts';
import { Pathfinder } from '../utils/Pathfinder.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import type { GridPos, WeaponDef, PassiveImbuementDef, PassiveImbuementProcDef, EnemyDef } from '../types/game.ts';
import { HiddenSkillSystem, type CombatContext, type CounterattackResult } from './HiddenSkillSystem.ts';
import { GameState } from './GameState.ts';
import { SkillSystem } from './SkillSystem.ts';

export class CombatSystem {
  public static readonly DEBUG_AI: boolean = false;

  private scene: Phaser.Scene;
  public party: Player[];
  public enemies: Enemy[];
  private pathfinder: Pathfinder;
  private onEnemyDeathCallback?: (enemy: Enemy) => void;
  private lastCombatTimeMs: number = 0;
  private lastPassiveTickTimeMs: number = 0;
  private enemyTargets: Map<Enemy, Player> = new Map();
  private casterRegrowthTargets: Map<string, Entity> = new Map();
  public skillSystem: SkillSystem;

  constructor(
    scene: Phaser.Scene,
    playerOrParty: Player | Player[],
    enemies: Enemy[],
    pathfinder?: Pathfinder,
    _progressionSystem?: ProgressionSystem,
    onEnemyDeath?: (enemy: Enemy) => void
  ) {
    this.scene = scene;
    this.party = Array.isArray(playerOrParty) ? playerOrParty : (playerOrParty ? [playerOrParty] : []);
    this.enemies = enemies || [];
    this.pathfinder = pathfinder ?? (scene as any)?.pathfinder;
    this.onEnemyDeathCallback = onEnemyDeath;
    this.skillSystem = new SkillSystem(this);
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

  /**
   * Calculates Research Points awarded upon defeating an enemy based on its definition or tier.
   * - Boss: Guaranteed flat amount (20 RP).
   * - Epic: Rolls between 7 and 10 RP.
   * - Elite: Rolls between 3 and 6 RP.
   * - Common / other: 0 RP.
   */
  public static calculateResearchPointsForEnemy(enemyDef: EnemyDef, rng: () => number = Math.random): number {
    if (enemyDef.researchPoints !== undefined) {
      if (typeof enemyDef.researchPoints === 'number') {
        return enemyDef.researchPoints;
      }
      if (typeof enemyDef.researchPoints === 'object') {
        const min = enemyDef.researchPoints.min ?? 0;
        const max = enemyDef.researchPoints.max ?? min;
        return Math.floor(rng() * (max - min + 1)) + min;
      }
    }
    const tier = enemyDef.tier?.toLowerCase();
    if (tier === 'boss') {
      return 20;
    } else if (tier === 'epic') {
      return 7 + Math.floor(rng() * 4); // 7 to 10
    } else if (tier === 'elite') {
      return 3 + Math.floor(rng() * 4); // 3 to 6
    }
    return 0;
  }

  public static rollCommonEnemyDrop(enemyDef: EnemyDef, rng: () => number = Math.random): { item: string; method?: string } | null {
    if (!enemyDef.harvest || enemyDef.harvest.length === 0) return null;
    const validHarvest = enemyDef.harvest.filter(
      (h) => h.method !== 'skinning' &&
             h.method !== 'butchering' &&
             !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
    );
    if (validHarvest.length === 0) return null;
    const dropChance = enemyDef.dropChance ?? 0.40;
    if (rng() >= dropChance) return null;

    const totalWeight = validHarvest.reduce((sum, h) => sum + (h.weight ?? 1), 0);
    let r = rng() * totalWeight;
    for (const h of validHarvest) {
      const w = h.weight ?? 1;
      if (r < w) {
        return h;
      }
      r -= w;
    }
    return validHarvest[0];
  }

  public static recordBestiaryEncounter(enemy: Enemy, scene?: Phaser.Scene): void {
    if (!enemy || !enemy.enemyData) return;
    const isFirst = GameState.getInstance().recordEnemyEncountered(enemy.enemyData.id);
    if (isFirst) {
      console.log(`%c[Bestiary] 🐺 First encounter with ${enemy.enemyData.name}! (+${GameState.DISCOVERY_RP_BONUS} RP)`, 'color: #f59e0b; font-weight: bold;');
      const hud = (scene as any)?.hud;
      if (hud && typeof hud.showToast === 'function') {
        hud.showToast(`📖 Bestiary Updated: ${enemy.enemyData.name} encountered! (+${GameState.DISCOVERY_RP_BONUS} Research Point)`, 'success', 3500);
      }
    }
  }

  public recordBestiaryEncounter(enemy: Enemy): void {
    CombatSystem.recordBestiaryEncounter(enemy, this.scene);
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

  private currentInCombat: boolean = false;

  public isInCombat(currentTime?: number): boolean {
    const anyAggroed = this.enemies.some((e) => e.isAggroed && e.state !== 'dead' && e.state !== 'downed');
    if (anyAggroed) return true;
    const anyEngaged = this.party.some((m) => m.state !== 'dead' && m.state !== 'downed' && m.targetEntity !== null && m.targetEntity.state !== 'dead' && m.targetEntity.state !== 'downed');
    if (anyEngaged) return true;
    const anyEnemyTargetingParty = this.enemies.some((e) => e.state !== 'dead' && e.state !== 'downed' && e.targetEntity !== null && e.targetEntity.state !== 'dead' && e.targetEntity.state !== 'downed');
    if (anyEnemyTargetingParty) return true;

    const now = currentTime ?? (this.scene ? this.scene.time?.now ?? 0 : 0);
    if (now > 0 && this.lastCombatTimeMs > 0 && (now - this.lastCombatTimeMs < 4000)) {
      return true;
    }
    if (currentTime !== undefined) {
      return false;
    }
    return this.currentInCombat || this.party.some((m) => m.inCombat);
  }

  public update(time: number, delta: number): void {
    const anyEnemyAggroed = this.enemies.some((e) => e.isAggroed && e.state !== 'dead' && e.state !== 'downed');
    const anyPartyEngaged = this.party.some((m) => m.state !== 'dead' && m.state !== 'downed' && m.targetEntity && m.targetEntity.state !== 'dead' && m.targetEntity.state !== 'downed');
    const anyEnemyTargetingParty = this.enemies.some((e) => e.state !== 'dead' && e.state !== 'downed' && e.targetEntity && e.targetEntity.state !== 'dead' && e.targetEntity.state !== 'downed');
    const activeThreat = anyEnemyAggroed || anyPartyEngaged || anyEnemyTargetingParty;
    if (activeThreat) {
      this.lastCombatTimeMs = time;
    }
    const inCombat = activeThreat || (time - this.lastCombatTimeMs < 4000);
    this.currentInCombat = inCombat;

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
                this.recordBestiaryEncounter(enemy);

                // Milestone 48: Blind status effect reduced accuracy / miss chance
                if (enemy.hasStatusEffect('blind')) {
                  const blindEffect = enemy.activeStatusEffects.get('blind');
                  const missChance = blindEffect?.def?.accuracyReduction ?? 0.35;
                  if (Math.random() < missChance) {
                    this.createFloatingText(enemy.x, enemy.y - 12, 'BLIND MISS!', '#6b21a8');
                    console.log(`[Combat] 👁️ ${enemy.entityName} is blinded and missed attack against ${target.entityName}!`);
                    continue;
                  }
                }

                let baseEnemyDamage = enemy.enemyData.meleeDamage;
                // Generic outgoing attack damage reduction from any active status effect (e.g. Curse, Enfeeble)
                for (const activeEffect of enemy.activeStatusEffects.values()) {
                  if (activeEffect.def?.damageReductionPercent && activeEffect.def.damageReductionPercent > 0) {
                    const reduction = activeEffect.def.damageReductionPercent;
                    baseEnemyDamage = Math.max(1, Math.round(baseEnemyDamage * (1 - reduction)));
                    console.log(`[Combat] 💀 ${enemy.entityName}'s attack enfeebled by ${activeEffect.def.name} (-${(reduction * 100).toFixed(0)}% damage -> ${baseEnemyDamage})!`);
                  }
                }
                const rawDamage = baseEnemyDamage;

                const hiddenSystem = HiddenSkillSystem.getInstance();
                const hasShield = target.hasShield();
                const shieldDef = hasShield ? target.offhandWeapon : null;
                const shieldLevel = hasShield ? target.progression.getProficiencyLevel('shields') : 0;
                const shieldBlockBonus = hasShield ? shieldLevel * (shieldDef?.levelBonus?.blockPerLevel ?? 0.005) : 0;
                const shieldMitigationBonus = hasShield
                  ? (shieldDef?.baseMitigation ?? 1) + Math.floor(shieldLevel * (shieldDef?.levelBonus?.mitigationPerLevel ?? 0.2))
                  : 0;

                let maxEvasionBonus: number | undefined = undefined;
                for (const activeEffect of target.activeStatusEffects.values()) {
                  if (activeEffect.def?.evasionBonus !== undefined) {
                    if (maxEvasionBonus === undefined || activeEffect.def.evasionBonus > maxEvasionBonus) {
                      maxEvasionBonus = activeEffect.def.evasionBonus;
                    }
                  }
                }
                const evasionBonus = maxEvasionBonus;

                const context: CombatContext = {
                  equippedWeapon: target.equippedWeapon,
                  equippedOffhand: target.offhandWeapon,
                  hasShield,
                  shieldBlockBonus,
                  shieldMitigationBonus,
                  hasMagicProficiency: false,
                  inCombat: true,
                  attackerDistanceTiles: curDistTiles,
                  isMeleeAttack: !isRanged,
                  evasionBonus
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
                  target?.awardArmorWearExp?.('hit');
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
                  const attackColor = enemy.enemyData.id === 'glacial_sovereign' ? 0x06b6d4 : (isRanged ? 0xf59e0b : 0xef4444);
                  this.createAttackEffect(enemy.x, enemy.y, target.x, target.y, attackColor);
                  if (context.hasShield) {
                    target.progression.addProficiencyExp('shields', 1);
                  }
                  target?.awardArmorWearExp?.('hit');

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
                    } else if (target.hasStatusEffect('iron_posture')) {
                      actualDamage = Math.max(1, Math.round(actualDamage * 0.65));
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (IRON POSTURE!)`, '#f59e0b');
                      console.log(`[Combat] Iron Posture mitigated 35% damage! ${actualDamage} taken.`);
                    } else if (target.hasStatusEffect('defensive_posture')) {
                      actualDamage = Math.max(1, Math.round(actualDamage * 0.80));
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (DEFENSIVE POSTURE!)`, '#94a3b8');
                      console.log(`[Combat] Defensive Posture mitigated 20% damage! ${actualDamage} taken.`);
                    } else if (target.hasStatusEffect('arbalest_brace')) {
                      actualDamage = Math.max(1, Math.round(actualDamage * 0.80));
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (ARBALEST BRACE!)`, '#94a3b8');
                      console.log(`[Combat] Arbalest Brace mitigated 20% damage! ${actualDamage} taken.`);
                    } else if (mitigation.mitigatedAmount > 0) {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage! (Resilience mitigated ${mitigation.mitigatedAmount} dmg)`);
                      this.createFloatingText(target.x, target.y - 20, `-${actualDamage} (${mitigation.mitigatedAmount} RESIST)`, '#a78bfa');
                    } else if (mitigation.procced) {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage! (Resilience proc: +1 EXP)`);
                      this.createFloatingText(target.x, target.y - 20, `RESILIENCE! -${actualDamage}`, '#a78bfa');
                    } else {
                      console.log(`[Combat] ${enemy.entityName} hits ${target.entityName} for ${actualDamage} damage!`);
                    }

                    if (target.hasStatusEffect('kenjutsu_deflection') && actualDamage > 0) {
                      const eff = target.activeStatusEffects.get('kenjutsu_deflection') as any;
                      const shieldRemain = eff?.currentShield ?? eff?.def?.shieldAmount ?? 40;
                      const absorbed = Math.min(shieldRemain, actualDamage);
                      actualDamage -= absorbed;
                      if (eff) eff.currentShield = shieldRemain - absorbed;
                      if ((eff?.currentShield ?? 0) <= 0) {
                        target.removeStatusEffect('kenjutsu_deflection');
                      }
                      const reflected = Math.max(1, Math.round(absorbed * 0.5));
                      enemy.takeDamage(reflected);
                      this.createFloatingText(target.x, target.y - 32, `ABSORBED ${absorbed}!`, '#e11d48');
                      this.createFloatingText(enemy.x, enemy.y - 12, `REFLECT! -${reflected}`, '#e11d48');
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

                  // Milestone 34 & Environments Milestone: Boss Unique Mechanic — Cleave Shockwave
                  // Bone Warden has 25% splash, Abyssal Colossus & Magma Tyrant have 50% splash
                  if ((enemy.enemyData.id === 'bone_warden' || enemy.enemyData.id === 'abyssal_colossus' || enemy.enemyData.id === 'magma_tyrant') && actualDamage > 0) {
                    const cleaveRatio = enemy.enemyData.id === 'bone_warden' ? 0.25 : 0.5;
                    const splashDamage = Math.max(1, Math.round(actualDamage * cleaveRatio));
                    for (const member of this.party) {
                      if (member !== target && member.state !== 'downed' && member.state !== 'dead') {
                        const dist = Math.hypot(member.gridPos.x - enemy.gridPos.x, member.gridPos.y - enemy.gridPos.y);
                        if (dist <= 1.5) {
                          const memDowned = member.takeDamage(splashDamage);
                          member?.awardArmorWearExp?.('hit');
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

                  // Milestone 34: Abyssal Colossus Unique Mechanic — Earthshaker Tremor (15% stun chance on hit, tuned down from 30%)
                  if (enemy.enemyData.id === 'abyssal_colossus' && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < 0.15) {
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

                  // Milestone — Second Boss Enemy: Glacial Sovereign Signature Mechanics
                  if (enemy.enemyData.id === 'glacial_sovereign' && actualDamage > 0) {
                    // Signature Mechanic 1: Glacial Spike Nova / Permafrost Shards
                    // Projectile shards shatter outward from the impact, hitting all other party members within 3 tiles of the target
                    const shardDamage = Math.max(1, Math.round(actualDamage * 0.4));
                    for (const member of this.party) {
                      if (member !== target && member.state !== 'downed' && member.state !== 'dead') {
                        const distToImpact = Math.hypot(member.gridPos.x - target.gridPos.x, member.gridPos.y - target.gridPos.y);
                        if (distToImpact <= 3.0) {
                          const memDowned = member.takeDamage(shardDamage);
                          member?.awardArmorWearExp?.('hit');
                          this.createAttackEffect(target.x, target.y, member.x, member.y, 0x06b6d4);
                          this.createFloatingText(member.x, member.y - 18, `-${shardDamage} (GLACIAL SHARD!)`, '#38bdf8');
                          console.log(`[Combat:Glacial Shard] ❄️ Glacial Sovereign icicles shatter into ${member.entityName} for ${shardDamage} damage!`);
                          if (this.scene) {
                            if (typeof (this.scene as any).interruptGatherChannel === 'function') {
                              (this.scene as any).interruptGatherChannel(member, enemy);
                            }
                            if (typeof (this.scene as any).interruptReviveChannel === 'function') {
                              (this.scene as any).interruptReviveChannel(member, enemy);
                            }
                          }
                          if (memDowned) {
                            console.log(`[Combat] ${member.entityName} was downed by Glacial Spike Nova!`);
                            member.clearTarget();
                          }
                        }
                      }
                    }

                    // Signature Mechanic 2: Rime Frostbite (Chill & Movement Cripple)
                    // Inflicts deep freezing cold: 50% slow and frostbite DoT (3 damage per tick for 4.5s)
                    if (!targetDowned) {
                      const frostbiteEffect = {
                        id: 'frostbite',
                        name: 'Frostbite',
                        durationMs: 4500,
                        tickIntervalMs: 1500,
                        damagePerTick: 3,
                        moveSpeedMultiplier: 0.5,
                        isHarmful: true,
                        color: '#06b6d4'
                      };
                      target.applyStatusEffect(frostbiteEffect);
                      this.createFloatingText(target.x, target.y - 28, 'FROSTBITE! SLOWED!', '#06b6d4');
                      console.log(`[Combat:Frostbite] ❄️ ${enemy.entityName} afflicts ${target.entityName} with Frostbite (-50% Move Speed, 3 frost DoT)!`);
                    }
                  }

                  // Milestone 42: Enemy Status Effect Proc (Spider Poison proc chance on attack)
                  if (enemy.enemyData.poisonChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.poisonChance) {
                      const poisonDef = DataLoader.getInstance().getStatusEffect('poison') || {
                        id: 'poison',
                        name: 'Poison',
                        tickIntervalMs: 2000,
                        damagePerTick: 2,
                        persistent: true,
                        isHarmful: true,
                        color: '#16a34a'
                      };
                      target.applyStatusEffect(poisonDef);
                      this.createFloatingText(target.x, target.y - 28, 'POISONED!', poisonDef.color || '#16a34a');
                      console.log(`[Combat] 🕷️ ${enemy.entityName} inflicts Poison on ${target.entityName}!`);
                    }
                  }

                  // Milestone: Infernal Caldera - Burn proc (Cinder Hound, Magma Tyrant)
                  // Uses standard Burn definition from statusEffects.json (4000ms duration, 1000ms interval, 4 dmg/tick = 4 DPS)
                  if (enemy.enemyData.burnChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.burnChance) {
                      const burnDef = DataLoader.getInstance().getStatusEffect('burn');
                      if (burnDef) {
                        target.applyStatusEffect(burnDef);
                        this.createFloatingText(target.x, target.y - 28, 'BURNING!', burnDef.color || '#f97316');
                        console.log(`[Combat] 🔥 ${enemy.entityName} inflicts Burn on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Infernal Caldera - Stun proc (Magma Brute only: 1s duration)
                  // Note: Magma Tyrant does NOT stun. Stun is strictly limited to Magma Brute (1s) and Abyssal Colossus (Milestone 34 shockwave).
                  if (enemy.enemyData.id === 'magma_brute' && enemy.enemyData.stunChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.stunChance) {
                      const stunDuration = 1000;
                      const loadedStun = DataLoader.getInstance().getStatusEffect('stun');
                      if (loadedStun) {
                        const stunDef = { ...loadedStun, durationMs: stunDuration, tickIntervalMs: stunDuration };
                        target.applyStatusEffect(stunDef);
                        target.stopMovement();
                        this.createFloatingText(target.x, target.y - 28, 'STUNNED!', stunDef.color || '#facc15');
                        console.log(`[Combat] 💫 ${enemy.entityName} inflicts Stun (${stunDuration}ms) on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Infernal Caldera - Curse proc (Ash Wraith)
                  // Uses standard Curse definition from statusEffects.json (-25% outgoing damage for 5s, NO DoT)
                  if (enemy.enemyData.curseChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.curseChance) {
                      const curseDef = DataLoader.getInstance().getStatusEffect('curse');
                      if (curseDef) {
                        target.applyStatusEffect(curseDef);
                        this.createFloatingText(target.x, target.y - 28, 'CURSED!', curseDef.color || '#a855f7');
                        console.log(`[Combat] 💀 ${enemy.entityName} inflicts Curse on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Abyssal Depths Expansion - Bleed proc (Deep Crawler)
                  // Uses standard Bleed definition from statusEffects.json (6000ms duration, 1000ms interval, 3 dmg/tick = 18 total DoT)
                  if (enemy.enemyData.bleedChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.bleedChance) {
                      const bleedDef = DataLoader.getInstance().getStatusEffect('bleed');
                      if (bleedDef) {
                        target.applyStatusEffect(bleedDef);
                        this.createFloatingText(target.x, target.y - 28, 'BLEEDING!', bleedDef.color || '#ef4444');
                        console.log(`[Combat] 🩸 ${enemy.entityName} inflicts Bleed on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Abyssal Depths Expansion - Slow proc (Void Thrall)
                  // Uses standard Slow definition from statusEffects.json (3000ms duration, 50% move speed reduction)
                  if (enemy.enemyData.slowChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.slowChance) {
                      const slowDef = DataLoader.getInstance().getStatusEffect('slow');
                      if (slowDef) {
                        target.applyStatusEffect(slowDef);
                        this.createFloatingText(target.x, target.y - 28, 'SLOWED!', slowDef.color || '#67e8f9');
                        console.log(`[Combat] ❄️ ${enemy.entityName} inflicts Slow on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Abyssal Depths Expansion - Blind proc (Abyssal Lurker)
                  // Uses standard Blind definition from statusEffects.json (4000ms duration, 35% miss penalty)
                  if (enemy.enemyData.blindChance && actualDamage > 0 && !targetDowned) {
                    if (Math.random() < enemy.enemyData.blindChance) {
                      const blindDef = DataLoader.getInstance().getStatusEffect('blind');
                      if (blindDef) {
                        target.applyStatusEffect(blindDef);
                        this.createFloatingText(target.x, target.y - 28, 'BLINDED!', blindDef.color || '#6b21a8');
                        console.log(`[Combat] 👁️ ${enemy.entityName} inflicts Blind on ${target.entityName}!`);
                      }
                    }
                  }

                  // Milestone: Magical Crafting - Elemental Enemy Status Effect Proc
                  if (enemy.enemyData.tier === 'elemental' && actualDamage > 0 && !targetDowned) {
                    this.applyElementalAttackStatus(enemy, target);
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

      if (typeof member.isDisabled === 'function' ? member.isDisabled() : (typeof member.hasStatusEffect === 'function' ? (member.hasStatusEffect('stun') || member.hasStatusEffect('shock')) : false)) {
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

      // Data-driven approach gap-closer and ranged autocast (when outside melee range up to skill range)
      if (distanceTiles > member.attackRangeTiles && member.targetEntity) {
        const selectedApproach = this.skillSystem.selectSkillForCompanion(
          member,
          'gapCloser',
          time,
          target as Enemy,
          distanceTiles
        );
        if (selectedApproach) {
          const castSuccess = this.castSkill(member, selectedApproach.skillDef.id, selectedApproach.target, time);
          if (castSuccess) {
            continue;
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
        // Milestone 48: Blind status effect penalty on player accuracy
        const blindPenalty = (typeof member.hasStatusEffect === 'function' && member.hasStatusEffect('blind')) ? (member.activeStatusEffects.get('blind')?.def?.accuracyReduction ?? 0.35) : 0;
        const effectiveAccuracy = baseAccuracy + weaponLevel * accuracyBonusPerLevel + moodTier.combatAccuracyBonus - dwPenalty - blindPenalty;

        let usedSkill = false;

        const isWeaponReady = time - member.lastAttackTime >= effectiveAttackInterval;

        if (isWeaponReady) {
          const selectedRotation = this.skillSystem.selectSkillForCompanion(
            member,
            'rotation',
            time,
            target as Enemy,
            distanceTiles
          );
          if (selectedRotation) {
            const success = this.castSkill(member, selectedRotation.skillDef.id, selectedRotation.target, time);
            if (success) {
              usedSkill = true;
              this.lastCombatTimeMs = time;
            }
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

            this.executePlayerBasicAttack(
              member,
              target,
              time,
              effectiveWeapon,
              weaponLevel,
              effectiveBaseDamage,
              effectiveAccuracy,
              isDW,
              dwPenalty,
              energyCost
            );

            // DUAL WIELDING / SIDEARM: Offhand weapon attack strike
            const isScoutSidearm = (member.activeClass === 'scout' || (member.progression && member.progression.getClassLevel('scout') > 0)) &&
              (member.equippedWeapon?.proficiencyId === 'bows' || member.equippedWeapon?.id === 'bows' || member.equippedWeapon?.category === 'ranged') &&
              (member.offhandWeapon?.proficiencyId === 'daggers' || member.offhandWeapon?.id === 'daggers');
            const isJavelinSidearm = (member.activeClass === 'javelin' || (member.progression && member.progression.getClassLevel('javelin') > 0)) &&
              member.offhandWeapon && (member.offhandWeapon.proficiencyId === 'throwing_weapons' || member.offhandWeapon.id === 'throwing_weapons' || member.offhandWeapon.proficiencyId === 'spears' || member.offhandWeapon.id === 'spears');
            const isThrowerSidearm = (member.activeClass === 'thrower' || (member.progression && member.progression.getClassLevel('thrower') > 0)) &&
              member.offhandWeapon && (member.offhandWeapon.proficiencyId === 'throwing_weapons' || member.offhandWeapon.id === 'throwing_weapons' || member.offhandWeapon.proficiencyId === 'daggers' || member.offhandWeapon.id === 'daggers');
            const isAllowedSidearm = isScoutSidearm || isJavelinSidearm || isThrowerSidearm;

            const canOffhandStrike = member.offhandWeapon && (
              isDW || (isAllowedSidearm && distanceTiles <= (member.offhandWeapon.attackRangeTiles ?? 1))
            );

            if (canOffhandStrike && target.state !== 'downed' && target.state !== 'dead') {
              const offWpn = member.offhandWeapon!;
              const offProfId = offWpn.proficiencyId ?? offWpn.id;
              const offLevel = member.progression.getProficiencyLevel(offProfId);
              const offBonusDmg = offWpn.levelBonus?.damagePerLevel ?? 0;
              const offBonusAcc = offWpn.levelBonus?.accuracyPerLevel ?? 0;
              const offRawDamage = offWpn.baseDamage + offLevel * offBonusDmg;
              const offEffectiveDamage = offRawDamage * moodTier.combatDamageMultiplier;
              const activeDwPenalty = isDW ? dwPenalty : 0;
              const offEffectiveAccuracy =
                (offWpn.baseAccuracy ?? 0.65) + offLevel * offBonusAcc + moodTier.combatAccuracyBonus - activeDwPenalty;

              this.createAttackEffect(member.x, member.y, target.x, target.y, 0xa855f7);

              const offHitRoll = Math.random();
              const isOffHit = offHitRoll < offEffectiveAccuracy;
              const strikeTag = isDW ? 'Dual Wield' : 'Sidearm';

              if (!isOffHit) {
                console.log(
                  `[${strikeTag}] ${member.entityName} offhand strike with ${offWpn.name} MISSED! (Hit Chance: ${(offEffectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty: -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(offHitRoll * 100).toFixed(1)}%)`
                );
                this.createFloatingText(target.x, target.y - 22, `${strikeTag} MISS`, '#9ca3af');
              } else {
                let offDmg = offEffectiveDamage;
                if (member.hasStatusEffect('blessed_weapons')) {
                  offDmg += 5;
                  this.createFloatingText(target.x, target.y - 30, '+5 HOLY!', '#facc15');
                }
                const passiveImbuement = this.getPassiveImbuement(member);
                if (passiveImbuement?.bonusDamagePercent) {
                  offDmg *= (1 + passiveImbuement.bonusDamagePercent);
                }
                console.log(
                  `[${strikeTag}] ⚔️ ${member.entityName} offhand strike with ${offWpn.name} hits ${target.entityName} for ${offDmg.toFixed(1)} damage! (${isDW ? `DW Penalty: -${(dwPenalty * 100).toFixed(0)}%, ` : ''}Hit Chance: ${(offEffectiveAccuracy * 100).toFixed(1)}%)`
                );
                this.createFloatingText(target.x, target.y - 22, `-${offDmg.toFixed(1)} (${strikeTag})`, '#c084fc');

                member.progression.addProficiencyExp(offProfId, 2);
                if (this.isLegitimatelyDualWielding(member)) {
                  const dwResult = member.progression.addProficiencyExp('dual_wielding', 2);
                  if (dwResult.leveledUp) {
                    const dwLv = member.progression.getProficiencyLevel('dual_wielding');
                    this.createFloatingText(member.x, member.y - 20, `Dual Wield Level ${dwLv}!`, '#a855f7');
                  }
                }

                this.checkAndApplyStun(member, target, offWpn);
                if (passiveImbuement?.proc) {
                  this.checkAndApplyPassiveImbuementProc(member, target, passiveImbuement.proc);
                }

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
    this.recordBestiaryEncounter(enemy);
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

  public checkAndApplyCurse(
    attacker: Player,
    target: Entity,
    weapon: WeaponDef,
    _weaponLevelParam?: number
  ): void {
    if (!weapon.curseChance || weapon.curseChance <= 0) return;

    const weaponLevel = attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
    const curseBonusPerLevel = weapon.levelBonus?.curseChancePerLevel ?? 0;
    const effectiveCurseChance = weapon.curseChance + weaponLevel * curseBonusPerLevel;

    if (Math.random() < effectiveCurseChance) {
      const curseDef = DataLoader.getInstance().getStatusEffect('curse') || {
        id: 'curse',
        name: 'Curse',
        durationMs: 5000,
        tickIntervalMs: 5000,
        damagePerTick: 0,
        damageReductionPercent: 0.25,
        isHarmful: true,
        color: '#a855f7'
      };
      console.log(
        `[StatusEffect] 💀 Curse proc on ${target.entityName}! (Proc Chance: ${(effectiveCurseChance * 100).toFixed(1)}%)`
      );
      target.applyStatusEffect(curseDef);
      this.createFloatingText(target.x, target.y - 25, 'CURSED!', '#a855f7');
      this.createDarkImpactEffect(target.x, target.y);
    }
  }

  public checkAndApplyPoison(
    attacker: Player,
    target: Entity,
    weaponOverride?: WeaponDef,
    weaponLevel?: number
  ): void {
    const weapon = weaponOverride ?? attacker.equippedWeapon;
    if (!weapon.poisonChance || weapon.poisonChance <= 0) return;

    const wLevel = weaponLevel ?? attacker.progression.getProficiencyLevel(weapon.proficiencyId ?? weapon.id);
    const poisonBonusPerLevel = weapon.levelBonus?.poisonChancePerLevel ?? 0;
    const effectivePoisonChance = weapon.poisonChance + wLevel * poisonBonusPerLevel;

    if (Math.random() < effectivePoisonChance) {
      const dataLoader = DataLoader.getInstance();
      const poisonDef = {
        ...(dataLoader.getStatusEffect('poison') || {
          id: 'poison',
          name: 'Poison',
          tickIntervalMs: 2000,
          damagePerTick: 2,
          isHarmful: true,
          color: '#16a34a'
        }),
        persistent: false,
        durationMs: 6000
      };
      target.applyStatusEffect(poisonDef);
      this.createFloatingText(target.x, target.y - 25, 'POISONED!', '#16a34a');
      console.log(`[Combat:Nature] 🍃 Poison proc on ${target.entityName} (6s duration)!`);
    }
  }

  public applyElementalAttackStatus(enemy: Enemy, target: Entity): void {
    const school = (enemy.enemyData as any).school || enemy.enemyData.id.replace('_elemental', '');
    const dataLoader = DataLoader.getInstance();

    switch (school) {
      case 'fire': {
        // Fire: Burn (30% proc, DoT)
        if (Math.random() < 0.30) {
          const burnDef = dataLoader.getStatusEffect('burn');
          if (burnDef) {
            target.applyStatusEffect(burnDef);
            this.createFloatingText(target.x, target.y - 25, 'BURN!', '#f97316');
          }
        }
        break;
      }
      case 'ice': {
        // Ice: Frostbite (25% proc, 4.5s DoT + 50% slow)
        if (Math.random() < 0.25) {
          const frostbiteDef = dataLoader.getStatusEffect('frostbite') || {
            id: 'frostbite',
            name: 'Frostbite',
            durationMs: 4500,
            tickIntervalMs: 1500,
            damagePerTick: 3,
            moveSpeedMultiplier: 0.5,
            isHarmful: true,
            color: '#06b6d4'
          };
          target.applyStatusEffect(frostbiteDef);
          this.createFloatingText(target.x, target.y - 25, 'FROSTBITE!', '#06b6d4');
          this.createFrostEffect(target.x, target.y);
        }
        break;
      }
      case 'water': {
        // Water: Slow (25% proc, -50% move)
        if (Math.random() < 0.25) {
          const slowDef = dataLoader.getStatusEffect('slow') || {
            id: 'slow',
            name: 'Slow',
            durationMs: 3000,
            tickIntervalMs: 1000,
            damagePerTick: 0,
            moveSpeedMultiplier: 0.5,
            isHarmful: true,
            color: '#67e8f9'
          };
          target.applyStatusEffect(slowDef);
          this.createFloatingText(target.x, target.y - 25, 'SLOWED!', '#67e8f9');
          this.createFrostEffect(target.x, target.y);
        }
        break;
      }
      case 'lightning': {
        // Lightning: Shock (25% proc, interrupt)
        if (Math.random() < 0.25) {
          const shockDef = dataLoader.getStatusEffect('shock') || {
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
          target.applyStatusEffect(shockDef);
          if (shockDef.disablesMovement) target.stopMovement();
          this.createFloatingText(target.x, target.y - 25, 'SHOCKED!', '#06b6d4');
          this.createShockSparksEffect(target.x, target.y);
        }
        break;
      }
      case 'earth': {
        // Earth: Stun (20% proc, 1s duration override on elemental attack)
        if (Math.random() < 0.20) {
          const stunDef = {
            ...(dataLoader.getStatusEffect('stun') || {
              id: 'stun',
              name: 'Stun',
              tickIntervalMs: 1000,
              damagePerTick: 0,
              disablesActions: true,
              disablesMovement: true,
              color: '#facc15'
            }),
            durationMs: 1000,
            tickIntervalMs: 1000
          };
          target.applyStatusEffect(stunDef);
          if (stunDef.disablesMovement) target.stopMovement();
          this.createFloatingText(target.x, target.y - 25, 'STUNNED!', '#facc15');
        }
        break;
      }
      case 'dark': {
        // Dark: Curse (25% proc, -25% dmg)
        if (Math.random() < 0.25) {
          const curseDef = dataLoader.getStatusEffect('curse') || {
            id: 'curse',
            name: 'Curse',
            durationMs: 5000,
            tickIntervalMs: 5000,
            damagePerTick: 0,
            damageReductionPercent: 0.25,
            isHarmful: true,
            color: '#a855f7'
          };
          target.applyStatusEffect(curseDef);
          this.createFloatingText(target.x, target.y - 25, 'CURSED!', '#a855f7');
          this.createDarkImpactEffect(target.x, target.y);
        }
        break;
      }
      case 'nature': {
        // Nature: Poison (25% proc, 6s duration override)
        if (Math.random() < 0.25) {
          const poisonDef = {
            ...(dataLoader.getStatusEffect('poison') || {
              id: 'poison',
              name: 'Poison',
              tickIntervalMs: 2000,
              damagePerTick: 2,
              isHarmful: true,
              color: '#16a34a'
            }),
            persistent: false,
            durationMs: 6000
          };
          target.applyStatusEffect(poisonDef);
          this.createFloatingText(target.x, target.y - 25, 'POISONED!', '#16a34a');
        }
        break;
      }
      case 'holy': {
        // Holy: Blind (25% proc, 5s miss chance)
        if (Math.random() < 0.25) {
          const blindDef = dataLoader.getStatusEffect('blind') || {
            id: 'blind',
            name: 'Blind',
            durationMs: 5000,
            tickIntervalMs: 5000,
            damagePerTick: 0,
            accuracyReduction: 0.35,
            isHarmful: true,
            color: '#4c1d95'
          };
          target.applyStatusEffect(blindDef);
          this.createFloatingText(target.x, target.y - 25, 'BLINDED!', '#facc15');
        }
        break;
      }
      // Arcane, Wind: Plain damage, no status
      default:
        break;
    }
  }

  public getPassiveImbuement(member: Player): PassiveImbuementDef | null {
    if (!member.activeClass) return null;
    const clsDef =
      (member.progression as any)?.getClassDef?.(member.activeClass) ??
      (member.progression as any)?.classesData?.classes?.find((c: any) => c.id === member.activeClass) ??
      DataLoader.getInstance().getClass(member.activeClass);
    return clsDef?.passiveImbuement ?? null;
  }

  public calculatePassiveProcChance(procDef: PassiveImbuementProcDef, classLevel: number): number {
    const minLvl = procDef.minLevel ?? 1;
    const maxLvl = procDef.maxLevel ?? 100;
    const base = procDef.baseChance ?? 0;
    const max = procDef.maxChance ?? base;

    if (procDef.chancePerLevel !== undefined) {
      const chance = base + Math.max(0, classLevel - minLvl) * procDef.chancePerLevel;
      return Math.min(max, Math.max(base, chance));
    }

    if (classLevel <= minLvl) return base;
    if (classLevel >= maxLvl) return max;
    return base + ((classLevel - minLvl) / (maxLvl - minLvl)) * (max - base);
  }

  public checkAndApplyPassiveImbuementProc(
    attacker: Player,
    target: Entity,
    procDef: PassiveImbuementProcDef
  ): boolean {
    if (!attacker.activeClass || target.state === 'dead' || target.state === 'downed') return false;
    const classLevel = attacker.progression ? attacker.progression.getClassLevel(attacker.activeClass) : 1;
    const procChance = this.calculatePassiveProcChance(procDef, classLevel);

    if (Math.random() < procChance) {
      const effectDef = DataLoader.getInstance().getStatusEffect(procDef.statusEffectId) || {
        id: procDef.statusEffectId,
        name: procDef.statusEffectId.charAt(0).toUpperCase() + procDef.statusEffectId.slice(1),
        durationMs: 5000,
        tickIntervalMs: 5000,
        damagePerTick: 0,
        damageReductionPercent: procDef.statusEffectId === 'curse' ? 0.25 : undefined,
        isHarmful: true,
        color: '#a855f7'
      };
      target.applyStatusEffect(effectDef);
      console.log(
        `[PassiveImbuement] 💀 ${effectDef.name} proc on ${target.entityName} from ${attacker.entityName} (${attacker.activeClass} Lv ${classLevel})! (Proc Chance: ${(procChance * 100).toFixed(1)}%)`
      );
      this.createFloatingText(target.x, target.y - 25, `${effectDef.name.toUpperCase()}!`, effectDef.color ?? '#a855f7');
      if (procDef.statusEffectId === 'curse') {
        this.createDarkImpactEffect(target.x, target.y);
      }
      return true;
    }
    return false;
  }

  public executePlayerBasicAttack(
    member: Player,
    target: Entity,
    time: number = 0,
    paramWeapon?: WeaponDef,
    paramWeaponLevel?: number,
    paramEffectiveBaseDamage?: number,
    paramEffectiveAccuracy?: number,
    paramIsDW?: boolean,
    paramDwPenalty?: number,
    paramEnergyCost: number = 0
  ): boolean {
    const dataLoader = DataLoader.getInstance();
    const effectiveWeapon = paramWeapon ?? this.getEffectiveWeaponForAttack(member);
    const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
    const weaponLevel = paramWeaponLevel ?? (member.progression ? member.progression.getProficiencyLevel(weaponId) : 0);
    const damageBonusPerLevel = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
    const accuracyBonusPerLevel = effectiveWeapon.levelBonus?.accuracyPerLevel ?? 0;
    const rawBaseDamage = effectiveWeapon.baseDamage + weaponLevel * damageBonusPerLevel;
    const baseAccuracy = effectiveWeapon.baseAccuracy ?? 0.60;

    const moodTier = dataLoader.getMoodTier ? dataLoader.getMoodTier(member.mood) : { combatDamageMultiplier: 1.0, combatAccuracyBonus: 0 };
    const effectiveBaseDamage = paramEffectiveBaseDamage ?? (rawBaseDamage * (moodTier?.combatDamageMultiplier ?? 1.0));

    const isDW = paramIsDW !== undefined ? paramIsDW : (typeof member.isDualWielding === 'function' ? member.isDualWielding() : false);
    const dwPenalty = paramDwPenalty !== undefined ? paramDwPenalty : (isDW && member.progression ? member.progression.getDualWieldPenalty() : 0);
    const blindPenalty = (typeof member.hasStatusEffect === 'function' && member.hasStatusEffect('blind')) ? (member.activeStatusEffects.get('blind')?.def?.accuracyReduction ?? 0.35) : 0;
    const effectiveAccuracy = paramEffectiveAccuracy ?? (baseAccuracy + weaponLevel * accuracyBonusPerLevel + (moodTier?.combatAccuracyBonus ?? 0) - dwPenalty - blindPenalty);
    const distanceTiles = Math.max(Math.abs(member.gridPos.x - target.gridPos.x), Math.abs(member.gridPos.y - target.gridPos.y));

    member.lastAttackTime = time;
    member.state = 'attacking';
    if (target instanceof Enemy) {
      this.recordBestiaryEncounter(target);
    }

    console.log(
      `[DIAG:Combat] ⚔️ ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name}! inCombat: ${member.inCombat}, Pre-EN: ${((member.energy ?? 0) + paramEnergyCost).toFixed(1)}, Post-EN: ${(member.energy ?? 0).toFixed(1)}, Range: ${member.attackRangeTiles}, Dist: ${distanceTiles}`
    );

    const isFist = effectiveWeapon.id === 'fist' || effectiveWeapon.category === 'unarmed';
    const isFire = effectiveWeapon.id === 'fire_magic';
    const isLightning = effectiveWeapon.id === 'lightning_magic';
    const isIce = effectiveWeapon.id === 'ice_magic';
    const isHoly = effectiveWeapon.id === 'holy_magic';
    const isDark = effectiveWeapon.id === 'dark_magic';
    const isArcane = effectiveWeapon.id === 'arcane_magic';
    const isWater = effectiveWeapon.id === 'water_magic';
    const isEarth = effectiveWeapon.id === 'earth_magic';
    const isNature = effectiveWeapon.id === 'nature_magic';
    const isWind = effectiveWeapon.id === 'wind_magic';
    const isRangedBow = effectiveWeapon.category === 'ranged' || effectiveWeapon.proficiencyId === 'bows' || effectiveWeapon.id === 'bows';
    const attackColor = isFire ? 0xf97316 : isLightning ? 0x38bdf8 : isIce ? 0x67e8f9 : isHoly ? 0xfacc15 : isDark ? 0xa855f7 : isArcane ? 0xc084fc : isWater ? 0x0284c7 : isEarth ? 0x78350f : isNature ? 0x16a34a : isWind ? 0xa7f3d0 : isRangedBow ? 0xf59e0b : isFist ? 0xf97316 : 0x3b82f6;
    if (isLightning) {
      this.createLightningBoltEffect(member.x, member.y, target.x, target.y);
    } else if (isHoly) {
      this.createHolySmiteEffect(member.x, member.y, target.x, target.y);
    } else if (isDark) {
      this.createDarkBoltEffect(member.x, member.y, target.x, target.y);
    } else if (isArcane) {
      this.createArcaneBoltEffect(member.x, member.y, target.x, target.y);
    } else {
      this.createAttackEffect(member.x, member.y, target.x, target.y, attackColor);
    }
    if (isFire) {
      this.createFireExplosionEffect(target.x, target.y);
    } else if (isIce || isWater) {
      this.createFrostEffect(target.x, target.y);
    } else if (isHoly) {
      this.createHolyImpactEffect(target.x, target.y);
    } else if (isDark) {
      this.createDarkImpactEffect(target.x, target.y);
    } else if (isArcane) {
      this.createArcaneImpactEffect(target.x, target.y);
    } else if (isEarth || isNature || isWind) {
      this.createAttackEffect(target.x, target.y, target.x, target.y, attackColor);
    }

    const hitRoll = Math.random();
    const isHit = hitRoll < effectiveAccuracy;

    if (!isHit) {
      console.log(
        `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} but MISSED! (Hit Chance: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty: -${(dwPenalty * 100).toFixed(0)}%]` : ''}, Roll: ${(hitRoll * 100).toFixed(1)}%)`
      );
      this.createFloatingText(target.x, target.y - 10, 'MISS', '#9ca3af');
      return false;
    }

    let damage = effectiveBaseDamage;
    if (typeof member.hasStatusEffect === 'function' && member.hasStatusEffect('blessed_weapons')) {
      damage += 5;
      this.createFloatingText(target.x, target.y - 24, '+5 HOLY!', '#facc15');
    }
    const passiveImbuement = this.getPassiveImbuement(member);
    if (passiveImbuement?.bonusDamagePercent) {
      damage *= (1 + passiveImbuement.bonusDamagePercent);
    }
    if (typeof member.hasStatusEffect === 'function' && member.hasStatusEffect('runic_infusion')) {
      const runicEffect = member.activeStatusEffects?.get?.('runic_infusion')?.def;
      const runicBonus = runicEffect?.bonusDamagePercent ?? 0.25;
      damage *= (1 + runicBonus);
      const siphon = runicEffect?.energySiphonOnHit ?? 4;
      const maxEnergy = member.maxEnergy ?? 100;
      member.energy = Math.min(maxEnergy, (member.energy ?? 0) + siphon);
      this.createFloatingText(member.x, member.y - 20, `RUNIC SIPHON! +${siphon} EN`, '#818cf8');
    }
    console.log(
      `[Combat] ${member.entityName} attacks ${target.entityName} with ${effectiveWeapon.name} for ${damage.toFixed(1)} damage! (Base: ${effectiveWeapon.baseDamage}, Lv ${weaponLevel} Bonus: +${(weaponLevel * damageBonusPerLevel).toFixed(1)}, Accuracy: ${(effectiveAccuracy * 100).toFixed(1)}%${isDW ? ` [DW Penalty -${(dwPenalty * 100).toFixed(0)}%]` : ''}${passiveImbuement?.bonusDamagePercent ? ` [Passive Imbuement: +${(passiveImbuement.bonusDamagePercent * 100).toFixed(0)}%]` : ''})`
    );
    const dmgColor = isFire ? '#f97316' : isLightning ? '#38bdf8' : isIce ? '#67e8f9' : isHoly ? '#facc15' : isDark ? '#a855f7' : isArcane ? '#c084fc' : isWater ? '#0284c7' : isEarth ? '#b45309' : isNature ? '#16a34a' : isWind ? '#a7f3d0' : isRangedBow ? '#f59e0b' : isFist ? '#f97316' : '#38bdf8';
    const hitText = isFist ? `PUNCH! -${damage.toFixed(1)}` : `-${damage.toFixed(1)}`;
    this.createFloatingText(target.x, target.y - 10, hitText, dmgColor);

    this.checkAndApplyBleed(member, target, effectiveWeapon);
    this.checkAndApplyBurn(member, target, effectiveWeapon);
    this.checkAndApplyStun(member, target, effectiveWeapon);
    this.checkAndApplyShock(member, target, effectiveWeapon);
    this.checkAndApplySlow(member, target, effectiveWeapon);
    this.checkAndApplyCurse(member, target, effectiveWeapon, weaponLevel);
    this.checkAndApplyPoison(member, target, effectiveWeapon, weaponLevel);
    if (isHoly) {
      this.applyHolyRadiance(member, target, effectiveWeapon, weaponLevel);
    }
    if (isArcane) {
      this.applyArcaneManaSiphon(member, target, effectiveWeapon, weaponLevel);
    }
    if (isWater) {
      this.applyWaterTidalHeal(member, target, effectiveWeapon, weaponLevel);
    }
    if (isEarth) {
      this.applyEarthStoneskin(member, effectiveWeapon);
    }
    if (isNature) {
      this.applyNatureRegrowth(member, effectiveWeapon);
    }
    if (passiveImbuement?.proc) {
      this.checkAndApplyPassiveImbuementProc(member, target, passiveImbuement.proc);
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

    // Piercing Line targeting for weapons with pierceLineTargets (e.g. Wind Magic)
    if (effectiveWeapon.pierceLineTargets && effectiveWeapon.pierceLineTargets > 1 && this.enemies) {
      this.applyWindLinePierce(member, target, damage, effectiveWeapon, weaponId);
    }

    if (member.progression) {
      const result = member.progression.addProficiencyExp(weaponId, 2);
      if (result && result.leveledUp) {
        const newLevel = member.progression.getProficiencyLevel(weaponId);
        this.createFloatingText(member.x, member.y - 20, `${effectiveWeapon.name} Level ${newLevel}!`, '#22c55e');
      }

      if (passiveImbuement?.secondaryExp) {
        const secProf = passiveImbuement.secondaryExp.proficiency;
        const secExp = passiveImbuement.secondaryExp.exp ?? (passiveImbuement.secondaryExp.share !== undefined ? Math.round(2 * passiveImbuement.secondaryExp.share) : 1);
        if (secProf) {
          const secResult = member.progression.addProficiencyExp(secProf, secExp);
          if (secResult && secResult.leveledUp) {
            const newSecLevel = member.progression.getProficiencyLevel(secProf);
            this.createFloatingText(member.x, member.y - 35, `${secProf.replace('_', ' ').toUpperCase()} Level ${newSecLevel}!`, '#a855f7');
          }
        }
      }
      member?.awardArmorWearExp?.('attack');
    }

    this.lastCombatTimeMs = time;
    if (target.state !== 'dead' && target.state !== 'downed') (target as any).isAggroed = true;
    const targetDowned = target.takeDamage(damage);

    // Glacial Sovereign: Frost Thorns reflection against melee attackers while Glaciated
    if (target instanceof Enemy && (target as any).isGlaciated && (target as any).enemyData?.id === 'glacial_sovereign' && !targetDowned) {
      const dist = Math.hypot(member.gridPos.x - target.gridPos.x, member.gridPos.y - target.gridPos.y);
      if (dist <= 1.5) {
        const reflectDamage = Math.max(1, Math.round(damage * 0.15));
        const memDowned = member.takeDamage(reflectDamage);
        this.createFloatingText(member.x, member.y - 14, `-${reflectDamage} (FROST THORNS!)`, '#67e8f9');
        console.log(`[Combat:FrostThorns] ❄️ ${target.entityName}'s Frost Thorns reflect ${reflectDamage} frost damage to ${member.entityName}!`);
        if (memDowned) {
          member.clearTarget();
        }
      }
    }

    if (targetDowned) {
      this.handleTargetDefeated(member, target, weaponId);
    }

    return true;
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
      if (ally.state === 'dead' || ally.state === 'downed' || (ally.hp <= 0 && ally.criticalHp <= 0)) continue;
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
          `[Combat:Holy] ☀️ Radiance pulse healed ${bestCandidate.entityName} for ${restored} HP! (HP: ${bestCandidate.hp}/${bestCandidate.maxHp}, Crit: ${bestCandidate.criticalHp}/${bestCandidate.maxCriticalHp})`
        );
      }
    }
  }

  public applyArcaneManaSiphon(
    caster: Player,
    target: Entity,
    weaponDef: WeaponDef,
    weaponLevel: number
  ): void {
    const baseSiphon = weaponDef.manaSiphonAmount ?? 4;
    const siphonBonusPerLevel = weaponDef.levelBonus?.manaSiphonPerLevel ?? 0.1;
    const siphonAmount = Math.max(1, Math.round(baseSiphon + weaponLevel * siphonBonusPerLevel));

    const oldEnergy = caster.energy ?? 0;
    const maxEnergy = caster.maxEnergy ?? 100;
    const actualRestored = Math.min(maxEnergy - oldEnergy, siphonAmount);
    caster.energy = Math.min(maxEnergy, oldEnergy + siphonAmount);

    this.createArcaneSiphonEffect(target.x, target.y, caster.x, caster.y);
    this.createFloatingText(caster.x, caster.y - 14, `+${siphonAmount} EN (Siphon)`, '#c084fc');
    console.log(
      `[Combat:Arcane] ✨ Mana Siphon siphoned ${siphonAmount} Energy from ${target.entityName} to ${caster.entityName}! (Restored: +${actualRestored.toFixed(1)}, EN: ${caster.energy.toFixed(1)}/${maxEnergy})`
    );
  }

  public applyWaterTidalHeal(
    caster: Player,
    _target: Entity,
    weaponDef: WeaponDef,
    weaponLevel: number
  ): void {
    const baseHeal = weaponDef.tidalHealAmount ?? 2;
    const healBonusPerLevel = weaponDef.levelBonus?.tidalHealPerLevel ?? 0.1;
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
      if (ally.state === 'dead' || ally.state === 'downed' || (ally.hp <= 0 && ally.criticalHp <= 0)) continue;
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
        this.createFloatingText(bestCandidate.x, bestCandidate.y - 14, `+${restored} HP (Tidal)`, '#0284c7');
        console.log(
          `[Combat:Water] 🌊 Tidal surge healed ${bestCandidate.entityName} for ${restored} HP! (HP: ${bestCandidate.hp}/${bestCandidate.maxHp}, Crit: ${bestCandidate.criticalHp}/${bestCandidate.maxCriticalHp})`
        );
      }
    }
  }

  public applyEarthStoneskin(
    caster: Player,
    weaponDef: WeaponDef
  ): void {
    const candidates = this.party && this.party.length > 0 ? this.party : [caster];
    const stoneskinDef = DataLoader.getInstance().getStatusEffect('stoneskin') || {
      id: 'stoneskin',
      name: 'Stoneskin',
      durationMs: weaponDef.stoneskinDurationMs ?? 4000,
      tickIntervalMs: 4000,
      damagePerTick: 0,
      damageTakenMultiplier: 0.90,
      isHarmful: false,
      color: '#a8a29e'
    };

    for (const ally of candidates) {
      if (ally.state === 'dead' || ally.state === 'downed' || (ally.hp <= 0 && ally.criticalHp <= 0)) continue;
      ally.applyStatusEffect(stoneskinDef);
      this.createFloatingText(ally.x, ally.y - 16, 'STONESKIN!', '#a8a29e');
    }
    console.log(`[Combat:Earth] 🪨 Stoneskin applied to party (-10% damage taken for 4s)!`);
  }

  public applyNatureRegrowth(
    caster: Player,
    weaponDef: WeaponDef
  ): void {
    const radiusTiles = weaponDef.attackRangeTiles ?? 4;
    const casterTile = {
      x: Math.floor(caster.x / caster.tileSize),
      y: Math.floor(caster.y / caster.tileSize)
    };

    const candidates = this.party && this.party.length > 0 ? this.party : [caster];
    let bestCandidate: Player | null = null;
    let lowestHpRatio = 1.0;

    for (const ally of candidates) {
      if (ally.state === 'dead' || ally.state === 'downed' || (ally.hp <= 0 && ally.criticalHp <= 0)) continue;
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

    const targetAlly = bestCandidate || caster;
    if (targetAlly.state === 'dead' || targetAlly.state === 'downed' || (targetAlly.hp <= 0 && targetAlly.criticalHp <= 0)) return;

    // Director Rule: Exactly one active Regrowth per caster
    const oldTarget = this.casterRegrowthTargets.get(caster.id);
    if (oldTarget && oldTarget !== targetAlly && oldTarget.hasStatusEffect('regrowth')) {
      oldTarget.removeStatusEffect('regrowth');
      console.log(`[Combat:Nature] 🌿 Regrowth shifted from ${oldTarget.entityName} to ${targetAlly.entityName}!`);
    }

    const regrowthDef = DataLoader.getInstance().getStatusEffect('regrowth') || {
      id: 'regrowth',
      name: 'Regrowth',
      durationMs: weaponDef.regrowthDurationMs ?? 4000,
      tickIntervalMs: 1000,
      damagePerTick: 0,
      healPerTick: 1,
      isHarmful: false,
      color: '#22c55e'
    };

    targetAlly.applyStatusEffect(regrowthDef);
    this.casterRegrowthTargets.set(caster.id, targetAlly);
    this.createFloatingText(targetAlly.x, targetAlly.y - 16, 'REGROWTH!', '#22c55e');
    console.log(`[Combat:Nature] 🌿 Regrowth placed on ${targetAlly.entityName} (1 HP/s for 4s)!`);
  }

  public applyWindLinePierce(
    caster: Player,
    primaryTarget: Entity,
    damage: number,
    _weaponDef: WeaponDef,
    weaponId: string
  ): void {
    if (!this.enemies || this.enemies.length === 0) return;

    const dx = primaryTarget.x - caster.x;
    const dy = primaryTarget.y - caster.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;
    const tileSize = primaryTarget.tileSize || 32;
    const maxPastDist = 3.0 * tileSize + 4; // up to 3 tiles past primary target
    const maxCorridorHalfWidth = 1.0 * tileSize; // 1-tile corridor

    const candidates: { enemy: Enemy; proj: number }[] = [];

    for (const enemy of this.enemies) {
      if (enemy === primaryTarget || enemy.state === 'dead' || enemy.state === 'downed') continue;

      const ex = enemy.x - primaryTarget.x;
      const ey = enemy.y - primaryTarget.y;

      // Projection along the shot line (must be > 0, i.e., behind primary target)
      const proj = ex * ux + ey * uy;
      if (proj <= 0 || proj > maxPastDist) continue;

      // Perpendicular distance from shot centerline
      const perp = Math.abs(ex * uy - ey * ux);
      if (perp > maxCorridorHalfWidth) continue;

      candidates.push({ enemy, proj });
    }

    // Sort nearest to primary target first
    candidates.sort((a, b) => a.proj - b.proj);

    // Hit up to 2 extra enemies behind primary target
    const hitList = candidates.slice(0, 2);
    for (let i = 0; i < hitList.length; i++) {
      const { enemy } = hitList[i];
      console.log(`[Combat:Wind] 💨 Piercing wind slices through ${enemy.entityName} for ${damage.toFixed(1)} damage!`);
      this.createAttackEffect(primaryTarget.x, primaryTarget.y, enemy.x, enemy.y, 0xa7f3d0);
      this.createFloatingText(enemy.x, enemy.y - 10, `-${damage.toFixed(1)} (Pierce)`, '#a7f3d0');
      enemy.isAggroed = true;
      const downed = enemy.takeDamage(damage);
      if (downed) {
        this.handleTargetDefeated(caster, enemy, weaponId);
      }
    }
  }

  public handleTargetDefeated(killer: Player, target: Entity, weaponId: string): void {
    console.log(`[Combat] ${target.entityName} defeated/downed by ${killer.entityName}!`);
    const result = killer.progression.addProficiencyExp(weaponId, 4);
    if (result.leveledUp) {
      const newLevel = killer.progression.getProficiencyLevel(weaponId);
      this.createFloatingText(killer.x, killer.y - 20, `Level Up! Level ${newLevel}`, '#22c55e');
    }

    const isKillerScoutSidearm = (killer.activeClass === 'scout' || (killer.progression && killer.progression.getClassLevel('scout') > 0)) &&
      (killer.equippedWeapon?.proficiencyId === 'bows' || killer.equippedWeapon?.id === 'bows' || killer.equippedWeapon?.category === 'ranged') &&
      (killer.offhandWeapon?.proficiencyId === 'daggers' || killer.offhandWeapon?.id === 'daggers');
    const isKillerJavelinSidearm = (killer.activeClass === 'javelin' || (killer.progression && killer.progression.getClassLevel('javelin') > 0)) &&
      killer.offhandWeapon && (killer.offhandWeapon.proficiencyId === 'throwing_weapons' || killer.offhandWeapon.id === 'throwing_weapons' || killer.offhandWeapon.proficiencyId === 'spears' || killer.offhandWeapon.id === 'spears');
    const isKillerThrowerSidearm = (killer.activeClass === 'thrower' || (killer.progression && killer.progression.getClassLevel('thrower') > 0)) &&
      killer.offhandWeapon && (killer.offhandWeapon.proficiencyId === 'throwing_weapons' || killer.offhandWeapon.id === 'throwing_weapons' || killer.offhandWeapon.proficiencyId === 'daggers' || killer.offhandWeapon.id === 'daggers');
    const isKillerSidearm = isKillerScoutSidearm || isKillerJavelinSidearm || isKillerThrowerSidearm;

    if ((killer.isDualWielding() || isKillerSidearm) && killer.offhandWeapon) {
      killer.progression.addProficiencyExp(killer.offhandWeapon.proficiencyId ?? killer.offhandWeapon.id, 2);
      if (this.isLegitimatelyDualWielding(killer)) {
        killer.progression.addProficiencyExp('dual_wielding', 2);
      }
    }

    killer?.awardArmorWearExp?.('kill');

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
      const gameState = GameState.getInstance();
      const isBoss = target.enemyData.tier === 'boss';

      // Milestone: Research Points Kill Rewards (Elite, Epic, Boss)
      const rpReward = CombatSystem.calculateResearchPointsForEnemy(target.enemyData);
      if (rpReward > 0) {
        gameState.addResearchPoints(rpReward);
        const rpColor = isBoss ? '#ef4444' : target.enemyData.tier === 'epic' ? '#c084fc' : '#38bdf8';
        this.createFloatingText(target.x, target.y - 48, `+${rpReward} RP`, rpColor);
        const hud = (this.scene as any)?.hud;
        if (hud && typeof hud.showToast === 'function') {
          hud.showToast(`🔬 Defeated ${target.enemyData.name}! (+${rpReward} Research Points)`, 'success', 3000);
        }
        console.log(
          `[Combat] 🔬 Defeated ${target.enemyData.tier.toUpperCase()} ${target.enemyData.name}! Awarded +${rpReward} Research Points. (Total: ${gameState.getResearchPoints()})`
        );
      }

      if (isBoss) {
        // Milestone: Environments Every 5 Floors & Area Boss Gates
        // Defeating an area boss unlocks the gate permanently and for the current run
        gameState.recordDefeatedAreaBoss(target.enemyData.id);
        if (this.scene && typeof (this.scene as any).onAreaBossDefeated === 'function') {
          (this.scene as any).onAreaBossDefeated(target.enemyData.id);
        }
      }

      // Roll and award harvest drops (excluding Skinning and Butchering items moved to manual corpse interaction)
      if (target.enemyData.harvest && target.enemyData.harvest.length > 0) {
        const validHarvest = target.enemyData.harvest.filter(
          (h) => h.method !== 'skinning' &&
                 h.method !== 'butchering' &&
                 !['wolf_pelt', 'spider_silk', 'wolf_meat', 'monster_meat'].includes(h.item)
        );

        let recipient: Player = killer;
        if (!recipient || recipient.state === 'downed' || recipient.state === 'dead' || (recipient.hp <= 0 && recipient.criticalHp <= 0)) {
          recipient = (this.party && this.party[0]) ? this.party[0] : killer;
        }

        if (target.enemyData.tier === 'common') {
          const chosen = CombatSystem.rollCommonEnemyDrop(target.enemyData);
          if (chosen) {
            if (recipient) {
              recipient.addItem(chosen.item, 1);
            } else {
              gameState.addItem(chosen.item, 1);
            }
            const itemName = chosen.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            const isRare = chosen.method === 'rare_drop';
            const floatColor = isRare ? '#f59e0b' : '#34d399';
            this.createFloatingText(target.x, target.y - 35, `+1 ${itemName}`, floatColor);
          }
        } else if (target.enemyData.tier === 'elemental') {
          // Milestone: Magical Crafting - Elemental Enemy Drops
          // Guaranteed 1-2 Gemstones of elemental's own school (100% drop)
          // Holy elemental has 70% chance of 1 Healing Gemstone
          // Thematic secondary drops rolled by individual chance
          for (const h of validHarvest) {
            let shouldDrop = false;
            let count = 1;

            if (h.method === 'guaranteed') {
              shouldDrop = true;
              count = Array.isArray(h.amount)
                ? Math.floor(Math.random() * (h.amount[1] - h.amount[0] + 1)) + h.amount[0]
                : (typeof h.amount === 'number' ? h.amount : 1);
            } else {
              const chance = (h as any).chance ?? (h.method === 'rare_drop' ? 0.35 : 0.5);
              if (Math.random() < chance) {
                shouldDrop = true;
                count = Array.isArray(h.amount)
                  ? Math.floor(Math.random() * (h.amount[1] - h.amount[0] + 1)) + h.amount[0]
                  : (typeof h.amount === 'number' ? h.amount : 1);
              }
            }

            if (shouldDrop && count > 0) {
              if (recipient) {
                recipient.addItem(h.item, count);
              } else {
                gameState.addItem(h.item, count);
              }
              const itemName = h.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const floatColor = h.method === 'guaranteed' ? '#38bdf8' : (h.item === 'healing_gemstone' ? '#fde047' : '#a78bfa');
              this.createFloatingText(target.x, target.y - 35, `+${count} ${itemName}`, floatColor);
            }
          }
        } else if (target.enemyData.id === 'bone_warden') {
          // Director-mandated drops for Bone Warden (Band 1 Crypts Boss):
          // 1. Guaranteed: 3 bone, 2 ore
          if (recipient) {
            recipient.addItem('bone', 3);
            recipient.addItem('ore', 2);
          } else {
            gameState.addItem('bone', 3);
            gameState.addItem('ore', 2);
          }
          this.createFloatingText(target.x, target.y - 35, '+3 Bone', '#e4e4e7');
          this.createFloatingText(target.x, target.y - 50, '+2 Ore', '#a1a1aa');
          // 2. Guaranteed 1 Gemstone: Holy or Dark 50/50
          const gemItem = Math.random() < 0.50 ? 'holy_gemstone' : 'dark_gemstone';
          const gemName = gemItem === 'holy_gemstone' ? 'Holy Gemstone' : 'Dark Gemstone';
          if (recipient) recipient.addItem(gemItem, 1);
          else gameState.addItem(gemItem, 1);
          this.createFloatingText(target.x, target.y - 65, `+1 ${gemName}`, '#38bdf8');
        } else if (target.enemyData.id === 'magma_tyrant') {
          // Director-mandated drops for Magma Tyrant (Band 3 Milestone Boss):
          // 1. void_plate: 1 at 50%
          if (Math.random() < 0.50) {
            if (recipient) recipient.addItem('void_plate', 1);
            else gameState.addItem('void_plate', 1);
            this.createFloatingText(target.x, target.y - 35, '+1 Void Plate', '#ef4444');
          }
          // 2. void_essence: 1 at 50%
          if (Math.random() < 0.50) {
            if (recipient) recipient.addItem('void_essence', 1);
            else gameState.addItem('void_essence', 1);
            this.createFloatingText(target.x, target.y - 50, '+1 Void Essence', '#ef4444');
          }
          // 3. Gemstone: 1 guaranteed (Fire or Lightning 50/50)
          const gemItem = Math.random() < 0.50 ? 'fire_gemstone' : 'lightning_gemstone';
          const gemName = gemItem === 'fire_gemstone' ? 'Fire Gemstone' : 'Lightning Gemstone';
          if (recipient) recipient.addItem(gemItem, 1);
          else gameState.addItem(gemItem, 1);
          this.createFloatingText(target.x, target.y - 65, `+1 ${gemName}`, '#38bdf8');
          // 4. void_core: 10% chase drop
          if (Math.random() < 0.10) {
            if (recipient) recipient.addItem('void_core', 1);
            else gameState.addItem('void_core', 1);
            this.createFloatingText(target.x, target.y - 80, '+1 Void Core', '#c084fc');
          }
        } else {
          // Elite, Epic and Boss keep their existing tiered reward structure
          // Guaranteed Gemstones for Abyssal Colossus and Glacial Sovereign:
          if (target.enemyData.id === 'abyssal_colossus') {
            const roll = Math.random();
            const gemItem = roll < 1 / 3 ? 'arcane_gemstone' : roll < 2 / 3 ? 'water_gemstone' : 'earth_gemstone';
            const gemName = gemItem === 'arcane_gemstone' ? 'Arcane Gemstone' : gemItem === 'water_gemstone' ? 'Water Gemstone' : 'Earth Gemstone';
            if (recipient) recipient.addItem(gemItem, 1);
            else gameState.addItem(gemItem, 1);
            this.createFloatingText(target.x, target.y - 65, `+1 ${gemName}`, '#38bdf8');
          } else if (target.enemyData.id === 'glacial_sovereign') {
            const gemItem = Math.random() < 0.50 ? 'ice_gemstone' : 'wind_gemstone';
            const gemName = gemItem === 'ice_gemstone' ? 'Ice Gemstone' : 'Wind Gemstone';
            if (recipient) recipient.addItem(gemItem, 1);
            else gameState.addItem(gemItem, 1);
            this.createFloatingText(target.x, target.y - 65, `+1 ${gemName}`, '#38bdf8');
          }

          for (const h of validHarvest) {
            if (h.item === 'arcane_gemstone' || h.item === 'ice_gemstone') continue; // handled above
            const isRare = h.method === 'rare_drop';
            const roll = Math.random();
            const rareThreshold = isBoss ? 0.60 : 0.35;
            if (!isRare || roll < rareThreshold) {
              const harvestCount = Array.isArray(h.amount)
                ? Math.floor(Math.random() * (h.amount[1] - h.amount[0] + 1)) + h.amount[0]
                : typeof h.amount === 'number'
                ? h.amount
                : Array.isArray(h.count)
                ? Math.floor(Math.random() * (h.count[1] - h.count[0] + 1)) + h.count[0]
                : typeof h.count === 'number'
                ? h.count
                : 1;
              if (recipient) {
                recipient.addItem(h.item, harvestCount);
              } else {
                gameState.addItem(h.item, harvestCount);
              }
              const itemName = h.item.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const floatColor = isBoss ? '#ef4444' : target.enemyData.tier === 'epic' && isRare ? '#c084fc' : isRare ? '#f59e0b' : '#34d399';
              this.createFloatingText(target.x, target.y - 35, `+${harvestCount} ${itemName}`, floatColor);
            }
          }
        }
      }
      if (this.onEnemyDeathCallback) {
        this.onEnemyDeathCallback(target);
      }
    }
  }

  public isLegitimatelyDualWielding(member: Player): boolean {
    if (!member) return false;
    if (typeof member.isDualWielding === 'function' && !member.isDualWielding()) return false;
    const main = member.equippedWeapon;
    const off = member.offhandWeapon;
    if (!main || !off) return false;
    // Both must be one-handed melee weapons (never ranged, two-handed, or shield)
    const isMain1H = (main.category === 'melee_1h' || (main.category as string) === 'melee') && !main.twoHanded;
    const isOffhand1H = (off.category === 'melee_1h' || (off.category as string) === 'melee') && !off.twoHanded;
    if (!isMain1H || !isOffhand1H) return false;
    // Dual Wielding must be unlocked
    if (member.progression && typeof member.progression.isDualWieldUnlocked === 'function') {
      if (!member.progression.isDualWieldUnlocked()) return false;
    }
    return true;
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

  public createDarkImpactEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const impact = this.scene.add.circle(x, y, 14, 0xa855f7, 0.7).setDepth(2001);
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

  public createDarkBoltEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(3, 0xa855f7, 0.9);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    const burst = this.scene.add.circle(x2, y2, 16, 0x7c3aed, 0.8).setDepth(2001);
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

  public createArcaneBoltEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(3, 0xc084fc, 0.9);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    const burst = this.scene.add.circle(x2, y2, 16, 0xa855f7, 0.8).setDepth(2001);
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

  public createArcaneImpactEffect(x: number, y: number): void {
    if (!this.scene?.add) return;
    const impact = this.scene.add.circle(x, y, 14, 0xc084fc, 0.7).setDepth(2001);
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

  public createArcaneSiphonEffect(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.scene?.add) return;
    const g = this.scene.add.graphics().setDepth(2000);
    g.lineStyle(2, 0xe879f9, 0.85);
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
      duration: 220,
      onComplete: () => g.destroy()
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

  public createArcaneNovaEffect(x: number, y: number, radiusPx: number): void {
    if (!this.scene?.add) return;
    const ring = this.scene.add.circle(x, y, 10, 0xc084fc, 0.85).setDepth(2000);
    const core = this.scene.add.circle(x, y, 14, 0xe879f9, 0.7).setDepth(2001);
    this.scene.tweens?.add({
      targets: ring,
      radius: Math.max(30, radiusPx),
      alpha: 0,
      duration: 450,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });
    this.scene.tweens?.add({
      targets: core,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy()
    });
  }

  /**
   * Milestone 58: Shared, generic mechanism for consuming Overcharge buff on offensive spellcasting.
   * If Overcharge is active on the caster, deducts an additional 50% base energy cost
   * (or whatever energy is available), consumes the buff, and returns a 1.75x damage multiplier.
   * If Overcharge is not active, returns { multiplier: 1.0, extraEnergyCost: 0, isOvercharged: false }.
   */
  public consumeOverchargeIfActive(
    caster: Player,
    baseEnergyCost: number
  ): { multiplier: number; extraEnergyCost: number; isOvercharged: boolean } {
    if (!caster.hasStatusEffect('overcharge')) {
      return { multiplier: 1.0, extraEnergyCost: 0, isOvercharged: false };
    }
    const effDef = caster.activeStatusEffects.get('overcharge')?.def;
    const dmgMult = effDef?.spellDamageMultiplier ?? 1.75;
    const costMult = effDef?.spellEnergyCostMultiplier ?? 1.50;
    const extraCost = Math.round(baseEnergyCost * (costMult - 1.0));

    const actualExtraDeducted = Math.min(extraCost, caster.energy);
    caster.energy -= actualExtraDeducted;
    caster.removeStatusEffect('overcharge');

    console.log(
      `[Skill:Overcharge] ⚡ ${caster.entityName} consumed Overcharge! (${dmgMult}x damage, +${actualExtraDeducted} EN consumed)`
    );

    return {
      multiplier: dmgMult,
      extraEnergyCost: actualExtraDeducted,
      isOvercharged: true
    };
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

    const dataLoader = DataLoader.getInstance();
    const healDef = dataLoader.getWeapon('healing_magic');
    const healThreshold = healDef?.healThresholdPercent ?? 0.70;
    const maxHealRange = healDef?.attackRangeTiles ?? 4;

    // Scan for living party members within powered range at or below heal threshold (70% combined HP)
    const damagedMembers = this.party.filter((m) => {
      if (m.state === 'dead' || m.state === 'downed') return false;
      const totalMaxHp = m.maxHp + m.maxCriticalHp;
      if (totalMaxHp <= 0) return false;
      const currentCombinedHp = m.hp + m.criticalHp;
      const hpRatio = currentCombinedHp / totalMaxHp;
      if (hpRatio > healThreshold) return false;
      const dist = Math.max(Math.abs(member.gridPos.x - m.gridPos.x), Math.abs(member.gridPos.y - m.gridPos.y));
      return dist <= maxHealRange;
    });

    // Branch 2: Nobody needs healing within range -> proceed to standard combat actions
    if (damagedMembers.length === 0) return false;

    const healInterval = healDef?.attackIntervalMs ?? 1500;

    const lastHeal = member.lastSkillUseTimes.get('healing_magic');
    if (lastHeal !== undefined && time - lastHeal < healInterval) return false;

    const healLevel = member.progression.getProficiencyLevel('healing_magic');
    const costReduction = (healDef?.levelBonus?.energyCostReductionPerLevel ?? 0.1) * healLevel;
    const energyCost = Math.max(1, Math.round((healDef?.energyCostPerCast ?? 22) - costReduction));

    // Branch 3: Damaged ally exists within range, but healer is out of energy (< energyCost)
    if (member.energy < energyCost) {
      // Throttle warning log to once per heal interval to avoid console spamming
      if (lastHeal === undefined || time - lastHeal >= healInterval) {
        console.log(
          `[Healing Magic] ⚠️ Out of Energy to cast Heal (${member.energy.toFixed(0)}/${energyCost})! ${member.entityName} falling back to Staff melee attack.`
        );
        member.lastSkillUseTimes.set('healing_magic', time);
      }
      // If the member is actively moving, has path steps, or has no combat target, respect movement/player commands and do NOT autonomously acquire an enemy
      const isMovingAlongPath = member.isMoving() || (typeof member.hasActivePath === 'function' ? member.hasActivePath() : false) || member.claimedDestination !== null;
      if (isMovingAlongPath || !member.targetEntity) {
        return false;
      }
      return false; // Fall back to melee target attack on existing targetEntity
    }

    // Branch 1: Damaged ally exists within range and healer has sufficient energy -> cast Heal
    // Pick the lowest ally below the threshold (lowest combined HP ratio)
    damagedMembers.sort((a, b) => {
      const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
      const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
      if (Math.abs(aRatio - bRatio) > 0.001) {
        return aRatio - bRatio;
      }
      const aSelf = a === member ? 1 : 0;
      const bSelf = b === member ? 1 : 0;
      return aSelf - bSelf;
    });

    const targetAlly = damagedMembers[0];
    const distToTarget = Math.max(Math.abs(member.gridPos.x - targetAlly.gridPos.x), Math.abs(member.gridPos.y - targetAlly.gridPos.y));

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
      `[DIAG:HealingStaff] Enforced range: ${maxHealRange}, actual distance: ${distToTarget} between ${member.entityName} at (${member.gridPos.x},${member.gridPos.y}) and ${targetAlly.entityName} at (${targetAlly.gridPos.x},${targetAlly.gridPos.y})`
    );
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

    // State yielding lifecycle: Ensure healer state cleanly yields back to moving or idle rather than staying stuck in attacking
    const hasActivePath = member.isMoving() || (typeof member.hasActivePath === 'function' ? member.hasActivePath() : false) || member.claimedDestination !== null;
    if (hasActivePath) {
      member.state = 'moving';
    } else {
      member.state = 'idle';
    }

    return true;
  }

  public checkAndAutocastAllyHeal(member: Player, time: number): boolean {
    const selected = this.skillSystem.selectSkillForCompanion(member, 'support', time);
    if (selected) {
      return this.castSkill(member, selected.skillDef.id, selected.target, time);
    }
    return false;
  }

  public checkAndAutocastSelfBuffs(member: Player, time: number): boolean {
    if (member.state === 'dead' || member.state === 'downed') return false;
    const hasActiveThreat = member.targetEntity !== null || this.enemies.some((e) => e.isAggroed && e.state !== 'downed' && e.state !== 'dead');
    if (!hasActiveThreat) return false;

    const selected = this.skillSystem.selectSkillForCompanion(member, 'defensive', time);
    if (selected) {
      return this.castSkill(member, selected.skillDef.id, selected.target, time);
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

    // Generic Skill Engine delegation:
    // If skillDef has an effects array, execute via generic SkillSystem.
    if (skillDef.effects && skillDef.effects.length > 0) {
      return this.skillSystem.execute(caster, skillDef, target, time);
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
      } else if (skillId === 'defensive_posture') {
        const effDef = dataLoader.getStatusEffect('defensive_posture') || {
          id: 'defensive_posture',
          name: 'Defensive Posture',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 4000,
          damagePerTick: 0,
          damageReductionPercent: 0.20,
          color: '#94a3b8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'DEFENSIVE POSTURE!', '#94a3b8');
        console.log(`[Skill] ${caster.entityName} enters Defensive Posture! (20% damage reduction for 4s)`);
        return true;
      } else if (skillId === 'arbalest_brace') {
        const effDef = dataLoader.getStatusEffect('arbalest_brace') || {
          id: 'arbalest_brace',
          name: 'Arbalest Brace',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 4000,
          damagePerTick: 0,
          damageReductionPercent: 0.20,
          color: '#94a3b8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'ARBALEST BRACE!', '#94a3b8');
        console.log(`[Skill] ${caster.entityName} activates Arbalest Brace! (20% damage reduction for 4s)`);
        return true;
      } else if (skillId === 'iron_posture') {
        const effDef = dataLoader.getStatusEffect('iron_posture') || {
          id: 'iron_posture',
          name: 'Iron Posture',
          durationMs: skillDef.durationMs ?? 5000,
          tickIntervalMs: 5000,
          damagePerTick: 0,
          damageReductionPercent: 0.35,
          color: '#f59e0b'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'IRON POSTURE!', '#f59e0b');
        console.log(`[Skill] ${caster.entityName} enters Iron Posture! (35% damage reduction for 5s)`);
        return true;
      } else if (skillId === 'kenjutsu_deflection') {
        const effDef = dataLoader.getStatusEffect('kenjutsu_deflection') || {
          id: 'kenjutsu_deflection',
          name: 'Kenjutsu Deflection',
          durationMs: skillDef.durationMs ?? 6000,
          tickIntervalMs: 6000,
          damagePerTick: 0,
          shieldAmount: skillDef.shieldAmount ?? 40,
          reflectPercent: 0.50,
          color: '#e11d48'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'KENJUTSU DEFLECTION!', '#e11d48');
        console.log(`[Skill] ${caster.entityName} activates Kenjutsu Deflection! (40 shield + 50% reflect for 6s)`);
        return true;
      } else if (skillId === 'evasive_roll') {
        const effDef = dataLoader.getStatusEffect('evasive_roll') || {
          id: 'evasive_roll',
          name: 'Evasive Roll',
          durationMs: skillDef.durationMs ?? 2000,
          tickIntervalMs: 2000,
          damagePerTick: 0,
          evasionBonus: 0.5,
          color: '#38bdf8'
        };
        caster.applyStatusEffect(effDef);

        // Reposition 2 tiles away from closest enemy if possible
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        const activeEnemies = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed');
        let nearestEnemy: Enemy | null = null;
        let minDist = Infinity;
        for (const e of activeEnemies) {
          const eTile = { x: Math.floor(e.x / e.tileSize), y: Math.floor(e.y / e.tileSize) };
          const dist = Math.max(Math.abs(casterTile.x - eTile.x), Math.abs(casterTile.y - eTile.y));
          if (dist < minDist) {
            minDist = dist;
            nearestEnemy = e;
          }
        }

        if (nearestEnemy) {
          const eTile = { x: Math.floor(nearestEnemy.x / nearestEnemy.tileSize), y: Math.floor(nearestEnemy.y / nearestEnemy.tileSize) };
          const dirX = Math.sign(casterTile.x - eTile.x) || (Math.random() < 0.5 ? 1 : -1);
          const dirY = Math.sign(casterTile.y - eTile.y) || (Math.random() < 0.5 ? 1 : -1);
          const candidates = [
            { x: casterTile.x + dirX * 2, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX * 2, y: casterTile.y },
            { x: casterTile.x, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX, y: casterTile.y + dirY },
            { x: casterTile.x + dirX, y: casterTile.y },
            { x: casterTile.x, y: casterTile.y + dirY }
          ];
          for (const cand of candidates) {
            if (!this.isTileClaimedOrOccupiedByOther(cand.x, cand.y, caster)) {
              const oldX = caster.x;
              const oldY = caster.y;
              caster.setGridPosition(cand.x, cand.y);
              this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x38bdf8);
              break;
            }
          }
        }

        this.createFloatingText(caster.x, caster.y - 12, 'EVASIVE ROLL!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts Evasive Roll! (+50% Evasion for 2s)`);
        return true;
      } else if (skillId === 'vaulting_leap') {
        const effDef = dataLoader.getStatusEffect('vaulting_leap') || {
          id: 'vaulting_leap',
          name: 'Vaulting Leap',
          durationMs: skillDef.durationMs ?? 3000,
          tickIntervalMs: 3000,
          damagePerTick: 0,
          evasionBonus: 0.40,
          color: '#38bdf8'
        };
        caster.applyStatusEffect(effDef);

        // Reposition 2-3 tiles away from closest enemy using spear leverage
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        const activeEnemies = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed');
        let nearestEnemy: Enemy | null = null;
        let minDist = Infinity;
        for (const e of activeEnemies) {
          const eTile = { x: Math.floor(e.x / e.tileSize), y: Math.floor(e.y / e.tileSize) };
          const dist = Math.max(Math.abs(casterTile.x - eTile.x), Math.abs(casterTile.y - eTile.y));
          if (dist < minDist) {
            minDist = dist;
            nearestEnemy = e;
          }
        }

        if (nearestEnemy) {
          const eTile = { x: Math.floor(nearestEnemy.x / nearestEnemy.tileSize), y: Math.floor(nearestEnemy.y / nearestEnemy.tileSize) };
          const dirX = Math.sign(casterTile.x - eTile.x) || (Math.random() < 0.5 ? 1 : -1);
          const dirY = Math.sign(casterTile.y - eTile.y) || (Math.random() < 0.5 ? 1 : -1);
          const candidates = [
            { x: casterTile.x + dirX * 3, y: casterTile.y + dirY * 3 },
            { x: casterTile.x + dirX * 2, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX * 3, y: casterTile.y },
            { x: casterTile.x + dirX * 2, y: casterTile.y },
            { x: casterTile.x, y: casterTile.y + dirY * 3 },
            { x: casterTile.x, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX, y: casterTile.y + dirY }
          ];
          for (const cand of candidates) {
            if (!this.isTileClaimedOrOccupiedByOther(cand.x, cand.y, caster)) {
              const oldX = caster.x;
              const oldY = caster.y;
              caster.setGridPosition(cand.x, cand.y);
              this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x38bdf8);
              break;
            }
          }
        }

        this.createFloatingText(caster.x, caster.y - 12, 'VAULTING LEAP!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts Vaulting Leap! (+40% Evasion for 3s)`);
        return true;
      } else if (skillId === 'skirmish_step') {
        const effDef = dataLoader.getStatusEffect('skirmish_step') || {
          id: 'skirmish_step',
          name: 'Skirmish Step',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 4000,
          damagePerTick: 0,
          evasionBonus: 0.35,
          color: '#38bdf8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'SKIRMISH STEP!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} activates Skirmish Step! (+35% Evasion for 4s)`);
        caster.progression.addProficiencyExp('throwing_weapons', 1);
        caster.progression.addProficiencyExp('daggers', 1);
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
      } else if (skillId === 'mana_shield') {
        const effDef = dataLoader.getStatusEffect('mana_shield') || {
          id: 'mana_shield',
          name: 'Mana Shield',
          durationMs: skillDef.durationMs ?? 6000,
          tickIntervalMs: 6000,
          damagePerTick: 0,
          damageToEnergyPercent: skillDef.damageToEnergyPercent ?? 0.50,
          color: '#38bdf8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'MANA SHIELD!', '#38bdf8');
        console.log(`[Skill] ${caster.entityName} casts Mana Shield! Converts 50% damage to energy for 6s.`);
        return true;
      } else if (skillId === 'overcharge') {
        const effDef = dataLoader.getStatusEffect('overcharge') || {
          id: 'overcharge',
          name: 'Overcharge',
          durationMs: skillDef.durationMs ?? 10000,
          tickIntervalMs: 10000,
          damagePerTick: 0,
          spellDamageMultiplier: skillDef.spellDamageMultiplier ?? 1.75,
          spellEnergyCostMultiplier: skillDef.spellEnergyCostMultiplier ?? 1.50,
          color: '#c084fc'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'OVERCHARGE READY!', '#c084fc');
        console.log(`[Skill] ${caster.entityName} activates Overcharge! Next spell deals +75% damage.`);
        return true;
      } else if (skillId === 'blink') {
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };
        const activeEnemies = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed');
        let nearestEnemy: Enemy | null = null;
        let minDist = Infinity;
        for (const e of activeEnemies) {
          const eTile = { x: Math.floor(e.x / e.tileSize), y: Math.floor(e.y / e.tileSize) };
          const dist = Math.max(Math.abs(casterTile.x - eTile.x), Math.abs(casterTile.y - eTile.y));
          if (dist < minDist) {
            minDist = dist;
            nearestEnemy = e;
          }
        }

        const oldX = caster.x;
        const oldY = caster.y;

        if (nearestEnemy) {
          const eTile = { x: Math.floor(nearestEnemy.x / nearestEnemy.tileSize), y: Math.floor(nearestEnemy.y / nearestEnemy.tileSize) };
          const dirX = Math.sign(casterTile.x - eTile.x) || (Math.random() < 0.5 ? 1 : -1);
          const dirY = Math.sign(casterTile.y - eTile.y) || (Math.random() < 0.5 ? 1 : -1);
          const blinkDistance = skillDef.rangeTiles ?? 3;
          const candidates = [
            { x: casterTile.x + dirX * blinkDistance, y: casterTile.y + dirY * blinkDistance },
            { x: casterTile.x + dirX * blinkDistance, y: casterTile.y },
            { x: casterTile.x, y: casterTile.y + dirY * blinkDistance },
            { x: casterTile.x + dirX * 2, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX * 2, y: casterTile.y },
            { x: casterTile.x, y: casterTile.y + dirY * 2 },
            { x: casterTile.x + dirX, y: casterTile.y + dirY }
          ];
          for (const cand of candidates) {
            if (!this.isTileClaimedOrOccupiedByOther(cand.x, cand.y, caster)) {
              caster.setGridPosition(cand.x, cand.y);
              this.createArcaneBoltEffect(oldX, oldY, caster.x, caster.y);
              break;
            }
          }
        } else {
          const cand = { x: casterTile.x + 3, y: casterTile.y };
          if (!this.isTileClaimedOrOccupiedByOther(cand.x, cand.y, caster)) {
            caster.setGridPosition(cand.x, cand.y);
            this.createArcaneBoltEffect(oldX, oldY, caster.x, caster.y);
          }
        }

        this.createFloatingText(caster.x, caster.y - 12, 'BLINK!', '#c084fc');
        caster.progression.addProficiencyExp('arcane_magic', 2);
        console.log(`[Skill] ${caster.entityName} blinks to (${Math.floor(caster.x / caster.tileSize)}, ${Math.floor(caster.y / caster.tileSize)})!`);
        return true;
      } else if (skillId === 'arcane_nova') {
        const radius = skillDef.radiusTiles ?? 4;
        const casterTile = {
          x: Math.floor(caster.x / caster.tileSize),
          y: Math.floor(caster.y / caster.tileSize)
        };

        const overcharge = this.consumeOverchargeIfActive(caster, skillDef.energyCost);

        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const baseMult = skillDef.damageMultiplier ?? 2.6;
        const totalMult = baseMult * overcharge.multiplier;
        const novaDamage = Math.max(12, effBase * totalMult);

        let enemiesDamaged = 0;
        for (const enemy of this.enemies) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          const eTile = {
            x: Math.floor(enemy.x / enemy.tileSize),
            y: Math.floor(enemy.y / enemy.tileSize)
          };
          if (Math.max(Math.abs(casterTile.x - eTile.x), Math.abs(casterTile.y - eTile.y)) <= radius &&
              this.pathfinder.hasLineOfSight(casterTile, eTile)) {
            this.createSkillAttackEffect(caster.x, caster.y, enemy.x, enemy.y);
            const text = overcharge.isOvercharged
              ? `OVERCHARGED NOVA! -${novaDamage.toFixed(1)}`
              : `ARCANE NOVA! -${novaDamage.toFixed(1)}`;
            this.createFloatingText(enemy.x, enemy.y - 10, text, '#c084fc');
            const downed = enemy.takeDamage(novaDamage);
            if (downed) {
              this.handleTargetDefeated(caster, enemy, weaponId);
            }
            enemiesDamaged++;
          }
        }

        this.createArcaneNovaEffect(caster.x, caster.y, radius * caster.tileSize);
        const headerText = overcharge.isOvercharged ? 'OVERCHARGED ARCANE NOVA!' : 'ARCANE NOVA!';
        this.createFloatingText(caster.x, caster.y - 15, headerText, '#c084fc');
        caster.progression.addProficiencyExp('arcane_magic', 4);
        console.log(`[Skill] ${caster.entityName} casts Arcane Nova! Damaged ${enemiesDamaged} enemies.`);
        return true;
      } else if (skillId === 'runic_infusion') {
        const effDef = dataLoader.getStatusEffect('runic_infusion') || {
          id: 'runic_infusion',
          name: 'Runic Infusion',
          durationMs: skillDef.durationMs ?? 8000,
          tickIntervalMs: 8000,
          damagePerTick: 0,
          bonusDamagePercent: skillDef.bonusDamagePercent ?? 0.25,
          energySiphonOnHit: skillDef.energySiphonOnHit ?? 4,
          color: '#818cf8'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'RUNIC INFUSION!', '#818cf8');
        console.log(`[Skill] ${caster.entityName} activates Runic Infusion! Weapon imbued with +25% magic damage & energy siphon for 8s.`);
        caster.progression.addProficiencyExp('longswords', 2);
        caster.progression.addProficiencyExp('arcane_magic', 1);
        return true;
      } else if (skillId === 'spell_ward') {
        const effDef = dataLoader.getStatusEffect('spell_ward') || {
          id: 'spell_ward',
          name: 'Spell Ward',
          durationMs: skillDef.durationMs ?? 6000,
          tickIntervalMs: 6000,
          damagePerTick: 0,
          shieldAmount: skillDef.shieldAmount ?? 40,
          parryBonus: skillDef.parryBonus ?? 0.20,
          color: '#6366f1'
        };
        caster.applyStatusEffect(effDef);
        this.createFloatingText(caster.x, caster.y - 12, 'SPELL WARD!', '#6366f1');
        console.log(`[Skill] ${caster.entityName} activates Spell Ward! Absorbs 40 damage with +20% Parry for 6s.`);
        caster.progression.addProficiencyExp('longswords', 2);
        caster.progression.addProficiencyExp('arcane_magic', 1);
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

      // Milestone 46: Mark Target (Lv 10) - applies Expose to target
      if (skillId === 'mark_target') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Mark Target: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;

        const effDef = dataLoader.getStatusEffect('expose') || {
          id: 'expose',
          name: 'Expose',
          durationMs: skillDef.durationMs ?? 6000,
          tickIntervalMs: 6000,
          damagePerTick: 0,
          damageAmplificationPercent: 0.25,
          color: '#e11d48'
        };
        enemyTarget.applyStatusEffect(effDef);
        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'MARKED! (EXPOSED)', '#e11d48');
        console.log(`[Skill] ${caster.entityName} casts Mark Target on ${enemyTarget.entityName}! (+25% damage taken for 6s)`);
        return true;
      }

      // Milestone 46: Trap Snare (Lv 30) - places a ground trap that deals damage and Slows target
      if (skillId === 'trap_snare') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 4;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Trap Snare: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const weapon = caster.equippedWeapon;
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const skillDamage = effBase * (skillDef.damageMultiplier ?? 1.2);

        const slowDef = dataLoader.getStatusEffect('slow') || {
          id: 'slow',
          name: 'Slow',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 1000,
          damagePerTick: 0,
          moveSpeedMultiplier: 0.5,
          color: '#67e8f9'
        };
        enemyTarget.applyStatusEffect(slowDef);
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `TRAP SNARE! -${skillDamage.toFixed(1)}`, '#67e8f9');
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'SNARED! (SLOW)', '#67e8f9');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        return true;
      }

      // Milestone 46: Quickshot (Lv 1) - fast, low-cost ranged attack with cross-proficiency scaling
      if (skillId === 'quickshot') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Quickshot: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const weapon = caster.equippedWeapon;
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Cross-proficiency scaling: partner proficiency level * 0.15
        const isRangedWeapon = weapon.category === 'ranged' || weaponId === 'bows';
        const partnerProfId = isRangedWeapon ? 'daggers' : 'bows';
        const partnerLevel = caster.progression.getProficiencyLevel(partnerProfId);
        const hybridBonus = partnerLevel * 0.15;

        const skillDamage = (effBase * (skillDef.damageMultiplier ?? 1.4)) + hybridBonus;

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `QUICKSHOT! -${skillDamage.toFixed(1)}`, '#38bdf8');
        this.checkAndApplyBleed(caster, enemyTarget);
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        return true;
      }

      // Milestone 46: Kill Shot (Lv 40 capstone) - bonus damage below HP threshold (<= 40% HP) with cross-proficiency scaling
      if (skillId === 'kill_shot') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Kill Shot: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const weapon = caster.equippedWeapon;
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Cross-proficiency scaling: partner proficiency level * 0.15
        const isRangedWeapon = weapon.category === 'ranged' || weaponId === 'bows';
        const partnerProfId = isRangedWeapon ? 'daggers' : 'bows';
        const partnerLevel = caster.progression.getProficiencyLevel(partnerProfId);
        const hybridBonus = partnerLevel * 0.15;

        const maxTotalHp = enemyTarget.maxHp + enemyTarget.maxCriticalHp;
        const currentTotalHp = enemyTarget.hp + enemyTarget.criticalHp;
        const hpRatio = maxTotalHp > 0 ? currentTotalHp / maxTotalHp : 1.0;
        const executeThreshold = skillDef.executeThreshold ?? 0.4;
        const isExecute = hpRatio <= executeThreshold;
        const mult = (skillDef.damageMultiplier ?? 2.0) * (isExecute ? (skillDef.executeMultiplier ?? 2.0) : 1.0);
        const skillDamage = (effBase * mult) + hybridBonus;

        if (isExecute) {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `EXECUTE! KILL SHOT! -${skillDamage.toFixed(1)}`, '#ef4444');
        } else {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `KILL SHOT! -${skillDamage.toFixed(1)}`, '#f59e0b');
        }

        this.checkAndApplyBleed(caster, enemyTarget);
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        return true;
      }

      // ========================================================================
      // Milestone 48: Dark Knight Full 5-Skill Kit
      // Sourced directly from docs/true_grind_gdd (2).md Section 12.2
      // ========================================================================

      // Dark Knight Hybrid cross-proficiency scaling helper
      const dkWeapon = this.getEffectiveWeaponForAttack(caster);
      const dkWpnId = dkWeapon.proficiencyId ?? dkWeapon.id;
      const isDkMelee = dkWeapon.category !== 'magic' && dkWpnId !== 'dark_magic';
      const dkPartnerProfId = isDkMelee ? 'dark_magic' : 'longswords';
      const dkPartnerLevel = caster.progression.getProficiencyLevel(dkPartnerProfId);
      const dkHybridBonus = dkPartnerLevel * 0.15;

      const dkWpnLevel = caster.progression.getProficiencyLevel(dkWpnId);
      const dkDmgBonus = dkWeapon.levelBonus?.damagePerLevel ?? 0;
      const dkRawBase = dkWeapon.baseDamage + dkWpnLevel * dkDmgBonus;
      const dkMoodTier = dataLoader.getMoodTier(caster.mood);
      const dkEffBase = dkRawBase * dkMoodTier.combatDamageMultiplier;

      // 1. Rending Cut (Lv 1) - bleed-applying strike
      if (skillId === 'rending_cut') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? (dkWeapon.attackRangeTiles ?? 1);
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Rending Cut: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const skillDamage = (dkEffBase * (skillDef.damageMultiplier ?? 1.5)) + dkHybridBonus;

        const bleedDef = dataLoader.getStatusEffect('bleed') || {
          id: 'bleed',
          name: 'Bleed',
          durationMs: 6000,
          tickIntervalMs: 1000,
          damagePerTick: 3,
          isHarmful: true,
          color: '#ef4444'
        };
        enemyTarget.applyStatusEffect(bleedDef);

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `RENDING CUT! -${skillDamage.toFixed(1)}`, '#9333ea');
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLEEDING!', '#ef4444');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, dkWpnId);
        }
        return true;
      }

      // 2. Dark Pact (Lv 10) - trade a small HP cost for a burst of damage
      if (skillId === 'dark_pact') {
        const hpCost = skillDef.hpCost ?? 10;
        const totalHp = caster.hp + (caster.criticalHp ?? 0);
        if (totalHp <= hpCost) {
          console.warn(`[Skill] Cannot cast Dark Pact: insufficient HP to sacrifice (${totalHp} <= ${hpCost})`);
          return false;
        }

        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? (dkWeapon.attackRangeTiles ?? 1);
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Dark Pact: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        // Respect two-bar HP model: deduct from Main HP first, then overflow to Critical HP
        if (caster.hp >= hpCost) {
          caster.hp -= hpCost;
        } else {
          const overflow = hpCost - caster.hp;
          caster.hp = 0;
          caster.criticalHp = Math.max(1, (caster.criticalHp ?? 0) - overflow);
        }
        if (typeof caster.drawHpBar === 'function') {
          caster.drawHpBar();
        }

        this.createFloatingText(caster.x, caster.y - 12, `DARK PACT! -${hpCost} HP`, '#dc2626');
        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const skillDamage = (dkEffBase * (skillDef.damageMultiplier ?? 2.4)) + dkHybridBonus;

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `DARK PACT! -${skillDamage.toFixed(1)}`, '#581c87');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, dkWpnId);
        }
        return true;
      }

      // 3. Umbral Step (Lv 20) - short gap-closer dash that also applies Blind
      if (skillId === 'umbral_step') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Umbral Step: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        if (curDist > 1) {
          const openTile = this.findOpenAttackTileForMember(enemyTarget, caster);
          if (openTile) {
            const oldX = caster.x;
            const oldY = caster.y;
            caster.setGridPosition(openTile.x, openTile.y);
            this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x3b0764);
          }
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const skillDamage = (dkEffBase * (skillDef.damageMultiplier ?? 1.4)) + dkHybridBonus;

        const blindDef = dataLoader.getStatusEffect('blind') || {
          id: 'blind',
          name: 'Blind',
          durationMs: skillDef.durationMs ?? 4000,
          tickIntervalMs: 4000,
          damagePerTick: 0,
          accuracyReduction: 0.35,
          isHarmful: true,
          color: '#6b21a8'
        };
        enemyTarget.applyStatusEffect(blindDef);

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `UMBRAL STEP! -${skillDamage.toFixed(1)}`, '#9333ea');
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLINDED!', '#6b21a8');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, dkWpnId);
        }
        return true;
      }

      // 4. Soul Drain (Lv 30) - attack heals for a % of damage dealt (Life Steal)
      if (skillId === 'soul_drain') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? (dkWeapon.attackRangeTiles ?? 1);
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Soul Drain: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const skillDamage = (dkEffBase * (skillDef.damageMultiplier ?? 1.8)) + dkHybridBonus;

        const drainRatio = skillDef.drainPercent ?? 0.5;
        const healedAmount = Math.max(1, Math.round(skillDamage * drainRatio));
        const actualHealed = caster.heal(healedAmount);

        this.createHealEffect(caster.x, caster.y);
        this.createFloatingText(caster.x, caster.y - 12, `+${actualHealed} HP (DRAIN)`, '#22c55e');
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `SOUL DRAIN! -${skillDamage.toFixed(1)}`, '#10b981');

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, dkWpnId);
        }
        return true;
      }

      // 5. Oblivion Strike (Lv 40 capstone) - massive single-target hit, consumes bonus energy for bonus damage
      if (skillId === 'oblivion_strike') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? (dkWeapon.attackRangeTiles ?? 1);
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Oblivion Strike: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        const baseCost = skillDef.energyCost ?? 35;
        const maxBonusEnergy = skillDef.maxBonusEnergy ?? 25; // Hard cap at 25 bonus energy
        const surplusEnergy = Math.max(0, caster.energy - baseCost);
        const bonusEnergyConsumed = Math.min(maxBonusEnergy, surplusEnergy);

        caster.energy -= (baseCost + bonusEnergyConsumed);
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        const bonusPerPoint = skillDef.bonusDamagePerEnergy ?? 0.04;
        const bonusMult = bonusEnergyConsumed * bonusPerPoint;
        const totalMult = (skillDef.damageMultiplier ?? 3.0) + bonusMult;
        const skillDamage = (dkEffBase * totalMult) + dkHybridBonus;

        if (bonusEnergyConsumed > 0) {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `OBLIVION STRIKE! -${skillDamage.toFixed(1)} (+${bonusEnergyConsumed} EN)`, '#7c3aed');
        } else {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `OBLIVION STRIKE! -${skillDamage.toFixed(1)}`, '#7c3aed');
        }

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, dkWpnId);
        }
        return true;
      }

      // ========================================================================
      // Milestone 52: Swordsman, Ronin & Samurai Full 12-Offensive-Skill Kits
      // ========================================================================
      const katanaSkillIds = [
        'blade_strike', 'quick_cut', 'severing_slice', 'cross_cut',
        'iaido_quickdraw', 'crimson_slash', 'flowing_step', 'bloodseeker_riposte', 'dragons_flurry',
        'overhead_cleave', 'sweeping_hilt', 'heavenly_decapitation'
      ];
      if (katanaSkillIds.includes(skillId)) {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const wpn = this.getEffectiveWeaponForAttack(caster);
        const maxRange = skillDef.rangeTiles ?? (wpn.attackRangeTiles ?? 1);
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast ${skillDef.name}: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        const wpnProfId = wpn.proficiencyId ?? wpn.id;
        const wpnLevel = caster.progression.getProficiencyLevel(wpnProfId);
        const dmgBonus = wpn.levelBonus?.damagePerLevel ?? 0;
        const rawBase = wpn.baseDamage + wpnLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Gap-closer handling for Flowing Step
        if (skillId === 'flowing_step') {
          if (curDist > 1) {
            const openTile = this.findOpenAttackTileForMember(enemyTarget, caster);
            if (openTile) {
              const oldX = caster.x;
              const oldY = caster.y;
              caster.setGridPosition(openTile.x, openTile.y);
              this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0xe11d48);
            }
          }
        }

        // Energy handling
        let energyCostToDeduct = skillDef.energyCost;
        let bonusEnergyConsumed = 0;
        if (skillId === 'heavenly_decapitation') {
          const maxBonusEnergy = skillDef.maxBonusEnergy ?? 25;
          const surplus = Math.max(0, caster.energy - energyCostToDeduct);
          bonusEnergyConsumed = Math.min(maxBonusEnergy, surplus);
          energyCostToDeduct += bonusEnergyConsumed;
        }

        caster.energy -= energyCostToDeduct;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        let skillDamage = effBase * (skillDef.damageMultiplier ?? 1.0);

        if (skillId === 'blade_strike') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `BLADE STRIKE! -${skillDamage.toFixed(1)}`, '#94a3b8');
        } else if (skillId === 'quick_cut') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `QUICK CUT! -${skillDamage.toFixed(1)}`, '#38bdf8');
        } else if (skillId === 'severing_slice') {
          const bleedDef = dataLoader.getStatusEffect('bleed') || {
            id: 'bleed',
            name: 'Bleed',
            durationMs: 6000,
            tickIntervalMs: 1000,
            damagePerTick: 3,
            isHarmful: true,
            color: '#ef4444'
          };
          enemyTarget.applyStatusEffect(bleedDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `SEVERING SLICE! -${skillDamage.toFixed(1)}`, '#ef4444');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLEEDING!', '#ef4444');
        } else if (skillId === 'cross_cut') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `CROSS CUT! -${skillDamage.toFixed(1)}`, '#f59e0b');
        } else if (skillId === 'iaido_quickdraw') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `IAIDO QUICKDRAW! -${skillDamage.toFixed(1)}`, '#f43f5e');
        } else if (skillId === 'crimson_slash') {
          const bleedDef = dataLoader.getStatusEffect('bleed') || {
            id: 'bleed',
            name: 'Bleed',
            durationMs: 6000,
            tickIntervalMs: 1000,
            damagePerTick: 3,
            isHarmful: true,
            color: '#ef4444'
          };
          enemyTarget.applyStatusEffect(bleedDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `CRIMSON SLASH! -${skillDamage.toFixed(1)}`, '#e11d48');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLEEDING!', '#ef4444');
        } else if (skillId === 'flowing_step') {
          const flowingStepDef = dataLoader.getStatusEffect('flowing_step') || {
            id: 'flowing_step',
            name: 'Flowing Step',
            durationMs: skillDef.durationMs ?? 4000,
            tickIntervalMs: 4000,
            damagePerTick: 0,
            evasionBonus: 0.25,
            color: '#e11d48'
          };
          caster.applyStatusEffect(flowingStepDef);
          this.createFloatingText(caster.x, caster.y - 12, 'FLOWING STEP! (+25% EVASION)', '#e11d48');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `FLOWING STEP! -${skillDamage.toFixed(1)}`, '#e11d48');
        } else if (skillId === 'bloodseeker_riposte') {
          if (enemyTarget.hasStatusEffect('bleed')) {
            skillDamage *= 1.5;
            this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `BLOODSEEKER CRITICAL! -${skillDamage.toFixed(1)}`, '#be123c');
          } else {
            this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `BLOODSEEKER! -${skillDamage.toFixed(1)}`, '#be123c');
          }
        } else if (skillId === 'dragons_flurry') {
          const strikeCount = skillDef.strikeCount ?? 4;
          const dmgPerHit = effBase * (skillDef.damagePerHitMultiplier ?? 0.8);
          let totalDealt = 0;
          let downed = false;
          for (let s = 0; s < strikeCount; s++) {
            totalDealt += dmgPerHit;
            downed = enemyTarget.takeDamage(dmgPerHit);
            if (downed) break;
          }
          const bleedDef = dataLoader.getStatusEffect('bleed') || {
            id: 'bleed',
            name: 'Bleed',
            durationMs: 6000,
            tickIntervalMs: 1000,
            damagePerTick: 3,
            isHarmful: true,
            color: '#ef4444'
          };
          enemyTarget.applyStatusEffect(bleedDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `DRAGON'S FLURRY! -${totalDealt.toFixed(1)} (${strikeCount} HITS)`, '#e11d48');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLEEDING!', '#ef4444');
          if (downed) {
            this.handleTargetDefeated(caster, enemyTarget, wpnProfId);
          }
          return true;
        } else if (skillId === 'overhead_cleave') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `OVERHEAD CLEAVE! -${skillDamage.toFixed(1)}`, '#d97706');
        } else if (skillId === 'sweeping_hilt') {
          const stunChance = skillDef.stunChance ?? 0.30;
          if (Math.random() < stunChance) {
            const stunDef = dataLoader.getStatusEffect('stun') || {
              id: 'stun',
              name: 'Stun',
              durationMs: 2000,
              tickIntervalMs: 2000,
              damagePerTick: 0,
              color: '#facc15'
            };
            enemyTarget.applyStatusEffect(stunDef);
            enemyTarget.stopMovement();
            this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'STUNNED!', '#facc15');
          }
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `SWEEPING HILT! -${skillDamage.toFixed(1)}`, '#d97706');
        } else if (skillId === 'heavenly_decapitation') {
          const bonusPerPoint = skillDef.bonusDamagePerEnergy ?? 0.04;
          const bonusMult = bonusEnergyConsumed * bonusPerPoint;
          const totalMult = (skillDef.damageMultiplier ?? 3.2) + bonusMult;
          skillDamage = effBase * totalMult;
          if (bonusEnergyConsumed > 0) {
            this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `HEAVENLY DECAPITATION! -${skillDamage.toFixed(1)} (+${bonusEnergyConsumed} EN)`, '#b45309');
          } else {
            this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `HEAVENLY DECAPITATION! -${skillDamage.toFixed(1)}`, '#b45309');
          }
        }

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, wpnProfId);
        }
        return true;
      }

      // ========================================================================
      // Milestone 54: Javelin Full 5-Skill Kit
      // Hybrid archetype bridging Spears and Throwing Weapons
      // ========================================================================
      const javelinSkillIds = ['piercing_throw', 'impaling_thrust', 'pinning_spear', 'heartseeker_hurl'];
      if (javelinSkillIds.includes(skillId)) {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 4;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast ${skillDef.name}: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        const weapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Partner proficiency calculation:
        // If wielding spears (1H or 2H), partner is throwing_weapons; if wielding throwing_weapons, partner is spears
        const isSpear = weaponId === 'spears' || weapon.id === 'spears' || weapon.id === 'spears_2h';
        const partnerProfId = isSpear ? 'throwing_weapons' : 'spears';
        const partnerLevel = caster.progression.getProficiencyLevel(partnerProfId);
        const hybridBonus = partnerLevel * 0.15;

        let skillDamage = (effBase * (skillDef.damageMultiplier ?? 1.0)) + hybridBonus;

        if (skillId === 'piercing_throw') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `PIERCING THROW! -${skillDamage.toFixed(1)}`, '#38bdf8');
          this.checkAndApplyBleed(caster, enemyTarget);
        } else if (skillId === 'impaling_thrust') {
          const bleedDef = dataLoader.getStatusEffect('bleed') || {
            id: 'bleed',
            name: 'Bleed',
            durationMs: 6000,
            tickIntervalMs: 1000,
            damagePerTick: 3,
            isHarmful: true,
            color: '#ef4444'
          };
          enemyTarget.applyStatusEffect(bleedDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `IMPALING THRUST! -${skillDamage.toFixed(1)}`, '#f97316');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'BLEEDING!', '#ef4444');
        } else if (skillId === 'pinning_spear') {
          const slowDef = dataLoader.getStatusEffect('slow') || {
            id: 'slow',
            name: 'Slow',
            durationMs: skillDef.durationMs ?? 4000,
            tickIntervalMs: 1000,
            damagePerTick: 0,
            moveSpeedMultiplier: 0.5,
            color: '#67e8f9'
          };
          enemyTarget.applyStatusEffect(slowDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `PINNING SPEAR! -${skillDamage.toFixed(1)}`, '#0284c7');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'PINNED! (SLOW)', '#67e8f9');
        } else if (skillId === 'heartseeker_hurl') {
          const distBonusMult = skillDef.distanceBonusMultiplier ?? 0.10;
          const distanceMultiplier = 1.0 + (curDist * distBonusMult);
          skillDamage = (effBase * (skillDef.damageMultiplier ?? 2.8) * distanceMultiplier) + hybridBonus;
          this.createFloatingText(
            enemyTarget.x,
            enemyTarget.y - 10,
            `HEARTSEEKER HURL! -${skillDamage.toFixed(1)} (${curDist} TILES)`,
            '#dc2626'
          );
          this.checkAndApplyBleed(caster, enemyTarget);
        }

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        return true;
      }

      // ========================================================================
      // Milestone 55: Loader Full 5-Skill Kit
      // Mechanically minded shooter archetype using heavy crossbows & arbalests
      // ========================================================================
      const loaderSkillIds = ['primed_shot', 'rapid_crank', 'pinning_bolt', 'kinetic_overdraw'];
      if (loaderSkillIds.includes(skillId)) {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 4;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast ${skillDef.name}: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        const weapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        let skillDamage = effBase * (skillDef.damageMultiplier ?? 1.0);

        if (skillId === 'primed_shot') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `PRIMED SHOT! -${skillDamage.toFixed(1)}`, '#94a3b8');
        } else if (skillId === 'rapid_crank') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `RAPID CRANK! -${skillDamage.toFixed(1)}`, '#38bdf8');
        } else if (skillId === 'pinning_bolt') {
          const slowDef = dataLoader.getStatusEffect('slow') || {
            id: 'slow',
            name: 'Slow',
            durationMs: skillDef.durationMs ?? 3000,
            tickIntervalMs: 1000,
            damagePerTick: 0,
            moveSpeedMultiplier: 0.5,
            isHarmful: true,
            color: '#67e8f9'
          };
          enemyTarget.applyStatusEffect(slowDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `PINNING BOLT! -${skillDamage.toFixed(1)}`, '#f59e0b');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'SLOWED (50%)!', '#67e8f9');
          console.log(`[Skill] Pinning Bolt slowed ${enemyTarget.entityName} by 50% for 3s!`);
        } else if (skillId === 'kinetic_overdraw') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `KINETIC OVERDRAW! -${skillDamage.toFixed(1)}`, '#ef4444');
        }

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        return true;
      }

      // ========================================================================
      // Milestone 58: Arcane Initiate Full 5-Skill Kit
      // Generic caster template & first spark of raw magic
      // ========================================================================
      if (skillId === 'arcane_bolt') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 5;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Arcane Bolt: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        const overcharge = this.consumeOverchargeIfActive(caster, skillDef.energyCost);

        this.createArcaneBoltEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;
        const mult = (skillDef.damageMultiplier ?? 1.4) * overcharge.multiplier;
        const skillDamage = Math.max(8, effBase * mult);

        const floatText = overcharge.isOvercharged
          ? `OVERCHARGED BOLT! -${skillDamage.toFixed(1)}`
          : `ARCANE BOLT! -${skillDamage.toFixed(1)}`;
        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, floatText, '#c084fc');

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        caster.progression.addProficiencyExp('arcane_magic', 2);
        return true;
      }

      // ========================================================================
      // Milestone — Spellsword Full 5-Skill Kit
      // Longswords-only pure melee specialist with unconditional Arcane Magic scaling
      // ========================================================================

      // 1. Arcane Strike (Lv 1) - hybrid infused strike
      if (skillId === 'arcane_strike') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 1;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Arcane Strike: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Unconditional Arcane Magic scaling (+0.15 per Arcane Magic level)
        const arcaneLevel = caster.progression.getProficiencyLevel('arcane_magic');
        const arcaneBonus = arcaneLevel * 0.15;

        let skillDamage = (effBase * (skillDef.damageMultiplier ?? 1.5)) + arcaneBonus;

        if (caster.hasStatusEffect('runic_infusion')) {
          const runicEffect = caster.activeStatusEffects.get('runic_infusion')?.def;
          const runicBonus = runicEffect?.bonusDamagePercent ?? 0.25;
          skillDamage *= (1 + runicBonus);
          const siphon = runicEffect?.energySiphonOnHit ?? 4;
          const maxEnergy = caster.maxEnergy ?? 100;
          caster.energy = Math.min(maxEnergy, (caster.energy ?? 0) + siphon);
          this.createFloatingText(caster.x, caster.y - 20, `RUNIC SIPHON! +${siphon} EN`, '#818cf8');
        }

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `ARCANE STRIKE! -${skillDamage.toFixed(1)}`, '#818cf8');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        caster.progression.addProficiencyExp('longswords', 2);
        caster.progression.addProficiencyExp('arcane_magic', 1);
        return true;
      }

      // 4. Dimensional Lunge (Lv 30) - gap-closer teleport & thrust
      if (skillId === 'dimensional_lunge') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 4;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Dimensional Lunge: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        if (curDist > 1) {
          const openTile = this.findOpenAttackTileForMember(enemyTarget, caster);
          if (openTile) {
            const oldX = caster.x;
            const oldY = caster.y;
            caster.setGridPosition(openTile.x, openTile.y);
            this.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x818cf8);
          }
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Unconditional Arcane Magic scaling
        const arcaneLevel = caster.progression.getProficiencyLevel('arcane_magic');
        const arcaneBonus = arcaneLevel * 0.15;

        let skillDamage = (effBase * (skillDef.damageMultiplier ?? 1.9)) + arcaneBonus;

        if (caster.hasStatusEffect('runic_infusion')) {
          const runicEffect = caster.activeStatusEffects.get('runic_infusion')?.def;
          const runicBonus = runicEffect?.bonusDamagePercent ?? 0.25;
          skillDamage *= (1 + runicBonus);
          const siphon = runicEffect?.energySiphonOnHit ?? 4;
          const maxEnergy = caster.maxEnergy ?? 100;
          caster.energy = Math.min(maxEnergy, (caster.energy ?? 0) + siphon);
          this.createFloatingText(caster.x, caster.y - 20, `RUNIC SIPHON! +${siphon} EN`, '#818cf8');
        }

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `DIMENSIONAL LUNGE! -${skillDamage.toFixed(1)}`, '#818cf8');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }
        caster.progression.addProficiencyExp('longswords', 2);
        caster.progression.addProficiencyExp('arcane_magic', 1);
        return true;
      }

      // 5. Blade Beam (Lv 40 capstone) - ranged wave / cleave
      if (skillId === 'blade_beam') {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 4;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast Blade Beam: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);
        const effectiveWeapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Unconditional Arcane Magic scaling
        const arcaneLevel = caster.progression.getProficiencyLevel('arcane_magic');
        const arcaneBonus = arcaneLevel * 0.15;

        let skillDamage = (effBase * (skillDef.damageMultiplier ?? 2.6)) + arcaneBonus;

        const isInfused = caster.hasStatusEffect('runic_infusion');
        if (isInfused) {
          // Capstone synergy: refund 10 energy & +20% damage
          const maxEnergy = caster.maxEnergy ?? 100;
          caster.energy = Math.min(maxEnergy, (caster.energy ?? 0) + 10);
          skillDamage *= 1.20;
          this.createFloatingText(caster.x, caster.y - 20, 'RUNIC RESONANCE! +10 EN', '#818cf8');
        }

        this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `BLADE BEAM! -${skillDamage.toFixed(1)}`, '#818cf8');
        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }

        // Cleave adjacent enemies if Runic Infusion is active
        if (isInfused && this.enemies) {
          const cleaveDamage = skillDamage * 0.60;
          const eTile = { x: Math.floor(enemyTarget.x / enemyTarget.tileSize), y: Math.floor(enemyTarget.y / enemyTarget.tileSize) };
          for (const otherEnemy of this.enemies) {
            if (otherEnemy === enemyTarget || otherEnemy.state === 'dead' || otherEnemy.state === 'downed') continue;
            const oTile = { x: Math.floor(otherEnemy.x / otherEnemy.tileSize), y: Math.floor(otherEnemy.y / otherEnemy.tileSize) };
            if (Math.max(Math.abs(eTile.x - oTile.x), Math.abs(eTile.y - oTile.y)) <= 1) {
              this.createFloatingText(otherEnemy.x, otherEnemy.y - 10, `CLEAVE! -${cleaveDamage.toFixed(1)}`, '#818cf8');
              const oDowned = otherEnemy.takeDamage(cleaveDamage);
              if (oDowned) {
                this.handleTargetDefeated(caster, otherEnemy, weaponId);
              }
            }
          }
        }

        caster.progression.addProficiencyExp('longswords', 2);
        caster.progression.addProficiencyExp('arcane_magic', 2);
        return true;
      }

      // ========================================================================
      // Milestone — Thrower Full 5-Skill Kit
      // Hybrid archetype bridging Throwing Weapons and Daggers
      // ========================================================================
      const throwerSkillIds = ['quick_toss', 'fan_of_knives', 'crippling_volley', 'blade_barrage'];
      if (throwerSkillIds.includes(skillId)) {
        const curDist = Math.max(
          Math.abs(Math.floor(caster.x / caster.tileSize) - Math.floor(enemyTarget.x / enemyTarget.tileSize)),
          Math.abs(Math.floor(caster.y / caster.tileSize) - Math.floor(enemyTarget.y / enemyTarget.tileSize))
        );
        const maxRange = skillDef.rangeTiles ?? 3;
        if (curDist > maxRange) {
          console.warn(`[Skill] Cannot cast ${skillDef.name}: target is outside range (${curDist} > ${maxRange})`);
          return false;
        }

        caster.energy -= skillDef.energyCost;
        caster.lastSkillUseTimes.set(skillId, time);
        caster.lastAttackTime = time;
        caster.state = 'attacking';

        this.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        const weapon = this.getEffectiveWeaponForAttack(caster);
        const weaponId = weapon.proficiencyId ?? weapon.id;
        const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
        const dmgBonus = weapon.levelBonus?.damagePerLevel ?? 0;
        const rawBase = weapon.baseDamage + weaponLevel * dmgBonus;
        const moodTier = dataLoader.getMoodTier(caster.mood);
        const effBase = rawBase * moodTier.combatDamageMultiplier;

        // Partner proficiency calculation:
        // If wielding throwing_weapons, partner is daggers.
        // If wielding daggers, partner is throwing_weapons.
        // Otherwise, whichever of throwing_weapons or daggers has the higher level.
        const isThrowing = weaponId === 'throwing_weapons' || weapon.id === 'throwing_weapons';
        const isDagger = weaponId === 'daggers' || weapon.id === 'daggers';
        let partnerProfId = 'throwing_weapons';
        if (isThrowing) {
          partnerProfId = 'daggers';
        } else if (isDagger) {
          partnerProfId = 'throwing_weapons';
        } else {
          const twLvl = caster.progression.getProficiencyLevel('throwing_weapons');
          const dagLvl = caster.progression.getProficiencyLevel('daggers');
          partnerProfId = twLvl >= dagLvl ? 'daggers' : 'throwing_weapons';
        }
        const partnerLevel = caster.progression.getProficiencyLevel(partnerProfId);
        const hybridRate = skillId === 'blade_barrage' ? 0.25 : 0.15;
        const hybridBonus = partnerLevel * hybridRate;

        let skillDamage = (effBase * (skillDef.damageMultiplier ?? 1.0)) + hybridBonus;

        if (skillId === 'quick_toss') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `QUICK TOSS! -${skillDamage.toFixed(1)}`, '#38bdf8');
          this.checkAndApplyBleed(caster, enemyTarget);
        } else if (skillId === 'fan_of_knives') {
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `FAN OF KNIVES! -${skillDamage.toFixed(1)}`, '#0ea5e9');
          // Cleave adjacent enemies within 1 tile of primary target
          if (this.enemies) {
            const cleaveDamage = skillDamage * 0.50;
            const eTile = { x: Math.floor(enemyTarget.x / enemyTarget.tileSize), y: Math.floor(enemyTarget.y / enemyTarget.tileSize) };
            for (const otherEnemy of this.enemies) {
              if (otherEnemy === enemyTarget || otherEnemy.state === 'dead' || otherEnemy.state === 'downed') continue;
              const oTile = { x: Math.floor(otherEnemy.x / otherEnemy.tileSize), y: Math.floor(otherEnemy.y / otherEnemy.tileSize) };
              if (Math.max(Math.abs(eTile.x - oTile.x), Math.abs(eTile.y - oTile.y)) <= 1) {
                this.createFloatingText(otherEnemy.x, otherEnemy.y - 10, `SPLASH! -${cleaveDamage.toFixed(1)}`, '#0ea5e9');
                const oDowned = otherEnemy.takeDamage(cleaveDamage);
                if (oDowned) {
                  this.handleTargetDefeated(caster, otherEnemy, weaponId);
                }
              }
            }
          }
        } else if (skillId === 'crippling_volley') {
          const slowDef = dataLoader.getStatusEffect('slow') || {
            id: 'slow',
            name: 'Slow',
            durationMs: skillDef.durationMs ?? 4000,
            tickIntervalMs: 1000,
            damagePerTick: 0,
            moveSpeedMultiplier: 0.5,
            color: '#67e8f9'
          };
          enemyTarget.applyStatusEffect(slowDef);
          const bleedDef = dataLoader.getStatusEffect('bleed') || {
            id: 'bleed',
            name: 'Bleed',
            durationMs: 6000,
            tickIntervalMs: 1000,
            damagePerTick: 3,
            isHarmful: true,
            color: '#ef4444'
          };
          enemyTarget.applyStatusEffect(bleedDef);
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `CRIPPLING VOLLEY! -${skillDamage.toFixed(1)}`, '#0284c7');
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 25, 'SLOWED & BLEEDING!', '#ef4444');
        } else if (skillId === 'blade_barrage') {
          const hasSkirmishStep = caster.hasStatusEffect('skirmish_step');
          if (hasSkirmishStep) {
            const maxEnergy = caster.maxEnergy ?? 100;
            caster.energy = Math.min(maxEnergy, (caster.energy ?? 0) + 10);
            skillDamage *= 1.25;
            this.createFloatingText(caster.x, caster.y - 20, 'SKIRMISH MOMENTUM! +10 EN', '#38bdf8');
          }
          this.createFloatingText(enemyTarget.x, enemyTarget.y - 10, `BLADE BARRAGE! -${skillDamage.toFixed(1)}`, '#ef4444');
          this.checkAndApplyBleed(caster, enemyTarget);
        }

        const downed = enemyTarget.takeDamage(skillDamage);
        if (downed) {
          this.handleTargetDefeated(caster, enemyTarget, weaponId);
        }

        const partnerExp = skillId === 'blade_barrage' ? 2 : 1;
        const primaryProf = weaponId === 'daggers' ? 'daggers' : 'throwing_weapons';
        const partnerProf = primaryProf === 'daggers' ? 'throwing_weapons' : 'daggers';
        caster.progression.addProficiencyExp(primaryProf, 2);
        caster.progression.addProficiencyExp(partnerProf, partnerExp);
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
    this.lastCombatTimeMs = Math.max(this.lastCombatTimeMs, now);
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
    this.recordBestiaryEncounter(enemy);
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
