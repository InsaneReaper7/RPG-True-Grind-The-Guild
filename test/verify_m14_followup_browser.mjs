import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/f3f8b03f-f47d-4198-a0f2-aaa5df2947d1';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Locked Content & EXP Audit Live Browser Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Progression') || text.includes('[HUD') || text.includes('[Skill')) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // --------------------------------------------------------------------------
  // STEP 1: Fresh character state - Loadout modal has 0 classes & 0 skills
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 1: Verify Fresh Character State in Skill Loadout Modal ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.openLoadoutModal(outpost.player, outpost.player.progression);
  });
  await sleep(600);

  let counts = await page.evaluate(() => {
    const activeClassCards = document.querySelectorAll('#active-class-container .active-class-card');
    const knownSkillCards = document.querySelectorAll('#known-skills-container .skill-card');
    const equipSlots = document.querySelectorAll('#equip-slots-container .equip-slot');
    return {
      activeClassCount: activeClassCards.length,
      knownSkillCount: knownSkillCards.length,
      equipSlotCount: equipSlots.length
    };
  });
  console.log('Fresh loadout DOM counts:', counts);
  assert.equal(counts.activeClassCount, 0, 'Active Class shelf must have 0 cards initially');
  assert.equal(counts.knownSkillCount, 0, 'Known Skills Grimoire must have 0 cards initially');
  assert.equal(counts.equipSlotCount, 5, 'Equipped Skills must render 5 slots');

  const freshScreenshotPath = path.join(ARTIFACT_DIR, 'm14_followup_loadout_fresh.png');
  await page.screenshot({ path: freshScreenshotPath });
  console.log(`Saved screenshot 1: ${freshScreenshotPath}`);

  // --------------------------------------------------------------------------
  // STEP 2: Unlock Fencer and verify dynamic reveal
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 2: Grant Short Swords EXP -> Level 10 -> Unlock Fencer ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    // Grant Short Swords 680 EXP to hit Level 10
    outpost.player.progression.addProficiencyExp('short_swords', 680, outpost.player);
  });
  await sleep(800);

  counts = await page.evaluate(() => {
    const activeClassCards = document.querySelectorAll('#active-class-container .active-class-card');
    const knownSkillCards = document.querySelectorAll('#known-skills-container .skill-card');
    const equippedAssigned = Array.from(document.querySelectorAll('#equip-slots-container .equip-slot'))
      .map(el => el.innerText.trim())
      .filter(t => !t.includes('Empty'));
    return {
      activeClassCount: activeClassCards.length,
      knownSkillCount: knownSkillCards.length,
      firstClassName: activeClassCards[0]?.querySelector('.active-class-name')?.innerText,
      equippedAssigned
    };
  });
  console.log('Post-unlock counts:', counts);
  assert.equal(counts.activeClassCount, 1, 'Only Fencer should be rendered in Active Class shelf');
  assert.equal(counts.firstClassName, 'Fencer', 'Rendered class must be Fencer');
  assert.equal(counts.knownSkillCount, 2, 'Known Skills Grimoire must show 2 skills (Power Strike & Thrust)');

  const unlockedScreenshotPath = path.join(ARTIFACT_DIR, 'm14_followup_loadout_fencer_unlocked.png');
  await page.screenshot({ path: unlockedScreenshotPath });
  console.log(`Saved screenshot 2: ${unlockedScreenshotPath}`);

  // --------------------------------------------------------------------------
  // STEP 3: Switch to Valerie in Loadout Modal
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 3: Spawn Companion Valerie and Switch Loadout Member Select to Valerie ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.spawnTestCompanion(); // recruits Valerie
    outpost.hud.openLoadoutModal(outpost.player, outpost.player.progression);
    const select = document.getElementById('loadout-member-select');
    if (select) {
      select.value = '1';
      select.dispatchEvent(new Event('change'));
    }
  });
  await sleep(600);

  counts = await page.evaluate(() => {
    const activeClassCards = document.querySelectorAll('#active-class-container .active-class-card');
    const knownSkillCards = document.querySelectorAll('#known-skills-container .skill-card');
    return {
      activeClassCount: activeClassCards.length,
      knownSkillCount: knownSkillCards.length
    };
  });
  console.log('Valerie loadout counts:', counts);
  assert.equal(counts.activeClassCount, 0, 'Valerie must have 0 class cards (Fencer is locked for her)');
  assert.equal(counts.knownSkillCount, 0, 'Valerie must have 0 known skill cards');

  const companionScreenshotPath = path.join(ARTIFACT_DIR, 'm14_followup_loadout_companion.png');
  await page.screenshot({ path: companionScreenshotPath });
  console.log(`Saved screenshot 3: ${companionScreenshotPath}`);

  // Close loadout modal
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closeLoadoutModal();
  });
  await sleep(400);

  // --------------------------------------------------------------------------
  // STEP 4: Perform 10 successive scene transitions and verify EXP log match
  // --------------------------------------------------------------------------
  console.log('\n--- STEP 4: Perform 10 Successive Scene Transitions ---');
  for (let i = 1; i <= 10; i++) {
    await page.evaluate((iteration) => {
      const isOutpost = window.game.scene.isActive('OutpostScene');
      if (isOutpost) {
        const outpost = window.game.scene.getScene('OutpostScene');
        outpost.scene.start('MainScene');
      } else {
        const dungeon = window.game.scene.getScene('MainScene');
        dungeon.scene.start('OutpostScene');
      }
    }, i);
    await sleep(400);
  }

  // Ensure we are back in OutpostScene
  await page.evaluate(() => {
    if (!window.game.scene.isActive('OutpostScene')) {
      const dungeon = window.game.scene.getScene('MainScene');
      dungeon.scene.start('OutpostScene');
    }
  });
  await sleep(1000);

  // Open Debug Panel and reset/clear previous log for clean audit
  console.log('\n--- STEP 5: Grant +1 EXP to health_regen and verify 1:1 log match ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.toggleDebugSkillsPanel();
    // Clear log via the debug panel clear button and reset stat to 0
    document.getElementById('debug-clear-exp-log-btn')?.click();
    const stat = outpost.player.progression.getProficiencyStat('health_regen');
    stat.level = 0;
    stat.currentExp = 0;

    // Grant exact +1 EXP
    outpost.player.progression.addProficiencyExp('health_regen', 1, outpost.player);
  });
  await sleep(600);

  const expAudit = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const stat = outpost.player.progression.getProficiencyStat('health_regen');
    const logItems = Array.from(document.querySelectorAll('#debug-exp-log-list .debug-exp-entry'))
      .map(el => el.innerText.trim());
    return {
      statLevel: stat.level,
      statCurrentExp: stat.currentExp,
      logItemsLength: logItems.length,
      logItemsText: logItems
    };
  });
  console.log('EXP audit results after 10 scene transitions:', expAudit);
  assert.equal(expAudit.statCurrentExp, 1, 'Stat currentExp must be 1');
  assert.equal(expAudit.logItemsLength, 1, 'EXP log must have exactly 1 entry (NO ORPHANED DUPLICATES)');

  const expLogScreenshotPath = path.join(ARTIFACT_DIR, 'm14_followup_exp_log_after_10_transitions.png');
  await page.screenshot({ path: expLogScreenshotPath });
  console.log(`Saved screenshot 4: ${expLogScreenshotPath}`);

  console.log('\n=== ALL BROWSER AUDITS & SCREENSHOTS COMPLETED SUCCESSFULLY! ===');
  await browser.close();
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
