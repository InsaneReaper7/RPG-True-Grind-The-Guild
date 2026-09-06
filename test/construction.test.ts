import assert from 'node:assert/strict';
import { BuildingSystem, CONSTRUCTION_TIERS } from '../src/systems/BuildingSystem.ts';
import { RoomClassifier } from '../src/systems/RoomClassifier.ts';
import type { BuildableDef, RoomRuleDef } from '../src/types/game.ts';

console.log('--- RUNNING CONSTRUCTION SKILL & ROOM CLASSIFICATION UNIT TESTS ---');

const testBuildables: BuildableDef[] = [
  { id: 'floor', name: 'Wood Floor', woodCost: 2, footprint: { width: 1, height: 1 }, rotatable: true, indoorRequired: false, walkable: true, description: '' },
  { id: 'wall', name: 'Wood Wall', woodCost: 5, footprint: { width: 1, height: 1 }, rotatable: false, indoorRequired: false, walkable: false, description: '' },
  { id: 'door', name: 'Wood Door', woodCost: 8, footprint: { width: 1, height: 1 }, rotatable: true, indoorRequired: false, walkable: true, description: '' },
  { id: 'bed', name: 'Bed', woodCost: 15, footprint: { width: 1, height: 1 }, rotatable: true, indoorRequired: true, walkable: false, roomTag: 'bedroom', description: '' },
  { id: 'research_station', name: 'Research Station', woodCost: 20, footprint: { width: 1, height: 1 }, rotatable: true, indoorRequired: true, walkable: false, roomTag: 'study', description: '' }
];

// Test 1: Construction Tier Progression Thresholds (0, 10, 30, 60, 90)
{
  assert.equal(BuildingSystem.getConstructionTier(0).tier, 'untrained');
  assert.equal(BuildingSystem.getConstructionTier(9).tier, 'untrained');
  assert.equal(BuildingSystem.getConstructionTier(10).tier, 'novice');
  assert.equal(BuildingSystem.getConstructionTier(29).tier, 'novice');
  assert.equal(BuildingSystem.getConstructionTier(30).tier, 'adept');
  assert.equal(BuildingSystem.getConstructionTier(59).tier, 'adept');
  assert.equal(BuildingSystem.getConstructionTier(60).tier, 'expert');
  assert.equal(BuildingSystem.getConstructionTier(89).tier, 'expert');
  assert.equal(BuildingSystem.getConstructionTier(90).tier, 'master');
  assert.equal(BuildingSystem.getConstructionTier(250).tier, 'master');

  console.log('✔ Test 1 passed: Construction skill tiers accurately advance at 0, 10, 30, 60, and 90 EXP');
}

// Test 2: Build Cost Discounts across all 5 tiers
{
  // Wall (baseCost 5)
  assert.equal(BuildingSystem.getEffectiveBuildCost(5, 0), 5);  // Untrained: 100% -> 5
  assert.equal(BuildingSystem.getEffectiveBuildCost(5, 10), 4); // Novice: 90% floor(4.5) -> 4
  assert.equal(BuildingSystem.getEffectiveBuildCost(5, 30), 3); // Adept: 75% floor(3.75) -> 3
  assert.equal(BuildingSystem.getEffectiveBuildCost(5, 60), 3); // Expert: 60% floor(3.0) -> 3
  assert.equal(BuildingSystem.getEffectiveBuildCost(5, 90), 2); // Master: 50% floor(2.5) -> 2

  // Research Station (baseCost 20)
  assert.equal(BuildingSystem.getEffectiveBuildCost(20, 0), 20);  // Untrained: 20
  assert.equal(BuildingSystem.getEffectiveBuildCost(20, 10), 18); // Novice: 18
  assert.equal(BuildingSystem.getEffectiveBuildCost(20, 30), 15); // Adept: 15
  assert.equal(BuildingSystem.getEffectiveBuildCost(20, 60), 12); // Expert: 12
  assert.equal(BuildingSystem.getEffectiveBuildCost(20, 90), 10); // Master: 10

  // Bed (baseCost 15)
  assert.equal(BuildingSystem.getEffectiveBuildCost(15, 0), 15);  // Untrained: 15
  assert.equal(BuildingSystem.getEffectiveBuildCost(15, 10), 13); // Novice: 13
  assert.equal(BuildingSystem.getEffectiveBuildCost(15, 30), 11); // Adept: 11
  assert.equal(BuildingSystem.getEffectiveBuildCost(15, 60), 9);  // Expert: 9
  assert.equal(BuildingSystem.getEffectiveBuildCost(15, 90), 7);  // Master: 7

  console.log('✔ Test 2 passed: Build costs are visibly cheaper at higher tiers across all buildables');
}

