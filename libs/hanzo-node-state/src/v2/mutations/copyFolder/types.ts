import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type CopyFolderResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type CopyFolderOutput = CopyFolderResponse;

export type CopyFolderInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
