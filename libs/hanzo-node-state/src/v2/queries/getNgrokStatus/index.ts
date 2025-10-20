import { getNgrokStatus as getNgrokStatusApi } from '@hanzo_network/hanzo-message-ts/api/ngrok';
import { type GetNgrokStatusInput } from './types';

export const getNgrokStatus = async ({
  nodeAddress,
  token,
}: GetNgrokStatusInput) => {
  return await getNgrokStatusApi(nodeAddress, token);
};
