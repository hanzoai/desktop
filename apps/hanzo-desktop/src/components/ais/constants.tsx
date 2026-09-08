import {
  AisIcon,
  AnthropicIcon,
  AyaCohereIcon,
  DeepSeekIcon,
  ExoIcon,
  GeminiIcon,
  GoogleIcon,
  GrokIcon,
  GroqIcon,
  LmStudioIcon,
  MetaIcon,
  MistralIcon,
  OpenAIIcon,
  ZenIcon,
  OpenRouterIcon,
  PerplexityIcon,
  QwenIcon,
  HanzoIcon,
  TogetherAI,
} from '@hanzo/desktop-ui/assets';

export enum ModelProvider {
  Aya = 'aya',
  Claude = 'claude',
  DeepSeek = 'deepseek',
  Exo = 'exo',
  Gemini = 'gemini',
  Google = 'google',
  Grok = 'grok',
  Groq = 'groq',
  LmStudio = 'lmstudio',
  Meta = 'meta',
  Mistral = 'mistral',
  OpenAI = 'openai',
  OpenRouter = 'openrouter',
  Perplexity = 'perplexity',
  Qwen = 'qwen',
  'Hanzo-Backend' = 'hanzo-backend',
  TogetherAI = 'togetherai',
}

export type ModelProviderKey = Lowercase<keyof typeof ModelProvider>;

export const providerMappings = {
  [ModelProvider.Aya]: AyaCohereIcon,
  [ModelProvider.Claude]: AnthropicIcon,
  [ModelProvider.DeepSeek]: DeepSeekIcon,
  [ModelProvider.Exo]: ExoIcon,
  [ModelProvider.Gemini]: GeminiIcon,
  [ModelProvider.Google]: GoogleIcon,
  [ModelProvider.Grok]: GrokIcon,
  [ModelProvider.Groq]: GroqIcon,
  [ModelProvider.LmStudio]: LmStudioIcon,
  [ModelProvider.Mistral]: MistralIcon,
  [ModelProvider.Meta]: MetaIcon,
  // Local Hanzo/Zen engine is exposed as an OpenAI-compatible provider — brand it with the Zen enso ring.
  [ModelProvider.OpenAI]: ZenIcon,
  'openai-legacy': OpenAIIcon,
  [ModelProvider.OpenRouter]: OpenRouterIcon,
  [ModelProvider.Perplexity]: PerplexityIcon,
  [ModelProvider.Qwen]: QwenIcon,
  [ModelProvider['Hanzo-Backend']]: HanzoIcon,
  [ModelProvider.TogetherAI]: TogetherAI,
};

type ProviderIconComponent =
  | typeof AisIcon
  | (typeof providerMappings)[ModelProviderKey];

/**
 * Model-name → icon overrides, matched against the model id (the part after the
 * `provider:` prefix). Resolved BEFORE the provider map because a single
 * provider key can front multiple back-ends: the OpenAI-compatible key serves
 * both the local Zen engine and genuinely-remote OpenAI, and only the model
 * name tells them apart. `providers`, when set, restricts a rule to those
 * provider keys so a locally-served `gpt-oss` is never mislabeled as OpenAI.
 */
const modelIconRules: {
  test: RegExp;
  icon: ProviderIconComponent;
  providers?: string[];
}[] = [
  { test: /^zen[-\d]/i, icon: ZenIcon },
  { test: /^claude/i, icon: AnthropicIcon },
  {
    test: /^(gpt-|o\d)/i,
    icon: OpenAIIcon,
    providers: ['openai', 'openai-legacy'],
  },
];

/**
 * Resolves the icon for a provider, giving the model name priority over the
 * provider key. `model` may be a bare model id or a full `provider:model`
 * wire string. Unknown providers fall back to the neutral {@link AisIcon} —
 * never to a specific brand.
 */
export function resolveProviderIcon(
  provider?: string,
  model?: string,
): ProviderIconComponent {
  const providerKey = provider?.toLowerCase();

  // A model string may be a bare id (`zen-nano-0.6b`, `zen-agent:4b`) or a full
  // `provider:model` wire string (`openai:gpt-4o`, `local:zen-nano-0.6b`). Test
  // rules against both the whole string and the segment after the first colon
  // so a provider prefix never hides the model name, and a bare `name:tag` id
  // is not mistaken for one.
  if (model) {
    const lower = model.toLowerCase();
    const candidates =
      lower.indexOf(':') >= 0
        ? [lower, lower.slice(lower.indexOf(':') + 1)]
        : [lower];
    for (const rule of modelIconRules) {
      if (!candidates.some((candidate) => rule.test.test(candidate))) continue;
      if (
        rule.providers &&
        (!providerKey || !rule.providers.includes(providerKey))
      )
        continue;
      return rule.icon;
    }
  }

  if (providerKey && providerMappings[providerKey as ModelProviderKey]) {
    return providerMappings[providerKey as ModelProviderKey];
  }

  return AisIcon;
}
