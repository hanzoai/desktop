import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import { type GetToolsWithOfferingsResponse } from '@hanzo_network/hanzo-message-ts/api/tools/types';

export type GetToolsWithOfferingsInput = Token & {
  nodeAddress: string;
};

export type GetToolsWithOfferingsOutput = GetToolsWithOfferingsResponse;
