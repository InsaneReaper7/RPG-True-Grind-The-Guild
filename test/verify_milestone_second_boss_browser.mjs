import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No supported browser found for E2E testing.');
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
    console.log(`[Server] Server already running at ${URL}`);
    return null;
  }

  console.log(`[Server] Spawning Vite dev server on port ${PORT}...`);
  const child = spawn('cmd.exe', ['/c', 'npx', 'vite', '--port', String(PORT)], {
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    const line = data.toString();
    if (line.includes('Local:')) {
      console.log(`[Vite] ${line.trim()}`);
    }
  });

  // Wait for server to become responsive
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      console.log(`[Server] Vite dev server ready at ${URL}`);
      return child;
    }
  }

  throw new Error('Timed out waiting for Vite server to start');
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('🌐 LIVE BROWSER E2E: SECOND BOSS ENEMY (GLACIAL SOVEREIGN) 🌐');
  console.log('================================================================\n');

  let serverProcess = null;
  let browser = null;

  try {
    serverProcess = await ensureViteServer();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const consoleLogs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('[Boss Encounter]') || text.includes('[Combat:Glacial') || text.includes('[Combat:Frost') || text.includes('[Combat:Glaciation]') || text.includes('GLACIAL SOVEREIGN')) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    console.log(`[E2E] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Verify game loaded
    const title = await page.title();
    console.log(`[E2E] Game Title: "${title}"`);

    // Verify via in-page execution that Floor 15 in Glacial Caverns spawns Glacial Sovereign
    console.log('\n--- VERIFYING LIVE PROCEDURAL GENERATION ON FLOOR 15 ---');
    const spawnEval = await page.evaluate(async () => {
      // Access game state and data loader
      const win = window;
      const phaserGame = win.game;
      if (!phaserGame) return { error: 'No Phaser game instance found' };

      const mainScene = phaserGame.scene.getScene('MainScene');
      if (!mainScene) return { error: 'MainScene not found' };

      const { DataLoader } = await import('/src/utils/DataLoader.ts');
      const { DungeonGenerator } = await import('/src/utils/DungeonGenerator.ts');

      const dl = DataLoader.getInstance();
      await dl.loadAll();
      const cfg = dl.getDungeonConfig();

      // Generate Floor 15 (Glacial Caverns)
      const d15 = DungeonGenerator.generate(cfg, Math.random, { floorNumber: 15 });
      const bossRoom = d15.rooms.find((r) => r.type === 'boss');
      const bossSpawn = d15.enemySpawns.find((e) => e.enemyId === 'glacial_sovereign');

      // Generate Floor 10 (Infernal Caldera)
      const d10 = DungeonGenerator.generate(cfg, Math.random, { floorNumber: 10 });
      const d10BossRoom = d10.rooms.find((r) => r.type === 'boss');
      const calderaBossSpawn = d10.enemySpawns.find((e) => e.roomIndex === d10BossRoom?.id);

      // Generate Floor 5 (Abyssal Depths)
      const d5 = DungeonGenerator.generate(cfg, Math.random, { floorNumber: 5 });
      const colossusSpawn = d5.enemySpawns.find((e) => e.enemyId === 'abyssal_colossus');

      return {
        floor15BossRoom: !!bossRoom,
        floor15BossId: bossSpawn?.enemyId,
        floor10BossRoom: !!d10BossRoom,
        floor10BossId: calderaBossSpawn?.enemyId,
        floor5BossId: colossusSpawn?.enemyId
      };
    });

    assert.strictEqual(spawnEval.floor15BossRoom, true, 'Floor 15 must generate dedicated Boss chamber');
    assert.strictEqual(spawnEval.floor15BossId, 'glacial_sovereign', 'Floor 15 in Glacial Caverns must spawn Glacial Sovereign');
    assert.strictEqual(spawnEval.floor10BossRoom, true, 'Floor 10 must generate dedicated Boss chamber');
    assert.strictEqual(spawnEval.floor10BossId, 'abyssal_colossus', 'Floor 10 in Infernal Caldera must spawn Abyssal Colossus (deliberate subterranean titan)');
    assert.strictEqual(spawnEval.floor5BossId, 'abyssal_colossus', 'Floor 5 in Abyssal Depths must spawn Abyssal Colossus');
    console.log('✓ Floor 15 accurately spawns Glacial Sovereign in live browser runtime!');
    console.log('✓ Floor 10 accurately spawns Abyssal Colossus in live browser runtime (Infernal Caldera)!');
    console.log('✓ Floor 5 accurately spawns Abyssal Colossus in live browser runtime!');

    // Verify live visual asset generation
    console.log('\n--- VERIFYING LIVE TEXTURE GENERATION ---');
    const textureEval = await page.evaluate(async () => {
      const phaserGame = window.game;
      const mainScene = phaserGame.scene.getScene('MainScene');
      const { TextureGenerator } = await import('/src/utils/TextureGenerator.ts');
      TextureGenerator.generatePlaceholderTextures(mainScene, 32);

      return {
        hasColossusAvatar: mainScene.textures.exists('abyssal_colossus-avatar'),
        hasSovereignAvatar: mainScene.textures.exists('glacial_sovereign-avatar')
      };
    });

    assert.strictEqual(textureEval.hasColossusAvatar, true, 'abyssal_colossus-avatar must exist in Phaser texture manager');
    assert.strictEqual(textureEval.hasSovereignAvatar, true, 'glacial_sovereign-avatar must exist in Phaser texture manager');
    console.log('✓ Both Boss avatar textures successfully verified in Phaser texture manager.');

    // Verify live boss combat and signature mechanics execution in browser
    console.log('\n--- VERIFYING LIVE LIVE COMBAT MECHANICS IN PHASER SCENE ---');
    const combatEval = await page.evaluate(async () => {
      const phaserGame = window.game;
      const mainScene = phaserGame.scene.getScene('MainScene');
      const { DataLoader } = await import('/src/utils/DataLoader.ts');
      const { Enemy } = await import('/src/entities/Enemy.ts');
      const { Player } = await import('/src/entities/Player.ts');
      const { CombatSystem } = await import('/src/systems/CombatSystem.ts');
      const { ProgressionSystem } = await import('/src/systems/ProgressionSystem.ts');
      const { GameState } = await import('/src/systems/GameState.ts');

      const dl = DataLoader.getInstance();
      await dl.loadAll();
      const sovereignDef = dl.getEnemy('glacial_sovereign');

      // Create Glacial Sovereign in live scene
      const boss = new Enemy(mainScene, 10, 10, sovereignDef, 'glacial_sovereign-avatar', 32);

      const prog = new ProgressionSystem(dl.getClassesData(), 'E2E Hero');
      const hero = new Player(mainScene, 10, 14, { id: 'hero', name: 'E2E Hero', maxHp: 150, criticalHpMax: 75, maxEnergy: 100, moveSpeed: 100, attackRangeTiles: 1 }, null, 32, 'player-avatar', prog);
      const ally = new Player(mainScene, 11, 14, { id: 'ally', name: 'E2E Ally', maxHp: 100, criticalHpMax: 50, maxEnergy: 100, moveSpeed: 100, attackRangeTiles: 4 }, null, 32, 'companion-avatar', prog);

      const pathfinder = { hasLineOfSight: () => true, isObstacle: () => false, findPath: async () => [] };
      const combat = new CombatSystem(mainScene, [hero, ally], [boss], pathfinder);
      mainScene.combatSystem = combat;

      const initialHeroHp = hero.hp;
      const initialAllyHp = ally.hp;

      // 1. Trigger Ranged Attack & Nova
      boss.targetEntity = hero;
      boss.lastAttackTime = 0;
      combat.update(2000, 16);

      const heroHit = hero.hp < initialHeroHp;
      const allySplashed = ally.hp < initialAllyHp;
      const heroFrostbite = hero.hasStatusEffect('frostbite');

      // 2. Drop Boss to Critical HP (<= 210)
      boss.takeDamage(215);
      const isGlaciated = boss.isGlaciated;
      const barrierHp = boss.iceBarrierHp;
      const labelText = boss.tierLabel?.text;

      // 3. Test Barrier Damage Absorption
      const hpBeforeAbsorption = boss.hp;
      boss.takeDamage(50);
      const barrierAbsorbed = (boss.hp === hpBeforeAbsorption) && (boss.iceBarrierHp === 50);

      // 4. Test Frost Thorns Reflection on Melee Attack
      hero.setGridPosition(11, 10); // adjacent
      const heroHpBeforeMelee = hero.hp;
      const sword = { id: 'iron_sword', name: 'Iron Sword', baseDamage: 25, baseAccuracy: 1.0, category: 'melee' };
      combat.executePlayerBasicAttack(hero, boss, 3000, sword);
      const thornsReflected = hero.hp < heroHpBeforeMelee;

      // 5. Defeat boss and check RP
      const gs = GameState.getInstance();
      const rpBefore = gs.getResearchPoints();
      combat.handleTargetDefeated(hero, boss, 'iron_sword');
      const rpAwarded = gs.getResearchPoints() - rpBefore;

      return {
        heroHit,
        allySplashed,
        heroFrostbite,
        isGlaciated,
        barrierHp,
        labelText,
        barrierAbsorbed,
        thornsReflected,
        rpAwarded
      };
    });

    assert.strictEqual(combatEval.heroHit, true, 'Hero must be hit by Glacial Sovereign ranged strike');
    assert.strictEqual(combatEval.allySplashed, true, 'Ally within 3 tiles must take splash damage from Glacial Spike Nova');
    assert.strictEqual(combatEval.heroFrostbite, true, 'Target must be afflicted with Frostbite status effect');
    console.log('✓ Live Ranged Attack, Glacial Spike Nova & Rime Frostbite verified!');

    assert.strictEqual(combatEval.isGlaciated, true, 'Glacial Sovereign enters Permafrost Glaciation at <= 50% HP');
    assert.strictEqual(combatEval.barrierHp, 100, 'Conjures 100 HP Crystalline Ice Barrier');
    assert.strictEqual(combatEval.labelText, '❄️ CRYO SOVEREIGN ❄️', 'Label updates to Cryo Sovereign');
    console.log('✓ Live Permafrost Glaciation & Crystalline Barrier phase transition verified!');

    assert.strictEqual(combatEval.barrierAbsorbed, true, 'Crystalline Ice Barrier absorbed incoming damage before boss HP');
    console.log('✓ Live Crystalline Barrier damage absorption verified!');

    assert.strictEqual(combatEval.thornsReflected, true, 'Melee attacker suffered Frost Thorns damage reflection');
    console.log('✓ Live Frost Thorns melee reflection verified!');

    assert.strictEqual(combatEval.rpAwarded, 20, 'Defeating Glacial Sovereign awarded flat +20 Research Points');
    console.log('✓ Live +20 Research Points award on Boss defeat verified!');

    console.log('\n================================================================');
    console.log('🎉 ALL LIVE BROWSER E2E TESTS PASSED WITH 100% SUCCESS! 🎉');
    console.log('================================================================');
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      console.log('[Server] Terminating Vite dev server...');
      serverProcess.kill();
    }
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser E2E test failed:', err);
  process.exit(1);
});
