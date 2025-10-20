import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type CodeLanguage,
  type ExecuteToolCodeResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type ExecuteToolCodeInput = Token & {
  nodeAddress: string;
  params: Record<string, any>;
  configs?: Record<string, any>;
  code: string;
  llmProviderId: string;
  tools: string[];
  language: CodeLanguage;
  xHanzoAppId: string;
  xHanzoToolId: string;
  mounts?: string[];
};

export type ExecuteToolCodeOutput = ExecuteToolCodeResponse;
