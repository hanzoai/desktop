import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type ToggleEnableToolResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type ToggleEnableToolOutput = ToggleEnableToolResponse;

export type ToggleEnableToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
  isToolEnabled: boolean;
};
