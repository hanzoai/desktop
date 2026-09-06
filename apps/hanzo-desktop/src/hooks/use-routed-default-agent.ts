import { type LLMProvider } from '@hanzo/desktop-message-ts/api/jobs/types';
import { useGetLLMProviders } from '@hanzo/desktop-node-state/v2/queries/getLLMProviders/useGetLLMProviders';

import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';

/**
 * Hanzo Cloud gateway host. Smart routing only ever targets a provider whose
 * `external_url` points here — the on-device engine speaks a fixed model id and
 * rejects unknown ids like `auto`, so routing must stay off the local path.
 */
export const HANZO_CLOUD_HOST = 'hanzo.ai';

/**
 * The router model. A cloud provider configured with this model lets
 * api.hanzo.ai pick the best available model per request (local zen first,
 * frontier only when needed) and bills as the model that actually serves.
 * Provider `model` strings are `<prefix>:<model_type>` (e.g. `openai:gpt-4o`,
 * `local:zen-nano-0.6b`), so match either the bare `auto` or a `:auto` suffix.
 */
export const ROUTING_MODEL = 'auto';

/**
 * A provider routes when it is cloud-connected to Hanzo Cloud and configured
 * with the `auto` model. Local-engine providers (`local:` prefix) are never
 * eligible — this is what scopes Smart routing to cloud connections.
 */
export const findRoutingProvider = (
  llmProviders?: LLMProvider[],
): LLMProvider | undefined =>
  llmProviders?.find((provider) => {
    if (provider.model.startsWith('local:')) return false;
    const modelType = provider.model.split(':').pop();
    return (
      modelType === ROUTING_MODEL &&
      !!provider.external_url &&
      provider.external_url.includes(HANZO_CLOUD_HOST)
    );
  });

/**
 * Effective default LLM-provider id for a NEW chat. When Smart routing is on and
 * a cloud Hanzo routing provider exists, new chats default to it; otherwise the
 * user's persisted `defaultAgentId` is used unchanged. This only affects the
 * default — an explicit model pick in the composer still wins, because callers
 * seed the form from this value and later user selection overrides it.
 */
export const useRoutedDefaultAgentId = (): string => {
  const auth = useAuth((store) => store.auth);
  const defaultAgentId = useSettings((state) => state.defaultAgentId);
  const smartRouting = useSettings((state) => state.smartRouting);

  const { llmProviders } = useGetLLMProviders({
    nodeAddress: auth?.node_address ?? '',
    token: auth?.api_v2_key ?? '',
  });

  if (!smartRouting) return defaultAgentId;
  return findRoutingProvider(llmProviders)?.id ?? defaultAgentId;
};
