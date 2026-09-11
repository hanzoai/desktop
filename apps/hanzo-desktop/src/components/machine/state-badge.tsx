import { Badge } from '@hanzo/desktop-ui';
import { cn } from '@hanzo/desktop-ui/utils';
import { type MachineState } from '../../machine-state';
import { status } from '../../hanzo/status';

/** A machine's state. Seven states, four steps — see `hanzo/status.ts` for why
 *  the steps are luminance and one inversion rather than hues. */
const step: Record<MachineState, string> = {
  running: status.up.panel,
  starting: status.moving.panel,
  stopping: status.moving.panel,
  creating: status.moving.panel,
  deleting: status.moving.panel,
  stopped: status.quiet.panel,
  error: status.act.panel,
};

export const MachineStateBadge = ({ state }: { state: MachineState }) => (
  <Badge
    className={cn(
      'border px-2 py-0.5 text-xs font-medium tracking-wide uppercase',
      step[state],
    )}
    variant="outline"
  >
    {state}
  </Badge>
);
