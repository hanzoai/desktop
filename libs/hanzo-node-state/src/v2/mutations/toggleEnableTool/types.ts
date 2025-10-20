import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type ToggleEnableToolResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type ToggleEnableToolOutput = ToggleEnableToolResponse;

export type ToggleEnableToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
  isToolEnabled: boolean;
};
