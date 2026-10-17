// What this file is: the Vitest config for the live evaluation harness only. It is not used by
// `npm run test`. It sets the proxy URL the app code reads, long timeouts, and a setup file.
// In plain terms: the settings for the slow "measure tailoring quality" run.

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const DEPLOYED_PROXY = 'https://dovetailed-proxy.pimp-my-resume.workers.dev';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['eval/**/*.eval.ts'],
    setupFiles: ['eval/setup.ts'],
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
    // src/lib/llm.ts reads import.meta.env.VITE_PROXY_URL.
    env: { VITE_PROXY_URL: process.env.EVAL_PROXY_URL ?? DEPLOYED_PROXY },
  },
});
