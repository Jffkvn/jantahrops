import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    // Source maps locally; never on hosted builds (Netlify sets NETLIFY=true,
    // Vercel sets VERCEL=1), where they would publish the app's source code.
    sourcemap: process.env.NETLIFY !== 'true' && process.env.VERCEL !== '1',
    target: 'es2022',
  },
});
