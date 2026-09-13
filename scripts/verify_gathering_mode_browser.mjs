import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/d8effe0e-71eb-49f7-b7b7-d2ee7bd2d260';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Real-Browser Gathering Mode Verification ===');
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
        text.includes('[Move]')
      ) {
        console.log('  [BROWSER LOG]', text);
      }
    });

    console.log('Navigating to http://localhost:4174 ...');
    await page.goto('http://localhost:4174', { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // 1. Transition into Dungeon Scene
    console.log('\n--- 1. Transitioning to Dungeon Scene ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.scene.start('MainScene', { floor: 1 });
      }
    });
    await sleep(2500);

    // 2. Setup 4-Hero Party
    console.log('\n--- 2. Setting up 4-hero party ---');
    const setup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      if (!scene) return { success: false };
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      return {
        success: true,
        partyCount: scene.party.length,
        selectedCount: scene.selectedMembers.size
      };
    });
    assert.equal(setup.success, true);
    assert.equal(setup.partyCount, 4);
    assert.equal(setup.selectedCount, 4);
    console.log('✓ 4-member party spawned and full party selected by default');

    // --------------------------------------------------------------------------
    // PART A: Full-Party Gathering Mode Real Drag & Parallel Queue Execution
    // --------------------------------------------------------------------------
    console.log('\n--- PART A: Full-Party Gathering Mode Real Drag & Parallel Queue ---');

    // Spawn 4 nodes in a 2x2 cluster near the party
    const nodeCoords = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      const room = dungeon ? dungeon.rooms[0] : null;

      // Place 4 nodes in a 2x2 grid inside the room floor
      const minRx = room ? room.x + 1 : p.gridPos.x + 2;
      const minRy = room ? room.y + 1 : p.gridPos.y + 2;
      const maxRx = room ? room.x + room.width - 3 : p.gridPos.x + 4;
      const maxRy = room ? room.y + room.height - 3 : p.gridPos.y + 4;

      // Pick walkable tiles in room
      const coords = [];
      for (let y = minRy; y <= maxRy && coords.length < 4; y += 2) {
        for (let x = minRx; x <= maxRx && coords.length < 4; x += 2) {
          // ensure not on party pos
          const onParty = scene.party.some((m) => m.gridPos.x === x && m.gridPos.y === y);
          if (!onParty && scene.gridMatrix[y]?.[x] === 0) {
            const types = ['foraging_bush', 'woodcutting_tree', 'mining_rock', 'foraging_bush'];
            coords.push({ x, y, type: types[coords.length] });
          }
        }
      }

      const created = coords.map((c) => scene.spawnGatheringNode(c.x, c.y, c.type));

      const cam = scene.cameras.main;
      const canvas = scene.game.canvas;
      const rect = canvas.getBoundingClientRect();

      // In Phaser 3, converting a world coordinate (wx, wy) to canvas internal pointer coordinates:
      // pointer.x = (wx - cam.scrollX) * cam.zoom + (cam.width * 0.5 * (1 - cam.zoom))
      // Since cam origin is center (0.5, 0.5):
      // pointer.x = (wx - cam.worldView.x) * cam.zoom
      // pointer.y = (wy - cam.worldView.y) * cam.zoom
      // And in client window coordinates:
      // clientX = rect.left + pointer.x
      // clientY = rect.top + pointer.y

      let minScreenX = Infinity, minScreenY = Infinity;
      let maxScreenX = -Infinity, maxScreenY = -Infinity;

      const scaleX = rect.width / scene.scale.width;
      const scaleY = rect.height / scene.scale.height;

      for (const node of created) {
        const gameX = (node.sprite.x - cam.worldView.x) * cam.zoom;
        const gameY = (node.sprite.y - cam.worldView.y) * cam.zoom;
        const clientX = rect.left + gameX * scaleX;
        const clientY = rect.top + gameY * scaleY;
        if (clientX < minScreenX) minScreenX = clientX;
        if (clientX > maxScreenX) maxScreenX = clientX;
        if (clientY < minScreenY) minScreenY = clientY;
        if (clientY > maxScreenY) maxScreenY = clientY;
      }

      // Add generous margin around the cluster to ensure all nodes are enclosed
      const pad = 40;
      return {
        baseX: coords[0]?.x || 0,
        baseY: coords[0]?.y || 0,
        screenMin: { x: minScreenX - pad, y: minScreenY - pad },
        screenMax: { x: maxScreenX + pad, y: maxScreenY + pad },
        nodeCount: created.length
      };
    });

    console.log(`Spawned ${nodeCoords.nodeCount} gathering nodes at (${nodeCoords.baseX}, ${nodeCoords.baseY})`);
    console.log(`Calculated canvas drag box: (${Math.round(nodeCoords.screenMin.x)}, ${Math.round(nodeCoords.screenMin.y)}) to (${Math.round(nodeCoords.screenMax.x)}, ${Math.round(nodeCoords.screenMax.y)})`);

    // Press 'f' key to toggle Gathering Mode ON
    console.log('Pressing hotkey [F] to activate Gathering Mode...');
    await page.keyboard.press('KeyF');
    await sleep(400);

    const modeActive = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const banner = document.getElementById('gathering-mode-banner');
      return {
        isGatheringMode: scene.isGatheringMode,
        bannerVisible: banner ? banner.style.display !== 'none' : false,
        selectedCount: scene.selectedMembers.size
      };
    });
    assert.equal(modeActive.isGatheringMode, true, 'Gathering Mode must be active');
    assert.equal(modeActive.bannerVisible, true, 'Gathering Mode banner must be visible');
    assert.equal(modeActive.selectedCount, 4, 'Full party selection must remain 4');
    console.log('✓ Gathering Mode activated with visible banner');

    // Perform REAL click-and-drag across the canvas with mouse events
    console.log('Executing real canvas mouse drag (page.mouse.down -> move -> up)...');
    const dragStartX = Math.max(50, Math.min(1200, Math.round(nodeCoords.screenMin.x)));
    const dragStartY = Math.max(50, Math.min(650, Math.round(nodeCoords.screenMin.y)));
    const dragEndX = Math.max(50, Math.min(1200, Math.round(nodeCoords.screenMax.x)));
    const dragEndY = Math.max(50, Math.min(650, Math.round(nodeCoords.screenMax.y)));

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await sleep(100);

    // Intermediate move to capture marquee
    const midX = Math.round((dragStartX + dragEndX) / 2);
    const midY = Math.round((dragStartY + dragEndY) / 2);
    await page.mouse.move(midX, midY, { steps: 5 });
    await sleep(150);

    // Screenshot active marquee drag box
    await page.screenshot({ path: `${ARTIFACT_DIR}/m26_gathering_mode_marquee.png` });
    console.log(`✓ Screenshot captured: ${ARTIFACT_DIR}/m26_gathering_mode_marquee.png`);

    // Finish drag
    await page.mouse.move(dragEndX, dragEndY, { steps: 5 });
    await sleep(100);
    await page.mouse.up();
    await sleep(500);

    // Check queue and assignments
    const parallelState = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        isGatheringMode: scene.isGatheringMode,
        activeChannelsCount: scene.activeGatherChannels.size,
        assignedWorkersCount: scene.gatheringWorkerNodeAssignments.size,
        queueRemaining: scene.gatheringQueue.length,
        assignments: Array.from(scene.gatheringWorkerNodeAssignments.entries()).map(([w, n]) => ({
          worker: w.entityName,
          node: n.nodeDef.name
        }))
      };
    });

    console.log('Parallel queue state after marquee drag:', parallelState);
    assert.equal(parallelState.isGatheringMode, false, 'Gathering Mode toggles off upon confirmation');
    assert.ok(parallelState.assignedWorkersCount >= 2, 'Multiple party members must be assigned in parallel');
    console.log('✓ Multiple party members assigned to distinct nodes in parallel');

    // Wait for channels to begin and capture parallel gathering screenshot
    await sleep(1500);
    await page.screenshot({ path: `${ARTIFACT_DIR}/m26_parallel_gathering.png` });
    console.log(`✓ Screenshot captured: ${ARTIFACT_DIR}/m26_parallel_gathering.png`);

    // Poll until all queued nodes and assignments are complete (up to 10s)
    let completionState;
    for (let t = 0; t < 20; t++) {
      await sleep(500);
      completionState = await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        return {
          activeChannels: scene.activeGatherChannels.size,
          queueLength: scene.gatheringQueue.length,
          assignments: scene.gatheringWorkerNodeAssignments.size,
          partyStates: scene.party.map(m => ({ name: m.entityName, state: m.state, moving: m.isMoving() }))
        };
      });
      if (completionState.queueLength === 0 && completionState.assignments === 0) {
        break;
      }
    }
    console.log('Completion state:', completionState);
    assert.equal(completionState.queueLength, 0, 'Queue must be exhausted');
    assert.equal(completionState.assignments, 0, 'All assignments finished');
    assert.ok(completionState.partyStates.every(p => !p.moving), 'All party members must hold position and not be moving in formation');
    console.log('✓ PASS: Full party gathered nodes in parallel and held position upon queue completion!');

    // --------------------------------------------------------------------------
    // PART B: The Explicit Ordered Scenario — Select Subset -> Toggle F -> Drag
    // --------------------------------------------------------------------------
    console.log('\n--- PART B: The Explicit Ordered Scenario ---');
    console.log('Sequence: Select Valerie (#party-portrait-1) -> Assert size 1 -> Press F -> Assert size 1 -> Drag -> Confirm only Valerie gathers');

    // Spawn 2 new nodes
    const subsetNodeCoords = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const dungeon = window.__lastGeneratedDungeon;
      const room = dungeon ? dungeon.rooms[0] : null;

      // Find 2 open walkable tiles in room not occupied by party
      const freeTiles = [];
      const minRx = room ? room.x + 1 : 35;
      const minRy = room ? room.y + 1 : 19;
      const maxRx = room ? room.x + room.width - 2 : 40;
      const maxRy = room ? room.y + room.height - 2 : 27;

      for (let y = minRy; y <= maxRy && freeTiles.length < 2; y++) {
        for (let x = minRx; x <= maxRx && freeTiles.length < 2; x++) {
          const onParty = scene.party.some(m => Math.hypot(m.gridPos.x - x, m.gridPos.y - y) <= 1.5);
          const hasNode = scene.gatheringNodes.some(n => n.x === x && n.y === y);
          if (!onParty && !hasNode && scene.gridMatrix[y]?.[x] === 0) {
            freeTiles.push({ x, y });
          }
        }
      }

      const node1 = scene.spawnGatheringNode(freeTiles[0].x, freeTiles[0].y, 'foraging_bush');
      const node2 = scene.spawnGatheringNode(freeTiles[1].x, freeTiles[1].y, 'mining_rock');

      const cam = scene.cameras.main;
      const canvas = scene.game.canvas;
      const rect = canvas.getBoundingClientRect();

      let minScreenX = Infinity, minScreenY = Infinity;
      let maxScreenX = -Infinity, maxScreenY = -Infinity;

      const scaleX = rect.width / scene.scale.width;
      const scaleY = rect.height / scene.scale.height;

      for (const node of [node1, node2]) {
        const gameX = (node.sprite.x - cam.worldView.x) * cam.zoom;
        const gameY = (node.sprite.y - cam.worldView.y) * cam.zoom;
        const clientX = rect.left + gameX * scaleX;
        const clientY = rect.top + gameY * scaleY;
        if (clientX < minScreenX) minScreenX = clientX;
        if (clientX > maxScreenX) maxScreenX = clientX;
        if (clientY < minScreenY) minScreenY = clientY;
        if (clientY > maxScreenY) maxScreenY = clientY;
      }

      const pad = 40;
      return {
        screenMin: { x: minScreenX - pad, y: minScreenY - pad },
        screenMax: { x: maxScreenX + pad, y: maxScreenY + pad }
      };
    });

    // STEP 1: Click Valerie portrait (#party-portrait-1)
    console.log('Step 1: Clicking #party-portrait-1 (Valerie only)...');
    await page.click('#party-portrait-1');
    await sleep(400);

    // STEP 2: Assert checkpoint before F toggle
    const step2Check = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        selectedSize: scene.selectedMembers.size,
        valerieSelected: scene.selectedMembers.has(scene.party[1]),
        heroSelected: scene.selectedMembers.has(scene.party[0])
      };
    });
    assert.equal(step2Check.selectedSize, 1, 'Check 1: Only 1 member selected before F toggle');
    assert.equal(step2Check.valerieSelected, true, 'Check 1: Valerie is selected');
    assert.equal(step2Check.heroSelected, false, 'Check 1: Hero is NOT selected');
    console.log('✓ Step 2 Checkpoint PASSED: Only Valerie is selected before F toggle');

    // STEP 3: Press [F] to activate Gathering Mode
    console.log('Step 3: Pressing [F] to activate Gathering Mode...');
    await page.keyboard.press('KeyF');
    await sleep(400);

    // STEP 4: Assert checkpoint immediately after F toggle (proves toggle NEVER resets selection!)
    const step4Check = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        isGatheringMode: scene.isGatheringMode,
        selectedSize: scene.selectedMembers.size,
        valerieSelected: scene.selectedMembers.has(scene.party[1]),
        heroSelected: scene.selectedMembers.has(scene.party[0]),
        kaelenSelected: scene.selectedMembers.has(scene.party[2]),
        barrisSelected: scene.selectedMembers.has(scene.party[3])
      };
    });
    assert.equal(step4Check.isGatheringMode, true, 'Gathering Mode must be active');
    assert.equal(step4Check.selectedSize, 1, 'CRITICAL CHECK: Selection size MUST STILL BE 1 after F toggle');
    assert.equal(step4Check.valerieSelected, true, 'CRITICAL CHECK: Valerie MUST STILL BE selected');
    assert.equal(step4Check.heroSelected, false, 'CRITICAL CHECK: Hero must NOT be selected');
    assert.equal(step4Check.kaelenSelected, false, 'CRITICAL CHECK: Kaelen must NOT be selected');
    assert.equal(step4Check.barrisSelected, false, 'CRITICAL CHECK: Barris must NOT be selected');
    console.log('✓ Step 4 Checkpoint PASSED: Selection state strictly preserved as [Valerie] after F toggle (ZERO RESET)!');

    // Record initial positions of Hero, Kaelen, Barris before drag
    const initialPositions = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        hero: { x: scene.party[0].gridPos.x, y: scene.party[0].gridPos.y },
        kaelen: { x: scene.party[2].gridPos.x, y: scene.party[2].gridPos.y },
        barris: { x: scene.party[3].gridPos.x, y: scene.party[3].gridPos.y },
        valerie: { x: scene.party[1].gridPos.x, y: scene.party[1].gridPos.y }
      };
    });

    // STEP 5: Real mouse drag over the 2 new nodes
    console.log('Step 5: Executing real canvas mouse drag over nodes...');
    const sDragStartX = Math.max(50, Math.min(1200, Math.round(subsetNodeCoords.screenMin.x)));
    const sDragStartY = Math.max(50, Math.min(650, Math.round(subsetNodeCoords.screenMin.y)));
    const sDragEndX = Math.max(50, Math.min(1200, Math.round(subsetNodeCoords.screenMax.x)));
    const sDragEndY = Math.max(50, Math.min(650, Math.round(subsetNodeCoords.screenMax.y)));

    await page.mouse.move(sDragStartX, sDragStartY);
    await page.mouse.down();
    await page.mouse.move(sDragEndX, sDragEndY, { steps: 8 });
    await page.mouse.up();
    await sleep(500);

    // Assert queue workers contains ONLY Valerie
    const queueWorkers = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        workersCount: scene.gatheringQueueWorkers.size,
        valerieWorker: scene.gatheringQueueWorkers.has(scene.party[1]),
        heroWorker: scene.gatheringQueueWorkers.has(scene.party[0])
      };
    });
    assert.equal(queueWorkers.workersCount, 1, 'Queue workers must contain ONLY 1 worker');
    assert.equal(queueWorkers.valerieWorker, true, 'Queue worker must be Valerie');
    assert.equal(queueWorkers.heroWorker, false, 'Hero must NOT be in queue workers');

    // Wait for Valerie to reach and channel node 1
    await sleep(2000);
    await page.screenshot({ path: `${ARTIFACT_DIR}/m26_subset_gathering.png` });
    console.log(`✓ Screenshot captured: ${ARTIFACT_DIR}/m26_subset_gathering.png`);

    // Assert Valerie is gathering and unselected members STRICTLY remained stationary
    const motionCheck = await page.evaluate((initial) => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      return {
        valerieChanneling: scene.activeGatherChannels.has(valerie),
        heroStationary: hero.gridPos.x === initial.hero.x && hero.gridPos.y === initial.hero.y,
        kaelenStationary: kaelen.gridPos.x === initial.kaelen.x && kaelen.gridPos.y === initial.kaelen.y,
        barrisStationary: barris.gridPos.x === initial.barris.x && barris.gridPos.y === initial.barris.y,
        heroChanneling: scene.activeGatherChannels.has(hero),
        kaelenChanneling: scene.activeGatherChannels.has(kaelen),
        barrisChanneling: scene.activeGatherChannels.has(barris)
      };
    }, initialPositions);

    console.log('Motion check during subset gather:', motionCheck);
    assert.equal(motionCheck.valerieChanneling, true, 'Valerie must be actively channeling');
    assert.equal(motionCheck.heroStationary, true, 'Hero must remain strictly stationary');
    assert.equal(motionCheck.kaelenStationary, true, 'Kaelen must remain strictly stationary');
    assert.equal(motionCheck.barrisStationary, true, 'Barris must remain strictly stationary');
    assert.equal(motionCheck.heroChanneling, false, 'Hero must NOT be channeling');
    assert.equal(motionCheck.kaelenChanneling, false, 'Kaelen must NOT be channeling');
    assert.equal(motionCheck.barrisChanneling, false, 'Barris must NOT be channeling');

    console.log('✓ PASS: Explicit ordered sequence verified: Valerie alone gathers while Hero, Kaelen, Barris stay strictly stationary!');

    console.log('\n====================================================');
    console.log('ALL BROWSER GATHERING MODE VERIFICATIONS PASSED!');
    console.log('====================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
