import config from '../config';

export const HANZO_STORE_URL = config.isDev
  ? 'http://localhost:3000'
  : import.meta.env.VITE_HANZO_STORE_URL || 'https://store.hanzo.com';
