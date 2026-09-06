import { exportMessagesFromInbox as exportMessagesFromInboxApi } from '@hanzo/desktop-message-ts/api/jobs/index';

import { type ExportMessagesFromInboxInput } from './types';

export const exportMessagesFromInbox = async ({
  nodeAddress,
  token,
  inboxId,
  format,
}: ExportMessagesFromInboxInput) => {
  return await exportMessagesFromInboxApi(nodeAddress, token, {
    inbox_name: inboxId,
    format,
  });
};
