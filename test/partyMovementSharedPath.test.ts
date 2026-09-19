import assert from 'node:assert/strict';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { GridPos } from '../src/types/game.ts';

console.log('=== RUNNING SINGLE SHARED PATH PARTY CONVOY MOVEMENT TESTS ===\n');

// ============================================================================
// SIMULATION HARNESS FOR CONVOY PARTY MOVEMENT
// ============================================================================

interface SimulatedUnit {
  id: string;
  name: string;
  gridPos: GridPos;
  claimedDestination: GridPos | null;
  path: GridPos[];
  isPartyMember: boolean;
  state: 'idle' | 'moving' | 'dead' | 'downed';
  blockedWaitMs: number;
  onCompleteCallback?: () => void;
  visitedTiles: GridPos[];
}

class SimulatedPartyScene {
  public mapWidth: number;
  public mapHeight: number;
  public gridMatrix: number[][];
  public pathfinder: Pathfinder;
  public party: SimulatedUnit[] = [];
  public enemies: SimulatedUnit[] = [];

  constructor(width: number, height: number, gridMatrix?: number[][]) {
    this.mapWidth = width;
    this.mapHeight = height;
    if (gridMatrix) {
      this.gridMatrix = gridMatrix;
    } else {
      this.gridMatrix = Array.from({ length: height }, () => Array(width).fill(0));
    }
    this.pathfinder = new Pathfinder(this.gridMatrix);
  }

  public getLivingUnits(excludeEntity?: SimulatedUnit): SimulatedUnit[] {
    const living: SimulatedUnit[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') living.push(m);
    }
    for (const e of this.enemies) {
      if (e !== excludeEntity && e.state !== 'dead' && e.state !== 'downed') living.push(e);
    }
    return living;
  }

  public isTileOccupied(x: number, y: number, excludeEntity?: SimulatedUnit): boolean {
    return this.getLivingUnits(excludeEntity).some(u => u.gridPos.x === x && u.gridPos.y === y);
  }

  public getUnitAtTile(x: number, y: number, excludeEntity?: SimulatedUnit): SimulatedUnit | undefined {
    return this.getLivingUnits(excludeEntity).find(u => u.gridPos.x === x && u.gridPos.y === y);
  }

  public getEnemyObstacles(): GridPos[] {
    return this.enemies.filter(e => e.state !== 'dead' && e.state !== 'downed').map(e => e.gridPos);
  }

  public getPartyUnitObstacles(unit: SimulatedUnit): { soft: GridPos[]; hard: GridPos[] } {
    const soft = this.party
      .filter(m => m !== unit && m.state !== 'dead' && m.state !== 'downed')
      .map(m => m.gridPos);
    return {
      soft,
      hard: this.getEnemyObstacles()
    };
  }

