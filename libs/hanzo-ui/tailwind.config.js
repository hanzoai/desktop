const sharedTailwindConfig = require('./src/hanzo-preset.js');
// this helps to have tailwind intellisense autocompletion working
module.exports = {
  presets: [sharedTailwindConfig],
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
};
