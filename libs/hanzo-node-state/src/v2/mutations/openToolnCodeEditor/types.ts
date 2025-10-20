import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type CodeLanguage,
  type OpenToolInCodeEditorResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type OpenToolInCodeEditorInput = Token & {
  nodeAddress: string;
  xHanzoAppId: string;
  xHanzoToolId: string;
  xHanzoLLMProvider: string;
  language: CodeLanguage;
};

export type OpenToolInCodeEditorOutput = OpenToolInCodeEditorResponse;
