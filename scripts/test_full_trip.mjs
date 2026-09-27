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

async function testFullTrip() {
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
      if (t.includes('KILL') || t.includes('Harvested') || t.includes('[KnowledgeBase]') || t.includes('[Gathering]') || t.includes('[Combat]')) {
        console.log(`  [Browser] ${t}`);
      }
    });

    console.log(`Loading game at ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const g = window.game;
      return g && g.scene && g.scene.getScene('OutpostScene')?.scene?.isActive();
    }, { timeout: 20000 });

    // Start fresh game and summon Kaelen
    await page.evaluate(() => {
      window.startNewGame(true);
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.summonThirdPartyMember('sword_and_shield');
    });
    await sleep(1000);

    console.log('Entering dungeon Floor 1...');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const s = window.game?.scene?.getScene('MainScene');
      return s && s.scene.isActive() && s.party && s.party.length === 3 && s.dungeon && s.player;
    }, { timeout: 20000 });
    await sleep(1000);

    console.log('Running 1 full realistic exploration trip on Floor 1...');
    const tripReport = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      const party = scene.party;
      const livingParty = party.filter(m => m.state !== 'dead' && m.state !== 'downed');

      const initialRP = gs.getResearchPoints();
      const initialOre = gs.getOre();
      const initialWood = gs.getWood();
      const startTimeNow = scene.time.now;

      const rooms = scene.dungeon.rooms;
      const clearedRooms = [];
      const killedEnemies = [];
      const gatheredNodes = [];

      // Sort rooms starting from entrance room
      const entranceRoom = rooms.find(r => r.type === 'entrance') || rooms[0];
      const otherRooms = rooms.filter(r => r !== entranceRoom);
      const orderedRooms = [entranceRoom, ...otherRooms];

      for (let rIdx = 0; rIdx < orderedRooms.length; rIdx++) {
        const room = orderedRooms[rIdx];
        const roomLabel = `Room #${room.id} (${room.type}, ${room.width}x${room.height} at [${room.x},${room.y}])`;

        // 1. Move party into room
        const roomCenter = {
          x: Math.floor(room.x + room.width / 2),
          y: Math.floor(room.y + room.height / 2)
        };
        // Ensure tile is walkable
        let targetTile = roomCenter;
        if (scene.gridMatrix[targetTile.y]?.[targetTile.x] !== 0) {
          for (let dy = 0; dy < room.height; dy++) {
            for (let dx = 0; dx < room.width; dx++) {
              if (scene.gridMatrix[room.y + dy]?.[room.x + dx] === 0) {
                targetTile = { x: room.x + dx, y: room.y + dy };
                break;
              }
            }
          }
        }

        // Issue move
        scene.executePartyConvoyMovement(livingParty, targetTile.x, targetTile.y, new Set());

        // Wait up to 6 seconds for party to reach or get near
        const moveStart = performance.now();
        while (performance.now() - moveStart < 6000) {
          const leaderDist = Math.hypot(party[0].gridPos.x - targetTile.x, party[0].gridPos.y - targetTile.y);
          if (leaderDist <= 3) break;
          // Or if enemy aggroed, stop moving and fight
          if (livingParty.some(m => m.inCombat)) break;
          await new Promise(r => setTimeout(r, 200));
        }

        // 2. CLEAR ROOM FULLY BEFORE GATHERING
        while (true) {
          // Find living enemies in room or targeting party
          const enemiesToFight = scene.enemies.filter(e => {
            if (e.state === 'dead' || e.state === 'downed') return false;
            const inRoom = e.gridPos.x >= room.x && e.gridPos.x < room.x + room.width &&
                           e.gridPos.y >= room.y && e.gridPos.y < room.y + room.height;
            const nearParty = Math.hypot(e.gridPos.x - party[0].gridPos.x, e.gridPos.y - party[0].gridPos.y) <= 5;
            const targetingParty = e.targetEntity && party.includes(e.targetEntity);
            return inRoom || nearParty || targetingParty;
          });

          if (enemiesToFight.length === 0) break;

          // Engage nearest
          enemiesToFight.sort((a, b) =>
            Math.hypot(a.x - party[0].x, a.y - party[0].y) - Math.hypot(b.x - party[0].x, b.y - party[0].y)
          );
          const target = enemiesToFight[0];

          const rpBefore = gs.getResearchPoints();
          scene.engageEnemy(target, livingParty);

          const fightStart = performance.now();
          while (target.state !== 'dead' && target.state !== 'downed' && livingParty.some(m => m.state !== 'dead' && m.state !== 'downed')) {
            await new Promise(r => setTimeout(r, 200));
            if (performance.now() - fightStart > 30000) break;
          }

          const rpAfter = gs.getResearchPoints();
          killedEnemies.push({
            name: target.enemyData?.name || target.entityName || 'Enemy',
            tier: target.enemyData?.tier || 'common',
            rpGain: rpAfter - rpBefore,
            room: room.id
          });
        }

        // Wait for out-of-combat state to settle
        const oocWait = performance.now();
        while (livingParty.some(m => m.inCombat && m.targetEntity) && (performance.now() - oocWait < 5000)) {
          await new Promise(r => setTimeout(r, 200));
        }

        clearedRooms.push(roomLabel);

        // 3. GATHER EVERY REACHABLE NODE IN THE ROOM
        const nodesInRoom = scene.gatheringNodes.filter(n => {
          if (n.isHarvested) return false;
          return n.x >= room.x && n.x < room.x + room.width && n.y >= room.y && n.y < room.y + room.height;
        });

        for (const node of nodesInRoom) {
          if (node.isHarvested) continue;
          const nodeType = node.nodeDef.id;

          const oreB = gs.getOre();
          const woodB = gs.getWood();
          const rpB = gs.getResearchPoints();

          scene.interactWithGatheringNode(node, livingParty);

          const gStart = performance.now();
          let started = false;
          let completed = false;

          while (!node.isHarvested && (performance.now() - gStart < 14000)) {
            await new Promise(r => setTimeout(r, 200));
            if (scene.activeGatherChannels && scene.activeGatherChannels.size > 0) {
              started = true;
            }
            if (livingParty.some(m => m.inCombat && m.targetEntity)) {
              break; // interrupted by roaming enemy
            }
          }

          if (node.isHarvested) {
            completed = true;
          }

          gatheredNodes.push({
            type: nodeType,
            pos: { x: node.x, y: node.y },
            channelStarted: started,
            channelCompleted: completed,
            oreGained: gs.getOre() - oreB,
            woodGained: gs.getWood() - woodB,
            rpGained: gs.getResearchPoints() - rpB
          });
        }
      }

      // 4. Return via Teleporter Crystal
      const crystalPos = scene.crystalPos;
      scene.executePartyConvoyMovement(livingParty, crystalPos.x, crystalPos.y, new Set());
      await new Promise(r => setTimeout(r, 3000));

      const inGameSeconds = (scene.time.now - startTimeNow) / 1000;

      return {
        initialRP,
        finalRP: gs.getResearchPoints(),
        totalRPGain: gs.getResearchPoints() - initialRP,
        initialOre,
        finalOre: gs.getOre(),
        totalOreGathered: gs.getOre() - initialOre,
        initialWood,
        finalWood: gs.getWood(),
        totalWoodGathered: gs.getWood() - initialWood,
        clearedRoomsCount: clearedRooms.length,
        clearedRooms,
        killedEnemiesCount: killedEnemies.length,
        killedEnemies,
        gatheredNodesCount: gatheredNodes.length,
        gatheredNodes,
        inGameSeconds,
        inGameMinutes: inGameSeconds / 60
      };
    });

    console.log('\nTrip Report Summary:');
    console.log(`  Rooms Cleared: ${tripReport.clearedRoomsCount}`);
    console.log(`  Enemies Killed: ${tripReport.killedEnemiesCount}`);
    for (const k of tripReport.killedEnemies) {
      console.log(`    - ${k.name} (${k.tier}) in Room ${k.room} -> +${k.rpGain} RP`);
    }
    console.log(`  Nodes Gathered: ${tripReport.gatheredNodesCount}`);
    for (const g of tripReport.gatheredNodes) {
      console.log(`    - ${g.type} at (${g.pos.x},${g.pos.y}): Started=${g.channelStarted}, Completed=${g.channelCompleted}, Ore=+${g.oreGained}, Wood=+${g.woodGained}, RP=+${g.rpGained}`);
    }
    console.log(`  End of Trip Stats: RP=${tripReport.finalRP} (+${tripReport.totalRPGain}), Ore=${tripReport.finalOre} (+${tripReport.totalOreGathered}), Wood=${tripReport.finalWood} (+${tripReport.totalWoodGathered})`);
    console.log(`  In-Game Time: ${tripReport.inGameSeconds.toFixed(1)}s (${tripReport.inGameMinutes.toFixed(2)} min)`);

  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

testFullTrip().catch(console.error);
