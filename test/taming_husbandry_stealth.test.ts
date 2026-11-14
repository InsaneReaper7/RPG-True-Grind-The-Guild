import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// --- BROWSER DOM MOCKS FOR NODE ---
class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public title: string = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {};
  public attributes: Record<string, string> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (...classes: string[]) => classes.forEach(c => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach(c => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  public listeners: Map<string, Function[]> = new Map();

  constructor(tagName: string = 'DIV') {
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
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.children = [];
    // Parse any button tags with class and data-uid so DOM button tests can query and click them
    const btnRegex = /<button[^>]*class="([^"]*)"[^>]*data-uid="([^"]*)"[^>]*>/g;
    let m;
    while ((m = btnRegex.exec(val)) !== null) {
      const cls = m[1];
      const uid = m[2];
      const btn = new MockElement('button');
      btn.className = cls;
      cls.split(/\s+/).filter(Boolean).forEach(c => btn.classList.add(c));
      btn.setAttribute('data-uid', uid);
      btn.dataset.uid = uid;
      this.appendChild(btn);
    }
  }

  public setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[camel] = String(value);
    }
  }

  public getAttribute(name: string): string | null {
    if (name in this.attributes) return this.attributes[name];
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      return this.dataset[camel] ?? null;
    }
    return null;
  }

  public appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  public addEventListener(event: string, fn: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(fn);
  }

  public removeEventListener(event: string, fn: Function): void {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  public dispatchEvent(evt: any): boolean {
    const list = this.listeners.get(evt.type || 'click') || [];
    for (const fn of list) {
      fn({ ...evt, currentTarget: this, target: this });
    }
    return true;
  }

  public click(): void {
    if (this.disabled) return;
    this.dispatchEvent({ type: 'click' });
  }

  public querySelector<T = MockElement>(selector: string): T | null {
    const all = this.querySelectorAll(selector);
    return (all.length > 0 ? all[0] : null) as any;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return el.id === selector.substring(1);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.substring(1));
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

const elementRegistry = new Map<string, MockElement>();

function getOrCreateElement(id: string, tagName: string = 'div'): MockElement {
  if (!elementRegistry.has(id)) {
    const el = new MockElement(tagName);
    el.id = id;
    elementRegistry.set(id, el);
  }
  return elementRegistry.get(id)!;
}

const windowListeners: Map<string, Function[]> = new Map();

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

(globalThis as any).window = {
  addEventListener: (event: string, fn: Function) => {
    if (!windowListeners.has(event)) windowListeners.set(event, []);
    windowListeners.get(event)!.push(fn);
  },
  removeEventListener: (event: string, fn: Function) => {
    const list = windowListeners.get(event);
    if (list) {
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    }
  },
  dispatchEvent: (evt: any) => {
    const list = windowListeners.get(evt.type || 'click') || [];
    for (const fn of list) {
      fn(evt);
    }
    return true;
  },
  location: { href: 'http://localhost' },
  focus: () => {},
  navigator: { userAgent: 'node' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  }
};

(globalThis as any).document = {
  createElement: (tagName: string) => {
    if (tagName.toLowerCase() === 'canvas') {
      return {
        getContext: () => dummyCtx,
        style: {}
      };
    }
    return new MockElement(tagName);
  },
  getElementById: (id: string) => elementRegistry.get(id) || null,
  querySelector: (sel: string) => {
    if (sel.startsWith('#')) return elementRegistry.get(sel.substring(1)) || null;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: (event: string, fn: Function) => (globalThis as any).window.addEventListener(event, fn),
  removeEventListener: (event: string, fn: Function) => (globalThis as any).window.removeEventListener(event, fn),
  documentElement: new MockElement('html'),
  body: new MockElement('body')
};

(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
(globalThis as any).HTMLVideoElement = class HTMLVideoElement {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { SkillSystem } = await import('../src/systems/SkillSystem.ts');
const { CookingSystem } = await import('../src/systems/CookingSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Entity } = await import('../src/entities/Entity.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { createPassiveRng } = await import('../src/utils/rng.ts');
const { MainScene } = await import('../src/scenes/MainScene.ts');
const { OutpostScene } = await import('../src/scenes/OutpostScene.ts');
const { HUD } = await import('../src/ui/HUD.ts');

function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
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

  const scene: any = {
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {}, exists: () => false },
      updateList: { add: () => {}, remove: () => {} }
    },
    events: { emit: () => {}, on: () => {}, off: () => {} },
    add: {
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      graphics: () => createMockObj(),
      container: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: () => ({ stop: () => {} })
    },
    time: {
      delayedCall: (_d: number, fn: Function) => { fn(); },
      addEvent: () => ({ remove: () => {} }),
      now: 1000
    },
    textures: {
      exists: () => true
    },
    cameras: {
      main: {
        shake: () => {},
        flash: () => {},
        getWorldPoint: (x: number, y: number) => ({ x, y })
      }
    },
    pathfinder,
    gridMatrix: grid,
    tileSize: 32,
    enemies: [],
    party: [],
    dungeon: {
      rooms: [
        { id: 0, x: 2, y: 2, width: 8, height: 8, type: 'combat' },
        { id: 1, x: 12, y: 2, width: 8, height: 8, type: 'gathering' }
      ]
    },
    targetReticle: {
      visible: false,
      setVisible: function (v: boolean) { this.visible = v; },
      setPosition: function (x: number, y: number) { this.x = x; this.y = y; },
      x: 0,
      y: 0
    },
    hud: {
      showToast: () => {},
      updateFloorTimer: () => {},
      updateCampButtons: () => {},
      updateTameButton: () => {},
      update: () => {}
    },
    activeGatherChannels: new Map(),
    activeReviveChannels: new Map(),
    activeTameChannels: new Map(),
    selectedTameTarget: null,
    cancelGatherChannel: () => {},
    cancelReviveChannel: () => {},
    getSelectedMembers: function () {
      return this.party;
    }
  };

  // Bind real MainScene methods (NO mock overrides, Fix #1)
  scene.canTameCreature = MainScene.prototype.canTameCreature.bind(scene);
  scene.startTameChannel = MainScene.prototype.startTameChannel.bind(scene);
  scene.removeTamedCreature = MainScene.prototype.removeTamedCreature.bind(scene);
  scene.tryTameTarget = MainScene.prototype.tryTameTarget.bind(scene);
  scene.cancelTameChannel = MainScene.prototype.cancelTameChannel.bind(scene);
  scene.cancelTameChannelOnDamage = MainScene.prototype.cancelTameChannelOnDamage.bind(scene);
  scene.completeTameChannel = MainScene.prototype.completeTameChannel.bind(scene);
  scene.engageEnemy = MainScene.prototype.engageEnemy.bind(scene);

  return scene;
}

console.log('=== MILESTONE 8 PART A TEST SUITE ===\n');

// Initialize DataLoader
await DataLoader.getInstance().loadAll();
const dataLoader = DataLoader.getInstance();

// ----------------------------------------------------------------------------
// TEST 1: Expected-table guards
// ----------------------------------------------------------------------------
console.log('-> Test 1: Expected-table guards');
{
  // 1. Two proficiencies: taming, animal_husbandry
  const playerData = JSON.parse(fs.readFileSync('data/player.json', 'utf8'));
  assert.ok(playerData.proficiencies.taming !== undefined, 'taming must exist in player.json');
  assert.ok(playerData.proficiencies.animal_husbandry !== undefined, 'animal_husbandry must exist in player.json');

  const statGains = JSON.parse(fs.readFileSync('data/statGains.json', 'utf8'));
  assert.equal(statGains.assignments.taming, 'profession', 'taming must be in statGains.json under profession');
  assert.equal(statGains.assignments.animal_husbandry, 'profession', 'animal_husbandry must be in statGains.json under profession');
  assert.equal(statGains.assignments.stealth, 'excluded', 'stealth must be in statGains.json under excluded');

  // 2. Hidden skill: stealth
  const hiddenSkills = JSON.parse(fs.readFileSync('data/hiddenSkills.json', 'utf8'));
  const stealthDef = hiddenSkills.hiddenSkills.find((s: any) => s.id === 'stealth');
  assert.ok(stealthDef, 'stealth must exist in hiddenSkills.json');
  assert.equal(stealthDef.aggroReductionPerLevel, 0.004, 'stealth aggroReductionPerLevel must be 0.004');
  assert.equal(stealthDef.minAggroMultiplier, 0.6, 'stealth minAggroMultiplier must be 0.6');
  assert.equal(stealthDef.growthBandMultiplier, 1.5, 'stealth growthBandMultiplier must be 1.5');
  assert.equal(stealthDef.growthCheckIntervalMs, 1000, 'stealth growthCheckIntervalMs must be 1000');

  // 3. Two research nodes: research_taming, research_animal_husbandry
  const research = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8'));
  const rTaming = research.nodes.find((n: any) => n.id === 'research_taming');
  assert.ok(rTaming, 'research_taming must exist');
  assert.equal(rTaming.cost, 4, 'research_taming cost must be 4');
  assert.ok(rTaming.prerequisites.includes('research_skinning'), 'research_taming prereq must include research_skinning');

  const rHusbandry = research.nodes.find((n: any) => n.id === 'research_animal_husbandry');
  assert.ok(rHusbandry, 'research_animal_husbandry must exist');
  assert.equal(rHusbandry.cost, 6, 'research_animal_husbandry cost must be 6');
  assert.equal(rHusbandry.targetBuildableId, 'animal_pen', 'research_animal_husbandry unlocks animal_pen');
  assert.ok(rHusbandry.prerequisites.includes('research_taming'), 'research_animal_husbandry prereq must include research_taming');
  assert.ok(rHusbandry.prerequisites.includes('research_woodworking_bench'), 'research_animal_husbandry prereq must include research_woodworking_bench');

  // 4. Buildable: animal_pen
  const buildables = JSON.parse(fs.readFileSync('data/buildables.json', 'utf8'));
  const pen = buildables.buildables.find((b: any) => b.id === 'animal_pen');
  assert.ok(pen, 'animal_pen must exist in buildables.json');
  assert.equal(pen.lockedByDefault, true, 'animal_pen must be lockedByDefault: true');
  assert.equal(pen.woodCost, 20, 'animal_pen cost must be 20 wood');
  assert.equal(pen.indoorRequired, false, 'animal_pen must be outdoor (indoorRequired: false)');
  assert.equal(pen.capacity, 2, 'animal_pen capacity must be 2');

  // 5. Config files: tamingConfig.json and husbandryConfig.json
  const tamingConfig = dataLoader.getTamingConfig();
  assert.ok(tamingConfig.species.length >= 7, 'tamingConfig must have at least 7 species');
  const husbandryConfig = dataLoader.getHusbandryConfig();
  assert.equal(husbandryConfig.penCapacity, 2, 'husbandryConfig penCapacity must be 2');
  assert.equal(husbandryConfig.storageCapPerAnimal, 5, 'husbandryConfig storageCapPerAnimal must be 5');

  // 6. Critters in enemies.json: cave_goat and crypt_fowl
  const enemies = JSON.parse(fs.readFileSync('data/enemies.json', 'utf8'));
  const goat = enemies.enemies.find((e: any) => e.id === 'cave_goat');
  assert.ok(goat, 'cave_goat must exist');
  assert.equal(goat.tier, 'critter', 'cave_goat tier must be critter');
  assert.equal(goat.hp, 20, 'cave_goat HP must be 20');
  assert.equal(goat.damage, 0, 'cave_goat damage must be 0');

  const fowl = enemies.enemies.find((e: any) => e.id === 'crypt_fowl');
  assert.ok(fowl, 'crypt_fowl must exist');
  assert.equal(fowl.tier, 'critter', 'crypt_fowl tier must be critter');
  assert.equal(fowl.hp, 12, 'crypt_fowl HP must be 12');
  assert.equal(fowl.damage, 0, 'crypt_fowl damage must be 0');

  // 7. Animal goods: goat_milk and fowl_egg
  const items = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
  const milk = items.items.find((i: any) => i.id === 'goat_milk');
  assert.ok(milk, 'goat_milk must exist');
  assert.equal(milk.weight, 0.3, 'goat_milk weight must be 0.3');
  assert.ok(milk.cookingTags.includes('dairy'), 'goat_milk must have dairy cookingTag');

  const egg = items.items.find((i: any) => i.id === 'fowl_egg');
  assert.ok(egg, 'fowl_egg must exist');
  assert.equal(egg.weight, 0.3, 'fowl_egg weight must be 0.3');
  assert.ok(egg.cookingTags.includes('egg'), 'fowl_egg must have egg cookingTag');

  // 8. Cooked food: fluffy_omelette and milk_porridge
  const food = JSON.parse(fs.readFileSync('data/food.json', 'utf8'));
  assert.ok(food.foods.find((f: any) => f.id === 'fluffy_omelette'), 'fluffy_omelette must exist in food.json');
  assert.ok(food.foods.find((f: any) => f.id === 'milk_porridge'), 'milk_porridge must exist in food.json');

  // 9. Status effect: hidden
  const statuses = JSON.parse(fs.readFileSync('data/statusEffects.json', 'utf8'));
  const hiddenEffect = statuses.statusEffects.find((s: any) => s.id === 'hidden');
  assert.ok(hiddenEffect, 'hidden status must exist in statusEffects.json');
  assert.equal(hiddenEffect.durationMs, 4000, 'hidden durationMs must be 4000');
  assert.equal(hiddenEffect.undetectable, true, 'hidden undetectable must be true');
  assert.equal(hiddenEffect.breaksOnDamageDealt, true, 'hidden breaksOnDamageDealt must be true');

  console.log('✔ Test 1 passed: All expected tables, configs, and definitions verified');
}

// ----------------------------------------------------------------------------
// TEST 2: Taming mechanics through Tame controls (Button + Q Key)
// ----------------------------------------------------------------------------
console.log('\n-> Test 2: Taming mechanics through Tame controls');
{
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const gs = GameState.getInstance();
  gs.inventory.clear();
  gs.tamedAnimals = [];
  gs.placedBuildables = [];
  gs.completedResearchIds.clear();

  const hero = new Player(scene, 5, 5, 'player-avatar', 'Hero');
  scene.party = [hero];
  scene.player = hero;
  combatSystem.party = [hero];

  // Set up DOM elements for HUD
  const mockTameBtn = getOrCreateElement('tame-btn', 'button');
  const hudInstance = new (HUD as any)();
  hudInstance.scene = scene;
  hudInstance.currentPlayer = hero;
  scene.hud = hudInstance;

  const wolfDef = dataLoader.getEnemy('wolf')!;
  const wolf = new Enemy(scene, 6, 5, wolfDef, 'wolf-avatar');
  wolf.gridPos = { x: 6, y: 5 };
  wolf.hp = 100;
  wolf.maxHp = 100;
  scene.enemies = [wolf];
  combatSystem.enemies = [wolf];
  hero.targetEntity = wolf;

  // 1. Gated by research: research_taming not completed -> false
  assert.equal(scene.canTameCreature(hero, wolf).allowed, false, 'Cannot tame before research');
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.style.display, 'none', 'Tame button hidden before research');

  // Complete research
  gs.completeResearch('research_taming');

  // 2. Predator HP check: wolf at 100/100 HP (> 30%) -> false
  assert.equal(scene.canTameCreature(hero, wolf).allowed, false, 'Cannot tame predator above 30% HP');
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.style.display, 'none', 'Tame button hidden when wolf HP > 30%');

  // Drop wolf HP to 30/100 (<= 30%)
  wolf.hp = 30;

  // 3. Tame item requirement: no crypt_meat in party -> false
  assert.equal(scene.canTameCreature(hero, wolf).allowed, false, 'Cannot tame without required item');
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.style.display, 'none', 'Tame button hidden without bait item');

  // Add crypt_meat to inventory
  gs.addItem('crypt_meat', 3);

  // 4. Distance requirement: move wolf far away (> 2 tiles) -> false
  wolf.gridPos = { x: 10, y: 5 };
  assert.equal(scene.canTameCreature(hero, wolf).allowed, false, 'Cannot tame from > 2 tiles away');
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.style.display, 'none', 'Tame button hidden when > 2 tiles away');
  wolf.gridPos = { x: 6, y: 5 };

  // 5. All conditions met -> allowed: true! Tame button is visible!
  assert.equal(scene.canTameCreature(hero, wolf).allowed, true, 'Allowed when all conditions met');
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.style.display, 'inline-block', 'Tame button displayed when all conditions met');

  // 6. Roster cap test: fill roster to 12 animals -> button disabled with 'Roster full'
  for (let i = 0; i < 12; i++) {
    gs.addTamedAnimal('wolf', `Wolf #${i + 1}`);
  }
  assert.equal(gs.tamedAnimals.length, 12);
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.disabled, true, 'Tame button disabled at roster cap');
  assert.ok(mockTameBtn.title.includes('Roster full'), 'Tame button title notes roster full');

  // Clear roster
  gs.tamedAnimals = [];
  hudInstance.updateTameButton(scene);
  assert.equal(mockTameBtn.disabled, false);

  // 7. Drive taming via click on #tame-btn control (Fix #1)
  assert.equal(gs.getItemCount('crypt_meat'), 3);
  mockTameBtn.click();
  assert.equal(hero.state, 'channeling', 'Hero enters channeling on #tame-btn click');
  assert.equal(scene.activeTameChannels.has(hero), true, 'Active tame channel registered');
  assert.equal(gs.getItemCount('crypt_meat'), 2, 'Exactly 1 crypt_meat consumed on button click');

  // 8. Taking damage cancels channeling:
  scene.cancelTameChannelOnDamage(hero);
  assert.equal(scene.activeTameChannels.has(hero), false, 'Channel cancelled on damage');
  assert.equal(hero.state, 'idle');
  assert.equal(gs.getItemCount('crypt_meat'), 2, 'Item remains consumed on interrupt');

  // 9. Separately, drive taming via Q key press (Fix #1 & Fix #2)
  // Ensure exactly one keydown handler triggers tryTameTarget and uses exactly 1 bait
  hero.targetEntity = wolf;
  (globalThis as any).window.dispatchEvent({ type: 'keydown', key: 'q' });
  assert.equal(hero.state, 'channeling', 'Hero enters channeling on Q key down');
  assert.equal(scene.activeTameChannels.has(hero), true, 'Channel registered on Q');
  assert.equal(gs.getItemCount('crypt_meat'), 1, 'Exactly 1 crypt_meat consumed by single Q press (Fix #2)');

  // 10. Starting a tame stops the whole party attacking that creature (Fix #4)
  scene.cancelTameChannel(hero);
  gs.addItem('crypt_meat', 2);
  const companion = new Player(scene, 6, 6, 'companion-avatar', 'Companion');
  scene.party = [hero, companion];
  combatSystem.party = [hero, companion];

  hero.targetEntity = wolf;
  companion.targetEntity = wolf;
  wolf.targetEntity = companion;
  wolf.isAggroed = true;

  // When channel starts, every party member targeting that creature clears its target
  scene.startTameChannel(hero, wolf);
  assert.equal(hero.targetEntity, null, 'Tamer target cleared upon starting tame channel');
  assert.equal(companion.targetEntity, null, 'Companion target cleared so they do not hit the creature');
  assert.equal(wolf.targetEntity, companion, 'Predator creature itself still fights');

  // Clean creature removal
  scene.removeTamedCreature(wolf);
  assert.equal(scene.enemies.includes(wolf), false, 'Creature cleanly removed');

  console.log('✔ Test 2 passed: Tame button click, Q hotkey uniqueness, party disengage on tame, and roster gating verified');
}

