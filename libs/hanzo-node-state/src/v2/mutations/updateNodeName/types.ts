import { type Token } from '@hanzo/desktop-message-ts/api/general/types';

export type UpdateNodeNameInput = Token & {
  nodeAddress: string;
  newNodeName: string;
};

export type UpdateNodeNameOutput = {
  status: string;
};
