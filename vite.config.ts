import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';

function resolveGitCommitSha(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA.trim();
  }
  try {
    return child_process.execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

const appVersion = resolveGitCommitSha();
const buildDate = new Date().toISOString();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(buildDate)
  },
  server: {
    port: 3000,
    open: false
  },
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: true
  },
  build: {
    target: 'esnext'
  },
  plugins: [
    {
      name: 'copy-data-dir',
      closeBundle() {
        const srcDir = path.resolve(__dirname, 'data');
        const destDir = path.resolve(__dirname, 'dist/data');
        fs.cpSync(srcDir, destDir, { recursive: true });
      }
    }
  ]
});
