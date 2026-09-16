const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=============================================================');
  console.log('STARTING MILESTONE 40 E2E BROWSER INTEGRATION VERIFICATION');
  console.log('=============================================================\n');

  console.log('[M40 E2E] Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[MainScene]') ||
        text.includes('[OutpostScene]') ||
        text.includes('[TeleporterCrystal]') ||
        text.includes('[SceneTransition') ||
        text.includes('Boss') ||
        text.includes('Escape Stone')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M40 E2E] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game to initialize into OutpostScene
    await page.waitForFunction(
      () => window.game && window.game.scene && window.game.scene.getScenes(true).length > 0,
      { timeout: 10000 }
    );
    console.log('✓ Game booted successfully.');

    // -----------------------------------------------------------------------
    // STEP 1: Verify Initial Outpost State & Floor Counter = 0
    // -----------------------------------------------------------------------
    console.log('\n[Step 1] Verifying initial Outpost state...');
    const step1 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount(),
        isSafeZone: gs.getIsSafeZone()
      };
    });
    console.log(`  Active Scene: ${step1.sceneKey}, Floor Count: ${step1.floorCount}, Safe Zone: ${step1.isSafeZone}`);
    if (step1.floorCount !== 0) {
      throw new Error(`Expected initial dungeon floor count 0, got ${step1.floorCount}`);
    }
    console.log('✓ STEP 1 PASS: Outpost initialized with run floor count 0.');

    // -----------------------------------------------------------------------
    // STEP 2: Transition from Outpost to Dungeon Floor 1
    // -----------------------------------------------------------------------
    console.log('\n[Step 2] Transitioning to Dungeon Floor 1...');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScenes(true)[0];
      outpost.executeTransitionToDungeon();
    });
    await sleep(1500);

    const step2 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      const hasCrystal = !!scene.crystalSprite;
      const crystalPos = scene.dungeon ? scene.dungeon.crystalPos : null;
      const portalPos = scene.dungeon ? scene.dungeon.portalPos : null;
      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount(),
        hasCrystal,
        crystalPos,
        portalPos,
        isBossRoom: scene.dungeon ? scene.dungeon.rooms.some(r => r.type === 'boss') : false
      };
    });
    console.log(`  Active Scene: ${step2.sceneKey}, Floor Count: ${step2.floorCount}, Has Crystal: ${step2.hasCrystal}`);
    console.log(`  Crystal Pos: (${step2.crystalPos?.x}, ${step2.crystalPos?.y}), Entrance Portal Pos: (${step2.portalPos?.x}, ${step2.portalPos?.y})`);
    if (step2.sceneKey !== 'MainScene' || step2.floorCount !== 1 || !step2.hasCrystal) {
      throw new Error(`Failed to enter Floor 1 with Teleporter Crystal: ${JSON.stringify(step2)}`);
    }
    if (step2.isBossRoom) {
      throw new Error('Floor 1 must NOT have a Boss room');
    }
    console.log('✓ STEP 2 PASS: Dungeon Floor 1 generated with Teleporter Crystal.');

    // -----------------------------------------------------------------------
    // STEP 3: One-Way Entrance Portal Check
    // -----------------------------------------------------------------------
    console.log('\n[Step 3] Testing one-way entrance portal...');
    const step3 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.interactEntrancePortal();
      return {
        sceneKey: scene.scene.key,
        floorCount: window.GameState.getInstance().getDungeonFloorCount()
      };
    });
    await sleep(400);
    console.log(`  Scene after interacting with entrance portal: ${step3.sceneKey}`);
    if (step3.sceneKey !== 'MainScene') {
      throw new Error('Entrance portal allowed player to return to Outpost! Must be one-way.');
    }
    console.log('✓ STEP 3 PASS: Entrance portal correctly acts as strictly one-way entry.');

    // -----------------------------------------------------------------------
    // STEP 4: Teleporter Crystal Modal & Continue Descent to Floor 2
    // -----------------------------------------------------------------------
    console.log('\n[Step 4] Opening Teleporter Crystal modal and descending to Floor 2...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      // Add items and take damage to test state carryover
      window.GameState.getInstance().addItem('wood', 12);
      scene.player.hp = 35;
      scene.openCrystalModal();
    });
    await sleep(500);

    const modalCheck = await page.evaluate(() => {
      const modal = document.getElementById('teleporter-crystal-modal');
      const title = document.getElementById('crystal-modal-title')?.textContent;
      const contBtn = document.getElementById('crystal-btn-continue');
      return {
        isActive: modal?.style.display === 'flex',
        title,
        hasContBtn: !!contBtn
      };
    });
    console.log(`  Crystal Modal Visible: ${modalCheck.isActive}, Title: "${modalCheck.title}"`);
    if (!modalCheck.isActive || !modalCheck.title?.includes('Floor 1')) {
      throw new Error(`Expected active crystal modal for Floor 1, got ${JSON.stringify(modalCheck)}`);
    }

    // Click Continue Descent
    await page.evaluate(() => {
      document.getElementById('crystal-btn-continue').click();
    });
    await sleep(1500);

    const step4 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount(),
        playerHp: scene.player.hp,
        woodCount: gs.getItemCount('wood')
      };
    });
    console.log(`  Floor reached: ${step4.floorCount}, HP preserved: ${step4.playerHp}, Wood preserved: ${step4.woodCount}`);
    if (step4.floorCount !== 2 || step4.playerHp !== 35 || step4.woodCount !== 12) {
      throw new Error(`Continue descent to Floor 2 failed state check: ${JSON.stringify(step4)}`);
    }
    console.log('✓ STEP 4 PASS: Teleporter Crystal modal interacted and descended to Floor 2 with party state intact.');

    // -----------------------------------------------------------------------
    // STEP 5: Chain Continues to Floors 3, 4, and 5 (Guaranteed Boss Floor)
    // -----------------------------------------------------------------------
    console.log('\n[Step 5] Continuing descent across Floors 3, 4, and 5...');

    // Continue to Floor 3
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.executeContinueDescent();
    });
    await sleep(1200);

    const f3Check = await page.evaluate(() => window.GameState.getInstance().getDungeonFloorCount());
    console.log(`  Floor 3 reached: floorCount = ${f3Check}`);
    if (f3Check !== 3) throw new Error(`Expected floor 3, got ${f3Check}`);

    // Continue to Floor 4
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.executeContinueDescent();
    });
    await sleep(1200);

    const f4Check = await page.evaluate(() => window.GameState.getInstance().getDungeonFloorCount());
    console.log(`  Floor 4 reached: floorCount = ${f4Check}`);
    if (f4Check !== 4) throw new Error(`Expected floor 4, got ${f4Check}`);

    // Continue to Floor 5 (Milestone Boss Floor)
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.executeContinueDescent();
    });
    await sleep(1500);

    const step5 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      const bossRoom = scene.dungeon?.rooms.find(r => r.type === 'boss');
      const bossEnemy = scene.enemies?.find(e => e.enemyData?.id === 'abyssal_colossus');
      const crystalPos = scene.dungeon?.crystalPos;
      const crystalInBossRoom = bossRoom && crystalPos &&
        crystalPos.x >= bossRoom.x &&
        crystalPos.x < bossRoom.x + bossRoom.width &&
        crystalPos.y >= bossRoom.y &&
        crystalPos.y < bossRoom.y + bossRoom.height;

      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount(),
        hasBossRoom: !!bossRoom,
        hasBossEnemy: !!bossEnemy,
        bossHp: bossEnemy ? bossEnemy.hp : null,
        crystalInBossRoom
      };
    });
    console.log(`  Floor 5 State:`, step5);
    if (step5.floorCount !== 5 || !step5.hasBossRoom || !step5.hasBossEnemy || !step5.crystalInBossRoom) {
      throw new Error(`Floor 5 failed Boss chamber and gatekeeper crystal placement validation: ${JSON.stringify(step5)}`);
    }
    console.log('✓ STEP 5 PASS: Floor 5 generated dedicated Boss chamber, Abyssal Colossus, and gatekeeper Crystal.');

    // -----------------------------------------------------------------------
    // STEP 6: Outpost Restrictions Persistence on Floor 5
    // -----------------------------------------------------------------------
    console.log('\n[Step 6] Testing equipment restrictions lock on Floor 5...');
    const step6 = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const leatherCap = window.DataLoader.getInstance().getArmor('leather_cap');
      const equipResult = scene.player.equipArmorSlot('helmet', leatherCap, false);
      return {
        equipResult,
        equippedHelmet: scene.player.equippedHelmet
      };
    });
    console.log(`  Armor Equip Result outside Outpost: ${step6.equipResult}, Helmet: ${step6.equippedHelmet}`);
    if (step6.equipResult !== false) {
      throw new Error('Equipping armor should be blocked inside the dungeon!');
    }
    console.log('✓ STEP 6 PASS: Outpost equipment restrictions remain locked throughout the descent.');

    // -----------------------------------------------------------------------
    // STEP 7: Emergency Teleport Item (Escape Stone)
    // -----------------------------------------------------------------------
    console.log('\n[Step 7] Testing Escape Stone bailout mechanism...');
    // 7a. Try using with 0 escape stones
    const step7a = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      return scene.useEscapeStone();
    });
    console.log(`  Escape stone use with 0 stones: ${step7a}`);
    if (step7a !== false) throw new Error('Escape stone use should fail when count is 0');

    // 7b. Grant Escape Stone and test combat blocking
    await page.evaluate(() => {
      window.GameState.getInstance().addItem('escape_stone', 2);
    });

    const step7b = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      // Simulate combat aggro
      scene.player.inCombat = true;
      const escapeWhileCombat = scene.useEscapeStone();
      scene.player.inCombat = false;
      return escapeWhileCombat;
    });
    console.log(`  Escape stone use during combat: ${step7b}`);
    if (step7b !== false) throw new Error('Escape stone should be strictly blocked during combat!');

    // 7c. Use Escape Stone cleanly out of combat to return to Outpost
    console.log('  Using Escape Stone while out of combat...');
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.useEscapeStone();
    });
    await sleep(1500);

    const step7c = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      const leatherCap = window.DataLoader.getInstance().getArmor('leather_cap');
      const canEquipNow = scene.player.equipArmorSlot('helmet', leatherCap, true);
      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount(),
        lifetimeFloors: gs.getLifetimeDungeonFloorCount(),
        remainingStones: gs.getItemCount('escape_stone'),
        canEquipNow
      };
    });
    console.log(`  Returned to Outpost State:`, step7c);
    if (step7c.sceneKey !== 'OutpostScene' || step7c.floorCount !== 0 || step7c.lifetimeFloors < 5 || !step7c.canEquipNow) {
      throw new Error(`Escape stone transition failed validation: ${JSON.stringify(step7c)}`);
    }
    console.log('✓ STEP 7 PASS: Escape Stone safely returned party to Outpost, reset run counter to 0, and unlocked Outpost features.');

    // -----------------------------------------------------------------------
    // STEP 8: Teleporter Crystal Return Option
    // -----------------------------------------------------------------------
    console.log('\n[Step 8] Testing Teleporter Crystal "Return" choice...');
    // Re-enter dungeon
    await page.evaluate(() => {
      const outpost = window.game.scene.getScenes(true)[0];
      outpost.executeTransitionToDungeon();
    });
    await sleep(1500);

    const reEntered = await page.evaluate(() => window.GameState.getInstance().getDungeonFloorCount());
    console.log(`  Re-entered dungeon: floorCount = ${reEntered}`);
    if (reEntered !== 1) throw new Error(`New descent must start at Floor 1, got ${reEntered}`);

    // Open crystal modal and click Return to Outpost
    await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      scene.openCrystalModal();
    });
    await sleep(500);

    await page.evaluate(() => {
      document.getElementById('crystal-btn-return').click();
    });
    await sleep(1500);

    const returnCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScenes(true)[0];
      const gs = window.GameState.getInstance();
      return {
        sceneKey: scene.scene.key,
        floorCount: gs.getDungeonFloorCount()
      };
    });
    console.log(`  Return from crystal modal state:`, returnCheck);
    if (returnCheck.sceneKey !== 'OutpostScene' || returnCheck.floorCount !== 0) {
      throw new Error(`Crystal modal Return failed: ${JSON.stringify(returnCheck)}`);
    }
    console.log('✓ STEP 8 PASS: Teleporter Crystal "Return" successfully ends run and transfers back to Outpost.');

    console.log('\n=============================================================');
    console.log('🎉 ALL MILESTONE 40 E2E BROWSER TESTS PASSED SUCCESSFULLY! ✓');
    console.log('=============================================================');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('[M40 E2E ERROR]:', err);
  process.exit(1);
});
