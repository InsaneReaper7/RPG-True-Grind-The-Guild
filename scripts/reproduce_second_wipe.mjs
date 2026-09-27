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
  console.log('🧪 REPRODUCING ISSUE 1: SECOND-WIPE SOFTLOCK');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('Party Wipe') || text.includes('downed') || text.includes('Downed') || text.includes('Outpost') || text.includes('isWiping') || text.includes('handlePartyWipe')) {
      console.log('  [BROWSER LOG]', text);
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // 1. Enter Dungeon Floor 1 from Outpost
  console.log('\n--- Step 1: Entering Dungeon from Outpost (First Visit) ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length > 0;
  }, { timeout: 10000 });
  await sleep(1000);

  // Check state on entry
  const firstEntryState = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    return {
      isWiping: main.isWiping,
      isTransitioning: main.isTransitioning,
      partyCount: main.party.length,
      partyStates: main.party.map(p => ({ name: p.entityName, hp: p.hp, state: p.state }))
    };
  });
  console.log('First Dungeon Entry State:', firstEntryState);

  // 2. Down all party members (Wipe 1) through combat damage
  console.log('\n--- Step 2: Party takes lethal damage in combat (Wipe 1) ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    for (const member of main.party) {
      member.takeDamage(9999);
    }
  });

  console.log('Waiting for MainScene.update() to trigger handlePartyWipe()...');
  // Wait up to 3 seconds for transition back to Outpost
  let transitionedToOutpost1 = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    const activeScene = await page.evaluate(() => {
      const active = window.game.scene.getScenes(true);
      return active.map(s => s.scene.key);
    });
    if (activeScene.includes('OutpostScene')) {
      transitionedToOutpost1 = true;
      break;
    }
  }

  console.log(`Transitioned to OutpostScene on Wipe 1: ${transitionedToOutpost1}`);
  if (!transitionedToOutpost1) {
    throw new Error('Failed to transition to Outpost on Wipe 1');
  }

  await sleep(1000);

  // 3. Re-enter Dungeon from Outpost (Second Visit)
  console.log('\n--- Step 3: Re-entering Dungeon from Outpost (Second Visit) ---');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });

  await page.waitForFunction(() => {
    const main = window.game.scene.getScene('MainScene');
    return main && main.scene.isActive() && main.party && main.party.length > 0;
  }, { timeout: 10000 });
  await sleep(1000);

  // Check state on second entry!
  const secondEntryState = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    return {
      isWiping: main.isWiping,
      isTransitioning: main.isTransitioning,
      partyCount: main.party.length,
      partyStates: main.party.map(p => ({ name: p.entityName, hp: p.hp, state: p.state }))
    };
  });
  console.log('Second Dungeon Entry State:', secondEntryState);

  // 4. Down all party members (Wipe 2)
  console.log('\n--- Step 4: Party takes lethal damage again (Wipe 2) ---');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    for (const member of main.party) {
      member.takeDamage(9999);
    }
  });

  console.log('Waiting to see if Wipe 2 triggers or softlocks...');
  let transitionedToOutpost2 = false;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const activeScene = await page.evaluate(() => {
      const active = window.game.scene.getScenes(true);
      return active.map(s => s.scene.key);
    });
    if (activeScene.includes('OutpostScene')) {
      transitionedToOutpost2 = true;
      break;
    }
  }

  const postWipe2State = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const active = window.game.scene.getScenes(true).map(s => s.scene.key);
    return {
      activeScenes: active,
      isWiping: main ? main.isWiping : null,
      partyStates: main ? main.party.map(p => ({ name: p.entityName, hp: p.hp, state: p.state })) : null
    };
  });

  console.log('Post-Wipe 2 State:', postWipe2State);
  console.log(`Transitioned to OutpostScene on Wipe 2: ${transitionedToOutpost2}`);

  if (!transitionedToOutpost2 && secondEntryState.isWiping === true) {
    console.log('\n🚨 BUG REPRODUCED CONFIRMED: Second wipe never triggers because isWiping remained true!');
    console.log('The party lies Downed on the floor with no way back (SOFT-LOCK).');
  } else {
    console.log(`Result: transitioned=${transitionedToOutpost2}`);
  }

  await browser.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
