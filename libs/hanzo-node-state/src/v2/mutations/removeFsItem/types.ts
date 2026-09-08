import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type RemoveFsItemResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type RemoveFsItemOutput = RemoveFsItemResponse;
export type RemoveFsItemInput = Token & {
  nodeAddress: string;
  itemPath: string;
};
