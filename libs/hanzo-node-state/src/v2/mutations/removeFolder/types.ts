import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type RemoveFolderResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type RemoveFolderOutput = RemoveFolderResponse;

export type RemoveFolderInput = Token & {
  nodeAddress: string;
  folderPath: string;
};
