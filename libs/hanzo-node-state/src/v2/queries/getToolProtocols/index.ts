import { getToolProtocols as getToolProtocolsApi } from '@hanzo/desktop-message-ts/api/tools/index';

export const getToolProtocols = async () => {
  const response = await getToolProtocolsApi();
  return response;
};
