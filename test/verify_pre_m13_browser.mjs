import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/6594a3c7-bf94-4b52-b9ac-09073615bbc3';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Pre-Milestone-13 Full Browser Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Progression]') || text.includes('[UNLOCK]') || text.includes('[DISCOVERY]') || text.includes('[HUD]')) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // ---------------------------------------------------------------------------
  // STEP 1: Open Debug Panel with Backtick
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 1: Verify Debug Panel Open & Structure ---');
  await page.keyboard.press('`');
  await sleep(500);

  const panelState = await page.evaluate(() => {
    const panel = document.getElementById('debug-skills-panel');
    const memberSelect = document.getElementById('debug-member-select');
    const expLogList = document.getElementById('debug-exp-log-list');
    return {
      isActive: panel?.classList.contains('active'),
      memberSelectOptions: Array.from(memberSelect?.options || []).map(o => o.text),
      hasExpLog: !!expLogList
    };
  });

  assert.equal(panelState.isActive, true, 'Debug panel must open with backtick key');
  assert.ok(panelState.hasExpLog, 'Debug panel must contain live EXP Transaction Log container');
  console.log('✔ Step 1 passed: Debug panel is open with Member Select and EXP Transaction Log');

  // ---------------------------------------------------------------------------
  // STEP 2: Spawn Companion & Verify Multi-Member Selector
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 2: Spawn Companion & Switch Party Member ---');
  await page.evaluate(() => {
    window.__spawnTestCompanion();
  });
  await sleep(500);

  const partySelectState = await page.evaluate(() => {
    const memberSelect = document.getElementById('debug-member-select');
    return {
      options: Array.from(memberSelect?.options || []).map(o => o.text),
      selectedIndex: memberSelect?.selectedIndex
    };
  });

  console.log('  Party Member options:', partySelectState.options);
  assert.ok(partySelectState.options.length >= 2, 'Dropdown must now list at least 2 members');
  assert.ok(partySelectState.options.some(o => o.includes('Valerie')), 'Dropdown must list Valerie');

  // Switch to Valerie (index 1)
  await page.evaluate(() => {
    const memberSelect = document.getElementById('debug-member-select');
    memberSelect.value = '1';
    memberSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(300);

  // ---------------------------------------------------------------------------
  // STEP 3: Grant EXP and Verify Live Scrolling Transaction Log
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 3: Grant EXP & Inspect Live Transaction Log ---');
  await page.evaluate(() => {
    // Grant 15 foraging to hero, and 25 daggers + 10 evasion to Valerie
    window.__grantExp('foraging', 15, 0);
    window.__grantExp('daggers', 25, 1);
    window.__grantHiddenExp('evasion', 10, 1);
  });
  await sleep(400);

  const expLogEntries = await page.evaluate(() => {
    const list = document.getElementById('debug-exp-log-list');
    return Array.from(list?.children || []).map(el => el.textContent.trim());
  });

  console.log('  EXP Log entries:', expLogEntries);
  assert.ok(expLogEntries.some(e => e.includes('+15 EXP') && e.includes('foraging') && e.includes('Hero')), 'Log must contain Hero foraging');
  assert.ok(expLogEntries.some(e => e.includes('+25 EXP') && e.includes('daggers') && e.includes('Valerie')), 'Log must contain Valerie daggers');
  assert.ok(expLogEntries.some(e => e.includes('+10 EXP') && e.includes('evasion') && e.includes('Valerie')), 'Log must contain Valerie evasion');
  console.log('✔ Step 3 passed: EXP events streamed live into scrolling transaction log with correct character attribution');

  // Verify Valerie's stats list reflects her 25 daggers and 10 evasion EXP
  const valerieStatsText = await page.evaluate(() => {
    const list = document.getElementById('debug-skills-list');
    return list?.textContent || '';
  });
  assert.ok(valerieStatsText.includes('daggers: Level 0 (25/50 EXP)'), 'Valerie stat sheet must show 25/50 daggers EXP');
  assert.ok(valerieStatsText.includes('evasion: Level 0 (10/50 EXP)'), 'Valerie stat sheet must show 10/50 evasion EXP');
  console.log('✔ Step 3b passed: Valerie stat sheet correctly inspectable in debug panel');

  // ---------------------------------------------------------------------------
  // STEP 4: Force 2 Simultaneous Unlocks in the Same Tick (Combat Medic + Short Swords)
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 4: Test Simultaneous Same-Tick Unlocks (Combat Medic & Level 1 Reveal) ---');
  await page.evaluate(() => {
    // Revives 1 to 4 on Valerie
    window.__recordActivity('Ally Revived', 4, 1);
    // In the exact same frame: 5th revive (unlocks Combat Medic) AND +50 short_swords (reveals Level 1)
    window.__recordActivity('Ally Revived', 1, 1);
    window.__grantExp('short_swords', 50, 1);
  });
  await sleep(200);

  // Modal 1 must be active: Combat Medic for Valerie
  const modal1State = await page.evaluate(() => {
    const unlockModal = document.getElementById('unlock-modal');
    const className = document.getElementById('unlocked-class-name');
    const skillModal = document.getElementById('skill-discovered-modal');
    return {
      unlockActive: unlockModal?.classList.contains('active'),
      skillActive: skillModal?.classList.contains('active'),
      titleText: className?.innerText
    };
  });

  console.log('  Modal 1 State:', modal1State);
  assert.equal(modal1State.unlockActive, true, 'Class unlock modal must be active for Combat Medic');
  assert.equal(modal1State.skillActive, false, 'Skill discovered modal must NOT be active yet (must be queued)');
  assert.ok(modal1State.titleText.includes('Valerie unlocked Combat Medic!'), 'Must state Valerie unlocked Combat Medic');
  console.log('✔ Modal 1 verified: Valerie unlocked Combat Medic displayed');
  const modalScreenshotPath = path.join(ARTIFACT_DIR, 'combat_medic_unlock_modal.png');
  await page.screenshot({ path: modalScreenshotPath });
  console.log(`Saved modal screenshot to ${modalScreenshotPath}`);

  // Click modal 1 to dismiss early and test timer cancellation
  console.log('  Dismissing Modal 1 early via click...');
  await page.click('#unlock-modal');
  await sleep(400); // Wait 200ms transition

  // Modal 2 must now be active: Short Swords for Valerie
  const modal2State = await page.evaluate(() => {
    const unlockModal = document.getElementById('unlock-modal');
    const skillModal = document.getElementById('skill-discovered-modal');
    const skillName = document.getElementById('discovered-skill-name');
    return {
      unlockActive: unlockModal?.classList.contains('active'),
      skillActive: skillModal?.classList.contains('active'),
      skillTitle: skillName?.innerText
    };
  });

  console.log('  Modal 2 State:', modal2State);
  assert.equal(modal2State.unlockActive, false, 'Class unlock modal must be closed');
  assert.equal(modal2State.skillActive, true, 'Skill discovered modal must now be active');
  assert.ok(modal2State.skillTitle.includes('Valerie discovered Short Swords!'), 'Must state Valerie discovered Short Swords');
  console.log('✔ Modal 2 verified: Valerie discovered Short Swords displayed in sequence');

  // Dismiss modal 2 early as well
  await page.click('#skill-discovered-modal');
  await sleep(400);

  const finalModalState = await page.evaluate(() => {
    const unlockModal = document.getElementById('unlock-modal');
    const skillModal = document.getElementById('skill-discovered-modal');
    return {
      unlockActive: unlockModal?.classList.contains('active'),
      skillActive: skillModal?.classList.contains('active')
    };
  });
  assert.equal(finalModalState.unlockActive, false);
  assert.equal(finalModalState.skillActive, false);
  console.log('✔ Step 4 passed: Both simultaneous unlocks displayed in sequence with zero drops or overwrites');

  // ---------------------------------------------------------------------------
  // STEP 5: Capture Screenshot
  // ---------------------------------------------------------------------------
  const screenshotPath = path.join(ARTIFACT_DIR, 'debug_panel_overhaul.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`\nScreenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('\n======================================================');
  console.log('PRE-MILESTONE-13 BROWSER VERIFICATION PASSED 100%! 🎉');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
