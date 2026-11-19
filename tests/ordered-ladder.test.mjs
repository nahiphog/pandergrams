import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solveOrderedLadder } from '../src/ladder.ts'

function verify(waypoints, dictionary, result, steps) {
  assert.ok(result.path)
  assert.equal(result.path.length - 1, steps)
  assert.equal(result.moves.length, steps)
  assert.equal(new Set(result.path).size, result.path.length)
  assert.deepEqual(result.path.filter(word => waypoints.includes(word)), waypoints)
  assert.equal(result.path[0], waypoints[0])
  assert.equal(result.path.at(-1), waypoints.at(-1))
  assert.ok(result.path.every(word => dictionary.has(word)))
}

test('ordered search backtracks across segments instead of committing to a greedy first path', () => {
  const dictionary = new Set(['AAA', 'AAB', 'ABB', 'BBB', 'ABA', 'BBA', 'AAC'])
  const waypoints = ['AAA', 'BBB', 'AAC']
  const result = solveOrderedLadder(waypoints, dictionary)
  verify(waypoints, dictionary, result, 6)
  assert.deepEqual(result.path, ['AAA', 'ABA', 'BBA', 'BBB', 'ABB', 'AAB', 'AAC'])
})

test('later waypoints cannot be used early and previously used intermediates cannot repeat', () => {
  const dictionary = new Set(['AAA', 'AAB', 'ABB'])
  assert.equal(solveOrderedLadder(['AAA', 'ABB', 'AAB'], dictionary).path, null)
  const star = new Set(['AAA', 'BAA', 'ABA', 'AAB'])
  const result = solveOrderedLadder(['BAA', 'ABA', 'AAB'], star)
  assert.equal(result.path, null)
  assert.ok(!result.limited)
})

test('validates requested words and limits', () => {
  const dictionary = new Set(['AAA', 'AAB', 'ABB', 'AB'])
  for (const words of [[], ['AAA', 'AAB'], ['AAA', 'AAA', 'ABB'], ['AAA', 'bad', 'ABB'], ['AAA', 'MISSING', 'ABB'], ['AAA', 'AB', 'ABB']]) {
    assert.throws(() => solveOrderedLadder(words, dictionary))
  }
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => solveOrderedLadder(['AAA', 'AAB', 'ABB'], dictionary, {}, { maxStates: value }))
    assert.throws(() => solveOrderedLadder(['AAA', 'AAB', 'ABB'], dictionary, {}, { maxMs: value }))
  }
})

test('limits report an inconclusive search and larger limits allow completion', () => {
  const dictionary = new Set(['AAA', 'AAB', 'ABB'])
  const words = ['AAA', 'AAB', 'ABB']
  assert.equal(solveOrderedLadder(words, dictionary, {}, { maxStates: 1 }).limited, true)
  let tick = 0
  assert.equal(solveOrderedLadder(words, dictionary, {}, { maxMs: 1, now: () => tick++ }).limited, true)
  verify(words, dictionary, solveOrderedLadder(words, dictionary), 2)
})

test('each optional move rule works across ordered waypoints', () => {
  for (const [words, options] of [
    [['AT', 'CAT', 'CATS'], { addDelete: true }],
    [['CAT', 'ACT', 'TCA'], { rearrange: 'swap' }],
    [['EAST', 'SEAT', 'EATS'], { move: true }],
    [['ABCD', 'DCBA', 'BADC'], { rearrange: 'permute' }],
  ]) {
    const dictionary = new Set(words)
    verify(words, dictionary, solveOrderedLadder(words, dictionary, options), 2)
  }
})

test('agrees with exhaustive simple-path enumeration on seeded small graphs', () => {
  let seed = 782
  const candidates = ['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB']
  for (let sample = 0; sample < 60; sample++) {
    const waypoints = ['AAA', 'BBB', 'ABA']
    const dictionary = new Set([...waypoints, ...candidates.filter(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 < .65 })])
    let best = Infinity
    function visit(path, target) {
      if (target === waypoints.length) { best = Math.min(best, path.length - 1); return }
      for (const word of dictionary) {
        if (path.includes(word) || [...word].filter((letter, i) => letter !== path.at(-1)[i]).length !== 1) continue
        const index = waypoints.indexOf(word)
        if (index !== -1 && index !== target) continue
        visit([...path, word], target + (index === target ? 1 : 0))
      }
    }
    visit([waypoints[0]], 1)
    const result = solveOrderedLadder(waypoints, dictionary)
    if (Number.isFinite(best)) verify(waypoints, dictionary, result, best)
    else { assert.equal(result.path, null); assert.ok(!result.limited) }
  }
})

test('bundled word list supports the ordered example', () => {
  const dictionary = new Set(readFileSync(new URL('../public/norvig-word-list.txt', import.meta.url), 'utf8').split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean))
  const words = ['COLD', 'CORD', 'CARD', 'WARD', 'WARM']
  verify(words, dictionary, solveOrderedLadder(words, dictionary), 4)
})
