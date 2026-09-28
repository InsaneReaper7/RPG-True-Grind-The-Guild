import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// --- MOCK DOM IMPLEMENTATION ---
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...classes: string[]) => classes.forEach((c) => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach((c) => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public onclick: any = null;
  private _textContent: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = String(val);
  }

  get innerText(): string {
    return this._textContent;
  }
  set innerText(val: string) {
    this._textContent = String(val);
  }

  get innerHTML(): string {
    return this._textContent;
  }
  set innerHTML(val: string) {
    this._textContent = String(val);
  }

  public querySelector<T = any>(sel: string): T | null {
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inner = sel.slice(1, -1);
      const [attr, valRaw] = inner.split('=');
      const val = valRaw ? valRaw.replace(/['"]/g, '') : null;
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        if (this.dataset[key] !== undefined && (val === null || this.dataset[key] === val)) {
          return this as any;
        }
      }
    }
    for (const child of this.children) {
      const match = child.querySelector(sel);
      if (match) return match;
    }
    return null;
  }

  public appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }
}

const mockDomElements: Map<string, MockElement> = new Map();
function getOrCreateElement(id: string): MockElement {
  if (!mockDomElements.has(id)) {
    const el = new MockElement('div');
    el.id = id;
    mockDomElements.set(id, el);
  }
  return mockDomElements.get(id)!;
}

