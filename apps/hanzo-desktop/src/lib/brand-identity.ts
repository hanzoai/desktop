import {
  getBrand,
  getBrandFromHostname,
  isMachinesEnabled,
  type Brand,
  type BrandConfig,
} from '@hanzo/desktop-brand-config';

export { getBrand, getBrandFromHostname, isMachinesEnabled, type Brand, type BrandConfig };

export type DesktopShellBrand = 'hanzo' | 'dev' | 'bot' | 'team';

export interface CrossAppItem {
  id: 'chat' | 'dev' | 'bot' | 'team' | 'console' | 'desktop';
  label: string;
  subtitle: string;
  href: string;
  internalPath?: string;
}

export const DESKTOP_CROSS_APPS: readonly CrossAppItem[] = [
  {
    id: 'chat',
    label: 'Chat',
    subtitle: 'hanzo.app · AI Workspace',
    href: 'https://hanzo.ai/chat',
    internalPath: '/chat',
  },
  {
    id: 'dev',
    label: 'Dev',
    subtitle: 'Coding Agents & Sandboxes',
    href: 'https://hanzo.ai/dev',
    internalPath: '/dev',
  },
  {
    id: 'bot',
    label: 'Bot',
    subtitle: 'hanzo.bot · Autonomous Bots',
    href: 'https://hanzo.bot',
    internalPath: '/bots',
  },
  {
    id: 'team',
    label: 'Team',
    subtitle: 'hanzo.team · Channels & Work',
    href: 'https://hanzo.team',
    internalPath: '/team',
  },
  {
    id: 'console',
    label: 'Console',
    subtitle: 'console.hanzo.ai · Cloud & IAM',
    href: 'https://console.hanzo.ai',
  },
  {
    id: 'desktop',
    label: 'Desktop / Mobile',
    subtitle: 'hanzo.app · Native Apps & CLI',
    href: 'https://hanzo.app',
  },
] as const;

export function resolveDesktopShellBrand(opts?: {
  viteBrand?: string;
  hostname?: string;
  pathname?: string;
}): DesktopShellBrand {
  const envBrand =
    opts?.viteBrand ??
    (typeof import.meta !== 'undefined'
      ? ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[
          'VITE_BRAND'
        ] ?? '')
      : '');
  const normalizedBrand = envBrand.trim().toLowerCase();
  const host = (
    opts?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  ).toLowerCase();
  const path = (
    opts?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  ).toLowerCase();

  if (
    normalizedBrand === 'bot' ||
    host === 'hanzo.bot' ||
    host === 'bot.hanzo.ai' ||
    path === '/bots' ||
    path.startsWith('/bots/') ||
    path === '/bot' ||
    path.startsWith('/bot/')
  ) {
    return 'bot';
  }

  if (
    normalizedBrand === 'team' ||
    host === 'hanzo.team' ||
    host === 'www.hanzo.team' ||
    path === '/team' ||
    path.startsWith('/team/') ||
    path === '/channels' ||
    path.startsWith('/channels/')
  ) {
    return 'team';
  }

  if (
    normalizedBrand === 'dev' ||
    normalizedBrand === 'development' ||
    path === '/dev' ||
    path.startsWith('/dev/')
  ) {
    return 'dev';
  }

  return 'hanzo';
}
