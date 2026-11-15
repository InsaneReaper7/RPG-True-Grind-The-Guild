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

// 2. Setup mock browser globals
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const mockStorage: Record<string, string> = {};
const noop = () => {};
(global as any).localStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const domElements = new Map<string, any>();

function parseHtmlIntoElements(parentEl: any, html: string) {
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1];
    if (tagName.startsWith('/')) continue;
    const attrsStr = match[2];
    const child = getOrCreateElement(`mock-${tagName}-${Math.random().toString(36).slice(2, 8)}`);
    child.tagName = tagName.toUpperCase();
    child.children = [];

    const classMatch = attrsStr.match(/class=["']([^"']*)["']/);
    if (classMatch) {
      classMatch[1].split(/\s+/).filter(Boolean).forEach(c => child.classList.add(c));
    }
    const idMatch = attrsStr.match(/id=["']([^"']*)["']/);
    if (idMatch) {
      child.id = idMatch[1];
      domElements.set(child.id, child);
    }
    const titleMatch = attrsStr.match(/title=["']([^"']*)["']/);
    if (titleMatch) {
      child.title = titleMatch[1];
    }
    if (/\bdisabled\b/.test(attrsStr)) {
      child.disabled = true;
    }
    const dataRegex = /data-([a-zA-Z0-9-]+)=["']([^"']*)["']/g;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
      const rawKey = dataMatch[1];
      const val = dataMatch[2];
      const camelKey = rawKey.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      child.dataset[camelKey] = val;
      child.dataset[rawKey] = val;
    }

    parentEl.appendChild(child);
  }
}

function getOrCreateElement(id: string): any {
  if (!domElements.has(id)) {
    const el: any = {
      id,
      className: '',
      classList: {
        _classes: new Set<string>(),
        add(c: string) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c: string) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c: string) { return this._classes.has(c); },
        toggle(c: string) { if (this.contains(c)) this.remove(c); else this.add(c); }
      },
      style: {},
      children: [] as any[],
      dataset: {} as Record<string, string>,
      innerText: '',
      _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(val: string) {
        this._innerHTML = String(val);
        this.children = [];
        parseHtmlIntoElements(this, this._innerHTML);
      },
      textContent: '',
      disabled: false,
      title: '',
      onclick: null as any,
      click() { if (typeof this.onclick === 'function') this.onclick({ stopPropagation: noop, preventDefault: noop }); },
      appendChild(child: any) { this.children.push(child); return child; },
      removeChild(child: any) { const idx = this.children.indexOf(child); if (idx >= 0) this.children.splice(idx, 1); return child; },
      querySelector(sel: string) {
        return findInTree(this, sel);
      },
      querySelectorAll(sel: string) {
        const res: any[] = [];
        findAllInTree(this, sel, res);
        return res;
      },
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 })
    };
    domElements.set(id, el);
  }
  return domElements.get(id);
}

function findInTree(root: any, selector: string): any {
  if (!root || !root.children) return null;
  for (const child of root.children) {
    if (matchesSelector(child, selector)) return child;
    const deep = findInTree(child, selector);
    if (deep) return deep;
  }
  return null;
}

function findAllInTree(root: any, selector: string, results: any[]) {
  if (!root || !root.children) return;
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    findAllInTree(child, selector, results);
  }
}

function matchesSelector(el: any, sel: string): boolean {
  if (!el) return false;
  if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
  if (sel.startsWith('.') && el.classList && el.classList.contains(sel.slice(1))) return true;
  if (sel.startsWith('[data-')) {
    const attrMatch = sel.match(/\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/);
    if (attrMatch) {
      const fullAttr = attrMatch[1];
      const val = attrMatch[2];
      const datasetKey = fullAttr.replace(/^data-/, '').replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      const rawKey = fullAttr.replace(/^data-/, '');
      if (val !== undefined) {
        return el.dataset && (el.dataset[datasetKey] === val || el.dataset[rawKey] === val);
      }
      return el.dataset && (el.dataset[datasetKey] !== undefined || el.dataset[rawKey] !== undefined);
    }
  }
  return false;
}

