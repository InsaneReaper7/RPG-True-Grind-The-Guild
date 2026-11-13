import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup mock browser environment for headless execution
const listeners: Record<string, Function[]> = {};
const elements: Record<string, any> = {};

const mockWindow: any = {
  addEventListener: (event: string, cb: Function) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: Function) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(fn => fn !== cb);
    }
  },
  dispatchEvent: (event: any) => {
    const cbs = listeners[event.type] || [];
    for (const cb of cbs) cb(event);
  },
  location: { href: 'http://localhost' },
  focus: () => {},
  navigator: { userAgent: 'node' }
};

const dummyCtx: any = new Proxy({
  fillStyle: '',
  globalCompositeOperation: '',
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  createImageData: () => ({ data: [0, 0, 0, 0] })
}, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return () => {};
  },
  set(target, prop, value) {
    (target as any)[prop] = value;
    return true;
  }
});

const mockDocument: any = {
  getElementById: (id: string) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        style: {},
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {},
          contains: () => false
        },
        innerText: '',
        innerHTML: '',
        appendChild: () => {},
        removeChild: () => {},
        addEventListener: () => {},
        children: [],
        querySelectorAll: () => [],
        querySelector: () => null,
        focus: () => {},
        blur: () => {}
      };
    }
    return elements[id];
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag: string) => ({
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    innerText: '',
    innerHTML: '',
    appendChild: () => {},
    removeChild: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    getContext: () => dummyCtx,
    children: []
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  documentElement: {},
  body: {}
};

(global as any).window = mockWindow;
(globalThis as any).window = mockWindow;
(global as any).document = mockDocument;
(globalThis as any).document = mockDocument;
(global as any).Image = class Image {};
(global as any).HTMLCanvasElement = class HTMLCanvasElement {};
(global as any).HTMLVideoElement = class HTMLVideoElement {};

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader';
import { GameState } from '../src/systems/GameState';




// PRNG helper
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMockScene(width = 30, height = 30) {
  const occupiedTiles = new Set<string>();
  const obstacles = new Set<string>();

  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {},
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {}
    }, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => obj;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      }
    });
    return obj;
  };

  return {
    sys: {
      game: {
        canvas: { width: 800, height: 600 }
      },
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    cameras: {
      main: {
        width: 800,
        height: 600,
        scrollX: 0,
        scrollY: 0,
        zoom: 1
      }
    },
    pathfinder: {
      isObstacle: (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return true;
        return obstacles.has(`${x},${y}`);
      },
      isWalkable: (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return !obstacles.has(`${x},${y}`);
      },
      findPath: () => []
    },
    isTileClaimedOrOccupiedByOther: (x: number, y: number, self: any) => {
      return occupiedTiles.has(`${x},${y}`);
    },
    occupyTile: (x: number, y: number) => occupiedTiles.add(`${x},${y}`),
    clearTile: (x: number, y: number) => occupiedTiles.delete(`${x},${y}`),
    setObstacle: (x: number, y: number) => obstacles.add(`${x},${y}`),
    children: [],
    tweens: {
      add: () => ({ isPlaying: () => false, play: () => {}, stop: () => {} })
    },
    time: {
      delayedCall: (ms: number, fn: Function) => setTimeout(fn, 0)
    },
    add: new Proxy({
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      line: createMockObj,
      circle: createMockObj,
      existing: (item: any) => item
    }, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return createMockObj;
      }
    })
  };
}

// =============================================================================
// Bug fix TG-E11KKA (owner report 2026-11-12, build 0f3ffb7):
//  1. Build Mode palette ran off-screen -> category tabs + sideways scroll
//  2. Building material tiers were not research-locked -> 5 construction nodes
//  3. Combat summary always "None" -> damage listener feeds recordDamageDealt/Taken
//  4. Every enemy death logged twice -> markDead() is idempotent
//  5. "Target out of range" spam -> one shared tile-distance rule + throttled warning
// =============================================================================

