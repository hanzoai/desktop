import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetQuestsStatusResponse } from '@hanzo/desktop-message-ts/api/quests/types';

export type GetQuestsStatusInput = Token & {
  nodeAddress: string;
};

export type GetQuestsStatusOutput = GetQuestsStatusResponse;
