import Phaser from 'phaser';
import { DataLoader } from '../utils/DataLoader';
import { TextureGenerator } from '../utils/TextureGenerator';
import { Pathfinder } from '../utils/Pathfinder';
import { DungeonGenerator } from '../utils/DungeonGenerator';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Entity } from '../entities/Entity';
import { CombatSystem } from '../systems/CombatSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { HUD } from '../ui/HUD';
import { GameState } from '../systems/GameState';
import { GridPos, EnemyDef, GeneratedDungeon, DungeonRoom, GatheringNodeDef } from '../types/game';
import { HiddenSkillSystem } from '../systems/HiddenSkillSystem';
import { TileClaimDebugOverlay } from '../ui/TileClaimDebugOverlay';

export interface GatheringNode {
  x: number;
  y: number;
  nodeDef: GatheringNodeDef;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  isHarvested: boolean;
  respawnTimer?: Phaser.Time.TimerEvent;
}

export type ForagingBush = GatheringNode;

export interface ActiveGatherChannel {
  character: Player;
  node: GatheringNode;
  durationMs: number;
  elapsedMs: number;
  barContainer: Phaser.GameObjects.Container;
  barBg: Phaser.GameObjects.Graphics;
  barFill: Phaser.GameObjects.Graphics;
  labelText: Phaser.GameObjects.Text;
}

export class MainScene extends Phaser.Scene {
  private mapWidth: number = 48;
  private mapHeight: number = 48;
  private tileSize: number = 32;

  private dungeon!: GeneratedDungeon;
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private pathfinder!: Pathfinder;
  public party: Player[] = [];
  public get player(): Player {
    return this.party[0];
  }
  private gridMatrix: number[][] = [];
  private enemies: Enemy[] = [];
  private combatSystem!: CombatSystem;
  private progressionSystem!: ProgressionSystem;
  private hud!: HUD;
  private tileClaimOverlay!: TileClaimDebugOverlay;

  // Milestone 16: Floor Timer & Respawn Overhaul
  public debugAutoRespawnEnabled: boolean = false;
  private floorTimerDurationMs: number = 300000;
  private floorTimerRemainingMs: number = 300000;

  // Milestone 17: Gathering Channel & Debug Respawn
  public debugGatheringRespawnEnabled: boolean = false;
  public gatheringNodes: GatheringNode[] = [];
  public get foragingBushes(): GatheringNode[] {
    return this.gatheringNodes;
  }
  public set foragingBushes(nodes: GatheringNode[]) {
    this.gatheringNodes = nodes;
  }
  private activeGatherChannels: Map<Player, ActiveGatherChannel> = new Map();

  private portalSprite!: Phaser.GameObjects.Sprite;
  private portalPos: GridPos = { x: 2, y: 2 };
  private isTransitioning: boolean = false;

  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private rKey!: Phaser.Input.Keyboard.Key;
  private kKey!: Phaser.Input.Keyboard.Key;
  private xKey!: Phaser.Input.Keyboard.Key;
  private zKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;
  private tKey!: Phaser.Input.Keyboard.Key;
  private hKey!: Phaser.Input.Keyboard.Key;

  private isCameraLocked: boolean = true;
  private targetReticle!: Phaser.GameObjects.Sprite;

  constructor() {
    super({ key: 'MainScene' });
  }

  public preload(): void {
    // Generate procedural placeholder textures
    TextureGenerator.generatePlaceholderTextures(this, this.tileSize);
  }

