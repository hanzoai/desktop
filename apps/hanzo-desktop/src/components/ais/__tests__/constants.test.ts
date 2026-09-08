import {
  AisIcon,
  AnthropicIcon,
  OpenAIIcon,
  ZenIcon,
} from '@hanzo/desktop-ui/assets';
import { describe, expect, it } from 'vitest';

import { ModelProvider, resolveProviderIcon } from '../constants';

describe('resolveProviderIcon', () => {
  it('resolves Zen models to the Zen ensō regardless of provider', () => {
    expect(resolveProviderIcon(ModelProvider.OpenAI, 'zen-nano-0.6b')).toBe(
      ZenIcon,
    );
    expect(resolveProviderIcon('local', 'zen-agent:4b')).toBe(ZenIcon);
    expect(resolveProviderIcon(undefined, 'zen4:8b')).toBe(ZenIcon);
    expect(resolveProviderIcon('groq', 'zen-coder')).toBe(ZenIcon);
  });

  it('resolves Claude models to the Anthropic mark', () => {
    expect(resolveProviderIcon(ModelProvider.Claude, 'claude-opus-4')).toBe(
      AnthropicIcon,
    );
  });

  it('resolves gpt/o models to the OpenAI mark only on a remote OpenAI provider', () => {
    expect(resolveProviderIcon('openai', 'gpt-4o')).toBe(OpenAIIcon);
    expect(resolveProviderIcon('openai', 'o3-mini')).toBe(OpenAIIcon);
    expect(resolveProviderIcon('openai-legacy', 'gpt-4')).toBe(OpenAIIcon);
    // A locally-served gpt-oss must NOT be branded as OpenAI.
    expect(resolveProviderIcon('groq', 'openai/gpt-oss-20b')).not.toBe(
      OpenAIIcon,
    );
  });

  it('falls back to the provider map, then to the neutral icon', () => {
    // The OpenAI-compatible key with no model → local Zen engine branding.
    expect(resolveProviderIcon(ModelProvider.OpenAI)).toBe(ZenIcon);
    // Unknown providers are never branded as OpenAI.
    expect(resolveProviderIcon('some-unknown-provider')).toBe(AisIcon);
    expect(resolveProviderIcon(undefined)).toBe(AisIcon);
  });
});