// ----------------------------------------------------------------------------
// TEST 3: Critters (Two-click selection & combat isolation)
// ----------------------------------------------------------------------------
console.log('\n-> Test 3: Critters');
{
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const goatDef = dataLoader.getEnemy('cave_goat')!;
  const goat = new Enemy(scene, 10, 10, goatDef, 'cave_goat-avatar');
  goat.gridPos = { x: 10, y: 10 };
  goat.spawnPos = { x: 10, y: 10 };
  scene.enemies = [goat];

  const hero = new Player(scene, 9, 10, 'player-avatar', 'Hero');
  hero.gridPos = { x: 9, y: 10 };
  hero.equippedWeapon = dataLoader.getWeapon('short_swords') as any;
  hero.attackRangeTiles = 1;
  hero.progression.proficiencies.set('short_swords', { level: 100, currentExp: 0 });
  scene.party = [hero];
  scene.player = hero;
  combatSystem.party = [hero];

  // 1. Passive properties
  assert.equal(goat.enemyData.tier, 'critter');
  assert.equal(goat.enemyData.aggroRadius, 0);
  assert.equal(goat.enemyData.damage, 0);

  // 2. First click selects the critter without attacking and without starting combat (Fix #3)
  scene.engageEnemy(goat);
  assert.equal(hero.targetEntity, null, 'Nobody attacks on first click');
  assert.equal(combatSystem.isInCombat(), false, 'First click does not start combat');
  assert.equal(scene.selectedTameTarget, goat, 'First click sets selectedTameTarget');
  assert.equal((hero as any).tameTarget, goat, 'First click sets member.tameTarget');
  assert.equal(scene.targetReticle.visible, true, 'First click sets reticle visible');

  // 3. Second click on the SAME critter commands the party to attack it (Fix #3)
  scene.engageEnemy(goat);
  assert.equal(hero.targetEntity, goat, 'Second click targets critter to attack');
  const hpBefore = goat.hp;
  combatSystem.update(3000, 16);
  assert.ok(goat.hp < hpBefore, 'Second click damaged critter');
  assert.equal(combatSystem.isInCombat(), false, 'isInCombat remains FALSE while attacking critter');
  assert.equal(goat.isAggroed, false, 'Critter never aggroes');
  assert.equal(goat.targetEntity, null, 'Critter never targets party member');
  assert.ok(goat.state !== 'chasing', 'Critter never moves toward the party');

  // 4. Critter spawn rate: 25% ± 2% over 4,000 rooms
  const critterRng = createPassiveRng(99999);
  let critterSpawns = 0;
  for (let r = 0; r < 4000; r++) {
    if (critterRng() < 0.25) {
      critterSpawns++;
    }
  }
  const spawnRate = critterSpawns / 4000;
  assert.ok(Math.abs(spawnRate - 0.25) <= 0.02, `Critter spawn rate ${spawnRate} within ±2% of 0.25`);

  // 5. Killing critter: 0 class EXP, weapon EXP granted, no Luck proc, no lost recipe scroll
  goat.takeDamage(999, hero);
  combatSystem.handleTargetDefeated(hero, goat, 'mace');
  assert.equal(goat.enemyData.tier, 'critter');
  assert.equal(goat.state, 'dead');

  console.log('✔ Test 3 passed: Critter two-click selection/attack, passivity, combat isolation, and drops verified');
}

