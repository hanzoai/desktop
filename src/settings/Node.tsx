import { Button, Paragraph, SizableText, XStack, YStack } from '@hanzo/ui'
import { row, rows } from '@hanzo/ui/glass'

import { manage, useNode, useRun, useService } from '~/data/machine'

/**
 * One fact about the node: what it is called, and what it says.
 *
 * The value shrinks and the name does not. A DID is longer than the dialog is
 * wide, and a row whose value refuses to shrink pushes itself off the right
 * edge rather than eliding — so the one fact somebody came to read is the one
 * that disappears.
 */
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <XStack {...row}>
      <SizableText fontSize="$3" fontWeight="500" color="$color" flexShrink={0}>
        {name}
      </SizableText>
      <SizableText fontSize="$2" color="$color11" numberOfLines={1} flexShrink={1} minWidth={0}>
        {value}
      </SizableText>
    </XStack>
  )
}

/**
 * The node on this machine: where it is, who it is, and whether it answers.
 *
 * Chat does not come through here and nothing on this screen pairs with
 * anything — the desktop asks the engine's own OpenAI surface, so there is no
 * key to mint, nothing to keep, and nothing that can lock the app out of a node
 * it started itself. That is why the verb below is Restart and not Reset: the
 * secret a reset existed to throw away does not exist.
 *
 * Everything is asked of the shell, which is what runs the node and states its
 * ports; the address shown is the one it answered with.
 */
export function Node() {
  const node = useService('node')
  const health = useNode(node.data?.up ? node.data.at : undefined)
  const run = useRun()

  const where = node.data ? new URL(node.data.at).origin : '—'
  const standing = node.data?.up
    ? node.data.own
      ? 'Running, started by this app'
      : 'Running, started elsewhere'
    : node.pending
      ? 'Asking…'
      : 'Not running'

  return (
    <YStack rowGap="$5" paddingVertical="$2">
      <YStack {...rows}>
        <Fact name="Address" value={where} />
        <Fact name="Identity" value={health.data?.node_name ?? '—'} />
        <Fact name="Version" value={health.data?.version ?? '—'} />
        <Fact name="Status" value={standing} />
      </YStack>

      <XStack gap="$2" flexWrap="wrap">
        <Button size="sm" variant="outline" onPress={() => void manage()}>
          Open local services
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={run.pending}
          onPress={() => void run.run('restart', 'node')}
        >
          Restart the node
        </Button>
      </XStack>

      {run.fault ? (
        <Paragraph fontSize="$1" color="#f87171">
          {run.fault}
        </Paragraph>
      ) : null}
    </YStack>
  )
}

export default Node
