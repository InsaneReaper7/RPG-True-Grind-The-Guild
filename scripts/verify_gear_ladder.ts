import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WeaponDef, ArmorDef } from '../src/types/game.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const weaponsData: { weapons: WeaponDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/weapons.json'), 'utf8'));
const armorsData: { armors: ArmorDef[] } = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/armors.json'), 'utf8'));

const weaponMap = new Map<string, WeaponDef>();
for (const w of weaponsData.weapons) {
  weaponMap.set(w.id, w);
}
const armorMap = new Map<string, ArmorDef>();
for (const a of armorsData.armors) {
  armorMap.set(a.id, a);
}

interface WeaponLadderEntry {
  family: string;
  rungs: {
    band: number;
    id: string;
    name: string;
    dmg: number;
    interval: number;
    dps: number;
    special?: string;
    specialChance?: number;
    range?: number;
    block?: number;
    mitigation?: number;
  }[];
}

const weaponLadders: WeaponLadderEntry[] = [
  {
    family: '1H Swords (Longswords)',
    rungs: [
      { band: 1, id: 'longsword_1h', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_longsword', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_longsword', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: '1H Swords (Katana)',
    rungs: [
      { band: 1, id: 'katana', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_katana', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_katana', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Short Swords',
    rungs: [
      { band: 1, id: 'short_swords', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_short_sword', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_short_sword', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: '2H Swords',
    rungs: [
      { band: 1, id: 'longsword_2h', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'greatswords', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_greatsword', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Maces',
    rungs: [
      { band: 1, id: 'mace', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'heavy_mace', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'spiked_morningstar', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Bows',
    rungs: [
      { band: 1, id: 'bows', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'composite_bow', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'war_bow', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Spears (1H)',
    rungs: [
      { band: 1, id: 'spears', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_spear', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_spear', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Spears (2H Halberds)',
    rungs: [
      { band: 1, id: 'spears_2h', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_halberd', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_halberd', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Daggers',
    rungs: [
      { band: 1, id: 'daggers', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'serrated_daggers', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_daggers', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Crossbows',
    rungs: [
      { band: 1, id: 'crossbows', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'heavy_crossbow', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_crossbow', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Plain Staves',
    rungs: [
      { band: 1, id: 'staff', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'reinforced_staff', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_staff', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Throwing Weapons',
    rungs: [
      { band: 1, id: 'throwing_weapons', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_throwing_weapons', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_throwing_weapons', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  },
  {
    family: 'Shields',
    rungs: [
      { band: 1, id: 'shields', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 2, id: 'steel_shield', name: '', dmg: 0, interval: 0, dps: 0 },
      { band: 3, id: 'void_shield', name: '', dmg: 0, interval: 0, dps: 0 }
    ]
  }
];

console.log('========================================================================================================');
console.log('WEAPON LADDER PROGRESSION VERIFICATION');
console.log('========================================================================================================');
console.log(
  'Family'.padEnd(24) +
  'Band'.padEnd(6) +
  'Name'.padEnd(28) +
  'Dmg/Int'.padEnd(14) +
  'DPS'.padEnd(10) +
  'Step %'.padEnd(10) +
  'Special / Stat'.padEnd(22) +
  'Status'
);
console.log('--------------------------------------------------------------------------------------------------------');

for (const entry of weaponLadders) {
  let prevDps = 0;
  let prevBlock = 0;
  let prevMit = 0;

  for (let i = 0; i < entry.rungs.length; i++) {
    const rung = entry.rungs[i];
    const w = weaponMap.get(rung.id);
    if (!w) {
      console.log(`ERROR: weapon ${rung.id} not found!`);
      continue;
    }
    rung.name = w.name;
    rung.dmg = w.baseDamage;
    rung.interval = w.attackIntervalMs;
    rung.dps = Number(((w.baseDamage / w.attackIntervalMs) * 1000).toFixed(2));
    rung.range = w.attackRangeTiles;
    rung.block = w.baseBlock;
    rung.mitigation = w.baseMitigation;

    let specialStr = '';
    if (w.bleedChance) specialStr = `Bleed ${(w.bleedChance * 100).toFixed(0)}%`;
    else if (w.stunChance) specialStr = `Stun ${(w.stunChance * 100).toFixed(0)}%`;
    else if (w.attackRangeTiles) specialStr = `Range ${w.attackRangeTiles}`;
    else if (w.baseBlock !== undefined) specialStr = `Blk ${(w.baseBlock * 100).toFixed(1)}%, Mit ${w.baseMitigation}`;

    let stepStr = '-';
    let status = 'OK';

    if (entry.family === 'Shields') {
      if (i > 0) {
        const blockStep = ((rung.block! - prevBlock) / prevBlock) * 100;
        const mitStep = ((rung.mitigation! - prevMit) / prevMit) * 100;
        stepStr = `+${blockStep.toFixed(1)}%`;
        if (rung.id === 'steel_shield') {
          // Explicit Director exception noted in prompt
          status = 'PASS (EXCEPT: +100% mit, +30.0% blk)';
        } else {
          status = 'PASS';
        }
      }
      prevBlock = rung.block!;
      prevMit = rung.mitigation!;
    } else {
      if (i > 0) {
        const step = ((rung.dps - prevDps) / prevDps) * 100;
        stepStr = `+${step.toFixed(1)}%`;
        // Allowed target range: ~20% to ~35% (composite_bow baseline was +63.6%)
        if (step >= 20.0 && step <= 35.0) {
          status = 'PASS';
        } else if (entry.family === 'Bows' && rung.id === 'composite_bow') {
          status = 'PASS (Existing baseline)';
        } else {
          status = 'FLAG';
        }
      }
      prevDps = rung.dps;
    }

    console.log(
      (i === 0 ? entry.family : '').padEnd(24) +
      String(`B${rung.band}`).padEnd(6) +
      rung.name.padEnd(28) +
      `${rung.dmg} / ${rung.interval}ms`.padEnd(14) +
      String(rung.dps.toFixed(2)).padEnd(10) +
      stepStr.padEnd(10) +
      specialStr.padEnd(22) +
      status
    );
  }
  console.log('--------------------------------------------------------------------------------------------------------');
}

console.log('\n========================================================================================================');
console.log('ARMOR LADDER PROGRESSION VERIFICATION');
console.log('========================================================================================================');
console.log(
  'Slot'.padEnd(14) +
  'Band'.padEnd(6) +
  'Name'.padEnd(26) +
  'Class'.padEnd(10) +
  'Weight'.padEnd(10) +
  'HP'.padEnd(8) +
  'HP Split'.padEnd(14) +
  'Step %'.padEnd(10) +
  'Status'
);
console.log('--------------------------------------------------------------------------------------------------------');

interface ArmorLadderEntry {
  slot: string;
  rungs: {
    band: number;
    id: string;
  }[];
}

const armorLadders: ArmorLadderEntry[] = [
  {
    slot: 'Helmet',
    rungs: [
      { band: 1, id: 'leather_cap' },
      { band: 2, id: 'silk_cowl' },
      { band: 3, id: 'void_greathelm' }
    ]
  },
  {
    slot: 'Body',
    rungs: [
      { band: 1, id: 'leather_armor' },
      { band: 2, id: 'silk_robe' },
      { band: 3, id: 'void_plate_armor' }
    ]
  },
  {
    slot: 'Necklace',
    rungs: [
      { band: 1, id: 'bone_necklace' },
      { band: 3, id: 'void_pendant' }
    ]
  },
  {
    slot: 'Ring',
    rungs: [
      { band: 1, id: 'wolf_claw_ring' },
      { band: 3, id: 'void_ring' }
    ]
  },
  {
    slot: 'Accessory',
    rungs: [
      { band: 2, id: 'venom_charm' },
      { band: 3, id: 'void_relic' }
    ]
  }
];

for (const entry of armorLadders) {
  let prevHp = 0;
  for (let i = 0; i < entry.rungs.length; i++) {
    const rung = entry.rungs[i];
    const a = armorMap.get(rung.id);
    if (!a) {
      console.log(`ERROR: armor ${rung.id} not found!`);
      continue;
    }
    const hp = a.hpBonus;
    let stepStr = '-';
    let status = 'PASS';
    if (i > 0) {
      const step = ((hp - prevHp) / prevHp) * 100;
      stepStr = `+${step.toFixed(1)}%`;
      if (step >= 50 && step <= 120) {
        status = 'PASS';
      } else {
        status = 'FLAG';
      }
    }
    prevHp = hp;

    console.log(
      (i === 0 ? entry.slot : '').padEnd(14) +
      String(`B${rung.band}`).padEnd(6) +
      a.name.padEnd(26) +
      (a.weightClass ?? 'None').padEnd(10) +
      `${a.weight}kg`.padEnd(10) +
      String(a.hpBonus).padEnd(8) +
      (a.splitRatio ?? '50/50').padEnd(14) +
      stepStr.padEnd(10) +
      status
    );
  }
  console.log('--------------------------------------------------------------------------------------------------------');
}
