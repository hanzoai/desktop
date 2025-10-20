import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type ImportToolZipResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type ImportToolFromZipInput = Token & {
  nodeAddress: string;
  file: File;
};

export type ImportToolFromZipOutput = ImportToolZipResponse;
