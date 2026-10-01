import assert from 'node:assert/strict';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { GridPos } from '../src/types/game.ts';

console.log('=== RUNNING PARTY MEMBER WALL-COLLISION BUGFIX VERIFICATION TESTS ===\n');

interface SimulatedEntity {
  id: string;
  name: string;
  gridPos: GridPos;
  claimedDestination: GridPos | null;
  path: GridPos[];
  isPartyMember: boolean;
  state: 'idle' | 'moving' | 'dead' | 'downed';
  blockedWaitMs: number;
  moveSpeed: number;
  visitedTiles: GridPos[];
  onCompleteCallback?: () => void;
}

class TestScene {
  public mapWidth: number;
  public mapHeight: number;
  public gridMatrix: number[][];
  public pathfinder: Pathfinder;
  public party: SimulatedEntity[] = [];
  public enemies: SimulatedEntity[] = [];

  constructor(width: number, height: number, gridMatrix: number[][]) {
    this.mapWidth = width;
    this.mapHeight = height;
    this.gridMatrix = gridMatrix;
    this.pathfinder = new Pathfinder(gridMatrix);
  }

  public getLivingUnits(exclude?: SimulatedEntity): SimulatedEntity[] {
    const list: SimulatedEntity[] = [];
    for (const p of this.party) {
      if (p !== exclude && p.state !== 'dead' && p.state !== 'downed') list.push(p);
    }
    for (const e of this.enemies) {
      if (e !== exclude && e.state !== 'dead' && e.state !== 'downed') list.push(e);
    }
    return list;
  }

  public isTileOccupied(x: number, y: number, exclude?: SimulatedEntity): boolean {
    return this.getLivingUnits(exclude).some(u => u.gridPos.x === x && u.gridPos.y === y);
  }

  public getUnitAtTile(x: number, y: number, exclude?: SimulatedEntity): SimulatedEntity | undefined {
    return this.getLivingUnits(exclude).find(u => u.gridPos.x === x && u.gridPos.y === y);
  }

  public followPath(unit: SimulatedEntity, path: GridPos[], onComplete?: () => void): void {
    if (unit.state === 'dead' || unit.state === 'downed') return;
    let remaining = [...path];
    if (remaining.length > 0 && remaining[0].x === unit.gridPos.x && remaining[0].y === unit.gridPos.y) {
      remaining.shift();
    }
    unit.path = remaining;
    unit.onCompleteCallback = onComplete;
    unit.blockedWaitMs = 0;
    if (remaining.length > 0) {
      unit.claimedDestination = { ...remaining[remaining.length - 1] };
      unit.state = 'moving';
    } else {
      unit.state = 'idle';
      if (onComplete) onComplete();
    }
  }

