import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type RejectInvoiceRequest } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type RejectInvoiceOutput = any;

export type RejectInvoiceInput = Token & {
  nodeAddress: string;
  payload: RejectInvoiceRequest;
};
