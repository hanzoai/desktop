import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type CopyFsItemResponse } from '@hanzo/desktop-message-ts/api/vector-fs/types';

export type CopyVRItemOutput = CopyFsItemResponse;

export type CopyVRItemInput = Token & {
  nodeAddress: string;
  originPath: string;
  destinationPath: string;
};
