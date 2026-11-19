export type LadderResult = { path: string[] | null; explored: number }

/** FIFO breadth-first search visits words in increasing distance from start. */
export function solveLadder(start: string, end: string, dictionary: ReadonlySet<string>): LadderResult {
  for (const word of [start, end]) {
    if (!/^[A-Z]+$/.test(word) || !dictionary.has(word)) {
      throw new Error('Both words must contain only A–Z and appear in the dictionary.')
    }
  }
  if (start.length !== end.length) throw new Error('Both words must have the same number of letters.')
  if (start === end) return { path: [start], explored: 0 }

  const parents = new Map<string, string | null>([[start, null]])
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const word = queue[head]
    for (let position = 0; position < word.length; position++) {
      const prefix = word.slice(0, position)
      const suffix = word.slice(position + 1)
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (letter === word[position]) continue
        const next = prefix + letter + suffix
        if (!dictionary.has(next) || parents.has(next)) continue
        parents.set(next, word)
        if (next === end) {
          const path: string[] = []
          for (let current: string | null = end; current !== null; current = parents.get(current)!) path.push(current)
          return { path: path.reverse(), explored: head + 1 }
        }
        queue.push(next)
      }
    }
  }
  return { path: null, explored: queue.length }
}
