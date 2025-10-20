import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type UpdateQuestsStatusResponse } from '@hanzo_network/hanzo-message-ts/api/quests/types';

export type UpdateQuestsStatusInput = Token & {
  nodeAddress: string;
};

export type UpdateQuestsStatusOutput = UpdateQuestsStatusResponse;
