import { getToolProtocols as getToolProtocolsApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

export const getToolProtocols = async () => {
  const response = await getToolProtocolsApi();
  return response;
};
