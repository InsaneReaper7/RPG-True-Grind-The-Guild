import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const executablePath = CHROME_PATHS.find(p => fs.existsSync(p));
const TOTAL_FLOORS = 25;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSoakTest() {
  console.log('================================================================');
  console.log('🚀 AUTOMATED SOAK TEST (REFRESHED) — EXTENDED-SESSION BUG HUNTING');
  console.log(`🎯 Target: 25 Consecutive Floors + Bosses (5, 10, 15) + All 4 Regions`);
  console.log('⭐ Priority Focus: Downed / Revive / Leader-Swap / Teleporter Lifecycle');
  console.log('================================================================\n');

  const findings = [];
  const performanceLog = [];
  const browserErrors = [];
  const browserWarnings = [];

  function recordFinding(severity, category, floor, action, description, evidence) {
    const finding = {
      severity, // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
      category,
      floor,
      action,
      description,
      evidence
    };
    findings.push(finding);
    console.log(`\n🚨 [${severity}] Floor ${floor} (${category}): ${description}`);
    if (evidence) {
      console.log(`   Evidence: ${typeof evidence === 'object' ? JSON.stringify(evidence) : evidence}`);
    }
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1280,720'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('response', res => {
    if (res.status() === 404 && !res.url().includes('favicon.ico')) {
      console.log('  [404 NOT FOUND RESOURCE]:', res.url());
      browserErrors.push({ text: `404 Not Found: ${res.url()}` });
    }
  });

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error' && !text.includes('favicon.ico')) {
      browserErrors.push({ text, location: msg.location() });
    } else if (type === 'warn') {
      browserWarnings.push({ text });
    }
    if (
      (text.includes('Error') ||
      text.includes('Uncaught') ||
      text.includes('conflict') ||
      text.includes('Failed') ||
      text.includes('STACK')) &&
      !text.includes('favicon.ico')
    ) {
      console.log(`  [BROWSER ${type.toUpperCase()}]`, text);
    }
  });

  page.on('pageerror', err => {
    browserErrors.push({ text: err.toString(), stack: err.stack });
    console.log('  [BROWSER UNHANDLED EXCEPTION]', err.toString());
  });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // =========================================================================
  // SETUP PHASE: Outpost Setup, Bed Revive, and Leader-Swap Verification
  // =========================================================================
  console.log('\n--- SETUP PHASE: Outpost Configuration & Outpost Revive/Swap Audit ---');
  const outpostSetupResult = await page.evaluate(async () => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const gs = window.GameState.getInstance();
    const dataLoader = window.DataLoader.getInstance();

    // 1. Research unlocks so all 7 gathering types function
    gs.completeResearch('research_digging');
    gs.completeResearch('research_skinning');
    gs.completeResearch('research_butchering');

    // 2. Ensure full 4-person party
    while (outpost.party.length < 4) {
      outpost.spawnTestCompanion();
    }

    // Party Members:
    // Index 0: Guild Hero -> Spellsword
    // Index 1: Valerie -> Thrower
    // Index 2: Kaelen -> Mixed Armor Loadout
    // Index 3: Barris -> Combat Medic
    const hero = outpost.party[0];
    const valerie = outpost.party[1];
    const kaelen = outpost.party[2];
    const barris = outpost.party[3];

    const setStatLevel = (member, statId, level) => {
      const stat = member.progression.getProficiencyStat(statId);
      if (stat) {
        stat.level = level;
        stat.currentExp = 0;
      }
      member.progression.checkClassUnlocks();
      member.progression.checkDualWieldUnlock();
    };

    // Configure Hero as Spellsword
    hero.progression.setClassLevel('spellsword', 30);
    setStatLevel(hero, 'longswords', 30);
    setStatLevel(hero, 'arcane_magic', 30);
    hero.equipWeapon(dataLoader.getWeapon('longswords'), true);
    hero.knownSkillIds = ['arcane_strike', 'dimensional_lunge', 'blade_beam'];
    hero.equippedSkillIds = ['arcane_strike', 'dimensional_lunge', 'blade_beam'];

    // Configure Valerie as Thrower
    valerie.progression.setClassLevel('thrower', 30);
    setStatLevel(valerie, 'throwing_weapons', 30);
    setStatLevel(valerie, 'daggers', 30);
    valerie.equipWeapon(dataLoader.getWeapon('throwing_weapons'), true);
    valerie.equipOffhandWeapon(dataLoader.getWeapon('daggers'), true);
    valerie.knownSkillIds = ['quick_toss', 'skirmish_step', 'fan_of_knives', 'crippling_volley', 'blade_barrage'];
    valerie.equippedSkillIds = ['quick_toss', 'skirmish_step', 'fan_of_knives'];

    // Configure Kaelen with Mixed Armor (Silk Cowl = light, Leather Armor = medium)
    kaelen.equipHelmet(dataLoader.getArmor('silk_cowl'), true);
    kaelen.equipBodyArmor(dataLoader.getArmor('leather_armor'), true);

    // Configure Barris as Combat Medic
    barris.progression.setClassLevel('combat_medic', 40);
    barris.progression.setClassLevel('restoration_mage', 40);
    setStatLevel(barris, 'healing_magic', 30);
    barris.equipWeapon(dataLoader.getWeapon('staff'), true);
    barris.knownSkillIds = ['mass_revive'];
    barris.equippedSkillIds = ['mass_revive'];

    // --- Outpost Test A: Downed member revived via Outpost Bed ---
    valerie.hp = 0;
    valerie.criticalHp = 0;
    valerie.onDowned();
    const valerieDownedInOutpost = valerie.state === 'downed' && !!valerie.reviveIconSprite;

    // Outpost Bed Rest
    const rested = valerie.rest();
    const valerieRevivedByBed = rested && valerie.state === 'idle' && valerie.hp > 0 && valerie.reviveIconSprite === undefined;

    // --- Outpost Test B: Normal Outpost Leader Swap ---
    const initialLeaderName = outpost.party[0].entityName;
    const outpostSwapSuccess = outpost.changePartyLeader(1);
    const newLeaderName = outpost.party[0].entityName;
    // Swap back to original
    outpost.changePartyLeader(1);
    const finalLeaderName = outpost.party[0].entityName;

    return {
      partyCount: outpost.party.length,
      valerieDownedInOutpost,
      valerieRevivedByBed,
      initialLeaderName,
      newLeaderName,
      finalLeaderName,
      outpostSwapSuccess
    };
  });

  if (!outpostSetupResult.valerieRevivedByBed) {
    recordFinding(
      'CRITICAL',
      'Downed / Revive Lifecycle',
      0,
      'Outpost Bed Revive',
      'Downed party member revived via Outpost Bed failed to clear downed state or destroy revive icon!',
      outpostSetupResult
    );
  } else {
    console.log('✓ Outpost Bed Revive passed: State restored to idle and revive icon cleanly destroyed.');
  }

  if (!outpostSetupResult.outpostSwapSuccess || outpostSetupResult.newLeaderName === outpostSetupResult.initialLeaderName) {
    recordFinding(
      'HIGH',
      'Leader System',
      0,
      'Outpost Leader Swap',
      'Normal leader swap failed to reorder party leader in OutpostScene!',
      outpostSetupResult
    );
  } else {
    console.log('✓ Outpost Leader Swap passed: Leadership freely reassignable in Outpost.');
  }

  // Transition from Outpost to Dungeon Floor 1
  console.log('\nEntering Dungeon from Outpost...');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 4;
  }, { timeout: 10000 });

  console.log('✓ Successfully entered Dungeon Floor 1 with 4-member party.\n');

  // Verify Dungeon Leader-Swap Re-Lock on Floor 1 (Conscious leader cannot be swapped in dungeon)
  const dungeonRelockCheck = await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainScene');
    const swapAttempt = scene.changePartyLeader(1);
    return {
      swapAttemptBlocked: swapAttempt === false,
      leaderName: scene.party[0].entityName
    };
  });

  if (!dungeonRelockCheck.swapAttemptBlocked) {
    recordFinding(
      'CRITICAL',
      'Leader System',
      1,
      'Dungeon Leader-Swap Re-Lock',
      'Mid-dungeon leader swap was NOT blocked when the current Leader was conscious!',
      dungeonRelockCheck
    );
  } else {
    console.log('✓ Mid-dungeon leader swap re-lock verified: conscious leader cannot be swapped mid-dungeon.');
  }

  const startTime = Date.now();

  // =========================================================================
  // MAIN SOAK LOOP ACROSS 25 CONSECUTIVE FLOORS
  // =========================================================================
  for (let floor = 1; floor <= TOTAL_FLOORS; floor++) {
    const floorStart = Date.now();
    console.log(`\n======================================================`);
    console.log(`🔷 BEGINNING FLOOR ${floor} / ${TOTAL_FLOORS} (Elapsed: ${((floorStart - startTime) / 1000).toFixed(1)}s)`);
    console.log(`======================================================`);

    // Verify Scene & Floor Count & Region
    const floorInfo = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      const currentFloor = gs.getDungeonFloorCount();
      const region = window.DataLoader.getInstance().getRegionForFloor(currentFloor);
      const isBoss = scene.dungeon?.rooms?.some(r => r.type === 'boss') ?? false;
      const bossEnemy = scene.enemies.find(e => e.enemyData?.tier === 'boss' || e.enemyData?.id === 'abyssal_colossus' || e.enemyData?.id === 'glacial_sovereign');

      return {
        floorCount: currentFloor,
        regionId: region?.id,
        regionName: region?.name,
        partyCount: scene.party.length,
        enemiesCount: scene.enemies.length,
        nodesCount: scene.gatheringNodes.length,
        roomsCount: scene.dungeon?.rooms?.length ?? 0,
        hasBoss: isBoss,
        bossEnemyId: bossEnemy?.enemyData?.id,
        activeSceneKey: scene.scene.key
      };
    });

    console.log(`  Floor State: Floor=${floorInfo.floorCount} [${floorInfo.regionName}], Party=${floorInfo.partyCount}, Enemies=${floorInfo.enemiesCount}, Nodes=${floorInfo.nodesCount}, BossFloor=${floorInfo.hasBoss}`);

    if (floorInfo.floorCount !== floor) {
      recordFinding(
        'HIGH',
        'Floor Progression',
        floor,
        'Floor Count Check',
        `Dungeon floor counter mismatch: expected ${floor}, got ${floorInfo.floorCount}`,
        floorInfo
      );
    }

    // Check Regional Boss Constraints
    if (floor === 5) {
      if (!floorInfo.hasBoss || floorInfo.bossEnemyId !== 'abyssal_colossus') {
        recordFinding(
          'HIGH',
          'Boss Spawning',
          floor,
          'Abyssal Colossus Check',
          `Floor 5 expected Boss 'abyssal_colossus' in Abyssal Depths, found: ${floorInfo.bossEnemyId}`,
          floorInfo
        );
      } else {
        console.log(`  ✓ Floor 5 Boss verified: Abyssal Colossus correctly spawned in Abyssal Depths.`);
      }
    } else if (floor === 10) {
      if (!floorInfo.hasBoss) {
        recordFinding(
          'HIGH',
          'Boss Spawning',
          floor,
          'Infernal Caldera Boss Check',
          `Floor 10 expected Boss chamber in Infernal Caldera, but none found!`,
          floorInfo
        );
      } else {
        console.log(`  ✓ Floor 10 Boss verified: Subterranean Boss spawned in Infernal Caldera.`);
      }
    } else if (floor === 15) {
      if (!floorInfo.hasBoss || floorInfo.bossEnemyId !== 'glacial_sovereign') {
        recordFinding(
          'HIGH',
          'Boss Spawning',
          floor,
          'Glacial Sovereign Check',
          `Floor 15 expected Boss 'glacial_sovereign' in Glacial Caverns, found: ${floorInfo.bossEnemyId}`,
          floorInfo
        );
      } else {
        console.log(`  ✓ Floor 15 Boss verified: Glacial Sovereign correctly spawned in Glacial Caverns.`);
      }
    }

    // Performance Snapshot
    const perfSnapshot = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        fps: Math.round(scene.game.loop.actualFps),
        delta: scene.game.loop.delta,
        activeTweens: scene.tweens.getTweens().length,
        activeTimers: scene.time?._active?.length || 0,
        domNodesCount: document.querySelectorAll('*').length
      };
    });
    performanceLog.push({ floor, ...perfSnapshot });
    console.log(`  Perf: FPS=${perfSnapshot.fps}, Delta=${perfSnapshot.delta.toFixed(2)}ms, Tweens=${perfSnapshot.activeTweens}, Timers=${perfSnapshot.activeTimers}, DOM=${perfSnapshot.domNodesCount}`);

    // Check 1: Wall-clipping audit at floor start for party and enemies
    const wallClipStart = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const matrix = scene.gridMatrix;
      const clippedParty = scene.party.filter(p => matrix[p.gridPos.y]?.[p.gridPos.x] !== 0).map(p => ({
        name: p.entityName,
        pos: { ...p.gridPos }
      }));
      const clippedEnemies = scene.enemies.filter(e => matrix[e.gridPos.y]?.[e.gridPos.x] !== 0).map(e => ({
        name: e.entityName,
        pos: { ...e.gridPos }
      }));
      return { clippedParty, clippedEnemies };
    });

    if (wallClipStart.clippedParty.length > 0 || wallClipStart.clippedEnemies.length > 0) {
      recordFinding(
        'HIGH',
        'Wall Collision',
        floor,
        'Spawn Audit',
        'Entities spawned inside non-walkable wall tiles on floor generation!',
        wallClipStart
      );
    }

    // =========================================================================
    // PRIORITY FOCUS A (FLOOR 2): Leader Downed with NO Revive Items, Emergency Swap,
    // and Crystal Trigger by Non-Leader Conscious Member
    // =========================================================================
    if (floor === 2) {
      console.log('  [Priority Focus A] Testing Leader Downed mid-dungeon with NO revive items, Emergency Swap, and Crystal Trigger...');
      const leaderDownedResult = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const gs = window.GameState.getInstance();

        // 1. Clear any revive potions to ensure no revive items available
        gs.consumeItem('revive_potion', gs.getItemCount('revive_potion'));
        gs.inventory?.delete('revive_potion');
        scene.party.forEach(m => { m.inventory?.delete('revive_potion'); });
        const hasReviveItem = gs.getItemCount('revive_potion') > 0;

        // 2. Down the leader
        const leader = scene.party[0];
        leader.hp = 0;
        leader.criticalHp = 0;
        leader.onDowned();
        const leaderIsDowned = leader.state === 'downed' && !!leader.reviveIconSprite;

        // Confirm downed leader cannot move
        const prevPos = { ...leader.gridPos };
        leader.followPath([{ x: prevPos.x + 1, y: prevPos.y }]);
        const leaderRemainedStill = leader.gridPos.x === prevPos.x && leader.gridPos.y === prevPos.y;

        // 3. Emergency Leader Swap mid-dungeon (allowed because leader is downed)
        const emergencySwapOk = scene.changePartyLeader(1);
        const newLeader = scene.party[0];
        const newLeaderConscious = newLeader.state === 'idle';

        // 4. Confirm immediate re-lock: attempting to swap again while new leader is conscious MUST FAIL
        const reLockHeld = scene.changePartyLeader(1) === false;

        // 5. Non-Leader Conscious Member triggers crystal
        // Teleport conscious member adjacent to crystal to trigger immediately
        const consciousMember = scene.party.find(m => m.state !== 'downed' && m !== scene.player);
        if (consciousMember) {
          const adj = scene.findOpenAdjacentTile(scene.crystalPos);
          consciousMember.x = adj.x * scene.tileSize + scene.tileSize / 2;
          consciousMember.y = adj.y * scene.tileSize + scene.tileSize / 2;
          consciousMember.gridPos = { x: adj.x, y: adj.y };
        }
        scene.triggerCrystalInteraction();
        await new Promise(r => setTimeout(r, 200));

        const isModalOpen = scene.hud.isTeleporterCrystalModalOpen();
        scene.hud.closeTeleporterCrystalModal();

        return {
          hasReviveItem,
          leaderIsDowned,
          leaderRemainedStill,
          emergencySwapOk,
          newLeaderName: newLeader.entityName,
          newLeaderConscious,
          reLockHeld,
          consciousMemberFound: !!consciousMember,
          isModalOpen
        };
      });

      if (!leaderDownedResult.emergencySwapOk || !leaderDownedResult.reLockHeld) {
        recordFinding(
          'CRITICAL',
          'Leader System',
          floor,
          'Emergency Leader Swap & Re-lock',
          'Emergency leader swap or subsequent re-lock failed while leader was downed!',
          leaderDownedResult
        );
      } else {
        console.log(`  ✓ Emergency leader swap succeeded (Promoted: ${leaderDownedResult.newLeaderName}) and mid-dungeon re-lock held!`);
      }

      if (!leaderDownedResult.isModalOpen) {
        recordFinding(
          'CRITICAL',
          'Teleporter Interaction',
          floor,
          'Non-Leader Crystal Trigger',
          'Teleporter Crystal modal failed to open when triggered with a Downed member in the party!',
          leaderDownedResult
        );
      } else {
        console.log('  ✓ Teleporter Crystal opened successfully with Downed member present.');
      }
    }

    // =========================================================================
    // PRIORITY FOCUS B (FLOOR 3 & 4): Multi-Floor Downed Transitions
    // Confirm Downed Member carries across multiple consecutive floor transitions
    // =========================================================================
    if (floor === 3) {
      console.log('  [Priority Focus B] Verifying Multi-Floor Downed Transition #1...');
      const multiFloorDowned1 = await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        const downedMembers = scene.party.filter(m => m.state === 'downed');
        const validDownedArrival = downedMembers.length > 0 && downedMembers.every(m => m.hp === 0 && m.criticalHp === 0 && !!m.reviveIconSprite);
        return {
          downedCount: downedMembers.length,
          validDownedArrival,
          downedNames: downedMembers.map(m => m.entityName)
        };
      });

      if (!multiFloorDowned1.validDownedArrival) {
        recordFinding(
          'CRITICAL',
          'Downed / Revive Lifecycle',
          floor,
          'Multi-Floor Transition 1',
          'Downed party member failed to arrive Downed with active revive icon across Floor 2 -> Floor 3 transition!',
          multiFloorDowned1
        );
      } else {
        console.log(`  ✓ Multi-floor downed transition #1 verified: ${multiFloorDowned1.downedNames.join(', ')} arrived Downed with revive icon intact.`);
      }
    }

    if (floor === 4) {
      console.log('  [Priority Focus B] Verifying Multi-Floor Downed Transition #2 & Method 2 Revive (Potion Channel)...');
      const multiFloorDowned2 = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const gs = window.GameState.getInstance();
        const dataLoader = window.DataLoader.getInstance();

        const downedAlly = scene.party.find(m => m.state === 'downed') || scene.party[1];
        if (downedAlly.state !== 'downed') {
          downedAlly.hp = 0;
          downedAlly.criticalHp = 0;
          downedAlly.onDowned();
        }

        const reviver = scene.party.find(m => m.state !== 'downed');
        gs.addItem('revive_potion', 2);

        // Test Method 2: Item-Based Revive Potion Channel with Interruption
        const started = scene.startReviveChannel(reviver, downedAlly);
        await new Promise(r => setTimeout(r, 100));

        const channelBefore = scene.activeReviveChannels.get(reviver);
        const hasBarBefore = channelBefore && channelBefore.barContainer && channelBefore.barContainer.active;

        // Interrupt channel with dummy enemy
        const dummyAttacker = scene.spawnEnemyUnit(dataLoader.getEnemy('wolf'), reviver.gridPos.x + 2, reviver.gridPos.y, 'wolf-avatar');
        scene.interruptReviveChannel(reviver, dummyAttacker);
        await new Promise(r => setTimeout(r, 100));

        const channelAfterInterrupt = scene.activeReviveChannels.get(reviver);
        const isInterruptClean = channelAfterInterrupt === undefined && reviver.state !== 'channeling';
        const isBarDestroyedOnInterrupt = hasBarBefore && (!channelBefore.barContainer.active || channelBefore.barContainer.scene === null);

        // Complete full revive channel
        dummyAttacker.takeDamage(999);
        scene.onEnemyDefeated(dummyAttacker);
        reviver.inCombat = false;
        scene.combatSystem.lastCombatTimeMs = 0;

        scene.startReviveChannel(reviver, downedAlly);
        const fullChannel = scene.activeReviveChannels.get(reviver);
        scene.completeReviveChannel(reviver, fullChannel);

        const allyConsciousAfter = downedAlly.state === 'idle';
        const allyHpRestored = downedAlly.hp > 0 && downedAlly.criticalHp > 0;
        const iconCleanlyCleared = downedAlly.reviveIconSprite === undefined;

        // Valerie remains leader, demonstrating persistent companion leadership across multiple floors
        const currentLeaderName = scene.party[0].entityName;

        return {
          started,
          isInterruptClean,
          isBarDestroyedOnInterrupt,
          allyConsciousAfter,
          allyHpRestored,
          iconCleanlyCleared,
          currentLeaderName
        };
      });

      if (!multiFloorDowned2.isInterruptClean || !multiFloorDowned2.isBarDestroyedOnInterrupt) {
        recordFinding(
          'HIGH',
          'State Interruption',
          floor,
          'Mid-Revive Channel Interrupt',
          'Revive channel failed to cancel cleanly upon mid-channel attack interrupt!',
          multiFloorDowned2
        );
      }

      if (!multiFloorDowned2.allyConsciousAfter || !multiFloorDowned2.iconCleanlyCleared) {
        recordFinding(
          'CRITICAL',
          'Downed / Revive Lifecycle',
          floor,
          'Revive Potion Channel',
          'Teleport-arrived downed member revived via Revive Potion failed to restore conscious state or clear revive icon!',
          multiFloorDowned2
        );
      } else {
        console.log('  ✓ Method 2 Revive (Potion Channel) passed: Interrupted cleanly, completed, conscious restored, revive icon destroyed.');
      }
    }

    // =========================================================================
    // PRIORITY FOCUS C (FLOOR 5): Combat Medic Mass Revive & Real Boss Combat
    // (Exercising Spellsword, Thrower, and Mixed Armor Proficiency)
    // =========================================================================
    if (floor === 5) {
      console.log('  [Priority Focus C] Testing Combat Medic Mass Revive & Real Boss Combat...');
      const bossCombatResult = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const hero = scene.party.find(m => m.entityName === 'Guild Hero') || scene.party[0]; // Spellsword
        const valerie = scene.party.find(m => m.entityName === 'Valerie') || scene.party[1]; // Thrower
        const kaelen = scene.party.find(m => m.entityName === 'Kaelen') || scene.party[2]; // Mixed Armor
        const barris = scene.party.find(m => m.entityName === 'Barris') || scene.party[3]; // Combat Medic

        // 1. Down Kaelen to test Method 3 Revive: Combat Medic Mass Revive
        kaelen.hp = 0;
        kaelen.criticalHp = 0;
        kaelen.onDowned();
        const kaelenDownedWithIcon = kaelen.state === 'downed' && !!kaelen.reviveIconSprite;

        // Cast Mass Revive
        barris.progression.setClassLevel('combat_medic', 40);
        barris.progression.setClassLevel('restoration_mage', 40);
        if (!barris.knownSkillIds.includes('mass_revive')) barris.knownSkillIds.push('mass_revive');
        if (!barris.equippedSkillIds.includes('mass_revive')) barris.equippedSkillIds.push('mass_revive');
        barris.lastSkillUseTimes.clear();
        barris.energy = 100;
        kaelen.x = barris.x + 32;
        kaelen.y = barris.y;
        kaelen.gridPos = { x: barris.gridPos.x + 1, y: barris.gridPos.y };
        const massReviveSuccess = scene.combatSystem.castSkill(barris, 'mass_revive', barris);
        const kaelenRevivedToIdle = kaelen.state === 'idle' && kaelen.hp > 0;
        const kaelenIconCleared = kaelen.reviveIconSprite === undefined;

        // 2. Real Combat against Abyssal Colossus
        const boss = scene.enemies.find(e => (e.enemyData?.tier === 'boss' || e.enemyData?.id === 'abyssal_colossus') && e.state !== 'dead');
        let spellswordSkillsFired = false;
        let throwerSkillsFired = false;
        let lightArmorExpGained = false;
        let mediumArmorExpGained = false;

        if (boss) {
          // Ensure Kaelen has mixed armor equipped
          if (!kaelen.equippedHelmet) kaelen.equipHelmet(dataLoader.getArmor('silk_cowl'), true);
          if (!kaelen.equippedBodyArmor) kaelen.equipBodyArmor(dataLoader.getArmor('leather_armor'), true);

          const startLightExp = kaelen.progression.getProficiencyStat('light_armor')?.currentExp || 0;
          const startMedExp = kaelen.progression.getProficiencyStat('medium_armor')?.currentExp || 0;
          const startArcaneExp = hero.progression.getProficiencyStat('arcane_magic')?.currentExp || 0;

          // Teleport party near boss
          hero.x = (boss.gridPos.x + 1) * scene.tileSize + scene.tileSize / 2;
          hero.y = boss.gridPos.y * scene.tileSize + scene.tileSize / 2;
          hero.gridPos = { x: boss.gridPos.x + 1, y: boss.gridPos.y };

          // Cast Spellsword skills
          hero.energy = 100;
          hero.lastSkillUseTimes.clear();
          const cast1 = scene.combatSystem.castSkill(hero, 'arcane_strike', boss);
          const cast2 = scene.combatSystem.castSkill(hero, 'blade_beam', boss);
          spellswordSkillsFired = cast1 || cast2;

          // Cast Thrower skills
          valerie.progression.setClassLevel('thrower', 30);
          if (!valerie.equippedWeapon) valerie.equipWeapon(dataLoader.getWeapon('throwing_weapons'), true);
          if (!valerie.offhandWeapon) valerie.equipOffhandWeapon(dataLoader.getWeapon('daggers'), true);
          valerie.energy = 100;
          valerie.lastSkillUseTimes.clear();
          valerie.x = (boss.gridPos.x + 2) * scene.tileSize + scene.tileSize / 2;
          valerie.y = boss.gridPos.y * scene.tileSize + scene.tileSize / 2;
          valerie.gridPos = { x: boss.gridPos.x + 2, y: boss.gridPos.y };
          const cast3 = scene.combatSystem.castSkill(valerie, 'quick_toss', boss);
          const cast4 = scene.combatSystem.castSkill(valerie, 'fan_of_knives', boss);
          throwerSkillsFired = cast3 || cast4;

          // Trigger armor wear EXP on Kaelen
          kaelen.awardArmorWearExp('hit');
          kaelen.awardArmorWearExp('attack');
          kaelen.awardArmorWearExp('kill');

          const endLightExp = kaelen.progression.getProficiencyStat('light_armor')?.currentExp || 0;
          const endMedExp = kaelen.progression.getProficiencyStat('medium_armor')?.currentExp || 0;
          lightArmorExpGained = endLightExp > startLightExp;
          mediumArmorExpGained = endMedExp > startMedExp;

          // Defeat boss cleanly
          boss.takeDamage(9999);
          scene.onEnemyDefeated(boss);
        }

        return {
          kaelenDownedWithIcon,
          massReviveSuccess,
          kaelenRevivedToIdle,
          kaelenIconCleared,
          spellswordSkillsFired,
          throwerSkillsFired,
          lightArmorExpGained,
          mediumArmorExpGained
        };
      });

      if (!bossCombatResult.massReviveSuccess || !bossCombatResult.kaelenRevivedToIdle || !bossCombatResult.kaelenIconCleared) {
        recordFinding(
          'CRITICAL',
          'Downed / Revive Lifecycle',
          floor,
          'Combat Medic Mass Revive',
          'Combat Medic Mass Revive failed to revive downed member or clear revive icon!',
          bossCombatResult
        );
      } else {
        console.log('  ✓ Method 3 Revive (Combat Medic Mass Revive) passed: Downed ally restored, revive icon destroyed.');
      }

      if (!bossCombatResult.spellswordSkillsFired || !bossCombatResult.throwerSkillsFired) {
        recordFinding(
          'HIGH',
          'Combat Execution',
          floor,
          'New Classes Real Combat',
          'Spellsword or Thrower active skills failed to cast in real combat against Boss!',
          bossCombatResult
        );
      } else {
        console.log('  ✓ Real Combat passed: Spellsword and Thrower active skills executed cleanly against Boss.');
      }

      if (!bossCombatResult.lightArmorExpGained || !bossCombatResult.mediumArmorExpGained) {
        recordFinding(
          'HIGH',
          'Armor Proficiency',
          floor,
          'Mixed Armor EXP',
          'Mixed Light/Medium armor loadout failed to award wear EXP to both weight classes!',
          bossCombatResult
        );
      } else {
        console.log('  ✓ Armor Proficiency verified: Mixed Light & Medium loadout successfully gained EXP on hit/attack/kill.');
      }
    }

    // =========================================================================
    // PRIORITY FOCUS D (FLOOR 15): Glacial Sovereign Real Combat & Signature Mechanics
    // =========================================================================
    if (floor === 15) {
      console.log('  [Priority Focus D] Testing Glacial Sovereign Combat Mechanics & Phase Transition...');
      const sovereignResult = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const sovereign = scene.enemies.find(e => (e.enemyData?.id === 'glacial_sovereign' || e.enemyData?.tier === 'boss') && e.state !== 'dead');
        if (!sovereign) return { found: false };

        const initialHp = sovereign.hp;
        const initialMaxHp = sovereign.maxHp;

        // Damage to <= 50% HP to trigger Permafrost Glaciation barrier
        sovereign.takeDamage(initialMaxHp * 0.55);
        const isGlaciated = sovereign.iceBarrierHp > 0;
        const badgeText = sovereign.bossBadgeText?.text;

        // Defeat sovereign cleanly
        sovereign.takeDamage(9999);
        scene.onEnemyDefeated(sovereign);

        return {
          found: true,
          initialHp,
          initialMaxHp,
          isGlaciated,
          badgeText
        };
      });

      if (!sovereignResult.found || !sovereignResult.isGlaciated) {
        recordFinding(
          'HIGH',
          'Boss Mechanics',
          floor,
          'Glacial Sovereign Glaciation',
          'Glacial Sovereign failed to trigger Permafrost Glaciation barrier at <= 50% HP!',
          sovereignResult
        );
      } else {
        console.log(`  ✓ Glacial Sovereign verified: Enters Permafrost Glaciation barrier phase at <= 50% HP (${sovereignResult.badgeText}).`);
      }
    }

    // =========================================================================
    // STANDARD COVERAGE 1-5 (Skipped on Floors 2 & 3 to preserve pristine Downed state across transitions)
    // =========================================================================
    if (floor !== 2 && floor !== 3) {
      // STANDARD COVERAGE 1: Deliberately Interrupt Movement & Redirect Mid-Move
      const moveRedirectResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      scene.selectAllMembers();

      // Find two distant walkable tiles
      const walkable = [];
      for (let y = 1; y < scene.mapHeight - 1; y++) {
        for (let x = 1; x < scene.mapWidth - 1; x++) {
          if (scene.gridMatrix[y][x] === 0 && Math.hypot(x - scene.player.gridPos.x, y - scene.player.gridPos.y) > 6) {
            walkable.push({ x, y });
          }
        }
      }
      if (walkable.length < 2) return { skipped: true };

      const dest1 = walkable[0];
      const dest2 = walkable[walkable.length - 1];
      const activeSelected = scene.getSelectedMembers ? scene.getSelectedMembers() : scene.party;
      const claimed = new Set();

      // Issue Move 1
      scene.executePartyConvoyMovement(activeSelected, dest1.x, dest1.y, claimed);
      await new Promise(r => setTimeout(r, 100));

      const midMove1Active = scene.party.some(p => p.isMoving());
      const highlights1 = [...scene.lastMoveDestinationHighlights];

      // Interrupt mid-move by issuing Move 2
      scene.executePartyConvoyMovement(activeSelected, dest2.x, dest2.y, claimed);
      await new Promise(r => setTimeout(r, 100));

      const midMove2Active = scene.party.some(p => p.isMoving());
      const highlights2 = [...scene.lastMoveDestinationHighlights];
      const hasDest1InHighlights2 = highlights2.some(h => h.x === dest1.x && h.y === dest1.y);

      return {
        midMove1Active,
        midMove2Active,
        hasDest1InHighlights2
      };
    });

    if (moveRedirectResult.hasDest1InHighlights2) {
      recordFinding(
        'MEDIUM',
        'Visual Feedback',
        floor,
        'Mid-Move Redirect',
        'Old destination highlight persisted after redirecting movement command mid-stride!',
        moveRedirectResult
      );
    }

    // =========================================================================
    // STANDARD COVERAGE 2: Mid-Move Combat Engagement Interruption
    // =========================================================================
    const combatInterruptResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const livingEnemy = scene.enemies.find(e => e.state !== 'dead' && e.state !== 'downed');
      if (!livingEnemy) return { skipped: true };

      // Issue long movement command
      const activeSelected = scene.getSelectedMembers ? scene.getSelectedMembers() : scene.party;
      scene.executePartyConvoyMovement(activeSelected, scene.crystalPos.x, scene.crystalPos.y, new Set());
      await new Promise(r => setTimeout(r, 80));

      // Interrupt by clicking/engaging enemy
      scene.engageEnemy(livingEnemy);
      await new Promise(r => setTimeout(r, 150));

      // Verify destination highlights cleared upon combat engagement
      const lingeringHighlights = scene.activeMoveHighlights.length;

      // Stop combat cleanly
      livingEnemy.takeDamage(999);
      scene.onEnemyDefeated(livingEnemy);
      scene.party.forEach(p => { p.clearTarget(); p.inCombat = false; if (p.state !== 'idle') p.state = 'idle'; });
      scene.combatSystem.lastCombatTimeMs = 0;

      return { lingeringHighlights };
    });

    if (combatInterruptResult.lingeringHighlights > 0) {
      recordFinding(
        'MEDIUM',
        'Visual Feedback',
        floor,
        'Combat Interruption',
        'Move destination highlights remained visible after engaging enemy mid-move!',
        combatInterruptResult
      );
    }

    // =========================================================================
    // STANDARD COVERAGE 3: Split Party via Portrait Selection & Rejoin
    // =========================================================================
    const splitPartyResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const matrix = scene.gridMatrix;

      // Select companion 1 only
      scene.selectMemberByIndex(1, false);

      let splitDest = null;
      for (let dist = 6; dist >= 3; dist--) {
        const candidate = { x: scene.player.gridPos.x + dist, y: scene.player.gridPos.y };
        if (candidate.x < scene.mapWidth - 1 && matrix[candidate.y]?.[candidate.x] === 0) {
          splitDest = candidate;
          break;
        }
      }
      if (!splitDest) return { skipped: true };

      const heroPosBefore = { ...scene.party[0].gridPos };
      const comp1 = scene.party[1];

      const path = await scene.pathfinder.findPath(comp1.gridPos, splitDest);
      if (path.length > 0) {
        comp1.followPath(path);
      }
      for (let t = 0; t < 12; t++) {
        await new Promise(r => setTimeout(r, 80));
        if (!comp1.isMoving()) break;
      }

      const isComp1InWall = matrix[comp1.gridPos.y]?.[comp1.gridPos.x] !== 0;

      // Rejoin
      scene.selectAllMembers();
      const activeSelected = scene.getSelectedMembers ? scene.getSelectedMembers() : scene.party;
      scene.executePartyConvoyMovement(activeSelected, heroPosBefore.x, heroPosBefore.y, new Set());
      for (let t = 0; t < 12; t++) {
        await new Promise(r => setTimeout(r, 80));
        if (!scene.party.some(p => p.isMoving())) break;
      }

      const anyInWallAfterRejoin = scene.party.some(p => matrix[p.gridPos.y]?.[p.gridPos.x] !== 0);

      return {
        isComp1InWall,
        anyInWallAfterRejoin
      };
    });

    if (splitPartyResult.isComp1InWall || splitPartyResult.anyInWallAfterRejoin) {
      recordFinding(
        'HIGH',
        'Wall Collision',
        floor,
        'Split Party Rejoin',
        'Party member clipped through dungeon wall during split party or group rejoin!',
        splitPartyResult
      );
    }

    // =========================================================================
    // STANDARD COVERAGE 4: Gathering Across All Skills & Mid-Gather Interruption
    // =========================================================================
    const gatherTestResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();

      let testNode = scene.gatheringNodes.find(n => !n.isHarvested);
      if (!testNode) {
        const spawnPos = scene.findOpenAdjacentTile(scene.player.gridPos);
        testNode = scene.spawnGatheringNode(spawnPos.x, spawnPos.y, 'foraging_bush');
      }

      let gatherInterruptedCleanly = false;
      let barDestroyedOnInterrupt = false;

      if (testNode) {
        const gatherer = scene.party[0];
        scene.startGatherChannel(gatherer, testNode);
        await new Promise(r => setTimeout(r, 80));

        const channelBefore = scene.activeGatherChannels.get(gatherer);
        const hasBarBefore = channelBefore && channelBefore.barContainer && channelBefore.barContainer.scene !== null;

        // Interrupt channel with dummy enemy
        const dummyAttacker = scene.spawnEnemyUnit(dataLoader.getEnemy('wolf'), gatherer.gridPos.x + 2, gatherer.gridPos.y, 'wolf-avatar');
        scene.interruptGatherChannel(gatherer, dummyAttacker);
        await new Promise(r => setTimeout(r, 80));

        const channelAfter = scene.activeGatherChannels.get(gatherer);
        gatherInterruptedCleanly = channelAfter === undefined && gatherer.state !== 'channeling';
        barDestroyedOnInterrupt = hasBarBefore && (!channelBefore.barContainer.scene || !channelBefore.barContainer.active);

        dummyAttacker.takeDamage(999);
        scene.onEnemyDefeated(dummyAttacker);
        gatherer.inCombat = false;
        scene.combatSystem.lastCombatTimeMs = 0;
      }

      // Marquee Drag Test
      scene.toggleGatheringMode(true);
      await new Promise(r => setTimeout(r, 40));
      const isModeOn = scene.isGatheringMode;

      const allNodes = scene.gatheringNodes.filter(n => !n.isHarvested);
      scene.startGatheringQueue(allNodes.slice(0, 3));
      await new Promise(r => setTimeout(r, 100));

      const queueLength = scene.gatheringQueue.length;
      scene.clearGatheringQueue();
      scene.toggleGatheringMode(false);

      return {
        gatherInterruptedCleanly,
        barDestroyedOnInterrupt,
        isModeOn,
        queueLength
      };
    });

    if (!gatherTestResult.gatherInterruptedCleanly || !gatherTestResult.barDestroyedOnInterrupt) {
      recordFinding(
        'HIGH',
        'State Interruption',
        floor,
        'Mid-Gather Channel Interrupt',
        'Gathering channel progress bar or state leaked upon mid-channel interruption!',
        gatherTestResult
      );
    }

    // =========================================================================
    // STANDARD COVERAGE 5: Systematic Keyboard Shortcuts vs HUD Buttons
    // =========================================================================
    const shortcutAudit = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hud = scene.hud;
      const issues = [];

      // 1. Gathering Mode: Key F vs Button
      const initialMode = scene.isGatheringMode;
      hud.triggerGatheringModeToggle();
      const afterBtnToggle = scene.isGatheringMode;
      hud.triggerGatheringModeToggle();
      const afterBtnToggleOff = scene.isGatheringMode;

      if (afterBtnToggle === initialMode || afterBtnToggleOff !== initialMode) {
        issues.push({ test: 'GatheringModeBtn', err: 'Button failed to toggle gathering mode' });
      }

      // 2. Party Reselect All: Key G vs Button
      scene.selectMemberByIndex(1, false);
      const countBeforeReselect = scene.selectedMembers.size;
      hud.triggerGroupReselect();
      const countAfterReselect = scene.selectedMembers.size;
      if (countBeforeReselect !== 1 || countAfterReselect !== scene.party.length) {
        issues.push({ test: 'ReselectAllBtn', err: `Reselect button failed (before=${countBeforeReselect}, after=${countAfterReselect})` });
      }

      // 3. Portrait Selection: Keys 1..4 vs Portrait Elements
      for (let i = 0; i < scene.party.length; i++) {
        hud.selectMemberByIndex(i, false);
        const selected = scene.selectedMembers.has(scene.party[i]) && scene.selectedMembers.size === 1;
        if (!selected) {
          issues.push({ test: `PortraitSelect_${i}`, err: `Member ${i} selection failed via HUD` });
        }
      }
      scene.selectAllMembers();

      // 4. Modal Hotkeys & Convergence: Party Overview [O], Stockpile [I], Knowledge Base [K]
      hud.togglePartyOverviewModal();
      const partyModalOpen = hud.isPartyOverviewOpen ? hud.isPartyOverviewOpen() : document.getElementById('party-overview-modal')?.classList.contains('active');
      hud.closePartyOverviewModal();
      const partyModalClosed = !(hud.isPartyOverviewOpen ? hud.isPartyOverviewOpen() : document.getElementById('party-overview-modal')?.classList.contains('active'));

      hud.toggleStockpileModal();
      const stockModalOpen = hud.isStockpileModalOpen ? hud.isStockpileModalOpen() : document.getElementById('stockpile-modal')?.classList.contains('active');
      hud.closeStockpileModal();
      const stockModalClosed = !(hud.isStockpileModalOpen ? hud.isStockpileModalOpen() : document.getElementById('stockpile-modal')?.classList.contains('active'));

      hud.toggleKnowledgeBaseModal();
      const kbModalOpen = hud.isKnowledgeBaseModalOpen ? hud.isKnowledgeBaseModalOpen() : document.getElementById('knowledge-base-modal')?.classList.contains('active');
      hud.closeKnowledgeBaseModal();
      const kbModalClosed = !(hud.isKnowledgeBaseModalOpen ? hud.isKnowledgeBaseModalOpen() : document.getElementById('knowledge-base-modal')?.classList.contains('active'));

      if (!partyModalOpen || !partyModalClosed) {
        issues.push({ test: 'PartyOverviewModal', err: `Party modal toggle failed` });
      }
      if (!stockModalOpen || !stockModalClosed) {
        issues.push({ test: 'StockpileModal', err: `Stockpile modal toggle failed` });
      }
      if (!kbModalOpen || !kbModalClosed) {
        issues.push({ test: 'KnowledgeBaseModal', err: `Knowledge Base modal toggle failed` });
      }

      return { issues };
    });

    if (shortcutAudit.issues.length > 0) {
      for (const issue of shortcutAudit.issues) {
        recordFinding(
          'HIGH',
          'Input Convergence',
          floor,
          issue.test,
          issue.err,
          issue
        );
      }
    }
  }

    // =========================================================================
    // STANDARD COVERAGE 6: Visual State & Leak Audit
    // Confirm no lingering move highlights, gathering rings, or stale revive icons
    // =========================================================================
    const visualAudit = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const lingeringMoveHighlights = scene.activeMoveHighlights?.length || 0;
      const lingeringGatheringHighlights = scene.gatheringNodeHighlights?.size || 0;

      // Invariant audit: conscious living characters must NEVER have an active revive icon sprite
      const livingWithReviveIcons = scene.party.filter(p => p.state !== 'downed' && !!p.reviveIconSprite).map(p => ({
        name: p.entityName,
        state: p.state
      }));

      return {
        lingeringMoveHighlights,
        lingeringGatheringHighlights,
        livingWithReviveIcons
      };
    });

    if (visualAudit.livingWithReviveIcons.length > 0) {
      recordFinding(
        'CRITICAL',
        'Lingering Visual State',
        floor,
        'Revive Icon Invariant Check',
        'Conscious party member has lingering revive icon sprite visible on screen!',
        visualAudit.livingWithReviveIcons
      );
    }

    // =========================================================================
    // FLOOR TRANSITION: Continue Descent or Return to Outpost on Final Floor
    // =========================================================================
    if (floor < TOTAL_FLOORS) {
      console.log(`  [Floor Transition] Descending from Floor ${floor} to Floor ${floor + 1}...`);
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        scene.hud.closeTeleporterCrystalModal();
        scene.hud.closePartyOverviewModal();
        scene.hud.closeStockpileModal();
        scene.hud.closeKnowledgeBaseModal();
        scene.executeContinueDescent();
      });

      await page.waitForFunction((nextFloor) => {
        const main = window.game.scene.getScene('MainScene');
        const gs = window.GameState?.getInstance?.();
        return (
          main &&
          main.scene.isActive() &&
          gs &&
          gs.getDungeonFloorCount() === nextFloor &&
          main.party &&
          main.party.length >= 4
        );
      }, { timeout: 15000 }, floor + 1);

      await sleep(500);
      console.log(`✓ Completed transition to Floor ${floor + 1}.`);
    } else {
      console.log(`\n🎉 Reached final floor ${TOTAL_FLOORS}! Executing End-of-Run Return to Outpost with Downed Member...`);

      // Final Floor Outpost Return Test:
      // Down Valerie on Floor 25, transition to Outpost, confirm Valerie arrives Downed with Revive Icon in Outpost,
      // revive via Bed Rest, and confirm state & icon clear cleanly!
      const endOfRunOutpostResult = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const valerie = scene.party[1];
        valerie.hp = 0;
        valerie.criticalHp = 0;
        valerie.onDowned();

        scene.executeTransitionToOutpost();
        return true;
      });

      await page.waitForFunction(() => {
        const outpost = window.game.scene.getScene('OutpostScene');
        return outpost && outpost.scene.isActive() && outpost.party && outpost.party.length >= 4;
      }, { timeout: 15000 });

      await sleep(600);

      const outpostBedReviveFinal = await page.evaluate(() => {
        const outpost = window.game.scene.getScene('OutpostScene');
        const valerie = outpost.party[1];
        const arrivedDowned = valerie.state === 'downed' && !!valerie.reviveIconSprite;

        // Perform Bed rest
        const rested = valerie.rest();
        const consciousAfter = valerie.state === 'idle' && valerie.hp === valerie.maxHp;
        const iconCleared = valerie.reviveIconSprite === undefined;

        return {
          arrivedDowned,
          rested,
          consciousAfter,
          iconCleared
        };
      });

      if (!outpostBedReviveFinal.arrivedDowned || !outpostBedReviveFinal.consciousAfter || !outpostBedReviveFinal.iconCleared) {
        recordFinding(
          'CRITICAL',
          'Downed / Revive Lifecycle',
          TOTAL_FLOORS,
          'End-of-Run Outpost Return & Bed Revive',
          'Member returning downed from Floor 25 failed to arrive Downed or failed to clear revive icon upon Outpost Bed rest!',
          outpostBedReviveFinal
        );
      } else {
        console.log('✓ End-of-Run Outpost Return & Bed Revive passed: Member arrived Downed from Floor 25 and cleanly cleared on Bed rest.');
      }
    }
  }

  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`🏁 SOAK TEST RUN COMPLETED: ${TOTAL_FLOORS} Consecutive Floors in ${totalDurationSec}s`);
  console.log('================================================================\n');

  // Audit memory and performance trends across the run
  const fpsTrend = performanceLog.map(p => p.fps);
  const minFps = Math.min(...fpsTrend);
  const maxFps = Math.max(...fpsTrend);
  const avgFps = (fpsTrend.reduce((a, b) => a + b, 0) / fpsTrend.length).toFixed(1);
  const startDom = performanceLog[0]?.domNodesCount || 0;
  const endDom = performanceLog[performanceLog.length - 1]?.domNodesCount || 0;

  console.log(`Performance Summary: Avg FPS: ${avgFps}, Min FPS: ${minFps}, Max FPS: ${maxFps}`);
  console.log(`DOM Count: Start=${startDom}, End=${endDom} (Delta: ${endDom - startDom})`);

  if (minFps < 30) {
    recordFinding(
      'MEDIUM',
      'Performance Degradation',
      TOTAL_FLOORS,
      'FPS Degradation',
      `Framerate dropped to ${minFps} FPS during extended soak session (average: ${avgFps} FPS).`,
      { minFps, avgFps, fpsTrend }
    );
  }

  if (endDom - startDom > 500) {
    recordFinding(
      'MEDIUM',
      'Memory Leak',
      TOTAL_FLOORS,
      'DOM Accumulation',
      `DOM element count increased significantly (+${endDom - startDom} nodes) across 25 floors without being cleaned up.`,
      { startDom, endDom, delta: endDom - startDom }
    );
  }

  // Audit any browser errors logged
  if (browserErrors.length > 0) {
    recordFinding(
      'HIGH',
      'Unhandled Exceptions',
      'Various',
      'Console Errors',
      `Encountered ${browserErrors.length} unhandled errors / exceptions in browser console during run.`,
      browserErrors.slice(0, 5)
    );
  }

  // Write structured report artifact
  const reportData = {
    totalFloors: TOTAL_FLOORS,
    durationSeconds: parseFloat(totalDurationSec),
    performance: {
      minFps,
      maxFps,
      avgFps: parseFloat(avgFps),
      startDom,
      endDom,
      domGrowth: endDom - startDom
    },
    findings
  };

  const reportPath = path.resolve('test/soak_test_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`Saved structured soak test results to ${reportPath}`);

  await browser.close();
  return reportData;
}

runSoakTest().catch(err => {
  console.error('Soak test execution failed:', err);
  process.exit(1);
});
