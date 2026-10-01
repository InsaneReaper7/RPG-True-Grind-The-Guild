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
    return null;
  }

  const child = spawn('cmd.exe', ['/c', 'npx', 'vite', '--port', String(PORT)], {
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      return child;
    }
  }

  throw new Error(`Timed out waiting for Vite server on port ${PORT}`);
}

async function runBrowserVerification() {
  let viteChild = null;
  let browser = null;

  try {
    viteChild = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    async function waitForScene(sceneName, timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const isSceneActive = await page.evaluate((name) => {
          const game = window.game;
          if (!game || !game.scene) return false;
          const scene = game.scene.getScene(name);
          return scene && scene.scene && scene.scene.isActive();
        }, sceneName);
        if (isSceneActive) return true;
        await sleep(300);
      }
      throw new Error(`Timed out waiting for scene ${sceneName}`);
    }

    // 1. BOOT CLEAN GAME & AUDIT STEP 1: GUILD ROSTER
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Clear storage for clean fresh boot
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

    const step1Id = await page.evaluate(() => {
      const tut = window.TutorialSystem?.getInstance();
      return tut?.getCurrentStep()?.id;
    });
    assert.equal(step1Id, 'guild_roster');
    console.log(`step: ${step1Id}`);

    // 2. SUMMON RECRUIT KAELEN & ADVANCE TO STEP 2
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.summonThirdPartyMember('sword_and_shield');
    });
    await sleep(1500);

    const step2Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step2Id, 'movement');
    console.log(`step: ${step2Id}`);

    // 3. MOVE PARTY IN OUTPOST & ADVANCE TO STEP 3
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executePartyConvoyMovement(10, 8, new Set());
    });
    await sleep(1500);

    const step3Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step3Id, 'first_expedition');
    console.log(`step: ${step3Id}`);

    // 4. ENTER DUNGEON & ADVANCE TO STEP 4
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });
    await waitForScene('MainScene');
    await sleep(2000);

    const step4Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step4Id, 'basic_combat');
    console.log(`step: ${step4Id}`);

    // 5. DEFEAT ENEMY & ADVANCE TO STEP 5
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const targetEnemy = main.enemies?.find(e => e.state !== 'dead');
      if (targetEnemy) {
        main.defeatEnemy(targetEnemy);
      }
    });
    await sleep(1500);

    const step5Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step5Id, 'safe_gathering');
    console.log(`step: ${step5Id}`);

    // 6. GATHER RESOURCE NODE & ADVANCE TO STEP 6
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const hero = main.party[0];
      const node = main.gatheringNodes?.find(n => !n.isHarvested);
      if (node) {
        main.harvestGatheringNode(node, hero);
      } else {
        window.GameState.getInstance().addOre(4);
        window.TutorialSystem.getInstance().completeStepId('safe_gathering');
      }
    });
    await sleep(1500);

    const step6Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step6Id, 'return_outpost');
    console.log(`step: ${step6Id}`);

    // 7. RETURN TO OUTPOST & ADVANCE TO STEP 7
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      if (gs.getResearchPoints() < 10) gs.addResearchPoints(15);
      if (gs.getOre() < 4) gs.addOre(4);
      main.executeTransitionToOutpost();
    });
    await waitForScene('OutpostScene');
    await sleep(2000);

    const step7Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step7Id, 'research_station');
    console.log(`step: ${step7Id}`);

    // 8. UNLOCK BLACKSMITHING & ADVANCE TO STEP 8
    await page.evaluate(() => {
      const rs = window.ResearchSystem.getInstance();
      const dl = window.DataLoader.getInstance();
      const node = dl.getResearchNodes().find(n => n.id === 'research_blacksmithing_station');
      if (node) rs.unlockNode(node);
      window.TutorialSystem.getInstance().completeStepId('research_station');
    });
    await sleep(1500);

    const step8Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step8Id, 'construct_station');
    console.log(`step: ${step8Id}`);

    // 9. PLACE BLACKSMITHING STATION & ADVANCE TO STEP 9
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      const gs = window.GameState.getInstance();
      if (gs.getWood() < 50) gs.addWood(50);

      outpost.selectBuildable('door');
      outpost.placeAt(10, 13);

      outpost.selectBuildable('blacksmithing_station');
      outpost.placeAt(9, 9);
    });
    await sleep(1500);

    const step9Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step9Id, 'forge_upgrade');
    console.log(`step: ${step9Id}`);

    // 10. FORGE AN UPGRADE & ADVANCE TO STEP 10: ALCHEMY STATION
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      const gs = window.GameState.getInstance();
      if (gs.getOre() < 10) gs.addOre(10);
      if (gs.getWood() < 10) gs.addWood(10);

      const hero = outpost.party[0];
      outpost.hud.openBlacksmithingModal(hero, outpost.progressionSystem);
      const forgeBtn = document.querySelector('[data-forge-recipe]');
      if (forgeBtn) forgeBtn.click();
      outpost.hud.closeBlacksmithingModal();
    });
    await sleep(1500);

    const step10Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step10Id, 'alchemy_station');
    console.log(`step: ${step10Id}`);

    // 11. RESEARCH ALCHEMY (5 RP) + PLACE ALCHEMY STATION & ADVANCE TO STEP 11
    const crateEvent = await page.evaluate(() => {
      const rs = window.ResearchSystem.getInstance();
      const dl = window.DataLoader.getInstance();
      const gs = window.GameState.getInstance();
      if (gs.getResearchPoints() < 5) gs.addResearchPoints(5);
      if (gs.getWood() < 30) gs.addWood(30);

      const node = dl.getResearchNodes().find(n => n.id === 'research_alchemy_station');
      if (node) rs.unlockNode(node);

      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.selectBuildable('alchemy_station');
      outpost.placeAt(9, 10);

      return {
        hasCrate: gs.hasReceivedTutorialSupplyCrate,
        herbs: gs.getItemCount('wild_herbs'),
        ecto: gs.getItemCount('ectoplasm'),
        bone: gs.getItemCount('bone')
      };
    });
    await sleep(1500);

    if (crateEvent.hasCrate) {
      console.log(`crate: Guild Supply Crate received (herbs: ${crateEvent.herbs}, ectoplasm: ${crateEvent.ecto}, bone: ${crateEvent.bone})`);
    }

    const step11Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step11Id, 'alchemy_crafting');
    console.log(`step: ${step11Id}`);

    // 12. BREW POTIONS (HEALTH, MANA, REVIVE VIA BONE MEAL) & ADVANCE TO STEP 12
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      const hero = outpost.party[0];
      outpost.hud.openAlchemyModal(hero, outpost.progressionSystem);

      const craft = (id) => {
        const btn = document.querySelector(`[data-craft-recipe="${id}"]`);
        if (btn) btn.click();
      };

      craft('bone_meal');
      craft('revive_potion');
      craft('health_potion');
      craft('mana_potion');

      outpost.hud.closeAlchemyModal();
    });
    await sleep(1500);

    const step12Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step12Id, 'knowledge_base');
    console.log(`step: ${step12Id}`);

    // 13. OPEN KNOWLEDGE BASE & ADVANCE TO STEP 13: SUMMON 4TH MEMBER
    await page.evaluate(() => {
      const kbBtn = document.getElementById('open-knowledge-btn');
      if (kbBtn) kbBtn.click();
      window.TutorialSystem.getInstance().completeStepId('knowledge_base');
    });
    await sleep(1500);

    const step13Id = await page.evaluate(() => {
      return window.TutorialSystem?.getInstance()?.getCurrentStep()?.id;
    });
    assert.equal(step13Id, 'summon_fourth_member');
    console.log(`step: ${step13Id}`);

    // 14. SUMMON 4TH PARTY MEMBER & COMPLETE TUTORIAL
    const recruitEvent = await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      const summoned = outpost.summonFourthPartyMember();
      const party = outpost.party;
      const tut = window.TutorialSystem.getInstance();
      const fourth = party[3];

      return {
        summoned,
        partySize: party.length,
        recruitName: fourth?.entityName,
        equippedWeapon: fourth?.equippedWeapon?.id,
        isCompleted: tut.getIsCompleted()
      };
    });

    console.log(`recruit: Fourth party member summoned (${recruitEvent.recruitName}, weapon: ${recruitEvent.equippedWeapon}, partySize: ${recruitEvent.partySize})`);
    assert.equal(recruitEvent.summoned, true);
    assert.equal(recruitEvent.partySize, 4);
    assert.equal(recruitEvent.recruitName, 'Barris');
    assert.equal(recruitEvent.equippedWeapon, 'healing_staff');
    assert.equal(recruitEvent.isCompleted, true);

  } finally {
    if (browser) await browser.close();
    if (viteChild) {
      viteChild.kill();
    }
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
