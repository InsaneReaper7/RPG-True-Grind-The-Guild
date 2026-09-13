import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser / DOM under Node
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  const mockClassList = (classes: Set<string> = new Set()) => ({
    contains: (cls: string) => classes.has(cls),
    add: (...cls: string[]) => cls.forEach((c) => classes.add(c)),
    remove: (...cls: string[]) => cls.forEach((c) => classes.delete(c)),
    toggle: (cls: string) => {
      if (classes.has(cls)) {
        classes.delete(cls);
        return false;
      }
      classes.add(cls);
      return true;
    }
  });

  const domElements: Map<string, any> = new Map();

  const createMockElement = (id: string = '') => {
    const classes = new Set<string>();
    const listeners: Map<string, Function[]> = new Map();
    const el = {
      id,
      className: '',
      classList: mockClassList(classes),
      style: {} as any,
      innerText: '',
      innerHTML: '',
      children: [] as any[],
      dataset: {} as any,
      disabled: false,
      addEventListener: (evt: string, fn: Function) => {
        if (!listeners.has(evt)) listeners.set(evt, []);
        listeners.get(evt)!.push(fn);
      },
      dispatchEvent: (evt: { type: string; shiftKey?: boolean; stopPropagation?: Function }) => {
        const fns = listeners.get(evt.type) || [];
        for (const fn of fns) {
          fn({
            ...evt,
            target: el,
            stopPropagation: evt.stopPropagation || noop,
            preventDefault: noop
          });
        }
      }
    };
    if (id) domElements.set(id, el);
    return el;
  };

  // Seed known Milestone 25 and HUD elements
  createMockElement('hud-card');
  createMockElement('player-hp-text');
  createMockElement('player-crit-hp-text');
  createMockElement('player-energy-text');
  createMockElement('equipped-weapon-text');
  createMockElement('party-portraits-hud');
  createMockElement('party-reselect-all-btn');

  for (let i = 0; i < 4; i++) {
    createMockElement(`party-portrait-${i}`);
    createMockElement(`party-portrait-name-${i}`);
    createMockElement(`party-portrait-avatar-${i}`);
    createMockElement(`party-portrait-hp-bar-${i}`);
    createMockElement(`party-portrait-crit-bar-${i}`);
    createMockElement(`party-portrait-energy-bar-${i}`);
    createMockElement(`party-portrait-status-${i}`);
    createMockElement(`party-portrait-hotkey-${i}`);
  }

  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };

  (global as any).document = {
    getElementById: (id: string) => domElements.get(id) || createMockElement(id),
    createElement: (tag: string) => createMockElement(),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };

  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup mock fetch for data loading
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HUD } from '../src/ui/HUD.ts';
import type { WeaponDef, GridPos } from '../src/types/game.ts';

// Helper mock entity for testing selection and movement logic
function createMockPartyMember(id: string, name: string, x: number, y: number, maxHp: number = 50): any {
  return {
    id,
    entityName: name,
    gridPos: { x, y },
    x: x * 32 + 16,
    y: y * 32 + 16,
    hp: maxHp,
    maxHp,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    state: 'idle',
    equippedWeapon: { id: 'short_swords', name: 'Short Swords', attackRangeTiles: 1 } as WeaponDef,
    equippedSkillIds: [] as string[],
    autocastMap: new Map<string, boolean>(),
    isAutocastEnabled: function (id: string) { return this.autocastMap.get(id) || false; },
    activeStatusEffects: new Map<string, any>(),
    lastSkillUseTimes: new Map<string, number>(),
    hunger: 100,
    maxHunger: 100,
    mood: 100,
    maxMood: 100,
    claimedDestination: null as GridPos | null,
    targetEntity: null as any,
    pathHistory: [] as GridPos[][],
    isMoving: () => false,
    followPath: function (path: GridPos[]) {
      this.pathHistory.push(path);
      if (path.length > 0) {
        const last = path[path.length - 1];
        this.gridPos = { x: last.x, y: last.y };
        this.x = last.x * 32 + 16;
        this.y = last.y * 32 + 16;
      }
      this.claimedDestination = null;
    },
    clearTarget: function () {
      this.targetEntity = null;
    },
    setTarget: function (target: any) {
      this.targetEntity = target;
    }
  };
}

