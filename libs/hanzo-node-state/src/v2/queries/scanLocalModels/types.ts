import { type ScanLocalModelsResponse } from '@hanzo/desktop-message-ts/api/local-models';

export type ScanLocalModelsInput = {
  nodeAddress: string;
  token: string;
};

export type ScanLocalModelsOutput = ScanLocalModelsResponse;