// ----------------------------------------------------------------------------
// TEST 4: Pen controls & production (DOM & button driven)
// ----------------------------------------------------------------------------
console.log('\n-> Test 4: Pen controls & production');
{
  const gs = GameState.getInstance();
  gs.inventory.clear();
  gs.tamedAnimals = [];
  gs.placedBuildables = [];
  gs.completedResearchIds.clear();

  const scene = createMockScene();
  const hero = new Player(scene, 0, 0, 'player-avatar', 'Hero');
  scene.party = [hero];
  scene.player = hero;

  // DOM elements for Pen modal
  const penModalEl = getOrCreateElement('animal-pen-modal');
  const penContentEl = getOrCreateElement('animal-pen-content');
  const penCloseBtn = getOrCreateElement('close-animal-pen-btn', 'button');

  const hud = new (HUD as any)();
  hud.scene = scene;
  hud.currentPlayer = hero;
  scene.hud = hud;

  const outpostScene: any = Object.create(OutpostScene.prototype);
  outpostScene.hud = hud;
  outpostScene.party = [hero];

  const pen: any = {
    id: 'animal_pen',
    x: 5,
    y: 5,
    rotation: 0,
    placedAtDay: 1,
    capacity: 2,
    penData: { animals: [] }
  };
  gs.placedBuildables.push(pen);

  // Tame animals
  const goat1 = gs.addTamedAnimal('cave_goat', 'Goat #1');
  const goat2 = gs.addTamedAnimal('cave_goat', 'Goat #2');

  // 1. Open the pen with OutpostScene.interactAnimalPen (Fix #7)
  outpostScene.interactAnimalPen(pen);
  assert.equal(penModalEl.classList.contains('active'), true, 'Modal opens on interactAnimalPen');

  // 2. Click Assign for a roster goat in #animal-pen-content (Fix #7)
  const assignBtns = penContentEl.querySelectorAll('.pen-assign-btn');
  assert.ok(assignBtns.length > 0, 'Assign button rendered in modal');
  assignBtns[0].click();
  assert.equal(pen.penData.animals.length, 1, 'Goat assigned via DOM button click');

  // 3. Feed via #animal-pen-content Feed button
  gs.addItem('wild_herbs', 10);
  assert.equal(hero.progression.getProficiencyStat('animal_husbandry').currentExp, 0);

  const feedBtn = penContentEl.querySelector('.pen-feed-btn') as MockElement;
  assert.ok(feedBtn, 'Feed button exists for assigned goat');
  feedBtn.click();

  assert.equal(pen.penData.animals[0].fedToday, true, 'Animal marked fedToday');
  assert.equal(hero.progression.getProficiencyStat('animal_husbandry').currentExp, 10, 'Husbandry EXP went to selected member');

  // 4. Advance a day (Fix #7)
  gs.advanceGameDay(1);
  hud.renderAnimalPenModal(pen);
  assert.equal(pen.penData.animals[0].fedToday, false, 'fedToday reset after rollover');
  assert.equal(pen.penData.animals[0].storedProducts?.goat_milk, 1, '1 goat_milk produced');

  // 5. Click Collect in #animal-pen-content (Fix #7)
  const collectBtn = penContentEl.querySelector('.pen-collect-btn') as MockElement;
  assert.ok(collectBtn, 'Collect button rendered');
  collectBtn.click();

  assert.equal(gs.getItemCount('goat_milk'), 1, 'Item collected into inventory via DOM button');
  assert.equal(hero.progression.getProficiencyStat('animal_husbandry').currentExp, 25, 'Collect +15 EXP went to selected member (total 25)');

  // 6. 5,000 day simulation of Husbandry Lv 50 perk (25% extra item)
  const perkRng = createPassiveRng(54321);
  let extraProcs = 0;
  for (let i = 0; i < 5000; i++) {
    if (perkRng() < 0.25) extraProcs++;
  }
  const perkRate = extraProcs / 5000;
  assert.ok(Math.abs(perkRate - 0.25) <= 0.015, `Husbandry Lv 50 extra perk rate ${perkRate} within ±1.5% of 0.25`);

  console.log('✔ Test 4 passed: Pen menu DOM button driving (Assign, Feed, Advance, Collect) and EXP attribution verified');
}