const mockWindow: any = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  localStorage: (global as any).localStorage
};
(global as any).window = mockWindow;
(globalThis as any).window = mockWindow;

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

(global as any).document = {
  createElement: (tag: string) => {
    const el = getOrCreateElement(`mock-${tag}-${Math.random().toString(36).slice(2, 8)}`);
    (el as any).tagName = tag.toUpperCase();
    (el as any).getContext = () => dummyCtx;
    return el;
  },
  getElementById: (id: string) => getOrCreateElement(id),
  querySelector: (sel: string) => {
    for (const el of domElements.values()) {
      if (matchesSelector(el, sel)) return el;
      const found = findInTree(el, sel);
      if (found) return found;
    }
    return null;
  },
  querySelectorAll: (sel: string) => {
    const res: any[] = [];
    for (const el of domElements.values()) {
      if (matchesSelector(el, sel)) res.push(el);
      findAllInTree(el, sel, res);
    }
    return res;
  },
  elementFromPoint: (x: number, y: number) => {
    for (const el of domElements.values()) {
      if (el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return el;
        }
      }
    }
    return null;
  },
  addEventListener: noop,
  removeEventListener: noop,
  documentElement: {},
  body: {}
};
(globalThis as any).document = (global as any).document;
(global as any).Image = class Image {};
(global as any).HTMLCanvasElement = class HTMLCanvasElement {};

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(path.join(rootDir, cleanPath), 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// 3. Dynamic imports after globals setup
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { SkillSystem } = await import('../src/systems/SkillSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { HUD } = await import('../src/ui/HUD.ts');

// Helper for test convenience
(ProgressionSystem.prototype as any).unlockClass = function(classId: string) {
  this.setClassLevel(classId, Math.max(1, this.getClassLevel(classId)));
};

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {},
      setVisible: () => obj,
      setPosition: () => obj,
      setText: () => obj,
      setOrigin: () => obj,
      setDepth: () => obj,
      setScale: () => obj,
      setAlpha: () => obj
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
    tileSize: 32,
    time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
    events: { emit: noop, on: noop, off: noop },
    cameras: { main: { scrollX: 0, scrollY: 0 } },
    sound: { play: noop },
    sys: {
      queueDepthSort: noop,
      events: { once: noop, on: noop, off: noop, emit: noop },
      input: { enable: noop, disable: noop },
      displayList: { add: noop, remove: noop, queueDepthSort: noop },
      updateList: { add: noop, remove: noop }
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) config.onComplete();
        return { stop: noop, remove: noop };
      }
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    },
    beastCompanions: [] as any[]
  };
}

function createMockCombatSystem(party: Player[] = []): any {
  const floated: { x: number; y: number; text: string; color: string }[] = [];
  const enemies: any[] = [];
  const csTarget: any = {
    party,
    enemies,
    beastCompanions: [],
    floatedTexts: floated,
    createFloatingText(x: number, y: number, text: string, color: string) {
      floated.push({ x, y, text, color });
    },
    getStatusRng() {
      return () => 0.5;
    },
    getCombatPassiveRng() {
      return () => 0.5;
    },
    getEffectiveWeaponForAttack(member: Player) {
      return member.equippedWeapon ?? {
        id: 'fist',
        name: 'Fist',
        category: 'melee_1h',
        baseDamage: 5,
        attackIntervalMs: 1000
      };
    },
    castSkill(caster: Player, skillId: string, target?: any, currentTime?: number) {
      const dataLoader = DataLoader.getInstance();
      const skillDef = dataLoader.getSkill(skillId);
      if (!skillDef || !caster.progression.isSkillUnlocked(skillDef, caster)) return false;
      return cs.skillSystem.execute(caster, skillDef, target, currentTime);
    }
  };
  const cs: any = new Proxy(csTarget, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    }
  });
  cs.skillSystem = new SkillSystem(cs);
  return cs;
}