  // Exact step logic matching Entity.ts advanceToNextTileInPath & update
  public stepSimulation(deltaMs: number = 100): void {
    const allUnits = [...this.party, ...this.enemies];
    const movingUnits = allUnits.filter(u => u.state === 'moving' && u.path.length > 0);

    for (const u of movingUnits) {
      const nextTile = u.path[0];
      const blockingUnit = this.getUnitAtTile(nextTile.x, nextTile.y, u);

      if (blockingUnit) {
        const isAlly = u.isPartyMember && blockingUnit.isPartyMember;

        if (isAlly) {
          if (u.path.length > 1) {
            // In transit: pass through smoothly without yielding or timing out
            u.blockedWaitMs = 0;
          } else {
            // Final destination tile (u.path.length === 1)
            if (blockingUnit.state === 'moving') {
              // Ally is vacating: yield without timing out
              u.blockedWaitMs = 0;
              continue;
            } else {
              // Ally is stationary on destination: conclude arrival to preserve anti-stacking
              u.path = [];
              u.claimedDestination = null;
              u.state = 'idle';
              u.blockedWaitMs = 0;
              if (u.onCompleteCallback) {
                const cb = u.onCompleteCallback;
                u.onCompleteCallback = undefined;
                cb();
              }
              continue;
            }
          }
        } else {
          // Blocked by enemy or obstacle (Swarm-Trap rule)
          u.blockedWaitMs += deltaMs;
          if (u.blockedWaitMs > 400) {
            // Blocked too long by enemy: cancel movement
            u.path = [];
            u.claimedDestination = null;
            u.state = 'idle';
            u.blockedWaitMs = 0;
          }
          continue;
        }
      }

      // Advance
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

  public async runUntilIdle(maxTicks: number = 200): Promise<number> {
    let ticks = 0;
    while (ticks < maxTicks && (this.party.some(m => m.state === 'moving') || this.enemies.some(e => e.state === 'moving'))) {
      this.stepSimulation(100);
      ticks++;
    }
    return ticks;
  }
}

async function runAllTests() {
  // --------------------------------------------------------------------------
  // TEST 1: Single Unit Walks Past Stationary Allies in 1-Wide Corridor
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Single Unit Walks Past Stationary Allies in 1-Wide Corridor ---');
  {
    // 20x3 map: 1-wide corridor at y=1, walls at y=0 and y=2
    const width = 20;
    const height = 3;
    const grid = Array.from({ length: height }, (_, y) => Array(width).fill(y === 1 ? 0 : 1));

    const scene = new TestScene(width, height, grid);
    const hero: SimulatedEntity = {
      id: 'hero', name: 'Hero', gridPos: { x: 1, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [{ x: 1, y: 1 }]
    };
    const valerie: SimulatedEntity = {
      id: 'valerie', name: 'Valerie', gridPos: { x: 3, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [{ x: 3, y: 1 }]
    };
    const kaelen: SimulatedEntity = {
      id: 'kaelen', name: 'Kaelen', gridPos: { x: 4, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [{ x: 4, y: 1 }]
    };
    const barris: SimulatedEntity = {
      id: 'barris', name: 'Barris', gridPos: { x: 5, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [{ x: 5, y: 1 }]
    };

    scene.party = [hero, valerie, kaelen, barris];

    // Find path for Hero from (1, 1) to (8, 1) passing through Valerie, Kaelen, Barris
    // Paths ignore allies entirely
    const path = await scene.pathfinder.findPath(hero.gridPos, { x: 8, y: 1 });

    assert.ok(path.length > 0, 'Pathfinder must find direct path through 1-wide corridor even with stationary allies present');
    assert.equal(path[path.length - 1].x, 8, 'Path must end at destination x=8');

    let completed = false;
    scene.followPath(hero, path, () => { completed = true; });

    const ticks = await scene.runUntilIdle(50);
    assert.equal(completed, true, 'Hero must reach destination callback');
    assert.equal(hero.gridPos.x, 8, 'Hero must arrive at x=8');
    assert.equal(hero.gridPos.y, 1, 'Hero must arrive at y=1');
    assert.equal(hero.state, 'idle', 'Hero must be idle after arrival');

    // Stationary allies must remain unmoved
    assert.equal(valerie.gridPos.x, 3, 'Valerie should remain at x=3');
    assert.equal(kaelen.gridPos.x, 4, 'Kaelen should remain at x=4');
    assert.equal(barris.gridPos.x, 5, 'Barris should remain at x=5');

    console.log(`✔ Test 1 passed: Hero walked past 3 stationary allies in 1-wide corridor in ${ticks} ticks without blocking.\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Doorway Streaming Through 1-Tile Doorway
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: Doorway Streaming Through 1-Tile Doorway ---');
  {
    // 15x7 map: Room A (x: 0..4) and Room B (x: 6..14) separated by wall at x=5 with 1-tile door at (5, 3)
    const width = 15;
    const height = 7;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));
    for (let y = 0; y < height; y++) {
      if (y !== 3) {
        grid[y][5] = 1; // Solid wall except door at y=3
      }
    }

    const scene = new TestScene(width, height, grid);
    const units: SimulatedEntity[] = [
      { id: 'u0', name: 'Hero', gridPos: { x: 2, y: 2 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'u1', name: 'Valerie', gridPos: { x: 2, y: 3 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'u2', name: 'Kaelen', gridPos: { x: 2, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'u3', name: 'Barris', gridPos: { x: 1, y: 3 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
    ];
    scene.party = units;

    // Distinct target tiles in Room B
    const dests: GridPos[] = [
      { x: 10, y: 2 },
      { x: 11, y: 2 },
      { x: 10, y: 3 },
      { x: 11, y: 3 },
    ];

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const dest = dests[i];
      // Paths ignore allies entirely
      const path = await scene.pathfinder.findPath(u.gridPos, dest);
      assert.ok(path.length > 0, `Path must be found for ${u.name} through doorway`);
      scene.followPath(u, path);
    }

    const ticks = await scene.runUntilIdle(100);

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const expected = dests[i];
      assert.equal(u.gridPos.x, expected.x, `${u.name} must arrive at dest x=${expected.x}`);
      assert.equal(u.gridPos.y, expected.y, `${u.name} must arrive at dest y=${expected.y}`);
      assert.equal(u.state, 'idle', `${u.name} must finish idle`);
    }

    console.log(`✔ Test 2 passed: All 4 party members streamed through 1-tile door in ${ticks} ticks with 0 stuck units.\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Head-On Cross Traffic in 1-Wide Corridor
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Head-On Cross Traffic in 1-Wide Corridor ---');
  {
    // 15x3 map: 1-wide corridor at y=1
    const width = 15;
    const height = 3;
    const grid = Array.from({ length: height }, (_, y) => Array(width).fill(y === 1 ? 0 : 1));

    const scene = new TestScene(width, height, grid);
    const unitEast: SimulatedEntity = {
      id: 'east', name: 'Eastbound', gridPos: { x: 2, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    const unitWest: SimulatedEntity = {
      id: 'west', name: 'Westbound', gridPos: { x: 12, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    scene.party = [unitEast, unitWest];

    // Paths ignore allies entirely
    const pathEast = await scene.pathfinder.findPath(unitEast.gridPos, { x: 12, y: 1 });
    const pathWest = await scene.pathfinder.findPath(unitWest.gridPos, { x: 2, y: 1 });

    scene.followPath(unitEast, pathEast);
    scene.followPath(unitWest, pathWest);

    const ticks = await scene.runUntilIdle(50);
    assert.equal(unitEast.gridPos.x, 12, 'Eastbound unit must reach x=12');
    assert.equal(unitWest.gridPos.x, 2, 'Westbound unit must reach x=2');
    assert.equal(unitEast.state, 'idle');
    assert.equal(unitWest.state, 'idle');

    console.log(`✔ Test 3 passed: Head-on cross traffic passed through smoothly in ${ticks} ticks with zero deadlocks.\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Strict Swarm-Trap Enforcement Against Enemies
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Strict Swarm-Trap Enforcement Against Enemies ---');
  {
    // 15x3 map: 1-wide corridor at y=1
    const width = 15;
    const height = 3;
    const grid = Array.from({ length: height }, (_, y) => Array(width).fill(y === 1 ? 0 : 1));

    const scene = new TestScene(width, height, grid);
    const hero: SimulatedEntity = {
      id: 'hero', name: 'Hero', gridPos: { x: 2, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    const enemy: SimulatedEntity = {
      id: 'wolf', name: 'Dire Wolf', gridPos: { x: 6, y: 1 }, claimedDestination: null,
      path: [], isPartyMember: false, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    scene.party = [hero];
    scene.enemies = [enemy];

    // Try finding path through the enemy tile:
    // With enemy as hard obstacle, pathfinder must NOT find a path through (6, 1)
    const path = await scene.pathfinder.findPath(hero.gridPos, { x: 10, y: 1 }, [], [enemy.gridPos]);
    assert.equal(path.length, 0, 'Pathfinder must strictly refuse to path through living enemy in corridor');

    // If unit manually had steps leading into enemy tile:
    hero.path = [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }];
    hero.state = 'moving';
    hero.claimedDestination = { x: 7, y: 1 };

    await scene.runUntilIdle(20);

    // Hero must halt at x=5 in front of the enemy, never stepping onto x=6
    assert.equal(hero.gridPos.x, 5, 'Hero must stop at tile (5, 1) directly before enemy');
    assert.equal(hero.state, 'idle', 'Hero must cancel movement after 400ms blocked wait');
    assert.equal(hero.path.length, 0, 'Hero path must be wiped');

    console.log('✔ Test 4 passed: Living enemy strictly blocks corridor; swarm-trap invariant 100% preserved.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 5: Destination Anti-Stacking Audit (No Two Units Resting Together)
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: Destination Anti-Stacking Audit ---');
  {
    const width = 10;
    const height = 10;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));

    const scene = new TestScene(width, height, grid);
    // Two units pathing toward the same target tile (5, 5)
    const unit1: SimulatedEntity = {
      id: 'u1', name: 'Unit 1', gridPos: { x: 1, y: 5 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    const unit2: SimulatedEntity = {
      id: 'u2', name: 'Unit 2', gridPos: { x: 2, y: 5 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    scene.party = [unit1, unit2];

    const p1 = await scene.pathfinder.findPath(unit1.gridPos, { x: 5, y: 5 });
    const p2 = await scene.pathfinder.findPath(unit2.gridPos, { x: 5, y: 5 });

    scene.followPath(unit1, p1);
    scene.followPath(unit2, p2);

    await scene.runUntilIdle(50);

    // Assert that the two units are NOT on the exact same tile at rest
    const sameTile = unit1.gridPos.x === unit2.gridPos.x && unit1.gridPos.y === unit2.gridPos.y;
    assert.equal(sameTile, false, 'Two units must NEVER end up resting on the same tile!');
    assert.equal(unit1.state, 'idle');
    assert.equal(unit2.state, 'idle');

    console.log(`✔ Test 5 passed: Units concluded at distinct tiles (${unit1.gridPos.x},${unit1.gridPos.y}) and (${unit2.gridPos.x},${unit2.gridPos.y}) - zero resting stacks.\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Open Room Path Straight Through Ally Has Same Length & Shape as Empty Grid
  // --------------------------------------------------------------------------
  console.log('--- TEST 6: Open Room Path Straight Through Ally (Same Length & Shape) ---');
  {
    const width = 12;
    const height = 12;
    const emptyGrid = Array.from({ length: height }, () => Array(width).fill(0));

    const pathfinder = new Pathfinder(emptyGrid);
    const start: GridPos = { x: 2, y: 5 };
    const dest: GridPos = { x: 8, y: 5 };
    const allyPos: GridPos = { x: 5, y: 5 };

    // Path on completely empty grid
    const emptyPath = await pathfinder.findPath(start, dest);

    // Path with ally standing right in the middle at (5, 5)
    // Per the owner's rule: paths ignore allies entirely (do not pass allies to pathfinder)
    const allyPath = await pathfinder.findPath(start, dest);

    assert.equal(allyPath.length, emptyPath.length, `Path length with ally (${allyPath.length}) must equal empty grid (${emptyPath.length})`);
    for (let i = 0; i < emptyPath.length; i++) {
      assert.equal(allyPath[i].x, emptyPath[i].x, `Step ${i} x must match empty grid`);
      assert.equal(allyPath[i].y, emptyPath[i].y, `Step ${i} y must match empty grid`);
    }

    // Must be a perfectly straight line through y=5 including ally's tile at (5, 5)
    const allyTileInPath = allyPath.some(p => p.x === allyPos.x && p.y === allyPos.y);
    assert.equal(allyTileInPath, true, 'Path must traverse straight through ally tile');
    const allOnRow5 = allyPath.every(p => p.y === 5);
    assert.equal(allOnRow5, true, 'Path must be a straight horizontal line with zero sidestepping');

    console.log('✔ Test 6 passed: Member A path straight through ally B tile has identical length and straight shape as empty grid.\n');
  }

  // --------------------------------------------------------------------------
  // TEST 7: Engage on Enemy Standing Behind an Ally Gives a Direct Path
  // --------------------------------------------------------------------------
  console.log('--- TEST 7: Engage on Enemy Standing Behind Ally Gives Direct Path ---');
  {
    const width = 15;
    const height = 10;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));

    const scene = new TestScene(width, height, grid);
    const hero: SimulatedEntity = {
      id: 'hero', name: 'Hero', gridPos: { x: 1, y: 5 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    const ally: SimulatedEntity = {
      id: 'valerie', name: 'Valerie', gridPos: { x: 4, y: 5 }, claimedDestination: null,
      path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    const enemy: SimulatedEntity = {
      id: 'orc', name: 'Orc Warrior', gridPos: { x: 7, y: 5 }, claimedDestination: null,
      path: [], isPartyMember: false, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: []
    };
    scene.party = [hero, ally];
    scene.enemies = [enemy];

    // Enemy attack approach tile is adjacent to enemy at (6, 5)
    const attackTile: GridPos = { x: 6, y: 5 };

    // Finding path to attack tile (ignoring allies entirely, avoiding enemy at (7, 5))
    const path = await scene.pathfinder.findPath(hero.gridPos, attackTile, [], [enemy.gridPos]);

    assert.ok(path.length > 0, 'Direct approach path to enemy must be found');
    assert.equal(path[path.length - 1].x, attackTile.x, 'Approach path ends at attack tile');
    assert.equal(path[path.length - 1].y, attackTile.y, 'Approach path ends at attack tile');

    // Verify path goes directly through ally at (4, 5) without bending
    const traversesAlly = path.some(p => p.x === ally.gridPos.x && p.y === ally.gridPos.y);
    assert.equal(traversesAlly, true, 'Attack approach path must go straight through intervening ally');
    const straightLine = path.every(p => p.y === 5);
    assert.equal(straightLine, true, 'Attack approach path must be a direct straight line');

    let engaged = false;
    scene.followPath(hero, path, () => {
      // Arrived adjacent to enemy
      if (Math.hypot(hero.gridPos.x - enemy.gridPos.x, hero.gridPos.y - enemy.gridPos.y) <= 1.5) {
        engaged = true;
      }
    });

    const ticks = await scene.runUntilIdle(30);
    assert.equal(engaged, true, 'Hero must arrive adjacent to enemy and engage');
    assert.equal(hero.gridPos.x, 6, 'Hero arrived at attack position (6, 5)');
    assert.equal(hero.gridPos.y, 5, 'Hero arrived at attack position (6, 5)');
    assert.equal(ally.gridPos.x, 4, 'Ally Valerie remained in place at (4, 5)');

    console.log(`✔ Test 7 passed: Engage on enemy behind ally gave direct path and engaged in ${ticks} ticks.\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 8: 2x2 Formation Goes Through 1-Wide Door & Arrives in Formation With No Stacking
  // --------------------------------------------------------------------------
  console.log('--- TEST 8: 2x2 Formation Through 1-Wide Door (Arrives in Formation, No Stacking) ---');
  {
    // 20x10 map: Room A (x: 0..5), Wall at x=6 with 1-tile door at (6, 4), Room B (x: 7..19)
    const width = 20;
    const height = 10;
    const grid = Array.from({ length: height }, () => Array(width).fill(0));
    for (let y = 0; y < height; y++) {
      if (y !== 4) {
        grid[y][6] = 1; // Solid wall except 1-tile doorway at y=4
      }
    }

    const scene = new TestScene(width, height, grid);

    // Initial 2x2 formation at anchor (2, 3) in Room A
    // Offsets: (0,0), (1,0), (0,1), (1,1)
    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    const units: SimulatedEntity[] = [
      { id: 'hero', name: 'Hero', gridPos: { x: 2, y: 3 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'valerie', name: 'Valerie', gridPos: { x: 3, y: 3 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'kaelen', name: 'Kaelen', gridPos: { x: 2, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] },
      { id: 'barris', name: 'Barris', gridPos: { x: 3, y: 4 }, claimedDestination: null, path: [], isPartyMember: true, state: 'idle', blockedWaitMs: 0, moveSpeed: 100, visitedTiles: [] }
    ];
    scene.party = units;

    // Target 2x2 anchor in Room B at (12, 3)
    const destAnchor: GridPos = { x: 12, y: 3 };
    const destTiles: GridPos[] = formationOffsets.map(off => ({
      x: destAnchor.x + off.x,
      y: destAnchor.y + off.y
    }));

    // Verify 2x2 path fails because of 1-tile door (width < 2), activating 1x1 compression fallback
    const startAnchor: GridPos = { x: 2, y: 3 };
    const anchorPath = await scene.pathfinder.find2x2Path(startAnchor, destAnchor);
    assert.equal(anchorPath.length, 0, '2x2 anchor path must be blocked by 1-tile door');

    // 1x1 compression fallback paths each unit to their formation slot (paths ignore allies entirely)
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const targetTile = destTiles[i];
      const uPath = await scene.pathfinder.findPath(u.gridPos, targetTile);
      assert.ok(uPath.length > 0, `1x1 fallback path must be found for ${u.name} through 1-tile door`);
      scene.followPath(u, uPath);
    }

    let ticks = 0;
    const maxTicks = 150;
    while (ticks < maxTicks && units.some(m => m.state === 'moving')) {
      scene.stepSimulation(100);
      ticks++;
    }

    // Verify all units have finished moving
    for (const u of units) {
      assert.equal(u.state, 'idle', `${u.name} must finish movement and be idle`);
    }

    // Verify all units arrived at their exact formation destination tiles in Room B
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const expected = destTiles[i];
      assert.equal(u.gridPos.x, expected.x, `${u.name} arrived at formation tile x=${expected.x}`);
      assert.equal(u.gridPos.y, expected.y, `${u.name} arrived at formation tile y=${expected.y}`);
    }

    // Audit no two units resting on the same tile
    const restingTiles = new Set(units.map(u => `${u.gridPos.x},${u.gridPos.y}`));
    assert.equal(restingTiles.size, 4, 'All 4 units must rest on distinct tiles in formation (zero resting stacks)');

    console.log(`✔ Test 8 passed: 2x2 formation streamed through 1-tile door and arrived in formation in ${ticks} ticks with zero stacking.\n`);
  }

  console.log('=== ALL PARTY MEMBER WALL-COLLISION BUGFIX TESTS PASSED SUCCESSFULLY! ===');
}

runAllTests();
