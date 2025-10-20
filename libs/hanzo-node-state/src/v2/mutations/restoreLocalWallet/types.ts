import { type Token } from '@hanzo_network/hanzo-message-ts/api/general/types';
import {
  type NetworkIdentifier,
  type RestoreCoinbaseMPCWalletResponse,
  type WalletRole,
} from '@hanzo_network/hanzo-message-ts/api/wallets';

export type RestoreLocalWalletInput = Token & {
  nodeAddress: string;
  network: NetworkIdentifier;
  privateKey?: string;
  mnemonic?: string;
  role: WalletRole;
};
export type RestoreLocalWalletOutput = RestoreCoinbaseMPCWalletResponse;
