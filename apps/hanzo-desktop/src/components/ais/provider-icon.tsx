import { useMemo } from 'react';

import { type ModelProviderKey, resolveProviderIcon } from './constants';

export interface ProviderIconProps {
  className?: string;
  provider?: ModelProviderKey | string;
  /**
   * Optional model id — bare (e.g. `zen-nano-0.6b`) or a full `provider:model`
   * wire string. When set it is resolved before the provider key, so a Zen
   * model served over the OpenAI-compatible key still shows the Zen ensō and a
   * remote `gpt-*` model shows the OpenAI mark.
   */
  model?: string;
  ref?: React.RefObject<HTMLDivElement | null>;
}

const ProviderIcon = ({ provider, model, ref, ...rest }: ProviderIconProps) => {
  const Icon = useMemo(
    () => resolveProviderIcon(provider, model),
    [provider, model],
  );

  const props = {
    ...rest,
    ref,
  };

  return <Icon {...props} />;
};

ProviderIcon.displayName = 'ProviderIcon';

export default ProviderIcon;
