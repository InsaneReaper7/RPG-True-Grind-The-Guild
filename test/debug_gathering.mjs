import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', msg => console.log('  [BROWSER]', msg.text()));

    console.log('Connecting to live game...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Transition to Dungeon
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.player;
    }, { timeout: 10000 });
    await sleep(1000);

    // Pick 2 nodes and start queue
    const startInfo = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const worker = scene.player;
      worker.addItem('stone', 100);

      const sorted = scene.gatheringNodes
        .filter(n => !n.isHarvested)
        .sort((a, b) => Math.hypot(a.x - worker.gridPos.x, a.y - worker.gridPos.y) - Math.hypot(b.x - worker.gridPos.x, b.y - worker.gridPos.y));

      const n1 = sorted[0];
      const n2 = sorted[1];
      scene.startGatheringQueue([n1, n2]);

      return {
        workerPos: { ...worker.gridPos },
        workerState: worker.state,
        workerSpeed: worker.moveSpeed,
        isEncumbered: worker.isEncumbered,
        n1: { name: n1.nodeDef.name, x: n1.x, y: n1.y },
        n2: { name: n2.nodeDef.name, x: n2.x, y: n2.y },
        queueLen: scene.gatheringQueue.length,
        hasTimer: scene.gatheringArrivalTimers.has(worker),
        hasAssignment: scene.gatheringWorkerNodeAssignments.has(worker)
      };
    });
    console.log('Start Info:', startInfo);

    // Poll for 30 seconds every 1 second
    for (let sec = 1; sec <= 30; sec++) {
      await sleep(1000);
      const state = await page.evaluate((info) => {
        const scene = window.game.scene.getScene('MainScene');
        const worker = scene.player;
        const channel = scene.activeGatherChannels.get(worker);
        return {
          workerPos: { x: worker.gridPos.x, y: worker.gridPos.y, worldX: Math.round(worker.x), worldY: Math.round(worker.y) },
          workerState: worker.state,
          isMoving: worker.isMoving(),
          pathLen: worker.path?.length,
          hasTimer: scene.gatheringArrivalTimers.has(worker),
          hasAssignment: scene.gatheringWorkerNodeAssignments.has(worker),
          assignedNode: scene.gatheringWorkerNodeAssignments.get(worker)?.nodeDef?.name,
          channel: channel ? { node: channel.node.nodeDef.name, elapsed: channel.elapsedMs, duration: channel.durationMs } : null,
          node1Harvested: scene.gatheringNodes.find(n => n.x === info.n1.x && n.y === info.n1.y)?.isHarvested,
          node2Harvested: scene.gatheringNodes.find(n => n.x === info.n2.x && n.y === info.n2.y)?.isHarvested,
          queueLen: scene.gatheringQueue.length
        };
      }, startInfo);
      console.log(`[t=${sec}s]`, JSON.stringify(state));
      if (state.node1Harvested && state.node2Harvested) {
        console.log('BOTH HARVESTED SUCCESS!');
        break;
      }
    }
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
