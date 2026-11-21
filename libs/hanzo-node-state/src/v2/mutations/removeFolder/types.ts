import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type RemoveFolderResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type RemoveFolderOutput = RemoveFolderResponse;

export type RemoveFolderInput = Token & {
  nodeAddress: string;
  folderPath: string;
};
