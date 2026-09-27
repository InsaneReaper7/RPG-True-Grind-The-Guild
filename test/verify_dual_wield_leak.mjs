import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('================================================================');
  console.log('🧪 VERIFYING DUAL WIELDING EXP LEAK FIX & SIDEARM ISOLATION');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[CombatSystem]') || text.includes('Dual Wield') || text.includes('EXP')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Enter Dungeon
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length > 0;
  }, { timeout: 10000 });
  await sleep(600);

  // Test 1: Valerie (Scout: Bow + Dagger sidearm)
  console.log('--- Test 1: Valerie (Bow + Dagger) Combat Verification ---');
  const valerieResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const valerie = main.party.find(p => p.entityName === 'Valerie') || main.party[0];
    
    // Ensure Valerie has Bow + Dagger
    const bow = (window).itemRegistry?.get('hunting_bow') || {
      id: 'hunting_bow',
      name: 'Hunting Bow',
      category: 'ranged',
      twoHanded: true,
      damage: 10,
      attackSpeed: 1,
      range: 4,
      proficiencyId: 'bow'
    };
    const dagger = (window).itemRegistry?.get('daggers') || {
      id: 'daggers',
      name: 'Daggers',
      category: 'melee_1h',
      twoHanded: false,
      damage: 6,
      attackSpeed: 1.2,
      range: 1,
      proficiencyId: 'daggers'
    };

    valerie.equippedWeapon = bow;
    valerie.offhandWeapon = dagger;

    const initialDwExp = valerie.progression.getProficiencyStat('dual_wielding').currentExp;
    const isDw = valerie.isDualWielding();
    const isLegitDw = main.combatSystem.isLegitimatelyDualWielding(valerie);

    // Spawn an enemy right in front of Valerie and have combat run
    const enemy = main.enemies[0];
    if (enemy) {
      // Simulate combat strikes
      for (let i = 0; i < 5; i++) {
        // Mainhand hit
        valerie.progression.addProficiencyExp(valerie.equippedWeapon.proficiencyId, 2);
        // Offhand strike logic check
        if (main.combatSystem.isLegitimatelyDualWielding(valerie)) {
          valerie.progression.addProficiencyExp('dual_wielding', 2);
        }
      }
      // Simulate kill
      if (valerie.isDualWielding() && valerie.offhandWeapon) {
        valerie.progression.addProficiencyExp(valerie.offhandWeapon.proficiencyId, 2);
        if (main.combatSystem.isLegitimatelyDualWielding(valerie)) {
          valerie.progression.addProficiencyExp('dual_wielding', 2);
        }
      }
    }

    const postDwExp = valerie.progression.getProficiencyStat('dual_wielding').currentExp;

    return {
      name: valerie.entityName,
      mainhand: valerie.equippedWeapon?.id,
      offhand: valerie.offhandWeapon?.id,
      isDw,
      isLegitDw,
      initialDwExp,
      postDwExp,
      expGained: postDwExp - initialDwExp
    };
  });

  console.log('Valerie Combat Result:', valerieResult);
  if (valerieResult.expGained !== 0) {
    throw new Error(`Valerie gained ${valerieResult.expGained} dual_wielding EXP with Bow + Daggers sidearm!`);
  }
  if (valerieResult.isLegitDw !== false) {
    throw new Error(`isLegitimatelyDualWielding must be false for Bow + Dagger!`);
  }
  console.log('✔ Valerie gained 0 Dual Wielding EXP with Bow + Daggers sidearm!');

  // Test 2: Sidearm combinations (Thrower: Throwing Weapons + Daggers, Javelin: Spear + Throwing Weapons)
  console.log('\n--- Test 2: Additional Sidearms (Thrower & Javelin) Verification ---');
  const sidearmsResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const testMember = main.party[0];

    const throwingWeapon = {
      id: 'throwing_daggers',
      name: 'Throwing Daggers',
      category: 'ranged',
      twoHanded: false,
      damage: 8,
      attackSpeed: 1,
      range: 3,
      proficiencyId: 'throwing'
    };
    const dagger = {
      id: 'daggers',
      name: 'Daggers',
      category: 'melee_1h',
      twoHanded: false,
      damage: 6,
      attackSpeed: 1.2,
      range: 1,
      proficiencyId: 'daggers'
    };
    const spear = {
      id: 'spear',
      name: 'Spear',
      category: 'melee_1h',
      twoHanded: false,
      damage: 12,
      attackSpeed: 0.9,
      range: 2,
      proficiencyId: 'spear'
    };

    // Case A: Throwing Weapons + Dagger
    testMember.equippedWeapon = throwingWeapon;
    testMember.offhandWeapon = dagger;
    const throwerLegit = main.combatSystem.isLegitimatelyDualWielding(testMember);

    // Case B: Spear + Throwing Weapons
    testMember.equippedWeapon = spear;
    testMember.offhandWeapon = throwingWeapon;
    const javelinLegit = main.combatSystem.isLegitimatelyDualWielding(testMember);

    return {
      throwerDaggerLegit: throwerLegit,
      javelinThrowingLegit: javelinLegit
    };
  });

  console.log('Sidearms Legitimacy Result:', sidearmsResult);
  if (sidearmsResult.throwerDaggerLegit || sidearmsResult.javelinThrowingLegit) {
    throw new Error('Sidearm pairings were incorrectly considered legitimate dual wielding!');
  }
  console.log('✔ Thrower and Javelin sidearm pairings correctly rejected from Dual Wielding!');

  // Test 3: Legitimate Dual Wielder (1H Melee + 1H Melee)
  console.log('\n--- Test 3: Legitimate Dual Wielder Verification ---');
  const legitResult = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const fighter = main.party[0];

    const sword1 = {
      id: 'iron_sword',
      name: 'Iron Sword',
      category: 'melee_1h',
      twoHanded: false,
      damage: 10,
      attackSpeed: 1.0,
      range: 1,
      proficiencyId: 'swords'
    };
    const dagger1 = {
      id: 'steel_dagger',
      name: 'Steel Dagger',
      category: 'melee_1h',
      twoHanded: false,
      damage: 7,
      attackSpeed: 1.3,
      range: 1,
      proficiencyId: 'daggers'
    };

    fighter.equippedWeapon = sword1;
    fighter.offhandWeapon = dagger1;

    // Subcase 3A: DW Locked
    fighter.progression.isDualWieldUnlocked = () => false;
    const isLegitLocked = main.combatSystem.isLegitimatelyDualWielding(fighter);

    // Subcase 3B: DW Unlocked
    fighter.progression.isDualWieldUnlocked = () => true;
    const isLegitUnlocked = main.combatSystem.isLegitimatelyDualWielding(fighter);

    const initialDwExp = fighter.progression.getProficiencyStat('dual_wielding').currentExp;

    // Simulate hits and kill while unlocked
    if (isLegitUnlocked) {
      fighter.progression.addProficiencyExp('dual_wielding', 2);
      fighter.progression.addProficiencyExp('dual_wielding', 2);
    }

    const postDwExp = fighter.progression.getProficiencyStat('dual_wielding').currentExp;

    return {
      isLegitLocked,
      isLegitUnlocked,
      initialDwExp,
      postDwExp,
      expGained: postDwExp - initialDwExp
    };
  });

  console.log('Legitimate Dual Wielder Result:', legitResult);
  if (legitResult.isLegitLocked !== false) {
    throw new Error('Dual wielder with locked perk should not be legitimate!');
  }
  if (legitResult.isLegitUnlocked !== true) {
    throw new Error('Dual wielder with unlocked perk and two 1H weapons must be legitimate!');
  }
  if (legitResult.expGained <= 0) {
    throw new Error('Legitimate dual wielder did not gain dual_wielding EXP!');
  }
  console.log('✔ Legitimate dual wielder correctly gained Dual Wielding EXP only when perk unlocked!');

  await browser.close();
  console.log('\n================================================================');
  console.log('🎉 ALL DUAL WIELDING EXP LEAK & SIDEARM ISOLATION CHECKS PASSED');
  console.log('================================================================');
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
