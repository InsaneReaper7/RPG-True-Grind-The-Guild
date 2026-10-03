const spells = [
  { id: 'fire_magic', name: 'Fire', baseDamage: 10, intervalMs: 1500, en: 22, dmgPerLv: 0.50, enRedPerLv: 0.1, utilitySec: '+1.50 DoT DPS (Burn)', mechanics: 'Burn (35% proc: 2 dmg/s), 50% splash in 1 tile' },
  { id: 'lightning_magic', name: 'Lightning', baseDamage: 8, intervalMs: 1300, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '0.23 Stun/s (Shock)', mechanics: 'Shock (30% proc: 1s interrupt), Chain (2 hops: 70%, 49%)' },
  { id: 'arcane_magic', name: 'Arcane', baseDamage: 8, intervalMs: 1300, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '+3.08 EN/s refunded', mechanics: 'Mana Siphon (+4 EN/cast, net drain 12.31 EN/s)' },
  { id: 'dark_magic', name: 'Dark', baseDamage: 8, intervalMs: 1300, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '-25% enemy dmg', mechanics: 'Curse (35% proc: -25% enemy dmg for 5s)' },
  { id: 'holy_magic', name: 'Holy', baseDamage: 8, intervalMs: 1400, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '+2.14 HP/s ally heal', mechanics: 'Radiance Heal (+3 HP/hit to most injured ally)' },
  { id: 'ice_magic', name: 'Ice', baseDamage: 7, intervalMs: 1400, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '-50% move speed', mechanics: 'Slow (35% proc: -50% move speed for 3s)' },
  { id: 'water_magic', name: 'Water (New)', baseDamage: 7, intervalMs: 1400, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '+1.43 HP/s ally heal', mechanics: 'Tidal Heal (+2 HP/hit), Slow (20% proc: -50% move)' },
  { id: 'earth_magic', name: 'Earth (New)', baseDamage: 10, intervalMs: 1800, en: 22, dmgPerLv: 0.50, enRedPerLv: 0.1, utilitySec: '-10% party dmg taken', mechanics: 'Stoneskin (-10% party dmg taken, 4s), Stun (20% proc: 2s)' },
  { id: 'nature_magic', name: 'Nature (New)', baseDamage: 7, intervalMs: 1400, en: 20, dmgPerLv: 0.45, enRedPerLv: 0.1, utilitySec: '+1.00 HP/s HoT, +1.00 DoT DPS', mechanics: 'Regrowth (+1 HP/s, max 1/caster), Poison (30% proc: 6s, 2 dmg/tick)' },
  { id: 'wind_magic', name: 'Wind (New)', baseDamage: 5, intervalMs: 1000, en: 14, dmgPerLv: 0.35, enRedPerLv: 0.1, utilitySec: '+10.00 Pierce DPS (AoE)', mechanics: 'Piercing Line (hits up to 3 targets in corridor for full dmg)' }
];

console.log('| Spell | Base Dmg | Interval | Lv 0 Single DPS | Lv 0 EN/s | Utility per Second | Secondary Mechanics / Status | Lv 10 DPS | Lv 10 EN/s |');
console.log('| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: | :---: |');

for (const s of spells) {
  const lv0Dmg = s.baseDamage;
  const lv0Dps = (lv0Dmg / (s.intervalMs / 1000));
  const lv0EnSec = (s.en / (s.intervalMs / 1000));

  const lv10Dmg = s.baseDamage + 10 * s.dmgPerLv;
  const lv10En = Math.max(1, s.en - 10 * s.enRedPerLv);
  const lv10Dps = (lv10Dmg / (s.intervalMs / 1000));
  const lv10EnSec = (lv10En / (s.intervalMs / 1000));

  console.log(`| ${s.name} | ${lv0Dmg} | ${s.intervalMs} ms | ${lv0Dps.toFixed(2)} | ${lv0EnSec.toFixed(2)} | ${s.utilitySec} | ${s.mechanics} | ${lv10Dps.toFixed(2)} | ${lv10EnSec.toFixed(2)} |`);
}
