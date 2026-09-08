import assert from 'node:assert/strict';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { GridPos } from '../src/types/game.ts';

console.log('--- RUNNING FULL-GROUP ENGAGE & POST-COMBAT HOLD POSITION TESTS ---');

interface MockUnit {
  id: string;
  entityName: string;
  gridPos: GridPos;
  attackRangeTiles: number;
  state: 'idle' | 'moving' | 'attacking' | 'downed' | 'dead';
  targetEntity: MockUnit | null;
  claimedDestination: GridPos | null;
  lastCombatRepathTimeMs: number;
  combatRepathIntervalMs: number;
  path: GridPos[];
  isMoving: () => boolean;
  stopMovement: () => void;
  followPath: (path: GridPos[]) => void;
  setTarget: (target: MockUnit | null) => void;
  clearTarget: () => void;
}

function createMockUnit(
  id: string,
  name: string,
  x: number,
  y: number,
  attackRangeTiles: number = 1
): MockUnit {
  const unit: MockUnit = {
    id,
    entityName: name,
    gridPos: { x, y },
    attackRangeTiles,
    state: 'idle',
    targetEntity: null,
    claimedDestination: null,
    lastCombatRepathTimeMs: 0,
    combatRepathIntervalMs: 400,
    path: [],
    isMoving() {
      return this.state === 'moving' && this.path.length > 0;
    },
    stopMovement() {
      this.path = [];
      this.claimedDestination = null;
      if (this.state === 'moving') {
        this.state = 'idle';
      }
    },
    followPath(newPath: GridPos[]) {
      this.path = [...newPath];
      this.state = 'moving';
    },
    setTarget(target: MockUnit | null) {
      this.targetEntity = target;
    },
    clearTarget() {
      const hadTarget = this.targetEntity !== null;
      this.targetEntity = null;
      if (hadTarget) {
        this.stopMovement();
      }
    }
  };
  return unit;
}

class MockCombatScene {
  public mapWidth: number = 30;
  public mapHeight: number = 30;
  public gridMatrix: number[][] = [];
  public pathfinder: Pathfinder;
  public party: MockUnit[] = [];
  public enemies: MockUnit[] = [];
  public timeNow: number = 1000;

