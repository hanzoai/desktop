/**
 * The join between the two skill views.
 *
 * Written because both ways of getting it wrong are silent. The registry
 * prefixes every skill `skill_<name>` and the authored view does not, so a join
 * that compares the two raw lists matches NOTHING — and the screen that results
 * is a plausible one: a list of skills, none of them marked as this org's, none
 * of them openable. Nothing throws and nothing is empty.
 *
 * The second assertion is the one that would not have been written from the
 * document. A brand skill of the same name shadows an org's in the registry, so
 * an authored skill can exist and not appear in the list it is supposed to be
 * part of.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fold } from './fold.ts'

test('the registry prefix comes off, so a body finds its skill', () => {
  const [one, ...rest] = fold(
    [{ name: 'skill_triage', description: 'how we triage', activated: true }],
    [{ name: 'triage', content: '# Triage', writtenAt: 1_700_000_000_000 }],
  )
  assert.equal(rest.length, 0, 'one skill, not two')
  assert.equal(one.name, 'triage')
  assert.equal(one.id, 'skill_triage', 'activation is sent under the registry name')
  assert.equal(one.authored, true)
  assert.equal(one.content, '# Triage')
  assert.equal(one.activated, true)
})

test("a skill the org wrote is listed even when the registry shadowed it", () => {
  const list = fold([], [{ name: 'triage', content: '# Triage', writtenAt: 1 }])
  assert.equal(list.length, 1, 'it exists; the org store said so')
  assert.equal(list[0].authored, true)
  assert.equal(list[0].activated, false, 'the registry is what activation reads')
})

test('a brand skill carries no body and is not claimed as ours', () => {
  const [one] = fold([{ name: 'skill_review', description: 'review' }], [])
  assert.equal(one.name, 'review')
  assert.equal(one.authored, false)
  assert.equal(one.content, undefined)
  assert.equal(one.activated, false, 'absent is off, never assumed on')
})

test('a description is taken from the registry, and falls back to ours', () => {
  const [mine, theirs] = fold(
    [
      { name: 'skill_a' },
      { name: 'skill_b', description: 'what the registry says' },
    ],
    [
      { name: 'a', description: 'what we wrote', writtenAt: 1 },
      { name: 'b', description: 'what we wrote', writtenAt: 1 },
    ],
  )
  assert.equal(mine.description, 'what we wrote')
  assert.equal(theirs.description, 'what the registry says')
})
