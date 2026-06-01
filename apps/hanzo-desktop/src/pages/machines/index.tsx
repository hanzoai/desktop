import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hanzo_network/hanzo-ui';
import {
  type Machine,
  useDeleteMachine,
  useMachines,
  useStartMachine,
  useStopMachine,
} from '../../machine-state';
import {
  Copy,
  MoreHorizontal,
  Play,
  Plus,
  Server,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { MachineStateBadge } from '../../components/machine/state-badge';
import {
  formatAge,
  formatDiskGb,
  formatMemoryMb,
} from '../../components/machine/format';
import CreateMachineDialog from './create-dialog';

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="border-divider mx-auto flex max-w-xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
    <div className="bg-bg-quaternary flex size-12 items-center justify-center rounded-full">
      <Server className="size-6" />
    </div>
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">No machines yet</h2>
      <p className="text-text-secondary text-sm">
        Create your first Linux VM to start running containers and Kubernetes.
      </p>
    </div>
    <Button onClick={onCreate}>
      <Plus className="mr-2 size-4" /> New machine
    </Button>
  </div>
);

const MachinesPage = () => {
  const navigate = useNavigate();
  const { data: machines, isLoading, error } = useMachines();
  const start = useStartMachine();
  const stop = useStopMachine();
  const remove = useDeleteMachine();

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Machine | undefined>();

  const handleStart = async (m: Machine) => {
    try {
      await start.mutateAsync(m.name);
    } catch (e) {
      toast.error(`Failed to start "${m.name}"`, {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleStop = async (m: Machine) => {
    try {
      await stop.mutateAsync(m.name);
    } catch (e) {
      toast.error(`Failed to stop "${m.name}"`, {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDelete = async (m: Machine) => {
    try {
      await remove.mutateAsync(m.name);
      toast.success(`Deleted "${m.name}"`);
    } catch (e) {
      toast.error(`Failed to delete "${m.name}"`, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConfirmDelete(undefined);
    }
  };

  const copyIp = async (m: Machine) => {
    if (!m.ip) {
      toast.error('No IP assigned yet');
      return;
    }
    await navigator.clipboard.writeText(m.ip);
    toast.success(`Copied ${m.ip}`);
  };

  const showEmpty =
    !isLoading && !error && (!machines || machines.length === 0);

  return (
    <div className="container flex flex-col py-10">
      <header className="flex items-center justify-between pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-inter text-3xl font-medium">Machines</h1>
          <p className="text-text-secondary text-sm">
            Linux virtual machines managed by hanzod.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" /> New machine
        </Button>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          data-testid="machines-error"
        >
          {error.message}
        </div>
      )}

      {showEmpty ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div
          className="border-divider rounded-lg border"
          data-testid="machines-table"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Distro</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>RAM</TableHead>
                <TableHead>Disk</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Age</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(machines ?? []).map((m) => (
                <TableRow
                  className="cursor-pointer"
                  data-testid={`machine-row-${m.name}`}
                  key={m.name}
                  onClick={() => navigate(`/machines/${m.name}`)}
                >
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    <MachineStateBadge state={m.state} />
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {m.distro}
                  </TableCell>
                  <TableCell>{m.cpus}</TableCell>
                  <TableCell>{formatMemoryMb(m.memory_mb)}</TableCell>
                  <TableCell>{formatDiskGb(m.disk_gb)}</TableCell>
                  <TableCell className="text-text-secondary font-mono text-xs">
                    {m.ip ?? '-'}
                  </TableCell>
                  <TableCell className="text-text-secondary">
                    {formatAge(m.created_at)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Actions for ${m.name}`}
                          size="icon"
                          variant="tertiary"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={m.state === 'running' || m.state === 'starting'}
                          onClick={() => handleStart(m)}
                        >
                          <Play className="mr-2 size-4" /> Start
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={m.state !== 'running'}
                          onClick={() => handleStop(m)}
                        >
                          <Square className="mr-2 size-4" /> Stop
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={m.state !== 'running'}
                          onClick={() => navigate(`/machines/${m.name}?tab=shell`)}
                        >
                          <Terminal className="mr-2 size-4" /> Open shell
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!m.ip}
                          onClick={() => copyIp(m)}
                        >
                          <Copy className="mr-2 size-4" /> Copy IP
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={() => setConfirmDelete(m)}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateMachineDialog onOpenChange={setCreateOpen} open={createOpen} />

      <AlertDialog
        onOpenChange={(o) => !o && setConfirmDelete(undefined)}
        open={Boolean(confirmDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete machine?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently destroy &quot;{confirmDelete?.name}&quot; and
              its disk. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MachinesPage;
