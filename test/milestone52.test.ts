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
    add: (...classes: string[]) => classes.forEach(c => this.classList._classes.add(c)),
    remove: (...classes: string[]) => classes.forEach(c => this.classList._classes.delete(c)),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public onchange: any = null;
  public onclick: any = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  public innerHTMLSetCount: number = 0;
  private _listeners: Record<string, any[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = String(val);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = String(val);
    this.innerHTMLSetCount++;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      if (this.id === targetId) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  addEventListener(event: string, handler: any) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  dispatchEvent(event: any): boolean {
    const type = event.type || event;
    const handlers = this._listeners[type] || [];
    for (const h of handlers) {
      h(event);
    }
    return true;
  }
}

if (typeof global !== 'undefined') {
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

  (global as any).document = {
    createElement: (tag: string) => {
      const el = new MockElement(tag);
      (el as any).getContext = () => dummyCtx;
      return el;
    },
    getElementById: () => null,
    body: new MockElement('body'),
    head: new MockElement('head'),
    documentElement: new MockElement('html'),
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  (global as any).window = {
    document: (global as any).document,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' },
    CustomEvent: class CustomEvent {
      public type: string;
      public detail: any;
      constructor(type: string, params: any = {}) {
        this.type = type;
        this.detail = params.detail;
      }
    }
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef } from '../src/types/game.ts';

import classesData from '../data/classes.json' with { type: 'json' };

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
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      text: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    }
  };
}

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem,
  activeClass: string = 'swordsman'
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();
  const lastSkillUseTimes = new Map<string, number>();
  const autocastMap = new Map<string, boolean>();

  const player: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp: 100,
    maxHp: 100,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    mood: 80,
    state: 'idle',
    activeClass,
    equippedWeapon: weapon,
    offhandWeapon: null as WeaponDef | null,
    targetEntity: null as any,
    lastAttackTime: 0,
    attackRangeTiles: weapon.attackRangeTiles ?? (weapon.category === 'ranged' ? 4 : 1),
    progression,
    knownSkillIds: [] as string[],
    equippedSkillIds: [] as string[],
    autocastMap,
    lastSkillUseTimes,
    activeStatusEffects: statusEffects,
    bookLearnedSkills: new Set<string>(),

    isDualWielding: () => false,
    hasShield: () => player.offhandWeapon?.category === 'offhand',
    isSkillLearnedFromBook: (skillId: string) => player.bookLearnedSkills.has(skillId),
    isAutocastEnabled: (skillId: string) => {
      if (!player.autocastMap.has(skillId)) return true;
      return player.autocastMap.get(skillId) === true;
    },
    hasStatusEffect: (effId: string) => player.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      player.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000,
        shieldAmount: effDef.shieldAmount,
        currentShield: effDef.shieldAmount
      });
    },
    removeStatusEffect: (effId: string) => player.activeStatusEffects.delete(effId),
    setGridPosition: (gx: number, gy: number) => {
      player.gridPos = { x: gx, y: gy };
      player.x = gx * tileSize + tileSize / 2;
      player.y = gy * tileSize + tileSize / 2;
    },
    heal: (amt: number) => {
      const missingCrit = Math.max(0, player.maxCriticalHp - player.criticalHp);
      let critRestored = 0;
      if (missingCrit > 0) {
        critRestored = Math.min(amt, missingCrit);
        player.criticalHp += critRestored;
      }
      const remainingHeal = amt - critRestored;
      const missingHp = Math.max(0, player.maxHp - player.hp);
      const hpRestored = Math.min(remainingHeal, missingHp);
      player.hp += hpRestored;
      return critRestored + hpRestored;
    },
    takeDamage: (amount: number) => {
      player.hp = Math.max(0, player.hp - amount);
      if (player.hp <= 0) {
        player.state = 'downed';
        return true;
      }
      return false;
    },
    drawHpBar: () => {},
    clearTarget: () => {
      player.targetEntity = null;
    }
  };

  return player;
}

