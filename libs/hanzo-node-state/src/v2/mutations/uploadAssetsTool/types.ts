import {
  type CustomToolHeaders,
  type Token,
} from '@hanzo_network/hanzo-message-ts/api/general/types';

export type UploadAssetsToToolInput = Token &
  CustomToolHeaders & {
    nodeAddress: string;
    files: File[];
  };

export type UploadAssetsToToolOutput = {
  success: boolean;
};