if (typeof (global as any).window === 'undefined') {
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

  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    localStorage: {
      _store: new Map<string, string>(),
      getItem(k: string) { return this._store.get(k) ?? null; },
      setItem(k: string, v: string) { this._store.set(k, String(v)); },
      removeItem(k: string) { this._store.delete(k); },
      clear() { this._store.clear(); }
    }
  };
  (global as any).document = {
    createElement: (tag: string) => {
      const el = new MockElement(tag);
      (el as any).getContext = () => dummyCtx;
      return el;
    },
    getElementById: (id: string) => getOrCreateElement(id),
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: new MockElement('body')
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
  (globalThis as any).window = (global as any).window;
  (globalThis as any).document = (global as any).document;
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

function createMockPhaserScene(isOutpost: boolean = false) {
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setScrollFactor: () => obj,
      setVisible: () => obj,
      setText: () => obj,
      setColor: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setScale: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setPosition: () => obj,
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
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
    isOutpost,
    sound: { play: () => {} },
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
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
      image: () => createMockObj(),
      container: () => {
        const c = createMockObj();
        c.add = () => {};
        return c;
      },
      existing: (item: any) => item
    },
    tweens: {
      add: (cfg: any) => {
        if (cfg?.onComplete) cfg.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

// Pre-create UI elements
[
  'player-hp', 'player-crit-hp', 'player-energy', 'player-weapon',
  'hud-proficiency-row', 'hud-proficiency-label', 'player-proficiency',
  'hud-class-row', 'player-class', 'player-status', 'player-wood', 'build-overlay-wood',
  'day-clock-badge', 'player-hunger-text', 'player-mood-text', 'hud-ration-row',
  'player-ration-text', 'hud-eat-ration-btn', 'downed-banner',
  'party-portraits-hud', 'party-reselect-all-btn',
  'party-overview-modal', 'close-party-btn', 'party-spawn-companion-btn', 'party-overview-roster', 'open-party-btn',
  'party-overview-inventory', 'party-inventory-item-list',
  'stash-toggle-filter-btn', 'stash-toggle-filter-indicator', 'stash-toggle-filter-label',
  'blacksmithing-modal', 'blacksmithing-recipes-container', 'close-blacksmithing-btn',
  'armorsmithing-modal', 'armorsmithing-recipes-container', 'close-armorsmithing-btn',
  'bowyer-modal', 'bowyer-recipes-container', 'close-bowyer-btn',
  'alchemy-modal', 'alchemy-recipes-container', 'close-alchemy-btn',
  'alchemy-mood-value', 'alchemy-mood-effect', 'alchemy-player-status',
  'cooking-modal', 'cooking-recipes-container', 'close-cooking-btn', 'cooking-dishes-container'
].forEach((id) => getOrCreateElement(id));

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFICATION SUITE: HUNGER & MOOD FREEZE AT NEUTRAL 🧪');
  console.log('========================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { HUD } = await import('../src/ui/HUD.ts');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const basePlayerData = {
    name: 'Guild Hero',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 100,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords',
    baseCarryCapacity: 45.0
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Data-Driven Configuration Verification
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Data-Driven Configuration Verification ---');
  const moodEffects = dataLoader.getMoodEffectsData();
  assert.strictEqual(moodEffects.hungerEnabled, false, 'hungerEnabled must be false in moodEffects.json');
  assert.strictEqual(moodEffects.moodEnabled, false, 'moodEnabled must be false in moodEffects.json');
  assert.strictEqual(dataLoader.isHungerEnabled(), false, 'dataLoader.isHungerEnabled() must return false');
  assert.strictEqual(dataLoader.isMoodEnabled(), false, 'dataLoader.isMoodEnabled() must return false');
  console.log('✓ Test 1 Passed: Switches are configured as false in data/moodEffects.json.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Switches OFF — Simulated 10 Minutes in Dungeon
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Switches OFF — Simulated 10 Minutes in Dungeon ---');
  dataLoader.setHungerEnabled(false);
  dataLoader.setMoodEnabled(false);
  GameState.getInstance().setSafeZone(false); // Dungeon floor environment

  const dungeonScene = createMockPhaserScene(false);
  const heroFrozen = new Player(
    dungeonScene as any,
    0,
    0,
    basePlayerData as any,
    dataLoader.getWeapon('short_swords')!,
    32,
    'player-avatar',
    new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero')
  );

  console.log(`  Initial State: Hunger = ${heroFrozen.hunger.toFixed(1)}, Mood = ${heroFrozen.mood.toFixed(1)}`);
  assert.strictEqual(heroFrozen.hunger, 100, 'Initial hunger must be 100');
  assert.strictEqual(heroFrozen.mood, 50, 'Initial mood must be neutral Content (50)');

  // Simulate 10 minutes (600 seconds, 600 ticks of 1000ms delta)
  let currentTime = 1000;
  for (let sec = 1; sec <= 600; sec++) {
    currentTime += 1000;
    heroFrozen.update(currentTime, 1000);
    if (sec % 120 === 0) {
      console.log(`  [Dungeon ${sec / 60}m] Hunger: ${heroFrozen.hunger.toFixed(1)}/100, Mood: ${heroFrozen.mood.toFixed(1)}/100 (Held Neutral)`);
    }
  }

  assert.strictEqual(heroFrozen.hunger, 100, 'Hunger must remain at 100 after 10 minutes');
  assert.strictEqual(heroFrozen.mood, 50, 'Mood must remain at 50 after 10 minutes');

  const frozenMoodTier = dataLoader.getMoodTier(heroFrozen.mood);
  assert.strictEqual(frozenMoodTier.tier, 'content', 'Mood tier must be Content');
  assert.strictEqual(frozenMoodTier.combatDamageMultiplier, 1.0, 'Combat damage multiplier must be 1.0x');
  assert.strictEqual(frozenMoodTier.combatAccuracyBonus, 0.0, 'Combat accuracy bonus must be +0.0');
  assert.strictEqual(frozenMoodTier.alchemyYieldBonus, 0, 'Alchemy yield bonus must be 0');

  console.log(`  Combat Stats: Damage Multiplier = ×${frozenMoodTier.combatDamageMultiplier}, Accuracy Bonus = +${frozenMoodTier.combatAccuracyBonus}`);
  console.log('✓ Test 2 Passed: 10 simulated minutes in dungeon kept Hunger at 100 and Mood at 50 with ×1.0 damage and +0 accuracy.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Switches ON — Simulated 10 Minutes in Dungeon Reproduces Drain Rates
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Switches ON — Simulated 10 Minutes in Dungeon Reproduces Drain Rates ---');
  dataLoader.setHungerEnabled(true);
  dataLoader.setMoodEnabled(true);
  GameState.getInstance().setSafeZone(false);

  const heroLive = new Player(
    dungeonScene as any,
    0,
    0,
    basePlayerData as any,
    dataLoader.getWeapon('short_swords')!,
    32,
    'player-avatar',
    new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero')
  );
  heroLive.hunger = 100;
  heroLive.mood = 80;

  console.log(`  Initial State: Hunger = ${heroLive.hunger.toFixed(1)}, Mood = ${heroLive.mood.toFixed(1)}`);

  let liveTime = 1000;
  let hungerEmptiedSec = -1;
  for (let sec = 1; sec <= 600; sec++) {
    liveTime += 1000;
    heroLive.update(liveTime, 1000);
    if (heroLive.hunger <= 0 && hungerEmptiedSec === -1) {
      hungerEmptiedSec = sec;
      console.log(`  [Drain Event] Hunger completely emptied at ${sec} seconds (~${(sec / 60).toFixed(1)} minutes)`);
    }
    if (sec % 120 === 0) {
      console.log(`  [Dungeon ${sec / 60}m] Hunger: ${heroLive.hunger.toFixed(1)}/100, Mood: ${heroLive.mood.toFixed(1)}/100`);
    }
  }

  assert.strictEqual(hungerEmptiedSec, 200, 'Hunger must empty in exactly 200 seconds at 0.5/sec drain');
  assert.strictEqual(heroLive.hunger, 0, 'Hunger must be 0 after 10 minutes');
  assert.strictEqual(heroLive.mood, 0, 'Mood must drain to 0 after 10 minutes');

  const liveMoodTier = dataLoader.getMoodTier(heroLive.mood);
  assert.strictEqual(liveMoodTier.tier, 'low', 'Mood tier must be Low Mood');
  assert.strictEqual(liveMoodTier.combatDamageMultiplier, 0.85, 'Combat damage multiplier must be 0.85x (-15%)');
  assert.strictEqual(liveMoodTier.combatAccuracyBonus, -0.10, 'Combat accuracy bonus must be -0.10 (-10%)');

  console.log(`  Drained Combat Stats: Damage Multiplier = ×${liveMoodTier.combatDamageMultiplier} (-15%), Accuracy Bonus = ${liveMoodTier.combatAccuracyBonus} (-10%)`);
  console.log('✓ Test 3 Passed: Switches ON reproduces exact original drain rates and penalties.\n');

  // Restore switches to OFF for subsequent tests
  dataLoader.setHungerEnabled(false);
  dataLoader.setMoodEnabled(false);

  // ---------------------------------------------------------------------------
  // TEST 4: Eating Stew Applies Well Fed Buff While Meters Frozen
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Eating Stew Applies Well Fed Buff While Meters Frozen ---');
  const heroEating = new Player(
    dungeonScene as any,
    0,
    0,
    basePlayerData as any,
    dataLoader.getWeapon('short_swords')!,
    32,
    'player-avatar',
    new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero')
  );
  heroEating.hp = 30; // Injured to observe regen
  heroEating.addFoodItem('herb_stew', 1, 'common', 1);

  const ate = heroEating.eatFood('herb_stew');
  assert.strictEqual(ate, true, 'Hero must be able to eat stew');
  assert.strictEqual(heroEating.hunger, 100, 'Hunger remains at 100');
  assert.strictEqual(heroEating.mood, 50, 'Mood remains at 50');
  assert.strictEqual(heroEating.wellFedRemainingMs, 15000, 'Well Fed buff duration is 15000ms');
  assert.strictEqual(heroEating.wellFedHpPerSec, 2, 'Well Fed buff grants +2 HP/sec');

  // Tick for 5 seconds to observe HP regeneration
  const hpBefore = heroEating.hp;
  for (let s = 1; s <= 5; s++) {
    heroEating.update(liveTime + s * 1000, 1000);
  }
  const hpAfter = heroEating.hp;
  assert.strictEqual(hpAfter, hpBefore + 10, 'Well Fed buff regenerated 10 HP over 5 seconds (+2 HP/s)');
  assert.strictEqual(heroEating.hunger, 100, 'Hunger is still 100');
  assert.strictEqual(heroEating.mood, 50, 'Mood is still 50');
  console.log(`  Regenerated HP from ${hpBefore} to ${hpAfter} while Hunger held at ${heroEating.hunger} and Mood held at ${heroEating.mood}`);
  console.log('✓ Test 4 Passed: Eating stew applies Well Fed HP regen without affecting frozen meters.\n');

  // ---------------------------------------------------------------------------
  // TEST 4B: Food Still Spoils While Meters Frozen
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4B: Food Still Spoils on Day Advance While Meters Frozen ---');
  const gameState = GameState.getInstance();
  heroEating.clearInventory();
  heroEating.foodItems = [];
  (gameState as any).foodItems = [];
  (gameState as any).inventory.delete('herb_stew');

  // herb_stew has spoilageDays = 5
  heroEating.addFoodItem('herb_stew', 1, 'common', 1);
  gameState.addFoodInstance({ id: 'herb_stew', name: 'Herb Stew', acquiredDay: 1, quality: 'common' });

  assert.strictEqual(heroEating.getItemCount('herb_stew'), 1, 'Hero has 1 stew before advance');
  assert.strictEqual(gameState.getItemCount('herb_stew'), 1, 'Stockpile has 1 stew before advance');

  // Advance day by 5 (from day 1 to day 6)
  (gameState as any).currentGameDay += 5;
  const spoiled = gameState.checkFoodSpoilage([heroEating]);
  assert.strictEqual(spoiled, 2, 'Both hero bag and stockpile stew spoiled after 5 days');

  assert.strictEqual(heroEating.getItemCount('herb_stew'), 0, 'Hero stew spoiled after exceeding 5-day shelf life');
  assert.strictEqual(gameState.getItemCount('herb_stew'), 0, 'Stockpile stew spoiled after exceeding 5-day shelf life');
  console.log('✓ Test 4B Passed: Food spoilage remains active and enforced while meters are frozen.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Save Persistence — Neutral Overrides and Saved Value Preservation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Save Persistence — Neutral Overrides and Saved Value Preservation ---');

  // Create synthetic save snapshot representing an existing pre-freeze save with low hunger & miserable mood
  const existingSaveSnapshot = {
    id: 'hero',
    name: 'Guild Hero',
    avatarKey: 'player-avatar',
    hp: 40,
    criticalHp: 25,
    energy: 100,
    equippedWeaponId: 'short_swords',
    offhandWeaponId: null,
    inventory: {},
    knownSkillIds: [],
    equippedSkillIds: [],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: {},
    classLevels: {},
    classStats: {},
    unlockedClasses: [],
    activeClass: null,
    bookLearnedSkills: [],
    hunger: 12.5, // Low hunger in save
    mood: 18.0,   // Low mood in save
    state: 'idle'
  };

  // Restore into player with switches OFF
  dataLoader.setHungerEnabled(false);
  dataLoader.setMoodEnabled(false);

  const heroLoaded = new Player(
    dungeonScene as any,
    0,
    0,
    basePlayerData as any,
    dataLoader.getWeapon('short_swords')!,
    32,
    'player-avatar',
    new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero')
  );
  heroLoaded.restoreFromSnapshot(existingSaveSnapshot as any, 1000);

  assert.strictEqual(heroLoaded.hunger, 100, 'Live character hunger overrides to 100 while switch is off');
  assert.strictEqual(heroLoaded.mood, 50, 'Live character mood overrides to 50 while switch is off');
  assert.strictEqual(heroLoaded.savedHunger, 12.5, 'Original saved hunger is preserved in savedHunger');
  assert.strictEqual(heroLoaded.savedMood, 18.0, 'Original saved mood is preserved in savedMood');

  // Verify that taking a snapshot while switches are off preserves original saved values
  const snapWhileFrozen = heroLoaded.getSnapshot(2000);
  assert.strictEqual(snapWhileFrozen.hunger, 12.5, 'Saved snapshot preserves original hunger value (12.5)');
  assert.strictEqual(snapWhileFrozen.mood, 18.0, 'Saved snapshot preserves original mood value (18.0)');

  // Now simulate turning switches back ON and loading the same save
  dataLoader.setHungerEnabled(true);
  dataLoader.setMoodEnabled(true);

  const heroRestoredLive = new Player(
    dungeonScene as any,
    0,
    0,
    basePlayerData as any,
    dataLoader.getWeapon('short_swords')!,
    32,
    'player-avatar',
    new ProgressionSystem(dataLoader.getClassesData(), 'Guild Hero')
  );
  heroRestoredLive.restoreFromSnapshot(existingSaveSnapshot as any, 1000);

  assert.strictEqual(heroRestoredLive.hunger, 12.5, 'When switches ON, original hunger is restored directly');
  assert.strictEqual(heroRestoredLive.mood, 18.0, 'When switches ON, original mood is restored directly');

  console.log('✓ Test 5 Passed: Existing saves load into neutral state without deleting saved values; switches ON restores original values.\n');

  // ---------------------------------------------------------------------------
  // TEST 6: HUD Presentation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: HUD Presentation (Paused Indicators & Grey Style) ---');
  const hud = new HUD(dungeonScene as any, false);

  // 6A: Switches OFF
  dataLoader.setHungerEnabled(false);
  dataLoader.setMoodEnabled(false);
  hud.update(heroFrozen, heroFrozen.progression, 1000);

  const hungerTextEl = getOrCreateElement('player-hunger-text');
  const moodTextEl = getOrCreateElement('player-mood-text');

  assert.ok(hungerTextEl.innerText.includes('(paused)'), `Hunger text must show (paused). Got: ${hungerTextEl.innerText}`);
  assert.strictEqual(hungerTextEl.style.color, '#9ca3af', 'Hunger text color must be grey (#9ca3af)');

  assert.ok(moodTextEl.innerText.includes('(paused)'), `Mood text must show (paused). Got: ${moodTextEl.innerText}`);
  assert.strictEqual(moodTextEl.style.color, '#9ca3af', 'Mood text color must be grey (#9ca3af)');
  console.log(`  Switches OFF HUD: Hunger = "${hungerTextEl.innerText}" (${hungerTextEl.style.color}), Mood = "${moodTextEl.innerText}" (${moodTextEl.style.color})`);

  // 6B: Switches ON
  dataLoader.setHungerEnabled(true);
  dataLoader.setMoodEnabled(true);
  hud.update(heroLive, heroLive.progression, 1000);

  assert.strictEqual(hungerTextEl.innerText.includes('(paused)'), false, 'Hunger text must NOT show (paused) when enabled');
  assert.strictEqual(moodTextEl.innerText.includes('(paused)'), false, 'Mood text must NOT show (paused) when enabled');
  console.log(`  Switches ON HUD: Hunger = "${hungerTextEl.innerText}" (${hungerTextEl.style.color}), Mood = "${moodTextEl.innerText}" (${moodTextEl.style.color})`);
  console.log('✓ Test 6 Passed: HUD displays neutral paused indicators and grey style when frozen, normal colors when active.\n');

  // Reset switches to OFF (the milestone state)
  dataLoader.setHungerEnabled(false);
  dataLoader.setMoodEnabled(false);

  console.log('========================================================================');
  console.log('🎉 ALL HUNGER & MOOD FREEZE VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
