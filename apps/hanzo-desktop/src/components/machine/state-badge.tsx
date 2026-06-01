import { Badge } from '@hanzo_network/hanzo-ui';
import { cn } from '@hanzo_network/hanzo-ui/utils';
import { type MachineState } from '../../machine-state';

const stateClass: Record<MachineState, string> = {
  running: 'bg-green-500/15 text-green-400 border-green-500/20',
  stopped: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
  starting: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  stopping: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  creating: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  deleting: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/15 text-red-400 border-red-500/20',
};

export const MachineStateBadge = ({ state }: { state: MachineState }) => (
  <Badge
    className={cn(
      'border px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
      stateClass[state],
    )}
    variant="outline"
  >
    {state}
  </Badge>
);
