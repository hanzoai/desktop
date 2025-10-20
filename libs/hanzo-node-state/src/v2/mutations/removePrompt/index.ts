import { removePrompt as removePromptApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type RemovePromptInput } from './types';

export const removePrompt = async ({
  nodeAddress,
  token,
  promptName,
}: RemovePromptInput) => {
  return await removePromptApi(nodeAddress, token, {
    prompt_name: promptName,
  });
};
