import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';

import { type Attachment } from '../getChatConversation/types';

export type GetHanzoFileProtocolInput = Token & {
  nodeAddress: string;
  file: string;
};

export type GetHanzoFileProtocolOutput = Blob;

export type GetHanzoFilesProtocolInput = Token & {
  nodeAddress: string;
  files: string[];
};

export type GetHanzoFilesProtocolOutput = Attachment[];
