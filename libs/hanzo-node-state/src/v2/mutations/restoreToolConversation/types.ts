import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type UndoToolImplementationResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type RestoreToolConversationInput = Token & {
  nodeAddress: string;
  jobId: string;
  messageId: string;
};

export type RestoreToolConversationOutput = UndoToolImplementationResponse;
