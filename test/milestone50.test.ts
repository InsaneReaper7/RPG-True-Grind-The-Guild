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
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { HUD } = await import('../src/ui/HUD.ts');

async function runTests() {
  console.log('--- Starting Milestone 50 Test Suite ---');

  // Load DataLoader definitions
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -------------------------------------------------------------
  // Test 1: Key 'K' Collision Resolution & Debug Action Panel Migration
  // -------------------------------------------------------------
  console.log('\nTest 1: Key K collision resolution and debug action migration');
  {
    const mainSceneCode = fs.readFileSync('src/scenes/MainScene.ts', 'utf8');
    assert.strictEqual(
      mainSceneCode.includes('this.kKey'),
      false,
      'MainScene must no longer declare or bind this.kKey'
    );
    assert.strictEqual(
      mainSceneCode.includes('dealDebugDamageToEnemy'),
      true,
      'MainScene must expose dealDebugDamageToEnemy method'
    );
    assert.strictEqual(
      mainSceneCode.includes('__dealDebugDamage'),
      true,
      'MainScene must expose window.__dealDebugDamage helper'
    );

    const indexHtml = fs.readFileSync('index.html', 'utf8');
    assert.strictEqual(
      indexHtml.includes('id="open-knowledge-btn"'),
      true,
      'index.html must include open-knowledge-btn [K] in HUD'
    );
    assert.strictEqual(
      indexHtml.includes('id="debug-btn-deal-damage"'),
      true,
      'index.html must include debug-btn-deal-damage in Debug Panel'
    );
    assert.strictEqual(
      indexHtml.includes('id="knowledge-base-modal"'),
      true,
      'index.html must include knowledge-base-modal markup'
    );
    console.log('✓ Key K collision cleanly removed from MainScene and migrated to Debug Panel.');
  }

  // -------------------------------------------------------------
  // Test 2: Strict Only-Discovered-Content & Initial Discovery State
  // -------------------------------------------------------------
  console.log('\nTest 2: Strict only-discovered-content philosophy');
  {
    const gameState = GameState.getInstance();
    gameState.resetDiscoveries();

    // Fresh game state: initial weapon should be discovered (short_swords)
    assert.strictEqual(
      gameState.isProficiencyDiscovered('short_swords'),
      true,
      'Starting weapon short_swords should be initially discovered'
    );

    // Locked or unencountered content must NOT be discovered
    assert.strictEqual(
      gameState.isEnemyEncountered('wolf'),
      false,
      'Unencountered enemy "wolf" must NOT be marked as encountered'
    );
    assert.strictEqual(
      gameState.isEnemyEncountered('slime'),
      false,
      'Unencountered enemy "slime" must NOT be marked as encountered'
    );
    assert.strictEqual(
      gameState.isStatusEffectDiscovered('bleed'),
      false,
      'Unencountered status effect "bleed" must NOT be discovered'
    );
    assert.strictEqual(
      gameState.isStatusEffectDiscovered('poison'),
      false,
      'Unencountered status effect "poison" must NOT be discovered'
    );
    assert.strictEqual(
      gameState.isGatheringNodeDiscovered('mining_rock'),
      false,
      'Unvisited gathering node "mining_rock" must NOT be discovered'
    );
    assert.strictEqual(
      gameState.isProficiencyDiscovered('katana'),
      false,
      'Undiscovered weapon "katana" must NOT be discovered initially'
    );
    console.log('✓ Undiscovered items, enemies, nodes, and effects remain strictly undiscovered.');
  }

  // -------------------------------------------------------------
  // Test 3: Combat First-Encounter Trigger for Bestiary
  // -------------------------------------------------------------
  console.log('\nTest 3: Bestiary first-encountered combat trigger');
  {
    const gameState = GameState.getInstance();
    gameState.resetDiscoveries();

    assert.strictEqual(gameState.isEnemyEncountered('goblin'), false);

    // Simulate mock enemy
    const mockGoblin: any = {
      id: 'goblin_instance_1',
      enemyDefId: 'goblin',
      enemyData: { id: 'goblin', name: 'Goblin' },
      getEnemyDefId: () => 'goblin',
      entityName: 'Goblin',
      isDead: () => false
    };

    CombatSystem.recordBestiaryEncounter(mockGoblin);

    assert.strictEqual(
      gameState.isEnemyEncountered('goblin'),
      true,
      'Encountering goblin in combat must record goblin in Bestiary'
    );
    assert.deepStrictEqual(gameState.getEncounteredEnemies(), ['goblin']);

    // Calling again does not duplicate
    CombatSystem.recordBestiaryEncounter(mockGoblin);
    assert.strictEqual(gameState.getEncounteredEnemies().length, 1);
    console.log('✓ Combat encounter trigger correctly records new Bestiary entries without duplicates.');
  }

  // -------------------------------------------------------------
  // Test 4: Status Effects, Gathering Nodes, Recipes & Skills Discovery
  // -------------------------------------------------------------
  console.log('\nTest 4: Status effects, gathering nodes, recipes and skills discovery hooks');
  {
    const gameState = GameState.getInstance();
    gameState.resetDiscoveries();

    // 1. Status effect discovery
    assert.strictEqual(gameState.isStatusEffectDiscovered('burn'), false);
    gameState.discoverStatusEffect('burn');
    assert.strictEqual(gameState.isStatusEffectDiscovered('burn'), true);
    assert.deepStrictEqual(gameState.getDiscoveredStatusEffects(), ['burn']);

    // 2. Gathering node discovery
    assert.strictEqual(gameState.isGatheringNodeDiscovered('woodcutting_tree'), false);
    gameState.discoverGatheringNode('woodcutting_tree');
    assert.strictEqual(gameState.isGatheringNodeDiscovered('woodcutting_tree'), true);
    assert.deepStrictEqual(gameState.getDiscoveredGatheringNodes(), ['woodcutting_tree']);

    // 3. Cooking recipe discovery
    assert.strictEqual(gameState.isCookingRecipeDiscovered('hearty_stew'), false);
    gameState.discoverCookingRecipe('hearty_stew');
    assert.strictEqual(gameState.isCookingRecipeDiscovered('hearty_stew'), true);

    // 4. Proficiency discovery
    assert.strictEqual(gameState.isProficiencyDiscovered('evasion'), false);
    gameState.discoverProficiency('evasion');
    assert.strictEqual(gameState.isProficiencyDiscovered('evasion'), true);
    console.log('✓ All discovery hooks correctly update GameState discovery records.');
  }

  // -------------------------------------------------------------
  // Test 5: Live Multi-Floor Continue-Chain Persistence
  // -------------------------------------------------------------
  console.log('\nTest 5: Live multi-floor Continue-chain persistence for Codex discovery state');
  {
    const gameState = GameState.getInstance();
    gameState.resetDiscoveries();

    // Populate discoveries across all categories
    gameState.recordEnemyEncountered('wolf');
    gameState.recordEnemyEncountered('skeleton');
    gameState.discoverProficiency('katana');
    gameState.discoverProficiency('parry');
    gameState.discoverProficiency('lockpicking');
    gameState.discoverStatusEffect('bleed');
    gameState.discoverStatusEffect('stun');
    gameState.discoverGatheringNode('foraging_bush');
    gameState.discoverGatheringNode('mining_rock');
    gameState.discoverCookingRecipe('travelers_bread');

    const mockProgression = new ProgressionSystem();
    const mockPlayer: any = {
      id: 'hero',
      entityName: 'Hero',
      hp: 50,
      maxHp: 50,
      criticalHp: 25,
      maxCriticalHp: 25,
      energy: 100,
      maxEnergy: 100,
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: new Map(),
      lastSkillUseTimes: new Map(),
      bookLearnedSkills: new Set(),
      hunger: 100,
      mood: 100,
      equippedWeapon: { id: 'short_swords' },
      offhandWeapon: null,
      activeClass: null,
      recalculateMaxHp: () => {},
      recalculateStats: () => {},
      drawHpBar: () => {},
      getSnapshot: () => ({ id: 'hero', name: 'Hero', hp: 50, criticalHp: 25, energy: 100 })
    };

    // 1. Export snapshot (simulating floor transition or game save)
    gameState.saveSnapshot(mockPlayer, mockProgression, 0);
    const snapshot = gameState.getSnapshot();
    assert.ok(snapshot, 'Snapshot must not be null after saveSnapshot');

    assert.ok(snapshot.encounteredEnemies, 'Snapshot must contain encounteredEnemies');
    assert.ok(snapshot.discoveredProficiencies, 'Snapshot must contain discoveredProficiencies');
    assert.ok(snapshot.discoveredStatusEffects, 'Snapshot must contain discoveredStatusEffects');
    assert.ok(snapshot.discoveredGatheringNodes, 'Snapshot must contain discoveredGatheringNodes');
    assert.ok(snapshot.discoveredCookingRecipes, 'Snapshot must contain discoveredCookingRecipes');

    assert.deepStrictEqual(snapshot.encounteredEnemies.sort(), ['skeleton', 'wolf']);
    assert.strictEqual(snapshot.discoveredProficiencies.includes('katana'), true);
    assert.strictEqual(snapshot.discoveredProficiencies.includes('parry'), true);
    assert.strictEqual(snapshot.discoveredProficiencies.includes('lockpicking'), true);
    assert.deepStrictEqual(snapshot.discoveredStatusEffects.sort(), ['bleed', 'stun']);
    assert.deepStrictEqual(snapshot.discoveredGatheringNodes.sort(), ['foraging_bush', 'mining_rock']);
    assert.strictEqual(snapshot.discoveredCookingRecipes.includes('travelers_bread'), true);

    // 2. Wipe state (simulating scene restart or fresh session)
    gameState.resetDiscoveries();
    assert.strictEqual(gameState.isEnemyEncountered('wolf'), false);
    assert.strictEqual(gameState.isProficiencyDiscovered('katana'), false);
    assert.strictEqual(gameState.isStatusEffectDiscovered('bleed'), false);
    assert.strictEqual(gameState.isGatheringNodeDiscovered('foraging_bush'), false);

    // 3. Restore from snapshot (simulating Continue / Next Floor load)
    gameState.restoreTo(mockPlayer, mockProgression, 1000);

    assert.strictEqual(
      gameState.isEnemyEncountered('wolf'),
      true,
      'Encountered enemy wolf must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isEnemyEncountered('skeleton'),
      true,
      'Encountered enemy skeleton must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isProficiencyDiscovered('katana'),
      true,
      'Discovered weapon katana must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isProficiencyDiscovered('parry'),
      true,
      'Discovered skill parry must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isStatusEffectDiscovered('bleed'),
      true,
      'Discovered status effect bleed must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isGatheringNodeDiscovered('foraging_bush'),
      true,
      'Discovered gathering node foraging_bush must persist across Continue/floor transition'
    );
    assert.strictEqual(
      gameState.isCookingRecipeDiscovered('travelers_bread'),
      true,
      'Discovered cooking recipe travelers_bread must persist across Continue/floor transition'
    );
    console.log('✓ Discovery state survives snapshot serialization, scene restart, and floor transitions intact.');
  }

  // -------------------------------------------------------------
  // Test 6: HUD Knowledge Base Modal Controls & DOM Integration
  // -------------------------------------------------------------
  console.log('\nTest 6: Knowledge Base Modal HUD controls and tab switching');
  {
    // Setup mock DOM elements for HUD test
    const modalEl: any = {
      classList: {
        classes: new Set<string>(),
        add(c: string) { this.classes.add(c); },
        remove(c: string) { this.classes.delete(c); },
        contains(c: string) { return this.classes.has(c); }
      }
    };
    const entriesContainerEl: any = {
      innerHTML: '',
      children: []
    };
    const searchInputEl: any = {
      value: ''
    };

    const countEls: Record<string, { innerText: string }> = {
      'knowledge-count-weapons': { innerText: '0' },
      'knowledge-count-classes': { innerText: '0' },
      'knowledge-count-hidden_skills': { innerText: '0' },
      'knowledge-count-gathering': { innerText: '0' },
      'knowledge-count-crafting': { innerText: '0' },
      'knowledge-count-status_effects': { innerText: '0' },
      'knowledge-count-bestiary': { innerText: '0' }
    };

    (global as any).document.getElementById = (id: string) => {
      if (id === 'knowledge-base-modal') return modalEl;
      if (id === 'knowledge-entries-container') return entriesContainerEl;
      if (id === 'knowledge-search-input') return searchInputEl;
      if (countEls[id]) return countEls[id];
      return null;
    };
    (global as any).document.querySelectorAll = () => [];

    const mockScene: any = {
      events: { on: () => {}, emit: () => {} },
      time: { now: 0 }
    };
    const mockProgression = new ProgressionSystem();
    const mockPlayer: any = {
      entityName: 'Hero',
      hp: 50,
      maxHp: 50,
      energy: 100,
      maxEnergy: 100,
      hunger: 100,
      maxHunger: 100,
      mood: 100,
      maxMood: 100,
      progression: mockProgression,
      equippedWeapon: { id: 'short_swords', name: 'Short Swords', category: 'melee_1h' },
      offhandWeapon: null
    };

    const hud = new HUD(mockScene, mockPlayer, mockProgression);

    // Initial state: modal is closed
    assert.strictEqual(hud.isKnowledgeBaseModalOpen(), false);

    // Open modal
    hud.openKnowledgeBaseModal();
    assert.strictEqual(hud.isKnowledgeBaseModalOpen(), true);

    // Toggle modal closes it
    hud.toggleKnowledgeBaseModal();
    assert.strictEqual(hud.isKnowledgeBaseModalOpen(), false);

    // Reopen and switch tabs
    hud.openKnowledgeBaseModal();
    assert.strictEqual(hud.isKnowledgeBaseModalOpen(), true);

    hud.setKnowledgeBaseTab('bestiary');
    // Bestiary has 'wolf' and 'skeleton' discovered from Test 5
    assert.strictEqual(entriesContainerEl.innerHTML.includes('Wolf'), true);
    assert.strictEqual(entriesContainerEl.innerHTML.includes('Skeleton'), true);

    // Close modal
    hud.closeKnowledgeBaseModal();
    assert.strictEqual(hud.isKnowledgeBaseModalOpen(), false);

    console.log('✓ Modal open, close, toggle, tab switching, and content rendering operate correctly.');
  }

  console.log('\n=========================================');
  console.log('All Milestone 50 tests passed successfully!');
  console.log('=========================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
