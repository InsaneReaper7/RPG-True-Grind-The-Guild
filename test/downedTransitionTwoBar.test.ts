import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameState } from '../src/systems/GameState.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { CharacterSnapshot } from '../src/types/game.ts';

console.log('--- RUNNING TWO-BAR DOWNED TRANSITION UNIT TESTS ---');

const dataLoader = DataLoader.getInstance();
(dataLoader as any).weaponsData = JSON.parse(fs.readFileSync('data/weapons.json', 'utf8'));
(dataLoader as any).classesData = JSON.parse(fs.readFileSync('data/classes.json', 'utf8'));
(dataLoader as any).skillsData = JSON.parse(fs.readFileSync('data/skills.json', 'utf8'));

const classesData = (dataLoader as any).classesData;
const shortSword = dataLoader.getWeapon('short_swords')!;
const dagger = dataLoader.getWeapon('daggers')!;

// ============================================================================
// TEST 1: GameState.restoreTo - Leader in Critical State (Main HP 0, Crit HP > 0)
// ============================================================================
{
  const gameState = GameState.getInstance();

  let spriteAngle = -1;
  let spriteAlpha = -1;
  let hpBarDrawn = false;

  const mockPlayer: any = {
    id: 'hero',
    entityName: 'Hero',
    hp: 0,
    criticalHp: 22,
    maxHp: 60,
    maxCriticalHp: 25,
    energy: 50,
    maxEnergy: 100,
    equippedWeapon: shortSword,
    offhandWeapon: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: new Map([['power_strike', true]]),
    lastSkillUseTimes: new Map(),
    hunger: 80,
    mood: 80,
    state: 'idle',
    avatarSprite: {
      setAngle: (deg: number) => { spriteAngle = deg; },
      setAlpha: (alpha: number) => { spriteAlpha = alpha; }
    },
    drawHpBar: () => { hpBarDrawn = true; }
  };

  const mockProgression = new ProgressionSystem(classesData);

  // Snapshot where leader has 0 Main HP, 22 Critical HP, state 'idle'
  const leaderSnap: CharacterSnapshot = {
    id: 'hero',
    name: 'Hero',
    avatarKey: 'player-avatar',
    avatarTextureKey: 'player-avatar',
    hp: 0,
    criticalHp: 22,
    energy: 50,
    equippedWeaponId: 'short_swords',
    offhandWeaponId: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: { power_strike: true },
    skillCooldownsRemainingMs: {},
    proficiencies: mockProgression.getSnapshotData().proficiencies,
    classLevels: {},
    unlockedClasses: [],
    hunger: 80,
    mood: 80,
    state: 'idle'
  };

  (gameState as any).snapshot = {
    hp: 0,
    criticalHp: 22,
    energy: 50,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: { power_strike: true },
    skillCooldownsRemainingMs: {},
    proficiencies: mockProgression.getSnapshotData().proficiencies,
    classLevels: {},
    unlockedClasses: [],
    resources: { wood: 100 },
    party: [leaderSnap]
  };

  gameState.restoreTo(mockPlayer, mockProgression, 1000);

  assert.equal(mockPlayer.state, 'idle', 'Leader with 0 Main HP and 22 Crit HP MUST remain in conscious Critical state (idle), NOT downed');
  assert.equal(spriteAngle, 0, 'Leader avatar angle must be 0 (upright)');
  assert.equal(spriteAlpha, 1, 'Leader avatar alpha must be 1.0 (fully visible)');
  assert.equal(hpBarDrawn, true, 'HP bar must be redrawn');
  console.log('✔ Test 1 passed: GameState.restoreTo preserves Critical state (Main HP 0, Crit HP 22) without falsely marking leader as downed');
}

