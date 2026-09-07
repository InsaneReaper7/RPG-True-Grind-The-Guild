import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { BuildingSystem } from '../src/systems/BuildingSystem.ts';
import { RoomClassifier } from '../src/systems/RoomClassifier.ts';
import type { ClassifiedRoom } from '../src/systems/RoomClassifier.ts';
import type { GridPos, RoomRuleDef, BuildableDef } from '../src/types/game.ts';

console.log('--- RUNNING PATHFINDING, TILE-STACKING & OUTPOST ROOM CLASSIFICATION TESTS ---');

// ============================================================================
// HELPERS & MOCK ENVIRONMENT
// ============================================================================

interface MockPlayer {
  id: string;
  entityName: string;
  gridPos: GridPos;
  currentRoom: ClassifiedRoom | null;
  currentRoomName: string | null;
  state: 'idle' | 'moving' | 'downed' | 'dead';
}

function createMockPlayer(id: string, name: string, x: number, y: number): MockPlayer {
  return {
    id,
    entityName: name,
    gridPos: { x, y },
    currentRoom: null,
    currentRoomName: null,
    state: 'idle'
  };
}

class MockOutpostScene {
  public mapWidth: number = 20;
  public mapHeight: number = 20;
  public gridMatrix: number[][] = [];
  public baseWallSet: Set<string> = new Set();
  public portalPos: GridPos = { x: 3, y: 3 };
  public buildingSystem: BuildingSystem;
  public roomClassifier: RoomClassifier;
  public cachedRoomMap: Map<string, ClassifiedRoom> = new Map();
  public placedBuildables: Map<string, BuildableDef> = new Map();

  public party: MockPlayer[] = [];
  public get player(): MockPlayer {
    return this.party[0];
  }

  private lastKnownMemberTiles: Map<MockPlayer, string> = new Map();
  private lastClassifiedMemberRooms: Map<MockPlayer, string | null> = new Map();
  public hudRoomName: string | null = null;
  public loggedEvents: string[] = [];

  constructor(roomRules: RoomRuleDef[]) {
    this.buildingSystem = new BuildingSystem(this.mapWidth, this.mapHeight);
    this.roomClassifier = new RoomClassifier(roomRules);
    this.initMap();
  }

