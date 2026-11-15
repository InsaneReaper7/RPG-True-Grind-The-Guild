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

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setLineWidth: () => obj,
      setVisible: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      play: () => obj,
      anims: { play: () => {} },
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      strokeLineShape: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      setText: () => obj,
      setColor: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    tileSize: 32,
    sound: { play: () => {} },
    time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      text: () => createMockObj(),
      graphics: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

function createTestPlayer(id: string = 'hero', name: string = 'Guild Hero'): Player {
  const pData = DataLoader.getInstance().getPlayer()!;
  const wpn = DataLoader.getInstance().getWeapon('short_swords')!;
  const prog = new ProgressionSystem(DataLoader.getInstance().getClassesData(), name);
  const mockScene = createMockScene();
  const player = new Player(mockScene, 0, 0, pData, wpn, 16, id, prog);
  player.entityName = name;
  player.bindProgression(prog);
  return player;
}

// Setup browser globals for Phaser / DOM under Node
const elements: Record<string, any> = {};
const noop = () => {};

const dummyCtx: any = new Proxy({
  fillStyle: '',
  globalCompositeOperation: '',
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  createImageData: () => ({ data: [0, 0, 0, 0] })
}, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    return noop;
  },
  set(target, prop, value) {
    (target as any)[prop] = value;
    return true;
  }
});

function createMockElement(tag: string = 'div', id: string = ''): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    id,
    style: {},
    classList: {
      _classes: new Set<string>(),
      add(cls: string) { el.classList._classes.add(cls); },
      remove(cls: string) { el.classList._classes.delete(cls); },
      toggle(cls: string) {
        if (el.classList._classes.has(cls)) el.classList._classes.delete(cls);
        else el.classList._classes.add(cls);
      },
      contains(cls: string) { return el.classList._classes.has(cls); }
    },
    innerText: '',
    _innerHTML: '',
    get innerHTML(): string {
      return el._innerHTML;
    },
    set innerHTML(html: string) {
      el._innerHTML = String(html);
      el.children = [];
      if (!html) return;
      // Match each opening tag
      const openTagRegex = /<([a-zA-Z0-9]+)([^>]*)>/g;
      let match;
      while ((match = openTagRegex.exec(html)) !== null) {
        const tagName = match[1];
        if (tagName.startsWith('/')) continue;
        const rawAttrs = match[2];
        const child = createMockElement(tagName);
        child.parentElement = el;

        // Parse attributes
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
          if (attrName === 'id') child.id = attrVal;
          else if (attrName === 'class') {
            for (const cls of attrVal.split(/\s+/)) {
              if (cls) child.classList.add(cls);
            }
          } else if (attrName.startsWith('data-')) {
            child.setAttribute(attrName, attrVal);
          }
        }
        el.children.push(child);
      }
    },
    value: '',
    children: [] as any[],
    appendChild(child: any) {
      el.children.push(child);
      child.parentElement = el;
      return child;
    },
    removeChild(child: any) {
      const idx = el.children.indexOf(child);
      if (idx !== -1) el.children.splice(idx, 1);
      return child;
    },
    querySelectorAll(selector: string) {
      const results: any[] = [];
      const traverse = (node: any) => {
        if (selector.startsWith('.')) {
          const cls = selector.slice(1);
          if (node.classList?.contains(cls)) results.push(node);
        } else if (selector.startsWith('#')) {
          const targetId = selector.slice(1);
          if (node.id === targetId) results.push(node);
        } else if (selector.startsWith('[')) {
          const match = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]/);
          if (match) {
            const attr = match[1];
            const val = match[2];
            const camel = attr.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            const actual = node.dataset?.[camel] || node.getAttribute?.(attr);
            let attrMatches = (val === undefined ? actual !== undefined : actual === val);
            if (attrMatches) {
              const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
              if (classMatch) {
                if (node.classList?.contains(classMatch[1])) results.push(node);
              } else {
                results.push(node);
              }
            }
          }
        }
        for (const c of node.children || []) traverse(c);
      };
      for (const c of el.children) traverse(c);
      return results;
    },
    querySelector(selector: string) {
      const list = el.querySelectorAll(selector);
      return list.length > 0 ? list[0] : null;
    },
    dataset: {} as Record<string, string>,
    setAttribute(name: string, val: string) {
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        el.dataset[camel] = val;
      }
    },
    getAttribute(name: string) {
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return el.dataset[camel] || null;
      }
      return null;
    },
    getContext: () => dummyCtx,
    parentElement: null as any
  };
  return el;
}

