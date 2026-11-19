export const FULL_ALPHABET = (1 << 26) - 1
export function letterMask(word: string): number {
  let mask = 0
  for (const letter of word) mask |= 1 << (letter.charCodeAt(0) - 65)
  return mask
}
export function missingLetterCount(mask: number): number {
  let missing = FULL_ALPHABET & ~mask, count = 0
  while (missing) { missing &= missing - 1; count++ }
  return count
}
export interface Move { row: number; position: number; from: string; to: string }
export interface Progress { depth: number; explored: number; discovered: number; elapsedMs: number; phase?: 'words' | 'combinations' | 'solutions'; cachedWordSearches?: number }
export interface Solution { moves: Move[]; words: string[] }
export type Result = Progress & (
  | { status: 'solved'; moves: Move[]; words: string[]; solutions: Solution[]; complete: boolean; reason?: string }
  | { status: 'impossible' | 'limited'; reason: string }
)
export interface SearchOptions {
  cache?: WordSearchCache
  maxSolutions?: number
  excludedWords?: readonly string[]
  maxStates?: number
  maxMs?: number
  onProgress?: (progress: Progress) => void
  now?: () => number
}
interface WordNode { word: string; mask: number; distance: number; parents: { index: number; position: number }[] }
export interface WordCacheSnapshot { version: 1; entries: [string, WordNode[]][] }

/** Bounded LRU of complete BFS graphs, scoped to exact dictionary contents. */
export class WordSearchCache {
  private dictionary = new Set<string>()
  private entries = new Map<string, { graph: WordNode[]; units: number }>()
  private units = 0
  private maxEntries: number
  private maxUnits: number

  constructor(maxEntries = 32, maxUnits = 500_000) {
    if (![maxEntries, maxUnits].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Cache limits must be positive whole numbers.')
    this.maxEntries = maxEntries
    this.maxUnits = maxUnits
  }

  bind(dictionary: Set<string>) {
    // Compare contents, not just object identity: callers may mutate a Set or
    // supply a fresh Set with identical words between searches.
    if (dictionary.size === this.dictionary.size && [...dictionary].every(word => this.dictionary.has(word))) return
    this.dictionary = new Set(dictionary)
    this.entries.clear()
    this.units = 0
  }

  snapshot(): WordCacheSnapshot {
    return { version: 1, entries: [...this.entries].map(([key, entry]) => [key, entry.graph]) }
  }

  restore(dictionary: Set<string>, snapshot: unknown): number {
    this.bind(dictionary)
    if (!snapshot || typeof snapshot !== 'object') return 0
    const data = snapshot as Partial<WordCacheSnapshot>
    if (data.version !== 1 || !Array.isArray(data.entries)) return 0
    let restored = 0
    // Stored data is optional: reject damaged entries instead of risking results.
    for (const entry of data.entries.slice(-this.maxEntries)) {
      try {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue
        const [key, graph] = entry
        const parsed: unknown = JSON.parse(key)
        if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') continue
        const [root, exclusionKey] = parsed
        const exclusions: unknown = JSON.parse(exclusionKey)
        if (!Array.isArray(exclusions) || !exclusions.every(word => typeof word === 'string' && word && word === word.trim().toUpperCase())) continue
        if (JSON.stringify([...new Set(exclusions)].sort()) !== exclusionKey) continue
        const excluded = new Set(exclusions)
        if (!Array.isArray(graph) || !graph.length || graph.length > this.maxUnits) continue
        const seen = new Set<string>()
        let units = graph.length
        const valid = graph.every((node, index) => {
          if (!node || typeof node !== 'object' || typeof node.word !== 'string' || !/^[A-Z]+$/.test(node.word) || !dictionary.has(node.word) || node.word.length !== root.length || seen.has(node.word)) return false
          seen.add(node.word)
          if (node.mask !== letterMask(node.word) || !Number.isSafeInteger(node.distance) || node.distance < 0 || !Array.isArray(node.parents)) return false
          units += node.parents.length
          if (units > this.maxUnits) return false
          if (!index) return node.word === root && node.distance === 0 && node.parents.length === 0
          if (excluded.has(node.word) || !node.parents.length || node.distance < graph[index - 1].distance) return false
          const parents = new Set<number>()
          return node.parents.every(edge => {
            if (!edge || !Number.isSafeInteger(edge.index) || edge.index < 0 || edge.index >= index || parents.has(edge.index) || !Number.isSafeInteger(edge.position) || edge.position < 0 || edge.position >= root.length) return false
            parents.add(edge.index)
            const previous = graph[edge.index]
            return previous.distance + 1 === node.distance && previous.word[edge.position] !== node.word[edge.position] && previous.word.slice(0, edge.position) === node.word.slice(0, edge.position) && previous.word.slice(edge.position + 1) === node.word.slice(edge.position + 1)
          })
        })
        if (valid) { this.put(key, graph); restored++ }
      } catch { /* Ignore malformed optional cache data. */ }
    }
    return restored
  }

  get(key: string): WordNode[] | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.graph
  }