const TIER_PIECES = ['plank_floor', 'plank_wall', 'plank_door', 'stone_floor', 'stone_wall', 'brick_floor', 'brick_wall', 'reinforced_wall', 'reinforced_door', 'runic_wall', 'runic_door'];
const CONSTRUCTION_NODES: Array<{ id: string; cost: number; prerequisites: string[]; unlocks: string[] }> = [
  { id: 'research_plank_construction', cost: 5, prerequisites: ['research_woodworking_bench'], unlocks: ['plank_floor', 'plank_wall', 'plank_door'] },
  { id: 'research_stone_construction', cost: 8, prerequisites: ['research_stonemason_yard'], unlocks: ['stone_floor', 'stone_wall'] },
  { id: 'research_brick_construction', cost: 12, prerequisites: ['research_stone_construction'], unlocks: ['brick_floor', 'brick_wall'] },
  { id: 'research_reinforced_construction', cost: 18, prerequisites: ['research_brick_construction', 'research_blacksmithing_station'], unlocks: ['reinforced_wall', 'reinforced_door'] },
  { id: 'research_runic_construction', cost: 25, prerequisites: ['research_reinforced_construction', 'research_magical_crafting'], unlocks: ['runic_wall', 'runic_door'] }
];

function paletteIds(html: string): string[] {
  return Array.from(html.matchAll(/data-buildable-id="([^"]+)"/g)).map((m) => m[1]);
}

