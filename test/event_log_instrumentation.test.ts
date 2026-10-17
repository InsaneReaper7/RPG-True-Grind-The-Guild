import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

console.log('--- TEST SUITE: EventLog Instrumentation ---');

// Setup minimal browser globals for Phaser import under Node
if (typeof (globalThis as any).window === 'undefined') {
  const noop = () => {};
  (globalThis as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (globalThis as any).Image = class Image {};
  (globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { Player } = await import('../src/entities/Player.ts');
const { EventLog } = await import('../src/systems/EventLog.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');

// Mock Phaser Scene for Player and CombatSystem instantiation
const createMockObj = () => {
  const obj: any = new Proxy({
    x: 0,
    y: 0,
    parentContainer: null,
    destroy: () => {}
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return () => obj;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  return obj;
};

const mockScene = {
  add: {
    existing: (obj: any) => obj,
    text: () => createMockObj(),
    graphics: () => createMockObj(),
    sprite: () => createMockObj(),
    line: () => createMockObj(),
    circle: () => createMockObj(),
    rectangle: () => createMockObj()
  },
  time: {
    now: 1000,
    addEvent: () => ({ remove: () => {}, destroy: () => {} }),
    delayedCall: (_delay: number, fn: Function) => fn()
  },
  sys: {
    queueDepthSort: () => {},
    events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
    input: { enable: () => {}, disable: () => {} },
    displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
    updateList: { add: () => {}, remove: () => {} }
  },
  tweens: {
    add: () => ({ stop: () => {}, remove: () => {}, destroy: () => {} })
  }
} as any;

await DataLoader.getInstance().loadAll();
const dl = DataLoader.getInstance();
const gs = GameState.getInstance();
gs.initFromPlayerData(dl.getPlayer());

// 1. Off-hand removal on two-handed equip logs with reason
{
  console.log('1. Testing off-hand removal on 2H equip logging...');
  const log = EventLog.resetInstance();
  log.setLocation(3);

  const hero = new Player(mockScene, 0, 0, dl.getPlayer());
  hero.entityName = 'Valerie';

  // Equip shield off-hand first
  const shield = dl.getWeapon('shields') || { id: 'shields', name: 'Shield', category: 'offhand', twoHanded: false };
  hero.equipOffhandWeapon(shield, true);

  // Now equip a two-handed Greatsword
  const greatsword = dl.getWeapon('greatswords') || { id: 'greatswords', name: 'Greatswords', category: 'melee_2h', twoHanded: true };
  hero.equipWeapon(greatsword, true);

  const equipEntries = log.getEntries().filter((e) => e.cat === 'equip');
  const unequip2hEntry = equipEntries.find((e) => e.msg.includes('is two-handed'));

  assert.ok(unequip2hEntry, 'Must log off-hand unequipped when equipping 2H weapon');
  assert.strictEqual(
    unequip2hEntry!.msg,
    `Valerie: off-hand ${shield.name} unequipped: ${greatsword.name} is two-handed`
  );
  console.log('✓ Off-hand removal with reason logged correctly');
}

// 2. Class change and cancelled confirm each log
{
  console.log('2. Testing class switch and cancelled confirm logging...');
  const log = EventLog.resetInstance();
  const hero = new Player(mockScene, 0, 0, dl.getPlayer());
  hero.entityName = 'Hero';

  // Unlock scout class
  hero.progression.setClassLevel('scout', 1);
  hero.setActiveClass('scout');

  // Equip bow and offhand dagger (scout sidearm)
  const bow = dl.getWeapon('bows') || { id: 'bows', name: 'Bows', category: 'ranged', twoHanded: true };
  const dagger = dl.getWeapon('daggers') || { id: 'daggers', name: 'Daggers', category: 'melee_1h', twoHanded: false };
  hero.equipWeapon(bow, true);
  hero.equipOffhandWeapon(dagger, true);

  // Switch to fighter with cancelled confirm
  hero.setActiveClass('fighter', { confirmFn: () => false });

  // Switch to fighter with accepted confirm
  hero.progression.setClassLevel('fighter', 1);
  hero.setActiveClass('fighter', { confirmFn: () => true });

  const classEntries = log.getEntries().filter((e) => e.cat === 'class');
  const cancelledEntry = classEntries.find((e) => e.msg.includes('cancelled by user'));
  const switchEntry = classEntries.find((e) => e.msg.includes('Active class set to: fighter'));

  assert.ok(cancelledEntry, 'Cancelled confirm must be logged');
  assert.ok(switchEntry, 'Active class change must be logged');
  console.log('✓ Class change and cancelled confirm logged correctly');
}

// 3. Level-up logs (class and proficiency)
{
  console.log('3. Testing progression level-up logging...');
  const log = EventLog.resetInstance();
  const prog = new ProgressionSystem();
  prog.ownerName = 'Kaelen';

  // Proficiency level up
  prog.addProficiencyExp('short_swords', 100);

  // Class level up
  prog.setClassLevel('fighter', 1);
  prog.addClassExp('fighter', 100);

  const progEntries = log.getEntries().filter((e) => e.cat === 'progression');
  const profLvlEntry = progEntries.find((e) => e.msg.includes("Proficiency 'short_swords' leveled up"));
  const classLvlEntry = progEntries.find((e) => e.msg.includes("Class 'fighter' leveled up"));

  assert.ok(profLvlEntry, 'Proficiency level up must be logged');
  assert.ok(classLvlEntry, 'Class level up must be logged');
  console.log('✓ Progression level-ups logged correctly');
}

// 4. Floor transition logs
{
  console.log('4. Testing floor transition logging...');
  const log = EventLog.resetInstance();
  log.setLocation('Outpost');
  log.add('floor', 'Arrived at Guild Outpost');

  log.setLocation(1);
  log.add('floor', 'Entered dungeon floor 1', { floorNumber: 1 });

  const floorEntries = log.getEntries().filter((e) => e.cat === 'floor');
  assert.strictEqual(floorEntries.length, 2);
  assert.strictEqual(floorEntries[0].msg, 'Arrived at Guild Outpost');
  assert.strictEqual(floorEntries[1].msg, 'Entered dungeon floor 1');
  console.log('✓ Floor transitions logged correctly');
}

// 5. Fight logs ONE summary, not one line per hit
{
  console.log('5. Testing combat fight summary (1 summary per fight, not per hit)...');
  const log = EventLog.resetInstance();
  const hero = new Player(mockScene, 0, 0, dl.getPlayer());
  hero.entityName = 'Hero';

  const enemyData = dl.getEnemy('goblin_scout') || {
    id: 'goblin_scout',
    name: 'Goblin Scout',
    hp: 50,
    damage: 8,
    expReward: 10,
    attackIntervalMs: 1000
  };
  const mockPathfinder = {
    findPath: async () => []
  } as any;
  const enemy = new Enemy(mockScene, 50, 50, enemyData as any);
  const combat = new CombatSystem(mockScene, [hero], [enemy], mockPathfinder);

  // Start combat: aggro enemy
  enemy.isAggroed = true;
  combat.update(1000, 16);

  // Exchange 10 hits during the fight
  for (let i = 0; i < 10; i++) {
    combat.recordDamageDealt('Hero', 12);
    combat.recordDamageTaken('Hero', 6, 'Goblin Scout');
  }

  // End combat
  enemy.isAggroed = false;
  enemy.state = 'dead';
  combat.update(6000, 16);

  const combatEntries = log.getEntries().filter((e) => e.cat === 'combat');
  const summaryEntries = combatEntries.filter((e) => e.msg.startsWith('Combat ended'));

  // Assert exactly 1 start entry and 1 summary entry
  assert.strictEqual(combatEntries[0].msg, 'Combat started');
  assert.strictEqual(summaryEntries.length, 1, `Expected exactly 1 fight summary entry, got ${summaryEntries.length}`);
  assert.match(summaryEntries[0].msg, /Dealt \[Hero: 120\]/);
  assert.match(summaryEntries[0].msg, /Taken \[Hero: 60\]/);
  console.log('✓ Combat fight summary logged once per fight');
}

console.log('ALL EventLog Instrumentation tests passed!\n');
