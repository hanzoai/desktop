import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetSearchDirectoryContentsResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type GetSearchDirectoryContentsInput = Token & {
  nodeAddress: string;
  name: string;
};
export type GetSearchDirectoryContentsOutput =
  GetSearchDirectoryContentsResponse;