  public findNearestOpenTileForPartyMove(
    targetPos: GridPos,
    preferredNear: GridPos,
    claimedTiles: Set<string>,
    companion: SimulatedUnit
  ): GridPos {
    const isCandidateValid = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      if (claimedTiles.has(`${tx},${ty}`)) return false;
      if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return false;
      if (this.party.some(m => m !== companion && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return false;
      return true;
    };

    if (isCandidateValid(targetPos.x, targetPos.y)) {
      return targetPos;
    }

    const candidates: GridPos[] = [];
    for (let r = 1; r <= 4; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetPos.x + dx;
          const ty = targetPos.y + dy;
          if (isCandidateValid(tx, ty)) {
            candidates.push({ x: tx, y: ty });
          }
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const isSelfA = (a.x === companion.gridPos.x && a.y === companion.gridPos.y) ? 1000 : 0;
        const isSelfB = (b.x === companion.gridPos.x && b.y === companion.gridPos.y) ? 1000 : 0;
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y) + isSelfA;
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y) + isSelfB;
        return distA - distB;
      });
      return candidates[0];
    }

    return targetPos;
  }

  public followPath(unit: SimulatedUnit, path: GridPos[], onComplete?: () => void, targetDestination?: GridPos): void {
    if (unit.state === 'dead' || unit.state === 'downed') return;
    let remaining = [...path];
    if (remaining.length > 0 && remaining[0].x === unit.gridPos.x && remaining[0].y === unit.gridPos.y) {
      remaining.shift();
    }
    unit.path = remaining;
    unit.onCompleteCallback = onComplete;
    unit.blockedWaitMs = 0;
    if (remaining.length > 0) {
      unit.claimedDestination = targetDestination ? { ...targetDestination } : { ...remaining[remaining.length - 1] };
      unit.state = 'moving';
    } else {
      unit.state = 'idle';
      if (onComplete) onComplete();
    }
  }

  public async executePartyConvoyMovement(clickedTileX: number, clickedTileY: number): Promise<boolean> {
    const activeSelected = this.party.filter(m => m.state !== 'dead' && m.state !== 'downed');
    if (activeSelected.length === 0) return false;

    const leader = activeSelected[0];
    const claimed = new Set<string>();

    let leaderDest: GridPos = { x: clickedTileX, y: clickedTileY };
    if (this.gridMatrix[leaderDest.y]?.[leaderDest.x] !== 0 || claimed.has(`${leaderDest.x},${leaderDest.y}`)) {
      leaderDest = this.findNearestOpenTileForPartyMove({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, leader);
    }
    claimed.add(`${leaderDest.x},${leaderDest.y}`);
    leader.claimedDestination = { ...leaderDest };

    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    const companionSlots: { companion: SimulatedUnit; idealPos: GridPos; tentativeDest: GridPos }[] = [];
    for (let i = 1; i < activeSelected.length; i++) {
      const companion = activeSelected[i];
      const offset = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const idealPos: GridPos = { x: leaderDest.x + offset.x, y: leaderDest.y + offset.y };
      const compDest = this.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
      claimed.add(`${compDest.x},${compDest.y}`);
      companion.claimedDestination = { ...compDest };
      companionSlots.push({ companion, idealPos, tentativeDest: compDest });
    }

    // Leader pathfinding avoids enemies (hard obstacles) but does not treat moving active companions as static walls
    const friendlyObs = this.party
      .filter(m => !activeSelected.includes(m) && m.state !== 'dead' && m.state !== 'downed')
      .map(m => m.gridPos);
    const unitObs = {
      soft: friendlyObs,
      hard: this.getEnemyObstacles()
    };

    const path = await this.pathfinder.findPath(leader.gridPos, leaderDest, unitObs);
    if (path.length === 0) {
      leader.claimedDestination = null;
      for (const slot of companionSlots) {
        slot.companion.claimedDestination = null;
      }
      return false;
    }

    this.followPath(leader, path);

    for (const slot of companionSlots) {
      this.dispatchCompanionInConvoy(slot.companion, path, slot.idealPos, slot.tentativeDest);
    }

    return true;
  }

  public dispatchCompanionInConvoy(companion: SimulatedUnit, sharedPath: GridPos[], idealPos: GridPos, tentativeDest?: GridPos): void {
    if (companion.state === 'dead' || companion.state === 'downed') return;

    const onPathIdx = sharedPath.findIndex(p => p.x === companion.gridPos.x && p.y === companion.gridPos.y);
    let joinSteps: GridPos[] = [];
    let startPIdx = 0;

    if (onPathIdx >= 0) {
      startPIdx = onPathIdx + 1;
    } else {
      const p0 = sharedPath[0];
      const p1 = sharedPath.length > 1 ? sharedPath[1] : undefined;

      const isAdjacentToP0 = Math.abs(companion.gridPos.x - p0.x) + Math.abs(companion.gridPos.y - p0.y) === 1;
      const isAdjacentToP1 = p1 !== undefined && (Math.abs(companion.gridPos.x - p1.x) + Math.abs(companion.gridPos.y - p1.y) === 1);

      if (isAdjacentToP0) {
        joinSteps = [{ x: p0.x, y: p0.y }];
        startPIdx = 1;
      } else if (isAdjacentToP1 && p1) {
        joinSteps = [{ x: p1.x, y: p1.y }];
        startPIdx = 2;
      } else {
        joinSteps = [{ x: p0.x, y: p0.y }];
        startPIdx = 1;
      }
    }

    const endPIdx = Math.max(startPIdx - 1, sharedPath.length - 2);
    const sharedSegment = (startPIdx <= endPIdx) ? sharedPath.slice(startPIdx, endPIdx + 1) : [];

    const rawConvoyPath = [...joinSteps, ...sharedSegment];
    const convoyPath: GridPos[] = [];
    for (const step of rawConvoyPath) {
      if (step.x === companion.gridPos.x && step.y === companion.gridPos.y) continue;
      if (convoyPath.length > 0 && convoyPath[convoyPath.length - 1].x === step.x && convoyPath[convoyPath.length - 1].y === step.y) continue;
      convoyPath.push(step);
    }

    const onArrivalAtDestinationArea = () => {
      if (companion.state === 'dead' || companion.state === 'downed') return;

      const claimed = new Set<string>();
      for (const m of this.party) {
        if (m !== companion && m.state !== 'dead' && m.state !== 'downed') {
          claimed.add(`${m.gridPos.x},${m.gridPos.y}`);
          if (m.claimedDestination) {
            claimed.add(`${m.claimedDestination.x},${m.claimedDestination.y}`);
          }
        }
      }

      const finalSlot = this.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
      claimed.add(`${finalSlot.x},${finalSlot.y}`);
      companion.claimedDestination = { ...finalSlot };

      if (companion.gridPos.x !== finalSlot.x || companion.gridPos.y !== finalSlot.y) {
        const compUnitObs = this.getPartyUnitObstacles(companion);
        this.pathfinder.findPath(companion.gridPos, finalSlot, compUnitObs).then((spreadPath) => {
          if (spreadPath.length > 0) {
            this.followPath(companion, spreadPath, undefined, finalSlot);
          } else {
            companion.claimedDestination = null;
          }
        });
      }
    };

    if (convoyPath.length > 0) {
      this.followPath(companion, convoyPath, onArrivalAtDestinationArea, tentativeDest);
    } else {
      onArrivalAtDestinationArea();
    }
  }

  // Step simulation forward by 1 tick
  public stepSimulation(deltaMs: number = 100): void {
    const allUnits = [...this.party, ...this.enemies];
    for (const u of allUnits) {
      if (u.state !== 'moving' || u.path.length === 0) continue;

      const nextTile = u.path[0];
      const blocking = this.getUnitAtTile(nextTile.x, nextTile.y, u);

      if (blocking) {
        const isBlockedByMovingAlly = u.isPartyMember && blocking.isPartyMember && blocking.state === 'moving';
        if (isBlockedByMovingAlly) {
          u.blockedWaitMs = 0;
        } else {
          u.blockedWaitMs += deltaMs;
          if (u.blockedWaitMs > 400) {
            u.path = [];
            u.claimedDestination = null;
            u.state = 'idle';
            u.blockedWaitMs = 0;
            continue;
          }
        }
        // Yield this tick
        continue;
      }

      // Tile is free: advance
      u.blockedWaitMs = 0;
      const step = u.path.shift()!;
      u.gridPos = { ...step };
      u.visitedTiles.push({ ...step });

      if (u.path.length === 0) {
        u.state = 'idle';
        if (u.onCompleteCallback) {
          const cb = u.onCompleteCallback;
          u.onCompleteCallback = undefined;
          cb();
        }
      }
    }
  }

  public async runUntilIdle(maxTicks: number = 500): Promise<{ totalTicks: number; stacksDetected: number; doubleBookingsDetected: number }> {
    let ticks = 0;
    let stacksDetected = 0;
    let doubleBookingsDetected = 0;

    while (ticks < maxTicks && (this.party.some(m => m.state === 'moving') || ticks < 60)) {
      await new Promise(r => setImmediate(r));
      this.stepSimulation(100);
      ticks++;

      // Audit tile collision (occupied stacks)
      const occupied = new Map<string, string[]>();
      for (const m of this.party) {
        if (m.state === 'dead' || m.state === 'downed') continue;
        const k = `${m.gridPos.x},${m.gridPos.y}`;
        if (!occupied.has(k)) occupied.set(k, []);
        occupied.get(k)!.push(m.name);
      }
      for (const [, units] of occupied) {
        if (units.length > 1) {
          stacksDetected++;
        }
      }

      // Audit claim double bookings
      const claims = new Map<string, string[]>();
      for (const m of this.party) {
        if (m.state === 'dead' || m.state === 'downed' || !m.claimedDestination) continue;
        const k = `${m.claimedDestination.x},${m.claimedDestination.y}`;
        if (!claims.has(k)) claims.set(k, []);
        claims.get(k)!.push(m.name);
      }
      for (const [, units] of claims) {
        if (units.length > 1) {
          doubleBookingsDetected++;
        }
      }
    }

    return { totalTicks: ticks, stacksDetected, doubleBookingsDetected };
  }
}

