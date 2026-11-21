import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type MoveFsItemResponse } from '@hanzo_network/hanzo-message-ts/api/vector-fs/types';

export type MoveFsItemOutput = MoveFsItemResponse;

export type MoveFsItemInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
