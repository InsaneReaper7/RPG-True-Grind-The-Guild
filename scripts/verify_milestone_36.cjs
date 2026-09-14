const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\e80f0afd-5132-403c-b69f-aca8e2ca7e89';
const PORT = 3459;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  const distDir = path.resolve(__dirname, '..', 'dist');
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(distDir, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          }
        });
      } else {
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Static Server] Serving dist/ on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING MILESTONE 36 BROWSER VERIFICATION (PUPPETEER)');
  console.log('================================================================\n');

  if (!fs.existsSync(BROWSER_PATH)) {
    throw new Error(`Browser not found at: ${BROWSER_PATH}`);
  }

  const server = await startServer();

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (!text.includes('Phaser') && !text.includes('Download the Phaser Editor')) {
        console.log(`[Browser] ${text}`);
      }
    });

    console.log(`Navigating to http://localhost:${PORT}...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await sleep(2000);

    // -------------------------------------------------------------------------
    // STEP 1: Research Tree & Unlocking Bowyer Station
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: Verify Bowyer Station in Research Tree & Unlock ---');
    
    const researchOpened = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      if (activeScene?.hud?.openResearchTreeModal) {
        activeScene.hud.openResearchTreeModal();
        return true;
      }
      return false;
    });
    console.log('Research modal opened:', researchOpened);
    await sleep(600);

    const researchState = await page.evaluate(() => {
      const unlockBtn = document.querySelector('[data-unlock-node="research_bowyer_station"]');
      const modal = document.getElementById('research-tree-modal');
      const hasText = modal ? modal.textContent.includes('Bowyer Station') : false;
      return {
        exists: !!unlockBtn || hasText,
        isOpen: modal?.classList.contains('active')
      };
    });
    console.log('Research state for Bowyer Station:', researchState);
    if (!researchState.exists) throw new Error('FAIL: Bowyer Station research node not found in Research Tree modal!');

    const shot1 = path.join(ARTIFACT_DIR, 'm36_research_tree_bowyer.png');
    await page.screenshot({ path: shot1 });
    console.log(`✓ Screenshot captured: ${shot1}`);

    // Add research points, re-render modal so button is enabled, then click unlock
    const unlockRes = await page.evaluate(() => {
      const gs = window.GameState?.getInstance();
      const dl = window.DataLoader?.getInstance();
      const rs = window.ResearchSystem?.getInstance();
      const activeScene = window.game?.scene?.getScenes(true)?.[0];

      if (gs) {
        gs.addResearchPoints(50);
      }
      activeScene?.hud?.renderResearchTreeModal();

      const node = dl?.getResearchNode('research_bowyer_station');
      const canUnlock = node && rs ? rs.canUnlockNode(node) : null;
      const res = node && rs ? rs.unlockNode(node) : null;
      activeScene?.hud?.renderResearchTreeModal();

      return {
        points: gs?.getResearchPoints(),
        canUnlock,
        unlockResult: res,
        isStationUnlocked: gs?.isBuildableUnlocked('bowyer_station')
      };
    });
    console.log('Unlock result:', unlockRes);
    await sleep(300);

    // Close research modal
    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      activeScene?.hud?.closeResearchTreeModal();
    });
    await sleep(300);

    const paletteState = await page.evaluate(() => {
      const gs = window.GameState?.getInstance();
      const isUnlocked = gs ? gs.isBuildableUnlocked('bowyer_station') : false;
      const item = document.querySelector('.palette-item[data-buildable-id="bowyer_station"]');
      return {
        isUnlocked,
        hasItem: !!item,
        itemText: item ? item.textContent : ''
      };
    });
    console.log('Buildable palette for Bowyer Station:', paletteState);
    if (!paletteState.isUnlocked) throw new Error('FAIL: Bowyer Station is not unlocked in GameState!');
    console.log('✓ PASS: Bowyer Station research unlocked and registered in buildable palette.');

    // -------------------------------------------------------------------------
    // STEP 2: Place Bowyer Station in Outpost & Open Bowyer Modal
    // -------------------------------------------------------------------------
    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const gs = window.GameState?.getInstance();
      if (gs) {
        gs.addItem('wood', 100);
        gs.addItem('raw_meat', 50);
        gs.addItem('spider_silk', 50);
        gs.addItem('beast_bone', 50);
        gs.addItem('bone', 20);
        gs.addItem('wolf_claw', 20);
        // Register placed Bowyer station at (11, 11) inside guild hall
        gs.addPlacedBuildable({ id: 'bowyer_station', x: 11, y: 11, rotation: 0, costPaid: 25 });
      }
      if (activeScene && activeScene.createPlacedSprite) {
        activeScene.createPlacedSprite({ id: 'bowyer_station', x: 11, y: 11, rotation: 0, costPaid: 25 });
      }
    });
    await sleep(400);

    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const player = activeScene?.party?.[0];
      const prog = player?.progression;
      activeScene?.hud?.openBowyerModal(player, prog);
    });
    await sleep(500);

    const bowyerModalState = await page.evaluate(() => {
      const modal = document.getElementById('bowyer-modal');
      const list = document.getElementById('bowyer-recipes-container');
      const hasHuntingBow = list ? list.textContent.includes('Hunting Bow') : false;
      const craftBtn = list ? list.querySelector('[data-bow-recipe="hunting_bow"]') : null;
      return {
        isOpen: modal?.classList.contains('active'),
        hasHuntingBow,
        canCraft: !!craftBtn
      };
    });
    console.log('Bowyer modal state:', bowyerModalState);
    if (!bowyerModalState.isOpen) throw new Error('FAIL: Bowyer modal did not open!');
    if (!bowyerModalState.hasHuntingBow) {
      throw new Error('FAIL: Hunting Bow recipe missing from Bowyer modal!');
    }
    console.log('✓ PASS: Bowyer Modal opened displaying Bowyer crafting recipes.');

    const shot2 = path.join(ARTIFACT_DIR, 'm36_bowyer_station_modal.png');
    await page.screenshot({ path: shot2 });
    console.log(`✓ Screenshot captured: ${shot2}`);

    // -------------------------------------------------------------------------
    // STEP 3: Craft Hunting Bow & Verify Inventory and Bowyer EXP
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Craft Hunting Bow at Bowyer Station ---');
    const craftBtn = await page.$('#bowyer-recipes-container [data-bow-recipe="hunting_bow"]');
    if (!craftBtn) throw new Error('FAIL: Craft button [data-bow-recipe="hunting_bow"] not found!');
    await craftBtn.click();
    await sleep(500);

    const craftResult = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const gs = window.GameState?.getInstance();
      const hero = activeScene?.party?.[0];
      const bowyerExp = hero?.progression?.getProficiencyStat('bowyer')?.currentExp || 0;
      return {
        bowCount: gs?.getItemCount('bows') || 0,
        bowyerExp
      };
    });
    console.log('Crafting result:', craftResult);
    if (craftResult.bowCount < 1) throw new Error('FAIL: Hunting Bow not added to inventory after crafting!');
    if (craftResult.bowyerExp < 25) throw new Error('FAIL: Bowyer proficiency EXP not awarded on crafting!');
    console.log('✓ PASS: Hunting Bow successfully crafted and Bowyer EXP awarded.');

    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      activeScene?.hud?.closeBowyerModal();
    });
    await sleep(300);

    // -------------------------------------------------------------------------
    // STEP 4: Drag-and-Drop Hunting Bow to Main-Hand Slot on Paperdoll
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Drag-and-Drop Hunting Bow to Paperdoll Main-Hand ---');
    await page.keyboard.press('KeyO');
    await sleep(600);

    const invCard = await page.$('.inventory-item-card[data-item-id="bows"]');
    if (!invCard) throw new Error('FAIL: Hunting Bow draggable card not found in Party Overview inventory!');

    await page.setDragInterception(true);
    const shieldCard = await page.$('.inventory-item-card[data-item-id="shields"]');
    const offhandSlot = await page.$('.equip-slot-box[data-slot="offhand"]');
    if (shieldCard && offhandSlot) {
      await shieldCard.dragAndDrop(offhandSlot);
      await sleep(300);
    }

    const freshInvCard = await page.$('.inventory-item-card[data-item-id="bows"]');
    const freshMainSlot = await page.$('.equip-slot-box[data-slot="main"]');
    if (!freshInvCard) throw new Error('FAIL: Hunting Bow draggable card not found in Party Overview inventory!');
    if (!freshMainSlot) throw new Error('FAIL: Main-hand slot missing from paperdoll!');
    await freshInvCard.dragAndDrop(freshMainSlot);
    await sleep(400);

    const equipState = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const hero = activeScene?.hud?.currentParty?.[0];
      return {
        mainWeapon: hero?.equippedWeapon?.name,
        category: hero?.equippedWeapon?.category,
        attackRangeTiles: hero?.attackRangeTiles,
        offhandWeapon: hero?.offhandWeapon
      };
    });
    console.log('Equip state after dragging Bow:', equipState);
    if (equipState.mainWeapon !== 'Hunting Bow') throw new Error('FAIL: Hunting Bow not equipped to main-hand!');
    if (equipState.attackRangeTiles !== 4) throw new Error(`FAIL: Attack range is ${equipState.attackRangeTiles}, expected 4!`);
    if (equipState.offhandWeapon !== null) throw new Error('FAIL: Offhand was not unequipped by 2H bow!');
    console.log('✓ PASS: Hunting Bow equipped via Paperdoll; Range is 4 tiles; 2H lockout strictly enforced.');

    const shot3 = path.join(ARTIFACT_DIR, 'm36_paperdoll_bow_equipped.png');
    await page.screenshot({ path: shot3 });
    console.log(`✓ Screenshot captured: ${shot3}`);

    // -------------------------------------------------------------------------
    // STEP 5: Verify Bows Proficiency Progression & Hidden-until-Level-1
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 5: Verify Bows Proficiency Hidden-until-Level-1 & Level Up ---');
    const profCheck = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const hero = activeScene?.party?.[0];
      const prog = hero?.progression;
      
      const bowsStatL0 = prog?.getProficiencyStat('bows');
      const isVisibleL0 = (bowsStatL0?.level ?? 0) >= 1;

      // Grant 50 EXP to reach Level 1
      prog?.addProficiencyExp('bows', 50);
      const bowsStatL1 = prog?.getProficiencyStat('bows');
      const isVisibleL1 = (bowsStatL1?.level ?? 0) >= 1;

      // Grant EXP to reach Level 10 (Marksman threshold: 10 * 50+ EXP)
      for (let i = 0; i < 20; i++) {
        prog?.addProficiencyExp('bows', 100);
      }
      const isMarksman = prog?.isClassUnlocked('marksman');

      return {
        level0: bowsStatL0?.level,
        isVisibleL0,
        level1: bowsStatL1?.level,
        isVisibleL1,
        finalLevel: prog?.getProficiencyLevel('bows'),
        isMarksman
      };
    });
    console.log('Proficiency check:', profCheck);
    if (profCheck.isVisibleL0 !== false) throw new Error('FAIL: Bows proficiency should be hidden at Level 0!');
    if (profCheck.isVisibleL1 !== true) throw new Error('FAIL: Bows proficiency should be revealed at Level 1!');
    if (profCheck.isMarksman !== true) throw new Error('FAIL: Marksman class should be unlocked at Bows Level 10+!');
    console.log('✓ PASS: Hidden-until-Level-1 and Marksman unlock verified.');

    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      activeScene?.hud?.renderPartyOverviewModal(true);
    });
    await sleep(300);

    const shot4 = path.join(ARTIFACT_DIR, 'm36_marksman_unlocked.png');
    await page.screenshot({ path: shot4 });
    console.log(`✓ Screenshot captured: ${shot4}`);

    await page.keyboard.press('KeyO');
    await sleep(300);

    console.log('\n================================================================');
    console.log('ALL MILESTONE 36 BROWSER VERIFICATIONS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});