// What this file is: configuration for Vite (the dev server/bundler) and
// Vitest (the test runner) — one shared config since Vitest builds on Vite.
// In plain terms: settings for how the app is built, run, and tested.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'eval/**/*.test.ts'],
  },
});
