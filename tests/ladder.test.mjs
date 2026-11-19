import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solveLadder } from '../src/ladder.ts'

const differences = (a, b) => a.length === b.length ? [...a].filter((letter, i) => letter !== b[i]).length : Infinity

function verify(start, end, words, distance) {
  const result = solveLadder(start, end, words)
  if (distance === null) { assert.equal(result.path, null); return }
  assert.equal(result.path.length - 1, distance)
  assert.equal(result.path[0], start)
  assert.equal(result.path.at(-1), end)
  for (const [index, word] of result.path.entries()) {
    assert.ok(words.has(word))
    if (index) assert.equal(differences(result.path[index - 1], word), 1)
  }
}

test('handles zero steps, direct neighbors, detours, and disconnected cycles', () => {
  const words = new Set(['HIT', 'HOT', 'DOT', 'DOG', 'COG', 'LOT', 'LOG', 'ZZZ'])
  verify('HIT', 'HIT', words, 0)
  verify('HIT', 'HOT', words, 1)
  verify('HIT', 'COG', words, 4)
  verify('COG', 'HIT', words, 4)
  verify('HIT', 'ZZZ', words, null)
  assert.equal(words.size, 8)
})

test('rejects missing, malformed, and unequal-length endpoints', () => {
  const words = new Set(['A', 'AT', 'CAT', 'DOG', 'cat', 'C-T'])
  for (const [start, end] of [['', 'CAT'], ['cat', 'CAT'], ['C-T', 'CAT'], ['CAT', 'XXX'], ['XXX', 'CAT'], ['A', 'AT']]) {
    assert.throws(() => solveLadder(start, end, words))
  }
})

test('matches independent all-pairs shortest distances on seeded word graphs', () => {
  const candidates = []
  for (const a of 'ABC') for (const b of 'ABC') candidates.push(a + b)
  let seed = 819
  for (let sample = 0; sample < 40; sample++) {
    const words = candidates.filter(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 < .6 })
    const distance = words.map(a => words.map(b => a === b ? 0 : differences(a, b) === 1 ? 1 : Infinity))
    for (let k = 0; k < words.length; k++) for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) {
      distance[i][j] = Math.min(distance[i][j], distance[i][k] + distance[k][j])
    }
    const dictionary = new Set(words)
    for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) {
      verify(words[i], words[j], dictionary, Number.isFinite(distance[i][j]) ? distance[i][j] : null)
    }
  }
})

test('bundled dictionary connects COLD to WARM in the theoretical minimum four changes', () => {
  const dictionary = new Set(readFileSync(new URL('../public/norvig-word-list.txt', import.meta.url), 'utf8').split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean))
  verify('COLD', 'WARM', dictionary, 4)
})

test('optional moves are off by default and individually enabled', () => {
  for (const [start, end, options, description] of [
    ['AT', 'CAT', { addDelete: true }, /Add C/],
    ['CAT', 'AT', { addDelete: true }, /Delete C/],
    ['CAT', 'ACT', { rearrange: 'swap' }, /Swap/],
    ['EAST', 'SEAT', { move: true }, /Move S from position 3 to position 1/],
    ['ABCD', 'DCBA', { rearrange: 'permute' }, /Rearrange/],
    ['AAB', 'BAA', { rearrange: 'permute' }, /Rearrange/],
  ]) {
    const dictionary = new Set([start, end])
    if (start.length === end.length) assert.equal(solveLadder(start, end, dictionary).path, null)
    else assert.throws(() => solveLadder(start, end, dictionary))
    const result = solveLadder(start, end, dictionary, options)
    assert.deepEqual(result.path, [start, end])
    assert.equal(result.moves.length, 1)
    assert.match(result.moves[0].description, description)
  }
  const words = new Set(['ABCD', 'DCBA'])
  assert.equal(solveLadder('ABCD', 'DCBA', words, { rearrange: 'swap', move: true }).path, null)
  assert.equal(solveLadder('EAST', 'SEAT', new Set(['EAST', 'SEAT']), { rearrange: 'swap' }).path, null)
})

test('length-changing detours are allowed even when endpoints have equal length', () => {
  const words = new Set(['AT', 'CAT', 'CATS', 'CUTS', 'CUT', 'CU'])
  const result = solveLadder('AT', 'CU', words, { addDelete: true })
  assert.deepEqual(result.path, ['AT', 'CAT', 'CUT', 'CU'])
  assert.equal(result.moves.length, 3)
  assert.equal(solveLadder('AT', 'CU', words).path, null)
})

// Pairwise edge oracle checks relationships without using the solver's generators.
function permitted(a, b, options) {
  const removed = word => [...word].map((_, i) => word.slice(0, i) + word.slice(i + 1))
  if (a === b) return false
  if (differences(a, b) === 1) return true
  if (options.addDelete && (removed(a).includes(b) || removed(b).includes(a))) return true
  if (a.length !== b.length) return false
  const sameLetters = [...a].sort().join('') === [...b].sort().join('')
  if (options.rearrange === 'permute' && sameLetters) return true
  if (options.rearrange === 'swap' && sameLetters && differences(a, b) === 2) return true
  if (options.move) {
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      if (a[i] === b[j] && removed(a)[i] === removed(b)[j]) return true
    }
  }
  return false
}

test('all rule combinations match independent shortest distances with repeated letters and mixed lengths', () => {
  const words = ['A', 'B', 'AB', 'BA', 'AA', 'BB', 'AAB', 'ABA', 'BAA', 'ABB', 'BAB', 'BBA', 'ABC', 'CAB', 'BCA', 'CBA', 'ABCD', 'DCBA']
  const dictionary = new Set(words)
  for (const addDelete of [false, true]) for (const rearrange of ['off', 'swap', 'permute']) for (const move of [false, true]) {
    const options = { addDelete, rearrange, move }
    const distances = words.map(a => words.map(b => a === b ? 0 : permitted(a, b, options) ? 1 : Infinity))
    for (let k = 0; k < words.length; k++) for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) {
      distances[i][j] = Math.min(distances[i][j], distances[i][k] + distances[k][j])
    }
    for (let i = 0; i < words.length; i++) for (let j = 0; j < words.length; j++) {
      if (!addDelete && words[i].length !== words[j].length) continue
      const result = solveLadder(words[i], words[j], dictionary, options)
      assert.equal(result.path ? result.path.length - 1 : Infinity, distances[i][j], JSON.stringify({ start: words[i], end: words[j], options }))
      if (!result.path) continue
      assert.equal(result.moves.length, result.path.length - 1)
      for (let step = 1; step < result.path.length; step++) {
        assert.ok(dictionary.has(result.path[step]))
        assert.ok(permitted(result.path[step - 1], result.path[step], options))
        assert.ok(result.moves[step - 1].positions.every(position => position >= 0 && position < result.path[step].length))
      }
    }
  }
})
