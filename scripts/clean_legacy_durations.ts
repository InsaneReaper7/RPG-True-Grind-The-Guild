import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const skillsPath = path.join(rootDir, 'data/skills.json');
const statusPath = path.join(rootDir, 'data/statusEffects.json');

const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const statusMap = new Map<string, any>(statusData.statusEffects.map((s: any) => [s.id, s]));

const overrideMap: Record<string, { status: string; durationMs: number; reason: string }> = {
  trap_snare: { status: 'slow', durationMs: 4000, reason: 'Trapper identity: longer snare' },
  pinning_spear: { status: 'slow', durationMs: 4000, reason: 'Pin: longer slow' },
  crippling_volley: { status: 'slow', durationMs: 4000, reason: 'Crippling: longer slow' },
  ignite: { status: 'burn', durationMs: 6000, reason: 'Ignite: extended burn' }
};

let removedCount = 0;
let overriddenCount = 0;

for (const skill of skillsData.skills) {
  for (const eff of skill.effects || []) {
    if (eff.type === 'applyStatus' && eff.durationMs !== undefined && eff.status !== 'poison') {
      const override = overrideMap[skill.id];
      if (override && override.status === eff.status && override.durationMs === eff.durationMs) {
        eff.durationOverrideReason = override.reason;
        skill.durationOverrideReason = override.reason;
        overriddenCount++;
        console.log(`[OVERRIDE] ${skill.id}: kept ${eff.status} ${eff.durationMs}ms with reason "${override.reason}"`);
      } else {
        const defaultDur = statusMap.get(eff.status)?.durationMs;
        if (eff.durationMs === defaultDur) {
          delete eff.durationMs;
          removedCount++;
          console.log(`[REMOVE] ${skill.id}: removed ${eff.status} durationMs (matched default ${defaultDur}ms)`);
        } else {
          console.warn(`[UNEXPECTED] ${skill.id}: ${eff.status} durationMs=${eff.durationMs} default=${defaultDur}`);
        }
      }
    }
  }
}

console.log(`\nSummary: Removed durationMs from ${removedCount} effects. Added durationOverrideReason to ${overriddenCount} effects.`);

fs.writeFileSync(skillsPath, JSON.stringify(skillsData, null, 2) + '\n', 'utf8');
console.log('Saved data/skills.json successfully.');
