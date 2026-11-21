import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type UpdateInboxNameResponse } from '@hanzo_network/hanzo-message-ts/api/jobs/types';

export type UpdateInboxNameInput = Token & {
  nodeAddress: string;
  inboxName: string;
  inboxId: string;
};

export type UpdateInboxNameOutput = UpdateInboxNameResponse;
