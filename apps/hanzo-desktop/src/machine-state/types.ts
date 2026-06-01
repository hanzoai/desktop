// Canonical Machine state shape. Single source of truth: the C ABI in
// /Users/z/work/luxcpp/machine/include/lux_machine.h (lux_machine_spec /
// lux_machine_info / lux_machine_state enum). Any drift between this file
// and that header is a bug — keep in sync.
export type MachineState =
  | 'creating'
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'deleting'
  | 'error';

export type Distro = 'ubuntu' | 'alpine' | 'debian';

export interface Machine {
  name: string;
  distro: Distro;
  cpus: number;
  memory_mb: number;
  disk_gb: number;
  state: MachineState;
  ip?: string;
  vsock_port?: number;
  created_at: string;
  started_at?: string;
}

export interface MachineSpec {
  name: string;
  distro: Distro;
  cpus: number;
  memory_mb: number;
  disk_gb: number;
  rosetta?: boolean;
}

export interface MachineHealth {
  ok: boolean;
  version: string;
}

export interface MachineEvent {
  name: string;
  state: MachineState;
  ts: string;
}

export interface ExecChunk {
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface ExecExit {
  exit: number;
}

export interface ContainerSummary {
  id: string;
  image: string;
  command: string;
  created_at: string;
  status: string;
  ports: string;
  names: string;
}

export const TRANSITIONING_STATES: ReadonlyArray<MachineState> = [
  'creating',
  'starting',
  'stopping',
  'deleting',
];

export const isTransitioning = (state: MachineState): boolean =>
  TRANSITIONING_STATES.includes(state);
