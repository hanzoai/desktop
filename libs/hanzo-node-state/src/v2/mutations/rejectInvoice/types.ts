import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type RejectInvoiceRequest } from '@hanzo/desktop-message-ts/api/tools/types';

export type RejectInvoiceOutput = any;

export type RejectInvoiceInput = Token & {
  nodeAddress: string;
  payload: RejectInvoiceRequest;
};
