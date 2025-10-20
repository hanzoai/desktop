import { addNetworkTool as addNetworkToolApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';
import { type AddNetworkToolInput } from './types';

export const addNetworkTool = async ({
  nodeAddress,
  token,
  networkTool,
}: AddNetworkToolInput) => {
  return addNetworkToolApi(nodeAddress, token, {
    assets: [],
    tool: {
      type: 'Network',
      content: [networkTool, true],
    },
  });
};