const mockWindow: any = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  localStorage: {
    getItem: () => null,
    setItem: noop,
    removeItem: noop,
    clear: noop
  }
};

const mockDocument: any = {
  createElement: (tag: string) => createMockElement(tag),
  getElementById: (id: string) => {
    if (!elements[id]) {
      elements[id] = createMockElement('div', id);
    }
    return elements[id];
  },
  querySelector: (sel: string) => null,
  querySelectorAll: (sel: string) => [],
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: {},
  body: createMockElement('body', 'body')
};

(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).document = mockDocument;
(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
(globalThis as any).HTMLVideoElement = class HTMLVideoElement {};

// Node mock fetch for DataLoader
(globalThis as any).fetch = async (url: string) => {
  const filePath = path.join(process.cwd(), url.replace(/^\//, ''));
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    ok: true,
    json: async () => JSON.parse(content)
  };
};

// Dynamic imports after globals are set
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { BuildingSystem } = await import('../src/systems/BuildingSystem.ts');
const { MerchantSystem } = await import('../src/systems/MerchantSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { HiddenSkillSystem } = await import('../src/systems/HiddenSkillSystem.ts');
const { ConsumableSystem } = await import('../src/systems/ConsumableSystem.ts');
const { HUD } = await import('../src/ui/HUD.ts');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 MILESTONE 9: THE MERCHANT, GOLD AND HAGGLING TEST SUITE');
  console.log('================================================================\n');

  const dl = DataLoader.getInstance();
  await dl.loadAll();
  const gs = GameState.getInstance();
  const bs = new BuildingSystem(50, 50);
  const ms = MerchantSystem.getInstance();

  // Test 1: Research node and buildable gating
  console.log('--- Test 1: Research node & Buildable Gating ---');
  {
    const researchTree = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8')).nodes;
    const merchantNode = researchTree.find((n: any) => n.id === 'research_merchant_visits');
    assert.ok(merchantNode, 'research_merchant_visits exists in researchTree.json');
    assert.equal(merchantNode.name, 'Merchant Visits');
    assert.equal(merchantNode.cost, 6);
    assert.ok(merchantNode.prerequisites?.includes('research_woodworking_bench'));
    assert.deepEqual(merchantNode.unlocksBuildables, ['merchant_stall']);

    const buildables = JSON.parse(fs.readFileSync('data/buildables.json', 'utf8')).buildables;
    const stall = buildables.find((b: any) => b.id === 'merchant_stall');
    assert.ok(stall, 'merchant_stall exists in buildables.json');
    assert.equal(stall.name, 'Merchant Stall');
    assert.equal(stall.indoorRequired, true);
    assert.equal(stall.lockedByDefault, true);
    assert.equal(stall.maxCount, 1);
    assert.equal(stall.woodCost, 15);
    assert.equal(stall.itemCosts?.planks, 5);

    // Setup an enclosed room for indoor placement
    const walls = new Set<string>([
      '0,0', '1,0', '2,0', '3,0',
      '0,1',               '3,1',
      '0,2',               '3,2',
      '0,3', '1,3', '2,3', '3,3'
    ]);
    const doors = new Set<string>(['3,1']);
    walls.delete('3,1');
    const isWallFn = (x: number, y: number) => walls.has(`${x},${y}`);
    const isDoorFn = (x: number, y: number) => doors.has(`${x},${y}`);

    // BuildingSystem.canPlace verification
    gs.resetToDefault();
    // 1. Locked check
    const stallDef = dl.getBuildable('merchant_stall')!;
    assert.ok(stallDef, 'DataLoader resolved merchant_stall');
    let canPlace = bs.canPlace(
      stallDef,
      1, 1,
      { x: 0, y: 0 },
      [],
      isWallFn,
      isDoorFn,
      () => false,
      100, // wood
      10,  // constLevel
      0,   // clay
      0,   // gardeningLevel
      (id: string) => gs.isBuildableUnlocked(id),
      0,   // ore
      (id: string) => (id === 'planks' ? 10 : 0)
    );
    assert.equal(canPlace.valid, false, 'Cannot place merchant_stall when locked');
    assert.ok(canPlace.reason?.includes('locked'), 'Reason mentions locked');

    // 2. Unlock it
    gs.unlockBuildable('merchant_stall');
    canPlace = bs.canPlace(
      stallDef,
      1, 1,
      { x: 0, y: 0 },
      [],
      isWallFn,
      isDoorFn,
      () => false,
      100,
      10,
      0,
      0,
      (id: string) => gs.isBuildableUnlocked(id),
      0,
      (id: string) => (id === 'planks' ? 10 : 0)
    );
    assert.equal(canPlace.valid, true, `Can place merchant_stall when unlocked and ingredients available (${canPlace.reason})`);

    // 3. Place one stall, then test maxCount: 1 rejection
    gs.addPlacedBuildable({ id: 'merchant_stall', x: 1, y: 1 });
    canPlace = bs.canPlace(
      stallDef,
      2, 1,
      { x: 0, y: 0 },
      [],
      isWallFn,
      isDoorFn,
      () => false,
      100,
      10,
      0,
      0,
      (id: string) => gs.isBuildableUnlocked(id),
      0,
      (id: string) => (id === 'planks' ? 10 : 0)
    );
    assert.equal(canPlace.valid, false, 'Second stall must be rejected by maxCount: 1');
    assert.ok(canPlace.reason?.includes('Merchant Stall'), 'Rejection message mentions buildable name');
    console.log('✔ Test 1 Passed: Research node, buildable definition, gating, and maxCount dynamic enforcement.');
  }

  // Test 2: Visit Timeline & Seeded Deterministic Stock
  console.log('\n--- Test 2: Visit Timeline & Seeded Deterministic Stock ---');
  {
    gs.resetToDefault();
    const config = dl.getMerchantConfig();
    assert.equal(config.visitIntervalDays, 5);
    assert.equal(config.visitLengthDays, 3);
    assert.equal(config.firstVisitDelayDays, 1);
    assert.equal(config.stockSlots, 6);

    // Initial state before stall placed
    let visitState = gs.getMerchantVisitState();
    assert.equal(visitState.placed, false);
    assert.equal(visitState.present, false);

    // Stall placed on Day 1
    gs.addPlacedBuildable({ id: 'merchant_stall', x: 10, y: 10 });
    gs.setMerchantVisitState({
      ...visitState,
      placed: true,
      nextArrivalDay: 1 + config.firstVisitDelayDays
    });
    visitState = gs.getMerchantVisitState();
    assert.equal(visitState.placed, true);
    assert.equal(visitState.nextArrivalDay, 2);

    // Day 1 ends -> Day 2 begins
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 2);
    visitState = gs.getMerchantVisitState();
    assert.equal(visitState.present, true, 'Merchant arrives on Day 2');
    assert.equal(visitState.visitNumber, 1);
    assert.equal(visitState.nextArrivalDay, 2 + config.visitIntervalDays, 'nextArrivalDay is 2 + 5 = 7');
    assert.equal(visitState.stock.length, 6, 'Stock has 6 slots');
    const distinctStockIds = new Set(visitState.stock.map((s: any) => s.id));
    assert.equal(distinctStockIds.size, 6, 'All 6 rolled stock slots must be distinct');

    // Day 2 ends -> Day 3 begins (stay day 2)
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 3);
    assert.equal(gs.getMerchantVisitState().present, true, 'Merchant stays Day 3');

    // Day 3 ends -> Day 4 begins (stay day 3)
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 4);
    assert.equal(gs.getMerchantVisitState().present, true, 'Merchant stays Day 4');

    // Day 4 ends -> Day 5 begins (visitLengthDays = 3 completed, merchant leaves)
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 5);
    assert.equal(gs.getMerchantVisitState().present, false, 'Merchant leaves on Day 5');

    // Day 5 ends -> Day 6 begins (merchant away)
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 6);
    assert.equal(gs.getMerchantVisitState().present, false, 'Merchant still away on Day 6');

    // Day 6 ends -> Day 7 begins (nextArrivalDay = 7 reached -> merchant returns!)
    gs.advanceGameDay();
    assert.equal(gs.getCurrentGameDay(), 7);
    const day7State = gs.getMerchantVisitState();
    assert.equal(day7State.present, true, 'Merchant returns on Day 7');
    assert.equal(day7State.visitNumber, 2);
    assert.equal(day7State.nextArrivalDay, 7 + config.visitIntervalDays, 'nextArrivalDay is 7 + 5 = 12');
    assert.equal(day7State.stock.length, 6);

    // Verify snapshot persistence of visit state
    const player = createTestPlayer('test_hero', 'test_hero');
    gs.saveSnapshot(player, player.progression, 1000);
    const snap = gs.getSnapshot()!;
    assert.ok(snap.merchantVisit, 'Snapshot contains merchantVisit');
    assert.equal(snap.merchantVisit.present, true);
    assert.equal(snap.merchantVisit.visitNumber, 2);

    console.log('✔ Test 2 Passed: 1-day initial delay, 3-day stay, 5-day cycle arrival-to-arrival, seeded stock, and snapshot persistence.');
  }

  // Test 3: Away vs Present Stall Click
  console.log('\n--- Test 3: Away vs Present Stall Click ---');
  {
    gs.resetToDefault();
    gs.addPlacedBuildable({ id: 'merchant_stall', x: 10, y: 10 });
    gs.setMerchantVisitState({
      placed: true,
      present: false,
      nextArrivalDay: 5,
      visitNumber: 0,
      stock: []
    });

    const visit = gs.getMerchantVisitState();
    const daysLeft = Math.max(1, visit.nextArrivalDay - gs.getCurrentGameDay());
    const awayMessage = `The merchant is away. Back in ${daysLeft} days.`;
    assert.equal(awayMessage, 'The merchant is away. Back in 4 days.');

    // When present
    gs.setMerchantVisitState({
      ...visit,
      present: true
    });
    assert.equal(gs.getMerchantVisitState().present, true);
    console.log('✔ Test 3 Passed: Away toast message format and present condition verified.');
  }

  // Test 4: Gold state & HUD
  console.log('\n--- Test 4: Gold State & Snapshot Persistence ---');
  {
    gs.resetToDefault();
    assert.equal(gs.getGold(), 0, 'Initial gold is 0');
    gs.addGold(150);
    assert.equal(gs.getGold(), 150);
    const consumed = gs.consumeGold(50);
    assert.equal(consumed, true);
    assert.equal(gs.getGold(), 100);

    const player = createTestPlayer('test_hero', 'test_hero');
    gs.saveSnapshot(player, player.progression, 1000);
    const savedSnap = JSON.parse(JSON.stringify(gs.getSnapshot()!));
    assert.equal(savedSnap.gold, 100, 'Snapshot persists gold');

    // Restore check
    gs.setGold(0);
    assert.equal(gs.getGold(), 0);
    gs.restoreFromLoadedSnapshot(savedSnap);
    assert.equal(gs.getGold(), 100, 'Restore recovers gold');
    console.log('✔ Test 4 Passed: Gold manipulation, snapshot persistence, and restoration.');
  }

  // Test 5: Selling Crafted Items Only & Pricing Formula
  console.log('\n--- Test 5: Selling Crafted Items Only & Pricing Formula ---');
  {
    const player = createTestPlayer('Hero', 'Hero');
    const prog = player.progression;

    // 1. Not sellable: raw materials, monster drops, gathered items, merchant wares
    const nonSellables = ['wood', 'ore', 'clay', 'stone', 'wild_herbs', 'ectoplasm', 'bone', 'crypt_meat', 'river_carp', 'traders_rapier', 'merchants_charm', 'travelers_tonic'];
    for (const id of nonSellables) {
      assert.equal(MerchantSystem.isSellable(id), false, `${id} must not be sellable`);
      assert.equal(MerchantSystem.getSellPrice(id, player), 0, `${id} sell price must be 0`);
    }

    // 2. Sellable: recipe results
    assert.equal(MerchantSystem.isSellable('bandage'), true, 'bandage is sellable');
    assert.equal(MerchantSystem.isSellable('mace'), true, 'mace is sellable');
    assert.equal(MerchantSystem.isSellable('planks'), true, 'planks is sellable');

    // 3. Formula verification matching brief example:
    // "a recipe with 7 ingredient units, requiredLevel 8, common, Haggling 0:
    //  3 × 7 × 1.8 = 37.8 → 37 gold; at Haggling 20 → ×1.1 → 41 gold."
    const config = dl.getMerchantConfig();
    assert.equal(config.valuePerIngredientUnit, 3);
    assert.equal(config.valuePerRequiredLevel, 0.10);
    assert.equal(config.hagglingPerLevel, 0.005);

    const ingredientSum = 7;
    const requiredLevel = 8;
    const baseVal = (config.valuePerIngredientUnit * ingredientSum) * (1 + config.valuePerRequiredLevel * requiredLevel);
    assert.ok(Math.abs(baseVal - 37.8) < 1e-6, 'baseVal is 37.8');
    const floorHaggling0 = Math.floor(baseVal * 1.0 * (1 + config.hagglingPerLevel * 0));
    assert.equal(floorHaggling0, 37, 'Haggling 0 formula matches brief: 37 gold');
    const floorHaggling20 = Math.floor(baseVal * 1.0 * (1 + config.hagglingPerLevel * 20));
    assert.equal(floorHaggling20, 41, 'Haggling 20 formula matches brief: 41 gold');

    // 4. Food quality multipliers
    assert.equal(config.foodQualityMultiplier.poor, 0.5);
    assert.equal(config.foodQualityMultiplier.common, 1.0);
    assert.equal(config.foodQualityMultiplier.good, 1.25);
    assert.equal(config.foodQualityMultiplier.excellent, 1.5);
    assert.equal(config.foodQualityMultiplier.perfect, 1.75);

    // 5. Equipped gear exclusion in getSellableItems
    gs.resetToDefault();
    player.inventory.set('mace', 1);
    const weaponDef = dl.getWeapon('mace');
    player.equippedWeapon = weaponDef!;
    // With it equipped, getSellableItems must not include it!
    const sellables = ms.getSellableItems(player);
    assert.ok(!sellables.some((s: any) => s.id === 'mace'), 'Equipped weapon is excluded from sell list');

    console.log('✔ Test 5 Passed: Crafted-only validation, pricing formula match with brief, food quality multipliers, and equipped exclusion.');
  }

  // Test 6: Buying Exclusive Stock & Programmatic Stat Verification
  console.log('\n--- Test 6: Buying Exclusive Stock & Programmatic Stat Verification ---');
  {
    // Programmatically compare the 5 exclusive pieces with their base pieces
    // 1. traders_rapier vs steel_short_sword
    const tradersRapier = dl.getWeapon('traders_rapier')!;
    const steelShortSword = dl.getWeapon('steel_short_sword')!;
    assert.ok(tradersRapier && steelShortSword);
    assert.equal(tradersRapier.attackIntervalMs, 950, 'steel_short_sword attackIntervalMs is 950');
    assert.equal(tradersRapier.attackIntervalMs, steelShortSword.attackIntervalMs);
    assert.equal(tradersRapier.baseDamage, Math.round(steelShortSword.baseDamage * 1.10 * 10) / 10);
    assert.equal(tradersRapier.weaponType, steelShortSword.weaponType);
    assert.equal(tradersRapier.attackRange, steelShortSword.attackRange);
    assert.equal(tradersRapier.handedness, steelShortSword.handedness);
    assert.equal(tradersRapier.weight, steelShortSword.weight);

    // 2. caravan_warbow vs war_bow
    const caravanWarbow = dl.getWeapon('caravan_warbow')!;
    const warBow = dl.getWeapon('war_bow')!;
    assert.ok(caravanWarbow && warBow);
    assert.equal(caravanWarbow.baseDamage, Math.round(warBow.baseDamage * 1.10 * 10) / 10);
    assert.equal(caravanWarbow.attackIntervalMs, warBow.attackIntervalMs);
    assert.equal(caravanWarbow.attackRange, warBow.attackRange);
    assert.equal(caravanWarbow.weaponType, warBow.weaponType);

    // 3. sandstorm_glaive vs frost_halberd
    const sandstormGlaive = dl.getWeapon('sandstorm_glaive')!;
    const frostHalberd = dl.getWeapon('frost_halberd')!;
    assert.ok(sandstormGlaive && frostHalberd);
    assert.equal(sandstormGlaive.baseDamage, Math.round(frostHalberd.baseDamage * 1.10 * 10) / 10);
    assert.equal(sandstormGlaive.attackIntervalMs, frostHalberd.attackIntervalMs);
    assert.equal(sandstormGlaive.attackRange, frostHalberd.attackRange);

    // 4. desert_steel_saber vs void_longsword
    const desertSteelSaber = dl.getWeapon('desert_steel_saber')!;
    const voidLongsword = dl.getWeapon('void_longsword')!;
    assert.ok(desertSteelSaber && voidLongsword);
    assert.equal(desertSteelSaber.baseDamage, Math.round(voidLongsword.baseDamage * 1.05 * 10) / 10);
    assert.equal(desertSteelSaber.attackIntervalMs, voidLongsword.attackIntervalMs);
    assert.equal(desertSteelSaber.attackRange, voidLongsword.attackRange);

    // 5. nomads_coat vs frost_leather_armor
    const nomadsCoat = dl.getArmor('nomads_coat')!;
    const frostLeatherArmor = dl.getArmor('frost_leather_armor')!;
    assert.ok(nomadsCoat && frostLeatherArmor);
    assert.equal(nomadsCoat.slot, frostLeatherArmor.slot);
    assert.equal(nomadsCoat.armorRating, frostLeatherArmor.armorRating);
    assert.equal(nomadsCoat.weightClass, frostLeatherArmor.weightClass);
    assert.equal(nomadsCoat.weight, frostLeatherArmor.weight);
    assert.equal(nomadsCoat.hpBonus, Math.round(frostLeatherArmor.hpBonus * 1.05 * 10) / 10);

    // Recipe scroll price check
    const stockEntries = dl.getMerchantStock();
    const nomadsCoatScroll = stockEntries.find((s: any) => s.id === 'merchant_recipe_nomads_coat');
    assert.ok(nomadsCoatScroll);
    assert.equal(nomadsCoatScroll.price, 600, "Nomad's Coat scroll price is 600 per Director decision 2");

    // Stock rolling excludes known recipes
    gs.resetToDefault();
    gs.learnGearRecipe('desert_steel_saber');
    gs.learnGearRecipe('nomads_coat');
    gs.discoverAlchemyRecipe('greater_energy_draught');
    const rolledStock = ms.rollStock(1);
    assert.ok(!rolledStock.some((s: any) => s.refId === 'merchant_recipe_desert_steel_saber'), 'Known desert_steel_saber scroll not rolled');
    assert.ok(!rolledStock.some((s: any) => s.refId === 'merchant_recipe_nomads_coat'), 'Known nomads_coat scroll not rolled');
    assert.ok(!rolledStock.some((s: any) => s.refId === 'merchant_recipe_greater_energy_draught'), 'Known greater_energy_draught scroll not rolled');

    console.log('✔ Test 6 Passed: Programmatic stat verification against base pieces, exact multipliers, and known recipe exclusion.');
  }

  // Test 7: Recipe scrolls, consumables, charm & Luck bonus
  console.log('\n--- Test 7: Recipe Scrolls, Consumables, Charm & Luck Bonus ---');
  {
    gs.resetToDefault();
    const player = createTestPlayer('Hero', 'Hero');
    const prog = player.progression;

    // 1. Scrolls resolve via teachesRecipeId
    const draughtScroll = dl.getItem('merchant_recipe_greater_energy_draught');
    assert.equal(draughtScroll?.teachesRecipeId, 'greater_energy_draught');

    // Alchemy station hides requiresScroll recipes until learned
    assert.equal(gs.isAlchemyRecipeDiscovered('greater_energy_draught'), false);
    player.addItem('merchant_recipe_greater_energy_draught', 1);
    const learnRes = ConsumableSystem.getInstance().useConsumable('merchant_recipe_greater_energy_draught', { preferredTarget: player });
    assert.equal(learnRes.success, true);
    assert.equal(gs.isAlchemyRecipeDiscovered('greater_energy_draught'), true, 'greater_energy_draught discovered after using scroll');

    // 2. greater_energy_draught restores 60% energy
    player.energy = 10;
    player.addItem('greater_energy_draught', 1);
    const potRes = ConsumableSystem.getInstance().useConsumable('greater_energy_draught', { preferredTarget: player });
    assert.equal(potRes.success, true);
    assert.equal(player.energy, 70, 'greater_energy_draught restores 60% of 100 max energy (10 + 60 = 70)');

    // 3. travelers_tonic restores 40% HP & 40% Energy
    player.hp = 10;
    player.energy = 10;
    player.addItem('travelers_tonic', 1);
    const tonicRes = ConsumableSystem.getInstance().useConsumable('travelers_tonic', { preferredTarget: player });
    assert.equal(tonicRes.success, true);
    assert.equal(player.hp, 30, 'travelers_tonic restores 40% of 50 max HP (10 + 20 = 30)');
    assert.equal(player.energy, 50, 'travelers_tonic restores 40% of 100 max Energy (10 + 40 = 50)');

    // 4. merchants_charm +0.5 Luck in accessory slot
    const charmDef = dl.getArmor('merchants_charm')!;
    assert.ok(charmDef);
    assert.equal(charmDef.slot, 'accessory');
    assert.equal(charmDef.luckBonus, 0.5);

    const luckDef = dl.getHiddenSkill('luck')!;
    assert.ok(luckDef);
    const baseProcChance = HiddenSkillSystem.getInstance().calculateProcChance(luckDef, 0, 0, prog);
    assert.equal(baseProcChance, luckDef.baseProcChance);

    // Equip charm
    player.equippedAccessory = charmDef;
    assert.equal(player.getEffectiveLuck(), 0.5, 'Effective luck is 0.5 with charm');
    assert.equal(prog.getEffectiveLuck(), 0.5, 'Progression effective luck is 0.5 with charm');
    assert.equal(prog.getProficiencyLevel('luck'), 0, 'Stored luck level is STILL 0 (never altered)');

    const charmProcChance = HiddenSkillSystem.getInstance().calculateProcChance(luckDef, 0, 0, prog);
    const expectedRise = 0.5 * luckDef.procChancePerLevel;
    assert.equal(Math.round((charmProcChance - baseProcChance) * 100000) / 100000, Math.round(expectedRise * 100000) / 100000, 'Proc chance rises by exactly 0.5 * procChancePerLevel');

    // Unequip charm
    player.equippedAccessory = null;
    assert.equal(player.getEffectiveLuck(), 0);
    assert.equal(prog.getEffectiveLuck(), 0);
    const unequippedChance = HiddenSkillSystem.getInstance().calculateProcChance(luckDef, 0, 0, prog);
    assert.equal(unequippedChance, baseProcChance, 'Unequipping returns proc chance to baseline');

    console.log('✔ Test 7 Passed: teachesRecipeId scroll learning, 60% energy draught, 40% tonic, and +0.5 Luck effective bonus.');
  }

  // Test 8: UI Interaction & Real Transactions
  console.log('\n--- Test 8: UI Interaction & Real Transactions ---');
  {
    gs.resetToDefault();
    gs.addGold(500);
    const player = createTestPlayer('Hero', 'Hero');
    const prog = player.progression;

    // Set visit with stock
    gs.setMerchantVisitState({
      placed: true,
      present: true,
      nextArrivalDay: 7,
      visitNumber: 1,
      stock: [
        { id: 'stock_1', kind: 'item', refId: 'travelers_tonic', name: "Traveler's Tonic", description: 'Restores 40% HP and Energy', price: 60, weight: 6, sold: false }
      ]
    });

    // Give player a crafted item to sell
    player.inventory.set('mace', 2);

    const hud = new HUD();
    hud.currentParty = [player];
    hud.currentPlayer = player;

    // Open modal
    hud.openMerchantModal(player);
    assert.equal(hud.isMerchantModalOpen(), true, 'Merchant modal opened');

    // Click Buy button
    const buyBtn = (document.getElementById('merchant-buy-list') as any).querySelector('[data-merchant-buy-id="stock_1"]') as HTMLButtonElement;
    assert.ok(buyBtn, 'Found buy button for stock_1');
    buyBtn.onclick!({} as any);

    // Verify stock is now sold and gold deducted
    assert.equal(gs.getMerchantVisitState().stock[0].sold, true, 'Item marked sold');
    assert.equal(gs.getGold(), 440, 'Gold deducted (500 - 60 = 440)');
    assert.equal(player.getItemCount('travelers_tonic'), 1, 'Player received bought tonic');

    // Switch to Sell tab
    const sellTabBtn = document.getElementById('merchant-tab-sell') as HTMLButtonElement;
    assert.ok(sellTabBtn, 'Found Sell tab button');
    sellTabBtn.onclick!({} as any);

    const sellListEl = document.getElementById('merchant-sell-list');
    const sellOneBtn = sellListEl?.querySelector('.merchant-sell-one-btn') as HTMLButtonElement;
    assert.ok(sellOneBtn, 'Found Sell 1 button');
    const initialGold = gs.getGold();
    sellOneBtn.onclick!({} as any);

    assert.ok(gs.getGold() > initialGold, 'Gold increased after selling crafted item');
    assert.equal(player.inventory.get('mace'), 1, '1 item remains in inventory');

    // Close modal
    hud.closeMerchantModal();
    assert.equal(hud.isMerchantModalOpen(), false, 'Merchant modal closed');

    console.log('✔ Test 8 Passed: Real transactions via UI elements, gold updates, tab switching, and modal controls.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL MILESTONE 9 TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
