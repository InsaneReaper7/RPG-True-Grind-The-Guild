import assert from 'node:assert/strict';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import type { ClassesData } from '../src/types/game.ts';

console.log('--- RUNNING ALL-SKILLS EXP DEBUG TOOLING UNIT TESTS ---');

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist',
      hiddenSkillBonuses: {
        counterattack: 0.05
      }
    }
  ]
};

// Test 1: All 9 trainable stats are present at initialization with Level 0 and 0 EXP
{
  const progression = new ProgressionSystem(mockClassesData);
  const stats = progression.getAllProficiencyStats();

  const expectedIds = [
    'short_swords',
    'daggers',
    'dual_wielding',
    'construction',
    'alchemy',
    'evasion',
    'parry',
    'block',
    'counterattack',
    'resilience',
    'health_regen',
    'mana_regen'
  ];

  assert.equal(stats.size, expectedIds.length, `Must contain exactly ${expectedIds.length} trainable stats at initialization`);

  for (const id of expectedIds) {
    assert.ok(stats.has(id), `Missing expected trainable stat: '${id}'`);
    const stat = stats.get(id)!;
    assert.equal(stat.level, 0, `'${id}' must start at Level 0`);
    assert.equal(stat.currentExp, 0, `'${id}' must start at 0 EXP`);

    const nextExp = LevelingSystem.expForNextLevel(stat.level);
    const line = `${id}: Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)`;
    assert.equal(line, `${id}: Level 0 (0/50 EXP)`, `Formatted line for '${id}' mismatch`);
  }

  console.log('✔ Test 1 passed: All 9 trainable stats present at initialization in Level 0 (0/50 EXP) state');
}

// Test 2: Partial EXP on hidden skill visible in debug panel stats while HUD reveal remains FALSE
{
  const progression = new ProgressionSystem(mockClassesData);

  // Hidden skill is initially unrevealed on real HUD
  assert.equal(progression.isHiddenSkillRevealed('evasion'), false, 'Evasion must be unrevealed at Level 0');

  // Add 13 EXP (e.g. from 13 evasion procs)
  progression.addProficiencyExp('evasion', 13);

  const stats = progression.getAllProficiencyStats();
  const evasionStat = stats.get('evasion')!;
  const nextExp = LevelingSystem.expForNextLevel(evasionStat.level);
  const formattedLine = `evasion: Level ${evasionStat.level} (${evasionStat.currentExp}/${nextExp} EXP)`;

  // Verify exact format required: "evasion: Level 0 (13/50 EXP)"
  assert.equal(formattedLine, 'evasion: Level 0 (13/50 EXP)', 'Format must match "evasion: Level 0 (13/50 EXP)"');

  // Verify real HUD curtain rule is NOT violated (still unrevealed)
  assert.equal(progression.isHiddenSkillRevealed('evasion'), false, 'Evasion must remain unrevealed on HUD while Level 0');

  console.log('✔ Test 2 passed: Partial EXP (13/50 EXP) correctly reflected while hidden from regular HUD');
}

// Test 3: Reaching Level 1 triggers onSkillDiscovered and updates debug format to Level 1
{
  const progression = new ProgressionSystem(mockClassesData);
  let discoveredEventFired = false;
  let discoveredSkillId = '';

  progression.onSkillDiscovered((e) => {
    discoveredEventFired = true;
    discoveredSkillId = e.skillId;
  });

  // Add 50 EXP to parry
  progression.addProficiencyExp('parry', 50);

  assert.ok(discoveredEventFired, 'onSkillDiscovered event must fire when reaching Level 1');
  assert.equal(discoveredSkillId, 'parry', 'Discovered skill must be parry');
  assert.equal(progression.isHiddenSkillRevealed('parry'), true, 'Parry must now be revealed on regular HUD');

  const stats = progression.getAllProficiencyStats();
  const parryStat = stats.get('parry')!;
  const nextExp = LevelingSystem.expForNextLevel(parryStat.level);
  const formattedLine = `parry: Level ${parryStat.level} (${parryStat.currentExp}/${nextExp} EXP)`;

  // Level 1 nextExp is 50 + 1 * 4 = 54
  assert.equal(formattedLine, 'parry: Level 1 (0/54 EXP)', 'Format must update to "parry: Level 1 (0/54 EXP)"');

  console.log('✔ Test 3 passed: Level 1 triggers Skill Discovered and reflects in debug panel');
}

// Test 4: Live multi-stat updates across all trainable stats
{
  const progression = new ProgressionSystem(mockClassesData);

  progression.addProficiencyExp('short_swords', 24);
  progression.addProficiencyExp('construction', 10);
  progression.addProficiencyExp('block', 7);
  progression.addProficiencyExp('counterattack', 3);
  progression.addProficiencyExp('resilience', 45);
  progression.addProficiencyExp('health_regen', 1);
  progression.addProficiencyExp('mana_regen', 5);

  const stats = progression.getAllProficiencyStats();
  const lines = Array.from(stats.entries()).map(([id, stat]) => {
    const nextExp = LevelingSystem.expForNextLevel(stat.level);
    return `${id}: Level ${stat.level} (${stat.currentExp}/${nextExp} EXP)`;
  });

  assert.ok(lines.includes('short_swords: Level 0 (24/50 EXP)'));
  assert.ok(lines.includes('construction: Level 0 (10/50 EXP)'));
  assert.ok(lines.includes('block: Level 0 (7/50 EXP)'));
  assert.ok(lines.includes('counterattack: Level 0 (3/50 EXP)'));
  assert.ok(lines.includes('resilience: Level 0 (45/50 EXP)'));
  assert.ok(lines.includes('health_regen: Level 0 (1/50 EXP)'));
  assert.ok(lines.includes('mana_regen: Level 0 (5/50 EXP)'));

  console.log('✔ Test 4 passed: All-skills overview cleanly formats every entry with live partial EXP');
}

console.log('\nALL ALL-SKILLS DEBUG TOOLING TESTS PASSED! 🎉\n');
