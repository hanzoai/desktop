import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hanzo_network/hanzo-ui';
import {
  runExecToString,
  useMachines,
} from '../machine-state';
import { Boxes, Copy, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  pickDefaultActiveMachine,
  setActiveMachineName,
} from '../components/machine/active-machine';

interface K3sStatus {
  enabled: boolean;
  ready: boolean;
  kubeconfigPath?: string;
  raw: string;
}

interface K3sNode {
  name: string;
  status: string;
  roles: string;
  age: string;
  version: string;
}

const K3S_KUBECONFIG_PATH = '/etc/rancher/k3s/k3s.yaml';

const checkK3sStatus = async (machine: string): Promise<K3sStatus> => {
  const { exit, stdout } = await runExecToString(machine, [
    'sh',
    '-c',
    `if [ -f ${K3S_KUBECONFIG_PATH} ]; then echo enabled; else echo disabled; fi; ` +
      `if command -v kubectl >/dev/null 2>&1 && kubectl --kubeconfig=${K3S_KUBECONFIG_PATH} get nodes >/dev/null 2>&1; then echo ready; else echo notready; fi`,
  ]);
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  const enabled = lines.includes('enabled');
  const ready = enabled && lines.includes('ready');
  return {
    enabled,
    ready,
    kubeconfigPath: enabled ? K3S_KUBECONFIG_PATH : undefined,
    raw: stdout + (exit !== 0 ? `\n[exit ${exit}]` : ''),
  };
};

const listK3sNodes = async (machine: string): Promise<K3sNode[]> => {
  const { exit, stdout, stderr } = await runExecToString(machine, [
    'sh',
    '-c',
    `kubectl --kubeconfig=${K3S_KUBECONFIG_PATH} get nodes ` +
      `-o=jsonpath='{range .items[*]}{.metadata.name}|{.status.conditions[?(@.type=="Ready")].status}|{.metadata.labels.node-role\\.kubernetes\\.io/control-plane}|{.metadata.creationTimestamp}|{.status.nodeInfo.kubeletVersion}{"\\n"}{end}'`,
  ]);
  if (exit !== 0) {
    throw new Error(stderr.trim() || `kubectl exited ${exit}`);
  }
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ready, controlPlane, ts, version] = line.split('|');
      return {
        name: name ?? '',
        status: ready === 'True' ? 'Ready' : 'NotReady',
        roles: controlPlane !== undefined ? 'control-plane' : 'worker',
        age: ts ?? '',
        version: version ?? '',
      };
    });
};

const KubernetesPage = () => {
  const { data: machines } = useMachines();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<string | undefined>();

  useEffect(() => {
    if (!active) {
      const next = pickDefaultActiveMachine(machines);
      if (next) setActive(next);
    }
  }, [machines, active]);

  useEffect(() => {
    setActiveMachineName(active);
  }, [active]);

  const machine = useMemo(
    () => (machines ?? []).find((m) => m.name === active),
    [machines, active],
  );
  const isRunning = machine?.state === 'running';

  const status = useQuery<K3sStatus, Error>({
    queryKey: ['k3s.status', active],
    queryFn: () => {
      if (!active) throw new Error('no active machine');
      return checkK3sStatus(active);
    },
    enabled: Boolean(active) && Boolean(isRunning),
    refetchInterval: 5_000,
  });

  const nodes = useQuery<K3sNode[], Error>({
    queryKey: ['k3s.nodes', active],
    queryFn: () => {
      if (!active) return Promise.resolve([]);
      return listK3sNodes(active);
    },
    enabled: Boolean(active) && Boolean(status.data?.ready),
    refetchInterval: 10_000,
  });

  const enable = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error('no active machine');
      const { exit, stderr } = await runExecToString(active, [
        'hanzod',
        'machine',
        'k3s',
        'enable',
        active,
      ]);
      if (exit !== 0) {
        throw new Error(stderr.trim() || `hanzod exited ${exit}`);
      }
    },
    onSuccess: () => {
      toast.success('Kubernetes is starting');
      void queryClient.invalidateQueries({ queryKey: ['k3s.status', active] });
    },
    onError: (e) => {
      toast.error('Failed to enable Kubernetes', {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const copyKubeconfigPath = async () => {
    if (!status.data?.kubeconfigPath) return;
    await navigator.clipboard.writeText(status.data.kubeconfigPath);
    toast.success('Kubeconfig path copied');
  };

  return (
    <div className="container flex flex-col gap-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-inter text-3xl font-medium">Kubernetes</h1>
          <p className="text-text-secondary text-sm">
            Run k3s inside a machine for local cluster development.
          </p>
        </div>
        <Select onValueChange={setActive} value={active ?? ''}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="select machine" />
          </SelectTrigger>
          <SelectContent>
            {(machines ?? []).map((m) => (
              <SelectItem key={m.name} value={m.name}>
                {m.name} ({m.state})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {!machine && (
        <div className="border-divider mx-auto flex max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
          <div className="bg-bg-quaternary flex size-12 items-center justify-center rounded-full">
            <Boxes className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">No machine selected</h2>
          <p className="text-text-secondary text-sm">
            Create or pick a running machine to manage Kubernetes.
          </p>
        </div>
      )}

      {machine && !isRunning && (
        <Card className="p-5">
          <p className="text-text-secondary text-sm">
            Machine &quot;{machine.name}&quot; is {machine.state}. Start it to
            manage Kubernetes.
          </p>
        </Card>
      )}

      {machine && isRunning && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-tertiary text-xs uppercase">Status</p>
              <p className="text-lg font-medium">
                {status.isLoading
                  ? 'checking...'
                  : status.data?.ready
                  ? 'Ready'
                  : status.data?.enabled
                  ? 'Starting'
                  : 'Disabled'}
              </p>
            </div>
            {!status.data?.enabled && (
              <Button
                disabled={enable.isPending}
                onClick={() => enable.mutate()}
              >
                <Play className="mr-2 size-4" />
                {enable.isPending ? 'Enabling...' : 'Enable Kubernetes'}
              </Button>
            )}
          </div>

          {status.data?.kubeconfigPath && (
            <div className="border-divider flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="flex flex-col">
                <span className="text-text-tertiary text-xs uppercase">
                  Kubeconfig
                </span>
                <span className="font-mono text-xs">
                  {status.data.kubeconfigPath}
                </span>
              </div>
              <Button
                onClick={copyKubeconfigPath}
                size="icon"
                variant="outline"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          )}
        </Card>
      )}

      {status.data?.ready && (
        <div className="border-divider rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.error && (
                <TableRow>
                  <td className="p-4 align-middle text-red-400" colSpan={5}>
                    {nodes.error.message}
                  </td>
                </TableRow>
              )}
              {(nodes.data ?? []).map((n) => (
                <TableRow key={n.name}>
                  <TableCell className="font-medium">{n.name}</TableCell>
                  <TableCell>{n.status}</TableCell>
                  <TableCell className="text-text-secondary">
                    {n.roles}
                  </TableCell>
                  <TableCell className="text-text-secondary font-mono text-xs">
                    {n.version}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {n.age}
                  </TableCell>
                </TableRow>
              ))}
              {nodes.data && nodes.data.length === 0 && (
                <TableRow>
                  <td
                    className="text-text-secondary py-6 text-center align-middle"
                    colSpan={5}
                  >
                    No nodes found.
                  </td>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default KubernetesPage;
