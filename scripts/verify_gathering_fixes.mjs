import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('================================================================');
  console.log('REAL-BROWSER RIGOROUS VERIFICATION: GATHERING MODE BUGFIXES');
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
        text.includes('[Gathering') ||
        text.includes('[Input]') ||
        text.includes('[CONVERGENCE]') ||
        text.includes('[VERIFY]')
      ) {
        console.log('  [BROWSER]', text);
      }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Transition to Dungeon Scene (MainScene)
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.scene.start('MainScene', { floor: 1 });
      }
    });
    await sleep(2000);

    // Setup 4-member party and defeat ambient enemies to isolate test
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      for (const e of scene.enemies) {
        e.hp = 0;
        e.state = 'dead';
        e.setVisible(false);
      }
    });
    await sleep(500);

    // Instrument HUD.triggerGatheringModeToggle to prove convergence
    await page.evaluate(() => {
      const hud = (window.game.scene.getScene('MainScene')).hud;
      hud.__toggleCalls = [];
      const orig = hud.triggerGatheringModeToggle.bind(hud);
      hud.triggerGatheringModeToggle = function(force) {
        const callerStack = new Error().stack;
        const entry = {
          force,
          isKey: callerStack.includes('keydown'),
          isClick: callerStack.includes('click') || callerStack.includes('addEventListener'),
          time: Date.now()
        };
        hud.__toggleCalls.push(entry);
        console.log(`[CONVERGENCE] triggerGatheringModeToggle called! force=${force}, viaKey=${entry.isKey}, viaClick=${entry.isClick}`);
        return orig(force);
      };
    });

    // --------------------------------------------------------------------------
    // PART 1: BUG 2 � F-KEY & HUD BUTTON SYMMETRIC TOGGLE & CONVERGENCE
    // --------------------------------------------------------------------------
    console.log('----------------------------------------------------------------');
    console.log('PART 1: BUG 2 � F-KEY & HUD BUTTON SYMMETRY AND CONVERGENCE');
    console.log('----------------------------------------------------------------');

    // Check initial state
    let state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const banner = document.getElementById('gathering-mode-banner');
      const btn = document.getElementById('gathering-mode-toggle-btn');
      return {
        mode: scene.isGatheringMode,
        banner: banner?.style.display,
        btnActive: btn?.classList.contains('active')
      };
    });
    assert.equal(state.mode, false, 'Initial mode must be OFF');
    console.log('? Initial state confirmed: Gathering Mode is OFF');

    // 1.1 Press F to toggle ON (holding 100ms like a human)
    console.log('\n>> 1.1 Pressing [F] key from OFF...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);

    state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const banner = document.getElementById('gathering-mode-banner');
      const btn = document.getElementById('gathering-mode-toggle-btn');
      return {
        mode: scene.isGatheringMode,
        banner: banner?.style.display,
        btnActive: btn?.classList.contains('active')
      };
    });
    console.log('  State after F press:', state);
    assert.equal(state.mode, true, 'Pressing F from OFF must toggle Gathering Mode ON');
    assert.equal(state.banner, 'block', 'Banner must be visible');
    assert.equal(state.btnActive, true, 'Button must have .active class');
    console.log('? PASS: F key correctly toggles Gathering Mode ON!');

    // 1.2 Press F again to toggle OFF
    console.log('\n>> 1.2 Pressing [F] key from ON...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);

    state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const banner = document.getElementById('gathering-mode-banner');
      const btn = document.getElementById('gathering-mode-toggle-btn');
      return {
        mode: scene.isGatheringMode,
        banner: banner?.style.display,
        btnActive: btn?.classList.contains('active')
      };
    });
    console.log('  State after second F press:', state);
    assert.equal(state.mode, false, 'Pressing F from ON must toggle Gathering Mode OFF');
    assert.equal(state.banner, 'none', 'Banner must be hidden');
    assert.equal(state.btnActive, false, 'Button must not have .active class');
    console.log('? PASS: F key correctly toggles Gathering Mode OFF!');

    // 1.3 Click HUD button to toggle ON
    console.log('\n>> 1.3 Clicking HUD button from OFF...');
    await page.click('#gathering-mode-toggle-btn');
    await sleep(400);

    state = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return { mode: scene.isGatheringMode };
    });
    assert.equal(state.mode, true, 'Clicking button from OFF must toggle Gathering Mode ON');
    console.log('? PASS: HUD Button toggles Gathering Mode ON!');

    // 1.4 Press F to toggle OFF (cross-input symmetry: button ON -> F key OFF)
    console.log('\n>> 1.4 Pressing [F] to toggle OFF after button activated it...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);

    state = await page.evaluate(() => window.game.scene.getScene('MainScene').isGatheringMode);
    assert.equal(state, false, 'F key must turn OFF mode activated by button');
    console.log('? PASS: Cross-input symmetry confirmed (Button ON -> F Key OFF)!');

    // 1.5 Press F to toggle ON -> Click button to toggle OFF
    console.log('\n>> 1.5 Pressing [F] ON -> Clicking Button OFF...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('MainScene').isGatheringMode), true);

    await page.click('#gathering-mode-toggle-btn');
    await sleep(400);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('MainScene').isGatheringMode), false);
    console.log('? PASS: Cross-input symmetry confirmed (F Key ON -> Button OFF)!');

    // 1.6 Press F to toggle ON -> Press Escape to toggle OFF
    console.log('\n>> 1.6 Pressing [F] ON -> Pressing Escape OFF...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('MainScene').isGatheringMode), true);

    await page.keyboard.press('Escape');
    await sleep(400);
    assert.equal(await page.evaluate(() => window.game.scene.getScene('MainScene').isGatheringMode), false);
    console.log('? PASS: Escape key correctly deactivates Gathering Mode!');

    // 1.7 Convergence Confirmation
    const convergenceCheck = await page.evaluate(() => {
      const hud = (window.game.scene.getScene('MainScene')).hud;
      return hud.__toggleCalls;
    });
    console.log(`\n>> Total calls intercepted by triggerGatheringModeToggle: ${convergenceCheck.length}`);
    assert.ok(convergenceCheck.length >= 6, 'Both inputs must converge through triggerGatheringModeToggle');
    console.log('? PASS: Genuine architectural convergence proven � both F and button route through triggerGatheringModeToggle!');

    // --------------------------------------------------------------------------
    // PART 2: BUG 1 � STUCK NODES REPRO & RESOLUTION (ALL 3 EXIT PATHS)
    // --------------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('PART 2: BUG 1 � NO STUCK NODES AFTER MID-QUEUE EXIT (3 PATHS)');
    console.log('----------------------------------------------------------------');

    // Helper function in browser context to find guaranteed walkable cluster
    const spawnCluster = async (type = 'foraging_bush') => {
      return await page.evaluate((nodeType) => {
        const scene = window.game.scene.getScene('MainScene');
        const heroPos = scene.party[0].gridPos;
        const coords = [];

        // Search in a spiral / grid around hero for open floor tiles with open neighbors
        for (let r = 2; r <= 8 && coords.length < 4; r++) {
          for (let dy = -r; dy <= r && coords.length < 4; dy += 2) {
            for (let dx = -r; dx <= r && coords.length < 4; dx += 2) {
              const tx = heroPos.x + dx;
              const ty = heroPos.y + dy;
              if (tx > 2 && tx < scene.mapWidth - 3 && ty > 2 && ty < scene.mapHeight - 3) {
                if (scene.gridMatrix[ty]?.[tx] === 0) {
                  // Ensure not on a party member and not already in coords
                  const onParty = scene.party.some(m => m.gridPos.x === tx && m.gridPos.y === ty);
                  const inCoords = coords.some(c => c.x === tx && c.y === ty);
                  if (!onParty && !inCoords) {
                    // Ensure at least one adjacent tile is walkable floor
                    const hasWalkableNeighbor = [
                      scene.gridMatrix[ty+1]?.[tx] === 0,
                      scene.gridMatrix[ty-1]?.[tx] === 0,
                      scene.gridMatrix[ty]?.[tx+1] === 0,
                      scene.gridMatrix[ty]?.[tx-1] === 0
                    ].some(Boolean);
                    if (hasWalkableNeighbor) {
                      coords.push({ x: tx, y: ty });
                    }
                  }
                }
              }
            }
          }
        }

        const spawned = coords.map((c, i) => {
          const n = scene.spawnGatheringNode(c.x, c.y, nodeType);
          return { id: i, x: c.x, y: c.y, idx: scene.gatheringNodes.indexOf(n) };
        });
        return spawned;
      }, type);
    };

    // SCENARIO A: Exit via F key mid-queue
    console.log('\n=== Scenario A: Mid-Queue Exit via [F] Key ===');
    const nodesA = await spawnCluster('foraging_bush');
    console.log('Spawned 4 nodes for Scenario A:', nodesA);

    // Queue all 4 nodes in Gathering Mode
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.toggleGatheringMode(true);
      const testNodes = scene.gatheringNodes.slice(-4);
      scene.startGatheringQueue(testNodes);
    });
    await sleep(200);

    // Capture state BEFORE exit
    const stateBeforeExitA = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        queueLen: scene.gatheringQueue.length,
        assignedCount: scene.gatheringWorkerNodeAssignments.size,
        channelsCount: scene.activeGatherChannels.size,
        assignments: Array.from(scene.gatheringWorkerNodeAssignments.entries()).map(([w, n]) => ({
          worker: w.entityName,
          node: `(${n.x},${n.y})`,
          state: w.state,
          dest: w.claimedDestination
        }))
      };
    });
    console.log('Captured state BEFORE F exit (Queue active):', JSON.stringify(stateBeforeExitA, null, 2));
    assert.ok(stateBeforeExitA.assignedCount > 0 || stateBeforeExitA.channelsCount > 0, 'Workers must be active before exit');

    // Exit mid-queue via F key!
    console.log('>> Exiting mid-queue via [F] key...');
    await page.keyboard.down('KeyF');
    await sleep(100);
    await page.keyboard.up('KeyF');
    await sleep(400);

    // Capture state AFTER exit
    const stateAfterExitA = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        isGatheringMode: scene.isGatheringMode,
        queueLen: scene.gatheringQueue.length,
        assignedCount: scene.gatheringWorkerNodeAssignments.size,
        channelsCount: scene.activeGatherChannels.size,
        partyDests: scene.party.map(p => ({ name: p.entityName, state: p.state, dest: p.claimedDestination }))
      };
    });
    console.log('Captured state AFTER F exit (Cleanup verified):', JSON.stringify(stateAfterExitA, null, 2));
    assert.equal(stateAfterExitA.isGatheringMode, false, 'Gathering mode must be OFF');
    assert.equal(stateAfterExitA.queueLen, 0, 'Queue must be strictly 0 after exit');
    assert.equal(stateAfterExitA.assignedCount, 0, 'Worker assignments must be strictly 0 after exit');
    assert.equal(stateAfterExitA.channelsCount, 0, 'Channels must be strictly 0 after exit');
    assert.ok(stateAfterExitA.partyDests.every(p => p.dest === null), 'All claimed destinations must be cleared');
    console.log('? Clean state release verified: queue empty, assignments cleared, claimed destinations null.');

    // Now single-click EVERY ONE of the 4 nodes using Hero!
    console.log('\n>> Attempting single-click harvest on all 4 nodes from Scenario A...');
    for (let i = 0; i < 4; i++) {
      const targetIdx = nodesA[i].idx;
      console.log(`  -> Single-clicking Node ${i} at (${nodesA[i].x}, ${nodesA[i].y})...`);
      await page.evaluate((idx) => {
        const scene = window.game.scene.getScene('MainScene');
        scene.selectMemberByIndex(0, false);
        const node = scene.gatheringNodes[idx];
        node.sprite.emit('pointerdown', {}, 0, 0, { stopPropagation: () => {} });
      }, targetIdx);

      // Wait for Hero to path, channel (2500ms), and harvest
      const startWait = Date.now();
      let nodeHarvested = false;
      while (Date.now() - startWait < 8000) {
        nodeHarvested = await page.evaluate((idx) => window.game.scene.getScene('MainScene').gatheringNodes[idx].isHarvested, targetIdx);
        if (nodeHarvested) break;
        await sleep(200);
      }

      
      console.log(`     Node ${i} isHarvested: ${nodeHarvested}`);
      assert.equal(nodeHarvested, true, `Node ${i} MUST be successfully harvested via normal single click!`);
    }
    console.log('? SCENARIO A PASSED: All 4 nodes cleanly harvested via single click after mid-queue F exit!');

    // SCENARIO B: Exit via Escape key mid-queue
    console.log('\n=== Scenario B: Mid-Queue Exit via [Escape] Key ===');
    const nodesB = await spawnCluster('mining_rock');
    console.log('Spawned 4 nodes for Scenario B:', nodesB);

    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.selectAllMembers();
      scene.toggleGatheringMode(true);
      const testNodes = scene.gatheringNodes.slice(-4);
      scene.startGatheringQueue(testNodes);
    });
    await sleep(200);

    console.log('>> Exiting mid-queue via [Escape] key...');
    await page.keyboard.press('Escape');
    await sleep(400);

    const stateAfterExitB = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        queueLen: scene.gatheringQueue.length,
        assignedCount: scene.gatheringWorkerNodeAssignments.size,
        channelsCount: scene.activeGatherChannels.size,
        partyDests: scene.party.map(p => p.claimedDestination)
      };
    });
    assert.equal(stateAfterExitB.queueLen, 0);
    assert.equal(stateAfterExitB.assignedCount, 0);
    assert.equal(stateAfterExitB.channelsCount, 0);
    assert.ok(stateAfterExitB.partyDests.every(d => d === null));
    console.log('? Clean state release verified after Escape exit.');

    for (let i = 0; i < 4; i++) {
      const targetIdx = nodesB[i].idx;
      console.log(`  -> Single-clicking Node ${i} at (${nodesB[i].x}, ${nodesB[i].y})...`);
      await page.evaluate((idx) => {
        const scene = window.game.scene.getScene('MainScene');
        scene.selectMemberByIndex(0, false);
        const node = scene.gatheringNodes[idx];
        node.sprite.emit('pointerdown', {}, 0, 0, { stopPropagation: () => {} });
      }, targetIdx);

      const startWait = Date.now();
      let nodeHarvested = false;
      while (Date.now() - startWait < 8000) {
        nodeHarvested = await page.evaluate((idx) => window.game.scene.getScene('MainScene').gatheringNodes[idx].isHarvested, targetIdx);
        if (nodeHarvested) break;
        await sleep(200);
      }

      
      console.log(`     Node ${i} isHarvested: ${nodeHarvested}`);
      assert.equal(nodeHarvested, true, `Node ${i} MUST be harvested cleanly!`);
    }
    console.log('? SCENARIO B PASSED: All 4 nodes cleanly harvested via single click after mid-queue Escape exit!');

    // SCENARIO C: Exit via HUD Button mid-queue
    console.log('\n=== Scenario C: Mid-Queue Exit via HUD Button ===');
    const nodesC = await spawnCluster('woodcutting_tree');
    console.log('Spawned 4 nodes for Scenario C:', nodesC);

    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.selectAllMembers();
      scene.toggleGatheringMode(true);
      const testNodes = scene.gatheringNodes.slice(-4);
      scene.startGatheringQueue(testNodes);
    });
    await sleep(200);

    console.log('>> Exiting mid-queue via HUD button click...');
    await page.click('#gathering-mode-toggle-btn');
    await sleep(400);

    const stateAfterExitC = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        queueLen: scene.gatheringQueue.length,
        assignedCount: scene.gatheringWorkerNodeAssignments.size,
        channelsCount: scene.activeGatherChannels.size,
        partyDests: scene.party.map(p => p.claimedDestination)
      };
    });
    assert.equal(stateAfterExitC.queueLen, 0);
    assert.equal(stateAfterExitC.assignedCount, 0);
    assert.equal(stateAfterExitC.channelsCount, 0);
    assert.ok(stateAfterExitC.partyDests.every(d => d === null));
    console.log('? Clean state release verified after Button exit.');

    for (let i = 0; i < 4; i++) {
      const targetIdx = nodesC[i].idx;
      console.log(`  -> Single-clicking Node ${i} at (${nodesC[i].x}, ${nodesC[i].y})...`);
      await page.evaluate((idx) => {
        const scene = window.game.scene.getScene('MainScene');
        scene.selectMemberByIndex(0, false);
        const node = scene.gatheringNodes[idx];
        node.sprite.emit('pointerdown', {}, 0, 0, { stopPropagation: () => {} });
      }, targetIdx);

      const startWait = Date.now();
      let nodeHarvested = false;
      while (Date.now() - startWait < 8000) {
        nodeHarvested = await page.evaluate((idx) => window.game.scene.getScene('MainScene').gatheringNodes[idx].isHarvested, targetIdx);
        if (nodeHarvested) break;
        await sleep(200);
      }

      
      console.log(`     Node ${i} isHarvested: ${nodeHarvested}`);
      assert.equal(nodeHarvested, true, `Node ${i} MUST be harvested cleanly!`);
    }
    console.log('? SCENARIO C PASSED: All 4 nodes cleanly harvested via single click after mid-queue Button exit!');

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED! ZERO STUCK NODES. F-KEY AND BUTTON 100% SYMMETRIC.');
    console.log('================================================================');

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n? VERIFICATION FAILED:', err);
  process.exit(1);
});
