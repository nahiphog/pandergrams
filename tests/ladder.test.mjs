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
