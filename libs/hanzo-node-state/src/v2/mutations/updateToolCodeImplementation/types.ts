import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type UpdateToolCodeImplementationResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type UpdateToolCodeImplementationInput = Token & {
  nodeAddress: string;
  jobId: string;
  code: string;
};

export type UpdateToolCodeImplementationOutput =
  UpdateToolCodeImplementationResponse;
