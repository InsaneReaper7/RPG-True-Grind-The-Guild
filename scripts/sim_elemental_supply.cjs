const fs = require('fs');

const bandFavoured = {
  1: ['holy', 'dark'],
  2: ['arcane', 'water', 'earth'],
  3: ['fire', 'lightning'],
  4: ['ice', 'wind']
};
const allSchools = ['fire', 'water', 'ice', 'earth', 'nature', 'lightning', 'wind', 'holy', 'dark', 'arcane'];
const nonNatureSchools = allSchools.filter(s => s !== 'nature');

console.log('| Band | Total Elem / Flr | School | Favoured? | Elemental Kills / Flr | Gemstones / Flr | Floors / Staff (2 Gems) |');
console.log('| :---: | :---: | :--- | :---: | :---: | :---: | :---: |');

for (let band = 1; band <= 4; band++) {
  const favoured = bandFavoured[band];
  let elementalSpawns = 0;
  const schoolCounts = {};
  for (const s of allSchools) schoolCounts[s] = 0;
  let healingGemCount = 0;
  const totalFloors = 100000;

  for (let i = 0; i < totalFloors; i++) {
    if (Math.random() < 0.50) {
      elementalSpawns++;
      let school = '';
      const rollType = Math.random();
      if (rollType < 0.50) {
        school = favoured[Math.floor(Math.random() * favoured.length)];
      } else if (rollType < 0.62) {
        // Nature fixed 12% share
        school = 'nature';
      } else {
        // Remaining 38% spread pool
        school = nonNatureSchools[Math.floor(Math.random() * nonNatureSchools.length)];
      }
      schoolCounts[school]++;
      if (school === 'holy' && Math.random() < 0.70) {
        healingGemCount++;
      }
    }
  }

  const totalElemPerFloor = (elementalSpawns / totalFloors).toFixed(3);
  for (const s of favoured) {
    const killsPerFloor = schoolCounts[s] / totalFloors;
    const gemsPerFloor = killsPerFloor * 1.5;
    const floorsForStaff = 2 / gemsPerFloor;
    console.log(`| Band ${band} | ${totalElemPerFloor} | ${s} | Yes | ${killsPerFloor.toFixed(3)} | ${gemsPerFloor.toFixed(3)} | ${floorsForStaff.toFixed(1)} |`);
  }
  // Nature in every band
  {
    const natureKillsPerFloor = schoolCounts['nature'] / totalFloors;
    const natureGemsPerFloor = natureKillsPerFloor * 1.5;
    const floorsForNatureStaff = 2 / natureGemsPerFloor;
    console.log(`| Band ${band} | ${totalElemPerFloor} | nature | Fixed 12% | ${natureKillsPerFloor.toFixed(3)} | ${natureGemsPerFloor.toFixed(3)} | ${floorsForNatureStaff.toFixed(1)} |`);
  }
  if (band === 1) {
    const healingGemsPerFloor = healingGemCount / totalFloors;
    const floorsForHealingStaff = 2 / healingGemsPerFloor;
    console.log(`| Band 1 | ${totalElemPerFloor} | healing (secondary) | N/A | - | ${healingGemsPerFloor.toFixed(3)} | ${floorsForHealingStaff.toFixed(1)} |`);
  }
}
