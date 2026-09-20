import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TOTAL_FLOORS = 25;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSoakTest() {
  console.log('================================================================');
  console.log('🚀 AUTOMATED SOAK TEST — EXTENDED-SESSION & EDGE-CASE HUNTING');
  console.log(`🎯 Target: 1 Session, ${TOTAL_FLOORS} Consecutive Floors with Systematic Interruption`);
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
    executablePath: CHROME_PATH,
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
    if (res.status() === 404) {
      console.log('  [404 NOT FOUND RESOURCE]:', res.url());
      browserErrors.push({ text: `404 Not Found: ${res.url()}` });
    }
  });

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      browserErrors.push({ text, location: msg.location() });
    } else if (type === 'warn') {
      browserWarnings.push({ text });
    }
    if (
      text.includes('Error') ||
      text.includes('Uncaught') ||
      text.includes('conflict') ||
      text.includes('Failed') ||
      text.includes('STACK')
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

  // 1. Initial State in Outpost: Setup 4-person party, unlock research for digging, skinning, butchering
  console.log('\n--- SETUP: Preparing initial Outpost state & Party ---');
  await page.evaluate(() => {
    const gs = window.GameState.getInstance();
    // Complete research for gathering types so all 7 can spawn & be gathered
    gs.completeResearch('research_digging');
    gs.completeResearch('research_skinning');
    gs.completeResearch('research_butchering');
    // Ensure 4 party members
    while (window.game.scene.getScene('OutpostScene').party.length < 4) {
      window.__spawnTestCompanion?.();
    }
  });
  await sleep(500);

  // Transition from Outpost to Dungeon Floor 1
  console.log('Entering Dungeon from Outpost...');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length >= 4;
  }, { timeout: 10000 });

  console.log('✓ Successfully entered Dungeon Floor 1 with 4-member party.\n');

  const startTime = Date.now();

  // MAIN SOAK LOOP ACROSS 25 CONSECUTIVE FLOORS
  for (let floor = 1; floor <= TOTAL_FLOORS; floor++) {
    const floorStart = Date.now();
    console.log(`\n======================================================`);
    console.log(`🔷 BEGINNING FLOOR ${floor} / ${TOTAL_FLOORS} (Elapsed: ${((floorStart - startTime) / 1000).toFixed(1)}s)`);
    console.log(`======================================================`);

    // Verify Scene & Floor Count
    const floorInfo = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      return {
        floorCount: gs.getDungeonFloorCount(),
        partyCount: scene.party.length,
        enemiesCount: scene.enemies.length,
        nodesCount: scene.gatheringNodes.length,
        roomsCount: scene.dungeon?.rooms?.length ?? 0,
        hasBoss: scene.dungeon?.rooms?.some(r => r.type === 'boss') ?? false,
        activeSceneKey: scene.scene.key
      };
    });

    console.log(`  Floor State: FloorCount=${floorInfo.floorCount}, Party=${floorInfo.partyCount}, Enemies=${floorInfo.enemiesCount}, Nodes=${floorInfo.nodesCount}, BossFloor=${floorInfo.hasBoss}`);

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
    // EXERCISE 1: Deliberately Interrupt Movement & Redirect Mid-Move
    // =========================================================================
    console.log('  [Exercise 1] Testing Mid-Move Redirect & Destination Highlights...');
    const moveRedirectResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      scene.selectAllMembers();

      // Find two open distant walkable tiles
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
      await new Promise(r => setTimeout(r, 120));

      const midMove1Active = scene.party.some(p => p.isMoving());
      const highlights1 = [...scene.lastMoveDestinationHighlights];

      // Interrupt mid-move by issuing Move 2
      scene.executePartyConvoyMovement(activeSelected, dest2.x, dest2.y, claimed);
      await new Promise(r => setTimeout(r, 120));

      const midMove2Active = scene.party.some(p => p.isMoving());
      const highlights2 = [...scene.lastMoveDestinationHighlights];

      // Check if highlights cleanly switched to dest2
      const hasDest1InHighlights2 = highlights2.some(h => h.x === dest1.x && h.y === dest1.y);

      return {
        midMove1Active,
        midMove2Active,
        highlights1Count: highlights1.length,
        highlights2Count: highlights2.length,
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
    // EXERCISE 2: Mid-Move Combat Engagement Interruption
    // =========================================================================
    console.log('  [Exercise 2] Testing Combat Engagement Mid-Move Interruption...');
    const combatInterruptResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const livingEnemy = scene.enemies.find(e => e.state !== 'dead' && e.state !== 'downed');
      if (!livingEnemy) return { skipped: true };

      // Issue long movement command
      const activeSelected = scene.getSelectedMembers ? scene.getSelectedMembers() : scene.party;
      scene.executePartyConvoyMovement(activeSelected, scene.crystalPos.x, scene.crystalPos.y, new Set());
      await new Promise(r => setTimeout(r, 100));

      // Interrupt by clicking/engaging enemy
      scene.engageEnemy(livingEnemy);
      await new Promise(r => setTimeout(r, 200));

      // Verify destination highlights cleared upon combat engagement
      const lingeringHighlights = scene.activeMoveHighlights.length;
      const partyInCombatOrChasing = scene.party.some(p => p.inCombat || p.targetEntity !== null || p.state === 'chasing' || p.state === 'attacking');

      // Stop combat for clean test state
      livingEnemy.takeDamage(999);
      scene.onEnemyDefeated(livingEnemy);
      scene.party.forEach(p => { p.clearTarget(); p.inCombat = false; if (p.state !== 'idle') p.state = 'idle'; });

      return {
        lingeringHighlights,
        partyInCombatOrChasing
      };
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
    // EXERCISE 3: Split Party via Portrait Selection & Rejoin without Wall-Clipping
    // =========================================================================
    console.log('  [Exercise 3] Testing Split Party Movement & Rejoin Pathfinding...');
    const splitPartyResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const matrix = scene.gridMatrix;

      // Select companion 1 (index 1) only
      scene.selectMemberByIndex(1, false);

      // Find an open walkable tile 8 tiles away
      let splitDest = null;
      for (let dist = 8; dist >= 4; dist--) {
        const candidate = { x: scene.player.gridPos.x + dist, y: scene.player.gridPos.y };
        if (candidate.x < scene.mapWidth - 1 && matrix[candidate.y]?.[candidate.x] === 0) {
          splitDest = candidate;
          break;
        }
      }
      if (!splitDest) return { skipped: true };

      const heroPosBefore = { ...scene.party[0].gridPos };
      const comp1 = scene.party[1];

      // Move only companion 1
      const path = await scene.pathfinder.findPath(comp1.gridPos, splitDest);
      if (path.length > 0) {
        comp1.followPath(path);
      }
      // Wait for movement to progress or arrive
      for (let t = 0; t < 15; t++) {
        await new Promise(r => setTimeout(r, 100));
        if (!comp1.isMoving()) break;
      }

      const comp1Moved = comp1.gridPos.x !== heroPosBefore.x || comp1.gridPos.y !== heroPosBefore.y;
      const heroRemainedStationary = scene.party[0].gridPos.x === heroPosBefore.x && scene.party[0].gridPos.y === heroPosBefore.y;

      // Check for wall clipping
      const isComp1InWall = matrix[comp1.gridPos.y]?.[comp1.gridPos.x] !== 0;

      // Reselect all and issue group move command to rejoin
      scene.selectAllMembers();
      const activeSelected = scene.getSelectedMembers ? scene.getSelectedMembers() : scene.party;
      scene.executePartyConvoyMovement(activeSelected, heroPosBefore.x, heroPosBefore.y, new Set());
      for (let t = 0; t < 15; t++) {
        await new Promise(r => setTimeout(r, 100));
        if (!scene.party.some(p => p.isMoving())) break;
      }

      // Check wall collisions after rejoin
      const anyInWallAfterRejoin = scene.party.some(p => matrix[p.gridPos.y]?.[p.gridPos.x] !== 0);

      return {
        comp1Moved,
        heroRemainedStationary,
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
    // EXERCISE 4: Gathering Across All 7 Skills & Mid-Gather Interruption
    // =========================================================================
    console.log('  [Exercise 4] Testing Gathering across skills, Marquee Drag, and Mid-Channel Interruption...');
    const gatherTestResult = await page.evaluate(async (currentFloor) => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();

      // Ensure nodes for all 7 skills exist on this floor
      const requiredSkills = [
        { type: 'foraging_bush', skill: 'foraging' },
        { type: 'woodcutting_tree', skill: 'woodcutting' },
        { type: 'mining_rock', skill: 'mining' },
        { type: 'dig_spot', skill: 'digging' },
        { type: 'vegetable_node', skill: 'gardening' }
      ];

      for (const req of requiredSkills) {
        let node = scene.gatheringNodes.find(n => n.nodeDef.skillId === req.skill && !n.isHarvested);
        if (!node) {
          const spawnPos = scene.findOpenAdjacentTile(scene.player.gridPos);
          node = scene.spawnGatheringNode(spawnPos.x, spawnPos.y, req.type);
        }
      }

      // Spawn Wolf and Goblin for Corpse Skinning and Butchering
      let wolfCorpse = scene.gatheringNodes.find(n => n.nodeDef?.skillId === 'skinning' && !n.isHarvested);
      if (!wolfCorpse) {
        const dummyWolf = scene.spawnEnemyUnit(dataLoader.getEnemy('wolf'), scene.player.gridPos.x + 1, scene.player.gridPos.y, 'wolf-avatar');
        dummyWolf.takeDamage(999);
        wolfCorpse = scene.spawnCorpseGatheringNode(dummyWolf, 'skinning');
      }

      let goblinCorpse = scene.gatheringNodes.find(n => n.nodeDef?.skillId === 'butchering' && !n.isHarvested);
      if (!goblinCorpse) {
        const dummyGoblin = scene.spawnEnemyUnit(dataLoader.getEnemy('goblin'), scene.player.gridPos.x + 1, scene.player.gridPos.y + 1, 'goblin-avatar');
        dummyGoblin.takeDamage(999);
        goblinCorpse = scene.spawnCorpseGatheringNode(dummyGoblin, 'butchering');
      }

      // 1. Test Mid-Gather Channel Interruption
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
        await new Promise(r => setTimeout(r, 100));

        const channelBefore = scene.activeGatherChannels.get(gatherer);
        const hasBarBefore = channelBefore && channelBefore.barContainer && channelBefore.barContainer.scene !== null;

        // Interrupt channel
        const dummyAttacker = scene.enemies.find(e => e.state !== 'dead') || scene.spawnEnemyUnit(dataLoader.getEnemy('wolf'), gatherer.gridPos.x + 2, gatherer.gridPos.y, 'wolf-avatar');
        scene.interruptGatherChannel(gatherer, dummyAttacker);
        await new Promise(r => setTimeout(r, 100));

        const channelAfter = scene.activeGatherChannels.get(gatherer);
        gatherInterruptedCleanly = channelAfter === undefined && gatherer.state !== 'channeling';
        barDestroyedOnInterrupt = hasBarBefore && (!channelBefore.barContainer.scene || !channelBefore.barContainer.active);

        // Clean up dummy attacker
        dummyAttacker.takeDamage(999);
        scene.onEnemyDefeated(dummyAttacker);
      }

      // 2. Test Gathering Mode Drag Selection (Marquee Box)
      scene.toggleGatheringMode(true);
      await new Promise(r => setTimeout(r, 50));

      const isModeOn = scene.isGatheringMode;

      // Simulate marquee drag selecting nodes
      const allNodes = scene.gatheringNodes.filter(n => !n.isHarvested);
      scene.startGatheringQueue(allNodes.slice(0, 3));
      await new Promise(r => setTimeout(r, 150));

      const queueLength = scene.gatheringQueue.length;
      const workerCount = scene.gatheringQueueWorkers.size;

      // Clear queue for subsequent operations
      scene.clearGatheringQueue();
      scene.toggleGatheringMode(false);

      return {
        gatherInterruptedCleanly,
        barDestroyedOnInterrupt,
        isModeOn,
        queueLength,
        workerCount,
        totalNodesOnFloor: scene.gatheringNodes.length
      };
    }, floor);

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
    // EXERCISE 5: Mid-Revive Channel Interruption & Downed Ally Handling
    // =========================================================================
    console.log('  [Exercise 5] Testing Item-Based Revive Channel & Mid-Revive Interruption...');
    const reviveResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();
      const reviver = scene.party[0];
      const downedAlly = scene.party[1];

      // Grant a revive potion to ensure eligibility
      window.GameState.getInstance().addItem('revive_potion', 5);

      // Down the companion
      downedAlly.hp = 0;
      downedAlly.criticalHp = 0;
      downedAlly.state = 'downed';

      // Start item-based revive channel
      const started = scene.startReviveChannel(reviver, downedAlly);
      await new Promise(r => setTimeout(r, 100));

      const channelBefore = scene.activeReviveChannels.get(reviver);
      const hasBarBefore = channelBefore && channelBefore.barContainer && channelBefore.barContainer.active;

      // Interrupt mid-channel
      const dummyAttacker = scene.enemies.find(e => e.state !== 'dead') || scene.spawnEnemyUnit(dataLoader.getEnemy('wolf'), reviver.gridPos.x + 2, reviver.gridPos.y, 'wolf-avatar');
      scene.interruptReviveChannel(reviver, dummyAttacker);
      await new Promise(r => setTimeout(r, 100));

      const channelAfter = scene.activeReviveChannels.get(reviver);
      const isCleanInterrupt = channelAfter === undefined && reviver.state !== 'channeling';
      const isBarDestroyed = hasBarBefore && (!channelBefore.barContainer.active || channelBefore.barContainer.scene === null);

      // Successfully revive companion so party remains full
      downedAlly.revive(reviver);
      dummyAttacker.takeDamage(999);
      scene.onEnemyDefeated(dummyAttacker);

      return {
        started,
        isCleanInterrupt,
        isBarDestroyed,
        companionStateAfter: downedAlly.state
      };
    });

    if (!reviveResult.started || !reviveResult.isCleanInterrupt || !reviveResult.isBarDestroyed) {
      recordFinding(
        'HIGH',
        'State Interruption',
        floor,
        'Mid-Revive Channel Interrupt',
        'Revive channel state or progress bar failed to clear cleanly upon interruption!',
        reviveResult
      );
    }

    // =========================================================================
    // EXERCISE 6: Caster Energy Dry Fallback (Tested across magic types)
    // =========================================================================
    console.log('  [Exercise 6] Testing Caster Energy Dry-Fallback Across Magic Weapons...');
    const magicTypesToTest = ['staff', 'fire_staff', 'ice_staff', 'lightning_staff'];
    const casterTestResult = await page.evaluate((magicTypes) => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();
      const hero = scene.party[0];
      const results = [];

      for (const type of magicTypes) {
        const weaponDef = dataLoader.getWeapon(type);
        if (!weaponDef) continue;

        hero.equipWeapon(weaponDef);
        hero.energy = 100;
        scene.combatSystem.updateStaffDynamicRange(hero);
        const fullEnergyRange = hero.attackRangeTiles;
        const fullEnergyEffective = scene.combatSystem.getEffectiveWeaponForAttack(hero);

        // Dry out energy
        hero.energy = 0;
        scene.combatSystem.updateStaffDynamicRange(hero);
        const dryEnergyRange = hero.attackRangeTiles;
        const dryEnergyEffective = scene.combatSystem.getEffectiveWeaponForAttack(hero);

        // Restore energy
        hero.energy = 100;
        scene.combatSystem.updateStaffDynamicRange(hero);
        const restoredEnergyRange = hero.attackRangeTiles;

        results.push({
          weapon: type,
          fullRange: fullEnergyRange,
          dryRange: dryEnergyRange,
          restoredRange: restoredEnergyRange,
          dryEffectiveWeapon: dryEnergyEffective?.id,
          dryFallbackMeleeOk: dryEnergyRange === 1 && (dryEnergyEffective?.id === 'staff' || dryEnergyEffective?.category === 'staff' || dryEnergyEffective?.baseDamage > 0)
        });
      }

      // Re-equip short_swords
      hero.equipWeapon(dataLoader.getWeapon('short_swords'));
      return results;
    }, magicTypesToTest);

    for (const res of casterTestResult) {
      if (!res.dryFallbackMeleeOk) {
        recordFinding(
          'HIGH',
          'Combat Mechanics',
          floor,
          'Caster Energy Dry Fallback',
          `Caster dry-fallback failed for '${res.weapon}': range did not fall back to melee (DryRange=${res.dryRange}, DryEffective=${res.dryEffectiveWeapon})`,
          res
        );
      }
    }

    // =========================================================================
    // EXERCISE 7: Systematic Keyboard Shortcut vs Button Convergence Checks
    // =========================================================================
    console.log('  [Exercise 7] Systematic Key vs Button Convergence & Collision Checks...');
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

      // 4. Modal Hotkeys & Convergence: Party Overview [O], Stockpile [I]
      hud.togglePartyOverviewModal();
      const partyModalOpen = hud.isPartyOverviewOpen ? hud.isPartyOverviewOpen() : document.getElementById('party-overview-modal')?.classList.contains('active');
      hud.closePartyOverviewModal();
      const partyModalClosed = !(hud.isPartyOverviewOpen ? hud.isPartyOverviewOpen() : document.getElementById('party-overview-modal')?.classList.contains('active'));

      hud.toggleStockpileModal();
      const stockModalOpen = hud.isStockpileModalOpen ? hud.isStockpileModalOpen() : document.getElementById('stockpile-modal')?.classList.contains('active');
      hud.closeStockpileModal();
      const stockModalClosed = !(hud.isStockpileModalOpen ? hud.isStockpileModalOpen() : document.getElementById('stockpile-modal')?.classList.contains('active'));

      if (!partyModalOpen || !partyModalClosed) {
        issues.push({ test: 'PartyOverviewModal', err: `Party modal toggle failed (open=${partyModalOpen}, closed=${partyModalClosed})` });
      }
      if (!stockModalOpen || !stockModalClosed) {
        issues.push({ test: 'StockpileModal', err: `Stockpile modal toggle failed (open=${stockModalOpen}, closed=${stockModalClosed})` });
      }

      // 5. Check Key P Collision in MainScene (Drink Mana Potion vs Debug EXP)
      const pKeyObj = scene.pKey;
      const isPKeyRegisteredInScene = !!pKeyObj;

      // 6. Check Key T Collision in MainScene (Use Escape Stone vs Debug Respawn)
      const tKeyObj = scene.tKey;
      const isTKeyRegisteredInScene = !!tKeyObj;

      return {
        issues,
        isPKeyRegisteredInScene,
        isTKeyRegisteredInScene
      };
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

    // Report Key P and T dual-binding / conflict if present
    if (floor === 1) {
      if (shortcutAudit.isPKeyRegisteredInScene) {
        recordFinding(
          'HIGH',
          'Input Conflict',
          floor,
          'Key [P] Collision',
          'Key [P] is dual-registered: global HUD listener binds it to "Drink Mana Potion", while MainScene.update binds it to "+680 Debug Weapon EXP". Both actions fire simultaneously when P is pressed.',
          { scene: 'MainScene', conflict: ['Drink Mana Potion [P]', 'Debug Grant 680 EXP [P]'] }
        );
      }
      if (shortcutAudit.isTKeyRegisteredInScene) {
        recordFinding(
          'HIGH',
          'Input Conflict',
          floor,
          'Key [T] Collision',
          'Key [T] is dual-registered: global HUD listener binds it to "Use Escape Stone [T]", while MainScene.update binds it to "Debug Respawn All Enemies [T]". Pressing T triggers both simultaneously.',
          { scene: 'MainScene', conflict: ['Use Escape Stone [T]', 'Debug Respawn Enemies [T]'] }
        );
      }
    }

    // =========================================================================
    // EXERCISE 8: Repeated Gear Equipping and Unequipping
    // =========================================================================
    console.log('  [Exercise 8] Testing Gear Equipping & Unequipping...');
    const gearSwapResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const dataLoader = window.DataLoader.getInstance();
      const hero = scene.party[0];
      const companion = scene.party[1];

      const initialHeroWeapon = hero.equippedWeapon?.id;
      const dagger = dataLoader.getWeapon('daggers');
      const staff = dataLoader.getWeapon('staff');
      const shield = dataLoader.getWeapon('shields');

      // Equip dagger
      hero.equipWeapon(dagger);
      const isDaggerEquipped = hero.equippedWeapon?.id === 'daggers';

      // Equip shield in off-hand
      hero.equipOffhandWeapon(shield);
      const isShieldEquipped = hero.hasShield();

      // Equip 2H staff (should unequip off-hand)
      hero.equipWeapon(staff);
      const isOffhandCleared = hero.offhandWeapon === null;

      // Unequip companion offhand
      companion.equipOffhandWeapon(null);
      const compOffhandNull = companion.offhandWeapon === null;

      // Re-equip short_swords
      hero.equipWeapon(dataLoader.getWeapon('short_swords'));

      return {
        isDaggerEquipped,
        isShieldEquipped,
        isOffhandCleared,
        compOffhandNull,
        heroHpIntegrity: hero.hp > 0 && hero.maxHp > 0
      };
    });

    if (!gearSwapResult.isDaggerEquipped || !gearSwapResult.isShieldEquipped || !gearSwapResult.isOffhandCleared) {
      recordFinding(
        'MEDIUM',
        'Equipment System',
        floor,
        'Weapon / Shield Swap',
        'Equipment slot state desynchronized during weapon/shield equip-unequip sequence!',
        gearSwapResult
      );
    }

    // =========================================================================
    // FLOOR TRANSITION: Continue Descent to Next Floor via Crystal
    // =========================================================================
    if (floor < TOTAL_FLOORS) {
      console.log(`  [Floor Transition] Descending from Floor ${floor} to Floor ${floor + 1}...`);
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        // Close any modals before descending
        scene.hud.closeTeleporterCrystalModal();
        scene.hud.closePartyOverviewModal();
        scene.hud.closeStockpileModal();
        // Trigger descent
        scene.executeContinueDescent();
      });

      // Wait for scene restart and new floor to become active
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

      await sleep(600);
      console.log(`✓ Completed transition to Floor ${floor + 1}.`);
    } else {
      console.log(`\n🎉 Reached final floor ${TOTAL_FLOORS} of soak run!`);
    }
  }

  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`🏁 SOAK TEST RUN COMPLETED: ${TOTAL_FLOORS} Floors in ${totalDurationSec}s`);
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
