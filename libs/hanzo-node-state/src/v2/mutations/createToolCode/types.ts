import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type CodeLanguage,
  type CreateToolCodeResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type CreateToolCodeInput = Token & {
  nodeAddress: string;
  message: string;
  llmProviderId: string;
  jobId?: string;
  tools: string[];
  language: CodeLanguage;
  thinking?: boolean;
};

export type CreateToolCodeOutput = CreateToolCodeResponse;
