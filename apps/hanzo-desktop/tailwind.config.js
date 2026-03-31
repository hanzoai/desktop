/** @type {import('tailwindcss').Config} */

const { join } = require('path');
const sharedTailwindConfig = require('../../libs/hanzo-ui/src/hanzo-preset.js');

module.exports = {
  presets: [sharedTailwindConfig],
  content: [
    join(
      __dirname,
      '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html,css}',
    ),
    join(
      __dirname,
      '../../libs/*/src/**/*!(*.stories|*.spec).{ts,tsx,html,css}',
    ),
  ],
};
