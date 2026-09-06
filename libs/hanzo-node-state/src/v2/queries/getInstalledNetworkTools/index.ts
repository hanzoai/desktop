import { getInstalledNetworkTools as getInstalledNetworkToolsApi } from '@hanzo/desktop-message-ts/api/tools/index';
import { type GetInstalledNetworkToolsInput } from './types';

export const getInstalledNetworkTools = async ({
  nodeAddress,
  token,
}: GetInstalledNetworkToolsInput) => {
  const result = await getInstalledNetworkToolsApi(nodeAddress, token);
  return result;
};
