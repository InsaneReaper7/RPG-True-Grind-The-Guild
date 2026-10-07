import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import type { Requirement } from '../src/types/game.ts';

describe('Requirement Evaluator Extensions', () => {
  it('evaluates triggerCount requirements correctly', () => {
    const progression = new ProgressionSystem();
    const req: Requirement = {
      type: 'triggerCount',
      target: 'revive_ally',
      value: 5
    };

    assert.strictEqual(progression.evaluateRequirement(req), false);

    for (let i = 0; i < 4; i++) {
      progression.recordTrigger('revive_ally');
    }
    assert.strictEqual(progression.getTriggerCount('revive_ally'), 4);
    assert.strictEqual(progression.evaluateRequirement(req), false);

    progression.recordTrigger('revive_ally');
    assert.strictEqual(progression.getTriggerCount('revive_ally'), 5);
    assert.strictEqual(progression.evaluateRequirement(req), true);
  });

  it('evaluates oneOf requirement correctly', () => {
    const progression = new ProgressionSystem();
    const req: Requirement = {
      type: 'oneOf',
      of: [
        { type: 'proficiency', target: 'fire_magic', value: 10 },
        { type: 'proficiency', target: 'ice_magic', value: 10 }
      ]
    };

    assert.strictEqual(progression.evaluateRequirement(req), false);

    // Level up fire_magic to 10
    for (let i = 0; i < 100; i++) {
      progression.addProficiencyExp('fire_magic', 50);
      if (progression.getProficiencyLevel('fire_magic') >= 10) break;
    }
    assert.ok(progression.getProficiencyLevel('fire_magic') >= 10);
    assert.strictEqual(progression.evaluateRequirement(req), true);
  });

  it('evaluates anyOf requirement with count correctly', () => {
    const progression = new ProgressionSystem();
    const req: Requirement = {
      type: 'anyOf',
      count: 2,
      of: [
        { type: 'proficiency', target: 'swords', value: 10 },
        { type: 'proficiency', target: 'shields', value: 10 },
        { type: 'proficiency', target: 'heavy_armor', value: 10 }
      ]
    };

    assert.strictEqual(progression.evaluateRequirement(req), false);

    // Satisfy swords
    for (let i = 0; i < 100; i++) {
      progression.addProficiencyExp('swords', 50);
      if (progression.getProficiencyLevel('swords') >= 10) break;
    }
    assert.strictEqual(progression.evaluateRequirement(req), false); // 1 / 2

    // Satisfy shields
    for (let i = 0; i < 100; i++) {
      progression.addProficiencyExp('shields', 50);
      if (progression.getProficiencyLevel('shields') >= 10) break;
    }
    assert.strictEqual(progression.evaluateRequirement(req), true); // 2 / 2
  });
});