  public create(): void {
    this.isTransitioning = false;
    this.enemies = [];

    // Clean up previous overlay, gathering channels, or timers if restarting scene
    if (this.tileClaimOverlay) {
      this.tileClaimOverlay.destroy();
    }
    for (const channel of this.activeGatherChannels.values()) {
      channel.barContainer.destroy();
    }
    this.activeGatherChannels.clear();
    for (const node of this.gatheringNodes) {
      if (node.respawnTimer) {
        node.respawnTimer.remove();
      }
    }
    this.gatheringNodes = [];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.tileClaimOverlay) {
        this.tileClaimOverlay.destroy();
      }
      for (const channel of this.activeGatherChannels.values()) {
        channel.barContainer.destroy();
      }
      this.activeGatherChannels.clear();
      for (const node of this.gatheringNodes) {
        if (node.respawnTimer) {
          node.respawnTimer.remove();
        }
      }
      this.gatheringNodes = [];
      if (this.hud) {
        this.hud.destroy();
      }
    });

    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const startingWeapon = dataLoader.getWeapon(playerData.startingWeaponId);
    const classesData = dataLoader.getClassesData();

    if (!startingWeapon) {
      throw new Error(`Starting weapon '${playerData.startingWeaponId}' not found in data/weapons.json`);
    }

    // 1. Procedural Dungeon Generation (Milestone 13)
    const dungeonConfig = dataLoader.getDungeonConfig();
    this.dungeon = DungeonGenerator.generate(dungeonConfig);
    this.mapWidth = this.dungeon.width;
    this.mapHeight = this.dungeon.height;
    this.gridMatrix = this.dungeon.gridMatrix;
    this.portalPos = this.dungeon.portalPos;

    // Expose generated dungeon for debug and verification inspection
    (window as any).__lastGeneratedDungeon = this.dungeon;

    // 2. Tilemap Creation using Phaser Tilemap API
    this.tilemap = this.make.tilemap({
      data: this.gridMatrix,
      tileWidth: this.tileSize,
      tileHeight: this.tileSize
    });

    const tilesetWalkable = this.tilemap.addTilesetImage('tile-walkable', 'tile-walkable');
    const tilesetObstacle = this.tilemap.addTilesetImage('tile-obstacle', 'tile-obstacle');

    if (tilesetWalkable && tilesetObstacle) {
      this.tilemap.createLayer(0, [tilesetWalkable, tilesetObstacle], 0, 0);
    }

    // 3. Initialize Pathfinder with fresh grid
    this.pathfinder = new Pathfinder(this.gridMatrix);

    // 4. Initialize Systems & HUD
    this.progressionSystem = new ProgressionSystem(classesData, playerData.name || 'Hero');
    this.hud = new HUD();
    this.hud.setLocation('Dungeon Floor 1', false);
    GameState.getInstance().setSafeZone(false);

    // Progression & Skill Discovery Notifications
    this.bindProgressionEvents(this.progressionSystem, playerData.name || 'Hero');

    // 5. Spawn Party (Hero & Companions) around dynamic entrance portal
    const partySnapshots = GameState.getInstance().getPartySnapshots();
    this.party = [];

    if (partySnapshots.length === 0) {
      const spawnTile = this.findOpenAdjacentTile(this.portalPos);
      const hero = new Player(this, spawnTile.x, spawnTile.y, playerData, startingWeapon, this.tileSize, 'player-avatar', this.progressionSystem);
      hero.id = 'hero';
      hero.entityName = playerData.name || 'Hero';
      this.party.push(hero);
      GameState.getInstance().restoreTo(hero, this.progressionSystem, this.time.now);
    } else {
      const claimedSpawn = new Set<string>();
      for (let i = 0; i < partySnapshots.length; i++) {
        const snap = partySnapshots[i];
        const snapWeapon = dataLoader.getWeapon(snap.equippedWeaponId) || startingWeapon;
        const memberProg = (i === 0) ? this.progressionSystem : new ProgressionSystem(classesData, snap.name || `Companion ${i}`);
        if (i > 0) {
          this.bindProgressionEvents(memberProg, snap.name || `Companion ${i}`);
        }
        const snapAvatar = snap.avatarTextureKey || (i === 0 ? 'player-avatar' : 'companion-avatar');
        const spawnTile = this.findOpenAdjacentTile(this.portalPos, undefined, claimedSpawn);
        claimedSpawn.add(`${spawnTile.x},${spawnTile.y}`);

        const member = new Player(this, spawnTile.x, spawnTile.y, playerData, snapWeapon, this.tileSize, snapAvatar, memberProg);
        member.restoreFromSnapshot(snap, this.time.now);
        this.party.push(member);
      }
    }

    // Spawn Portal to Outpost at dynamic portalPos
    this.portalSprite = this.add.sprite(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize + this.tileSize / 2,
      'portal-to-outpost'
    ).setDepth(2);
    this.portalSprite.setInteractive({ cursor: 'pointer' });

    this.tweens.add({
      targets: this.portalSprite,
      scale: 1.15,
      alpha: 0.85,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add.text(
      this.portalPos.x * this.tileSize + this.tileSize / 2,
      this.portalPos.y * this.tileSize - 10,
      'Portal to Outpost',
      {
        fontSize: '11px',
        color: '#d8b4fe',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { x: 4, y: 2 }
      }
    ).setOrigin(0.5).setDepth(5000);

    this.portalSprite.on('pointerdown', () => {
      this.triggerPortalTransition();
    });

    // 5b. Spawn Procedural Enemies
    this.enemies = [];
    for (const espawn of this.dungeon.enemySpawns) {
      const enemyDef = dataLoader.getEnemy(espawn.enemyId);
      if (enemyDef) {
        const texKey = `${enemyDef.id}-avatar`;
        const tex = this.textures.exists(texKey) ? texKey : 'wolf-avatar';
        const enemy = this.spawnEnemyUnit(enemyDef, espawn.x, espawn.y, tex);
        enemy.roomIndex = espawn.roomIndex;
      }
    }

    // 5c. Spawn Procedural Gathering Nodes (Foraging Bushes, Woodcutting Trees, Mining Rocks)
    this.gatheringNodes = [];
    for (const bspawn of this.dungeon.bushSpawns) {
      const typeId = (bspawn as any).nodeTypeId || 'foraging_bush';
      this.spawnGatheringNode(bspawn.x, bspawn.y, typeId);
    }

    // Target Selection Reticle
    this.targetReticle = this.add.sprite(-100, -100, 'target-reticle').setDepth(10000);
    this.targetReticle.setVisible(false);

    // 6. Initialize Combat System
    this.combatSystem = new CombatSystem(
      this,
      this.party,
      this.enemies,
      this.pathfinder,
      this.progressionSystem,
      (deadEnemy) => {
        this.onEnemyDefeated(deadEnemy);
      }
    );

    // Milestone 16: Continuous Floor Timer initialization
    this.debugAutoRespawnEnabled = false;
    this.floorTimerDurationMs = (dungeonConfig.floorRespawnTimerSec ?? 300) * 1000;
    this.floorTimerRemainingMs = this.floorTimerDurationMs;

    // 7. Setup Camera Controls
    this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 8. Initialize Tile-Claim Debug Overlay (Key [V] to toggle)
    this.tileClaimOverlay = new TileClaimDebugOverlay(this, this.party, this.enemies, this.tileSize);
    (window as any).__tileClaimOverlay = this.tileClaimOverlay;
    (window as any).__toggleTileClaimOverlay = () => this.tileClaimOverlay.toggle();

    // Input Controls: WASD, Space, R, K, X, Z, C, P, T
    if (this.input.keyboard) {
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      };
      this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.kKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
      this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.cKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.pKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.tKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
      this.hKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
      this.hKey.on('down', () => {
        this.hud.applyBandage();
      });
    }

    // Expose debug helpers on window for browser console testing
    (window as any).GameState = GameState;
    (window as any).__grantExp = (statId: string = 'short_swords', amount: number = 25, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      return targetMember.progression.addProficiencyExp(statId, amount);
    };
    (window as any).__grantHiddenExp = (skillId: string, amount: number = 25, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      return targetMember.progression.addProficiencyExp(skillId, amount);
    };
    (window as any).__setLevel = (statId: string = 'short_swords', targetLevel: number = 10, memberIndex: number = 0) => {
      const targetMember = this.party[memberIndex] || this.party[0];
      const stat = targetMember.progression.getProficiencyStat(statId);
      stat.level = targetLevel;
      stat.currentExp = 0;
      targetMember.progression.checkClassUnlocks();
      targetMember.progression.checkDualWieldUnlock();
      console.log(`[Debug] Set '${statId}' to Level ${targetLevel} (0 EXP) on ${targetMember.entityName}`);
    };
    (window as any).__spawnTestCompanion = () => {
      return this.spawnTestCompanion();
    };
    (window as any).__reviveParty = (memberIndex?: number) => {
      if (memberIndex !== undefined) {
        if (this.party[memberIndex]) {
          this.party[memberIndex].revive(this.player);
          console.log(`[Debug] Revived ${this.party[memberIndex].entityName}`);
        }
      } else {
        for (const member of this.party) {
          if (member.state === 'downed') {
            member.revive(this.player);
            console.log(`[Debug] Revived ${member.entityName}`);
          }
        }
      }
    };
    (window as any).__castSkill = (skillId: string, casterIdx: number = 0, targetIdx?: number) => {
      const caster = this.party[casterIdx];
      if (!caster) return false;
      const target = targetIdx !== undefined ? this.party[targetIdx] : undefined;
      return this.combatSystem.castSkill(caster, skillId, target);
    };
    (window as any).__recordActivity = (target: string, count: number = 1, memberIdx: number = 0) => {
      const member = this.party[memberIdx];
      if (!member) return 0;
      return member.progression.recordActivity(target, count);
    };
    (window as any).__triggerRetaliation = (enemyIdx: number = 0, victimIdx: number = 0) => {
      const enemy = this.enemies[enemyIdx];
      const victim = this.party[victimIdx];
      if (enemy && victim) {
        this.combatSystem.triggerRetaliation(enemy, victim);
      }
    };
    (window as any).__respawnEnemies = () => {
      for (const e of this.enemies) {
        e.respawn();
      }
      console.log('[Debug] All test enemies respawned and reset to spawn positions.');
    };
    (window as any).__getFloorTimerState = () => ({
      durationMs: this.floorTimerDurationMs,
      remainingMs: this.floorTimerRemainingMs,
      debugAutoRespawnEnabled: this.debugAutoRespawnEnabled,
      totalEnemies: this.enemies.length,
      livingEnemies: this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'downed').length
    });
    (window as any).__fastForwardFloorTimer = (seconds: number = 60) => this.fastForwardFloorTimer(seconds);
    (window as any).__triggerFloorRespawn = () => this.triggerFloorRespawn();
    (window as any).__toggleAutoRespawn = () => this.toggleDebugAutoRespawn();
    (window as any).__toggleDebugGatheringRespawn = () => this.toggleDebugGatheringRespawn();
    (window as any).__getGatheringNodes = () => this.gatheringNodes;
    (window as any).__startGatherChannel = (nodeIdx: number = 0, charIdx: number = 0) => {
      const node = this.gatheringNodes[nodeIdx];
      const char = this.party[charIdx];
      if (node && char) {
        return this.startGatherChannel(char, node);
      }
      return false;
    };
    (window as any).__interruptGatherChannel = (charIdx: number = 0, enemyIdx: number = 0) => {
      const char = this.party[charIdx];
      const enemy = this.enemies[enemyIdx];
      if (char) {
        return this.interruptGatherChannel(char, enemy);
      }
      return false;
    };
    (window as any).__getGatheringState = () => ({
      debugGatheringRespawnEnabled: this.debugGatheringRespawnEnabled,
      totalNodes: this.gatheringNodes.length,
      harvestedNodes: this.gatheringNodes.filter((n) => n.isHarvested).length,
      activeChannels: this.activeGatherChannels.size
    });
    (window as any).__defeatEnemy = (enemy: Enemy) => this.defeatEnemy(enemy);
    (window as any).__getRoomEnemies = (roomId?: number) => {
      if (roomId !== undefined) {
        return this.enemies.filter((e) => e.roomIndex === roomId);
      }
      return this.dungeon.rooms.map((r) => ({
        id: r.id,
        type: r.type,
        enemies: this.enemies.filter((e) => e.roomIndex === r.id)
      }));
    };
    (window as any).__testHiddenProc = (skillId: string) => {
      const hiddenDef = DataLoader.getInstance().getHiddenSkill(skillId);
      if (!hiddenDef) {
        console.warn(`[Debug] Unknown hidden skill: ${skillId}`);
        return null;
      }
      const context = {
        equippedWeapon: this.player.equippedWeapon,
        hasShield: true,
        hasMagicProficiency: true,
        inCombat: false,
        isMeleeAttack: true
      };
      const result = HiddenSkillSystem.getInstance().rollProc(hiddenDef, context, this.progressionSystem);
      console.log(`[Debug] Tested proc for '${skillId}':`, result);
      return result;
    };
    (window as any).__spawnEnemy = (enemyId: string, x?: number, y?: number) => {
      const def = DataLoader.getInstance().getEnemy(enemyId);
      if (!def) {
        console.warn(`[Debug] Unknown enemy id: ${enemyId}`);
        return null;
      }
      const spawnX = x ?? 10;
      const spawnY = y ?? 10;
      const textureKey = `${def.id}-avatar`;
      return this.spawnEnemyUnit(def, spawnX, spawnY, this.textures.exists(textureKey) ? textureKey : 'wolf-avatar');
    };

    // Milestone 14 Debug Helpers
    (window as any).__setActiveClass = (classId: string | null = 'vanguard', memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.setActiveClass(classId);
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Active class set to '${classId}' on ${targetMember.entityName}`);
      }
    };
    (window as any).__grantClassExp = (amount: number = 25, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember && targetMember.activeClass) {
        const res = targetMember.progression.addClassExp(targetMember.activeClass, amount);
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Granted ${amount} Class EXP to active class '${targetMember.activeClass}' on ${targetMember.entityName}`);
        return res;
      }
      console.warn(`[Debug] No active class equipped on ${targetMember?.entityName}`);
      return false;
    };
    (window as any).__setClassLevel = (classId: string, level: number, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.progression.setClassLevel(classId, level);
        targetMember.progression.checkClassUnlocks();
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Set class '${classId}' to Level ${level} on ${targetMember.entityName}`);
      }
    };
    (window as any).__setupVanguardTestState = (memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        const p = targetMember.progression;
        p.getProficiencyStat('short_swords').level = 30;
        p.getProficiencyStat('short_swords').currentExp = 0;
        p.getProficiencyStat('shields').level = 30;
        p.getProficiencyStat('shields').currentExp = 0;
        p.setClassLevel('fencer', 5);
        p.setClassLevel('guardian', 5);
        p.checkClassUnlocks();
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Setup Vanguard requirements on ${targetMember.entityName}`);
      }
    };
    (window as any).__setVanguardLevel = (level: number = 40, memberIdx: number = 0) => {
      const targetMember = this.party[memberIdx] || this.party[0];
      if (targetMember) {
        targetMember.progression.setClassLevel('vanguard', level);
        targetMember.setActiveClass('vanguard');
        targetMember.checkSkillUnlocks();
        this.hud.update(this.player, this.progressionSystem, 0, this.party);
        console.log(`[Debug] Set Vanguard to Level ${level} and active on ${targetMember.entityName}`);
      }
    };
    (window as any).__spawnSwarmAround = (memberIdx: number = 0) => {
      const member = this.party[memberIdx] || this.player;
      const mx = member.gridPos.x;
      const my = member.gridPos.y;
      const offsets = [
        { ox: -1, oy: 0, type: 'goblin', tex: 'goblin-avatar' },
        { ox: 1, oy: 0, type: 'skeleton', tex: 'skeleton-avatar' },
        { ox: 0, oy: -1, type: 'undead', tex: 'undead-avatar' },
        { ox: 0, oy: 1, type: 'wolf', tex: 'wolf-avatar' },
        { ox: -1, oy: -1, type: 'goblin', tex: 'goblin-avatar' },
        { ox: 1, oy: -1, type: 'skeleton', tex: 'skeleton-avatar' },
        { ox: -1, oy: 1, type: 'undead', tex: 'undead-avatar' },
        { ox: 1, oy: 1, type: 'wolf', tex: 'wolf-avatar' }
      ];
      const spawned: Enemy[] = [];
      for (const off of offsets) {
        const tx = mx + off.ox;
        const ty = my + off.oy;
        if (tx > 0 && tx < this.mapWidth - 1 && ty > 0 && ty < this.mapHeight - 1 && this.gridMatrix[ty]?.[tx] === 0) {
          const def = DataLoader.getInstance().getEnemy(off.type);
          if (def) {
            const e = this.spawnEnemyUnit(def, tx, ty, off.tex, `${def.name} (Swarm)`);
            spawned.push(e);
          }
        }
      }
      console.log(`[Debug] Spawned ${spawned.length} swarm enemies surrounding ${member.entityName} at (${mx}, ${my})`);
      return spawned;
    };
    console.log('[Debug Tools] Hotkeys: [X] +25 Wpn Exp, [Z] +100 Wpn Exp, [C] +25 Const Exp, [P] +680 Wpn Exp (Lv10 Fencer), [T] Respawn Enemies. Console: __grantExp(id, amt, [idx]), __grantHiddenExp(id, amt, [idx]), __setLevel(id, lv, [idx]), __spawnTestCompanion(), __reviveParty([idx]), __spawnEnemy(id, x, y), __spawnSwarmAround(idx).');

    // Scroll Wheel Zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      const currentZoom = this.cameras.main.zoom;
      let newZoom = currentZoom;
      if (deltaY > 0) {
        newZoom = Math.max(0.7, currentZoom - 0.1);
      } else if (deltaY < 0) {
        newZoom = Math.min(2.0, currentZoom + 0.1);
      }
      this.cameras.main.setZoom(newZoom);
    });

    // Pointer Click Interactions (Click-to-Move / Click-to-Engage / Portal)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isTransitioning) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clickedTileX = Math.floor(worldPoint.x / this.tileSize);
      const clickedTileY = Math.floor(worldPoint.y / this.tileSize);

      // Check if portal clicked
      if (clickedTileX === this.portalPos.x && clickedTileY === this.portalPos.y) {
        this.triggerPortalTransition();
        return;
      }

      // Check if clicking a gathering node (Milestone 10, 13 & 17)
      const clickedNode = this.gatheringNodes.find((n) => {
        const isGridMatch = n.x === clickedTileX && n.y === clickedTileY;
        const dx = Math.abs(n.sprite.x - worldPoint.x);
        const dy = Math.abs(n.sprite.y - worldPoint.y);
        const isPosMatch = dx <= this.tileSize / 2 + 4 && dy <= this.tileSize / 2 + 4;
        return isGridMatch || isPosMatch;
      });

      if (clickedNode) {
        this.interactWithGatheringNode(clickedNode);
        return;
      }

      // Check if an enemy was clicked (via tile grid OR world position bounding box)
      const clickedEnemy = this.enemies.find((e) => {
        if (e.state === 'dead' || e.state === 'downed') return false;
        const isGridMatch = e.gridPos.x === clickedTileX && e.gridPos.y === clickedTileY;
        const dx = Math.abs(e.x - worldPoint.x);
        const dy = Math.abs(e.y - worldPoint.y);
        const isPosMatch = dx <= this.tileSize / 2 + 4 && dy <= this.tileSize / 2 + 4;
        return isGridMatch || isPosMatch;
      });

      if (clickedEnemy) {
        this.cancelGatherChannel(this.player);
        this.engageEnemy(clickedEnemy);
      } else if (this.gridMatrix[clickedTileY]?.[clickedTileX] === 0) {
        // Click-to-Move to empty walkable tile
        console.log(`[Input] Clicked Tile: (${clickedTileX}, ${clickedTileY})`);
        this.cancelGatherChannel(this.player);
        for (const member of this.party) {
          member.clearTarget();
        }
        this.targetReticle.setVisible(false);

        const claimed = new Set<string>();

        const isTileBlockedForMove = (tx: number, ty: number, forEntity: Entity): boolean => {
          if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return true;
          if (this.gridMatrix[ty]?.[tx] !== 0) return true;
          if (claimed.has(`${tx},${ty}`)) return true;
          if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return true;
          if (this.party.some(m => m !== forEntity && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return true;
          return false;
        };

        // Leader movement
        let leaderDest: GridPos = { x: clickedTileX, y: clickedTileY };
        if (isTileBlockedForMove(clickedTileX, clickedTileY, this.player)) {
          leaderDest = this.findNearestOpenTileForPartyMove({ x: clickedTileX, y: clickedTileY }, this.player.gridPos, claimed, this.player);
        }
        claimed.add(`${leaderDest.x},${leaderDest.y}`);
        this.player.claimedDestination = { ...leaderDest };

        if (this.player.state !== 'downed') {
          const unitObs = this.getPartyUnitObstacles(this.player);
          this.pathfinder.findPath(this.player.gridPos, leaderDest, unitObs).then((path) => {
            if (path.length > 0) {
              this.player.followPath(path);
            } else {
              this.player.claimedDestination = null;
            }
          });
        }

        // 2x2 Box Formation for Companions:
        // Slot 0 (Leader): (0, 0)
        // Slot 1 (Front-Right): (1, 0)
        // Slot 2 (Back-Left): (0, 1)
        // Slot 3 (Back-Right): (1, 1)
        const formationOffsets = [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 }
        ];

        for (let i = 1; i < this.party.length; i++) {
          const companion = this.party[i];
          if (companion.state === 'downed' || companion.state === 'dead') continue;

          const offset = formationOffsets[i] || { x: i % 2, y: Math.floor(i / 2) };
          const idealPos: GridPos = { x: leaderDest.x + offset.x, y: leaderDest.y + offset.y };
          const compDest = this.findNearestOpenTileForPartyMove(idealPos, companion.gridPos, claimed, companion);
          claimed.add(`${compDest.x},${compDest.y}`);
          companion.claimedDestination = { ...compDest };

          const compUnitObs = this.getPartyUnitObstacles(companion);
          this.pathfinder.findPath(companion.gridPos, compDest, compUnitObs).then((path) => {
            if (path.length > 0) {
              companion.followPath(path);
            } else {
              companion.claimedDestination = null;
            }
          });
        }
      }
    });
  }

  public getLivingUnits(excludeEntity?: Entity): Entity[] {
    const units: Entity[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') {
        units.push(m);
      }
    }
    for (const e of this.enemies) {
      if (e !== excludeEntity && e.state !== 'dead' && e.state !== 'downed') {
        units.push(e);
      }
    }
    return units;
  }

  public getFriendlyObstacles(excludeEntity?: Entity): GridPos[] {
    const positions: GridPos[] = [];
    for (const m of this.party) {
      if (m !== excludeEntity && m.state !== 'dead' && m.state !== 'downed') {
        positions.push(m.gridPos);
      }
    }
    return positions;
  }

  public getEnemyObstacles(): GridPos[] {
    const positions: GridPos[] = [];
    for (const e of this.enemies) {
      if (e.state !== 'dead' && e.state !== 'downed') {
        positions.push(e.gridPos);
      }
    }
    return positions;
  }

  public getPartyUnitObstacles(unit: Entity): { soft: GridPos[]; hard: GridPos[] } {
    return {
      soft: this.getFriendlyObstacles(unit),
      hard: this.getEnemyObstacles()
    };
  }

  public getDynamicObstacles(excludeEntity?: Entity): GridPos[] {
    return this.getLivingUnits(excludeEntity).map((u) => u.gridPos);
  }

  public isTileOccupied(x: number, y: number, excludeEntity?: Entity): boolean {
    const living = this.getLivingUnits(excludeEntity);
    return living.some((u) => u.gridPos.x === x && u.gridPos.y === y);
  }

  public isTileClaimed(x: number, y: number, excludeEntity?: Entity): boolean {
    const living = this.getLivingUnits(excludeEntity);
    return living.some((u) => u.claimedDestination !== null && u.claimedDestination.x === x && u.claimedDestination.y === y);
  }

  public findOpenAdjacentTile(center: GridPos, preferredNear?: GridPos, claimedTiles?: Set<string>, excludeEntity?: Entity): GridPos {
    const r1Offsets = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
    ];

    const isCandidateOpen = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      const key = `${tx},${ty}`;
      if (claimedTiles?.has(key)) return false;
      if (this.isTileOccupied(tx, ty, excludeEntity)) return false;
      if (this.isTileClaimed(tx, ty, excludeEntity)) return false;
      return true;
    };

    // 1. Prioritize true adjacent tiles (radius 1)
    const r1Candidates: GridPos[] = [];
    for (const off of r1Offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (isCandidateOpen(tx, ty)) {
        r1Candidates.push({ x: tx, y: ty });
      }
    }

    if (r1Candidates.length > 0) {
      if (preferredNear) {
        r1Candidates.sort((a, b) => {
          const distA = Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y);
          const distB = Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y);
          return distA - distB;
        });
      }
      return r1Candidates[0];
    }

    // 2. Fallback: Radius 2 only if all 8 adjacent tiles are blocked/occupied
    const r2Offsets = [
      { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
      { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: 1 }, { x: -2, y: -1 },
      { x: 1, y: 2 }, { x: -1, y: 2 }, { x: 1, y: -2 }, { x: -1, y: -2 }
    ];
    const r2Candidates: GridPos[] = [];
    for (const off of r2Offsets) {
      const tx = center.x + off.x;
      const ty = center.y + off.y;
      if (isCandidateOpen(tx, ty)) {
        r2Candidates.push({ x: tx, y: ty });
      }
    }

    if (r2Candidates.length > 0) {
      if (preferredNear) {
        r2Candidates.sort((a, b) => {
          const distA = Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y);
          const distB = Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y);
          return distA - distB;
        });
      }
      return r2Candidates[0];
    }

    return center;
  }

  /**
   * Dedicated combat attack positioning: delegates to the unified authoritative
   * CombatSystem claim and positioning calculator to prevent duplicate logic or double-booking.
   */
  public findOpenAttackTileForMember(
    enemy: Enemy,
    member: Player,
    claimedKeys?: Set<string>
  ): GridPos | null {
    if (this.combatSystem) {
      return this.combatSystem.findOpenAttackTileForMember(enemy, member, claimedKeys);
    }
    return null;
  }

  public findNearestOpenTile(targetPos: GridPos, preferredNear?: GridPos, claimedTiles?: Set<string>, excludeEntity?: Entity): GridPos {
    // Check if ideal targetPos is completely open
    if (
      targetPos.x > 0 && targetPos.x < this.mapWidth - 1 &&
      targetPos.y > 0 && targetPos.y < this.mapHeight - 1 &&
      this.gridMatrix[targetPos.y]?.[targetPos.x] === 0
    ) {
      const key = `${targetPos.x},${targetPos.y}`;
      if (!claimedTiles?.has(key) && !this.isTileOccupied(targetPos.x, targetPos.y, excludeEntity) && !this.isTileClaimed(targetPos.x, targetPos.y, excludeEntity)) {
        return { x: targetPos.x, y: targetPos.y };
      }
    }

    // Concentric search around targetPos up to radius 3
    const candidates: GridPos[] = [];
    for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetPos.x + dx;
          const ty = targetPos.y + dy;
          if (
            tx > 0 && tx < this.mapWidth - 1 &&
            ty > 0 && ty < this.mapHeight - 1 &&
            this.gridMatrix[ty]?.[tx] === 0
          ) {
            const key = `${tx},${ty}`;
            if (!claimedTiles?.has(key) && !this.isTileOccupied(tx, ty, excludeEntity) && !this.isTileClaimed(tx, ty, excludeEntity)) {
              candidates.push({ x: tx, y: ty });
            }
          }
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length > 0) {
      const refPoint = preferredNear || targetPos;
      candidates.sort((a, b) => {
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - refPoint.x, a.y - refPoint.y);
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - refPoint.x, b.y - refPoint.y);
        return distA - distB;
      });
      return candidates[0];
    }

    return this.findOpenAdjacentTile(targetPos, preferredNear, claimedTiles, excludeEntity);
  }

  public findNearestOpenTileForPartyMove(
    targetPos: GridPos,
    preferredNear: GridPos,
    claimedTiles: Set<string>,
    companion: Entity
  ): GridPos {
    const isCandidateValid = (tx: number, ty: number): boolean => {
      if (tx <= 0 || tx >= this.mapWidth - 1 || ty <= 0 || ty >= this.mapHeight - 1) return false;
      if (this.gridMatrix[ty]?.[tx] !== 0) return false;
      if (claimedTiles.has(`${tx},${ty}`)) return false;
      if (this.enemies.some(e => e.state !== 'dead' && e.state !== 'downed' && e.gridPos.x === tx && e.gridPos.y === ty)) return false;
      if (this.party.some(m => m !== companion && (m.state === 'dead' || m.state === 'downed') && m.gridPos.x === tx && m.gridPos.y === ty)) return false;
      return true;
    };

    if (isCandidateValid(targetPos.x, targetPos.y)) {
      return targetPos;
    }

    const candidates: GridPos[] = [];
    for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = targetPos.x + dx;
          const ty = targetPos.y + dy;
          if (isCandidateValid(tx, ty)) {
            candidates.push({ x: tx, y: ty });
          }
        }
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const isSelfA = (a.x === companion.gridPos.x && a.y === companion.gridPos.y) ? 1000 : 0;
        const isSelfB = (b.x === companion.gridPos.x && b.y === companion.gridPos.y) ? 1000 : 0;
        const distA = Math.hypot(a.x - targetPos.x, a.y - targetPos.y) * 2 + Math.hypot(a.x - preferredNear.x, a.y - preferredNear.y) + isSelfA;
        const distB = Math.hypot(b.x - targetPos.x, b.y - targetPos.y) * 2 + Math.hypot(b.x - preferredNear.x, b.y - preferredNear.y) + isSelfB;
        return distA - distB;
      });
      return candidates[0];
    }

    return targetPos;
  }

  public spawnTestCompanion(): boolean {
    if (this.party.length >= 4) {
      this.hud.showToast('Party is full (maximum 4 members)', 'warn', 3000);
      return false;
    }
    const dataLoader = DataLoader.getInstance();
    const playerData = dataLoader.getPlayer();
    const daggerWeapon = dataLoader.getWeapon('daggers') || dataLoader.getWeapon(playerData.startingWeaponId)!;
    const companionIndex = this.party.length;
    const companionId = `companion_${companionIndex}`;
    const companionName = companionIndex === 1 ? 'Valerie' : companionIndex === 2 ? 'Kaelen' : 'Barris';

    // Find adjacent walkable unoccupied tile near leader
    const spawnTile = this.findOpenAdjacentTile(this.player.gridPos);
    const spawnX = spawnTile.x;
    const spawnY = spawnTile.y;

    const companionProgression = new ProgressionSystem(dataLoader.getClassesData(), companionName);
    this.bindProgressionEvents(companionProgression, companionName);
    const companion = new Player(
      this,
      spawnX,
      spawnY,
      playerData,
      daggerWeapon,
      this.tileSize,
      'companion-avatar',
      companionProgression
    );
    companion.id = companionId;
    companion.entityName = companionName;
    companionProgression.ownerName = companionName;
    this.party.push(companion);
    GameState.getInstance().addCompanionToParty(companion, this.time.now);
    this.combatSystem.party = this.party;
    this.hud.showToast(`👥 ${companionName} joined the party!`, 'success', 3000);
    console.log(`[MainScene] Spawned companion ${companionName} at (${spawnX}, ${spawnY}) with ${daggerWeapon.name}`);
    return true;
  }

  private bindProgressionEvents(prog: ProgressionSystem, memberName?: string): void {
    const resolvedName = memberName || prog.ownerName || this.player?.entityName || 'Guild Hero';
    prog.ownerName = resolvedName;

    prog.onClassUnlocked((event) => {
      const name = event.memberName || memberName || prog.ownerName || 'Guild Hero';
      console.log(`%c[UNLOCK] ${name} unlocked ${event.classDef.name}!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
      this.hud.showClassUnlockModal(event.classDef, name);
    });

    prog.onSkillDiscovered((event) => {
      const name = event.memberName || memberName || prog.ownerName || 'Guild Hero';
      const skillDef = DataLoader.getInstance().getTrainableStatDef(event.skillId);
      if (skillDef) {
        console.log(`%c[DISCOVERY] ${name} discovered ${skillDef.name}!`, 'color: #34d399; font-weight: bold; font-size: 14px;');
        this.hud.showSkillDiscoveredModal(skillDef, name);
      }
    });
  }

  private triggerPortalTransition(): void {
    if (this.isTransitioning) return;

    for (const member of this.party) {
      member.clearTarget();
    }
    this.targetReticle.setVisible(false);

    const dx = Math.abs(this.player.gridPos.x - this.portalPos.x);
    const dy = Math.abs(this.player.gridPos.y - this.portalPos.y);

    if (Math.max(dx, dy) <= 1 && (dx > 0 || dy > 0)) {
      // Already adjacent
      this.executeTransitionToOutpost();
      return;
    }

    console.log('[MainScene] Party moving to Outpost Portal...');
    const claimed = new Set<string>();

    // Assign leader an open adjacent tile to the portal
    const leaderDest = this.findOpenAdjacentTile(this.portalPos, this.player.gridPos, claimed, this.player);
    claimed.add(`${leaderDest.x},${leaderDest.y}`);
    this.player.claimedDestination = { ...leaderDest };

    // Command all living companions to also move towards the portal
    for (let i = 1; i < this.party.length; i++) {
      const companion = this.party[i];
      if (companion.state === 'downed' || companion.state === 'dead') continue;
      const compDest = this.findOpenAdjacentTile(this.portalPos, companion.gridPos, claimed, companion);
      claimed.add(`${compDest.x},${compDest.y}`);
      companion.claimedDestination = { ...compDest };

      const compUnitObs = this.getPartyUnitObstacles(companion);
      this.pathfinder.findPath(companion.gridPos, compDest, compUnitObs).then((path) => {
        if (path.length > 0) {
          companion.followPath(path);
        } else {
          companion.claimedDestination = null;
        }
      });
    }

    // Leader movement with transition on arrival (Leader-Arrival Rule)
    const leaderUnitObs = this.getPartyUnitObstacles(this.player);
    this.pathfinder.findPath(this.player.gridPos, leaderDest, leaderUnitObs).then((path) => {
      if (path.length > 0) {
        this.player.followPath(path, () => {
          this.executeTransitionToOutpost();
        });
      } else {
        this.executeTransitionToOutpost();
      }
    });
  }

  private executeTransitionToOutpost(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('[MainScene] Entering Outpost Portal -> Transitioning to OutpostScene');
    // Save live party snapshot and legacy player snapshot
    GameState.getInstance().savePartySnapshot(this.party, this.time.now);
    GameState.getInstance().saveSnapshot(this.player, this.progressionSystem, this.time.now);

    // Switch active scene to OutpostScene
    this.scene.start('OutpostScene');
  }

  public engageEnemy(enemy: Enemy, membersToEngage?: Player[]): void {
    if (enemy.state === 'dead' || enemy.state === 'downed') return;

    console.log(`[Input] Engaged Enemy: ${enemy.entityName} at (${enemy.gridPos.x}, ${enemy.gridPos.y})`);

    const allLivingMembers = this.party.filter(m => m.state !== 'downed' && m.state !== 'dead');
    const livingMembers = membersToEngage
      ? membersToEngage.filter(m => m.state !== 'downed' && m.state !== 'dead')
      : allLivingMembers;

    if (livingMembers.length === 0) return;

    this.combatSystem.engageMembers(enemy, livingMembers);

    if (!membersToEngage || livingMembers.includes(this.player)) {
      this.targetReticle.setPosition(
        enemy.gridPos.x * this.tileSize + this.tileSize / 2,
        enemy.gridPos.y * this.tileSize + this.tileSize / 2
      );
      this.targetReticle.setVisible(true);
    }
  }

  public update(time: number, delta: number): void {
    // Standing Tile-Claim Debug Overlay update loop
    if (this.tileClaimOverlay) {
      this.tileClaimOverlay.update(time);
    }
    // Debug Revive key listener [R]
    if (this.rKey && Phaser.Input.Keyboard.JustDown(this.rKey)) {
      for (const member of this.party) {
        if (member.state === 'downed') {
          member.revive(this.player);
        }
      }
    }

    // Debug Damage key listener [K]
    if (this.kKey && Phaser.Input.Keyboard.JustDown(this.kKey)) {
      let targetEnemy: Enemy | null = null;
      for (const member of this.party) {
        if (member.targetEntity instanceof Enemy && member.targetEntity.state !== 'dead' && member.targetEntity.state !== 'downed') {
          targetEnemy = member.targetEntity;
          break;
        }
      }
      if (!targetEnemy) {
        targetEnemy = this.enemies.find((e) => e.state !== 'dead' && e.state !== 'downed') || null;
      }

      if (targetEnemy) {
        console.log(`[Debug K Key] Dealing 5 damage to ${targetEnemy.entityName} from distance!`);
        const wasDowned = targetEnemy.takeDamage(5);
        if (wasDowned) {
          console.log(`[Debug K Key] ${targetEnemy.entityName} was downed by debug hit!`);
          this.onEnemyDefeated(targetEnemy);
        }
      }
    }

    // Debug Grant +25 Weapon EXP [X]
    if (this.xKey && Phaser.Input.Keyboard.JustDown(this.xKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 25);
    }

    // Debug Grant +100 Weapon EXP [Z]
    if (this.zKey && Phaser.Input.Keyboard.JustDown(this.zKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 100);
    }

    // Debug Grant +25 Construction EXP [C]
    if (this.cKey && Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.progressionSystem.addProficiencyExp('construction', 25);
    }

    // Debug Grant +680 Weapon EXP [P] (Exact boundary test for Level 10 / Fencer unlock)
    if (this.pKey && Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.progressionSystem.addProficiencyExp(this.player.equippedWeapon.id, 680);
    }

    // Debug Respawn / Reset all test enemies [T]
    if (this.tKey && Phaser.Input.Keyboard.JustDown(this.tKey)) {
      for (const enemy of this.enemies) {
        enemy.respawn();
      }
    }

    // WASD Camera Panning
    const panSpeed = 8;
    let panned = false;

    if (this.wasdKeys) {
      if (this.wasdKeys.W.isDown) {
        this.cameras.main.scrollY -= panSpeed;
        panned = true;
      }
      if (this.wasdKeys.S.isDown) {
        this.cameras.main.scrollY += panSpeed;
        panned = true;
      }
      if (this.wasdKeys.A.isDown) {
        this.cameras.main.scrollX -= panSpeed;
        panned = true;
      }
      if (this.wasdKeys.D.isDown) {
        this.cameras.main.scrollX += panSpeed;
        panned = true;
      }

      if (panned && this.isCameraLocked) {
        this.isCameraLocked = false;
        this.cameras.main.stopFollow();
      }

      // Space key re-locks camera onto player
      if (Phaser.Input.Keyboard.JustDown(this.wasdKeys.SPACE)) {
        this.isCameraLocked = true;
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      }
    }

    // Update Clock & Game Day Progress
    GameState.getInstance().updateClock(delta);

    // Update Entities
    for (const member of this.party) {
      member.update(time, delta);
    }
    for (const enemy of this.enemies) {
      enemy.update(time, delta);
    }

    // Milestone 17: Update Active Gathering Channels
    for (const [character, channel] of Array.from(this.activeGatherChannels.entries())) {
      if (character.state !== 'channeling' || character.hp <= 0 || (character.state as any) === 'downed' || (character.state as any) === 'dead') {
        this.cancelGatherChannel(character);
        continue;
      }

      channel.elapsedMs += delta;
      const pct = Math.min(1, channel.elapsedMs / channel.durationMs);

      // Keep progress bar aligned above character
      channel.barContainer.setPosition(character.x, character.y - 28);

      // Redraw fill
      channel.barFill.clear();
      const fillColorHex = channel.node.nodeDef.color || '#34d399';
      const fillColor = Phaser.Display.Color.HexStringToColor(fillColorHex).color;
      channel.barFill.fillStyle(fillColor, 1);
      const fillW = Math.max(0, Math.floor(34 * pct));
      if (fillW > 0) {
        channel.barFill.fillRect(-17, -2, fillW, 4);
      }
      channel.labelText.setText(`${channel.node.nodeDef.actionVerb}... ${Math.floor(pct * 100)}%`);

      if (channel.elapsedMs >= channel.durationMs) {
        this.completeGatherChannel(character, channel);
      }
    }

    // Update Combat System
    this.combatSystem.update(time, delta);

    // Milestone 16: Continuous Floor Timer Countdown
    this.floorTimerRemainingMs -= delta;
    if (this.floorTimerRemainingMs <= 0) {
      this.repopulateRandomRoom();
      this.floorTimerRemainingMs = this.floorTimerDurationMs;
    }
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }

    // Update HUD Overlay
    this.hud.update(this.player, this.progressionSystem, time, this.party);
  }

  /**
   * Milestone 16: Repopulates exactly one random combat-designated room with a fresh set of enemies
   * using Milestone 13 room-population logic (pool & room-type-appropriate enemy counts).
   */
  public repopulateRandomRoom(): DungeonRoom | null {
    if (!this.dungeon || !this.dungeon.rooms || this.dungeon.rooms.length === 0) {
      return null;
    }

    // Restrict repopulation candidates strictly to combat rooms (excluding entrance and pure gathering)
    const combatRooms = this.dungeon.rooms.filter(
      (r) => r.type === 'light_combat' || r.type === 'heavy_combat'
    );
    if (combatRooms.length === 0) {
      console.warn('[Floor Timer] No eligible combat rooms found for repopulation.');
      return null;
    }

    // Pick exactly one random combat room
    const targetRoom = combatRooms[Math.floor(Math.random() * combatRooms.length)];
    const dataLoader = DataLoader.getInstance();
    const dungeonConfig = dataLoader.getDungeonConfig();

    // Strict scoped cleanup: Destroy and remove leftover corpses/units belonging only to this specific room
    const inRoom = this.enemies.filter((e) => e.roomIndex === targetRoom.id);
    for (const enemy of inRoom) {
      enemy.destroy();
    }

    // Remove from this.enemies in-place
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].roomIndex === targetRoom.id) {
        this.enemies.splice(i, 1);
      }
    }

    // Reconstruct interior walkable tiles in targetRoom (leaving 1 tile border from walls where possible)
    const interiorTiles: GridPos[] = [];
    const xStart = targetRoom.width > 3 ? targetRoom.x + 1 : targetRoom.x;
    const xEnd = targetRoom.width > 3 ? targetRoom.x + targetRoom.width - 2 : targetRoom.x + targetRoom.width - 1;
    const yStart = targetRoom.height > 3 ? targetRoom.y + 1 : targetRoom.y;
    const yEnd = targetRoom.height > 3 ? targetRoom.y + targetRoom.height - 2 : targetRoom.y + targetRoom.height - 1;

    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        if (this.gridMatrix[y]?.[x] === 0) {
          // Do not spawn on entrance portal or occupied party member tiles
          const onPortal = x === this.portalPos.x && y === this.portalPos.y;
          const onParty = this.party.some((m) => m.gridPos.x === x && m.gridPos.y === y);
          if (!onPortal && !onParty) {
            interiorTiles.push({ x, y });
          }
        }
      }
    }

    // Shuffle interior tiles
    for (let i = interiorTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = interiorTiles[i];
      interiorTiles[i] = interiorTiles[j];
      interiorTiles[j] = temp;
    }

    const roomConfig = dungeonConfig.roomTypes?.[targetRoom.type as keyof typeof dungeonConfig.roomTypes];
    const [minE, maxE] = roomConfig?.enemiesRange ?? (
      targetRoom.type === 'light_combat' ? [1, 2] : targetRoom.type === 'heavy_combat' ? [3, 5] : [1, 2]
    );
    const randCount = Math.floor(Math.random() * (maxE - minE + 1)) + minE;
    const enemyCount = Math.min(interiorTiles.length, randCount);

    const enemyPool = dungeonConfig.enemyPool && dungeonConfig.enemyPool.length > 0
      ? dungeonConfig.enemyPool
      : ['wolf', 'goblin', 'skeleton', 'undead'];

    const spawnedEnemies: Enemy[] = [];
    for (let i = 0; i < enemyCount; i++) {
      const enemyId = enemyPool[Math.floor(Math.random() * enemyPool.length)];
      const enemyDef = dataLoader.getEnemy(enemyId);
      if (enemyDef) {
        const texKey = `${enemyDef.id}-avatar`;
        const tex = this.textures.exists(texKey) ? texKey : 'wolf-avatar';
        const tile = interiorTiles[i];
        const newEnemy = this.spawnEnemyUnit(enemyDef, tile.x, tile.y, tex);
        newEnemy.roomIndex = targetRoom.id;
        spawnedEnemies.push(newEnemy);
      }
    }

    this.combatSystem.setEnemies(this.enemies);

    console.log(
      `%c[Floor Timer] ⏳ Floor timer expired! Repopulated Room #${targetRoom.id} (${targetRoom.type}) with ${spawnedEnemies.length} fresh enemies: [${spawnedEnemies.map((e) => e.entityName).join(', ')}]`,
      'color: #ef4444; font-weight: bold;'
    );

    if (this.hud) {
      this.hud.showToast(
        `⚠️ The dungeon stirs... Room ${targetRoom.id} (${targetRoom.type.replace('_', ' ')}) has been repopulated!`,
        'warn',
        4000
      );
    }

    return targetRoom;
  }

  public fastForwardFloorTimer(seconds: number = 60): void {
    this.floorTimerRemainingMs -= seconds * 1000;
    console.log(
      `[Debug] Fast-forwarded floor timer by ${seconds}s. Remaining: ${(Math.max(0, this.floorTimerRemainingMs) / 1000).toFixed(1)}s`
    );
    if (this.floorTimerRemainingMs <= 0) {
      this.repopulateRandomRoom();
      this.floorTimerRemainingMs = this.floorTimerDurationMs;
    }
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }
  }

  public triggerFloorRespawn(): void {
    console.log('[Debug] Manually triggered floor respawn.');
    this.repopulateRandomRoom();
    this.floorTimerRemainingMs = this.floorTimerDurationMs;
    if (this.hud) {
      this.hud.updateFloorTimer(this.floorTimerRemainingMs, this.floorTimerDurationMs);
    }
  }

  public toggleDebugAutoRespawn(): boolean {
    this.debugAutoRespawnEnabled = !this.debugAutoRespawnEnabled;
    const label = this.debugAutoRespawnEnabled ? 'ON (3s Respawn)' : 'OFF (Stay Dead)';
    console.log(`%c[Debug Respawn] Per-enemy auto-respawn is now: ${label}`, 'color: #38bdf8; font-weight: bold;');
    if (this.hud) {
      this.hud.showToast(`🔄 Debug Auto-Respawn: ${label}`, this.debugAutoRespawnEnabled ? 'warn' : 'info', 2500);
      this.hud.updateDebugAutoRespawnBtn(this.debugAutoRespawnEnabled);
    }
    return this.debugAutoRespawnEnabled;
  }

  public onEnemyDefeated(deadEnemy: Enemy): void {
    this.targetReticle.setVisible(false);
    deadEnemy.markDead();

    if (this.debugAutoRespawnEnabled) {
      console.log(`[Combat] ${deadEnemy.entityName} defeated. [DEBUG AUTO-RESPAWN ACTIVE] Respawn scheduled in 3 seconds.`);
      this.time.delayedCall(3000, () => {
        if (this.debugAutoRespawnEnabled && deadEnemy.state === 'dead') {
          deadEnemy.respawn();
        }
      });
    } else {
      console.log(`[Combat] ${deadEnemy.entityName} defeated. Enemy stays dead (floor timer repopulation active).`);
    }
  }

  public defeatEnemy(enemy: Enemy): void {
    enemy.takeDamage(99999);
    this.onEnemyDefeated(enemy);
  }

  public spawnEnemyUnit(enemyData: EnemyDef, x: number, y: number, textureKey: string, customName?: string): Enemy {
    const enemy = new Enemy(this, x, y, enemyData, textureKey, this.tileSize);
    if (customName) enemy.entityName = customName;
    this.enemies.push(enemy);
    enemy.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.engageEnemy(enemy);
    });
    return enemy;
  }

  // --- UNIVERSAL GATHERING SYSTEM: FORAGING, WOODCUTTING & MINING (Milestone 17) ---

  public spawnGatheringNode(x: number, y: number, nodeTypeId: string = 'foraging_bush'): GatheringNode {
    const dataLoader = DataLoader.getInstance();
    const config = dataLoader.getGatheringNodesConfig();
    const nodeDef: GatheringNodeDef = config?.nodes?.[nodeTypeId] || dataLoader.getGatheringNode(nodeTypeId) || {
      id: nodeTypeId,
      name: nodeTypeId.includes('tree') ? 'Tree' : nodeTypeId.includes('rock') ? 'Rock Vein' : 'Wild Herbs',
      skillId: nodeTypeId.includes('tree') ? 'woodcutting' : nodeTypeId.includes('rock') ? 'mining' : 'foraging',
      resourceId: nodeTypeId.includes('tree') ? 'wood' : nodeTypeId.includes('rock') ? 'ore' : 'wild_herbs',
      yieldCount: nodeTypeId.includes('tree') ? 2 : 1,
      expGranted: 15,
      channelDurationMs: 2500,
      respawnTimeMs: 15000,
      textureKey: nodeTypeId.includes('tree') ? 'woodcutting-tree' : nodeTypeId.includes('rock') ? 'mining-rock' : 'foraging-bush',
      textureDepletedKey: nodeTypeId.includes('tree') ? 'woodcutting-tree-depleted' : nodeTypeId.includes('rock') ? 'mining-rock-depleted' : 'foraging-bush-depleted',
      label: nodeTypeId.includes('tree') ? 'Tree' : nodeTypeId.includes('rock') ? 'Rock Vein' : 'Wild Herbs',
      depletedLabel: nodeTypeId.includes('tree') ? 'Stump' : nodeTypeId.includes('rock') ? 'Depleted' : 'Stripped',
      color: nodeTypeId.includes('tree') ? '#f59e0b' : nodeTypeId.includes('rock') ? '#94a3b8' : '#34d399',
      actionVerb: nodeTypeId.includes('tree') ? 'Logging' : nodeTypeId.includes('rock') ? 'Mining' : 'Foraging'
    };

    const posX = x * this.tileSize + this.tileSize / 2;
    const posY = y * this.tileSize + this.tileSize / 2;

    const sprite = this.add.sprite(posX, posY, nodeDef.textureKey)
      .setDepth(posY - 2)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(posX, posY - 16, nodeDef.label, {
      fontSize: '10px',
      color: nodeDef.color,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5).setDepth(5000);

    const node: GatheringNode = {
      x,
      y,
      nodeDef,
      sprite,
      label,
      isHarvested: false
    };

    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event?: Phaser.Types.Input.EventData) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.interactWithGatheringNode(node);
    });

    this.gatheringNodes.push(node);
    return node;
  }

  public spawnForagingBush(x: number, y: number): GatheringNode {
    return this.spawnGatheringNode(x, y, 'foraging_bush');
  }

  public interactWithGatheringNode(node: GatheringNode, character: Player = this.player): void {
    if (node.isHarvested) {
      this.hud.showToast(`🌿 ${node.nodeDef.name} is depleted. Stays depleted for remainder of visit.`, 'info', 2000);
      return;
    }

    if (character.state === 'downed' || character.state === 'dead') return;

    const dist = Math.hypot(character.gridPos.x - node.x, character.gridPos.y - node.y);

    if (dist <= 1.5) {
      // Adjacent: start universal channel immediately
      this.startGatherChannel(character, node);
    } else {
      // Find open adjacent tile to node and move there, then channel
      const adjTiles = [
        { x: node.x + 1, y: node.y },
        { x: node.x - 1, y: node.y },
        { x: node.x, y: node.y + 1 },
        { x: node.x, y: node.y - 1 }
      ].filter(t => t.x > 0 && t.x < this.mapWidth - 1 && t.y > 0 && t.y < this.mapHeight - 1 && this.gridMatrix[t.y]?.[t.x] === 0);

      adjTiles.sort((a, b) => Math.hypot(a.x - character.gridPos.x, a.y - character.gridPos.y) - Math.hypot(b.x - character.gridPos.x, b.y - character.gridPos.y));

      const targetTile = adjTiles[0];
      if (targetTile) {
        for (const member of this.party) {
          member.clearTarget();
        }
        const unitObs = this.getPartyUnitObstacles(character);
        this.pathfinder.findPath(character.gridPos, targetTile, unitObs).then((path) => {
          if (path.length > 0) {
            character.followPath(path);
            const checkArrival = this.time.addEvent({
              delay: 150,
              repeat: 40,
              callback: () => {
                if (Math.hypot(character.gridPos.x - node.x, character.gridPos.y - node.y) <= 1.5) {
                  checkArrival.remove();
                  this.startGatherChannel(character, node);
                } else if (character.state !== 'moving') {
                  checkArrival.remove();
                }
              }
            });
          }
        });
      }
    }
  }

  public interactWithBush(bush: ForagingBush): void {
    this.interactWithGatheringNode(bush, this.player);
  }

  public startGatherChannel(character: Player, node: GatheringNode): boolean {
    if (node.isHarvested || character.state === 'downed' || character.state === 'dead') {
      return false;
    }

    // Cancel any existing channel
    this.cancelGatherChannel(character);

    // Halt movement and combat targets
    character.state = 'channeling';
    character.claimedDestination = null;
    character.clearTarget();

    const durationMs = node.nodeDef.channelDurationMs || 2500;

    // Visual Progress Bar Container positioned above character
    const posX = character.x;
    const posY = character.y - 28;
    const barContainer = this.add.container(posX, posY).setDepth(10001);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x111827, 0.85);
    barBg.fillRect(-18, -3, 36, 6);
    barBg.lineStyle(1, 0x374151, 1);
    barBg.strokeRect(-18, -3, 36, 6);

    const barFill = this.add.graphics();

    const labelText = this.add.text(0, -12, `${node.nodeDef.actionVerb}... 0%`, {
      fontSize: '9px',
      fontStyle: 'bold',
      color: node.nodeDef.color || '#34d399',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5);

    barContainer.add([barBg, barFill, labelText]);

    const channel: ActiveGatherChannel = {
      character,
      node,
      durationMs,
      elapsedMs: 0,
      barContainer,
      barBg,
      barFill,
      labelText
    };

    this.activeGatherChannels.set(character, channel);
    console.log(`[Gathering] ⛏️ ${character.entityName} started channeling ${node.nodeDef.name} (${durationMs}ms)...`);
    return true;
  }

  public completeGatherChannel(character: Player, channel: ActiveGatherChannel): void {
    channel.barContainer.destroy();
    this.activeGatherChannels.delete(character);

    if (character.state === 'channeling') {
      character.state = 'idle';
    }

    this.harvestGatheringNode(channel.node, character);
  }

  public harvestGatheringNode(node: GatheringNode, character: Player = this.player): void {
    if (node.isHarvested) return;

    node.isHarvested = true;
    node.sprite.setTexture(node.nodeDef.textureDepletedKey);
    node.label.setText(node.nodeDef.depletedLabel);
    node.label.setColor('#9ca3af');

    const yieldCount = node.nodeDef.yieldCount || 1;
    const expGranted = node.nodeDef.expGranted || 15;

    // Grant resources to GameState economy and inventory
    if (node.nodeDef.resourceId === 'wood') {
      GameState.getInstance().addWood(yieldCount);
      GameState.getInstance().addItem('wood', yieldCount);
    } else if (node.nodeDef.resourceId === 'ore') {
      GameState.getInstance().addOre(yieldCount);
      GameState.getInstance().addItem('ore', yieldCount);
    } else {
      GameState.getInstance().addItem(node.nodeDef.resourceId, yieldCount);
    }

    // Grant gathering EXP
    character.progression.addProficiencyExp(node.nodeDef.skillId, expGranted);

    // Floating combat/gathering text
    const posX = node.x * this.tileSize + this.tileSize / 2;
    const posY = node.y * this.tileSize + this.tileSize / 2;
    this.createFloatingText(posX, posY - 10, `+${yieldCount} ${node.nodeDef.name}`, node.nodeDef.color);
    const skillName = DataLoader.getInstance().getTrainableStatDef(node.nodeDef.skillId)?.name || node.nodeDef.skillId;
    this.createFloatingText(posX, posY - 24, `+${expGranted} ${skillName} EXP`, '#60a5fa');

    // Bounce animation
    this.tweens.add({
      targets: node.sprite,
      scaleY: 0.8,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeInOut'
    });

    console.log(`[Gathering] 🌿 Harvested ${yieldCount}x ${node.nodeDef.name}! (+${expGranted} ${skillName} EXP)`);
    this.hud.showToast(`🌿 Harvested ${node.nodeDef.name} (+${expGranted} ${skillName} EXP)`, 'success', 2500);

    // REAL GAMEPLAY LIFESPAN: Node stays depleted for remainder of floor visit!
    // DEBUG ONLY: If debugGatheringRespawnEnabled is active, respawn after 15s
    if (this.debugGatheringRespawnEnabled) {
      console.log(`[Debug Respawn] Gathering node respawn scheduled in 15s for (${node.x}, ${node.y}).`);
      node.respawnTimer = this.time.delayedCall(node.nodeDef.respawnTimeMs || 15000, () => {
        if (this.debugGatheringRespawnEnabled && node.isHarvested) {
          node.isHarvested = false;
          node.sprite.setTexture(node.nodeDef.textureKey);
          node.label.setText(node.nodeDef.label);
          node.label.setColor(node.nodeDef.color);

          this.tweens.add({
            targets: node.sprite,
            scale: 1.15,
            duration: 200,
            yoyo: true,
            ease: 'Back.easeOut'
          });
          console.log(`[Gathering] 🌿 ${node.nodeDef.name} regrew at (${node.x}, ${node.y}) via debug auto-respawn!`);
        }
      });
    } else {
      console.log(`[Gathering] ${node.nodeDef.name} at (${node.x}, ${node.y}) stays depleted for remainder of floor visit.`);
    }
  }

  public harvestBush(bush: ForagingBush): void {
    this.harvestGatheringNode(bush, this.player);
  }

  public interruptGatherChannel(character: Player, attacker?: Enemy): boolean {
    const channel = this.activeGatherChannels.get(character);
    if (!channel) return false;

    console.log(`%c[Gather Interrupt] 💥 ${character.entityName}'s channel on ${channel.node.nodeDef.name} was INTERRUPTED by enemy attack!`, 'color: #ef4444; font-weight: bold;');

    // 1. Immediately cancel: zero rewards, zero EXP
    // 2. Bar resets to zero and is destroyed
    channel.barContainer.destroy();
    this.activeGatherChannels.delete(character);

    // 3. Node remains unharvested (intact, ready for subsequent attempts)
    channel.node.isHarvested = false;
    channel.node.sprite.setTexture(channel.node.nodeDef.textureKey);
    channel.node.label.setText(channel.node.nodeDef.label);
    channel.node.label.setColor(channel.node.nodeDef.color);

    // 4. Reset character state
    character.state = 'idle';

    // 5. Floating text & toast
    this.createFloatingText(character.x, character.y - 20, 'INTERRUPTED!', '#ef4444');
    this.hud.showToast(`⚠️ Channel interrupted! Entering combat!`, 'warn', 2500);

    // 6. Immediate combat engagement with attacker
    if (attacker && attacker.state !== 'dead' && attacker.state !== 'downed') {
      this.engageEnemy(attacker, [character]);
    }

    return true;
  }

  public cancelGatherChannel(character: Player): boolean {
    const channel = this.activeGatherChannels.get(character);
    if (!channel) return false;

    channel.barContainer.destroy();
    this.activeGatherChannels.delete(character);
    if (character.state === 'channeling') {
      character.state = 'idle';
    }
    return true;
  }

  public toggleDebugGatheringRespawn(): boolean {
    this.debugGatheringRespawnEnabled = !this.debugGatheringRespawnEnabled;
    const label = this.debugGatheringRespawnEnabled ? 'ON (15s Respawn)' : 'OFF (Stay Depleted)';
    console.log(`%c[Debug Respawn] Gathering node auto-respawn is now: ${label}`, 'color: #38bdf8; font-weight: bold;');
    if (this.hud) {
      this.hud.showToast(`🔄 Debug Gathering Respawn: ${label}`, this.debugGatheringRespawnEnabled ? 'warn' : 'info', 2500);
    }
    return this.debugGatheringRespawnEnabled;
  }

  public createFloatingText(x: number, y: number, textString: string, colorHex: string): void {
    const text = this.add.text(x, y, textString, {
      fontSize: '11px',
      color: colorHex,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    });
    text.setOrigin(0.5);
    text.setDepth(y + 1000);

    this.tweens.add({
      targets: text,
      y: y - 20,
      alpha: 0,
      duration: 1200,
      onComplete: () => text.destroy()
    });
  }
}
