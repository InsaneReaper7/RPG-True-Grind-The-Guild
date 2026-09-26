import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const executablePath = CHROME_PATHS.find(p => fs.existsSync(p));

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('================================================================');
  console.log('LIVE BROWSER TEST: COMBAT-COOLDOWN EQUIP BLEED VERIFICATION');
  console.log('Testing that 4-second inCombat grace timer CANNOT bleed into Outpost');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,720']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
    if (msg.text().includes('Cannot equip') || msg.text().includes('inCombat') || msg.text().includes('Transitioning')) {
      console.log(`  [BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // -------------------------------------------------------------------------
  // TEST 1: Enter Dungeon, Engage Active Combat, and Verify Dungeon Equip Block
  // -------------------------------------------------------------------------
  console.log('\n--- Step 1: Entering Dungeon Floor 1 and Engaged in Combat ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    while (outpost.party.length < 4) {
      outpost.spawnTestCompanion();
    }
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 4;
  }, { timeout: 10000 });
  await sleep(500);

  const combatEngagement = await page.evaluate(async () => {
    const scene = window.game.scene.getScene('MainScene');
    const hero = scene.party[0];
    const enemy = scene.enemies[0];

    // Engage enemy
    scene.engageEnemy(enemy);
    // Force a combat tick so lastCombatTimeMs is set to current time
    scene.combatSystem.update(scene.time.now, 16);

    const dungeonTime = scene.time.now;
    const lastCombatTime = scene.combatSystem.lastCombatTimeMs;
    const inCombatActive = scene.combatSystem.currentInCombat;
    const heroInCombat = hero.inCombat;

    // Verify equip in dungeon is blocked (both because inCombat=true and isOutpost=false)
    const dataLoader = window.DataLoader.getInstance();
    const dagger = dataLoader.getWeapon('daggers');
    const equipAttemptInDungeon = hero.equipWeapon(dagger, false);

    return {
      dungeonTime,
      lastCombatTime,
      inCombatActive,
      heroInCombat,
      equipAttemptInDungeon
    };
  });

  console.log('  Dungeon Combat Status:', combatEngagement);
  assert.strictEqual(combatEngagement.inCombatActive, true, 'Combat system must be in combat');
  assert.strictEqual(combatEngagement.heroInCombat, true, 'Hero must have inCombat = true');
  assert.strictEqual(combatEngagement.equipAttemptInDungeon, false, 'Equip attempt in dungeon must be blocked');
  console.log('✓ Dungeon combat active and dungeon equip correctly blocked.');

  // -------------------------------------------------------------------------
  // TEST 2: Return to Outpost immediately (< 200ms) within the 4-second combat cooldown
  // -------------------------------------------------------------------------
  console.log('\n--- Step 2: Executing Immediate Return to Outpost (< 200ms after combat tick) ---');
  const returnResult = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const lastCombatTime = scene.combatSystem.lastCombatTimeMs;
    scene.executeTransitionToOutpost();
    return { lastCombatTime };
  });

  await page.waitForFunction(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return outpost && outpost.scene.isActive() && outpost.party && outpost.party.length >= 4;
  }, { timeout: 10000 });
  await sleep(200);

  console.log('✓ Successfully arrived in OutpostScene.');

  // -------------------------------------------------------------------------
  // TEST 3: Verify inCombat Flag Reset and Equip Success in Outpost
  // -------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying inCombat Flag & Testing Equip Operations in Outpost ---');
  const outpostEquipAudit = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const hud = outpost.hud;
    const dataLoader = window.DataLoader.getInstance();
    const hero = outpost.party[0];
    const valerie = outpost.party[1];

    // Check inCombat flags
    const partyInCombatFlags = outpost.party.map(p => ({
      name: p.entityName,
      inCombat: p.inCombat
    }));

    const isOutpostFlagInHud = hud.isOutpost;

    // Test 1: Equip Main Hand Weapon
    const shortsword = dataLoader.getWeapon('short_swords');
    const weaponEquipOk = hero.equipWeapon(shortsword, true);
    const equippedWeaponId = hero.equippedWeapon?.id;

    // Test 2: Equip Offhand Shield (universally allowed without dual wielding)
    const shield = dataLoader.getWeapon('shields');
    const offhandEquipOk = hero.equipOffhandWeapon(shield, true);
    const equippedOffhandId = hero.offhandWeapon?.id;

    // Test 3: Equip Helmet
    const leatherCap = dataLoader.getArmor('leather_cap');
    const helmetEquipOk = hero.equipArmorSlot('helmet', leatherCap, true);
    const equippedHelmetId = hero.equippedHelmet?.id;

    // Test 4: Equip Body Armor
    const leatherArmor = dataLoader.getArmor('leather_armor');
    const bodyEquipOk = hero.equipArmorSlot('body', leatherArmor, true);
    const equippedBodyId = hero.equippedBodyArmor?.id;

    // Test 5: Unequip operations
    const helmetUnequipOk = hero.equipArmorSlot('helmet', null, true);
    const offhandUnequipOk = hero.equipOffhandWeapon(null, true);
    const weaponUnequipOk = hero.equipWeapon(null, true);

    // Test 6: Companion equip
    const compWeaponOk = valerie.equipWeapon(shortsword, true);

    return {
      partyInCombatFlags,
      isOutpostFlagInHud,
      weaponEquipOk,
      equippedWeaponId,
      offhandEquipOk,
      equippedOffhandId,
      helmetEquipOk,
      equippedHelmetId,
      bodyEquipOk,
      equippedBodyId,
      helmetUnequipOk,
      offhandUnequipOk,
      weaponUnequipOk,
      compWeaponOk
    };
  });

  console.log('  Outpost Equip Audit Results:', JSON.stringify(outpostEquipAudit, null, 2));

  // Assertions
  for (const p of outpostEquipAudit.partyInCombatFlags) {
    assert.strictEqual(p.inCombat, false, `Party member ${p.name} must have inCombat = false in Outpost!`);
  }
  assert.strictEqual(outpostEquipAudit.isOutpostFlagInHud, true, 'HUD isOutpost flag must be true');
  assert.strictEqual(outpostEquipAudit.weaponEquipOk, true, 'Main hand weapon equip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.equippedWeaponId, 'short_swords', 'Equipped weapon must match short_swords');
  assert.strictEqual(outpostEquipAudit.offhandEquipOk, true, 'Offhand weapon equip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.helmetEquipOk, true, 'Helmet equip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.bodyEquipOk, true, 'Body armor equip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.helmetUnequipOk, true, 'Helmet unequip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.offhandUnequipOk, true, 'Offhand unequip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.weaponUnequipOk, true, 'Weapon unequip must succeed in Outpost');
  assert.strictEqual(outpostEquipAudit.compWeaponOk, true, 'Companion weapon equip must succeed in Outpost');

  console.log('✓ All Outpost equip and unequip operations succeeded with zero restriction.');

  // -------------------------------------------------------------------------
  // TEST 4: Party Wipe Transition and Immediate Equip Check
  // -------------------------------------------------------------------------
  console.log('\n--- Step 4: Testing Party Wipe Combat Transition & Immediate Outpost Equip ---');
  // Re-enter Dungeon
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 4;
  }, { timeout: 10000 });
  await sleep(500);

  // Trigger party wipe mid-combat
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const enemy = scene.enemies[0];
    scene.engageEnemy(enemy);
    scene.combatSystem.update(scene.time.now, 16);
    scene.handlePartyWipe();
  });

  await page.waitForFunction(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    return outpost && outpost.scene.isActive();
  }, { timeout: 10000 });
  await sleep(200);

  const wipeEquipAudit = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const dataLoader = window.DataLoader.getInstance();
    const hero = outpost.party[0];

    const inCombatFlags = outpost.party.map(p => p.inCombat);
    const shortsword = dataLoader.getWeapon('short_swords');
    const equipAfterWipeOk = hero.equipWeapon(shortsword, true);

    return {
      allInCombatFalse: inCombatFlags.every(f => f === false),
      equipAfterWipeOk
    };
  });

  assert.strictEqual(wipeEquipAudit.allInCombatFalse, true, 'All party members must have inCombat = false after wipe return');
  assert.strictEqual(wipeEquipAudit.equipAfterWipeOk, true, 'Hero must be able to equip immediately after party wipe return');

  console.log('✓ Post-wipe Outpost return verified: zero combat flag bleed, equip immediately permitted.');

  await browser.close();

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: COMBAT-COOLDOWN EQUIP RESTRICTION IS STRICTLY DUNGEON-ONLY');
  console.log('Zero bleed into OutpostScene confirmed across both normal and wipe returns.');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
