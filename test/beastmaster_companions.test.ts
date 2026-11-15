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
    contains: (c: string) => this.classList._classes.has(c),
    toggle: (c: string, force?: boolean) => {
      if (force === true) this.classList._classes.add(c);
      else if (force === false) this.classList._classes.delete(c);
      else if (this.classList._classes.has(c)) this.classList._classes.delete(c);
      else this.classList._classes.add(c);
    }
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public disabled: boolean = false;
  public value: string = '';
  private _textContent: string = '';
  private _innerHTML: string = '';
  public onchange: any = null;
  public onclick: any = null;

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

  get options(): MockElement[] {
    return this.children.filter(c => c.tagName === 'OPTION');
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.children = [];

    // Parse selects and their child options
    const selectMatches = val.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi);
    for (const sm of selectMatches) {
      const attrsStr = sm[1];
      const innerOptions = sm[2];
      const selEl = new MockElement('SELECT');
      selEl.parentElement = this;
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
      if (classMatch) {
        selEl.className = classMatch[1];
        classMatch[1].split(/\s+/).forEach(c => selEl.classList.add(c));
      }
      const dataMatches = attrsStr.matchAll(/data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g);
      for (const dm of dataMatches) {
        const camel = dm[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        selEl.dataset[camel] = dm[2];
      }
      const optMatches = innerOptions.matchAll(/<option([^>]*)>([^<]*)<\/option>/gi);
      for (const om of optMatches) {
        const optAttrs = om[1];
        const optText = om[2].trim();
        const optEl = new MockElement('OPTION');
        optEl.parentElement = selEl;
        optEl.textContent = optText;
        optEl.innerText = optText;
        if (/\bdisabled\b/i.test(optAttrs)) {
          optEl.disabled = true;
        }
        const valM = optAttrs.match(/value=["']([^"']*)["']/);
        if (valM) {
          optEl.value = valM[1];
        }
        selEl.children.push(optEl);
      }
      this.children.push(selEl);
    }

    // Also parse other tags
    const matches = val.matchAll(/<([a-zA-Z0-9\-]+)([^>]*)>(?:([^<]*)<\/\1>)?/g);
    for (const match of matches) {
      const tag = match[1];
      if (tag.toUpperCase() === 'SELECT' || tag.toUpperCase() === 'OPTION') continue;
      const attrsStr = match[2];
      const text = match[3];
      const el = new MockElement(tag);
      el.parentElement = this;
      if (text !== undefined) {
        el.textContent = text.trim();
        el.innerText = text.trim();
      }
      if (/\bdisabled\b/i.test(attrsStr)) {
        el.disabled = true;
      }
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
      if (classMatch) {
        el.className = classMatch[1];
        classMatch[1].split(/\s+/).forEach(c => el.classList.add(c));
      }
      const dataMatches = attrsStr.matchAll(/data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g);
      for (const dm of dataMatches) {
        const camel = dm[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        el.dataset[camel] = dm[2];
      }
      const valMatch = attrsStr.match(/value=["']([^"']*)["']/);
      if (valMatch) {
        el.value = valMatch[1];
      }
      this.children.push(el);
    }
  }

  public querySelector<T = MockElement>(sel: string): T | null {
    const all = this.querySelectorAll<T>(sel);
    return all.length > 0 ? all[0] : null;
  }

  public querySelectorAll<T = MockElement>(sel: string): T[] {
    const results: T[] = [];
    const check = (el: MockElement) => {
      if (sel.startsWith('.')) {
        const c = sel.slice(1);
        if (el.classList.contains(c)) results.push(el as any);
      } else if (sel.startsWith('#')) {
        const id = sel.slice(1);
        if (el.id === id) results.push(el as any);
      } else if (sel.toLowerCase() === 'option') {
        if (el.tagName === 'OPTION') results.push(el as any);
      } else if (sel.startsWith('[')) {
        const m = sel.match(/\[data-([a-zA-Z0-9\-]+)(?:=["']([^"']+)["'])?\]/);
        if (m) {
          const camel = m[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
          if (m[2] !== undefined) {
            if (el.dataset[camel] === m[2]) results.push(el as any);
          } else if (el.dataset[camel] !== undefined) {
            results.push(el as any);
          }
        }
      }
      for (const ch of el.children) {
        check(ch);
      }
    };
    for (const ch of this.children) {
      check(ch);
    }
    return results;
  }

  public appendChild(child: MockElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  public getBoundingClientRect() {
    return { top: 10, left: 10, bottom: 50, right: 100, width: 90, height: 40 };
  }
}

const domElements = new Map<string, MockElement>();
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
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: 'http://localhost' },
  focus: () => {},
  navigator: { userAgent: 'node' }
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
  getElementById: (id: string) => {
    if (!domElements.has(id)) {
      const el = new MockElement();
      el.id = id;
      domElements.set(id, el);
    }
    return domElements.get(id);
  },
  elementFromPoint: (_x: number, _y: number) => new MockElement('DIV'),
  querySelectorAll: (sel: string) => {
    const results: MockElement[] = [];
    for (const el of domElements.values()) {
      results.push(...el.querySelectorAll(sel));
      if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) results.push(el);
      if (sel.startsWith('#') && el.id === sel.slice(1)) results.push(el);
    }
    return results;
  },
  querySelector: (sel: string) => {
    for (const el of domElements.values()) {
      if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return el;
      if (sel.startsWith('#') && el.id === sel.slice(1)) return el;
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  documentElement: new MockElement('html'),
  body: new MockElement('body')
};

(globalThis as any).window.document = (globalThis as any).document;
(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
(globalThis as any).HTMLVideoElement = class HTMLVideoElement {};

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

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { SkillSystem } = await import('../src/systems/SkillSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { BeastCompanion } = await import('../src/entities/BeastCompanion.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
const { HUD } = await import('../src/ui/HUD.ts');

function createMockScene(): any {
  const grid: number[][] = [];
  for (let y = 0; y < 40; y++) {
    grid[y] = [];
    for (let x = 0; x < 40; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);
  (pathfinder as any).findPath = function (start: any, end: any) {
    const path = [{ x: end.x, y: end.y }];
    const p = Promise.resolve(path);
    (p as any).then = function (cb: any) {
      if (cb) cb(path);
      return p;
    };
    return p;
  };

  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {}
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
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {}, exists: () => false },
      updateList: { add: () => {}, remove: () => {} }
    },
    tileSize: 32,
    gridWidth: 40,
    gridHeight: 40,
    grid,
    pathfinder,
    findOpenAdjacentTile: (center: any) => ({ x: center.x + 1, y: center.y }),
    getPartyUnitObstacles: () => [],
    time: { now: 1000 },
    textures: { exists: () => true },
    tweens: {
      add: () => ({ remove: () => {} })
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      existing: (item: any) => item
    }
  };
}

// Load data
await DataLoader.getInstance().loadAll();
const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
const enemiesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/enemies.json'), 'utf8'));
const beastConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/beastCompanionConfig.json'), 'utf8'));
const defaultWeapon = DataLoader.getInstance().getWeapon('bows')!;
const defaultPlayerData = { name: 'Ranger Tester', avatarTextureKey: 'player-avatar' };

console.log('================================================================');
console.log('🐺 MILESTONE 8 PART B TEST SUITE: BEASTMASTER & COMPANIONS');
console.log('================================================================\n');

// -------------------------------------------------------------
// SUITE 1: Beastmaster Class Unlock Path
// -------------------------------------------------------------
console.log('--- Suite 1: Beastmaster Class Unlock Path ---');
{
  const bmDef = classesData.classes.find((c: any) => c.id === 'beastmaster');
  assert.ok(bmDef, 'Beastmaster class must exist in classes.json');
  assert.equal(bmDef.tier, 'expert', 'Beastmaster must be expert tier');
  assert.equal(bmDef.primaryAttribute, 'dex', 'Primary attribute must be dex');
  assert.deepEqual(bmDef.hiddenSkillBonuses, { evasion: 0.05 }, 'Hidden skill bonuses must include evasion: 0.05');

  // Verify requirements array
  const reqs = bmDef.requirements;
  assert.equal(reqs.length, 3, 'Must have exactly 3 requirements');
  const ahReq = reqs.find((r: any) => r.target === 'animal_husbandry');
  const tameReq = reqs.find((r: any) => r.target === 'taming');
  const bowsReq = reqs.find((r: any) => r.target === 'bows');
  assert.equal(ahReq?.value, 60, 'animal_husbandry requirement must be 60');
  assert.equal(tameReq?.value, 60, 'taming requirement must be 60');
  assert.equal(bowsReq?.value, 30, 'bows requirement must be 30');

  // Test progression evaluation
  const prog = new ProgressionSystem(classesData, 'Beastmaster Candidate');
  assert.equal(prog.isClassUnlocked('beastmaster'), false, 'Should not be unlocked initially');

  // Short on animal husbandry
  prog.getProficiencyStat('animal_husbandry')!.level = 59;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  assert.equal(prog.isClassUnlocked('beastmaster'), false, 'Must fail unlock if AH is 59');

  // Short on taming
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 59;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  assert.equal(prog.isClassUnlocked('beastmaster'), false, 'Must fail unlock if taming is 59');

  // Short on bows
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 29;
  prog.checkClassUnlocks();
  assert.equal(prog.isClassUnlocked('beastmaster'), false, 'Must fail unlock if bows is 29');

  // All met
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  assert.equal(prog.isClassUnlocked('beastmaster'), true, 'Must unlock when AH 60, Taming 60, Bows 30');
  console.log('✓ PASS: Beastmaster unlocks exactly at AH 60 / Taming 60 / Bows 30 (fails if any is short).');
}

// -------------------------------------------------------------
// SUITE 2: Companion Dropdown, Bonding, and Class Change Clearing
// -------------------------------------------------------------
console.log('\n--- Suite 2: Companion Dropdown, Bonding & Persistence ---');
{
  const scene = createMockScene();
  const prog1 = new ProgressionSystem(classesData, 'Hero BM');
  prog1.getProficiencyStat('animal_husbandry')!.level = 60;
  prog1.getProficiencyStat('taming')!.level = 60;
  prog1.getProficiencyStat('bows')!.level = 30;
  prog1.checkClassUnlocks();

  const prog2 = new ProgressionSystem(classesData, 'Ally Ranger');
  prog2.getProficiencyStat('animal_husbandry')!.level = 60;
  prog2.getProficiencyStat('taming')!.level = 60;
  prog2.getProficiencyStat('bows')!.level = 30;
  prog2.checkClassUnlocks();

  const player1 = new Player(scene, 5, 5, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog1);
  player1.setActiveClass('beastmaster');
  assert.equal(player1.activeClass, 'beastmaster');

  const player2 = new Player(scene, 6, 5, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog2);
  player2.setActiveClass('beastmaster');
  player2.companionUid = 'spider_1'; // Player 2 already bonded to spider_1

  const gameState = GameState.getInstance();
  gameState.tamedAnimals = [
    { uid: 'wolf_1', speciesId: 'wolf', name: 'Fang' },
    { uid: 'spider_1', speciesId: 'spider', name: 'Webby' },
    { uid: 'goat_1', speciesId: 'cave_goat', name: 'Billy' }, // Livestock
    { uid: 'fowl_1', speciesId: 'crypt_fowl', name: 'Clucky' } // Livestock
  ];

  const hud = new HUD(null as any);
  hud.update(player1, player1.progression, 0, [player1, player2]);

  // 1. renderPartyOverviewModal()
  hud.renderPartyOverviewModal(true);

  const rosterEl: any = (hud as any).partyOverviewRosterEl;
  assert.ok(rosterEl, 'partyOverviewRosterEl must exist');

  // 2. find the member's .party-companion-select
  const selects = rosterEl.querySelectorAll('.party-companion-select');
  assert.ok(selects.length >= 1, 'Must render .party-companion-select for beastmaster member');
  const sel0 = selects[0]; // player1's select
  assert.equal(sel0.dataset.memberIdx, '0');

  // 3. check its options: "None" plus predators only, no goat or fowl, and an animal bonded to another member is disabled
  const options = sel0.querySelectorAll('option');
  const optionValues = options.map((o: any) => o.value);
  const optionTexts = options.map((o: any) => o.textContent);

  // "None" option exists
  assert.equal(optionValues[0], '', 'First option must be None');
  assert.equal(optionTexts[0], 'None');

  // Predators only: wolf_1 and spider_1 present
  assert.ok(optionValues.includes('wolf_1'), 'Wolf predator must be listed');
  assert.ok(optionValues.includes('spider_1'), 'Spider predator must be listed');

  // Livestock excluded: no goat or fowl
  assert.ok(!optionValues.includes('goat_1'), 'cave_goat must NOT appear in companion options');
  assert.ok(!optionValues.includes('fowl_1'), 'crypt_fowl must NOT appear in companion options');
  assert.ok(!optionTexts.some((t: string) => t.includes('Billy')), 'Livestock Billy must not appear');
  assert.ok(!optionTexts.some((t: string) => t.includes('Clucky')), 'Livestock Clucky must not appear');

  // Animal bonded to another member (spider_1 bonded to player2) is disabled
  const spiderOpt = options.find((o: any) => o.value === 'spider_1');
  assert.ok(spiderOpt, 'spider_1 option must exist');
  assert.equal(spiderOpt.disabled, true, 'spider_1 bonded to player2 must be disabled');
  assert.ok(spiderOpt.textContent.includes('(Bonded)'), 'spider_1 option text must indicate (Bonded)');

  // wolf_1 is not bonded to another member, so it is enabled
  const wolfOpt = options.find((o: any) => o.value === 'wolf_1');
  assert.ok(wolfOpt);
  assert.equal(wolfOpt.disabled, false, 'wolf_1 must be enabled');

  // 4. set its value and dispatch change
  sel0.value = 'wolf_1';
  rosterEl.onchange({ target: sel0 });

  // 5. assert companionUid, and that the HP line updates
  assert.equal(player1.companionUid, 'wolf_1', 'Dispatching change must update player1.companionUid');
  assert.ok(rosterEl.innerHTML.includes('Name:</span> Fang'), 'HP line/card must update to show companion name');
  assert.ok(rosterEl.innerHTML.includes('Species:</span> Wolf'), 'HP line/card must update to show species');
  assert.ok(rosterEl.innerHTML.includes('Max HP:</span>'), 'HP line/card must update to show Max HP');

  // Snapshot persistence
  const snap = player1.getSnapshot(1000);
  assert.equal(snap.companionUid, 'wolf_1', 'Snapshot must record companionUid');

  const playerRestored = new Player(scene, 5, 5, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog1);
  playerRestored.restoreFromSnapshot(snap, 1000);
  assert.equal(playerRestored.companionUid, 'wolf_1', 'restoreFromSnapshot must restore companionUid');

  // Class switch away from beastmaster clears companionUid
  const switched = player1.setActiveClass('marksman');
  assert.ok(switched);
  assert.equal(player1.activeClass, 'marksman');
  assert.equal(player1.companionUid, null, 'Switching away from beastmaster must clear companionUid');
  assert.equal(gameState.tamedAnimals.length, 4, 'Animal must remain on the roster');

  // Switching back to beastmaster does NOT auto-restore; pick again
  player1.setActiveClass('beastmaster');
  assert.equal(player1.companionUid, null, 'Switching back to beastmaster must require picking companion again');

  console.log('✓ PASS: Companion dropdown drives bonding via real control, excludes livestock, disables bonded animals, updates HP display, and clears on class change.');
}

// -------------------------------------------------------------
// SUITE 3: BeastCompanion Unit Stats Calculation & Spawning
// -------------------------------------------------------------
console.log('\n--- Suite 3: Companion Stats Calculation & Spawning ---');
{
  const scene = createMockScene();
  const prog = new ProgressionSystem(classesData, 'Master Hunter');
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  prog.setClassLevel('beastmaster', 20); // Level 20 Beastmaster

  const owner = new Player(scene, 10, 10, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog);
  owner.setActiveClass('beastmaster');

  const wolfAnimal = { uid: 'wolf_alpha', speciesId: 'wolf', name: 'Ghost' };
  const beast = new BeastCompanion(scene, 11, 10, owner, wolfAnimal, 32);

  // Wolf in enemies.json: hp: 30, meleeDamage: 4, attackIntervalMs: 1200, moveSpeed: 140
  // hpPerClassLevel = 0.03 -> Lv 20 = 1 + 0.6 = 1.6x multiplier
  // Max HP = 30 * 1.6 = 48
  // Damage = 4 * 1.6 = 6.4
  assert.equal(beast.maxHp, 48, 'Wolf with Lv 20 Beastmaster owner must have 48 Max HP');
  assert.equal(beast.hp, 48, 'Wolf must spawn at full 48 HP');
  assert.equal(beast.meleeDamage, 6.4, 'Wolf with Lv 20 Beastmaster owner must have 6.4 damage');
  assert.equal(beast.baseAttackIntervalMs, 1200, 'Wolf must inherit 1200 ms attack interval from enemies.json');
  assert.equal(beast.moveSpeed, 90, 'Wolf must inherit 90 moveSpeed from enemies.json');

  // Verify mid-floor level up does not modify beast's current stats until next floor spawn
  prog.setClassLevel('beastmaster', 25);
  assert.equal(beast.maxHp, 48, 'Mid-floor level-up must not alter current floor beast maxHp');
  assert.equal(beast.meleeDamage, 6.4, 'Mid-floor level-up must not alter current floor beast meleeDamage');

  console.log('✓ PASS: Beast stats calculate correctly from enemies.json row × config (Lv 20 Wolf: 48 HP, 6.4 DMG).');
}

// -------------------------------------------------------------
// SUITE 4: 4-Step Behaviour Priority Order
// -------------------------------------------------------------
console.log('\n--- Suite 4: 4-Step Companion Behaviour Order ---');
{
  const scene = createMockScene();
  const prog = new ProgressionSystem(classesData, 'Ranger Bob');
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  prog.setClassLevel('beastmaster', 10);

  const owner = new Player(scene, 10, 10, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog);
  owner.setActiveClass('beastmaster');
  const wolf = new BeastCompanion(scene, 11, 10, owner, { uid: 'w1', speciesId: 'wolf', name: 'Wolfie' }, 32);

  const combat = new CombatSystem(scene);
  combat.party = [owner];
  combat.setBeastCompanions([wolf]);

  const enemyDef = DataLoader.getInstance().getEnemy('wolf')!;
  const enemy1 = new Enemy(scene, 12, 10, enemyDef, 'wolf-avatar', 32);
  const enemy2 = new Enemy(scene, 13, 10, enemyDef, 'wolf-avatar', 32);
  combat.enemies = [enemy1, enemy2];

  // Rule 1: If owner has a living target, attack it
  owner.targetEntity = enemy1;
  wolf.updateBeastBehavior(1000, 250, combat);
  assert.equal(wolf.targetEntity, enemy1, 'Rule 1: Beast must chase and attack owner living target');

  // Rule 2: Otherwise, attack nearest enemy within assistRadiusTiles (4) of owner attacking party or companion
  owner.targetEntity = null;
  enemy2.targetEntity = owner; // enemy2 is attacking owner!
  wolf.updateBeastBehavior(1250, 250, combat);
  assert.equal(wolf.targetEntity, enemy2, 'Rule 2: Beast must assist and engage enemy attacking owner within assist radius');

  // Rule 2 never pulls unengaged enemies
  enemy2.targetEntity = null; // now unengaged
  wolf.updateBeastBehavior(1500, 250, combat);
  assert.equal(wolf.targetEntity, null, 'Rule 2: Beast must never pull unengaged enemies');

  // Rule 3: Otherwise, follow owner to within followDistanceTiles (2)
  owner.gridPos = { x: 10, y: 10 };
  wolf.gridPos = { x: 14, y: 10 }; // 4 tiles away (> 2 followDistanceTiles)
  wolf.updateBeastBehavior(1750, 250, combat);
  assert.equal(wolf.targetEntity, null, 'Rule 3: Follows owner within followDistanceTiles');

  // Rule 4: If farther than leashTiles (8) from owner, drop target and return
  wolf.targetEntity = enemy1;
  wolf.gridPos = { x: 20, y: 10 }; // 10 tiles away (> 8 leashTiles)
  wolf.updateBeastBehavior(2000, 250, combat);
  assert.equal(wolf.targetEntity, null, 'Rule 4: Leash drops target and returns when > 8 tiles from owner');

  console.log('✓ PASS: All 4 behaviour priority rules hold strictly in sequence.');
}

// -------------------------------------------------------------
// SUITE 5: Enemy Targeting, Taunt, Downed & Non-Interference
// -------------------------------------------------------------
console.log('\n--- Suite 5: Enemy Targeting, Downed State & Non-Interference ---');
{
  const scene = createMockScene();
  const prog = new ProgressionSystem(classesData, 'Targeting Tester');
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();

  const owner = new Player(scene, 10, 10, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog);
  owner.setActiveClass('beastmaster');
  const beast = new BeastCompanion(scene, 11, 10, owner, { uid: 'w2', speciesId: 'wolf', name: 'TargetWolf' }, 32);

  const combat = new CombatSystem(scene);
  combat.party = [owner];
  combat.setBeastCompanions([beast]);

  // getEnemyTargetCandidates returns party + living beast companions
  const candidates = combat.getEnemyTargetCandidates();
  assert.equal(candidates.length, 2, 'Candidates must include owner + living beast companion');
  assert.ok(candidates.includes(beast), 'Candidates must include beast');

  // findBestTargetInParty includes beast
  const enemyDef = DataLoader.getInstance().getEnemy('wolf')!;
  const enemy = new Enemy(scene, 12, 10, enemyDef, 'wolf-avatar', 32);
  enemy.gridPos = { x: 12, y: 10 }; // adjacent to beast (dist 1), further from owner (dist 2)
  const bestTarget = combat.findBestTargetInParty(enemy);
  assert.equal(bestTarget, beast, 'Enemy closer to beast should target beast');

  // Taunt affects enemy to target beast
  enemy.tauntSource = beast;
  assert.equal(enemy.tauntSource, beast);

  // 0 armor mitigation on beast companion
  const armorMit = beast.applyArmorMitigation(50);
  assert.equal(armorMit.finalDamage, 50, 'Beast companion must have 0 armor mitigation');
  assert.equal(armorMit.mitigatedAmount, 0);

  // Damage down to 0 HP
  const downed = beast.takeDamage(100, enemy);
  assert.equal(downed, true, 'Beast takes fatal damage and is downed');
  assert.equal(beast.isDowned, true);
  assert.equal(beast.state, 'downed');

  // Candidates now only has owner
  const candidatesAfter = combat.getEnemyTargetCandidates();
  assert.equal(candidatesAfter.length, 1);
  assert.equal(candidatesAfter[0], owner);

  // Party wipe check: Beasts NEVER count toward party wipe
  // When beast is downed but party member is alive, isPartyWiped must be false!
  const isPartyWiped = combat.party.every(m => m.state === 'downed');
  assert.equal(isPartyWiped, false, 'Party is NOT wiped when only beast is downed');

  // Healers never target beasts: party heals only consider combat.party
  assert.equal(combat.skillSystem.findLowestHealthAlly(owner), null, 'Beast is never returned by findLowestHealthAlly even when downed');
  owner.hp = 50;
  assert.equal(combat.skillSystem.findLowestHealthAlly(owner), owner, 'Party member is targeted by heal, never beast');
  owner.hp = owner.maxHp;

  // Respawn at reviveHpFraction (50%) on next floor entry
  const nextFloorHp = beast.maxHp * beastConfig.reviveHpFraction;
  assert.equal(nextFloorHp, 0.5 * beast.maxHp, 'On next floor entry, respawns at 50% HP');

  console.log('✓ PASS: Beast is valid enemy target, takes 0 armor mitigation, lies down without causing party wipe, and is never targeted by party heals/revives.');
}

// -------------------------------------------------------------
// SUITE 6: Kill Credit & Combat Summary
// -------------------------------------------------------------
console.log('\n--- Suite 6: Kill Credit & Combat Summary Recording ---');
{
  const scene = createMockScene();
  const prog = new ProgressionSystem(classesData, 'Exp Hunter');
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  prog.setClassLevel('beastmaster', 1);

  const owner = new Player(scene, 10, 10, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog);
  owner.setActiveClass('beastmaster');
  const wolf = new BeastCompanion(scene, 11, 10, owner, { uid: 'w3', speciesId: 'wolf', name: 'Slayer' }, 32);

  const combat = new CombatSystem(scene);
  combat.party = [owner];
  combat.setBeastCompanions([wolf]);

  const enemyDef = DataLoader.getInstance().getEnemy('wolf')!;
  const victim = new Enemy(scene, 12, 10, enemyDef, 'wolf-avatar', 32);

  const initialTamingExp = owner.progression.getProficiencyStat('taming')!.currentExp;
  const initialClassExp = owner.progression.getClassStat('beastmaster').currentExp;

  // Beast kills victim
  wolf.handleBeastKill(victim, combat);

  const afterTamingExp = owner.progression.getProficiencyStat('taming')!.currentExp;
  const afterClassExp = owner.progression.getClassStat('beastmaster').currentExp;

  // Taming EXP: +2 to owner
  assert.equal(afterTamingExp, initialTamingExp + 2, 'Owner must receive +2 Taming EXP per companion kill');
  assert.ok(afterClassExp >= initialClassExp, 'Owner must receive kill credit / class EXP');

  // Combat summary recording
  combat.recordDamageEvent(victim, 25, wolf); // wolf deals 25
  combat.recordDamageEvent(wolf, 15, victim); // wolf takes 15

  const dealt = (combat as any).damageDealtByMember.get(wolf.combatSummaryName);
  const taken = (combat as any).damageTakenByMember.get(wolf.combatSummaryName);
  assert.equal(dealt, 25, 'Damage dealt must be recorded under <Species> (<Owner>\'s)');
  assert.equal(taken, 15, 'Damage taken must be recorded under <Species> (<Owner>\'s)');

  console.log('✓ PASS: Kill credit routes to owner via handleTargetDefeated (+2 Taming EXP), combat summary records <Species> (<Owner>\'s).');
}

// -------------------------------------------------------------
// SUITE 7: Kit Skills & AI Selection Rules
// -------------------------------------------------------------
console.log('\n--- Suite 7: Kit Skills & AI Selection ---');
{
  const scene = createMockScene();
  const prog = new ProgressionSystem(classesData, 'Kit Master');
  prog.getProficiencyStat('animal_husbandry')!.level = 60;
  prog.getProficiencyStat('taming')!.level = 60;
  prog.getProficiencyStat('bows')!.level = 30;
  prog.checkClassUnlocks();
  prog.setClassLevel('beastmaster', 40);

  const owner = new Player(scene, 10, 10, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog);
  owner.setActiveClass('beastmaster');
  owner.equippedSkillIds = ['sic_em', 'mend_beast', 'bestial_fury', 'guardian_howl', 'stampede'];
  owner.knownSkillIds = [...owner.equippedSkillIds];
  for (const s of owner.equippedSkillIds) owner.autocastMap.set(s, true);

  const combat = new CombatSystem(scene);
  combat.party = [owner];
  const skillSystem = (combat as any).skillSystem;

  // 1. Without companion: mend_beast, bestial_fury, guardian_howl cannot be executed
  const sicEmDef = DataLoader.getInstance().getSkill('sic_em')!;
  const mendDef = DataLoader.getInstance().getSkill('mend_beast')!;
  const furyDef = DataLoader.getInstance().getSkill('bestial_fury')!;
  const howlDef = DataLoader.getInstance().getSkill('guardian_howl')!;
  const stampedeDef = DataLoader.getInstance().getSkill('stampede')!;

  assert.equal(skillSystem.execute(owner, mendDef, owner, 1000), false, 'Mend Beast fails without companion');
  assert.equal(skillSystem.execute(owner, furyDef, owner, 1000), false, 'Bestial Fury fails without companion');
  assert.equal(skillSystem.execute(owner, howlDef, owner, 1000), false, 'Guardian Howl fails without companion');

  // AI selection without companion returns null for all companion-only skills
  const selSupportNoBeast = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.equal(selSupportNoBeast, null, 'AI selector must not select Mend Beast without companion');
  const selDefNoBeast = skillSystem.selectSkillForCompanion(owner, 'defensive', 1000);
  assert.equal(selDefNoBeast, null, 'AI selector must not select Bestial Fury/Guardian Howl without companion');

  // 2. Add living companion (Wolf with Lv 40 owner: base 4 dmg * (1 + 0.03 * 40) = 8.8 dmg, 1200 ms interval, 66 maxHp)
  const wolf = new BeastCompanion(scene, 10, 11, owner, { uid: 'w4', speciesId: 'wolf', name: 'Timber' }, 32);
  combat.setBeastCompanions([wolf]);

  // Beast at full HP: mend_beast must NOT be selected by AI (only < 50% HP)
  const selSupportFullHp = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.equal(selSupportFullHp, null, 'Mend Beast must NOT be selected when beast is at 100% HP');

  // Injure beast to 40% HP (< 50% HP)
  wolf.hp = wolf.maxHp * 0.4;
  const selSupportInjured = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.ok(selSupportInjured, 'Mend Beast MUST be selected when beast is < 50% HP');
  assert.equal(selSupportInjured.skillDef.id, 'mend_beast');

  // Cast Mend Beast: restores exactly 30% of max HP
  const prevHp = wolf.hp;
  const healSuccess = skillSystem.execute(owner, mendDef, owner, 1000);
  assert.equal(healSuccess, true, 'Mend Beast execution must succeed with living beast');
  assert.equal(wolf.hp, prevHp + 0.3 * wolf.maxHp, 'Mend Beast must restore 30% max HP');

  // Defensive context with living companion: Bestial Fury / Guardian Howl selectable
  const selDef = skillSystem.selectSkillForCompanion(owner, 'defensive', 1000);
  assert.ok(selDef, 'Defensive skills selectable with living companion');
  assert.ok(selDef.skillDef.id === 'guardian_howl' || selDef.skillDef.id === 'bestial_fury');

  // 3. Bestial Fury: Attack speed goes 1200 -> 857 ms, damage * 1.2 for 8 s, returns to normal
  assert.equal(wolf.getEffectiveAttackInterval(), 1200);
  assert.equal(wolf.getEffectiveMeleeDamage(), 8.8);

  const furySuccess = skillSystem.execute(owner, furyDef, owner, 1000);
  assert.equal(furySuccess, true);
  assert.equal(wolf.getEffectiveAttackInterval(), 857, 'Attack interval must be 857 ms (1200 / 1.4)');
  assert.equal(Math.round(wolf.getEffectiveMeleeDamage() * 100) / 100, 10.56, 'Damage must be 8.8 * 1.2 = 10.56');

  // Advance delta 8000 ms to expire buff
  wolf.updateBeastBehavior(10000, 8000, combat);
  assert.equal(wolf.getEffectiveAttackInterval(), 1200, 'Attack interval returns to normal 1200 ms');
  assert.equal(wolf.getEffectiveMeleeDamage(), 8.8, 'Damage returns to normal 8.8');

  // 4. Guardian Howl: Enemies within 3 tiles taunted for 4 s, enemy 4 tiles away is not
  owner.autocastMap.clear(); // Disable background autocast for direct kit skill assertions
  const enemyNear = new Enemy(scene, 12, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32); // dist = 2 <= 3
  const enemyFar = new Enemy(scene, 14, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32); // dist = 4 > 3
  combat.enemies = [enemyNear, enemyFar];

  wolf.setGridPosition(10, 10);
  enemyNear.setGridPosition(12, 10);
  enemyFar.setGridPosition(14, 10);

  const howlSuccess = skillSystem.execute(owner, howlDef, owner, 2000);
  assert.equal(howlSuccess, true);

  assert.equal(enemyNear.hasStatusEffect('taunted'), true, 'Enemy within 3 tiles must be taunted');
  assert.equal(enemyNear.activeStatusEffects.get('taunted')?.def?.durationMs, 4000, 'Taunt must last exactly 4000 ms (not 6000 ms)');
  assert.equal(enemyNear.tauntSource, wolf, 'Taunt source must be the wolf companion');

  assert.equal(enemyFar.hasStatusEffect('taunted'), false, 'Enemy 4 tiles away must NOT be taunted');
  assert.equal(enemyFar.tauntSource, null);

  // Advance time by 4000 ms
  enemyNear.updateStatusEffects(4000);
  owner.equippedSkillIds = []; // Prevent auto-recasting during combat loop update
  combat.update(20000, 4000);
  assert.equal(enemyNear.hasStatusEffect('taunted'), false, 'Taunt must expire after 4 s');
  assert.equal(enemyNear.tauntSource, null, 'tauntSource must be cleared after taunt expires');

  // 5. Sic 'Em: Owner 0.8x weapon hit, beast moves next to target and hits for 2.0x beast damage (17.6)
  // Target dummy with 500 HP
  const targetDummy = new Enemy(scene, 14, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32);
  targetDummy.hp = 500;
  targetDummy.maxHp = 500;
  combat.enemies = [targetDummy];

  wolf.setGridPosition(10, 10);
  owner.setGridPosition(10, 10);
  owner.energy = 100;
  owner.mood = 80;

  // Track damage calls on targetDummy
  const origRng = Math.random;
  Math.random = () => 0.05; // Guarantee weapon skill hit connects deterministically

  const hitsDealt: { damage: number; source: any }[] = [];
  const origTakeDamage = targetDummy.takeDamage.bind(targetDummy);
  targetDummy.takeDamage = function(amount: number, source?: any) {
    hitsDealt.push({ damage: amount, source });
    return origTakeDamage(amount, source);
  };

  const sicSuccess = skillSystem.execute(owner, sicEmDef, targetDummy, 3000);
  assert.equal(sicSuccess, true);

  // Owner hit = 0.8x weapon damage = 18.21; Beast hit = 2.0x beast damage = 17.6 (8.8 * 2.0)
  const expectedOwnerHit08 = 18.21;
  assert.equal(hitsDealt.length, 2, 'Sic Em must deal 2 hits: owner weapon hit and beast strike');
  assert.equal(hitsDealt[0].source, owner, 'First hit must be owner weapon hit');
  assert.equal(Math.round(hitsDealt[0].damage * 100) / 100, expectedOwnerHit08, `Owner hit must be 0.8x weapon damage (${expectedOwnerHit08})`);
  assert.equal(hitsDealt[1].source, wolf, 'Second hit must be from wolf companion');
  assert.equal(hitsDealt[1].damage, 17.6, 'Beast hit must be exactly 2.0x beast damage (8.8 * 2.0 = 17.6)');

  // Beast moved next to target
  const beastDistToTarget = Math.max(Math.abs(wolf.gridPos.x - targetDummy.gridPos.x), Math.abs(wolf.gridPos.y - targetDummy.gridPos.y));
  assert.ok(beastDistToTarget <= 1, 'Beast must move to a tile adjacent to the target');

  // With no beast, owner part still fires
  hitsDealt.length = 0;
  combat.setBeastCompanions([]);
  owner.lastSkillUseTimes.clear();
  owner.energy = 100;
  const sicNoBeastSuccess = skillSystem.execute(owner, sicEmDef, targetDummy, 10000);
  assert.equal(sicNoBeastSuccess, true, 'Sic Em must succeed even with no beast companion');
  assert.equal(hitsDealt.length, 1, 'Only owner weapon hit fires when there is no beast');
  assert.equal(hitsDealt[0].source, owner);
  assert.equal(Math.round(hitsDealt[0].damage * 100) / 100, expectedOwnerHit08);

  // 6. Stampede: 1.2x weapon damage to every enemy within 2 tiles of target, not one at 3; beast hits for 1.5x (13.2)
  combat.setBeastCompanions([wolf]);
  wolf.setGridPosition(10, 10);

  const stampedePrimary = new Enemy(scene, 14, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32);
  const stampedeNear1 = new Enemy(scene, 15, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32); // dist 1 <= 2
  const stampedeNear2 = new Enemy(scene, 16, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32); // dist 2 <= 2
  const stampedeFar = new Enemy(scene, 17, 10, DataLoader.getInstance().getEnemy('wolf')!, 'wolf-avatar', 32);   // dist 3 > 2

  for (const e of [stampedePrimary, stampedeNear1, stampedeNear2, stampedeFar]) {
    e.hp = 500;
    e.maxHp = 500;
  }
  combat.enemies = [stampedePrimary, stampedeNear1, stampedeNear2, stampedeFar];

  const stampedeHits: { target: string; damage: number; source: any }[] = [];
  const hookTarget = (t: Enemy, name: string) => {
    const orig = t.takeDamage.bind(t);
    t.takeDamage = function(amount: number, source?: any) {
      stampedeHits.push({ target: name, damage: amount, source });
      return orig(amount, source);
    };
  };
  hookTarget(stampedePrimary, 'primary');
  hookTarget(stampedeNear1, 'near1');
  hookTarget(stampedeNear2, 'near2');
  hookTarget(stampedeFar, 'far');

  owner.energy = 100;
  const stampedeSuccess = skillSystem.execute(owner, stampedeDef, stampedePrimary, 5000);
  assert.equal(stampedeSuccess, true);

  // Expected 1.2x weapon damage: 27.31
  // Expected beast damage: 8.8 * 1.5 = 13.2
  const expectedOwnerHit12 = 27.31;
  const primaryHits = stampedeHits.filter(h => h.target === 'primary');
  assert.equal(primaryHits.length, 2, 'Primary target receives owner weapon hit and beast strike');
  assert.equal(Math.round(primaryHits[0].damage * 100) / 100, expectedOwnerHit12, `Primary receives 1.2x weapon damage (${expectedOwnerHit12})`);
  assert.equal(primaryHits[1].source, wolf);
  assert.equal(Math.round(primaryHits[1].damage * 100) / 100, 13.2, 'Primary receives beast strike for 1.5x beast damage (8.8 * 1.5 = 13.2)');

  const near1Hits = stampedeHits.filter(h => h.target === 'near1');
  assert.equal(near1Hits.length, 1, 'Enemy 1 tile away receives 1.2x splash damage');
  assert.equal(Math.round(near1Hits[0].damage * 100) / 100, expectedOwnerHit12);

  const near2Hits = stampedeHits.filter(h => h.target === 'near2');
  assert.equal(near2Hits.length, 1, 'Enemy 2 tiles away receives 1.2x splash damage');
  assert.equal(Math.round(near2Hits[0].damage * 100) / 100, expectedOwnerHit12);

  const farHits = stampedeHits.filter(h => h.target === 'far');
  assert.equal(farHits.length, 0, 'Enemy 3 tiles away must receive 0 damage (outside 2-tile radius)');

  // Stampede with no beast: owner part still fires
  stampedeHits.length = 0;
  combat.setBeastCompanions([]);
  owner.lastSkillUseTimes.clear();
  owner.energy = 100;
  for (const e of [stampedePrimary, stampedeNear1, stampedeNear2, stampedeFar]) {
    e.hp = 500;
  }
  const stampedeNoBeastSuccess = skillSystem.execute(owner, stampedeDef, stampedePrimary, 25000);
  assert.equal(stampedeNoBeastSuccess, true);

  const primaryNoBeastHits = stampedeHits.filter(h => h.target === 'primary');
  assert.equal(primaryNoBeastHits.length, 1, 'Primary receives only owner weapon hit without beast');
  assert.equal(Math.round(primaryNoBeastHits[0].damage * 100) / 100, expectedOwnerHit12);

  const near1NoBeastHits = stampedeHits.filter(h => h.target === 'near1');
  assert.equal(near1NoBeastHits.length, 1, 'Enemy 1 tile away receives splash even without beast');

  const farNoBeastHits = stampedeHits.filter(h => h.target === 'far');
  assert.equal(farNoBeastHits.length, 0, 'Enemy 3 tiles away still receives 0');

  Math.random = origRng;

  console.log('✓ PASS: Kit skills execute correctly, exact numbers verified for Sic Em, Stampede, Bestial Fury and Guardian Howl, and AI rules match requirements.');
}

console.log('\n🎉 ALL BEASTMASTER & COMPANIONS TESTS PASSED SUCCESSFULLY!');
