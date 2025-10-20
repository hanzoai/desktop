import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type SetNgrokAuthTokenInput = Token & {
  nodeAddress: string;
  authToken: string;
};

export type SetNgrokAuthTokenOutput = void;
