import { solveLadder } from './ladder'
import type { LadderResult } from './ladder'

export type LadderRequest = { start: string; end: string; words: string[] }
export type LadderResponse = { type: 'result'; result: LadderResult } | { type: 'error'; message: string }

self.onmessage = (event: MessageEvent<LadderRequest>) => {
  try {
    const { start, end, words } = event.data
    self.postMessage({ type: 'result', result: solveLadder(start, end, new Set(words)) } satisfies LadderResponse)
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Search failed. Please try again.' } satisfies LadderResponse)
  }
}