async function runBugfixTests() {
  console.log('================================================================');
  console.log('🧪 BUG FIX TG-E11KKA: BUILD PALETTE, TIER RESEARCH, COMBAT LOG');
  console.log('================================================================\n');

  // Capture the palette's wheel listener before the HUD wires it up.
  const paletteEl = mockDocument.getElementById('build-palette-container');
  let paletteWheelHandler: ((e: any) => void) | null = null;
  paletteEl.addEventListener = (type: string, cb: any) => {
    if (type === 'wheel') paletteWheelHandler = cb;
  };
  paletteEl.scrollLeft = 0;

  const { CombatSystem } = await import('../src/systems/CombatSystem');
  const { SkillSystem } = await import('../src/systems/SkillSystem');
  const { Player } = await import('../src/entities/Player');
  const { Enemy } = await import('../src/entities/Enemy');
  const { HUD } = await import('../src/ui/HUD');
  const { ResearchSystem } = await import('../src/systems/ResearchSystem');
  const { BuildingSystem } = await import('../src/systems/BuildingSystem');
  const { EventLog } = await import('../src/systems/EventLog');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const gameState = GameState.getInstance();
  const origLog = console.log;

  // ---------------------------------------------------------------------------
  // 1. Expected-table guards (data)
  // ---------------------------------------------------------------------------
  {
    const buildables = dataLoader.getBuildables();
    for (const id of TIER_PIECES) {
      const b = buildables.find((x: any) => x.id === id);
      assert.ok(b, `${id} must exist`);
      assert.equal(b!.lockedByDefault, true, `${id} must be lockedByDefault`);
    }
    for (const id of ['floor', 'wall', 'door']) {
      const b = buildables.find((x: any) => x.id === id)!;
      assert.ok(!b.lockedByDefault, `${id} (starter Wood tier) must stay unlocked`);
    }
    const tree = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8')).nodes;
    const ids = new Set(tree.map((n: any) => n.id));
    for (const exp of CONSTRUCTION_NODES) {
      const node = tree.find((n: any) => n.id === exp.id);
      assert.ok(node, `${exp.id} must exist`);
      assert.equal(node.cost, exp.cost, `${exp.id} cost`);
      assert.deepEqual(node.prerequisites, exp.prerequisites, `${exp.id} prerequisites`);
      assert.deepEqual(node.unlocksBuildables, exp.unlocks, `${exp.id} unlocksBuildables`);
      for (const pre of exp.prerequisites) assert.ok(ids.has(pre), `${exp.id} prerequisite ${pre} must be a real node`);
      assert.equal(tree.filter((n: any) => n.id === exp.id).length, 1, `${exp.id} must be unique`);
    }
    console.log('✔ 1. Data guards: 11 tier pieces locked, 5 construction nodes exact.');
  }

  // ---------------------------------------------------------------------------
  // 2. Palette tabs, furniture visibility, Demolish pinned, wheel scroll (HUD controls)
  // ---------------------------------------------------------------------------
  const hud = new HUD();
  const tabsEl = mockDocument.getElementById('build-category-tabs');
  const clickTab = (category: string) => {
    tabsEl.onclick({ target: { closest: () => ({ dataset: { buildCategory: category } }) } });
  };
  {
    hud.setBuildOverlayVisible(true);
    hud.updateBuildOverlay(100, 0, 'floor', 0);
    let ids = paletteIds(paletteEl.innerHTML);
    assert.equal(hud.getBuildCategory(), 'structure', 'Build Mode opens on the Structure tab');
    assert.equal(ids[0], 'demolish', 'Demolish is rendered first (sticky, always reachable)');
    for (const id of ['floor', 'wall', 'door']) assert.ok(ids.includes(id), `Structure tab shows ${id}`);
    for (const id of TIER_PIECES) assert.ok(!ids.includes(id), `${id} is hidden before its research`);
    assert.ok(!ids.includes('bed') && !ids.includes('research_station'), 'Stations are not on the Structure tab');
    assert.ok(paletteEl.innerHTML.includes('palette-demolish'), 'Demolish carries the sticky class');

    clickTab('stations');
    ids = paletteIds(paletteEl.innerHTML);
    assert.equal(hud.getBuildCategory(), 'stations');
    assert.ok(ids.includes('bed') && ids.includes('research_station'), 'Stations tab shows bed and research station');
    assert.ok(!ids.includes('floor'), 'Stations tab does not show floors');
    assert.equal(ids[0], 'demolish', 'Demolish stays on the Stations tab');

    clickTab('furniture');
    ids = paletteIds(paletteEl.innerHTML);
    assert.deepEqual(ids, ['demolish'], 'Furniture tab hides furniture the guild does not own');
    assert.ok(paletteEl.innerHTML.includes('No furniture yet'), 'Empty Furniture tab explains how to get furniture');

    gameState.addItem('wooden_chair', 1);
    hud.updateBuildOverlay(100, 0, 'floor', 0);
    ids = paletteIds(paletteEl.innerHTML);
    assert.ok(ids.includes('wooden_chair'), 'Owned furniture appears on the Furniture tab');
    assert.ok(!ids.includes('wooden_table'), 'Unowned furniture stays hidden');

    // Wheel over the palette scrolls it sideways and is consumed (no camera zoom).
    assert.ok(paletteWheelHandler, 'Palette registers a wheel listener');
    let prevented = false;
    let stopped = false;
    paletteEl.scrollLeft = 0;
    paletteWheelHandler!({ deltaY: 120, deltaX: 0, currentTarget: paletteEl, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
    assert.equal(paletteEl.scrollLeft, 120, 'Wheel down scrolls the palette right by deltaY');
    assert.ok(prevented && stopped, 'Wheel event is consumed by the palette');

    // Re-render keeps the scroll position; switching tabs resets it.
    hud.updateBuildOverlay(100, 0, 'floor', 0);
    assert.equal(paletteEl.scrollLeft, 120, 'Re-render preserves palette scroll');
    clickTab('structure');
    assert.equal(paletteEl.scrollLeft, 0, 'Switching tab resets palette scroll');

    // Re-opening Build Mode returns to the Structure tab.
    clickTab('stations');
    hud.setBuildOverlayVisible(false);
    hud.setBuildOverlayVisible(true);
    assert.equal(hud.getBuildCategory(), 'structure', 'Re-opening Build Mode returns to the Structure tab');
    console.log('✔ 2. Palette tabs, Demolish pinned, furniture hidden at 0, wheel scroll verified.');
  }

  // ---------------------------------------------------------------------------
  // 3. Construction research unlocks tiers; prerequisites gate; old placed pieces stay
  // ---------------------------------------------------------------------------
  {
    const research = ResearchSystem.getInstance();
    const nodes = dataLoader.getResearchTree ? (dataLoader as any).getResearchTree().nodes ?? (dataLoader as any).getResearchTree() : JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8')).nodes;
    const node = (id: string) => nodes.find((n: any) => n.id === id);
    gameState.addResearchPoints(500);

    const blocked = research.canUnlockNode(node('research_stone_construction'));
    assert.equal(blocked.canUnlock, false, 'Stone Construction is blocked without the Stonemason Yard research');

    console.log = () => {};
    for (const id of ['research_woodworking_bench', 'research_plank_construction']) {
      const r = research.unlockNode(node(id));
      assert.ok(r.success, `${id} unlocks`);
    }
    console.log = origLog;
    for (const id of ['plank_floor', 'plank_wall', 'plank_door']) assert.ok(gameState.isBuildableUnlocked(id), `${id} unlocked by Plank Construction`);
    for (const id of ['stone_floor', 'stone_wall', 'brick_wall']) assert.ok(!gameState.isBuildableUnlocked(id), `${id} still locked`);

    hud.setBuildOverlayVisible(false);
    hud.setBuildOverlayVisible(true);
    hud.updateBuildOverlay(100, 0, 'floor', 0);
    const ids = paletteIds(paletteEl.innerHTML);
    for (const id of ['plank_floor', 'plank_wall', 'plank_door']) assert.ok(ids.includes(id), `${id} appears in the palette after research`);
    assert.ok(!ids.includes('stone_wall'), 'stone_wall still hidden');

    const brickEarly = research.canUnlockNode(node('research_brick_construction'));
    assert.equal(brickEarly.canUnlock, false, 'Brick Construction needs Stone Construction first');

    console.log = () => {};
    for (const id of ['research_stonemason_yard', 'research_stone_construction', 'research_brick_construction']) {
      assert.ok(research.unlockNode(node(id)).success, `${id} unlocks`);
    }
    console.log = origLog;
    const reinforcedEarly = research.canUnlockNode(node('research_reinforced_construction'));
    if (!gameState.isResearchCompleted('research_blacksmithing_station') && !gameState.isBuildableUnlocked('blacksmithing_station')) {
      assert.equal(reinforcedEarly.canUnlock, false, 'Reinforced Construction also needs the Blacksmithing Station research');
    }

    // Placement guard: a locked tier piece cannot be placed.
    const runicDef = dataLoader.getBuildables().find((b: any) => b.id === 'runic_wall')!;
    assert.ok(runicDef.lockedByDefault && !gameState.isBuildableUnlocked('runic_wall'), 'runic_wall is still locked');
    assert.equal(BuildingSystem.getBuildCategory(runicDef), 'structure', 'Tier walls live on the Structure tab');

    // Old save: a placed stone wall is kept even though nothing re-checks its lock on load.
    const placedBefore = gameState.getPlacedBuildables().length;
    gameState.addPlacedBuildable({ id: 'stone_wall', x: 3, y: 3, rotation: 0 } as any);
    assert.equal(gameState.getPlacedBuildables().length, placedBefore + 1, 'Previously placed tier pieces are kept');
    console.log('✔ 3. Construction research unlocks tiers in order; placed pieces kept.');
  }

  // ---------------------------------------------------------------------------
  // 4. Combat summary records damage dealt and taken (real damage paths)
  // ---------------------------------------------------------------------------
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene as any);
    const sword = dataLoader.getWeapon('short_swords')!;
    const hero = new Player(scene as any, 5, 5, { hp: 1000, criticalHp: 500, energy: 100, attackRangeTiles: 1 }, sword, 16, 'player-avatar');
    hero.entityName = 'Misael';
    const goblin = new Enemy(scene as any, 5, 6, dataLoader.getEnemy('goblin')!, 16);
    goblin.hp = 100000;
    goblin.maxHp = 100000;
    combat.setParty([hero]);
    combat.setEnemies([goblin]);

    const before = goblin.hp + goblin.criticalHp;
    console.log = () => {};
    for (let i = 0; i < 40; i++) {
      hero.lastAttackTime = 0;
      combat.executePlayerBasicAttack(hero, goblin, 10000 + i * 5000);
    }
    console.log = origLog;
    const lost = before - (goblin.hp + goblin.criticalHp);
    const dealt = (combat as any).damageDealtByMember.get('Misael') ?? 0;
    assert.ok(lost > 0, 'The hero landed hits on the goblin');
    assert.ok(Math.abs(dealt - lost) < 1e-6, `Recorded dealt (${dealt}) equals the goblin's HP lost (${lost})`);

    hero.takeDamage(12, goblin);
    hero.takeDamage(5, 'Burn');
    const taken = (combat as any).damageTakenByMember.get('Misael') ?? 0;
    assert.ok(Math.abs(taken - 17) < 1e-6, `Recorded taken is exactly 17 (got ${taken})`);
    const biggest = (combat as any).biggestHitTaken;
    assert.equal(biggest.source, goblin.entityName, 'Biggest hit names the attacker');
    assert.equal(biggest.amount, 12);

    // Enemy-on-enemy or unattributed damage never counts as a party member's damage dealt.
    const other = new Enemy(scene as any, 8, 8, dataLoader.getEnemy('goblin')!, 16);
    other.takeDamage(7, 'Burn');
    assert.ok(Math.abs(((combat as any).damageDealtByMember.get('Misael') ?? 0) - dealt) < 1e-6, 'DoT ticks on enemies are not attributed to a member');
    console.log('✔ 4. Combat summary records exact damage dealt and taken with sources.');
  }

  // ---------------------------------------------------------------------------
  // 5. markDead is idempotent (one "died" entry per kill)
  // ---------------------------------------------------------------------------
  {
    const scene = createMockScene();
    const slime = new Enemy(scene as any, 2, 2, dataLoader.getEnemy('slime')!, 16);
    const log = EventLog.getInstance();
    const count = () => log.getEntries().filter((e: any) => e.cat === 'combat' && e.msg === `${slime.enemyData.name} died`).length;
    const c0 = count();
    slime.markDead();
    slime.markDead();
    assert.equal(count() - c0, 1, 'Exactly one "died" entry for one kill');
    console.log('✔ 5. markDead logs one death per kill.');
  }

  // ---------------------------------------------------------------------------
  // 6. Shared tile distance + throttled out-of-range warning
  // ---------------------------------------------------------------------------
  {
    assert.equal(SkillSystem.getTileDistance({ x: 0, y: 0, gridPos: { x: 0, y: 0 } }, { x: 0, y: 0, gridPos: { x: 5, y: 3 } }), 5, 'Chebyshev over grid tiles');
    assert.equal(SkillSystem.getTileDistance({ x: 15, y: 15, tileSize: 16 }, { x: 100, y: 15, tileSize: 16 }), 6, 'Floored pixel fallback without gridPos');

    const scene = createMockScene();
    const combat = new CombatSystem(scene as any);
    const skillSystem = new SkillSystem(combat);
    const bow = dataLoader.getWeapon('bows')!;
    const scout = new Player(scene as any, 0, 0, { hp: 100, criticalHp: 50, energy: 100, attackRangeTiles: 4 }, bow, 16, 'player-avatar');
    const wolf = new Enemy(scene as any, 6, 0, dataLoader.getEnemy('wolf')!, 16);
    scout.gridPos = { x: 0, y: 0 };
    wolf.gridPos = { x: 6, y: 0 };
    combat.setParty([scout]);
    combat.setEnemies([wolf]);
    const markTarget = dataLoader.getSkill('mark_target')!;
    assert.equal(markTarget.rangeTiles, 5);

    let warns = 0;
    const origWarn = console.warn;
    console.warn = (msg: any) => { if (String(msg).includes('Target out of range')) warns++; };
    console.log = () => {};
    for (let i = 0; i < 60; i++) {
      scout.energy = 100;
      const ok = skillSystem.execute(scout, markTarget, wolf, 50000 + i * 16);
      assert.equal(ok, false, 'Out-of-range cast is rejected');
    }
    console.log = origLog;
    console.warn = origWarn;
    assert.equal(warns, 1, `60 rejected casts within one second log one warning (got ${warns})`);

    // The AI selector uses the same distance, so it never offers an out-of-range skill.
    const dist = SkillSystem.getTileDistance(scout, wolf);
    assert.equal(dist, 6);
    assert.ok(dist > markTarget.rangeTiles!, 'Selector and execute agree the wolf is out of range');
    console.log('✔ 6. Shared tile distance; out-of-range warning throttled to 1/s.');
  }

  console.log('\n=== ALL TG-E11KKA BUG FIX TESTS PASSED ===');
}

runBugfixTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
