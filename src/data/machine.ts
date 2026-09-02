/**
 * What this machine runs.
 *
 * The shell owns the processes — it finds the binaries, starts them, holds the
 * children and states every port — so everything here is a question put to the
 * shell rather than an address written down a second time. The one thing the
 * shell cannot answer is who the node IS, and that comes from the node, at the
 * address the shell reports.
 *
 * `invalidate(keys.machine)` after starting or stopping anything: the node's
 * identity is only true while the node that answered is the one running.
 */
import { keys } from '~/data/keys'
import { useRead, useSend } from '~/data/query'
import { call, services, shell, type Service } from '~/data/shell'

/**
 * The node's account of itself, from `/v1/node/health_check`.
 *
 * `did:hanzo:<address>`, derived from the node's own key. The `@@name.sep-hanzo`
 * grammar it used to answer with is gone, and a node whose stored identity is
 * still spelled that way refuses to start rather than answering under it.
 */
export interface Node {
  status: string
  node_name: string
  version: string
}

export const useServices = () =>
  useRead<Service[]>(keys.machine, services, { enabled: shell() })

/** One service by name, out of the list, so nothing costs a second read. */
export const useService = (name: string) => {
  const running = useServices()
  return { ...running, data: running.data?.find((one) => one.name === name) }
}

/** Who the node is. Nothing to ask while it is not answering. */
export const useNode = (at: string | undefined) =>
  useRead<Node>(
    keys.node,
    async () => {
      const answer = await fetch(at as string)
      if (!answer.ok) throw new Error(`the node answered ${answer.status}`)
      return (await answer.json()) as Node
    },
    { enabled: Boolean(at) },
  )

/**
 * What a service has said, most recently.
 *
 * Nothing stays good, so `reload` always re-reads — a log's whole value is
 * being newer than the last time somebody looked at it.
 */
export const useLogs = (name: string, enabled = true) =>
  useRead<string>(keys.logs(name), () => call<string>('logs', { name }), {
    enabled: enabled && shell(),
    fresh: 0,
  })

/**
 * Start a service, stop one, or put one back the way it was.
 *
 * Restart is stop-then-start rather than a verb of its own: the shell adopts a
 * service that is already serving, so a start on its own would find the old one
 * and do nothing.
 */
export const useRun = () =>
  useSend(async (verb: 'start' | 'stop' | 'restart', name: string) => {
    if (verb !== 'start') await call('stop', { name })
    if (verb !== 'stop') await call('spawn', { name })
  }, [keys.machine])

/** Open the window that shows all of them. */
export const manage = () => call('manage')
