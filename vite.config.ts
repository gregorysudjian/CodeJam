/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrored in tsconfig.app.json "paths"
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
