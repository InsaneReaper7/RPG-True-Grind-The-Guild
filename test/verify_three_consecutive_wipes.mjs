import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('================================================================');
  console.log('🧪 VERIFYING THREE CONSECUTIVE PARTY WIPES IN ONE SESSION');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Party Wipe') || text.includes('[OutpostScene]') || text.includes('Transitioning')) {
      console.log('  [BROWSER]', text);
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  for (let wipeNum = 1; wipeNum <= 3; wipeNum++) {
    console.log(`\n--- Cycle ${wipeNum}: Entering Dungeon -> Taking Lethal Damage -> Wiping ---`);

    // Enter Dungeon
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.party && main.party.length > 0;
    }, { timeout: 10000 });
    await sleep(800);

    const dungeonEntryState = await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      return {
        isWiping: main.isWiping,
        isTransitioning: main.isTransitioning,
        floorTimerRemainingMs: main.floorTimerRemainingMs,
        party: main.party.map(p => ({ name: p.entityName, hp: p.hp, state: p.state }))
      };
    });
    console.log(`Dungeon Entry State (Cycle ${wipeNum}):`, dungeonEntryState);

    if (dungeonEntryState.isWiping !== false) {
      throw new Error(`isWiping must be false on dungeon entry, got ${dungeonEntryState.isWiping}`);
    }

    // Party takes lethal damage
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      for (const member of main.party) {
        member.takeDamage(9999);
      }
    });

    // Wait for transition back to OutpostScene
    let returnedToOutpost = false;
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const activeScenes = await page.evaluate(() => {
        return window.game.scene.getScenes(true).map(s => s.scene.key);
      });
      if (activeScenes.includes('OutpostScene')) {
        returnedToOutpost = true;
        break;
      }
    }

    console.log(`Wipe ${wipeNum} Successfully Returned to Outpost: ${returnedToOutpost}`);
    if (!returnedToOutpost) {
      throw new Error(`Cycle ${wipeNum} failed to return to OutpostScene after wipe!`);
    }

    const outpostState = await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      return {
        isTransitioning: outpost.isTransitioning,
        isBuildMode: outpost.isBuildMode,
        party: outpost.party.map(p => ({ name: p.entityName, hp: p.hp, state: p.state }))
      };
    });
    console.log(`Outpost Safe Zone Recovery (Cycle ${wipeNum}):`, outpostState);
    await sleep(600);
  }

  console.log('\n================================================================');
  console.log('✅ ALL 3 CONSECUTIVE WIPES SUCCEEDED AND RETURNED TO OUTPOST!');
  console.log('================================================================\n');

  await browser.close();
}

run().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
