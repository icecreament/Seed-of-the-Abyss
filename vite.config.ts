import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Generated evidence is not source; Windows may briefly lock copied screenshots.
    watch: { ignored: ['**/output/**', '**/.scan-*/**', '**/release/**'] },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