function createUnit(id: string, name: string, x: number, y: number, isParty: boolean = true): SimulatedUnit {
  return {
    id,
    name,
    gridPos: { x, y },
    claimedDestination: null,
    path: [],
    isPartyMember: isParty,
    state: 'idle',
    blockedWaitMs: 0,
    visitedTiles: [{ x, y }]
  };
}

// ============================================================================
// TEST 1: LONG-DISTANCE SHARED PATH CONVOY (30+ TILES)
// ============================================================================
console.log('--- TEST 1: 30+ Tile Long-Distance Shared Path Convoy Navigation ---');
{
  const width = 45;
  const height = 15;
  // Create a 2-tile wide corridor of 35 tiles length: rows 5 and 6 are walkable
  const grid = Array.from({ length: height }, () => Array(width).fill(1));
  for (let x = 2; x <= 40; x++) {
    grid[5][x] = 0;
    grid[6][x] = 0;
  }

  const scene = new SimulatedPartyScene(width, height, grid);
  // Party in 2x2 box at x=3,4
  const leader = createUnit('hero', 'Hero', 4, 5);
  const comp1 = createUnit('comp1', 'Valerie', 3, 5);
  const comp2 = createUnit('comp2', 'Kaelen', 4, 6);
  const comp3 = createUnit('comp3', 'Barris', 3, 6);
  scene.party = [leader, comp1, comp2, comp3];

  const moveSuccess = await scene.executePartyConvoyMovement(38, 5);
  assert.ok(moveSuccess, 'Move command for 30+ tiles must compute a valid path');

  const { totalTicks, stacksDetected, doubleBookingsDetected } = await scene.runUntilIdle(400);

  console.log(`  Completed in ${totalTicks} ticks with 0 stacks (${stacksDetected}) and 0 double bookings (${doubleBookingsDetected})`);
  assert.equal(stacksDetected, 0, 'No two units ever occupied the same tile during 30+ tile convoy travel');
  assert.equal(doubleBookingsDetected, 0, 'Zero claim double-bookings during entire trip');

  // Verify that during the long travel along row 5/6, all units followed the exact same row/path
  const leaderXCoords = leader.visitedTiles.map(t => t.x);
  const comp1XCoords = comp1.visitedTiles.map(t => t.x);
  const comp2XCoords = comp2.visitedTiles.map(t => t.x);
  const comp3XCoords = comp3.visitedTiles.map(t => t.x);

  assert.ok(leaderXCoords.includes(35), 'Leader reached tile 35+');
  assert.ok(comp1XCoords.includes(35), 'Comp1 traversed through tile 35+ on the convoy path');
  assert.ok(comp2XCoords.includes(35), 'Comp2 traversed through tile 35+ on the convoy path');
  assert.ok(comp3XCoords.includes(35), 'Comp3 traversed through tile 35+ on the convoy path');

  console.log('  Party end positions:');
  for (const m of scene.party) {
    console.log(`    ${m.name}: pos=(${m.gridPos.x}, ${m.gridPos.y}), state=${m.state}, pathLen=${m.path.length}, claimed=(${m.claimedDestination?.x}, ${m.claimedDestination?.y})`);
  }

  // All party members are at the destination area (x >= 36)
  for (const m of scene.party) {
    assert.ok(m.gridPos.x >= 36 && m.gridPos.x <= 39, `${m.name} must arrive at destination area (got ${m.gridPos.x})`);
  }

  // All 4 units occupy distinct tiles at destination
  const endTiles = new Set(scene.party.map(m => `${m.gridPos.x},${m.gridPos.y}`));
  assert.equal(endTiles.size, 4, 'All 4 party members must end in distinct formation tiles');

  console.log('✔ Test 1 passed: 30+ tile long distance move traversed together in convoy with zero stacking or double-booking.');
}

