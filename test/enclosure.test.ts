import assert from 'node:assert/strict';
import { BuildingSystem } from '../src/systems/BuildingSystem.ts';
import type { BuildableDef } from '../src/types/game.ts';

console.log('--- RUNNING ENCLOSURE DETECTION UNIT TESTS ---');

const system = new BuildingSystem(20, 20);

// Helper to simulate a map with walls and doors
function createGridContext() {
  const walls = new Set<string>();
  const doors = new Set<string>();
  const stations = new Set<string>();

  return {
    addWall: (x: number, y: number) => walls.add(`${x},${y}`),
    removeWall: (x: number, y: number) => walls.delete(`${x},${y}`),
    addDoor: (x: number, y: number) => doors.add(`${x},${y}`),
    removeDoor: (x: number, y: number) => doors.delete(`${x},${y}`),
    addStation: (x: number, y: number) => stations.add(`${x},${y}`),
    isWall: (x: number, y: number) => walls.has(`${x},${y}`),
    isDoor: (x: number, y: number) => doors.has(`${x},${y}`),
    isStation: (x: number, y: number) => stations.has(`${x},${y}`)
  };
}

// Test 1: Closed 3x3 rectangle with 1 door and 7 walls enclosing center (5, 5)
{
  const ctx = createGridContext();
  // Walls on North, West, East, corners, and South with one door
  // Perimeter from x: 4..6, y: 4..6
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        if (x === 5 && y === 6) {
          ctx.addDoor(x, y); // Door at South center
        } else {
          ctx.addWall(x, y);
        }
      }
    }
  }

  const result = system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor);
  assert.equal(result.isIndoor, true, '3x3 room with walls and 1 door must be indoor');
  console.log('✔ Test 1 passed: Standard enclosed room (walls + door) is indoor');
}

// Test 2: Solid walls with 0 doors
{
  const ctx = createGridContext();
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        ctx.addWall(x, y); // Solid walls, NO doors
      }
    }
  }

  const result = system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor);
  assert.equal(result.isIndoor, false, 'Room with 0 doors must fail enclosure');
  assert.match(result.reason || '', /at least one Door/i);
  console.log('✔ Test 2 passed: Solid walls with 0 doors rejected per Section 9.1');
}

// Test 3: Open courtyard tile with no walls around
{
  const ctx = createGridContext();
  const result = system.checkEnclosure(10, 10, ctx.isWall, ctx.isDoor);
  assert.equal(result.isIndoor, false, 'Open courtyard tile must fail enclosure');
  assert.match(result.reason || '', /leaks to the outside/i);
  console.log('✔ Test 3 passed: Open courtyard tile correctly detected as outdoor');
}

// Test 4: Room with a 1-tile gap in a wall
{
  const ctx = createGridContext();
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        if (x === 5 && y === 6) {
          ctx.addDoor(x, y);
        } else if (x === 4 && y === 5) {
          // Missing wall on West side! (A gap)
        } else {
          ctx.addWall(x, y);
        }
      }
    }
  }

  const result = system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor);
  assert.equal(result.isIndoor, false, 'Room with missing wall tile must leak and fail enclosure');
  console.log('✔ Test 4 passed: Room with a gap leaks to outside and fails enclosure');
}

// Test 5: Enclosed room of large arbitrary dimensions (e.g. 15x15) without any arbitrary size threshold penalty
{
  const ctx = createGridContext();
  // Room from (2, 2) to (17, 17) -> 16x16 perimeter, 14x14 interior = 196 interior tiles
  for (let x = 2; x <= 17; x++) {
    for (let y = 2; y <= 17; y++) {
      if (x === 2 || x === 17 || y === 2 || y === 17) {
        if (x === 10 && y === 17) {
          ctx.addDoor(x, y); // Door
        } else {
          ctx.addWall(x, y);
        }
      }
    }
  }

  const resultCenter = system.checkEnclosure(10, 10, ctx.isWall, ctx.isDoor);
  assert.equal(resultCenter.isIndoor, true, '15x15 interior room must pass enclosure without magic number threshold cutoff');
  const resultCorner = system.checkEnclosure(3, 3, ctx.isWall, ctx.isDoor);
  assert.equal(resultCorner.isIndoor, true, 'Interior corner tile in large room must also be indoor');
  console.log('✔ Test 5 passed: Large 15x15 room passes enclosure without size cutoff penalty');
}

