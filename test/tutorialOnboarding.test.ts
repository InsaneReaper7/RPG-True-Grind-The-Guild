import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser globals mock for Phaser & DOM environment
if (typeof (global as any).window === 'undefined') {
  const localStorageStore: Record<string, string> = {};
  const dummyStorage = {
    getItem: (k: string) => localStorageStore[k] || null,
    setItem: (k: string, v: string) => { localStorageStore[k] = String(v); },
    removeItem: (k: string) => { delete localStorageStore[k]; },
    clear: () => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; }
  };

  (global as any).window = {
    localStorage: dummyStorage,
    location: { href: 'http://localhost' },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  (global as any).document = {
    getElementById: (id: string) => ({
      id,
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
      },
      innerText: '',
      innerHTML: '',
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {}
    }),
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mock fetch for DataLoader
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(path.join(rootDir, cleanPath), 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { TutorialSystem, TUTORIAL_STEPS } = await import('../src/systems/TutorialSystem.ts');

async function runTutorialOnboardingTests() {
  console.log('================================================================');
  console.log('🧭 RUNNING TEST SUITE: TUTORIAL & ONBOARDING (ALPHA-READY)       ');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const tutorial = TutorialSystem.getInstance();

  // ---------------------------------------------------------------------------
  // TEST 1: Initial Tutorial Setup & Step Structure
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Initial Tutorial Setup & Step Structure ---');
  tutorial.reset();

  assert.equal(TUTORIAL_STEPS.length, 10, 'Tutorial must define exactly 10 concise orientation steps');
  assert.equal(tutorial.getCurrentStepIndex(), 0, 'Clean boot begins at step index 0');
  assert.equal(tutorial.getIsCompleted(), false, 'Tutorial starts uncompleted');
  assert.equal(tutorial.getIsDismissed(), false, 'Tutorial starts undismissed');
  assert.equal(tutorial.getIsMinimized(), false, 'Tutorial starts expanded');

  const step0 = tutorial.getCurrentStep();
  assert.ok(step0, 'Step 0 definition must exist');
  assert.equal(step0?.id, 'guild_roster', 'First step is guild_roster');
  assert.equal(step0?.stepNumber, 1, 'First step displays as Step 1');
  assert.equal(step0?.totalSteps, 10);
  assert.ok(step0?.valerieQuote.includes('Summon our third recruit'), 'Valerie prompts Kaelen recruitment');

  console.log('✓ PASS: Tutorial structure initialized with 10 orientation steps starting with Guild Roster.\n');

  // ---------------------------------------------------------------------------
  // TEST 2: Step-by-Step Flow Through Full Cold-Start Loop
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Step Progression Validation Through the Full Loop ---');

  // Step 1 -> 2: Movement & Formation
  let advanced = tutorial.completeStepId('guild_roster');
  assert.equal(advanced, true, 'Completing guild_roster must advance tutorial');
  assert.equal(tutorial.getCurrentStepIndex(), 1);
  const step1 = tutorial.getCurrentStep();
  assert.equal(step1?.id, 'movement');
  assert.ok(step1?.instruction.includes('2×2 block formation'), 'Movement step teaches 2x2 block formation');
  assert.ok(step1?.instruction.includes('WASD'), 'Movement step teaches camera controls');

  // Step 2 -> 3: First Expedition
  advanced = tutorial.completeStepId('movement');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 2);
  const step2 = tutorial.getCurrentStep();
  assert.equal(step2?.id, 'first_expedition');
  assert.ok(step2?.objective.includes('Enter the Dungeon Portal'));

  // Step 3 -> 4: Basic Combat & Autocast & Downed state
  advanced = tutorial.completeStepId('first_expedition');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 3);
  const step3 = tutorial.getCurrentStep();
  assert.equal(step3?.id, 'basic_combat');
  assert.ok(step3?.instruction.includes('autocast'), 'Combat step teaches autocast');
  assert.ok(step3?.instruction.includes('Downed'), 'Combat step teaches what Downed means');
  assert.ok(step3?.instruction.includes('no penalty') || step3?.instruction.includes('zero wipe penalty'), 'Combat step teaches wipes are unpunishing');

  // Step 4 -> 5: Safe Gathering & Channeling
  advanced = tutorial.completeStepId('basic_combat');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 4);
  const step4 = tutorial.getCurrentStep();
  assert.equal(step4?.id, 'safe_gathering');
  assert.ok(step4?.instruction.includes('interrupts'), 'Gathering step teaches channel interrupt');
  assert.ok(step4?.valerieQuote.toLowerCase().includes('genuinely cleared rooms are completely safe'), 'Gathering step teaches cleared rooms are safe');

  // Step 5 -> 6: Return to Outpost
  advanced = tutorial.completeStepId('safe_gathering');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 5);
  const step5 = tutorial.getCurrentStep();
  assert.equal(step5?.id, 'return_outpost');
  assert.ok(step5?.instruction.includes('RP') || step5?.valerieQuote.includes('Research Points'), 'Return step mentions RP');

  // Step 6 -> 7: Outpost Loop — Research
  advanced = tutorial.completeStepId('return_outpost');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 6);
  const step6 = tutorial.getCurrentStep();
  assert.equal(step6?.id, 'research_station');
  assert.ok(step6?.objective.includes('Blacksmithing Station'), 'Research step specifies Blacksmithing Station');
  assert.ok(step6?.valerieQuote.includes('earn RP → research blueprints → build stations → forge gear'), 'Outpost loop clearly summarized');

  // Step 7 -> 8: Outpost Loop — Build Mode
  advanced = tutorial.completeStepId('research_station');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 7);
  const step7 = tutorial.getCurrentStep();
  assert.equal(step7?.id, 'construct_station');
  assert.ok(step7?.instruction.includes('[B]'), 'Build mode step teaches [B] key');

  // Step 8 -> 9: Outpost Loop — Forge Upgrade
  advanced = tutorial.completeStepId('construct_station');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 8);
  const step8 = tutorial.getCurrentStep();
  assert.equal(step8?.id, 'forge_upgrade');
  assert.ok(step8?.objective.includes('forge an upgrade'), 'Forge step teaches weapon upgrade');

  // Step 9 -> 10: Orientation Complete & Knowledge Base
  advanced = tutorial.completeStepId('forge_upgrade');
  assert.equal(advanced, true);
  assert.equal(tutorial.getCurrentStepIndex(), 9);
  const step9 = tutorial.getCurrentStep();
  assert.equal(step9?.id, 'knowledge_base');
  assert.ok(step9?.instruction.includes('[K]'), 'Final step points to Knowledge Base with [K]');
  assert.ok(step9?.valerieQuote.includes('Guild Knowledge Base anytime with [K]'), 'Valerie recommends Knowledge Base');

  // Complete final step
  advanced = tutorial.completeStepId('knowledge_base');
  assert.equal(advanced, true);
  assert.equal(tutorial.getIsCompleted(), true, 'Completing final step marks tutorial complete');
  assert.equal(tutorial.getCurrentStep(), null, 'No active step remains after completion');

  console.log('✓ PASS: All 10 steps sequentially advance and enforce the exact scope of the verified cold-start loop.\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Minimizing and Dismissing
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Minimize & Dismiss Handling ---');
  tutorial.reset();
  assert.equal(tutorial.getIsMinimized(), false);
  tutorial.toggleMinimize();
  assert.equal(tutorial.getIsMinimized(), true, 'Toggle minimize activates minimized flag');
  tutorial.toggleMinimize();
  assert.equal(tutorial.getIsMinimized(), false, 'Toggle minimize deactivates minimized flag');

  assert.equal(tutorial.getIsDismissed(), false);
  tutorial.dismiss();
  assert.equal(tutorial.getIsDismissed(), true, 'Dismiss sets isDismissed to true');
  tutorial.undismiss();
  assert.equal(tutorial.getIsDismissed(), false, 'Undismiss restores isDismissed to false');

  console.log('✓ PASS: Minimizing and dismissing toggle cleanly.\n');

  // ---------------------------------------------------------------------------
  // TEST 4: Persistence with GameState & Save Checkpointing
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Persistence with GameState & Save File Checkpoints ---');
  gameState.resetToDefault(dataLoader.getPlayer());
  tutorial.reset();
  // Advance to step 6 (Research)
  tutorial.completeStepId('guild_roster');
  tutorial.completeStepId('movement');
  tutorial.completeStepId('first_expedition');
  tutorial.completeStepId('basic_combat');
  tutorial.completeStepId('safe_gathering');
  tutorial.completeStepId('return_outpost');
  assert.equal(tutorial.getCurrentStepIndex(), 6);

  // Sync to GameState and save to storage
  tutorial.syncToGameState();
  const tutStateBeforeSave = gameState.getTutorialState();
  assert.equal(tutStateBeforeSave.step, 6);
  assert.equal(tutStateBeforeSave.completed, false);

  const saveOk = gameState.saveToDisk();
  assert.equal(saveOk, true, 'GameState saveToDisk must succeed');

  // Reset in-memory tutorial
  tutorial.reset();
  assert.equal(tutorial.getCurrentStepIndex(), 0);

  // Load from disk
  const loadOk = gameState.loadFromDisk();
  assert.equal(loadOk, true, 'GameState loadFromDisk must succeed');
  const tutStateAfterLoad = gameState.getTutorialState();
  assert.equal(tutStateAfterLoad.step, 6, 'Tutorial step 6 must be restored from storage');

  tutorial.loadFromState(tutStateAfterLoad.step, tutStateAfterLoad.completed, tutStateAfterLoad.dismissed);
  assert.equal(tutorial.getCurrentStepIndex(), 6);
  assert.equal(tutorial.getCurrentStep()?.id, 'research_station');

  // Complete tutorial and verify completed flag persists
  tutorial.completeTutorial();
  assert.equal(tutorial.getIsCompleted(), true);
  tutorial.syncToGameState();
  gameState.saveToDisk();

  gameState.loadFromDisk();
  const tutStateCompleted = gameState.getTutorialState();
  assert.equal(tutStateCompleted.completed, true, 'Tutorial completed state must persist across sessions');

  console.log('✓ PASS: Tutorial step and completion status persist flawlessly through storage checkpoints.\n');

  console.log('================================================================');
  console.log('🎉 ALL TUTORIAL & ONBOARDING UNIT TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runTutorialOnboardingTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
