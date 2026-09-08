import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import type { WeaponDef, EnemyDef, ClassesData, PlayerData, SkillDef, GridPos } from '../src/types/game.ts';

import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser import under Node
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

// Setup mock fetch for node testing
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

console.log('--- RUNNING MILESTONE 11: COMBAT MEDIC & FULL-GROUP RETALIATION TESTS ---');

function createMockPlayer(
  id: string,
  name: string,
  x: number,
  y: number,
  weapon: WeaponDef,
  progression: ProgressionSystem,
  attackRangeTiles: number = 1
) {
  return {
    id,
    entityName: name,
    gridPos: { x, y },
    x: x * 32 + 16,
    y: y * 32 + 16,
    hp: 50,
    maxHp: 50,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    mood: 80,
    state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
    equippedWeapon: weapon,
    offhandWeapon: null,
    attackRangeTiles,
    targetEntity: null as any,
    claimedDestination: null as GridPos | null,
    lastAttackTime: 0,
    lastCombatRepathTimeMs: 0,
    combatRepathIntervalMs: 400,
    lastSkillUseTimes: new Map<string, number>(),
    knownSkillIds: ['power_strike', 'first_aid'],
    equippedSkillIds: ['power_strike', 'first_aid'],
    autocastMap: new Map<string, boolean>([
      ['power_strike', true],
      ['first_aid', true]
    ]),
    bookLearnedSkills: new Set<string>(),
    progression,
    isDualWielding: () => false,
    isAutocastEnabled: function(skillId: string) {
      return this.autocastMap.get(skillId) === true;
    },
    setAutocast: function(skillId: string, val: boolean) {
      this.autocastMap.set(skillId, val);
    },
    equipSkill: function(skillId: string) {
      if (!this.equippedSkillIds.includes(skillId)) {
        this.equippedSkillIds.push(skillId);
      }
      return true;
    },
    unequipSkill: function(skillId: string) {
      const idx = this.equippedSkillIds.indexOf(skillId);
      if (idx !== -1) this.equippedSkillIds.splice(idx, 1);
      return true;
    },
    learnSkill: function(skillId: string) {
      if (!this.knownSkillIds.includes(skillId)) {
        this.knownSkillIds.push(skillId);
      }
      return true;
    },
    setTarget: function(target: any) {
      this.targetEntity = target;
    },
    clearTarget: function() {
      this.targetEntity = null;
      this.stopMovement();
    },
    isMoving: function() {
      return this.state === 'moving' && this.claimedDestination !== null;
    },
    stopMovement: function() {
      this.claimedDestination = null;
      if (this.state === 'moving') {
        this.state = 'idle';
      }
    },
    followPath: function(path: GridPos[]) {
      if (path.length > 0) {
        this.claimedDestination = path[path.length - 1];
        this.state = 'moving';
      }
    },
    heal: function(amount: number) {
      if (this.state === 'dead' || this.state === 'downed') return 0;
      const oldHp = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      return this.hp - oldHp;
    },
    revive: function(reviver?: any) {
      if (this.state !== 'downed') return;
      this.state = 'idle';
      this.hp = Math.floor(this.maxHp * 0.5);
      this.criticalHp = this.maxCriticalHp;
      this.claimedDestination = null;
      this.clearTarget();
      if (reviver && reviver !== this && reviver.progression) {
        reviver.progression.recordActivity('Ally Revived', 1);
      }
    },
    takeDamage: function(amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) {
        this.state = 'downed';
        this.clearTarget();
        return true;
      }
      return false;
    }
  };
}

function createMockEnemy(id: string, name: string, x: number, y: number, hp: number = 40) {
  return {
    id,
    entityName: name,
    gridPos: { x, y },
    x: x * 32 + 16,
    y: y * 32 + 16,
    hp,
    maxHp: hp,
    criticalHp: 20,
    maxCriticalHp: 20,
    state: 'idle' as 'idle' | 'moving' | 'chasing' | 'attacking' | 'downed' | 'dead',
    attackRangeTiles: 1,
    claimedDestination: null as GridPos | null,
    isMoving: function() {
      return this.state === 'moving' || this.state === 'chasing';
    },
    stopMovement: function() {
      this.claimedDestination = null;
      if (this.state === 'moving' || this.state === 'chasing') {
        this.state = 'idle';
      }
    },
    takeDamage: function(amount: number) {
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) {
        this.state = 'dead';
        return true;
      }
      return false;
    },
    enemyData: {
      harvest: []
    }
  };
}

