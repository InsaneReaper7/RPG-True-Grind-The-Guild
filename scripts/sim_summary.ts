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
      dps_real: parseFloat(parts[3] || '0')
    };
  });

  const tiers = ['novice', 'adept', 'expert', 'master', 'prestige'];
  console.log(`Simulation Summary: ${csvSource}`);
  console.log('| Tier | Overall Median DPS | Melee-only Median DPS |');
  console.log('|---|---|---|');
  for (const t of tiers) {
    const tRows = rows.filter(r => r.tier === t);
    const overallMed = median(tRows.map(r => r.dps_real));
    // Melee-only excludes healing_staff support classes
    const meleeMed = median(tRows.filter(r => r.weapon !== 'healing_staff').map(r => r.dps_real));
    console.log(`| ${t.padEnd(8)} | ${overallMed.toFixed(1).padStart(18)} | ${meleeMed.toFixed(1).padStart(21)} |`);
  }
}

const targetPath = process.argv[2] || 'docs/balance/class_sim.csv';
summarizeSim(targetPath);
