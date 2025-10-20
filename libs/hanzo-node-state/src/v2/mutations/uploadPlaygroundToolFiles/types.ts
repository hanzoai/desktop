import {
  type CustomToolHeaders,
  type Token,
} from '@hanzo_network/hanzo-message-ts/api/general/types';

export type UploadPlaygroundToolFilesInput = Token &
  CustomToolHeaders & {
    nodeAddress: string;
    files: File[];
  };

export type UploadPlaygroundToolFilesOutput = {
  success: boolean;
  fileContent: Record<string, string>;
};
