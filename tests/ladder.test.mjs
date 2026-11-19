import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { explorationPaths, exploreLadder, solveLadder } from '../src/ladder.ts'

const differences = (a, b) => a.length === b.length ? [...a].filter((letter, i) => letter !== b[i]).length : Infinity

test('exploration retains every shortest route and excludes repeated words and longer detours', () => {
  const dictionary = new Set(['AAA', 'AAB', 'ABA', 'ABB', 'BBB', 'ZZZ'])
  const result = exploreLadder('AAA', dictionary, {}, 5)
  assert.deepEqual(result.levels, [['AAB', 'ABA'], ['ABB'], ['BBB'], [], []])
  assert.equal(result.nodes.ABB.pathCount, '2')
  assert.deepEqual(explorationPaths(result, 'BBB'), [['AAA', 'ABA', 'ABB', 'BBB'], ['AAA', 'AAB', 'ABB', 'BBB']])
  assert.ok(!result.nodes.ZZZ)
  assert.deepEqual(explorationPaths(result, 'ZZZ'), [])
  assert.deepEqual(exploreLadder('AAA', dictionary, {}, 1).levels, [['AAB', 'ABA']])
  for (const limit of [0, 6, 1.5, NaN]) assert.throws(() => exploreLadder('AAA', dictionary, {}, limit))
  assert.throws(() => exploreLadder('NOPE', dictionary))
})

test('all shortest paths can be paged without omission or duplication', () => {
  const words = Array.from({ length: 32 }, (_, n) => n.toString(2).padStart(5, '0').replaceAll('0', 'A').replaceAll('1', 'B'))
  const result = exploreLadder('AAAAA', new Set(words))
  assert.equal(result.nodes.BBBBB.pathCount, '120')
  const paths = []
  for (let offset = 0n; offset < 120n; offset += 25n) paths.push(...explorationPaths(result, 'BBBBB', offset))
  assert.equal(paths.length, 120)
  assert.equal(new Set(paths.map(path => path.join(','))).size, 120)
  for (const path of paths) {
    assert.equal(path.length, 6)
    assert.equal(new Set(path).size, 6)
    for (let i = 1; i < path.length; i++) assert.equal(differences(path[i - 1], path[i]), 1)
  }
  assert.deepEqual(explorationPaths(result, 'BBBBB', 120n), [])
})

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

test('exploration agrees with independent exhaustive shortest-path enumeration for every rule combination', () => {
  const words = ['A', 'AB', 'BA', 'AA', 'AAB', 'ABA', 'BAA', 'ABB', 'BAB', 'BBA', 'ABC', 'CAB', 'BCA', 'CBA', 'ZZZ']
  const dictionary = new Set(words)
  for (const addDelete of [false, true]) for (const rearrange of ['off', 'swap', 'permute']) for (const move of [false, true]) {
    const options = { addDelete, rearrange, move }
    const start = 'AAB'
    const result = exploreLadder(start, dictionary, options)
    // Build all shortest paths layer by layer with explicit path arrays.
    const expected = new Map([[start, [[start]]]])
    let frontier = [[start]]
    for (let depth = 1; depth <= 5; depth++) {
      const nextFrontier = []
      for (const path of frontier) for (const next of words) {
        if (path.includes(next) || !permitted(path.at(-1), next, options)) continue
        if (expected.has(next) && expected.get(next)[0].length < depth + 1) continue
        const nextPath = [...path, next]
        if (!expected.has(next)) expected.set(next, [])
        expected.get(next).push(nextPath)
        nextFrontier.push(nextPath)
      }
      frontier = nextFrontier
    }
    assert.deepEqual(new Set(Object.keys(result.nodes)), new Set(expected.keys()))
    for (const [word, paths] of expected) {
      assert.equal(result.nodes[word].pathCount, String(paths.length))
      assert.deepEqual(new Set(explorationPaths(result, word, 0n, paths.length).map(path => path.join(','))), new Set(paths.map(path => path.join(','))))
    }
  }
})

test('BLACK exploration contains every dictionary neighbor, SLACK at one step, and SLICK at two', () => {
  const dictionary = new Set(readFileSync(new URL('../public/norvig-word-list.txt', import.meta.url), 'utf8').split(/\r?\n/).map(word => word.trim().toUpperCase()).filter(Boolean))
  const result = exploreLadder('BLACK', dictionary)
  const immediate = [...dictionary].filter(word => differences('BLACK', word) === 1).sort()
  assert.deepEqual(result.levels[0], immediate)
  assert.ok(result.levels[0].includes('SLACK'))
  assert.ok(result.levels[1].includes('SLICK'))
  const second = new Set(immediate.flatMap(word => [...dictionary].filter(next => differences(word, next) === 1 && next !== 'BLACK' && !immediate.includes(next))))
  assert.deepEqual(new Set(result.levels[1]), second)
  assert.ok(explorationPaths(result, 'SLICK', 0n, 100).some(path => path.join(',') === 'BLACK,SLACK,SLICK'))
})
