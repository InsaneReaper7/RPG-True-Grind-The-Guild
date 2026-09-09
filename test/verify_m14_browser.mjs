import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/9caf4cc1-ecee-4909-9ca8-8b83fa274d6d';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Milestone 14 Full Browser & Visual Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (
      text.includes('[Combat') ||
      text.includes('[Skill') ||
      text.includes('[Progression') ||
      text.includes('[Debug')
    ) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // 1. Initial State in Outpost
  console.log('\n--- STEP 1: Verify Initial Outpost State & Initial Active Class None ---');
  let state = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return {
      activeClass: outpost.player.activeClass,
      shortSwordsLevel: outpost.player.progression.getProficiencyLevel('short_swords'),
      isFencerUnlocked: outpost.player.progression.isClassUnlocked('fencer'),
      isGuardianUnlocked: outpost.player.progression.isClassUnlocked('guardian'),
      isVanguardUnlocked: outpost.player.progression.isClassUnlocked('vanguard')
    };
  });
  console.log('Initial state:', state);
  assert.equal(state.activeClass, null, 'Initial activeClass should be null');
  assert.equal(state.isFencerUnlocked, false, 'Fencer should be locked initially');
  assert.equal(state.isGuardianUnlocked, false, 'Guardian should be locked initially');
  assert.equal(state.isVanguardUnlocked, false, 'Vanguard should be locked initially');

  // 2. Open Loadout Modal and verify Active Class Shelf rendered
  console.log('\n--- STEP 2: Open Skill Loadout Modal in Outpost ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.openLoadoutModal(outpost.player, outpost.progressionSystem);
  });
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m14_outpost_loadout_initial.png` });
  console.log('Saved m14_outpost_loadout_initial.png');

  // 3. Fulfill Vanguard Requirements via debug helper
  console.log('\n--- STEP 3: Setup Vanguard Requirements (SS 30, Shields 30, Fencer 5, Guardian 5) ---');
  await page.evaluate(() => {
    window.__setupVanguardTestState();
  });
  await sleep(500);

  state = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return {
      activeClass: outpost.player.activeClass,
      isFencerUnlocked: outpost.player.progression.isClassUnlocked('fencer'),
      isGuardianUnlocked: outpost.player.progression.isClassUnlocked('guardian'),
      isVanguardUnlocked: outpost.player.progression.isClassUnlocked('vanguard'),
      fencerLvl: outpost.player.progression.getClassLevel('fencer'),
      guardianLvl: outpost.player.progression.getClassLevel('guardian'),
      vanguardLvl: outpost.player.progression.getClassLevel('vanguard')
    };
  });
  console.log('Post-unlock state:', state);
  assert.equal(state.isFencerUnlocked, true, 'Fencer unlocked');
  assert.equal(state.isGuardianUnlocked, true, 'Guardian unlocked');
  assert.equal(state.isVanguardUnlocked, true, 'Vanguard unlocked');
  assert.equal(state.fencerLvl, 5, 'Fencer Lv 5');
  assert.equal(state.guardianLvl, 5, 'Guardian Lv 5');
  assert.equal(state.vanguardLvl, 1, 'Vanguard Lv 1');

  // 4. Set Active Class to Vanguard in Loadout Modal
  console.log('\n--- STEP 4: Set Active Class to Vanguard in Loadout Modal ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.player.setActiveClass('vanguard');
    outpost.hud.renderLoadoutModal(outpost.player, outpost.progressionSystem);
  });
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m14_loadout_vanguard_active.png` });
  console.log('Saved m14_loadout_vanguard_active.png');

  // Close loadout modal
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closeLoadoutModal();
  });
  await sleep(300);

  // 5. Transition to Dungeon Floor 1
  console.log('\n--- STEP 5: Transition to Dungeon Floor 1 ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });
  await sleep(2000);

  // 6. Set Vanguard to Level 40 and equip 5 Vanguard skills
  console.log('\n--- STEP 6: Set Vanguard to Level 40 and equip all 5 skills ---');
  await page.evaluate(() => {
    window.__setVanguardLevel(40);
    const main = window.game.scene.getScene('MainScene');
    main.player.equippedSkillIds = ['shield_bash', 'guard_up', 'taunt', 'retaliate', 'unbreakable'];
  });
  await sleep(500);

  // 7. Test Skills in Dungeon (Shield Bash stun, Guard Up, Taunt, Retaliate, Unbreakable)
  console.log('\n--- STEP 7: Spawn Enemy and Cast Vanguard Skills in Combat ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    // Spawn wolf 1 tile away from player
    const px = main.player.gridPos.x;
    const py = main.player.gridPos.y;
    const enemy = window.__spawnEnemy('wolf', px + 1, py);
    if (enemy) {
      window.__testEnemy = enemy;
    }
  });
  await sleep(500);

  // Dismiss any unlock modals by pressing Esc / clicking modal
  await page.evaluate(() => {
    const modal = document.getElementById('unlock-modal');
    if (modal) modal.classList.remove('active');
  });
  await sleep(300);

  // Cast Shield Bash
  console.log('Casting Shield Bash...');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.player.energy = 100;
    main.combatSystem.castSkill(main.player, 'shield_bash', window.__testEnemy);
  });
  await sleep(300);

  // Cast Guard Up & Retaliate & Taunt
  console.log('Casting Guard Up, Retaliate, Taunt...');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.player.energy = 100;
    main.combatSystem.castSkill(main.player, 'guard_up');
    main.combatSystem.castSkill(main.player, 'retaliate');
    main.combatSystem.castSkill(main.player, 'taunt');
  });
  await sleep(500);

  // Cast Unbreakable
  console.log('Casting Unbreakable...');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.player.energy = 100;
    main.combatSystem.castSkill(main.player, 'unbreakable');
  });
  await sleep(400);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m14_dungeon_combat_vanguard_skills.png` });
  console.log('Saved m14_dungeon_combat_vanguard_skills.png');

  // Defeat enemy and verify +25 Vanguard Class EXP kill reward
  console.log('\n--- STEP 8: Defeat Enemy and Verify +25 Vanguard Class EXP Kill Reward ---');
  const expStateBefore = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    return main.progressionSystem.getClassStat('vanguard').currentExp;
  });

  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    if (window.__testEnemy) {
      main.combatSystem.handleTargetDefeated(main.player, window.__testEnemy, 'short_swords');
    }
  });
  await sleep(500);

  const expStateAfter = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    return {
      vanguardExp: main.progressionSystem.getClassStat('vanguard').currentExp,
      fencerExp: main.progressionSystem.getClassStat('fencer').currentExp,
      guardianExp: main.progressionSystem.getClassStat('guardian').currentExp,
      activeClass: main.player.activeClass
    };
  });
  console.log('EXP state after enemy defeat:', expStateAfter);
  assert.equal(expStateAfter.vanguardExp, expStateBefore + 25, 'Vanguard received exactly +25 Class EXP');
  assert.equal(expStateAfter.fencerExp, 0, 'Inactive Fencer remained at 0 EXP');
  assert.equal(expStateAfter.guardianExp, 0, 'Inactive Guardian remained at 0 EXP');

  // Open Debug Panel and capture screenshot
  console.log('\n--- STEP 9: Open Debug Panel to inspect All-Skills and M14 Controls ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.hud.setDebugSkillsPanelVisible(true);
  });
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m14_debug_panel_active_class.png` });
  console.log('Saved m14_debug_panel_active_class.png');

  await browser.close();
  console.log('\n[SUCCESS] Milestone 14 Browser and Visual Verification Completed Successfully!');
}

run().catch((err) => {
  console.error('[FAILED] Milestone 14 browser verification error:', err);
  process.exit(1);
});