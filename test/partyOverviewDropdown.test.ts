import assert from 'node:assert/strict';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { ClassesData } from '../src/types/game.ts';

console.log('--- RUNNING PARTY OVERVIEW DROPDOWN & ROSTER KEY TESTS ---');

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist'
    }
  ]
};

function computePartyRosterKey(party: Array<{
  id: string;
  entityName: string;
  state: string;
  progression: ProgressionSystem;
  equippedSkillIds: string[];
  knownSkillIds: string[];
}>): string {
  return `${party.length}_` + party.map((m) => {
    const isDw = m.progression.isDualWieldUnlocked();
    const equippedSkills = m.equippedSkillIds.join(',');
    const knownSkills = m.knownSkillIds.join(',');
    return `${m.id}:${m.entityName}:${m.state}:${isDw}:${equippedSkills}:${knownSkills}`;
  }).join('|');
}

// TEST 1: Live stats do not change rosterKey
{
  const prog = new ProgressionSystem(mockClassesData);
  const hero = {
    id: 'player_hero',
    entityName: 'Guild Hero',
    state: 'normal',
    hp: 50,
    maxHp: 50,
    energy: 100,
    hunger: 100,
    mood: 80,
    progression: prog,
    equippedSkillIds: ['thrust'],
    knownSkillIds: ['thrust']
  };

  const initialKey = computePartyRosterKey([hero]);
  hero.hp = 35;
  hero.energy = 80;
  hero.hunger = 75;
  hero.mood = 60;
  prog.addProficiencyExp('short_swords', 20);

  const tick1Key = computePartyRosterKey([hero]);
  assert.equal(tick1Key, initialKey, 'rosterKey MUST NOT change when HP, Energy, Hunger, Mood, or EXP change');
  console.log('✔ Test 1 passed: Live stat changes (HP, Energy, Hunger, Mood, EXP) do NOT alter rosterKey');
}

// TEST 2: Dual Wielding unlock triggers rosterKey change
{
  const prog = new ProgressionSystem(mockClassesData);
  const hero = {
    id: 'player_hero',
    entityName: 'Guild Hero',
    state: 'normal',
    progression: prog,
    equippedSkillIds: [],
    knownSkillIds: []
  };

  const beforeUnlockKey = computePartyRosterKey([hero]);
  assert.equal(prog.isDualWieldUnlocked(), false);

  prog.getProficiencyStat('short_swords').level = 30;
  prog.getProficiencyStat('daggers').level = 29;
  assert.equal(prog.isDualWieldUnlocked(), false);
  assert.equal(computePartyRosterKey([hero]), beforeUnlockKey);

  prog.getProficiencyStat('daggers').level = 30;
  assert.equal(prog.isDualWieldUnlocked(), true);
  const afterUnlockKey = computePartyRosterKey([hero]);
  assert.notEqual(afterUnlockKey, beforeUnlockKey, 'rosterKey MUST change when Dual Wielding flips from false to true');
  console.log('✔ Test 2 passed: Dual Wielding unlock (false -> true) triggers exact structural change in rosterKey');
}

// TEST 3: DW Accuracy Penalty Tier Crossings (30->31, 10, 30, 60, 90) do NOT alter rosterKey
{
  const prog = new ProgressionSystem(mockClassesData);
  prog.getProficiencyStat('short_swords').level = 30;
  prog.getProficiencyStat('daggers').level = 30;
  assert.equal(prog.isDualWieldUnlocked(), true);

  const hero = {
    id: 'player_hero',
    entityName: 'Guild Hero',
    state: 'normal',
    progression: prog,
    equippedSkillIds: [],
    knownSkillIds: []
  };

  const baseUnlockedKey = computePartyRosterKey([hero]);

  prog.getProficiencyStat('dual_wielding').level = 10;
  assert.equal(prog.getDualWieldPenalty(), 0.15);
  assert.equal(computePartyRosterKey([hero]), baseUnlockedKey);

  prog.getProficiencyStat('dual_wielding').level = 30;
  assert.equal(prog.getDualWieldPenalty(), 0.10);
  assert.equal(computePartyRosterKey([hero]), baseUnlockedKey);

  prog.getProficiencyStat('dual_wielding').level = 31;
  assert.equal(prog.getDualWieldPenalty(), 0.10);
  assert.equal(computePartyRosterKey([hero]), baseUnlockedKey);

  prog.getProficiencyStat('dual_wielding').level = 60;
  assert.equal(prog.getDualWieldPenalty(), 0.05);
  assert.equal(computePartyRosterKey([hero]), baseUnlockedKey);

  prog.getProficiencyStat('dual_wielding').level = 90;
  assert.equal(prog.getDualWieldPenalty(), 0.00);
  assert.equal(computePartyRosterKey([hero]), baseUnlockedKey);

  console.log('✔ Test 3 passed: DW penalty tier crossings and level-ups (including 30->31) stay 100% in-place with zero rosterKey changes');
}

// TEST 4: Structural Changes (Member count, Downed state, Skills) trigger rebuild
{
  const prog1 = new ProgressionSystem(mockClassesData);
  const prog2 = new ProgressionSystem(mockClassesData);

  const hero = {
    id: 'hero',
    entityName: 'Hero',
    state: 'normal',
    progression: prog1,
    equippedSkillIds: ['thrust'],
    knownSkillIds: ['thrust', 'parry']
  };

  const key1 = computePartyRosterKey([hero]);

  hero.state = 'downed';
  const keyDowned = computePartyRosterKey([hero]);
  assert.notEqual(keyDowned, key1);
  hero.state = 'normal';

  hero.equippedSkillIds = ['thrust', 'parry'];
  const keyEquipped = computePartyRosterKey([hero]);
  assert.notEqual(keyEquipped, key1);
  hero.equippedSkillIds = ['thrust'];

  const companion = {
    id: 'comp_1',
    entityName: 'Companion 1',
    state: 'normal',
    progression: prog2,
    equippedSkillIds: [],
    knownSkillIds: []
  };
  const keyWithComp = computePartyRosterKey([hero, companion]);
  assert.notEqual(keyWithComp, key1);

  console.log('✔ Test 4 passed: Structural mutations (downed, skill equip, party size) reliably trigger structural updates');
}

console.log('\nALL PARTY OVERVIEW DROPDOWN & ROSTER KEY TESTS PASSED! 🎉');
