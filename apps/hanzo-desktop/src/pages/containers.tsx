import { useQuery } from '@tanstack/react-query';
import {
  Button,
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
  type ContainerSummary,
  listContainers,
  useMachines,
} from '../machine-state';
import { Box, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  pickDefaultActiveMachine,
  setActiveMachineName,
} from '../components/machine/active-machine';

const ContainersPage = () => {
  const { data: machines, isLoading: machinesLoading } = useMachines();
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

  const runningMachines = useMemo(
    () => (machines ?? []).filter((m) => m.state === 'running'),
    [machines],
  );

  const containers = useQuery<ContainerSummary[], Error>({
    queryKey: ['containers.list', active],
    queryFn: () => {
      if (!active) return Promise.resolve([]);
      return listContainers(active);
    },
    enabled: Boolean(active),
    refetchInterval: 5_000,
  });

  return (
    <div className="container flex flex-col py-10">
      <header className="flex items-center justify-between pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-inter text-3xl font-medium">Containers</h1>
          <p className="text-text-secondary text-sm">
            Docker containers running inside the active machine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={setActive} value={active ?? ''}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="select machine" />
            </SelectTrigger>
            <SelectContent>
              {(machines ?? []).map((m) => (
                <SelectItem
                  disabled={m.state !== 'running'}
                  key={m.name}
                  value={m.name}
                >
                  {m.name} {m.state !== 'running' ? `(${m.state})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!active || containers.isFetching}
            onClick={() => containers.refetch()}
            size="icon"
            variant="outline"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      {!machinesLoading && runningMachines.length === 0 && (
        <div className="border-divider mx-auto flex max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
          <div className="bg-bg-quaternary flex size-12 items-center justify-center rounded-full">
            <Box className="size-6" />
          </div>
          <h2 className="text-lg font-semibold">No running machines</h2>
          <p className="text-text-secondary text-sm">
            Start a machine to inspect its containers.
          </p>
        </div>
      )}

      {containers.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {containers.error.message}
        </div>
      )}

      {active && (
        <div className="border-divider rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ports</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(containers.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.names}</TableCell>
                  <TableCell className="text-text-secondary">
                    {c.image}
                  </TableCell>
                  <TableCell>{c.status}</TableCell>
                  <TableCell className="text-text-secondary font-mono text-xs">
                    {c.ports || '-'}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {c.created_at}
                  </TableCell>
                  <TableCell className="text-text-secondary font-mono text-xs">
                    {c.id.slice(0, 12)}
                  </TableCell>
                </TableRow>
              ))}
              {containers.data && containers.data.length === 0 && (
                <TableRow>
                  <td
                    className="text-text-secondary py-10 text-center align-middle"
                    colSpan={6}
                  >
                    No containers running.
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

export default ContainersPage;
