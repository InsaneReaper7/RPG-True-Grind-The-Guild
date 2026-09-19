import assert from 'node:assert/strict';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { GridPos } from '../src/types/game.ts';

console.log('=== RUNNING RIGID 2X2 BLOCK FORMATION PARTY MOVEMENT TESTS ===\n');

// ============================================================================
// SIMULATION HARNESS FOR RIGID 2X2 BLOCK PARTY MOVEMENT
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

class Simulated2x2PartyScene {
  public mapWidth: number;
  public mapHeight: number;
  public gridMatrix: number[][];
  public pathfinder: Pathfinder;
  public party: SimulatedUnit[] = [];
  public enemies: SimulatedUnit[] = [];
  public lastHighlightedDestinations: GridPos[] = [];

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

  public findBest2x2Anchor(
    targetPos: GridPos,
    preferredNear?: GridPos,
    claimedTiles?: Set<string>,
    excludeUnits?: SimulatedUnit[]
  ): GridPos {
    const isAnchorCandidateValid = (ax: number, ay: number): boolean => {
      if (ax <= 0 || ax + 1 >= this.mapWidth - 1 || ay <= 0 || ay + 1 >= this.mapHeight - 1) return false;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const tx = ax + dx;
          const ty = ay + dy;
          if (this.gridMatrix[ty]?.[tx] !== 0) return false;
          if (claimedTiles?.has(`${tx},${ty}`)) return false;
          if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return false;
          if (this.party.some(m => (!excludeUnits || !excludeUnits.includes(m)) && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return false;
        }
      }
      return true;
    };

    const directCandidates: GridPos[] = [
      { x: targetPos.x, y: targetPos.y },
      { x: targetPos.x - 1, y: targetPos.y },
      { x: targetPos.x, y: targetPos.y - 1 },
      { x: targetPos.x - 1, y: targetPos.y - 1 }
    ].filter(a => isAnchorCandidateValid(a.x, a.y));

    const near = preferredNear || targetPos;

    if (directCandidates.length > 0) {
      directCandidates.sort((a, b) => {
        const distA = Math.hypot(a.x - near.x, a.y - near.y);
        const distB = Math.hypot(b.x - near.x, b.y - near.y);
        return distA - distB;
      });
      return directCandidates[0];
    }

    const radialCandidates: GridPos[] = [];
    for (let r = 1; r <= 8; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ax = targetPos.x + dx;
          const ay = targetPos.y + dy;
          if (isAnchorCandidateValid(ax, ay)) {
            radialCandidates.push({ x: ax, y: ay });
          }
        }
      }
      if (radialCandidates.length > 0) break;
    }

    if (radialCandidates.length > 0) {
      radialCandidates.sort((a, b) => {
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - near.x, a.y - near.y);
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - near.x, b.y - near.y);
        return distA - distB;
      });
      return radialCandidates[0];
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

  public async executePartyBlockMovement(clickedTileX: number, clickedTileY: number): Promise<boolean> {
    const activeSelected = this.party.filter(m => m.state !== 'dead' && m.state !== 'downed');
    if (activeSelected.length === 0) return false;

    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    const leader = activeSelected[0];
    const claimed = new Set<string>();

    const destAnchor = this.findBest2x2Anchor({ x: clickedTileX, y: clickedTileY }, leader.gridPos, claimed, activeSelected);

    const destTiles: GridPos[] = [];
    for (let i = 0; i < activeSelected.length; i++) {
      const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const tile = { x: destAnchor.x + off.x, y: destAnchor.y + off.y };
      destTiles.push(tile);
      claimed.add(`${tile.x},${tile.y}`);
      activeSelected[i].claimedDestination = { ...tile };
    }

    this.lastHighlightedDestinations = destTiles.map(t => ({ ...t }));

    const friendlyObs = this.party
      .filter(m => !activeSelected.includes(m) && m.state !== 'dead' && m.state !== 'downed')
      .map(m => m.gridPos);
    const unitObs = {
      soft: friendlyObs,
      hard: this.getEnemyObstacles()
    };

    let startAnchor: GridPos = { x: leader.gridPos.x, y: leader.gridPos.y };
    if (!this.pathfinder.is2x2Walkable(startAnchor.x, startAnchor.y)) {
      startAnchor = this.findBest2x2Anchor(leader.gridPos, leader.gridPos, undefined, activeSelected);
    }

    const anchorPath = await this.pathfinder.find2x2Path(startAnchor, destAnchor, unitObs);
    if (anchorPath.length === 0) {
      for (const m of activeSelected) {
        m.claimedDestination = null;
      }
      this.lastHighlightedDestinations = [];
      return false;
    }

    for (let i = 0; i < activeSelected.length; i++) {
      const unit = activeSelected[i];
      const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const unitPath = anchorPath.map(p => ({ x: p.x + off.x, y: p.y + off.y }));

      if (unit.gridPos.x === unitPath[0].x && unit.gridPos.y === unitPath[0].y) {
        this.followPath(unit, unitPath, undefined, destTiles[i]);
      } else {
        const outOfFormationObs = {
          soft: [
            ...friendlyObs,
            ...destTiles.filter((_, idx) => idx !== i)
          ],
          hard: this.getEnemyObstacles()
        };
        const uPath = await this.pathfinder.findPath(unit.gridPos, destTiles[i], outOfFormationObs);
        if (uPath.length > 0) {
          this.followPath(unit, uPath, undefined, destTiles[i]);
        } else {
          const alignPath = await this.pathfinder.findPath(unit.gridPos, unitPath[0], outOfFormationObs);
          if (alignPath.length > 0) {
            this.followPath(unit, [...alignPath, ...unitPath.slice(1)], undefined, destTiles[i]);
          } else {
            unit.claimedDestination = null;
          }
        }
      }
    }

    return true;
  }

  // Step simulation forward by 1 tick (atomic lockstep update)
  public stepSimulation(): void {
    const allUnits = [...this.party, ...this.enemies];
    const movingUnits = allUnits.filter(u => u.state === 'moving' && u.path.length > 0);

    // Compute next step for each moving unit
    const nextSteps = new Map<SimulatedUnit, GridPos>();

    for (const u of movingUnits) {
      const nextTile = u.path[0];
      const blocking = this.getUnitAtTile(nextTile.x, nextTile.y, u);

      if (blocking) {
        const isAlliedBlockMove = u.isPartyMember &&
          blocking.isPartyMember &&
          blocking.state === 'moving' &&
          (blocking.claimedDestination === null ||
            blocking.claimedDestination.x !== u.claimedDestination?.x ||
            blocking.claimedDestination.y !== u.claimedDestination?.y);

        if (!isAlliedBlockMove) {
          u.blockedWaitMs += 100;
          if (u.blockedWaitMs > 400) {
            u.path = [];
            u.claimedDestination = null;
            u.state = 'idle';
            u.blockedWaitMs = 0;
          }
          continue;
        }
      }

      u.blockedWaitMs = 0;
      nextSteps.set(u, u.path.shift()!);
    }

    // Advance all verified units synchronously
    for (const [u, step] of nextSteps) {
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

  public async runUntilIdle(maxTicks: number = 500, onTick?: (tick: number) => void): Promise<{ totalTicks: number; stacksDetected: number; doubleBookingsDetected: number }> {
    let totalTicks = 0;
    let stacksDetected = 0;
    let doubleBookingsDetected = 0;

    while (totalTicks < maxTicks) {
      const anyMoving = this.party.some(m => m.state === 'moving' && m.path.length > 0);
      if (!anyMoving) break;

      this.stepSimulation();
      totalTicks++;

      if (onTick) onTick(totalTicks);

      // Audit stacks
      const posMap = new Map<string, number>();
      for (const m of this.party) {
        if (m.state === 'dead' || m.state === 'downed') continue;
        const key = `${m.gridPos.x},${m.gridPos.y}`;
        posMap.set(key, (posMap.get(key) || 0) + 1);
      }
      for (const [, count] of posMap) {
        if (count > 1) stacksDetected++;
      }

      // Audit double bookings
      const claimMap = new Map<string, number>();
      for (const m of this.party) {
        if (m.state === 'dead' || m.state === 'downed' || !m.claimedDestination) continue;
        const key = `${m.claimedDestination.x},${m.claimedDestination.y}`;
        claimMap.set(key, (claimMap.get(key) || 0) + 1);
      }
      for (const [, count] of claimMap) {
        if (count > 1) doubleBookingsDetected++;
      }
    }

    return { totalTicks, stacksDetected, doubleBookingsDetected };
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
  // --------------------------------------------------------------------------
  // TEST 1: 30+ Tile Long-Distance Rigid 2x2 Block Travel
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: 30+ Tile Long-Distance Rigid 2x2 Block Travel ---');
  {
    const width = 50;
    const height = 20;
    const grid = Array.from({ length: height }, () => Array(width).fill(1));
    for (let x = 1; x < 48; x++) {
      grid[4][x] = 0;
      grid[5][x] = 0;
    }

    const sim = new Simulated2x2PartyScene(width, height, grid);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 3, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 4, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 3, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 4, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    const moveOk = await sim.executePartyBlockMovement(40, 4);
    assert.ok(moveOk, '30+ tile move must succeed');

    let non2x2Ticks = 0;
    const result = await sim.runUntilIdle(500, (tick) => {
      const u0 = sim.party[0].gridPos;
      const u1 = sim.party[1].gridPos;
      const u2 = sim.party[2].gridPos;
      const u3 = sim.party[3].gridPos;

      const is2x2 =
        u1.x === u0.x + 1 && u1.y === u0.y &&
        u2.x === u0.x && u2.y === u0.y + 1 &&
        u3.x === u0.x + 1 && u3.y === u0.y + 1;

      if (!is2x2) {
        non2x2Ticks++;
      }
    });

    console.log(`  Completed in ${result.totalTicks} ticks with ${result.stacksDetected} stacks and ${result.doubleBookingsDetected} double bookings.`);
    console.log(`  Non-2x2 ticks during travel: ${non2x2Ticks}`);
    assert.equal(non2x2Ticks, 0, 'Party must maintain exact 2x2 formation block at EVERY single tick of travel');
    assert.equal(result.stacksDetected, 0, 'Must have zero occupied stacks');
    assert.equal(result.doubleBookingsDetected, 0, 'Must have zero double bookings');
    console.log('✔ Test 1 passed: 30+ tile long-distance move traversed maintaining rigid 2x2 square block at 100% of ticks.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Corridor Bend / Corner Navigation with Telemetry Table
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: 90-Degree Corridor Bend Navigation with Telemetry Table ---');
  {
    const width = 25;
    const height = 25;
    const grid = Array.from({ length: height }, () => Array(width).fill(1));

    // Horizontal corridor at y=4,5 from x=2..12
    for (let x = 2; x <= 12; x++) {
      grid[4][x] = 0;
      grid[5][x] = 0;
    }
    // Vertical corridor at x=11,12 from y=4..18
    for (let y = 4; y <= 18; y++) {
      grid[y][11] = 0;
      grid[y][12] = 0;
    }

    const sim = new Simulated2x2PartyScene(width, height, grid);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 4, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 5, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 4, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 5, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    const moveOk = await sim.executePartyBlockMovement(11, 15);
    assert.ok(moveOk, 'Move through 90-degree bend must succeed');

    const telemetry: { tick: number; u0: GridPos; u1: GridPos; u2: GridPos; u3: GridPos; dir: string }[] = [];
    telemetry.push({
      tick: 0,
      u0: { ...sim.party[0].gridPos },
      u1: { ...sim.party[1].gridPos },
      u2: { ...sim.party[2].gridPos },
      u3: { ...sim.party[3].gridPos },
      dir: 'START'
    });

    let prevPos = { ...sim.party[0].gridPos };
    const result = await sim.runUntilIdle(500, (tick) => {
      const u0 = sim.party[0].gridPos;
      const u1 = sim.party[1].gridPos;
      const u2 = sim.party[2].gridPos;
      const u3 = sim.party[3].gridPos;

      let dir = 'STEADY';
      if (u0.x > prevPos.x) dir = 'EAST';
      else if (u0.x < prevPos.x) dir = 'WEST';
      else if (u0.y > prevPos.y) dir = 'SOUTH';
      else if (u0.y < prevPos.y) dir = 'NORTH';

      telemetry.push({
        tick,
        u0: { ...u0 },
        u1: { ...u1 },
        u2: { ...u2 },
        u3: { ...u3 },
        dir
      });
      prevPos = { ...u0 };
    });

    console.log('\n  TELEMETRY LOG: CORRIDOR 90-DEGREE BEND');
    console.log('  | Tick | Hero (0,0) | Valerie (1,0) | Kaelen (0,1) | Barris (1,1) | Motion | Invariant |');
    console.log('  |------|------------|---------------|--------------|--------------|--------|-----------|');
    for (const t of telemetry) {
      const is2x2 =
        t.u1.x === t.u0.x + 1 && t.u1.y === t.u0.y &&
        t.u2.x === t.u0.x && t.u2.y === t.u0.y + 1 &&
        t.u3.x === t.u0.x + 1 && t.u3.y === t.u0.y + 1;
      const s0 = `(${t.u0.x},${t.u0.y})`.padEnd(10);
      const s1 = `(${t.u1.x},${t.u1.y})`.padEnd(13);
      const s2 = `(${t.u2.x},${t.u2.y})`.padEnd(12);
      const s3 = `(${t.u3.x},${t.u3.y})`.padEnd(12);
      console.log(`  | ${t.tick.toString().padStart(4)} | ${s0} | ${s1} | ${s2} | ${s3} | ${t.dir.padEnd(6)} | ${is2x2 ? 'RIGID 2x2' : 'FAIL'} |`);
      assert.ok(is2x2, `Tick ${t.tick} must maintain 2x2 invariant through bend`);
    }

    assert.equal(result.stacksDetected, 0, 'Zero stacks through bend');
    assert.equal(result.doubleBookingsDetected, 0, 'Zero double bookings through bend');
    console.log('\n✔ Test 2 passed: Party navigated 90-degree corridor bend without breaking 2x2 shape or getting stuck.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Exact Destination Match (100% Highlight-to-Arrival Match)
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Exact Destination Match (100% Highlight-to-Arrival Match) ---');
  {
    const width = 30;
    const height = 30;
    const sim = new Simulated2x2PartyScene(width, height);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 5, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 6, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 5, y: 6 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 6, y: 6 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    const targetClick = { x: 22, y: 18 };
    const moveOk = await sim.executePartyBlockMovement(targetClick.x, targetClick.y);
    assert.ok(moveOk, 'Move must succeed');

    const highlighted = [...sim.lastHighlightedDestinations];
    console.log('  Highlighted destination tiles:', highlighted);
    assert.equal(highlighted.length, 4, 'Must highlight exactly 4 destination tiles');

    await sim.runUntilIdle(500);

    const finalPositions = sim.party.map(m => ({ name: m.name, pos: { ...m.gridPos } }));
    console.log('  Final occupied unit positions:', finalPositions);

    for (let i = 0; i < 4; i++) {
      const h = highlighted[i];
      const m = sim.party[i];
      assert.equal(m.gridPos.x, h.x, `${m.name} must arrive EXACTLY on highlighted tile x=${h.x} (got ${m.gridPos.x})`);
      assert.equal(m.gridPos.y, h.y, `${m.name} must arrive EXACTLY on highlighted tile y=${h.y} (got ${m.gridPos.y})`);
    }

    console.log('✔ Test 3 passed: All 4 units occupy the exact highlighted destination tiles (100% exact match).\n');
  }

  // --------------------------------------------------------------------------
  // TEST 4: Swarm-Trap Strict Corridor-Blocking Enforcement
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Swarm-Trap Strict Corridor-Blocking Enforcement ---');
  {
    const width = 30;
    const height = 10;
    const grid = Array.from({ length: height }, () => Array(width).fill(1));
    for (let x = 1; x < 28; x++) {
      grid[4][x] = 0;
      grid[5][x] = 0;
    }

    const sim = new Simulated2x2PartyScene(width, height, grid);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 3, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 4, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 3, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 4, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    sim.enemies = [
      { id: 'goblin', name: 'Goblin Scout', gridPos: { x: 12, y: 4 }, claimedDestination: null, path: [], isPartyMember: false, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    const moveOk = await sim.executePartyBlockMovement(20, 4);
    assert.equal(moveOk, false, 'Party cannot bypass hostile enemy in 2-wide corridor; swarm-trap immobilizes the block');
    assert.equal(sim.party[0].state, 'idle', 'Leader remains idle');
    assert.equal(sim.party[1].state, 'idle', 'Companion remains idle');
    console.log('✔ Test 4 passed: Enemy in 2-wide corridor strictly immobilizes 2x2 block; swarm-trap invariant strictly preserved.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Tile-Claim Collision Avoidance Continuous Audit
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: Tile-Claim Collision Avoidance Continuous Audit ---');
  {
    const width = 40;
    const height = 40;
    const sim = new Simulated2x2PartyScene(width, height);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 5, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 6, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 5, y: 6 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 6, y: 6 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    await sim.executePartyBlockMovement(25, 25);
    const res1 = await sim.runUntilIdle(500);

    await sim.executePartyBlockMovement(5, 30);
    const res2 = await sim.runUntilIdle(500);

    const totalStacks = res1.stacksDetected + res2.stacksDetected;
    const totalDoubleClaims = res1.doubleBookingsDetected + res2.doubleBookingsDetected;

    console.log(`  Total stacks detected: ${totalStacks}, Total double-bookings: ${totalDoubleClaims}`);
    assert.equal(totalStacks, 0, 'Must have 0 occupied stacks across multi-leg journeys');
    assert.equal(totalDoubleClaims, 0, 'Must have 0 double bookings across multi-leg journeys');
    console.log('✔ Test 5 passed: Continuous tile-claim collision audit verified 0 stacks and 0 double bookings.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Gathering-Mode Relaxed Soft Obstacle Fallback
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Gathering-Mode Relaxed Soft Obstacle Fallback ---');
  {
    const width = 30;
    const height = 15;
    const grid = Array.from({ length: height }, () => Array(width).fill(1));
    for (let x = 1; x < 28; x++) {
      grid[4][x] = 0;
      grid[5][x] = 0;
    }

    const sim = new Simulated2x2PartyScene(width, height, grid);
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 3, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 4, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 3, y: 5 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 10, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [] }
    ];

    const unitObs = {
      soft: [{ x: 10, y: 4 }],
      hard: []
    };

    const path = await sim.pathfinder.find2x2Path({ x: 3, y: 4 }, { x: 20, y: 4 }, unitObs);
    assert.ok(path.length > 0, 'Pathfinder should relax soft obstacle to find valid path through corridor');
    console.log('✔ Test 6 passed: Soft dynamic obstacle relaxed via bottleneck fallback when no enemies are present.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Split Party Out-of-Formation Units Never Glide Through Walls
  // --------------------------------------------------------------------------
  console.log('--- TEST 7: Split Party Out-of-Formation Units Never Glide Through Walls ---');
  {
    // 40x20 map with a solid dividing wall at x=12 from y=0..19, doorway at (12, 10).
    const width = 40;
    const height = 20;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));
    for (let y = 0; y < height; y++) {
      if (y !== 10) {
        grid[y][12] = 1; // Solid wall except doorway at y=10
      }
    }

    const sim = new Simulated2x2PartyScene(width, height, grid);
    // Leader, Valerie, Kaelen are in Room B (right of wall)
    // Barris is split in Room A (left of wall at 4, 4)
    sim.party = [
      { id: 'hero', name: 'Hero', gridPos: { x: 16, y: 8 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [{ x: 16, y: 8 }] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 17, y: 8 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [{ x: 17, y: 8 }] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 16, y: 9 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [{ x: 16, y: 9 }] },
      { id: 'barris', name: 'Barris', gridPos: { x: 4, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, visitedTiles: [{ x: 4, y: 4 }] }
    ];

    // Issue group move to (30, 8) in Room B
    const moveOk = await sim.executePartyBlockMovement(30, 8);
    assert.ok(moveOk, 'Group move command must succeed');

    const result = await sim.runUntilIdle(500);
    console.log(`  Split party move completed in ${result.totalTicks} ticks.`);

    const barris = sim.party.find(p => p.id === 'barris')!;
    assert.ok(barris.visitedTiles.length > 5, 'Barris must have traversed multiple tiles');

    // Assertion 1: ZERO wall tiles visited
    for (const tile of barris.visitedTiles) {
      assert.equal(
        grid[tile.y]?.[tile.x],
        0,
        `Barris visited non-walkable tile (${tile.x}, ${tile.y})! Must NEVER glide through walls.`
      );
    }

    // Assertion 2: EVERY step transition is strictly an adjacent cardinal step (distance === 1, no teleporting or gliding)
    for (let k = 1; k < barris.visitedTiles.length; k++) {
      const prev = barris.visitedTiles[k - 1];
      const curr = barris.visitedTiles[k];
      const stepDist = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
      assert.equal(
        stepDist,
        1,
        `Step transition from (${prev.x},${prev.y}) to (${curr.x},${curr.y}) jumped ${stepDist} tiles! Must be exactly 1 cardinal step.`
      );
    }

    // Assertion 3: Barris successfully arrived at assigned destination tile
    const expectedDest = sim.lastHighlightedDestinations[3];
    assert.equal(barris.gridPos.x, expectedDest.x, `Barris arrived at destination X (${expectedDest.x})`);
    assert.equal(barris.gridPos.y, expectedDest.y, `Barris arrived at destination Y (${expectedDest.y})`);

    console.log(`  Barris traversed ${barris.visitedTiles.length} steps through doorway (12,10) with 0 wall collisions and 0 jump/glide transitions.`);
    console.log('✔ Test 7 passed: Out-of-formation split party member realistically pathfound around walls through doorway with zero wall-gliding.\n');
  }

  console.log('=== ALL RIGID 2X2 BLOCK MOVEMENT TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
