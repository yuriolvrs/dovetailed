// What this file is: Vitest config for the extension. It uses jsdom and a fake IndexedDB.
// In plain terms: settings for running the extension's unit tests.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'entrypoints/**/*.test.ts'],
  },
});
