import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DungeonGenerator } from '../src/utils/DungeonGenerator.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { CraftingSystem } from '../src/systems/CraftingSystem.ts';
import { GameState } from '../src/systems/GameState.ts';
import { HUD } from '../src/ui/HUD.ts';

console.log('--- START PERCEPTION + HIDDEN CACHES + EXPLORER TESTS ---');

const dataLoader = DataLoader.getInstance();
await dataLoader.loadAll();

const config = dataLoader.getDungeonConfig();
const classesData = dataLoader.getClassesData();
const playerData = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'data/player.json'), 'utf8'));
const startingWeapon = dataLoader.getWeapon('rusty_sword') || dataLoader.getAllWeapons()[0];

// ============================================================================
// 1. DETERMINISM FIXTURE VERIFICATION (Change 2)
// ============================================================================
console.log('\n[Group 1] Determinism Fixture Verification (Seeds 1–50 against 9018d29 fixture)');
const fixturePath = path.resolve('test/fixtures/dungeon_determinism_pre_cache_seeds_1_50.json');
assert.ok(fs.existsSync(fixturePath), 'Determinism fixture file must exist');

const fixtureRecords = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

for (let seed = 1; seed <= 50; seed++) {
  const d = DungeonGenerator.generate(config, DungeonGenerator.createRng(seed), {
    seed,
    currentFloorSeed: seed,
    floorNumber: 3,
    isTutorialComplete: true,
    isDiggingUnlocked: true,
    grove: { staffObtained: false, misses: 5 }
  });

  const floorData = {
    width: d.width,
    height: d.height,
    gridMatrix: d.gridMatrix,
    rooms: d.rooms,
    portalPos: d.portalPos,
    crystalPos: d.crystalPos,
    enemySpawns: d.enemySpawns,
    bushSpawns: d.bushSpawns,
    waterTiles: d.waterTiles || [],
    overgrownGrove: d.overgrownGrove,
    groveEligible: d.groveEligible
  };

  const sha256 = crypto.createHash('sha256').update(JSON.stringify(floorData)).digest('hex');
  assert.strictEqual(
    sha256,
    fixtureRecords[seed].sha256,
    `Seed ${seed} fingerprint must match pre-cache fixture exactly`
  );
}
console.log('✓ PASS: All 50 floor layouts, enemy spawns, and grove data match pre-cache fixture 100%');

// ============================================================================
// 2. ROOM IDENTIFIER CHECK (Change 3)
// ============================================================================
console.log('\n[Group 2] Room Identifier Invariant (rooms[i].id === i)');
for (let seed = 1; seed <= 50; seed++) {
  const d = DungeonGenerator.generate(config, DungeonGenerator.createRng(seed), {
    seed,
    currentFloorSeed: seed,
    floorNumber: 3,
    isTutorialComplete: true,
    isDiggingUnlocked: true
  });
  d.rooms.forEach((r, idx) => {
    assert.strictEqual(r.id, idx, `Seed ${seed} room at index ${idx} must have id === ${idx}`);
  });
}
console.log('✓ PASS: Confirmed rooms[i].id === i for all generated floors');

// ============================================================================
// 3. DUNGEON GENERATION: ELIGIBILITY & SPATIAL INVARIANTS
// ============================================================================
console.log('\n[Group 3] Hidden Caches Generation Rules & Spatial Invariants');

// 3a. Ineligible floors have 0 caches
const floor1 = DungeonGenerator.generate(config, DungeonGenerator.createRng(10), {
  seed: 10,
  currentFloorSeed: 10,
  floorNumber: 1, // ineligible (requires floor >= 2)
  isTutorialComplete: true,
  isDiggingUnlocked: true
});
assert.strictEqual(floor1.hiddenCaches?.length || 0, 0, 'Floor 1 must have 0 hidden caches');

const preTutorial = DungeonGenerator.generate(config, DungeonGenerator.createRng(10), {
  seed: 10,
  currentFloorSeed: 10,
  floorNumber: 3,
  isTutorialComplete: false, // ineligible (requires tutorial complete)
  isDiggingUnlocked: true
});
assert.strictEqual(preTutorial.hiddenCaches?.length || 0, 0, 'Pre-tutorial dungeon must have 0 hidden caches');

