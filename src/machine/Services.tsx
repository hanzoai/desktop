import { Button, H2, Paragraph, ScrollView, Separator, SizableText, XStack, YStack } from '@hanzo/ui'
import { row, rows } from '@hanzo/ui/glass'
import { useState } from 'react'

import { useLogs, useRun, useServices } from '~/data/machine'
import type { Service } from '~/data/shell'

/** What a service is called, where the shell's name is a handle. */
const TITLE: Record<string, string> = {
  engine: 'Engine',
  embedding: 'Embeddings',
  node: 'Node',
}

const title = (name: string) => TITLE[name] ?? name

/**
 * Monospace, the way `thread/markdown.tsx` already spells it: there is no
 * `$mono` token, so it goes through `style`, where the host's own mono face is
 * honoured and the platform's is the fallback.
 */
const MONO = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
} as const

/**
 * One service: what it is, where it answers, and the verbs it has.
 *
 * A service this app did not start is not this app's to stop, which is the rule
 * the shell keeps — it holds only the children it made — so Stop is refused for
 * one it adopted and the row says which it is.
 */
function Row({
  service,
  chosen,
  onChoose,
}: {
  service: Service
  chosen: boolean
  onChoose: () => void
}) {
  const run = useRun()

  const standing = !service.up ? 'stopped' : service.own ? 'running' : 'running already'

  return (
    <>
      <XStack {...row} flexWrap="wrap">
        <YStack minWidth={0} flexGrow={1} rowGap="$1">
          <SizableText fontSize="$3" fontWeight="500" color="$color">
            {title(service.name)}
          </SizableText>
          <Paragraph fontSize="$1" color="$color11">
            {new URL(service.at).origin} · {standing}
          </Paragraph>
        </YStack>

        <XStack gap="$2">
          {service.up ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={run.pending || !service.own}
                onPress={() => void run.run('stop', service.name)}
              >
                Stop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={run.pending}
                onPress={() => void run.run('restart', service.name)}
              >
                Restart
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={run.pending}
              onPress={() => void run.run('start', service.name)}
            >
              Start
            </Button>
          )}
          <Button size="sm" variant={chosen ? 'outline' : 'ghost'} onPress={onChoose}>
            Log
          </Button>
        </XStack>
      </XStack>

      {run.fault ? (
        <XStack {...row}>
          <Paragraph fontSize="$1" color="#f87171">
            {run.fault}
          </Paragraph>
        </XStack>
      ) : null}
    </>
  )
}

/** The end of one service's output. */
function Log({ service }: { service: string }) {
  const log = useLogs(service)

  return (
    <YStack flexGrow={1} minHeight={0} rowGap="$2">
      <XStack alignItems="center" justifyContent="space-between">
        <SizableText fontSize="$3" fontWeight="500" color="$color">
          {title(service)}
        </SizableText>
        <Button size="sm" variant="ghost" disabled={log.pending} onPress={log.reload}>
          Read again
        </Button>
      </XStack>
      <ScrollView
        flexGrow={1}
        flexBasis="auto"
        minHeight={0}
        backgroundColor="$hover"
        padding="$3"
        borderRadius="$4"
      >
        <SizableText fontSize="$1" color="$color11" style={MONO}>
          {log.data || 'Nothing yet.'}
        </SizableText>
      </ScrollView>
    </YStack>
  )
}

/**
 * The window over the processes this machine runs.
 *
 * One window over ALL of them rather than a manager for the node, because the
 * node is one of three and the other two are what answer a conversation.
 * Everything shown is the shell's own answer — it finds the binaries, holds the
 * children and states the ports — so there is no second table here to disagree
 * with it, and the address on each row is the one it was given.
 *
 * A log is read when it is asked for. Nothing streams and nothing polls: the
 * output is a file the service writes, so it is still there after the crash
 * that makes it worth reading.
 */
export const Services = () => {
  const running = useServices()
  const [chosen, choose] = useState('node')

  return (
    <YStack flex={1} minHeight={0} padding="$5" rowGap="$4" backgroundColor="$background">
      <XStack alignItems="center" justifyContent="space-between">
        <H2 fontSize="$5" fontWeight="500" color="$color">
          Local services
        </H2>
        <Button size="sm" variant="ghost" disabled={running.pending} onPress={running.reload}>
          Read again
        </Button>
      </XStack>

      <YStack {...rows}>
        {(running.data ?? []).map((service) => (
          <Row
            key={service.name}
            service={service}
            chosen={service.name === chosen}
            onChoose={() => choose(service.name)}
          />
        ))}
      </YStack>

      <Separator />

      <Log service={chosen} />
    </YStack>
  )
}
