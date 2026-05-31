// Friendly display names for local-engine models whose wire model string is a
// generic alias (the node sends "openai:default" / "local:default" to the engine,
// which actually runs zen-eco-3b-agent). Keyed by the FULL provider.model string so
// we never change the wire value sent to the engine — this is display-only.
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'openai:default': 'Zen Eco 3B (Agent)',
  'local:default': 'Zen Eco 3B (Agent)',
};

/**
 * Friendly, precise model label for an LLM provider. Falls back to the provider's
 * own name/id when there is no override for its wire model string.
 */
export const getProviderModelLabel = (
  model: string | undefined,
  fallback: string,
): string => (model ? (MODEL_DISPLAY_NAMES[model] ?? fallback) : fallback);
