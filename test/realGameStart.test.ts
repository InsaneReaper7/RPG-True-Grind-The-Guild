import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs if Phaser probes for it
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
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load JSON data files directly
const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
const playerData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/player.json'), 'utf8'));

// Mock fetch for DataLoader
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(path.join(rootDir, cleanPath), 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Dynamic imports after browser globals
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { Player } = await import('../src/entities/Player.ts');

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
      setVisible: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      play: () => obj,
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      setText: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    tileSize: 32,
    mapWidth: 20,
    mapHeight: 20,
    gridMatrix: Array.from({ length: 20 }, () => Array(20).fill(0)),
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

async function runRealGameStartTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING TEST SUITE: THE REAL GAME START                     ');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  gameState.resetToDefault(playerData);

  // ---------------------------------------------------------------------------
  // TEST 1: Clean Game Start Seeds Hero and Valerie as Scout Mentor
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Initial Game State Roster (Hero + Valerie) ---');
  const snapshots = gameState.getPartySnapshots();
  assert.equal(snapshots.length, 2, 'Game must start with exactly 2 party members (Hero + Valerie)');

  const heroSnap = snapshots[0];
  const valerieSnap = snapshots[1];

  assert.equal(heroSnap.name, 'Guild Hero', 'Leader at index 0 must be Guild Hero');
  assert.equal(heroSnap.activeClass, null, 'Hero begins unclassed');
  assert.equal(heroSnap.equippedWeaponId, 'short_swords', 'Hero equips Short Swords');

  assert.equal(valerieSnap.id, 'companion_1', 'Valerie ID must be companion_1');
  assert.equal(valerieSnap.name, 'Valerie', 'Valerie name must be Valerie');
  assert.equal(valerieSnap.equippedWeaponId, 'bows', 'Valerie must have Hunting Bow equipped as main weapon');
  assert.equal(valerieSnap.offhandWeaponId, 'daggers', 'Valerie must have Daggers equipped as offhand sidearm');

  console.log('✓ PASS: Party snapshots start with Hero and Valerie equipped with Bow and Dagger.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Valerie Proficiencies, Scout Unlock Check, and Class Level 10
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Valerie Scout Class Level 10 & Proficiencies (Daggers 10, Bows 15) ---');
  assert.equal(valerieSnap.proficiencies.daggers?.level, 10, 'Valerie daggers proficiency must be 10');
  assert.equal(valerieSnap.proficiencies.bows?.level, 15, 'Valerie bows proficiency must be 15');
  assert.equal(valerieSnap.activeClass, 'scout', 'Valerie activeClass must be scout');
  assert.equal(valerieSnap.classLevels.scout, 10, 'Valerie Scout class level must be locked at Level 10');
  assert.deepEqual(valerieSnap.unlockedClasses, ['scout'], 'Valerie must have scout in unlockedClasses');

  // Test Scout requirements engine against Valerie's proficiencies
  const scoutDef = dataLoader.getClass('scout')!;
  assert.ok(scoutDef, 'Scout definition must exist in classes.json');
  assert.deepEqual(scoutDef.requirements, [
    { type: 'proficiency', target: 'daggers', value: 10 },
    { type: 'proficiency', target: 'bows', value: 15 }
  ], 'Scout requirements must be Daggers 10 + Bows 15');

  const valerieProg = new ProgressionSystem(classesData, 'Valerie');
  valerieProg.loadSnapshotData({
    proficiencies: valerieSnap.proficiencies,
    classLevels: valerieSnap.classLevels,
    classStats: valerieSnap.classStats,
    unlockedClasses: valerieSnap.unlockedClasses
  });

  assert.equal(valerieProg.getProficiencyLevel('daggers'), 10, 'Progression daggers level is 10');
  assert.equal(valerieProg.getProficiencyLevel('bows'), 15, 'Progression bows level is 15');
  assert.equal(valerieProg.isClassUnlocked('scout'), true, 'Scout class is unlocked in progression');
  assert.equal(valerieProg.getClassLevel('scout'), 10, 'Scout class level is 10 in progression');

  // Check Scout Skill Kit: quickshot (Lv 1) and mark_target (Lv 10)
  const quickshot = dataLoader.getSkill('quickshot')!;
  const markTarget = dataLoader.getSkill('mark_target')!;
  const evasiveRoll = dataLoader.getSkill('evasive_roll')!; // Requires Lv 20

  assert.equal(valerieProg.isSkillUnlocked(quickshot), true, 'Quickshot (Lv 1) is unlocked for Valerie');
  assert.equal(valerieProg.isSkillUnlocked(markTarget), true, 'Mark Target (Lv 10) is unlocked for Valerie');
  assert.equal(valerieProg.isSkillUnlocked(evasiveRoll), false, 'Evasive Roll (Lv 20) remains locked for Valerie at Lv 10');

  assert.ok(valerieSnap.knownSkillIds.includes('quickshot'), 'Valerie knows quickshot');
  assert.ok(valerieSnap.knownSkillIds.includes('mark_target'), 'Valerie knows mark_target');
  assert.ok(valerieSnap.equippedSkillIds.includes('quickshot'), 'Valerie has quickshot equipped');
  assert.ok(valerieSnap.equippedSkillIds.includes('mark_target'), 'Valerie has mark_target equipped');
  assert.equal(valerieSnap.autocastMap['quickshot'], true, 'Valerie quickshot autocast is true');
  assert.equal(valerieSnap.autocastMap['mark_target'], true, 'Valerie mark_target autocast is true');

  console.log('✓ PASS: Valerie Scout requirements validate cleanly; Scout Level 10 kit is active with autocast.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Instantiating Valerie in Scene Restores Ranged Range and Sidearm Dagger
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Valerie In-Engine Player Entity Restoration ---');
  const mockScene = createMockScene();
  const bowsWeapon = dataLoader.getWeapon('bows')!;
  const valeriePlayer = new Player(
    mockScene,
    5,
    5,
    playerData,
    bowsWeapon,
    32,
    'companion-avatar',
    valerieProg
  );
  valeriePlayer.restoreFromSnapshot(valerieSnap, 1000);

  assert.equal(valeriePlayer.equippedWeapon.id, 'bows', 'Valerie main weapon is bows');
  assert.equal(valeriePlayer.attackRangeTiles, 4, 'Valerie attackRangeTiles is 4 for Hunting Bow');
  assert.equal(valeriePlayer.offhandWeapon?.id, 'daggers', 'Valerie offhand weapon is daggers sidearm');
  assert.equal(valeriePlayer.activeClass, 'scout', 'Valerie player entity activeClass is scout');
  assert.deepEqual(valeriePlayer.knownSkillIds, ['quickshot', 'mark_target'], 'Valerie knows quickshot and mark_target');
  assert.deepEqual(valeriePlayer.equippedSkillIds, ['quickshot', 'mark_target'], 'Valerie equipped skills restored');
  assert.equal(valeriePlayer.autocastMap.get('quickshot'), true, 'Quickshot autocast active');
  assert.equal(valeriePlayer.autocastMap.get('mark_target'), true, 'Mark Target autocast active');

  console.log('✓ PASS: Valerie player entity restored with 4-tile bow range, sidearm dagger, and active skills.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Blank-Slate Recruit Generation (Kaelen) Across Weapon Kits
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Blank-Slate Recruit Kaelen (Level 0, No Class, No Skills) ---');

  const testKits = [
    { kit: 'sword_and_shield', expectedMain: 'short_swords', expectedOff: 'shields' },
    { kit: '2h_longsword', expectedMain: 'longsword_2h', expectedOff: null },
    { kit: 'bow_and_dagger', expectedMain: 'bows', expectedOff: 'daggers' },
    { kit: 'random_magic_staff', expectedMain: 'arcane_staff', expectedOff: null } // pool has staves
  ];

  for (const { kit, expectedMain, expectedOff } of testKits) {
    const recruitSnap = gameState.createBlankRecruitSnapshot('Kaelen', 'companion_2', kit, () => 0);

    assert.equal(recruitSnap.name, 'Kaelen');
    assert.equal(recruitSnap.id, 'companion_2');
    assert.equal(recruitSnap.activeClass, null, `Recruit with ${kit} must have activeClass null`);
    assert.deepEqual(recruitSnap.unlockedClasses, [], `Recruit with ${kit} must have zero unlocked classes`);
    assert.deepEqual(recruitSnap.knownSkillIds, [], `Recruit with ${kit} must have zero known skills`);
    assert.deepEqual(recruitSnap.equippedSkillIds, [], `Recruit with ${kit} must have zero equipped skills`);

    // All proficiencies must be level 0
    for (const [statId, stat] of Object.entries(recruitSnap.proficiencies)) {
      assert.equal(stat.level, 0, `Proficiency '${statId}' on recruit must be strictly Level 0! Got: ${stat.level}`);
      assert.equal(stat.currentExp, 0, `Proficiency '${statId}' on recruit must have 0 EXP!`);
    }

    if (kit === 'random_magic_staff') {
      assert.ok(recruitSnap.equippedWeaponId.endsWith('_staff'), 'Random magic staff resolved to conduit staff');
    } else {
      assert.equal(recruitSnap.equippedWeaponId, expectedMain, `Main weapon must be ${expectedMain}`);
      assert.equal(recruitSnap.offhandWeaponId, expectedOff, `Offhand weapon must be ${expectedOff}`);
    }
  }

  console.log('✓ PASS: All recruit weapon kits produce a genuine blank slate: Level 0 everywhere, no class, no skills.\n');

  // ---------------------------------------------------------------------------
  // TEST 5: Summoning Kaelen to Party Expands Roster from 2 to 3
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Summoning 3rd Party Member Expands Party from 2 to 3 ---');
  const kaelenSnap = gameState.createBlankRecruitSnapshot('Kaelen', 'companion_2', 'sword_and_shield');
  gameState.addCompanionToParty(kaelenSnap, 1000);

  const finalParty = gameState.getPartySnapshots();
  assert.equal(finalParty.length, 3, 'Party must now have exactly 3 members');
  assert.equal(finalParty[0].name, 'Guild Hero');
  assert.equal(finalParty[1].name, 'Valerie');
  assert.equal(finalParty[2].name, 'Kaelen');
  assert.equal(finalParty[2].equippedWeaponId, 'short_swords');
  assert.equal(finalParty[2].offhandWeaponId, 'shields');
  assert.equal(finalParty[2].proficiencies['short_swords'].level, 0);

  console.log('✓ PASS: Party successfully expanded to 3: Hero, Valerie (Scout mentor), and Kaelen (blank slate recruit).\n');

  console.log('================================================================');
  console.log('🎉 ALL THE REAL GAME START UNIT TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runRealGameStartTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
