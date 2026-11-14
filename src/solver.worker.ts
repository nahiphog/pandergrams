import { solve, type Progress, type Result } from './solver'

export type SearchRequest = { id: number; words: string[]; dictionary: string[]; excludedWords: string[]; maxStates: number; maxMs: number }
export type SearchResponse =
  | { id: number; type: 'progress'; progress: Progress }
  | { id: number; type: 'result'; result: Result }
  | { id: number; type: 'error'; message: string }

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { id, words, dictionary, excludedWords, maxStates, maxMs } = event.data
  const send = (message: SearchResponse) => self.postMessage(message)
  try {
    const result = solve(words, new Set(dictionary), {
      excludedWords,
      maxStates,
      maxMs,
      onProgress: (progress) => send({ id, type: 'progress', progress }),
    })
    send({ id, type: 'result', result })
  } catch (error) {
    send({ id, type: 'error', message: error instanceof Error ? error.message : 'Search failed.' })
  }
}
