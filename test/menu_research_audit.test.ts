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
// Owner request 2026-11-13: audit every menu for overflow, and check that everything
// is hidden behind the correct research node.
// =============================================================================

// Buildables that are intentionally available without research, and why. A new buildable must be
// either lockedByDefault (and unlocked by a research node) or added here with its reason.
const UNGATED_BY_DESIGN: Record<string, string> = {
  floor: 'starter Wood tier', wall: 'starter Wood tier', door: 'starter Wood tier',
  bed: 'starter (tutorial)', research_station: 'starter (unlocks the tree itself)',
  seed_maker: 'needs Gardening 25, which needs Planting Plots (research_gardening)'
};

async function runAudit() {
  console.log('================================================================');
  console.log('🧪 MENU OVERFLOW + RESEARCH GATING AUDIT');
  console.log('================================================================\n');

  const buildables = JSON.parse(fs.readFileSync('data/buildables.json', 'utf8')).buildables;
  const nodes = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8')).nodes;
  const ids = new Set(buildables.map((b: any) => b.id));
  const nodeIds = new Set(nodes.map((n: any) => n.id));
  const isFurniture = (b: any) => !!b.itemCosts && b.itemCosts[b.id] !== undefined;

  // ---------------------------------------------------------------------------
  // 1. Research gating
  // ---------------------------------------------------------------------------
  {
    const unlockedBy: Record<string, string[]> = {};
    for (const n of nodes) {
      for (const pre of n.prerequisites ?? []) assert.ok(nodeIds.has(pre), `${n.id}: prerequisite ${pre} must exist`);
      const targets = [...(n.targetBuildableId ? [n.targetBuildableId] : []), ...(n.unlocksBuildables ?? [])];
      for (const t of targets) {
        assert.ok(ids.has(t), `${n.id}: unlocks unknown buildable ${t}`);
        (unlockedBy[t] ||= []).push(n.id);
      }
    }
    for (const b of buildables) {
      if (b.lockedByDefault) {
        assert.ok(unlockedBy[b.id]?.length, `${b.id} is locked but no research node unlocks it`);
      } else if (isFurniture(b)) {
        // Furniture is gated by owning the crafted item, which needs its (researched) station.
        const recipeFiles = ['woodworkingRecipes', 'stonemasonRecipes'];
        const found = recipeFiles.some((f) => {
          const recipes = JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'));
          const list = Array.isArray(recipes) ? recipes : (recipes.recipes ?? []);
          return list.some((r: any) => r.resultItemId === b.id);
        });
        assert.ok(found, `Furniture ${b.id} must come from a Woodworking/Stonemason recipe`);
      } else {
        assert.ok(UNGATED_BY_DESIGN[b.id], `${b.id} is available without research and is not on the by-design list`);
      }
      if (unlockedBy[b.id]) assert.ok(b.lockedByDefault, `${b.id} is unlocked by research but not lockedByDefault (so it was never hidden)`);
    }
    // Starter set in GameState matches the by-design list (minus seed_maker, which is proficiency-gated).
    const gsSrc = fs.readFileSync('src/systems/GameState.ts', 'utf8');
    const starter = gsSrc.match(/unlockedBuildables: Set<string> = new Set\(\[([^\]]*)\]\)/)![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    assert.deepEqual(starter, ['bed', 'door', 'floor', 'research_station', 'wall'], 'Starter unlocked set');
    // Feature nodes (no buildable) are enforced in game code.
    for (const [node, fn] of [
      ['research_digging', 'isDiggingUnlocked'],
      ['research_skinning', 'isSkinningUnlocked'],
      ['research_butchering', 'isButcheringUnlocked'],
      ['research_fishing', 'isFishingUnlocked'],
      ['research_taming', 'isTamingUnlocked']
    ]) {
      assert.ok(nodeIds.has(node), `${node} exists`);
      const callers = fs.readdirSync('src', { recursive: true } as any).filter((f: any) => String(f).endsWith('.ts'))
        .filter((f: any) => fs.readFileSync(path.join('src', String(f)), 'utf8').includes(`${fn}()`) && !String(f).endsWith('GameState.ts'));
      assert.ok(callers.length > 0, `${fn}() (gate for ${node}) must be checked in game code`);
    }
    console.log(`✔ 1. Research gating: ${buildables.length} buildables classified; every locked one has a node; feature nodes enforced.`);
  }

  // ---------------------------------------------------------------------------
  // 2. Campfire cooking is hidden until the Cooking research is done
  // ---------------------------------------------------------------------------
  {
    const { HUD } = await import('../src/ui/HUD');
    const gs = GameState.getInstance();
    const hud = new HUD();
    const cookBtn: any = { style: { display: '' }, disabled: false, onclick: null };
    (hud as any).campCookBtnEl = cookBtn;
    (hud as any).isOutpost = false;
    const leader: any = { gridPos: { x: 1, y: 1 }, x: 16, y: 16 };
    const scene: any = { dungeon: {}, player: leader, currentCamp: { isDestroyed: false, isInRadius: () => true }, isInCampRadius: () => true };
    (hud as any).currentPlayer = leader;
    assert.equal(HUD.isCookingResearched(), false, 'Fresh save has no Cooking research');
    hud.updateCampButtons(scene);
    assert.equal(cookBtn.style.display, 'none', 'Cook at Campfire is hidden before the Cooking research');
    gs.completeResearch?.('research_cooking_station');
    if (!HUD.isCookingResearched()) gs.unlockBuildable('cooking_station');
    assert.equal(HUD.isCookingResearched(), true);
    hud.updateCampButtons(scene);
    assert.equal(cookBtn.style.display, 'inline-block', 'Cook at Campfire shows once Cooking is researched');
    console.log('✔ 2. Cook at Campfire hidden until the Cooking research.');
  }

  // ---------------------------------------------------------------------------
  // 3. Overflow guards (CSS) — every menu either fits or scrolls
  // ---------------------------------------------------------------------------
  {
    const html = fs.readFileSync('index.html', 'utf8');
    const rule = (sel: string) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&');
      return html.match(new RegExp(`(^|\\n)\\s*${esc} \\{[^}]*\\}`))?.[0] ?? '';
    };
    const hudCard = rule('.hud-card');
    assert.ok(/max-height:\s*calc\(100vh - \d+px\)/.test(hudCard) && /overflow-y:\s*auto/.test(hudCard), 'Left HUD panel is height-capped and scrolls');
    assert.ok(/pointer-events:\s*auto/.test(hudCard), 'Left HUD panel receives the wheel so it can scroll');
    assert.ok(/overflow-y:\s*auto/.test(rule('.custom-modal')), 'Every modal scrolls when its content outgrows the window');
    const activeClass = rule('.active-class-container');
    assert.ok(/flex-wrap:\s*wrap/.test(activeClass) && /overflow-y:\s*auto/.test(activeClass), 'Class list wraps and scrolls');
    for (const id of ['#unlock-modal', '#skill-discovered-modal']) {
      const r = rule(id);
      assert.ok(/max-height:\s*56vh/.test(r) && /overflow-y:\s*auto/.test(r), `${id} stays on screen`);
    }
    const guide = rule('#guild-guide-widget');
    assert.ok(/max-height:\s*calc\(100vh - \d+px\)/.test(guide) && /overflow-y:\s*auto/.test(guide), 'Guide widget stays on screen');
    console.log('✔ 3. Overflow guards present for the HUD panel, modals, class list, popups and guide.');
  }

  console.log('\n=== MENU + RESEARCH AUDIT PASSED ===');
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