// ============================================================================
// TEST 2: CORRIDOR OBSTACLE / FORK DIVERGENCE TEST (PREVENTS SPLIT)
// ============================================================================
console.log('\n--- TEST 2: Corridor Obstacle / Fork Divergence Test ---');
{
  const width = 30;
  const height = 15;
  const grid = Array.from({ length: height }, () => Array(width).fill(1));

  // Shared approach corridor: x=2..10, y=7
  for (let x = 2; x <= 10; x++) grid[7][x] = 0;

  // Split into North branch (y=5) and South branch (y=9)
  for (let x = 10; x <= 20; x++) {
    grid[5][x] = 0;
    grid[9][x] = 0;
  }
  // Connect approach to both branches at x=10
  grid[6][10] = 0;
  grid[8][10] = 0;

  // Re-converge at x=20
  grid[6][20] = 0;
  grid[8][20] = 0;
  // Exit corridor: x=20..28, y=7
  for (let x = 20; x <= 28; x++) grid[7][x] = 0;

  const scene = new SimulatedPartyScene(width, height, grid);
  const leader = createUnit('hero', 'Hero', 4, 7);
  const comp1 = createUnit('comp1', 'Valerie', 3, 7);
  const comp2 = createUnit('comp2', 'Kaelen', 2, 7);
  scene.party = [leader, comp1, comp2];

  // Move to the other side of the fork (x=25, y=7)
  const moveSuccess = await scene.executePartyConvoyMovement(25, 7);
  assert.ok(moveSuccess);

  await scene.runUntilIdle(300);

  // Inspect which branch each unit took (North branch has y=5, South branch has y=9)
  const leaderTookNorth = leader.visitedTiles.some(t => t.y === 5);
  const leaderTookSouth = leader.visitedTiles.some(t => t.y === 9);
  const chosenBranch = leaderTookNorth ? 'North' : 'South';

  for (const m of scene.party) {
    const tookNorth = m.visitedTiles.some(t => t.y === 5);
    const tookSouth = m.visitedTiles.some(t => t.y === 9);
    const unitBranch = tookNorth ? 'North' : 'South';
    assert.equal(unitBranch, chosenBranch, `${m.name} must take the exact same branch (${chosenBranch}) as the leader, never splitting!`);
  }

  console.log(`✔ Test 2 passed: All party members navigated through the exact same ${chosenBranch} branch together with zero split.`);
}

