import { getNgrokStatus as getNgrokStatusApi } from '@hanzo/desktop-message-ts/api/ngrok';
import { type GetNgrokStatusInput } from './types';

export const getNgrokStatus = async ({
  nodeAddress,
  token,
}: GetNgrokStatusInput) => {
  return await getNgrokStatusApi(nodeAddress, token);
};