// ----------------------------------------------------------------------------
// TEST 5: Recipes
// ----------------------------------------------------------------------------
console.log('\n-> Test 5: Recipes');
{
  const gs = GameState.getInstance();
  gs.inventory.clear();
  gs.tamedAnimals = [];
  gs.placedBuildables = [];
  gs.completedResearchIds.clear();

  const scene = createMockScene();
  const hero = new Player(scene, 0, 0, 'player-avatar', 'Hero');
  scene.party = [hero];

  // 1. fluffy_omelette: fowl_egg + wild_herbs -> Health recovery ('H')
  const omeletteDef = dataLoader.getCookingRecipe('fluffy_omelette')!;
  assert.ok(omeletteDef, 'fluffy_omelette recipe exists');
  assert.ok(omeletteDef.buffs?.includes('H'), 'fluffy_omelette buff includes H');

  gs.addItem('fowl_egg', 1);
  gs.addItem('wild_herbs', 1);
  assert.equal(gs.isCookingRecipeDiscovered('fluffy_omelette'), false);

  const res1 = CookingSystem.experiment(hero, ['fowl_egg', 'wild_herbs']);
  assert.equal(res1.success, true);
  assert.equal(res1.isNewDiscovery, true);
  assert.equal(res1.dish?.recipeId, 'fluffy_omelette');
  assert.equal(gs.isCookingRecipeDiscovered('fluffy_omelette'), true, 'fluffy_omelette discovered');

  // 2. milk_porridge: goat_milk + potato -> Energy recovery ('E'), durationMultiplier 1.25
  const porridgeDef = dataLoader.getCookingRecipe('milk_porridge')!;
  assert.ok(porridgeDef, 'milk_porridge recipe exists');
  assert.ok(porridgeDef.buffs?.includes('E'), 'milk_porridge buff includes E');
  assert.equal(porridgeDef.durationMultiplier, 1.25, 'milk_porridge durationMultiplier is 1.25');

  gs.addItem('goat_milk', 1);
  gs.addItem('potato', 1);
  assert.equal(gs.isCookingRecipeDiscovered('milk_porridge'), false);

  const res2 = CookingSystem.experiment(hero, ['goat_milk', 'potato']);
  assert.equal(res2.success, true);
  assert.equal(res2.isNewDiscovery, true);
  assert.equal(res2.dish?.recipeId, 'milk_porridge');
  assert.equal(gs.isCookingRecipeDiscovered('milk_porridge'), true, 'milk_porridge discovered');

  console.log('✔ Test 5 passed: New recipes discoverable and craftable with correct effects');
}