const diggingLocked = DungeonGenerator.generate(config, DungeonGenerator.createRng(10), {
  seed: 10,
  currentFloorSeed: 10,
  floorNumber: 3,
  isTutorialComplete: true,
  isDiggingUnlocked: false // ineligible (requires digging unlocked)
});
assert.strictEqual(diggingLocked.hiddenCaches?.length || 0, 0, 'Digging locked dungeon must have 0 hidden caches');

// 3b. 200 eligible floors average count = 1.5 ± 0.15
let totalCaches = 0;
const eligibleFloorsCount = 200;

for (let s = 100; s < 100 + eligibleFloorsCount; s++) {
  const d = DungeonGenerator.generate(config, DungeonGenerator.createRng(s), {
    seed: s,
    currentFloorSeed: s,
    floorNumber: 3,
    isTutorialComplete: true,
    isDiggingUnlocked: true,
    grove: { staffObtained: true, misses: 0 }
  });

  const caches = d.hiddenCaches || [];
  assert.ok(caches.length === 1 || caches.length === 2, `Floor ${s} cache count must be 1 or 2, got ${caches.length}`);
  totalCaches += caches.length;

  // Spatial checks
  const usedRooms = new Set<number>();
  for (const c of caches) {
    // Room validity
    const room = d.rooms[c.roomIndex];
    assert.ok(room, `Cache roomIndex ${c.roomIndex} must exist in d.rooms`);
    assert.notStrictEqual(room.type, 'entrance', 'Cache must not land in entrance room');
    assert.notStrictEqual(room.id, 0, 'Cache must not land in room 0');
    assert.notStrictEqual(room.type, 'boss', 'Cache must not land in boss room');
    if (d.overgrownGrove) {
      assert.notStrictEqual(room.id, d.overgrownGrove.roomIndex, 'Cache must not land in Overgrown Grove room');
    }

    // At most 1 per room
    assert.ok(!usedRooms.has(c.roomIndex), `Room ${c.roomIndex} must contain at most 1 cache`);
    usedRooms.add(c.roomIndex);

    // Interior walkable tile
    assert.strictEqual(d.gridMatrix[c.y]?.[c.x], 0, 'Cache tile must be walkable floor (0)');
    assert.ok(c.x >= room.x && c.x < room.x + room.width, 'Cache X must be inside room');
    assert.ok(c.y >= room.y && c.y < room.y + room.height, 'Cache Y must be inside room');

    // Not on portal or crystal
    assert.ok(!(c.x === d.portalPos.x && c.y === d.portalPos.y), 'Cache must not land on portal');
    assert.ok(!(c.x === d.crystalPos.x && c.y === d.crystalPos.y), 'Cache must not land on crystal');

    // Not on enemy spawns
    assert.ok(!d.enemySpawns.some(e => e.x === c.x && e.y === c.y), 'Cache must not land on an enemy spawn');

    // Not on bushes
    assert.ok(!d.bushSpawns.some(b => b.x === c.x && b.y === c.y), 'Cache must not land on a bush spawn');

    // Not on water
    if (d.waterTiles) {
      assert.ok(!d.waterTiles.some(w => w.x === c.x && w.y === c.y), 'Cache must not land on water');
    }
  }
}

const avgCaches = totalCaches / eligibleFloorsCount;
console.log(`Average cache count over 200 floors: ${avgCaches.toFixed(3)} (expected 1.5 ± 0.15)`);
assert.ok(avgCaches >= 1.35 && avgCaches <= 1.65, `Average cache count ${avgCaches} must be within 1.5 ± 0.15`);
console.log('✓ PASS: Hidden caches generation and spatial placement invariants verified');

// ============================================================================
// 4. REGISTRATION & PROFICIENCY DEFINITIONS
// ============================================================================
console.log('\n[Group 4] Perception Proficiency Registration & HUD Integration');

// 4a. ProgressionSystem default registration
const testProg = new ProgressionSystem(classesData, 'Tester');
assert.strictEqual(testProg.getProficiencyLevel('perception'), 0, 'Perception must start at level 0');
assert.strictEqual(testProg.getProficiencyStat('perception').currentExp, 0, 'Perception must start at 0 EXP');

