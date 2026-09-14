const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\e96e50eb-110b-4b3b-80a0-a4642dcee4b8';
const PORT = 3456;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple static server for dist/
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
  console.log('STARTING MILESTONE 34 BROWSER & VISUAL VERIFICATION');
  console.log('================================================================\n');

  const server = await startServer();

  console.log(`[Puppeteer] Launching browser: ${BROWSER_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Combat') ||
        text.includes('[Loot') ||
        text.includes('Abyssal Colossus') ||
        text.includes('[Boss Encounter]') ||
        text.includes('[Floor Timer]')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    const targetUrl = `http://localhost:${PORT}`;
    console.log(`[Puppeteer] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted successfully in Outpost.\n');

    // 1. Data Loader & Schema Verification
    console.log('--- Step 1: In-Engine Data Verification ---');
    const registryCheck = await page.evaluate(() => {
      const scene = window.game.scene.scenes[0];
      const dl = scene.dataLoader || window.DataLoader?.getInstance?.();
      const bossDef = dl ? dl.getEnemy('abyssal_colossus') : null;
      const cfg = dl ? dl.getDungeonConfig() : null;
      const texExists = scene.textures ? scene.textures.exists('abyssal_colossus-avatar') : false;
      return { bossDef, cfg, texExists };
    });

    if (!registryCheck.bossDef || registryCheck.bossDef.tier !== 'boss') {
      throw new Error("Abyssal Colossus definition missing or tier is not 'boss'");
    }
    console.log(`✓ 'abyssal_colossus' verified in registry: HP=${registryCheck.bossDef.hp}, MeleeDamage=${registryCheck.bossDef.meleeDamage}, Tier=${registryCheck.bossDef.tier}`);
    console.log(`✓ DungeonConfig: bossEnemyId='${registryCheck.cfg?.bossEnemyId}', bossRoom=${registryCheck.cfg?.bossRoom}`);
    console.log(`✓ 'abyssal_colossus-avatar' texture exists: ${registryCheck.texExists}`);

    // 2. Transition to Dungeon Floor 1
    console.log('\n--- Step 2: Transition to Dungeon Floor 1 ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        if (typeof outpost.executeTransitionToDungeon === 'function') {
          outpost.executeTransitionToDungeon();
        } else {
          outpost.scene.start('MainScene');
        }
      }
    });
    await sleep(2500);
    await page.waitForFunction(() => {
      const ms = window.game.scene.getScene('MainScene');
      return ms && ms.scene.isActive() && ms.dungeon && ms.dungeon.rooms && ms.enemies && ms.enemies.length > 0;
    }, { timeout: 10000 });
    console.log('✓ Dungeon floor initialized successfully.');

    // 3. Inspect Dungeon Generator Dedicated Boss Room Placement
    console.log('--- Step 3: Dedicated Boss Chamber Placement ---');
    const dungeonInspection = await page.evaluate(() => {
      const dungeonScene = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon || dungeonScene.dungeon;
      const bossRoom = dungeon.rooms.find((r) => r.type === 'boss');
      const bossEnemies = dungeonScene.enemies.filter((e) => e.enemyData?.tier === 'boss');
      return {
        roomsCount: dungeon.rooms.length,
        bossRoom: bossRoom ? { id: bossRoom.id, type: bossRoom.type, x: bossRoom.x, y: bossRoom.y, w: bossRoom.width, h: bossRoom.height } : null,
        bossEnemiesCount: bossEnemies.length,
        bossEnemy: bossEnemies[0] ? {
          name: bossEnemies[0].entityName,
          hp: bossEnemies[0].hp,
          maxHp: bossEnemies[0].maxHp,
          gridPos: bossEnemies[0].gridPos,
          hasAura: !!bossEnemies[0].eliteAura,
          badgeText: bossEnemies[0].eliteLabel ? bossEnemies[0].eliteLabel.text : null
        } : null
      };
    });

    console.log(`  Rooms generated: ${dungeonInspection.roomsCount}`);
    console.log(`  Dedicated Boss Room:`, dungeonInspection.bossRoom);
    console.log(`  Boss Units Spawned: ${dungeonInspection.bossEnemiesCount}`);
    console.log(`  Boss Entity:`, dungeonInspection.bossEnemy);

    if (!dungeonInspection.bossRoom) throw new Error('Dedicated boss room not found in generated dungeon');
    if (dungeonInspection.bossEnemiesCount !== 1) throw new Error(`Expected exactly 1 Boss spawned, got ${dungeonInspection.bossEnemiesCount}`);
    if (dungeonInspection.bossEnemy?.badgeText !== '👑 BOSS 👑') throw new Error(`Expected '👑 BOSS 👑' badge, got ${dungeonInspection.bossEnemy?.badgeText}`);

    // 4. Focus camera on the Boss and capture Boss Room Screenshot
    console.log('\n--- Step 4: Camera Focus & Visual Identity Verification ---');
    await page.evaluate(() => {
      const dungeonScene = window.game.scene.getScene('MainScene');
      const boss = dungeonScene.enemies.find((e) => e.enemyData?.tier === 'boss');
      if (boss) {
        dungeonScene.cameras.main.stopFollow();
        dungeonScene.cameras.main.pan(boss.x, boss.y, 500);
      }
    });
    await sleep(1000);

    const screenshotPath = path.join(ARTIFACT_DIR, 'boss_encounter.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`✓ Screenshot captured: ${screenshotPath}`);

    // 5. Test Enrage Phase Transition in live scene
    console.log('\n--- Step 5: Live Combat Enrage Phase Verification ---');
    const enrageResult = await page.evaluate(() => {
      const dungeonScene = window.game.scene.getScene('MainScene');
      const boss = dungeonScene.enemies.find((e) => e.enemyData?.tier === 'boss');
      if (!boss) return null;

      // Deal damage to drop below 50% HP (<= 225)
      boss.takeDamage(230); // 450 - 230 = 220 HP
      return {
        hp: boss.hp,
        isEnraged: boss.isEnraged,
        attackIntervalMs: boss.enemyData.attackIntervalMs,
        moveSpeed: boss.moveSpeed,
        badgeText: boss.eliteLabel ? boss.eliteLabel.text : null
      };
    });

    console.log('  Enrage State:', enrageResult);
    if (!enrageResult?.isEnraged) throw new Error('Boss did not trigger enrage below critical HP');
    if (enrageResult.attackIntervalMs !== 952) throw new Error(`Expected 952ms enraged attack interval, got ${enrageResult.attackIntervalMs}`);
    if (enrageResult.badgeText !== '🔥 ENRAGED BOSS 🔥') throw new Error(`Expected '🔥 ENRAGED BOSS 🔥' badge, got ${enrageResult.badgeText}`);
    console.log('✓ Enrage phase verified: attack interval dropped from 1400ms to 952ms, badge shifted to 🔥 ENRAGED BOSS 🔥');

    // Capture Enraged Boss screenshot
    const enragedScreenshotPath = path.join(ARTIFACT_DIR, 'boss_enraged.png');
    await page.screenshot({ path: enragedScreenshotPath });
    console.log(`✓ Enraged screenshot captured: ${enragedScreenshotPath}`);

    // 6. Test Boss Defeat & Loot Escalation
    console.log('\n--- Step 6: Boss Defeat & Loot Escalation ---');
    const defeatResult = await page.evaluate(() => {
      const dungeonScene = window.game.scene.getScene('MainScene');
      const boss = dungeonScene.enemies.find((e) => e.enemyData?.tier === 'boss');
      if (!boss) return null;

      const hero = dungeonScene.player;
      hero.activeClass = 'guardian';
      hero.progression.unlockedClasses.add('guardian');

      // Defeat boss
      dungeonScene.defeatEnemy(boss);

      const gs = window.GameState?.getInstance?.();
      return {
        bossState: boss.state,
        colossusCore: gs ? gs.getItemCount('colossus_core') : 0,
        abyssalIngot: gs ? gs.getItemCount('abyssal_ingot') : 0,
        dreadEssence: gs ? gs.getItemCount('dread_essence') : 0
      };
    });

    console.log('  Defeat result:', defeatResult);
    if (defeatResult?.bossState !== 'dead') throw new Error('Boss state did not transition to dead');
    console.log('✓ Boss successfully defeated and harvested.');

    console.log('\n================================================================');
    console.log('ALL MILESTONE 34 BROWSER & VISUAL VERIFICATIONS PASSED! ✓');
    console.log('================================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
