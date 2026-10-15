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
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.isAggroed = true;
  return enemy;
}

async function main() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const skillsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/skills.json'), 'utf8'));
  const weaponsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
  const playerData = dataLoader.getPlayer();

  const katanaDef: WeaponDef = weaponsData.weapons.find((w: any) => w.id === 'katana')!;
  const fireStaffDef: WeaponDef = weaponsData.weapons.find((w: any) => w.id === 'fire_staff')!;

  const damageSkills = skillsData.skills.filter((s: any) =>
    (s.effects || []).some((e: any) => e.type === 'damage')
  );

  console.log(`Starting Single-Cast Skill Probe for ${damageSkills.length} skills with damage effect...\n`);

  interface ProbeResult {
    skill: string;
    classId: string;
    scaling: string;
    base: number;
    multiplier: number;
    hits: number;
    dealt: number;
    ratio: number;
    castSuccess: boolean;
  }

  const results: ProbeResult[] = [];

  for (const skill of damageSkills) {
    const dmgEff = (skill.effects || []).find((e: any) => e.type === 'damage')!;
    const scaling = dmgEff.scaling || 'weapon';
    const multiplier = dmgEff.multiplier;
    const hits = dmgEff.hits ?? 1;

    const classReq = (skill.requirements || []).find((r: any) => r.type === 'classLevel');
    const classId = classReq ? classReq.target : 'unknown';

    const chosenWeaponDef = scaling === 'spell' ? fireStaffDef : katanaDef;
    const baseDamage = scaling === 'spell' ? 10 : 6;

    const scene = createMockScene();
    const combat = new CombatSystem(scene);

    const caster = new Player(scene, 10, 10, playerData, chosenWeaponDef, 32);
    caster.entityName = `Tester ${classId}`;
    caster.progression.setClassLevel(classId, 40);
    caster.progression.activeClassId = classId;

    // Reset all proficiencies to 0
    for (const [k, v] of (caster.progression as any).proficiencies.entries()) {
      v.level = 0;
      v.currentExp = 0;
    }

    caster.mood = 50;
    caster.energy = 100;
    caster.maxEnergy = 100;
    caster.hp = 100;
    caster.maxHp = 100;
    caster.knownSkillIds = [skill.id];
    caster.equippedSkillIds = [skill.id];

    combat.party = [caster];

    // 100,000 HP dummy with no statuses at distance 1
    const dummy = createDummyEnemy(scene, 11, 10, 'Target Dummy', 100000);
    dummy.hp = 100000;
    dummy.maxHp = 100000;
    dummy.enemyData.meleeDamage = 0;
    if (dummy.activeStatusEffects) dummy.activeStatusEffects.clear();

    combat.enemies = [dummy];
    caster.targetEntity = dummy;

    // Fix Math.random: first call is hit roll -> 0.0 (always hits); subsequent calls -> 0.999 (no procs)
    let hitRollDone = false;
    Math.random = () => {
      if (!hitRollDone) {
        hitRollDone = true;
        return 0.0;
      }
      return 0.999;
    };

    const initialHp = dummy.hp;
    const castSuccess = combat.castSkill(caster, skill.id, dummy, 1000);
    const dealt = Number((initialHp - dummy.hp).toFixed(2));

    const expected = baseDamage * multiplier;
    const ratio = expected > 0 ? Number((dealt / expected).toFixed(2)) : 0;

    results.push({
      skill: skill.id,
      classId,
      scaling,
      base: baseDamage,
      multiplier,
      hits,
      dealt,
      ratio,
      castSuccess
    });
  }

  // Ensure output directory exists
  const outDir = path.join(rootDir, 'docs/balance');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Generate CSV
  const csvLines = [
    'skill,class,scaling,base,multiplier,hits,dealt,ratio',
    ...results.map(r => `${r.skill},${r.classId},${r.scaling},${r.base},${r.multiplier},${r.hits},${r.dealt},${r.ratio}`)
  ];
  const csvPath = path.join(outDir, 'skill_probe.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`Saved ${results.length} rows to ${path.relative(rootDir, csvPath)}.\n`);

  // Out of band list (outside 0.90–1.15)
  const outOfBand = results.filter(r => r.ratio < 0.90 || r.ratio > 1.15);

  console.log('========================================================================');
  console.log(`SKILL PROBE SUMMARY: ${results.length} skills evaluated`);
  console.log(`In-band (0.90 - 1.15): ${results.length - outOfBand.length}`);
  console.log(`Out-of-band (< 0.90 or > 1.15): ${outOfBand.length}`);
  console.log('========================================================================\n');

  console.log('OUT-OF-BAND SKILLS:');
  for (const r of outOfBand) {
    console.log(`  - ${r.skill.padEnd(25)} (class: ${r.classId.padEnd(20)}, scaling: ${r.scaling.padEnd(6)}): base=${r.base}, mult=${r.multiplier}, hits=${r.hits}, dealt=${r.dealt}, ratio=${r.ratio}${!r.castSuccess ? ' [CAST FAILED]' : ''}`);
  }
}

main().catch(err => {
  console.error('Skill probe failed:', err);
  process.exit(1);
});
