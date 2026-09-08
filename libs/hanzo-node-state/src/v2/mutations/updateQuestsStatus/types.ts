import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type UpdateQuestsStatusResponse } from '@hanzo/desktop-message-ts/api/quests/types';

export type UpdateQuestsStatusInput = Token & {
  nodeAddress: string;
};

export type UpdateQuestsStatusOutput = UpdateQuestsStatusResponse;
