import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsPath = path.resolve(__dirname, '../data/skills.json');

const data = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));

const waveBIds = [
  'fireball', 'combust', 'heat_wave', 'kindle', 'inferno',
  'frost_tide', 'undertow', 'tidal_surge', 'renewing_mist', 'deluge',
  'arc_bolt', 'static_charge', 'forked_lightning', 'thunder_strike', 'tempest',
  'cutting_gale', 'slipstream', 'vacuum_blade', 'squall', 'hurricane',
  'venom_thorn', 'rejuvenate', 'strangling_vines', 'toxic_bloom', 'natures_wrath',
  'holy_light', 'chastise', 'sanctuary', 'divine_grace', 'holy_fire',
  'eldritch_bolt', 'drain_life', 'agony', 'shadow_ward', 'soul_rend'
];

let profCount = 0;
for (const s of data.skills) {
  if (waveBIds.includes(s.id)) {
    const origLen = s.requirements.length;
    s.requirements = s.requirements.filter((r: any) => r.type !== 'proficiency');
    if (s.requirements.length !== origLen) profCount++;
  }
}
console.log(`Removed proficiency requirements from ${profCount} Wave B skills.`);

const descriptionReplacements: Record<string, string> = {
  fireball: 'Hurls an explosive sphere of flame dealing 1.1x spell damage in a 1-tile radius with a 40% chance to burn the main target.',
  inferno: 'Calls down an apocalyptic inferno dealing 3.0x spell damage in a 2.5 tile radius, setting the main target ablaze.',
  toxic_bloom: 'Erupts noxious spores in a 1.5 tile radius dealing 1.3x spell damage and poisoning the main target for 6 seconds.',
  holy_fire: 'Consecrates the area in sacred fire dealing 2.6x spell damage in a 2 tile radius, exposing the main target.',
  tidal_surge: 'Unleashes a sweeping torrent in a line hitting up to 4 targets for 1.4x spell damage and slowing the main target by 100%.',
  vacuum_blade: 'Slices through up to 4 enemies in a line for 1.6x spell damage, weakening the main target\'s damage by 20% for 5 seconds.',
  hurricane: 'Conjures a tempestuous hurricane piercing up to 6 targets in a line for 3.0x spell damage with a 60% bleed chance on the main target.'
};

let descCount = 0;
for (const [id, newDesc] of Object.entries(descriptionReplacements)) {
  const s = data.skills.find((x: any) => x.id === id);
  if (s) {
    s.description = newDesc;
    descCount++;
  }
}
console.log(`Updated descriptions for ${descCount} skills.`);

fs.writeFileSync(skillsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Saved data/skills.json successfully.');
