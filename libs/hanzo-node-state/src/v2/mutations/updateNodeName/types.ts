import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

export type UpdateNodeNameInput = Token & {
  nodeAddress: string;
  newNodeName: string;
};

export type UpdateNodeNameOutput = {
  status: string;
};
