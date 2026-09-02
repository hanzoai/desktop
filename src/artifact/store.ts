/**
 * An artifact, and the sandbox that actually runs it.
 *
 * This printed a SCRIPT. Opening one emitted "Kubernetes pod 'sandbox-pod-x9k2'
 * spawned in 28ms" and "Zero-trust KMS hardware enclave verified (AES-256-GCM)";
 * running one emitted a compile time, an ingress URL and
 * "[zap] Zero-allocation telemetry stream online (0.18ms p99)" on a 250ms timer.
 * Nothing was spawned, verified, compiled or measured — and a fabricated p99 in
 * a terminal is indistinguishable from one a program printed.
 *
 * It leases a real sandbox now, writes the code to a file, runs it and prints
 * what came back. It composes `~/terminal`'s two axes rather than restating
 * them: WHERE it runs is an origin, WHAT isolates it is a runtime, and the
 * three sibling "environments" that stood here — "Local k3s", "Hanzo Cloud",
 * "gVisor Enclave" — crossed a place with an isolation and offered the cross as
 * one choice.
 */
import { useEffect, useState } from 'react'

import type { Leased, SandboxRuntime } from '@hanzo/ai'

import { client, ESTATE } from '~/data/origin'

export type ArtifactTab = 'code' | 'preview' | 'terminal'

/** How a language is run, and the file it is written to. */
const runners: Record<string, { file: string; argv: string[] }> = {
  python: { file: 'main.py', argv: ['python3', 'main.py'] },
  javascript: { file: 'main.js', argv: ['node', 'main.js'] },
  typescript: { file: 'main.ts', argv: ['node', '--experimental-strip-types', 'main.ts'] },
  bash: { file: 'main.sh', argv: ['bash', 'main.sh'] },
  sh: { file: 'main.sh', argv: ['sh', 'main.sh'] },
  go: { file: 'main.go', argv: ['go', 'run', 'main.go'] },
  ruby: { file: 'main.rb', argv: ['ruby', 'main.rb'] },
}

export interface ArtifactData {
  id: string
  title: string
  language: string
  code: string
  /** Where it runs — an origin id, the same axis a model is chosen on. */
  where: string
  /** What isolates it. A microVM is a runtime, not a place. */
  runtime: SandboxRuntime
  activeTab: ArtifactTab
  isRunning: boolean
  /** The live lease, or nothing. Nothing is leased until something is run. */
  box: Leased | null
  /** Only what the sandbox printed, plus this app's own notes, marked. */
  logs: string[]
}

const DEFAULT_ARTIFACT: ArtifactData = {
  id: '',
  title: '',
  language: 'typescript',
  code: '',
  where: ESTATE,
  runtime: 'gvisor',
  activeTab: 'code',
  isRunning: false,
  box: null,
  logs: [],
}

let current: ArtifactData | null = null
const listeners = new Set<(artifact: ArtifactData | null) => void>()

const put = (next: Partial<ArtifactData>) => {
  if (!current) return
  current = { ...current, ...next }
  listeners.forEach((fn) => fn(current))
}

const say = (text: string) => {
  if (!current) return
  put({ logs: [...current.logs, ...text.split('\n')] })
}

const because = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'the call failed'

export const artifactStore = {
  get: (): ArtifactData | null => current,

  /**
   * Opens an artifact.
   *
   * NOTHING IS LEASED HERE. Opening a file is not renting a computer, and the
   * six-line boot sequence this used to print described one that did not exist.
   */
  open: (data: Partial<ArtifactData> & { title: string; code: string; language?: string }) => {
    current = {
      ...DEFAULT_ARTIFACT,
      ...data,
      id: data.id || `art_${Date.now().toString(36)}`,
      language: data.language || 'typescript',
      activeTab: data.activeTab || 'code',
      logs: data.logs ?? [],
    }
    listeners.forEach((fn) => fn(current))
  },

  updateCode: (code: string) => put({ code }),
  setTab: (activeTab: ArtifactTab) => put({ activeTab }),

  /** A lease belongs to the place that granted it, so moving drops it. */
  setWhere: (where: string) => {
    if (!current || where === current.where) return
    put({ where, box: null })
    say(`# origin: ${where}`)
  },

  setRuntime: (runtime: SandboxRuntime) => {
    if (!current || runtime === current.runtime) return
    put({ runtime, box: null })
    say(`# runtime: ${runtime} (takes effect on the next lease)`)
  },

  /**
   * Writes the code into a leased sandbox and runs it.
   *
   * `exec` keeps nothing and needs no project, which is what makes it the class
   * this can lease without asking anybody anything first. A language with no
   * runner is REFUSED rather than run as something else — guessing would
   * execute one language's file with another's interpreter and report the
   * resulting syntax error as the program's own.
   */
  runCode: async () => {
    if (!current || current.isRunning) return
    const runner = runners[current.language.toLowerCase()]
    if (!runner) {
      say(`# no runner for ${current.language}`)
      return
    }

    const where = current.where
    const api = client(where).sandboxes
    put({ isRunning: true, activeTab: 'terminal' })

    try {
      let box = current.box
      if (!box) {
        box = await api.lease({ class: 'exec', runtime: current.runtime })
        put({ box })
        const asked = box.runtime && box.runtime !== current.runtime ? ` (asked ${current.runtime})` : ''
        say(`# leased ${box.id} · ${box.runtime ?? 'runtime unstated'}${asked}`)
      }

      await api.write({ id: box.id, path: runner.file, data: current.code })
      say(`$ ${runner.argv.join(' ')}`)

      const ran = await api.run({ id: box.id, argv: runner.argv })
      if (ran.stdout) say(ran.stdout.replace(/\n$/, ''))
      if (ran.stderr) say(ran.stderr.replace(/\n$/, ''))
      // A run that printed nothing still ended, and a non-zero end is the whole
      // result when there is no output to read it from.
      if (!ran.stdout && !ran.stderr) say(`# exit ${ran.exitCode ?? 0}`)
      else if (ran.exitCode) say(`# exit ${ran.exitCode}`)
    } catch (e) {
      say(`# ${because(e)}`)
    } finally {
      put({ isRunning: false })
    }
  },

  /**
   * Interrupts what is running. The LEASE SURVIVES — this stops a runaway
   * program, it does not release the computer.
   */
  stopCode: async () => {
    if (!current?.box) return
    const { box, where } = current
    try {
      await client(where).sandboxes.stop({ id: box.id })
      say('# interrupted')
    } catch (e) {
      say(`# ${because(e)}`)
    } finally {
      put({ isRunning: false })
    }
  },

  clearLogs: () => put({ logs: [] }),

  /** Closing ends the lease, because a sandbox nobody is watching still bills. */
  close: () => {
    const held = current
    current = null
    listeners.forEach((fn) => fn(null))
    if (held?.box) void client(held.where).sandboxes.end({ id: held.box.id }).catch(() => {})
  },
}

export const useArtifact = () => {
  const [artifact, setArtifact] = useState<ArtifactData | null>(current)
  useEffect(() => {
    const handler = (next: ArtifactData | null) => setArtifact(next)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
  return artifact
}
