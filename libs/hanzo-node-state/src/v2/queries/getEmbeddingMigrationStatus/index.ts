import { getEmbeddingMigrationStatus as getEmbeddingMigrationStatusApi } from '@hanzo/desktop-message-ts/api/general/index';

import { type GetEmbeddingMigrationStatusInput } from './types';

export const getEmbeddingMigrationStatus = async ({
  nodeAddress,
  token,
}: GetEmbeddingMigrationStatusInput) => {
  const response = await getEmbeddingMigrationStatusApi(nodeAddress, token);
  return response;
};
