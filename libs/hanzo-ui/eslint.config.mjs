import baseConfig from '../../eslint.config.mjs';

export default [
  {
    ignores: ['**/dist'],
  },
  ...baseConfig,
  {
    files: [
      '**/*.ts',
      '**/*.cts',
      '**/*.mts',
      '**/*.tsx',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '**/*.jsx',
    ],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.cts', '**/*.mts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
