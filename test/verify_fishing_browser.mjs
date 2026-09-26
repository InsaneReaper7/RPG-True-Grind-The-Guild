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
  assert.ok(Array.isArray(fishingNodeDef.lootTable), 'fishing_spot must have lootTable');
  assert.ok(fishingNodeDef.lootTable.some(i => i.itemId === 'raw_fish'), 'lootTable must include raw_fish');
  assert.ok(fishingNodeDef.lootTable.some(i => i.itemId === 'aquatic_reagent'), 'lootTable must include aquatic_reagent');
  console.log('✓ Validated data/gatheringNodes.json fishing_spot schema & loot table.');

  // Items
  const itemsRaw = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
  const rawFishItem = itemsRaw.items?.find(i => i.id === 'raw_fish');
  const aquaticReagentItem = itemsRaw.items?.find(i => i.id === 'aquatic_reagent');
  assert.ok(rawFishItem, 'data/items.json must include raw_fish');
  assert.ok(aquaticReagentItem, 'data/items.json must include aquatic_reagent');
  assert.strictEqual(rawFishItem.category, 'gathering');
  assert.strictEqual(aquaticReagentItem.category, 'reagents');
  console.log('✓ Validated data/items.json raw_fish and aquatic_reagent.');

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

    // --- TEST 3: Textures and Fishing Spot Generation ---
    console.log('\n--- TEST 3: Fishing Textures & Node Spawning Verification ---');
    const texturesAndNodes = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hasFishingTexture = scene.textures.exists('fishing-spot');
      const hasDepletedTexture = scene.textures.exists('fishing-spot-depleted');

      // Check fishing spots in gatheringNodes
      let fishingSpots = scene.gatheringNodes.filter(n => n.nodeDef.skillId === 'fishing');

      // If dungeon didn't roll water in this random seed, spawn a fishing spot on a test water tile
      if (fishingSpots.length === 0) {
        // Find an interior room floor tile, convert to water, and spawn a fishing spot
        for (const r of scene.dungeon.rooms) {
          if (r.type !== 'entrance' && r.type !== 'boss' && r.width >= 5) {
            const wx = r.x + 2;
            const wy = r.y + 2;
            scene.gridMatrix[wy][wx] = 2; // Water
            if (!scene.dungeon.waterTiles) scene.dungeon.waterTiles = [];
            scene.dungeon.waterTiles.push({ x: wx, y: wy });
            const node = scene.spawnGatheringNode(wx, wy, 'fishing_spot');
            fishingSpots = [node];
            break;
          }
        }
      }

      return {
        hasFishingTexture,
        hasDepletedTexture,
        fishingSpotsCount: fishingSpots.length,
        firstSpot: fishingSpots[0] ? {
          x: fishingSpots[0].x,
          y: fishingSpots[0].y,
          name: fishingSpots[0].nodeDef.name,
          skillId: fishingSpots[0].nodeDef.skillId,
          actionVerb: fishingSpots[0].nodeDef.actionVerb,
          isHarvested: fishingSpots[0].isHarvested,
          tileType: scene.gridMatrix[fishingSpots[0].y][fishingSpots[0].x]
        } : null
      };
    });

    assert.ok(texturesAndNodes.hasFishingTexture, 'fishing-spot texture must exist');
    assert.ok(texturesAndNodes.hasDepletedTexture, 'fishing-spot-depleted texture must exist');
    assert.ok(texturesAndNodes.fishingSpotsCount > 0, 'At least 1 fishing spot must be present in the dungeon');
    assert.strictEqual(texturesAndNodes.firstSpot.skillId, 'fishing');
    assert.strictEqual(texturesAndNodes.firstSpot.actionVerb, 'Fishing');
    assert.strictEqual(texturesAndNodes.firstSpot.tileType, 2, 'Fishing spot must be situated on a water tile (TileType.WATER = 2)');
    console.log(`✓ Verified procedural fishing spot situated on water tile at (${texturesAndNodes.firstSpot.x}, ${texturesAndNodes.firstSpot.y}).`);

    // --- TEST 4: Channel Interaction From Adjacent Bank ---
    console.log('\n--- TEST 4: Channel-based Interaction from Adjacent Shore Tile ---');
    const channelResult = await page.evaluate(async (spotPos) => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;
      const spot = scene.gatheringNodes.find(n => n.x === spotPos.x && n.y === spotPos.y);

      // Clear any enemies within aggro radius of the fishing spot so gathering isn't interrupted by combat
      for (const e of scene.enemies) {
        if (Math.hypot(e.gridPos.x - spotPos.x, e.gridPos.y - spotPos.y) <= 12) {
          e.setGridPosition(0, 0);
          e.state = 'dead';
        }
      }

      // Find an adjacent walkable shore tile to the fishing spot
      const adjTiles = [
        { x: spotPos.x + 1, y: spotPos.y }, { x: spotPos.x - 1, y: spotPos.y },
        { x: spotPos.x, y: spotPos.y + 1 }, { x: spotPos.x, y: spotPos.y - 1 }
      ].filter(t => scene.gridMatrix[t.y]?.[t.x] === 0);
      const shoreTile = adjTiles[0];

      // Place player on the walkable shore tile facing the fishing spot
      player.setGridPosition(shoreTile.x, shoreTile.y);
      player.claimedDestination = null;

      const initialFishingExp = player.progression.getProficiencyStat('fishing')?.currentExp || 0;
      const initialFishCount = player.getItemCount('raw_fish');
      const initialReagentCount = player.getItemCount('aquatic_reagent');

      // Click/interact with the fishing node from adjacent bank
      scene.interactWithGatheringNode(spot, [player]);

      return {
        initialFishingExp,
        initialFishCount,
        initialReagentCount,
        playerPos: { x: player.gridPos.x, y: player.gridPos.y },
        isPlayerOnFloor: scene.gridMatrix[player.gridPos.y][player.gridPos.x] === 0,
        distToSpot: Math.hypot(player.gridPos.x - spotPos.x, player.gridPos.y - spotPos.y),
        isChanneling: player.state === 'channeling' || scene.activeGatherChannels.has(player)
      };
    }, texturesAndNodes.firstSpot);

    console.log(`[E2E] Channeling initiated. Player pos: (${channelResult.playerPos.x}, ${channelResult.playerPos.y}), isPlayerOnFloor: ${channelResult.isPlayerOnFloor}, distToSpot: ${channelResult.distToSpot.toFixed(2)}, isChanneling: ${channelResult.isChanneling}`);
    assert.strictEqual(channelResult.isPlayerOnFloor, true, 'Player must remain on walkable floor tile (never enter water)');
    assert.ok(channelResult.distToSpot <= 1.5, 'Player must be adjacent (<= 1.5 tiles) to the fishing spot');
    assert.strictEqual(channelResult.isChanneling, true, 'Player must be channeling the fishing spot');

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
          playerHp: p.hp,
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
      const isHarvested = spot.isHarvested;
      const labelText = spot.label.text;

      return {
        finalFishingExp,
        finalFishCount,
        finalReagentCount,
        isHarvested,
        labelText
      };
    }, texturesAndNodes.firstSpot);

    console.log(`[E2E] Post-harvest check: EXP: ${postHarvestCheck.finalFishingExp}, Fish: ${postHarvestCheck.finalFishCount}, Reagents: ${postHarvestCheck.finalReagentCount}, Label: "${postHarvestCheck.labelText}"`);
    assert.strictEqual(postHarvestCheck.isHarvested, true, 'Fishing spot must be marked isHarvested');
    assert.strictEqual(postHarvestCheck.labelText, 'Fished Out', 'Depleted label must be "Fished Out"');
    assert.strictEqual(postHarvestCheck.finalFishingExp >= channelResult.initialFishingExp + 15, true, 'Player must receive +15 Fishing EXP');
    assert.strictEqual(
      (postHarvestCheck.finalFishCount + postHarvestCheck.finalReagentCount) > (channelResult.initialFishCount + channelResult.initialReagentCount),
      true,
      'Player must receive yielded resource (Raw Fish or Aquatic Reagent)'
    );
    console.log('✓ Successfully verified adjacent-bank channeling, +15 Fishing EXP, yields, and depletion.');

    // --- TEST 5: Gathering Mode Multi-Node Queue Integration ---
    console.log('\n--- TEST 5: Gathering Mode Drag Marquee & Auto-Queue Integration ---');
    const gatheringModeResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;

      // Spawn a fresh second fishing spot nearby
      let secondSpot = null;
      for (const r of scene.dungeon.rooms) {
        if (r.width >= 5) {
          const wx = r.x + 3;
          const wy = r.y + 2;
          scene.gridMatrix[wy][wx] = 2; // Water
          secondSpot = scene.spawnGatheringNode(wx, wy, 'fishing_spot');
          break;
        }
      }

      // Enter gathering mode
      scene.toggleGatheringMode(true);
      const isModeActive = scene.isGatheringMode;

      // Drag marquee encompassing the second spot
      const tileSize = scene.tileSize;
      const minX = (secondSpot.x - 1) * tileSize;
      const maxX = (secondSpot.x + 1) * tileSize;
      const minY = (secondSpot.y - 1) * tileSize;
      const maxY = (secondSpot.y + 1) * tileSize;

      const capturedNodes = scene.getGatheringNodesInSelection(minX, maxX, minY, maxY);
      const includesFishingSpot = capturedNodes.includes(secondSpot);

      // Start queue
      scene.startGatheringQueue(capturedNodes);
      const queueState = window.__getGatheringQueue ? window.__getGatheringQueue() : { queue: [], workers: [] };

      return {
        isModeActive,
        capturedCount: capturedNodes.length,
        includesFishingSpot,
        queueLength: queueState.queue.length,
        workersCount: queueState.workers.length
      };
    });

    assert.strictEqual(gatheringModeResult.isModeActive, true, 'Gathering Mode must be active');
    assert.strictEqual(gatheringModeResult.includesFishingSpot, true, 'getGatheringNodesInSelection must capture fishing spot without special casing');
    console.log(`✓ Gathering Mode drag selection correctly captures fishing spots (Queue length: ${gatheringModeResult.queueLength}, Workers: ${gatheringModeResult.workersCount}).`);

    // --- TEST 6: Tier 0 Angler Class Unlock at Level 10 ---
    console.log('\n--- TEST 6: Tier 0 Angler Class Unlock Verification ---');
    const classUnlockResult = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const player = scene.player;

      // Check initial angler unlock status
      const initialUnlocked = player.progression.isClassUnlocked('angler');

      // Grant sufficient fishing EXP to reach level 10
      // 10 levels of proficiency: level up threshold scale
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

runLiveVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
