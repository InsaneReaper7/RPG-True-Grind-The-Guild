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

async function testSeed(page, seedVal) {
  console.log(`\n================================================================`);
  console.log(`TESTING SEED ${seedVal} (Kill ALL enemies in aggro range first)`);
  console.log(`================================================================`);

  const result = await page.evaluate(async (sVal) => {
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

    const game = window.game;
    let mainScene = game.scene.getScene('MainScene');

    // Reset party HP & state
    for (const m of mainScene.party) {
      m.hp = m.maxHp || 50;
      m.state = 'idle';
      m.inCombat = false;
      m.targetEntity = null;
      m.claimedDestination = null;
    }

    mainScene.dungeon = customDungeon;
    mainScene.scene.restart();

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

    const rocks = mainScene.gatheringNodes.filter(n => !n.isHarvested && n.nodeDef.id === 'mining_rock');
    if (rocks.length === 0) {
      return { error: 'No rocks found' };
    }

    const targetRock = rocks[0];
    const rockPos = { x: targetRock.x, y: targetRock.y };

    // 1. KILL EVERY ENEMY WITHIN 16 TILES OF ROCK
    const nearbyEnemies = mainScene.enemies.filter(e => {
      const dist = Math.hypot(e.gridPos.x - rockPos.x, e.gridPos.y - rockPos.y);
      return dist <= 16;
    });

    console.log(`[Seed ${sVal}] Found ${nearbyEnemies.length} enemies within 16 tiles of rock at (${rockPos.x}, ${rockPos.y}). Eliminating them...`);
    for (const enemy of nearbyEnemies) {
      if (enemy.state === 'dead' || enemy.state === 'downed') continue;
      mainScene.engageEnemy(enemy, livingParty);
      const fStart = performance.now();
      while (enemy.state !== 'dead' && enemy.state !== 'downed') {
        await new Promise(r => setTimeout(r, 200));
        if (performance.now() - fStart > 25000) {
          // If taking too long, instantly down the enemy for this specific pathing test
          enemy.hp = 0;
          enemy.state = 'dead';
          break;
        }
      }
    }

    // Wait for combat state to clear
    const oocWait = performance.now();
    while (livingParty.some(m => m.inCombat) && (performance.now() - oocWait < 4000)) {
      await new Promise(r => setTimeout(r, 200));
    }

    // 2. INSPECT ALL 8 ADJACENT TILES AROUND THE ROCK
    const adjDeltas = [
      { dx: 1, dy: 0, dir: 'E' },
      { dx: -1, dy: 0, dir: 'W' },
      { dx: 0, dy: 1, dir: 'S' },
      { dx: 0, dy: -1, dir: 'N' },
      { dx: 1, dy: 1, dir: 'SE' },
      { dx: -1, dy: 1, dir: 'SW' },
      { dx: 1, dy: -1, dir: 'NE' },
      { dx: -1, dy: -1, dir: 'NW' }
    ];

    const adjacentTilesAudit = adjDeltas.map(d => {
      const tx = rockPos.x + d.dx;
      const ty = rockPos.y + d.dy;
      const inBounds = tx >= 0 && tx < mainScene.mapWidth && ty >= 0 && ty < mainScene.mapHeight;
      const rawMatrix = inBounds ? mainScene.gridMatrix[ty]?.[tx] : -1;
      const isWall = rawMatrix === 1;
      const isFloor = rawMatrix === 0;
      const isWater = rawMatrix === 2;
      const hasNode = mainScene.gatheringNodes.some(n => !n.isHarvested && n.x === tx && n.y === ty);
      const hasUnit = mainScene.party.some(p => p.gridPos.x === tx && p.gridPos.y === ty);
      const hasEnemy = mainScene.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty);
      const isWalkable = isFloor && !hasNode;

      return {
        direction: d.dir,
        pos: { x: tx, y: ty },
        rawMatrix,
        isFloor,
        isWall,
        isWater,
        hasNode,
        hasUnit,
        hasEnemy,
        isWalkable
      };
    });

    // 3. MOVE PARTY TOWARDS ROCK & INITIATE GATHER
    const startWall = performance.now();
    const initialDistanceToRock = Math.hypot(livingParty[0].gridPos.x - rockPos.x, livingParty[0].gridPos.y - rockPos.y);
    mainScene.interactWithGatheringNode(targetRock, livingParty);

    let channelStarted = false;
    let channelStartTimestamp = null;
    let channelCompleted = false;
    let channelCompleteTimestamp = null;
    let interrupted = false;
    let stallOver5s = false;
    let lastLeaderPos = `${livingParty[0].x},${livingParty[0].y}`;
    let motionlessDurationMs = 0;
    let actorStatesOverTime = [];

    const maxWaitMs = 15000;
    while (!targetRock.isHarvested && (performance.now() - startWall < maxWaitMs)) {
      await new Promise(r => setTimeout(r, 200));

      const isChanneling = mainScene.activeGatherChannels && mainScene.activeGatherChannels.size > 0;
      if (!channelStarted && isChanneling) {
        channelStarted = true;
        channelStartTimestamp = new Date().toISOString();
      }

      if (livingParty.some(m => m.inCombat && m.targetEntity)) {
        interrupted = true;
        break;
      }

      const curPos = `${livingParty[0].x},${livingParty[0].y}`;
      if (curPos === lastLeaderPos && !isChanneling) {
        motionlessDurationMs += 200;
        if (motionlessDurationMs >= 5000) {
          stallOver5s = true;
        }
      } else {
        motionlessDurationMs = 0;
        lastLeaderPos = curPos;
      }

      if (actorStatesOverTime.length < 15) {
        actorStatesOverTime.push({
          timeMs: Math.round(performance.now() - startWall),
          leaderPos: { x: livingParty[0].gridPos.x, y: livingParty[0].gridPos.y },
          leaderState: livingParty[0].state,
          claimedDest: livingParty[0].claimedDestination,
          isChanneling
        });
      }
    }

    if (targetRock.isHarvested) {
      channelCompleted = true;
      channelCompleteTimestamp = new Date().toISOString();
    }

    return {
      seed: sVal,
      rockPos,
      initialDistanceToRock,
      adjacentTilesAudit,
      walkableAdjacentTilesCount: adjacentTilesAudit.filter(t => t.isWalkable).length,
      walkableAdjacentTiles: adjacentTilesAudit.filter(t => t.isWalkable).map(t => `${t.direction} (${t.pos.x},${t.pos.y})`),
      channelStarted,
      channelStartTimestamp,
      channelCompleted,
      channelCompleteTimestamp,
      interrupted,
      stallOver5s,
      durationSec: (performance.now() - startWall) / 1000,
      actorStatesOverTime
    };
  }, seedVal);

  console.log(`Result Seed ${seedVal}:`, JSON.stringify(result, null, 2));
  return result;
}

async function runAudit() {
  const server = await ensureViteServer();
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.game?.scene?.getScene('OutpostScene')?.scene?.isActive());

    // Enter dungeon
    await page.evaluate(() => {
      window.startNewGame(true);
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.summonThirdPartyMember('sword_and_shield');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const ms = window.game?.scene?.getScene('MainScene');
      return ms && ms.scene.isActive() && window.DungeonGenerator;
    });

    const s1 = await testSeed(page, 1);
    const s5 = await testSeed(page, 5);

    fs.writeFileSync('scripts/seed_1_and_5_investigation.json', JSON.stringify({ seed1: s1, seed5: s5 }, null, 2));
    console.log('\nReport written to scripts/seed_1_and_5_investigation.json');

  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

runAudit().catch(console.error);
