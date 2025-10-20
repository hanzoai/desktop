import { getInstalledNetworkTools as getInstalledNetworkToolsApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';
import { type GetInstalledNetworkToolsInput } from './types';

export const getInstalledNetworkTools = async ({
  nodeAddress,
  token,
}: GetInstalledNetworkToolsInput) => {
  const result = await getInstalledNetworkToolsApi(nodeAddress, token);
  return result;
};
