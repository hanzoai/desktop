import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetSearchDirectoryContentsResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type GetSearchDirectoryContentsInput = Token & {
  nodeAddress: string;
  name: string;
};
export type GetSearchDirectoryContentsOutput =
  GetSearchDirectoryContentsResponse;
