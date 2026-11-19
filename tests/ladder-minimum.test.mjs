import test from 'node:test'
import assert from 'node:assert/strict'
import { exploreLadder, solveLadder, solveOrderedLadder, targetRoutes } from '../src/ladder.ts'

const dictionary = new Set(['CAT', 'AT', 'IT', 'BIT', 'BIG', 'COT', 'DOT'])
const unrestricted = { addDelete: true, minWordLength: 1 }
const restricted = { addDelete: true, minWordLength: 3 }

test('minimum length prevents short intermediate words in two-word and ordered searches', () => {
  const result = solveLadder('CAT', 'BIT', dictionary, unrestricted)
  assert.deepEqual(result.path, ['CAT', 'AT', 'IT', 'BIT'])
  assert.equal(solveLadder('CAT', 'BIT', dictionary, restricted).path, null)
  assert.equal(solveOrderedLadder(['CAT', 'BIT', 'BIG'], dictionary, restricted).path, null)
  assert.deepEqual(solveOrderedLadder(['CAT', 'BIT', 'BIG'], dictionary, unrestricted).path, ['CAT', 'AT', 'IT', 'BIT', 'BIG'])
  assert.ok(dictionary.has('AT'), 'filter must not mutate the shared dictionary')
  assert.deepEqual(solveLadder('CAT', 'BIT', dictionary, unrestricted).path, result.path)
})

test('exploration excludes all short words and still returns valid three-letter paths', () => {
  const result = exploreLadder('CAT', dictionary, restricted)
  assert.deepEqual(result.levels[0], ['COT'])
  assert.deepEqual(result.levels[1], ['DOT'])
  assert.ok(Object.keys(result.nodes).every(word => word.length >= 3))
  assert.ok(exploreLadder('CAT', dictionary, unrestricted).nodes.AT)
  const target = solveLadder('CAT', 'DOT', dictionary, restricted)
  for (const route of targetRoutes(target.graph, target.end)) assert.ok(route.path.every(word => word.length >= 3))
})

test('short inputs are rejected in every mode when the minimum is enabled', () => {
  assert.throws(() => solveLadder('AT', 'BIT', dictionary, restricted), /at least 3/)
  assert.throws(() => solveLadder('CAT', 'IT', dictionary, restricted), /at least 3/)
  assert.throws(() => solveLadder('AT', 'AT', dictionary, restricted), /at least 3/)
  assert.throws(() => exploreLadder('AT', dictionary, restricted), /at least 3/)
  assert.throws(() => solveOrderedLadder(['CAT', 'AT', 'BIT'], dictionary, restricted), /at least 3/)
  for (const minWordLength of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => solveLadder('CAT', 'DOT', dictionary, { minWordLength }), /positive whole number/)
})