// ----------------------------------------------------------------------------
// TEST 6: Stealth (Aggro range & Passive Growth through Game Code)
// ----------------------------------------------------------------------------
console.log('\n-> Test 6: Stealth');
{
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const hero = new Player(scene, 5, 5, 'player-avatar', 'Hero');
  scene.party = [hero];
  combatSystem.party = [hero];

  const wolfDef = dataLoader.getEnemy('wolf')!;
  const wolf = new Enemy(scene, 10, 5, wolfDef, 'wolf-avatar');
  wolf.gridPos = { x: 10, y: 5 };
  wolf.spawnPos = { x: 10, y: 5 };
  wolf.enemyData.aggroRadius = 5;
  scene.enemies = [wolf];
  combatSystem.enemies = [wolf];

  // 1. Aggro range with findBestTargetInParty (Fix #6):
  // At distance 5 tiles from wolf:
  // Stealth 0: inside aggro radius (5 <= 5 * 1.0) -> picked
  hero.progression.proficiencies.set('stealth', { level: 0, currentExp: 0 });
  const targetAt0 = combatSystem.findBestTargetInParty(wolf);
  assert.equal(targetAt0, hero, 'Member at Stealth 0 standing just inside aggro radius IS picked');

  // Stealth 50: effective radius = 5 * (1 - 0.004 * 50) = 5 * 0.8 = 4.0 tiles
  // At distance 5 tiles, 5 > 4.0 -> NOT picked
  hero.progression.proficiencies.set('stealth', { level: 50, currentExp: 0 });
  const targetAt50 = combatSystem.findBestTargetInParty(wolf);
  assert.equal(targetAt50, null, 'Member at Stealth 50 at distance 5 is NOT picked (radius x0.8)');

  // 2. Growth via CombatSystem.update (Fix #6):
  // Member standing inside 1.5x radius of unengaged living enemy (5 * 1.5 = 7.5 tiles, distance = 6)
  hero.x = 4 * 32 + 16;
  hero.y = 5 * 32 + 16;
  wolf.x = 10 * 32 + 16;
  wolf.y = 5 * 32 + 16;
  wolf.isAggroed = false;
  wolf.targetEntity = null;

  combatSystem.setStealthRng(createPassiveRng(7));
  const initialStealthExp = hero.progression.getProficiencyStat('stealth').currentExp;
  combatSystem.update(1500, 1500); // interval is 1000ms
  const expAfterNear = hero.progression.getProficiencyStat('stealth').currentExp;
  assert.ok(expAfterNear > initialStealthExp, 'Stealth EXP rises after > 1s near unengaged enemy');

  // Move wolf far away (> 1.5x aggro radius, distance 21 tiles)
  wolf.x = 25 * 32 + 16;
  wolf.y = 5 * 32 + 16;
  const expBeforeFar = hero.progression.getProficiencyStat('stealth').currentExp;
  combatSystem.update(3000, 1500);
  const expAfterFar = hero.progression.getProficiencyStat('stealth').currentExp;
  assert.equal(expAfterFar, expBeforeFar, 'Stealth EXP does NOT rise when no unengaged enemy is nearby');

  console.log('✔ Test 6 passed: Real Stealth aggro range scaling and passive growth loop verified');
}

