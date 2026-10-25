import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built game also works from a sub-folder or a file share.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Dev server listens on this computer only (localhost). `npm run dev:lan` opts in to the local network for phone tests —
  // only on a network you trust: the dev server can serve files from your disk to anyone who can reach it.
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
