import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type ToolOffering,
  type SetToolOfferingResponse,
} from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type SetToolOfferingOutput = SetToolOfferingResponse;

export type SetToolOfferingInput = Token & {
  nodeAddress: string;
  offering: ToolOffering;
};