  constructor() {
    this.gridMatrix = [];
    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        if (x === 0 || x === this.mapWidth - 1 || y === 0 || y === this.mapHeight - 1) {
          row.push(1);
        } else {
          row.push(0);
        }
      }
      this.gridMatrix.push(row);
    }
    this.pathfinder = new Pathfinder(this.gridMatrix);
  }

  public isTileOccupied(x: number, y: number, excludeEntity?: MockUnit): boolean {
    const all = [...this.party, ...this.enemies];
    return all.some(
      (u) => u !== excludeEntity && u.state !== 'dead' && u.state !== 'downed' && u.gridPos.x === x && u.gridPos.y === y
    );
  }

  public isTileClaimed(x: number, y: number, excludeEntity?: MockUnit): boolean {
    const all = [...this.party, ...this.enemies];
    return all.some(
      (u) => u !== excludeEntity && u.state !== 'dead' && u.state !== 'downed' &&
        u.claimedDestination !== null && u.claimedDestination.x === x && u.claimedDestination.y === y
    );
  }

  public findOpenAttackTileForMember(
    enemy: MockUnit,
    member: MockUnit,
    claimedKeys: Set<string>
  ): GridPos {
    const range = member.attackRangeTiles || 1;
    const candidates: GridPos[] = [];

    const isTileOpenForAttack = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      const key = `${tx},${ty}`;
      if (claimedKeys.has(key)) return false;
      if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) {
        return false;
      }
      if (this.party.some(m => m !== member && m.state !== 'dead' && m.state !== 'downed' && m.gridPos.x === tx && m.gridPos.y === ty && !m.isMoving())) {
        return false;
      }
      return true;
    };

    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
        const tx = enemy.gridPos.x + dx;
        const ty = enemy.gridPos.y + dy;
        if (isTileOpenForAttack(tx, ty)) {
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

    // Fallback concentric rings
    for (let r = range + 1; r <= range + 3; r++) {
      const fallbackCandidates: GridPos[] = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = enemy.gridPos.x + dx;
          const ty = enemy.gridPos.y + dy;
          if (isTileOpenForAttack(tx, ty)) {
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

    return enemy.gridPos;
  }

  public engageEnemy(enemy: MockUnit): { assignments: Map<MockUnit, GridPos>; commandedToMove: MockUnit[] } {
    if (enemy.state === 'dead' || enemy.state === 'downed') return { assignments: new Map(), commandedToMove: [] };

    const tileOwner = new Map<string, MockUnit>();
    const memberDest = new Map<MockUnit, GridPos>();
    const commandedToMove: MockUnit[] = [];

    const livingMembers = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');

    // Pass 1: Strictly evaluate members that can CURRENTLY land an attack from their exact current tile
    for (const member of livingMembers) {
      member.setTarget(enemy);
      const dx = Math.abs(member.gridPos.x - enemy.gridPos.x);
      const dy = Math.abs(member.gridPos.y - enemy.gridPos.y);
      const currentDist = Math.max(dx, dy);

      const canAttackNow = currentDist <= member.attackRangeTiles && currentDist > 0;
      const key = `${member.gridPos.x},${member.gridPos.y}`;

      if (canAttackNow && !tileOwner.has(key)) {
        tileOwner.set(key, member);
        memberDest.set(member, { ...member.gridPos });
        member.claimedDestination = null;
        if (member.isMoving()) {
          member.stopMovement();
        }
      }
    }

    // Pass 2: Assign distinct reachable tiles within attackRangeTiles to all unassigned members
    const unassigned = livingMembers.filter(m => !memberDest.has(m));
    unassigned.sort((a, b) => {
      const distA = Math.hypot(a.gridPos.x - enemy.gridPos.x, a.gridPos.y - enemy.gridPos.y);
      const distB = Math.hypot(b.gridPos.x - enemy.gridPos.x, b.gridPos.y - enemy.gridPos.y);
      return distA - distB;
    });

    const claimedKeys = new Set<string>(tileOwner.keys());
    for (const member of unassigned) {
      const targetTile = this.findOpenAttackTileForMember(enemy, member, claimedKeys);
      const key = `${targetTile.x},${targetTile.y}`;
      claimedKeys.add(key);
      tileOwner.set(key, member);
      memberDest.set(member, targetTile);
    }

    // Pass 3: Execute movement for members that need to travel to attack range
    for (const member of livingMembers) {
      const dest = memberDest.get(member);
      if (!dest) continue;

      if (member.gridPos.x === dest.x && member.gridPos.y === dest.y) {
        if (member.isMoving()) {
          member.stopMovement();
        }
        member.claimedDestination = null;
        continue;
      }

      member.claimedDestination = { ...dest };
      member.state = 'moving';
      commandedToMove.push(member);
      member.followPath([dest]);
    }

    return { assignments: memberDest, commandedToMove };
  }

  public handleEnemyDefeated(enemy: MockUnit): void {
    for (const member of this.party) {
      if (member.targetEntity === enemy) {
        member.clearTarget();
      }
    }
  }

  public clickToMove(targetTile: GridPos): void {
    for (const member of this.party) {
      member.clearTarget();
    }

    const claimed = new Set<string>();
    const leader = this.party[0];
    leader.claimedDestination = { ...targetTile };
    claimed.add(`${targetTile.x},${targetTile.y}`);
    leader.followPath([targetTile]);

    const formationOffsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ];

    for (let i = 1; i < this.party.length; i++) {
      const comp = this.party[i];
      if (comp.state === 'downed' || comp.state === 'dead') continue;
      const off = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
      const idealPos = { x: targetTile.x + off.x, y: targetTile.y + off.y };
      comp.claimedDestination = { ...idealPos };
      claimed.add(`${idealPos.x},${idealPos.y}`);
      comp.followPath([idealPos]);
    }
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
  // Test 1: Full-Group Engage with 4-Member Party Spread Out (Distances 1, 2, 3, 2)
  {
    const scene = new MockCombatScene();
    const enemy = createMockUnit('wolf', 'Dire Wolf', 10, 10);
    scene.enemies.push(enemy);

    // Leader at (11, 10) -> distance = 1 (can attack right now)
    const leader = createMockUnit('p0', 'Leader', 11, 10, 1);
    // Companion 1 at (12, 10) -> distance = 2 (outside range 1!)
    const comp1 = createMockUnit('p1', 'Valerie', 12, 10, 1);
    // Companion 2 at (13, 10) -> distance = 3 (outside range 1!)
    const comp2 = createMockUnit('p2', 'Kaelen', 13, 10, 1);
    // Companion 3 at (11, 12) -> distance = 2 (outside range 1!)
    const comp3 = createMockUnit('p3', 'Barris', 11, 12, 1);

    scene.party = [leader, comp1, comp2, comp3];

    const result = scene.engageEnemy(enemy);

    // Leader was already at distance 1: holds tile (11, 10), NOT commanded to move
    assert.equal(result.commandedToMove.includes(leader), false, 'Leader at distance 1 should hold position and not move');
    assert.deepEqual(result.assignments.get(leader), { x: 11, y: 10 }, 'Leader assigned their current tile');

    // All 3 companions (at distances 2, 3, 2) MUST be commanded to move!
    assert.equal(result.commandedToMove.includes(comp1), true, 'Comp1 (dist 2) must be commanded to move');
    assert.equal(result.commandedToMove.includes(comp2), true, 'Comp2 (dist 3) must be commanded to move');
    assert.equal(result.commandedToMove.includes(comp3), true, 'Comp3 (dist 2) must be commanded to move');

    // Verify all 4 members have distinct destinations (Zero Stacking!)
    const dests = Array.from(result.assignments.values());
    const destKeys = new Set(dests.map(d => `${d.x},${d.y}`));
    assert.equal(destKeys.size, 4, 'All 4 party members must have distinct, unshared destinations');

    // Verify all 4 destinations are strictly within attackRangeTiles (Chebyshev distance <= 1)
    for (const [member, dest] of result.assignments.entries()) {
      const dist = Math.max(Math.abs(dest.x - enemy.gridPos.x), Math.abs(dest.y - enemy.gridPos.y));
      assert.equal(dist <= member.attackRangeTiles, true, `${member.entityName} destination (${dest.x}, ${dest.y}) must be within attack range (Chebyshev distance ${dist} <= ${member.attackRangeTiles})`);
      assert.equal(dist > 0, true, `${member.entityName} destination cannot be the enemy's tile`);
    }

    console.log('✔ Test 1 passed: Full-group engage with spread formation (dist 1, 2, 3, 2) successfully commands all distant members into attack range with zero stacking');
  }

  // Test 2: Attack Tile Range Constraint
  {
    const scene = new MockCombatScene();
    const enemy = createMockUnit('wolf', 'Dire Wolf', 15, 15);
    const memberMelee = createMockUnit('melee', 'Fighter', 20, 15, 1); // Range 1
    const claimed = new Set<string>();

    const attackTile = scene.findOpenAttackTileForMember(enemy, memberMelee, claimed);
    const dist = Math.max(Math.abs(attackTile.x - enemy.gridPos.x), Math.abs(attackTile.y - enemy.gridPos.y));
    assert.equal(dist, 1, 'Melee unit (range 1) must be assigned a tile exactly 1 tile away from enemy');

    // Ranged unit (range 3)
    const memberRanged = createMockUnit('ranger', 'Archer', 20, 15, 3); // Range 3
    const attackTileRanged = scene.findOpenAttackTileForMember(enemy, memberRanged, claimed);
    const distRanged = Math.max(Math.abs(attackTileRanged.x - enemy.gridPos.x), Math.abs(attackTileRanged.y - enemy.gridPos.y));
    assert.equal(distRanged <= 3 && distRanged > 0, true, 'Ranged unit (range 3) must be assigned a tile within range 3');

    console.log('✔ Test 2 passed: findOpenAttackTileForMember strictly bounds candidate tiles to member.attackRangeTiles');
  }

  // Test 3: Hold Combat Positions After Enemy Defeat (No Auto-Reform)
  {
    const scene = new MockCombatScene();
    const enemy = createMockUnit('wolf', 'Dire Wolf', 10, 10);
    scene.enemies.push(enemy);

    // Simulate 4 party members surrounding the wolf at distinct tiles
    const p0 = createMockUnit('p0', 'Leader', 9, 10); // West
    const p1 = createMockUnit('p1', 'Valerie', 11, 10); // East
    const p2 = createMockUnit('p2', 'Kaelen', 10, 9); // North
    const p3 = createMockUnit('p3', 'Barris', 10, 11); // South
    scene.party = [p0, p1, p2, p3];

    for (const m of scene.party) {
      m.setTarget(enemy);
      m.state = 'attacking';
    }

    // Wolf is defeated
    enemy.state = 'dead';
    scene.handleEnemyDefeated(enemy);

    // Verify all party members hold their exact combat positions
    assert.deepEqual(p0.gridPos, { x: 9, y: 10 }, 'Leader holds West combat tile');
    assert.deepEqual(p1.gridPos, { x: 11, y: 10 }, 'Valerie holds East combat tile');
    assert.deepEqual(p2.gridPos, { x: 10, y: 9 }, 'Kaelen holds North combat tile');
    assert.deepEqual(p3.gridPos, { x: 10, y: 11 }, 'Barris holds South combat tile');

    // Verify states are idle, paths are empty, targets are cleared
    for (const m of scene.party) {
      assert.equal(m.targetEntity, null, `${m.entityName} target must be cleared`);
      assert.equal(m.isMoving(), false, `${m.entityName} must not be moving`);
      assert.equal(m.claimedDestination, null, `${m.entityName} must not have claimed destination`);
    }

    console.log('✔ Test 3 passed: Party holds exact combat positions upon enemy defeat without automatic re-formation');
  }

  // Test 4: Subsequent Click-to-Move Resumes 2x2 Formation from Disparate Positions
  {
    const scene = new MockCombatScene();
    // Party starts at their disparate post-combat tiles
    const p0 = createMockUnit('p0', 'Leader', 9, 10);
    const p1 = createMockUnit('p1', 'Valerie', 11, 10);
    const p2 = createMockUnit('p2', 'Kaelen', 10, 9);
    const p3 = createMockUnit('p3', 'Barris', 10, 11);
    scene.party = [p0, p1, p2, p3];

    // Player clicks to move to (20, 20)
    scene.clickToMove({ x: 20, y: 20 });

    // Verify 2x2 box formation targets:
    // Slot 0 (Leader): (20, 20)
    // Slot 1: (21, 20)
    // Slot 2: (20, 21)
    // Slot 3: (21, 21)
    assert.deepEqual(p0.claimedDestination, { x: 20, y: 20 }, 'Leader moves to clicked tile (20, 20)');
    assert.deepEqual(p1.claimedDestination, { x: 21, y: 20 }, 'Comp1 takes formation slot 1 (21, 20)');
    assert.deepEqual(p2.claimedDestination, { x: 20, y: 21 }, 'Comp2 takes formation slot 2 (20, 21)');
    assert.deepEqual(p3.claimedDestination, { x: 21, y: 21 }, 'Comp3 takes formation slot 3 (21, 21)');

    for (const m of scene.party) {
      assert.equal(m.state, 'moving', `${m.entityName} state is moving toward formation slot`);
      assert.equal(m.path.length > 0, true, `${m.entityName} has path`);
    }

    console.log('✔ Test 4 passed: Subsequent click-to-move resumes 2x2 box formation normally from disparate combat positions');
  }

  console.log('\nALL 4 ENGAGE & HOLD POSITION TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
