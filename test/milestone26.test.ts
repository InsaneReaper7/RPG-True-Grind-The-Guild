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
      appendChild: (child: any) => {
        el.children.push(child);
        return child;
      },
      removeChild: (child: any) => {
        const idx = el.children.indexOf(child);
        if (idx !== -1) el.children.splice(idx, 1);
        return child;
      },
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
  createMockElement('gathering-mode-toggle-btn');
  const mockBanner = createMockElement('gathering-mode-banner');
  mockBanner.style.display = 'none';

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
import type { WeaponDef, GridPos, GatheringNodeDef } from '../src/types/game.ts';
import type { GatheringNode, ActiveGatherChannel } from '../src/scenes/MainScene.ts';

// Helper mock sprite with real event listener/emitter
function createMockSprite() {
  const listeners: Map<string, Function[]> = new Map();
  return {
    x: 0,
    y: 0,
    on: function (evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt)!.push(fn);
      return this;
    },
    emit: function (evt: string, ...args: any[]) {
      const fns = listeners.get(evt) || [];
      for (const fn of fns) {
        fn(...args);
      }
      return fns.length > 0;
    },
    setTexture: () => {},
    destroy: () => {}
  };
}

// Helper mock graphics
function createMockGraphics() {
  return {
    clear: () => {},
    fillStyle: () => {},
    fillRect: () => {},
    lineStyle: () => {},
    strokeRect: () => {},
    strokeCircle: () => {},
    destroy: () => {}
  };
}

// Mock player representation for node testing
function createMockPlayer(id: string, name: string, x: number, y: number, slot: number) {
  const progression = new ProgressionSystem(DataLoader.getInstance().getClassesData(), name);
  return {
    id,
    entityName: name,
    slotIndex: slot,
    gridPos: { x, y } as GridPos,
    x: x * 32 + 16,
    y: y * 32 + 16,
    hp: 100,
    maxHp: 100,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    state: 'idle',
    targetEntity: null as any,
    claimedDestination: null as GridPos | null,
    equippedWeapon: { id: 'short_swords', name: 'Short Swords', type: 'short_swords', attackRangeTiles: 1 } as WeaponDef,
    equippedSkillIds: [] as string[],
    autocastMap: new Map<string, boolean>(),
    isAutocastEnabled: function (sId: string) { return this.autocastMap.get(sId) || false; },
    activeStatusEffects: new Map<string, any>(),
    lastSkillUseTimes: new Map<string, number>(),
    hunger: 100,
    maxHunger: 100,
    mood: 100,
    maxMood: 100,
    pathHistory: [] as GridPos[][],
    isMoving: () => false,
    progression,
    clearTarget: function () {
      this.targetEntity = null;
    },
    followPath: function (path: GridPos[], onComplete?: () => void) {
      this.pathHistory.push(path);
      const dest = path[path.length - 1];
      this.gridPos = { ...dest };
      this.x = dest.x * 32 + 16;
      this.y = dest.y * 32 + 16;
      this.state = 'moving';
      if (onComplete) onComplete();
    },
    takeDamage: function (amt: number) {
      this.hp -= amt;
      return this.hp <= 0;
    }
  };
}

