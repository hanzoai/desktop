import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@hanzo_network/hanzo-ui';
import {
  type Distro,
  type MachineSpec,
  useCreateMachine,
} from '../../machine-state';
import { arch } from '@tauri-apps/plugin-os';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

const CPU_OPTIONS = [1, 2, 4, 6, 8];
const MEMORY_OPTIONS = [512, 1024, 2048, 4096, 8192];
const DISK_OPTIONS = [5, 10, 20, 50, 100];
const DISTRO_OPTIONS: Distro[] = ['ubuntu', 'alpine', 'debian'];

export interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateMachineDialog = ({
  open,
  onOpenChange,
}: CreateDialogProps) => {
  const navigate = useNavigate();
  const create = useCreateMachine();

  const [name, setName] = useState('');
  const [distro, setDistro] = useState<Distro>('ubuntu');
  const [cpus, setCpus] = useState(2);
  const [memoryMb, setMemoryMb] = useState(2048);
  const [diskGb, setDiskGb] = useState(20);
  const [rosetta, setRosetta] = useState(false);
  const [isArm64, setIsArm64] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => arch())
      .then((a) => {
        if (!cancelled) setIsArm64(a === 'aarch64');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const nameError =
    name.length > 0 && !NAME_RE.test(name)
      ? 'lowercase, alphanumeric and dashes only'
      : undefined;
  const canSubmit = Boolean(name) && !nameError && !create.isPending;

  const reset = () => {
    setName('');
    setDistro('ubuntu');
    setCpus(2);
    setMemoryMb(2048);
    setDiskGb(20);
    setRosetta(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    const spec: MachineSpec = {
      name,
      distro,
      cpus,
      memory_mb: memoryMb,
      disk_gb: diskGb,
      rosetta: isArm64 ? rosetta : undefined,
    };
    try {
      await create.mutateAsync(spec);
      toast.success(`Machine "${name}" is being created`);
      reset();
      onOpenChange(false);
      void navigate(`/machines/${name}`);
    } catch (err) {
      toast.error('Failed to create machine', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      open={open}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New machine</DialogTitle>
          <DialogDescription>
            Provision a new Linux VM. You can change settings later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-name">Name</Label>
            <Input
              autoFocus
              id="machine-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="my-box"
              value={name}
            />
            {nameError ? (
              <span className="text-xs text-red-400">{nameError}</span>
            ) : (
              <span className="text-text-tertiary text-xs">
                lowercase letters, digits and dashes
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="machine-distro">Distro</Label>
              <Select
                onValueChange={(v) => setDistro(v as Distro)}
                value={distro}
              >
                <SelectTrigger id="machine-distro">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISTRO_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="machine-cpus">CPUs</Label>
              <Select
                onValueChange={(v) => setCpus(Number(v))}
                value={String(cpus)}
              >
                <SelectTrigger id="machine-cpus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CPU_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="machine-memory">Memory</Label>
              <Select
                onValueChange={(v) => setMemoryMb(Number(v))}
                value={String(memoryMb)}
              >
                <SelectTrigger id="machine-memory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_OPTIONS.map((mb) => (
                    <SelectItem key={mb} value={String(mb)}>
                      {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="machine-disk">Disk</Label>
              <Select
                onValueChange={(v) => setDiskGb(Number(v))}
                value={String(diskGb)}
              >
                <SelectTrigger id="machine-disk">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISK_OPTIONS.map((gb) => (
                    <SelectItem key={gb} value={String(gb)}>
                      {gb} GB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isArm64 && (
            <div className="border-divider flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="flex flex-col">
                <Label className="text-sm" htmlFor="machine-rosetta">
                  Rosetta x86_64 emulation
                </Label>
                <span className="text-text-tertiary text-xs">
                  Run x86_64 binaries inside this arm64 VM
                </span>
              </div>
              <Switch
                checked={rosetta}
                id="machine-rosetta"
                onCheckedChange={setRosetta}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={create.isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {create.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMachineDialog;
