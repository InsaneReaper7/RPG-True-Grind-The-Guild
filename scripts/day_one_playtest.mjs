import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PORT = 3000;
const URL = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureViteServer() {
  const isUp = await checkServerReady(PORT);
  if (isUp) {
    console.log(`[Server] Server already running at ${URL}`);
    return null;
  }

  console.log(`[Server] Spawning Vite dev server on port ${PORT}...`);
  const child = spawn('npx.cmd', ['vite', '--port', String(PORT)], {
    shell: true,
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Local:')) {
      console.log(`[Vite] ${line.trim()}`);
    }
  });

  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      console.log(`[Server] Vite server is ready on port ${PORT}!`);
      return child;
    }
  }

  throw new Error(`Timed out waiting for Vite server on port ${PORT}`);
}

async function runPlaytest() {
  console.log('================================================================');
  console.log('       DAY ONE PLAYTEST — THE REAL GAME START                   ');
  console.log('       Genuine, Honest Verification of the 3-Person Trio        ');
  console.log('================================================================\n');

  let viteChild = null;
  let browser = null;
  const playtestResults = {
    meta: {
      timestamp: new Date().toISOString(),
      browser: BROWSER_PATH
    },
    phase1_clean_boot_audit: {},
    phase2_mentor_and_recruitment_audit: {},
    phase3_trio_expeditions: [],
    phase4_rp_pacing_summary: {},
    phase5_blacksmith_unlock_and_building: {},
    phase6_weapon_crafting_viability: {},
    phase7_weapon_upgrade_comparison: {},
    key_findings: []
  };

  try {
    viteChild = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('pageerror', (err) => {
      console.log('  [BROWSER ERROR]', err.message);
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Combat]') ||
        text.includes('[Harvest]') ||
        text.includes('[Gathering]') ||
        text.includes('[Floor Timer]') ||
        text.includes('[Discovery]') ||
        text.includes('[Research]') ||
        text.includes('[Building]') ||
        text.includes('[BuildMode') ||
        text.includes('[Party Wipe]') ||
        text.includes('Toast') ||
        text.includes('Mentor') ||
        text.includes('Recruit')
      ) {
        console.log(`  [GAME LOG] ${text}`);
      }
    });

    // Helper: wait for scene to become active
    async function waitForScene(sceneName, maxWaitMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const isActive = await page.evaluate((key) => {
          const s = window.game?.scene?.getScene(key);
          return s && s.scene?.isActive();
        }, sceneName);
        if (isActive) return true;
        await sleep(300);
      }
      const dump = await page.evaluate(() => {
        return window.game?.scene?.getScenes(true).map(sc => ({
          key: sc.scene.key,
          active: sc.scene.isActive(),
          wiping: sc.isWiping,
          transitioning: sc.isTransitioning
        }));
      });
      throw new Error(`Timed out waiting for scene ${sceneName}. Active dump: ${JSON.stringify(dump)}`);
    }

    // Helper: transition from Outpost to Dungeon
    async function enterDungeon() {
      await page.evaluate(() => {
        const outpost = window.game.scene.getScene('OutpostScene');
        if (outpost && outpost.scene.isActive()) {
          outpost.executeTransitionToDungeon();
        }
      });
      await waitForScene('MainScene');
      await sleep(1500);
    }

    // Helper: safely return to Outpost (handling wipe or retreat)
    async function returnToOutpost() {
      await page.evaluate(async () => {
        const main = window.game.scene.getScene('MainScene');
        if (main && main.scene.isActive()) {
          const isPartyWiped = main.party.every(m => m.state === 'downed' || m.state === 'dead');
          if (isPartyWiped) {
            if (!main.isWiping && !main.isTransitioning) {
              main.handlePartyWipe();
            }
          } else {
            if (!main.isTransitioning) {
              main.executeTransitionToOutpost();
            }
          }
        }
      });
      await waitForScene('OutpostScene');
      await sleep(2000);

      // In Outpost, restore party to conscious full health (safe zone bed rest)
      await page.evaluate(() => {
        const outpost = window.game.scene.getScene('OutpostScene');
        if (outpost) {
          for (const m of outpost.party) {
            m.hp = m.maxHp;
            m.criticalHp = m.maxCriticalHp;
            m.energy = m.maxEnergy;
            m.state = 'idle';
            m.clearTarget();
            if (m.avatarSprite) {
              m.avatarSprite.setAngle(0);
              m.avatarSprite.setAlpha(1);
            }
          }
        }
      });
    }

    // -------------------------------------------------------------------------
    // 1. BOOT CLEAN GAME & AUDIT REAL STARTING STATE (HERO + VALERIE)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. AUDIT STARTING STATE (CLEAN NEW GAME) ---');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wipe storage and reload to guarantee zero carryover
    await page.evaluate(() => {
      localStorage.clear();
      window.location.reload();
    });
    await sleep(2500);

    // Click "New Game"
    await page.evaluate(() => {
      const newGameBtn = document.getElementById('title-new-game-btn');
      if (newGameBtn) newGameBtn.click();
    });
    await sleep(2000);

    const bootAudit = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const scene = window.game.scene.getScenes(true)[0];
      const party = scene.party || [];

      return {
        sceneKey: scene.scene.key,
        partyCount: party.length,
        partyMembers: party.map((m, idx) => ({
          index: idx,
          id: m.id,
          name: m.entityName,
          activeClass: m.activeClass,
          weaponId: m.equippedWeapon?.id,
          weaponName: m.equippedWeapon?.name,
          offhandWeaponId: m.offhandWeapon?.id || null,
          offhandWeaponName: m.offhandWeapon?.name || null,
          attackRangeTiles: m.attackRangeTiles,
          baseDamage: m.equippedWeapon?.baseDamage,
          attackIntervalMs: m.equippedWeapon?.attackIntervalMs,
          baseAccuracy: m.equippedWeapon?.baseAccuracy,
          hp: m.hp,
          maxHp: m.maxHp,
          criticalHp: m.criticalHp,
          criticalHpMax: m.maxCriticalHp,
          energy: m.energy,
          maxEnergy: m.maxEnergy,
          skillsCount: m.equippedSkillIds?.length || 0,
          equippedSkillIds: m.equippedSkillIds || [],
          knownSkillIds: m.knownSkillIds || [],
          daggersProficiency: m.progression?.getProficiencyStat('daggers')?.level || 0,
          bowsProficiency: m.progression?.getProficiencyStat('bows')?.level || 0,
          scoutClassLevel: m.progression?.getClassLevel('scout') || 0,
          isScoutUnlocked: m.progression?.isClassUnlocked('scout') || false,
          autocastQuickshot: m.autocastMap?.get('quickshot') || false,
          autocastMarkTarget: m.autocastMap?.get('mark_target') || false
        })),
        resources: {
          wood: gs.getWood(),
          ore: gs.getOre()
        },
        researchPoints: gs.getResearchPoints()
      };
    });

    console.log(`Starting party size: ${bootAudit.partyCount} (Expected: 2)`);
    for (const m of bootAudit.partyMembers) {
      console.log(`  #${m.index} ${m.name} | Class: ${m.activeClass || 'None'} (Scout Lv ${m.scoutClassLevel}, Unlocked: ${m.isScoutUnlocked})`);
      console.log(`     Main: ${m.weaponName} (${m.weaponId}) [dmg: ${m.baseDamage}, range: ${m.attackRangeTiles} tiles] | Offhand: ${m.offhandWeaponName || 'None'}`);
      console.log(`     Proficiencies: Daggers Lv ${m.daggersProficiency}, Bows Lv ${m.bowsProficiency} | HP: ${m.hp}/${m.maxHp}`);
      console.log(`     Skills: [${m.equippedSkillIds.join(', ')}] | Autocast: Quickshot=${m.autocastQuickshot}, MarkTarget=${m.autocastMarkTarget}`);
    }
    console.log(`Resources: Wood = ${bootAudit.resources.wood}, Ore = ${bootAudit.resources.ore}, RP = ${bootAudit.researchPoints}`);
    playtestResults.phase1_clean_boot_audit = bootAudit;

    // -------------------------------------------------------------------------
    // 2. AUDIT VALERIE MENTOR INTRO & SUMMON 3RD MEMBER (KAELEN)
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('PHASE 2: VALERIE MENTOR INTRO & PRE-DUNGEON RECRUITMENT (KAELEN)');
    console.log('================================================================');

    const recruitmentAudit = await page.evaluate(async () => {
      const outpost = window.game.scene.getScene('OutpostScene');
      const gs = window.GameState.getInstance();

      // Check pre-portal warning check when party size is 2
      let modalOpenedByPortal = false;
      const portal = outpost.dungeonPortal;
      if (portal) {
        // Trigger portal transition check to verify pre-portal recruit modal prompt
        outpost.triggerPortalTransition();
        const modal = document.getElementById('summon-recruit-modal');
        if (modal && modal.style.display !== 'none') {
          modalOpenedByPortal = true;
        }
      }

      // Choose starting weapon kit: 'sword_and_shield'
      const kitToSummon = 'sword_and_shield';
      outpost.summonThirdPartyMember(kitToSummon);

      // Inspect new 3-person party
      const party = outpost.party;
      const kaelen = party[2];

      const profStats = kaelen?.progression?.getAllProficiencies ? kaelen.progression.getAllProficiencies() : {};
      const nonZeroProficiencies = Object.entries(profStats).filter(([_, stat]) => stat.level > 0);

      return {
        modalOpenedByPortal,
        partySizeAfterSummon: party.length,
        recruit: {
          id: kaelen?.id,
          name: kaelen?.entityName,
          activeClass: kaelen?.activeClass || null,
          classLevels: kaelen?.classLevels || {},
          unlockedClasses: kaelen?.progression?.getUnlockedClasses ? kaelen.progression.getUnlockedClasses() : [],
          knownSkillIds: kaelen?.knownSkillIds || [],
          equippedSkillIds: kaelen?.equippedSkillIds || [],
          equippedWeaponId: kaelen?.equippedWeapon?.id,
          equippedWeaponName: kaelen?.equippedWeapon?.name,
          offhandWeaponId: kaelen?.offhandWeapon?.id || null,
          offhandWeaponName: kaelen?.offhandWeapon?.name || null,
          nonZeroProficienciesCount: nonZeroProficiencies.length,
          allProficienciesLevel0: nonZeroProficiencies.length === 0,
          shortSwordsLevel: kaelen?.progression?.getProficiencyStat('short_swords')?.level || 0,
          shieldsLevel: kaelen?.progression?.getProficiencyStat('shields')?.level || 0
        }
      };
    });

    console.log('Recruitment Flow & Blank-Slate Audit:');
    console.log(`  Pre-portal recruit prompt opened modal? ${recruitmentAudit.modalOpenedByPortal}`);
    console.log(`  Party size now: ${recruitmentAudit.partySizeAfterSummon} (Expected: 3)`);
    console.log(`  Recruit: ${recruitmentAudit.recruit.name} (${recruitmentAudit.recruit.id})`);
    console.log(`  Equipped: ${recruitmentAudit.recruit.equippedWeaponName} + ${recruitmentAudit.recruit.offhandWeaponName}`);
    console.log(`  Active Class: ${recruitmentAudit.recruit.activeClass || 'None (Unclassed)'} | Unlocked Classes: [${recruitmentAudit.recruit.unlockedClasses.join(', ')}]`);
    console.log(`  Skills: [${recruitmentAudit.recruit.equippedSkillIds.join(', ')}] | Known: [${recruitmentAudit.recruit.knownSkillIds.join(', ')}]`);
    console.log(`  Are all proficiencies Level 0? ${recruitmentAudit.recruit.allProficienciesLevel0} (Short Swords: ${recruitmentAudit.recruit.shortSwordsLevel}, Shields: ${recruitmentAudit.recruit.shieldsLevel})`);

    playtestResults.phase2_mentor_and_recruitment_audit = recruitmentAudit;

    // -------------------------------------------------------------------------
    // 3. TRIO RUNS (HERO + VALERIE + KAELEN): COMBAT & GATHERING 4 ORE
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('PHASE 3: TRIO EXPEDITIONS (HERO + VALERIE + KAELEN) — COMBAT & ORE');
    console.log('================================================================');

    let currentRP = bootAudit.researchPoints;
    let currentOre = bootAudit.resources.ore;
    let totalDungeonRuns = 0;

    while (currentOre < 4 || currentRP < 10) {
      if (totalDungeonRuns >= 6) break; // Cap at 6 runs
      totalDungeonRuns++;
      console.log(`\n--- Starting Trio Run #${totalDungeonRuns} (RP: ${currentRP}/10, Ore: ${currentOre}/4) ---`);
      const rStart = Date.now();
      await enterDungeon();

      const trioRunData = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const party = scene.party;
        const gs = window.GameState.getInstance();
        const combatEvents = [];
        let oreGatheredThisRun = 0;
        let woodGatheredThisRun = 0;
        const gatheringAttempts = [];

        // Audit spawned nodes on floor
        const nodesSpawned = {};
        for (const n of (scene.gatheringNodes || [])) {
          const type = n.nodeDef?.id || 'unknown';
          nodesSpawned[type] = (nodesSpawned[type] || 0) + 1;
        }

        // 1. Engage living enemy encounters with the 3-person party in current room
        const partyLead = party[0];
        const rooms = scene.dungeon ? scene.dungeon.rooms : [];
        const currentRoom = rooms.find(r =>
          partyLead.gridPos.x >= r.x && partyLead.gridPos.x < r.x + r.w &&
          partyLead.gridPos.y >= r.y && partyLead.gridPos.y < r.y + r.h
        );

        const roomEnemies = currentRoom
          ? scene.enemies.filter(e => e.roomIndex === currentRoom.id)
          : scene.enemies.slice(0, 2);

        for (const enemy of roomEnemies) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          if (party.every(m => m.state === 'downed' || m.state === 'dead')) break;

          const h0Hp = party[0]?.hp + party[0]?.criticalHp;
          const h1Hp = party[1] ? (party[1].hp + party[1].criticalHp) : 0;
          const h2Hp = party[2] ? (party[2].hp + party[2].criticalHp) : 0;

          scene.engageEnemy(enemy);
          const fStart = performance.now();

          while (enemy.state !== 'dead' && enemy.state !== 'downed' && party.some(m => m.state !== 'downed' && m.state !== 'dead')) {
            await new Promise(r => setTimeout(r, 200));
            if (performance.now() - fStart > 30000) break;
          }

          const duration = (performance.now() - fStart) / 1000;
          const h0HpAfter = party[0]?.hp + party[0]?.criticalHp;
          const h1HpAfter = party[1] ? (party[1].hp + party[1].criticalHp) : 0;
          const h2HpAfter = party[2] ? (party[2].hp + party[2].criticalHp) : 0;

          combatEvents.push({
            target: enemy.entityName,
            tier: enemy.enemyData?.tier,
            enemyHp: enemy.maxHp + enemy.maxCriticalHp,
            durationSec: duration,
            heroDamageTaken: Math.max(0, h0Hp - h0HpAfter),
            valerieDamageTaken: Math.max(0, h1Hp - h1HpAfter),
            kaelenDamageTaken: Math.max(0, h2Hp - h2HpAfter),
            heroSurvived: party[0] ? (party[0].state !== 'downed' && party[0].state !== 'dead') : false,
            valerieSurvived: party[1] ? (party[1].state !== 'downed' && party[1].state !== 'dead') : false,
            kaelenSurvived: party[2] ? (party[2].state !== 'downed' && party[2].state !== 'dead') : false,
            enemyDefeated: enemy.state === 'dead' || enemy.state === 'downed',
            valerieRangeTiles: party[1]?.attackRangeTiles,
            valerieActiveClass: party[1]?.activeClass,
            heroShortSwordsExp: party[0]?.progression?.getProficiencyStat('short_swords')?.currentExp || 0,
            valerieBowsExp: party[1]?.progression?.getProficiencyStat('bows')?.currentExp || 0,
            kaelenShortSwordsExp: party[2]?.progression?.getProficiencyStat('short_swords')?.currentExp || 0
          });
        }

        // Wait for engine's lingering combat cooldown (4000ms) to clear to false
        const oocStart = performance.now();
        while (party.some(m => m.inCombat) && (performance.now() - oocStart < 6000)) {
          await new Promise(r => setTimeout(r, 200));
        }

        // 2. Gathering Attempt: Find unharvested mining_rock and test gathering mechanics
        const livingParty = party.filter(m => m.state !== 'downed' && m.state !== 'dead');
        if (livingParty.length > 0) {
          const miningNodes = (scene.gatheringNodes || []).filter(n => !n.isHarvested && n.nodeDef?.id === 'mining_rock');
          // Prefer nearest rock
          miningNodes.sort((a, b) => Math.hypot(a.x - livingParty[0].gridPos.x, a.y - livingParty[0].gridPos.y) - Math.hypot(b.x - livingParty[0].gridPos.x, b.y - livingParty[0].gridPos.y));

          for (const mNode of miningNodes) {
            const oreBefore = gs.getOre();
            const gStart = performance.now();
            let channelStarted = false;
            let interruptedByCombat = false;
            let reachedNode = false;

            // Trigger interact
            scene.interactWithGatheringNode(mNode, livingParty);

            // Observe channel / approach over up to 12 seconds
            while (!mNode.isHarvested && (performance.now() - gStart < 12000)) {
              await new Promise(r => setTimeout(r, 200));

              // Check if any party member is adjacent
              const dist = Math.hypot(livingParty[0].gridPos.x - mNode.x, livingParty[0].gridPos.y - mNode.y);
              if (dist <= 1.5) reachedNode = true;

              // Check if channel is active
              if (scene.activeGatherChannels && scene.activeGatherChannels.size > 0) {
                channelStarted = true;
              }

              // Check if combat interrupted
              if (livingParty.some(m => m.inCombat)) {
                interruptedByCombat = true;
                break;
              }
            }

            const oreGained = gs.getOre() - oreBefore;
            if (oreGained > 0) oreGatheredThisRun += oreGained;

            gatheringAttempts.push({
              nodeType: 'mining_rock',
              nodePos: { x: mNode.x, y: mNode.y },
              partyLeadPos: { x: livingParty[0]?.gridPos.x, y: livingParty[0]?.gridPos.y },
              reachedNode,
              channelStarted,
              interruptedByCombat,
              isHarvested: mNode.isHarvested,
              oreGained,
              durationSec: (performance.now() - gStart) / 1000
            });

            // If we successfully harvested or got stopped by combat, don't loop forever
            if (mNode.isHarvested || interruptedByCombat) break;
          }
        }

        return {
          nodesSpawned,
          oreGatheredThisRun,
          woodGatheredThisRun,
          combatEvents,
          gatheringAttempts,
          totalOreNow: gs.getOre(),
          rpNow: gs.getResearchPoints(),
          isWiped: party.every(m => m.state === 'downed' || m.state === 'dead')
        };
      });

      currentRP = trioRunData.rpNow;
      currentOre = trioRunData.totalOreNow;
      const durationSec = (Date.now() - rStart) / 1000;

      console.log(`Trio Run #${totalDungeonRuns} finished in ${durationSec.toFixed(1)}s:`);
      console.log(`  Ore Gathered: +${trioRunData.oreGatheredThisRun} (Total: ${currentOre}/4), RP: ${currentRP}/10, Wiped? ${trioRunData.isWiped}`);
      for (const c of trioRunData.combatEvents) {
        console.log(`  Combat vs ${c.target} (${c.tier}): Duration: ${c.durationSec?.toFixed(1)}s`);
        console.log(`    Hero: taken ${c.heroDamageTaken} dmg (survived: ${c.heroSurvived})`);
        console.log(`    Valerie (Scout range ${c.valerieRangeTiles}): taken ${c.valerieDamageTaken} dmg (survived: ${c.valerieSurvived}, bows exp: ${c.valerieBowsExp})`);
        console.log(`    Kaelen (Novice): taken ${c.kaelenDamageTaken} dmg (survived: ${c.kaelenSurvived}, swords exp: ${c.kaelenShortSwordsExp})`);
        console.log(`    Enemy Defeated: ${c.enemyDefeated}`);
      }
      for (const g of trioRunData.gatheringAttempts) {
        console.log(`  Gathering Attempt at (${g.nodePos.x}, ${g.nodePos.y}): Reached: ${g.reachedNode}, ChannelStarted: ${g.channelStarted}, CombatInterrupt: ${g.interruptedByCombat}, Harvested: ${g.isHarvested}, Ore Gained: ${g.oreGained}`);
      }

      playtestResults.phase3_trio_expeditions.push({
        runNumber: totalDungeonRuns,
        durationSec,
        ...trioRunData
      });

      await returnToOutpost();
    }

    playtestResults.phase4_rp_pacing_summary = {
      totalRunsTaken: totalDungeonRuns,
      finalRP: currentRP,
      finalOre: currentOre
    };

    // -------------------------------------------------------------------------
    // 4. UNLOCK BLACKSMITHING STATION & BUILD IN OUTPOST
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('PHASE 4: UNLOCK BLACKSMITHING STATION & BUILD IN OUTPOST');
    console.log('================================================================');
    const researchResult = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const rs = window.ResearchSystem.getInstance();
      const dl = window.DataLoader.getInstance();
      const bsNode = dl.getResearchNodes().find(n => n.id === 'research_blacksmithing_station');

      if (!bsNode) return { error: 'Node not found' };
      const check = rs.canUnlockNode(bsNode);
      if (!check.canUnlock) {
        return { canUnlock: false, reason: check.reason, rp: gs.getResearchPoints(), cost: bsNode.cost };
      }

      const unlock = rs.unlockNode(bsNode);
      return {
        canUnlock: true,
        success: unlock.success,
        rpRemaining: gs.getResearchPoints(),
        isCompleted: gs.isResearchCompleted('research_blacksmithing_station'),
        isBuildableUnlocked: gs.isBuildableUnlocked('blacksmithing_station')
      };
    });

    console.log('Research Unlock Result:', researchResult);

    // Enclose Guild Hall & Place Blacksmithing Station
    const buildingResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('OutpostScene');
      const gs = window.GameState.getInstance();

      // Check indoor enclosure at (9, 9) before door
      const enclosedBefore = scene.isIndoorTile ? scene.isIndoorTile(9, 9) : false;

      // Select and place Wood Door at doorway (10, 13)
      scene.selectBuildable('door');
      scene.placeAt(10, 13);
      const enclosedAfterDoor = scene.isIndoorTile ? scene.isIndoorTile(9, 9) : false;

      // Select and place Blacksmithing Station at (9, 9)
      scene.selectBuildable('blacksmithing_station');
      scene.placeAt(9, 9);

      return {
        enclosedBefore,
        enclosedAfterDoor,
        woodRemaining: gs.getWood(),
        hasStationSprite: !!scene.placedSprites?.get('9,9')
      };
    });

    console.log('Building Result in Outpost:', buildingResult);
    playtestResults.phase5_blacksmith_unlock_and_building = {
      research: researchResult,
      building: buildingResult
    };

    // -------------------------------------------------------------------------
    // 5. WEAPON CRAFTING AUDIT & UPGRADE COMPARISON
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('PHASE 5: WEAPON UPGRADE CRAFTING AUDIT (4 ORE REQUIREMENT)');
    console.log('================================================================');
    const craftingAudit = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      const dl = window.DataLoader.getInstance();
      const recipes = dl.getBlacksmithRecipes();
      const currentOre = gs.getOre();
      const currentWood = gs.getWood();

      const tier0 = recipes.filter(r => r.requiredLevel === 0).map(r => ({
        id: r.id,
        name: r.name,
        resultWeaponId: r.resultWeaponId,
        ingredients: r.ingredients,
        canCraft: (currentOre >= (r.ingredients.ore || 0)) && (currentWood >= (r.ingredients.wood || 0))
      }));

      return {
        currentOre,
        currentWood,
        tier0
      };
    });

    console.log(`Current Crafting Inventory: ${craftingAudit.currentOre} Ore, ${craftingAudit.currentWood} Wood.`);
    for (const r of craftingAudit.tier0) {
      console.log(`  - Recipe: ${r.name} (${r.resultWeaponId}) | Needs: ${JSON.stringify(r.ingredients)} | Ready to craft? ${r.canCraft}`);
    }
    playtestResults.phase6_weapon_crafting_viability = craftingAudit;

    // Craft the first weapon upgrade if ore allows!
    const craftableRecipe = craftingAudit.tier0.find(r => r.canCraft);
    if (craftableRecipe) {
      console.log(`\nForging first weapon upgrade: ${craftableRecipe.name}...`);
      const craftExecution = await page.evaluate((recipeId) => {
        const scene = window.game.scene.getScene('OutpostScene');
        const gs = window.GameState.getInstance();
        const hero = scene.party[0];

        scene.hud.openBlacksmithingModal(hero, scene.progressionSystem);
        const forgeBtn = document.querySelector(`[data-forge-recipe="${recipeId}"]`);
        let success = false;
        if (forgeBtn) {
          forgeBtn.click();
          success = true;
        }
        scene.hud.closeBlacksmithingModal();
        const craftedWeapon = window.DataLoader.getInstance().getWeapon(recipeId);

        // Equip the crafted weapon
        if (craftedWeapon) {
          hero.equippedWeapon = craftedWeapon;
        }

        return {
          success,
          craftedWeaponName: craftedWeapon?.name,
          baseDamage: craftedWeapon?.baseDamage,
          attackIntervalMs: craftedWeapon?.attackIntervalMs,
          baseAccuracy: craftedWeapon?.baseAccuracy,
          oreRemaining: gs.getOre(),
          woodRemaining: gs.getWood(),
          blacksmithingExp: hero.progression?.getProficiencyStat('blacksmithing')?.currentExp || 0
        };
      }, craftableRecipe.id);

      console.log('Craft Execution Result:', craftExecution);
      playtestResults.phase7_weapon_upgrade_comparison = craftExecution;
    } else {
      console.log(`\nPlayer currently has ${craftingAudit.currentOre}/4 Ore. Deadlock / gathering status: 4 ore was not reached.`);
      playtestResults.phase7_weapon_upgrade_comparison = {
        canCraft: false,
        reason: `Ore deficit: ${craftingAudit.currentOre}/4 Ore available.`
      };
    }

    // Save final report JSON
    fs.writeFileSync('scripts/playtest_results.json', JSON.stringify(playtestResults, null, 2));
    console.log('\n✓ Comprehensive telemetry saved to scripts/playtest_results.json');

  } finally {
    if (browser) await browser.close();
    if (viteChild) {
      console.log('Terminating Vite server...');
      viteChild.kill();
    }
  }
}

runPlaytest().catch((err) => {
  console.error('Playtest runner error:', err);
  process.exit(1);
});
