import { exploreLadder, solveLadder, solveOrderedLadder } from './ladder'
import type { ExplorationResult, LadderOptions, LadderResult } from './ladder'

export type LadderRequest = { start: string; end: string; words: string[]; options: LadderOptions; mode: 'target' | 'explore' | 'ordered'; maxSteps: number; waypoints: string[]; maxStates: number; maxMs: number }
export type LadderResponse = { type: 'result'; result: LadderResult } | { type: 'exploration'; result: ExplorationResult } | { type: 'error'; message: string }

self.onmessage = (event: MessageEvent<LadderRequest>) => {
  try {
    const { start, end, words, options, mode, maxSteps } = event.data
    if (mode === 'explore') self.postMessage({ type: 'exploration', result: exploreLadder(start, new Set(words), options, maxSteps) } satisfies LadderResponse)
    else if (mode === 'ordered') self.postMessage({ type: 'result', result: solveOrderedLadder(event.data.waypoints, new Set(words), options, { maxStates: event.data.maxStates, maxMs: event.data.maxMs }) } satisfies LadderResponse)
    else self.postMessage({ type: 'result', result: solveLadder(start, end, new Set(words), options) } satisfies LadderResponse)
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Search failed. Please try again.' } satisfies LadderResponse)
  }
}
