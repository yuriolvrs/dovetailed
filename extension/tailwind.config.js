// What this file is: Tailwind config for the extension. It reuses the root config as a preset.
// In plain terms: styling settings shared with the main app, plus the extension's own files to scan.
import rootConfig from '../tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [rootConfig],
  content: ['./entrypoints/**/*.{ts,tsx,html}', './src/**/*.{ts,tsx}', '../src/components/**/*.{ts,tsx}'],
};
