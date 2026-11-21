import { updateInboxName as updateInboxNameApi } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import { type UpdateInboxNameInput } from './types';

export const updateInboxName = async ({
  nodeAddress,
  token,
  inboxName,
  inboxId,
}: UpdateInboxNameInput) => {
  const response = await updateInboxNameApi(nodeAddress, token, {
    custom_name: inboxName,
    inbox_name: inboxId,
  });

  return response;
};
