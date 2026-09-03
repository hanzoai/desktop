/**
 * A run's subagents, each with its own bar.
 *
 * A run that spawns another is a TREE — every descendant inherits the same root
 * id — so this draws the nesting the flat queue flattens away. One indexed read
 * pulls the whole flow, so depth costs nothing per node.
 *
 * **A PARENT'S BAR IS ITS OWN WORD WHERE IT HAS ONE.** Only where a parent has
 * reported nothing does the row fall back to the mean of the children that can
 * say — and it is LABELLED as rolled up, because "60% because I said so" and
 * "60% because my three subtasks average that" are different claims and a
 * reader should not have to guess which they are looking at.
 */
import { ChevronRight } from '@hanzogui/lucide-icons-2'

import { Progressing } from './Bar'
import { rollUp, type Node } from './types'

const Row = ({ node, depth }: { node: Node; depth: number }) => {
  const { run, children } = node

  // A parent that reported its own progress is believed over any sum of its
  // parts: it is the only one that knows how much of its goal a part is.
  const rolled = run.progress.pct === null ? rollUp(children.map((c) => c.run.progress)) : null
  const shown = rolled === null ? run.progress : { ...run.progress, pct: rolled }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: depth * 16,
        }}
      >
        {depth > 0 ? (
          <ChevronRight size={11} color="rgba(255,255,255,0.25)" style={{ flexShrink: 0 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run.title}
            </span>
            {run.agent ? (
              <span style={{ fontSize: 10.5, color: '#a78bfa', flexShrink: 0 }}>{run.agent}</span>
            ) : null}
            {rolled !== null ? (
              <span
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}
                title="This run reported nothing of its own; the share is the mean of the subtasks that could say."
              >
                rolled up
              </span>
            ) : null}
          </div>
          <Progressing of={shown} />
        </div>
      </div>

      {children.map((child) => (
        <Row key={child.run.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export const Subtasks = ({ tree }: { tree: Node | null }) =>
  tree === null ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row node={tree} depth={0} />
    </div>
  )