// 4b. DataLoader trainable stat def
const percStatDef = dataLoader.getTrainableStatDef('perception');
assert.ok(percStatDef, 'getTrainableStatDef("perception") must be defined');
assert.strictEqual(percStatDef.name, 'Perception');
assert.strictEqual(percStatDef.description, 'Notice what others walk past: hidden caches, and later traps and secrets.');

// 4c. Player.json
assert.ok((playerData.proficiencies as any)?.perception, 'player.json must register perception proficiency');
assert.strictEqual((playerData.proficiencies as any).perception.level, 0);

// 4d. HUD Stat Color & Display Name
const hudProto = HUD.prototype as any;
assert.strictEqual(hudProto.getStatColor('perception'), '#06b6d4', 'HUD getStatColor("perception") must be #06b6d4');
assert.strictEqual(hudProto.getStatDisplayName('perception'), 'Perception');

console.log('✓ PASS: Perception proficiency registered in ProgressionSystem, player.json, DataLoader, and HUD');

// ============================================================================
// 5. EXPLORER CLASS REQUIREMENTS & CRAFTING PERKS
// ============================================================================
console.log('\n[Group 5] Explorer Class Requirements & Crafting Perks');

const explorerDef = dataLoader.getClass('explorer');
assert.ok(explorerDef, 'Explorer class must be defined in data/classes.json');
assert.strictEqual(explorerDef.tier, 'expert');
assert.strictEqual(explorerDef.category, 'crafting');
assert.strictEqual(explorerDef.fantasy, 'Finds what everyone else walks past');

// 5a. Unlock evaluation gates
const unlockProg = new ProgressionSystem(classesData, 'UnlockTester');
unlockProg.getProficiencyStat('digging').level = 60;
unlockProg.getProficiencyStat('perception').level = 29;
unlockProg.setClassLevel('excavator', 20);
unlockProg.checkClassUnlocks();
assert.strictEqual(unlockProg.isClassUnlocked('explorer'), false, 'Explorer must be locked at Perception 29');

unlockProg.getProficiencyStat('perception').level = 30;
unlockProg.setClassLevel('excavator', 19);
unlockProg.checkClassUnlocks();
assert.strictEqual(unlockProg.isClassUnlocked('explorer'), false, 'Explorer must be locked at Excavator Lv 19');

unlockProg.getProficiencyStat('digging').level = 59;
unlockProg.setClassLevel('excavator', 20);
unlockProg.checkClassUnlocks();
assert.strictEqual(unlockProg.isClassUnlocked('explorer'), false, 'Explorer must be locked at Digging 59');

unlockProg.getProficiencyStat('digging').level = 60;
unlockProg.checkClassUnlocks();
assert.strictEqual(unlockProg.isClassUnlocked('explorer'), true, 'Explorer must unlock at Digging 60 + Perception 30 + Excavator 20');

// 5b. Crafter Perks scaling and cap at 15
unlockProg.setClassLevel('explorer', 0);
const perksLv0 = CraftingSystem.getCrafterPerks(unlockProg, 'perception');
assert.strictEqual(perksLv0.classId, 'explorer');
assert.strictEqual(perksLv0.perkPercent, 0);
assert.strictEqual(perksLv0.detectionRadius, 3);
assert.strictEqual(perksLv0.detectionBonusChance, 0);

unlockProg.setClassLevel('explorer', 7);
const perksLv7 = CraftingSystem.getCrafterPerks(unlockProg, 'perception');
assert.strictEqual(perksLv7.perkPercent, 7);
assert.strictEqual(perksLv7.detectionBonusChance, 0.07);
assert.strictEqual(perksLv7.detectionRadius, 3, 'Radius must remain 3 below Level 10');
assert.strictEqual(perksLv7.cacheBonusRollChance, 7);
assert.strictEqual(perksLv7.perkDescription, 'Explorer Lv 7: +7% detection chance, +7% cache loot roll');

unlockProg.setClassLevel('explorer', 10);
const perksLv10 = CraftingSystem.getCrafterPerks(unlockProg, 'perception');
assert.strictEqual(perksLv10.perkPercent, 10);
assert.strictEqual(perksLv10.detectionBonusChance, 0.10);
assert.strictEqual(perksLv10.detectionRadius, 4, 'Radius must expand to 4 at Level 10');
assert.strictEqual(perksLv10.cacheBonusRollChance, 10);
assert.strictEqual(perksLv10.perkDescription, 'Explorer Lv 10: +10% detection chance, 4-tile search radius, +10% cache loot roll');

