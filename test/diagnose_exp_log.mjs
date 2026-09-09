import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('1. Loading http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  const initialDiag = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const PS = outpost.progressionSystem.constructor;
    return {
      listenerCount: PS.expListeners ? PS.expListeners.length : 'unknown',
      expLogLength: PS.getExpLog().length,
      domLogEntryCount: document.getElementById('debug-exp-log-list')?.children.length ?? 0
    };
  });
  console.log('Initial Outpost Diagnostics:', initialDiag);

  console.log('\n2. Transitioning to Dungeon (MainScene)...');
  await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    outpost.executeTransitionToDungeon();
  });
  await new Promise(r => setTimeout(r, 2000));

  const dungeonDiag = await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    const PS = main.progressionSystem.constructor;
    return {
      listenerCount: PS.expListeners ? PS.expListeners.length : 'unknown',
      expLogLength: PS.getExpLog().length,
      domLogEntryCount: document.getElementById('debug-exp-log-list')?.children.length ?? 0
    };
  });
  console.log('Dungeon Diagnostics:', dungeonDiag);

  console.log('\n3. Transitioning back to Outpost (OutpostScene)...');
  await page.evaluate(() => {
    const main = window.game.scene.getScene('MainScene');
    main.executeTransitionToOutpost();
  });
  await new Promise(r => setTimeout(r, 2000));

  const outpost2Diag = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const PS = outpost.progressionSystem.constructor;
    return {
      listenerCount: PS.expListeners ? PS.expListeners.length : 'unknown',
      expLogLength: PS.getExpLog().length,
      domLogEntryCount: document.getElementById('debug-exp-log-list')?.children.length ?? 0
    };
  });
  console.log('Outpost 2 Diagnostics:', outpost2Diag);

  console.log('\n4. Simulating single +1 EXP grant to health_regen on Hero...');
  const grantDiag = await page.evaluate(() => {
    const outpost = window.game.scene.getScene('OutpostScene');
    const hero = outpost.player;
    const PS = outpost.progressionSystem.constructor;

    const logBefore = PS.getExpLog().length;
    const domCountBefore = document.getElementById('debug-exp-log-list')?.children.length ?? 0;
    const statBefore = hero.progression.getProficiencyStat('health_regen');

    // Grant exactly +1 EXP
    hero.progression.addProficiencyExp('health_regen', 1);

    const statAfter = hero.progression.getProficiencyStat('health_regen');
    const logAfter = PS.getExpLog().length;
    const domCountAfter = document.getElementById('debug-exp-log-list')?.children.length ?? 0;

    // Read DOM entries added
    const domList = document.getElementById('debug-exp-log-list');
    const entries = Array.from(domList?.children || []).map(c => c.textContent.trim());

    // Update debug panel and check display
    outpost.hud.setDebugSkillsPanelVisible(true);
    outpost.hud.update(hero, hero.progression, 0, outpost.party);

    const statsListText = document.getElementById('debug-skills-list')?.innerText ?? '';

    return {
      statBeforeCurrentExp: statBefore.currentExp,
      statAfterCurrentExp: statAfter.currentExp,
      expLogDelta: logAfter - logBefore,
      domCountDelta: domCountAfter - domCountBefore,
      domEntries: entries.slice(-5),
      statsListTextSnippet: statsListText.split('\n').filter(l => l.includes('health_regen'))
    };
  });
  console.log('Grant Diagnostics:', grantDiag);

  await browser.close();
}

run().catch(console.error);
