import { type PythonHanzoTool } from '@hanzo_network/hanzo-message-ts/api/tools/types';

import ToolDetailsCard from './components/tool-details-card';

export default function PythonTool({
  tool,
  isEnabled,
  isPlaygroundTool,
  toolRouterKey,
}: {
  tool: PythonHanzoTool;
  isEnabled: boolean;
  isPlaygroundTool?: boolean;
  toolRouterKey: string;
}) {
  return (
    <ToolDetailsCard
      isEnabled={isEnabled}
      isPlaygroundTool={isPlaygroundTool}
      tool={tool}
      toolKey={toolRouterKey}
      toolType="Python"
    />
  );
}
