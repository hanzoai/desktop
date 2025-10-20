import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type CreateToolMetadataResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type CreateToolMetadataInput = Token & {
  nodeAddress: string;
  jobId: string;
  tools: string[];
  xHanzoToolId?: string;
};

export type CreateToolMetadataOutput = CreateToolMetadataResponse;
