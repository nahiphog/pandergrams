import { solve, WordSearchCache, type Progress, type Result } from './solver'
import { loadWordCache, saveWordCache } from './cache-storage'

export type SearchRequest = { id: number; words: string[]; dictionary?: string[]; excludedWords: string[]; maxStates: number; maxMs: number }
export type SearchResponse =
  | { id: number; type: 'progress'; progress: Progress }
  | { id: number; type: 'cache-status'; message: string }
  | { id: number; type: 'result'; result: Result }
  | { id: number; type: 'error'; message: string }

const cache = new WordSearchCache()
let loadedDictionary: Set<string> | undefined
let fingerprint: string | null = null

async function search(request: SearchRequest) {
  const { id, words, dictionary, excludedWords, maxStates, maxMs } = request
  const send = (message: SearchResponse) => self.postMessage(message)
  try {
    if (dictionary) {
      loadedDictionary = new Set(dictionary)
      cache.bind(loadedDictionary)
      send({ id, type: 'cache-status', message: 'Restoring saved word searches…' })
      const stored = await loadWordCache(loadedDictionary)
      fingerprint = stored.fingerprint
      cache.restore(loadedDictionary, stored.snapshot)
    }
    if (!loadedDictionary) throw new Error('Load the dictionary before starting a search.')
    send({ id, type: 'cache-status', message: 'Matching completed word searches are reused automatically.' })
    const result = solve(words, loadedDictionary, {
      cache,
      excludedWords,
      maxStates,
      maxMs,
      onProgress: (progress) => send({ id, type: 'progress', progress }),
    })
    send({ id, type: 'cache-status', message: 'Saving completed word searches…' })
    // Commit before publishing the result: a refresh after completion can reuse it.
    const saved = await saveWordCache(fingerprint, cache.snapshot())
    send({ id, type: 'cache-status', message: saved ? 'Completed word searches are saved in this browser for reuse after refresh.' : 'Browser storage is unavailable. Cached word searches are available until this page closes.' })
    send({ id, type: 'result', result })
  } catch (error) {
    send({ id, type: 'error', message: error instanceof Error ? error.message : 'Search failed.' })
  }
}

// Async storage must not let overlapping messages mix dictionary/cache contexts.
let pending = Promise.resolve()
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  pending = pending.then(() => search(event.data))
}
