import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PORT = 3006;
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
  const child = spawn('cmd.exe', ['/c', `npx vite --port ${PORT} --no-open`], {
    shell: true,
    stdio: 'pipe'
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

async function runTest() {
  const serverProcess = await ensureViteServer();

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    console.log(`Loading game at ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const g = window.game;
      return g && g.scene && g.scene.getScene('OutpostScene')?.scene?.isActive();
    }, { timeout: 20000 });

    console.log('Testing Item 2: Build-mode UI when research is locked...');

    const item2Result = await page.evaluate(() => {
      window.startNewGame(true);
      const scene = window.game.scene.getScene('OutpostScene');
      const gs = window.GameState.getInstance();

      // Ensure research is locked
      const isUnlocked = gs.isBuildableUnlocked('blacksmithing_station');

      // Toggle build mode
      scene.toggleBuildMode();

      // Check build palette DOM elements
      const paletteContainer = document.getElementById('build-palette-container');
      const paletteItems = Array.from(paletteContainer?.querySelectorAll('.palette-item') || []).map(el => ({
        id: el.dataset.buildableId,
        text: el.innerText.trim()
      }));

      const bsPaletteItem = document.querySelector('[data-buildable-id="blacksmithing_station"]');

      // Can player click it in UI?
      let uiClickResult = null;
      if (bsPaletteItem) {
        bsPaletteItem.click();
        uiClickResult = 'clicked';
      } else {
        uiClickResult = 'element_does_not_exist';
      }

      // Check if internal call bypasses gate
      const canPlaceDirectly = scene.buildingSystem.canPlace(
        window.DataLoader.getInstance().getBuildable('blacksmithing_station'),
        9, 9,
        scene.player.gridPos,
        [scene.portalPos],
        (x, y) => scene.isWall(x, y),
        (x, y) => scene.isPlacedDoor(x, y),
        (x, y) => scene.isSolidFurnitureOrStation(x, y),
        gs.getWood(),
        0
      );

      scene.toggleBuildMode();

      return {
        isUnlocked,
        paletteItems,
        bsPaletteItemExists: !!bsPaletteItem,
        uiClickResult,
        canPlaceDirectlyValid: canPlaceDirectly.valid,
        canPlaceDirectlyReason: canPlaceDirectly.reason
      };
    });

    console.log('Item 2 Result:');
    console.log('  isBuildableUnlocked:', item2Result.isUnlocked);
    console.log('  Palette items in DOM:', item2Result.paletteItems.map(p => p.id));
    console.log('  blacksmithing_station exists in palette DOM:', item2Result.bsPaletteItemExists);
    console.log('  UI click result:', item2Result.uiClickResult);
    console.log('  BuildingSystem.canPlace valid directly?:', item2Result.canPlaceDirectlyValid, 'Reason:', item2Result.canPlaceDirectlyReason);

  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch(console.error);
