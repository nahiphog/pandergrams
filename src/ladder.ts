export type LadderOptions = {
  addDelete?: boolean
  rearrange?: 'off' | 'swap' | 'permute'
  move?: boolean
}
export type LadderMove = { description: string; positions: number[] }
export type LadderResult = { path: string[] | null; moves: LadderMove[]; explored: number }

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const signature = (word: string) => [...word].sort().join('')

/** Every enabled operation costs one step; FIFO BFS guarantees a shortest path. */
export function solveLadder(start: string, end: string, dictionary: ReadonlySet<string>, options: LadderOptions = {}): LadderResult {
  for (const word of [start, end]) {
    if (!/^[A-Z]+$/.test(word) || !dictionary.has(word)) {
      throw new Error('Both words must contain only A–Z and appear in the dictionary.')
    }
  }
  if (!options.addDelete && start.length !== end.length) throw new Error('Both words must have the same number of letters unless adding/deleting is enabled.')
  if (start === end) return { path: [start], moves: [], explored: 0 }

  // Index dictionary anagrams instead of generating factorially many permutations.
  const anagrams = new Map<string, string[]>()
  if (options.rearrange === 'permute') {
    for (const word of dictionary) {
      if (!/^[A-Z]+$/.test(word) || (!options.addDelete && word.length !== start.length)) continue
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
      anagrams.delete(key)
    }
  }

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
