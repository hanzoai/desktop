import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type SearchPromptsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetPromptSearchInput = Token & {
  nodeAddress: string;
  search: string;
};

export type GetPromptSearchOutput = SearchPromptsResponse;