  private initMap(): void {
    this.gridMatrix = [];
    this.baseWallSet.clear();

    for (let y = 0; y < this.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.mapWidth; x++) {
        // Outer boundaries (with gate opening at x=0, y=10)
        if (((x === 0 && y !== 10) || x === this.mapWidth - 1 || y === 0 || y === this.mapHeight - 1)) {
          row.push(1);
          this.baseWallSet.add(`${x},${y}`);
        }
        // Guild hall walls (x: 7..13, y: 7..13), doorway at (10, 13)
        else if (
          (y === 7 && x >= 7 && x <= 13) ||
          (y === 13 && x >= 7 && x <= 13 && x !== 10) ||
          (x === 7 && y >= 7 && y <= 13) ||
          (x === 13 && y >= 7 && y <= 13)
        ) {
          row.push(1);
          this.baseWallSet.add(`${x},${y}`);
        } else {
          row.push(0);
        }
      }
      this.gridMatrix.push(row);
    }
  }

  public isWall(x: number, y: number): boolean {
    if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return true;
    return this.gridMatrix[y][x] === 1;
  }

  public isTileOccupied(x: number, y: number, exclude?: MockPlayer): boolean {
    return this.party.some((m) => m !== exclude && m.state !== 'dead' && m.state !== 'downed' && m.gridPos.x === x && m.gridPos.y === y);
  }

  public findOpenAdjacentTile(center: GridPos, preferredNear?: GridPos, claimedTiles?: Set<string>): GridPos {
    const offsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
      { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
      { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
      { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 }
    ];

    const candidates: GridPos[] = [];
    for (const off of offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (
        tx > 0 && tx < this.mapWidth - 1 &&
        ty > 0 && ty < this.mapHeight - 1 &&
        this.gridMatrix[ty]?.[tx] === 0
      ) {
        const key = `${tx},${ty}`;
        if (!claimedTiles?.has(key) && !this.isTileOccupied(tx, ty)) {
          candidates.push({ x: tx, y: ty });
        }
      }
    }

    if (candidates.length > 0) {
      if (preferredNear) {
        candidates.sort((a, b) => {
          const distA = Math.max(Math.abs(a.x - preferredNear.x), Math.abs(a.y - preferredNear.y));
          const distB = Math.max(Math.abs(b.x - preferredNear.x), Math.abs(b.y - preferredNear.y));
          return distA - distB;
        });
      }
      return candidates[0];
    }

    for (const off of offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (
        tx > 0 && tx < this.mapWidth - 1 &&
        ty > 0 && ty < this.mapHeight - 1 &&
        this.gridMatrix[ty]?.[tx] === 0
      ) {
        const key = `${tx},${ty}`;
        if (!claimedTiles?.has(key)) {
          return { x: tx, y: ty };
        }
      }
    }

    return center;
  }

  public isPlacedDoor(x: number, y: number): boolean {
    return x === 10 && y === 13;
  }

  public isWallOrDoor(x: number, y: number): boolean {
    return this.isWall(x, y) || this.isPlacedDoor(x, y);
  }

  public recalculateEnclosedRooms(): void {
    this.cachedRoomMap.clear();
    const processedTiles = new Set<string>();

    for (let y = 1; y < this.mapHeight - 1; y++) {
      for (let x = 1; x < this.mapWidth - 1; x++) {
        const key = `${x},${y}`;
        if (processedTiles.has(key)) continue;
        if (this.isWallOrDoor(x, y)) continue;

        const enclosure = this.buildingSystem.checkEnclosure(
          x,
          y,
          (tx, ty) => this.isWall(tx, ty),
          (tx, ty) => this.isPlacedDoor(tx, ty)
        );

        if (enclosure.isIndoor && enclosure.enclosedTiles) {
          const tags: string[] = [];
          for (const tile of enclosure.enclosedTiles) {
            processedTiles.add(`${tile.x},${tile.y}`);
            const placed = this.placedBuildables.get(`${tile.x},${tile.y}`);
            if (placed) {
              if (placed.roomTag) tags.push(placed.roomTag);
              if (placed.roomTags) tags.push(...placed.roomTags);
            }
          }

          const classified = this.roomClassifier.classify(tags, enclosure.enclosedTiles);
          for (const tile of enclosure.enclosedTiles) {
            this.cachedRoomMap.set(`${tile.x},${tile.y}`, classified);
          }
        }
      }
    }

    this.updatePlayerRoomLookup(true);
  }

  public updatePlayerRoomLookup(forceUpdate: boolean = false): void {
    // Guard against empty party (Fixes Uncaught TypeError)
    if (!this.party || this.party.length === 0) return;

    if (this.lastKnownMemberTiles.size > this.party.length) {
      for (const trackedMember of this.lastKnownMemberTiles.keys()) {
        if (!this.party.includes(trackedMember)) {
          this.lastKnownMemberTiles.delete(trackedMember);
          this.lastClassifiedMemberRooms.delete(trackedMember);
        }
      }
    }

    for (let i = 0; i < this.party.length; i++) {
      const member = this.party[i];
      if (!member || !member.gridPos) continue;

      const tileKey = `${member.gridPos.x},${member.gridPos.y}`;
      const lastTile = this.lastKnownMemberTiles.get(member);
      if (!forceUpdate && tileKey === lastTile) continue;
      this.lastKnownMemberTiles.set(member, tileKey);

      const currentRoom = this.cachedRoomMap.get(tileKey) ?? null;
      const roomName = currentRoom?.name ?? null;
      const lastRoomName = this.lastClassifiedMemberRooms.get(member) ?? null;

      member.currentRoom = currentRoom;
      member.currentRoomName = roomName;

      if (roomName !== lastRoomName || forceUpdate) {
        this.lastClassifiedMemberRooms.set(member, roomName);

        if (i === 0) {
          this.hudRoomName = roomName;
        }

        if (roomName && !forceUpdate) {
          const label = member.entityName || (i === 0 ? 'Player' : `Companion ${i}`);
          this.loggedEvents.push(`${label} entered ${roomName}`);
        }
      }
    }
  }

  public getRoomForMember(member: MockPlayer): ClassifiedRoom | null {
    if (!member || !member.gridPos) return null;
    return this.cachedRoomMap.get(`${member.gridPos.x},${member.gridPos.y}`) ?? null;
  }
}

// Load real room rules
const roomRulesRaw: RoomRuleDef[] = JSON.parse(fs.readFileSync('data/rooms.json', 'utf8')).rules;

