const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M38 E2E] Launching browser...');
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
        text.includes('[Progression') ||
        text.includes('[Lockpicking') ||
        text.includes('[DISCOVERY') ||
        text.includes('[UNLOCK') ||
        text.includes('Locksmith')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M38 E2E] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game to initialize
    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted successfully.');

    // -------------------------------------------------------------
    // STEP 1: Confirm Lockpicking is hidden at Level 0
    // -------------------------------------------------------------
    console.log('\n[Step 1] Verifying Lockpicking hidden at Level 0...');
    const step1Check = await page.evaluate(() => {
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      const prog = hero.progression;
      const stat = prog.getProficiencyStat('lockpicking');
      const isRevealed = prog.isStatRevealed('lockpicking');
      return {
        level: stat.level,
        currentExp: stat.currentExp,
        isRevealed
      };
    });
    console.log(`[Step 1] Lockpicking State: Level ${step1Check.level} (${step1Check.currentExp} EXP), isRevealed=${step1Check.isRevealed}`);
    if (step1Check.level !== 0 || step1Check.isRevealed) {
      throw new Error(`Expected Lockpicking Level 0 and hidden, got Level ${step1Check.level} and isRevealed=${step1Check.isRevealed}`);
    }
    console.log('✓ STEP 1 PASS: Lockpicking is Level 0 and hidden.');

    // -------------------------------------------------------------
    // STEP 2: Grant Locked Boxes and Open Party Overview Equipment Stash
    // -------------------------------------------------------------
    console.log('\n[Step 2] Granting Locked Boxes and inspecting Equipment Stash...');
    await page.evaluate(() => {
      window.GameState.getInstance().addItem('locked_box', 3);
    });
    await page.keyboard.press('KeyO');
    await sleep(600);

    // Check modal is open
    const isModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('party-overview-modal');
      return modal?.classList.contains('active') || modal?.style.display === 'flex';
    });
    if (!isModalOpen) throw new Error('Party Overview modal failed to open');
    console.log('✓ Party Overview modal opened.');

    // Click "Items" filter tab
    await page.evaluate(() => {
      const itemsTabBtn = document.querySelector('.inv-filter-btn[data-filter="items"]');
      if (itemsTabBtn) itemsTabBtn.click();
    });
    await sleep(400);

    // Verify Locked Box card and Pick Lock button
    const boxCardInfo = await page.evaluate(() => {
      const list = document.getElementById('party-inventory-item-list');
      const boxCard = list ? list.querySelector('.inventory-item-card[data-item-id="locked_box"]') : null;
      const pickBtn = boxCard ? boxCard.querySelector('.inv-pick-lock-btn') : null;
      return {
        cardFound: !!boxCard,
        cardText: boxCard ? boxCard.textContent : '',
        btnFound: !!pickBtn,
        btnText: pickBtn ? pickBtn.textContent : ''
      };
    });
    console.log(`[Step 2] Box Card Found: ${boxCardInfo.cardFound}, Button: "${boxCardInfo.btnText}"`);
    if (!boxCardInfo.cardFound || !boxCardInfo.btnFound) {
      throw new Error('Locked Box card or Pick Lock button not found in Items tab');
    }
    console.log('✓ STEP 2 PASS: Locked Box card and [Pick Lock] button properly rendered in Items tab.');

    // -------------------------------------------------------------
    // STEP 3: Attempt Pick Lock with 0 Lockpicks -> Verify Blocked!
    // -------------------------------------------------------------
    console.log('\n[Step 3] Attempting [Pick Lock] with zero lockpicks on hand...');
    const preBlockBoxes = await page.evaluate(() => window.GameState.getInstance().getItemCount('locked_box'));
    const preBlockExp = await page.evaluate(() => {
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      return hero.progression.getProficiencyStat('lockpicking').currentExp;
    });

    await page.evaluate(() => {
      const pickBtn = document.querySelector('.inv-pick-lock-btn');
      if (pickBtn) pickBtn.click();
    });
    await sleep(600);

    const postBlockBoxes = await page.evaluate(() => window.GameState.getInstance().getItemCount('locked_box'));
    const postBlockExp = await page.evaluate(() => {
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      return hero.progression.getProficiencyStat('lockpicking').currentExp;
    });
    console.log(`[Step 3] Boxes: ${preBlockBoxes} -> ${postBlockBoxes}, EXP: ${preBlockExp} -> ${postBlockExp}`);
    if (postBlockBoxes !== preBlockBoxes || postBlockExp !== preBlockExp) {
      throw new Error('Attempt with 0 lockpicks should be blocked without consuming box or granting EXP');
    }
    console.log('✓ STEP 3 PASS: Attempt correctly blocked when 0 lockpicks on hand.');

    // -------------------------------------------------------------
    // STEP 4: Cautious Single-Lockpick Attempt -> Box Preserved on Failure
    // -------------------------------------------------------------
    console.log('\n[Step 4] Attempting with 1 lockpick (cautious play)...');
    await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      gs.addItem('lockpick', 1);
      // Force failure for test
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      hero.progression.getProficiencyStat('lockpicking').currentExp = 0;
      const res = gs.attemptLockpick(hero.progression, hero.name, () => 0.999, hero);
      return res;
    });
    await sleep(400);

    const step4Check = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      return {
        boxes: gs.getItemCount('locked_box'),
        picks: gs.getItemCount('lockpick'),
        brokenBoxes: gs.getItemCount('broken_lockbox'),
        exp: hero.progression.getProficiencyStat('lockpicking').currentExp
      };
    });
    console.log(`[Step 4] State after 1-fail: Boxes=${step4Check.boxes}, Picks=${step4Check.picks}, Broken=${step4Check.brokenBoxes}, EXP=${step4Check.exp}`);
    if (step4Check.picks !== 0 || step4Check.boxes !== preBlockBoxes || step4Check.brokenBoxes !== 0 || step4Check.exp !== 5) {
      throw new Error(`Expected box preserved (boxes=${preBlockBoxes}), picks=0, broken=0, exp=5; got: ${JSON.stringify(step4Check)}`);
    }
    console.log('✓ STEP 4 PASS: 1-lockpick failure consumed lockpick, preserved box intact, and granted +5 token EXP.');

    // -------------------------------------------------------------
    // STEP 5: High-Risk 3-Lockpick Attempt -> Box Breaks & Doubled 30 EXP
    // -------------------------------------------------------------
    console.log('\n[Step 5] Attempting full 3-lockpick gamble (3 consecutive fails)...');
    await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      gs.addItem('lockpick', 3);
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      hero.progression.getProficiencyStat('lockpicking').currentExp = 0;
      // Force all 3 rolls to fail
      gs.attemptLockpick(hero.progression, hero.name, () => 0.999, hero);
    });
    await sleep(400);

    const step5Check = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const hero = window.game.scene.getScenes(true)[0]?.player || window.HUD?.activeInstance?.currentPlayer;
      return {
        boxes: gs.getItemCount('locked_box'),
        picks: gs.getItemCount('lockpick'),
        brokenBoxes: gs.getItemCount('broken_lockbox'),
        exp: hero.progression.getProficiencyStat('lockpicking').currentExp
      };
    });
    console.log(`[Step 5] State after 3-fail: Boxes=${step5Check.boxes}, Picks=${step5Check.picks}, Broken=${step5Check.brokenBoxes}, EXP=${step5Check.exp}`);
    if (step5Check.picks !== 0 || step5Check.boxes !== preBlockBoxes - 1 || step5Check.brokenBoxes !== 1 || step5Check.exp !== 30) {
      throw new Error(`Expected box converted to broken (boxes=${preBlockBoxes - 1}, broken=1), picks=0, exp=30; got: ${JSON.stringify(step5Check)}`);
    }
    console.log('✓ STEP 5 PASS: 3-lockpick failure sequence broke box, converted to Broken Lockbox, and granted doubled 30 EXP.');

    // -------------------------------------------------------------
    // STEP 6: Smelt Broken Lockbox -> 2 Steel Scrap
    // -------------------------------------------------------------
    console.log('\n[Step 6] Smelting Broken Lockbox at Blacksmithing Bench...');
    const smeltCheck = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const preScrap = gs.getItemCount('steel_scrap');
      const brokenCount = gs.getItemCount('broken_lockbox');
      if (brokenCount <= 0) throw new Error('No broken lockbox to smelt');
      gs.consumeItem('broken_lockbox', 1);
      gs.addItem('steel_scrap', 2);
      const postScrap = gs.getItemCount('steel_scrap');
      return {
        preScrap,
        postScrap,
        recovered: postScrap - preScrap,
        remainingBroken: gs.getItemCount('broken_lockbox')
      };
    });
    console.log(`[Step 6] Smelt Result: Scrap ${smeltCheck.preScrap} -> ${smeltCheck.postScrap} (+${smeltCheck.recovered}), Remaining Broken: ${smeltCheck.remainingBroken}`);
    if (smeltCheck.recovered !== 2 || smeltCheck.remainingBroken !== 0) {
      throw new Error(`Expected +2 Steel Scrap and 0 broken boxes; got: ${JSON.stringify(smeltCheck)}`);
    }
    console.log('✓ STEP 6 PASS: Smelting Broken Lockbox yields exactly 2 Steel Scrap (net -1 Scrap loss vs 3 picks).');

    // -------------------------------------------------------------
    // STEP 7: Level Lockpicking to 1 -> Verify Skill Discovered Modal
    // -------------------------------------------------------------
    console.log('\n[Step 7] Granting Lockpicking EXP to reach Level 1...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      const hero = activeScene.player;
      hero.progression.addProficiencyExp('lockpicking', 50);
    });
    await sleep(600);

    const discoveryModalCheck = await page.evaluate(() => {
      const modal = document.getElementById('skill-discovered-modal');
      const nameEl = document.getElementById('discovered-skill-name');
      const isVisible = modal && (modal.classList.contains('active') || modal.style.display === 'block');
      return {
        isVisible,
        skillName: nameEl ? nameEl.textContent : ''
      };
    });
    console.log(`[Step 7] Skill Discovered Modal Visible: ${discoveryModalCheck.isVisible}, Skill Name: "${discoveryModalCheck.skillName}"`);
    if (!discoveryModalCheck.isVisible || !discoveryModalCheck.skillName.includes('Lockpicking')) {
      throw new Error(`Expected Skill Discovered modal for Lockpicking, got visible=${discoveryModalCheck.isVisible}, name=${discoveryModalCheck.skillName}`);
    }
    console.log('✓ STEP 7 PASS: "SKILL DISCOVERED: Lockpicking" modal appeared at Level 1.');

    // Dismiss discovery modal
    await page.evaluate(() => {
      const modal = document.getElementById('skill-discovered-modal');
      if (modal) modal.click();
    });
    await sleep(400);

    // -------------------------------------------------------------
    // STEP 8: Level Lockpicking to 10 -> Verify Locksmith Class Unlock
    // -------------------------------------------------------------
    console.log('\n[Step 8] Leveling Lockpicking to 10 for Locksmith unlock...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      const hero = activeScene.player;
      while (hero.progression.getProficiencyStat('lockpicking').level < 10) {
        hero.progression.addProficiencyExp('lockpicking', 200);
      }
    });
    await sleep(600);

    const unlockModalCheck = await page.evaluate(() => {
      const modal = document.getElementById('unlock-modal');
      const nameEl = document.getElementById('unlocked-class-name');
      const isVisible = modal && (modal.classList.contains('active') || modal.style.display === 'block');
      return {
        isVisible,
        className: nameEl ? nameEl.textContent : ''
      };
    });
    console.log(`[Step 8] Class Unlock Modal Visible: ${unlockModalCheck.isVisible}, Class Name: "${unlockModalCheck.className}"`);
    if (!unlockModalCheck.isVisible || !unlockModalCheck.className.includes('Locksmith')) {
      throw new Error(`Expected Class Unlock modal for Locksmith, got visible=${unlockModalCheck.isVisible}, name=${unlockModalCheck.className}`);
    }
    console.log('✓ STEP 8 PASS: "CLASS UNLOCKED: Locksmith" modal appeared at Level 10.');

    // Dismiss unlock modal
    await page.evaluate(() => {
      const modal = document.getElementById('unlock-modal');
      if (modal) modal.click();
    });
    await sleep(400);

    // -------------------------------------------------------------
    // STEP 9: Verify Lockpicking is now displayed in Party Overview
    // -------------------------------------------------------------
    console.log('\n[Step 9] Verifying Lockpicking row in Party Overview roster...');
    const rosterCheck = await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      activeScene.hud.renderPartyOverviewModal(true);
      const row = document.querySelector('[data-party-prof-row="0-lockpicking"]');
      const val = document.querySelector('[data-party-prof-val="0-lockpicking"]');
      return {
        rowFound: !!row,
        rowDisplay: row ? row.style.display : 'none',
        valText: val ? val.textContent : ''
      };
    });
    console.log(`[Step 9] Lockpicking Row Display: ${rosterCheck.rowDisplay}, Value: "${rosterCheck.valText}"`);
    if (rosterCheck.rowDisplay === 'none' || !rosterCheck.valText.match(/Lv (1[0-9]|[2-9][0-9])/)) {
      throw new Error(`Expected visible Lockpicking row with Lv >= 10, got display=${rosterCheck.rowDisplay}, text=${rosterCheck.valText}`);
    }
    console.log('✓ STEP 9 PASS: Lockpicking proficiency visible and correctly displaying Level 10+ in Party Overview.');

    console.log('\n=============================================================');
    console.log('🎉 ALL MILESTONE 38 E2E BROWSER TESTS PASSED SUCCESSFULLY! ✓');
    console.log('=============================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[M38 E2E ERROR]:', err);
  process.exit(1);
});