  put(key: string, graph: WordNode[]) {
    // Count both graph nodes and predecessor edges, which can outnumber nodes.
    const units = graph.reduce((sum, node) => sum + 1 + node.parents.length, 0)
    if (units > this.maxUnits) return
    const previous = this.entries.get(key)
    if (previous) { this.units -= previous.units; this.entries.delete(key) }
    while (this.entries.size >= this.maxEntries || this.units + units > this.maxUnits) {
      const oldest = this.entries.keys().next().value!
      this.units -= this.entries.get(oldest)!.units
      this.entries.delete(oldest)
    }
    this.entries.set(key, { graph, units })
    this.units += units
  }
}
interface Group { mask: number; cost: number; endpoints: number[] }
interface Row { row: number; graph: WordNode[]; groups: Group[] }
interface Choice { previous: number; group: Group }
interface CoverageNode { mask: number; cost: number; choices: Choice[] }
class SearchLimit extends Error {}

/** Independent word BFS followed by exact minimum-cost alphabet-coverage DP. */
export function solve(start: string[], dictionary: Set<string>, options: SearchOptions = {}): Result {
  if (!start.length || start.some(word => !/^[A-Z]+$/.test(word) || !dictionary.has(word))) throw new Error('Enter at least one word, using only valid dictionary words.')
  const maxStates = options.maxStates ?? 250_000, maxMs = options.maxMs ?? 30_000, maxSolutions = options.maxSolutions ?? 10_000
  if ([maxStates, maxMs, maxSolutions].some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error('Search limits must be positive whole numbers within the supported numeric range.')
  const now = options.now ?? (() => performance.now())
  const began = now()
  let lastReport = began, discovered = 0, explored = 0, depth = 0, cachedWordSearches = 0
  let phase: Progress['phase'] = 'words'
  const stats = (): Progress => ({ depth, explored, discovered, elapsedMs: now() - began, phase, cachedWordSearches })
  const check = () => {
    const time = now()
    if (time - began >= maxMs) throw new SearchLimit('Time limit reached. The search is incomplete.')
    if (time - lastReport >= 150) { options.onProgress?.(stats()); lastReport = time }
  }
  const reserve = (count = 1) => {
    if (discovered + count > maxStates) throw new SearchLimit('State limit reached. The search is incomplete.')
    discovered += count
  }
  const impossible = (reason: string): Result => ({ ...stats(), status: 'impossible', reason })
  if (start.reduce((mask, word) => mask | letterMask(word), 0) === FULL_ALPHABET) {
    const solution = { words: [...start], moves: [] }
    return { ...stats(), status: 'solved', ...solution, solutions: [solution], complete: true }
  }
  if (start.join('').length < 26) return impossible('Fewer than 26 letter positions cannot cover the alphabet.')
  const excluded = new Set((options.excludedWords ?? []).map(word => word.trim().toUpperCase()).filter(Boolean))
  const exclusionKey = JSON.stringify([...excluded].sort())
  // Both caches are scoped to this dictionary and exclusion set; repeated rows share work.
  const graphCache = new Map<string, WordNode[]>()
  const neighborCache = new Map<string, { word: string; position: number }[]>()
  const neighbors = (word: string) => {
    const cached = neighborCache.get(word)
    if (cached) return cached
    const found: { word: string; position: number }[] = []
    for (let position = 0; position < word.length; position++) {
      check()
      for (let code = 65; code <= 90; code++) {
        const letter = String.fromCharCode(code)
        if (letter === word[position]) continue
        const candidate = word.slice(0, position) + letter + word.slice(position + 1)
        if (dictionary.has(candidate) && !excluded.has(candidate)) found.push({ word: candidate, position })
      }
    }
    neighborCache.set(word, found)
    return found
  }
  const rows: Row[] = []
  const layers: Map<number, CoverageNode>[] = []
  let optimum: number | undefined
  const solutions: Solution[] = []
  try {
    options.cache?.bind(dictionary)
    for (let row = 0; row < start.length; row++) {
      check()
      let graph = graphCache.get(start[row])
      const cacheKey = JSON.stringify([start[row], exclusionKey])
      if (!graph) {
        graph = options.cache?.get(cacheKey)
        if (graph) {
          // Cached graphs still occupy search state space; limits are independent
          // of whether this is a cold or warm search.
          reserve(graph.length)
          cachedWordSearches++
          graphCache.set(start[row], graph)
        }
      }
      if (!graph) {
        reserve()
        graph = [{ word: start[row], mask: letterMask(start[row]), distance: 0, parents: [] }]
        const indices = new Map([[start[row], 0]])
        for (let head = 0; head < graph.length; head++) {
          check(); explored++; depth = graph[head].distance
          for (const neighbor of neighbors(graph[head].word)) {
            const distance = graph[head].distance + 1
            const index = indices.get(neighbor.word)
            if (index === undefined) {
              reserve()
              indices.set(neighbor.word, graph.length)
              graph.push({ word: neighbor.word, mask: letterMask(neighbor.word), distance, parents: [{ index: head, position: neighbor.position }] })
            } else if (graph[index].distance === distance) graph[index].parents.push({ index: head, position: neighbor.position })
          }
        }
        graphCache.set(start[row], graph)
        // Never publish a partially explored graph to the cross-search cache.
        options.cache?.put(cacheKey, graph)
      }
      rows.push({ row, graph, groups: [] })
    }
    let reachable = 0, guaranteed = 0
    for (const { graph } of rows) {
      let common = FULL_ALPHABET
      for (const node of graph) { check(); reachable |= node.mask; common &= node.mask }
      guaranteed |= common
    }
    if (reachable !== FULL_ALPHABET) return impossible('Some letters cannot be reached from any starting word with these exclusions.')
    const target = FULL_ALPHABET & ~guaranteed
    for (const row of rows) {
      const groups = new Map<number, Group>()
      row.graph.forEach((node, index) => {
        check()
        const mask = node.mask & target, existing = groups.get(mask)
        // A more expensive endpoint with identical coverage cannot be globally optimal.
        if (!existing || node.distance < existing.cost) groups.set(mask, { mask, cost: node.distance, endpoints: [index] })
        else if (node.distance === existing.cost) existing.endpoints.push(index)
      })
      row.groups = [...groups.values()].sort((a, b) => a.cost - b.cost)
    }
    rows.sort((a, b) => a.groups.length - b.groups.length || a.row - b.row)
    const suffixUnion = new Array<number>(rows.length + 1).fill(0)
    const suffixStart = new Array<number>(rows.length + 1).fill(0)
    for (let i = rows.length - 1; i >= 0; i--) {
      suffixUnion[i] = suffixUnion[i + 1] | rows[i].groups.reduce((mask, group) => mask | group.mask, 0)
      suffixStart[i] = suffixStart[i + 1] | (rows[i].graph[0].mask & target)
    }
    phase = 'combinations'; depth = 0
    reserve()
    layers.push(new Map([[0, { mask: 0, cost: 0, choices: [] }]]))
    let upperBound = Infinity
    for (let i = 0; i < rows.length; i++) {
      const next = new Map<number, CoverageNode>()
      for (const previous of layers[i].values()) {
        explored++; depth = i; check()
        for (const group of rows[i].groups) {
          check()
          const cost = previous.cost + group.cost
          if (cost > upperBound) break
          const mask = previous.mask | group.mask
          if ((mask | suffixUnion[i + 1]) !== target) continue
          // Keeping all remaining rows unchanged is a concrete feasible completion.
          if ((mask | suffixStart[i + 1]) === target) upperBound = Math.min(upperBound, cost)
          const existing = next.get(mask)
          const choice = { previous: previous.mask, group }
          if (!existing) { reserve(); next.set(mask, { mask, cost, choices: [choice] }) }
          else if (cost < existing.cost) { existing.cost = cost; existing.choices = [choice] }
          else if (cost === existing.cost) existing.choices.push(choice)
        }
      }
      layers.push(next)
      if (!next.size) return impossible('No combination of reachable words covers all 26 letters with these exclusions.')
    }
    const final = layers[rows.length].get(target)
    if (!final) return impossible('No combination of reachable words covers all 26 letters with these exclusions.')
    optimum = final.cost; depth = optimum; phase = 'solutions'

    const makeSolution = (endpoints: number[]): Solution => {
      const words = [...start], moves: Move[] = []
      rows.forEach((row, i) => {
        words[row.row] = row.graph[endpoints[i]].word
        const reverse: Move[] = []
        for (let at = endpoints[i]; at !== 0;) {
          const edge = row.graph[at].parents[0]
          reverse.push({ row: row.row, position: edge.position, from: row.graph[edge.index].word, to: row.graph[at].word })
          at = edge.index
        }
        moves.push(...reverse.reverse())
      })
      // Stable display order; mutations in different rows are independent.
      moves.sort((a, b) => a.row - b.row)
      return { words, moves }
    }
    const firstEndpoints: number[] = []
    let mask = target
    for (let i = rows.length; i > 0; i--) {
      const choice = layers[i].get(mask)!.choices[0]
      firstEndpoints[i - 1] = choice.group.endpoints[0]; mask = choice.previous
    }
    // Store a proven optimum before collection checks so a timeout retains an answer.
    const first = makeSolution(firstEndpoints)
    solutions.push(first)
    const firstKey = JSON.stringify(first.moves.map(move => [move.row, move.to]))

    function* paths(row: Row, endpoint: number): Generator<Move[]> {
      const stack = [{ index: endpoint, reverse: [] as Move[] }]
      while (stack.length) {
        check()
        const entry = stack.pop()!
        if (!entry.index) { yield entry.reverse.reverse(); continue }
        for (const edge of row.graph[entry.index].parents) stack.push({ index: edge.index, reverse: [...entry.reverse, { row: row.row, position: edge.position, from: row.graph[edge.index].word, to: row.graph[entry.index].word }] })
      }
    }
    function* combinations(layer: number, coverage: number, endpoints: number[]): Generator<number[]> {
      check()
      if (!layer) { yield endpoints; return }
      for (const choice of layers[layer].get(coverage)!.choices) {
        for (const endpoint of choice.group.endpoints) {
          const next = [...endpoints]; next[layer - 1] = endpoint
          yield* combinations(layer - 1, choice.previous, next)
        }
      }
    }
    function* walkthroughs(endpoints: number[], rowIndex = 0, moves: Move[] = []): Generator<Solution> {
      check()
      if (rowIndex === rows.length) {
        const words = [...start]
        rows.forEach((row, i) => { words[row.row] = row.graph[endpoints[i]].word })
        yield { words, moves: [...moves].sort((a, b) => a.row - b.row) }; return
      }
      for (const path of paths(rows[rowIndex], endpoints[rowIndex])) yield* walkthroughs(endpoints, rowIndex + 1, [...moves, ...path])
    }
    for (const endpoints of combinations(rows.length, target, [])) {
      for (const solution of walkthroughs(endpoints)) {
        if (JSON.stringify(solution.moves.map(move => [move.row, move.to])) === firstKey) continue
        if (solutions.length >= maxSolutions) throw new SearchLimit('Result limit reached while collecting optimal solutions.')
        solutions.push(solution)
      }
    }
    return { ...stats(), status: 'solved', ...solutions[0], solutions, complete: true }
  } catch (error) {
    if (!(error instanceof SearchLimit)) throw error
    if (optimum !== undefined && solutions.length) return { ...stats(), depth: optimum, status: 'solved', ...solutions[0], solutions, complete: false, reason: error.message }
    return { ...stats(), status: 'limited', reason: error.message }
  }
}
