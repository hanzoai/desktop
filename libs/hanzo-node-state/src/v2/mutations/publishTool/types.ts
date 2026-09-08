import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type PublishToolResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type PublishToolOutput = PublishToolResponse;

export type PublishToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
};
