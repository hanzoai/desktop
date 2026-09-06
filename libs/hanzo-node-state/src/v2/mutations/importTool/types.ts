import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type ImportToolResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type ImportToolInput = Token & {
  nodeAddress: string;
  url: string;
};

export type ImportToolOutput = ImportToolResponse;
