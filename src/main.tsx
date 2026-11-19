import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dictionary, loadDictionary } from './dictionary'
import type { Progress, Result } from './solver'
import type { SearchRequest, SearchResponse } from './solver.worker'
import './styles.css'

const initialWords = ['', '', '', '', '']
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function App() {
  const [words, setWords] = useState(initialWords)
  const [editedWords, setEditedWords] = useState(initialWords.map(() => false))
  const [excludedInput, setExcludedInput] = useState('')
  const [stateLimitInput, setStateLimitInput] = useState('250000')
  const [timeLimitInput, setTimeLimitInput] = useState('30')
  const [lexicon, setLexicon] = useState<Set<string> | null>(null)
  const [dictionaryError, setDictionaryError] = useState('')
  const [retry, setRetry] = useState(0)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [visibleSolutions, setVisibleSolutions] = useState(10)
  const [notice, setNotice] = useState('')
  const worker = useRef<Worker | null>(null)
  const searchId = useRef(0)
  const usedLetters = new Set(words.join('').replace(/[^A-Z]/g, ''))
  const missingLetters = alphabet.filter((letter) => !usedLetters.has(letter))
  const errors = words.map((word) => !word ? 'Enter a word.' : !/^[A-Z]+$/.test(word) ? 'Use letters A–Z only.' : lexicon && !lexicon.has(word) ? 'Not in the dictionary.' : '')
  const visibleErrors = errors.map((error, index) => editedWords[index] ? error : '')
  const excludedWords = excludedInput.split(',').map((word) => word.trim().toUpperCase()).filter(Boolean)
  const exclusionError = excludedWords.some((word) => !/^[A-Z]+$/.test(word)) ? 'Use words containing A–Z only, separated by commas.' : ''
  const maxStates = Number(stateLimitInput)
  const maxSeconds = Number(timeLimitInput)
  const stateLimitError = !Number.isSafeInteger(maxStates) || maxStates < 1 ? 'Enter a positive whole number of states.' : ''
  const timeLimitError = !Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || !Number.isSafeInteger(maxSeconds * 1000) ? 'Enter a positive whole number of seconds.' : ''
  const canSolve = !!lexicon && words.length > 0 && !errors.some(Boolean) && !exclusionError && !stateLimitError && !timeLimitError

  useEffect(() => {
    const controller = new AbortController()
    setDictionaryError('')
    loadDictionary(controller.signal).then(setLexicon).catch((error: unknown) => {
      if (!controller.signal.aborted) setDictionaryError(error instanceof Error ? error.message : 'Dictionary could not be loaded.')
    })
    return () => controller.abort()
  }, [retry])

  useEffect(() => () => { worker.current?.terminate() }, [])

  function stop() {
    searchId.current++
    worker.current?.terminate()
    worker.current = null
    setRunning(false)
  }

  function edit(next: string[]) {
    stop()
    setWords(next)
    setVisibleSolutions(10)
    setResult(null)
    setProgress(null)
    setNotice('')
  }

  function search() {
    if (!canSolve || !lexicon) return
    stop()
    setVisibleSolutions(10)
    setResult(null)
    setNotice('')
    setProgress({ depth: 0, explored: 0, discovered: 1, elapsedMs: 0 })
    setRunning(true)
    const id = searchId.current
    try {
      const activeWorker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
      worker.current = activeWorker
      activeWorker.onmessage = (event: MessageEvent<SearchResponse>) => {
        const message = event.data
        if (message.id !== searchId.current) return
        if (message.type === 'progress') setProgress(message.progress)
        else {
          if (message.type === 'result') {
            setResult(message.result)
            setProgress(message.result)
          } else setNotice(message.message)
          stop()
        }
      }
      activeWorker.onerror = () => {
        if (id !== searchId.current) return
        setNotice('The search worker failed. Try again with a smaller word bank.')
        stop()
      }
      const request: SearchRequest = { id, words: [...words], dictionary: [...lexicon], excludedWords, maxStates, maxMs: maxSeconds * 1000 }
      activeWorker.postMessage(request)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start the search.')
      stop()
    }
  }

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top"><span className="brand-mark">P</span><span>Pandergram <em>Solver</em></span></a>
        <span className="draft-chip"><span className="chip-dot" /> Exact A*</span>
      </nav>
      <section className="hero" id="top">
        <p className="eyebrow">Letter transformation puzzle</p>
        <h1>Make every letter <span>count.</span></h1>
        <p className="intro">Change one letter at a time. Build a word set that covers the entire alphabet in as few moves as possible.</p>
      </section>
      <section className="workspace" aria-label="Puzzle workspace">
        <div className="word-panel">
          <div className="panel-heading"><div><p className="eyebrow">Starting point</p><h2>Starting word bank</h2></div><span className="count-pill">{words.length} words</span></div>
          <p className="helper">Edit your words, then find the shortest solution. Every starting and intermediate word must be in the dictionary. Word lengths stay fixed.</p>
          <p className="dictionary-note"><a href="https://norvig.com/ngrams/word.list" target="_blank" rel="noreferrer">{dictionary.source}</a> · {lexicon ? `${lexicon.size.toLocaleString()} words loaded` : dictionaryError ? 'Unavailable' : 'Loading…'}</p>
          {dictionaryError && <p role="alert" className="field-error">{dictionaryError} <button onClick={() => setRetry(retry + 1)}>Retry</button></p>}
          <div className="word-list">
            {words.map((word, index) => (
              <div className="editable-word" key={index}>
                <label htmlFor={`word-${index}`} className="word-index">{String(index + 1).padStart(2, '0')}</label>
                <input id={`word-${index}`} aria-label={`Starting word ${index + 1}`} value={word} spellCheck={false} autoComplete="off" aria-invalid={!!visibleErrors[index]} aria-describedby={visibleErrors[index] ? `error-${index}` : undefined} onChange={(event) => { setEditedWords(editedWords.map((edited, row) => row === index ? true : edited)); edit(words.map((value, row) => row === index ? event.target.value.trim().toUpperCase() : value)) }} />
                {visibleErrors[index] && <p id={`error-${index}`} className="field-error">{visibleErrors[index]}</p>}
              </div>
            ))}
          </div>
          <div className="search-actions">
            <button className="primary-button" disabled={!canSolve || running} onClick={search}>{running ? 'Searching…' : 'Find minimum changes'}</button>
            <button onClick={() => { edit([...initialWords]); setEditedWords(initialWords.map(() => false)); setExcludedInput('') }}>Clear input</button>
            {running && <button onClick={() => { stop(); setNotice('Search cancelled. No conclusion was reached.') }}>Cancel</button>}
          </div>
          <div className="exclusions-field">
            <label htmlFor="excluded-words">Excluded words <span>(optional)</span></label>
            <input id="excluded-words" value={excludedInput} placeholder="e.g. SEXERS, VEXERS" spellCheck={false} autoComplete="off" aria-invalid={!!exclusionError} aria-describedby={`exclusions-help${exclusionError ? ' exclusions-error' : ''}`} onChange={(event) => { edit(words); setExcludedInput(event.target.value.toUpperCase()) }} />
            <p id="exclusions-help" className="limit-note">Separate words with commas. These words cannot be mutation destinations; starting words are still allowed. Clear the box to allow them again. This list is not saved.</p>
            {exclusionError && <p id="exclusions-error" className="field-error">{exclusionError}</p>}
          </div>
          <fieldset className="search-limits">
            <legend>Search limits</legend>
            <div className="limit-fields">
              <div>
                <label htmlFor="max-states">Maximum states</label>
                <input id="max-states" type="number" min="1" step="1" value={stateLimitInput} aria-invalid={!!stateLimitError} aria-describedby={stateLimitError ? 'states-error' : 'limits-help'} onChange={(event) => { edit(words); setStateLimitInput(event.target.value) }} />
                {stateLimitError && <p id="states-error" className="field-error">{stateLimitError}</p>}
              </div>
              <div>
                <label htmlFor="max-seconds">Search time (seconds)</label>
                <input id="max-seconds" type="number" min="1" step="1" value={timeLimitInput} aria-invalid={!!timeLimitError} aria-describedby={timeLimitError ? 'seconds-error' : 'limits-help'} onChange={(event) => { edit(words); setTimeLimitInput(event.target.value) }} />
                {timeLimitError && <p id="seconds-error" className="field-error">{timeLimitError}</p>}
              </div>
            </div>
            <p id="limits-help" className="limit-note">Increase these limits to explore more optimal solutions. More states use more memory. Time includes collecting walkthroughs; the 10,000-walkthrough result limit still applies.</p>
            <button onClick={() => { edit(words); setStateLimitInput('250000'); setTimeLimitInput('30') }}>Restore default limits</button>
          </fieldset>
          <p className="limit-note">Editing words, exclusions, or limits cancels and clears the search.</p>
        </div>
        <aside className="coverage-panel" aria-labelledby="coverage-heading">
          <div className="panel-heading"><div><p className="eyebrow">Starting coverage</p><h2 id="coverage-heading">Alphabet check</h2></div><strong className="coverage-score">{usedLetters.size}<span>/26</span></strong></div>
          <div className="progress-track" aria-label={`${usedLetters.size} of 26 letters covered`}><span style={{ width: `${usedLetters.size / 26 * 100}%` }} /></div>
          <div className="alphabet-grid" aria-label="Alphabet letter coverage">{alphabet.map((letter) => <span className={usedLetters.has(letter) ? 'letter used' : 'letter missing'} key={letter} aria-label={`${letter}: ${usedLetters.has(letter) ? 'covered' : 'missing'}`}>{letter}</span>)}</div>
          <div className="missing-callout"><span className="missing-icon">{missingLetters.length ? '!' : '✓'}</span><div><p>{missingLetters.length ? 'Still needed' : 'All covered'}</p><strong>{missingLetters.join(' · ') || 'A–Z complete'}</strong></div></div>
          <p className="coverage-help">All 26 letters must be present together in the final word bank. Letters may disappear during intermediate moves.</p>
        </aside>
      </section>
      <section className="results-panel" aria-labelledby="results-heading" aria-busy={running}>
        <p className="eyebrow">Shortest path</p>
        <h2 id="results-heading">{running ? 'Exploring word banks…' : result?.status === 'solved' ? `Solved in ${result.moves.length} ${result.moves.length === 1 ? 'move' : 'moves'}` : result?.status === 'impossible' ? 'No solution' : result?.status === 'limited' ? 'Search limit reached' : 'Your solution'}</h2>
        <div role="status">{notice && <p>{notice}</p>}{result && result.status !== 'solved' && <p>{result.reason}</p>}{result?.status === 'solved' && <p>Minimum guaranteed by A* search{excludedWords.length ? ' with these exclusions' : ''}. Final coverage: 26/26 letters.</p>}</div>
        {progress && <p className="search-stats">Current path depth {progress.depth} · {progress.explored.toLocaleString()} explored · {progress.discovered.toLocaleString()} discovered · {(progress.elapsedMs / 1000).toFixed(1)}s</p>}
        {!progress && <p>Edit the starting bank above and start a search to see each change.</p>}
        {result?.status === 'solved' && (
          <div>
          <p>{result.complete ? `All ${result.solutions.length} optimal walkthroughs found.` : `${result.solutions.length} optimal walkthroughs found so far. ${result.reason} More may exist.`} Different orderings of the same per-word mutations are shown once.</p>
          {result.solutions.slice(0, visibleSolutions).map((solution, solutionIndex) => (
          <section className="solution-option" key={solutionIndex} aria-label={`Solution ${solutionIndex + 1}`}>
          <h3>Solution {solutionIndex + 1}</h3>
          <ol className="solution-paths" aria-label="Word transformations in starting order" tabIndex={0}>
            {words.map((word, row) => (
              <li key={row}>
                {word}
                {solution.moves.filter((move) => move.row === row).map((move, index) => (
                  <span key={index}>
                    {' → '}{move.to.slice(0, move.position)}<mark className="changed-letter" title={`Letter ${move.position + 1}: ${move.from[move.position]} → ${move.to[move.position]}`}>{move.to[move.position]}</mark>{move.to.slice(move.position + 1)}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          </section>
          ))}
          {visibleSolutions < result.solutions.length && <button onClick={() => setVisibleSolutions(visibleSolutions + 10)}>Show more solutions ({result.solutions.length - visibleSolutions} remaining)</button>}
          </div>
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
