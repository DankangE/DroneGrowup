import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  base: './',
  server: { host: 'localhost', port },
  preview: { host: 'localhost', port: Number(process.env.PREVIEW_PORT ?? process.env.PORT ?? 4173) },
});
