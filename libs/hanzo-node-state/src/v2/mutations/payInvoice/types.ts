import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import {
  type PayInvoiceRequest,
  type PayInvoiceResponse,
} from '@hanzo/desktop-message-ts/api/tools/types';

export type PayInvoiceOutput = PayInvoiceResponse;

export type PayInvoiceInput = Token & {
  nodeAddress: string;
  payload: PayInvoiceRequest;
};
