const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\ccb314bf-3b3e-4047-b92d-5e741a10ba68';
const PORT = 4189;

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
  console.log('STARTING QOL VERIFICATION: ENEMY NAME LABELS & MOVE HIGHLIGHT');
  console.log('================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Combat') || text.includes('[Respawn') || text.includes('[Input]')) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`Navigating to http://localhost:${PORT} ...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await sleep(2000);

    // =========================================================================
    // TEST 1: Enemy Name Labels Across All Tiers (Common, Elite, Epic, Boss)
    // =========================================================================
    console.log('--- TEST 1: Enemy Name Labels Across All Tiers in Live Game ---');

    const enemyLabelsResult = await page.evaluate(async () => {
      const game = window.game;
      let scene = game.scene.getScene('MainScene');
      if (!scene || !scene.scene.isActive()) {
        const outpost = game.scene.getScene('OutpostScene');
        if (outpost && typeof outpost.executeTransitionToDungeon === 'function') {
          outpost.executeTransitionToDungeon();
          await new Promise(r => setTimeout(r, 1500));
          scene = game.scene.getScene('MainScene');
        }
      }

      const px = scene.player.gridPos.x;
      const py = scene.player.gridPos.y;

      // Spawn 4 enemies in a showcase row
      const wolf = window.__spawnEnemy('wolf', px + 2, py - 2);
      const orc = window.__spawnEnemy('orc_warrior', px + 4, py - 2);
      const voidKnight = window.__spawnEnemy('void_knight', px + 6, py - 2);
      const boss = window.__spawnEnemy('abyssal_colossus', px + 8, py - 2);

      scene.cameras.main.centerOn((px + 5) * 32, (py - 2) * 32);

      return {
        wolf: {
          hasNameLabel: !!wolf?.nameLabel,
          nameText: wolf?.nameLabel?.text,
          nameY: wolf?.nameLabel?.y,
          hasEliteBadge: !!wolf?.eliteLabel
        },
        orc: {
          hasNameLabel: !!orc?.nameLabel,
          nameText: orc?.nameLabel?.text,
          nameY: orc?.nameLabel?.y,
          hasEliteBadge: !!orc?.eliteLabel,
          badgeText: orc?.eliteLabel?.text,
          badgeY: orc?.eliteLabel?.y
        },
        voidKnight: {
          hasNameLabel: !!voidKnight?.nameLabel,
          nameText: voidKnight?.nameLabel?.text,
          nameY: voidKnight?.nameLabel?.y,
          hasEliteBadge: !!voidKnight?.eliteLabel,
          badgeText: voidKnight?.eliteLabel?.text,
          badgeY: voidKnight?.eliteLabel?.y
        },
        boss: {
          hasNameLabel: !!boss?.nameLabel,
          nameText: boss?.nameLabel?.text,
          nameY: boss?.nameLabel?.y,
          hasEliteBadge: !!boss?.eliteLabel,
          badgeText: boss?.eliteLabel?.text,
          badgeY: boss?.eliteLabel?.y
        }
      };
    });

    console.log('Enemy Labels Result:', enemyLabelsResult);

    assert.equal(enemyLabelsResult.wolf.hasNameLabel, true, 'Common wolf must have nameLabel');
    assert.equal(enemyLabelsResult.wolf.nameText, 'Wolf', 'Common wolf nameLabel must say Wolf');
    assert.equal(enemyLabelsResult.wolf.hasEliteBadge, false, 'Common wolf must NOT have tier badge');

    assert.equal(enemyLabelsResult.orc.hasNameLabel, true, 'Elite orc must have nameLabel');
    assert.equal(enemyLabelsResult.orc.nameText, 'Orc Warrior', 'Elite orc nameLabel must say Orc Warrior');
    assert.equal(enemyLabelsResult.orc.hasEliteBadge, true, 'Elite orc must have tier badge');
    assert.equal(enemyLabelsResult.orc.badgeText, '★ ELITE ★', 'Elite orc badge text');
    assert.ok(enemyLabelsResult.orc.badgeY < enemyLabelsResult.orc.nameY, 'Tier badge must sit above name label');

    assert.equal(enemyLabelsResult.voidKnight.hasNameLabel, true, 'Epic void knight must have nameLabel');
    assert.equal(enemyLabelsResult.voidKnight.nameText, 'Void Knight', 'Epic void knight nameLabel must say Void Knight');
    assert.equal(enemyLabelsResult.voidKnight.hasEliteBadge, true, 'Epic void knight must have tier badge');
    assert.equal(enemyLabelsResult.voidKnight.badgeText, '✦ EPIC ✦', 'Epic void knight badge text');

    assert.equal(enemyLabelsResult.boss.hasNameLabel, true, 'Boss must have nameLabel');
    assert.equal(enemyLabelsResult.boss.nameText, 'Abyssal Colossus', 'Boss nameLabel must say Abyssal Colossus');
    assert.equal(enemyLabelsResult.boss.hasEliteBadge, true, 'Boss must have tier badge');
    assert.equal(enemyLabelsResult.boss.badgeText, '👑 BOSS 👑', 'Boss badge text');

    const shotEnemyLabels = path.join(ARTIFACT_DIR, 'qol_enemy_name_labels.png');
    await page.screenshot({ path: shotEnemyLabels });
    console.log(`✓ PASS: Enemy name labels verified for all tiers. Screenshot saved to ${shotEnemyLabels}\n`);

    // =========================================================================
    // TEST 2: Destination Highlight Persists Until Arrival, Not on a Timer
    // =========================================================================
    console.log('--- TEST 2: Destination Highlight Persists Until Arrival ---');

    // Issue a long-distance move command (e.g. 8-10 tiles away)
    const moveResult = await page.evaluate(async () => {
      const game = window.game;
      const scene = game.scene.getScene('MainScene');
      const player = scene.player;

      // Clear any spawned enemies so they do not interrupt peaceful travel
      for (const e of scene.enemies) {
        e.stopMovement();
        e.markDead();
        e.setVisible(false);
      }

      player.stopMovement();
      player.inCombat = false;
      const startX = player.gridPos.x;
      const startY = player.gridPos.y;

      // Find a walkable tile with Manhattan distance >= 8 from player
      let targetX = startX;
      let targetY = startY;
      for (let y = 1; y < scene.mapHeight - 1; y++) {
        for (let x = 1; x < scene.mapWidth - 1; x++) {
          if (scene.gridMatrix[y]?.[x] === 0) {
            const dist = Math.abs(x - startX) + Math.abs(y - startY);
            if (dist >= 8 && dist <= 14) {
              targetX = x;
              targetY = y;
              break;
            }
          }
        }
        if (targetX !== startX || targetY !== startY) break;
      }

      scene.cameras.main.startFollow(player, true, 0.2, 0.2);
      scene.executePartyConvoyMovement([player], targetX, targetY, new Set());

      return {
        startX,
        startY,
        targetX,
        targetY,
        distance: Math.abs(targetX - startX) + Math.abs(targetY - startY),
        initialHighlightsCount: scene.activeMoveHighlights.length,
        initialHighlights: scene.activeMoveHighlights.map(h => ({ x: h.dest.x, y: h.dest.y }))
      };
    });

    console.log('Move Command Issued:', moveResult);
    assert.ok(moveResult.initialHighlightsCount > 0, 'Highlights must be visible immediately upon move command');

    // Wait 1200ms: with the old 800ms hold + 400ms fade, it would be COMPLETELY GONE by now!
    await sleep(1200);

    const midJourneyStatus = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.getScene('MainScene');
      const player = scene.player;
      return {
        currentX: player.gridPos.x,
        currentY: player.gridPos.y,
        isMoving: player.isMoving(),
        activeHighlightsCount: scene.activeMoveHighlights.length,
        alpha: scene.moveHighlightGraphics?.alpha
      };
    });

    console.log('Mid-Journey Status at 1200ms (old timer would have vanished):', midJourneyStatus);
    assert.ok(midJourneyStatus.activeHighlightsCount > 0, 'Highlight MUST STILL BE ACTIVE at 1200ms while unit is traveling!');

    const shotTraveling = path.join(ARTIFACT_DIR, 'qol_destination_highlight_traveling.png');
    await page.screenshot({ path: shotTraveling });
    console.log(`✓ PASS: Destination highlight persisted at 1200ms during long journey. Screenshot saved to ${shotTraveling}`);

    // Wait for journey completion (up to 4000ms)
    await sleep(3000);

    const arrivalStatus = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.getScene('MainScene');
      const player = scene.player;
      return {
        currentX: player.gridPos.x,
        currentY: player.gridPos.y,
        isMoving: player.isMoving(),
        activeHighlightsCount: scene.activeMoveHighlights.length
      };
    });

    console.log('Arrival Status:', arrivalStatus);
    assert.equal(arrivalStatus.isMoving, false, 'Unit has completed journey');
    assert.equal(arrivalStatus.activeHighlightsCount, 0, 'Highlight must cleanly clear upon arrival at destination');

    const shotArrived = path.join(ARTIFACT_DIR, 'qol_destination_highlight_arrived.png');
    await page.screenshot({ path: shotArrived });
    console.log(`✓ PASS: Destination highlight cleared exactly upon arrival. Screenshot saved to ${shotArrived}\n`);

    console.log('================================================================');
    console.log('ALL LIVE QOL VERIFICATION TESTS COMPLETED SUCCESSFULLY! ✓');
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
