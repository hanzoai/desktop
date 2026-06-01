export const MachineQueryKey = {
  HEALTH: 'machine.health',
  LIST: 'machine.list',
  GET: 'machine.get',
} as const;

export const MachineEventChannel = 'machine://event';
export const MachineExecChunkChannel = (id: string) =>
  `machine://exec/${id}/chunk`;
export const MachineExecExitChannel = (id: string) =>
  `machine://exec/${id}/exit`;
