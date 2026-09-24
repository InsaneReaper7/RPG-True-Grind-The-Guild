import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Dynamically import modules
const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { ResearchSystem } = await import('../src/systems/ResearchSystem.ts');
const { LockpickingSystem } = await import('../src/systems/LockpickingSystem.ts');

async function runResearchPointsEarnabilityTests() {
  console.log('================================================================');
  console.log('RUNNING RESEARCH POINTS EARNABILITY TEST SUITE');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ---------------------------------------------------------------------------
  // TEST 1: Data Definitions & Tier Ranges (Elite, Epic, Boss)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Enemy Definition & Tier Kill RP Calculations ---');
  const orcDef = dataLoader.getEnemy('orc_warrior')!;
  const voidDef = dataLoader.getEnemy('void_knight')!;
  const colossusDef = dataLoader.getEnemy('abyssal_colossus')!;
  const wolfDef = dataLoader.getEnemy('wolf')!;

  assert.ok(orcDef, 'orc_warrior must exist in enemies.json');
  assert.ok(voidDef, 'void_knight must exist in enemies.json');
  assert.ok(colossusDef, 'abyssal_colossus must exist in enemies.json');
  assert.ok(wolfDef, 'wolf must exist in enemies.json');

  // Verify data properties in enemies.json
  assert.deepStrictEqual(orcDef.researchPoints, { min: 3, max: 6 }, 'Elite orc_warrior must have researchPoints { min: 3, max: 6 }');
  assert.deepStrictEqual(voidDef.researchPoints, { min: 7, max: 10 }, 'Epic void_knight must have researchPoints { min: 7, max: 10 }');
  assert.strictEqual(colossusDef.researchPoints, 20, 'Boss abyssal_colossus must have flat researchPoints 20');
  assert.strictEqual(wolfDef.researchPoints, undefined, 'Common wolf must have no kill researchPoints');

  // 1A: 1000 simulated rolls for Elite (3-6)
  const eliteRolls: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const rp = CombatSystem.calculateResearchPointsForEnemy(orcDef);
    assert.ok(rp >= 3 && rp <= 6, `Elite RP roll ${rp} must be in [3, 6]`);
    eliteRolls.push(rp);
  }
  const minElite = Math.min(...eliteRolls);
  const maxElite = Math.max(...eliteRolls);
  assert.strictEqual(minElite, 3, 'Elite roll min should hit 3');
  assert.strictEqual(maxElite, 6, 'Elite roll max should hit 6');
  console.log(`  ✓ Elite (orc_warrior): 1000 rolls all bounded within [3, 6] (min: ${minElite}, max: ${maxElite})`);

  // 1B: 1000 simulated rolls for Epic (7-10)
  const epicRolls: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const rp = CombatSystem.calculateResearchPointsForEnemy(voidDef);
    assert.ok(rp >= 7 && rp <= 10, `Epic RP roll ${rp} must be in [7, 10]`);
    epicRolls.push(rp);
  }
  const minEpic = Math.min(...epicRolls);
  const maxEpic = Math.max(...epicRolls);
  assert.strictEqual(minEpic, 7, 'Epic roll min should hit 7');
  assert.strictEqual(maxEpic, 10, 'Epic roll max should hit 10');
  console.log(`  ✓ Epic (void_knight): 1000 rolls all bounded within [7, 10] (min: ${minEpic}, max: ${maxEpic})`);

  // 1C: 1000 simulated rolls for Boss (guaranteed flat 20)
  for (let i = 0; i < 1000; i++) {
    const rp = CombatSystem.calculateResearchPointsForEnemy(colossusDef);
    assert.strictEqual(rp, 20, `Boss RP must always be guaranteed flat 20`);
  }
  console.log('  ✓ Boss (abyssal_colossus): 1000 rolls all strictly returned flat 20 RP');

  // 1D: Common enemies yield 0 RP on kill
  assert.strictEqual(CombatSystem.calculateResearchPointsForEnemy(wolfDef), 0, 'Common enemy kill must yield 0 RP');
  console.log('  ✓ Common (wolf): returns 0 RP on kill');

  // 1E: Distinct tiers confirmed: max(Elite) <= min(Epic), and Boss > Epic
  assert.ok(maxElite < minEpic, 'Elite and Epic must be visibly distinct non-overlapping bands');
  assert.ok(20 > maxEpic, 'Boss flat tier (20) must be distinctly higher than Epic max (10)');
  console.log('  ✓ Distinct reward tiers confirmed: Elite [3-6] < Epic [7-10] < Boss [20 flat]');

  // ---------------------------------------------------------------------------
  // TEST 2: First-Time Discovery Hooks & Anti-Farming Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: First-Time Discovery Hooks & Anti-Farming ---');
  const gameState = GameState.getInstance();
  gameState.resetDiscoveries();
  // Clear any existing RP for isolation
  while (gameState.getResearchPoints() > 0) {
    gameState.consumeResearchPoints(gameState.getResearchPoints());
  }
  assert.strictEqual(gameState.getResearchPoints(), 0, 'RP starts at 0 for test');

  // 2A: Enemy encounter discovery
  const firstWolf = gameState.recordEnemyEncountered('wolf');
  assert.strictEqual(firstWolf, true, 'First wolf encounter must return true');
  assert.strictEqual(gameState.getResearchPoints(), 1, 'First wolf encounter must award exactly +1 RP');

  // Duplicate wolf encounters must NOT award RP
  for (let i = 0; i < 20; i++) {
    const dupWolf = gameState.recordEnemyEncountered('wolf');
    assert.strictEqual(dupWolf, false, 'Duplicate wolf encounter must return false');
    assert.strictEqual(gameState.getResearchPoints(), 1, 'Duplicate wolf encounter must NOT add any RP');
  }
  console.log('  ✓ 2A PASS: First enemy encounter awards +1 RP; 20 duplicate encounters award 0 RP (anti-farming verified).');

  // 2B: Cooking recipe discovery
  const firstStew = gameState.discoverCookingRecipe('hearty_stew');
  assert.strictEqual(firstStew, true, 'First cooking recipe discovery must return true');
  assert.strictEqual(gameState.getResearchPoints(), 2, 'First cooking discovery awards +1 RP (total: 2)');

  const dupStew = gameState.discoverCookingRecipe('hearty_stew');
  assert.strictEqual(dupStew, false, 'Duplicate cooking recipe must return false');
  assert.strictEqual(gameState.getResearchPoints(), 2, 'Duplicate cooking discovery awards 0 RP');
  console.log('  ✓ 2B PASS: Cooking recipe discovery awards +1 RP only once.');

  // 2C: Alchemy recipe discovery
  const firstAlchemy = gameState.discoverAlchemyRecipe('major_mana_potion');
  assert.strictEqual(firstAlchemy, true, 'First alchemy recipe discovery must return true');
  assert.strictEqual(gameState.getResearchPoints(), 3, 'First alchemy discovery awards +1 RP (total: 3)');

  const dupAlchemy = gameState.discoverAlchemyRecipe('major_mana_potion');
  assert.strictEqual(dupAlchemy, false, 'Duplicate alchemy recipe must return false');
  assert.strictEqual(gameState.getResearchPoints(), 3, 'Duplicate alchemy discovery awards 0 RP');
  console.log('  ✓ 2C PASS: Alchemy recipe discovery awards +1 RP only once.');

  // 2D: Gathering node discovery
  const firstNode = gameState.discoverGatheringNode('foraging_bush');
  assert.strictEqual(firstNode, true, 'First gathering node discovery must return true');
  assert.strictEqual(gameState.getResearchPoints(), 4, 'First node discovery awards +1 RP (total: 4)');

  const dupNode = gameState.discoverGatheringNode('foraging_bush');
  assert.strictEqual(dupNode, false, 'Duplicate gathering node discovery must return false');
  assert.strictEqual(gameState.getResearchPoints(), 4, 'Duplicate node discovery awards 0 RP');
  console.log('  ✓ 2D PASS: Gathering node discovery awards +1 RP only once.');

  // 2E: Proficiency discovery
  const firstProf = gameState.discoverProficiency('katana');
  assert.strictEqual(firstProf, true, 'First proficiency discovery must return true');
  assert.strictEqual(gameState.getResearchPoints(), 5, 'First proficiency discovery awards +1 RP (total: 5)');

  const dupProf = gameState.discoverProficiency('katana');
  assert.strictEqual(dupProf, false, 'Duplicate proficiency discovery must return false');
  assert.strictEqual(gameState.getResearchPoints(), 5, 'Duplicate proficiency discovery awards 0 RP');
  console.log('  ✓ 2E PASS: Proficiency discovery awards +1 RP only once.');

  // 2F: Status effect discovery
  const firstStatus = gameState.discoverStatusEffect('stun');
  assert.strictEqual(firstStatus, true, 'First status effect discovery must return true');
  assert.strictEqual(gameState.getResearchPoints(), 6, 'First status effect discovery awards +1 RP (total: 6)');

  const dupStatus = gameState.discoverStatusEffect('stun');
  assert.strictEqual(dupStatus, false, 'Duplicate status effect discovery must return false');
  assert.strictEqual(gameState.getResearchPoints(), 6, 'Duplicate status effect discovery awards 0 RP');
  console.log('  ✓ 2F PASS: Status effect discovery awards +1 RP only once.');

  // ---------------------------------------------------------------------------
  // TEST 3: Combat Enemy Defeat Hooks in CombatSystem
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Combat Enemy Defeat Integration ---');
  // Mock dummy killer player and target enemy
  const mockKiller: any = {
    entityName: 'Hero',
    x: 100,
    y: 100,
    progression: {
      addProficiencyExp: () => ({ leveledUp: false }),
      getProficiencyLevel: () => 1,
      addClassExp: () => ({ leveledUp: false }),
      getClassLevel: () => 1
    },
    isDualWielding: () => false,
    activeClass: 'fencer',
    checkSkillUnlocks: () => {}
  };

  const initialRP = gameState.getResearchPoints();

  // 3A: Defeat an Elite Enemy
  const mockEliteEnemy: any = {
    entityName: 'Orc Warrior',
    x: 120,
    y: 100,
    enemyData: orcDef
  };
  Object.setPrototypeOf(mockEliteEnemy, (await import('../src/entities/Enemy.ts')).Enemy.prototype);

  // Invoke handleTargetDefeated through CombatSystem instance
  const mockScene: any = {
    add: {
      text: () => ({ setOrigin: () => ({ destroy: () => {} }) }),
      circle: () => ({ setDepth: () => ({ destroy: () => {} }) }),
      line: () => ({ setOrigin: () => ({ setLineWidth: () => ({ setDepth: () => ({ destroy: () => {} }) }) }) })
    },
    tweens: { add: () => {} }
  };
  const combatSys = new CombatSystem(mockScene, [mockKiller], [mockEliteEnemy]);
  (combatSys as any).handleTargetDefeated(mockKiller, mockEliteEnemy, 'short_swords');

  const rpAfterElite = gameState.getResearchPoints();
  const eliteGained = rpAfterElite - initialRP;
  assert.ok(eliteGained >= 3 && eliteGained <= 6, `Elite defeat must award 3-6 RP, got: ${eliteGained}`);
  console.log(`  ✓ 3A PASS: Defeating Elite (Orc Warrior) awarded +${eliteGained} RP (within [3, 6]).`);

  // 3B: Defeat an Epic Enemy
  const mockEpicEnemy: any = {
    entityName: 'Void Knight',
    x: 120,
    y: 100,
    enemyData: voidDef
  };
  Object.setPrototypeOf(mockEpicEnemy, (await import('../src/entities/Enemy.ts')).Enemy.prototype);
  (combatSys as any).handleTargetDefeated(mockKiller, mockEpicEnemy, 'short_swords');

  const rpAfterEpic = gameState.getResearchPoints();
  const epicGained = rpAfterEpic - rpAfterElite;
  assert.ok(epicGained >= 7 && epicGained <= 10, `Epic defeat must award 7-10 RP, got: ${epicGained}`);
  console.log(`  ✓ 3B PASS: Defeating Epic (Void Knight) awarded +${epicGained} RP (within [7, 10]).`);

  // 3C: Defeat a Boss Enemy
  const mockBossEnemy: any = {
    entityName: 'Abyssal Colossus',
    x: 120,
    y: 100,
    enemyData: colossusDef
  };
  Object.setPrototypeOf(mockBossEnemy, (await import('../src/entities/Enemy.ts')).Enemy.prototype);
  (combatSys as any).handleTargetDefeated(mockKiller, mockBossEnemy, 'short_swords');

  const rpAfterBoss = gameState.getResearchPoints();
  const bossGained = rpAfterBoss - rpAfterEpic;
  assert.strictEqual(bossGained, 20, `Boss defeat must award flat 20 RP, got: ${bossGained}`);
  console.log(`  ✓ 3C PASS: Defeating Boss (Abyssal Colossus) awarded guaranteed flat +${bossGained} RP.`);

  // 3D: Defeat a Common Enemy (0 RP)
  const mockCommonEnemy: any = {
    entityName: 'Wolf',
    x: 120,
    y: 100,
    enemyData: wolfDef
  };
  Object.setPrototypeOf(mockCommonEnemy, (await import('../src/entities/Enemy.ts')).Enemy.prototype);
  (combatSys as any).handleTargetDefeated(mockKiller, mockCommonEnemy, 'short_swords');

  const rpAfterCommon = gameState.getResearchPoints();
  assert.strictEqual(rpAfterCommon, rpAfterBoss, 'Common kill must award 0 RP');
  console.log('  ✓ 3D PASS: Defeating Common enemy (Wolf) awarded 0 kill RP.');

  // ---------------------------------------------------------------------------
  // TEST 4: Lockbox Reward Table Integrity (10-20 RP Established Pool)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Lockbox Reward Table Integrity (Milestone 38 Pool) ---');
  const lockSystem = LockpickingSystem.getInstance();
  let totalLockboxRP = 0;
  for (let i = 0; i < 20; i++) {
    const loot = lockSystem.rollLockedBoxLoot();
    const rpEntry = loot.find((entry) => entry.type === 'research_points');
    assert.ok(rpEntry, `Opening ${i + 1} must include a research_points entry`);
    assert.ok(rpEntry.count >= 10 && rpEntry.count <= 20, `Lockbox RP must be between 10 and 20, got: ${rpEntry.count}`);
    totalLockboxRP += rpEntry.count;
  }
  assert.ok(totalLockboxRP >= 200, `20 lockboxes must yield >= 200 RP, got: ${totalLockboxRP}`);
  console.log(`  ✓ 4 PASS: 20 opened lockboxes yielded a total of ${totalLockboxRP} RP (mean: ${(totalLockboxRP / 20).toFixed(1)} RP/box), confirming existing 10-20 RP prize table.`);

  // ---------------------------------------------------------------------------
  // TEST 5: Cold-Start Viability (Zero-Elite Run & First Tier Unlock)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Cold-Start Viability Scenarios ---');
  const researchSystem = ResearchSystem.getInstance();
  const researchNodes = dataLoader.getResearchNodes();
  const diggingNode = researchNodes.find((n) => n.id === 'research_digging')!;
  const blacksmithNode = researchNodes.find((n) => n.id === 'research_blacksmithing_station')!;
  assert.ok(diggingNode, 'research_digging node must exist');
  assert.ok(blacksmithNode, 'research_blacksmithing_station node must exist');
  assert.strictEqual(diggingNode.cost, 10, 'Digging node cost must be 10 RP');
  assert.strictEqual(blacksmithNode.cost, 10, 'Blacksmith node cost must be 10 RP');

  // Scenario 5A: Discovery ALONE (Zero Elites, unlucky RNG)
  // Even if player encounters 0 Elites in their first dungeon session,
  // exploring the floor and discovering standard monster types, nodes, and effects
  // must accumulate at least 10 RP to unlock Tier 1 of the Research Tree.
  {
    gameState.resetDiscoveries();
    while (gameState.getResearchPoints() > 0) {
      gameState.consumeResearchPoints(gameState.getResearchPoints());
    }
    // Starting fresh: 0 RP
    assert.strictEqual(gameState.getResearchPoints(), 0, 'Fresh cold start: 0 RP');

    // Player explores dungeon and encounters 8 Common enemy species:
    const commonSpecies = ['wolf', 'slime', 'goblin', 'goblin_archer', 'skeleton', 'skeleton_archer', 'undead', 'spider'];
    for (const id of commonSpecies) {
      gameState.recordEnemyEncountered(id);
    }
    assert.strictEqual(gameState.getResearchPoints(), 8, '8 common enemy discoveries = 8 RP');

    // Player discovers 2 gathering nodes:
    gameState.discoverGatheringNode('foraging_bush');
    gameState.discoverGatheringNode('woodcutting_tree');
    assert.strictEqual(gameState.getResearchPoints(), 10, '8 enemies + 2 gathering nodes = 10 RP');

    // Player discovers 1 status effect (e.g. spider poison or skeleton bleed):
    gameState.discoverStatusEffect('poison');
    assert.strictEqual(gameState.getResearchPoints(), 11, 'Total RP reached 11 from discoveries alone');

    // Verify player can now unlock the Digging node (10 RP)!
    const checkCanUnlock = researchSystem.canUnlockNode(diggingNode);
    assert.strictEqual(checkCanUnlock.canUnlock, true, 'Player must be eligible to unlock Digging node');

    const unlockResult = researchSystem.unlockNode(diggingNode);
    assert.strictEqual(unlockResult.success, true, 'Digging node successfully unlocked!');
    assert.strictEqual(gameState.getResearchPoints(), 1, '1 RP remaining after unlocking 10 RP node');
    assert.strictEqual(gameState.isResearchCompleted('research_digging'), true, 'Digging research marked complete');
    console.log('  ✓ 5A PASS: Zero-Elite run reached 11 RP through discovery bonuses alone and unlocked Digging (10 RP)!');
  }

  // Scenario 5B: Normal Dungeon Run with 1 Elite Kill
  {
    gameState.resetDiscoveries();
    while (gameState.getResearchPoints() > 0) {
      gameState.consumeResearchPoints(gameState.getResearchPoints());
    }

    // Encounter 3 common enemies (3 RP) + 1 gathering node (1 RP) = 4 RP
    gameState.recordEnemyEncountered('wolf');
    gameState.recordEnemyEncountered('slime');
    gameState.recordEnemyEncountered('goblin');
    gameState.discoverGatheringNode('mining_rock');
    assert.strictEqual(gameState.getResearchPoints(), 4);

    // Encounter Elite Orc Warrior (1 RP discovery)
    gameState.recordEnemyEncountered('orc_warrior');
    assert.strictEqual(gameState.getResearchPoints(), 5);

    // Defeat Elite Orc Warrior (awards 3 to 6 RP)
    const mockOrc: any = { entityName: 'Orc Warrior', x: 0, y: 0, enemyData: orcDef };
    Object.setPrototypeOf(mockOrc, (await import('../src/entities/Enemy.ts')).Enemy.prototype);
    (combatSys as any).handleTargetDefeated(mockKiller, mockOrc, 'short_swords');

    const totalAfterElite = gameState.getResearchPoints();
    assert.ok(totalAfterElite >= 8 && totalAfterElite <= 11, `RP after 1 Elite defeat should be 8-11, got: ${totalAfterElite}`);

    // Discover 1 more enemy or status effect to reach >= 10 RP if roll was 3 or 4:
    if (gameState.getResearchPoints() < 10) {
      gameState.discoverStatusEffect('bleed');
      gameState.recordEnemyEncountered('skeleton');
    }
    assert.ok(gameState.getResearchPoints() >= 10, 'Player easily reached >= 10 RP with 1 Elite encounter');

    const unlockBlacksmith = researchSystem.unlockNode(blacksmithNode);
    assert.strictEqual(unlockBlacksmith.success, true, 'Blacksmith Station unlocked successfully!');
    assert.strictEqual(gameState.isResearchCompleted('research_blacksmithing_station'), true);
    console.log(`  ✓ 5B PASS: Standard run with 1 Elite kill reached ${totalAfterElite} RP and unlocked Blacksmith Station!`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: onResearchPointsChanged Event Dispatch
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: onResearchPointsChanged Event Dispatch ---');
  let lastEvent: { newPoints: number; delta: number } | null = null;
  gameState.onResearchPointsChanged = (newPoints, delta) => {
    lastEvent = { newPoints, delta };
  };

  const beforeAdd = gameState.getResearchPoints();
  gameState.addResearchPoints(5);
  assert.deepStrictEqual(lastEvent, { newPoints: beforeAdd + 5, delta: 5 }, 'Callback must report correct newPoints and delta on add');

  gameState.consumeResearchPoints(3);
  assert.deepStrictEqual(lastEvent, { newPoints: beforeAdd + 2, delta: -3 }, 'Callback must report correct newPoints and negative delta on consume');
  console.log('  ✓ 6 PASS: onResearchPointsChanged callback correctly dispatches on additions and consumptions.');

  console.log('\n================================================================');
  console.log('ALL RESEARCH POINTS EARNABILITY TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================');
}

runResearchPointsEarnabilityTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
