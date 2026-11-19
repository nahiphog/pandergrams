export type LadderOptions = {
  addDelete?: boolean
  rearrange?: 'off' | 'swap' | 'permute'
  move?: boolean
}
export type LadderMove = { description: string; positions: number[] }
export type LadderResult = { path: string[] | null; moves: LadderMove[]; explored: number }

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const signature = (word: string) => [...word].sort().join('')

export type ExplorationNode = { depth: number; parents: string[]; pathCount: string }
export type ExplorationResult = {
  start: string
  levels: string[][]
  nodes: Record<string, ExplorationNode>
  explored: number
}

/** Retain every equal-distance predecessor, compactly representing ALL shortest paths. */
export function exploreLadder(start: string, dictionary: ReadonlySet<string>, options: LadderOptions = {}, maxSteps = 5): ExplorationResult {
  if (!/^[A-Z]+$/.test(start) || !dictionary.has(start)) throw new Error('Enter a starting word in the dictionary.')
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 5) throw new Error('Choose a step limit from 1 to 5.')
  const neighbors = createNeighbors(dictionary, options, start.length, false)
  const nodes: Record<string, ExplorationNode> = { [start]: { depth: 0, parents: [], pathCount: '1' } }
  const levels: string[][] = Array.from({ length: maxSteps }, () => [])
  const queue = [start]
  let explored = 0
  for (let head = 0; head < queue.length; head++) {
    const word = queue[head]
    const node = nodes[word]
    if (node.depth === maxSteps) continue
    explored++
    // Different enabled operations can produce the same edge; count it only once.
    const seen = new Set<string>()
    for (const [next] of neighbors(word)) {
      if (!next || !dictionary.has(next) || seen.has(next)) continue
      seen.add(next)
      const depth = node.depth + 1
      if (!nodes[next]) {
        nodes[next] = { depth, parents: [], pathCount: '0' }
        levels[depth - 1].push(next)
        queue.push(next)
      }
      if (nodes[next].depth === depth) {
        nodes[next].parents.push(word)
        nodes[next].pathCount = (BigInt(nodes[next].pathCount) + BigInt(node.pathCount)).toString()
      }
    }
  }
  for (const level of levels) level.sort()
  return { start, levels, nodes, explored }
}

/** Page through paths without enumerating or discarding earlier pages. */
export function explorationPaths(result: ExplorationResult, word: string, offset = 0n, limit = 25): string[][] {
  if (!result.nodes[word] || offset < 0n || !Number.isInteger(limit) || limit < 1) return []
  const paths: string[][] = []
  function visit(current: string, suffix: string[]) {
    if (paths.length >= limit) return
    if (current === result.start) {
      if (offset > 0n) offset--
      else paths.push([current, ...suffix])
      return
    }
    for (const parent of result.nodes[current].parents) {
      const count = BigInt(result.nodes[parent].pathCount)
      if (offset >= count) offset -= count
      else visit(parent, [current, ...suffix])
      if (paths.length >= limit) return
    }
  }
  visit(word, [])
  return paths
}

/** Every enabled operation costs one step; FIFO BFS guarantees a shortest path. */
export function solveLadder(start: string, end: string, dictionary: ReadonlySet<string>, options: LadderOptions = {}): LadderResult {
  for (const word of [start, end]) {
    if (!/^[A-Z]+$/.test(word) || !dictionary.has(word)) {
      throw new Error('Both words must contain only A–Z and appear in the dictionary.')
    }
  }
  if (!options.addDelete && start.length !== end.length) throw new Error('Both words must have the same number of letters unless adding/deleting is enabled.')
  if (start === end) return { path: [start], moves: [], explored: 0 }

  const neighbors = createNeighbors(dictionary, options, start.length)

  const parents = new Map<string, { word: string; move: LadderMove } | null>([[start, null]])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const word = queue[head]
    for (const [next, move] of neighbors(word)) {
      if (!next || !dictionary.has(next) || parents.has(next)) continue
      parents.set(next, { word, move })
      if (next === end) {
        const path = [end]
        const moves: LadderMove[] = []
        let parent = parents.get(end)!
        while (parent) {
          path.push(parent.word)
          moves.push(parent.move)
          parent = parents.get(parent.word)!
        }
        return { path: path.reverse(), moves: moves.reverse(), explored: head + 1 }
      }
      queue.push(next)
    }
  }
  return { path: null, moves: [], explored: queue.length }
}

function createNeighbors(dictionary: ReadonlySet<string>, options: LadderOptions, startLength: number, consumeAnagrams = true) {
  // Index dictionary anagrams instead of generating factorially many permutations.
  const anagrams = new Map<string, string[]>()
  if (options.rearrange === 'permute') {
    for (const word of dictionary) {
      if (!/^[A-Z]+$/.test(word) || (!options.addDelete && word.length !== startLength)) continue
      const key = signature(word)
      const group = anagrams.get(key)
      if (group) group.push(word)
      else anagrams.set(key, [word])
    }
  }

  function* neighbors(word: string): Generator<[string, LadderMove]> {
    for (let position = 0; position < word.length; position++) {
      const prefix = word.slice(0, position)
      const suffix = word.slice(position + 1)
      for (const letter of alphabet) {
        if (letter !== word[position]) yield [prefix + letter + suffix, { description: `Replace ${word[position]} with ${letter} at position ${position + 1}`, positions: [position] }]
      }
      if (options.addDelete) yield [prefix + suffix, { description: `Delete ${word[position]} at position ${position + 1}`, positions: [] }]
    }
    if (options.addDelete) {
      for (let position = 0; position <= word.length; position++) {
        for (const letter of alphabet) yield [word.slice(0, position) + letter + word.slice(position), { description: `Add ${letter} at position ${position + 1}`, positions: [position] }]
      }
    }
    if (options.rearrange === 'swap') {
      for (let first = 0; first < word.length; first++) for (let second = first + 1; second < word.length; second++) {
        if (word[first] === word[second]) continue
        const letters = [...word]
        ;[letters[first], letters[second]] = [letters[second], letters[first]]
        yield [letters.join(''), { description: `Swap positions ${first + 1} and ${second + 1}`, positions: [first, second] }]
      }
    }
    if (options.move) {
      for (let from = 0; from < word.length; from++) for (let to = 0; to < word.length; to++) {
        if (from === to) continue
        const remaining = word.slice(0, from) + word.slice(from + 1)
        yield [remaining.slice(0, to) + word[from] + remaining.slice(to), { description: `Move ${word[from]} from position ${from + 1} to position ${to + 1}`, positions: [to] }]
      }
    }
    if (options.rearrange === 'permute') {
      const key = signature(word)
      for (const next of anagrams.get(key) ?? []) {
        yield [next, { description: 'Rearrange the letters', positions: [...next].flatMap((letter, i) => letter !== word[i] ? [i] : []) }]
      }
      // First expansion reaches the entire anagram group at minimum distance.
      if (consumeAnagrams) anagrams.delete(key)
    }
  }

  return neighbors
}
