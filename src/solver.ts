export const FULL_ALPHABET = (1 << 26) - 1

export function letterMask(word: string): number {
  let mask = 0
  for (const letter of word) mask |= 1 << (letter.charCodeAt(0) - 65)
  return mask
}

/** Each substitution can introduce at most one missing letter. */
export function missingLetterCount(mask: number): number {
  let missing = FULL_ALPHABET & ~mask
  let count = 0
  while (missing) {
    missing &= missing - 1
    count++
  }
  return count
}

/** Binary min-heap of immutable search-node indices. */
class Frontier {
  private heap: number[] = []
  private before: (a: number, b: number) => boolean

  constructor(before: (a: number, b: number) => boolean) { this.before = before }
  get size() { return this.heap.length }

  push(index: number) {
    this.heap.push(index)
    let child = this.heap.length - 1
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (!this.before(this.heap[child], this.heap[parent])) break
      ;[this.heap[child], this.heap[parent]] = [this.heap[parent], this.heap[child]]
      child = parent
    }
  }

  pop(): number {
    const first = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length) {
      this.heap[0] = last
      let parent = 0
      while (parent * 2 + 1 < this.heap.length) {
        let child = parent * 2 + 1
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child])) child++
        if (!this.before(this.heap[child], this.heap[parent])) break
        ;[this.heap[child], this.heap[parent]] = [this.heap[parent], this.heap[child]]
        parent = child
      }
    }
    return first
  }
}

export interface Move { row: number; position: number; from: string; to: string }
export interface Progress { depth: number; explored: number; discovered: number; elapsedMs: number }
export type Result = Progress & (
  | { status: 'solved'; moves: Move[]; words: string[] }
  | { status: 'impossible' | 'limited'; reason: string }
)
export interface SearchOptions {
  excludedWords?: readonly string[]
  maxStates?: number
  maxMs?: number
  onProgress?: (progress: Progress) => void
  // Injectable clock makes limit behavior deterministic in tests.
  now?: () => number
}

/** Exact A* over complete word banks, with f = moves so far + missing letters. */
export function solve(start: string[], dictionary: Set<string>, options: SearchOptions = {}): Result {
  if (!start.length || start.some((word) => !/^[A-Z]+$/.test(word) || !dictionary.has(word))) {
    throw new Error('Enter at least one word, using only valid dictionary words.')
  }
  const maxStates = options.maxStates ?? 250_000
  // Exclusions apply only to mutation destinations, never invalidate the input bank.
  const excluded = new Set((options.excludedWords ?? []).map((word) => word.trim().toUpperCase()).filter(Boolean))
  const maxMs = options.maxMs ?? 30_000
  const now = options.now ?? (() => performance.now())
  const began = now()
  let lastReport = began
  let explored = 0
  let depth = 0
  const masks = new Map<string, number>()
  const maskOf = (word: string) => {
    if (!masks.has(word)) masks.set(word, letterMask(word))
    return masks.get(word)!
  }
  const coverage = (words: string[]) => words.reduce((mask, word) => mask | maskOf(word), 0)
  interface Node { words: string[]; key: string; parent: number; move?: Move; depth: number; missing: number }
  const startKey = start.join('|')
  const nodes: Node[] = [{ words: [...start], key: startKey, parent: -1, depth: 0, missing: missingLetterCount(coverage(start)) }]
  // Keep row order: the same word in a different bank is a different state.
  // A previously discovered state can be reached more cheaply: keep its best g.
  const bestCost = new Map([[startKey, 0]])
  const frontier = new Frontier((a, b) => {
    const left = nodes[a], right = nodes[b]
    const difference = left.depth + left.missing - right.depth - right.missing
    // Break f ties toward fewer missing letters, then stable insertion order.
    return difference < 0 || (difference === 0 && (left.missing < right.missing || (left.missing === right.missing && a < b)))
  })
  frontier.push(0)
  const stats = (): Progress => ({ depth, explored, discovered: bestCost.size, elapsedMs: now() - began })
  const solved = (index: number): Result => {
    const moves: Move[] = []
    for (let cursor = index; nodes[cursor].parent !== -1; cursor = nodes[cursor].parent) {
      moves.push(nodes[cursor].move!)
    }
    return { ...stats(), depth: nodes[index].depth, status: 'solved', moves: moves.reverse(), words: nodes[index].words }
  }
  if (coverage(start) === FULL_ALPHABET) return solved(0)
  if (start.join('').length < 26) return { ...stats(), status: 'impossible', reason: 'Fewer than 26 letter positions cannot cover the alphabet.' }

  const neighborCache = new Map<string, { word: string; position: number }[]>()
  const neighbors = (word: string) => {
    const cached = neighborCache.get(word)
    if (cached) return cached
    const result: { word: string; position: number }[] = []
    for (let position = 0; position < word.length; position++) {
      for (let code = 65; code <= 90; code++) {
        const letter = String.fromCharCode(code)
        if (letter === word[position]) continue
        const candidate = word.slice(0, position) + letter + word.slice(position + 1)
        if (dictionary.has(candidate) && !excluded.has(candidate)) result.push({ word: candidate, position })
      }
    }
    neighborCache.set(word, result)
    return result
  }

  while (frontier.size) {
    const head = frontier.pop()
    const node = nodes[head]
    // Superseded heap entries remain immutable so parent paths stay valid.
    if (node.depth !== bestCost.get(node.key)) continue
    depth = node.depth
    explored++
    // A goal is optimal only when removed from the minimum-f frontier.
    if (node.missing === 0) return solved(head)
    for (let row = 0; row < node.words.length; row++) {
      const currentTime = now()
      if (currentTime - began >= maxMs) return { ...stats(), status: 'limited', reason: 'Time limit reached. The search is incomplete; a solution may still exist.' }
      if (currentTime - lastReport >= 150) {
        options.onProgress?.(stats())
        lastReport = currentTime
      }
      for (const neighbor of neighbors(node.words[row])) {
        const words = node.words.slice()
        words[row] = neighbor.word
        const key = words.join('|')
        const nextDepth = node.depth + 1
        const previousCost = bestCost.get(key)
        if (previousCost !== undefined && previousCost <= nextDepth) continue
        if (previousCost === undefined && bestCost.size >= maxStates) return { ...stats(), status: 'limited', reason: 'State limit reached. The search is incomplete; a solution may still exist.' }
        bestCost.set(key, nextDepth)
        nodes.push({ words, key, parent: head, depth: nextDepth, missing: missingLetterCount(coverage(words)), move: { row, position: neighbor.position, from: node.words[row], to: neighbor.word } })
        frontier.push(nodes.length - 1)
      }
    }
  }
  return { ...stats(), status: 'impossible', reason: 'All reachable word banks were checked. No solution exists for these starting words and exclusions.' }
}
