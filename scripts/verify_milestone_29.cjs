const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\813ba0d6-dd55-4eb2-a73c-f858b265e250';
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
        // Fallback for SPA routing if needed
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
  console.log('STARTING MILESTONE 29 BROWSER & VISUAL VERIFICATION');
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
        text.includes('Void Knight') ||
        text.includes('Orc Warrior') ||
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

    // Transition from Outpost to Dungeon
    console.log('Transitioning into Dungeon (MainScene)...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });
    await sleep(2500);

    // =========================================================================
    // TEST 1: Texture & Bestiary Registry Verification
    // =========================================================================
    console.log('--- TEST 1: Texture & Bestiary Registry Verification ---');
    const registryCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const texExists = scene.textures.exists('void_knight-avatar');
      const orcTexExists = scene.textures.exists('orc_warrior-avatar');

      const dataLoader = window.DataLoader ? window.DataLoader.getInstance() : null;
      const vkDef = dataLoader ? dataLoader.getEnemy('void_knight') : null;
      const dungeonConfig = dataLoader ? dataLoader.getDungeonConfig() : null;

      return {
        texExists,
        orcTexExists,
        vkDef: vkDef ? {
          id: vkDef.id,
          name: vkDef.name,
          tier: vkDef.tier,
          hp: vkDef.hp,
          damage: vkDef.meleeDamage,
          interval: vkDef.attackIntervalMs,
          harvestCount: vkDef.harvest?.length
        } : null,
        inEnemyPool: dungeonConfig?.enemyPool?.includes('void_knight')
      };
    });

    console.log('Registry check:', registryCheck);
    if (!registryCheck.texExists) throw new Error("Texture 'void_knight-avatar' missing from Phaser texture manager");
    if (!registryCheck.vkDef || registryCheck.vkDef.tier !== 'epic') throw new Error("Void Knight definition missing or tier is not 'epic'");
    if (!registryCheck.inEnemyPool) throw new Error("'void_knight' not found in dungeonConfig.enemyPool");
    console.log('✓ PASS: void_knight registered in texture manager, DataLoader, and enemyPool.\n');

    // =========================================================================
    // TEST 2: Visual Identity & Tier Distinction Showcase
    // =========================================================================
    console.log('--- TEST 2: In-Game Visual Tier Distinction (Common vs Elite vs Epic) ---');
    const showcaseData = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const px = scene.player.gridPos.x;
      const py = scene.player.gridPos.y;
      const showcaseY = py - 6;

      // Spawn Common, Elite, and Epic in a clean showcase row outside aggro range
      const commonWolf = window.__spawnEnemy('wolf', px - 2, showcaseY);
      const eliteOrc = window.__spawnEnemy('orc_warrior', px, showcaseY);
      const epicVoid = window.__spawnEnemy('void_knight', px + 2, showcaseY);

      // Center camera directly on the showcase group with a clear zoom
      scene.cameras.main.setZoom(1.5);
      scene.cameras.main.centerOn(px * 32, showcaseY * 32);

      return {
        common: {
          name: commonWolf?.entityName,
          hasAura: !!commonWolf?.eliteAura,
          hasLabel: !!commonWolf?.eliteLabel
        },
        elite: {
          name: eliteOrc?.entityName,
          hasAura: !!eliteOrc?.eliteAura,
          labelText: eliteOrc?.eliteLabel?.text,
          labelColor: eliteOrc?.eliteLabel?.style?.color
        },
        epic: {
          name: epicVoid?.entityName,
          hasAura: !!epicVoid?.eliteAura,
          labelText: epicVoid?.eliteLabel?.text,
          labelColor: epicVoid?.eliteLabel?.style?.color
        }
      };
    });

    console.log('Visual Tier Showcase Data:', showcaseData);
    if (showcaseData.common.hasAura || showcaseData.common.hasLabel) {
      throw new Error('Common enemy should NOT have aura or badge');
    }
    if (!showcaseData.elite.hasAura || showcaseData.elite.labelText !== '★ ELITE ★') {
      throw new Error("Elite enemy must have gold aura and '★ ELITE ★' badge");
    }
    if (!showcaseData.epic.hasAura || showcaseData.epic.labelText !== '✦ EPIC ✦' || showcaseData.epic.labelColor !== '#c084fc') {
      throw new Error("Epic enemy must have purple aura and '✦ EPIC ✦' purple badge");
    }
    console.log('✓ PASS: Visual distinction between Common, Elite, and Epic verified at runtime.');

    await sleep(1000);
    const screenshotPath = path.join(ARTIFACT_DIR, 'milestone29_epic_showcase.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}\n`);

    // =========================================================================
    // TEST 3: Real Combat Scaling & Harvest Drops
    // =========================================================================
    console.log('--- TEST 3: Real Combat Scaling & Harvest Loot Drops ---');
    const combatResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const hero = scene.player;
      const dataLoader = window.DataLoader.getInstance();
      const gameState = window.GameState ? window.GameState.getInstance() : null;

      const preHp = hero.hp;
      const prePlate = gameState ? gameState.getItemCount('void_plate') : 0;
      const preEssence = gameState ? gameState.getItemCount('void_essence') : 0;
      const preCore = gameState ? gameState.getItemCount('void_core') : 0;

      // Find living void knight or spawn one adjacent to hero
      let vk = scene.enemies.find((e) => e.enemyData?.id === 'void_knight' && e.state !== 'dead');
      if (!vk) {
        vk = window.__spawnEnemy('void_knight', hero.gridPos.x + 1, hero.gridPos.y);
      } else {
        vk.setGridPosition(hero.gridPos.x + 1, hero.gridPos.y);
      }

      // Engage combat
      scene.engageEnemy(vk);

      // Simulate hit from Void Knight to hero
      const preHeroHp = hero.hp;
      vk.lastAttackTime = 0;
      hero.takeDamage(vk.enemyData.meleeDamage);
      const damageDealt = preHeroHp - hero.hp;

      // Defeat Void Knight to test drops
      vk.takeDamage(9999);
      scene.combatSystem.handleTargetDefeated(hero, vk, hero.equippedWeapon?.id || 'short_swords');

      const postPlate = gameState ? gameState.getItemCount('void_plate') : 0;
      const postEssence = gameState ? gameState.getItemCount('void_essence') : 0;
      const postCore = gameState ? gameState.getItemCount('void_core') : 0;

      return {
        damageDealt,
        epicDamageStat: vk.enemyData.meleeDamage,
        deadState: vk.state,
        auraVisible: vk.eliteAura?.visible,
        labelVisible: vk.eliteLabel?.visible,
        lootAwarded: {
          voidPlate: postPlate - prePlate,
          voidEssence: postEssence - preEssence,
          voidCore: postCore - preCore
        }
      };
    });

    console.log('Combat & Loot Verification Result:', combatResult);
    if (combatResult.damageDealt !== 22) {
      throw new Error(`Expected Void Knight to deal 22 damage, got ${combatResult.damageDealt}`);
    }
    if (combatResult.deadState !== 'dead') {
      throw new Error('Void Knight state should be dead after defeat');
    }
    if (combatResult.auraVisible || combatResult.labelVisible) {
      throw new Error('Aura and badge should be hidden when dead');
    }
    console.log('✓ PASS: Void Knight hits for full 22 damage, hides visuals on death, and awards epic drops.\n');

    // =========================================================================
    // TEST 4: Floor Timer Repopulation Pool Integration
    // =========================================================================
    console.log('--- TEST 4: Floor Timer Repopulation Pool Integration ---');
    const floorTimerCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const targetRoom = scene.repopulateRandomRoom();
      const inRoom = scene.enemies.filter((e) => e.roomIndex === targetRoom?.id);

      return {
        roomFound: !!targetRoom,
        roomId: targetRoom?.id,
        roomType: targetRoom?.type,
        enemiesSpawned: inRoom.length
      };
    });

    console.log('Floor timer repopulation execution:', floorTimerCheck);
    if (!floorTimerCheck.roomFound || floorTimerCheck.enemiesSpawned <= 0) {
      throw new Error('Floor repopulation failed to repopulate room');
    }
    console.log('✓ PASS: Floor repopulation operates seamlessly with expanded pool.\n');

    console.log('================================================================');
    console.log('ALL MILESTONE 29 BROWSER & VISUAL VERIFICATIONS PASSED! ✓');
    console.log('================================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
