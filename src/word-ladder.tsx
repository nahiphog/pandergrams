import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dictionary, loadDictionary } from './dictionary'
import type { ExplorationResult, LadderOptions, LadderResult } from './ladder'
import { LadderExploration } from './ladder-exploration'
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
  const [exploration, setExploration] = useState<ExplorationResult | null>(null)
  const [mode, setMode] = useState<'target' | 'explore'>('target')
  const [maxSteps, setMaxSteps] = useState(5)
  const [notice, setNotice] = useState('')
  const [options, setOptions] = useState<LadderOptions>({ addDelete: false, rearrange: 'off', move: false })
  const worker = useRef<Worker | null>(null)
  const activeWords = mode === 'explore' ? words.slice(0, 1) : words
  const errors = activeWords.map(word => !word ? 'Enter a word.' : !/^[A-Z]+$/.test(word) ? 'Use letters A–Z only.' : lexicon && !lexicon.has(word) ? 'Not in the dictionary.' : '')
  const lengthError = mode === 'target' && !options.addDelete && words.every(Boolean) && words[0].length !== words[1].length ? 'Use words of the same length, or enable adding/deleting a letter.' : ''

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
    setExploration(null)
    setNotice('')
  }

  function search() {
    setTouched([true, true])
    if (!lexicon || errors.some(Boolean) || lengthError) return
    stop()
    setResult(null)
    setExploration(null)
    setNotice('')
    setRunning(true)
    try {
      const active = new Worker(new URL('./ladder.worker.ts', import.meta.url), { type: 'module' })
      worker.current = active
      active.onmessage = (event: MessageEvent<LadderResponse>) => {
        if (worker.current !== active) return
        if (event.data.type === 'result') setResult(event.data.result)
        else if (event.data.type === 'exploration') setExploration(event.data.result)
        else setNotice(event.data.message)
        stop()
      }
      active.onerror = () => {
        if (worker.current !== active) return
        setNotice('The search failed. Please try again.')
        stop()
      }
      active.postMessage({ start: words[0], end: words[1], words: [...lexicon].filter(word => options.addDelete || word.length === words[0].length), options, mode, maxSteps } satisfies LadderRequest)
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
        <p className="eyebrow">One step at a time</p>
        <h1 id="ladder-heading">Word ladder</h1>
        <p className="helper">Connect two words in the fewest steps. Replacing exactly one letter is always allowed. Enable extra moves below to explore more connections. Every step must form a word in the same word list used by Pandergram Solver.</p>
        <p className="dictionary-note"><a href="https://norvig.com/ngrams/word.list" target="_blank" rel="noreferrer">{dictionary.source}</a> · {lexicon ? `${lexicon.size.toLocaleString()} words loaded` : dictionaryError ? 'Unavailable' : 'Loading…'}</p>
        {dictionaryError && <p role="alert" className="field-error">{dictionaryError} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
        <form onSubmit={event => { event.preventDefault(); search() }}>
          <fieldset className="ladder-options">
            <legend>Search mode</legend>
            <label className="ladder-toggle"><input type="radio" name="ladder-mode" checked={mode === 'target'} onChange={() => { edit(words); setMode('target') }} /> Connect two words</label>
            <label className="ladder-toggle"><input type="radio" name="ladder-mode" checked={mode === 'explore'} onChange={() => { edit(words); setMode('explore') }} /> Explore all words from a starting word</label>
            {mode === 'explore' && <><label htmlFor="ladder-depth">Maximum steps</label><select id="ladder-depth" value={maxSteps} onChange={event => { edit(words); setMaxSteps(Number(event.target.value)) }}>{[1, 2, 3, 4, 5].map(depth => <option key={depth} value={depth}>{depth} {depth === 1 ? 'step' : 'steps'}</option>)}</select><p>Find every reachable word and every shortest path within this limit. Paths never repeat a word. Results are grouped by minimum step count.</p></>}
          </fieldset>
          <div className="ladder-inputs">
            {activeWords.map((word, index) => (
              <div className="exclusions-field" key={index}>
                <label htmlFor={`ladder-word-${index}`}>{index === 0 ? 'Starting word' : 'Ending word'}</label>
                <input id={`ladder-word-${index}`} value={word} placeholder={index === 0 ? 'e.g. COLD' : 'e.g. WARM'} spellCheck={false} autoComplete="off" aria-invalid={!!(touched[index] && errors[index]) || !!lengthError} aria-describedby={`ladder-error-${index} ladder-length-error`} onBlur={() => setTouched(previous => previous.map((value, row) => row === index ? true : value))} onChange={event => { setTouched(previous => previous.map((value, row) => row === index ? true : value)); edit(words.map((value, row) => row === index ? event.target.value.trim().toUpperCase() : value)) }} />
                <p id={`ladder-error-${index}`} className="field-error">{touched[index] ? errors[index] : ''}</p>
              </div>
            ))}
          </div>
          <p id="ladder-length-error" className="field-error">{lengthError}</p>
          <fieldset className="ladder-options">
            <legend>Optional moves</legend>
            <p id="ladder-options-help">All off by default. Each enabled operation counts as one step. Changing a rule cancels and clears the current search.</p>
            <label className="ladder-toggle"><input type="checkbox" checked={!!options.addDelete} onChange={event => { edit(words); setOptions({ ...options, addDelete: event.target.checked }) }} /> Add or delete exactly one letter</label>
            <label className="ladder-rearrange" htmlFor="ladder-rearrange">Rearrange letters</label>
            <select id="ladder-rearrange" value={options.rearrange} aria-describedby="ladder-options-help" onChange={event => { edit(words); setOptions({ ...options, rearrange: event.target.value as LadderOptions['rearrange'] }) }}>
              <option value="off">Off</option>
              <option value="swap">Swap positions of two letters</option>
              <option value="permute">Permute the entire word (any rearrangement)</option>
            </select>
            <label className="ladder-toggle"><input type="checkbox" checked={!!options.move} onChange={event => { edit(words); setOptions({ ...options, move: event.target.checked }) }} /> Move one letter to another position</label>
            <p>Moving a letter keeps all other letters in their relative order. Permutation allows any rearrangement of the same letters.</p>
          </fieldset>
          <div className="search-actions">
            <button className="primary-button" type="submit" disabled={!lexicon || running}>{running ? 'Searching…' : mode === 'explore' ? 'Find all reachable words' : 'Find shortest ladder'}</button>
            <button type="button" onClick={() => { edit(['', '']); setTouched([false, false]) }}>Clear input</button>
            {running && <button type="button" onClick={() => { stop(); setNotice('Search cancelled. No conclusion was reached.') }}>Cancel</button>}
          </div>
        </form>
      </section>
      <section className="results-panel" aria-labelledby="ladder-results-heading" aria-busy={running}>
        {mode === 'explore' ? <>
          <div role="status"><h2 id="ladder-results-heading">{running ? 'Exploring all shortest paths…' : exploration ? 'Reachable words and shortest paths' : 'Explore from your starting word'}</h2><p>{notice || (running ? 'Searching every reachable word within your step limit.' : exploration ? 'Search complete. All reachable words and shortest paths are available below.' : 'Enter a starting word and choose a step limit from 1 to 5.')}</p></div>
          {exploration && <LadderExploration result={exploration} />}
        </> : <><div role="status">
          <h2 id="ladder-results-heading">{running ? 'Finding your ladder…' : result?.path ? `Shortest ladder: ${result.path.length - 1} ${result.path.length === 2 ? 'step' : 'steps'}` : result ? 'No ladder found' : 'Your shortest ladder'}</h2>
          {notice ? <p>{notice}</p> : running ? <p>Exploring words in order of distance from your starting word.</p> : result?.path ? <p>{result.path.length === 1 ? 'The starting and ending words are identical. No changes needed.' : 'One shortest path under your selected rules is shown below. Each step describes the operation used.'}</p> : result ? <p>No sequence of enabled moves connects these words in the bundled word list.</p> : <p>Enter two words, choose your move rules, then find their shortest connection.</p>}
        </div>
        {result?.path && <ol className="ladder-path" aria-label="Shortest word ladder">{result.path.map((word, index, path) => <li key={word}><span className="ladder-step">{index === 0 ? 'Start' : `Step ${index}`}</span><div className="ladder-transition"><span className="ladder-word">{[...word].map((letter, position) => index > 0 && result.moves[index - 1].positions.includes(position) ? <mark className="changed-letter" key={position}>{letter}</mark> : <span key={position}>{letter}</span>)}</span>{index > 0 && <p className="ladder-operation">{result.moves[index - 1].description}</p>}</div>{index === path.length - 1 && <span className="count-pill">Finish</span>}</li>)}</ol>}
        {result && <p className="search-stats">{result.explored.toLocaleString()} words explored · Exact breadth-first search</p>}
        </>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><WordLadder /></StrictMode>)
