import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dictionary, loadDictionary } from './dictionary'
import type { LadderResult } from './ladder'
import type { LadderRequest, LadderResponse } from './ladder.worker'
import './styles.css'

function WordLadder() {
  const [words, setWords] = useState(['', ''])
  const [touched, setTouched] = useState([false, false])
  const [lexicon, setLexicon] = useState<Set<string> | null>(null)
  const [dictionaryError, setDictionaryError] = useState('')
  const [retry, setRetry] = useState(0)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<LadderResult | null>(null)
  const [notice, setNotice] = useState('')
  const worker = useRef<Worker | null>(null)
  const errors = words.map(word => !word ? 'Enter a word.' : !/^[A-Z]+$/.test(word) ? 'Use letters A–Z only.' : lexicon && !lexicon.has(word) ? 'Not in the dictionary.' : '')
  const lengthError = words.every(Boolean) && words[0].length !== words[1].length ? 'Both words must have the same number of letters.' : ''

  useEffect(() => {
    const controller = new AbortController()
    setDictionaryError('')
    loadDictionary(controller.signal).then(value => {
      if (!controller.signal.aborted) setLexicon(value)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setDictionaryError(error instanceof Error ? error.message : 'Dictionary could not be loaded.')
    })
    return () => controller.abort()
  }, [retry])
  useEffect(() => () => { worker.current?.terminate() }, [])

  function stop() {
    worker.current?.terminate()
    worker.current = null
    setRunning(false)
  }

  function edit(next: string[]) {
    stop()
    setWords(next)
    setResult(null)
    setNotice('')
  }

  function search() {
    setTouched([true, true])
    if (!lexicon || errors.some(Boolean) || lengthError) return
    stop()
    setResult(null)
    setNotice('')
    setRunning(true)
    try {
      const active = new Worker(new URL('./ladder.worker.ts', import.meta.url), { type: 'module' })
      worker.current = active
      active.onmessage = (event: MessageEvent<LadderResponse>) => {
        if (worker.current !== active) return
        if (event.data.type === 'result') setResult(event.data.result)
        else setNotice(event.data.message)
        stop()
      }
      active.onerror = () => {
        if (worker.current !== active) return
        setNotice('The search failed. Please try again.')
        stop()
      }
      active.postMessage({ start: words[0], end: words[1], words: [...lexicon].filter(word => word.length === words[0].length) } satisfies LadderRequest)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start the search.')
      stop()
    }
  }

  return (
    <main className="page-shell ladder-page">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark">P</span><span>Pandergram <em>Solver</em></span></a>
        <div className="page-links"><a href={import.meta.env.BASE_URL}>Pandergrams</a><a href={`${import.meta.env.BASE_URL}word-ladder.html`} aria-current="page">Word ladder</a></div>
      </nav>
      <section className="workspace word-panel" aria-labelledby="ladder-heading">
        <p className="eyebrow">One letter at a time</p>
        <h1 id="ladder-heading">Word ladder</h1>
        <p className="helper">Connect two words in the fewest changes. Each step replaces exactly one letter to form another word in the same word list used by Pandergram Solver. No adding, removing, or rearranging letters.</p>
        <p className="dictionary-note"><a href="https://norvig.com/ngrams/word.list" target="_blank" rel="noreferrer">{dictionary.source}</a> · {lexicon ? `${lexicon.size.toLocaleString()} words loaded` : dictionaryError ? 'Unavailable' : 'Loading…'}</p>
        {dictionaryError && <p role="alert" className="field-error">{dictionaryError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
        <form onSubmit={event => { event.preventDefault(); search() }}>
          <div className="ladder-inputs">
            {words.map((word, index) => (
              <div className="exclusions-field" key={index}>
                <label htmlFor={`ladder-word-${index}`}>{index === 0 ? 'Starting word' : 'Ending word'}</label>
                <input id={`ladder-word-${index}`} value={word} placeholder={index === 0 ? 'e.g. COLD' : 'e.g. WARM'} spellCheck={false} autoComplete="off" aria-invalid={!!(touched[index] && errors[index]) || !!lengthError} aria-describedby={`ladder-error-${index} ladder-length-error`} onBlur={() => setTouched(previous => previous.map((value, row) => row === index ? true : value))} onChange={event => { setTouched(previous => previous.map((value, row) => row === index ? true : value)); edit(words.map((value, row) => row === index ? event.target.value.trim().toUpperCase() : value)) }} />
                <p id={`ladder-error-${index}`} className="field-error">{touched[index] ? errors[index] : ''}</p>
              </div>
            ))}
          </div>
          <p id="ladder-length-error" className="field-error">{lengthError}</p>
          <div className="search-actions">
            <button className="primary-button" type="submit" disabled={!lexicon || running}>{running ? 'Searching…' : 'Find shortest ladder'}</button>
            <button type="button" onClick={() => { edit(['', '']); setTouched([false, false]) }}>Clear input</button>
            {running && <button type="button" onClick={() => { stop(); setNotice('Search cancelled. No conclusion was reached.') }}>Cancel</button>}
          </div>
        </form>
      </section>
      <section className="results-panel" aria-labelledby="ladder-results-heading" aria-busy={running}>
        <div role="status">
          <h2 id="ladder-results-heading">{running ? 'Finding your ladder…' : result?.path ? `Shortest ladder: ${result.path.length - 1} ${result.path.length === 2 ? 'change' : 'changes'}` : result ? 'No ladder found' : 'Your shortest ladder'}</h2>
          {notice ? <p>{notice}</p> : running ? <p>Exploring words in order of distance from your starting word.</p> : result?.path ? <p>{result.path.length === 1 ? 'The starting and ending words are identical. No changes needed.' : 'One shortest path is shown below. The changed letter is highlighted in each step.'}</p> : result ? <p>No sequence of single-letter changes connects these words in the bundled word list.</p> : <p>Enter two words of the same length, then find their shortest connection.</p>}
        </div>
        {result?.path && <ol className="ladder-path" aria-label="Shortest word ladder">{result.path.map((word, index, path) => <li key={word}><span className="ladder-step">{index === 0 ? 'Start' : `Step ${index}`}</span><span className="ladder-word">{[...word].map((letter, position) => index > 0 && letter !== path[index - 1][position] ? <mark className="changed-letter" key={position} title={`${path[index - 1][position]} → ${letter}`}>{letter}</mark> : <span key={position}>{letter}</span>)}</span>{index === path.length - 1 && <span className="count-pill">Finish</span>}</li>)}</ol>}
        {result && <p className="search-stats">{result.explored.toLocaleString()} words explored · Exact breadth-first search</p>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><WordLadder /></StrictMode>)
