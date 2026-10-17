import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
}

export function summarizeSim(csvSource: string): void {
  let content = '';
  // Support git revision ref format: <rev>:<path>
  if (csvSource.includes(':') && !fs.existsSync(csvSource)) {
    try {
      content = execSync(`git show ${csvSource}`, { encoding: 'utf8' });
    } catch (err: any) {
      console.error(`Failed to load git ref ${csvSource}: ${err?.message || err}`);
      process.exit(1);
    }
  } else {
    const resolved = path.resolve(process.cwd(), csvSource);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    content = fs.readFileSync(resolved, 'utf8');
  }

  const lines = content.trim().split('\n').slice(1);
  const rows = lines.map(line => {
    const parts = line.split(',');
    return {
      classId: parts[0]?.trim(),
      tier: parts[1]?.trim(),
      weapon: parts[2]?.trim(),
      dps_real: parseFloat(parts[3] || '0'),
      dps_real_st: parseFloat(parts[11] || '0')
    };
  });

  const tiers = ['novice', 'adept', 'expert', 'master', 'prestige'];

  // Calculate medians per tier
  const tierStats: Record<string, {
    packMeleeMed: number;
    packCasterMed: number;
    packRatio: number;
    stMeleeMed: number;
    stCasterMed: number;
    stRatio: number;
  }> = {};

  console.log(`Simulation Summary: ${csvSource}\n`);
  console.log('TIER MEDIANS (Brawler excluded):');
  console.log('| Tier     | Pack Melee Med | Pack Caster Med | Caster ÷ Melee (Pack) | ST Melee Med | ST Caster Med | Caster ÷ Melee (ST) |');
  console.log('|---|---|---|---|---|---|---|');

  for (const t of tiers) {
    const tRows = rows.filter(r => r.tier === t);

    // Melee: excludes brawler, leaves out healing_staff and magic *_staff, keeps druid_staff
    const meleeRows = tRows.filter(r => r.classId !== 'brawler' && (r.weapon === 'druid_staff' || !r.weapon.endsWith('_staff')));

    // Casters: every *_staff except druid_staff and healing_staff
    const casterRows = tRows.filter(r => r.classId !== 'brawler' && r.weapon.endsWith('_staff') && r.weapon !== 'druid_staff' && r.weapon !== 'healing_staff');

    const packMeleeMed = median(meleeRows.map(r => r.dps_real));
    const packCasterMed = median(casterRows.map(r => r.dps_real));
    const packRatio = packMeleeMed > 0 ? (packCasterMed / packMeleeMed) : 0;

    const stMeleeMed = median(meleeRows.map(r => r.dps_real_st));
    const stCasterMed = median(casterRows.map(r => r.dps_real_st));
    const stRatio = stMeleeMed > 0 ? (stCasterMed / stMeleeMed) : 0;

    tierStats[t] = {
      packMeleeMed,
      packCasterMed,
      packRatio,
      stMeleeMed,
      stCasterMed,
      stRatio
    };

    const packRatioStr = (packRatio * 100).toFixed(1) + '%';
    const stRatioStr = (stRatio * 100).toFixed(1) + '%';

    console.log(
      `| ${t.padEnd(8)} ` +
      `| ${packMeleeMed.toFixed(1).padStart(14)} ` +
      `| ${packCasterMed.toFixed(1).padStart(15)} ` +
      `| ${packRatioStr.padStart(21)} ` +
      `| ${stMeleeMed.toFixed(1).padStart(12)} ` +
      `| ${stCasterMed.toFixed(1).padStart(13)} ` +
      `| ${stRatioStr.padStart(19)} |`
    );
  }

  console.log('\nPER-CLASS BENCHMARKS:');
  console.log('| Class                    | Tier     | Weapon           | dps_real | % Pack Melee | dps_real_st | % ST Melee |');
  console.log('|---|---|---|---|---|---|---|');

  for (const r of rows) {
    const stats = tierStats[r.tier];
    const packPct = stats && stats.packMeleeMed > 0 ? ((r.dps_real / stats.packMeleeMed) * 100).toFixed(1) + '%' : 'N/A';
    const stPct = stats && stats.stMeleeMed > 0 ? ((r.dps_real_st / stats.stMeleeMed) * 100).toFixed(1) + '%' : 'N/A';

    console.log(
      `| ${r.classId.padEnd(24)} ` +
      `| ${r.tier.padEnd(8)} ` +
      `| ${r.weapon.padEnd(16)} ` +
      `| ${r.dps_real.toFixed(1).padStart(8)} ` +
      `| ${packPct.padStart(12)} ` +
      `| ${r.dps_real_st.toFixed(1).padStart(11)} ` +
      `| ${stPct.padStart(10)} |`
    );
  }
}

const targetPath = process.argv[2] || 'docs/balance/class_sim.csv';
summarizeSim(targetPath);
