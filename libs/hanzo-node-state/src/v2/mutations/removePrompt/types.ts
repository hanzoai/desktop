import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type RemovePromptOutput = {
  status: string;
};

export type RemovePromptInput = Token & {
  nodeAddress: string;
  promptName: string;
};
