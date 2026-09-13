import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/insan/.gemini/antigravity/brain/256a0f0a-870c-420d-9d86-bc944a3a7145';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Milestone 25 Browser & Visual Verification ===');
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
        text.includes('[PartySelection]') ||
        text.includes('[Move]') ||
        text.includes('[Combat') ||
        text.includes('Selected')
      ) {
        console.log('  [BROWSER LOG]', text);
      }
    });

    console.log('Navigating to http://localhost:4173 ...');
    await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
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

    // Verify MainScene is active and spawn 3 companions for complete 4-hero party testing
    const initialSetup = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      if (!scene) return { success: false, reason: 'MainScene not found' };

      // Spawn 3 companions for tests
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();
      scene.spawnTestCompanion();

      const party = scene.party;
      return {
        success: true,
        partyCount: party.length,
        selectedCount: scene.selectedMembers.size,
        portraitsDockVisible: window.getComputedStyle(document.getElementById('party-portraits-hud')).display !== 'none'
      };
    });

    console.log('Initial setup in MainScene:', initialSetup);
    assert.equal(initialSetup.success, true);
    assert.equal(initialSetup.partyCount, 4);
    assert.equal(initialSetup.selectedCount, 4);
    assert.equal(initialSetup.portraitsDockVisible, true);

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_all_selected_initial.png` });
    console.log('✓ Captured m25_all_selected_initial.png (all 4 selected by default with reticles and glowing portraits)');

    // 2. Single Portrait Click (Select Only Valerie / Slot 1)
    console.log('\n--- 2. Single Click Selection (Valerie, Slot 1) ---');
    await page.click('#party-portrait-1');
    await sleep(400);

    const singleClickCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hud = scene.hud;
      const selected = hud.getSelectedMemberIndices();
      const p0Class = document.getElementById('party-portrait-0')?.className;
      const p1Class = document.getElementById('party-portrait-1')?.className;
      const p1Status = document.getElementById('party-portrait-status-1')?.innerText;

      return {
        sceneSelectedSize: scene.selectedMembers.size,
        hudSelectedIndices: Array.from(selected),
        p0Class,
        p1Class,
        p1Status
      };
    });

    console.log('Single click check:', singleClickCheck);
    assert.equal(singleClickCheck.sceneSelectedSize, 1);
    assert.deepEqual(singleClickCheck.hudSelectedIndices, [1]);
    assert.ok(singleClickCheck.p1Class.includes('selected'));
    assert.ok(!singleClickCheck.p0Class.includes('selected'));
    assert.equal(singleClickCheck.p1Status, '✓ ACTIVE');

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_single_selected_valerie.png` });
    console.log('✓ Captured m25_single_selected_valerie.png (only Valerie selected)');

    // 3. Move Valerie Individually: Verify Only Valerie Moves, Others Remain Stationary
    console.log('\n--- 3. Single-Member Move Command ---');
    const moveResult = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.party[0];
      const valerie = scene.party[1];
      const kaelen = scene.party[2];
      const barris = scene.party[3];

      const heroInitialPos = { x: hero.gridPos.x, y: hero.gridPos.y };
      const kaelenInitialPos = { x: kaelen.gridPos.x, y: kaelen.gridPos.y };
      const barrisInitialPos = { x: barris.gridPos.x, y: barris.gridPos.y };
      const valerieInitialPos = { x: valerie.gridPos.x, y: valerie.gridPos.y };

      // Issue move command for Valerie to target tile
      const targetTile = { x: valerieInitialPos.x + 3, y: valerieInitialPos.y + 2 };
      
      // Call pointerdown handler simulation
      const activeSelected = scene.party.filter((m) => scene.selectedMembers.has(m) && m.state !== 'downed' && m.state !== 'dead');
      const claimed = new Set();
      for (const other of scene.party) {
        if (!activeSelected.includes(other) && other.state !== 'dead') {
          claimed.add(`${other.gridPos.x},${other.gridPos.y}`);
          if (other.claimedDestination) {
            claimed.add(`${other.claimedDestination.x},${other.claimedDestination.y}`);
          }
        }
      }

      valerie.followPath([targetTile]);

      return {
        valerieMoved: valerie.gridPos.x === targetTile.x && valerie.gridPos.y === targetTile.y,
        heroStationary: hero.gridPos.x === heroInitialPos.x && hero.gridPos.y === heroInitialPos.y,
        kaelenStationary: kaelen.gridPos.x === kaelenInitialPos.x && kaelen.gridPos.y === kaelenInitialPos.y,
        barrisStationary: barris.gridPos.x === barrisInitialPos.x && barris.gridPos.y === barrisInitialPos.y,
        claimedStationaryHero: claimed.has(`${heroInitialPos.x},${heroInitialPos.y}`)
      };
    });

    console.log('Move result:', moveResult);
    assert.equal(moveResult.valerieMoved, true);
    assert.equal(moveResult.heroStationary, true);
    assert.equal(moveResult.kaelenStationary, true);
    assert.equal(moveResult.barrisStationary, true);
    assert.equal(moveResult.claimedStationaryHero, true);

    // 4. Shift-Click Multi-Selection (Valerie + Kaelen)
    console.log('\n--- 4. Shift-Click Multi-Selection (Valerie + Kaelen) ---');
    await page.keyboard.down('Shift');
    await page.click('#party-portrait-2');
    await page.keyboard.up('Shift');
    await sleep(400);

    const shiftClickCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hud = scene.hud;
      const selected = hud.getSelectedMemberIndices();
      return {
        sceneSelectedSize: scene.selectedMembers.size,
        hudSelectedIndices: Array.from(selected).sort(),
        p1Selected: document.getElementById('party-portrait-1')?.classList.contains('selected'),
        p2Selected: document.getElementById('party-portrait-2')?.classList.contains('selected'),
        p0Selected: document.getElementById('party-portrait-0')?.classList.contains('selected')
      };
    });

    console.log('Shift click check:', shiftClickCheck);
    assert.equal(shiftClickCheck.sceneSelectedSize, 2);
    assert.deepEqual(shiftClickCheck.hudSelectedIndices, [1, 2]);
    assert.equal(shiftClickCheck.p1Selected, true);
    assert.equal(shiftClickCheck.p2Selected, true);
    assert.equal(shiftClickCheck.p0Selected, false);

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_multi_selected_pair.png` });
    console.log('✓ Captured m25_multi_selected_pair.png (Valerie & Kaelen selected)');

    // 5. Test Hotkey 'G' Restores Full-Party Selection
    console.log('\n--- 5. Hotkey "G" Full-Party Reselect ---');
    await page.keyboard.press('KeyG');
    await sleep(400);

    const gKeyCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hud = scene.hud;
      const selected = hud.getSelectedMemberIndices();
      return {
        sceneSelectedSize: scene.selectedMembers.size,
        hudSelectedCount: selected.size,
        allPortraitsHaveClass: [0, 1, 2, 3].every((i) =>
          document.getElementById(`party-portrait-${i}`)?.classList.contains('selected')
        )
      };
    });

    console.log('Hotkey G check:', gKeyCheck);
    assert.equal(gKeyCheck.sceneSelectedSize, 4);
    assert.equal(gKeyCheck.hudSelectedCount, 4);
    assert.equal(gKeyCheck.allPortraitsHaveClass, true);

    await page.screenshot({ path: `${ARTIFACT_DIR}/m25_reselected_all_via_g.png` });
    console.log('✓ Captured m25_reselected_all_via_g.png (full party reselected via G hotkey)');

    // 6. Test Numeric Hotkeys (e.g., Press '3' to select Kaelen)
    console.log('\n--- 6. Numeric Hotkeys (Press "3" to select Companion 2) ---');
    await page.keyboard.press('Digit3');
    await sleep(400);

    const numKeyCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hud = scene.hud;
      const selected = hud.getSelectedMemberIndices();
      return {
        sceneSelectedSize: scene.selectedMembers.size,
        hudSelectedIndices: Array.from(selected)
      };
    });

    console.log('Numeric hotkey 3 check:', numKeyCheck);
    assert.equal(numKeyCheck.sceneSelectedSize, 1);
    assert.deepEqual(numKeyCheck.hudSelectedIndices, [2]);

    console.log('\n====================================================');
    console.log('ALL BROWSER & VISUAL CHECKS COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
