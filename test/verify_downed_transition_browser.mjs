import puppeteer from 'puppeteer-core';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\b4124736-b32c-4766-8e21-372044d41968';

async function run() {
  console.log('=== Launching Chrome for Live Two-Bar Portal Transition Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Handoff') || text.includes('[MainScene]') || text.includes('[OutpostScene]') || text.includes('Downed')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Transition to Dungeon
  console.log('\n--- 1. Transitioning Outpost -> MainScene (Dungeon) ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.player;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));

  // Spawn a companion
  console.log('--- Spawning a companion (Valerie) ---');
  await page.evaluate(() => {
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 500));

  // =========================================================================
  // TEST A: Leader in Critical State (Main HP 0, Crit HP 22) -> Portal to Outpost
  // =========================================================================
  console.log('\n--- TEST A: Leader with Main HP 0, Critical HP 22 crossing portal to Outpost ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const leader = main.player;
    leader.hp = 0;
    leader.criticalHp = 22;
    leader.state = 'idle';
    leader.drawHpBar();
    console.log(`[Test] Set leader HP to 0, Critical HP to 22. State: ${leader.state}`);
  });

  // Execute transition to Outpost
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.executeTransitionToOutpost();
  });

  await page.waitForFunction(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return outpost && outpost.scene.isActive() && outpost.party && outpost.party.length >= 2;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));

  const testAResult = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.openPartyOverviewModal();
    const leader = outpost.party[0];
    const banner = document.getElementById('downed-banner');
    const bannerActive = banner ? banner.classList.contains('active') : false;
    const leaderCard = document.querySelector('.party-card[data-party-card-idx="0"]');
    const leaderCardDowned = leaderCard ? leaderCard.classList.contains('downed') : false;
    const leaderBadge = leaderCard ? leaderCard.querySelector('.party-status-downed') : null;

    return {
      leaderState: leader.state,
      leaderHp: leader.hp,
      leaderCritHp: leader.criticalHp,
      leaderAngle: leader.avatarSprite.angle,
      leaderAlpha: leader.avatarSprite.alpha,
      bannerActive,
      leaderCardDowned,
      hasLeaderBadge: !!leaderBadge
    };
  });

  console.log('Test A Results on arrival at Outpost:', testAResult);
  if (testAResult.leaderState !== 'idle') throw new Error(`Leader state must be 'idle', got: ${testAResult.leaderState}`);
  if (testAResult.bannerActive) throw new Error('Downed banner must NOT be active for leader in Critical state');
  if (testAResult.leaderCardDowned) throw new Error('Leader party card must NOT have downed class');
  if (testAResult.hasLeaderBadge) throw new Error('Leader must NOT have DOWNED badge');
  if (testAResult.leaderAngle !== 0) throw new Error(`Leader sprite angle must be 0, got: ${testAResult.leaderAngle}`);
  if (testAResult.leaderAlpha !== 1) throw new Error(`Leader sprite alpha must be 1, got: ${testAResult.leaderAlpha}`);
  console.log('✔ TEST A PASSED: Leader arrived in Outpost correctly in Critical state (Main HP 0, Crit HP 22), NOT falsely marked Downed!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_a_leader_critical_outpost.png') });

  // Close modal before next test
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closePartyOverviewModal();
  });

  // =========================================================================
  // TEST B: Companion in Critical State (Main HP 0, Crit HP 15) -> Portal to Dungeon
  // =========================================================================
  console.log('\n--- TEST B: Companion with Main HP 0, Critical HP 15 crossing portal to Dungeon ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const companion = outpost.party[1];
    companion.hp = 0;
    companion.criticalHp = 15;
    companion.state = 'idle';
    companion.drawHpBar();
    console.log(`[Test] Set companion HP to 0, Critical HP to 15. State: ${companion.state}`);
  });

  // Execute transition to Dungeon
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 2;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));

  const testBResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.hud.openPartyOverviewModal();
    const companion = main.party[1];
    const compCard = document.querySelector('.party-card[data-party-card-idx="1"]');
    const compCardDowned = compCard ? compCard.classList.contains('downed') : false;
    const compBadge = compCard ? compCard.querySelector('.party-status-downed') : null;

    return {
      compState: companion.state,
      compHp: companion.hp,
      compCritHp: companion.criticalHp,
      compAngle: companion.avatarSprite.angle,
      compAlpha: companion.avatarSprite.alpha,
      compCardDowned,
      hasCompBadge: !!compBadge
    };
  });

  console.log('Test B Results on arrival at Dungeon:', testBResult);
  if (testBResult.compState !== 'idle') throw new Error(`Companion state must be 'idle', got: ${testBResult.compState}`);
  if (testBResult.compCardDowned) throw new Error('Companion party card must NOT have downed class');
  if (testBResult.hasCompBadge) throw new Error('Companion must NOT have DOWNED badge');
  if (testBResult.compAngle !== 0) throw new Error(`Companion sprite angle must be 0, got: ${testBResult.compAngle}`);
  if (testBResult.compAlpha !== 1) throw new Error(`Companion sprite alpha must be 1, got: ${testBResult.compAlpha}`);
  console.log('✔ TEST B PASSED: Companion arrived in Dungeon correctly in Critical state (Main HP 0, Crit HP 15), NOT falsely marked Downed!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_b_companion_critical_dungeon.png') });

  // Close modal before next test
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.hud.closePartyOverviewModal();
  });

  // =========================================================================
  // TEST C: Leader in Genuine Downed State (Main HP 0, Crit HP 0) -> Portal to Outpost
  // =========================================================================
  console.log('\n--- TEST C: Leader genuinely Downed (Main HP 0, Crit HP 0) crossing portal to Outpost ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const leader = main.player;
    leader.hp = 0;
    leader.criticalHp = 0;
    leader.state = 'downed';
    leader.avatarSprite.setAngle(90);
    leader.avatarSprite.setAlpha(0.6);
    leader.drawHpBar();
    console.log(`[Test] Set leader to genuine Downed. State: ${leader.state}`);
  });

  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.executeTransitionToOutpost();
  });

  await page.waitForFunction(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return outpost && outpost.scene.isActive() && outpost.party && outpost.party.length >= 2;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));

  const testCResult = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.openPartyOverviewModal();
    const leader = outpost.party[0];
    const banner = document.getElementById('downed-banner');
    const bannerActive = banner ? banner.classList.contains('active') : false;
    const leaderCard = document.querySelector('.party-card[data-party-card-idx="0"]');
    const leaderCardDowned = leaderCard ? leaderCard.classList.contains('downed') : false;
    const leaderBadge = leaderCard ? leaderCard.querySelector('.party-status-downed') : null;

    return {
      leaderState: leader.state,
      leaderHp: leader.hp,
      leaderCritHp: leader.criticalHp,
      leaderAngle: leader.avatarSprite.angle,
      leaderAlpha: leader.avatarSprite.alpha,
      bannerActive,
      leaderCardDowned,
      hasLeaderBadge: !!leaderBadge
    };
  });

  console.log('Test C Results on arrival at Outpost:', testCResult);
  if (testCResult.leaderState !== 'downed') throw new Error(`Leader state must be 'downed', got: ${testCResult.leaderState}`);
  if (!testCResult.bannerActive) throw new Error('Downed banner MUST be active for genuinely downed leader');
  if (!testCResult.leaderCardDowned) throw new Error('Leader party card MUST have downed class');
  if (!testCResult.hasLeaderBadge) throw new Error('Leader MUST have DOWNED badge');
  if (testCResult.leaderAngle !== 90) throw new Error(`Leader sprite angle must be 90, got: ${testCResult.leaderAngle}`);
  if (testCResult.leaderAlpha !== 0.6) throw new Error(`Leader sprite alpha must be 0.6, got: ${testCResult.leaderAlpha}`);
  console.log('✔ TEST C PASSED: Genuine Downed leader correctly persisted Downed state across portal transition!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_c_leader_genuinely_downed_outpost.png') });

  // Close modal before next test
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closePartyOverviewModal();
  });

  // =========================================================================
  // TEST D: Companion in Genuine Downed State (Main HP 0, Crit HP 0) -> Portal to Dungeon
  // =========================================================================
  console.log('\n--- TEST D: Companion genuinely Downed (Main HP 0, Crit HP 0) crossing portal to Dungeon ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const companion = outpost.party[1];
    companion.hp = 0;
    companion.criticalHp = 0;
    companion.state = 'downed';
    companion.avatarSprite.setAngle(90);
    companion.avatarSprite.setAlpha(0.6);
    companion.drawHpBar();
    console.log(`[Test] Set companion to genuine Downed. State: ${companion.state}`);
  });

  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 2;
  }, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));

  const testDResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.hud.openPartyOverviewModal();
    const companion = main.party[1];
    const compCard = document.querySelector('.party-card[data-party-card-idx="1"]');
    const compCardDowned = compCard ? compCard.classList.contains('downed') : false;
    const compBadge = compCard ? compCard.querySelector('.party-status-downed') : null;

    return {
      compState: companion.state,
      compHp: companion.hp,
      compCritHp: companion.criticalHp,
      compAngle: companion.avatarSprite.angle,
      compAlpha: companion.avatarSprite.alpha,
      compCardDowned,
      hasCompBadge: !!compBadge
    };
  });

  console.log('Test D Results on arrival at Dungeon:', testDResult);
  if (testDResult.compState !== 'downed') throw new Error(`Companion state must be 'downed', got: ${testDResult.compState}`);
  if (!testDResult.compCardDowned) throw new Error('Companion party card MUST have downed class');
  if (!testDResult.hasCompBadge) throw new Error('Companion MUST have DOWNED badge');
  if (testDResult.compAngle !== 90) throw new Error(`Companion sprite angle must be 90, got: ${testDResult.compAngle}`);
  if (testDResult.compAlpha !== 0.6) throw new Error(`Companion sprite alpha must be 0.6, got: ${testDResult.compAlpha}`);
  console.log('✔ TEST D PASSED: Genuine Downed companion correctly persisted Downed state across portal transition!');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_d_companion_genuinely_downed_dungeon.png') });

  await browser.close();
  console.log('\n======================================================');
  console.log('ALL LIVE BROWSER VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================');
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
