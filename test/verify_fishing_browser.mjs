import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 3001; // Use unique port to avoid conflicts
const BASE_URL = `http://localhost:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome or Edge binary found for live browser tests.');
}

async function runLiveVerification() {
  console.log('================================================================');
  console.log('🎣 LIVE BROWSER VERIFICATION: MILESTONE — FISHING 🎣');
  console.log('================================================================\n');

  // --- Step 1: Static Data Verification ---
  console.log('--- TEST 1: Static Data Verification ---');

  // Gathering Nodes
  const gatheringNodesRaw = JSON.parse(fs.readFileSync('data/gatheringNodes.json', 'utf8'));
  const fishingNodeDef = gatheringNodesRaw.nodes?.fishing_spot;
  assert.ok(fishingNodeDef, 'data/gatheringNodes.json must define fishing_spot');
  assert.strictEqual(fishingNodeDef.skillId, 'fishing', 'fishing_spot skillId must be fishing');
  assert.strictEqual(fishingNodeDef.resourceId, 'raw_fish', 'fishing_spot resourceId must be raw_fish');
  assert.strictEqual(fishingNodeDef.expGranted, 15, 'fishing_spot expGranted must be 15 (universal standard)');
  assert.strictEqual(fishingNodeDef.channelDurationMs, 2500, 'fishing_spot channelDurationMs must be 2500ms');
  assert.strictEqual(fishingNodeDef.actionVerb, 'Fishing', 'fishing_spot actionVerb must be Fishing');
  assert.strictEqual(fishingNodeDef.requiredToolItemId, 'fishing_rod', 'fishing_spot must define requiredToolItemId: "fishing_rod"');
  assert.ok(Array.isArray(fishingNodeDef.lootTable), 'fishing_spot must have lootTable');
  assert.ok(fishingNodeDef.lootTable.some(i => i.itemId === 'raw_fish'), 'lootTable must include raw_fish');
  assert.ok(fishingNodeDef.lootTable.some(i => i.itemId === 'aquatic_reagent'), 'lootTable must include aquatic_reagent');
  console.log('✓ Validated data/gatheringNodes.json fishing_spot schema, requiredToolItemId, & loot table.');

  // Research Tree
  const researchRaw = JSON.parse(fs.readFileSync('data/researchTree.json', 'utf8'));
  const fishingResearch = researchRaw.nodes?.find(n => n.id === 'research_fishing');
  assert.ok(fishingResearch, 'data/researchTree.json must define research_fishing');
  assert.strictEqual(fishingResearch.cost, 10, 'research_fishing cost must be 10');
  console.log('✓ Validated data/researchTree.json research_fishing node.');

  // Blacksmith Recipes
  const bsRaw = JSON.parse(fs.readFileSync('data/blacksmithRecipes.json', 'utf8'));
  const rodRecipe = bsRaw.recipes?.find(r => r.id === 'fishing_rod');
  assert.ok(rodRecipe, 'data/blacksmithRecipes.json must define fishing_rod recipe');
  assert.strictEqual(rodRecipe.resultItemId, 'fishing_rod');
  assert.strictEqual(rodRecipe.requiredLevel, 0);
  assert.deepStrictEqual(rodRecipe.ingredients, { wood: 3, spider_silk: 2 });
  console.log('✓ Validated data/blacksmithRecipes.json fishing_rod recipe.');

  // Items
  const itemsRaw = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
  const rawFishItem = itemsRaw.items?.find(i => i.id === 'raw_fish');
  const aquaticReagentItem = itemsRaw.items?.find(i => i.id === 'aquatic_reagent');
  const fishingRodItem = itemsRaw.items?.find(i => i.id === 'fishing_rod');
  assert.ok(rawFishItem, 'data/items.json must include raw_fish');
  assert.ok(aquaticReagentItem, 'data/items.json must include aquatic_reagent');
  assert.ok(fishingRodItem, 'data/items.json must include fishing_rod');
  assert.strictEqual(rawFishItem.category, 'gathering');
  assert.strictEqual(aquaticReagentItem.category, 'reagents');
  assert.strictEqual(fishingRodItem.category, 'reagents');
  assert.strictEqual(fishingRodItem.weight, 1.0);
  console.log('✓ Validated data/items.json raw_fish, aquatic_reagent, and fishing_rod.');

  // Classes (Tier 0 Angler)
  const classesRaw = JSON.parse(fs.readFileSync('data/classes.json', 'utf8'));
  const anglerClass = classesRaw.classes?.find(c => c.id === 'angler');
  assert.ok(anglerClass, 'data/classes.json must include Tier 0 angler class');
  assert.strictEqual(anglerClass.tier, 'novice', 'angler tier must be novice');
  assert.ok(
    anglerClass.requirements.some(r => r.type === 'proficiency' && r.target === 'fishing' && r.value === 10),
    'angler class must require fishing proficiency >= 10'
  );
  console.log('✓ Validated data/classes.json Tier 0 Angler class definition.');

  // Player JSON proficiencies
  const playerRaw = JSON.parse(fs.readFileSync('data/player.json', 'utf8'));
  assert.ok(playerRaw.proficiencies?.fishing, 'data/player.json must register fishing proficiency');
  console.log('✓ Validated data/player.json fishing proficiency.');

  // --- Step 2: Spawn Vite dev server and Puppeteer ---
  console.log('\n--- TEST 2: Spawning Vite Dev Server & Booting Headless Browser ---');
  console.log(`[Server] Spawning Vite dev server on port ${PORT}...`);
  const server = spawn('cmd.exe', ['/c', `npx vite --port ${PORT} --no-open`], {
    shell: true,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStarted = false;
  server.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Local:') || s.includes('localhost:')) {
      serverStarted = true;
    }
  });

  const maxWait = 25000;
  const startTime = Date.now();
  while (!serverStarted && Date.now() - startTime < maxWait) {
    await sleep(250);
  }
  if (!serverStarted) {
    server.kill();
    throw new Error('Vite dev server failed to start within timeout');
  }
  console.log('[Server] Dev server is ready.');

  const browser = await puppeteer.launch({
    executablePath: findChromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('[Gathering]') || txt.includes('[Angler]') || txt.includes('[Fishing]')) {
        console.log(`  [Browser] ${txt}`);
      }
    });

    console.log(`[E2E] Loading game at ${BASE_URL}...`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Wait for OutpostScene
    await page.waitForFunction(() => {
      const g = window.game;
      return g && g.scene && g.scene.getScene('OutpostScene')?.scene?.isActive();
    }, { timeout: 15000 });

    // Transition to MainScene (Dungeon Floor 1)
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      outpost.executeTransitionToDungeon();
    });

    // Wait for MainScene to be active with gridMatrix and player
    await page.waitForFunction(() => {
      const s = window.game?.scene?.getScene('MainScene');
      return s && s.scene.isActive() && s.gridMatrix && s.player;
    }, { timeout: 15000 });
    await sleep(1000);

    console.log('✓ MainScene initialized with active player and gridMatrix.');

    // --- TEST 3: Research Gate & Node Spawning Verification ---
    console.log('\n--- TEST 3: Research Gate & Spending RP via Research Tree Modal ---');
    const researchGateCheck = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      const isInitiallyUnlocked = gs.isFishingUnlocked();
      const initialSpots = scene.gatheringNodes.filter(n => n.nodeDef.skillId === 'fishing');

      // Grant 15 RP so party can afford the 10 RP cost
      gs.addResearchPoints(15);
      const preRp = gs.getResearchPoints();

      // Open Research Tree modal via HUD
      scene.hud.openResearchTreeModal();

      // Unlock research_fishing by spending 10 RP through UI button click
      const unlockBtn = document.querySelector('button[data-unlock-node="research_fishing"]');
      if (!unlockBtn) {
        throw new Error('Research Tree modal failed to render unlock button for research_fishing');
      }
      unlockBtn.click();

      const isUnlockedAfter = gs.isFishingUnlocked();
      const postRp = gs.getResearchPoints();

      // Close Research Tree modal
      scene.hud.closeResearchTreeModal();

      // Ensure room water tile exists and spawn water fishing spots
      for (const r of scene.dungeon.rooms) {
        if (r.type !== 'entrance' && r.type !== 'boss' && r.width >= 5) {
          const wx = r.x + 2;
          const wy = r.y + 2;
          scene.gridMatrix[wy][wx] = 2; // Water
          if (!scene.dungeon.waterTiles) scene.dungeon.waterTiles = [];
          scene.dungeon.waterTiles.push({ x: wx, y: wy });
          break;
        }
      }
      scene.spawnWaterFishingSpots();

      const hasFishingTexture = scene.textures.exists('fishing-spot');
      const hasDepletedTexture = scene.textures.exists('fishing-spot-depleted');
      const fishingSpots = scene.gatheringNodes.filter(n => n.nodeDef.skillId === 'fishing');

      return {
        isInitiallyUnlocked,
        initialSpotsCount: initialSpots.length,
        preRp,
        postRp,
        isUnlockedAfter,
        hasFishingTexture,
        hasDepletedTexture,
        fishingSpotsCount: fishingSpots.length,
        firstSpot: fishingSpots[0] ? {
          x: fishingSpots[0].x,
          y: fishingSpots[0].y,
          name: fishingSpots[0].nodeDef.name,
          skillId: fishingSpots[0].nodeDef.skillId,
          actionVerb: fishingSpots[0].nodeDef.actionVerb,
          requiredToolItemId: fishingSpots[0].nodeDef.requiredToolItemId,
          isHarvested: fishingSpots[0].isHarvested,
          tileType: scene.gridMatrix[fishingSpots[0].y][fishingSpots[0].x]
        } : null
      };
    });

    console.log(`[E2E] Research locked initially: ${!researchGateCheck.isInitiallyUnlocked}`);
    console.log(`[E2E] Spent 10 RP via modal: RP ${researchGateCheck.preRp} -> ${researchGateCheck.postRp} | Unlocked: ${researchGateCheck.isUnlockedAfter}`);
    assert.strictEqual(researchGateCheck.isInitiallyUnlocked, false, 'Fishing must be locked behind research initially');
    assert.strictEqual(researchGateCheck.initialSpotsCount, 0, 'No fishing spots must spawn when research is locked');
    assert.strictEqual(researchGateCheck.isUnlockedAfter, true, 'Fishing must be unlocked after modal RP spend');
    assert.strictEqual(researchGateCheck.postRp, researchGateCheck.preRp - 10, '10 RP deducted for research_fishing');
    assert.ok(researchGateCheck.hasFishingTexture, 'fishing-spot texture must exist');
    assert.ok(researchGateCheck.hasDepletedTexture, 'fishing-spot-depleted texture must exist');
    assert.ok(researchGateCheck.fishingSpotsCount > 0, 'Fishing spots must spawn once research is unlocked');
    assert.strictEqual(researchGateCheck.firstSpot.requiredToolItemId, 'fishing_rod', 'First spot must require fishing_rod');
    assert.strictEqual(researchGateCheck.firstSpot.tileType, 2, 'Fishing spot must sit on water tile (2)');
    console.log(`✓ Validated Research Gate: unlocked by spending RP through Research Tree modal.`);

    // --- TEST 4: Blacksmith Rod Crafting & Harvest Channeling ---
    console.log('\n--- TEST 4: Blacksmith Crafting (Stockpile -> Leader Inventory) & Personal Tool Requirement ---');
    const toolCheckResult = await page.evaluate(async (spotPos) => {
      const scene = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      const player = scene.player;
      const companion = scene.party[1];
      const spot = scene.gatheringNodes.find(n => n.x === spotPos.x && n.y === spotPos.y);

      // Clear any enemies within aggro radius
      for (const e of scene.enemies) {
        if (Math.hypot(e.gridPos.x - spotPos.x, e.gridPos.y - spotPos.y) <= 12) {
          e.setGridPosition(0, 0);
          e.state = 'dead';
        }
      }

      // Position player on shore
      let adjTiles = [
        { x: spotPos.x + 1, y: spotPos.y }, { x: spotPos.x - 1, y: spotPos.y },
        { x: spotPos.x, y: spotPos.y + 1 }, { x: spotPos.x, y: spotPos.y - 1 },
        { x: spotPos.x + 1, y: spotPos.y + 1 }, { x: spotPos.x - 1, y: spotPos.y + 1 },
        { x: spotPos.x + 1, y: spotPos.y - 1 }, { x: spotPos.x - 1, y: spotPos.y - 1 }
      ].filter(t => scene.gridMatrix[t.y]?.[t.x] === 0);
      if (adjTiles.length === 0) {
        scene.gridMatrix[spotPos.y][spotPos.x + 1] = 0;
        adjTiles = [{ x: spotPos.x + 1, y: spotPos.y }];
      }
      const shoreTile = adjTiles[0];
      player.setGridPosition(shoreTile.x, shoreTile.y);
      player.claimedDestination = null;

      // 1. Verify Player starts with 0 fishing rods: interaction fails
      const initialRodCount = player.getItemCount('fishing_rod');
      const canInteractWithoutRod = scene.canInteractWithGatheringNode(spot, player);
      const companionCanInteract = companion ? scene.canInteractWithGatheringNode(spot, companion) : null;

      // 2. Craft Fishing Rod at Blacksmith from stockpile materials
      gs.addItem('wood', 3);
      gs.addItem('spider_silk', 2);
      const preCraftWood = gs.getItemCount('wood');
      const preCraftSilk = gs.getItemCount('spider_silk');
      const preCraftBsExp = player.progression.getProficiencyStat('blacksmithing')?.currentExp || 0;

      // Open Blacksmith modal via HUD
      scene.hud.openBlacksmithingModal(player, scene.progressionSystem);
      const craftRodBtn = document.querySelector('button[data-forge-recipe="fishing_rod"]');
      if (!craftRodBtn) {
        throw new Error('Blacksmith modal failed to render craft button for fishing_rod');
      }
      craftRodBtn.click();
      scene.hud.closeBlacksmithingModal();

      const postCraftWood = gs.getItemCount('wood');
      const postCraftSilk = gs.getItemCount('spider_silk');
      const postCraftBsExp = player.progression.getProficiencyStat('blacksmithing')?.currentExp || 0;
      const rodCountAfterCrafting = player.getItemCount('fishing_rod');
      const canInteractWithCraftedRod = scene.canInteractWithGatheringNode(spot, player);

      // 3. Start harvest channel using crafted rod
      const initialFishingExp = player.progression.getProficiencyStat('fishing')?.currentExp || 0;
      const initialFishCount = player.getItemCount('raw_fish');
      const initialReagentCount = player.getItemCount('aquatic_reagent');

      scene.interactWithGatheringNode(spot, [player]);

      return {
        initialRodCount,
        canInteractWithoutRod,
        companionCanInteract,
        preCraftWood,
        postCraftWood,
        preCraftSilk,
        postCraftSilk,
        preCraftBsExp,
        postCraftBsExp,
        rodCountAfterCrafting,
        canInteractWithCraftedRod,
        initialFishingExp,
        initialFishCount,
        initialReagentCount,
        playerPos: { x: player.gridPos.x, y: player.gridPos.y },
        isPlayerOnFloor: scene.gridMatrix[player.gridPos.y][player.gridPos.x] === 0,
        distToSpot: Math.hypot(player.gridPos.x - spotPos.x, player.gridPos.y - spotPos.y),
        isChanneling: player.state === 'channeling' || scene.activeGatherChannels.has(player)
      };
    }, researchGateCheck.firstSpot);

    console.log(`[E2E] Tool check: Without rod canInteract=${toolCheckResult.canInteractWithoutRod.canInteract}, reason="${toolCheckResult.canInteractWithoutRod.reason}"`);
    console.log(`[E2E] Blacksmith Craft: Stockpile Wood (${toolCheckResult.preCraftWood} -> ${toolCheckResult.postCraftWood}), Silk (${toolCheckResult.preCraftSilk} -> ${toolCheckResult.postCraftSilk})`);
    console.log(`[E2E] Blacksmith Craft: +20 Blacksmithing EXP (Total: ${toolCheckResult.postCraftBsExp}), Crafted Rod in Leader Inventory: ${toolCheckResult.rodCountAfterCrafting}`);
    assert.strictEqual(toolCheckResult.initialRodCount, 0, 'Player must not have fishing rod initially');
    assert.strictEqual(toolCheckResult.canInteractWithoutRod.canInteract, false, 'Player without rod must be blocked');
    assert.ok(toolCheckResult.canInteractWithoutRod.reason?.includes('Fishing Rod'), 'Block reason must specify Fishing Rod');
    if (toolCheckResult.companionCanInteract) {
      assert.strictEqual(toolCheckResult.companionCanInteract.canInteract, false, 'Companion without rod must be blocked');
    }
    assert.strictEqual(toolCheckResult.postCraftWood, toolCheckResult.preCraftWood - 3, '3 Wood consumed from stockpile');
    assert.strictEqual(toolCheckResult.postCraftSilk, toolCheckResult.preCraftSilk - 2, '2 Spider Silk consumed from stockpile');
    assert.strictEqual(toolCheckResult.postCraftBsExp, toolCheckResult.preCraftBsExp + 20, '+20 Blacksmithing EXP awarded to Leader');
    assert.strictEqual(toolCheckResult.rodCountAfterCrafting, 1, 'Crafted Fishing Rod landed in Leader inventory');
    assert.strictEqual(toolCheckResult.canInteractWithCraftedRod.canInteract, true, 'Player with crafted rod can interact');
    assert.strictEqual(toolCheckResult.isPlayerOnFloor, true, 'Player remains on floor tile');
    assert.strictEqual(toolCheckResult.isChanneling, true, 'Player is now channeling fishing spot with crafted rod');

    // Wait for channel completion (2500ms duration + margin)
    console.log('[E2E] Waiting for fishing channel to complete...');
    for (let step = 0; step < 6; step++) {
      await sleep(500);
      const chInfo = await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        const p = scene.player;
        const ch = scene.activeGatherChannels.get(p);
        return {
          playerState: p.state,
          hasChannel: !!ch,
          elapsedMs: ch?.elapsedMs,
          durationMs: ch?.durationMs
        };
      });
      console.log(`  [E2E Channel Debug ${step * 500}ms] state: ${chInfo.playerState}, hasChannel: ${chInfo.hasChannel}, elapsed: ${chInfo.elapsedMs}/${chInfo.durationMs}`);
    }

    const postHarvestCheck = await page.evaluate((spotPos) => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const spot = scene.gatheringNodes.find(n => n.x === spotPos.x && n.y === spotPos.y);
      const finalFishingExp = player.progression.getProficiencyStat('fishing')?.currentExp || 0;
      const finalFishCount = player.getItemCount('raw_fish');
      const finalReagentCount = player.getItemCount('aquatic_reagent');
      const finalRodCount = player.getItemCount('fishing_rod');
      const isHarvested = spot.isHarvested;
      const labelText = spot.label.text;

      return {
        finalFishingExp,
        finalFishCount,
        finalReagentCount,
        finalRodCount,
        isHarvested,
        labelText
      };
    }, researchGateCheck.firstSpot);

    console.log(`[E2E] Post-harvest: EXP: ${postHarvestCheck.finalFishingExp}, Rod Count: ${postHarvestCheck.finalRodCount} (NOT consumed), Label: "${postHarvestCheck.labelText}"`);
    assert.strictEqual(postHarvestCheck.isHarvested, true, 'Fishing spot must be marked isHarvested');
    assert.strictEqual(postHarvestCheck.labelText, 'Fished Out', 'Depleted label must be "Fished Out"');
    assert.strictEqual(postHarvestCheck.finalFishingExp >= toolCheckResult.initialFishingExp + 15, true, 'Player must receive +15 Fishing EXP');
    assert.strictEqual(postHarvestCheck.finalRodCount, 1, 'Fishing Rod must NOT be consumed upon successful harvest');
    assert.strictEqual(
      (postHarvestCheck.finalFishCount + postHarvestCheck.finalReagentCount) > (toolCheckResult.initialFishCount + toolCheckResult.initialReagentCount),
      true,
      'Player must receive yielded resource (Raw Fish or Aquatic Reagent)'
    );
    console.log('✓ Verified: crafted rod at Blacksmith, personal inventory requirement, non-consumption of rod, +15 EXP, and yield.');

    // --- TEST 5: Gathering Mode Multi-Node Queue Integration ---
    console.log('\n--- TEST 5: Gathering Mode Drag Marquee & Auto-Queue Integration ---');
    const gatheringModeResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const companion = scene.party[1];

      // Setup explanation:
      // - First spot from Test 4 is depleted.
      // - Party has 2 workers: Hero (carries crafted rod) and Valerie (no rod).
      // - We spawn 2 fresh unharvested fishing spots in the room water: spotA and spotB.
      let spotA = null;
      let spotB = null;
      for (const r of scene.dungeon.rooms) {
        if (r.width >= 6) {
          const wxA = r.x + 3;
          const wxB = r.x + 4;
          const wy = r.y + 2;
          scene.gridMatrix[wy][wxA] = 2; // Water
          scene.gridMatrix[wy][wxB] = 2; // Water
          spotA = scene.spawnGatheringNode(wxA, wy, 'fishing_spot');
          spotB = scene.spawnGatheringNode(wxB, wy, 'fishing_spot');
          break;
        }
      }

      // Enter gathering mode
      scene.toggleGatheringMode(true);
      const isModeActive = scene.isGatheringMode;

      // Marquee drag encompassing both fresh spots
      const tileSize = scene.tileSize;
      const minX = (spotA.x - 1) * tileSize;
      const maxX = (spotB.x + 1) * tileSize;
      const minY = (spotA.y - 1) * tileSize;
      const maxY = (spotA.y + 1) * tileSize;

      const capturedNodes = scene.getGatheringNodesInSelection(minX, maxX, minY, maxY)
        .filter(n => !n.isHarvested);

      // --- CASE 5A: Tool Carrier Present ---
      // Start queue with Hero (carries rod) and Valerie (no rod)
      scene.startGatheringQueue(capturedNodes);
      const heroAssignedNode = scene.gatheringWorkerNodeAssignments.get(player);
      const companionAssignedNode = companion ? scene.gatheringWorkerNodeAssignments.get(companion) : null;
      const remainingQueueCount = scene.gatheringQueue.length;
      const totalHandledCount = scene.gatheringWorkerNodeAssignments.size + remainingQueueCount;

      // --- CASE 5B: No Tool Carrier Available (Skip Toast Verification) ---
      // Remove rod from Hero, clear queue, intercept toasts, and attempt queueing spotC
      player.removeItem('fishing_rod', 1);
      scene.gatheringQueue = [];
      scene.gatheringWorkerNodeAssignments.clear();

      const interceptedToasts = [];
      const origToast = scene.hud.showToast.bind(scene.hud);
      scene.hud.showToast = (msg, type, dur) => {
        interceptedToasts.push({ msg, type });
        origToast(msg, type, dur);
      };

      let spotC = null;
      for (const r of scene.dungeon.rooms) {
        if (r.width >= 7) {
          const wxC = r.x + 5;
          const wy = r.y + 2;
          scene.gridMatrix[wy][wxC] = 2;
          spotC = scene.spawnGatheringNode(wxC, wy, 'fishing_spot');
          break;
        }
      }

      scene.startGatheringQueue([spotC]);
      const caseBQueueLength = scene.gatheringQueue.length;
      const skipToasts = interceptedToasts.filter(t => t.msg.includes('Skipped'));

      // Restore HUD and grant rod back to Hero
      scene.hud.showToast = origToast;
      player.addItem('fishing_rod', 1);

      return {
        isModeActive,
        capturedCount: capturedNodes.length,
        heroAssigned: !!heroAssignedNode,
        companionAssigned: !!companionAssignedNode,
        remainingQueueCount,
        totalHandledCount,
        caseBQueueLength,
        skipToastCount: skipToasts.length,
        skipToastMessage: skipToasts[0]?.msg || null
      };
    });

    console.log(`[E2E] Case 5A (Tool carrier present):`);
    console.log(`  Captured fresh unharvested spots: ${gatheringModeResult.capturedCount}`);
    console.log(`  Hero assigned (has rod): ${gatheringModeResult.heroAssigned} | Companion assigned (no rod): ${gatheringModeResult.companionAssigned}`);
    console.log(`  Remaining queued spots: ${gatheringModeResult.remainingQueueCount} | Total handled: ${gatheringModeResult.totalHandledCount}`);
    assert.strictEqual(gatheringModeResult.isModeActive, true, 'Gathering Mode must be active');
    assert.strictEqual(gatheringModeResult.capturedCount, 2, '2 fresh unharvested spots captured');
    assert.strictEqual(gatheringModeResult.heroAssigned, true, 'Hero (carrying rod) must be assigned a spot');
    assert.strictEqual(gatheringModeResult.companionAssigned, false, 'Companion (no rod) must not be assigned a spot');
    assert.strictEqual(gatheringModeResult.totalHandledCount, 2, 'Total spots handled must equal 2 (1 assigned + 1 queued)');

    console.log(`[E2E] Case 5B (No tool carriers in party):`);
    console.log(`  Nodes queued: ${gatheringModeResult.caseBQueueLength} | Skip toasts emitted: ${gatheringModeResult.skipToastCount}`);
    console.log(`  Toast message: "${gatheringModeResult.skipToastMessage}"`);
    assert.strictEqual(gatheringModeResult.caseBQueueLength, 0, 'No spots queued when no active worker carries rod');
    assert.strictEqual(gatheringModeResult.skipToastCount, 1, 'Exactly ONE skip toast emitted');
    assert.ok(gatheringModeResult.skipToastMessage?.includes('Skipped 1 node(s)'), 'Skip toast text matches requirement');
    console.log('✓ Gathering Mode verified: tool carrier receives assignment, queue preserves unassigned nodes, and single skip toast emitted when no carrier exists.');

    // --- TEST 6: Tier 0 Angler Class Unlock at Level 10 ---
    console.log('\n--- TEST 6: Tier 0 Angler Class Unlock Verification ---');
    const classUnlockResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;

      // Check initial angler unlock status
      const initialUnlocked = player.progression.isClassUnlocked('angler');

      // Grant sufficient fishing EXP to reach level 10
      player.progression.addProficiencyExp('fishing', 1500);
      player.progression.checkClassUnlocks();

      const fishingLevel = player.progression.getProficiencyLevel('fishing');
      const postUnlocked = player.progression.isClassUnlocked('angler');
      const unlockedClasses = player.progression.getSnapshotData().unlockedClasses;

      return {
        initialUnlocked,
        fishingLevel,
        postUnlocked,
        unlockedClasses
      };
    });

    console.log(`[E2E] Fishing Level: ${classUnlockResult.fishingLevel}, Angler Unlocked: ${classUnlockResult.postUnlocked}`);
    assert.strictEqual(classUnlockResult.initialUnlocked, false, 'Angler must not be unlocked initially');
    assert.strictEqual(classUnlockResult.postUnlocked, true, 'Angler class must unlock when Fishing reaches level 10');
    console.log('✓ Successfully unlocked Tier 0 Angler class upon reaching Fishing level 10.');

    console.log('\n================================================================');
    console.log('🎉 ALL LIVE BROWSER FISHING MILESTONE VERIFICATIONS PASSED! 🎉');
    console.log('================================================================\n');
  } finally {
    await browser.close();
    server.kill();
  }
}

runLiveVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
  });
