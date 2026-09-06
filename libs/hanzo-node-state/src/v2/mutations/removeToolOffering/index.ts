import { removeToolOffering as removeToolOfferingApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type RemoveToolInput } from './types';

export const removeToolOffering = async ({
  nodeAddress,
  token,
  toolKey,
}: RemoveToolInput) => {
  return await removeToolOfferingApi(nodeAddress, token, {
    tool_key_name: toolKey,
  });
};