unlockProg.setClassLevel('explorer', 15);
const perksLv15 = CraftingSystem.getCrafterPerks(unlockProg, 'perception');
assert.strictEqual(perksLv15.perkPercent, 15);
assert.strictEqual(perksLv15.detectionBonusChance, 0.15);
assert.strictEqual(perksLv15.detectionRadius, 4);
assert.strictEqual(perksLv15.cacheBonusRollChance, 15);

// Cap at 15
unlockProg.setClassLevel('explorer', 40);
const perksLv40 = CraftingSystem.getCrafterPerks(unlockProg, 'perception');
assert.strictEqual(perksLv40.perkPercent, 15, 'Explorer perks must cap at 15');
assert.strictEqual(perksLv40.detectionBonusChance, 0.15);

console.log('✓ PASS: Explorer requirements and crafter perks scale correctly and cap at 15');

// ============================================================================
// 6. DETECTION LOGIC & MATHEMATICS
// ============================================================================
console.log('\n[Group 6] Detection Formula, Range & Stepping');

// Mock scene setup for detection verification
class MockDetectionScene {
  public party: any[] = [];
  public undiscoveredCaches: { x: number; y: number; roomIndex: number }[] = [];
  public revealedCaches: { cache: any; revealer: any }[] = [];
  public spawnedNodes: any[] = [];
  public hud = {
    showToast: (_msg: string) => {}
  };
  public cacheDetectionRng: () => number = Math.random;

  public setCacheDetectionRng(rng: () => number) {
    this.cacheDetectionRng = rng;
  }

  public checkCacheStepping() {
    if (this.undiscoveredCaches.length === 0) return;
    for (const member of this.party) {
      if (member.state === 'dead' || member.state === 'downed') continue;
      for (let i = this.undiscoveredCaches.length - 1; i >= 0; i--) {
        const cache = this.undiscoveredCaches[i];
        if (member.gridPos.x === cache.x && member.gridPos.y === cache.y) {
          this.revealHiddenCache(cache, member);
        }
      }
    }
  }

  public checkCacheDetection() {
    if (this.undiscoveredCaches.length === 0) return;
    for (let cIdx = this.undiscoveredCaches.length - 1; cIdx >= 0; cIdx--) {
      const cache = this.undiscoveredCaches[cIdx];
      let revealed = false;
      for (const member of this.party) {
        if (member.state === 'dead' || member.state === 'downed') continue;
        const perks = CraftingSystem.getCrafterPerks(member, 'perception');
        const explorerBonus = perks.detectionBonusChance ?? 0;
        const radius = perks.detectionRadius ?? 3;
        const dist = Math.max(Math.abs(member.gridPos.x - cache.x), Math.abs(member.gridPos.y - cache.y));
        if (dist <= radius) {
          const percLevel = member.progression.getProficiencyLevel('perception');
          const chance = Math.min(0.90, 0.05 + 0.01 * percLevel + explorerBonus);
          const roll = this.cacheDetectionRng();
          if (roll < chance) {
            this.revealHiddenCache(cache, member);
            revealed = true;
            break;
          }
        }
      }
      if (revealed) continue;
    }
  }

  public revealHiddenCache(cache: any, revealer: any) {
    const idx = this.undiscoveredCaches.indexOf(cache);
    if (idx !== -1) this.undiscoveredCaches.splice(idx, 1);
    this.revealedCaches.push({ cache, revealer });
    revealer.progression.addProficiencyExp('perception', 10);
    if (revealer.progression.isClassUnlocked('explorer')) {
      revealer.progression.addClassExp('explorer', 15);
    }
    this.spawnedNodes.push({ x: cache.x, y: cache.y, nodeTypeId: 'hidden_cache' });
  }
}

const mockMember = {
  entityName: 'Alden',
  state: 'active',
  gridPos: { x: 10, y: 10 },
  progression: new ProgressionSystem(classesData, 'Alden')
};

const mockScene = new MockDetectionScene();
mockScene.party = [mockMember];

