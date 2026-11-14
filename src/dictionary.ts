/**
 * Bundled dictionary source for the solver.
 * The full newline-separated Norvig word list lives in Vite's public folder so
 * the solver can load it from this app without relying on the external source.
 */
export const dictionary = {
  source: 'Norvig word list',
  path: `${import.meta.env.BASE_URL}norvig-word-list.txt`,
} as const

export async function loadDictionary(signal?: AbortSignal): Promise<Set<string>> {
  const response = await fetch(dictionary.path, { signal })

  if (!response.ok) {
    throw new Error(`Unable to load dictionary (${response.status})`)
  }

  const content = await response.text()
  const words = new Set(content.split(/\r?\n/).map((word) => word.trim().toUpperCase()).filter((word) => /^[A-Z]+$/.test(word)))
  if (!words.size) throw new Error('The dictionary is empty.')
  return words
}
