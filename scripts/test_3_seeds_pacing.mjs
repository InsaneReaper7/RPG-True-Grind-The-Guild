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
    return null;
  }
  const child = spawn('cmd.exe', ['/c', `npx vite --port ${PORT} --no-open`], {
    shell: true,
    stdio: 'pipe'
  });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await checkServerReady(PORT)) {
      return child;
    }
  }
  throw new Error(`Timed out waiting for Vite server on port ${PORT}`);
}

async function runSeedPacing(seedVal) {
  console.log(`\n============================================================`);
  console.log(`🎯 TESTING PACING TO FIRST CRAFTED WEAPON ON SEED ${seedVal}`);
  console.log(`============================================================`);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);

    // Bootstrap game state using standard game functions
    await page.evaluate(() => {
      window.startNewGame(true);
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost.party.length < 3) {
        outpost.summonThirdPartyMember('sword_and_shield');
      }
    });

    await page.waitForFunction(() => {
      const op = window.game?.scene?.getScene('OutpostScene');
      return op && op.scene.isActive() && op.party && op.party.length === 3;
    }, { timeout: 15000 });
    await sleep(800);

    let totalDungeonTrips = 0;
    let totalInGameSeconds = 0;
    let weaponCrafted = false;
    let currentFloorSeed = seedVal;
    const tripDetails = [];

    while (totalDungeonTrips < 5 && !weaponCrafted) {
      totalDungeonTrips++;

      // Transition to dungeon with specific floor seed
      await page.evaluate((sVal) => {
        const outpost = window.game.scene.getScene('OutpostScene');
        window.GameState.getInstance().savePartySnapshot(outpost.party, outpost.time.now);
        window.GameState.getInstance().resetDungeonFloorCount();
        outpost.scene.start('MainScene', { seed: sVal });
      }, currentFloorSeed);

      await page.waitForFunction(() => {
        const ms = window.game?.scene?.getScene('MainScene');
        return ms && ms.scene.isActive() && ms.party && ms.party.length === 3 && ms.gatheringNodes;
      }, { timeout: 15000 });
      await sleep(500);

      // Explore floor realistically
      const tripRes = await page.evaluate(async () => {
        const scene = window.game.scene.getScene('MainScene');
        const gs = window.GameState.getInstance();
        const party = scene.party;
        const initialRP = gs.getResearchPoints();
        const initialOre = gs.getOre();
        const startTimeNow = scene.time.now;

        const rooms = scene.dungeon.rooms;
        const entranceRoom = rooms.find(r => r.type === 'entrance') || rooms[0];
        const otherRooms = rooms.filter(r => r !== entranceRoom);
        const orderedRooms = [entranceRoom, ...otherRooms];

        let roomsClearedCount = 0;
        let killedEnemiesCount = 0;
        let nodesHarvestedCount = 0;

        for (const room of orderedRooms) {
          if (party.every(m => m.state === 'dead' || m.state === 'downed')) break;

          // Clear room enemies
          let retries = 0;
          while (retries < 8) {
            retries++;
            const living = party.filter(m => m.state !== 'dead' && m.state !== 'downed');
            if (living.length === 0) break;

            const roomEnemies = scene.enemies.filter(e => {
              if (e.state === 'dead' || e.state === 'downed') return false;
              const inRoom = e.gridPos.x >= room.x && e.gridPos.x < room.x + room.width &&
                             e.gridPos.y >= room.y && e.gridPos.y < room.y + room.height;
              const nearParty = Math.hypot(e.gridPos.x - party[0].gridPos.x, e.gridPos.y - party[0].gridPos.y) <= 5;
              return inRoom || nearParty;
            });
            if (roomEnemies.length === 0) break;

            const target = roomEnemies[0];
            scene.engageEnemy(target, living);

            const fStart = performance.now();
            while (target.state !== 'dead' && target.state !== 'downed' && party.some(m => m.state !== 'dead' && m.state !== 'downed')) {
              await new Promise(r => setTimeout(r, 100));
              if (performance.now() - fStart > 8000) break;
            }
            if (target.state === 'dead' || target.state === 'downed') {
              killedEnemiesCount++;
            }
          }

          roomsClearedCount++;

          // Gather nodes in room
          const nodesInRoom = scene.gatheringNodes.filter(n => {
            if (n.isHarvested) return false;
            return n.x >= room.x && n.x < room.x + room.width && n.y >= room.y && n.y < room.y + room.height;
          });

          for (const node of nodesInRoom) {
            const living = party.filter(m => m.state !== 'dead' && m.state !== 'downed');
            if (living.length === 0) break;
            scene.interactWithGatheringNode(node, living);
            const gStart = performance.now();
            while (!node.isHarvested && (performance.now() - gStart < 4000)) {
              await new Promise(r => setTimeout(r, 100));
            }
            if (node.isHarvested) {
              nodesHarvestedCount++;
            }
          }
        }

        // Capture party stats before leaving
        const endPartyStats = party.map(m => ({
          name: m.entityName,
          hp: Math.round(m.hp),
          maxHp: m.maxHp,
          criticalHp: Math.round(m.criticalHp),
          maxCriticalHp: m.maxCriticalHp,
          energy: Math.round(m.energy),
          maxEnergy: m.maxEnergy,
          state: m.state
        }));

        const elapsedSec = (scene.time.now - startTimeNow) / 1000;

        // Return via crystal
        scene.executeTransitionToOutpost();

        return {
          roomsClearedCount,
          killedEnemiesCount,
          nodesHarvestedCount,
          elapsedSec,
          endPartyStats,
          oreInBags: party.reduce((sum, m) => sum + (m.getItemCount ? m.getItemCount('ore') : 0), 0),
          rpEarned: gs.getResearchPoints() - initialRP
        };
      });

      await page.waitForFunction(() => {
        const op = window.game?.scene?.getScene('OutpostScene');
        return op && op.scene.isActive() && op.party && op.party.length === 3;
      }, { timeout: 15000 });
      await sleep(500);

      // Handle outpost processing: auto-deposit, rest, research & craft
      const outpostStatus = await page.evaluate(() => {
        const gs = window.GameState.getInstance();
        const op = window.game.scene.getScene('OutpostScene');
        const dl = window.DataLoader.getInstance();
        const rs = window.ResearchSystem.getInstance();

        // Rest party in bed
        for (const m of op.party) m.rest();
        gs.savePartySnapshot(op.party, op.time.now);

        const nodeId = 'research_blacksmithing_station';
        const nodeDef = dl.getResearchNode(nodeId);
        let researchUnlocked = gs.isResearchCompleted(nodeId);

        if (!researchUnlocked && gs.getResearchPoints() >= 10) {
          const res = rs.unlockNode(nodeDef);
          researchUnlocked = res.success || gs.isResearchCompleted(nodeId);
        }

        let stationPlaced = gs.getPlacedBuildables().some(b => b.id === 'blacksmithing_station');
        if (researchUnlocked && !stationPlaced && gs.getWood() >= 25) {
          op.toggleBuildMode();
          const doorBtn = document.querySelector('[data-buildable-id="door"]');
          if (doorBtn) doorBtn.click();
          op.placeAt(10, 13);
          const bsItem = document.querySelector('[data-buildable-id="blacksmithing_station"]');
          if (bsItem) bsItem.click();
          op.placeAt(9, 9);
          op.toggleBuildMode();
          stationPlaced = gs.getPlacedBuildables().some(b => b.id === 'blacksmithing_station');
        }

        let maceCrafted = false;
        if (stationPlaced && gs.getOre() >= 4 && gs.getWood() >= 2) {
          op.hud.openBlacksmithingModal(op.player, op.progressionSystem);
          const btn = document.querySelector('[data-forge-recipe="mace"]');
          if (btn) btn.click();
          op.hud.closeBlacksmithingModal();
          maceCrafted = op.player.getItemCount('mace') > 0;
        }

        return {
          currentRP: gs.getResearchPoints(),
          currentOre: gs.getOre(),
          currentWood: gs.getWood(),
          researchUnlocked,
          stationPlaced,
          maceCrafted
        };
      });

      totalInGameSeconds += tripRes.elapsedSec;

      tripDetails.push({
        trip: totalDungeonTrips,
        seed: currentFloorSeed,
        inGameMinutes: (tripRes.elapsedSec / 60).toFixed(2),
        cumulativeMin: (totalInGameSeconds / 60).toFixed(2),
        roomsCleared: tripRes.roomsClearedCount,
        enemiesKilled: tripRes.killedEnemiesCount,
        nodesHarvested: tripRes.nodesHarvestedCount,
        oreTotal: outpostStatus.currentOre,
        rpTotal: outpostStatus.currentRP,
        partyStats: tripRes.endPartyStats,
        maceCrafted: outpostStatus.maceCrafted
      });

      console.log(`  Trip #${totalDungeonTrips} (Seed ${currentFloorSeed}): Cleared ${tripRes.roomsClearedCount} rooms, Harvested ${tripRes.nodesHarvestedCount} nodes | Ore: ${outpostStatus.currentOre}/4, RP: ${outpostStatus.currentRP}/10 | Time: ${(tripRes.elapsedSec / 60).toFixed(2)} min (Cum: ${(totalInGameSeconds / 60).toFixed(2)} min)`);

      if (outpostStatus.maceCrafted) {
        weaponCrafted = true;
        console.log(`  🎉 First crafted weapon 'mace' produced at Trip #${totalDungeonTrips} (${(totalInGameSeconds / 60).toFixed(2)} in-game min)!`);
        break;
      }

      // Next floor seed
      currentFloorSeed = (currentFloorSeed * 37 + 101) % 100000;
    }

    await browser.close();
    return {
      seed: seedVal,
      totalTrips: totalDungeonTrips,
      totalInGameSeconds,
      totalInGameMinutes: totalInGameSeconds / 60,
      weaponCrafted,
      tripDetails
    };
  } catch (err) {
    console.error('Seed run error:', err);
    await browser.close();
    return { seed: seedVal, error: err.message };
  }
}