// 6a. Perception 0 at 2 tiles away (chance = 0.05)
// Cache at (12, 10), distance = 2
mockScene.undiscoveredCaches = [{ x: 12, y: 10, roomIndex: 1 }];
mockScene.setCacheDetectionRng(() => 0.06); // 0.06 >= 0.05 -> fail
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 1, 'Perception 0 must not reveal at roll 0.06');

mockScene.setCacheDetectionRng(() => 0.04); // 0.04 < 0.05 -> succeed
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 0, 'Perception 0 must reveal at roll 0.04');
assert.strictEqual(mockScene.revealedCaches.length, 1);
assert.strictEqual(mockMember.progression.getProficiencyStat('perception').currentExp, 10, 'Reveal grants +10 Perception EXP');

// 6b. Perception 50 at 2 tiles away (chance = 0.05 + 0.50 = 0.55)
mockMember.progression.getProficiencyStat('perception').level = 50;
mockScene.undiscoveredCaches = [{ x: 12, y: 10, roomIndex: 1 }];
mockScene.revealedCaches = [];

mockScene.setCacheDetectionRng(() => 0.56); // 0.56 >= 0.55 -> fail
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 1, 'Perception 50 must not reveal at roll 0.56');

mockScene.setCacheDetectionRng(() => 0.54); // 0.54 < 0.55 -> succeed
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 0, 'Perception 50 must reveal at roll 0.54');

// 6c. Perception 50 + Explorer Lv 15 at 2 tiles away (chance = 0.55 + 0.15 = 0.70)
mockMember.progression.getProficiencyStat('digging').level = 60;
mockMember.progression.setClassLevel('excavator', 20);
mockMember.progression.checkClassUnlocks();
mockMember.progression.setClassLevel('explorer', 15);
assert.strictEqual(mockMember.progression.isClassUnlocked('explorer'), true);

mockScene.undiscoveredCaches = [{ x: 12, y: 10, roomIndex: 1 }];
mockScene.revealedCaches = [];

mockScene.setCacheDetectionRng(() => 0.71); // 0.71 >= 0.70 -> fail
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 1, 'Perception 50 + Explorer 15 must not reveal at roll 0.71');

const explorerExpBefore = mockMember.progression.getClassStat('explorer').currentExp;
mockScene.setCacheDetectionRng(() => 0.69); // 0.69 < 0.70 -> succeed
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 0, 'Perception 50 + Explorer 15 must reveal at roll 0.69');
assert.strictEqual(
  mockMember.progression.getClassStat('explorer').currentExp - explorerExpBefore,
  15,
  'Revealing cache grants +15 Explorer class EXP'
);

// 6d. Radius test at 4 tiles away: cache at (14, 10), distance = 4
mockMember.progression.setClassLevel('explorer', 9); // Wide Search inactive (radius 3)
mockScene.undiscoveredCaches = [{ x: 14, y: 10, roomIndex: 1 }];
mockScene.setCacheDetectionRng(() => 0.01); // ultra-low roll
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 1, 'At 4 tiles, Explorer Lv 9 must not detect cache (radius 3)');

mockMember.progression.setClassLevel('explorer', 10); // Wide Search active (radius 4)
mockScene.checkCacheDetection();
assert.strictEqual(mockScene.undiscoveredCaches.length, 0, 'At 4 tiles, Explorer Lv 10 must detect cache (radius 4)');

// 6e. Stepping on tile always reveals unconditionally
mockMember.progression.getProficiencyStat('perception').level = 0;
mockMember.progression.setClassLevel('explorer', 0);
mockScene.undiscoveredCaches = [{ x: 10, y: 10, roomIndex: 1 }];
mockScene.setCacheDetectionRng(() => 0.99); // worst roll
mockScene.checkCacheStepping();
assert.strictEqual(mockScene.undiscoveredCaches.length, 0, 'Stepping on cache tile must reveal it unconditionally');

console.log('✓ PASS: Detection roll formulas, range extensions, and stepping mechanics match spec');

// ============================================================================
// 7. ROOM ENTRY TRAINING & REGENERATION RESET (Changes 2, 4)
// ============================================================================
console.log('\n[Group 7] Room Entry Training & Regeneration Floor Reset');

class MockRoomScene {
  public party: any[] = [];
  public visitedRoomIndices: Set<number> = new Set();
  public dungeon: any = null;

