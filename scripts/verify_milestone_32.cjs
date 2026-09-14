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

    // Run in-engine verification for Milestone 32
    const results = await page.evaluate(() => {
      const scene = window.__scene || window.game.scene.getScene('MainScene');
      const gameState = window.GameState.getInstance();
      const research = window.ResearchSystem.getInstance();
      const dl = window.DataLoader.getInstance();
      const res = { steps: [], errors: [] };

      function logStep(msg) {
        res.steps.push(msg);
      }
      function assert(cond, msg) {
        if (!cond) {
          res.errors.push(`FAIL: ${msg}`);
          throw new Error(`Assertion failed: ${msg}`);
        } else {
          res.steps.push(`PASS: ${msg}`);
        }
      }

      // Step 1: Initial Research Tree & Station Gates
      logStep('Checking initial research prerequisites...');
      assert(gameState.isSkinningUnlocked() === false, 'Skinning initially locked');
      assert(gameState.isButcheringUnlocked() === false, 'Butchering initially locked');

      const armorNode = dl.getResearchNode('research_armorsmithing_bench');
      const cookingNode = dl.getResearchNode('research_cooking_station');
      assert(armorNode && armorNode.prerequisites.includes('research_skinning'), 'Armorsmithing Bench requires research_skinning');
      assert(cookingNode && cookingNode.prerequisites.includes('research_butchering'), 'Cooking Station requires research_butchering');

      assert(research.canUnlockNode(armorNode).canUnlock === false, 'Armorsmithing Bench locked due to Skinning prerequisite');
      assert(research.canUnlockNode(cookingNode).canUnlock === false, 'Cooking Station locked due to Butchering prerequisite');

      // Step 2: Wolf Defeat WITHOUT Skinning Research
      logStep('Defeating wolf without skinning research...');
      const wolfData = dl.getEnemy('wolf');
      const mockWolf = scene.spawnEnemyUnit(wolfData, 10, 10, wolfData.textureKey || 'enemy-wolf');
      mockWolf.currentHp = 0;
      mockWolf.markDead();
      const initialPelts = gameState.getItemCount('wolf_pelt');
      const initialMeat = gameState.getItemCount('wolf_meat');

      // Simulate defeat
      scene.checkAndCreateCorpseGatheringNode(mockWolf);

      assert(mockWolf.corpseNode === null, 'No corpse node created when skinning not researched');
      assert(gameState.getItemCount('wolf_pelt') === initialPelts, 'No wolf pelt dropped on kill');
      assert(gameState.getItemCount('wolf_meat') === initialMeat, 'No wolf meat dropped on kill');

      // Step 3: Unlock Research Nodes
      logStep('Unlocking skinning & butchering research...');
      gameState.researchPoints = 100;
      const skinningNode = dl.getResearchNode('research_skinning');
      const butcheringNode = dl.getResearchNode('research_butchering');
      research.unlockNode(skinningNode);
      research.unlockNode(butcheringNode);
      assert(gameState.isSkinningUnlocked() === true, 'Skinning is now unlocked');
      assert(gameState.isButcheringUnlocked() === true, 'Butchering is now unlocked');

      // Stations should now be unlocked or unlockable
      assert(research.canUnlockNode(armorNode).canUnlock === true, 'Armorsmithing Bench unlockable now');
      assert(research.canUnlockNode(cookingNode).canUnlock === true, 'Cooking Station unlockable now');

      // Step 4: Wolf Corpse Node Spawn & Sequential Ordering Gate
      logStep('Spawning and testing Wolf corpse sequential ordering...');
      const mockWolf2 = scene.spawnEnemyUnit(wolfData, 15, 15, wolfData.textureKey || 'enemy-wolf');
      mockWolf2.currentHp = 0;
      mockWolf2.markDead();
      scene.checkAndCreateCorpseGatheringNode(mockWolf2);

      assert(mockWolf2.corpseNode !== null, 'Corpse gathering node spawned for defeated wolf');
      assert(mockWolf2.corpseNode.nodeDef.skillId === 'skinning', 'Corpse starts in Skinning phase');
      assert(mockWolf2.corpseNode.nodeDef.actionVerb === 'Skinning', 'Action verb is Skinning');
      assert(scene.canSkinCorpse(mockWolf2).canHarvest === true, 'Wolf corpse can be skinned');
      assert(scene.canButcherCorpse(mockWolf2).canHarvest === false, 'Wolf corpse cannot be butchered before skinning');

      // Harvest Skinning
      const player = scene.player;
      scene.harvestGatheringNode(mockWolf2.corpseNode, player);
      assert(gameState.getItemCount('wolf_pelt') === initialPelts + 1, 'Skinning yielded 1 Wolf Pelt');
      assert(mockWolf2.isSkinned === true, 'Wolf is marked isSkinned = true');
      assert(mockWolf2.corpseNode.isHarvested === false, 'Corpse not spent yet; Butchering phase available');
      assert(mockWolf2.corpseNode.nodeDef.skillId === 'butchering', 'Corpse transitioned to Butchering skill');
      assert(mockWolf2.corpseNode.nodeDef.actionVerb === 'Butchering', 'Corpse transitioned to Butchering verb');

      // Harvest Butchering
      assert(scene.canButcherCorpse(mockWolf2).canHarvest === true, 'Wolf corpse can now be butchered');
      scene.harvestGatheringNode(mockWolf2.corpseNode, player);
      assert(gameState.getItemCount('wolf_meat') === initialMeat + 1, 'Butchering yielded 1 Wolf Meat');
      assert(mockWolf2.isButchered === true, 'Wolf is marked isButchered = true');
      assert(mockWolf2.corpseNode.isHarvested === true, 'Corpse is fully spent after butchering');

      // Step 5: Spider Skinning Yields Silk Exclusively (No Meat)
      logStep('Testing Spider skinning for Spider Silk...');
      const spiderData = dl.getEnemy('spider');
      const mockSpider = scene.spawnEnemyUnit(spiderData, 20, 20, spiderData.textureKey || 'enemy-spider');
      mockSpider.currentHp = 0;
      mockSpider.markDead();
      scene.checkAndCreateCorpseGatheringNode(mockSpider);

      assert(mockSpider.corpseNode !== null, 'Spider corpse node created');
      assert(mockSpider.corpseNode.nodeDef.skillId === 'skinning', 'Spider node is skinning');
      assert(mockSpider.corpseNode.nodeDef.resourceId === 'spider_silk', 'Spider resource is spider_silk');
      const initialSilk = gameState.getItemCount('spider_silk');
      scene.harvestGatheringNode(mockSpider.corpseNode, player);
      assert(gameState.getItemCount('spider_silk') === initialSilk + 1, 'Spider skinning yielded Spider Silk');
      assert(mockSpider.corpseNode.isHarvested === true, 'Spider corpse spent immediately (no meat on spider)');

      // Step 6: Goblin Butchering (Immediate Butchering, No Skinning)
      logStep('Testing Goblin butchering (immediate)...');
      const goblinData = dl.getEnemy('goblin');
      const mockGoblin = scene.spawnEnemyUnit(goblinData, 25, 25, goblinData.textureKey || 'enemy-goblin');
      mockGoblin.currentHp = 0;
      mockGoblin.markDead();
      scene.checkAndCreateCorpseGatheringNode(mockGoblin);

      assert(mockGoblin.corpseNode !== null, 'Goblin corpse node created');
      assert(mockGoblin.corpseNode.nodeDef.skillId === 'butchering', 'Goblin node is butchering (no skinning phase)');
      assert(mockGoblin.corpseNode.nodeDef.actionVerb === 'Butchering', 'Verb is Butchering');
      const initialMonsterMeat = gameState.getItemCount('monster_meat');
      scene.harvestGatheringNode(mockGoblin.corpseNode, player);
      assert(gameState.getItemCount('monster_meat') === initialMonsterMeat + 1, 'Goblin butchering yielded Monster Meat');
      assert(mockGoblin.corpseNode.isHarvested === true, 'Goblin corpse spent');

      // Step 7: Undead / Skeleton Refusal
      logStep('Testing Skeleton/Undead butchering exclusion...');
      const skelData = dl.getEnemy('skeleton');
      const mockSkel = scene.spawnEnemyUnit(skelData, 30, 30, skelData.textureKey || 'enemy-skeleton');
      mockSkel.currentHp = 0;
      mockSkel.markDead();
      scene.checkAndCreateCorpseGatheringNode(mockSkel);
      assert(mockSkel.corpseNode === null, 'Skeleton spawned no corpse node');

      const skelArcherData = dl.getEnemy('skeleton_archer');
      const mockSkelArcher = scene.spawnEnemyUnit(skelArcherData, 35, 35, skelArcherData.textureKey || 'enemy-skeleton-archer');
      mockSkelArcher.currentHp = 0;
      mockSkelArcher.markDead();
      scene.checkAndCreateCorpseGatheringNode(mockSkelArcher);
      assert(mockSkelArcher.corpseNode === null, 'Skeleton Archer spawned no corpse node');

      // Step 8: Gathering Mode selection includes Corpse nodes
      logStep('Testing Gathering Mode marquee selection with Corpse nodes...');
      const wolfForMarquee = scene.spawnEnemyUnit(wolfData, 12, 12, wolfData.textureKey || 'enemy-wolf');
      wolfForMarquee.currentHp = 0;
      wolfForMarquee.markDead();
      scene.checkAndCreateCorpseGatheringNode(wolfForMarquee);
      assert(wolfForMarquee.corpseNode !== null, 'Corpse node exists for marquee test');

      const corpseNodes = scene.gatheringNodes.filter(n => !n.isHarvested && n.corpseEnemy);
      assert(corpseNodes.length > 0, 'Active corpse node exists in gatheringNodes array');

      return res;
    });

    console.log('\n[M32 E2E] Verification Steps:');
    results.steps.forEach(s => console.log('  ' + s));

    if (results.errors.length > 0) {
      console.error('\n[M32 E2E] Errors:');
      results.errors.forEach(e => console.error('  ' + e));
      process.exit(1);
    }

    console.log('\n=============================================================');
    console.log('🎉 ALL MILESTONE 32 BROWSER E2E TESTS PASSED SUCCESSFULLY! ✓');
    console.log('=============================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
