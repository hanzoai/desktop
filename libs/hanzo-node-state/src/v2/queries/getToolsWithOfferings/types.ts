import { type Token } from '@hanzo/desktop-message-ts/api/general/types';
import { type GetToolsWithOfferingsResponse } from '@hanzo/desktop-message-ts/api/tools/types';

export type GetToolsWithOfferingsInput = Token & {
  nodeAddress: string;
};

export type GetToolsWithOfferingsOutput = GetToolsWithOfferingsResponse;