// ============================================================================
// TEST 1: Party Spawn Tile-Stacking Prevention
// ============================================================================
{
  const scene = new MockOutpostScene(roomRulesRaw);
  const claimedSpawn = new Set<string>();
  const partyCoords: GridPos[] = [];

  // Spawn 4 party members around portal at (3, 3)
  for (let i = 0; i < 4; i++) {
    const tile = scene.findOpenAdjacentTile(scene.portalPos, undefined, claimedSpawn);
    claimedSpawn.add(`${tile.x},${tile.y}`);
    partyCoords.push(tile);
  }

  // 1. All 4 coords must be unique
  const coordSet = new Set(partyCoords.map((c) => `${c.x},${c.y}`));
  assert.equal(coordSet.size, 4, 'All 4 party spawn coordinates must be completely distinct (no tile-stacking)');

  // 2. None can be the portal tile itself
  for (const c of partyCoords) {
    assert.ok(c.x !== scene.portalPos.x || c.y !== scene.portalPos.y, 'Party member must not spawn directly on portal tile');
    assert.equal(scene.isWall(c.x, c.y), false, 'Party member must spawn on walkable open tile');
  }

  console.log('✔ Test 1 passed: Portal party spawn assigns distinct adjacent walkable tiles with zero stacking');
}

// ============================================================================
// TEST 2: Empty Party / Pre-Spawn recalculateEnclosedRooms Call (Crash Guard)
// ============================================================================
{
  const scene = new MockOutpostScene(roomRulesRaw);
  scene.party = []; // Empty party (before party instantiation)

  // This previously threw: Uncaught TypeError: Cannot read properties of undefined (reading 'gridPos')
  assert.doesNotThrow(() => {
    scene.recalculateEnclosedRooms();
  }, 'recalculateEnclosedRooms must never crash when called before party is spawned');

  assert.doesNotThrow(() => {
    scene.updatePlayerRoomLookup(true);
  }, 'updatePlayerRoomLookup must safely return when party is empty');

  console.log('✔ Test 2 passed: Empty-party guard prevents crash if room recalculation runs before party spawn');
}

// ============================================================================
// TEST 3: Fresh Load & Scene Spawn Ordering (1 Hero Member)
// ============================================================================
{
  const scene = new MockOutpostScene(roomRulesRaw);

  // 5. Spawn Party (1 hero)
  const hero = createMockPlayer('hero', 'Hero', 4, 4);
  scene.party = [hero];

  // Initial room classification scan AFTER party spawn
  scene.recalculateEnclosedRooms();

  // Hero spawned in open courtyard (4, 4)
  assert.equal(hero.currentRoom, null, 'Hero in courtyard should have null room');
  assert.equal(hero.currentRoomName, null, 'Hero in courtyard should have null room name');
  assert.equal(scene.hudRoomName, null, 'HUD room badge should be null');

  // Move hero into Guild Hall (8, 8)
  hero.gridPos = { x: 8, y: 8 };
  scene.updatePlayerRoomLookup(false);

  assert.ok(hero.currentRoom, 'Hero inside Guild Hall must have a classified room');
  assert.equal(hero.currentRoomName, 'Enclosed Room', 'Room name should be Enclosed Room');
  assert.equal(scene.hudRoomName, 'Enclosed Room', 'HUD room badge must update for leader');
  assert.ok(scene.loggedEvents.includes('Hero entered Enclosed Room'), 'Event must log hero entry');

  console.log('✔ Test 3 passed: Fresh load with single hero correctly classifies room and updates HUD');
}

