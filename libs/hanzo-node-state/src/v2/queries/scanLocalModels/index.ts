import { scanLocalModels as scanLocalModelsApi } from '@hanzo_network/hanzo-message-ts/api/local-models';

import { type ScanLocalModelsInput } from './types';

export const scanLocalModels = async ({
  nodeAddress,
  token,
}: ScanLocalModelsInput) => {
  const response = await scanLocalModelsApi(nodeAddress, token);
  const uniqueModels = response.filter(
    (model, index, self) =>
      index === self.findIndex((t) => t.model === model.model),
  );
  return uniqueModels;
};