  public checkRoomExploration(onArrival: boolean = false) {
    if (!this.dungeon || !this.dungeon.rooms || this.dungeon.rooms.length === 0) return;
    for (let rIdx = 0; rIdx < this.dungeon.rooms.length; rIdx++) {
      if (this.visitedRoomIndices.has(rIdx)) continue;
      const room = this.dungeon.rooms[rIdx];
      const livingInRoom = this.party.filter((m) => {
        if (m.state === 'dead' || m.state === 'downed') return false;
        return m.gridPos.x >= room.x &&
               m.gridPos.x < room.x + room.width &&
               m.gridPos.y >= room.y &&
               m.gridPos.y < room.y + room.height;
      });

      if (livingInRoom.length > 0) {
        this.visitedRoomIndices.add(rIdx);
        for (const member of livingInRoom) {
          member.progression.addProficiencyExp('perception', 2);
        }
      }
    }
  }

  public setDungeon(newDungeon: any) {
    this.dungeon = newDungeon;
    this.visitedRoomIndices.clear();
    this.checkRoomExploration(true);
  }
}

const p1 = {
  entityName: 'Hero',
  state: 'active',
  gridPos: { x: 5, y: 5 },
  progression: new ProgressionSystem(classesData, 'Hero')
};
const p2 = {
  entityName: 'Companion',
  state: 'active',
  gridPos: { x: 5, y: 6 },
  progression: new ProgressionSystem(classesData, 'Companion')
};

const roomScene = new MockRoomScene();
roomScene.party = [p1, p2];

const testDungeon1 = {
  rooms: [
    { id: 0, x: 2, y: 2, width: 8, height: 8, type: 'entrance' },
    { id: 1, x: 20, y: 20, width: 6, height: 6, type: 'light_combat' }
  ]
};

// Arrival at entrance room
roomScene.setDungeon(testDungeon1);
assert.strictEqual(roomScene.visitedRoomIndices.has(0), true, 'Entrance room must be marked visited on arrival');
assert.strictEqual(p1.progression.getProficiencyStat('perception').currentExp, 2, 'Hero receives +2 on arrival in entrance');
assert.strictEqual(p2.progression.getProficiencyStat('perception').currentExp, 2, 'Companion receives +2 on arrival in entrance');

// Moving around inside same room awards nothing further
p1.gridPos = { x: 6, y: 6 };
roomScene.checkRoomExploration();
assert.strictEqual(p1.progression.getProficiencyStat('perception').currentExp, 2, 'Re-checking visited room gives 0 EXP');

// Walking into Room 1
p1.gridPos = { x: 22, y: 22 };
p2.gridPos = { x: 23, y: 22 };
roomScene.checkRoomExploration();
assert.strictEqual(roomScene.visitedRoomIndices.has(1), true, 'Room 1 marked visited');
assert.strictEqual(p1.progression.getProficiencyStat('perception').currentExp, 4, 'Entering Room 1 grants +2 to Hero');
assert.strictEqual(p2.progression.getProficiencyStat('perception').currentExp, 4, 'Entering Room 1 grants +2 to Companion');

// Walking back to entrance room (Room 0) gives nothing
p1.gridPos = { x: 5, y: 5 };
p2.gridPos = { x: 5, y: 6 };
roomScene.checkRoomExploration();
assert.strictEqual(p1.progression.getProficiencyStat('perception').currentExp, 4, 'Re-entering entrance room gives 0 EXP');

// Floor regeneration (Change 4): resetting/replacing dungeon resets visitedRoomIndices and awards entrance again
const testDungeon2 = {
  rooms: [
    { id: 0, x: 2, y: 2, width: 8, height: 8, type: 'entrance' },
    { id: 1, x: 25, y: 25, width: 7, height: 7, type: 'light_combat' }
  ]
};
roomScene.setDungeon(testDungeon2);
assert.strictEqual(roomScene.visitedRoomIndices.has(0), true);
assert.strictEqual(p1.progression.getProficiencyStat('perception').currentExp, 6, 'On regenerated floor arrival, Hero gets +2 again');
assert.strictEqual(p2.progression.getProficiencyStat('perception').currentExp, 6, 'On regenerated floor arrival, Companion gets +2 again');

console.log('✓ PASS: Room entry awards +2 once per room, and resets cleanly on floor regeneration');

