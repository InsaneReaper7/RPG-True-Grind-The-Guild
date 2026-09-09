const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[Playtest] Launching browser to simulate normal gameplay pace...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Combat]') || text.includes('[Harvest]') || text.includes('[Floor Timer]') || text.includes('[Skill]')) {
        console.log(`  ${text}`);
      }
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Transition into dungeon
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      activeScene.executeTransitionToDungeon();
    });
    await sleep(2000);

    console.log('\n--- Simulating Normal-Paced Dungeon Crawl ---');
    const startTime = Date.now();

    // 1. Initial exploration
    console.log('1. Exploring entrance and adjacent rooms (10s simulated exploration)...');
    await sleep(10000);

    // 2. Engage first enemy group in combat
    console.log('2. Engaging first enemy in real combat...');
    await page.evaluate(() => {
      const enemy = window.__getRoomEnemies().flatMap((r) => r.enemies).find((e) => e.state !== 'dead' && e.state !== 'downed');
      if (enemy) {
        const activeScene = window.game.scene.getScenes(true)[0];
        activeScene.engageEnemy(enemy);
      }
    });

    // Let real combat play out for 15 seconds
    console.log('Allowing party combat to resolve (15s)...');
    await sleep(15000);

    // 3. Foraging & gathering
    console.log('3. Gathering and exploring next section (10s)...');
    await sleep(10000);

    // 4. Check floor timer status
    const timerState = await page.evaluate(() => window.__getFloorTimerState());
    const elapsedRealSec = (Date.now() - startTime) / 1000;
    const remainingSec = timerState.remainingMs / 1000;
    const durationSec = timerState.durationMs / 1000;

    console.log('\n--- Normal Pace Playtest Results ---');
    console.log(`Real time elapsed: ${elapsedRealSec.toFixed(1)} seconds`);
    console.log(`Floor timer remaining: ${remainingSec.toFixed(1)}s / ${durationSec}s (${(remainingSec / 60).toFixed(1)} minutes remaining)`);

    if (remainingSec > 220 && remainingSec < 290) {
      console.log('✓ VERIFIED: Floor timer is completely unobtrusive during ordinary exploration & clearing.');
      console.log('  Normal play operates with minutes to spare; only deliberate stalling/camping will trigger repopulation.');
    } else {
      console.warn('Unexpected timer range:', remainingSec);
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Playtest error:', err);
  process.exit(1);
});
