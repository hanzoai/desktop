import { payInvoice as payInvoiceApi } from '@hanzo/desktop-message-ts/api/tools/index';

import { type PayInvoiceInput } from './types';

export const payInvoice = async ({
  nodeAddress,
  token,
  payload,
}: PayInvoiceInput) => {
  const response = await payInvoiceApi(nodeAddress, token, payload);
  return response;
};
