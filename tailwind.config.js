// What this file is: configuration for Tailwind CSS — tells it which files
// to scan for class names so it only generates the CSS actually used.
// In plain terms: settings for the styling tool used throughout the app.

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
