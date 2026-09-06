import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // E2E suites carry their own tsconfigs (Playwright smoke + the wdio Tauri
    // E2E) and live outside the app's typed-lint project — ignore them here so
    // the typed parser doesn't choke on files not in tsconfig.app/spec.
    ignores: [
      '**/dist',
      '**/src-tauri/target/**',
      'e2e/**',
      'e2e-tests/**',
      'wdio.conf.ts',
    ],
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