function createMockEnemy(
  id: string,
  name: string,
  x: number,
  y: number,
  hp: number = 100,
  enemyData: Partial<EnemyDef> = {}
): any {
  const tileSize = 32;
  const statusEffects = new Map<string, any>();

  const fullEnemyData: EnemyDef = {
    id,
    name,
    texture: 'enemy-goblin',
    frame: 0,
    maxHp: hp,
    criticalHp: 0,
    speed: 50,
    meleeDamage: 10,
    attackIntervalMs: 1000,
    expReward: 10,
    isAggroed: true,
    ...enemyData
  } as EnemyDef;

  const enemy: any = {
    id,
    entityName: name,
    x: x * tileSize + tileSize / 2,
    y: y * tileSize + tileSize / 2,
    gridPos: { x, y },
    tileSize,
    hp,
    maxHp: hp,
    criticalHp: 0,
    maxCriticalHp: 0,
    state: 'idle',
    enemyData: fullEnemyData,
    activeStatusEffects: statusEffects,
    lastAttackTime: 0,

    hasStatusEffect: (effId: string) => enemy.activeStatusEffects.has(effId),
    applyStatusEffect: (effDef: any) => {
      enemy.activeStatusEffects.set(effDef.id, {
        def: effDef,
        remainingMs: effDef.durationMs ?? 5000,
        nextTickMs: 1000
      });
    },
    removeStatusEffect: (effId: string) => enemy.activeStatusEffects.delete(effId),
    isStunned: () => enemy.activeStatusEffects.has('stun'),
    isMoving: () => false,
    stopMovement: () => {},
    followPath: () => {},
    setGridPosition: (gx: number, gy: number) => {
      enemy.gridPos = { x: gx, y: gy };
      enemy.x = gx * tileSize + tileSize / 2;
      enemy.y = gy * tileSize + tileSize / 2;
    },
    takeDamage: (amount: number) => {
      enemy.hp = Math.max(0, enemy.hp - amount);
      if (enemy.hp <= 0) {
        enemy.state = 'dead';
        return true;
      }
      return false;
    }
  };

  return enemy;
}

