import { setToolOffering as setToolOfferingApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type SetToolOfferingInput } from './types';

export const setToolOffering = async ({
  nodeAddress,
  token,
  offering,
}: SetToolOfferingInput) => {
  const response = await setToolOfferingApi(nodeAddress, token, {
    tool_offering: offering,
  });
  return response;
};