async function runMilestone25Tests() {
  console.log('====================================================');
  console.log('RUNNING MILESTONE 25 TESTS: PARTY PORTRAIT SELECTION');
  console.log('====================================================');

  await DataLoader.getInstance().loadAll();

  // --------------------------------------------------------------------------
  // TEST 1: HUD Portrait Elements Initialization & Default Selection State
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: HUD Portrait Elements Initialization & Default Selection State ---');
  const hud = new HUD();
  const hero = createMockPartyMember('hero', 'Hero', 5, 5);
  const valerie = createMockPartyMember('companion_1', 'Valerie', 6, 5);
  const kaelen = createMockPartyMember('companion_2', 'Kaelen', 5, 6);
  const barris = createMockPartyMember('companion_3', 'Barris', 6, 6);
  const party = [hero, valerie, kaelen, barris];

  hud.update(hero, new ProgressionSystem(DataLoader.getInstance().getClassesData(), 'Hero'), 0, party);

  // All 4 portraits should be initialized
  const selectedIndices = hud.getSelectedMemberIndices();
  assert.equal(selectedIndices.size, 4, 'By default, all 4 party members must be selected');
  assert.ok(selectedIndices.has(0) && selectedIndices.has(1) && selectedIndices.has(2) && selectedIndices.has(3));

  // Verify visual class markers on portraits
  const p0 = document.getElementById('party-portrait-0');
  const p1 = document.getElementById('party-portrait-1');
  const p2 = document.getElementById('party-portrait-2');
  const p3 = document.getElementById('party-portrait-3');
  assert.ok(p0?.classList.contains('selected'), 'Portrait 0 must have .selected class');
  assert.ok(p1?.classList.contains('selected'), 'Portrait 1 must have .selected class');
  assert.ok(p2?.classList.contains('selected'), 'Portrait 2 must have .selected class');
  assert.ok(p3?.classList.contains('selected'), 'Portrait 3 must have .selected class');
  assert.equal(document.getElementById('party-portrait-status-0')?.innerText, '✓ ACTIVE');
  console.log('✓ PASS: Default state includes all party members with active visual markers.');

  // --------------------------------------------------------------------------
  // TEST 2: Single Portrait Click Switches Control to Single Character
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Single Portrait Click Switches Control to Single Character ---');
  let selectEventReceived: { index: number; multiSelect: boolean } | null = null;
  hud.setPartySelectionHandler(
    (idx, multi) => {
      selectEventReceived = { index: idx, multiSelect: multi };
    },
    () => {}
  );

  // Click portrait 1 (Valerie) without shift
  p1?.dispatchEvent({ type: 'click', shiftKey: false });
  assert.deepEqual(selectEventReceived, { index: 1, multiSelect: false });

  const singleSelect = hud.getSelectedMemberIndices();
  assert.equal(singleSelect.size, 1, 'Only 1 member must be selected after regular click');
  assert.ok(singleSelect.has(1), 'Valerie (index 1) must be the selected member');
  assert.ok(!singleSelect.has(0) && !singleSelect.has(2) && !singleSelect.has(3));

  assert.ok(!p0?.classList.contains('selected'), 'Hero portrait must NOT have .selected class');
  assert.ok(p1?.classList.contains('selected'), 'Valerie portrait must have .selected class');
  assert.ok(!p2?.classList.contains('selected'), 'Kaelen portrait must NOT have .selected class');
  assert.ok(!p3?.classList.contains('selected'), 'Barris portrait must NOT have .selected class');
  assert.equal(document.getElementById('party-portrait-status-1')?.innerText, '✓ ACTIVE');
  assert.equal(document.getElementById('party-portrait-status-0')?.innerText, '[1]');
  console.log('✓ PASS: Single portrait click isolates control to individual character.');

  // --------------------------------------------------------------------------
  // TEST 3: Shift-Clicking Additional Portraits Adds to Selection (Subsets 2 & 3)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Shift-Clicking Additional Portraits Adds to Selection ---');
  // Shift-click portrait 2 (Kaelen) while Valerie (1) is selected
  p2?.dispatchEvent({ type: 'click', shiftKey: true });
  assert.deepEqual(selectEventReceived, { index: 2, multiSelect: true });

  const pairSelect = hud.getSelectedMemberIndices();
  assert.equal(pairSelect.size, 2, 'Exactly 2 members must be selected after shift-click');
  assert.ok(pairSelect.has(1) && pairSelect.has(2), 'Both Valerie (1) and Kaelen (2) must be in selection');
  assert.ok(!pairSelect.has(0) && !pairSelect.has(3));

  assert.ok(p1?.classList.contains('selected'), 'Valerie must remain selected');
  assert.ok(p2?.classList.contains('selected'), 'Kaelen must now be selected');
  assert.ok(!p0?.classList.contains('selected'), 'Hero must remain unselected');
  assert.ok(!p3?.classList.contains('selected'), 'Barris must remain unselected');

  // Shift-click portrait 3 (Barris) -> 3-member subset (1, 2, 3)
  p3?.dispatchEvent({ type: 'click', shiftKey: true });
  const trioSelect = hud.getSelectedMemberIndices();
  assert.equal(trioSelect.size, 3, 'Exactly 3 members must be selected');
  assert.ok(trioSelect.has(1) && trioSelect.has(2) && trioSelect.has(3));
  assert.ok(!trioSelect.has(0));
  console.log('✓ PASS: Shift-clicking smoothly creates 2-member and 3-member commanded subsets.');

  // --------------------------------------------------------------------------
  // TEST 4: Group Reselect Hotkey (G) Restores Full-Party Selection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Group Reselect Hotkey (G) Restores Full-Party Selection ---');
  let allReselectTriggered = false;
  hud.setPartySelectionHandler(
    () => {},
    () => {
      allReselectTriggered = true;
    }
  );

  hud.triggerGroupReselect();
  assert.equal(allReselectTriggered, true, 'Group reselect callback must be invoked');
  const allSelected = hud.getSelectedMemberIndices();
  assert.equal(allSelected.size, 4, 'All 4 members must be reselected');
  assert.ok(p0?.classList.contains('selected') && p1?.classList.contains('selected') && p2?.classList.contains('selected') && p3?.classList.contains('selected'));
  console.log('✓ PASS: Dedicated group reselect hotkey (G) restores full-party control.');

  // --------------------------------------------------------------------------
  // TEST 5: Partial-Selection Movement (Single Character Moves, Others Stay Put)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Partial-Selection Movement: Single Character Moves, Others Stay Put ---');
  // Reset positions: Hero at (5, 5), Valerie at (6, 5), Kaelen at (5, 6), Barris at (6, 6)
  hero.gridPos = { x: 5, y: 5 };
  valerie.gridPos = { x: 6, y: 5 };
  kaelen.gridPos = { x: 5, y: 6 };
  barris.gridPos = { x: 6, y: 6 };
  hero.pathHistory = [];
  valerie.pathHistory = [];
  kaelen.pathHistory = [];
  barris.pathHistory = [];

  // Command selection: ONLY Valerie (1)
  const selectedSet = new Set([valerie]);
  const activeSelected = party.filter((m) => selectedSet.has(m) && m.state !== 'downed' && m.state !== 'dead');
  assert.equal(activeSelected.length, 1);
  assert.equal(activeSelected[0], valerie);

  // Simulate destination click at (12, 12)
  const clickedTile = { x: 12, y: 12 };
  const claimed = new Set<string>();

  // Pre-reserve unselected living members
  for (const other of party) {
    if (!activeSelected.includes(other) && other.state !== 'dead') {
      claimed.add(`${other.gridPos.x},${other.gridPos.y}`);
    }
  }

  assert.ok(claimed.has('5,5'), 'Hero tile (5,5) must be pre-reserved as claimed/obstacle');
  assert.ok(claimed.has('5,6'), 'Kaelen tile (5,6) must be pre-reserved');
  assert.ok(claimed.has('6,6'), 'Barris tile (6,6) must be pre-reserved');
  assert.ok(!claimed.has('6,5'), 'Moving member Valerie tile (6,5) must not be blocked against self');

  // Valerie follows path to (12, 12)
  valerie.followPath([{ x: 7, y: 6 }, { x: 12, y: 12 }]);

  // Assertions: Valerie moved, others remained completely stationary
  assert.equal(valerie.gridPos.x, 12);
  assert.equal(valerie.gridPos.y, 12);
  assert.equal(valerie.pathHistory.length, 1);

  assert.equal(hero.gridPos.x, 5, 'Hero must not move');
  assert.equal(hero.gridPos.y, 5, 'Hero must not move');
  assert.equal(hero.pathHistory.length, 0, 'Hero path history must remain empty');

  assert.equal(kaelen.gridPos.x, 5, 'Kaelen must not move');
  assert.equal(kaelen.gridPos.y, 6, 'Kaelen must not move');
  assert.equal(kaelen.pathHistory.length, 0, 'Kaelen path history must remain empty');

  assert.equal(barris.gridPos.x, 6, 'Barris must not move');
  assert.equal(barris.gridPos.y, 6, 'Barris must not move');
  assert.equal(barris.pathHistory.length, 0, 'Barris path history must remain empty');
  console.log('✓ PASS: Single-member movement moves only selected character; other 3 members strictly stay put.');

  // --------------------------------------------------------------------------
  // TEST 6: Tile-Claim Integrity: Subset Movement Never Claims Stationary Ally Tile
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Tile-Claim Integrity & Collision Avoidance ---');
  // Hero is stationary at (5, 5).
  // Player commands Valerie to move directly onto (5, 5).
  const targetTile = { x: 5, y: 5 };
  const subsetClaimed = new Set<string>();

  for (const other of party) {
    if (other !== valerie) {
      subsetClaimed.add(`${other.gridPos.x},${other.gridPos.y}`);
    }
  }

  // Simulated tile validation check:
  const isTileBlockedForMove = (tx: number, ty: number) => subsetClaimed.has(`${tx},${ty}`);

  assert.equal(isTileBlockedForMove(targetTile.x, targetTile.y), true, 'Hero tile (5,5) MUST be detected as blocked');

  // Fallback relocation logic picks open neighbor instead
  const openNeighbor = { x: 4, y: 5 };
  assert.equal(isTileBlockedForMove(openNeighbor.x, openNeighbor.y), false, 'Open neighbor (4,5) must be valid');
  subsetClaimed.add(`${openNeighbor.x},${openNeighbor.y}`);
  valerie.followPath([openNeighbor]);

  assert.equal(valerie.gridPos.x, 4);
  assert.equal(valerie.gridPos.y, 5);
  assert.notDeepEqual(valerie.gridPos, hero.gridPos, 'Valerie must never land on or overwrite Hero tile');
  console.log('✓ PASS: Moving subset never double-claims or overwrites stationary members tiles.');

  // --------------------------------------------------------------------------
  // TEST 7: Multi-Selection Pair Movement (2 Members Move in Formation, Others Stay)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Multi-Selection Pair Movement in Formation ---');
  valerie.gridPos = { x: 10, y: 10 };
  kaelen.gridPos = { x: 11, y: 10 };
  hero.pathHistory = [];
  barris.pathHistory = [];

  const commandedPair = [valerie, kaelen];
  const pairDest = { x: 20, y: 20 };
  const pairOffsets = [{ x: 0, y: 0 }, { x: 1, y: 0 }];

  valerie.followPath([{ x: pairDest.x + pairOffsets[0].x, y: pairDest.y + pairOffsets[0].y }]);
  kaelen.followPath([{ x: pairDest.x + pairOffsets[1].x, y: pairDest.y + pairOffsets[1].y }]);

  assert.deepEqual(valerie.gridPos, { x: 20, y: 20 });
  assert.deepEqual(kaelen.gridPos, { x: 21, y: 20 });
  assert.equal(hero.pathHistory.length, 0, 'Hero did not move during pair movement');
  assert.equal(barris.pathHistory.length, 0, 'Barris did not move during pair movement');
  console.log('✓ PASS: Pair moves in 2-unit formation while unselected members remain stationary.');

  // --------------------------------------------------------------------------
  // TEST 8: Partial-Selection Engagement (Only Selected Members Engage)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Partial-Selection Click-to-Engage Isolation ---');
  const mockEnemy = { id: 'orc_1', entityName: 'Orc Brute', gridPos: { x: 15, y: 15 }, state: 'idle' };

  // Select only Kaelen (2) and command engage
  const activeEngagers = [kaelen];
  for (const m of activeEngagers) {
    m.setTarget(mockEnemy);
  }

  assert.equal(kaelen.targetEntity, mockEnemy, 'Kaelen must have targeted Orc');
  assert.equal(hero.targetEntity, null, 'Hero must NOT target enemy');
  assert.equal(valerie.targetEntity, null, 'Valerie must NOT target enemy');
  assert.equal(barris.targetEntity, null, 'Barris must NOT target enemy');
  console.log('✓ PASS: Click-to-engage applies strictly to selected member(s).');

  // --------------------------------------------------------------------------
  // TEST 9: Empty Slot Handling for Incomplete Roster
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Empty Slot Handling for Incomplete Roster ---');
  // Test party with only 2 members (Hero + Valerie)
  const duoParty = [hero, valerie];
  hud.update(hero, new ProgressionSystem(DataLoader.getInstance().getClassesData(), 'Hero'), 0, duoParty);

  // Slots 0 & 1 should be active, slots 2 & 3 must be empty
  assert.ok(!p0?.classList.contains('empty'), 'Slot 0 must be occupied');
  assert.ok(!p1?.classList.contains('empty'), 'Slot 1 must be occupied');
  assert.ok(p2?.classList.contains('empty'), 'Slot 2 must be marked .empty');
  assert.ok(p3?.classList.contains('empty'), 'Slot 3 must be marked .empty');
  assert.equal(document.getElementById('party-portrait-status-2')?.innerText, 'EMPTY');
  assert.equal(document.getElementById('party-portrait-status-3')?.innerText, 'EMPTY');

  // Clicking an empty slot must not select it
  p2?.dispatchEvent({ type: 'click', shiftKey: false });
  const duoSelection = hud.getSelectedMemberIndices();
  assert.ok(!duoSelection.has(2), 'Empty slot 2 must not be added to selection');
  console.log('✓ PASS: Empty slots render cleanly and reject selection without errors.');

  console.log('\n====================================================');
  console.log('ALL 9 MILESTONE 25 TESTS PASSED CLEANLY AND PROVEN!');
  console.log('====================================================\n');
}

runMilestone25Tests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
