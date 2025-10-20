import { createPrompt as createPromptApi } from '@hanzo_network/hanzo-message-ts/api/tools/index';

import { type CreatePromptInput } from './types';

export const createPrompt = async ({
  nodeAddress,
  token,
  promptName,
  promptContent,
}: CreatePromptInput) => {
  return await createPromptApi(nodeAddress, token, {
    name: promptName,
    prompt: promptContent,
    is_enabled: true,
    is_favorite: false,
    is_system: true,
    version: '1',
  });
};
