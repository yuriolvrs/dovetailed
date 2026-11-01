// What this file is: PostCSS config wiring Tailwind and Autoprefixer into the extension build.
// In plain terms: lets the styling tool run during the build.
export default {
  plugins: {
    tailwindcss: { config: './tailwind.config.js' },
    autoprefixer: {},
  },
};
