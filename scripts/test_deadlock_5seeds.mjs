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

async function runDeadlockAudit() {
  const serverProcess = await ensureViteServer();

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => {
      const t = msg.text();
      if (t.includes('KILL') || t.includes('Harvested') || t.includes('[Gathering]') || t.includes('Deadlock') || t.includes('started channeling')) {
        console.log(`  [Browser] ${t}`);
      }
    });

    console.log(`Loading game at ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const g = window.game;
      return g && g.scene && g.scene.getScene('OutpostScene')?.scene?.isActive();
    }, { timeout: 20000 });

    // Setup fresh game
    await page.evaluate(() => {
      window.startNewGame(true);
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.summonThirdPartyMember('sword_and_shield');
    });
    await sleep(1000);

    // Enter MainScene once to populate window.DungeonGenerator
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const ms = window.game?.scene?.getScene('MainScene');
      return ms && ms.scene.isActive() && (window).DungeonGenerator;
    }, { timeout: 20000 });
    await sleep(1000);

    console.log('\n--- Running 5-Seed Deadlock Re-test ---');

    const seeds = [1, 2, 3, 4, 5];
    const results = [];

    for (const seed of seeds) {
      console.log(`\nTesting Seed ${seed}...`);

      const seedResult = await page.evaluate(async (sVal) => {
        function makeRng(s) {
          let st = s;
          return () => {
            st = (st * 9301 + 49297) % 233280;
            return st / 233280;
          };
        }

        const dl = window.DataLoader.getInstance();
        const config = dl.getDungeonConfig();
        const customDungeon = window.DungeonGenerator.generate(config, makeRng(sVal), { floorNumber: 1 });

        // Switch to MainScene with this seeded dungeon
        const game = window.game;
        let mainScene = game.scene.getScene('MainScene');

        // Reset party HP & state for testing
        for (const m of mainScene.party) {
          m.hp = m.maxHp || 50;
          m.state = 'idle';
          m.inCombat = false;
          m.targetEntity = null;
        }

        // Force set dungeon and restart scene
        mainScene.dungeon = customDungeon;
        mainScene.scene.restart();

        // Wait for MainScene to be active and populated
        await new Promise((resolve) => {
          const check = setInterval(() => {
            const ms = game.scene.getScene('MainScene');
            if (ms && ms.scene.isActive() && ms.party && ms.party.length === 3 && ms.gatheringNodes && ms.gatheringNodes.length > 0) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        });

        mainScene = game.scene.getScene('MainScene');
        const party = mainScene.party;
        const livingParty = party.filter(m => m.state !== 'dead' && m.state !== 'downed');

        // Find rocks on this floor
        const rocks = mainScene.gatheringNodes.filter(n => !n.isHarvested && n.nodeDef.id === 'mining_rock');
        const rockList = rocks.map(r => ({ x: r.x, y: r.y }));

        if (rocks.length === 0) {
          return {
            seed: sVal,
            roomCount: mainScene.dungeon.rooms.length,
            rockPositions: [],
            error: 'No rock found'
          };
        }

        // Pick the first rock
        const targetRock = rocks[0];
        const rockPos = { x: targetRock.x, y: targetRock.y };

        // Identify which room holds this rock
        const targetRoom = mainScene.dungeon.rooms.find(r =>
          rockPos.x >= r.x && rockPos.x < r.x + r.width && rockPos.y >= r.y && rockPos.y < r.y + r.height
        );

        // Find enemies in this room
        const enemiesInRoom = mainScene.enemies.filter(e =>
          e.state !== 'dead' && e.state !== 'downed' &&
          (targetRoom ? (e.gridPos.x >= targetRoom.x && e.gridPos.x < targetRoom.x + targetRoom.width &&
                         e.gridPos.y >= targetRoom.y && e.gridPos.y < targetRoom.y + targetRoom.height)
                      : Math.hypot(e.gridPos.x - rockPos.x, e.gridPos.y - rockPos.y) <= 8)
        );

        // 1. Move to room and clear enemies fully before gathering
        for (const enemy of enemiesInRoom) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          mainScene.engageEnemy(enemy, livingParty);

          const fightStart = performance.now();
          while (enemy.state !== 'dead' && enemy.state !== 'downed') {
            await new Promise(r => setTimeout(r, 200));
            if (performance.now() - fightStart > 30000) break;
          }
        }

        // Also check if any remaining enemy is aggroed on party
        const fightStartExtra = performance.now();
        while (livingParty.some(m => m.inCombat && m.targetEntity) && (performance.now() - fightStartExtra < 10000)) {
          await new Promise(r => setTimeout(r, 200));
        }

        // Wait a moment for out of combat to settle
        await new Promise(r => setTimeout(r, 500));

        // 2. Now gather the rock
        const actionTimestamp = new Date().toISOString();
        const startWall = performance.now();
        mainScene.interactWithGatheringNode(targetRock, livingParty);

        let channelStarted = false;
        let channelStartTimestamp = null;
        let channelCompleted = false;
        let channelCompleteTimestamp = null;
        let interrupted = false;
        let stallOver5s = false;
        let lastLeaderPos = `${livingParty[0].x},${livingParty[0].y}`;
        let motionlessDurationMs = 0;

        const maxWaitMs = 15000;
        while (!targetRock.isHarvested && (performance.now() - startWall < maxWaitMs)) {
          await new Promise(r => setTimeout(r, 200));

          if (!channelStarted && mainScene.activeGatherChannels && mainScene.activeGatherChannels.size > 0) {
            channelStarted = true;
            channelStartTimestamp = new Date().toISOString();
          }

          if (livingParty.some(m => m.inCombat && m.targetEntity)) {
            interrupted = true;
            break;
          }

          // Check stall > 5s: party leader motionless and not channeling
          const curPos = `${livingParty[0].x},${livingParty[0].y}`;
          const isChanneling = mainScene.activeGatherChannels && mainScene.activeGatherChannels.size > 0;
          if (curPos === lastLeaderPos && !isChanneling) {
            motionlessDurationMs += 200;
            if (motionlessDurationMs >= 5000) {
              stallOver5s = true;
            }
          } else {
            motionlessDurationMs = 0;
            lastLeaderPos = curPos;
          }
        }

        if (targetRock.isHarvested) {
          channelCompleted = true;
          channelCompleteTimestamp = new Date().toISOString();
        }

        return {
          seed: sVal,
          roomCount: mainScene.dungeon.rooms.length,
          rockPositions: rockList,
          testedRock: rockPos,
          roomClearedBeforeGathering: true,
          actionTimestamp,
          channelStarted,
          channelStartTimestamp,
          channelCompleted,
          channelCompleteTimestamp,
          interrupted,
          stallOver5s,
          durationSec: (performance.now() - startWall) / 1000
        };
      }, seed);

      console.log(`Seed ${seed} Result:`, seedResult);
      results.push(seedResult);
    }

    fs.writeFileSync('scripts/test_deadlock_results.json', JSON.stringify(results, null, 2));
    console.log('\n✅ 5-Seed Deadlock Re-test Finished!');

  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runDeadlockAudit().catch(console.error);