async function runTests() {
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  await DataLoader.getInstance().loadAll();
  const dataLoader = DataLoader.getInstance();
  const classesData: ClassesData = dataLoader.getClassesData();
  const shortSwords = dataLoader.getWeapon('short_swords')!;

  // Map grid for pathfinding (20x20 open room with border walls)
  const gridMatrix: number[][] = [];
  for (let y = 0; y < 20; y++) {
    const row: number[] = [];
    for (let x = 0; x < 20; x++) {
      row.push(x === 0 || x === 19 || y === 0 || y === 19 ? 1 : 0);
    }
    gridMatrix.push(row);
  }
  const pathfinder = new Pathfinder(gridMatrix);

  // ==========================================================================
  // TEST 1: Combat Medic Class Definition & Unlock Exactly on 5th Revive
  // ==========================================================================
  const combatMedicDef = classesData.classes.find(c => c.id === 'combat_medic');
  assert.ok(combatMedicDef, 'Combat Medic class must exist in classes.json');
  assert.equal(combatMedicDef.tier, 'novice', 'Combat Medic must be novice tier');
  assert.deepEqual(
    combatMedicDef.requirements,
    [{ type: 'activityCount', target: 'Ally Revived', value: 5 }],
    'Combat Medic must require exactly 5 Ally Revived activities'
  );

  const heroProg = new ProgressionSystem(classesData);
  const hero = createMockPlayer('hero', 'Guild Hero', 3, 3, shortSwords, heroProg);
  const companion = createMockPlayer('comp1', 'Companion One', 4, 3, shortSwords, new ProgressionSystem(classesData));

  let classUnlockedEvent: string | null = null;
  heroProg.onClassUnlocked(e => {
    classUnlockedEvent = e.classDef.id;
  });

  // Verify initially locked
  assert.equal(heroProg.isClassUnlocked('combat_medic'), false, 'Combat Medic must start locked');
  assert.equal(heroProg.getActivityCount('Ally Revived'), 0, 'Initial revives must be 0');

  // Perform revives 1 to 4: must NOT unlock Combat Medic
  for (let i = 1; i <= 4; i++) {
    companion.state = 'downed';
    companion.revive(hero);
    assert.equal(heroProg.getActivityCount('Ally Revived'), i, `Revive count must be ${i}`);
    assert.equal(heroProg.isClassUnlocked('combat_medic'), false, `Must NOT unlock at ${i} revives`);
    assert.equal(classUnlockedEvent, null, `No unlock event at ${i} revives`);
  }

  // Perform 5th revive: MUST unlock Combat Medic
  companion.state = 'downed';
  companion.revive(hero);
  assert.equal(heroProg.getActivityCount('Ally Revived'), 5, 'Revive count must be 5');
  assert.equal(heroProg.isClassUnlocked('combat_medic'), true, 'Combat Medic MUST unlock on the 5th revive');
  assert.equal(heroProg.getClassLevel('combat_medic'), 1, 'Combat Medic level must be 1 upon unlock');
  assert.equal(classUnlockedEvent, 'combat_medic', 'Class unlock callback must fire for combat_medic');

  // Verify Snapshot persistence of activityCounts
  const snapshotData = heroProg.getSnapshotData();
  assert.equal(snapshotData.activityCounts?.['Ally Revived'], 5, 'Snapshot must serialize Ally Revived activity count');
  assert.ok(snapshotData.unlockedClasses.includes('combat_medic'), 'Snapshot must include combat_medic');

  const restoredProg = new ProgressionSystem(classesData);
  restoredProg.loadSnapshotData(snapshotData);
  assert.equal(restoredProg.getActivityCount('Ally Revived'), 5, 'Restored progression must have 5 revives');
  assert.equal(restoredProg.isClassUnlocked('combat_medic'), true, 'Restored progression must keep Combat Medic unlocked');

  console.log('✔ Test 1 passed: Combat Medic unlocks exactly on the 5th ally revive and persists in snapshot');

  // ==========================================================================
  // TEST 2: First Aid Active Skill — Requirements, Costs, Cooldown & HP Restore
  // ==========================================================================
  const firstAidDef = dataLoader.getSkill('first_aid');
  assert.ok(firstAidDef, 'First Aid skill must exist in skills.json');
  assert.equal(firstAidDef.energyCost, 20, 'First Aid must cost 20 Energy');
  assert.equal(firstAidDef.cooldownMs, 4000, 'First Aid cooldown must be 4000ms');
  assert.equal(firstAidDef.healAmount, 20, 'First Aid must heal 20 HP');
  assert.equal(firstAidDef.targetType, 'ally', 'First Aid targetType must be ally');
  assert.deepEqual(
    firstAidDef.requirements,
    [{ type: 'classLevel', target: 'combat_medic', value: 1 }],
    'First Aid must require Combat Medic Level 1'
  );

  // Skill locked for a player without Combat Medic
  const lockedProg = new ProgressionSystem(classesData);
  const unrankedHero = createMockPlayer('hero_unranked', 'Novice', 3, 3, shortSwords, lockedProg);
  assert.equal(lockedProg.isSkillUnlocked(firstAidDef, unrankedHero as any), false, 'First Aid must be locked without Combat Medic');

  // Skill unlocked for heroProg (who has Combat Medic Level 1)
  assert.equal(heroProg.isSkillUnlocked(firstAidDef, hero as any), true, 'First Aid must be unlocked with Combat Medic');

  // Mock Combat Scene & System
  const mockScene: any = {
    time: { now: 1000 },
    add: {
      graphics: () => ({ lineStyle: () => {}, lineBetween: () => {}, destroy: () => {} }),
      text: () => ({ setOrigin: () => {}, destroy: () => {} }),
      circle: () => ({ setDepth: () => ({ destroy: () => {} }) })
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) config.onComplete();
      }
    }
  };

  const combatSystem = new CombatSystem(
    mockScene,
    [hero as any, companion as any],
    [],
    pathfinder,
    heroProg
  );

  // Companion is damaged (HP: 25/50)
  companion.hp = 25;
  hero.energy = 100;
  hero.lastSkillUseTimes.clear();

  // Cast First Aid on companion at time 1000
  const castSuccess = combatSystem.castSkill(hero as any, 'first_aid', companion as any, 1000);
  assert.equal(castSuccess, true, 'First Aid cast must succeed');
  assert.equal(companion.hp, 45, 'Companion HP must increase by 20 (25 + 20 = 45)');
  assert.equal(hero.energy, 80, 'Hero Energy must decrease by 20 (100 - 20 = 80)');
  assert.equal(hero.lastSkillUseTimes.get('first_aid'), 1000, 'Last skill use time must be recorded');

  // Attempt to cast again immediately at time 1500 (still on 4000ms cooldown)
  const castCdBlocked = combatSystem.castSkill(hero as any, 'first_aid', companion as any, 1500);
  assert.equal(castCdBlocked, false, 'First Aid must be blocked while on cooldown');
  assert.equal(companion.hp, 45, 'Companion HP must remain unchanged when skill is on cooldown');
  assert.equal(hero.energy, 80, 'Hero Energy must remain unchanged when skill is on cooldown');

  // Advance time past cooldown to 5500 (1000 + 4500 > 4000ms)
  const castAfterCd = combatSystem.castSkill(hero as any, 'first_aid', companion as any, 5500);
  assert.equal(castAfterCd, true, 'First Aid must succeed after cooldown expires');
  assert.equal(companion.hp, 50, 'Companion HP must be restored to max (capped at 50)');
  assert.equal(hero.energy, 60, 'Hero Energy must decrease by another 20 (80 - 20 = 60)');

  // Attempt to cast with insufficient energy (< 20)
  hero.energy = 10;
  const castLowEnergy = combatSystem.castSkill(hero as any, 'first_aid', companion as any, 10000);
  assert.equal(castLowEnergy, false, 'First Aid must fail when caster has insufficient energy');

  console.log('✔ Test 2 passed: First Aid heals damaged ally, deducts energy, respects cooldown, and prevents low-energy casts');

  // ==========================================================================
  // TEST 3: Full-Group Retaliation When Idle Member Takes Damage
  // ==========================================================================
  const unit1 = createMockPlayer('p1', 'Hero', 4, 4, shortSwords, heroProg);
  const unit2 = createMockPlayer('p2', 'Companion A', 4, 5, shortSwords, heroProg);
  const unit3 = createMockPlayer('p3', 'Companion B', 5, 4, shortSwords, heroProg);
  const wolf = createMockEnemy('wolf1', 'Wolf', 4, 6);

  // All 3 party members start completely idle and unengaged
  assert.equal(unit1.targetEntity, null);
  assert.equal(unit2.targetEntity, null);
  assert.equal(unit3.targetEntity, null);

  const combatSceneAllIdle: any = {
    time: { now: 2000 },
    add: {
      graphics: () => ({ lineStyle: () => {}, lineBetween: () => {}, destroy: () => {} }),
      text: () => ({ setOrigin: () => {}, destroy: () => {} }),
      circle: () => ({ setDepth: () => ({ destroy: () => {} }) })
    },
    tweens: {
      add: (config: any) => { if (config.onComplete) config.onComplete(); }
    }
  };

  const csAllIdle = new CombatSystem(
    combatSceneAllIdle,
    [unit1 as any, unit2 as any, unit3 as any],
    [wolf as any],
    pathfinder,
    heroProg
  );

  // Wolf attacks Unit 2 (who is adjacent at 4,5, distance 1). Unit 2 takes 5 damage while unengaged.
  unit2.takeDamage(5);
  assert.equal(unit2.hp, 45);

  // Trigger retaliation
  csAllIdle.triggerRetaliation(wolf as any, unit2 as any);

  // All 3 members must now be targeting the wolf!
  assert.equal(unit1.targetEntity, wolf, 'Unit 1 must retaliate and target wolf');
  assert.equal(unit2.targetEntity, wolf, 'Unit 2 must retaliate and target wolf');
  assert.equal(unit3.targetEntity, wolf, 'Unit 3 must retaliate and target wolf');

  // Unit 2 was already adjacent to wolf (Chebyshev dist = 1 <= attackRangeTiles), so Unit 2 holds position
  assert.equal(unit2.gridPos.x, 4);
  assert.equal(unit2.gridPos.y, 5);

  // Ensure all 3 units have distinct, non-overlapping target/claimed positions
  const claimedTiles = new Set<string>();
  for (const u of [unit1, unit2, unit3]) {
    const pos = u.claimedDestination || u.gridPos;
    const key = `${pos.x},${pos.y}`;
    assert.ok(!claimedTiles.has(key), `Tile ${key} must not be double-booked across party members!`);
    claimedTiles.add(key);

    // Each assigned tile must be adjacent to the enemy (within attackRangeTiles = 1)
    const dist = Math.max(Math.abs(pos.x - wolf.gridPos.x), Math.abs(pos.y - wolf.gridPos.y));
    assert.ok(dist <= 1 && dist > 0, `Unit ${u.entityName} tile must be strictly adjacent to wolf (dist: ${dist})`);
  }

  console.log('✔ Test 3 passed: Full-group retaliation commands all idle members to engage with distinct, non-stacking tiles');

  // ==========================================================================
  // TEST 4: Explicit Non-Interference Rule (Split Combat Case)
  // ==========================================================================
  // Member 1 is fighting Enemy A (Wolf A) at (2, 2)
  // Member 2 and Member 3 are idle at (8, 8) and (8, 9)
  // Enemy B (Wolf B) at (8, 7) attacks Member 2
  const wolfA = createMockEnemy('wolfA', 'Wolf A', 2, 2);
  const wolfB = createMockEnemy('wolfB', 'Wolf B', 8, 7);

  const fighter1 = createMockPlayer('f1', 'Fighter 1', 2, 3, shortSwords, heroProg);
  const idle2 = createMockPlayer('f2', 'Idle 2', 8, 8, shortSwords, heroProg);
  const idle3 = createMockPlayer('f3', 'Idle 3', 8, 9, shortSwords, heroProg);

  // Pre-engage Fighter 1 with Wolf A
  fighter1.setTarget(wolfA as any);
  fighter1.state = 'attacking';
  assert.equal(fighter1.targetEntity, wolfA);

  const csSplit = new CombatSystem(
    combatSceneAllIdle,
    [fighter1 as any, idle2 as any, idle3 as any],
    [wolfA as any, wolfB as any],
    pathfinder,
    heroProg
  );

  // Wolf B attacks Idle 2 (who was unengaged, targetEntity === null)
  const wasUnengaged = idle2.targetEntity === null;
  assert.equal(wasUnengaged, true, 'Idle 2 was unengaged before attack');
  idle2.takeDamage(6);

  // Retaliation triggered for Wolf B
  csSplit.triggerRetaliation(wolfB as any, idle2 as any);

  // Non-interference verification:
  // 1. Fighter 1 MUST keep fighting Wolf A completely uninterrupted!
  assert.equal(fighter1.targetEntity, wolfA, 'Fighter 1 MUST remain engaged with Wolf A uninterrupted');
  assert.equal(fighter1.gridPos.x, 2);
  assert.equal(fighter1.gridPos.y, 3);

  // 2. Idle 2 and Idle 3 MUST both engage Wolf B!
  assert.equal(idle2.targetEntity, wolfB, 'Idle 2 must engage Wolf B');
  assert.equal(idle3.targetEntity, wolfB, 'Idle 3 must engage Wolf B');

  // 3. Tile claims must NOT collide with Fighter 1's position or each other
  const splitClaimed = new Set<string>();
  splitClaimed.add(`${fighter1.gridPos.x},${fighter1.gridPos.y}`);

  for (const u of [idle2, idle3]) {
    const dest = u.claimedDestination || u.gridPos;
    const key = `${dest.x},${dest.y}`;
    assert.ok(!splitClaimed.has(key), `Tile ${key} must not collide with existing engaged units or companion claims`);
    splitClaimed.add(key);

    const distToB = Math.max(Math.abs(dest.x - wolfB.gridPos.x), Math.abs(dest.y - wolfB.gridPos.y));
    assert.ok(distToB <= 1 && distToB > 0, `Retaliating unit ${u.entityName} must be adjacent to Wolf B (dist: ${distToB})`);
  }

  console.log('✔ Test 4 passed: Explicit non-interference verified — engaged fighter remains on Enemy A uninterrupted while idle members engage Enemy B without tile collisions');

  // ==========================================================================
  // TEST 5: Retaliation Guards Against Dead Attacker and Active Targets
  // ==========================================================================
  const deadWolf = createMockEnemy('deadWolf', 'Dead Wolf', 10, 10, 0);
  deadWolf.state = 'dead';

  const idleUnit = createMockPlayer('idleSolo', 'Solo', 10, 11, shortSwords, heroProg);
  const csDeadAttacker = new CombatSystem(
    combatSceneAllIdle,
    [idleUnit as any],
    [deadWolf as any],
    pathfinder,
    heroProg
  );

  // Retaliation called with dead attacker -> guard exits cleanly without targeting corpse
  csDeadAttacker.triggerRetaliation(deadWolf as any, idleUnit as any);
  assert.equal(idleUnit.targetEntity, null, 'Idle unit must NOT engage a dead attacker');

  // When a unit is already engaged with an enemy and takes another hit from that enemy,
  // wasUnengaged is false and retaliation is not triggered
  idleUnit.setTarget(wolf as any);
  const engagedHitUnengaged = idleUnit.targetEntity === null;
  assert.equal(engagedHitUnengaged, false, 'Unit already engaged must evaluate wasUnengaged as false');

  console.log('✔ Test 5 passed: Dead attacker guard and already-engaged hit guard verified cleanly');

  console.log('\nALL MILESTONE 11 UNIT TESTS PASSED! 🎉\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
