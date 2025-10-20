import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    resources: typeof import('../../libs/hanzo-i18n/src/lib/resources').default;
    defaultNS: 'translation';
  }
}
