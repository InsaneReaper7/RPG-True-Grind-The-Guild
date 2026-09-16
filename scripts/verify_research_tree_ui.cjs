const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\95ff22b8-a180-421b-86aa-3067e9217fcc';
const PORT = 3460;

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

async function run() {
  console.log('================================================================');
  console.log('RUNNING BROWSER VERIFICATION: 4X RESEARCH TREE UI OVERHAUL');
  console.log('================================================================\n');

  const server = await startServer();

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 920 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (!text.includes('Phaser') && !text.includes('Download the Phaser Editor')) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    console.log(`Navigating to http://localhost:${PORT}...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await sleep(2000);

    // -------------------------------------------------------------------------
    // STEP 1: Open Research Tree Modal
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: Open Research Tree Modal & Check Initial Layout ---');
    const opened = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      if (activeScene?.hud?.openResearchTreeModal) {
        activeScene.hud.openResearchTreeModal();
        return true;
      }
      return false;
    });
    console.log('Research modal opened successfully:', opened);
    await sleep(800);

    const initialStats = await page.evaluate(() => {
      const modal = document.getElementById('research-tree-modal');
      const canvas = document.getElementById('research-tree-canvas');
      const svg = document.getElementById('research-tree-svg');
      const columns = document.querySelectorAll('.research-tier-column');
      const cards = document.querySelectorAll('.research-node-card');
      const lockedCards = document.querySelectorAll('.node-locked');
      const availableCards = document.querySelectorAll('.node-available');
      const completedCards = document.querySelectorAll('.node-completed');
      const connectorLines = document.querySelectorAll('.research-connector-line');

      const armorCard = document.getElementById('research-card-research_armorsmithing_bench');
      const cookingCard = document.getElementById('research-card-research_cooking_station');

      return {
        modalActive: modal?.classList.contains('active'),
        hasCanvas: !!canvas,
        hasSvg: !!svg,
        columnCount: columns.length,
        totalCards: cards.length,
        lockedCount: lockedCards.length,
        availableCount: availableCards.length,
        completedCount: completedCards.length,
        connectorLineCount: connectorLines.length,
        armorLocked: armorCard?.classList.contains('node-locked'),
        armorHasPadlock: armorCard?.textContent.includes('🔒'),
        armorPrereqText: armorCard?.textContent.includes('Harvest Enemy Skin'),
        cookingLocked: cookingCard?.classList.contains('node-locked'),
        cookingHasPadlock: cookingCard?.textContent.includes('🔒'),
        cookingPrereqText: cookingCard?.textContent.includes('Harvest Enemy Meat')
      };
    });

    console.log('Initial Tech Tree Stats:', initialStats);
    if (!initialStats.modalActive) throw new Error('Research modal is not active');
    if (initialStats.columnCount !== 2) throw new Error(`Expected 2 tier columns, got ${initialStats.columnCount}`);
    if (initialStats.totalCards !== 9) throw new Error(`Expected 9 tech cards, got ${initialStats.totalCards}`);
    if (initialStats.connectorLineCount !== 2) throw new Error(`Expected 2 connector lines, got ${initialStats.connectorLineCount}`);
    if (!initialStats.armorLocked || !initialStats.armorHasPadlock || !initialStats.armorPrereqText) {
      throw new Error('Armorsmithing Bench is not properly locked with padlock and Harvest Enemy Skin prerequisite');
    }
    if (!initialStats.cookingLocked || !initialStats.cookingHasPadlock || !initialStats.cookingPrereqText) {
      throw new Error('Cooking Station is not properly locked with padlock and Harvest Enemy Meat prerequisite');
    }

    const shot1 = path.join(ARTIFACT_DIR, 'research_tree_initial_locked.png');
    await page.screenshot({ path: shot1 });
    console.log(`✓ Screenshot 1 captured: ${shot1}`);

    // -------------------------------------------------------------------------
    // STEP 2: Grant Research Points & Live Dynamic Unlock of Skinning
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Grant 30 RP & Unlock Skinning Live ---');
    await page.evaluate(() => {
      const gs = window.GameState?.getInstance();
      gs.addResearchPoints(30);
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      activeScene?.hud?.renderResearchTreeModal();
    });
    await sleep(400);

    const unlockSkinningResult = await page.evaluate(() => {
      const skinUnlockBtn = document.querySelector('[data-unlock-node="research_skinning"]');
      if (skinUnlockBtn) {
        skinUnlockBtn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked unlock on Harvest Enemy Skin:', unlockSkinningResult);
    await sleep(600);

    const postSkinStats = await page.evaluate(() => {
      const skinCard = document.getElementById('research-card-research_skinning');
      const armorCard = document.getElementById('research-card-research_armorsmithing_bench');
      const line = document.querySelector('[data-source-node="research_skinning"][data-target-node="research_armorsmithing_bench"]');

      return {
        skinCompleted: skinCard?.classList.contains('node-completed'),
        skinHasCheckmark: skinCard?.textContent.includes('✓'),
        armorAvailable: armorCard?.classList.contains('node-available'),
        armorNotLocked: !armorCard?.classList.contains('node-locked'),
        lineStroke: line?.getAttribute('stroke')
      };
    });

    console.log('Post-Skinning Unlock Stats:', postSkinStats);
    if (!postSkinStats.skinCompleted || !postSkinStats.skinHasCheckmark) {
      throw new Error('Skinning node did not transition to completed with checkmark');
    }
    if (!postSkinStats.armorAvailable || !postSkinStats.armorNotLocked) {
      throw new Error('Armorsmithing Bench did not transition to available after Skinning was unlocked');
    }
    if (postSkinStats.lineStroke !== '#38bdf8') {
      throw new Error(`Expected active cyan connector line (#38bdf8), got ${postSkinStats.lineStroke}`);
    }

    const shot2 = path.join(ARTIFACT_DIR, 'research_tree_skinning_unlocked.png');
    await page.screenshot({ path: shot2 });
    console.log(`✓ Screenshot 2 captured: ${shot2}`);

    // -------------------------------------------------------------------------
    // STEP 3: Unlock Armorsmithing Bench -> Complete Chain with Green Glow
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Unlock Armorsmithing Bench Live ---');
    const unlockArmorResult = await page.evaluate(() => {
      const armorUnlockBtn = document.querySelector('[data-unlock-node="research_armorsmithing_bench"]');
      if (armorUnlockBtn) {
        armorUnlockBtn.click();
        return true;
      }
      return false;
    });
    console.log('Clicked unlock on Armorsmithing Bench:', unlockArmorResult);
    await sleep(600);

    const postArmorStats = await page.evaluate(() => {
      const armorCard = document.getElementById('research-card-research_armorsmithing_bench');
      const cookingCard = document.getElementById('research-card-research_cooking_station');
      const line = document.querySelector('[data-source-node="research_skinning"][data-target-node="research_armorsmithing_bench"]');

      return {
        armorCompleted: armorCard?.classList.contains('node-completed'),
        armorHasCheckmark: armorCard?.textContent.includes('✓'),
        lineStroke: line?.getAttribute('stroke'),
        cookingStillLocked: cookingCard?.classList.contains('node-locked')
      };
    });

    console.log('Post-Armorsmithing Unlock Stats:', postArmorStats);
    if (!postArmorStats.armorCompleted || !postArmorStats.armorHasCheckmark) {
      throw new Error('Armorsmithing Bench did not transition to completed with checkmark');
    }
    if (postArmorStats.lineStroke !== '#10b981') {
      throw new Error(`Expected completed green connector line (#10b981), got ${postArmorStats.lineStroke}`);
    }
    if (!postArmorStats.cookingStillLocked) {
      throw new Error('Cooking Station should still be locked because Butchering has not been unlocked');
    }

    const shot3 = path.join(ARTIFACT_DIR, 'research_tree_completed_green_chain.png');
    await page.screenshot({ path: shot3 });
    console.log(`✓ Screenshot 3 captured: ${shot3}`);

    console.log('\n================================================================');
    console.log('🎉 BROWSER VERIFICATION PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('❌ Browser verification failed:', err);
  process.exit(1);
});
