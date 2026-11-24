import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  base: './',
  define: {
    __SHIPPED_ART__: JSON.stringify(readdirSync(new URL('./public/art/', import.meta.url)).filter(name => name.endsWith('.webp'))),
  },
  server: { host: 'localhost', port },
  preview: { host: 'localhost', port: Number(process.env.PREVIEW_PORT ?? process.env.PORT ?? 4173) },
});