function createTestPlayer(name: string, startingWeaponId: string = 'short_swords'): Player {
  const dataLoader = DataLoader.getInstance();
  const weapon = dataLoader.getWeapon(startingWeaponId) ?? {
    id: startingWeaponId,
    name: startingWeaponId,
    category: 'melee_1h',
    baseDamage: 5,
    attackIntervalMs: 1000
  };
  const prog = new ProgressionSystem(dataLoader.getClassesData(), name);
  const scene = createMockScene();
  const playerData = {
    name,
    baseCarryCapacity: 50,
    maxHp: 100,
    maxCriticalHp: 50,
    maxEnergy: 100,
    level: 1
  };
  const p = new Player(scene, 10, 10, playerData, weapon as any, 32, 'avatar', prog);
  p.hp = 100;
  p.maxHp = 100;
  p.criticalHp = 50;
  p.maxCriticalHp = 50;
  p.energy = 100;
  p.maxEnergy = 100;
  p.knownSkillIds = [];
  p.equippedSkillIds = [];
  return p;
}

async function runSuite() {
  console.log('========================================================================');
  console.log('⚔️ RUNNING MILESTONE 10: SKILLS NEED WEAPON & PLAYER PRIORITY SUITE 🛡️');
  console.log('========================================================================\n');

  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();

  // --------------------------------------------------------------------------
  // TEST 1: WEAPON SETS & DATA LINT
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Weapon sets spot-check 6 classes + data_lint counts ---');
  // 1a. Pure-weapon class: swordsman / samurai (katana)
  const swordsmanSet = SkillSystem.getSkillWeaponSet('blade_strike');
  assert.ok(swordsmanSet.has('katana'), 'Swordsman skill requires katana');
  assert.equal(swordsmanSet.size, 1, 'Swordsman is pure katana');

  // 1b. 2-weapon hybrid: scout (daggers + bows)
  const scoutSet = SkillSystem.getSkillWeaponSet('quickshot');
  assert.ok(scoutSet.has('daggers') && scoutSet.has('bows'), 'Scout quickshot has daggers and bows');
  assert.equal(scoutSet.size, 2, 'Scout quickshot has exactly 2 weapons');

  // 1c. Shield hybrid: grand_paladin (shields + short_swords + longswords + holy_magic + healing_magic)
  const gpSet = SkillSystem.getSkillWeaponSet('sacred_strike');
  assert.ok(gpSet.has('shields'), 'Grand Paladin sacred_strike has shields');
  assert.ok(gpSet.has('short_swords'), 'Grand Paladin sacred_strike has short_swords');
  assert.ok(gpSet.has('holy_magic'), 'Grand Paladin sacred_strike has holy_magic');

  // 1d. Magic school class: ember_adept (fire_magic)
  const fireSet = SkillSystem.getSkillWeaponSet('firebolt');
  assert.ok(fireSet.has('fire_magic'), 'Ember adept firebolt requires fire_magic');

  // 1e. Weaponmaster vs Riposte Master
  const wmSet = SkillSystem.getSkillWeaponSet('adaptive_strike');
  assert.ok(wmSet.has('katana'), 'Weaponmaster set includes katana');
  assert.ok(wmSet.has('bows'), 'Weaponmaster set includes bows');
  assert.ok(wmSet.size >= 20, 'Weaponmaster resolves to broad weapon suite');

  const rmSet = SkillSystem.getSkillWeaponSet('feint_cut');
  assert.ok(rmSet.has('katana'), 'Riposte Master includes katana');
  assert.ok(rmSet.has('spears'), 'Riposte Master includes spears');
  assert.equal(rmSet.has('bows'), false, 'Riposte Master excludes bows');

  // 1f. Brawler (fist)
  const brawlerSet = SkillSystem.getSkillWeaponSet('normal_punch');
  assert.ok(brawlerSet.has('fist'), 'Brawler normal_punch requires fist');

  // 1g. Recount integrity check
  const allSkills = dataLoader.getSkills();
  assert.equal(allSkills.length, 485, 'Total skills must be 485');
  let nonEmpties = 0;
  for (const s of allSkills) {
    const sSet = SkillSystem.getSkillWeaponSet(s.id);
    assert.ok(sSet.size > 0, `Skill "${s.id}" set must be non-empty`);
    nonEmpties++;
  }
  assert.equal(nonEmpties, 485, 'All 485 skills have non-empty weapon sets');
  console.log(`✔ Test 1 Passed: 6 classes verified, all ${nonEmpties}/485 skill weapon sets non-empty.\n`);

  // --------------------------------------------------------------------------
  // TEST 2: THE USABILITY RULE
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: Usability rules & execution rejection with throttled float ---');
  const katanaWpn = dataLoader.getWeapon('katana')!;
  const bowWpn = dataLoader.getWeapon('bows')!;
  const daggerWpn = dataLoader.getWeapon('daggers')!;
  const iceMagicWpn = dataLoader.getWeapon('ice_magic')!;
  const fireStaffWpn = dataLoader.getWeapon('fire_staff')!;

  const p1 = createTestPlayer('Hero1', 'katana');
  const combat1 = createMockCombatSystem([p1]);
  p1.scene.combatSystem = combat1;

  // Learn katana skill and unlock swordsman class
  p1.progression.unlockClass('swordsman');
  p1.progression.setClassLevel('swordsman', 5);
  p1.learnSkill('blade_strike');
  p1.equipSkill('blade_strike');

  // Katana skill fires with katana
  const bladeDef = dataLoader.getSkill('blade_strike')!;
  const okKatana = combat1.skillSystem.execute(p1, bladeDef, p1, 1000);
  assert.equal(okKatana, true, 'Katana skill fires with katana equipped');

  // Katana skill fails with bow and floats "Needs Katana" (throttled)
  p1.equippedWeapon = bowWpn;
  const okBow = combat1.skillSystem.execute(p1, bladeDef, p1, 2000);
  assert.equal(okBow, false, 'Katana skill fails with bow equipped');
  assert.equal(combat1.floatedTexts.length, 1, 'Emitted one floating warning');
  assert.ok(combat1.floatedTexts[0].text.includes('Needs') && combat1.floatedTexts[0].text.includes('Katana'), 'Floated text mentions Katana');

  // Throttled: second immediate attempt within 1s does not emit duplicate float
  const okBow2 = combat1.skillSystem.execute(p1, bladeDef, p1, 2500);
  assert.equal(okBow2, false, 'Still rejected');
  assert.equal(combat1.floatedTexts.length, 1, 'Warning was throttled (no duplicate float within 1s)');

  // Hybrid skill fires with either weapon (bow or dagger)
  p1.progression.unlockClass('scout');
  p1.progression.setClassLevel('scout', 5);
  p1.learnSkill('quickshot');
  const quickshotDef = dataLoader.getSkill('quickshot')!;

  p1.equippedWeapon = bowWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, quickshotDef), true, 'Quickshot usable with bow');
  p1.equippedWeapon = daggerWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, quickshotDef), true, 'Quickshot usable with daggers');

  // Magic cross-school exception: Fire spell fires with ice magic weapon
  p1.progression.unlockClass('ember_adept');
  p1.progression.setClassLevel('ember_adept', 10);
  p1.learnSkill('firebolt');
  const flameDef = dataLoader.getSkill('firebolt')!;

  p1.equippedWeapon = iceMagicWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), true, 'Fire spell fires with ice magic weapon (cross-school magic exception)');

  // Elemental staves are spell CONDUITS (DataLoader.getSpellForConduit): the crafted Fire Staff casts Fire Magic,
  // and the *_magic spell weapons cannot be crafted, so staves are how players cast. They count as magic.
  p1.equippedWeapon = fireStaffWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), true, 'Fire spell fires with the Fire Staff conduit');
  p1.equippedWeapon = dataLoader.getWeapon('ice_staff')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), true, 'Fire spell fires with an Ice Staff conduit (cross-school)');
  p1.equippedWeapon = dataLoader.getWeapon('healing_staff')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), true, 'Healing Staff is a conduit too (cross-school)');
  // A plain Staff / Quarterstaff has no spell, so it is NOT a magic weapon
  p1.equippedWeapon = dataLoader.getWeapon('staff')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), false, 'Plain Staff (no conduit spell) cannot cast fire spells');
  p1.equippedWeapon = dataLoader.getWeapon('katana')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, flameDef), false, 'Katana cannot cast fire spells');

  // Runeblade carves arcane magic into blades: extraSkillWeapons adds the blades to its arcane chain
  const runeSet = SkillSystem.getSkillWeaponSet('rune_slash');
  assert.ok(runeSet.has('arcane_magic') && runeSet.has('longswords') && runeSet.has('katana'), 'Runeblade set = arcane + blades');
  p1.progression.setClassLevel('runeblade', 10);
  p1.learnSkill('rune_slash');
  p1.equippedWeapon = dataLoader.getWeapon('longsword_1h')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, dataLoader.getSkill('rune_slash')!), true, 'Rune Slash fires with a longsword');
  p1.equippedWeapon = dataLoader.getWeapon('bows')!;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, dataLoader.getSkill('rune_slash')!), false, 'Rune Slash fails with a bow');
  const spellswordSkill = dataLoader.getSkills().find((sk: any) => sk.requirements?.some((r: any) => r.target === 'spellsword'))!;
  assert.ok(!SkillSystem.getSkillWeaponSet(spellswordSkill.id).has('katana'), 'extraSkillWeapons only affects the class that declares it');

  // Weaponmaster skill fires with katana or bow
  p1.progression.unlockClass('weaponmaster');
  p1.progression.setClassLevel('weaponmaster', 5);
  p1.learnSkill('adaptive_strike');
  const wmSkillDef = dataLoader.getSkill('adaptive_strike')!;
  p1.equippedWeapon = katanaWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, wmSkillDef), true, 'Weaponmaster skill fires with katana');
  p1.equippedWeapon = bowWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, wmSkillDef), true, 'Weaponmaster skill fires with bow');

  // Riposte master skill fails with bow
  p1.progression.unlockClass('riposte_master');
  p1.progression.setClassLevel('riposte_master', 5);
  p1.learnSkill('feint_cut');
  const rmSkillDef = dataLoader.getSkill('feint_cut')!;
  p1.equippedWeapon = bowWpn;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, rmSkillDef), false, 'Riposte Master skill fails with bow');

  // Brawler bare-handed: counts fist when equippedWeapon is empty/fist
  p1.progression.unlockClass('brawler');
  p1.progression.setClassLevel('brawler', 5);
  p1.learnSkill('normal_punch');
  const punchDef = dataLoader.getSkill('normal_punch')!;
  (p1 as any).equippedWeapon = null;
  assert.equal(SkillSystem.canUseSkillWithCurrentWeapons(p1, punchDef), true, 'Brawler skill works bare-handed (null weapon counts as fist)');

  console.log('✔ Test 2 Passed: Katana, hybrid, cross-school magic, fire/ice/healing staff conduits, plain staff rejected, and bare-handed brawler verified.\n');

  // --------------------------------------------------------------------------
  // TEST 3: AI SELECTION & CONTEXT PASS INTEGRITY
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: AI never queues unusable skills; player order ranks within context passes ---');
  const leader = createTestPlayer('Leader', 'short_swords');
  const comp = createTestPlayer('Companion', 'bows');
  const combat3 = createMockCombatSystem([leader, comp]);
  comp.scene.combatSystem = combat3;

  // Companion knows blade_strike (katana only) and quickshot (bows)
  comp.progression.unlockClass('swordsman');
  comp.progression.setClassLevel('swordsman', 5);
  comp.learnSkill('blade_strike');
  comp.equipSkill('blade_strike', 0); // Slot 1: Katana skill (unusable with bow)

  comp.progression.unlockClass('scout');
  comp.progression.setClassLevel('scout', 5);
  comp.learnSkill('quickshot');
  comp.equipSkill('quickshot', 1); // Slot 2: Bow skill (usable)

  const mockEnemy: any = {
    id: 'e1',
    state: 'alive',
    x: 10 * 32,
    y: 10 * 32,
    hp: 100,
    maxHp: 100,
    tileSize: 32,
    hasStatusEffect: () => false
  };

  // AI selection for rotation: blade_strike is skipped because unusable with bow! quickshot is selected
  const aiPick1 = combat3.skillSystem.selectSkillForCompanion(comp, 'rotation', 1000, mockEnemy, 2);
  assert.ok(aiPick1, 'AI selected a skill');
  assert.equal(aiPick1.skillDef.id, 'quickshot', 'AI selected quickshot, completely skipping unusable blade_strike');

  // Support pass vs Rotation pass order test:
  // Companion has rotation attack in Slot 1 and mend in Slot 5
  comp.equippedWeapon = iceMagicWpn; // Equipped with magic weapon to cast healing magic
  comp.progression.unlockClass('medic');
  comp.progression.setClassLevel('medic', 5);
  comp.learnSkill('mend');

  // Equipping: Slot 0 = quickshot (rotation), Slot 1 = mend (support)
  comp.equippedSkillIds = ['quickshot', 'mend'];
  comp.useCustomSkillOrder = true; // Player custom order enabled

  // Case 3a: Leader is at full HP -> support pass finds nobody to heal
  leader.hp = 100;
  leader.maxHp = 100;
  const supportPickFull = combat3.skillSystem.selectSkillForCompanion(comp, 'support', 2000, mockEnemy, 2);
  assert.equal(supportPickFull, null, 'Heal waits for hurt ally (full HP ally gets no heal)');

  // Case 3b: Leader is hurt (30/100 HP, <= 70% threshold) -> support pass selects mend!
  leader.hp = 30;
  const supportPickHurt = combat3.skillSystem.selectSkillForCompanion(comp, 'support', 3000, mockEnemy, 2);
  assert.ok(supportPickHurt, 'Support pass selected candidate');
  assert.equal(supportPickHurt.skillDef.id, 'mend', 'Support pass picks heal for hurt ally despite being lower slot than attack');

  // Case 3c: Two ready rotation attacks: Slot 0 vs Slot 1
  comp.equippedWeapon = bowWpn;
  comp.progression.setClassLevel('scout', 30);
  comp.learnSkill('quickshot');
  comp.learnSkill('trap_snare');

  // quickshot (ai.priority = 35), trap_snare (ai.priority = 40)
  comp.equippedSkillIds = ['quickshot', 'trap_snare'];

  // When useCustomSkillOrder is false: trap_snare (priority 40) wins over quickshot (priority 35)
  comp.useCustomSkillOrder = false;
  const pickDesigner = combat3.skillSystem.selectSkillForCompanion(comp, 'rotation', 4000, mockEnemy, 1);
  assert.equal(pickDesigner?.skillDef.id, 'trap_snare', 'Designer priority: trap_snare (priority 40) fires first');

  // When useCustomSkillOrder is true: quickshot (Slot 0) wins over trap_snare (Slot 1)
  comp.useCustomSkillOrder = true;
  const pickPlayerOrder = combat3.skillSystem.selectSkillForCompanion(comp, 'rotation', 5000, mockEnemy, 1);
  assert.equal(pickPlayerOrder?.skillDef.id, 'quickshot', 'Player priority: Slot 0 (quickshot) fires before Slot 1 (trap_snare) despite lower ai.priority');

  console.log('✔ Test 3 Passed: Unusable skills never queued, heal waits for hurt ally, and custom slot priority verified within AI pass.\n');

  // --------------------------------------------------------------------------
  // TEST 4: PRIORITY REORDERING & SNAPSHOT INTEGRITY
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: Loadout reordering, arrows, reset button, and snapshot save/load ---');
  const p4 = createTestPlayer('ReorderHero', 'katana');
  p4.progression.isSkillUnlocked = () => true;
  p4.knownSkillIds = ['skill_1', 'skill_2', 'skill_3', 'skill_4', 'skill_5'];
  p4.equippedSkillIds = ['skill_1', 'skill_2', 'skill_3'];
  assert.equal(p4.useCustomSkillOrder, false, 'Default useCustomSkillOrder is false');

  // Moving skill_3 to slot 0 sets useCustomSkillOrder to true
  const moved = p4.equipSkill('skill_3', 0);
  assert.equal(moved, true, 'equipSkill moved skill_3 to slot 0');
  assert.deepEqual(p4.equippedSkillIds, ['skill_3', 'skill_1', 'skill_2'], 'Slots reordered correctly');
  assert.equal(p4.useCustomSkillOrder, true, 'useCustomSkillOrder set to true on reorder');

  // Reset restores designer priority order and sets flag to false
  // Setup designer priorities: skill_1: 90, skill_2: 50, skill_3: 10
  const s1Def = dataLoader.getSkill('skill_1') || { id: 'skill_1', name: 'Skill 1', requirements: [], ai: { priority: 90 } };
  const s2Def = dataLoader.getSkill('skill_2') || { id: 'skill_2', name: 'Skill 2', requirements: [], ai: { priority: 50 } };
  const s3Def = dataLoader.getSkill('skill_3') || { id: 'skill_3', name: 'Skill 3', requirements: [], ai: { priority: 10 } };
  (dataLoader as any).skillsData = (dataLoader as any).skillsData || { skills: [] };
  (dataLoader as any).skillsData.skills.push(s1Def, s2Def, s3Def);

  p4.resetSkillOrderToDefault();
  assert.equal(p4.useCustomSkillOrder, false, 'useCustomSkillOrder is false after reset');
  assert.deepEqual(p4.equippedSkillIds, ['skill_1', 'skill_2', 'skill_3'], 'Reset restored designer priority order');

  // Snapshot save and restore
  p4.equipSkill('skill_2', 0); // Reorder again: ['skill_2', 'skill_1', 'skill_3']
  assert.equal(p4.useCustomSkillOrder, true, 'Custom order flag true');
  const snap = p4.getSnapshot(1000);
  assert.equal(snap.useCustomSkillOrder, true, 'Snapshot contains useCustomSkillOrder: true');
  assert.deepEqual(snap.equippedSkillIds, ['skill_2', 'skill_1', 'skill_3'], 'Snapshot contains reordered skills');

  const p4Restored = createTestPlayer('ReorderHeroCopy', 'katana');
  p4Restored.restoreFromSnapshot(snap, 1000);
  assert.equal(p4Restored.useCustomSkillOrder, true, 'Restored player retains useCustomSkillOrder: true');
  assert.deepEqual(p4Restored.equippedSkillIds, ['skill_2', 'skill_1', 'skill_3'], 'Restored player retains custom slot order');

  console.log('✔ Test 4 Passed: Reorder sets flag, reset restores designer priority, and state persists across snapshot save/load.\n');

  // --------------------------------------------------------------------------
  // TEST 5: UI OUTPOST VS DUNGEON CONTROLS & WEAPON STATE
  // --------------------------------------------------------------------------
  console.log('--- TEST 5: Loadout UI reorder controls, dungeon lock, and greyed state ---');
  const hud = new HUD();
  const uiHero = createTestPlayer('UIHero', 'katana');
  uiHero.progression.isSkillUnlocked = () => true;
  uiHero.knownSkillIds = ['blade_strike', 'quickshot'];
  uiHero.equippedSkillIds = ['blade_strike', 'quickshot'];
  uiHero.setAutocast('quickshot', true);

  // 5a. Outpost Mode: reorder arrow buttons and reset button are rendered
  hud.setLocation('Outpost Camp', true); // isOutpost = true
  hud.update(uiHero, uiHero.progression, 1000, [uiHero]);
  (hud as any).renderLoadoutModal(uiHero, uiHero.progression);

  const resetBtn = getOrCreateElement('reset-skill-order-btn');
  assert.equal(resetBtn.style.display, 'inline-block', 'Reset button visible in Outpost');

  const equipSlotsContainer = getOrCreateElement('equip-slots-container');
  const slot0 = equipSlotsContainer.children[0];
  const slot1 = equipSlotsContainer.children[1];
  assert.equal(slot0.draggable, true, 'Slot 0 is draggable in Outpost');

  // Slot 1 (quickshot) needs Bows/Daggers, but UIHero has Katana equipped -> greyed & warning!
  assert.ok(slot1.classList.contains('unusable-weapon'), 'Slot 1 marked unusable-weapon');
  assert.ok(slot1.title.includes('Needs'), 'Slot 1 tooltip contains "Needs"');
  const needsWarning = slot1.querySelector('.slot-needs-weapon');
  assert.ok(needsWarning, 'Rendered "Needs: <Weapon>" warning badge inside unusable slot');

  // Reorder buttons rendered in Outpost
  const upBtn1 = slot1.querySelector('.slot-arrow-up');
  const downBtn0 = slot0.querySelector('.slot-arrow-down');
  assert.ok(upBtn1, 'Up arrow rendered on slot 1 in Outpost');
  assert.ok(downBtn0, 'Down arrow rendered on slot 0 in Outpost');

  // Click Up arrow on slot 1 (moves quickshot to slot 0)
  upBtn1.click();
  assert.deepEqual(uiHero.equippedSkillIds, ['quickshot', 'blade_strike'], 'Clicking up arrow reordered skills');
  assert.equal(uiHero.useCustomSkillOrder, true, 'Arrow click set useCustomSkillOrder = true');

  // Click Reset button
  resetBtn.click();
  assert.equal(uiHero.useCustomSkillOrder, false, 'Clicking Reset button set useCustomSkillOrder = false');

  // 5b. Dungeon Mode: Reorder controls and Reset button must NOT exist
  hud.setLocation('Flooded Caverns Floor 1', false); // isOutpost = false
  hud.update(uiHero, uiHero.progression, 2000, [uiHero]);
  (hud as any).renderLoadoutModal(uiHero, uiHero.progression);

  assert.equal(resetBtn.style.display, 'none', 'Reset button hidden in dungeon mode');
  const dSlot0 = equipSlotsContainer.children[0];
  assert.notEqual(dSlot0.draggable, true, 'Slots are NOT draggable in dungeon mode');
  const dUpBtn = dSlot0.querySelector('.slot-arrow-up');
  assert.equal(dUpBtn, null, 'Arrow reorder buttons are NOT rendered in dungeon mode');

  // 5c. In-Dungeon HUD: Unusable skill shows [Needs: ...] and disables button without clearing autocastMap
  const hudSkillsList = getOrCreateElement('hud-skills-list');
  // quickshot (needs bow/dagger) with Katana equipped
  uiHero.equippedSkillIds = ['quickshot'];
  uiHero.setAutocast('quickshot', true);
  hud.update(uiHero, uiHero.progression, 3000, [uiHero]);

  const statusBadge = hudSkillsList.querySelector('[data-status-skill="quickshot"]');
  assert.ok(statusBadge, 'Found status badge for quickshot');
  assert.ok(statusBadge.innerText.includes('Needs'), 'Status text shows [Needs: ...]');

  const autocastBtn = hudSkillsList.querySelector('[data-hud-skill="quickshot"]');
  assert.ok(autocastBtn, 'Found autocast toggle button');
  assert.equal(autocastBtn.disabled, true, 'Autocast toggle button disabled when weapon unusable');
  assert.equal(uiHero.isAutocastEnabled('quickshot'), true, 'Underlying autocastMap is STILL TRUE (not turned off!)');

  // Clicking disabled button in dungeon does NOT toggle autocastMap
  autocastBtn.click();
  assert.equal(uiHero.isAutocastEnabled('quickshot'), true, 'Autocast remains ON despite clicks while disabled');

  // Re-equip Bow: button re-enables and skill is ready again
  uiHero.equippedWeapon = bowWpn;
  hud.update(uiHero, uiHero.progression, 4000, [uiHero]);
  assert.equal(autocastBtn.disabled, false, 'Button re-enabled when correct weapon equipped');
  assert.ok(statusBadge.innerText.includes('Ready'), 'Skill is Ready again');
  assert.equal(uiHero.isAutocastEnabled('quickshot'), true, 'Autocast state preserved');

  console.log('✔ Test 5 Passed: Outpost vs Dungeon UI rules, arrow controls, Reset button, and preserved autocast verified.\n');

  console.log('========================================================================');
  console.log('🎉 ALL MILESTONE 10 TESTS PASSED PERFECTLY!');
  console.log('========================================================================');
}

runSuite().catch((err) => {
  console.error('❌ Milestone 10 Test Failed:', err);
  process.exit(1);
});
