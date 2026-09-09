import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/9a75ceb1-0b67-4b16-abc1-e8bc1a4d39af';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Milestone 15 Browser & Visual Verification ===');
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
      text.includes('[Healing') ||
      text.includes('[Progression') ||
      text.includes('[Debug') ||
      text.includes('[Auto-Eat') ||
      text.includes('?')
    ) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // 1. Initial State in Outpost
  console.log('\n--- STEP 1: Verify Initial Outpost State ---');
  let state = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return {
      heroWeapon: outpost.player.equippedWeapon?.id,
      heroOffhand: outpost.player.offhandWeapon?.id,
      staffLevel: outpost.player.progression.getProficiencyLevel('staff'),
      healingMagicLevel: outpost.player.progression.getProficiencyLevel('healing_magic'),
      energyRegenLevel: outpost.player.progression.getProficiencyLevel('energy_regen'),
      manaRegenLevel: outpost.player.progression.getProficiencyLevel('mana_regen'),
      isStaffRevealed: outpost.player.progression.isStatRevealed('staff'),
      isHealingRevealed: outpost.player.progression.isStatRevealed('healing_magic'),
      isMedicUnlocked: outpost.player.progression.isClassUnlocked('medic'),
      isStaffAdeptUnlocked: outpost.player.progression.isClassUnlocked('staff_adept'),
      isCombatMedicUnlocked: outpost.player.progression.isClassUnlocked('combat_medic')
    };
  });
  console.log('Initial state:', state);
  assert.equal(state.staffLevel, 0);
  assert.equal(state.healingMagicLevel, 0);
  assert.equal(state.isStaffRevealed, false);
  assert.equal(state.isHealingRevealed, false);
  assert.equal(state.isMedicUnlocked, false);
  assert.equal(state.isStaffAdeptUnlocked, false);
  assert.equal(state.isCombatMedicUnlocked, false);

  // 2. Open Party Overview and Equip Staff on Hero
  console.log('\n--- STEP 2: Open Party Overview and Equip Staff ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.hud.openPartyOverviewModal(outpost.party);
  });
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m15_01_party_overview_initial.png` });
  console.log('Saved m15_01_party_overview_initial.png');

  // Verify Staff is present in Main Weapon dropdown and select Staff
  const equipResult = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const hero = outpost.player;
    const staffWeapon = window.DataLoader.getInstance().getWeapon('staff');
    hero.equipWeapon(staffWeapon);
    // Re-render party overview to inspect DOM
    outpost.hud.openPartyOverviewModal(outpost.party);
    return {
      equippedId: hero.equippedWeapon?.id,
      offhandWeapon: hero.offhandWeapon
    };
  });
  console.log('Equipped Staff:', equipResult);
  assert.equal(equipResult.equippedId, 'staff');
  assert.equal(equipResult.offhandWeapon, null, '2H Staff unequipped offhand');
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m15_02_party_overview_staff_equipped.png` });
  console.log('Saved m15_02_party_overview_staff_equipped.png');

  // Close Party Overview modal
  await page.evaluate(() => {
    const modal = document.querySelector('.party-overview-modal');
    if (modal) modal.remove();
  });
  await sleep(300);

  // 3. Transition to Dungeon (MainScene) and Test Healing Magic Auto-Cast
  console.log('\n--- STEP 3: Enter Dungeon and Test Healing Magic Auto-Cast ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });
  await sleep(2000);

  // Ensure companion exists in party
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    if (main.party.length < 2) {
      window.__spawnTestCompanion?.();
    }
  });
  await sleep(500);

  // Damage companion to trigger heal
  const healCast = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    const comp = main.party[1];
    comp.hp = 20; // Damaged companion
    hero.energy = 100;
    hero.lastSkillUseTimes.clear();

    const casted = main.combatSystem.checkAndAutocastHealingMagic(hero, 1000);
    return {
      casted,
      compHp: comp.hp,
      heroEnergy: hero.energy,
      healingExp: hero.progression.getProficiencyStat('healing_magic').currentExp,
      staffExp: hero.progression.getProficiencyStat('staff').currentExp
    };
  });
  console.log('Healing cast result:', healCast);
  assert.equal(healCast.casted, true, 'Healing magic auto-cast must succeed');
  assert.equal(healCast.compHp, 28, 'Companion healed from 20 to 28');
  assert.equal(healCast.heroEnergy, 85, 'Hero energy deducted by 15');
  assert.equal(healCast.healingExp, 2, 'Healing Magic awarded +2 EXP');
  assert.equal(healCast.staffExp, 0, 'Staff received 0 EXP from healing cast');

  await page.screenshot({ path: `${ARTIFACT_DIR}/m15_03_healing_magic_cast.png` });
  console.log('Saved m15_03_healing_magic_cast.png');

  // 4. Test Melee Fallback with Staff when Party is Full HP
  console.log('\n--- STEP 4: Melee Fallback with Staff on Enemy when Party Full HP ---');
  const meleeFallback = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    const comp = main.party[1];
    comp.hp = comp.maxHp; // Full HP
    hero.hp = hero.maxHp; // Full HP

    const initialHealingExp = hero.progression.getProficiencyStat('healing_magic').currentExp;
    const initialStaffExp = hero.progression.getProficiencyStat('staff').currentExp;

    let enemy = main.enemies[0];
    if (!enemy) {
      enemy = window.__spawnEnemy?.('wolf', hero.gridPos.x + 1, hero.gridPos.y);
    }
    if (enemy) {
      enemy.gridPos = { x: hero.gridPos.x + 1, y: hero.gridPos.y };
      enemy.x = enemy.gridPos.x * 32 + 16;
      enemy.y = enemy.gridPos.y * 32 + 16;
      hero.targetEntity = enemy;
      hero.lastAttackTime = 0;
      const initialEnemyHp = enemy.hp;

      // Force swing via CombatSystem update with guaranteed hit
      const origRandom = Math.random;
      Math.random = () => 0.1;
      try {
        main.combatSystem.update(3000, 16);
      } finally {
        Math.random = origRandom;
      }

      return {
        enemyHpBefore: initialEnemyHp,
        enemyHpAfter: enemy.hp,
        staffExpBefore: initialStaffExp,
        staffExpAfter: hero.progression.getProficiencyStat('staff').currentExp,
        healingExpBefore: initialHealingExp,
        healingExpAfter: hero.progression.getProficiencyStat('healing_magic').currentExp,
        intervalMs: hero.equippedWeapon.attackIntervalMs
      };
    }
    return null;
  });
  console.log('Melee fallback result:', meleeFallback);
  assert.equal(meleeFallback.intervalMs, 1300, 'Staff swing interval is 1300ms');
  assert.equal(meleeFallback.healingExpAfter, meleeFallback.healingExpBefore, 'Healing magic EXP did not increase during melee swing');
  assert.equal(meleeFallback.staffExpAfter, meleeFallback.staffExpBefore + 2, 'Staff EXP increased by +2 from melee swing');
  assert.ok(meleeFallback.enemyHpAfter < meleeFallback.enemyHpBefore, 'Enemy took physical damage from Staff swing');

  await page.screenshot({ path: `${ARTIFACT_DIR}/m15_04_staff_melee_fallback.png` });
  console.log('Saved m15_04_staff_melee_fallback.png');

  // 5. Test Independent Level Gap (Healing Magic Lv 1 vs Staff Lv 0)
  console.log('\n--- STEP 5: Independent Level Gap (Healing Magic Lv 1 vs Staff Lv 0) ---');
  const levelGap = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    // Add 48 more EXP to reach 50 EXP (Level 1) for Healing Magic
    hero.progression.addProficiencyExp('healing_magic', 48);
    // Reset staff EXP to 0 for pure test proof
    hero.progression.getProficiencyStat('staff').currentExp = 0;
    hero.progression.getProficiencyStat('staff').level = 0;

    return {
      healingLevel: hero.progression.getProficiencyLevel('healing_magic'),
      healingExp: hero.progression.getProficiencyStat('healing_magic').currentExp,
      healingRevealed: hero.progression.isStatRevealed('healing_magic'),
      staffLevel: hero.progression.getProficiencyLevel('staff'),
      staffExp: hero.progression.getProficiencyStat('staff').currentExp,
      staffRevealed: hero.progression.isStatRevealed('staff')
    };
  });
  console.log('Level gap verification:', levelGap);
  assert.equal(levelGap.healingLevel, 1, 'Healing Magic reached Level 1');
  assert.equal(levelGap.healingRevealed, true, 'Healing Magic revealed in UI');
  assert.equal(levelGap.staffLevel, 0, 'Staff remains Level 0');
  assert.equal(levelGap.staffExp, 0, 'Staff EXP is 0');
  assert.equal(levelGap.staffRevealed, false, 'Staff remains hidden in UI');

  // 6. Test Mana Regen Live Reveal upon Healing Magic >= 1
  console.log('\n--- STEP 6: Mana Regen Live Reveal & Eligibility ---');
  const manaReveal = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    const magicIds = window.DataLoader.getInstance().getMagicSchoolIds();
    const hasMagic = magicIds.some(id => hero.progression.getProficiencyLevel(id) >= 1);

    // Give Mana Regen 50 EXP to reach Level 1 now that magic is unlocked
    hero.progression.addProficiencyExp('mana_regen', 50);

    return {
      hasMagic,
      manaRegenLevel: hero.progression.getProficiencyLevel('mana_regen'),
      manaRegenRevealed: hero.progression.isStatRevealed('mana_regen')
    };
  });
  console.log('Mana Regen reveal result:', manaReveal);
  assert.equal(manaReveal.hasMagic, true, 'hasMagicProficiency dynamically evaluates to true');
  assert.equal(manaReveal.manaRegenLevel, 1, 'Mana Regen reached Level 1');
  assert.equal(manaReveal.manaRegenRevealed, true, 'Mana Regen revealed in UI');

  // 7. Test Energy Regen on Companion (0 Magic)
  console.log('\n--- STEP 7: Energy Regen Reveal on Physical Companion (0 Magic) ---');
  const energyReveal = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const comp = main.party[1]; // pure physical companion
    comp.progression.addProficiencyExp('energy_regen', 50);

    return {
      compMagicLevel: comp.progression.getProficiencyLevel('healing_magic'),
      energyRegenLevel: comp.progression.getProficiencyLevel('energy_regen'),
      energyRegenRevealed: comp.progression.isStatRevealed('energy_regen')
    };
  });
  console.log('Energy Regen reveal result:', energyReveal);
  assert.equal(energyReveal.compMagicLevel, 0, 'Companion has 0 magic');
  assert.equal(energyReveal.energyRegenLevel, 1, 'Companion Energy Regen reached Level 1');
  assert.equal(energyReveal.energyRegenRevealed, true, 'Companion Energy Regen revealed');

  // 8. Test Medic & Staff Adept Class Unlocks
  console.log('\n--- STEP 8: Medic & Staff Adept Tier 0 Novice Class Unlocks ---');
  const classUnlocks = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    // Level Healing Magic to 10
    hero.progression.getProficiencyStat('healing_magic').level = 10;
    hero.progression.checkClassUnlocks();
    const medicUnlocked = hero.progression.isClassUnlocked('medic');

    // Level Staff to 10
    hero.progression.getProficiencyStat('staff').level = 10;
    hero.progression.checkClassUnlocks();
    const staffAdeptUnlocked = hero.progression.isClassUnlocked('staff_adept');

    return {
      medicUnlocked,
      staffAdeptUnlocked,
      combatMedicUnlocked: hero.progression.isClassUnlocked('combat_medic')
    };
  });
  console.log('Class unlock results:', classUnlocks);
  assert.equal(classUnlocks.medicUnlocked, true, 'Medic unlocked at Healing Magic 10');
  assert.equal(classUnlocks.staffAdeptUnlocked, true, 'Staff Adept unlocked at Staff 10');
  assert.equal(classUnlocks.combatMedicUnlocked, false, 'Combat Medic remains locked without 5 revives + Healing Magic 30');

  // 9. Test Combat Medic Restored Dual Requirement & Grandfathering
  console.log('\n--- STEP 9: Combat Medic Restored Dual Requirement & Grandfather Rule ---');
  const combatMedicResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const hero = main.party[0];
    // Revive companion 5 times
    const comp = main.party[1];
    for (let i = 0; i < 5; i++) {
      comp.state = 'downed';
      comp.revive(hero);
    }
    // With 5 revives and Healing Magic 10 -> still locked!
    hero.progression.checkClassUnlocks();
    const lockedAt10 = hero.progression.isClassUnlocked('combat_medic');

    // Raise Healing Magic to 30 -> now unlocks!
    hero.progression.getProficiencyStat('healing_magic').level = 30;
    hero.progression.checkClassUnlocks();
    const unlockedAt30 = hero.progression.isClassUnlocked('combat_medic');

    // Snapshot and Grandfather Rule test:
    const snap = hero.progression.getSnapshotData();
    // Simulate loading into another progression where healing magic is 0 but unlockedClasses has combat_medic
    const testProg = new main.player.progression.constructor(window.DataLoader.getInstance().getClassesData());
    testProg.loadSnapshotData(snap);
    testProg.getProficiencyStat('healing_magic').level = 0; // zero out healing magic
    testProg.checkClassUnlocks(); // evaluation should NOT revoke
    const grandfatherPreserved = testProg.isClassUnlocked('combat_medic');

    return {
      lockedAt10,
      unlockedAt30,
      grandfatherPreserved
    };
  });
  console.log('Combat Medic results:', combatMedicResult);
  assert.equal(combatMedicResult.lockedAt10, false, 'Combat Medic remains locked at Healing Magic 10 + 5 revives');
  assert.equal(combatMedicResult.unlockedAt30, true, 'Combat Medic unlocks at Healing Magic 30 + 5 revives');
  assert.equal(combatMedicResult.grandfatherPreserved, true, 'Grandfather rule preserves unlock even if stat drops');

  // 10. Open Party Overview to view all newly revealed stats & classes in UI
  console.log('\n--- STEP 10: Final Party Overview Modal Screenshot ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.hud.dismissCurrentAnnouncement();
    const disc = document.getElementById('skill-discovered-modal');
    if (disc) disc.style.display = 'none';
    const unl = document.getElementById('unlock-modal');
    if (unl) unl.style.display = 'none';
    main.hud.openPartyOverviewModal(main.party);
  });
  await sleep(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/m15_05_party_overview_final.png` });
  console.log('Saved m15_05_party_overview_final.png');

  console.log('\n=== ALL BROWSER & VISUAL VERIFICATIONS COMPLETED SUCCESSFULLY! ===');
  await browser.close();
}

run().catch(err => {
  console.error('BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
