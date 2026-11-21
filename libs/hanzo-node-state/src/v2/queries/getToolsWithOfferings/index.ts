import { getToolsWithOfferings as getToolsWithOfferingsApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type GetToolsWithOfferingsInput } from './types';

export const getToolsWithOfferings = async ({
  nodeAddress,
  token,
}: GetToolsWithOfferingsInput) => {
  const result = await getToolsWithOfferingsApi(nodeAddress, token);
  return result;
};
