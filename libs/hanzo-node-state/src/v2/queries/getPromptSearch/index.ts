import { searchPrompt as searchPromptApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type GetPromptSearchInput } from './types';

export const getPromptSearch = async ({
  nodeAddress,
  token,
  search,
}: GetPromptSearchInput) => {
  const response = await searchPromptApi(nodeAddress, token, search);
  return response;
};
