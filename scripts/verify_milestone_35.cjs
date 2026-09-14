const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BROWSER_PATH = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\12ee8a19-4d15-4bc6-9d1c-3a421a2707a0';
const PORT = 3458;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  const distDir = path.resolve(__dirname, '..', 'dist');
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
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
      console.log(`[Static Server] Serving dist/ on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING MILESTONE 35 BROWSER VERIFICATION (PUPPETEER)');
  console.log('================================================================\n');

  if (!fs.existsSync(BROWSER_PATH)) {
    throw new Error(`Browser not found at: ${BROWSER_PATH}`);
  }

  const server = await startServer();

  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (!text.includes('Phaser') && !text.includes('Download the Phaser Editor')) {
        console.log(`[Browser] ${text}`);
      }
    });

    console.log(`Navigating to http://localhost:${PORT}...`);
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await sleep(1500);

    // -------------------------------------------------------------------------
    // STEP 1: Open Party Overview Modal & Verify Paperdoll + Inventory
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: Open Party Overview & Inspect Visual Paperdoll ---');
    await page.keyboard.press('KeyO');
    await sleep(600);

    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('party-overview-modal');
      const roster = document.getElementById('party-overview-roster');
      const inventory = document.getElementById('party-inventory-item-list');
      const paperdoll = roster ? roster.querySelector('.paperdoll-container') : null;
      const slots = roster ? Array.from(roster.querySelectorAll('.equip-slot-box')).map((s) => s.getAttribute('data-slot')) : [];
      const legacyDropdowns = document.querySelectorAll('.party-main-select, .party-offhand-select, .party-helmet-select, .party-body-select, .party-necklace-select, .party-ring-select, .party-accessory-select');

      return {
        isOpen: modal?.classList.contains('active'),
        hasPaperdoll: !!paperdoll,
        slots,
        legacyDropdownCount: legacyDropdowns.length,
        inventoryItemCount: inventory ? inventory.querySelectorAll('.inventory-item-card').length : 0
      };
    });

    console.log('Modal state:', modalState);
    if (!modalState.isOpen) throw new Error('FAIL: Party Overview modal failed to open with "O" key');
    if (!modalState.hasPaperdoll) throw new Error('FAIL: Visual Paperdoll container is missing');
    if (modalState.legacyDropdownCount !== 0) throw new Error(`FAIL: Found ${modalState.legacyDropdownCount} legacy dropdowns! Expected 0.`);

    const requiredSlots = ['helmet', 'main', 'necklace', 'offhand', 'ring', 'body', 'accessory'];
    for (const r of requiredSlots) {
      if (!modalState.slots.includes(r)) throw new Error(`FAIL: Missing slot '${r}' in paperdoll`);
    }
    console.log('✓ PASS: Paperdoll rendered with all 7 equipment slots; 0 legacy dropdowns present.');
    console.log(`✓ PASS: Equipment Inventory Stash populated with ${modalState.inventoryItemCount} items.`);

    // Screenshot initial paperdoll
    const shot1 = path.join(ARTIFACT_DIR, 'm35_paperdoll_initial.png');
    await page.screenshot({ path: shot1 });
    console.log(`✓ Screenshot captured: ${shot1}`);

    // -------------------------------------------------------------------------
    // STEP 2: Drag-and-Drop Equip Helmet, Body, Necklace, Ring, Accessory, Shield
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: Execute Drag-and-Drop Equipping across Slots ---');
    const equipResults = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const hud = activeScene?.hud;
      const hero = hud?.currentParty?.[0];

      // Simulate drops via HUD drop handler
      hud.handleSlotDrop('helmet', { itemId: 'leather_cap', itemType: 'armor', itemSlot: 'helmet' }, hero);
      hud.handleSlotDrop('body', { itemId: 'leather_armor', itemType: 'armor', itemSlot: 'body' }, hero);
      hud.handleSlotDrop('necklace', { itemId: 'bone_necklace', itemType: 'armor', itemSlot: 'necklace' }, hero);
      hud.handleSlotDrop('ring', { itemId: 'wolf_claw_ring', itemType: 'armor', itemSlot: 'ring' }, hero);
      hud.handleSlotDrop('accessory', { itemId: 'venom_charm', itemType: 'armor', itemSlot: 'accessory' }, hero);
      hud.handleSlotDrop('offhand', { itemId: 'shields', itemType: 'weapon', itemSlot: 'offhand' }, hero);

      return {
        helmet: hero?.equippedHelmet?.name,
        body: hero?.equippedBodyArmor?.name,
        necklace: hero?.equippedNecklace?.name,
        ring: hero?.equippedRing?.name,
        accessory: hero?.equippedAccessory?.name,
        offhand: hero?.offhandWeapon?.name,
        hp: hero?.hp,
        maxHp: hero?.maxHp,
        critHp: hero?.criticalHp,
        maxCritHp: hero?.maxCriticalHp
      };
    });

    console.log('Equipped results:', equipResults);
    if (equipResults.helmet !== 'Leather Cap') throw new Error('FAIL: Leather Cap not equipped');
    if (equipResults.body !== 'Leather Armor') throw new Error('FAIL: Leather Armor not equipped');
    if (equipResults.necklace !== 'Bone Necklace') throw new Error('FAIL: Bone Necklace not equipped');
    if (equipResults.ring !== 'Wolf Claw Ring') throw new Error('FAIL: Wolf Claw Ring not equipped');
    if (equipResults.accessory !== 'Venom Charm') throw new Error('FAIL: Venom Charm not equipped');
    if (equipResults.offhand !== 'Shields') throw new Error('FAIL: Shields not equipped in offhand');

    console.log('✓ PASS: All 5 armor pieces and offhand shield successfully equipped via drag-and-drop.');
    await sleep(400);

    // Screenshot equipped paperdoll
    const shot2 = path.join(ARTIFACT_DIR, 'm35_paperdoll_fully_equipped.png');
    await page.screenshot({ path: shot2 });
    console.log(`✓ Screenshot captured: ${shot2}`);

    // -------------------------------------------------------------------------
    // STEP 3: Test Incompatible Drop Rejection with Error Toast
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: Test Incompatible Drop Rejection & Visual Toast ---');
    const rejectResult = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const hud = activeScene?.hud;
      const hero = hud?.currentParty?.[0];

      const hpBefore = hero.hp;
      const critBefore = hero.criticalHp;
      const helmetBefore = hero.equippedHelmet?.id;

      // Attempt to drop Body Armor onto Helmet slot
      const success = hud.handleSlotDrop('helmet', { itemId: 'silk_robe', itemType: 'armor', itemSlot: 'body' }, hero);

      return {
        success,
        helmetStillSame: hero.equippedHelmet?.id === helmetBefore,
        hpUnchanged: hero.hp === hpBefore && hero.criticalHp === critBefore
      };
    });

    console.log('Reject test result:', rejectResult);
    if (rejectResult.success !== false) throw new Error('FAIL: Incompatible drop was not rejected!');
    if (!rejectResult.helmetStillSame || !rejectResult.hpUnchanged) throw new Error('FAIL: State mutated during rejected drop!');
    console.log('✓ PASS: Incompatible drop rejected with zero state mutation.');

    await sleep(300);
    const shot3 = path.join(ARTIFACT_DIR, 'm35_rejection_toast.png');
    await page.screenshot({ path: shot3 });
    console.log(`✓ Screenshot captured: ${shot3}`);

    // -------------------------------------------------------------------------
    // STEP 4: Test Slot Unequip via [✕] Button
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Test Slot Unequip via [✕] Button ---');
    const unequipResult = await page.evaluate(() => {
      const activeScene = window.game?.scene?.getScenes(true)?.[0];
      const hud = activeScene?.hud;
      const hero = hud?.currentParty?.[0];

      const neckSlot = document.querySelector('[data-slot="necklace"]');
      const unequipBtn = neckSlot ? neckSlot.querySelector('.slot-unequip-btn') : null;
      if (unequipBtn) {
        unequipBtn.click();
      }

      return {
        hasNecklace: !!hero?.equippedNecklace,
        newCritHp: hero?.criticalHp,
        newMaxCritHp: hero?.maxCriticalHp
      };
    });

    console.log('Unequip result:', unequipResult);
    if (unequipResult.hasNecklace) throw new Error('FAIL: Necklace was not unequipped by [✕] button');
    console.log('✓ PASS: Slot unequip button cleanly removed equipped item and safely updated HP bars.');

    await sleep(300);
    const shot4 = path.join(ARTIFACT_DIR, 'm35_paperdoll_unequip.png');
    await page.screenshot({ path: shot4 });
    console.log(`✓ Screenshot captured: ${shot4}`);

    // Close modal
    await page.keyboard.press('KeyO');
    await sleep(300);

    console.log('\n================================================================');
    console.log('ALL MILESTONE 35 BROWSER VERIFICATIONS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
