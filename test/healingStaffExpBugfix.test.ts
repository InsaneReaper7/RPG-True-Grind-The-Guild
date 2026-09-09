import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before any Phaser modules are loaded
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
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
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, GridPos, CharacterSnapshot } from '../src/types/game.ts';

async function runBugfixVerification() {
  console.log('================================================================');
  console.log('--- RUNNING HEALING STAFF / FIRE STAFF EXP BUGFIX VERIFICATION ---');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();
  const classesData = dataLoader.getClassesData();

  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { Player } = await import('../src/entities/Player.ts');

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
    const grid: number[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        grid[y][x] = 0;
      }
    }
    const pathfinder = new Pathfinder(grid);
    const mockGraphics = () => {
      const g: any = {};
      g.clear = () => g;
      g.fillStyle = () => g;
      g.fillRect = () => g;
      g.setDepth = () => g;
      g.destroy = () => {};
      g.once = () => g;
      g.on = () => g;
      g.off = () => g;
      g.emit = () => g;
      g.removeFromDisplayList = () => g;
      g.addedToScene = () => g;
      g.parentContainer = null;
      return g;
    };
    const mockSprite = () => {
      const s: any = {};
      s.setVisible = () => s;
      s.setAngle = () => s;
      s.setAlpha = () => s;
      s.setDepth = () => s;
      s.destroy = () => {};
      s.once = () => s;
      s.on = () => s;
      s.off = () => s;
      s.emit = () => s;
      s.removeFromDisplayList = () => s;
      s.addedToScene = () => s;
      s.parentContainer = null;
      return s;
    };
    return {
      tileSize: 32,
      gridWidth,
      gridHeight,
      pathfinder,
      sound: { play: () => {} },
      time: { now: 0 },
      sys: {
        queueDepthSort: () => {}
      },
      add: {
        existing: () => {},
        graphics: mockGraphics,
        sprite: mockSprite,
        line: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setLineWidth = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        circle: () => {
          const obj: any = {};
          obj.setStrokeStyle = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        text: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        }
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) {
            config.onComplete();
          }
        }
      }
    };
  }

  function createMockUnit(
    id: string,
    name: string,
    gridX: number,
    gridY: number,
    weapon: WeaponDef,
    progression: ProgressionSystem
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 50,
      maxHp: 50,
      criticalHp: 25,
      maxCriticalHp: 25,
      energy: 100,
      maxEnergy: 100,
      mood: 100,
      hunger: 100,
      state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
      equippedWeapon: weapon,
      offhandWeapon: null as WeaponDef | null,
      attackRangeTiles: weapon.attackRangeTiles ?? 1,
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      lastAttackTime: 0,
      lastCombatRepathTimeMs: 0,
      combatRepathIntervalMs: 400,
      lastSkillUseTimes: new Map<string, number>(),
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: new Map<string, boolean>(),
      activeStatusEffects: new Map<string, any>(),
      inCombat: false,
      isMoving: () => false,
      stopMovement: () => {},
      followPath: () => {},
      clearTarget: function () { this.targetEntity = null; },
      setTarget: function (t: any) { this.targetEntity = t; },
      heal: function (amt: number) {
        const missing = this.maxHp - this.hp;
        const actual = Math.min(missing, amt);
        this.hp += actual;
        return actual;
      },
      takeDamage: function (amt: number) {
        this.hp = Math.max(0, this.hp - amt);
        return this.hp === 0;
      },
      progression,
      isDualWielding: () => false,
      hasShield: () => false,
      isAutocastEnabled: () => false,
      updateStatusEffects: () => 0,
      applyStatusEffect: () => {}
    };
  }

  function createMockEnemy(id: string, name: string, gridX: number, gridY: number): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 100,
      maxHp: 100,
      criticalHp: 50,
      maxCriticalHp: 50,
      state: 'idle' as 'idle' | 'chasing' | 'attacking' | 'downed' | 'dead',
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      lastAttackTime: 0,
      attackIntervalMs: 1200,
      baseDamage: 4,
      attackRangeTiles: 1,
      tileSize: 32,
      spawnPos: { x: gridX, y: gridY },
      isAggroed: false,
      maxLeashDistance: 10,
      outOfAggroTimerMs: 0,
      activeStatusEffects: new Map<string, any>(),
      isMoving: () => false,
      stopMovement: () => {},
      followPath: () => {},
      takeDamage: function (amt: number) {
        this.hp = Math.max(0, this.hp - amt);
        return this.hp === 0;
      },
      applyStatusEffect: () => {},
      hasStatusEffect: function (id: string) { return this.activeStatusEffects.has(id); },
      getStatusEffect: function (id: string) { return this.activeStatusEffects.get(id); },
      removeStatusEffect: function (id: string) { this.activeStatusEffects.delete(id); },
      updateStatusEffects: () => 0,
      enemyData: { harvest: [] }
    };
  }

  const healingStaff = dataLoader.getWeapon('healing_staff')!;
  const fireStaff = dataLoader.getWeapon('fire_staff')!;
  const genericStaff = dataLoader.getWeapon('staff')!;
  const daggerWeapon = dataLoader.getWeapon('daggers')!;

  assert.ok(healingStaff, 'healing_staff weapon must exist in weapons.json');
  assert.ok(fireStaff, 'fire_staff weapon must exist in weapons.json');
  assert.ok(genericStaff, 'staff weapon must exist in weapons.json');
  assert.equal(healingStaff.name, 'Healing Staff');
  assert.equal(fireStaff.name, 'Fire Staff');
  assert.equal(genericStaff.name, 'Staff');

  // ---------------------------------------------------------------------------
  // TEST 1: Companion 3 (3rd Party Member Slot, e.g. Barris)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Companion 3 (Barris, 3rd slot) Equipped with Healing Staff ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
    const hero = createMockUnit('hero', 'Guild Hero', 10, 10, daggerWeapon, heroProg);

    const valerieProg = new ProgressionSystem(classesData, 'Valerie');
    const valerie = createMockUnit('companion_1', 'Valerie', 10, 11, daggerWeapon, valerieProg);

    const kaelenProg = new ProgressionSystem(classesData, 'Kaelen');
    const kaelen = createMockUnit('companion_2', 'Kaelen', 11, 10, daggerWeapon, kaelenProg);

    const barrisProg = new ProgressionSystem(classesData, 'Barris');
    const barris = createMockUnit('companion_3', 'Barris', 11, 11, healingStaff, barrisProg);

    const enemy = createMockEnemy('goblin_1', 'Goblin', 12, 11);
    barris.targetEntity = enemy;

    const combat = new CombatSystem(scene, [hero, valerie, kaelen, barris], [enemy], scene.pathfinder);

    // Initial check: all proficiencies at 0
    assert.equal(barrisProg.getProficiencyStat('healing_magic').currentExp, 0);
    assert.equal(barrisProg.getProficiencyStat('staff').currentExp, 0);
    assert.equal(barrisProg.getProficiencyStat('fire_magic').currentExp, 0);

    // 1A. Damaged ally exists -> Barris casts Heal
    hero.hp = 20; // damaged
    barris.energy = 100;
    const casted = combat.checkAndAutocastHealingMagic(barris, 1000);
    assert.equal(casted, true, 'Barris must cast Heal on damaged Hero');
    assert.equal(barrisProg.getProficiencyStat('healing_magic').currentExp, 2, 'Healing Magic gained exactly +2 EXP');
    assert.equal(barrisProg.getProficiencyStat('fire_magic').currentExp, 0, 'Fire Magic MUST gain 0 EXP');
    assert.equal(barrisProg.getProficiencyStat('staff').currentExp, 0, 'Staff gained 0 EXP during spell cast');
    console.log('  ✔ 1A Passed: Barris heals ally -> +2 healing_magic EXP, 0 fire_magic EXP');

    // 1B. All allies healthy -> Barris falls back to physical staff melee against enemy
    hero.hp = 50; // full health
    valerie.hp = 50;
    kaelen.hp = 50;
    barris.hp = 50;
    barris.energy = 100; // full energy

    combat.updateStaffDynamicRange(barris);
    assert.equal(barris.attackRangeTiles, 1, 'Healing Staff attack range against enemies is strictly 1 tile');

    const effWpn = combat.getEffectiveWeaponForAttack(barris);
    assert.equal(effWpn.id, 'staff', 'Healing Staff against enemies uses physical staff profile');

    // Simulate combat attack tick
    const origRand = Math.random;
    Math.random = () => 0.01; // guarantee hit
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }

    assert.equal(barrisProg.getProficiencyStat('staff').currentExp, 2, 'Staff gained +2 EXP from physical melee strike');
    assert.equal(barrisProg.getProficiencyStat('healing_magic').currentExp, 2, 'Healing Magic remains at 2 EXP');
    assert.equal(barrisProg.getProficiencyStat('fire_magic').currentExp, 0, 'CRITICAL: Fire Magic MUST REMAIN 0 EXP');
    console.log('  ✔ 1B Passed: Barris attacks enemy -> +2 staff EXP, NEVER fire_magic EXP (remains 0)');
  }

  console.log('\n--- TEST 1C: Companion 3 (Barris) Equipped with Fire Staff ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
    const hero = createMockUnit('hero', 'Guild Hero', 10, 10, daggerWeapon, heroProg);

    const barrisProg = new ProgressionSystem(classesData, 'Barris');
    const barris = createMockUnit('companion_3', 'Barris', 10, 14, fireStaff, barrisProg); // 4 tiles away
    const enemy = createMockEnemy('goblin_2', 'Goblin', 10, 10);
    barris.targetEntity = enemy;

    const combat = new CombatSystem(scene, [hero, barris], [enemy], scene.pathfinder);

    // With energy (100 >= 22): range is 4, effective weapon is fire_magic
    barris.energy = 100;
    combat.updateStaffDynamicRange(barris);
    assert.equal(barris.attackRangeTiles, 4, 'Fire Staff with >= 22 EN gets 4 tiles attack range');

    const effWpnFull = combat.getEffectiveWeaponForAttack(barris);
    assert.equal(effWpnFull.id, 'fire_magic', 'Fire Staff with >= 22 EN attacks with fire_magic profile');

    const origRand = Math.random;
    Math.random = () => 0.01; // hit
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }

    assert.equal(barrisProg.getProficiencyStat('fire_magic').currentExp, 2, 'Fire Magic gained +2 EXP');
    assert.equal(barrisProg.getProficiencyStat('healing_magic').currentExp, 0, 'Healing Magic MUST be 0 EXP');
    assert.equal(barrisProg.getProficiencyStat('staff').currentExp, 0, 'Staff EXP remains 0 while casting');
    console.log('  ✔ 1C Passed: Fire Staff cast -> +2 fire_magic EXP, NEVER healing_magic EXP');

    // Dry fallback (< 22 energy): drops to range 1, physical staff melee
    barris.energy = 5;
    combat.updateStaffDynamicRange(barris);
    assert.equal(barris.attackRangeTiles, 1, 'Dry Fire Staff drops to 1 tile attack range');

    const effWpnDry = combat.getEffectiveWeaponForAttack(barris);
    assert.equal(effWpnDry.id, 'staff', 'Dry Fire Staff returns staff profile for melee fallback');

    // Move enemy adjacent for melee attack
    enemy.gridPos = { x: 10, y: 13 };
    enemy.x = 10 * 32 + 16;
    enemy.y = 13 * 32 + 16;
    barris.lastAttackTime = 0;

    Math.random = () => 0.01;
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }

    assert.equal(barrisProg.getProficiencyStat('staff').currentExp, 2, 'Dry fallback melee strike awards +2 staff EXP');
    assert.equal(barrisProg.getProficiencyStat('healing_magic').currentExp, 0, 'Healing Magic MUST REMAIN 0 EXP');
    console.log('  ✔ 1C Passed: Fire Staff dry fallback -> +2 staff EXP, NEVER healing_magic EXP');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Multiple Companions (Valerie Slot 1, Kaelen Slot 2)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Slot Independence Across Valerie (Slot 1) and Kaelen (Slot 2) ---');
  for (const [slotIdx, name] of [[1, 'Valerie'], [2, 'Kaelen']] as const) {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
    const hero = createMockUnit('hero', 'Guild Hero', 10, 10, daggerWeapon, heroProg);

    const compProg = new ProgressionSystem(classesData, name);
    const comp = createMockUnit(`companion_${slotIdx}`, name, 10, 11, healingStaff, compProg);
    const enemy = createMockEnemy('orc', 'Orc', 10, 12);
    comp.targetEntity = enemy;

    const combat = new CombatSystem(scene, [hero, comp], [enemy], scene.pathfinder);

    hero.hp = 20;
    comp.energy = 100;
    combat.checkAndAutocastHealingMagic(comp, 1000);

    assert.equal(compProg.getProficiencyStat('healing_magic').currentExp, 2, `${name} gained +2 healing_magic EXP`);
    assert.equal(compProg.getProficiencyStat('fire_magic').currentExp, 0, `${name} gained 0 fire_magic EXP`);

    // Fallback melee
    hero.hp = 50;
    comp.lastAttackTime = 0;
    const origRand = Math.random;
    Math.random = () => 0.01;
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }
    assert.equal(compProg.getProficiencyStat('staff').currentExp, 2, `${name} gained +2 staff EXP`);
    assert.equal(compProg.getProficiencyStat('fire_magic').currentExp, 0, `${name} fire_magic remains 0`);
    console.log(`  ✔ Test 2 Passed for ${name} (Slot ${slotIdx}): correct healing_magic + staff, 0 fire_magic`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Leader (Guild Hero, Slot 0)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Leader (Guild Hero, Slot 0) Equipped with Healing Staff ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
    const hero = createMockUnit('hero', 'Guild Hero', 10, 10, healingStaff, heroProg);

    const compProg = new ProgressionSystem(classesData, 'Valerie');
    const comp = createMockUnit('companion_1', 'Valerie', 10, 11, daggerWeapon, compProg);
    const enemy = createMockEnemy('orc_leader', 'Orc', 10, 9);
    hero.targetEntity = enemy;

    const combat = new CombatSystem(scene, [hero, comp], [enemy], scene.pathfinder);

    comp.hp = 20; // ally damaged
    hero.energy = 100;
    combat.checkAndAutocastHealingMagic(hero, 1000);

    assert.equal(heroProg.getProficiencyStat('healing_magic').currentExp, 2, 'Leader gained +2 healing_magic EXP');
    assert.equal(heroProg.getProficiencyStat('fire_magic').currentExp, 0, 'Leader gained 0 fire_magic EXP');

    comp.hp = 50; // full health
    hero.lastAttackTime = 0;
    const origRand = Math.random;
    Math.random = () => 0.01;
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }

    assert.equal(heroProg.getProficiencyStat('staff').currentExp, 2, 'Leader gained +2 staff EXP from melee swing');
    assert.equal(heroProg.getProficiencyStat('fire_magic').currentExp, 0, 'Leader fire_magic remains 0 EXP');
    console.log('  ✔ Test 3 Passed: Leader with Healing Staff gains healing_magic & staff EXP, NEVER fire_magic');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Plain Generic Staff (Melee-Only, No Spells Ever)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Plain Generic Staff (Melee-Only, Zero Spells Ever) ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Monk');
    const hero = createMockUnit('hero', 'Monk', 10, 10, genericStaff, heroProg);

    const allyProg = new ProgressionSystem(classesData, 'Ally');
    const ally = createMockUnit('ally', 'Ally', 10, 11, daggerWeapon, allyProg);
    const enemy = createMockEnemy('skeleton', 'Skeleton', 10, 9);
    hero.targetEntity = enemy;

    const combat = new CombatSystem(scene, [hero, ally], [enemy], scene.pathfinder);

    // Even with damaged ally and full energy: generic staff MUST NOT cast heal
    ally.hp = 10;
    hero.energy = 100;
    const healAttempt = combat.checkAndAutocastHealingMagic(hero, 1000);
    assert.equal(healAttempt, false, 'Generic staff MUST NOT cast Healing Magic');

    // Dynamic range is strictly 1
    combat.updateStaffDynamicRange(hero);
    assert.equal(hero.attackRangeTiles, 1, 'Generic staff range is strictly 1 tile');

    const effWpn = combat.getEffectiveWeaponForAttack(hero);
    assert.equal(effWpn.id, 'staff', 'Generic staff returns staff profile');

    const origRand = Math.random;
    Math.random = () => 0.01;
    try {
      combat.update(3000, 16);
    } finally {
      Math.random = origRand;
    }

    assert.equal(heroProg.getProficiencyStat('staff').currentExp, 2, 'Generic staff gains +2 staff melee EXP');
    assert.equal(heroProg.getProficiencyStat('healing_magic').currentExp, 0, 'Healing Magic MUST be 0 EXP');
    assert.equal(heroProg.getProficiencyStat('fire_magic').currentExp, 0, 'Fire Magic MUST be 0 EXP');
    console.log('  ✔ Test 4 Passed: Generic Staff is strictly melee-only: +2 staff EXP, 0 healing, 0 fire');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Legacy Save Normalization & Fallback Support
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Legacy Save Normalization on Load ---');
  {
    const scene = createMockScene();
    const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
    const playerData = dataLoader.getPlayer();
    const player = new Player(scene, 5, 5, playerData, genericStaff, 32, 'avatar', heroProg);

    // Simulate loading an old save with equippedWeaponId: 'fire_magic'
    const legacyFireSnapshot: CharacterSnapshot = {
      id: 'legacy_hero',
      name: 'Legacy Hero',
      state: 'idle',
      equippedWeaponId: 'fire_magic', // OLD save data
      offhandWeaponId: null,
      activeClass: null,
      hp: 50,
      criticalHp: 25,
      energy: 100,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      proficiencies: {},
      classLevels: {},
      unlockedClasses: [],
      gridPos: { x: 5, y: 5 },
      hunger: 100,
      mood: 100
    };

    player.restoreFromSnapshot(legacyFireSnapshot, 0);
    assert.equal(player.equippedWeapon.id, 'fire_staff', 'restoreFromSnapshot must normalize legacy fire_magic to fire_staff');
    console.log('  ✔ 5A Passed: Legacy fire_magic snapshot cleanly normalized to fire_staff on load');

    // Simulate loading an old save with equippedWeaponId: 'healing_magic'
    const legacyHealSnapshot: CharacterSnapshot = {
      id: 'legacy_healer',
      name: 'Legacy Healer',
      state: 'idle',
      equippedWeaponId: 'healing_magic', // OLD save data
      offhandWeaponId: null,
      activeClass: null,
      hp: 50,
      criticalHp: 25,
      energy: 100,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: {},
      proficiencies: {},
      classLevels: {},
      unlockedClasses: [],
      gridPos: { x: 5, y: 5 },
      hunger: 100,
      mood: 100
    };

    player.restoreFromSnapshot(legacyHealSnapshot, 0);
    assert.equal(player.equippedWeapon.id, 'healing_staff', 'restoreFromSnapshot must normalize legacy healing_magic to healing_staff');
    console.log('  ✔ 5B Passed: Legacy healing_magic snapshot cleanly normalized to healing_staff on load');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL HEALING STAFF / FIRE STAFF BUGFIX TESTS PASSED 100%!');
  console.log('================================================================\n');
}

runBugfixVerification().catch(err => {
  console.error('❌ Bugfix Verification Failed:', err);
  process.exit(1);
});
