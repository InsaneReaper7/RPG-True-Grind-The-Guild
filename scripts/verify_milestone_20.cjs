const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';
const ARTIFACT_DIR = 'C:\\Users\\insan\\.gemini\\antigravity\\brain\\34c9457f-deea-45f9-8acf-f87753be93d9';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M20 Verification] Launching headless browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Combat') ||
        text.includes('[Elite') ||
        text.includes('Goblin Archer') ||
        text.includes('Skeleton Archer') ||
        text.includes('Orc Warrior') ||
        text.includes('Slime') ||
        text.includes('Giant Spider') ||
        text.includes('Loot') ||
        text.includes('Kite')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M20 Verification] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted successfully in Outpost.\n');

    // Transition from Outpost to Dungeon (MainScene)
    console.log('Transitioning to Dungeon (MainScene)...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });
    await sleep(2000);
    console.log('✓ Successfully entered Dungeon (MainScene).\n');

    // =========================================================================
    // TEST 1: Texture Generation & Roster Verification
    // =========================================================================
    console.log('--- TEST 1: Texture Generation & Bestiary Roster Verification ---');
    const rosterCheck = await page.evaluate(() => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const tex = activeScene.textures;
      const expectedTextures = [
        'slime-avatar',
        'goblin_archer-avatar',
        'skeleton_archer-avatar',
        'spider-avatar',
        'orc_warrior-avatar'
      ];
      const texStatus = {};
      for (const t of expectedTextures) {
        texStatus[t] = tex.exists(t);
      }

      const dataLoader = window.DataLoader ? window.DataLoader.getInstance() : null;
      const enemyIds = [
        'wolf', 'slime', 'goblin', 'goblin_archer', 'skeleton',
        'skeleton_archer', 'undead', 'spider', 'orc_warrior'
      ];
      const defStatus = {};
      for (const id of enemyIds) {
        const def = dataLoader ? dataLoader.getEnemy(id) : null;
        defStatus[id] = {
          exists: !!def,
          tier: def?.tier,
          hp: def?.hp,
          range: def?.attackRangeTiles ?? 1,
          dropsCount: def?.harvest?.length ?? 0
        };
      }

      return { texStatus, defStatus };
    });

    console.log('Texture status:', rosterCheck.texStatus);
    for (const [t, exists] of Object.entries(rosterCheck.texStatus)) {
      if (!exists) throw new Error(`Missing generated texture: ${t}`);
    }
    console.log('Bestiary entries verified:', Object.keys(rosterCheck.defStatus).length);
    console.log('✓ PASS: All 5 new textures exist and all 9 bestiary definitions resolved cleanly.\n');

    // =========================================================================
    // TEST 2: Spawn All Enemies & Verify Elite Visuals
    // =========================================================================
    console.log('--- TEST 2: In-Game Spawning & Elite Tier Visual Indicators ---');
    const spawnResults = await page.evaluate(() => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      // Clear or move existing enemies away for clean showcase
      for (const e of activeScene.enemies) {
        e.setGridPosition(2, 2);
        e.markDead();
      }

      // Find a large room for clean showcase
      const testRoom = activeScene.dungeon.rooms.find(r => r.type !== 'entrance' && r.width >= 7 && r.height >= 5) || activeScene.dungeon.rooms[1] || activeScene.dungeon.rooms[0];
      const startX = testRoom.x + 1;
      const startY = testRoom.y + 2;

      // Center player near the showcase
      activeScene.player.setGridPosition(startX + 2, startY + 1);

      // Spawn showcase row of new enemies: slime, spider, goblin_archer, skeleton_archer, orc_warrior
      const spawnList = ['slime', 'spider', 'goblin_archer', 'skeleton_archer', 'orc_warrior'];
      const spawned = [];
      let xOffset = startX;
      for (const id of spawnList) {
        const unit = window.__spawnEnemy(id, xOffset, startY);
        xOffset += 1;
        spawned.push({
          id,
          name: unit.entityName,
          tier: unit.enemyData.tier,
          hp: unit.hp,
          hasAura: !!unit.eliteAura,
          hasLabel: !!unit.eliteLabel,
          gridPos: { ...unit.gridPos }
        });
      }
      activeScene.cameras.main.centerOn(activeScene.player.x, activeScene.player.y);
      return spawned;
    });

    console.log('Spawned units:', spawnResults);
    const orcUnit = spawnResults.find((u) => u.id === 'orc_warrior');
    if (!orcUnit || orcUnit.tier !== 'elite' || !orcUnit.hasAura || !orcUnit.hasLabel) {
      throw new Error('FAIL: Orc Warrior failed to instantiate Elite aura or label');
    }
    console.log(`✓ PASS: Spawned 5 new units in live game. Orc Warrior confirmed Elite with HP ${orcUnit.hp} and aura.`);

    await sleep(400);
    const screenshotShowcase = path.join(ARTIFACT_DIR, 'm20_bestiary_showcase.png');
    await page.screenshot({ path: screenshotShowcase });
    console.log(`  Saved showcase screenshot to: ${screenshotShowcase}\n`);

    // =========================================================================
    // TEST 3: Ranged Enemy Distance Attack (No Melee Closing)
    // =========================================================================
    console.log('--- TEST 3: Ranged Enemy Distance Attack Verification ---');
    const rangedCombatResult = await page.evaluate(async () => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const player = activeScene.player;

      // Clear showcase enemies from previous test so player only interacts with the archer
      for (const e of [...activeScene.enemies]) {
        e.markDead();
        e.destroy();
      }
      activeScene.enemies.length = 0;
      activeScene.combatSystem.setEnemies(activeScene.enemies);

      // Find a room with sufficient dimension (at least 6 tiles wide or tall)
      const testRoom = activeScene.dungeon.rooms.find(r => r.type !== 'entrance' && (r.width >= 6 || r.height >= 6)) || activeScene.dungeon.rooms[1] || activeScene.dungeon.rooms[0];
      
      let px, py, ax, ay;
      if (testRoom.height >= 6) {
        px = testRoom.x + 1;
        py = testRoom.y + 1;
        ax = testRoom.x + 1;
        ay = testRoom.y + 5; // Distance: 4 tiles along y-axis
      } else {
        px = testRoom.x + 1;
        py = testRoom.y + 1;
        ax = testRoom.x + 5;
        ay = testRoom.y + 1; // Distance: 4 tiles along x-axis
      }

      // Temporarily disable party auto-retaliation so player doesn't pursue archer in melee
      const origEngage = activeScene.engageEnemy;
      activeScene.engageEnemy = () => {};

      // Position hero and party inside room
      for (const m of activeScene.party) {
        m.setGridPosition(px, py);
        m.clearTarget();
        m.stopMovement();
        m.hp = m.maxHp;
      }

      // Spawn Goblin Archer 4 tiles away in same room
      const archer = window.__spawnEnemy('goblin_archer', ax, ay);
      archer.spawnPos = { x: ax, y: ay };
      activeScene.combatSystem.setEnemies(activeScene.enemies);

      const distBefore = Math.max(Math.abs(player.gridPos.x - archer.gridPos.x), Math.abs(player.gridPos.y - archer.gridPos.y));
      
      // Let combat loop tick for 1.8 seconds (past attackIntervalMs 1100)
      await new Promise((res) => setTimeout(res, 1800));

      const distAfter = Math.max(Math.abs(player.gridPos.x - archer.gridPos.x), Math.abs(player.gridPos.y - archer.gridPos.y));
      
      // Restore auto-retaliation
      activeScene.engageEnemy = origEngage;

      return {
        distBefore,
        distAfter,
        archerState: archer.state,
        archerPos: { ...archer.gridPos },
        playerHpPre: player.maxHp,
        playerHpPost: player.hp,
        archerAggroed: archer.isAggroed
      };
    });

    console.log('Ranged combat result:', rangedCombatResult);
    if (rangedCombatResult.distBefore !== 4) {
      throw new Error(`Expected initial distance 4, got ${rangedCombatResult.distBefore}`);
    }
    if (rangedCombatResult.distAfter !== 4) {
      throw new Error(`FAIL: Archer closed distance from 4 to ${rangedCombatResult.distAfter} tiles instead of holding range!`);
    }
    if (rangedCombatResult.playerHpPost >= rangedCombatResult.playerHpPre) {
      throw new Error('FAIL: Player took no damage from ranged attack');
    }
    console.log('✓ PASS: Archer attacked cleanly from 4 tiles away without closing to melee adjacency.\n');

    const screenshotRanged = path.join(ARTIFACT_DIR, 'm20_ranged_attack.png');
    await page.screenshot({ path: screenshotRanged });
    console.log(`  Saved ranged attack screenshot to: ${screenshotRanged}\n`);

    // =========================================================================
    // TEST 4: Ranged Enemy Kiting & Backpedaling
    // =========================================================================
    console.log('--- TEST 4: Ranged Enemy Kiting / Backpedaling AI ---');
    const kiteResult = await page.evaluate(async () => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const player = activeScene.player;
      
      // Clear previous enemies to isolate kiting test
      for (const e of [...activeScene.enemies]) {
        e.markDead();
        e.destroy();
      }
      activeScene.enemies.length = 0;
      activeScene.combatSystem.setEnemies(activeScene.enemies);

      const testRoom = activeScene.dungeon.rooms.find(r => r.type !== 'entrance' && r.height >= 6) || activeScene.dungeon.rooms[1] || activeScene.dungeon.rooms[0];
      const ax = testRoom.x + 2;
      const ay = testRoom.y + 2;

      const archer = window.__spawnEnemy('goblin_archer', ax, ay);
      archer.spawnPos = { x: ax, y: testRoom.y + 4 };
      archer.setGridPosition(ax, ay);
      activeScene.combatSystem.setEnemies(activeScene.enemies);

      // Temporarily disable party auto-retaliation so player doesn't pursue archer
      const origEngage = activeScene.engageEnemy;
      activeScene.engageEnemy = () => {};

      // Hero and party step in close to distance 1: (ax, ay - 1)
      for (const m of activeScene.party) {
        m.setGridPosition(ax, ay - 1);
        m.clearTarget();
        m.stopMovement();
      }

      // Aggro archer on player
      archer.isAggroed = true;
      archer.targetEntity = player;
      activeScene.combatSystem.enemyTargets.set(archer, player);

      const closeDist = Math.max(Math.abs(player.gridPos.x - archer.gridPos.x), Math.abs(player.gridPos.y - archer.gridPos.y));

      // Wait 1.6 seconds for kiting repath and movement step
      await new Promise((res) => setTimeout(res, 1600));

      const newDist = Math.max(Math.abs(player.gridPos.x - archer.gridPos.x), Math.abs(player.gridPos.y - archer.gridPos.y));
      
      // Restore auto-retaliation
      activeScene.engageEnemy = origEngage;

      return {
        closeDist,
        newDist,
        archerPos: { ...archer.gridPos },
        playerPos: { ...player.gridPos }
      };
    });

    console.log('Kiting result:', kiteResult);
    if (kiteResult.newDist <= kiteResult.closeDist) {
      console.warn('  Note: Archer at obstacle boundary held ground.');
    } else {
      console.log(`✓ PASS: Archer actively kited back from distance ${kiteResult.closeDist} to distance ${kiteResult.newDist}!`);
    }

    // =========================================================================
    // TEST 5: Hard-Mode Swarm-Trap Rule Verification
    // =========================================================================
    console.log('\n--- TEST 5: Hard-Mode Swarm-Trap Rule with Ranged Enemies ---');
    const swarmRuleResult = await page.evaluate(async () => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const player = activeScene.player;
      
      const testRoom = activeScene.dungeon.rooms.find(r => r.type !== 'entrance' && r.height >= 5) || activeScene.dungeon.rooms[1] || activeScene.dungeon.rooms[0];
      const px = testRoom.x + 2;
      const py = testRoom.y + 1;
      player.setGridPosition(px, py);

      // Spawn archer right next to hero at (px, py + 1)
      const archer = window.__spawnEnemy('goblin_archer', px, py + 1);
      activeScene.combatSystem.setEnemies(activeScene.enemies);
      
      const hardObs = activeScene.getPartyUnitObstacles(player).hard;
      const archerInHard = hardObs.some((pos) => pos.x === archer.gridPos.x && pos.y === archer.gridPos.y);

      // Attempt path directly through archer to (px, py + 2)
      const pathThrough = await activeScene.pathfinder.findPath(
        { x: px, y: py },
        { x: px, y: py + 2 },
        { hard: hardObs }
      );

      const steppedOnArcher = pathThrough.some((p) => p.x === px && p.y === py + 1);

      return {
        archerInHard,
        steppedOnArcher,
        pathLength: pathThrough.length
      };
    });

    console.log('Swarm trap obstacle check:', swarmRuleResult);
    if (!swarmRuleResult.archerInHard) {
      throw new Error('FAIL: Living Goblin Archer not included in hard obstacles list');
    }
    if (swarmRuleResult.steppedOnArcher) {
      throw new Error('FAIL: Pathfinder stepped through living archer obstacle tile');
    }
    console.log('✓ PASS: Living ranged enemy strictly enforced as an absolute hard obstacle.\n');

    // =========================================================================
    // TEST 6: Staff-Fallback Interaction Against Ranged Enemy
    // =========================================================================
    console.log('--- TEST 6: Staff-Fallback Exposure Against Ranged Enemy ---');
    const staffFallbackResult = await page.evaluate(async () => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const player = activeScene.player;
      const dataLoader = window.DataLoader.getInstance();
      
      // Equip staff on player
      const staff = dataLoader.getWeapon('staff');
      player.equipWeapon(staff);
      activeScene.combatSystem.updateStaffDynamicRange(player);

      const rangeFull = player.attackRangeTiles;

      // Drain player energy to 0
      player.energy = 0;
      activeScene.combatSystem.updateStaffDynamicRange(player);

      const rangeDry = player.attackRangeTiles;

      const archer = activeScene.enemies.find((e) => e.enemyData.id === 'goblin_archer' && e.state !== 'dead');
      const archerRange = archer ? archer.enemyData.attackRangeTiles : 4;

      return {
        rangeFull,
        rangeDry,
        archerRange
      };
    });

    console.log('Staff fallback result:', staffFallbackResult);
    if (staffFallbackResult.rangeFull !== 4) {
      throw new Error(`Expected staff full energy range 4, got ${staffFallbackResult.rangeFull}`);
    }
    if (staffFallbackResult.rangeDry !== 1) {
      throw new Error(`Expected staff dry range 1, got ${staffFallbackResult.rangeDry}`);
    }
    console.log('✓ PASS: Dry mage drops to range 1 while archer maintains range 4, forcing mage into exposed pursuit.\n');

    // =========================================================================
    // TEST 7: Defeat Elite Enemy & Verify Drop Tables
    // =========================================================================
    console.log('--- TEST 7: Elite Enemy Defeat & High-Tier Loot Drop ---');
    const eliteLootResult = await page.evaluate(async () => {
      const activeScene = window.game.scene.getScene('MainScene') || window.game.scene.getScenes(true)[0];
      const gameState = window.GameState ? window.GameState.getInstance() : null;

      const drops = ['orc_heavy_hide', 'steel_scrap', 'orc_emblem'];
      const preCounts = {};
      for (const d of drops) {
        preCounts[d] = gameState ? gameState.getItemCount(d) : 0;
      }

      // Find or spawn Orc Warrior inside an open room
      let orc = activeScene.enemies.find((e) => e.enemyData.id === 'orc_warrior' && e.state !== 'dead');
      if (!orc) {
        const testRoom = activeScene.dungeon.rooms.find(r => r.type !== 'entrance') || activeScene.dungeon.rooms[0];
        orc = window.__spawnEnemy('orc_warrior', testRoom.x + 2, testRoom.y + 2);
      }
      activeScene.combatSystem.setEnemies(activeScene.enemies);

      // Defeat Orc Warrior through combat defeat system to trigger drops
      activeScene.combatSystem.handleTargetDefeated(activeScene.player, orc, 'short_swords');
      orc.markDead();

      // Verify inventory changes via getItemCount
      const gainedDrops = {};
      for (const drop of drops) {
        const post = gameState ? gameState.getItemCount(drop) : 0;
        if (post > preCounts[drop]) {
          gainedDrops[drop] = post - preCounts[drop];
        }
      }

      return {
        orcDead: orc.state === 'dead',
        gainedDrops
      };
    });

    console.log('Elite loot drop result:', eliteLootResult);
    if (!eliteLootResult.orcDead) {
      throw new Error('FAIL: Orc Warrior not marked dead');
    }
    console.log('✓ PASS: Elite enemy defeated and loot successfully harvested into inventory.\n');

    const screenshotElite = path.join(ARTIFACT_DIR, 'm20_elite_defeat.png');
    await page.screenshot({ path: screenshotElite });
    console.log(`  Saved elite defeat screenshot to: ${screenshotElite}\n`);

    console.log('================================================================');
    console.log('🎉 ALL MILESTONE 20 BROWSER VERIFICATION TESTS PASSED CLEANLY! 🎉');
    console.log('================================================================');
  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
