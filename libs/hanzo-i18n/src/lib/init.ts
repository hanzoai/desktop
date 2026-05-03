import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';

import { type Locales, normalizeLocale } from './constants';

const isDev = import.meta.env.DEV;

// Resolve the brand at module load. Bundlers replace import.meta.env.VITE_BRAND
// at build time so each branded build only ships its own overlay.
const brand = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env?.['VITE_BRAND'];

type Translation = Record<string, unknown>;

function deepMerge(base: Translation, overlay: Translation): Translation {
  const out: Translation = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === 'object' &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k] as Translation, v as Translation);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const initI18n = () => {
  void i18n
    .use(initReactI18next)
    .use(LanguageDetector)
    .use(
      resourcesToBackend(async (lng: string) => {
        const normalized = normalizeLocale(lng);
        const baseModule =
          isDev && lng === 'en-US'
            ? await import(`./default`)
            : await import(`../../locales/${normalized}.json`);
        const base = (baseModule.default ?? baseModule) as Translation;
        if (brand && brand !== 'hanzo') {
          try {
            const overlayModule = await import(
              `../../overlays/${brand}/${normalized}.json`
            );
            const overlay = (overlayModule.default ??
              overlayModule) as Translation;
            return deepMerge(base, overlay);
          } catch {
            // No overlay for this brand/locale — fall through to base.
          }
        }
        return base;
      }),
    )
    .init({
      debug: isDev,
      fallbackLng: 'en-US',
      interpolation: {
        escapeValue: false,
      },
    });
  return i18n;
};

export const i18NextInstance = initI18n();

/*  Only use this function when you need to render a string from outside a
component. */
export const { t } = i18NextInstance;

export * from './useTranslation';

export type LocaleMode = Locales | 'auto';

export const switchLanguage = (locale: LocaleMode) => {
  const lang = locale === 'auto' ? navigator.language : locale;
  void i18NextInstance.changeLanguage(lang);
};
