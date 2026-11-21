import { getLLMProviders as getLLMProvidersAPI } from '@hanzo_network/hanzo-message-ts/api/jobs/index';

import  { type GetLLMProvidersInput } from './types';

// Wire-protocol value: the node persists the local embedding provider under
// this exact model string (the `local:` prefix is the node's serde tag for the
// local-engine variant). It is filtered out of the user-facing provider list.
const EMBEDDING_MODEL = 'local:embeddinggemma:300m';

export const getLLMProviders = async ({
  nodeAddress,
  token,
}: GetLLMProvidersInput) => {
  const result = await getLLMProvidersAPI(nodeAddress, token);

  const filteredProviders = result.filter(
    (provider) => provider.model !== EMBEDDING_MODEL,
  );

  return filteredProviders;
};
