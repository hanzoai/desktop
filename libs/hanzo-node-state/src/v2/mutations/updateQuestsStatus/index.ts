import { updateQuestsStatus as updateQuestsStatusApi } from '@hanzo_network/hanzo-message-ts/api/quests/index';

import { type UpdateQuestsStatusInput } from './types';

export const updateQuestsStatus = async ({
  nodeAddress,
  token,
}: UpdateQuestsStatusInput) => {
  const response = await updateQuestsStatusApi(nodeAddress, token);
  return response;
};
