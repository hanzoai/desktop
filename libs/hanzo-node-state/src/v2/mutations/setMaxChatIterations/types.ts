import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type SetMaxChatIterationsInput = Token & {
  nodeAddress: string;
  maxIterations: number;
};

export type SetMaxChatIterationsOutput = string;
