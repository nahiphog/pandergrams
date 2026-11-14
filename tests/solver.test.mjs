import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { solve, letterMask, FULL_ALPHABET, missingLetterCount } from '../src/solver.ts'

const filler = 'DEFGHIJKLMNOPQRSTUVWXYZ'
const dict = (...words) => new Set([filler, ...words])
function verify(start, dictionary, expectedMoves) {
  const result = solve(start, dictionary)
  assert.equal(result.status, 'solved')
  assert.equal(result.moves.length, expectedMoves)
  const bank = [...start]
  for (const move of result.moves) {
    assert.equal(bank[move.row], move.from)
    assert.ok(dictionary.has(move.to))
    assert.equal(move.from.length, move.to.length)
    assert.deepEqual([...move.from].flatMap((letter, i) => letter !== move.to[i] ? [i] : []), [move.position])
    bank[move.row] = move.to
  }
  assert.deepEqual(bank, result.words)
  assert.equal(bank.reduce((mask, word) => mask | letterMask(word), 0), FULL_ALPHABET)
  return result
}

test('already complete bank takes zero moves', () => verify(['ABC', filler], dict('ABC'), 0))
test('A* returns minimum path and valid reconstruction', () => verify(['AAA', filler], dict('AAA', 'ABA', 'ABC', 'ADA', 'ADB', 'ABB'), 2))
test('full bank tracking allows a word to occur in multiple surrounding banks', () => verify(['AAA', 'AAA', filler], dict('AAA', 'BAA', 'CAA'), 2))
test('same-position detour loses to the direct substitution', () => {
  const support = 'BCDEFGHIJMNOPQRTUVWXYZ'
  const result = verify(['BLACK', support], new Set(['BLACK', 'PLACK', 'SLACK', support]), 1)
  assert.equal(result.moves[0].to, 'SLACK')
})
test('temporary coverage loss is allowed', () => verify(['AAA', filler], dict('AAA', 'AAD', 'ADD', 'BDD', 'BCD', 'BCA'), 5))
test('cycles terminate with an exhaustive no-solution result', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'ABB', 'AAB'))
  assert.equal(result.status, 'impossible')
  assert.equal(result.discovered, 4)
})
test('fewer than 26 positions is impossible', () => assert.equal(solve(['AAA'], dict('AAA')).status, 'impossible'))
test('invalid inputs fail validation', () => {
  for (const words of [[], ['NOPE'], ['abc'], ['A-B'], ['']]) assert.throws(() => solve(words, dict('ABC')))
})
test('state limits do not claim impossibility', () => {
  const result = solve(['AAA', filler], dict('AAA', 'ABA', 'ABC'), { maxStates: 1 })
  assert.equal(result.status, 'limited')
  assert.equal(result.discovered, 1)
})
test('time limits do not claim impossibility', () => {
  let tick = 0
  assert.equal(solve(['AAA', filler], dict('AAA', 'ABA'), { maxMs: 1, now: () => tick++ }).status, 'limited')
})
test('progress reports include complete state counts', () => {
  let tick = 0
  const progress = []
  solve(['AAA', filler], dict('AAA', 'ABA', 'ABC'), { now: () => tick += 160, onProgress: (value) => progress.push(value) })
  assert.ok(progress.length)
  assert.ok(progress.every((value) => value.discovered >= value.explored))
})
test('bundled dictionary supports a real one-move pangram solution', () => {
  const dictionary = new Set(readFileSync(new URL('../public/norvig-word-list.txt', import.meta.url), 'utf8').split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean))
  verify(['THE', 'QUICK', 'BROWN', 'FOX', 'JUMPS', 'OVER', 'THE', 'HAZY', 'DOG'], dictionary, 1)
})


// Deliberately simple independent FIFO oracle: no heap, heuristic, or neighbor cache.
function bfsDistance(start, dictionary) {
  const queue = [[start, 0]]
  const seen = new Set([start.join('|')])
  for (let head = 0; head < queue.length; head++) {
    const [bank, distance] = queue[head]
    if (new Set(bank.join('')).size === 26) return distance
    for (let row = 0; row < bank.length; row++) {
      for (const candidate of dictionary) {
        if (candidate.length !== bank[row].length) continue
        if ([...candidate].filter((letter, i) => letter !== bank[row][i]).length !== 1) continue
        const next = [...bank]
        next[row] = candidate
        const key = next.join('|')
        if (!seen.has(key)) {
          seen.add(key)
          queue.push([next, distance + 1])
        }
      }
    }
  }
  return null
}

test('missing-letter heuristic counts distinct uncovered letters', () => {
  assert.equal(missingLetterCount(0), 26)
  assert.equal(missingLetterCount(FULL_ALPHABET), 0)
  assert.equal(missingLetterCount(letterMask('AAAABC')), 23)
})

test('A* agrees with independent exhaustive BFS on 100 seeded word graphs', () => {
  let seed = 74129
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const candidates = []
  for (const a of 'ABCDE') for (const b of 'ABCDE') for (const c of 'ABCDE') candidates.push(a + b + c)
  const support = 'EFGHIJKLMNOPQRSTUVWXYZ'
  let solved = 0, impossible = 0
  for (let sample = 0; sample < 100; sample++) {
    const selected = candidates.filter(() => random() < 0.18)
    const dictionary = new Set([support, ...selected, 'AAA', 'EEE'])
    const start = ['AAA', 'EEE', support]
    const expected = bfsDistance(start, dictionary)
    if (expected === null) {
      assert.equal(solve(start, dictionary).status, 'impossible', `sample ${sample}`)
      impossible++
    } else {
      verify(start, dictionary, expected)
      solved++
    }
  }
  assert.ok(solved > 0 && impossible > 0)
})