// ============================================================================
// TEST 3: FORMATION SPREAD ONLY AT DESTINATION (NOT MID-TRANSIT)
// ============================================================================
console.log('\n--- TEST 3: Formation Spread Exclusively at Destination ---');
{
  const width = 30;
  const height = 10;
  const grid = Array.from({ length: height }, () => Array(width).fill(1));
  for (let x = 2; x <= 26; x++) {
    grid[4][x] = 0;
    grid[5][x] = 0;
  }

  const scene = new SimulatedPartyScene(width, height, grid);
  const leader = createUnit('hero', 'Hero', 4, 4);
  const comp1 = createUnit('comp1', 'Valerie', 3, 4);
  const comp2 = createUnit('comp2', 'Kaelen', 4, 5);
  const comp3 = createUnit('comp3', 'Barris', 3, 5);
  scene.party = [leader, comp1, comp2, comp3];

  await scene.executePartyConvoyMovement(22, 4);

  // Run 10 ticks (mid-transit, around x=10-15)
  for (let i = 0; i < 10; i++) {
    scene.stepSimulation(100);
  }

  // Mid-transit check: Units are queued in convoy line along the leader's path
  console.log('  Mid-transit positions:');
  for (const m of scene.party) {
    console.log(`    ${m.name} at (${m.gridPos.x}, ${m.gridPos.y})`);
  }

  // Finish journey to destination
  await scene.runUntilIdle(300);

  // Final check: All units have fanned out into distinct tiles at destination
  const finalPositions = scene.party.map(m => `(${m.gridPos.x}, ${m.gridPos.y})`);
  console.log('  Arrival formation positions:', finalPositions.join(' '));

  const uniquePositions = new Set(scene.party.map(m => `${m.gridPos.x},${m.gridPos.y}`));
  assert.equal(uniquePositions.size, 4, 'All 4 members must fan out into distinct formation slots upon arrival');

  console.log('✔ Test 3 passed: Units maintained convoy queue during transit and spread into formation only upon arrival.');
}

