import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/af9f0367-aab8-4b8f-b0fc-b47c75ce19c7';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Milestone 24 Browser & Visual Verification ===');
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
      text.includes('[Skill') ||
      text.includes('[Combat') ||
      text.includes('[Progression') ||
      text.includes('✨')
    ) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // Take initial snapshot of outpost
  await page.screenshot({ path: `${ARTIFACT_DIR}/m24_outpost_initial.png` });
  console.log('✓ Captured m24_outpost_initial.png');

  // =========================================================================
  // 1. Verify Combat Medic Kit & Active Class in Loadout UI
  // =========================================================================
  console.log('\n--- Testing Combat Medic Unlock, Active Class, & Loadout in Browser ---');
  const cmResult = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const player = outpost.player;
    const hud = outpost.hud;

    // Prerequisites for Combat Medic: Healing Magic 30 + 5 Ally Revives
    player.progression.recordActivity('Ally Revived', 5);
    player.progression.addProficiencyExp('healing_magic', 6500); // 30+

    const isUnlocked = player.progression.isClassUnlocked('combat_medic');
    player.progression.setClassLevel('combat_medic', 40);

    // Explicitly set Active Class to combat_medic
    const setActiveSuccess = player.setActiveClass('combat_medic');

    // Equip Combat Medic's full 5-skill kit
    player.knownSkillIds = ['first_aid', 'smite', 'cleanse', 'guardian_ward', 'holy_nova'];
    player.equippedSkillIds = ['first_aid', 'smite', 'cleanse', 'guardian_ward', 'holy_nova'];

    // Dismiss any pending modal overlays and toast, then open the Loadout Modal
    hud.clearAnnouncementQueue();
    const toast = document.getElementById('build-feedback-toast');
    if (toast) { toast.className = ''; toast.innerText = ''; }
    hud.openLoadoutModal(player, player.progression);

    const badgeText = document.getElementById('active-class-current-badge')?.innerText || '';
    const activeSelectedEl = document.querySelector('#active-class-container .active-selected');
    const activeSelectedName = activeSelectedEl?.querySelector('.active-class-name')?.textContent || '';
    const isModalActive = document.getElementById('skill-loadout-modal')?.classList.contains('active') || false;

    return {
      isUnlocked,
      setActiveSuccess,
      activeClass: player.activeClass,
      cmLevel: player.progression.getClassLevel('combat_medic'),
      equippedSkills: player.equippedSkillIds,
      badgeText,
      activeSelectedName,
      isModalActive
    };
  });

  console.log('Combat Medic verification result:', cmResult);
  assert.equal(cmResult.isUnlocked, true, 'Combat Medic must be unlocked');
  assert.equal(cmResult.setActiveSuccess, true, 'Setting active class to combat_medic must succeed');
  assert.equal(cmResult.activeClass, 'combat_medic', 'Active class must be combat_medic');
  assert.equal(cmResult.cmLevel, 40, 'Combat Medic class level must be 40');
  assert.equal(cmResult.isModalActive, true, 'Loadout modal must be open and active');
  assert.ok(cmResult.badgeText.includes('Active: Combat Medic (Lv 40)'), `Badge must show 'Active: Combat Medic (Lv 40)', got: ${cmResult.badgeText}`);
  assert.equal(cmResult.activeSelectedName, 'Combat Medic', 'Selected card must be Combat Medic');
  assert.equal(cmResult.equippedSkills.length, 5, 'Must have 5 equipped skills');

  await sleep(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/m24_combat_medic_loadout.png` });
  console.log('✓ Captured m24_combat_medic_loadout.png with unambiguous Active: Combat Medic (Lv 40)');

  // Close loadout modal before switching to Restoration Mage
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closeLoadoutModal();
  });
  await sleep(500);

  // =========================================================================
  // 2. Verify Restoration Mage Kit & Active Class in Loadout UI
  // =========================================================================
  console.log('\n--- Testing Restoration Mage Unlock, Active Class, & Loadout in Browser ---');
  const restoResult = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const player = outpost.player;
    const hud = outpost.hud;

    // Prerequisites for Restoration Mage: Healing Magic 60 + Medic 15
    player.progression.setClassLevel('medic', 15);
    player.progression.addProficiencyExp('healing_magic', 60000); // 60+

    const isUnlocked = player.progression.isClassUnlocked('restoration_mage');
    player.progression.setClassLevel('restoration_mage', 40);

    // Explicitly set Active Class to restoration_mage
    const setActiveSuccess = player.setActiveClass('restoration_mage');

    // Equip Restoration Mage's full 5-skill kit
    player.knownSkillIds = ['heal', 'regenerate', 'barrier', 'blessed_weapons', 'mass_revive'];
    player.equippedSkillIds = ['heal', 'regenerate', 'barrier', 'blessed_weapons', 'mass_revive'];

    // Dismiss any pending modal overlays and toast, then open the Loadout Modal
    hud.clearAnnouncementQueue();
    const toast = document.getElementById('build-feedback-toast');
    if (toast) { toast.className = ''; toast.innerText = ''; }
    hud.openLoadoutModal(player, player.progression);

    const badgeText = document.getElementById('active-class-current-badge')?.innerText || '';
    const activeSelectedEl = document.querySelector('#active-class-container .active-selected');
    const activeSelectedName = activeSelectedEl?.querySelector('.active-class-name')?.textContent || '';
    const isModalActive = document.getElementById('skill-loadout-modal')?.classList.contains('active') || false;

    return {
      healingMagicLevel: player.progression.getProficiencyLevel('healing_magic'),
      medicLevel: player.progression.getClassLevel('medic'),
      isUnlocked,
      setActiveSuccess,
      activeClass: player.activeClass,
      restoLevel: player.progression.getClassLevel('restoration_mage'),
      equippedSkills: player.equippedSkillIds,
      badgeText,
      activeSelectedName,
      isModalActive
    };
  });

  console.log('Restoration Mage verification result:', restoResult);
  assert.equal(restoResult.isUnlocked, true, 'Restoration Mage must unlock at Healing Magic 60 + Medic 15');
  assert.equal(restoResult.setActiveSuccess, true, 'Setting active class to restoration_mage must succeed');
  assert.equal(restoResult.activeClass, 'restoration_mage', 'Active class must be restoration_mage');
  assert.equal(restoResult.restoLevel, 40, 'Restoration Mage level must be 40');
  assert.equal(restoResult.isModalActive, true, 'Loadout modal must be open and active');
  assert.ok(restoResult.badgeText.includes('Active: Restoration Mage (Lv 40)'), `Badge must show 'Active: Restoration Mage (Lv 40)', got: ${restoResult.badgeText}`);
  assert.equal(restoResult.activeSelectedName, 'Restoration Mage', 'Selected card must be Restoration Mage');
  assert.equal(restoResult.equippedSkills.length, 5, 'Must have 5 equipped skills');

  await sleep(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/m24_resto_mage_loadout.png` });
  console.log('✓ Captured m24_resto_mage_loadout.png with unambiguous Active: Restoration Mage (Lv 40)');

  // Close loadout modal before moving to MainScene
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.closeLoadoutModal();
  });
  await sleep(500);

  // =========================================================================
  // 3. Test In-Game Skill Casts in MainScene / Combat
  // =========================================================================
  console.log('\n--- Transitioning to Dungeon MainScene & Testing In-Game Casts ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.scene.start('MainScene');
  });
  await sleep(2500);

  const castTest = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const player = main.player;
    const combat = main.combatSystem;

    player.progression.setClassLevel('combat_medic', 40);
    player.progression.setClassLevel('restoration_mage', 40);
    player.knownSkillIds = ['guardian_ward', 'holy_nova', 'barrier', 'regenerate', 'blessed_weapons'];
    player.equippedSkillIds = ['guardian_ward', 'holy_nova', 'barrier', 'regenerate', 'blessed_weapons'];

    let wardCast = false;
    let novaCast = false;
    let barrierCast = false;
    let regenCast = false;
    let bwCast = false;

    if (combat) {
      player.energy = 100;
      wardCast = combat.castSkill(player, 'guardian_ward', player);
      player.energy = 100;
      novaCast = combat.castSkill(player, 'holy_nova', player);
      player.energy = 100;
      barrierCast = combat.castSkill(player, 'barrier', player);
      player.energy = 100;
      regenCast = combat.castSkill(player, 'regenerate', player);
      player.energy = 100;
      bwCast = combat.castSkill(player, 'blessed_weapons', player);
    }

    return {
      hasActiveShield: player.hasActiveShield(),
      shieldHp: player.getShieldHp(),
      wardCast,
      novaCast,
      barrierCast,
      regenCast,
      bwCast,
      activeEffects: Array.from(player.activeStatusEffects.keys())
    };
  });

  console.log('MainScene live cast test result:', castTest);
  assert.equal(castTest.hasActiveShield, true, 'Player should have active absorption shield in live scene');
  assert.ok(castTest.shieldHp > 0, 'Player shield HP should be > 0');
  assert.ok(castTest.activeEffects.includes('barrier') || castTest.activeEffects.includes('guardian_ward'), 'Shield effect active');
  assert.ok(castTest.activeEffects.includes('regenerate'), 'Regenerate effect active');
  assert.ok(castTest.activeEffects.includes('blessed_weapons'), 'Blessed Weapons effect active');

  await sleep(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/m24_combat_skill_effects.png` });
  console.log('✓ Captured m24_combat_skill_effects.png');

  await browser.close();
  console.log('\n=== Browser verification completed successfully! ===');
}

run().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