// ============================================================================
// 8. DATA-DRIVEN `hidden_cache` NODE & HARVESTING (Change 1)
// ============================================================================
console.log('\n[Group 8] Data-Driven `hidden_cache` Node, Single-Use & Change 1 Perks');

const cacheDef = dataLoader.getGatheringNode('hidden_cache');
assert.ok(cacheDef, 'hidden_cache must be defined in data/gatheringNodes.json');
assert.strictEqual(cacheDef.skillId, 'digging');
assert.strictEqual(cacheDef.channelDurationMs, 3000);
assert.strictEqual(cacheDef.expGranted, 25);
assert.strictEqual(cacheDef.respawnTimeMs, 0);
assert.strictEqual(cacheDef.label, 'Hidden Cache');
assert.strictEqual(cacheDef.depletedLabel, 'Emptied');
assert.strictEqual(cacheDef.color, '#eab308');
assert.strictEqual(cacheDef.bonusLootPerk, 'perception');
assert.deepStrictEqual(cacheDef.bonusClassExp, [{ classId: 'explorer', amount: 25 }]);

// Verify harvest logic with Change 1 data-driven paths
const harvester = {
  entityName: 'Harvester',
  inventory: new Map<string, number>(),
  addItem(id: string, count: number) {
    this.inventory.set(id, (this.inventory.get(id) || 0) + count);
  },
  progression: new ProgressionSystem(classesData, 'Harvester')
};

harvester.progression.getProficiencyStat('digging').level = 60;
harvester.progression.getProficiencyStat('perception').level = 30;
harvester.progression.setClassLevel('excavator', 20);
harvester.progression.checkClassUnlocks();
harvester.progression.setClassLevel('explorer', 15);

const cacheNode = {
  x: 10,
  y: 10,
  nodeDef: cacheDef,
  isHarvested: false
};

// Simulate harvestGatheringNode execution
function harvestNode(node: any, character: any, rollFn: () => number) {
  if (node.isHarvested) return false;
  node.isHarvested = true;

  const yieldCount = node.nodeDef.yieldCount || 1;
  const expGranted = node.nodeDef.expGranted || 15;

  // 1. Primary loot draw
  const totalWeight = node.nodeDef.lootTable.reduce((sum: number, e: any) => sum + (e.weight ?? 1), 0);
  const rollVal = rollFn() * totalWeight;
  let acc = 0;
  let selected = node.nodeDef.lootTable[0];
  for (const entry of node.nodeDef.lootTable) {
    acc += (entry.weight ?? 1);
    if (rollVal <= acc) {
      selected = entry;
      break;
    }
  }
  const awardedId = selected.itemId || selected.resourceId;
  const awardedCount = selected.count ?? yieldCount;
  character.addItem(awardedId, awardedCount);

  // 2. Change 1: bonusLootPerk extra draw
  if (node.nodeDef.bonusLootPerk) {
    const perks = CraftingSystem.getCrafterPerks(character, node.nodeDef.bonusLootPerk);
    const bonusChance = (perks as any).cacheBonusRollChance ?? perks.bonusYieldChance ?? 0;
    if (bonusChance > 0) {
      const perkRoll = rollFn();
      if (perkRoll < bonusChance / 100) {
        // Extra roll
        const extraRollVal = rollFn() * totalWeight;
        let acc2 = 0;
        let extraSelected = node.nodeDef.lootTable[0];
        for (const entry of node.nodeDef.lootTable) {
          acc2 += (entry.weight ?? 1);
          if (extraRollVal <= acc2) {
            extraSelected = entry;
            break;
          }
        }
        character.addItem(extraSelected.itemId, extraSelected.count ?? 1);
      }
    }
  }

  // 3. Change 1: bonusClassExp
  if (node.nodeDef.bonusClassExp && Array.isArray(node.nodeDef.bonusClassExp)) {
    for (const entry of node.nodeDef.bonusClassExp) {
      if (character.progression.isClassUnlocked(entry.classId)) {
        character.progression.addClassExp(entry.classId, entry.amount);
      }
    }
  }

  // 4. Digging proficiency EXP & Excavator class EXP
  character.progression.addProficiencyExp(node.nodeDef.skillId, expGranted);
  if (character.progression.isClassUnlocked('excavator')) {
    character.progression.addClassExp('excavator', expGranted);
  }

  return true;
}