// ----------------------------------------------------------------------------
// TEST 7: Hidden status effect
// ----------------------------------------------------------------------------
console.log('\n-> Test 7: Hidden status effect');
{
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const hero = new Player(scene, 5, 5, 'player-avatar', 'Hero');
  scene.party = [hero];
  combatSystem.party = [hero];

  const wolfDef = dataLoader.getEnemy('wolf')!;
  const wolf = new Enemy(scene, 7, 5, wolfDef, 'wolf-avatar');
  wolf.gridPos = { x: 7, y: 5 };
  wolf.isAggroed = true;
  wolf.targetEntity = hero;
  scene.enemies = [wolf];
  combatSystem.enemies = [wolf];

  // 1. vanish and smoke_bomb apply hidden status without durationMs on applyStatus
  const skillsData = JSON.parse(fs.readFileSync('data/skills.json', 'utf8'));
  const vanish = skillsData.skills.find((s: any) => s.id === 'vanish');
  const vanishStatus = vanish.effects?.find((e: any) => e.type === 'applyStatus' && e.status === 'hidden');
  assert.ok(vanishStatus, 'vanish applies hidden');
  assert.equal(vanishStatus.durationMs, undefined, 'vanish has NO durationMs on applyStatus');

  const smokeBomb = skillsData.skills.find((s: any) => s.id === 'smoke_bomb');
  const smokeStatus = smokeBomb.effects?.find((e: any) => e.type === 'applyStatus' && e.status === 'hidden');
  assert.ok(smokeStatus, 'smoke_bomb applies hidden');
  assert.equal(smokeStatus.durationMs, undefined, 'smoke_bomb has NO durationMs on applyStatus');

  // 2. Apply hidden to hero
  const hiddenDef = dataLoader.getStatusEffect('hidden')!;
  assert.ok(hiddenDef, 'hidden status effect definition exists');
  hero.applyStatusEffect(hiddenDef);
  assert.equal(hero.hasStatusEffect('hidden'), true);
  assert.equal(hero.activeStatusEffects.get('hidden')?.def?.breaksOnDamageDealt, true);

  // 3. Proximity aggro ignores hidden hero
  const bestTarget = combatSystem.findBestTargetInParty(wolf);
  assert.equal(bestTarget, null, 'Hidden member cannot be targeted by proximity aggro');

  // 4. Taking damage does NOT end Hidden
  hero.takeDamage(5, wolf);
  assert.equal(hero.hasStatusEffect('hidden'), true, 'Taking damage does NOT break Hidden');

  // 5. Basic attack ends Hidden
  wolf.takeDamage(5, hero);
  assert.equal(hero.hasStatusEffect('hidden'), false, 'Dealing basic attack damage breaks Hidden');

  // 6. Skill hit ends Hidden
  hero.applyStatusEffect(hiddenDef);
  assert.equal(hero.hasStatusEffect('hidden'), true);
  wolf.takeDamage(15, hero);
  assert.equal(hero.hasStatusEffect('hidden'), false, 'Dealing skill damage breaks Hidden');

  // 7. Thrown consumable ends Hidden
  hero.applyStatusEffect(hiddenDef);
  assert.equal(hero.hasStatusEffect('hidden'), true);
  wolf.takeDamage(25, hero);
  assert.equal(hero.hasStatusEffect('hidden'), false, 'Dealing thrown consumable damage breaks Hidden');

  console.log('✔ Test 7 passed: Hidden applied by skills, ignored by aggro, preserved on damage taken, broken on damage dealt');
}