// Test 3: Demolish Refund Scaling (Untrained gets ~50%, scaling up to 100% at Master)
{
  // Fresh untrained character demolishing structures:
  // Wall (costPaid 5) -> floor(5 * 0.5) = 2 wood (~40-50%, NOT full 5 wood!)
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(5, 0), 2);
  // Bed (costPaid 15) -> floor(15 * 0.5) = 7 wood (~50%)
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(15, 0), 7);
  // Research Station (costPaid 20) -> floor(20 * 0.5) = 10 wood (exactly 50%)
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(20, 0), 10);
  // Door (costPaid 8) -> floor(8 * 0.5) = 4 wood (50%)
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(8, 0), 4);

  // Master tier gets 100% of cost paid back:
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(10, 90), 10);
  assert.equal(BuildingSystem.getEffectiveDemolishRefund(2, 90), 2);

  console.log('✔ Test 3 passed: Untrained character gets ~50% refund, scaling to 100% at Master');
}

// Test 4: STRICT INVARIANT PROPERTY CHECK (Anti-duplication exploit guarantee)
// Assert that refund <= costPaid across EVERY buildable and EVERY tier
{
  for (const b of testBuildables) {
    for (const tier of CONSTRUCTION_TIERS) {
      const costPaid = BuildingSystem.getEffectiveBuildCost(b.woodCost, tier.minExp);
      const refund = BuildingSystem.getEffectiveDemolishRefund(costPaid, tier.minExp);

      // Invariant 1: Refund must NEVER exceed cost paid
      assert.ok(
        refund <= costPaid,
        `EXPLOIT DETECTED on ${b.name} at tier ${tier.name}: refund (${refund}) > costPaid (${costPaid})!`
      );

      // Invariant 2: Net gain must be <= 0 (no positive-sum duplication)
      const net = refund - costPaid;
      assert.ok(net <= 0, `Net gain on ${b.name} at ${tier.name} is ${net} (must be <= 0)`);

      // Invariant 3: Master tier must break even exactly
      if (tier.tier === 'master') {
        assert.equal(refund, costPaid, `Master tier on ${b.name} must break even exactly (refund === costPaid)`);
      }
    }
  }

  console.log('✔ Test 4 passed: Anti-duplication invariant holds for all items and tiers (refund <= costPaid)');
}

// Test 5: Generic Automatic Room Classification Engine
{
  const rules: RoomRuleDef[] = [
    {
      id: 'cooking_dining',
      name: 'Cooking & Dining Area',
      priority: 100,
      requiredTags: ['cooking', 'dining'],
      description: 'Combination rule'
    },
    {
      id: 'bedroom',
      name: 'Bedroom',
      priority: 10,
      requiredTags: ['bedroom'],
      description: 'Bed room'
    },
    {
      id: 'study',
      name: 'Study',
      priority: 10,
      requiredTags: ['study'],
      description: 'Study room'
    }
  ];

  const classifier = new RoomClassifier(rules);

  // 5a. Bed tag -> "Bedroom"
  const bedroomRes = classifier.classify(['bedroom']);
  assert.equal(bedroomRes.name, 'Bedroom');
  assert.equal(bedroomRes.ruleId, 'bedroom');

  // 5b. Study tag -> "Study"
  const studyRes = classifier.classify(['study']);
  assert.equal(studyRes.name, 'Study');
  assert.equal(studyRes.ruleId, 'study');

  // 5c. Combination rule: cooking + dining tags present -> "Cooking & Dining Area"
  const comboRes = classifier.classify(['cooking', 'dining']);
  assert.equal(comboRes.name, 'Cooking & Dining Area');
  assert.equal(comboRes.ruleId, 'cooking_dining');

  // 5d. Combination rule priority over single tags
  const comboWithExtraRes = classifier.classify(['cooking', 'dining', 'bedroom']);
  assert.equal(comboWithExtraRes.name, 'Cooking & Dining Area'); // Priority 100 beats 10

  // 5e. Enclosed room without tagged items -> "Enclosed Room"
  const emptyRes = classifier.classify([]);
  assert.equal(emptyRes.name, 'Enclosed Room');

  // 5f. Extensibility: Adding a new rule via data without engine rewrite
  const extendedRules: RoomRuleDef[] = [
    ...rules,
    {
      id: 'alchemist_lab',
      name: 'Alchemy Laboratory',
      priority: 50,
      requiredTags: ['alchemy', 'herbology']
    }
  ];
  classifier.setRules(extendedRules);
  const alchRes = classifier.classify(['alchemy', 'herbology']);
  assert.equal(alchRes.name, 'Alchemy Laboratory');
  assert.equal(alchRes.ruleId, 'alchemist_lab');

  console.log('✔ Test 5 passed: Generic Room Classification correctly matches single tags, combinations, and data-driven rule additions');
}

console.log('\nALL 5 CONSTRUCTION & ROOM CLASSIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
