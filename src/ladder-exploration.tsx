import { useState } from 'react'
import { explorationPaths } from './ladder'
import type { ExplorationResult } from './ladder'

export function LadderExploration({ result }: { result: ExplorationResult }) {
  const [depth, setDepth] = useState(1)
  const [wordPage, setWordPage] = useState(0)
  const [selected, setSelected] = useState('')
  const [pathOffset, setPathOffset] = useState(0n)
  const words = result.levels[depth - 1]
  const visibleWords = words.slice(wordPage * 100, (wordPage + 1) * 100)
  const paths = selected ? explorationPaths(result, selected, pathOffset) : []
  const totalPaths = selected ? BigInt(result.nodes[selected].pathCount) : 0n
  const totalWords = result.levels.reduce((sum, level) => sum + level.length, 0)

  return <div className="exploration-results">
    <p>Found <strong>{totalWords.toLocaleString()} words</strong> within {result.levels.length} steps of <strong>{result.start}</strong>. Each word appears at its minimum distance. Select a word to see all its shortest paths; no word repeats within a path.</p>
    <div className="search-actions" aria-label="Minimum step count">
      {result.levels.map((level, index) => <button key={index} aria-pressed={depth === index + 1} onClick={() => { setDepth(index + 1); setWordPage(0); setSelected(''); setPathOffset(0n) }}>{index + 1} {index === 0 ? 'step' : 'steps'} ({level.length.toLocaleString()} words)</button>)}
    </div>
    <h3>Words requiring exactly {depth} {depth === 1 ? 'step' : 'steps'}</h3>
    {words.length === 0 ? <p>No words have this minimum distance.</p> : <>
      <p>Showing {wordPage * 100 + 1}–{Math.min((wordPage + 1) * 100, words.length)} of {words.length.toLocaleString()} words. Every result is available through these pages.</p>
      <ul className="exploration-words">{visibleWords.map(word => <li key={word}><button aria-pressed={selected === word} onClick={() => { setSelected(word); setPathOffset(0n) }}>{word} <span>({BigInt(result.nodes[word].pathCount).toLocaleString()} {result.nodes[word].pathCount === '1' ? 'path' : 'paths'})</span></button></li>)}</ul>
      {words.length > 100 && <div className="search-actions"><button disabled={wordPage === 0} onClick={() => { setWordPage(wordPage - 1); setSelected('') }}>Previous words</button><button disabled={(wordPage + 1) * 100 >= words.length} onClick={() => { setWordPage(wordPage + 1); setSelected('') }}>Next words</button></div>}
    </>}
    {selected && <section className="exploration-paths" aria-label={`Shortest paths to ${selected}`} aria-live="polite">
      <h3>All shortest paths to {selected}</h3>
      <p>Showing {(pathOffset + 1n).toLocaleString()}–{(pathOffset + BigInt(paths.length)).toLocaleString()} of {totalPaths.toLocaleString()} paths.</p>
      <ul className="exploration-path-list">{paths.map(path => <li key={path.join(',')}>{path.join(' → ')}</li>)}</ul>
      {totalPaths > 25n && <div className="search-actions"><button disabled={pathOffset === 0n} onClick={() => setPathOffset(pathOffset - 25n)}>Previous paths</button><button disabled={pathOffset + 25n >= totalPaths} onClick={() => setPathOffset(pathOffset + 25n)}>Next paths</button></div>}
    </section>}
    <p className="search-stats">{result.explored.toLocaleString()} words explored · All shortest paths retained</p>
  </div>
}