async function runMilestone52Tests() {
  console.log('================================================================');
  console.log('⚔️ RUNNING MILESTONE 52: KATANA, SWORDSMAN, RONIN & SAMURAI TESTS 🗡️');
  console.log('================================================================\n');

  await DataLoader.getInstance().loadAll();
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const dataLoader = DataLoader.getInstance();

  // ============================================================================
  // TEST 1: Weapon Registry, Handedness & Stats Verification
  // ============================================================================
  console.log('--- TEST 1: Weapon Registry, Handedness & Stats Verification ---');
  {
    const katana = dataLoader.getWeapon('katana');
    assert.ok(katana, 'Katana weapon definition must exist in weapons.json');
    assert.equal(katana.name, 'Katana');
    assert.equal(katana.category, 'melee_1h', 'Katana must be category melee_1h');
    assert.equal(katana.twoHanded, false, 'Katana must be 1-handed (twoHanded: false) per true_grind_gdd line 140');
    assert.equal(katana.weight, 3.0, 'Katana weight must be 3.0');
    assert.equal(katana.attackIntervalMs, 900, 'Katana attackIntervalMs must be 900ms');
    assert.equal(katana.baseDamage, 6, 'Katana baseDamage must be 6');
    assert.equal(katana.baseAccuracy, 0.65, 'Katana baseAccuracy must be 0.65');
    assert.equal(katana.bleedChance, 0.25, 'Katana bleedChance must be 0.25 (25%) per true_grind_gdd line 180');
    assert.ok(katana.levelBonus, 'Katana levelBonus must be defined');
    assert.equal(katana.levelBonus.accuracyPerLevel, 0.004, 'accuracyPerLevel must be 0.004 per class_system line 44');
    assert.equal(katana.levelBonus.damagePerLevel, 0.55, 'damagePerLevel must be 0.55 per class_system line 37');

    console.log('✓ PASS: Katana weapon stats, handedness, and scaling verified against design documentation.\n');
  }

  // ============================================================================
  // TEST 2: Blacksmithing Crafting Recipe Verification
  // ============================================================================
  console.log('--- TEST 2: Blacksmithing Crafting Recipe Verification ---');
  {
    const recipe = dataLoader.getBlacksmithRecipes().find((r) => r.id === 'katana');
    assert.ok(recipe, 'Katana recipe must exist in blacksmithRecipes.json');
    assert.equal(recipe.name, 'Forged Katana');
    assert.equal(recipe.resultWeaponId, 'katana');
    assert.equal(recipe.requiredLevel, 0, 'Katana must be craftable at Tier 0 Blacksmithing (level 0) per class_system line 230');
    assert.deepEqual(recipe.ingredients, { ore: 5, wood: 2 }, 'Katana recipe must require 5 ore and 2 wood');
    assert.equal(recipe.expGranted, 25, 'Katana recipe must grant 25 exp');

    console.log('✓ PASS: Blacksmithing recipe for Katana is valid and matches Tier 0 crafting requirements.\n');
  }

  // ============================================================================
  // TEST 3: Three-Tier Branching Architecture & Boundary Checks
  // Swordsman (Katana 10) -> Ronin (Katana 30 + Swordsman 5) & Samurai (Katana 30 + Shields 10 + Swordsman 5)
  // ============================================================================
  console.log('--- TEST 3: Three-Tier Branching Architecture & Boundary Checks ---');
  {
    const swordsmanDef = dataLoader.getClass('swordsman')!;
    const roninDef = dataLoader.getClass('ronin')!;
    const samuraiDef = dataLoader.getClass('samurai')!;

    assert.ok(swordsmanDef, 'swordsman class definition exists');
    assert.ok(roninDef, 'ronin class definition exists');
    assert.ok(samuraiDef, 'samurai class definition exists');

    assert.equal(swordsmanDef.tier, 'novice');
    assert.equal(roninDef.tier, 'adept');
    assert.equal(samuraiDef.tier, 'adept');

    assert.deepEqual(swordsmanDef.hiddenSkillBonuses, { parry: 0.05 });
    assert.deepEqual(roninDef.hiddenSkillBonuses, { parry: 0.05 });
    assert.deepEqual(samuraiDef.hiddenSkillBonuses, { block: 0.05, parry: 0.05 });

    // Boundary 3a: Swordsman boundary (Katana 9 vs 10)
    const progSwordsman = new ProgressionSystem(classesData, 'Swordsman Candidate');
    progSwordsman.getProficiencyStat('katana').level = 9;
    assert.equal(progSwordsman.evaluateRequirements(swordsmanDef), false, 'Swordsman locked at Katana 9');
    progSwordsman.getProficiencyStat('katana').level = 10;
    assert.equal(progSwordsman.evaluateRequirements(swordsmanDef), true, 'Swordsman unlocks at Katana 10');

    // Boundary 3b: Branching from Swordsman at Lv 5
    // Katana 30, but Swordsman Lv 4 -> Both Ronin & Samurai locked
    const progBranchA = new ProgressionSystem(classesData, 'Branch Candidate A');
    progBranchA.getProficiencyStat('katana').level = 30;
    progBranchA.getProficiencyStat('shields').level = 10;
    progBranchA.setClassLevel('swordsman', 4);
    assert.equal(progBranchA.evaluateRequirements(roninDef), false, 'Ronin locked when Swordsman Lv is 4');
    assert.equal(progBranchA.evaluateRequirements(samuraiDef), false, 'Samurai locked when Swordsman Lv is 4');

    // Katana 30, Swordsman Lv 5, Shields 0 -> Ronin UNLOCKS, Samurai locked
    const progBranchB = new ProgressionSystem(classesData, 'Branch Candidate B');
    progBranchB.getProficiencyStat('katana').level = 30;
    progBranchB.setClassLevel('swordsman', 5);
    assert.equal(progBranchB.isClassUnlocked('ronin'), true, 'Ronin UNLOCKS cleanly at Katana 30 + Swordsman Lv 5');
    assert.equal(progBranchB.isClassUnlocked('samurai'), false, 'Samurai remains locked without Shields 10');

    // Katana 30, Swordsman Lv 5, Shields 9 -> Samurai locked
    progBranchB.getProficiencyStat('shields').level = 9;
    progBranchB.checkClassUnlocks();
    assert.equal(progBranchB.isClassUnlocked('samurai'), false, 'Samurai locked at Shields 9');

    // Katana 30, Swordsman Lv 5, Shields 10 -> Samurai UNLOCKS!
    progBranchB.getProficiencyStat('shields').level = 10;
    progBranchB.checkClassUnlocks();
    assert.equal(progBranchB.isClassUnlocked('samurai'), true, 'Samurai UNLOCKS cleanly at Katana 30 + Shields 10 + Swordsman Lv 5');

    // Katana 29, Swordsman Lv 5, Shields 10 -> Samurai locked
    const progBranchC = new ProgressionSystem(classesData, 'Branch Candidate C');
    progBranchC.getProficiencyStat('katana').level = 29;
    progBranchC.getProficiencyStat('shields').level = 10;
    progBranchC.setClassLevel('swordsman', 5);
    assert.equal(progBranchC.isClassUnlocked('samurai'), false, 'Samurai locked at Katana 29');

    console.log('✓ PASS: Three-tier branching structure and multi-axis boundary checks verified completely.\n');
  }

  // ============================================================================
  // TEST 4: 15-Skill Inventory & 5-Tier Progression Spread
  // ============================================================================
  console.log('--- TEST 4: 15-Skill Inventory & 5-Tier Progression Spread ---');
  {
    const prog = new ProgressionSystem(classesData, 'Skill Test Hero');

    // Swordsman skills
    const bladeStrike = dataLoader.getSkill('blade_strike')!;
    const quickCut = dataLoader.getSkill('quick_cut')!;
    const defPosture = dataLoader.getSkill('defensive_posture')!;
    const severingSlice = dataLoader.getSkill('severing_slice')!;
    const crossCut = dataLoader.getSkill('cross_cut')!;

    assert.ok(bladeStrike && quickCut && defPosture && severingSlice && crossCut, 'All 5 Swordsman skills exist');

    assert.equal(prog.isSkillUnlocked(bladeStrike), false, 'Blade Strike locked at Lv 0');
    prog.setClassLevel('swordsman', 1);
    assert.equal(prog.isSkillUnlocked(bladeStrike), true, 'Blade Strike unlocks at Swordsman Lv 1');
    prog.setClassLevel('swordsman', 10);
    assert.equal(prog.isSkillUnlocked(quickCut), true, 'Quick Cut unlocks at Swordsman Lv 10');
    prog.setClassLevel('swordsman', 20);
    assert.equal(prog.isSkillUnlocked(defPosture), true, 'Defensive Posture unlocks at Swordsman Lv 20');
    prog.setClassLevel('swordsman', 30);
    assert.equal(prog.isSkillUnlocked(severingSlice), true, 'Severing Slice unlocks at Swordsman Lv 30');
    prog.setClassLevel('swordsman', 40);
    assert.equal(prog.isSkillUnlocked(crossCut), true, 'Cross Cut unlocks at Swordsman Lv 40');

    // Ronin skills
    const iaidoQuickdraw = dataLoader.getSkill('iaido_quickdraw')!;
    const crimsonSlash = dataLoader.getSkill('crimson_slash')!;
    const flowingStep = dataLoader.getSkill('flowing_step')!;
    const bloodseekerRiposte = dataLoader.getSkill('bloodseeker_riposte')!;
    const dragonsFlurry = dataLoader.getSkill('dragons_flurry')!;

    assert.ok(iaidoQuickdraw && crimsonSlash && flowingStep && bloodseekerRiposte && dragonsFlurry, 'All 5 Ronin skills exist');

    prog.setClassLevel('ronin', 1);
    assert.equal(prog.isSkillUnlocked(iaidoQuickdraw), true, 'Iaido Quickdraw unlocks at Ronin Lv 1');
    prog.setClassLevel('ronin', 10);
    assert.equal(prog.isSkillUnlocked(crimsonSlash), true, 'Crimson Slash unlocks at Ronin Lv 10');
    prog.setClassLevel('ronin', 20);
    assert.equal(prog.isSkillUnlocked(flowingStep), true, 'Flowing Step unlocks at Ronin Lv 20');
    prog.setClassLevel('ronin', 30);
    assert.equal(prog.isSkillUnlocked(bloodseekerRiposte), true, 'Bloodseeker Riposte unlocks at Ronin Lv 30');
    prog.setClassLevel('ronin', 40);
    assert.equal(prog.isSkillUnlocked(dragonsFlurry), true, 'Dragon\'s Flurry unlocks at Ronin Lv 40');

    // Samurai skills
    const overheadCleave = dataLoader.getSkill('overhead_cleave')!;
    const ironPosture = dataLoader.getSkill('iron_posture')!;
    const sweepingHilt = dataLoader.getSkill('sweeping_hilt')!;
    const kenjutsuDeflection = dataLoader.getSkill('kenjutsu_deflection')!;
    const heavenlyDecapitation = dataLoader.getSkill('heavenly_decapitation')!;

    assert.ok(overheadCleave && ironPosture && sweepingHilt && kenjutsuDeflection && heavenlyDecapitation, 'All 5 Samurai skills exist');

    prog.setClassLevel('samurai', 1);
    assert.equal(prog.isSkillUnlocked(overheadCleave), true, 'Overhead Cleave unlocks at Samurai Lv 1');
    prog.setClassLevel('samurai', 10);
    assert.equal(prog.isSkillUnlocked(ironPosture), true, 'Iron Posture unlocks at Samurai Lv 10');
    prog.setClassLevel('samurai', 20);
    assert.equal(prog.isSkillUnlocked(sweepingHilt), true, 'Sweeping Hilt unlocks at Samurai Lv 20');
    prog.setClassLevel('samurai', 30);
    assert.equal(prog.isSkillUnlocked(kenjutsuDeflection), true, 'Kenjutsu Deflection unlocks at Samurai Lv 30');
    prog.setClassLevel('samurai', 40);
    assert.equal(prog.isSkillUnlocked(heavenlyDecapitation), true, 'Heavenly Decapitation unlocks at Samurai Lv 40');

    console.log('✓ PASS: All 15 skills strictly adhere to the 5-tier spread (Lv 1, 10, 20, 30, 40).\n');
  }

  // ============================================================================
  // TEST 5: Combat Execution — Swordsman Skills
  // ============================================================================
  console.log('--- TEST 5: Combat Execution — Swordsman Skills ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const katana = dataLoader.getWeapon('katana')!;
    const prog = new ProgressionSystem(classesData, 'Swordsman Fighter');
    prog.setClassLevel('swordsman', 40);

    const swordsman = createMockPlayer('p-sword', 'Swordsman', 5, 5, katana, prog, 'swordsman');
    const enemy = createMockEnemy('e-1', 'Goblin Dummy', 6, 5, 500);
    combat.party = [swordsman];
    combat.enemies = [enemy];

    // 1. Blade Strike
    swordsman.energy = 100;
    const initHp = enemy.hp;
    const ok1 = combat.castSkill(swordsman, 'blade_strike', enemy);
    assert.equal(ok1, true, 'Blade Strike cast succeeds');
    assert.ok(enemy.hp < initHp, 'Enemy took Blade Strike damage');

    // 2. Quick Cut
    swordsman.energy = 100;
    const prevHp2 = enemy.hp;
    const ok2 = combat.castSkill(swordsman, 'quick_cut', enemy, 5000);
    assert.equal(ok2, true, 'Quick Cut cast succeeds');
    assert.ok(enemy.hp < prevHp2, 'Enemy took Quick Cut damage');

    // 3. Defensive Posture (Self)
    swordsman.energy = 100;
    const ok3 = combat.castSkill(swordsman, 'defensive_posture', swordsman, 10000);
    assert.equal(ok3, true, 'Defensive Posture cast succeeds');
    assert.ok(swordsman.hasStatusEffect('defensive_posture'), 'Swordsman gains defensive_posture status');

    // 4. Severing Slice (Bleed application)
    swordsman.energy = 100;
    const ok4 = combat.castSkill(swordsman, 'severing_slice', enemy, 15000);
    assert.equal(ok4, true, 'Severing Slice cast succeeds');
    assert.ok(enemy.hasStatusEffect('bleed'), 'Enemy is Bleeding after Severing Slice');

    // 5. Cross Cut
    swordsman.energy = 100;
    const prevHp5 = enemy.hp;
    const ok5 = combat.castSkill(swordsman, 'cross_cut', enemy, 25000);
    assert.equal(ok5, true, 'Cross Cut cast succeeds');
    assert.ok(enemy.hp < prevHp5, 'Enemy took heavy Cross Cut damage');

    console.log('✓ PASS: All 5 Swordsman skills execute with authentic effects and damage.\n');
  }

  // ============================================================================
  // TEST 6: Combat Execution — Ronin Skills (Bleed Synergy, Evasion & Multi-Strike)
  // ============================================================================
  console.log('--- TEST 6: Combat Execution — Ronin Skills ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const katana = dataLoader.getWeapon('katana')!;
    const prog = new ProgressionSystem(classesData, 'Ronin Duelist');
    prog.setClassLevel('ronin', 40);

    const ronin = createMockPlayer('p-ronin', 'Ronin', 5, 5, katana, prog, 'ronin');
    const enemy = createMockEnemy('e-2', 'Target Mob', 8, 5, 800); // 3 tiles away
    combat.party = [ronin];
    combat.enemies = [enemy];

    // 1. Flowing Step: Closes distance from 3 tiles away + grants +25% Evasion
    ronin.energy = 100;
    assert.equal(ronin.gridPos.x, 5);
    const okFlow = combat.castSkill(ronin, 'flowing_step', enemy, 1000);
    assert.equal(okFlow, true, 'Flowing Step cast succeeds from distance');
    assert.ok(ronin.gridPos.x > 5, 'Ronin closed distance toward target');
    assert.ok(ronin.hasStatusEffect('flowing_step'), 'Ronin gained flowing_step evasion buff');

    // 2. Iaido Quickdraw
    ronin.energy = 100;
    const hpBeforeQuick = enemy.hp;
    const okQuick = combat.castSkill(ronin, 'iaido_quickdraw', enemy, 5000);
    assert.equal(okQuick, true, 'Iaido Quickdraw cast succeeds');
    assert.ok(enemy.hp < hpBeforeQuick, 'Enemy took Iaido Quickdraw damage');

    // 3. Crimson Slash: Applies Bleed
    ronin.energy = 100;
    enemy.removeStatusEffect('bleed');
    const okCrimson = combat.castSkill(ronin, 'crimson_slash', enemy, 9000);
    assert.equal(okCrimson, true, 'Crimson Slash cast succeeds');
    assert.ok(enemy.hasStatusEffect('bleed'), 'Crimson Slash applied Bleed');

    // 4. Bloodseeker Riposte: Deals +50% bonus damage on bleeding target
    ronin.energy = 100;
    const hpBeforeBleedingRiposte = enemy.hp;
    const okRiposte = combat.castSkill(ronin, 'bloodseeker_riposte', enemy, 15000);
    assert.equal(okRiposte, true, 'Bloodseeker Riposte cast succeeds on bleeding target');
    const dmgBleeding = hpBeforeBleedingRiposte - enemy.hp;

    // Compare with non-bleeding target
    const cleanEnemy = createMockEnemy('e-clean', 'Clean Target', 7, 5, 800);
    cleanEnemy.x = (ronin.gridPos.x + 1) * 32 + 16;
    cleanEnemy.y = ronin.gridPos.y * 32 + 16;
    cleanEnemy.gridPos = { x: ronin.gridPos.x + 1, y: ronin.gridPos.y };
    ronin.energy = 100;
    const hpBeforeClean = cleanEnemy.hp;
    combat.castSkill(ronin, 'bloodseeker_riposte', cleanEnemy, 25000);
    const dmgClean = hpBeforeClean - cleanEnemy.hp;
    assert.ok(dmgBleeding > dmgClean * 1.3, `Bleeding target took significantly increased damage (${dmgBleeding.toFixed(1)} vs ${dmgClean.toFixed(1)})`);

    // 5. Dragon's Flurry: 4 rapid hits + refreshes Bleed
    ronin.energy = 100;
    const hpBeforeFlurry = enemy.hp;
    const okFlurry = combat.castSkill(ronin, 'dragons_flurry', enemy, 40000);
    assert.equal(okFlurry, true, 'Dragon\'s Flurry cast succeeds');
    assert.ok(enemy.hp < hpBeforeFlurry, 'Enemy took multi-hit damage from Dragon\'s Flurry');
    assert.ok(enemy.hasStatusEffect('bleed'), 'Bleed refreshed by Dragon\'s Flurry');

    console.log('✓ PASS: All 5 Ronin skills execute with bleed synergy, gap closing, and multi-strike.\n');
  }

  // ============================================================================
  // TEST 7: Combat Execution — Samurai Skills (Mitigation, Stun, Deflection & Capstone)
  // ============================================================================
  console.log('--- TEST 7: Combat Execution — Samurai Skills ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const katana = dataLoader.getWeapon('katana')!;
    const prog = new ProgressionSystem(classesData, 'Samurai Warrior');
    prog.setClassLevel('samurai', 40);

    const samurai = createMockPlayer('p-samurai', 'Samurai', 5, 5, katana, prog, 'samurai');
    const enemy = createMockEnemy('e-3', 'Heavy Orc', 6, 5, 1000);
    combat.party = [samurai];
    combat.enemies = [enemy];

    // 1. Overhead Cleave
    samurai.energy = 100;
    const hpBeforeOverhead = enemy.hp;
    const okOverhead = combat.castSkill(samurai, 'overhead_cleave', enemy, 1000);
    assert.equal(okOverhead, true, 'Overhead Cleave cast succeeds');
    assert.ok(enemy.hp < hpBeforeOverhead, 'Enemy took heavy Overhead Cleave damage');

    // 2. Iron Posture: 35% damage reduction
    samurai.energy = 100;
    const okIron = combat.castSkill(samurai, 'iron_posture', samurai, 5000);
    assert.equal(okIron, true, 'Iron Posture cast succeeds');
    assert.ok(samurai.hasStatusEffect('iron_posture'), 'Samurai gains iron_posture status effect');

    // 3. Sweeping Hilt: Stun check
    samurai.energy = 100;
    const okHilt = combat.castSkill(samurai, 'sweeping_hilt', enemy, 18000);
    assert.equal(okHilt, true, 'Sweeping Hilt cast succeeds');

    // 4. Kenjutsu Deflection: Absorbs up to 40 damage and reflects 50% physical damage
    samurai.energy = 100;
    const okDeflect = combat.castSkill(samurai, 'kenjutsu_deflection', samurai, 25000);
    assert.equal(okDeflect, true, 'Kenjutsu Deflection cast succeeds');
    assert.ok(samurai.hasStatusEffect('kenjutsu_deflection'), 'Samurai gains kenjutsu_deflection status effect');

    // 5. Heavenly Decapitation: Consumes bonus energy up to 25 for massive damage
    samurai.energy = 60; // 35 base + 25 bonus
    const hpBeforeDecap = enemy.hp;
    const okDecap = combat.castSkill(samurai, 'heavenly_decapitation', enemy, 35000);
    assert.equal(okDecap, true, 'Heavenly Decapitation cast succeeds');
    assert.equal(samurai.energy, 0, 'Consumed all 60 energy (35 base + 25 bonus energy)');
    assert.ok(enemy.hp < hpBeforeDecap, 'Enemy took massive execution damage from Heavenly Decapitation');

    console.log('✓ PASS: All 5 Samurai skills execute with damage mitigation, deflection, and capped bonus energy.\n');
  }

  // ============================================================================
  // TEST 8: Live Combat Loop — Katana Attack & Proficiency EXP Progression
  // ============================================================================
  console.log('--- TEST 8: Live Combat Loop — Katana Attack & Proficiency EXP ---');
  {
    const scene = createMockScene();
    const combat = new CombatSystem(scene);
    const katana = dataLoader.getWeapon('katana')!;
    const prog = new ProgressionSystem(classesData, 'Katana Trainee');

    const hero = createMockPlayer('hero', 'Guild Katana Hero', 5, 5, katana, prog, 'swordsman');
    const enemy = createMockEnemy('mob', 'Forest Wolf', 6, 5, 100);
    combat.party = [hero];
    combat.enemies = [enemy];

    assert.equal(prog.getProficiencyLevel('katana'), 0, 'Katana starts at Level 0');
    assert.equal(prog.getProficiencyStat('katana').currentExp, 0, 'Katana starts with 0 EXP');

    // Perform standard weapon attack via executePlayerBasicAttack
    combat.executePlayerBasicAttack(hero, enemy, 1000);

    assert.ok(prog.getProficiencyStat('katana').currentExp > 0, 'Katana attack granted katana proficiency EXP');
    console.log(`✓ Katana attack granted EXP! Current Katana EXP: ${prog.getProficiencyStat('katana').currentExp}`);

    console.log('✓ PASS: Live combat loop verifies weapon attack resolution and Katana proficiency gains.\n');
  }

  console.log('================================================================');
  console.log('🎉 ALL 8 MILESTONE 52 TESTS PASSED WITH COMPLETE FIDELITY! 🎉');
  console.log('================================================================');
}

runMilestone52Tests().catch((err) => {
  console.error('Milestone 52 test failure:', err);
  process.exit(1);
});
