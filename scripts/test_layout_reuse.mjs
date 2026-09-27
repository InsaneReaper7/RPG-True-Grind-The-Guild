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
  console.log('🧪 TESTING ISSUE 2: CURRENT DUNGEON LAYOUT REUSE BEHAVIOR');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  const entries = [];

  for (let visit = 1; visit <= 3; visit++) {
    console.log(`\n--- Portal Entry ${visit} ---`);
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.dungeon;
    }, { timeout: 10000 });
    await sleep(600);

    const layoutData = await page.evaluate((v) => {
      const main = window.game.scene.getScene('MainScene');
      const d = main.dungeon;
      return {
        visit: v,
        seed: d.seed,
        floorNumber: d.floorNumber,
        roomCount: d.rooms.length,
        portalPos: d.portalPos,
        crystalPos: d.crystalPos,
        rockNodes: (main.gatheringNodes || []).filter(n => n.typeId === 'mining_ore').map(n => ({ x: n.x, y: n.y })),
        first3Rooms: d.rooms.slice(0, 3).map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
      };
    }, visit);

    console.log(`Entry ${visit} Layout Data:`, JSON.stringify(layoutData));
    entries.push(layoutData);

    // Return to outpost
    await page.evaluate(() => {
      const main = window.game.scene.getScene('MainScene');
      main.executeTransitionToOutpost();
    });
    await page.waitForFunction(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      return outpost && outpost.scene.isActive();
    }, { timeout: 10000 });
    await sleep(600);
  }

  // Now enter again and test crystal Continue
  console.log('\n--- Testing Crystal Continue ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });
  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.dungeon;
  }, { timeout: 10000 });
  await sleep(600);

  const beforeContinue = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const d = main.dungeon;
    return {
      seed: d.seed,
      floorNumber: d.floorNumber,
      roomCount: d.rooms.length,
      crystalPos: d.crystalPos
    };
  });
  console.log('Before Continue:', JSON.stringify(beforeContinue));

  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.executeContinueDescent();
  });
  await sleep(1500);

  const afterContinue = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const d = main.dungeon;
    return {
      seed: d.seed,
      floorNumber: d.floorNumber,
      roomCount: d.rooms.length,
      crystalPos: d.crystalPos
    };
  });
  console.log('After Continue:', JSON.stringify(afterContinue));

  console.log('\n--- Summary of Findings ---');
  console.log('Entry 1 vs 2 seed match:', entries[0].seed === entries[1].seed);
  console.log('Entry 1 vs 3 seed match:', entries[0].seed === entries[2].seed);
  console.log('Continue seed match:', beforeContinue.seed === afterContinue.seed);

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