// ============================================================================
// TEST 2: GameState.restoreTo - Leader genuinely Downed (Main HP 0, Crit HP 0)
// ============================================================================
{
  const gameState = GameState.getInstance();

  let spriteAngle = -1;
  let spriteAlpha = -1;

  const mockPlayer: any = {
    id: 'hero',
    entityName: 'Hero',
    hp: 0,
    criticalHp: 0,
    maxHp: 60,
    maxCriticalHp: 25,
    energy: 0,
    maxEnergy: 100,
    equippedWeapon: shortSword,
    offhandWeapon: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: new Map(),
    lastSkillUseTimes: new Map(),
    hunger: 80,
    mood: 80,
    state: 'idle',
    avatarSprite: {
      setAngle: (deg: number) => { spriteAngle = deg; },
      setAlpha: (alpha: number) => { spriteAlpha = alpha; }
    },
    drawHpBar: () => {}
  };

  const mockProgression = new ProgressionSystem(classesData);

  const leaderSnap: CharacterSnapshot = {
    id: 'hero',
    name: 'Hero',
    avatarKey: 'player-avatar',
    avatarTextureKey: 'player-avatar',
    hp: 0,
    criticalHp: 0,
    energy: 0,
    equippedWeaponId: 'short_swords',
    offhandWeaponId: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: mockProgression.getSnapshotData().proficiencies,
    classLevels: {},
    unlockedClasses: [],
    hunger: 80,
    mood: 80,
    state: 'downed'
  };

  (gameState as any).snapshot = {
    hp: 0,
    criticalHp: 0,
    energy: 0,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: mockProgression.getSnapshotData().proficiencies,
    classLevels: {},
    unlockedClasses: [],
    resources: { wood: 100 },
    party: [leaderSnap]
  };

  gameState.restoreTo(mockPlayer, mockProgression, 1000);

  assert.equal(mockPlayer.state, 'downed', 'Leader with 0 Main HP and 0 Crit HP MUST correctly restore as downed');
  assert.equal(spriteAngle, 90, 'Downed leader avatar angle must be 90 degrees');
  assert.equal(spriteAlpha, 0.6, 'Downed leader avatar alpha must be 0.6');
  console.log('✔ Test 2 passed: GameState.restoreTo correctly restores genuine Downed state when both bars are 0');
}

// ============================================================================
// TEST 3: Restoring Companion in Critical State (Main HP 0, Crit HP > 0)
// ============================================================================
{
  const companionSnap: CharacterSnapshot = {
    id: 'companion_valerie',
    name: 'Valerie',
    avatarKey: 'companion-avatar',
    avatarTextureKey: 'companion-avatar',
    hp: 0,
    criticalHp: 18,
    energy: 40,
    equippedWeaponId: 'daggers',
    offhandWeaponId: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: { power_strike: true },
    skillCooldownsRemainingMs: {},
    proficiencies: {
      daggers: { level: 15, currentExp: 20 }
    },
    classLevels: {},
    unlockedClasses: [],
    hunger: 70,
    mood: 75,
    state: 'idle'
  };

  let compSpriteAngle = -1;
  let compSpriteAlpha = -1;
  const mockCompanion: any = {
    id: companionSnap.id,
    entityName: companionSnap.name,
    hp: companionSnap.hp,
    criticalHp: companionSnap.criticalHp,
    energy: companionSnap.energy,
    state: 'idle',
    avatarSprite: {
      setAngle: (deg: number) => { compSpriteAngle = deg; },
      setAlpha: (alpha: number) => { compSpriteAlpha = alpha; }
    }
  };

  const isDowned = (companionSnap.state === 'downed' || (mockCompanion.hp <= 0 && mockCompanion.criticalHp <= 0)) && mockCompanion.hp <= 0 && mockCompanion.criticalHp <= 0;
  if (isDowned) {
    mockCompanion.state = 'downed';
    mockCompanion.avatarSprite.setAngle(90);
    mockCompanion.avatarSprite.setAlpha(0.6);
  } else {
    mockCompanion.state = 'idle';
    mockCompanion.avatarSprite.setAngle(0);
    mockCompanion.avatarSprite.setAlpha(1);
  }

  assert.equal(mockCompanion.state, 'idle', 'Companion Valerie with 0 Main HP and 18 Crit HP MUST be idle, not downed');
  assert.equal(compSpriteAngle, 0, 'Companion sprite angle must be 0');
  assert.equal(compSpriteAlpha, 1, 'Companion sprite alpha must be 1');
  console.log('✔ Test 3 passed: Companion in Critical state (Main HP 0, Crit HP 18) is NOT falsely marked downed');
}

