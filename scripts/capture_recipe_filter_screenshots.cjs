const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/ad89b00e-4775-40f2-aabb-a68befd5bfb2';
const PORT = 4189;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(distDir) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
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
      console.log(`[Server] Serving dist on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function captureEvidence() {
  console.log('=== Starting Screenshot Capture for Recipe Filter Evidence ===\n');
  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startServer(distDir);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('[Puppeteer] Navigating to game...');
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await sleep(2000);

    // Wait until window.activeHUD is ready
    await page.waitForFunction(() => !!window.activeHUD, { timeout: 15000 });
    console.log('[Puppeteer] activeHUD is ready.');

    // Dismiss title screen modal if open
    console.log('[Puppeteer] Checking for title screen modal...');
    const titleModalActive = await page.evaluate(() => {
      const el = document.getElementById('title-screen-modal');
      return el && el.classList.contains('active');
    });
    if (titleModalActive) {
      console.log('[Puppeteer] Clicking New Game on title modal...');
      await page.click('#title-new-game-btn');
      await sleep(1000);
      const overwriteBtn = await page.$('#title-overwrite-yes-btn');
      if (overwriteBtn && await overwriteBtn.isIntersectingViewport()) {
        await page.click('#title-overwrite-yes-btn');
        await sleep(1000);
      }
    }

    // Dismiss recruit modal or guide popups
    const recruitBtn = await page.$('#confirm-summon-recruit-btn');
    if (recruitBtn && await recruitBtn.isIntersectingViewport()) {
      console.log('[Puppeteer] Clicking Summon Kaelen to dismiss recruit modal...');
      await page.click('#confirm-summon-recruit-btn');
      await sleep(800);
    }

    await page.evaluate(() => {
      const guide = document.getElementById('guild-guide-widget');
      if (guide) guide.style.display = 'none';
      const recruit = document.getElementById('recruit-modal');
      if (recruit) recruit.classList.remove('active');
    });
    await sleep(400);

    // --- 1. Blacksmithing: "Showing: Unlocked Only" ---
    console.log('[Puppeteer] Opening Blacksmithing Modal in Unlocked Only state...');
    await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const player = activeScene?.player;
      const prog = activeScene?.progressionSystem || player?.progression;
      activeScene?.hud?.openBlacksmithingModal(player, prog);
    });
    await sleep(600);

    const bsModal = await page.$('#blacksmithing-modal');
    if (!bsModal) throw new Error('#blacksmithing-modal not found');

    const bsUnlockedPath = path.join(ARTIFACT_DIR, 'blacksmithing_unlocked_only.png');
    await bsModal.screenshot({ path: bsUnlockedPath });
    console.log(`[Screenshot Saved] -> ${bsUnlockedPath}`);

    // --- 2. Blacksmithing: "Showing: All Recipes" ---
    console.log('[Puppeteer] Toggling Blacksmithing to All Recipes...');
    await page.click('#blacksmithing-toggle-filter-btn');
    await sleep(600);

    // Scroll container down slightly so locked recipes (Heavy War Mace, Spiked Morningstar) are framed nicely
    await page.evaluate(() => {
      const modal = document.getElementById('blacksmithing-modal');
      if (modal) modal.scrollTop = 120;
    });
    await sleep(300);

    const bsShowAllPath = path.join(ARTIFACT_DIR, 'blacksmithing_show_all.png');
    await bsModal.screenshot({ path: bsShowAllPath });
    console.log(`[Screenshot Saved] -> ${bsShowAllPath}`);

    // Close Blacksmithing Modal
    await page.click('#close-blacksmithing-btn');
    await sleep(400);

    // --- 3. Cooking: "Showing: All Recipes" with undiscovered count line ---
    console.log('[Puppeteer] Discovering Herb Stew and opening Cooking Modal...');
    await page.evaluate(() => {
      window.GameState?.getInstance()?.discoverCookingRecipe?.('herb_stew');
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const player = activeScene?.player;
      const prog = activeScene?.progressionSystem || player?.progression;
      activeScene?.hud?.openCookingModal(player, prog);
    });
    await sleep(600);

    // Toggle Cooking to Show All
    console.log('[Puppeteer] Toggling Cooking to All Recipes...');
    await page.click('#cooking-toggle-filter-btn');
    await sleep(600);

    const ckModal = await page.$('#cooking-modal');
    if (!ckModal) throw new Error('#cooking-modal not found');

    const ckShowAllPath = path.join(ARTIFACT_DIR, 'cooking_show_all_undiscovered_count.png');
    await ckModal.screenshot({ path: ckShowAllPath });
    console.log(`[Screenshot Saved] -> ${ckShowAllPath}`);

    console.log('\n=== All 3 screenshots captured successfully! ===\n');
  } finally {
    await browser.close();
    server.close();
  }
}

captureEvidence().catch((err) => {
  console.error('[Error during screenshot capture]:', err);
  process.exit(1);
});
