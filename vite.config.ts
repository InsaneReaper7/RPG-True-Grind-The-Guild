import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
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
