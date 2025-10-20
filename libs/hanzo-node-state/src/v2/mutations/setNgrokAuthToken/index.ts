import {
  setNgrokAuthToken as setNgrokAuthTokenApi,
  setNgrokEnabled,
} from '@hanzo_network/hanzo-message-ts/api/ngrok';
import { type SetNgrokAuthTokenInput } from './types';

export const setNgrokAuthToken = async ({
  nodeAddress,
  token,
  authToken,
}: SetNgrokAuthTokenInput) => {
  await setNgrokAuthTokenApi(nodeAddress, token, authToken);
  await setNgrokEnabled(nodeAddress, token, true);
};
