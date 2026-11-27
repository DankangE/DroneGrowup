import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);
// The repo's own browser checks (scripts/*.mjs) build through Vite's API and drive the game with ?seed and
// ?debug=1. Every other build (npx vite build, npm run build, vercel build) is a release build: those entry
// points are compiled out. The dev server keeps them.
const real = (path: string) => { try { return realpathSync(path); } catch { return path; } };
const checkScript = real(process.argv[1] ?? '').startsWith(real(fileURLToPath(new URL('./scripts', import.meta.url))) + sep);

export default defineConfig(({ command }) => ({
  base: './',
  define: { __LIFE_DEV_HOOKS__: JSON.stringify(command === 'serve' || checkScript) },
  server: { host: 'localhost', port },
  preview: { host: 'localhost', port: Number(process.env.PREVIEW_PORT ?? process.env.PORT ?? 4173) },
}));
