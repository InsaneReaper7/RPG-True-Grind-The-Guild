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

import { ProgressionSystem } from '../src/systems/ProgressionSystem';


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
// Owner bug reports from build 1dd6b0d (2026-11-13):
//  TG-YUIBLP: the N key did not open the Research Tree ("Research Tree [N]")
//  TG-SI1QHR: the Alchemy recipe list was taller than the window with no scroll
// =============================================================================

function makeClassList() {
  const set = new Set<string>();
  return {
    set,
    add: (c: string) => set.add(c),
    remove: (c: string) => set.delete(c),
    contains: (c: string) => set.has(c),
    toggle: (c: string, force?: boolean) => { const on = force ?? !set.has(c); if (on) set.add(c); else set.delete(c); return on; }
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BUG FIXES TG-YUIBLP (N key) + TG-SI1QHR (Alchemy list scroll)');
  console.log('================================================================\n');

  // The Research Tree render builds node cards; give mock elements the fields it writes to.
  const baseCreateElement = mockDocument.createElement;
  mockDocument.createElement = (tag: string) => {
    const el: any = baseCreateElement(tag);
    el.dataset = {};
    el.children = [];
    el.appendChild = (c: any) => { el.children.push(c); return c; };
    el.querySelector = () => null;
    el.querySelectorAll = () => [];
    el.addEventListener = () => {};
    el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    return el;
  };
  const researchModalEl = mockDocument.getElementById('research-tree-modal');
  const researchClasses = makeClassList();
  researchModalEl.classList = researchClasses;

  const { HUD } = await import('../src/ui/HUD');
  const { Player } = await import('../src/entities/Player');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem');
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const hud = new HUD();
  const origLog = console.log;

  const pressKey = (key: string, code: string) => {
    for (const cb of listeners['keydown'] || []) {
      cb({ key, code, target: { tagName: 'CANVAS' }, shiftKey: false, preventDefault: () => {} });
    }
  };

  // ---------------------------------------------------------------------------
  // TG-YUIBLP: N toggles the Research Tree at the outpost (the button's labelled hotkey)
  // ---------------------------------------------------------------------------
  {
    assert.ok((listeners['keydown'] || []).length > 0, 'HUD registers its global keydown listener');
    console.log = () => {};
    hud.setLocation('Guild Outpost', true);
    console.log = origLog;

    pressKey('n', 'KeyN');
    assert.equal(hud.isResearchTreeModalOpen(), true, 'N opens the Research Tree at the outpost');
    pressKey('N', 'KeyN');
    assert.equal(hud.isResearchTreeModalOpen(), false, 'Pressing N again closes it');

    // Typing in a text field must not toggle it.
    for (const cb of listeners['keydown'] || []) {
      cb({ key: 'n', code: 'KeyN', target: { tagName: 'INPUT' }, shiftKey: false, preventDefault: () => {} });
    }
    assert.equal(hud.isResearchTreeModalOpen(), false, 'N while typing in a text field is ignored');

    // In the dungeon there is no Research Station, so N does nothing (same as the button, which is outpost-only).
    console.log = () => {};
    hud.setLocation('Ancient Crypts', false);
    console.log = origLog;
    pressKey('n', 'KeyN');
    assert.equal(hud.isResearchTreeModalOpen(), false, 'N does nothing away from the outpost');
    console.log = () => {};
    hud.setLocation('Guild Outpost', true);
    console.log = origLog;

    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('Research Tree [N]'), 'The button still advertises the N hotkey');
    console.log('✔ TG-YUIBLP: N opens/closes the Research Tree at the outpost; ignored while typing or in the dungeon.');
  }

  // ---------------------------------------------------------------------------
  // TG-SI1QHR: Alchemy modal is height-capped, its recipe list scrolls, and re-renders keep the scroll
  // ---------------------------------------------------------------------------
  {
    const html = fs.readFileSync('index.html', 'utf8');
    const alchemyRule = html.match(/#alchemy-modal \{[^}]*\}/)?.[0] ?? '';
    assert.ok(/max-height:\s*85vh/.test(alchemyRule), 'Alchemy modal is capped at 85vh like the other crafting modals');
    const listRule = html.match(/#alchemy-modal #alchemy-recipes-container \{[^}]*\}/)?.[0] ?? '';
    assert.ok(/overflow-y:\s*auto/.test(listRule), 'Alchemy recipe list scrolls');
    assert.ok(/min-height:\s*\d+px/.test(listRule) && /flex:\s*1 1 auto/.test(listRule), 'Recipe list takes the remaining height and can shrink');
    const modalBase = html.match(/\.custom-modal \{[^}]*\}/)?.[0] ?? '';
    const z = Number(modalBase.match(/z-index:\s*(\d+)/)?.[1]);
    assert.ok(z > 110 && z < 120, `Modals sit above the party portraits (110) and below confirm dialogs (120); got ${z}`);

    // The recipe list keeps its scroll position when it re-renders after a craft.
    const scene = createMockScene();
    const staff = dataLoader.getWeapon('healing_staff') ?? dataLoader.getWeapon('short_swords')!;
    const hero = new Player(scene as any, 5, 5, { hp: 100, criticalHp: 50, energy: 100, attackRangeTiles: 1 }, staff, 16, 'player-avatar');
    const progression = new ProgressionSystem(hero as any);
    const listEl = mockDocument.getElementById('alchemy-recipes-container');
    listEl.scrollTop = 340;
    console.log = () => {};
    hud.renderAlchemyModal(hero, progression);
    console.log = origLog;
    assert.equal(listEl.scrollTop, 340, 'Re-rendering the Alchemy list preserves its scroll position');
    console.log('✔ TG-SI1QHR: Alchemy modal capped, recipe list scrolls, scroll kept across re-renders.');
  }

  console.log('\n=== ALL TG-YUIBLP / TG-SI1QHR TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
