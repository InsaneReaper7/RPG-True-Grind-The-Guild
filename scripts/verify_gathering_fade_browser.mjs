import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No supported browser found.');
  process.exit(1);
}

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
  const child = spawn('cmd.exe', ['/c', 'npx.cmd', 'vite', '--port', String(PORT)], {
    stdio: 'pipe'
  });
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      return child;
    }
  }
  throw new Error('Timed out waiting for Vite server');
}

async function run() {
  let server = null;
  let browser = null;
  try {
    server = await ensureViteServer();
    browser = await puppeteer.launch({
      executablePath,
      headless: 'shell',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    // Transition to MainScene (dungeon)
    await page.evaluate(() => {
      const outpost = window.game?.scene?.getScene('OutpostScene');
      if (outpost) {
        outpost.executeTransitionToDungeon();
      }
    });

    await page.waitForFunction(() => {
      const main = window.game?.scene?.getScene('MainScene');
      return main && main.scene.isActive() && main.hud;
    }, { timeout: 10000 });

    await sleep(500);

    const targetIds = [
      '#hud-card',
      '#party-portraits-hud',
      '#quick-bar-hud',
      '#guild-guide-widget'
    ];

    // Helper to get computed styles
    async function getElementStyles() {
      return await page.evaluate((ids) => {
        const results = {};
        for (const id of ids) {
          const el = document.querySelector(id);
          if (!el) {
            results[id] = { exists: false };
          } else {
            const cs = window.getComputedStyle(el);
            results[id] = {
              exists: true,
              opacity: cs.opacity,
              pointerEvents: cs.pointerEvents
            };
          }
        }
        return results;
      }, targetIds);
    }

    console.log('--- INITIAL STATE ---');
    const initialStyles = await getElementStyles();
    for (const id of targetIds) {
      console.log(`  ${id.padEnd(22)}: opacity = ${initialStyles[id].opacity}, pointer-events = ${initialStyles[id].pointerEvents}`);
    }

    // Activate Gathering Mode
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      if (!main.isGatheringMode) {
        main.toggleGatheringMode();
      }
    });
    await sleep(200);

    // Simulate mouse drag start on canvas
    const canvasBox = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + 200, y: rect.top + 200 };
    });

    await page.mouse.move(canvasBox.x, canvasBox.y);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
    await sleep(200); // let transition apply

    console.log('\n--- DURING GATHERING DRAG ---');
    const dragStyles = await getElementStyles();
    for (const id of targetIds) {
      console.log(`  ${id.padEnd(22)}: opacity = ${dragStyles[id].opacity}, pointer-events = ${dragStyles[id].pointerEvents}`);
    }

    // Release mouse drag
    await page.mouse.up();
    await sleep(250); // let transition revert

    console.log('\n--- AFTER DRAG RELEASE ---');
    const releaseStyles = await getElementStyles();
    for (const id of targetIds) {
      console.log(`  ${id.padEnd(22)}: opacity = ${releaseStyles[id].opacity}, pointer-events = ${releaseStyles[id].pointerEvents}`);
    }

  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (server) {
      server.kill();
    }
    process.exit(0);
  }
}

run();
