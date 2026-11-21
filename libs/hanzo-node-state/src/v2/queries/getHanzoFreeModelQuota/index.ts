import { type GetHanzoFreeModelQuotaOutput } from './types';

/**
 * Cloud free-tier quota is retired. The desktop is local-only (engine on
 * :36900/:36901, node RPC on :3690) and no longer calls the cloud
 * `/v2/hanzo_backend_quota?model=FREE_TEXT_INFERENCE` endpoint. Resolves to
 * `null` so consumers render no free-tier usage UI.
 */
export const getHanzoFreeModelQuota =
  async (): Promise<GetHanzoFreeModelQuotaOutput> => {
    return null;
  };
