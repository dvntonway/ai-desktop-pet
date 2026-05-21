import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Keep renderer output separate from electron-builder's dist/ output dir
    // so successive builds don't bundle old installer artefacts into the asar.
    outDir: 'dist-renderer',
    emptyOutDir: true,
  },
  // Expose GEMINI_* vars from .env to the renderer alongside the default VITE_* ones
  envPrefix: ['VITE_', 'ANTHROPIC_'],
});
