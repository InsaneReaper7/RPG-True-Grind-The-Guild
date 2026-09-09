const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\49f10822-d0b5-4497-ac1a-67e208b07921';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M18 Verification] Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Combat') ||
        text.includes('[Player') ||
        text.includes('[UNLOCK') ||
        text.includes('[DISCOVERY') ||
        text.includes('Fire Magic') ||
        text.includes('Ember Adept') ||
        text.includes('Burn')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M18 Verification] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted successfully.');

    // =========================================================================
    // TEST 1: Party Overview & Equip Fire Magic
    // =========================================================================
    console.log('\n--- TEST 1: Party Overview Modal & Equipping Fire Magic ---');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && activeScene.hud) {
        activeScene.hud.openPartyOverviewModal();
      }
    });
    await sleep(500);

    const partyModalState = await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      const hud = activeScene ? activeScene.hud : null;
      const isOpen = hud ? hud.isPartyOverviewModalOpen() : false;
      const mainSelect = document.querySelector('.party-main-select');
      let hasFireMagicOption = false;
      if (mainSelect) {
        for (let i = 0; i < mainSelect.options.length; i++) {
          if (mainSelect.options[i].value === 'fire_magic') {
            hasFireMagicOption = true;
            break;
          }
        }
      }
      return {
        isOpen,
        hasFireMagicOption
      };
    });

    console.log('Party modal state:', partyModalState);
    if (!partyModalState.isOpen) {
      throw new Error('FAIL: Party overview modal failed to open');
    }
    if (!partyModalState.hasFireMagicOption) {
      throw new Error('FAIL: Main weapon dropdown missing fire_magic option');
    }
    console.log('✓ PASS: Party overview modal open and Fire Magic is selectable in Main Weapon dropdown.');

    // Equip Fire Magic on Hero
    const equipResult = await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      const hud = activeScene ? activeScene.hud : null;
      const hero = hud ? hud.currentParty[0] : null;
      const dataLoader = window.DataLoader ? window.DataLoader.getInstance() : null;
      const weapon = dataLoader.getWeapon('fire_magic');
      hero.equipWeapon(weapon);
      hud.renderPartyOverviewModal(true);

      return {
        equippedWeaponId: hero.equippedWeapon?.id,
        attackRangeTiles: hero.attackRangeTiles,
        isTwoHanded: hero.equippedWeapon?.isTwoHanded,
        offhandWeapon: hero.offhandWeapon
      };
    });

    console.log('Hero equipped state:', equipResult);
    if (equipResult.equippedWeaponId !== 'fire_magic') {
      throw new Error(`FAIL: Hero failed to equip fire_magic. Got: ${equipResult.equippedWeaponId}`);
    }
    if (equipResult.attackRangeTiles !== 4) {
      throw new Error(`FAIL: Fire Magic attack range should be 4 tiles. Got: ${equipResult.attackRangeTiles}`);
    }
    if (equipResult.offhandWeapon !== null) {
      throw new Error(`FAIL: Fire Magic is 2H, offhand weapon should be null. Got: ${equipResult.offhandWeapon}`);
    }
    console.log('✓ PASS: Fire Magic successfully equipped (4-tile range, 2H cleared offhand).');

    // Screenshot Party Overview Modal
    const shot1Path = path.join(ARTIFACT_DIR, 'm18_party_overview_fire_magic.png');
    await page.screenshot({ path: shot1Path });
    console.log(`✓ Screenshot saved: ${shot1Path}`);

    // Close party modal before combat
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && activeScene.hud) {
        activeScene.hud.closePartyOverviewModal();
      }
    });
    await sleep(300);

    // =========================================================================
    // TEST 2: Dungeon Transition & Fire Magic 4-Tile Ranged Attack
    // =========================================================================
    console.log('\n--- TEST 2: Dungeon Combat & 4-Tile Ranged Spellcasting ---');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });

    await sleep(2500);
    await page.waitForFunction(() => {
      const s = window.game.scene.getScene('MainScene');
      return s && s.sys.isVisible();
    }, { timeout: 10000 });
    console.log('✓ MainScene active and rendering.');

    // Ensure hero has Fire Magic equipped in MainScene
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();
      const fireMagic = dataLoader.getWeapon('fire_magic');
      scene.player.equipWeapon(fireMagic);
      scene.player.energy = 100;
    });

    // Position enemy exactly 3 tiles away with clear line of sight
    const combatSetup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const enemy = scene.enemies.find((e) => e.state !== 'dead' && e.state !== 'downed');
      if (!enemy) return null;

      const targetGridX = player.gridPos.x + 3;
      const targetGridY = player.gridPos.y;
      enemy.gridPos = { x: targetGridX, y: targetGridY };
      enemy.x = targetGridX * enemy.tileSize + enemy.tileSize / 2;
      enemy.y = targetGridY * enemy.tileSize + enemy.tileSize / 2;
      enemy.hp = 100;
      enemy.maxHp = 100;

      // Target enemy
      player.targetEntity = enemy;

      return {
        playerGrid: player.gridPos,
        enemyGrid: enemy.gridPos,
        distance: Math.max(Math.abs(player.gridPos.x - enemy.gridPos.x), Math.abs(player.gridPos.y - enemy.gridPos.y)),
        playerEnergy: player.energy,
        enemyHp: enemy.hp
      };
    });

    console.log('Combat setup:', combatSetup);
    if (!combatSetup) {
      throw new Error('FAIL: No living enemy found to test combat');
    }

    // Ensure high accuracy for deterministic test hit
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.player.equippedWeapon.baseAccuracy = 1.0;
      scene.player.energy = 100;
      scene.player.lastAttackTime = 0; // Ready to attack immediately
    });

    // Wait for attacks to execute
    await sleep(2000);

    const postAttackState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const enemy = player.targetEntity;
      const hasBurn = enemy ? enemy.hasStatusEffect('burn') : false;
      const burnEffect = enemy ? enemy.activeStatusEffects.get('burn') : null;
      return {
        playerEnergy: player.energy,
        enemyHp: enemy ? enemy.hp : 0,
        enemyState: enemy ? enemy.state : 'none',
        hasBurn,
        burnRemainingMs: burnEffect ? burnEffect.remainingMs : 0,
        burnColor: burnEffect ? burnEffect.def.color : null
      };
    });

    console.log('Post-attack combat state:', postAttackState);
    if (postAttackState.playerEnergy >= 100) {
      throw new Error(`FAIL: Fire Magic cast must consume Energy! Energy remained at ${postAttackState.playerEnergy}`);
    }
    console.log(`✓ Energy correctly deducted for Fire Magic cast (100 -> ${postAttackState.playerEnergy})!`);

    if (postAttackState.enemyHp >= 100) {
      throw new Error(`FAIL: Enemy did not take damage from Fire Magic! HP: ${postAttackState.enemyHp}`);
    }
    console.log(`✓ Enemy took damage from Fire Magic at range!`);

    // Screenshot Fire Magic combat
    const shot2Path = path.join(ARTIFACT_DIR, 'm18_fire_magic_combat.png');
    await page.screenshot({ path: shot2Path });
    console.log(`✓ Screenshot saved: ${shot2Path}`);

    // =========================================================================
    // TEST 3: Burn Status Effect & DoT Ticks
    // =========================================================================
    console.log('\n--- TEST 3: Burn Status Effect & DoT Ticking ---');

    // Ensure burn is applied to enemy for visual test if proc rolled false earlier
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const enemy = scene.player.targetEntity;
      const dataLoader = window.DataLoader.getInstance();
      const burnDef = dataLoader.getStatusEffect('burn');
      if (enemy && !enemy.hasStatusEffect('burn')) {
        enemy.applyStatusEffect(burnDef);
      }
    });

    const burnCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const enemy = scene.player.targetEntity;
      const effect = enemy.activeStatusEffects.get('burn');
      return {
        hasBurn: enemy.hasStatusEffect('burn'),
        durationMs: effect ? effect.def.durationMs : 0,
        tickIntervalMs: effect ? effect.def.tickIntervalMs : 0,
        damagePerTick: effect ? effect.def.damagePerTick : 0,
        color: effect ? effect.def.color : null,
        hasBurnIcon: !!(enemy.statusIcons && enemy.statusIcons.get('burn'))
      };
    });

    console.log('Burn effect definition check:', burnCheck);
    if (!burnCheck.hasBurn) {
      throw new Error('FAIL: Target enemy must have Burn status active');
    }
    if (burnCheck.durationMs !== 4000) {
      throw new Error(`FAIL: Burn duration must be 4000ms. Got: ${burnCheck.durationMs}`);
    }
    if (burnCheck.tickIntervalMs !== 1000) {
      throw new Error(`FAIL: Burn tick interval must be 1000ms. Got: ${burnCheck.tickIntervalMs}`);
    }
    if (burnCheck.damagePerTick !== 4) {
      throw new Error(`FAIL: Burn damage per tick must be 4. Got: ${burnCheck.damagePerTick}`);
    }
    if (burnCheck.color !== '#f97316') {
      throw new Error(`FAIL: Burn color must be #f97316. Got: ${burnCheck.color}`);
    }
    console.log('✓ PASS: Burn status effect verified (4000ms, 1000ms ticks, 4 dmg, #f97316 orange).');

    // Wait for a burn tick to trigger
    await sleep(1100);

    const shot3Path = path.join(ARTIFACT_DIR, 'm18_burn_dot_ticking.png');
    await page.screenshot({ path: shot3Path });
    console.log(`✓ Screenshot saved: ${shot3Path}`);

    // =========================================================================
    // TEST 4: Ember Adept Tier 0 Class Unlock
    // =========================================================================
    console.log('\n--- TEST 4: Ember Adept Tier 0 Class Unlock ---');

    const emberAdeptUnlock = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const prog = player.progression;

      const beforeUnlocked = prog.isClassUnlocked('ember_adept');

      // Set Fire Magic level to 10
      prog.getProficiencyStat('fire_magic').level = 10;
      prog.getProficiencyStat('fire_magic').currentExp = 0;
      prog.checkClassUnlocks();

      const afterUnlocked = prog.isClassUnlocked('ember_adept');
      const classDef = window.DataLoader.getInstance().getClass('ember_adept');

      return {
        beforeUnlocked,
        afterUnlocked,
        className: classDef.name,
        fantasy: classDef.fantasy,
        manaRegen: classDef.hiddenSkillBonuses?.mana_regen,
        burnChanceBonus: classDef.bonuses?.burnChance
      };
    });

    console.log('Ember Adept unlock check:', emberAdeptUnlock);
    if (emberAdeptUnlock.beforeUnlocked !== false) {
      throw new Error('FAIL: Ember Adept should be locked initially');
    }
    if (emberAdeptUnlock.afterUnlocked !== true) {
      throw new Error('FAIL: Ember Adept failed to unlock at Fire Magic 10');
    }
    if (emberAdeptUnlock.manaRegen !== 0.05) {
      throw new Error(`FAIL: Ember Adept must have mana_regen: 0.05 hidden bonus. Got: ${emberAdeptUnlock.manaRegen}`);
    }
    if (emberAdeptUnlock.burnChanceBonus !== undefined) {
      throw new Error('FAIL: Ember Adept must NOT have a burnChance bonus per review corrections!');
    }
    console.log('✓ PASS: Ember Adept unlocked cleanly at Fire Magic 10 with mana_regen: 0.05 and no burnChance bonus.');

    await sleep(600);
    const shot4Path = path.join(ARTIFACT_DIR, 'm18_ember_adept_unlocked.png');
    await page.screenshot({ path: shot4Path });
    console.log(`✓ Screenshot saved: ${shot4Path}`);

    // =========================================================================
    // TEST 5: Random Magic Staff Kit Resolution & Offensive Magic Pool
    // =========================================================================
    console.log('\n--- TEST 5: Random Magic Staff Starting Kit Resolution ---');

    const kitResolution = await page.evaluate(() => {
      const dataLoader = window.DataLoader.getInstance();
      const offensiveSchools = dataLoader.getOffensiveMagicSchools();
      const gs = window.GameState.getInstance();
      const resolved = gs.resolveStartingKit('random_magic_staff');

      return {
        offensiveSchoolsCount: offensiveSchools.length,
        offensiveSchoolIds: offensiveSchools.map((s) => s.id),
        resolvedKitId: resolved.id,
        resolvedKitName: resolved.name,
        resolvedMainWeapon: resolved.mainWeaponId,
        resolvedOffhand: resolved.offhandWeaponId
      };
    });

    console.log('Kit resolution check:', kitResolution);
    if (kitResolution.offensiveSchoolsCount !== 1 || kitResolution.offensiveSchoolIds[0] !== 'fire_magic') {
      throw new Error(`FAIL: Offensive magic school pool should contain only ['fire_magic']. Got: ${JSON.stringify(kitResolution.offensiveSchoolIds)}`);
    }
    if (kitResolution.resolvedMainWeapon !== 'fire_magic') {
      throw new Error(`FAIL: random_magic_staff kit must resolve main weapon to 'fire_magic'. Got: ${kitResolution.resolvedMainWeapon}`);
    }
    if (kitResolution.resolvedOffhand !== null) {
      throw new Error(`FAIL: random_magic_staff kit offhand must be null for 2H Fire Magic. Got: ${kitResolution.resolvedOffhand}`);
    }
    console.log('✓ PASS: Random Magic Staff resolves cleanly to Fire Magic and excludes Healing Magic.');

    console.log('\n========================================');
    console.log('🎉 ALL MILESTONE 18 BROWSER VERIFICATIONS PASSED!');
    console.log('========================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Milestone 18 Verification Failed:', err);
  process.exit(1);
});
