import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type ImportToolResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type ImportToolInput = Token & {
  nodeAddress: string;
  url: string;
};

export type ImportToolOutput = ImportToolResponse;