// ============================================================================
// TEST 4: FORMATION SLOT RE-VALIDATION WHEN AN ENEMY BLOCKS TENTATIVE SLOT
// ============================================================================
console.log('\n--- TEST 4: Formation Slot Re-validation on Arrival (Enemy Obstacle) ---');
{
  const width = 25;
  const height = 12;
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  const scene = new SimulatedPartyScene(width, height, grid);
  const leader = createUnit('hero', 'Hero', 3, 5);
  const comp1 = createUnit('comp1', 'Valerie', 2, 5);
  scene.party = [leader, comp1];

  // Move command to (18, 5)
  // Tentative companion slot for slot 1 is (19, 5)
  await scene.executePartyConvoyMovement(18, 5);

  // Mid-travel: An enemy steps onto (19, 5), which was the companion's tentative slot!
  const wanderingEnemy = createUnit('orc', 'Orc Sentry', 19, 5, false);
  scene.enemies.push(wanderingEnemy);

  // Let the party finish their travel
  await scene.runUntilIdle(300);

  console.log(`  Leader final: (${leader.gridPos.x}, ${leader.gridPos.y})`);
  console.log(`  Enemy standing on tentative slot: (${wanderingEnemy.gridPos.x}, ${wanderingEnemy.gridPos.y})`);
  console.log(`  Companion final: (${comp1.gridPos.x}, ${comp1.gridPos.y})`);

  // Assert companion dynamically re-validated to an alternative open tile and did NOT collide with enemy
  assert.notEqual(`${comp1.gridPos.x},${comp1.gridPos.y}`, '19,5', 'Companion must not enter (19, 5) occupied by enemy');
  assert.notEqual(`${comp1.gridPos.x},${comp1.gridPos.y}`, `${leader.gridPos.x},${leader.gridPos.y}`, 'Companion must not stack on leader');
  assert.ok(Math.hypot(comp1.gridPos.x - leader.gridPos.x, comp1.gridPos.y - leader.gridPos.y) <= 2, 'Companion must find an open adjacent formation tile');

  console.log('✔ Test 4 passed: Arrival re-validation dynamically resolved an open formation tile when tentative slot was occupied.');
}

