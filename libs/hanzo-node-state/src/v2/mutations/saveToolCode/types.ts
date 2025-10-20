import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type CodeLanguage,
  type SaveToolCodeResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type SaveToolCodeInput = Token & {
  nodeAddress: string;
  jobId: string;
  metadata: Record<string, any>;
  code?: string;
  assets: string[];
  language: CodeLanguage;
  xHanzoAppId: string;
  xHanzoToolId: string;
  xHanzoOriginalToolRouterKey?: string;
  shouldPrefetchPlaygroundTool?: boolean;
} & {
  name: string;
  description: string;
  version: string;
  tools: string[];
  author: string;
};

export type SaveToolCodeOutput = SaveToolCodeResponse;
