import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type MoveFolderResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type MoveFolderOutput = MoveFolderResponse;

export type MoveVRFolderInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
