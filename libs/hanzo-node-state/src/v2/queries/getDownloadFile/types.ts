import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type DownloadFileOutput = string;

export type GetDownloadFileInput = Token & {
  nodeAddress: string;
  path: string;
};
