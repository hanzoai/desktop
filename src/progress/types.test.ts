/**
 * The two decisions a bar rests on.
 *
 * Both are about NULL, and both were written because the tempting shortcut in
 * each case is `?? 0` — which turns "nobody can say" into "nothing has
 * happened". Those render identically and mean opposite things, which is
 * precisely why a test has to hold them apart.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { progressOf, rollUp, type Progress } from './types.ts'

const at = (pct: number | null): Progress => ({
  pct,
  phase: 'running',
  activity: '',
  at: '',
  estimated: false,
})

test('an absent pct stays null rather than becoming zero', () => {
  const of = progressOf({ phase: 'running' })
  assert.equal(of.pct, null, 'a run that cannot say how far along it is reads as 0%')
})

test('a pct of zero is kept, because zero is an answer somebody gave', () => {
  assert.equal(progressOf({ pct: 0 }).pct, 0)
})

test('a phase outside the five is unknown, not running', () => {
  assert.equal(progressOf({ phase: 'sprinting' }).phase, 'unknown')
  assert.equal(progressOf({}).phase, 'unknown')
  assert.equal(progressOf({ phase: 'blocked' }).phase, 'blocked')
})

test('progress is a model estimate only when the wire says so', () => {
  assert.equal(progressOf({ pct: 40 }).estimated, false)
  assert.equal(progressOf({ pct: 40, estimated: true }).estimated, true)
})

test('a roll-up averages the subtasks that can say', () => {
  assert.equal(rollUp([at(100), at(50), at(0)]), 50)
})

test('subtasks that cannot say are LEFT OUT, not counted as zero', () => {
  // Two done and one silent is not 67% — the silent one has not been heard
  // from, which is different from having done nothing.
  assert.equal(rollUp([at(100), at(100), at(null)]), 100)
})

test('a parent whose every subtask is silent is itself indeterminate', () => {
  assert.equal(rollUp([at(null), at(null)]), null, 'a silent tree rolled up to a number')
})

test('a parent with no subtasks rolls up to nothing', () => {
  assert.equal(rollUp([]), null)
})