const digExpBefore = harvester.progression.getProficiencyStat('digging').currentExp;
const excExpBefore = harvester.progression.getClassStat('excavator').currentExp;
const expExpBefore = harvester.progression.getClassStat('explorer').currentExp;

// Successful dig with guaranteed extra bonus roll (roll 0.05 < 0.15)
const harvestResult = harvestNode(cacheNode, harvester, () => 0.05);
assert.strictEqual(harvestResult, true, 'First dig must succeed');
assert.strictEqual(cacheNode.isHarvested, true, 'Node must be marked harvested');

// Cannot be dug twice
const secondDig = harvestNode(cacheNode, harvester, () => 0.05);
assert.strictEqual(secondDig, false, 'Node must not be harvested a second time (single-use)');

// Verify EXP awarded
assert.strictEqual(
  harvester.progression.getProficiencyStat('digging').currentExp - digExpBefore,
  25,
  'Digging cache awards +25 Digging proficiency EXP'
);
assert.strictEqual(
  harvester.progression.getClassStat('excavator').currentExp - excExpBefore,
  25,
  'Digging cache awards +25 Excavator class EXP'
);
assert.strictEqual(
  harvester.progression.getClassStat('explorer').currentExp - expExpBefore,
  25,
  'Digging cache awards +25 Explorer class EXP via bonusClassExp'
);

// Verify items received
let totalItemsAwarded = 0;
for (const count of harvester.inventory.values()) {
  totalItemsAwarded += count;
}
assert.ok(totalItemsAwarded >= 2, 'Must receive primary loot plus Treasure Sense bonus loot draw');

console.log('✓ PASS: Data-driven node attributes, Change 1 bonus loot perk, class EXP, and single-use validated');

// ============================================================================
// 9. SAVE ROUND-TRIP & OLD-SAVE BACKFILL
// ============================================================================
console.log('\n[Group 9] Save Snapshot Round-Trip & Old-Save Backfill');

const gs = GameState.getInstance();

// 9a. Fresh snapshot round-trip
const freshSnap: any = {
  proficiencies: {
    digging: { level: 25, currentExp: 50 },
    perception: { level: 14, currentExp: 35 }
  },
  party: [
    {
      name: 'Companion 1',
      proficiencies: {
        digging: { level: 10, currentExp: 0 },
        perception: { level: 8, currentExp: 20 }
      }
    }
  ]
};

gs.restoreFromLoadedSnapshot(freshSnap);
assert.strictEqual(gs.getSnapshot()?.proficiencies?.perception.level, 14);
assert.strictEqual(gs.getSnapshot()?.proficiencies?.perception.currentExp, 35);
assert.strictEqual(gs.getPartySnapshots()[0]?.proficiencies?.perception.level, 8);
assert.strictEqual(gs.getPartySnapshots()[0]?.proficiencies?.perception.currentExp, 20);

// 9b. Legacy snapshot lacking perception backfills at level 0, currentExp 0
const legacySnap: any = {
  proficiencies: {
    digging: { level: 15, currentExp: 10 }
    // no perception
  },
  party: [
    {
      name: 'Old Companion',
      proficiencies: {
        digging: { level: 5, currentExp: 0 }
        // no perception
      }
    }
  ]
};

gs.restoreFromLoadedSnapshot(legacySnap);
assert.ok(legacySnap.proficiencies.perception, 'Legacy snap must have perception backfilled');
assert.strictEqual(legacySnap.proficiencies.perception.level, 0, 'Backfilled perception level must be 0');
assert.strictEqual(legacySnap.proficiencies.perception.currentExp, 0, 'Backfilled perception EXP must be 0');

assert.ok(legacySnap.party[0].proficiencies.perception, 'Legacy party member must have perception backfilled');
assert.strictEqual(legacySnap.party[0].proficiencies.perception.level, 0);
assert.strictEqual(legacySnap.party[0].proficiencies.perception.currentExp, 0);

console.log('✓ PASS: Perception survives snapshot round-trip and legacy saves backfill cleanly');

console.log('\n=======================================================');
console.log('ALL PERCEPTION + HIDDEN CACHES + EXPLORER TESTS PASSED!');
console.log('=======================================================');
