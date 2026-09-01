/**
 * Durable Task Queue state store.
 */
import { useEffect, useState } from 'react'
import type { DurableTask } from './types'

export interface TaskQueueState {
  isOpen: boolean
  tasks: DurableTask[]
  activeTaskId: string | null
}

const DEFAULT_TASKS: DurableTask[] = [
  {
    id: 'task-ci-build',
    title: 'CI/CD: Build Production Next.js 16 + React 19 Bundle',
    assignedAgent: '@dev',
    status: 'completed',
    progress: 100,
    currentStep: '✓ Bundle emitted to dist/ in 1.54s',
    retries: 0,
    maxRetries: 3,
    trigger: 'ci_cd',
    startedAt: '4m ago',
    duration: '1.54s',
    logs: [
      '$ pnpm typecheck && pnpm test && pnpm build',
      '✔ tsc --noEmit (0 errors)',
      '✔ 22/22 tests passing',
      '✓ built in 1.54s',
    ],
    artifacts: ['dist/assets/index.js', 'dist/assets/index.css'],
  },
  {
    id: 'task-k3s-deploy',
    title: 'Local k3s Cluster: Deploy Sandbox Worker Pod',
    assignedAgent: '@executor',
    status: 'running',
    progress: 75,
    currentStep: 'Applying k8s manifest & configuring Traefik ingress...',
    retries: 0,
    maxRetries: 3,
    trigger: 'agent_swarm',
    startedAt: '1m ago',
    logs: [
      '$ kubectl apply -f k3s/sandbox-worker.yaml',
      'namespace/hanzo-sandbox unchanged',
      'deployment.apps/sandbox-worker configured',
      'service/sandbox-http created',
      'ingress.networking.k8s.io/sandbox-traefik created',
    ],
  },
  {
    id: 'task-secops-audit',
    title: 'SecOps: KMS Hardware Enclave & gVisor Sandbox Audit',
    assignedAgent: '@secops',
    status: 'queued',
    progress: 0,
    currentStep: 'Waiting in durable FIFO queue...',
    retries: 0,
    maxRetries: 5,
    trigger: 'manual',
    startedAt: 'Just now',
    logs: ['Queued in durable state machine.'],
  },
]

let state: TaskQueueState = {
  isOpen: false,
  tasks: DEFAULT_TASKS,
  activeTaskId: 'task-k3s-deploy',
}

const listeners = new Set<(s: TaskQueueState) => void>()

const notify = () => {
  listeners.forEach((fn) => fn(state))
}

export const taskQueueStore = {
  get: (): TaskQueueState => state,

  open: (taskId?: string) => {
    state = {
      ...state,
      isOpen: true,
      activeTaskId: taskId || state.activeTaskId || state.tasks[0]?.id || null,
    }
    notify()
  },

  close: () => {
    state = { ...state, isOpen: false }
    notify()
  },

  toggle: () => {
    state = { ...state, isOpen: !state.isOpen }
    notify()
  },

  selectTask: (id: string) => {
    state = { ...state, activeTaskId: id }
    notify()
  },

  dispatchTask: (title: string, assignedAgent: string) => {
    const newTask: DurableTask = {
      id: `task-${Date.now()}`,
      title,
      assignedAgent,
      status: 'running',
      progress: 20,
      currentStep: 'Initializing local runtime worker...',
      retries: 0,
      maxRetries: 3,
      trigger: 'manual',
      startedAt: 'Just now',
      logs: [`$ hanzo task run "${title}"`, 'Worker spawned on local node engine.'],
    }

    state = {
      ...state,
      tasks: [newTask, ...state.tasks],
      activeTaskId: newTask.id,
    }
    notify()
  },

  retryTask: (id: string) => {
    state = {
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'running',
              retries: t.retries + 1,
              progress: 30,
              currentStep: 'Retrying task execution...',
              logs: [...t.logs, `$ retry (attempt ${t.retries + 1})`],
            }
          : t,
      ),
    }
    notify()
  },

  cancelTask: (id: string) => {
    state = {
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: 'failed', currentStep: 'Cancelled by user' } : t,
      ),
    }
    notify()
  },
}

export const useTaskQueue = (): TaskQueueState => {
  const [current, setCurrent] = useState<TaskQueueState>(state)

  useEffect(() => {
    const handler = (next: TaskQueueState) => setCurrent(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return current
}
