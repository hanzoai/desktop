import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type MoveFsItemResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type MoveFsItemOutput = MoveFsItemResponse;

export type MoveFsItemInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
