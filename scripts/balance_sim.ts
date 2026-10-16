import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Setup minimal browser globals for Phaser import under Node
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
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
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
import type { EnemyDef, WeaponDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 40, gridHeight: number = 40): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);

  // Synchronous findPath wrapper:
  // In node simulation, pathfinder.findPath returns a Promise which defers .then() to microtasks.
  // We wrap findPath so .then() executes immediately and synchronously within the simulation frame.
  (pathfinder as any).findPath = function (
    start: any,
    end: any,
    dynamicObstacles?: any,
    hardObstacles?: any
  ) {
    if (
      start.x < 0 ||
      start.x >= (this as any).gridWidth ||
      start.y < 0 ||
      start.y >= (this as any).gridHeight ||
      end.x < 0 ||
      end.x >= (this as any).gridWidth ||
      end.y < 0 ||
      end.y >= (this as any).gridHeight
    ) {
      const p = Promise.resolve([]);
      (p as any).then = function (onFulfilled: any) {
        if (onFulfilled) onFulfilled([]);
        return p;
      };
      return p;
    }

    let hardList: any[] = [];
    if (Array.isArray(dynamicObstacles)) {
      hardList = hardObstacles ? hardObstacles : dynamicObstacles;
    } else if (dynamicObstacles && typeof dynamicObstacles === 'object') {
      hardList = dynamicObstacles.hard || [];
    } else if (hardObstacles) {
      hardList = hardObstacles;
    }

    const easystar = (this as any).easystar;
    if (hardList.length > 0) {
      for (const obs of hardList) {
        if ((obs.x !== start.x || obs.y !== start.y) && (obs.x !== end.x || obs.y !== end.y)) {
          easystar.avoidAdditionalPoint(obs.x, obs.y);
        }
      }
    }

    let returnedPath: any[] = [];
    easystar.findPath(start.x, start.y, end.x, end.y, (path: any) => {
      if (path !== null) {
        returnedPath = path.map((pt: any) => ({ x: pt.x, y: pt.y }));
      }
    });
    easystar.calculate();

    if (hardList.length > 0) easystar.stopAvoidingAllAdditionalPoints();

    const promise = Promise.resolve(returnedPath);
    (promise as any).then = function (onFulfilled: any) {
      if (onFulfilled) {
        try {
          const res = onFulfilled(returnedPath);
          return Promise.resolve(res);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      return promise;
    };
    return promise;
  };

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

  const scene: any = {
    tileSize: 32,
    gridWidth,
    gridHeight,
    grid,
    pathfinder,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {}, remove: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => createMockObj(),
      existing: (item: any) => item
    }
  };
  return scene;
}

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Dummy Target', hp: number = 100000): any {
  const def: EnemyDef = {
    id: `dummy_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 0,
    aggroRadius: 10,
    attackIntervalMs: 1500,
    moveSpeed: 90,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, 'wolf-avatar', 32);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.isAggroed = true;
  return enemy;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weaponProfList = [
  'short_swords', 'longswords', 'greatswords', 'daggers', 'katana',
  'spears', 'mace', 'bows', 'crossbows', 'throwing_weapons', 'fist',
  'staff', 'druid_staff'
];

const magicProfList = [
  'arcane_magic', 'fire_magic', 'water_magic', 'ice_magic', 'earth_magic',
  'nature_magic', 'lightning_magic', 'wind_magic', 'healing_magic',
  'holy_magic', 'dark_magic'
];

const profToWeapon: Record<string, string> = {
  short_swords: 'short_swords',
  longswords: 'longsword_1h',
  greatswords: 'greatswords',
  daggers: 'daggers',
  katana: 'katana',
  spears: 'spears',
  mace: 'mace',
  bows: 'bows',
  crossbows: 'crossbows',
  throwing_weapons: 'throwing_weapons',
  fist: 'fist',
  staff: 'staff',
  druid_staff: 'druid_staff'
};

const magicToStaff: Record<string, string> = {
  arcane_magic: 'arcane_staff',
  fire_magic: 'fire_staff',
  water_magic: 'water_staff',
  ice_magic: 'ice_staff',
  earth_magic: 'earth_staff',
  nature_magic: 'nature_staff',
  lightning_magic: 'lightning_staff',
  wind_magic: 'wind_staff',
  healing_magic: 'healing_staff',
  holy_magic: 'holy_staff',
  dark_magic: 'dark_staff'
};

const tierLevels: Record<string, number> = {
  novice: 30,
  adept: 50,
  expert: 70,
  master: 90,
  prestige: 100
};

interface SimRunResult {
  damageDealt: number;
  healed: number;
  casts: number;
  energySpent: number;
  secondsUntilBelow20: number;
}

function runFightSimulation(
  classDef: any,
  chosenWeaponDef: WeaponDef,
  profsInChain: string[],
  prereqClasses: string[],
  classSkills: any[],
  mode: 'real' | 'unlimited',
  seed: number,
  playerData: any,
  dataLoader: any
): SimRunResult {
  Math.random = mulberry32(seed);

  const scene = createMockScene();
  const combat = new CombatSystem(scene);

  const companion = new Player(scene, 10, 10, playerData, chosenWeaponDef, 32);
  companion.entityName = `Tester ${classDef.id}`;
  companion.progression.setClassLevel(classDef.id, 40);
  for (const prereqId of prereqClasses) {
    companion.progression.setClassLevel(prereqId, 40);
  }
  companion.progression.activeClassId = classDef.id;

  // Set all proficiencies in chain to tier level
  const tierLvl = tierLevels[classDef.tier] ?? 30;
  for (const prof of profsInChain) {
    const stat = companion.progression.getProficiencyStat(prof);
    if (stat) stat.level = tierLvl;
  }
  if (chosenWeaponDef.proficiencyId) {
    const stat = companion.progression.getProficiencyStat(chosenWeaponDef.proficiencyId);
    if (stat) stat.level = tierLvl;
  }

  // Equip weapon and skills
  companion.equippedWeapon = chosenWeaponDef;
  companion.attackRangeTiles = chosenWeaponDef.attackRangeTiles ??
    (chosenWeaponDef.category === 'ranged' || chosenWeaponDef.category === 'magic' ? 4 : 1);

  if (profsInChain.includes('shields') && !chosenWeaponDef.twoHanded) {
    const shieldDef = dataLoader.getWeapon('shields');
    if (shieldDef) {
      companion.offhandWeapon = shieldDef;
    }
  }

  companion.equippedSkillIds = classSkills.map(s => s.id);
  companion.knownSkillIds = classSkills.map(s => s.id);
  for (const s of classSkills) {
    companion.autocastMap.set(s.id, true);
  }

  companion.mood = 50;
  companion.energy = 100;
  companion.maxEnergy = 100;
  companion.hp = 100;
  companion.maxHp = 100;

  // Track energy spent in real mode
  let currentEnergy = 100;
  let totalEnergySpent = 0;
  let secondsUntilBelow20: number | null = null;

  Object.defineProperty(companion, 'energy', {
    get() {
      return currentEnergy;
    },
    set(newVal: number) {
      if (newVal < currentEnergy) {
        totalEnergySpent += (currentEnergy - newVal);
      }
      currentEnergy = newVal;
    },
    configurable: true
  });

  // Ally at 60% HP with timed poison
  const ally = new Player(scene, 9, 10, playerData, chosenWeaponDef, 32);
  ally.entityName = 'Party Ally';
  ally.maxHp = 100;
  ally.hp = 60;
  ally.maxCriticalHp = 0;
  ally.criticalHp = 0;

  combat.party = [companion, ally];

  // 3 dummy enemies at distances 1, 1.4, 3
  const dummy1 = createDummyEnemy(scene, 11, 10, 'Dummy A', 100000);
  const dummy2 = createDummyEnemy(scene, 11, 11, 'Dummy B', 100000);
  const dummy3 = createDummyEnemy(scene, 13, 10, 'Dummy C', 100000);
  combat.enemies = [dummy1, dummy2, dummy3];

  companion.targetEntity = dummy1;

  let totalDamageDealt = 0;
  for (const dummy of [dummy1, dummy2, dummy3]) {
    const origTakeDamage = dummy.takeDamage.bind(dummy);
    dummy.takeDamage = (amount: number) => {
      totalDamageDealt += amount;
      return origTakeDamage(amount);
    };
  }

  let totalHealed = 0;
  let inCombatUpdate = false;

  const hookHeal = (p: Player) => {
    const origHeal = p.heal.bind(p);
    p.heal = (amount: number) => {
      if (inCombatUpdate) {
        totalHealed += amount;
      }
      return origHeal(amount);
    };
  };
  hookHeal(companion);
  hookHeal(ally);

  let castCount = 0;
  const originalCastSkill = combat.castSkill.bind(combat);
  combat.castSkill = (caster: any, skillId: string, target?: any, currentTime?: number) => {
    const res = originalCastSkill(caster, skillId, target, currentTime);
    if (res && caster === companion) {
      castCount++;
    }
    return res;
  };

  const simTotalMs = 90000;
  const dt = 250;
  let now = 1000;

  for (let t = 0; t < simTotalMs; t += dt) {
    now += dt;
    scene.time.now = now;

    if (mode === 'unlimited') {
      if (currentEnergy < 60) {
        currentEnergy = 100;
      }
    } else {
      if (currentEnergy < 20 && secondsUntilBelow20 === null) {
        secondsUntilBelow20 = (t + dt) / 1000;
      }
    }

    // Ally held at 60% HP with timed poison
    if (ally.hp !== 60) {
      ally.hp = 60;
    }
    if (!ally.hasStatusEffect('poison') && ally.state !== 'downed') {
      const poisonDef = dataLoader.getStatusEffect('poison');
      if (poisonDef) {
        ally.applyStatusEffect({ ...poisonDef, durationMs: 6000 });
      }
    }

    // Execute per-frame path
    companion.update(now, dt);
    ally.update(now, dt);
    dummy1.update(now, dt);
    dummy2.update(now, dt);
    dummy3.update(now, dt);

    inCombatUpdate = true;
    combat.update(now, dt);
    inCombatUpdate = false;

    if (mode === 'unlimited') {
      if (currentEnergy < 60) {
        currentEnergy = 100;
      }
    } else {
      if (currentEnergy < 20 && secondsUntilBelow20 === null) {
        secondsUntilBelow20 = (t + dt) / 1000;
      }
    }
  }

  if (secondsUntilBelow20 === null) {
    secondsUntilBelow20 = 90.0;
  }

  return {
    damageDealt: totalDamageDealt,
    healed: totalHealed,
    casts: castCount,
    energySpent: totalEnergySpent,
    secondsUntilBelow20
  };
}

async function main() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8'));
  const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
  const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
  const playerData = dataLoader.getPlayer();

  const combatClasses = classesData.classes.filter(
    (c: any) => c.category !== 'crafting' && c.tier !== 'crafting' && !c.isCrafting
  );

  const classMap = new Map<string, any>(classesData.classes.map((c: any) => [c.id, c]));

  function getRequirementChain(classDef: any): { profs: string[]; prereqClasses: string[] } {
    const visitedClasses = new Set<string>();
    const profs: string[] = [];
    const prereqClasses: string[] = [];

    function recurse(c: any) {
      if (!c || visitedClasses.has(c.id)) return;
      visitedClasses.add(c.id);

      function handleReq(r: any) {
        if (!r) return;
        if (r.type === 'proficiency') {
          if (!profs.includes(r.target)) profs.push(r.target);
        } else if (r.type === 'classLevel') {
          if (!prereqClasses.includes(r.target)) prereqClasses.push(r.target);
          recurse(classMap.get(r.target));
        }
        const children = r.of || r.anyOf || r.oneOf || r.requirements;
        if (Array.isArray(children)) {
          children.forEach(handleReq);
        }
      }

      (c.requirements || []).forEach(handleReq);
    }

    recurse(classDef);
    return { profs, prereqClasses };
  }

  console.log(`Starting Balance Simulation for ${combatClasses.length} combat classes (3 seeds × 90s, real & unlimited)...\n`);

  interface ClassSimRow {
    classId: string;
    tier: string;
    weapon: string;
    dps_real: number;
    dps_unlimited: number;
    hps_real: number;
    hps_unlimited: number;
    casts_real: number;
    casts_unlimited: number;
    en_spent_real: number;
    seconds_until_energy_below_20: number;
  }

  const rows: ClassSimRow[] = [];
  const seeds = [1, 2, 3];

  for (let idx = 0; idx < combatClasses.length; idx++) {
    const c = combatClasses[idx];
    const { profs, prereqClasses } = getRequirementChain(c);
    const classSkills = skillsData.skills.filter((s: any) =>
      (s.requirements || []).some((r: any) => r.type === 'classLevel' && r.target === c.id)
    );

    const hasWeaponScaling = classSkills.some((s: any) =>
      (s.effects || []).some((e: any) => e.type === 'damage' && e.scaling === 'weapon')
    );

    let chosenWeaponId = '';
    if (c.id === 'brawler') {
      chosenWeaponId = 'fist';
    } else if (c.id === 'necromancer') {
      chosenWeaponId = 'dark_staff';
    } else if (['grove_walker', 'herbalist', 'druid', 'natures_avatar', 'archdruid'].includes(c.id)) {
      chosenWeaponId = 'druid_staff';
    } else if (c.id === 'guardian') {
      chosenWeaponId = 'short_swords';
    } else if (hasWeaponScaling) {
      const firstWpnProf = profs.find(p => weaponProfList.includes(p) && p !== 'shields');
      if (firstWpnProf && profToWeapon[firstWpnProf]) {
        chosenWeaponId = profToWeapon[firstWpnProf];
      } else {
        chosenWeaponId = 'katana';
      }
    } else {
      const firstMagicProf = profs.find(p => magicProfList.includes(p));
      if (firstMagicProf && magicToStaff[firstMagicProf]) {
        chosenWeaponId = magicToStaff[firstMagicProf];
      } else {
        chosenWeaponId = 'arcane_staff';
      }
    }

    const chosenWeaponDef: WeaponDef = dataLoader.getWeapon(chosenWeaponId) ||
      weaponsData.weapons.find((w: any) => w.id === chosenWeaponId) ||
      weaponsData.weapons.find((w: any) => w.id === 'katana')!;

    let totalDpsReal = 0;
    let totalDpsUnl = 0;
    let totalHpsReal = 0;
    let totalHpsUnl = 0;
    let totalCastsReal = 0;
    let totalCastsUnl = 0;
    let totalEnSpentReal = 0;
    let totalSecBelow20 = 0;

    for (const seed of seeds) {
      const realRes = runFightSimulation(
        c,
        chosenWeaponDef,
        profs,
        prereqClasses,
        classSkills,
        'real',
        seed,
        playerData,
        dataLoader
      );
      totalDpsReal += realRes.damageDealt / 90;
      totalHpsReal += realRes.healed / 90;
      totalCastsReal += realRes.casts;
      totalEnSpentReal += realRes.energySpent;
      totalSecBelow20 += realRes.secondsUntilBelow20;

      const unlRes = runFightSimulation(
        c,
        chosenWeaponDef,
        profs,
        prereqClasses,
        classSkills,
        'unlimited',
        seed,
        playerData,
        dataLoader
      );
      totalDpsUnl += unlRes.damageDealt / 90;
      totalHpsUnl += unlRes.healed / 90;
      totalCastsUnl += unlRes.casts;
    }

    const row: ClassSimRow = {
      classId: c.id,
      tier: c.tier,
      weapon: chosenWeaponId,
      dps_real: Number((totalDpsReal / seeds.length).toFixed(1)),
      dps_unlimited: Number((totalDpsUnl / seeds.length).toFixed(1)),
      hps_real: Number((totalHpsReal / seeds.length).toFixed(1)),
      hps_unlimited: Number((totalHpsUnl / seeds.length).toFixed(1)),
      casts_real: Number((totalCastsReal / seeds.length).toFixed(1)),
      casts_unlimited: Number((totalCastsUnl / seeds.length).toFixed(1)),
      en_spent_real: Number((totalEnSpentReal / seeds.length).toFixed(1)),
      seconds_until_energy_below_20: Number((totalSecBelow20 / seeds.length).toFixed(1))
    };

    rows.push(row);

    console.log(
      `[${String(idx + 1).padStart(2, ' ')}/${combatClasses.length}] ` +
      `${c.id.padEnd(20, ' ')} | ` +
      `${c.tier.padEnd(8, ' ')} | ` +
      `weapon: ${chosenWeaponId.padEnd(16, ' ')} | ` +
      `dps_real: ${String(row.dps_real).padStart(6, ' ')} | ` +
      `dps_unl: ${String(row.dps_unlimited).padStart(6, ' ')} | ` +
      `casts_r: ${String(row.casts_real).padStart(4, ' ')} | ` +
      `sec<20: ${String(row.seconds_until_energy_below_20).padStart(5, ' ')}`
    );
  }

  // Ensure output directory exists
  const outDir = path.join(rootDir, 'docs/balance');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const csvLines = [
    'class,tier,weapon,dps_real,dps_unlimited,hps_real,hps_unlimited,casts_real,casts_unlimited,en_spent_real,seconds_until_energy_below_20',
    ...rows.map(
      r => `${r.classId},${r.tier},${r.weapon},${r.dps_real},${r.dps_unlimited},${r.hps_real},${r.hps_unlimited},${r.casts_real},${r.casts_unlimited},${r.en_spent_real},${r.seconds_until_energy_below_20}`
    )
  ];

  const csvPath = path.join(outDir, 'class_sim.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`\nSaved ${rows.length} rows to ${path.relative(rootDir, csvPath)}.\n`);

  // Section 2 Reporting
  console.log('========================================================================');
  console.log('TIER MEDIANS, TOP 5 AND BOTTOM 5 CLASSES BY dps_real');
  console.log('========================================================================\n');

  const tiers = ['novice', 'adept', 'expert', 'master', 'prestige'];
  for (const t of tiers) {
    const tierRows = rows.filter(r => r.tier === t);
    tierRows.sort((a, b) => b.dps_real - a.dps_real);

    // Exclude brawler from tier medians
    const medianPool = tierRows.filter(r => r.classId !== 'brawler');
    medianPool.sort((a, b) => a.dps_real - b.dps_real);
    let medianDpsReal = 0;
    if (medianPool.length > 0) {
      const mid = Math.floor(medianPool.length / 2);
      if (medianPool.length % 2 === 1) {
        medianDpsReal = medianPool[mid].dps_real;
      } else {
        medianDpsReal = Number(((medianPool[mid - 1].dps_real + medianPool[mid].dps_real) / 2).toFixed(1));
      }
    }

    console.log(`--- TIER: ${t.toUpperCase()} (${tierRows.length} classes) | Median dps_real: ${medianDpsReal} (excluding brawler) ---`);
    console.log('  Top 5 by dps_real:');
    const top5 = tierRows.slice(0, 5);
    for (const r of top5) {
      const label = r.classId === 'brawler' ? 'brawler (intended outlier)' : r.classId;
      console.log(`    ${label.padEnd(28)} | weapon: ${r.weapon.padEnd(16)} | dps_real: ${String(r.dps_real).padStart(6)} | dps_unl: ${String(r.dps_unlimited).padStart(6)} | casts_r: ${r.casts_real}`);
    }

    console.log('  Bottom 5 by dps_real:');
    const bottom5 = tierRows.slice(-5).reverse();
    for (const r of bottom5) {
      const label = r.classId === 'brawler' ? 'brawler (intended outlier)' : r.classId;
      console.log(`    ${label.padEnd(28)} | weapon: ${r.weapon.padEnd(16)} | dps_real: ${String(r.dps_real).padStart(6)} | dps_unl: ${String(r.dps_unlimited).padStart(6)} | casts_r: ${r.casts_real}`);
    }
    console.log('');
  }

  console.log('========================================================================');
  console.log('GREATSWORD CLASSES (BEFORE vs AFTER):');
  console.log('========================================================================');
  const gsBaseline: Record<string, { dps_real: number; dps_unl: number }> = {
    brute: { dps_real: 6.0, dps_unl: 12.3 },
    reaver: { dps_real: 6.6, dps_unl: 14.9 },
    juggernaut: { dps_real: 8.7, dps_unl: 17.5 },
    death_knight: { dps_real: 6.8, dps_unl: 12.9 },
    dark_lord: { dps_real: 6.2, dps_unl: 16.1 },
    deathbringer: { dps_real: 6.9, dps_unl: 13.5 }
  };
  const gsClasses = ['brute', 'reaver', 'juggernaut', 'death_knight', 'dark_lord', 'deathbringer'];
  for (const cid of gsClasses) {
    const r = rows.find(x => x.classId === cid);
    const b = gsBaseline[cid];
    if (r) {
      console.log(`  ${r.classId.padEnd(16)} | tier: ${r.tier.padEnd(10)} | Before: dps_real=${b.dps_real.toFixed(1)}, dps_unl=${b.dps_unl.toFixed(1)} -> After: dps_real=${r.dps_real.toFixed(1)}, dps_unl=${r.dps_unlimited.toFixed(1)}`);
    }
  }
  console.log('');

  console.log('========================================================================');
  console.log('ZERO-DAMAGE CLASSES:');
  console.log('========================================================================');
  const zeroDamage = rows.filter(r => r.dps_real === 0 || r.dps_unlimited === 0);
  if (zeroDamage.length === 0) {
    console.log('  None! All 85 classes dealt > 0 damage in both real and unlimited modes.\n');
  } else {
    for (const r of zeroDamage) {
      console.log(`  - ${r.classId} (tier: ${r.tier}, weapon: ${r.weapon}): dps_real=${r.dps_real}, dps_unlimited=${r.dps_unlimited}`);
    }
  }
}

main().catch(err => {
  console.error('Balance simulation failed:', err);
  process.exit(1);
});