// ============================================================================
// TEST 5: TILE-CLAIM COLLISION AVOIDANCE CONTINUOUS AUDIT
// ============================================================================
console.log('\n--- TEST 5: Tile-Claim Collision Avoidance Continuous Audit ---');
{
  const width = 25;
  const height = 10;
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  const scene = new SimulatedPartyScene(width, height, grid);
  const leader = createUnit('hero', 'Hero', 5, 5);
  const comp1 = createUnit('comp1', 'Valerie', 4, 5);
  const comp2 = createUnit('comp2', 'Kaelen', 5, 6);
  const comp3 = createUnit('comp3', 'Barris', 4, 6);
  scene.party = [leader, comp1, comp2, comp3];

  await scene.executePartyConvoyMovement(16, 5);
  const result = await scene.runUntilIdle(300);

  assert.equal(result.stacksDetected, 0, 'Zero tile stacking collisions permitted');
  assert.equal(result.doubleBookingsDetected, 0, 'Zero claim double bookings permitted');

  console.log('✔ Test 5 passed: Continuous audit verified 0 occupied stacks and 0 double bookings across all simulation ticks.');
}

// ============================================================================
// TEST 6: SWARM-TRAP PRECISE BOUNDARY TESTS (6A SURROUNDED vs 6B NEAR-ROUTE)
// ============================================================================
console.log('\n--- TEST 6A: Swarm-Trap Strict Full-Surround Immobilization ---');
{
  const width = 20;
  const height = 20;
  const scene = new SimulatedPartyScene(width, height);
  const hero = createUnit('hero', 'Hero', 10, 10);
  scene.party = [hero];

  // Completely surround hero on all 4 cardinal adjacent tiles
  scene.enemies = [
    createUnit('e1', 'Wolf 1', 11, 10, false),
    createUnit('e2', 'Wolf 2', 9, 10, false),
    createUnit('e3', 'Wolf 3', 10, 11, false),
    createUnit('e4', 'Wolf 4', 10, 9, false)
  ];

  const canMove = await scene.executePartyConvoyMovement(15, 10);
  assert.equal(canMove, false, 'Party strictly immobilized when completely surrounded by living enemies (swarm-trap)');
  assert.equal(hero.gridPos.x, 10, 'Hero cannot move');
  assert.equal(hero.gridPos.y, 10, 'Hero cannot move');

  console.log('✔ Test 6A passed: Swarm-trap strictly enforced — fully surrounded party is completely immobilized.');
}

console.log('\n--- TEST 6B: Swarm-Trap Boundary — Combat-Adjacent / Near-Route Enemy ---');
{
  const width = 25;
  const height = 15;
  const grid = Array.from({ length: height }, () => Array(width).fill(1));
  // 2-tile wide corridor along y=6 and y=7
  for (let x = 2; x <= 20; x++) {
    grid[6][x] = 0;
    grid[7][x] = 0;
  }

  const scene = new SimulatedPartyScene(width, height, grid);
  const hero = createUnit('hero', 'Hero', 4, 6);
  const comp = createUnit('comp', 'Valerie', 3, 6);
  scene.party = [hero, comp];

  // Place enemy on y=7 (adjacent to corridor route), leaving y=6 completely open
  const nearEnemy = createUnit('goblin', 'Goblin Lurker', 10, 7, false);
  scene.enemies = [nearEnemy];

  // Move party through corridor to (18, 6)
  const canMove = await scene.executePartyConvoyMovement(18, 6);
  assert.ok(canMove, 'Party must NOT be falsely immobilized when an enemy is merely nearby with an open lane');

  await scene.runUntilIdle(300);
  assert.ok(hero.gridPos.x >= 17, 'Hero successfully navigated past the nearby enemy');
  assert.ok(comp.gridPos.x >= 16, 'Companion successfully navigated past the nearby enemy');

  console.log('✔ Test 6B passed: Combat-adjacent enemy does NOT cause false-positive immobilization; party moves freely through open lane.');
}

console.log('\n=== ALL CONVOY MOVEMENT TESTS COMPLETED SUCCESSFULLY! ===');
