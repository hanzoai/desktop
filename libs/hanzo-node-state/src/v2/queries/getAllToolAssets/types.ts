import {
  type CustomToolHeaders,
  type Token,
} from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetAllToolAssetsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetAllToolAssetsInput = Token &
  CustomToolHeaders & {
    nodeAddress: string;
  };

export type GetAllToolAssetsOutput = GetAllToolAssetsResponse;