async function main() {
  const server = await ensureViteServer();
  const testSeeds = [1, 2, 3];
  const results = [];

  for (const s of testSeeds) {
    const res = await runSeedPacing(s);
    results.push(res);
  }

  console.log('\n============================================================');
  console.log('📊 3-SEED PACING COMPARISON SUMMARY');
  console.log('============================================================');
  console.log('Seed'.padEnd(8) + '| Trips'.padEnd(10) + '| In-Game Time'.padEnd(16) + '| Crafted?'.padEnd(12) + '| Trip Details');
  console.log('-'.repeat(70));
  for (const r of results) {
    if (r.error) {
      console.log(`Seed ${r.seed}`.padEnd(8) + `| ERROR: ${r.error}`);
    } else {
      console.log(
        `Seed ${r.seed}`.padEnd(8) +
        `| ${r.totalTrips} trips`.padEnd(10) +
        `| ${r.totalInGameMinutes.toFixed(2)} min`.padEnd(16) +
        `| ${r.weaponCrafted ? 'YES (mace)' : 'NO'}`.padEnd(12) +
        `| Trips: ${r.tripDetails.map(t => `${t.inGameMinutes}m (ore:${t.oreTotal})`).join(', ')}`
      );
    }
  }
  console.log('============================================================\n');

  if (server) {
    server.kill();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
