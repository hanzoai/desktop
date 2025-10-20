import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type MoveFolderResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type MoveFolderOutput = MoveFolderResponse;

export type MoveVRFolderInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
