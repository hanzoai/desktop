import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetQuestsStatusResponse } from '@hanzo_network/hanzo-message-ts/api/quests/types';

export type GetQuestsStatusInput = Token & {
  nodeAddress: string;
};

export type GetQuestsStatusOutput = GetQuestsStatusResponse;
