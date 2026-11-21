import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type CreateFolderResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type CreateFolderInput = Token & {
  nodeAddress: string;
  path: string;
  folderName: string;
};

export type CreateFolderOutput = CreateFolderResponse;
