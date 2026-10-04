/**
 * Temporary local dictionary source for the solver.
 * The full newline-separated Norvig word list lives in Vite's public folder so
 * later search features can load it without another network request.
 */
export const dictionary = {
  source: 'Norvig word list',
  path: '/norvig-word-list.txt',
  entries: 263_533,
} as const

export async function loadDictionary(): Promise<Set<string>> {
  const response = await fetch(dictionary.path)

  if (!response.ok) {
    throw new Error(`Unable to load dictionary (${response.status})`)
  }

  const content = await response.text()
  return new Set(content.split(/\r?\n/).filter(Boolean).map((word) => word.toUpperCase()))
}
