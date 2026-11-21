import { importAgent as importAgentApi } from '@hanzo_network/hanzo-message-ts/api/agents/index';

import { type ImportAgentInput } from './types';

export const importAgent = async ({
  nodeAddress,
  token,
  file,
}: ImportAgentInput) => {
  return await importAgentApi(nodeAddress, token, file);
};
