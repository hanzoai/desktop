import {
  Button,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@hanzo_network/hanzo-ui';
import {
  type Machine,
  useDeleteMachine,
  useMachine,
  useStartMachine,
  useStopMachine,
} from '../../machine-state';
import { ArrowLeft, Copy, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import ExecTerminal from '../../components/machine/exec-terminal';
import {
  formatAge,
  formatDiskGb,
  formatMemoryMb,
} from '../../components/machine/format';
import { MachineStateBadge } from '../../components/machine/state-badge';
import { setActiveMachineName } from '../../components/machine/active-machine';

const Spec = ({ machine }: { machine: Machine }) => (
  <Card className="p-5">
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
      <Field label="State">
        <MachineStateBadge state={machine.state} />
      </Field>
      <Field label="Distro">{machine.distro}</Field>
      <Field label="CPUs">{machine.cpus}</Field>
      <Field label="Memory">{formatMemoryMb(machine.memory_mb)}</Field>
      <Field label="Disk">{formatDiskGb(machine.disk_gb)}</Field>
      <Field label="IP">
        <span className="font-mono text-xs">{machine.ip ?? '-'}</span>
      </Field>
      <Field label="vsock port">{machine.vsock_port ?? '-'}</Field>
      <Field label="Created">{formatAge(machine.created_at)} ago</Field>
      <Field label="Started">
        {machine.started_at ? `${formatAge(machine.started_at)} ago` : '-'}
      </Field>
    </div>
  </Card>
);

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-text-tertiary text-xs uppercase tracking-wide">
      {label}
    </span>
    <div className="text-text-default">{children}</div>
  </div>
);

const MachineDetailPage = () => {
  const { name = '' } = useParams<{ name: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: machine, isLoading, error } = useMachine(name);
  const start = useStartMachine();
  const stop = useStopMachine();
  const remove = useDeleteMachine();

  const tab = searchParams.get('tab') ?? 'info';

  useEffect(() => {
    if (name) setActiveMachineName(name);
  }, [name]);

  if (isLoading) {
    return (
      <div className="container py-10">
        <p className="text-text-secondary text-sm">Loading...</p>
      </div>
    );
  }
  if (error || !machine) {
    return (
      <div className="container py-10">
        <Button onClick={() => navigate('/machines')} variant="tertiary">
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
        <p className="text-red-400 text-sm">
          {error?.message ?? 'Machine not found'}
        </p>
      </div>
    );
  }

  const onStart = () =>
    start
      .mutateAsync(machine.name)
      .catch((e) => toast.error('Start failed', { description: String(e) }));
  const onStop = () =>
    stop
      .mutateAsync(machine.name)
      .catch((e) => toast.error('Stop failed', { description: String(e) }));
  const onDelete = async () => {
    try {
      await remove.mutateAsync(machine.name);
      toast.success(`Deleted ${machine.name}`);
      void navigate('/machines');
    } catch (e) {
      toast.error('Delete failed', { description: String(e) });
    }
  };
  const copyIp = async () => {
    if (!machine.ip) return;
    await navigator.clipboard.writeText(machine.ip);
    toast.success(`Copied ${machine.ip}`);
  };

  const isRunning = machine.state === 'running';

  return (
    <div className="container flex flex-col gap-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate('/machines')}
            size="icon"
            variant="tertiary"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="font-inter text-2xl font-medium">{machine.name}</h1>
          <MachineStateBadge state={machine.state} />
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button onClick={onStop} variant="outline">
              <Square className="mr-2 size-4" /> Stop
            </Button>
          ) : (
            <Button onClick={onStart}>
              <Play className="mr-2 size-4" /> Start
            </Button>
          )}
          <Button disabled={!machine.ip} onClick={copyIp} variant="outline">
            <Copy className="mr-2 size-4" /> Copy IP
          </Button>
          <Button onClick={onDelete} variant="outline">
            <Trash2 className="mr-2 size-4 text-red-400" /> Delete
          </Button>
        </div>
      </div>

      <Tabs
        onValueChange={(v) => setSearchParams({ tab: v })}
        value={tab}
      >
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger disabled={!isRunning} value="shell">
            Shell
          </TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="forwards">Forwards</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="info">
          <Spec machine={machine} />
        </TabsContent>
        <TabsContent className="pt-4" value="shell">
          {isRunning ? (
            <ExecTerminal machineName={machine.name} />
          ) : (
            <p className="text-text-secondary text-sm">
              Start the machine to open a shell.
            </p>
          )}
        </TabsContent>
        <TabsContent className="pt-4" value="logs">
          <LogsTab machineName={machine.name} running={isRunning} />
        </TabsContent>
        <TabsContent className="pt-4" value="forwards">
          <p className="text-text-secondary text-sm">
            Port forwarding controls coming soon.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const LogsTab = ({
  machineName,
  running,
}: {
  machineName: string;
  running: boolean;
}) => {
  if (!running) {
    return (
      <p className="text-text-secondary text-sm">
        Start the machine to tail logs.
      </p>
    );
  }
  // Reuse exec terminal as a one-shot log tail. The user can `tail -f` whatever
  // they want; we don't ship a hardcoded path because vfkit log location is a
  // host concern owned by the hanzod runtime.
  return <ExecTerminal machineName={machineName} />;
};

export default MachineDetailPage;
