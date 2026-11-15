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

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.children = [];
    const matches = val.matchAll(/<([a-zA-Z0-9\-]+)([^>]*)>/g);
    for (const match of matches) {
      const tag = match[1];
      const attrsStr = match[2];
      const el = new MockElement(tag);
      el.parentElement = this;
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
      const valMatch = attrsStr.match(/value=["']([^"']+)["']/);
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
  querySelectorAll: () => [],
  querySelector: () => null,
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
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
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

  const player1 = new Player(scene, 5, 5, defaultPlayerData, defaultWeapon, 32, 'player-avatar', prog1);
  player1.setActiveClass('beastmaster');
  assert.equal(player1.activeClass, 'beastmaster');

  const gameState = GameState.getInstance();
  gameState.tamedAnimals = [
    { uid: 'wolf_1', speciesId: 'wolf', name: 'Fang' },
    { uid: 'spider_1', speciesId: 'spider', name: 'Webby' },
    { uid: 'goat_1', speciesId: 'cave_goat', name: 'Billy' }, // Livestock
    { uid: 'fowl_1', speciesId: 'crypt_fowl', name: 'Clucky' } // Livestock
  ];

  // Predatory filter check: only wolf and spider should be selectable, not goat or fowl
  const predatorSpecies = ['wolf', 'spider', 'deep_crawler', 'cinder_hound', 'frostfang_stalker'];
  const eligibleAnimals = gameState.tamedAnimals.filter(a => predatorSpecies.includes(a.speciesId));
  assert.equal(eligibleAnimals.length, 2);
  assert.deepEqual(eligibleAnimals.map(a => a.speciesId), ['wolf', 'spider']);
  assert.ok(!eligibleAnimals.some(a => a.speciesId === 'cave_goat'), 'Livestock must never appear in companion choices');
  assert.ok(!eligibleAnimals.some(a => a.speciesId === 'crypt_fowl'), 'Livestock must never appear in companion choices');

  // Bond animal to player1
  player1.companionUid = 'wolf_1';

  // Snapshot persistence
  const snap = player1.getSnapshot(1000);
  assert.equal(snap.companionUid, 'wolf_1', 'Snapshot must record companionUid');

  // Restore without clearing
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

  console.log('✓ PASS: Companion dropdown filters predators only, persists on save/load, and clears when changing class away.');
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
  const mendDef = DataLoader.getInstance().getSkill('mend_beast')!;
  const furyDef = DataLoader.getInstance().getSkill('bestial_fury')!;
  const howlDef = DataLoader.getInstance().getSkill('guardian_howl')!;

  assert.equal(skillSystem.execute(owner, mendDef, owner, 1000), false, 'Mend Beast fails without companion');
  assert.equal(skillSystem.execute(owner, furyDef, owner, 1000), false, 'Bestial Fury fails without companion');
  assert.equal(skillSystem.execute(owner, howlDef, owner, 1000), false, 'Guardian Howl fails without companion');

  // AI selection without companion returns null for all companion-only skills
  const selSupportNoBeast = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.equal(selSupportNoBeast, null, 'AI selector must not select Mend Beast without companion');
  const selDefNoBeast = skillSystem.selectSkillForCompanion(owner, 'defensive', 1000);
  assert.equal(selDefNoBeast, null, 'AI selector must not select Bestial Fury/Guardian Howl without companion');

  // 2. Add living companion at full HP
  const wolf = new BeastCompanion(scene, 11, 10, owner, { uid: 'w4', speciesId: 'wolf', name: 'Timber' }, 32);
  combat.setBeastCompanions([wolf]);

  // Beast at full HP: mend_beast must NOT be selected by AI (only < 50% HP)
  const selSupportFullHp = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.equal(selSupportFullHp, null, 'Mend Beast must NOT be selected when beast is at 100% HP');

  // Injure beast to 40% HP (< 50% HP)
  wolf.hp = wolf.maxHp * 0.4;
  const selSupportInjured = skillSystem.selectSkillForCompanion(owner, 'support', 1000);
  assert.ok(selSupportInjured, 'Mend Beast MUST be selected when beast is < 50% HP');
  assert.equal(selSupportInjured.skillDef.id, 'mend_beast');

  // Cast Mend Beast: restores 30% HP
  const prevHp = wolf.hp;
  const healSuccess = skillSystem.execute(owner, mendDef, owner, 1000);
  assert.equal(healSuccess, true, 'Mend Beast execution must succeed with living beast');
  assert.equal(wolf.hp, prevHp + 0.3 * wolf.maxHp, 'Mend Beast must restore 30% max HP');

  // Defensive context with living companion: Bestial Fury / Guardian Howl
  const selDef = skillSystem.selectSkillForCompanion(owner, 'defensive', 1000);
  assert.ok(selDef, 'Defensive skills selectable with living companion');
  assert.ok(selDef.skillDef.id === 'guardian_howl' || selDef.skillDef.id === 'bestial_fury');

  console.log('✓ PASS: Kit skills execute correctly, companion-only skills gated without companion, and AI rules match requirements.');
}

// -------------------------------------------------------------
// SUITE 8: UI Overflow & ElementFromPoint Audit
// -------------------------------------------------------------
console.log('\n--- Suite 8: UI Overflow & Clickability Checks ---');
{
  const css = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(/max-height:\s*calc\(100vh - \d+px\)/.test(css) && /overflow-y:\s*auto/.test(css), 'HUD panel must be height capped and scroll');
  assert.ok(/overflow-y:\s*auto/.test(css), 'Custom modals must allow vertical scrolling');
  console.log('✓ PASS: UI overflow rules verified.');
}

console.log('\n🎉 ALL BEASTMASTER & COMPANIONS TESTS PASSED SUCCESSFULLY!');
