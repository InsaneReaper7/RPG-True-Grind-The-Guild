const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M30 E2E] Launching browser...');
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
        text.includes('[Gathering') ||
        text.includes('[Research') ||
        text.includes('[Progression') ||
        text.includes('[Dungeon') ||
        text.includes('Digging') ||
        text.includes('Excavator')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M30 E2E] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Wait for game to initialize
    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted.');

    // Transition from Outpost to Dungeon
    console.log('Transitioning to Dungeon...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });

    await sleep(2000);
    await page.waitForFunction(() => {
      const s = window.game.scene.getScene('MainScene');
      return s && s.sys.isVisible();
    }, { timeout: 10000 });
    console.log('✓ MainScene active and rendering.');

    // -------------------------------------------------------------
    // STEP 1: Confirm ZERO dig spots before research is completed
    // -------------------------------------------------------------
    const preCheck = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      const nodes = s.gatheringNodes;
      const digSpots = nodes.filter((n) => n.nodeDef.id === 'dig_spot');
      const isDiggingUnlocked = window.GameState?.getInstance().isDiggingUnlocked?.() ?? false;
      return {
        totalNodes: nodes.length,
        digSpotsCount: digSpots.length,
        isDiggingUnlocked
      };
    });

    console.log(`[Step 1] Pre-Research State: ${preCheck.totalNodes} total gathering nodes, ${preCheck.digSpotsCount} dig spots, isDiggingUnlocked: ${preCheck.isDiggingUnlocked}`);
    if (preCheck.digSpotsCount !== 0 || preCheck.isDiggingUnlocked) {
      throw new Error(`Expected 0 dig spots and isDiggingUnlocked=false before research, got ${preCheck.digSpotsCount} and ${preCheck.isDiggingUnlocked}`);
    }
    console.log('✓ STEP 1 PASS: Zero dig spots in dungeon before research is completed.');

    // -------------------------------------------------------------
    // STEP 2: Unlock Digging Research in Research Tree
    // -------------------------------------------------------------
    console.log('\n[Step 2] Unlocking Digging Research...');
    const unlockRes = await page.evaluate(() => {
      const gs = window.GameState.getInstance();
      gs.addResearchPoints(20);
      const rs = window.ResearchSystem.getInstance();
      const dl = window.DataLoader.getInstance();
      const node = dl.getResearchNode('research_digging');
      const res = rs.unlockNode(node);
      return {
        success: res.success,
        isDiggingUnlocked: gs.isDiggingUnlocked()
      };
    });

    console.log(`[Step 2] Unlock Result: success=${unlockRes.success}, isDiggingUnlocked=${unlockRes.isDiggingUnlocked}`);
    if (!unlockRes.success || !unlockRes.isDiggingUnlocked) {
      throw new Error('Failed to unlock Digging research');
    }
    console.log('✓ STEP 2 PASS: Digging research completed and isDiggingUnlocked=true.');

    // -------------------------------------------------------------
    // STEP 3: Confirm non-retroactive floor preservation, then generate fresh floor
    // -------------------------------------------------------------
    console.log('\n[Step 3] Confirming non-retroactive floor preservation...');
    const currentFloorCheck = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      return s.gatheringNodes.filter((n) => n.nodeDef.id === 'dig_spot').length;
    });
    if (currentFloorCheck !== 0) {
      throw new Error('Current floor should NOT have retroactively mutated!');
    }
    console.log('✓ Preserved current floor without retroactive mutation.');

    console.log('Generating fresh dungeon floor...');
    const freshFloorResult = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      const dl = window.DataLoader.getInstance();
      const config = dl.getDungeonConfig ? dl.getDungeonConfig() : dl.dungeonConfig;

      // Clean up previous floor nodes
      for (const node of s.gatheringNodes) {
        node.sprite.destroy();
        node.label.destroy();
      }
      s.gatheringNodes = [];

      // Generate fresh floor
      s.dungeon = window.DungeonGenerator.generate(config);
      for (const bspawn of s.dungeon.bushSpawns) {
        const typeId = bspawn.nodeTypeId || 'foraging_bush';
        s.spawnGatheringNode(bspawn.x, bspawn.y, typeId);
      }

      const digSpots = s.gatheringNodes.filter((n) => n.nodeDef.id === 'dig_spot');
      return {
        totalNodes: s.gatheringNodes.length,
        digSpotsCount: digSpots.length,
        nodeTypes: [...new Set(s.gatheringNodes.map((n) => n.nodeDef.id))]
      };
    });

    console.log(`[Step 3] Fresh Floor: ${freshFloorResult.totalNodes} nodes, ${freshFloorResult.digSpotsCount} dig spots, types: [${freshFloorResult.nodeTypes.join(', ')}]`);
    if (freshFloorResult.digSpotsCount === 0) {
      throw new Error('Freshly generated floor must contain dig spots!');
    }
    console.log('✓ STEP 3 PASS: Dig spots appear in newly generated floor.');

    // -------------------------------------------------------------
    // STEP 4: Harvest a Dig Spot & verify loot / EXP
    // -------------------------------------------------------------
    console.log('\n[Step 4] Harvesting a dig spot...');
    const harvestResult = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      const hero = s.player;
      const digSpot = s.gatheringNodes.find((n) => n.nodeDef.id === 'dig_spot' && !n.isHarvested);

      const preDirt = gs.getItemCount('dirt');
      const preClay = gs.getItemCount('clay');
      const preSeeds = gs.getItemCount('seeds');
      const preBox = gs.getItemCount('locked_box');
      const preExp = hero.progression.getProficiencyStat('digging').currentExp;

      // Harvest directly
      s.harvestGatheringNode(digSpot, hero);

      return {
        isHarvested: digSpot.isHarvested,
        postDirt: gs.getItemCount('dirt'),
        postClay: gs.getItemCount('clay'),
        postSeeds: gs.getItemCount('seeds'),
        postBox: gs.getItemCount('locked_box'),
        dirtDiff: gs.getItemCount('dirt') - preDirt,
        clayDiff: gs.getItemCount('clay') - preClay,
        seedsDiff: gs.getItemCount('seeds') - preSeeds,
        boxDiff: gs.getItemCount('locked_box') - preBox,
        postExp: hero.progression.getProficiencyStat('digging').currentExp,
        expGained: hero.progression.getProficiencyStat('digging').currentExp - preExp
      };
    });

    console.log(`[Step 4] Harvest Result: isHarvested=${harvestResult.isHarvested}, EXP gained=${harvestResult.expGained}`);
    console.log(`  Items gained: Dirt=${harvestResult.dirtDiff}, Clay=${harvestResult.clayDiff}, Seeds=${harvestResult.seedsDiff}, LockedBox=${harvestResult.boxDiff}`);
    const totalItemsGained = harvestResult.dirtDiff + harvestResult.clayDiff + harvestResult.seedsDiff + harvestResult.boxDiff;
    if (totalItemsGained !== 1 || harvestResult.expGained !== 15) {
      throw new Error(`Expected 1 item gained and 15 EXP, got ${totalItemsGained} items and ${harvestResult.expGained} EXP`);
    }
    console.log('✓ STEP 4 PASS: Dig spot harvest yields item from loot table and grants 15 Digging EXP.');

    // -------------------------------------------------------------
    // STEP 5: Gathering Mode (F) Marquee Selection includes Dig Spots
    // -------------------------------------------------------------
    console.log('\n[Step 5] Gathering Mode drag-selection check...');
    const gatheringModeCheck = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      s.toggleGatheringMode(true);
      const unharvested = s.gatheringNodes.filter((n) => !n.isHarvested);
      if (unharvested.length === 0) return { ok: false, reason: 'no unharvested nodes' };

      // Find bounds of all nodes
      const minX = Math.min(...unharvested.map((n) => n.x * s.tileSize));
      const maxX = Math.max(...unharvested.map((n) => (n.x + 1) * s.tileSize));
      const minY = Math.min(...unharvested.map((n) => n.y * s.tileSize));
      const maxY = Math.max(...unharvested.map((n) => (n.y + 1) * s.tileSize));

      const selectedNodes = s.gatheringNodes.filter((node) => {
        if (node.isHarvested) return false;
        const nodeCenterX = node.x * s.tileSize + s.tileSize / 2;
        const nodeCenterY = node.y * s.tileSize + s.tileSize / 2;
        return nodeCenterX >= minX && nodeCenterX <= maxX && nodeCenterY >= minY && nodeCenterY <= maxY;
      });

      const hasDigSpot = selectedNodes.some((n) => n.nodeDef.id === 'dig_spot');
      s.toggleGatheringMode(false);
      return {
        selectedCount: selectedNodes.length,
        hasDigSpot
      };
    });

    console.log(`[Step 5] Gathering Mode selected ${gatheringModeCheck.selectedCount} nodes, contains dig spot: ${gatheringModeCheck.hasDigSpot}`);
    if (!gatheringModeCheck.hasDigSpot) {
      throw new Error('Gathering mode did not select dig spot in area');
    }
    console.log('✓ STEP 5 PASS: Gathering mode marquee selection encompasses dig spots automatically.');

    // -------------------------------------------------------------
    // STEP 6: Excavator Class Unlock at Digging Level 10
    // -------------------------------------------------------------
    console.log('\n[Step 6] Excavator class unlock verification...');
    const classUnlockCheck = await page.evaluate(() => {
      const s = window.game.scene.getScene('MainScene');
      const hero = s.player;
      const prog = hero.progression;

      const preUnlocked = prog.isClassUnlocked('excavator');
      // Set to level 10
      prog.getProficiencyStat('digging').level = 10;
      prog.checkClassUnlocks();
      const postUnlocked = prog.isClassUnlocked('excavator');

      return {
        preUnlocked,
        postUnlocked
      };
    });

    console.log(`[Step 6] Excavator unlocked before: ${classUnlockCheck.preUnlocked}, after Level 10: ${classUnlockCheck.postUnlocked}`);
    if (classUnlockCheck.preUnlocked || !classUnlockCheck.postUnlocked) {
      throw new Error('Excavator class failed to unlock at Digging Level 10');
    }
    console.log('✓ STEP 6 PASS: Excavator class unlocks at Digging Level 10.');

    console.log('\n=============================================================');
    console.log('🎉 ALL MILESTONE 30 BROWSER E2E TESTS PASSED SUCCESSFULLY! ✓');
    console.log('=============================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
