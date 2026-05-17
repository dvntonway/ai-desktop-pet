import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Expose GEMINI_* vars from .env to the renderer alongside the default VITE_* ones
  envPrefix: ['VITE_', 'ANTHROPIC_'],
});
