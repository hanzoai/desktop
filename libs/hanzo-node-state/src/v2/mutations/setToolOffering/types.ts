import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import {
  type ToolOffering,
  type SetToolOfferingResponse,
} from '@hanzo/desktop-message-ts/api/tools/types';

export type SetToolOfferingOutput = SetToolOfferingResponse;

export type SetToolOfferingInput = Token & {
  nodeAddress: string;
  offering: ToolOffering;
};
