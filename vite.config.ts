import { cpSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// three.js ships the Basis transcoder (used by KTX2Loader) as loose files. Copy them into
// public/ so dev and build serve them from the same relative path.
function basisTranscoder(): Plugin {
  return {
    name: 'basis-transcoder',
    buildStart() {
      cpSync('node_modules/three/examples/jsm/libs/basis', 'public/basis', { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (/FlyingAxe/) and locally.
  base: './',
  plugins: [basisTranscoder()],
  build: {
    target: 'es2022',
    // public/assets holds the game assets; keep the bundled JS out of it.
    assetsDir: 'bundle',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