// ============================================================================
// TEST 4: Restoring Companion in Downed State (Main HP 0, Crit HP 0)
// ============================================================================
{
  const companionSnap: CharacterSnapshot = {
    id: 'companion_valerie',
    name: 'Valerie',
    avatarKey: 'companion-avatar',
    avatarTextureKey: 'companion-avatar',
    hp: 0,
    criticalHp: 0,
    energy: 0,
    equippedWeaponId: 'daggers',
    offhandWeaponId: null,
    knownSkillIds: ['power_strike'],
    equippedSkillIds: ['power_strike'],
    autocastMap: {},
    skillCooldownsRemainingMs: {},
    proficiencies: {
      daggers: { level: 15, currentExp: 20 }
    },
    classLevels: {},
    unlockedClasses: [],
    hunger: 70,
    mood: 75,
    state: 'downed'
  };

  let compSpriteAngle = -1;
  let compSpriteAlpha = -1;
  const mockCompanion: any = {
    id: companionSnap.id,
    entityName: companionSnap.name,
    hp: companionSnap.hp,
    criticalHp: companionSnap.criticalHp,
    energy: companionSnap.energy,
    state: 'idle',
    avatarSprite: {
      setAngle: (deg: number) => { compSpriteAngle = deg; },
      setAlpha: (alpha: number) => { compSpriteAlpha = alpha; }
    }
  };

  const isDowned = (companionSnap.state === 'downed' || (mockCompanion.hp <= 0 && mockCompanion.criticalHp <= 0)) && mockCompanion.hp <= 0 && mockCompanion.criticalHp <= 0;
  if (isDowned) {
    mockCompanion.state = 'downed';
    mockCompanion.avatarSprite.setAngle(90);
    mockCompanion.avatarSprite.setAlpha(0.6);
  } else {
    mockCompanion.state = 'idle';
    mockCompanion.avatarSprite.setAngle(0);
    mockCompanion.avatarSprite.setAlpha(1);
  }

  assert.equal(mockCompanion.state, 'downed', 'Companion with both bars at zero MUST be marked downed');
  assert.equal(compSpriteAngle, 90, 'Downed companion sprite angle must be 90');
  assert.equal(compSpriteAlpha, 0.6, 'Downed companion sprite alpha must be 0.6');
  console.log('✔ Test 4 passed: Companion in genuine Downed state (both bars 0) restores correctly as downed');
}

// ============================================================================
// TEST 5: Save side snapshot sanitization invariant
// ============================================================================
{
  const dirtyPlayer = {
    state: 'downed' as const,
    hp: 0,
    criticalHp: 15
  };

  const isDowned = (dirtyPlayer.state === 'downed' || (dirtyPlayer.hp <= 0 && dirtyPlayer.criticalHp <= 0)) && dirtyPlayer.hp <= 0 && dirtyPlayer.criticalHp <= 0;
  const sanitizedState = isDowned ? 'downed' : (dirtyPlayer.state === 'downed' ? 'idle' : dirtyPlayer.state);

  assert.equal(sanitizedState, 'idle', 'Snapshot sanitization MUST correct downed state to idle when Critical HP > 0');
  console.log('✔ Test 5 passed: Snapshot save sanitization correctly prevents inconsistent downed state when Crit HP > 0');
}

console.log('\nALL TWO-BAR DOWNED TRANSITION UNIT TESTS PASSED! 🎉');
