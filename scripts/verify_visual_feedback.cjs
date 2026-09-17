const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');

const BROWSER_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/993b9680-1e4e-413f-89a0-0bd0ab72f427';
const PORT = 4178;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(distDir) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
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
      console.log(`[Server] Serving dist on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING VISUAL FEEDBACK & GATHERING HIGHLIGHT VERIFICATION');
  console.log('================================================================\n');

  const distDir = path.resolve(__dirname, '..', 'dist');
  const server = await startServer(distDir);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Input]') ||
        text.includes('[Move]') ||
        text.includes('[Gathering') ||
        text.includes('FAIL')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`Navigating to http://localhost:${PORT} ...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // -------------------------------------------------------------------------
    // TEST 1: Move Destination Highlight in OutpostScene
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Outpost Scene Move Destination Highlight ---');
    const outpostResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('OutpostScene');
      if (!scene) return { success: false, error: 'OutpostScene not found' };

      // Spawn test companions in Outpost
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();

      // Click-to-move to an open tile, e.g. (11, 10)
      const targetX = 11;
      const targetY = 10;
      const worldX = targetX * scene.tileSize + scene.tileSize / 2;
      const worldY = targetY * scene.tileSize + scene.tileSize / 2;

      const cam = scene.cameras.main;
      const screenX = (worldX - cam.scrollX) * cam.zoom + cam.x;
      const screenY = (worldY - cam.scrollY) * cam.zoom + cam.y;

      scene.input.emit('pointerdown', {
        x: screenX,
        y: screenY,
        rightButtonDown: () => false
      });

      const highlights = scene.lastMoveDestinationHighlights || [];
      return {
        success: true,
        partyCount: scene.party.length,
        clickedTile: { x: targetX, y: targetY },
        highlights: highlights.map(h => ({ x: h.x, y: h.y }))
      };
    });

    console.log('Outpost Move Result:', outpostResult);
    assert.equal(outpostResult.success, true);
    assert.equal(outpostResult.partyCount, 4);
    assert.equal(outpostResult.highlights.length, 4, 'Should have 4 destination highlights for 4 party members');

    // Verify highlights are distinct formation tiles, NOT 4 duplicates of the clicked pixel
    const uniqueTiles = new Set(outpostResult.highlights.map(h => `${h.x},${h.y}`));
    assert.equal(uniqueTiles.size, 4, 'All 4 party destination highlights must be unique formation/fallback tiles');
    assert.equal(outpostResult.highlights[0].x, 11, 'Leader destination x');
    assert.equal(outpostResult.highlights[0].y, 10, 'Leader destination y');
    console.log('✓ PASS: Outpost move highlights 4 distinct computed formation destination tiles.');

    await sleep(400);
    const shotOutpost = path.join(ARTIFACT_DIR, 'visual_feedback_move_outpost.png');
    await page.screenshot({ path: shotOutpost });
    console.log(`✓ Screenshot captured: ${shotOutpost}`);

    // -------------------------------------------------------------------------
    // TEST 2: Move Destination Highlight in Dungeon (MainScene)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Dungeon Scene Move Destination Highlight ---');
    // Transition to Dungeon Scene
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.scene.start('MainScene', { floor: 1 });
      }
    });
    await sleep(2500);

    const dungeonMoveResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      if (!scene) return { success: false, error: 'MainScene not found' };

      // Ensure 4-hero party
      while (scene.party.length < 4) {
        scene.spawnTestCompanion();
      }
      scene.selectAllMembers();

      // Find an open walkable tile near party
      const p = scene.player.gridPos;
      let targetX = p.x + 3;
      let targetY = p.y + 3;
      for (let dy = 2; dy <= 6; dy++) {
        for (let dx = 2; dx <= 6; dx++) {
          const tx = p.x + dx;
          const ty = p.y + dy;
          if (scene.gridMatrix[ty]?.[tx] === 0) {
            targetX = tx;
            targetY = ty;
            break;
          }
        }
      }

      const worldX = targetX * scene.tileSize + scene.tileSize / 2;
      const worldY = targetY * scene.tileSize + scene.tileSize / 2;
      const cam = scene.cameras.main;
      const screenX = (worldX - cam.scrollX) * cam.zoom + cam.x;
      const screenY = (worldY - cam.scrollY) * cam.zoom + cam.y;

      scene.input.emit('pointerdown', {
        x: screenX,
        y: screenY
      });

      const highlights = scene.lastMoveDestinationHighlights || [];
      return {
        success: true,
        partyCount: scene.party.length,
        selectedCount: scene.getSelectedMembers().length,
        clickedTile: { x: targetX, y: targetY },
        highlights: highlights.map(h => ({ x: h.x, y: h.y }))
      };
    });

    console.log('Dungeon Move Result:', dungeonMoveResult);
    assert.equal(dungeonMoveResult.success, true);
    assert.equal(dungeonMoveResult.partyCount, 4);
    assert.equal(dungeonMoveResult.selectedCount, 4);
    assert.equal(dungeonMoveResult.highlights.length, 4, 'Should have 4 destination highlights in dungeon');

    const uniqueDungeonTiles = new Set(dungeonMoveResult.highlights.map(h => `${h.x},${h.y}`));
    assert.equal(uniqueDungeonTiles.size, 4, 'All 4 dungeon destinations must be distinct computed tiles (not 4 duplicate clicked pixels)');
    console.log('✓ PASS: Dungeon move shows 4 distinct computed destination tile highlights matching leader and formation.');

    await sleep(300);
    const shotDungeon = path.join(ARTIFACT_DIR, 'visual_feedback_move_dungeon.png');
    await page.screenshot({ path: shotDungeon });
    console.log(`✓ Screenshot captured: ${shotDungeon}`);

    // -------------------------------------------------------------------------
    // TEST 3: Gathering Mode Live Node Selection Highlight During Drag
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Gathering Mode Live Node Selection Highlight During Drag ---');
    const gatherResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      if (!scene) return { success: false, error: 'MainScene not found' };

      // Activate Gathering Mode
      scene.toggleGatheringMode(true);

      const nodes = scene.gatheringNodes.filter(n => !n.isHarvested);
      if (nodes.length < 2) {
        return { success: false, error: `Too few nodes on floor: ${nodes.length}` };
      }

      // Choose a bounding box that encloses at least 2 nodes
      const targetNodes = nodes.slice(0, 3);
      const minTileX = Math.min(...targetNodes.map(n => n.x));
      const maxTileX = Math.max(...targetNodes.map(n => n.x));
      const minTileY = Math.min(...targetNodes.map(n => n.y));
      const maxTileY = Math.max(...targetNodes.map(n => n.y));

      // Center camera on nodes so the drag marquee and highlighted nodes are visible on screen
      scene.cameras.main.stopFollow();
      const centerX = ((minTileX + maxTileX) / 2) * scene.tileSize;
      const centerY = ((minTileY + maxTileY) / 2) * scene.tileSize;
      scene.cameras.main.centerOn(centerX, centerY);

      const dragStartWorld = {
        x: (minTileX - 1) * scene.tileSize,
        y: (minTileY - 1) * scene.tileSize
      };
      const dragEndWorld = {
        x: (maxTileX + 2) * scene.tileSize,
        y: (maxTileY + 2) * scene.tileSize
      };

      const cam = scene.cameras.main;
      const pStart = {
        x: (dragStartWorld.x - cam.scrollX) * cam.zoom + cam.x,
        y: (dragStartWorld.y - cam.scrollY) * cam.zoom + cam.y
      };
      const pEnd = {
        x: (dragEndWorld.x - cam.scrollX) * cam.zoom + cam.x,
        y: (dragEndWorld.y - cam.scrollY) * cam.zoom + cam.y
      };

      // 1. Pointer Down
      scene.input.emit('pointerdown', { x: pStart.x, y: pStart.y });

      // 2. Pointer Move (halfway)
      const pHalf = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
      scene.input.emit('pointermove', { x: pHalf.x, y: pHalf.y });
      const midHighlights = scene.currentGatherSelectionHighlights.map(n => ({
        id: n.nodeDef.id,
        name: n.nodeDef.name,
        pos: { x: n.x, y: n.y }
      }));

      // 3. Pointer Move (full area covering all target nodes)
      scene.input.emit('pointermove', { x: pEnd.x, y: pEnd.y });
      const fullHighlights = scene.currentGatherSelectionHighlights.map(n => ({
        id: n.nodeDef.id,
        name: n.nodeDef.name,
        pos: { x: n.x, y: n.y }
      }));

      return {
        success: true,
        isGatheringMode: scene.isGatheringMode,
        targetNodesCount: targetNodes.length,
        midHighlightsCount: midHighlights.length,
        fullHighlightsCount: fullHighlights.length,
        fullHighlights,
        pEnd
      };
    });

    console.log('Gathering Drag Result:', gatherResult);
    assert.equal(gatherResult.success, true);
    assert.equal(gatherResult.isGatheringMode, true);
    assert.ok(gatherResult.fullHighlightsCount >= 2, `Expected at least 2 nodes highlighted, got ${gatherResult.fullHighlightsCount}`);
    console.log(`✓ PASS: Marquee drag live-highlighted ${gatherResult.fullHighlightsCount} nodes dynamically!`);

    await sleep(300);
    const shotGather = path.join(ARTIFACT_DIR, 'visual_feedback_gathering_drag_highlight.png');
    await page.screenshot({ path: shotGather });
    console.log(`✓ Screenshot captured: ${shotGather}`);

    // 4. Pointer Up (commit queue)
    const commitResult = await page.evaluate((pEnd) => {
      const scene = window.game.scene.getScene('MainScene');
      scene.input.emit('pointerup', { x: pEnd.x, y: pEnd.y });

      return {
        queueCount: scene.gatheringQueue.length,
        highlightCountAfterUp: scene.currentGatherSelectionHighlights.length,
        activeAssignments: scene.gatheringWorkerNodeAssignments.size
      };
    }, gatherResult.pEnd);

    console.log('Gathering Commit Result:', commitResult);
    assert.equal(commitResult.highlightCountAfterUp, 0, 'Selection highlights must clear after pointerup');
    assert.ok(commitResult.queueCount > 0 || commitResult.activeAssignments > 0, 'Nodes must be successfully queued / assigned');
    console.log('✓ PASS: Drag release queued nodes and cleanly cleared selection highlights.');

    // -------------------------------------------------------------------------
    // TEST 4: Performance Sanity Check on getGatheringNodesInSelection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Performance Sanity Check on getGatheringNodesInSelection ---');
    const perfReport = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');

      // 1. Benchmark on real dungeon floor node set
      const realNodeCount = scene.gatheringNodes.length;
      const iterations = 10000;

      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        scene.getGatheringNodesInSelection(100, 500, 100, 500);
      }
      const t1 = performance.now();
      const avgMsReal = (t1 - t0) / iterations;

      // 2. Synthetic Stress Benchmark with 1,000 Nodes across 50x50 map
      const originalNodes = scene.gatheringNodes;
      const syntheticNodes = [];
      for (let i = 0; i < 1000; i++) {
        syntheticNodes.push({
          x: Math.floor(Math.random() * 50),
          y: Math.floor(Math.random() * 50),
          nodeDef: { id: `node_${i}`, name: `Node ${i}` },
          isHarvested: i % 10 === 0
        });
      }
      scene.gatheringNodes = syntheticNodes;

      const stressIterations = 2000;
      const t2 = performance.now();
      for (let i = 0; i < stressIterations; i++) {
        // Drag rect covering ~20% of map
        scene.getGatheringNodesInSelection(300, 900, 300, 900);
      }
      const t3 = performance.now();
      const avgMsStress = (t3 - t2) / stressIterations;

      // Restore original nodes
      scene.gatheringNodes = originalNodes;

      return {
        realNodeCount,
        realIterations: iterations,
        avgMsReal,
        stressNodeCount: 1000,
        stressIterations,
        avgMsStress
      };
    });

    console.log('Performance Benchmark Report:');
    console.log(`  - Real floor (${perfReport.realNodeCount} nodes): ${perfReport.avgMsReal.toFixed(5)} ms / pointermove call`);
    console.log(`  - Stress test (1,000 nodes): ${perfReport.avgMsStress.toFixed(5)} ms / pointermove call`);
    console.log(`  - Frame budget (60 FPS): 16.666 ms`);
    console.log(`  - Stress cost is ${(perfReport.avgMsStress / 16.666 * 100).toFixed(3)}% of single frame budget`);

    assert.ok(perfReport.avgMsReal < 0.05, 'Real node scan must execute in < 0.05ms');
    assert.ok(perfReport.avgMsStress < 0.25, '1,000 node stress scan must execute in < 0.25ms');
    console.log('✓ PASS: getGatheringNodesInSelection performance sanity check passed with massive safety margin!');

    console.log('\n================================================================');
    console.log('ALL VISUAL FEEDBACK VERIFICATIONS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
