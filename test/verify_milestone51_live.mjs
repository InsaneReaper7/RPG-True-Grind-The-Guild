import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('================================================================');
  console.log('MILESTONE 51 LIVE SESSION VERIFICATION:');
  console.log('1. GATHERING CONTINUITY UNDER ENCUMBRANCE (-80% SPEED)');
  console.log('2. SNAPSHOT PERSISTENCE ACROSS GENUINE CONTINUE TRANSITIONS');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[MainScene]') ||
        text.includes('[Gathering') ||
        text.includes('Continuing descent') ||
        text.includes('[Player') ||
        text.includes('ENCUMBERED') ||
        text.includes('SceneTransition')
      ) {
        console.log('  [BROWSER]', text);
      }
    });

    console.log('Connecting to live game at http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // -----------------------------------------------------------------
    // SETUP: Transition Outpost -> MainScene (Floor 1)
    // -----------------------------------------------------------------
    console.log('\n--- Setup: Transitioning Outpost -> MainScene (Floor 1) ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.executeTransitionToDungeon();
      }
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.player;
    }, { timeout: 10000 });
    await sleep(1000);

    const initialFloor = await page.evaluate(() => {
      return window.GameState.getInstance().getDungeonFloorCount();
    });
    console.log(`✓ Active in MainScene on Dungeon Floor: ${initialFloor}`);
    assert.strictEqual(initialFloor, 1, 'Initial dungeon floor must be 1');

    // -----------------------------------------------------------------
    // PART 1: LIVE GATHERING CONTINUITY UNDER ENCUMBERANCE (-80% SPEED)
    // -----------------------------------------------------------------
    console.log('\n--- Part 1: Live Gathering Continuity Under Encumbrance Proof ---');

    // 1a. Identify 2 valid unharvested gathering nodes on Floor 1
    const nodesInfo = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const worker = scene.player;

      // Ensure enemies on floor do not aggro during gathering continuity test
      if (scene.enemies) {
        scene.enemies.forEach(e => {
          if (e.enemyData) e.enemyData.aggroRadius = 0;
          e.isAggroed = false;
          e.targetEntity = null;
        });
      }

      const sorted = scene.gatheringNodes
        .filter(n => !n.isHarvested)
        .sort((a, b) => Math.hypot(a.x - worker.gridPos.x, a.y - worker.gridPos.y) - Math.hypot(b.x - worker.gridPos.x, b.y - worker.gridPos.y));

      if (sorted.length < 2) {
        throw new Error(`Insufficient unharvested nodes on Floor 1 (found ${sorted.length})`);
      }

      // Position worker within 4-5 tiles of node 0 to provide a clean, deterministic 5-tile walk
      const candidatePositions = [
        { x: sorted[0].x - 4, y: sorted[0].y },
        { x: sorted[0].x + 4, y: sorted[0].y },
        { x: sorted[0].x, y: sorted[0].y - 4 },
        { x: sorted[0].x, y: sorted[0].y + 4 }
      ];
      for (const pos of candidatePositions) {
        if (
          pos.x > 0 && pos.x < scene.mapWidth - 1 &&
          pos.y > 0 && pos.y < scene.mapHeight - 1 &&
          scene.gridMatrix[pos.y]?.[pos.x] === 0 &&
          !scene.isTileOccupied(pos.x, pos.y)
        ) {
          worker.setGridPosition(pos.x, pos.y);
          break;
        }
      }

      return {
        totalAvailable: sorted.length,
        node0: { name: sorted[0].nodeDef.name, x: sorted[0].x, y: sorted[0].y, dist: Math.hypot(sorted[0].x - worker.gridPos.x, sorted[0].y - worker.gridPos.y).toFixed(1) },
        node1: { name: sorted[1].nodeDef.name, x: sorted[1].x, y: sorted[1].y, dist: Math.hypot(sorted[1].x - worker.gridPos.x, sorted[1].y - worker.gridPos.y).toFixed(1) }
      };
    });
    console.log(`  Found ${nodesInfo.totalAvailable} gathering nodes on Floor 1.`);
    console.log(`  Target Node 1: ${nodesInfo.node0.name} at (${nodesInfo.node0.x}, ${nodesInfo.node0.y}), dist: ${nodesInfo.node0.dist} tiles`);
    console.log(`  Target Node 2: ${nodesInfo.node1.name} at (${nodesInfo.node1.x}, ${nodesInfo.node1.y}), dist: ${nodesInfo.node1.dist} tiles`);

    // 1b. Overload the gatherer with heavy weight to trigger genuine encumbrance
    const workerSetup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const worker = scene.player;

      // Add 100 stone (50.0kg) > 45.0kg carry capacity
      worker.addItem('stone', 100);

      return {
        name: worker.entityName,
        totalWeight: worker.getTotalWeight(),
        capacity: worker.getEffectiveCarryCapacity(),
        isEncumbered: worker.isEncumbered,
        moveSpeed: worker.moveSpeed,
        baseMoveSpeed: worker.baseMoveSpeed,
        encumbranceMultiplier: worker.encumbranceMultiplier
      };
    });
    console.log(`  Gatherer: ${workerSetup.name}`);
    console.log(`  Total Weight: ${workerSetup.totalWeight}kg / ${workerSetup.capacity}kg capacity`);
    console.log(`  isEncumbered: ${workerSetup.isEncumbered}`);
    console.log(`  moveSpeed: ${workerSetup.moveSpeed} (reduced -80% from base ${workerSetup.baseMoveSpeed})`);
    assert.strictEqual(workerSetup.isEncumbered, true, 'Worker must be encumbered');
    assert.strictEqual(workerSetup.encumbranceMultiplier, 0.20, 'Encumbrance multiplier must be 0.20');
    assert.strictEqual(workerSetup.moveSpeed, workerSetup.baseMoveSpeed * 0.20, 'Encumbered worker speed must be exactly 20% of base speed');

    // 1c. Queue both nodes in Gathering Mode queue
    console.log('  Dispatching encumbered worker to multi-node Gathering Queue [Node 1, Node 2]...');
    await page.evaluate((coords) => {
      const scene = window.game.scene.getScene('MainScene');
      const nodes = coords.map(c => scene.gatheringNodes.find(n => n.x === c.x && n.y === c.y)).filter(Boolean);
      scene.startGatheringQueue(nodes);
    }, [{ x: nodesInfo.node0.x, y: nodesInfo.node0.y }, { x: nodesInfo.node1.x, y: nodesInfo.node1.y }]);

    // 1d. Wait for Node 1 to be reached, channeled, and harvested at reduced speed
    console.log('  Waiting for encumbered worker to walk to Node 1 at 20% speed, channel, and harvest...');
    await page.waitForFunction((c) => {
      const scene = window.game.scene.getScene('MainScene');
      const target = scene.gatheringNodes.find(n => n.x === c.x && n.y === c.y);
      return target && target.isHarvested;
    }, { timeout: 60000 }, { x: nodesInfo.node0.x, y: nodesInfo.node0.y });
    console.log('  ✓ Node 1 harvested successfully by encumbered worker!');

    // 1e. Confirm worker is now walking to Node 2 at reduced speed without stalling
    console.log('  Observing queue continuity: worker proceeding to Node 2 at reduced speed...');
    const midQueueState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const worker = scene.player;
      return {
        state: worker.state,
        moveSpeed: worker.moveSpeed,
        baseMoveSpeed: worker.baseMoveSpeed,
        isEncumbered: worker.isEncumbered,
        queueRemaining: scene.gatheringQueue.length,
        hasAssignment: scene.gatheringWorkerNodeAssignments.has(worker)
      };
    });
    console.log('  Mid-queue state:', midQueueState);
    assert.strictEqual(midQueueState.isEncumbered, true, 'Worker must remain encumbered');
    assert.strictEqual(midQueueState.moveSpeed, midQueueState.baseMoveSpeed * 0.20, 'Worker must continue at 20% move speed');

    // 1f. Wait for Node 2 to be reached and harvested at reduced speed
    console.log('  Waiting for encumbered worker to walk across to Node 2 at 20% speed and harvest...');
    await page.waitForFunction((c) => {
      const scene = window.game.scene.getScene('MainScene');
      const target = scene.gatheringNodes.find(n => n.x === c.x && n.y === c.y);
      return target && target.isHarvested;
    }, { timeout: 60000 }, { x: nodesInfo.node1.x, y: nodesInfo.node1.y });
    console.log('  ✓ Node 2 harvested successfully by encumbered worker!');

    // 1g. Confirm full queue completion without stall or timeout
    const queueCompleteState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const worker = scene.player;
      return {
        workerState: worker.state,
        queueLength: scene.gatheringQueue.length,
        assignmentsCount: scene.gatheringWorkerNodeAssignments.size,
        workerStone: worker.getItemCount('stone'),
        workerTotalWeight: worker.getTotalWeight()
      };
    });
    console.log('  Queue completed cleanly! Final state:', queueCompleteState);
    assert.strictEqual(queueCompleteState.queueLength, 0, 'Gathering queue must be exhausted (0 remaining)');
    assert.strictEqual(queueCompleteState.assignmentsCount, 0, 'No remaining assignments');
    console.log('✓ PASS GAP 1: Encumbered worker successfully cleared multi-node queue at 20% speed without stalling or timing out.\n');

    // -----------------------------------------------------------------
    // PART 2: LIVE SNAPSHOT PERSISTENCE ACROSS CONTINUE CHAIN PROOF
    // -----------------------------------------------------------------
    console.log('--- Part 2: Snapshot Persistence Across Genuine Continue Chain ---');

    // 2a. Spawn Companion (Valerie) and establish distinct personal bags
    console.log('  Spawning companion Valerie and setting distinct personal inventories on Floor 1...');
    const floor1Setup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.spawnTestCompanion();

      const hero = scene.player;
      const companion = scene.party[1];

      // Reset bags
      hero.clearInventory();
      companion.clearInventory();

      // Hero: 25 wood (5.0kg) + 10 iron_ore (5.0kg) = 10.0kg inventory. Equipped short_swords (3.0kg).
      // Total: 13.0kg <= 45.0kg capacity -> UNENCUMBERED
      hero.addItem('wood', 25);
      hero.addItem('iron_ore', 10);

      // Companion: 90 stone (45.0kg) + 10 iron_ore (5.0kg) = 50.0kg inventory. Equipped daggers (1.0kg).
      // Total: 51.0kg > 45.0kg capacity -> ENCUMBERED
      companion.addItem('stone', 90);
      companion.addItem('iron_ore', 10);

      scene.hud.update(hero, scene.progressionSystem, 0, scene.party);

      return {
        hero: {
          name: hero.entityName,
          wood: hero.getItemCount('wood'),
          ironOre: hero.getItemCount('iron_ore'),
          invWeight: hero.getInventoryWeight(),
          totalWeight: hero.getTotalWeight(),
          isEncumbered: hero.isEncumbered,
          moveSpeed: hero.moveSpeed
        },
        companion: {
          name: companion.entityName,
          stone: companion.getItemCount('stone'),
          ironOre: companion.getItemCount('iron_ore'),
          invWeight: companion.getInventoryWeight(),
          totalWeight: companion.getTotalWeight(),
          isEncumbered: companion.isEncumbered,
          moveSpeed: companion.moveSpeed,
          baseMoveSpeed: companion.baseMoveSpeed
        }
      };
    });

    console.log('  Floor 1 Setup:');
    console.log('    Hero:', floor1Setup.hero);
    console.log('    Companion:', floor1Setup.companion);

    assert.strictEqual(floor1Setup.hero.isEncumbered, false, 'Hero starts unencumbered');
    assert.strictEqual(floor1Setup.companion.isEncumbered, true, 'Companion starts encumbered');
    assert.strictEqual(floor1Setup.companion.moveSpeed, floor1Setup.companion.baseMoveSpeed * 0.20, 'Companion moves at 20% speed');

    // Confirm Floor 1 HUD portrait reflects Companion ENC status
    const floor1PortraitStatus = await page.evaluate(() => {
      const compStatus = document.getElementById('party-portrait-status-1')?.innerText;
      const heroStatus = document.getElementById('party-portrait-status-0')?.innerText;
      return { heroStatus, compStatus };
    });
    console.log('  Floor 1 HUD Portrait Badges:', floor1PortraitStatus);
    assert.ok(floor1PortraitStatus.compStatus.includes('ENC'), 'Companion portrait shows ENC badge on Floor 1');

    // 2b. Execute genuine Continue Descent (Floor 1 -> Floor 2 via real scene.restart())
    console.log('\n  Executing Genuine Continue Descent: clicking #crystal-btn-continue...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.openCrystalModal();
    });
    await sleep(300);

    await page.click('#crystal-btn-continue');

    // Wait for real scene restart and arrival on Floor 2
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      return main && main.scene.isActive() && main.player && gs.getDungeonFloorCount() === 2;
    }, { timeout: 10000 });
    await sleep(1000);

    const floor2Num = await page.evaluate(() => {
      return window.GameState.getInstance().getDungeonFloorCount();
    });
    console.log(`✓ Genuine scene.restart() complete! Current Dungeon Floor: ${floor2Num}`);
    assert.strictEqual(floor2Num, 2, 'Must be on Dungeon Floor 2');

    // 2c. Inspect Live Player and Party Entities on Floor 2
    console.log('\n  Inspecting live party entities on Floor 2 after snapshot handoff...');
    const floor2PartyState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.player;
      const companion = scene.party[1];

      scene.hud.update(hero, scene.progressionSystem, 0, scene.party);

      return {
        partySize: scene.party.length,
        hero: {
          name: hero.entityName,
          wood: hero.getItemCount('wood'),
          ironOre: hero.getItemCount('iron_ore'),
          invWeight: hero.getInventoryWeight(),
          totalWeight: hero.getTotalWeight(),
          isEncumbered: hero.isEncumbered,
          moveSpeed: hero.moveSpeed,
          baseMoveSpeed: hero.baseMoveSpeed
        },
        companion: {
          name: companion?.entityName,
          stone: companion?.getItemCount('stone'),
          ironOre: companion?.getItemCount('iron_ore'),
          invWeight: companion?.getInventoryWeight(),
          totalWeight: companion?.getTotalWeight(),
          isEncumbered: companion?.isEncumbered,
          moveSpeed: companion?.moveSpeed,
          baseMoveSpeed: companion?.baseMoveSpeed
        }
      };
    });

    console.log('  Floor 2 Party State:', floor2PartyState);
    assert.strictEqual(floor2PartyState.partySize, 2, 'Party must retain both members on Floor 2');

    // Verify Hero personal inventory, weight, and unencumbered state survived 100% intact
    assert.strictEqual(floor2PartyState.hero.wood, 25, 'Hero wood count retained across Continue');
    assert.strictEqual(floor2PartyState.hero.ironOre, 10, 'Hero iron ore count retained across Continue');
    assert.strictEqual(floor2PartyState.hero.invWeight, floor1Setup.hero.invWeight, 'Hero inv weight intact');
    assert.strictEqual(floor2PartyState.hero.totalWeight, floor1Setup.hero.totalWeight, 'Hero total weight intact');
    assert.strictEqual(floor2PartyState.hero.isEncumbered, false, 'Hero remains unencumbered');
    assert.strictEqual(floor2PartyState.hero.moveSpeed, floor2PartyState.hero.baseMoveSpeed, 'Hero move speed remains full base speed');

    // Verify Companion personal inventory, weight, and encumbrance survived 100% intact
    assert.strictEqual(floor2PartyState.companion.stone, 90, 'Companion stone count retained across Continue');
    assert.strictEqual(floor2PartyState.companion.ironOre, 10, 'Companion iron ore count retained across Continue');
    assert.strictEqual(floor2PartyState.companion.invWeight, floor1Setup.companion.invWeight, 'Companion inv weight intact');
    assert.strictEqual(floor2PartyState.companion.totalWeight, floor1Setup.companion.totalWeight, 'Companion total weight intact');
    assert.strictEqual(floor2PartyState.companion.isEncumbered, true, 'Companion remains ENCUMBERED on Floor 2');
    assert.strictEqual(floor2PartyState.companion.moveSpeed, floor2PartyState.companion.baseMoveSpeed * 0.20, 'Companion maintains -80% penalty on Floor 2');

    // 2d. Confirm HUD Portrait and Party Overview Modal on Floor 2
    const floor2UIState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.hud.renderPartyOverviewModal(true);

      const compStatus = document.getElementById('party-portrait-status-1')?.innerText;
      const rosterHtml = document.getElementById('party-overview-roster')?.innerHTML || '';

      return {
        compStatus,
        rosterHasWeight: rosterHtml.includes('⚖️ Weight:'),
        rosterHasBag: rosterHtml.includes('🎒 Personal Bag'),
        rosterHasEncumbered: rosterHtml.includes('ENCUMBERED'),
        rosterHasStone: rosterHtml.toLowerCase().includes('stone')
      };
    });

    console.log('  Floor 2 UI State:', floor2UIState);
    assert.ok(floor2UIState.compStatus.includes('ENC'), 'HUD portrait preserves ENC indicator on Floor 2');
    assert.strictEqual(floor2UIState.rosterHasWeight, true, 'Party Overview Modal renders weight bar');
    assert.strictEqual(floor2UIState.rosterHasBag, true, 'Party Overview Modal renders personal bag');
    assert.strictEqual(floor2UIState.rosterHasEncumbered, true, 'Party Overview Modal displays ENCUMBERED badge');

    // 2e. Live Interaction Test on Floor 2: Shed weight via item transfer to clear encumbrance
    console.log('\n  Testing Live Interaction on Floor 2: Transferring 20 stone from Valerie to Hero...');
    const transferResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.player;
      const companion = scene.party[1];

      // Transfer 20 stone (10.0kg) from companion to hero
      const success = window.GameState.getInstance().transferItem(companion, hero, 'stone', 20);

      scene.hud.update(hero, scene.progressionSystem, 0, scene.party);

      return {
        success,
        companionStone: companion.getItemCount('stone'),
        companionWeight: companion.getTotalWeight(),
        companionEncumbered: companion.isEncumbered,
        companionMoveSpeed: companion.moveSpeed,
        companionBaseMoveSpeed: companion.baseMoveSpeed,
        heroStone: hero.getItemCount('stone'),
        heroWeight: hero.getTotalWeight()
      };
    });
    console.log('  Transfer Result:', transferResult);
    assert.strictEqual(transferResult.success, true, 'Transfer must succeed on Floor 2');
    assert.strictEqual(transferResult.companionStone, 70, 'Companion now holds 70 stone');
    assert.strictEqual(transferResult.companionWeight, 41.0, 'Companion total weight dropped to 41.0kg <= 45.0kg');
    assert.strictEqual(transferResult.companionEncumbered, false, 'Companion encumbrance cleared live on Floor 2!');
    assert.strictEqual(transferResult.companionMoveSpeed, transferResult.companionBaseMoveSpeed, 'Companion moveSpeed restored to full on Floor 2!');

    // 2f. Multi-Floor Continue Extension (Floor 2 -> Floor 3)
    console.log('\n  Testing Multi-Floor Continue Extension (Floor 2 -> Floor 3)...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.openCrystalModal();
    });
    await sleep(300);
    await page.click('#crystal-btn-continue');

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      return main && main.scene.isActive() && main.player && gs.getDungeonFloorCount() === 3;
    }, { timeout: 10000 });
    await sleep(1000);

    const floor3Party = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        floor: window.GameState.getInstance().getDungeonFloorCount(),
        heroWood: scene.player.getItemCount('wood'),
        heroStone: scene.player.getItemCount('stone'),
        heroTotalWeight: scene.player.getTotalWeight(),
        companionStone: scene.party[1]?.getItemCount('stone'),
        companionTotalWeight: scene.party[1]?.getTotalWeight(),
        companionEncumbered: scene.party[1]?.isEncumbered
      };
    });
    console.log('  Floor 3 Party State:', floor3Party);
    assert.strictEqual(floor3Party.floor, 3, 'Floor count is 3');
    assert.strictEqual(floor3Party.heroWood, 25, 'Hero retained 25 wood on Floor 3');
    assert.strictEqual(floor3Party.heroStone, 20, 'Hero retained 20 stone on Floor 3');
    assert.strictEqual(floor3Party.companionStone, 70, 'Companion retained 70 stone on Floor 3');
    assert.strictEqual(floor3Party.companionEncumbered, false, 'Companion remains unencumbered on Floor 3');

    console.log('✓ PASS GAP 2: Snapshot persistence across multiple genuine Continue transitions verified with 100% fidelity.\n');

    console.log('================================================================');
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('Both Milestone 51 gaps are completely closed and proven in live session.');
    console.log('================================================================');

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
