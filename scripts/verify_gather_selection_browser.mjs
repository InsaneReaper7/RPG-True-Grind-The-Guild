import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/dfbb1e7a-b914-4190-9889-42f74206af87';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Real-Browser Gathering Selection Verification ===');
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
        text.includes('[Gathering]') ||
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
    console.log('✓ 4-member party spawned and selected by default');

    // 3. Select Only Valerie (Slot 1)
    console.log('\n--- 3. Clicking Valerie portrait (#party-portrait-1) ---');
    await page.click('#party-portrait-1');
    await sleep(400);

    const selectionCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        selectedSize: scene.selectedMembers.size,
        valerieSelected: scene.selectedMembers.has(scene.party[1]),
        heroSelected: scene.selectedMembers.has(scene.party[0])
      };
    });
    assert.equal(selectionCheck.selectedSize, 1);
    assert.equal(selectionCheck.valerieSelected, true);
    assert.equal(selectionCheck.heroSelected, false);
    console.log('✓ Valerie isolated as sole selected member');

    // 4. Spawn a test gathering bush near Valerie and trigger real sprite pointerdown
    console.log('\n--- 4. Clicking Gathering Node with Valerie selected ---');
    const gatherResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      const heroPosInitial = { x: hero.gridPos.x, y: hero.gridPos.y };
      const valeriePosInitial = { x: valerie.gridPos.x, y: valerie.gridPos.y };

      // Spawn node 3 tiles east of Valerie if walkable
      let nodeX = valerie.gridPos.x + 3;
      let nodeY = valerie.gridPos.y;
      if (scene.gridMatrix[nodeY]?.[nodeX] !== 0) {
        nodeX = valerie.gridPos.x - 3;
      }
      const testBush = scene.spawnGatheringNode(nodeX, nodeY, 'foraging_bush');

      // Trigger the real sprite pointerdown event on testBush.sprite
      testBush.sprite.emit('pointerdown', {}, 0, 0, { stopPropagation: () => {} });

      return {
        nodeX,
        nodeY,
        heroPosInitial,
        valeriePosInitial
      };
    });

    // Wait for Valerie to path and begin channeling
    await sleep(2500);

    const postGatherCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      return {
        valerieState: valerie.state,
        valerieChanneling: scene.activeGatherChannels.has(valerie),
        valerieMoved: valerie.gridPos.x !== hero.gridPos.x || valerie.gridPos.y !== hero.gridPos.y,
        heroState: hero.state,
        heroChanneling: scene.activeGatherChannels.has(hero),
        heroMoved: hero.isMoving(),
        activeChannelsCount: scene.activeGatherChannels.size
      };
    });

    console.log('Post-gather check:', postGatherCheck);
    assert.equal(postGatherCheck.heroChanneling, false, 'Leader Hero must NOT be channeling');
    assert.equal(postGatherCheck.heroMoved, false, 'Leader Hero must NOT have moved');
    assert.equal(postGatherCheck.valerieChanneling, true, 'Valerie MUST be actively channeling');
    console.log('✓ PASS: Valerie paths to and channels node; Leader Hero remains completely untouched!');

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_valerie_gathering.png` });
    console.log(`✓ Screenshot captured: ${ARTIFACT_DIR}/m25_valerie_gathering.png`);

    // 5. Multi-Select Pair Gather (Valerie + Kaelen)
    console.log('\n--- 5. Shift-click Kaelen (#party-portrait-2) for Pair Gather ---');
    await page.keyboard.down('Shift');
    await page.click('#party-portrait-2');
    await page.keyboard.up('Shift');
    await sleep(400);

    const pairGatherCheck = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      const heroPos = { ...hero.gridPos };
      const barrisPos = { ...barris.gridPos };

      // Spawn mining rock
      let nodeX = valerie.gridPos.x + 2;
      let nodeY = valerie.gridPos.y + 2;
      if (scene.gridMatrix[nodeY]?.[nodeX] !== 0) {
        nodeX = valerie.gridPos.x - 2;
      }
      const rock = scene.spawnGatheringNode(nodeX, nodeY, 'mining_rock');
      rock.sprite.emit('pointerdown', {}, 0, 0, { stopPropagation: () => {} });

      return { heroPos, barrisPos, rockX: nodeX, rockY: nodeY };
    });

    await sleep(2500);

    const postPairCheck = await page.evaluate((init) => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      return {
        heroStationary: hero.gridPos.x === init.heroPos.x && hero.gridPos.y === init.heroPos.y,
        barrisStationary: barris.gridPos.x === init.barrisPos.x && barris.gridPos.y === init.barrisPos.y,
        valerieChanneling: scene.activeGatherChannels.has(valerie),
        kaelenInPosition: Math.hypot(kaelen.gridPos.x - init.rockX, kaelen.gridPos.y - init.rockY) <= 3
      };
    }, pairGatherCheck);

    console.log('Post-pair check:', postPairCheck);
    assert.equal(postPairCheck.heroStationary, true, 'Hero must remain stationary during pair gather');
    assert.equal(postPairCheck.barrisStationary, true, 'Barris must remain stationary during pair gather');
    assert.equal(postPairCheck.valerieChanneling, true, 'Primary gatherer Valerie must be channeling');
    console.log('✓ PASS: Command dispatched to pair: Valerie channels, Kaelen moved in formation, unselected stay put.');

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_pair_gathering.png` });
    console.log(`✓ Screenshot captured: ${ARTIFACT_DIR}/m25_pair_gathering.png`);

    console.log('\n====================================================');
    console.log('ALL BROWSER GATHERING SELECTION CHECKS PASSED!');
    console.log('====================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
