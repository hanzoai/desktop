import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type ExportMessagesFromInboxInput = Token & {
  nodeAddress: string;
  inboxId: string;
  format: 'csv' | 'json' | 'txt';
};

export type ExportMessagesFromInboxOutput = Blob;