// Test 6: Room with one wall running directly along the map outer boundary (e.g. x === 0)
{
  const ctx = createGridContext();
  // Boundary wall at x === 0 from y: 5..10
  // Other walls at y === 5 (x: 0..4), y === 10 (x: 0..4), x === 4 (y: 5..10 with door at 4, 7)
  for (let x = 0; x <= 4; x++) {
    for (let y = 5; y <= 10; y++) {
      if (x === 0 || x === 4 || y === 5 || y === 10) {
        if (x === 4 && y === 7) {
          ctx.addDoor(x, y);
        } else {
          ctx.addWall(x, y);
        }
      }
    }
  }

  // Inside tile at (2, 7)
  const result = system.checkEnclosure(2, 7, ctx.isWall, ctx.isDoor);
  assert.equal(result.isIndoor, true, 'Room with a wall on the map boundary (x === 0) must be properly sealed and pass');
  console.log('✔ Test 6 passed: Wall on map boundary edge properly seals room without false leak');
}

// Test 7: Demolishing a wall or door invalidates subsequent enclosure
{
  const ctx = createGridContext();
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        if (x === 5 && y === 6) ctx.addDoor(x, y);
        else ctx.addWall(x, y);
      }
    }
  }
  // Initially indoor
  assert.equal(system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor).isIndoor, true);

  // Demolish one wall
  ctx.removeWall(4, 5);
  // Re-check
  assert.equal(system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor).isIndoor, false, 'Removing wall must invalidate enclosure');

  // Restore wall, remove door
  ctx.addWall(4, 5);
  ctx.removeDoor(5, 6);
  assert.equal(system.checkEnclosure(5, 5, ctx.isWall, ctx.isDoor).isIndoor, false, 'Removing door must invalidate enclosure');
  console.log('✔ Test 7 passed: Demolishing wall or door invalidates subsequent enclosure');
}

// Test 8: Placement validation with Wood cost & Research Station indoor gating
{
  const ctx = createGridContext();
  // Build enclosed room at (4..6, 4..6)
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 4 || x === 6 || y === 4 || y === 6) {
        if (x === 5 && y === 6) ctx.addDoor(x, y);
        else ctx.addWall(x, y);
      }
    }
  }

  const stationDef: BuildableDef = {
    id: 'research_station',
    name: 'Research Station',
    woodCost: 20,
    footprint: { width: 1, height: 1 },
    rotatable: true,
    indoorRequired: true,
    walkable: false,
    description: 'Crafting station'
  };

  const wallDef: BuildableDef = {
    id: 'wall',
    name: 'Wood Wall',
    woodCost: 5,
    footprint: { width: 1, height: 1 },
    rotatable: false,
    indoorRequired: false,
    walkable: false,
    description: 'Wall'
  };

  const playerPos = { x: 2, y: 2 };
  const reservedTiles = [{ x: 3, y: 3 }]; // Portal

  // 8a: Placing station on open ground (outside) -> blocked with enclosure feedback
  const outsidePlace = system.canPlace(
    stationDef,
    10, 10,
    playerPos,
    reservedTiles,
    ctx.isWall,
    ctx.isDoor,
    ctx.isStation,
    100
  );
  assert.equal(outsidePlace.valid, false);
  assert.match(outsidePlace.reason || '', /enclosed indoor room/i);

  // 8b: Placing station inside enclosed room with sufficient wood -> valid
  const insidePlace = system.canPlace(
    stationDef,
    5, 5,
    playerPos,
    reservedTiles,
    ctx.isWall,
    ctx.isDoor,
    ctx.isStation,
    100
  );
  assert.equal(insidePlace.valid, true);

  // 8c: Placing station inside enclosed room with INSUFFICIENT wood -> blocked with wood feedback
  const insufficientWood = system.canPlace(
    stationDef,
    5, 5,
    playerPos,
    reservedTiles,
    ctx.isWall,
    ctx.isDoor,
    ctx.isStation,
    10
  );
  assert.equal(insufficientWood.valid, false);
  assert.match(insufficientWood.reason || '', /Not enough Wood/i);

  // 8d: Placing on portal tile -> blocked
  const portalPlace = system.canPlace(
    wallDef,
    3, 3,
    playerPos,
    reservedTiles,
    ctx.isWall,
    ctx.isDoor,
    ctx.isStation,
    100
  );
  assert.equal(portalPlace.valid, false);
  assert.match(portalPlace.reason || '', /Portal/i);

  console.log('✔ Test 8 passed: Placement validation, wood costs, and research station enclosure gating verified');
}

console.log('\nALL 8 ENCLOSURE UNIT TESTS PASSED SUCCESSFULLY! 🎉');
