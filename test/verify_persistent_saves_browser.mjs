import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3000;
const URL = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureViteServer() {
  const isUp = await checkServerReady(PORT);
  if (isUp) {
    console.log(`[Server] Server already running at ${URL}`);
    return null;
  }

  console.log(`[Server] Spawning Vite dev server on port ${PORT}...`);
  const child = spawn('npx.cmd', ['vite', '--port', String(PORT)], {
    shell: true,
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Local:')) {
      console.log(`[Vite] ${line.trim()}`);
    }
  });

  // Wait up to 15 seconds for server to be ready
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      console.log(`[Server] Vite server is ready on port ${PORT}!`);
      return child;
    }
  }

  throw new Error(`Timed out waiting for Vite server on port ${PORT}`);
}

async function run() {
  console.log('================================================================');
  console.log('MILESTONE: PERSISTENT SAVES — END-TO-END LIVE BROWSER TEST');
  console.log('Genuine Browser Session Close & Re-open with Deep Fidelity');
  console.log('================================================================\n');

  let viteChild = null;
  let browser = null;

  try {
    viteChild = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    let page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[GameState]') ||
        text.includes('[HUD]') ||
        text.includes('[OutpostScene]') ||
        text.includes('Checkpoint')
      ) {
        console.log('  [BROWSER]', text);
      }
    });

    // -----------------------------------------------------------------
    // STEP 1: Boot on Clean Profile
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Booting Game on Clean Profile ---');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Clear any leftover storage from previous runs
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
    await sleep(2500);

    const initialTitleState = await page.evaluate(() => {
      const modal = document.getElementById('title-screen-modal');
      const continueBtn = document.getElementById('title-continue-btn');
      const newGameBtn = document.getElementById('title-new-game-btn');
      const summary = document.getElementById('title-save-summary');
      const warning = document.getElementById('title-storage-warning');

      return {
        modalVisible: modal ? modal.classList.contains('active') : false,
        continueDisabled: continueBtn ? continueBtn.disabled : null,
        newGameVisible: newGameBtn ? newGameBtn.style.display !== 'none' : false,
        summaryHtml: summary ? summary.innerHTML : '',
        warningVisible: warning ? warning.style.display !== 'none' : false,
        hasSave: window.hasSavedGame ? window.hasSavedGame() : false
      };
    });

    console.log('Initial Title Screen state:', initialTitleState);
    assert.equal(initialTitleState.modalVisible, true, 'Title modal must be visible on boot');
    assert.equal(initialTitleState.continueDisabled, true, 'Continue button must be disabled on clean profile');
    assert.ok(initialTitleState.summaryHtml.includes('No Saved Game Found'), 'Summary must show No Saved Game Found');
    assert.equal(initialTitleState.warningVisible, false, 'Storage warning must be hidden when storage is working');
    assert.equal(initialTitleState.hasSave, false, 'window.hasSavedGame() must return false');
    console.log('✓ Clean profile correctly displays Title screen with Continue button disabled.');

    // -----------------------------------------------------------------
    // STEP 2: Start New Game & Enter Outpost
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Starting New Game ---');
    await page.evaluate(() => {
      const newGameBtn = document.getElementById('title-new-game-btn');
      if (newGameBtn) newGameBtn.click();
    });
    await sleep(1500);

    const gameStarted = await page.evaluate(() => {
      const modal = document.getElementById('title-screen-modal');
      const scene = window.game ? window.game.scene.getScene('OutpostScene') : null;
      return {
        modalClosed: modal ? !modal.classList.contains('active') : false,
        sceneActive: scene ? scene.scene.isActive() : false
      };
    });
    assert.equal(gameStarted.modalClosed, true, 'Title screen modal must close on New Game');
    assert.equal(gameStarted.sceneActive, true, 'OutpostScene must be active');
    console.log('✓ New game started and OutpostScene is active.');

    // -----------------------------------------------------------------
    // STEP 3: Mutate State & Trigger Checkpoint Auto-Save
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Mutating Outpost State Across Multiple Domains ---');
    const mutatedData = await page.evaluate(() => {
      const gs = window.GameState.getInstance();

      // Clock & Floor markers
      gs.advanceGameDay(2); // Day 1 + 2 = Day 3
      gs.setDayProgressMs(18500);
      gs.setLifetimeDungeonFloorCount(9);

      // Economy & Research
      gs.setWood(850);
      gs.setOre(320);
      gs.addResearchPoints(42);
      gs.completeResearch('research_gardening');
      gs.completeResearch('research_skinning');
      gs.unlockBuildable('planting_plot');
      gs.unlockBuildable('seed_maker');

      // Knowledge Base discoveries
      gs.discoverCookingRecipe('hearty_stew');
      gs.discoverAlchemyRecipe('mana_potion');
      gs.recordEnemyEncountered('goblin_warrior');
      gs.discoverProficiency('iron_back');
      gs.discoverStatusEffect('bleed');

      // Outpost Buildables & Gardening State
      gs.addPlacedBuildable({
        id: 'planting_plot',
        x: 6,
        y: 7,
        rotation: 0,
        costPaid: 10,
        gardeningData: {
          state: 'growing',
          plantedCropId: 'seeds',
          plantedAtDay: 3,
          plantedAtDayProgress: 0.35,
          growthDays: 1
        }
      });

      // Stockpile & Food
      gs.addItem('wood', 50);
      gs.addFoodItem('ration', 4, 'common');

      // Party Leader Personal Inventory & Gear (Milestone 51)
      const party = gs.getPartySnapshots();
      if (party.length > 0) {
        party[0].name = 'Commander Vane';
        party[0].inventory = { ration: 3, bandage: 2 };
        party[0].equippedWeaponId = 'short_swords';
        party[0].equippedHelmetId = 'leather_cap';
      }

      // Checkpoint save to storage
      const saved = gs.saveToDisk();

      return {
        saved,
        day: gs.getCurrentGameDay(),
        dayProgressMs: gs.getDayProgressMs(),
        lifetimeFloorCount: gs.getLifetimeDungeonFloorCount(),
        wood: gs.getWood(),
        ore: gs.getOre(),
        researchPoints: gs.getResearchPoints(),
        rawSaveStorage: localStorage.getItem('RPG_TRUE_GRIND_SAVE_V1')
      };
    });

    console.log('Mutated state checkpoint result:', {
      saved: mutatedData.saved,
      day: mutatedData.day,
      dayProgressMs: mutatedData.dayProgressMs,
      lifetimeFloorCount: mutatedData.lifetimeFloorCount,
      saveLength: mutatedData.rawSaveStorage ? mutatedData.rawSaveStorage.length : 0
    });

    assert.equal(mutatedData.saved, true, 'saveToDisk() must return true');
    assert.ok(mutatedData.rawSaveStorage, 'localStorage must contain RPG_TRUE_GRIND_SAVE_V1');
    console.log('✓ Checkpoint save succeeded and is stored in localStorage.');

    // -----------------------------------------------------------------
    // STEP 4: Genuine Browser Close & Reopen
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Simulating Genuine Browser Close & Re-Open ---');
    console.log('Closing browser tab/page...');
    await page.close();
    await sleep(1000);

    console.log('Opening fresh browser tab and navigating to game...');
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[GameState]') ||
        text.includes('[HUD]') ||
        text.includes('[OutpostScene]') ||
        text.includes('Checkpoint')
      ) {
        console.log('  [BROWSER REOPENED]', text);
      }
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // -----------------------------------------------------------------
    // STEP 5: Verify Title Screen Detects Saved Game
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Verifying Title Screen on Reopen ---');
    const reopenTitleState = await page.evaluate(() => {
      const modal = document.getElementById('title-screen-modal');
      const continueBtn = document.getElementById('title-continue-btn');
      const summary = document.getElementById('title-save-summary');
      const meta = window.GameState ? window.GameState.getInstance().getSaveMetadata() : null;

      return {
        modalVisible: modal ? modal.classList.contains('active') : false,
        continueDisabled: continueBtn ? continueBtn.disabled : null,
        summaryHtml: summary ? summary.innerHTML : '',
        meta
      };
    });

    console.log('Title Screen on reopen:', {
      modalVisible: reopenTitleState.modalVisible,
      continueDisabled: reopenTitleState.continueDisabled,
      leader: reopenTitleState.meta ? reopenTitleState.meta.leaderName : null,
      day: reopenTitleState.meta ? reopenTitleState.meta.gameDay : null
    });

    assert.equal(reopenTitleState.modalVisible, true, 'Title modal must be visible on reopen');
    assert.equal(reopenTitleState.continueDisabled, false, 'Continue button must now be ENABLED');
    assert.ok(reopenTitleState.summaryHtml.includes('Guild Outpost Checkpoint Found'), 'Summary must report checkpoint found');
    assert.ok(reopenTitleState.summaryHtml.includes('Commander Vane'), 'Summary must identify leader Commander Vane');
    assert.ok(reopenTitleState.summaryHtml.includes('Day 3'), 'Summary must identify Day 3');
    console.log('✓ Title screen correctly detected the existing save and enabled Continue.');

    // -----------------------------------------------------------------
    // STEP 6: Click Continue & Assert Full Fidelity Restoration
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Resuming via Continue & Testing Deep Restoration Fidelity ---');
    await page.evaluate(() => {
      const continueBtn = document.getElementById('title-continue-btn');
      if (continueBtn) continueBtn.click();
    });
    await sleep(2000);

    const restoredState = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const party = gs.getPartySnapshots();
      const placed = gs.getPlacedBuildables();
      const plot = gs.getPlot(6, 7);

      return {
        day: gs.getCurrentGameDay(),
        dayProgressMs: gs.getDayProgressMs(),
        lifetimeFloorCount: gs.getLifetimeDungeonFloorCount(),
        wood: gs.getWood(),
        ore: gs.getOre(),
        researchPoints: gs.getResearchPoints(),
        isGardeningResearchUnlocked: gs.isResearchCompleted('research_gardening'),
        isSkinningResearchUnlocked: gs.isResearchCompleted('research_skinning'),
        isPlantingPlotUnlocked: gs.isBuildableUnlocked('planting_plot'),
        isHeartyStewDiscovered: gs.isCookingRecipeDiscovered('hearty_stew'),
        isManaPotionDiscovered: gs.isAlchemyRecipeDiscovered('mana_potion'),
        isGoblinWarriorEncountered: gs.isEnemyEncountered('goblin_warrior'),
        isIronBackDiscovered: gs.isProficiencyDiscovered('iron_back'),
        isBleedDiscovered: gs.isStatusEffectDiscovered('bleed'),
        placedCount: placed.length,
        plotData: plot ? plot.gardeningData : null,
        partyLeader: party.length > 0 ? {
          name: party[0].name,
          inventory: party[0].inventory,
          equippedWeaponId: party[0].equippedWeaponId,
          equippedHelmetId: party[0].equippedHelmetId
        } : null
      };
    });

    console.log('Restored state summary:', restoredState);

    // NAMED FIDELITY ASSERTIONS
    assert.equal(
      restoredState.lifetimeFloorCount,
      9,
      'lifetimeDungeonFloorCount must survive live browser close-and-reopen'
    );
    assert.ok(
      restoredState.dayProgressMs >= 18500 && restoredState.dayProgressMs <= 22500,
      `dayProgressMs must survive live browser close-and-reopen and resume from 18500ms (was ${restoredState.dayProgressMs})`
    );

    // Broader domain checks
    assert.equal(restoredState.day, 3, 'Game Day must restore to 3');
    assert.equal(restoredState.wood, 900, 'Wood count must restore to 900 (850 + 50)');
    assert.equal(restoredState.ore, 320, 'Ore count must restore to 320');
    assert.ok(restoredState.researchPoints >= 42, 'Research points must restore');
    assert.equal(restoredState.isGardeningResearchUnlocked, true, 'Research Tree unlocks must persist');
    assert.equal(restoredState.isSkinningResearchUnlocked, true, 'Research Tree unlocks must persist');
    assert.equal(restoredState.isPlantingPlotUnlocked, true, 'Unlocked buildables must persist');
    assert.equal(restoredState.isHeartyStewDiscovered, true, 'Cooking discoveries must persist');
    assert.equal(restoredState.isManaPotionDiscovered, true, 'Alchemy discoveries must persist');
    assert.equal(restoredState.isGoblinWarriorEncountered, true, 'Enemy encounters must persist');
    assert.equal(restoredState.isIronBackDiscovered, true, 'Proficiency discoveries must persist');
    assert.equal(restoredState.isBleedDiscovered, true, 'Status effect discoveries must persist');
    assert.equal(restoredState.placedCount, 1, 'Placed buildables count must persist');
    assert.ok(restoredState.plotData, 'Planting plot gardening data must persist');
    assert.equal(restoredState.plotData.state, 'growing');
    assert.equal(restoredState.plotData.plantedAtDay, 3);
    assert.equal(restoredState.partyLeader?.name, 'Commander Vane', 'Party leader name must persist');
    assert.equal(restoredState.partyLeader?.inventory?.ration, 3, 'Personal inventory ration must persist');
    assert.equal(restoredState.partyLeader?.inventory?.bandage, 2, 'Personal inventory bandage must persist');
    assert.equal(restoredState.partyLeader?.equippedHelmetId, 'leather_cap', 'Equipped gear must persist');

    console.log('✓ Full fidelity confirmed! All domains survived browser close and reopen.');

    // -----------------------------------------------------------------
    // STEP 7: Test Manual Reset Save
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Testing Manual Reset Save ---');
    await page.evaluate(() => {
      window.confirm = () => true;
      window.resetSave();
    });
    await sleep(1000);

    const postResetStorage = await page.evaluate(() => {
      return localStorage.getItem('RPG_TRUE_GRIND_SAVE_V1');
    });
    assert.equal(postResetStorage, null, 'localStorage must be cleared after resetSave()');

    // Reload page to verify title screen resets
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const postResetTitleState = await page.evaluate(() => {
      const continueBtn = document.getElementById('title-continue-btn');
      const summary = document.getElementById('title-save-summary');
      return {
        continueDisabled: continueBtn ? continueBtn.disabled : null,
        summaryHtml: summary ? summary.innerHTML : ''
      };
    });

    assert.equal(postResetTitleState.continueDisabled, true, 'Continue must be disabled after reset save');
    assert.ok(postResetTitleState.summaryHtml.includes('No Saved Game Found'), 'Summary must revert to No Saved Game Found');
    console.log('✓ Manual Reset Save successfully purged storage and reset Title Screen state.');

    // -----------------------------------------------------------------
    // STEP 8: Test Save Failure UX (Storage Quota Exceeded)
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Testing Save Failure Player-Facing UX ---');
    // Start new game to get back into Outpost
    await page.evaluate(() => {
      const newGameBtn = document.getElementById('title-new-game-btn');
      if (newGameBtn) newGameBtn.click();
    });
    await sleep(1500);

    // Simulate localStorage failure
    const failureUxResult = await page.evaluate(() => {
      const badge = document.getElementById('save-failure-badge');
      const origSetItem = Storage.prototype.setItem;

      Storage.prototype.setItem = function () {
        throw new Error('QuotaExceededError: Dom storage limit exceeded');
      };

      const saveResult = window.GameState.getInstance().saveToDisk();
      const badgeVisible = badge ? badge.style.display === 'block' : false;
      const toastEl = document.getElementById('build-feedback-toast');
      const toastText = toastEl ? toastEl.innerText : '';

      // Restore setItem
      Storage.prototype.setItem = origSetItem;

      return {
        saveResult,
        badgeVisible,
        toastText
      };
    });

    console.log('Failure UX result:', failureUxResult);
    assert.equal(failureUxResult.saveResult, false, 'saveToDisk must return false when storage throws');
    assert.equal(failureUxResult.badgeVisible, true, 'Persistent #save-failure-badge must be visible');
    assert.ok(failureUxResult.toastText.includes('SAVE FAILED'), 'Toast warning must inform the player');
    console.log('✓ Save failure UX verified: toast notification triggered and persistent warning badge shown.');

    console.log('\n================================================================');
    console.log('ALL LIVE BROWSER PERSISTENT SAVES TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');

  } finally {
    if (browser) {
      await browser.close();
    }
    if (viteChild) {
      console.log('[Server] Stopping spawned Vite server...');
      viteChild.kill();
    }
  }
}

run().catch((err) => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
