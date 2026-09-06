import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type ImportToolZipResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type ImportToolFromZipInput = Token & {
  nodeAddress: string;
  file: File;
};

export type ImportToolFromZipOutput = ImportToolZipResponse;