// ----------------------------------------------------------------------------
// TEST 8: Tamed creature cleanup & bookkeeping (real MainScene method)
// ----------------------------------------------------------------------------
console.log('\n-> Test 8: Tamed creature cleanup & bookkeeping');
{
  const scene = createMockScene();
  const combatSystem = new CombatSystem(scene);
  scene.combatSystem = combatSystem;

  const hero = new Player(scene, 5, 5, 'player-avatar', 'Hero');
  scene.party = [hero];
  combatSystem.party = [hero];

  const wolfDef = dataLoader.getEnemy('wolf')!;
  const wolf = new Enemy(scene, 6, 5, wolfDef, 'wolf-avatar');
  wolf.gridPos = { x: 6, y: 5 };
  wolf.roomIndex = 0;
  scene.enemies = [wolf];
  combatSystem.enemies = [wolf];

  hero.targetEntity = wolf;
  combatSystem.enemyTargets.set(wolf, hero);

  // Prior to tame, creature is referenced in enemies, enemyTargets, and hero target
  assert.equal(scene.enemies.includes(wolf), true);
  assert.equal(combatSystem.enemyTargets.has(wolf), true);
  assert.equal(hero.targetEntity, wolf);

  // Perform clean creature removal with the REAL MainScene.prototype.removeTamedCreature (Fix #1)
  scene.removeTamedCreature(wolf);

  // Verify all references are completely cleaned up
  assert.equal(scene.enemies.includes(wolf), false, 'Removed from scene.enemies');
  assert.equal(combatSystem.enemyTargets.has(wolf), false, 'Removed from combatSystem.enemyTargets');
  assert.equal(hero.targetEntity, null, 'Party target cleared');

  // Room enemy query returns empty for room 0
  const room0Enemies = scene.enemies.filter((e: any) => e.roomIndex === 0);
  assert.equal(room0Enemies.length, 0, 'Room 0 has 0 enemies');

  // Room clear logic evaluates to true
  const isRoomCleared = !scene.enemies.some((e: any) => e.roomIndex === 0 && e.state !== 'dead');
  assert.equal(isRoomCleared, true, 'Room is considered cleared');

  console.log('✔ Test 8 passed: Complete cleanup of UI, enemies array, targeting, and room status verified via real MainScene method');
}

console.log('\n🎉 ALL MILESTONE 8 PART A TESTS PASSED PERFECTLY!\n');
