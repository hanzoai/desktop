import { type Token } from "@hanzo/desktop-message-ts/api/general/types";
import { type DuplicateToolResponse } from "@hanzo/desktop-message-ts/api/tools/types";

export type DuplicateToolInput = Token & {
  nodeAddress: string;
  toolKey: string;
};

export type DuplicateToolOutput = DuplicateToolResponse;
