const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M16 Test] Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Floor Timer]') ||
        text.includes('[Combat]') ||
        text.includes('[Respawn]') ||
        text.includes('[Debug') ||
        text.includes('Dungeon') ||
        text.includes('Outpost')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M16 Test] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Wait for game to initialize in OutpostScene
    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted in initial scene.');

    // Verify #floor-timer-badge is hidden in Outpost
    const outpostBadgeInitial = await page.evaluate(() => {
      const badge = document.getElementById('floor-timer-badge');
      return badge ? window.getComputedStyle(badge).display : null;
    });
    console.log('Initial Outpost floor-timer-badge display:', outpostBadgeInitial);
    if (outpostBadgeInitial !== 'none') {
      throw new Error(`FAIL: #floor-timer-badge should be hidden in Outpost! Got: ${outpostBadgeInitial}`);
    }
    console.log('✓ PASS: #floor-timer-badge is hidden initially in Outpost.');

    // Transition from Outpost to Dungeon Floor 1
    console.log('\nTransitioning into Dungeon Floor 1...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });
    await sleep(2500);

    // Wait for MainScene floor timer state
    await page.waitForFunction(() => typeof window.__getFloorTimerState === 'function', { timeout: 10000 });
    console.log('✓ MainScene initialized successfully.');

    // -------------------------------------------------------------
    // TEST 1: Explicit Standalone Default-Off Assertion
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Standalone Default-Off Assertion ---');
    const initialState = await page.evaluate(() => window.__getFloorTimerState());
    console.log('Initial floor timer state:', initialState);

    if (initialState.debugAutoRespawnEnabled !== false) {
      throw new Error(`FAIL: debugAutoRespawnEnabled did not default to false! Got: ${initialState.debugAutoRespawnEnabled}`);
    }
    console.log('✓ PASS: debugAutoRespawnEnabled is strictly false on fresh generation.');

    if (initialState.durationMs !== 300000) {
      throw new Error(`FAIL: durationMs should be 300000 (5 mins). Got: ${initialState.durationMs}`);
    }
    if (initialState.remainingMs <= 0 || initialState.remainingMs > 300000) {
      throw new Error(`FAIL: remainingMs out of bounds: ${initialState.remainingMs}`);
    }
    console.log(`✓ PASS: Floor timer initialized to full 300s duration (Remaining: ${(initialState.remainingMs / 1000).toFixed(1)}s).`);

    // Verify HUD badge is visible in dungeon
    const hudBadgeText = await page.evaluate(() => {
      const el = document.getElementById('floor-timer-badge');
      return { text: el?.innerText, display: el ? window.getComputedStyle(el).display : null };
    });
    console.log('HUD Badge in Dungeon:', hudBadgeText);
    if (hudBadgeText.display === 'none' || !hudBadgeText.text.includes('Floor Respawn')) {
      throw new Error(`FAIL: #floor-timer-badge should be visible in dungeon! Got: ${JSON.stringify(hudBadgeText)}`);
    }
    console.log('✓ PASS: #floor-timer-badge is visible in Dungeon HUD.');

    // -------------------------------------------------------------
    // TEST 2: Defeated Enemies Stay Dead (Real Gameplay)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Defeated Enemies Stay Dead (No 3s Respawn) ---');
    const roomsBeforeDefeat = await page.evaluate(() =>
      window.__getRoomEnemies().map((r) => ({
        id: r.id,
        type: r.type,
        enemiesCount: r.enemies.length
      }))
    );
    console.log(`Dungeon room overview:`, roomsBeforeDefeat);

    // Find a combat room with enemies
    const targetRoomInfo = roomsBeforeDefeat.find((r) => r.type.includes('combat') && r.enemiesCount > 0);
    if (!targetRoomInfo) {
      throw new Error('FAIL: No combat room with enemies found in generated dungeon.');
    }
    console.log(`Targeting Room #${targetRoomInfo.id} (${targetRoomInfo.type}) with ${targetRoomInfo.enemiesCount} initial enemies.`);

    // Defeat all enemies in this target room
    const defeatResult = await page.evaluate((roomId) => {
      const roomEnemies = window.__getRoomEnemies(roomId);
      const livingInRoom = roomEnemies.filter((e) => e.state !== 'dead' && e.state !== 'downed');
      for (const enemy of livingInRoom) {
        window.__defeatEnemy(enemy);
      }
      return {
        defeatedCount: livingInRoom.length,
        states: roomEnemies.map((e) => e.state)
      };
    }, targetRoomInfo.id);

    console.log(`Defeated ${defeatResult.defeatedCount} enemies in Room #${targetRoomInfo.id}. States:`, defeatResult.states);

    // Wait 4.5 seconds (longer than the old 3-second respawn timer)
    console.log('Waiting 4.5s to confirm enemies stay dead...');
    await sleep(4500);

    const checkRoomAfterWait = await page.evaluate((roomId) => {
      const roomEnemies = window.__getRoomEnemies(roomId);
      const living = roomEnemies.filter((e) => e.state !== 'dead' && e.state !== 'downed');
      return {
        total: roomEnemies.length,
        livingCount: living.length,
        states: roomEnemies.map((e) => e.state)
      };
    }, targetRoomInfo.id);

    console.log(`Room #${targetRoomInfo.id} after 4.5s:`, checkRoomAfterWait);
    if (checkRoomAfterWait.livingCount !== 0) {
      throw new Error(`FAIL: Defeated enemies respawned! livingCount = ${checkRoomAfterWait.livingCount}`);
    }
    console.log('✓ PASS: Room stays completely cleared. Defeated enemies stay dead past 3s.');

    // -------------------------------------------------------------
    // TEST 3: Floor Timer Fast-Forward & Repopulation Scoping
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Floor Timer Fast-Forward & Single Room Scoping ---');
    // Snapshot all rooms before timer expiry
    const allRoomsBeforeExpiry = await page.evaluate(() =>
      window.__getRoomEnemies().map((r) => ({
        id: r.id,
        type: r.type,
        totalEnemies: r.enemies.length,
        livingEnemies: r.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed').length
      }))
    );
    console.log('Room snapshot before expiry:', allRoomsBeforeExpiry);

    // Fast-forward floor timer to expiry
    console.log('Fast-forwarding floor timer by 300s...');
    await page.evaluate(() => window.__fastForwardFloorTimer(300));
    await sleep(500);

    // Snapshot all rooms after expiry
    const allRoomsAfterExpiry = await page.evaluate(() =>
      window.__getRoomEnemies().map((r) => ({
        id: r.id,
        type: r.type,
        totalEnemies: r.enemies.length,
        livingEnemies: r.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed').length
      }))
    );
    console.log('Room snapshot after expiry:', allRoomsAfterExpiry);

    // Identify which rooms changed
    const changedRooms = [];
    for (let i = 0; i < allRoomsBeforeExpiry.length; i++) {
      const before = allRoomsBeforeExpiry[i];
      const after = allRoomsAfterExpiry[i];
      if (before.livingEnemies !== after.livingEnemies || before.totalEnemies !== after.totalEnemies) {
        changedRooms.push({ id: before.id, type: before.type, before, after });
      }
    }

    console.log('Changed rooms count:', changedRooms.length, changedRooms);
    if (changedRooms.length !== 1) {
      throw new Error(`FAIL: Expected exactly 1 room to be repopulated, but ${changedRooms.length} rooms changed!`);
    }

    const repopulatedRoom = changedRooms[0];
    if (repopulatedRoom.after.livingEnemies === 0) {
      throw new Error(`FAIL: Repopulated room #${repopulatedRoom.id} has 0 living enemies!`);
    }
    console.log(`✓ PASS: Exactly one room (Room #${repopulatedRoom.id} [${repopulatedRoom.type}]) was repopulated with ${repopulatedRoom.after.livingEnemies} fresh living enemies.`);

    // -------------------------------------------------------------
    // TEST 4: Immediate Continuous Reset & Second Expiry Cycle
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Continuous Timer Reset & Second Expiry ---');
    const stateAfterExpiry = await page.evaluate(() => window.__getFloorTimerState());
    console.log('Timer state right after expiry:', stateAfterExpiry);
    if (stateAfterExpiry.remainingMs <= 0 || stateAfterExpiry.remainingMs > 300000) {
      throw new Error(`FAIL: Timer did not reset back to 300s duration! Got: ${stateAfterExpiry.remainingMs}`);
    }
    console.log(`✓ PASS: Timer immediately reset to full duration (Remaining: ${(stateAfterExpiry.remainingMs / 1000).toFixed(1)}s).`);

    // Trigger second expiry
    console.log('Triggering second expiry via __triggerFloorRespawn()...');
    await page.evaluate(() => window.__triggerFloorRespawn());
    await sleep(500);

    const stateAfterSecond = await page.evaluate(() => window.__getFloorTimerState());
    console.log('Timer state after second expiry:', stateAfterSecond);
    if (stateAfterSecond.remainingMs <= 0 || stateAfterSecond.remainingMs > 300000) {
      throw new Error(`FAIL: Timer did not reset on second expiry! Got: ${stateAfterSecond.remainingMs}`);
    }
    console.log('✓ PASS: Second expiry cycle executed cleanly and timer reset continuously.');

    // -------------------------------------------------------------
    // TEST 5: Portal Lifecycle / Scene Transition Check
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Portal Transition Lifecycle ---');
    // Transition to Outpost
    console.log('Transitioning to Outpost...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      activeScene.triggerPortalTransition();
    });
    await sleep(2000);

    const outpostCheck = await page.evaluate(() => {
      const badge = document.getElementById('floor-timer-badge');
      const loc = document.getElementById('location-badge');
      return {
        badgeDisplay: badge ? window.getComputedStyle(badge).display : null,
        location: loc?.innerText
      };
    });
    console.log('Outpost check:', outpostCheck);
    if (outpostCheck.badgeDisplay !== 'none') {
      throw new Error(`FAIL: #floor-timer-badge must be hidden in Outpost! Got: ${outpostCheck.badgeDisplay}`);
    }
    console.log('✓ PASS: Floor timer UI is properly hidden while in Outpost.');

    // Re-enter Dungeon from Outpost
    console.log('Returning to Dungeon through Outpost portal...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      activeScene.executeTransitionToDungeon();
    });
    await sleep(2000);

    const dungeonReentryState = await page.evaluate(() => window.__getFloorTimerState());
    console.log('Dungeon re-entry timer state:', dungeonReentryState);
    if (dungeonReentryState.debugAutoRespawnEnabled !== false) {
      throw new Error(`FAIL: debugAutoRespawnEnabled must default to false on re-entry! Got: ${dungeonReentryState.debugAutoRespawnEnabled}`);
    }
    if (dungeonReentryState.remainingMs <= 0 || dungeonReentryState.remainingMs > 300000) {
      throw new Error(`FAIL: Timer on fresh floor re-entry out of bounds: ${dungeonReentryState.remainingMs}`);
    }
    console.log('✓ PASS: Fresh floor generation initializes a clean floor timer (300s) and confirms debugAutoRespawnEnabled === false.');

    // -------------------------------------------------------------
    // TEST 6: Debug Toggle Verification
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Debug Auto-Respawn Toggle ---');
    // Toggle ON
    const toggleOnResult = await page.evaluate(() => window.__toggleAutoRespawn());
    console.log('Toggled auto-respawn ON:', toggleOnResult);
    if (toggleOnResult !== true) {
      throw new Error(`FAIL: __toggleAutoRespawn should return true when enabled. Got: ${toggleOnResult}`);
    }

    // Find and kill one living enemy
    const killTarget = await page.evaluate(() => {
      const enemy = window.__getRoomEnemies().flatMap((r) => r.enemies).find((e) => e.state !== 'dead' && e.state !== 'downed');
      if (!enemy) return null;
      window.__defeatEnemy(enemy);
      return { name: enemy.entityName, state: enemy.state };
    });
    console.log('Killed target enemy under debug mode:', killTarget);

    // Wait 3.5s (debug auto-respawn timer is 3.0s)
    console.log('Waiting 3.5s for debug 3s respawn...');
    await sleep(3500);

    const respawnCheck = await page.evaluate((name) => {
      const enemy = window.__getRoomEnemies().flatMap((r) => r.enemies).find((e) => e.entityName === name);
      return { name, state: enemy?.state, hp: enemy?.hp, maxHp: enemy?.maxHp };
    }, killTarget.name);
    console.log('Enemy state after 3.5s with debug toggle ON:', respawnCheck);
    if (respawnCheck.state !== 'idle' || respawnCheck.hp !== respawnCheck.maxHp) {
      throw new Error(`FAIL: Enemy should have respawned when debug toggle was ON! Got: ${JSON.stringify(respawnCheck)}`);
    }
    console.log('✓ PASS: Debug 3-second respawn successfully fires when debug toggle is explicitly ON.');

    // Toggle back OFF
    const toggleOffResult = await page.evaluate(() => window.__toggleAutoRespawn());
    console.log('Toggled auto-respawn OFF:', toggleOffResult);
    if (toggleOffResult !== false) {
      throw new Error(`FAIL: __toggleAutoRespawn should return false when disabled. Got: ${toggleOffResult}`);
    }

    // Kill same enemy again with debug toggle OFF
    await page.evaluate((name) => {
      const enemy = window.__getRoomEnemies().flatMap((r) => r.enemies).find((e) => e.entityName === name);
      window.__defeatEnemy(enemy);
    }, killTarget.name);

    console.log('Waiting 3.5s with debug toggle OFF...');
    await sleep(3500);

    const stayDeadCheck = await page.evaluate((name) => {
      const enemy = window.__getRoomEnemies().flatMap((r) => r.enemies).find((e) => e.entityName === name);
      return { name, state: enemy?.state, hp: enemy?.hp };
    }, killTarget.name);
    console.log('Enemy state after 3.5s with debug toggle OFF:', stayDeadCheck);
    if (stayDeadCheck.state !== 'dead') {
      throw new Error(`FAIL: Enemy should stay dead when debug toggle is OFF! Got: ${JSON.stringify(stayDeadCheck)}`);
    }
    console.log('✓ PASS: Enemy stays dead when debug toggle is turned back OFF.');

    console.log('\n========================================');
    console.log('🎉 ALL MILESTONE 16 VERIFICATION TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