// ============================================================================
// TEST 4: Portal Transition Load with Full Multi-Member Party
// ============================================================================
{
  const scene = new MockOutpostScene(roomRulesRaw);

  // Place bed at (8, 8) inside guild hall to make it a Bedroom
  scene.placedBuildables.set('8,8', {
    id: 'bed',
    name: 'Bed',
    woodCost: 15,
    footprint: { width: 1, height: 1 },
    rotatable: true,
    indoorRequired: true,
    walkable: false,
    roomTag: 'bedroom',
    description: ''
  });

  const member0 = createMockPlayer('hero', 'Hero', 9, 8);         // In Bedroom
  const member1 = createMockPlayer('valerie', 'Valerie', 9, 9);   // In Bedroom
  const member2 = createMockPlayer('kaelen', 'Kaelen', 4, 4);     // In Courtyard (outdoors)
  const member3 = createMockPlayer('barris', 'Barris', 4, 5);     // In Courtyard (outdoors)

  scene.party = [member0, member1, member2, member3];

  // Run initial scan
  scene.recalculateEnclosedRooms();

  // Check Member 0 (Leader)
  assert.equal(member0.currentRoomName, 'Bedroom', 'Leader at (9,8) must be in Bedroom');
  assert.equal(scene.hudRoomName, 'Bedroom', 'HUD room badge must reflect leader in Bedroom');

  // Check Member 1 (Companion Valerie)
  assert.equal(member1.currentRoomName, 'Bedroom', 'Companion Valerie at (9,9) must be in Bedroom');

  // Check Member 2 (Companion Kaelen)
  assert.equal(member2.currentRoomName, null, 'Companion Kaelen at (4,4) must be outdoors (null room)');

  // Check Member 3 (Companion Barris)
  assert.equal(member3.currentRoomName, null, 'Companion Barris at (4,5) must be outdoors (null room)');

  // Helper getRoomForMember
  assert.equal(scene.getRoomForMember(member0)?.name, 'Bedroom');
  assert.equal(scene.getRoomForMember(member2), null);

  console.log('[OK] Test 4 passed: Portal transition load with 4-member party correctly classifies each member independently');
}

// ============================================================================
// TEST 5: Independent Party Member Room Transitions & HUD Isolation
// ============================================================================
{
  const scene = new MockOutpostScene(roomRulesRaw);

  scene.placedBuildables.set('8,8', {
    id: 'bed',
    name: 'Bed',
    woodCost: 15,
    footprint: { width: 1, height: 1 },
    rotatable: true,
    indoorRequired: true,
    walkable: false,
    roomTag: 'bedroom',
    description: ''
  });

  const member0 = createMockPlayer('hero', 'Hero', 9, 8);       // In Bedroom
  const member1 = createMockPlayer('valerie', 'Valerie', 4, 4); // Outdoors
  scene.party = [member0, member1];

  scene.recalculateEnclosedRooms();
  scene.loggedEvents = [];

  // Valerie walks into the Bedroom at (9, 9)
  member1.gridPos = { x: 9, y: 9 };
  scene.updatePlayerRoomLookup(false);

  assert.equal(member1.currentRoomName, 'Bedroom', 'Valerie should now be in Bedroom');
  assert.ok(scene.loggedEvents.includes('Valerie entered Bedroom'), 'Log must record Valerie entering Bedroom');
  assert.equal(scene.hudRoomName, 'Bedroom', 'HUD badge remains leader Bedroom');

  // Now leader walks outside to courtyard (4, 4)
  member0.gridPos = { x: 4, y: 4 };
  scene.updatePlayerRoomLookup(false);

  assert.equal(member0.currentRoomName, null, 'Leader should now be outdoors');
  assert.equal(scene.hudRoomName, null, 'HUD badge must clear to null when leader is outdoors');
  // Valerie MUST still be in Bedroom!
  assert.equal(member1.currentRoomName, 'Bedroom', 'Valerie must remain in Bedroom when leader moves outdoors');

  console.log('[OK] Test 5 passed: Movement between rooms updates members independently without leaking room state');
}

// ============================================================================
// TEST 6: Pathfinder Dynamic Obstacles Avoid Party Members
// ============================================================================
{
  const grid = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0]
  ];

  const pathfinder = new Pathfinder(grid);

  // Find straight path from (0, 0) to (4, 0) with no obstacles
  let path = await pathfinder.findPath({ x: 0, y: 0 }, { x: 4, y: 0 });
  assert.ok(path.length > 0, 'Path should exist');

  // Now place dynamic obstacles (standing party members) at (1, 0), (2, 0), (3, 0)
  const dynamicObstacles = [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 }
  ];

  const pathWithObstacles = await pathfinder.findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, dynamicObstacles);
  assert.ok(pathWithObstacles.length > 0, 'Path around dynamic obstacles should exist');

  // None of the path steps should intersect dynamic obstacles
  for (const step of pathWithObstacles) {
    const hit = dynamicObstacles.some((o) => o.x === step.x && o.y === step.y);
    assert.equal(hit, false, `Step (${step.x}, ${step.y}) must not collide with dynamic obstacle`);
  }

  console.log('[OK] Test 6 passed: Pathfinder correctly detours around living party members as dynamic obstacles');
}

console.log('\nALL 6 PATHFINDING, TILE-STACKING & OUTPOST ROOM CLASSIFICATION TESTS PASSED SUCCESSFULLY! [OK]\n');
