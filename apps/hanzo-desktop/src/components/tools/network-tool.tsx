import { type NetworkHanzoTool } from '@hanzo_network/hanzo-message-ts/api/tools/types';

import ToolDetailsCard from './components/tool-details-card';

export default function NetworkTool({
  tool,
  isEnabled,
  toolRouterKey,
}: {
  tool: NetworkHanzoTool;
  isEnabled: boolean;
  toolRouterKey: string;
}) {
  return (
    <ToolDetailsCard
      isEnabled={isEnabled}
      tool={tool}
      toolKey={toolRouterKey}
      toolType="Network"
    />
  );
}