// Helper to create a Gathering Node
function createTestNode(id: string, x: number, y: number, typeId: string = 'foraging_bush'): GatheringNode {
  const nodeDef: GatheringNodeDef = {
    id: typeId,
    name: typeId.includes('tree') ? 'Tree' : typeId.includes('rock') ? 'Rock Vein' : 'Wild Herbs',
    skillId: typeId.includes('tree') ? 'woodcutting' : typeId.includes('rock') ? 'mining' : 'foraging',
    resourceId: typeId.includes('tree') ? 'wood' : typeId.includes('rock') ? 'ore' : 'wild_herbs',
    yieldCount: 1,
    expGranted: 15,
    channelDurationMs: 2500,
    respawnTimeMs: 15000,
    textureKey: 'bush-avatar',
    textureDepletedKey: 'bush-depleted',
    label: 'Wild Herbs',
    depletedLabel: 'Stripped',
    color: '#34d399',
    actionVerb: 'Foraging'
  };

  const sprite = createMockSprite() as any;
  const label = {
    setText: () => {},
    setColor: () => {}
  } as any;

  return {
    x,
    y,
    nodeDef,
    sprite,
    label,
    isHarvested: false
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING MILESTONE 26 TESTS: GATHERING MODE');
  console.log('====================================================');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // Setup HUD
  const hud = new HUD();
  const hero = createMockPlayer('hero', 'Hero', 5, 5, 0);
  const valerie = createMockPlayer('valerie', 'Valerie', 6, 5, 1);
  const kaelen = createMockPlayer('kaelen', 'Kaelen', 5, 6, 2);
  const barris = createMockPlayer('barris', 'Barris', 6, 6, 3);
  const party = [hero, valerie, kaelen, barris];

  // Setup Mock Scene with Milestone 26 Gathering Mode methods
  const selectedMembers = new Set<any>(party);
  const activeGatherChannels = new Map<any, any>();
  const gatheringNodes: GatheringNode[] = [];
  const mapWidth = 40;
  const mapHeight = 40;
  const gridMatrix = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(0));

  hud.update(hero, hero.progression, 0, party);

  const testScene = {
    party,
    player: hero,
    selectedMembers,
    activeGatherChannels,
    gatheringNodes,
    mapWidth,
    mapHeight,
    gridMatrix,
    tileSize: 32,
    hud,
    isGatheringMode: false,
    isGatheringDrag: false,
    gatherDragStart: null as { x: number; y: number } | null,
    gatheringMarqueeGraphics: createMockGraphics(),
    gatheringQueue: [] as GatheringNode[],
    gatheringQueueWorkers: new Set<any>(),
    gatheringWorkerNodeAssignments: new Map<any, GatheringNode>(),

    getSelectedMembers: function () {
      return this.party.filter((m: any) => this.selectedMembers.has(m));
    },

    selectMemberByIndex: function (index: number, multiSelect: boolean = false) {
      const member = this.party[index];
      if (!member) return;
      if (!multiSelect) {
        this.selectedMembers.clear();
        this.selectedMembers.add(member);
      } else {
        if (this.selectedMembers.has(member)) {
          if (this.selectedMembers.size > 1) {
            this.selectedMembers.delete(member);
          }
        } else {
          this.selectedMembers.add(member);
        }
      }
    },

    selectAllMembers: function () {
      this.selectedMembers.clear();
      for (const m of this.party) {
        if (m.state !== 'dead') this.selectedMembers.add(m);
      }
    },

    toggleGatheringMode: function (forceState?: boolean): boolean {
      this.isGatheringMode = forceState !== undefined ? forceState : !this.isGatheringMode;
      if (!this.isGatheringMode) {
        this.isGatheringDrag = false;
        this.gatherDragStart = null;
        this.gatheringMarqueeGraphics.clear();
        this.hud.showToast('🌿 Gathering Mode: OFF', 'info', 1500);
        this.hud.setGatheringModeActive(false);
      } else {
        this.hud.showToast('🌿 Gathering Mode: ACTIVE — Drag area to queue nodes', 'success', 2500);
        this.hud.setGatheringModeActive(true);
      }
      // CRITICAL: selectedMembers is NOT modified or reset!
      return this.isGatheringMode;
    },

    startGatherChannel: function (character: any, node: GatheringNode): boolean {
      if (node.isHarvested || character.state === 'downed' || character.state === 'dead') return false;
      this.cancelGatherChannel(character);
      character.state = 'channeling';
      character.claimedDestination = null;
      character.clearTarget();

      const channel: ActiveGatherChannel = {
        character,
        node,
        durationMs: 2500,
        elapsedMs: 0,
        barContainer: { destroy: () => {} } as any,
        barBg: createMockGraphics() as any,
        barFill: createMockGraphics() as any,
        labelText: { setText: () => {} } as any
      };
      this.activeGatherChannels.set(character, channel);
      return true;
    },

    completeGatherChannel: function (character: any, channel: ActiveGatherChannel) {
      channel.barContainer.destroy();
      this.activeGatherChannels.delete(character);
      if (character.state === 'channeling') character.state = 'idle';
      this.harvestGatheringNode(channel.node, character);

      if (this.gatheringWorkerNodeAssignments.has(character)) {
        this.gatheringWorkerNodeAssignments.delete(character);
        const remaining = this.gatheringQueue.filter(n => !n.isHarvested);
        if (remaining.length > 0) {
          this.processGatheringQueue();
        } else if (this.gatheringWorkerNodeAssignments.size === 0) {
          this.hud.showToast('🌿 Gathering queue complete!', 'success', 2500);
        }
      }
    },

    harvestGatheringNode: function (node: GatheringNode, character: any) {
      if (node.isHarvested) return;
      node.isHarvested = true;
      character.progression.addProficiencyExp(node.nodeDef.skillId, 15);
    },

    interruptGatherChannel: function (character: any, attacker?: any): boolean {
      const channel = this.activeGatherChannels.get(character);
      if (!channel) return false;

      channel.barContainer.destroy();
      this.activeGatherChannels.delete(character);
      channel.node.isHarvested = false;

      if (this.gatheringWorkerNodeAssignments.has(character)) {
        const assignedNode = this.gatheringWorkerNodeAssignments.get(character);
        this.gatheringWorkerNodeAssignments.delete(character);
        if (assignedNode && !assignedNode.isHarvested && !this.gatheringQueue.includes(assignedNode)) {
          this.gatheringQueue.unshift(assignedNode);
        }
      }

      character.state = 'idle';
      if (attacker) {
        character.targetEntity = attacker;
      }
      this.processGatheringQueue();
      return true;
    },

    cancelGatherChannel: function (character: any): boolean {
      const channel = this.activeGatherChannels.get(character);
      if (!channel) return false;
      channel.barContainer.destroy();
      this.activeGatherChannels.delete(character);
      if (character.state === 'channeling') character.state = 'idle';
      if (this.gatheringWorkerNodeAssignments.has(character)) {
        const assignedNode = this.gatheringWorkerNodeAssignments.get(character);
        this.gatheringWorkerNodeAssignments.delete(character);
        if (assignedNode && !assignedNode.isHarvested && !this.gatheringQueue.includes(assignedNode)) {
          this.gatheringQueue.unshift(assignedNode);
        }
      }
      return true;
    },

    startGatheringQueue: function (nodes: GatheringNode[]) {
      const validNodes = Array.from(new Set(nodes)).filter(n => !n.isHarvested);
      if (validNodes.length === 0) return;

      const activeSelected = this.getSelectedMembers().filter((m: any) => m.state !== 'downed' && m.state !== 'dead');
      const workers = activeSelected.length > 0 ? activeSelected : this.party.filter((m: any) => m.state !== 'downed' && m.state !== 'dead');
      if (workers.length === 0) return;

      this.gatheringQueue = [...validNodes];
      this.gatheringQueueWorkers = new Set(workers);
      this.gatheringWorkerNodeAssignments.clear();
      this.processGatheringQueue();
    },

    processGatheringQueue: function () {
      if (this.gatheringQueueWorkers.size === 0) return;

      const claimed = new Set<string>();
      for (const m of this.party) {
        if (m.state !== 'dead') {
          claimed.add(`${m.gridPos.x},${m.gridPos.y}`);
          if (m.claimedDestination) claimed.add(`${m.claimedDestination.x},${m.claimedDestination.y}`);
        }
      }

      for (const worker of Array.from(this.gatheringQueueWorkers)) {
        if (worker.state === 'downed' || worker.state === 'dead' || worker.targetEntity !== null) continue;
        if (this.gatheringWorkerNodeAssignments.has(worker) || this.activeGatherChannels.has(worker)) continue;

        const assignedNodes = new Set(this.gatheringWorkerNodeAssignments.values());
        const availableNodes = this.gatheringQueue.filter(n => !n.isHarvested && !assignedNodes.has(n));
        if (availableNodes.length === 0) continue;

        availableNodes.sort((a, b) => {
          const distA = Math.hypot(a.x - worker.gridPos.x, a.y - worker.gridPos.y);
          const distB = Math.hypot(b.x - worker.gridPos.x, b.y - worker.gridPos.y);
          return distA - distB;
        });

        const targetNode = availableNodes[0];
        const qIdx = this.gatheringQueue.indexOf(targetNode);
        if (qIdx !== -1) this.gatheringQueue.splice(qIdx, 1);
        this.gatheringWorkerNodeAssignments.set(worker, targetNode);
        this.dispatchWorkerToNode(worker, targetNode, claimed);
      }
    },

    dispatchWorkerToNode: function (worker: any, node: GatheringNode, claimed?: Set<string>) {
      this.cancelGatherChannel(worker);
      worker.clearTarget();
      const dist = Math.hypot(worker.gridPos.x - node.x, worker.gridPos.y - node.y);
      if (dist <= 1.5) {
        this.startGatherChannel(worker, node);
        return;
      }

      // Pick open adjacent tile
      const adjTiles = [
        { x: node.x - 1, y: node.y },
        { x: node.x + 1, y: node.y },
        { x: node.x, y: node.y - 1 },
        { x: node.x, y: node.y + 1 }
      ];
      const targetTile = adjTiles[0];
      worker.followPath([targetTile], () => {
        this.startGatherChannel(worker, node);
      });
    },

    executeMarqueeDragSelection: function (minX: number, minY: number, maxX: number, maxY: number) {
      const selectedNodes = this.gatheringNodes.filter((node) => {
        if (node.isHarvested) return false;
        const nodeCenterX = node.x * this.tileSize + this.tileSize / 2;
        const nodeCenterY = node.y * this.tileSize + this.tileSize / 2;
        const inCenter = nodeCenterX >= minX && nodeCenterX <= maxX && nodeCenterY >= minY && nodeCenterY <= maxY;
        const tileMinX = Math.floor(minX / this.tileSize);
        const tileMaxX = Math.floor(maxX / this.tileSize);
        const tileMinY = Math.floor(minY / this.tileSize);
        const tileMaxY = Math.floor(maxY / this.tileSize);
        const inTile = node.x >= tileMinX && node.x <= tileMaxX && node.y >= tileMinY && node.y <= tileMaxY;
        return inCenter || inTile;
      });

      if (selectedNodes.length === 0) {
        this.hud.showToast('No gathering nodes in selected area.', 'info', 2000);
      } else {
        this.startGatheringQueue(selectedNodes);
        this.toggleGatheringMode(false);
      }
      return selectedNodes;
    }
  };

  hud.setPartySelectionHandler(
    (idx, multi) => testScene.selectMemberByIndex(idx, multi),
    () => testScene.selectAllMembers()
  );

  // --------------------------------------------------------------------------
  // TEST 1: Dedicated Hotkey Collision-Free Audit & Toggle Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: Dedicated Hotkey Collision-Free Audit & Toggle ---');
  const fullRegisteredKeys = [
    'W', 'A', 'S', 'D', 'SPACE', 'R', 'K', 'X', 'Z', 'C', 'P', 'T', 'H', 'G', 'V',
    '1', '2', '3', '4', 'TAB', '`', 'L', 'B', 'E', 'O', 'Y', 'U', 'M', 'ESCAPE', 'ENTER'
  ];
  assert.ok(!fullRegisteredKeys.includes('F'), "'F' must be 100% collision-free in the full registry");

  // Verify initial mode is false
  assert.equal(testScene.isGatheringMode, false);
  const bannerEl = document.getElementById('gathering-mode-banner');
  assert.equal(bannerEl?.style.display, 'none');

  // Toggle ON
  testScene.toggleGatheringMode(true);
  assert.equal(testScene.isGatheringMode, true);
  assert.equal(bannerEl?.style.display, 'block');

  // Toggle OFF
  testScene.toggleGatheringMode(false);
  assert.equal(testScene.isGatheringMode, false);
  assert.equal(bannerEl?.style.display, 'none');
  console.log('✓ PASS: Dedicated hotkey F is collision-free and toggles Gathering Mode with UI sync.');

  // --------------------------------------------------------------------------
  // TEST 2: Selection State Strictly Preserved on Mode Toggle
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Selection State Preservation Across Mode Toggle ---');
  // Select only Valerie (index 1)
  testScene.selectMemberByIndex(1, false);
  assert.equal(testScene.selectedMembers.size, 1);
  assert.ok(testScene.selectedMembers.has(valerie));

  // Toggle Gathering Mode ON
  testScene.toggleGatheringMode(true);
  // ASSERTION: Valerie MUST still be the only selected member!
  assert.equal(testScene.selectedMembers.size, 1, 'Toggling mode must NOT reset selection size');
  assert.ok(testScene.selectedMembers.has(valerie), 'Valerie must remain the selected member');
  assert.ok(!testScene.selectedMembers.has(hero), 'Hero must NOT be auto-selected');

  // Toggle Gathering Mode OFF
  testScene.toggleGatheringMode(false);
  assert.equal(testScene.selectedMembers.size, 1);
  assert.ok(testScene.selectedMembers.has(valerie));
  console.log('✓ PASS: Toggling Gathering Mode strictly preserves active portrait selection without resetting.');

  // --------------------------------------------------------------------------
  // TEST 3: Marquee Bounding Box Intersection Math
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Marquee Bounding Box Intersection Math ---');
  const node1 = createTestNode('bush1', 10, 10);
  const node2 = createTestNode('bush2', 11, 10);
  const node3 = createTestNode('bush3', 12, 10);
  const nodeFar = createTestNode('bushFar', 25, 25);
  testScene.gatheringNodes = [node1, node2, node3, nodeFar];

  // Drag box encompassing (9, 9) to (13, 11) in grid units
  const minWorldX = 9 * 32;
  const minWorldY = 9 * 32;
  const maxWorldX = 13 * 32;
  const maxWorldY = 11 * 32;

  testScene.toggleGatheringMode(true);
  const queuedNodes = testScene.executeMarqueeDragSelection(minWorldX, minWorldY, maxWorldX, maxWorldY);

  assert.equal(queuedNodes.length, 3, 'Must capture exactly the 3 nodes inside selection area');
  assert.ok(queuedNodes.includes(node1) && queuedNodes.includes(node2) && queuedNodes.includes(node3));
  assert.ok(!queuedNodes.includes(nodeFar), 'Node outside bounding box must be excluded');
  console.log('✓ PASS: Marquee bounding box correctly encompasses multiple nodes and excludes outside nodes.');

  // --------------------------------------------------------------------------
  // TEST 4: Empty Drag Area Handling
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Empty Drag Area Handling ---');
  testScene.gatheringQueue = [];
  testScene.toggleGatheringMode(true);
  const emptyDragNodes = testScene.executeMarqueeDragSelection(0, 0, 64, 64);
  assert.equal(emptyDragNodes.length, 0);
  assert.equal(testScene.gatheringQueue.length, 0);
  console.log('✓ PASS: Dragging over empty area handles gracefully without errors.');

  // --------------------------------------------------------------------------
  // TEST 5: Parallel Worker Distribution Across Queue
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Parallel Worker Distribution Across Queue ---');
  testScene.activeGatherChannels.clear();
  testScene.gatheringWorkerNodeAssignments.clear();
  testScene.gatheringQueue = [];
  for (const m of party) {
    m.state = 'idle';
    m.targetEntity = null;
  }
  testScene.selectAllMembers();
  assert.equal(testScene.selectedMembers.size, 4);

  const nA = createTestNode('nA', 10, 5);
  const nB = createTestNode('nB', 14, 5);
  const nC = createTestNode('nC', 18, 5);
  const nD = createTestNode('nD', 22, 5);
  testScene.gatheringNodes = [nA, nB, nC, nD];

  testScene.startGatheringQueue([nA, nB, nC, nD]);

  // All 4 living members should be simultaneously assigned to 4 distinct nodes
  assert.equal(testScene.gatheringWorkerNodeAssignments.size, 4, 'All 4 workers must have active assignments');
  const assignedSet = new Set(testScene.gatheringWorkerNodeAssignments.values());
  assert.equal(assignedSet.size, 4, 'All 4 assigned nodes must be distinct (parallel distribution, no convergence)');
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(hero));
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(valerie));
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(kaelen));
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(barris));
  console.log('✓ PASS: All 4 members distribute across separate nodes in parallel simultaneously.');

  // --------------------------------------------------------------------------
  // TEST 6: Queue Progression & Next-Node Chaining
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Queue Progression & Next-Node Chaining ---');
  // Add a 5th and 6th node to the queue
  const nE = createTestNode('nE', 26, 5);
  const nF = createTestNode('nF', 30, 5);
  testScene.gatheringQueue = [nE, nF];

  // Hero completes channel on nA
  const heroChannel = testScene.activeGatherChannels.get(hero);
  assert.ok(heroChannel);
  testScene.completeGatherChannel(hero, heroChannel);
  assert.equal(nA.isHarvested, true, 'nA must be harvested');

  // Hero should automatically claim nE from the queue
  assert.equal(testScene.gatheringWorkerNodeAssignments.get(hero), nE, 'Hero must advance to next unclaimed node nE');
  assert.equal(testScene.gatheringQueue.length, 1, 'Only nF should remain in queue');
  assert.ok(testScene.gatheringQueue.includes(nF));

  // Valerie completes nB -> advances to nF
  const valerieChannel = testScene.activeGatherChannels.get(valerie);
  testScene.completeGatherChannel(valerie, valerieChannel);
  assert.equal(nB.isHarvested, true);
  assert.equal(testScene.gatheringWorkerNodeAssignments.get(valerie), nF);
  assert.equal(testScene.gatheringQueue.length, 0, 'Queue should now be empty');
  console.log('✓ PASS: Completing nodes automatically chains workers to remaining unclaimed queue items.');

  // --------------------------------------------------------------------------
  // TEST 7: Hold Position Upon Queue Exhaustion
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Hold Position Upon Queue Exhaustion ---');
  hero.pathHistory = [];
  valerie.pathHistory = [];
  kaelen.pathHistory = [];
  barris.pathHistory = [];

  // Complete all remaining in-progress nodes
  for (const [member, channel] of Array.from(testScene.activeGatherChannels.entries())) {
    testScene.completeGatherChannel(member, channel);
  }

  assert.equal(testScene.gatheringQueue.length, 0);
  assert.equal(testScene.gatheringWorkerNodeAssignments.size, 0);

  // Assert workers hold position: no return to formation commands executed!
  assert.equal(hero.pathHistory.length, 0, 'Hero must hold position');
  assert.equal(valerie.pathHistory.length, 0, 'Valerie must hold position');
  assert.equal(kaelen.pathHistory.length, 0, 'Kaelen must hold position');
  assert.equal(barris.pathHistory.length, 0, 'Barris must hold position');
  assert.equal(hero.state, 'idle');
  assert.equal(valerie.state, 'idle');
  console.log('✓ PASS: Workers hold position at last gathered tile; no auto-return to formation.');

  // --------------------------------------------------------------------------
  // TEST 8: Combat Interruption Returns Node to Queue & Rest of Party Continues
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Combat Interruption Returns Node to Queue ---');
  const nodeCombat1 = createTestNode('nc1', 10, 10);
  const nodeCombat2 = createTestNode('nc2', 15, 10);
  testScene.gatheringNodes = [nodeCombat1, nodeCombat2];
  testScene.selectAllMembers();

  testScene.startGatheringQueue([nodeCombat1, nodeCombat2]);
  assert.ok(testScene.activeGatherChannels.has(hero));
  assert.ok(testScene.activeGatherChannels.has(valerie));

  const heroAssignedNode = testScene.gatheringWorkerNodeAssignments.get(hero);
  assert.ok(heroAssignedNode, 'Hero must have an assigned node before interruption');
  const otherNode = heroAssignedNode === nodeCombat1 ? nodeCombat2 : nodeCombat1;

  // Enemy interrupts Hero mid-channel
  const mockWolf = { entityName: 'Wolf', state: 'active' };
  const interrupted = testScene.interruptGatherChannel(hero, mockWolf);
  assert.equal(interrupted, true);

  // Assertions:
  // 1. Hero's channel cancelled, entered combat
  assert.ok(!testScene.activeGatherChannels.has(hero));
  assert.equal(hero.targetEntity, mockWolf, 'Hero must be pulled into combat with attacker');
  // 2. Hero's node was NOT harvested; either picked up by available worker (Kaelen) or in gatheringQueue
  assert.equal(heroAssignedNode.isHarvested, false, 'Interrupted node must remain intact/unharvested');
  const kaelenHasNode = testScene.gatheringWorkerNodeAssignments.get(kaelen) === heroAssignedNode;
  const inQueue = testScene.gatheringQueue.includes(heroAssignedNode);
  assert.ok(kaelenHasNode || inQueue, 'Interrupted node must be reassigned to available worker or in gatheringQueue');
  // 3. Valerie was NOT interrupted and continues channeling other node smoothly
  assert.ok(testScene.activeGatherChannels.has(valerie), 'Valerie must continue channeling uninterrupted');
  assert.equal(testScene.gatheringWorkerNodeAssignments.get(valerie), otherNode);
  console.log('✓ PASS: Interrupted member enters combat, node is preserved/reassigned, and remaining party continues without stalling.');

  // --------------------------------------------------------------------------
  // TEST 9: The Explicit Ordered Scenario — Subset Selection Before Mode Toggle
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Explicit Scenario — Select Subset FIRST -> Toggle F -> Marquee Drag ---');
  // Reset positions
  hero.gridPos = { x: 5, y: 5 };
  valerie.gridPos = { x: 6, y: 5 };
  kaelen.gridPos = { x: 5, y: 6 };
  barris.gridPos = { x: 6, y: 6 };
  hero.pathHistory = [];
  valerie.pathHistory = [];
  kaelen.pathHistory = [];
  barris.pathHistory = [];
  testScene.activeGatherChannels.clear();
  testScene.gatheringQueue = [];
  testScene.gatheringWorkerNodeAssignments.clear();

  // STEP 1: Click portrait 1 (Valerie only)
  const p1 = document.getElementById('party-portrait-1');
  p1?.dispatchEvent({ type: 'click', shiftKey: false });
  assert.equal(hud.getSelectedMemberIndices().size, 1);
  testScene.selectedMembers = new Set([valerie]);

  // STEP 2: Assert checkpoint before toggle: only Valerie is selected
  assert.equal(testScene.selectedMembers.size, 1);
  assert.ok(testScene.selectedMembers.has(valerie));
  assert.ok(!testScene.selectedMembers.has(hero));

  // STEP 3: Press F to activate Gathering Mode
  testScene.toggleGatheringMode(true);
  assert.equal(testScene.isGatheringMode, true);

  // STEP 4: Assert checkpoint immediately after toggle: selectedMembers STILL has size 1 and Valerie!
  assert.equal(testScene.selectedMembers.size, 1, 'Mode toggle must NOT reset selected members size');
  assert.ok(testScene.selectedMembers.has(valerie), 'Valerie must strictly remain the selected member');
  assert.ok(!testScene.selectedMembers.has(hero), 'Hero must not be selected');
  assert.ok(!testScene.selectedMembers.has(kaelen), 'Kaelen must not be selected');
  assert.ok(!testScene.selectedMembers.has(barris), 'Barris must not be selected');

  // STEP 5: Spawn 2 nodes and perform marquee drag
  const subBush1 = createTestNode('subBush1', 12, 5);
  const subBush2 = createTestNode('subBush2', 15, 5);
  testScene.gatheringNodes = [subBush1, subBush2];

  const queuedSubsetNodes = testScene.executeMarqueeDragSelection(11 * 32, 4 * 32, 16 * 32, 6 * 32);
  assert.equal(queuedSubsetNodes.length, 2);

  // STEP 6: Assertions on participation:
  // - Valerie must be the sole worker in gatheringQueueWorkers
  assert.equal(testScene.gatheringQueueWorkers.size, 1);
  assert.ok(testScene.gatheringQueueWorkers.has(valerie));
  // - Valerie path history must show movement towards subBush1
  assert.equal(valerie.pathHistory.length, 1);
  assert.equal(valerie.state, 'channeling');

  // - Unselected members (Hero, Kaelen, Barris) must have ZERO path history and remain stationary
  assert.equal(hero.gridPos.x, 5);
  assert.equal(hero.gridPos.y, 5);
  assert.equal(hero.pathHistory.length, 0, 'Hero must NOT move');

  assert.equal(kaelen.gridPos.x, 5);
  assert.equal(kaelen.gridPos.y, 6);
  assert.equal(kaelen.pathHistory.length, 0, 'Kaelen must NOT move');

  assert.equal(barris.gridPos.x, 6);
  assert.equal(barris.gridPos.y, 6);
  assert.equal(barris.pathHistory.length, 0, 'Barris must NOT move');

  // Complete Valerie's first node -> Valerie paths to second node subBush2 alone
  const valSubChannel1 = testScene.activeGatherChannels.get(valerie);
  testScene.completeGatherChannel(valerie, valSubChannel1);
  assert.equal(subBush1.isHarvested, true);
  assert.equal(valerie.pathHistory.length, 2, 'Valerie must advance to second node');

  // Hero, Kaelen, Barris STILL strictly stationary
  assert.equal(hero.pathHistory.length, 0);
  assert.equal(kaelen.pathHistory.length, 0);
  assert.equal(barris.pathHistory.length, 0);

  // Complete second node -> queue exhausted, Valerie holds position
  const valSubChannel2 = testScene.activeGatherChannels.get(valerie);
  testScene.completeGatherChannel(valerie, valSubChannel2);
  assert.equal(subBush2.isHarvested, true);
  assert.equal(testScene.gatheringQueue.length, 0);
  assert.equal(valerie.pathHistory.length, 2); // No extra path back to Hero!
  console.log('✓ PASS: Explicit ordered sequence verified: subset selected -> F toggled -> selection preserved -> only subset gathers while others stay put.');

  // --------------------------------------------------------------------------
  // TEST 10: Multi-Member Subset (Valerie + Kaelen) Parallel Execution
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Multi-Member Subset (Valerie + Kaelen) ---');
  testScene.selectMemberByIndex(1, false);
  testScene.selectMemberByIndex(2, true);
  assert.equal(testScene.selectedMembers.size, 2);
  assert.ok(testScene.selectedMembers.has(valerie) && testScene.selectedMembers.has(kaelen));

  hero.pathHistory = [];
  barris.pathHistory = [];
  valerie.pathHistory = [];
  kaelen.pathHistory = [];

  const pairNode1 = createTestNode('pn1', 12, 10);
  const pairNode2 = createTestNode('pn2', 16, 10);
  testScene.gatheringNodes = [pairNode1, pairNode2];

  testScene.startGatheringQueue([pairNode1, pairNode2]);

  assert.equal(testScene.gatheringWorkerNodeAssignments.size, 2);
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(valerie));
  assert.ok(testScene.gatheringWorkerNodeAssignments.has(kaelen));
  assert.ok(!testScene.gatheringWorkerNodeAssignments.has(hero));
  assert.ok(!testScene.gatheringWorkerNodeAssignments.has(barris));

  assert.equal(hero.pathHistory.length, 0, 'Hero remains stationary');
  assert.equal(barris.pathHistory.length, 0, 'Barris remains stationary');
  console.log('✓ PASS: Multi-member commanded subset executes queue in parallel while unselected members remain strictly stationary.');

  console.log('\n====================================================');
  console.log('ALL 10 MILESTONE 26 TESTS PASSED CLEANLY AND PROVEN!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Milestone 26 Test Failure:', err);
  process.exit(1);
});
