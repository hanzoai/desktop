import { runExecToString } from './exec';
import { type ContainerSummary } from './types';

// TODO: swap to direct unix-socket Docker HTTP API client at
// unix:///Users/$USER/.hanzo/run/docker.sock once the bridge agent ships.
// We use `docker ps` inside the active machine for now because Tauri's HTTP
// plugin does not expose unix-socket transport and adding a Tauri command is
// out of scope for this agent.
export const listContainers = async (
  activeMachine: string,
): Promise<ContainerSummary[]> => {
  if (!activeMachine) return [];
  const { exit, stdout, stderr } = await runExecToString(activeMachine, [
    'docker',
    'ps',
    '--all',
    '--format',
    '{{json .}}',
  ]);
  if (exit !== 0) {
    throw new Error(stderr.trim() || `docker ps exited with code ${exit}`);
  }
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseLine(line));
};

interface DockerPsLine {
  ID?: string;
  Image?: string;
  Command?: string;
  CreatedAt?: string;
  Status?: string;
  Ports?: string;
  Names?: string;
}

const parseLine = (line: string): ContainerSummary => {
  const raw = JSON.parse(line) as DockerPsLine;
  return {
    id: raw.ID ?? '',
    image: raw.Image ?? '',
    command: raw.Command ?? '',
    created_at: raw.CreatedAt ?? '',
    status: raw.Status ?? '',
    ports: raw.Ports ?? '',
    names: raw.Names ?? '',
  };
};
